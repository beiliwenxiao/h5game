/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 ************************************************************/

import { ExpressionEngine } from './ExpressionEngine.js';
import { MonotonicClock } from '../core/command/AuthorityClocks.js';
import { normalizeRuntimeDebugMode } from '../core/CanonicalSnapshot.js';
import { stableDigest } from '../core/StableDigest.js';
import { assertCommandContract, CommandContractKind } from '../core/command/CommandContracts.js';
import { ScenarioExecutionLedger, technicalResult } from './ScenarioExecutionLedger.js';
import { createTriggerFailureEnvelope, TriggerExecutionError } from './TriggerFailureEnvelope.js';

const REENTRY_POLICIES = new Set(['reject', 'queue', 'restart']);
const CATCH_UP_POLICIES = new Set(['resume', 'skip', 'single', 'all']);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function errorResult(operationId, triggerId, error, code = null) {
  return {
    ok: false, operationId, status: 'failed', committed: false,
    code: code || error?.code || 'triggerActionFailed',
    stateId: `trigger:${triggerId}`, stateRevision: null,
    eventFrom: null, eventTo: null, value: null,
    error: { message: error?.message || String(error || 'trigger action failed') }
  };
}

function normalizeLegacyResult(value, operationId, triggerId) {
  if (value === false || value?.ok === false) {
    const rejection = value === false
      ? { code: 'actionRejected', message: 'legacy action returned false' }
      : value;
    return {
      ...errorResult(operationId, triggerId, rejection.error || rejection, rejection.code || 'actionRejected'),
      status: rejection.status || 'failed', committed: rejection.committed === true,
      stateId: rejection.stateId || `trigger:${triggerId}`,
      stateRevision: Number.isInteger(rejection.stateRevision) ? rejection.stateRevision : null
    };
  }
  return {
    ok: true, operationId, status: value?.status || 'succeeded',
    committed: value?.committed !== false, code: null,
    stateId: value?.stateId || `trigger:${triggerId}`,
    stateRevision: Number.isInteger(value?.stateRevision) ? value.stateRevision : null,
    eventFrom: null, eventTo: null, value: null, error: null
  };
}

/** Trigger 唯一编排内核：只保存技术状态，业务事实由各自 service/provider 拥有。 */
export class TriggerSystem {
  constructor(config = {}) {
    this.triggers = [];
    this._triggersById = new Map();
    this.actions = Object.create(null);
    this.actionDescriptorRegistry = config.actionDescriptorRegistry || null;
    this.commandAdapter = config.commandAdapter || null;
    this.monotonicClock = config.monotonicClock || new MonotonicClock();
    this.logicalClock = config.logicalClock || null;
    this._advanceClockOnUpdate = config.advanceClockOnUpdate ?? !config.monotonicClock;
    this.operationIdFactory = config.operationIdFactory || (({ triggerId, definitionRevision, sequence }) => (
      `trigger:${definitionRevision}:${triggerId}:${sequence}`
    ));
    this.applicationEventPublisher = config.applicationEventPublisher || null;
    this.definitionRevision = config.definitionRevision ?? 0;
    this.serviceReferenceResolver = config.serviceReferenceResolver || null;
    this.bindingReferenceResolver = config.bindingReferenceResolver || null;
    this.operationFingerprintValidator = config.operationFingerprintValidator || null;
    this.runtimeConfig = config.runtimeConfig || null;
    this.debugMode = normalizeRuntimeDebugMode(this.runtimeConfig?.debug);
    this.sceneDiagnostics = config.sceneDiagnostics || null;
    this.ctx = {};
    this.expr = new ExpressionEngine({});
    this.ledger = new ScenarioExecutionLedger();
    this._firedOnce = new Set();
    this._cooldowns = Object.create(null);
    this._timers = [];
    this._listeners = [];
    this._active = new Map();
    this._queues = new Map();
    this._operationSequence = 0;
    this._eventSequence = 0;
  }

  init(ctx = {}) {
    this.ctx = { ...ctx, triggerSystem: this };
    this.runtimeConfig = ctx.runtimeConfig || this.runtimeConfig;
    this.debugMode = normalizeRuntimeDebugMode(this.runtimeConfig?.debug);
    this.sceneDiagnostics = ctx.sceneDiagnostics || ctx.services?.diagnostics || this.sceneDiagnostics;
    this.definitionRevision = ctx.runtimeConfig?.definitionRevision
      ?? ctx.definitionRepository?.definitionRevision
      ?? this.definitionRevision;
    this.expr.setContext(this.ctx);
  }

  updateContext(patch = {}) {
    this.ctx = { ...this.ctx, ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'runtimeConfig')) {
      this.runtimeConfig = patch.runtimeConfig;
      this.debugMode = normalizeRuntimeDebugMode(this.runtimeConfig?.debug);
    }
    this.sceneDiagnostics = patch.sceneDiagnostics || patch.services?.diagnostics || this.sceneDiagnostics;
    this.expr.setContext(this.ctx);
  }

  isDebugEnabled() {
    return this.debugMode === true;
  }

  configureActionExecution({ actionDescriptorRegistry = null, commandAdapter = null } = {}) {
    this.actionDescriptorRegistry = actionDescriptorRegistry;
    this.commandAdapter = commandAdapter;
    return this;
  }

  /** 迁移期兼容 action；返回值会被等待并归一化为完整 CommandResult。 */
  registerAction(name, fn) {
    if (!hasText(name) || typeof fn !== 'function') throw new TypeError('Trigger action requires name/function');
    this.actions[name] = fn;
  }

  registerActions(map = {}) {
    for (const [name, fn] of Object.entries(map)) this.registerAction(name, fn);
  }

  register(trigger) {
    if (!trigger || !hasText(trigger.id)) throw new Error('TriggerSystem.register: trigger.id 必须是非空字符串');
    if (!trigger.when?.type) throw new Error(`TriggerSystem.register: ${trigger.id}.when.type 不能为空`);
    if (this._triggersById.has(trigger.id)) throw new Error(`TriggerSystem.register: 重复 trigger.id "${trigger.id}"（triggers/tutorials 共用命名空间）`);
    const policy = this._reentryPolicy(trigger);
    if (!REENTRY_POLICIES.has(policy)) throw new Error(`TriggerSystem.register: ${trigger.id}.reentryPolicy 非法`);
    this.triggers.push(trigger);
    this._triggersById.set(trigger.id, trigger);
    this.ledger.registerIdle(trigger.id, this.definitionRevision);
    if (trigger.when.type === 'timer') this._timers.push(this._createTimer(trigger));
    return trigger;
  }

  registerAll(list = []) {
    const seen = new Set(this._triggersById.keys());
    for (const trigger of list) {
      if (!trigger || !hasText(trigger.id)) throw new Error('TriggerSystem.registerAll: trigger.id 必须是非空字符串');
      if (!trigger.when?.type) throw new Error(`TriggerSystem.registerAll: ${trigger.id}.when.type 不能为空`);
      if (seen.has(trigger.id)) throw new Error(`TriggerSystem.registerAll: 重复 trigger.id "${trigger.id}"（triggers/tutorials 共用命名空间）`);
      seen.add(trigger.id);
    }
    for (const trigger of list) this.register(trigger);
  }
  reset() {
    for (const active of this._active.values()) active.cancelled = true;
    this.triggers = [];
    this._triggersById.clear();
    this._active.clear();
    this._queues.clear();
    this._firedOnce.clear();
    this._cooldowns = Object.create(null);
    this._timers = [];
    this.ledger = new ScenarioExecutionLedger();
  }

  async fireAndWait(whenType, params = {}) {
    const requests = [];
    for (const trigger of this.triggers) {
      if (trigger.when?.type !== whenType) continue;
      if (!this._matchParams(trigger.when.params, params)) continue;
      const request = this._enqueueRun(trigger, { type: whenType, params });
      if (request) requests.push(request);
    }
    if (requests.length === 0) return { ok: true, accepted: 0, records: [] };
    const settled = await Promise.all(requests.map(request => request.completion));
    const records = settled.map(entry => entry.record);
    return {
      ok: records.every(record => record?.status === 'succeeded'),
      accepted: requests.length,
      records
    };
  }

  fire(whenType, params = {}) {
    let accepted = 0;
    for (const trigger of this.triggers) {
      if (trigger.when?.type !== whenType) continue;
      if (!this._matchParams(trigger.when.params, params)) continue;
      if (this._tryRun(trigger, { type: whenType, params })) accepted++;
    }
    return accepted;
  }

  fireById(id, eventType, params = {}) {
    const trigger = this.getById(id);
    if (!trigger?.when || trigger.when.type !== eventType) return false;
    if (!this._matchParams(trigger.when.params, params)) return false;
    return this._tryRun(trigger, { type: eventType, params });
  }

  getById(id) { return this._triggersById.get(id) || null; }
  getExecution(id) { return this.ledger.get(id); }
  hasFiredOnce(id) { return this._firedOnce.has(id); }

  clearFiredOnce(id) {
    if (hasText(id)) return this._firedOnce.delete(id);
    this._firedOnce.clear();
    return true;
  }

  async waitForIdle(triggerId = null) {
    while (true) {
      const active = triggerId ? [this._active.get(triggerId)].filter(Boolean) : [...this._active.values()];
      if (!active.length) return;
      await Promise.all(active.map(entry => entry.promise));
    }
  }

  update(dt = 0) {
    if (this._advanceClockOnUpdate && typeof this.monotonicClock.advance === 'function') {
      this.monotonicClock.advance(Math.max(0, Number(dt) || 0) * 1000);
    }
    const now = this.monotonicClock.now();
    for (const timer of this._timers) {
      timer.remaining = Math.max(0, timer.nextDue - now);
      if (timer.interval <= 0 || now < timer.nextDue) continue;
      const dueCount = Math.floor((now - timer.nextDue) / timer.interval) + 1;
      const count = timer.catchUpPolicy === 'all'
        ? Math.min(dueCount, timer.maxCatchUp)
        : 1;
      for (let index = 0; index < count; index++) {
        this._tryRun(timer.trigger, { type: 'timer', params: { seconds: timer.interval / 1000 } });
      }
      timer.nextDue = timer.catchUpPolicy === 'skip'
        ? now + timer.interval
        : timer.nextDue + dueCount * timer.interval;
      timer.remaining = Math.max(0, timer.nextDue - now);
    }
  }

  _matchParams(want = {}, got = {}) {
    if (!want) return true;
    for (const [key, value] of Object.entries(want)) {
      if (['seconds', 'catchUpPolicy', 'maxCatchUp'].includes(key)) continue;
      if (value === undefined || value === null || value === '') continue;
      if (got[key] !== value) return false;
    }
    return true;
  }

  _tryRun(trigger, event) {
    return Boolean(this._enqueueRun(trigger, event));
  }

  _enqueueRun(trigger, event) {
    if (!this._eligible(trigger)) return null;
    const request = this._createRequest(trigger, event);
    const active = this._active.get(trigger.id);
    if (active) {
      const policy = this._reentryPolicy(trigger);
      if (policy === 'reject') return null;
      if (policy === 'queue') {
        const queue = this._queues.get(trigger.id) || [];
        queue.push(request);
        this._queues.set(trigger.id, queue);
        return request;
      }
      active.cancelled = true;
      this._queues.set(trigger.id, [request]);
      return request;
    }
    this._startExecution(trigger, request);
    return request;
  }

  _eligible(trigger) {
    if (trigger.enabled === false) return false;
    if (trigger.once && this._firedOnce.has(trigger.id)) return false;
    const cooldown = this._cooldowns[trigger.id];
    if (cooldown && this.monotonicClock.now() < cooldown.nextDue) return false;
    if (trigger.if && !this.expr.eval(trigger.if)) return false;
    return true;
  }

  _createRequest(trigger, event) {
    const explicit = event?.params?.operationId;
    const sequence = ++this._operationSequence;
    const operationId = hasText(explicit) ? explicit : this.operationIdFactory({
      triggerId: trigger.id, definitionRevision: this.definitionRevision, sequence, eventType: event?.type
    });
    if (!hasText(operationId)) throw new TypeError('Trigger operationIdFactory must return a stable non-empty ID');
    return {
      event, operationId,
      fingerprint: this._operationFingerprint(trigger, operationId)
    };
  }

  _startExecution(trigger, request) {
    const token = { cancelled: false, promise: null };
    this._active.set(trigger.id, token);
    token.promise = this._execute(trigger, request, token)
      .finally(() => {
        if (this._active.get(trigger.id) !== token) return;
        this._active.delete(trigger.id);
        const queue = this._queues.get(trigger.id) || [];
        const next = queue.shift();
        if (queue.length) this._queues.set(trigger.id, queue);
        else this._queues.delete(trigger.id);
        if (next && !(trigger.once && this._firedOnce.has(trigger.id))) this._startExecution(trigger, next);
      });
    // fireAndWait() observes the same execution record as asynchronous callers.
    // Keep rejection in token.promise for lifecycle callers while returning a settled
    // request record for aggregate signal dispatch.
    request.completion = token.promise.then(
      value => ({ value, record: this.ledger.get(trigger.id) }),
      error => ({ error, record: this.ledger.get(trigger.id) })
    );
  }

  async _execute(trigger, request, token) {
    const startedAt = this.monotonicClock.now();
    this.ledger.begin({
      triggerId: trigger.id, definitionRevision: this.definitionRevision,
      operationId: request.operationId, fingerprint: request.fingerprint, startedAt
    });
    this._lastFiredId = trigger.id;
    this._emit('triggerStart', trigger, { operationId: request.operationId, status: 'running' });
    let lastResult = normalizeLegacyResult(undefined, request.operationId, trigger.id);
    let actionIndex = -1;
    try {
      const actions = trigger.do || [];
      for (let index = 0; index < actions.length; index++) {
        actionIndex = index;
        const action = actions[index];
        if (token.cancelled) {
          throw Object.assign(new Error('trigger coordination restarted'), {
            code: 'reentryRestarted', triggerPhase: 'reentry', triggerActionIndex: index,
            triggerAction: action, actionOperationId: this._actionOperationId(trigger, action, index, request)
          });
        }
        try {
          lastResult = await this._executeAction(trigger, action, index, request);
        } catch (error) {
          error.triggerActionIndex = index;
          error.triggerAction = action;
          error.actionOperationId ||= this._actionOperationId(trigger, action, index, request);
          throw error;
        }
        this.ledger.advance(trigger.id, request.operationId, index, lastResult);
        if (lastResult.ok !== true) {
          const failure = new Error(lastResult.error?.message || `action ${action?.action} returned ok:false`);
          failure.code = lastResult.code || 'actionRejected';
          failure.result = lastResult;
          failure.triggerPhase = 'commandResult';
          failure.triggerActionIndex = index;
          failure.triggerAction = action;
          failure.actionOperationId = this._actionOperationId(trigger, action, index, request);
          throw failure;
        }
        if (token.cancelled) {
          throw Object.assign(new Error('trigger coordination restarted'), {
            code: 'reentryRestarted', triggerPhase: 'reentry', triggerActionIndex: index,
            triggerAction: action, actionOperationId: this._actionOperationId(trigger, action, index, request)
          });
        }
      }
      const record = this.ledger.finish(trigger.id, request.operationId, 'succeeded', lastResult, this.monotonicClock.now());
      if (trigger.once) this._firedOnce.add(trigger.id);
      if (Number(trigger.cooldown) > 0) {
        const duration = Number(trigger.cooldown) * 1000;
        this._cooldowns[trigger.id] = { nextDue: this.monotonicClock.now() + duration, duration };
      }
      await this._publishFinal('triggerSucceeded', trigger, record);
      this._emit('triggerEnd', trigger, { operationId: request.operationId, status: 'succeeded', result: technicalResult(lastResult) });
      return lastResult;
    } catch (error) {
      const failedIndex = Number.isInteger(error.triggerActionIndex)
        ? error.triggerActionIndex
        : Math.max(0, actionIndex);
      const failedAction = error.triggerAction || (trigger.do || [])[failedIndex] || null;
      const result = errorResult(request.operationId, trigger.id, error, error.code || error.result?.code);
      this.ledger.advance(trigger.id, request.operationId, failedIndex, result);
      const failedAt = this.monotonicClock.now();
      const record = this.ledger.finish(trigger.id, request.operationId, 'failed', result, failedAt);
      const descriptor = this.actionDescriptorRegistry?.get?.(failedAction?.action) || null;
      const envelope = createTriggerFailureEnvelope({
        trigger, action: failedAction, actionIndex: failedIndex, actionDescriptor: descriptor,
        operationId: request.operationId,
        actionOperationId: error.actionOperationId || this._actionOperationId(trigger, failedAction, failedIndex, request),
        definitionRevision: this.definitionRevision, fingerprint: request.fingerprint,
        phase: error.triggerPhase, error, event: request.event, context: this.ctx,
        startedAt, failedAt,
        seed: this.ctx.authorityRng?.snapshot?.() || this.ctx.rng?.snapshot?.() || this.ctx.seed || null
      });
      if (this.isDebugEnabled()) {
        this.sceneDiagnostics?.recordTriggerFailure?.(envelope, { openPanel: true });
      }
      this._emit('actionFailed', trigger, this.isDebugEnabled()
        ? envelope
        : { triggerId: trigger.id, actionIndex: failedIndex, operationId: request.operationId, code: result.code });
      await this._publishFinal('triggerFailed', trigger, record, this.isDebugEnabled() ? envelope : null);
      this._emit('triggerEnd', trigger, {
        operationId: request.operationId, status: 'failed', actionIndex: failedIndex,
        result: technicalResult(result)
      });
      if (this.isDebugEnabled()) throw new TriggerExecutionError(envelope, error);
      return result;
    }
  }
  _actionOperationId(trigger, action, index, request) {
    return action?.operationId || ((trigger.do || []).length === 1
      ? request.operationId
      : `${request.operationId}:action:${index}`);
  }

  async _executeAction(trigger, action, index, request) {
    const actionId = action?.action;
    const descriptor = this.actionDescriptorRegistry?.get?.(actionId);
    const legacy = this.actions[actionId];
    const operationId = this._actionOperationId(trigger, action, index, request);
    if (!descriptor && !legacy) {
      throw Object.assign(new Error(`TriggerSystem: 未登记动作 ${String(actionId)}`), {
        code: 'unknownAction', triggerPhase: 'resolveAction', actionOperationId: operationId
      });
    }
    let pending;
    if (descriptor) {
      if (!this.commandAdapter?.execute) {
        throw Object.assign(new Error(`TriggerSystem: action ${actionId} requires CommandAdapter`), {
          code: 'commandAdapterMissing', triggerPhase: 'resolveAdapter', actionOperationId: operationId
        });
      }
      try {
        pending = this.commandAdapter.execute(action, {
          actorRef: request.event?.params?.actorRef || request.event?.params?.actorId || this.ctx.player?.id,
          operationId,
          definitionRepository: this.ctx.definitionRepository,
          eventParams: request.event?.params || null,
          definitionRevision: this.definitionRevision
        });
      } catch (error) {
        error.triggerPhase = error.code === 'invalidActionParams' ? 'schemaValidation' : 'executeSync';
        error.actionOperationId = operationId;
        throw error;
      }
      let result;
      try {
        result = await Promise.resolve(pending);
      } catch (error) {
        error.triggerPhase = error.code === 'invalidActionParams' ? 'schemaValidation' : 'executeAsync';
        error.actionOperationId = operationId;
        throw error;
      }
      try {
        assertCommandContract(CommandContractKind.COMMAND_RESULT, result);
      } catch (error) {
        error.triggerPhase = 'resultSchemaValidation';
        error.actionOperationId = operationId;
        throw error;
      }
      if (result.operationId !== operationId) {
        throw Object.assign(new Error(`CommandResult.operationId mismatch for ${actionId}`), {
          code: 'operationIdMismatch', triggerPhase: 'resultValidation', actionOperationId: operationId
        });
      }
      return result;
    }
    try {
      pending = legacy(action.params || {}, this.ctx, request.event);
    } catch (error) {
      error.triggerPhase = 'executeSync';
      error.actionOperationId = operationId;
      throw error;
    }
    let result;
    try {
      result = await Promise.resolve(pending);
    } catch (error) {
      error.triggerPhase = 'executeAsync';
      error.actionOperationId = operationId;
      throw error;
    }
    const normalized = normalizeLegacyResult(result, operationId, trigger.id);
    try {
      assertCommandContract(CommandContractKind.COMMAND_RESULT, normalized);
    } catch (error) {
      error.triggerPhase = 'resultSchemaValidation';
      error.actionOperationId = operationId;
      throw error;
    }
    return normalized;
  }

  async _publishFinal(type, trigger, record, failureEnvelope = null) {
    const logicalTime = this.logicalClock?.tick
      ? this.logicalClock.tick()
      : Math.max(0, Math.floor(this.monotonicClock.now()));
    const payload = {
      triggerId: trigger.id,
      definitionRevision: record.definitionRevision,
      status: record.status,
      actionIndex: record.actionIndex,
      code: record.result?.code || null
    };
    if (failureEnvelope) payload.failure = failureEnvelope;
    const event = Object.freeze({
      eventId: `trigger-event:${++this._eventSequence}`,
      eventSequence: this._eventSequence,
      stateId: `trigger:${trigger.id}`,
      stateType: 'triggerExecution',
      stateRevision: record.ledgerRevision,
      operationId: record.operationId,
      logicalTime,
      type,
      payload: Object.freeze(payload)
    });
    assertCommandContract(CommandContractKind.APPLICATION_EVENT, event);
    const publisher = this.applicationEventPublisher;
    if (typeof publisher === 'function') await publisher(event);
    else if (publisher?.publishApplicationEvent) await publisher.publishApplicationEvent(event);
    else if (publisher?.publish) await publisher.publish(event);
    this._emit(type, trigger, event);
  }

  on(callback) {
    this._listeners.push(callback);
    return () => {
      const index = this._listeners.indexOf(callback);
      if (index !== -1) this._listeners.splice(index, 1);
    };
  }

  _emit(type, trigger, details = null) {
    for (const callback of [...this._listeners]) {
      try { callback(type, trigger, details); } catch { /* presentation listener cannot change execution */ }
    }
  }

  serialize() {
    const now = this.monotonicClock.now();
    const cooldowns = Object.fromEntries(Object.entries(this._cooldowns).map(([triggerId, cooldown]) => [triggerId, {
      definitionRevision: this.definitionRevision,
      remaining: Math.max(0, cooldown.nextDue - now),
      nextDue: cooldown.nextDue,
      duration: cooldown.duration
    }]));
    const timers = this._timers.map(timer => ({
      triggerId: timer.trigger.id,
      definitionRevision: this.definitionRevision,
      remaining: Math.max(0, timer.nextDue - now),
      nextDue: timer.nextDue,
      interval: timer.interval,
      catchUpPolicy: timer.catchUpPolicy,
      maxCatchUp: timer.maxCatchUp
    }));
    return {
      snapshotSchemaVersion: 2,
      definitionRevision: this.definitionRevision,
      firedOnce: [...this._firedOnce], cooldowns, timers,
      ledger: this.ledger.snapshot()
    };
  }

  validateSnapshot(data) {
    const errors = [];
    if (!data || data.snapshotSchemaVersion !== 2) {
      return { ok: false, errors: [{ code: 'invalidSnapshotSchema', path: 'triggers.snapshotSchemaVersion', message: 'Trigger snapshot schema 必须为 2' }] };
    }
    if (data.definitionRevision !== this.definitionRevision) {
      errors.push({ code: 'definitionRevisionMismatch', path: 'triggers.definitionRevision', message: 'Trigger definition revision 不匹配' });
    }
    if (!Array.isArray(data.firedOnce) || !data.cooldowns || typeof data.cooldowns !== 'object' || !Array.isArray(data.timers)) {
      errors.push({ code: 'invalidTriggerSnapshot', path: 'triggers', message: 'once/cooldown/timer snapshot 非法' });
    }
    const ledgerValidation = this.ledger.validateSnapshot(data.ledger);
    errors.push(...ledgerValidation.errors.map(error => ({ ...error, path: `triggers.${error.path}` })));

    for (const trigger of this.triggers) this._validateDefinitionReferences(trigger, errors);
    for (const id of data.firedOnce || []) {
      if (!this._triggersById.has(id)) errors.push({ code: 'invalidReference', path: `triggers.firedOnce.${id}`, message: `未知 trigger ${id}` });
    }
    for (const [id, value] of Object.entries(data.cooldowns || {})) {
      if (!this._triggersById.has(id)) errors.push({ code: 'invalidReference', path: `triggers.cooldowns.${id}`, message: `未知 trigger ${id}` });
      if (value?.definitionRevision !== this.definitionRevision || !this._validTiming(value)) {
        errors.push({ code: 'invalidTiming', path: `triggers.cooldowns.${id}`, message: 'cooldown revision/timing 非法' });
      }
    }
    const timerIds = new Set();
    for (const [index, timer] of (data.timers || []).entries()) {
      const trigger = this._triggersById.get(timer?.triggerId);
      const currentTimer = this._timers.find(entry => entry.trigger.id === timer?.triggerId);
      if (!trigger || trigger.when?.type !== 'timer' || !currentTimer) errors.push({ code: 'invalidReference', path: `triggers.timers[${index}].triggerId`, message: 'timer trigger 引用无效' });
      if (timerIds.has(timer?.triggerId)) errors.push({ code: 'duplicateId', path: `triggers.timers[${index}].triggerId`, message: 'timer trigger 重复' });
      timerIds.add(timer?.triggerId);
      if (timer?.definitionRevision !== this.definitionRevision || !this._validTiming(timer)
        || !CATCH_UP_POLICIES.has(timer?.catchUpPolicy) || !Number.isInteger(timer?.maxCatchUp) || timer.maxCatchUp < 1
        || (currentTimer && (timer.interval !== currentTimer.interval
          || timer.catchUpPolicy !== currentTimer.catchUpPolicy
          || timer.maxCatchUp !== currentTimer.maxCatchUp))) {
        errors.push({ code: 'invalidTiming', path: `triggers.timers[${index}]`, message: 'timer 必须匹配当前 definition 的 revision/catch-up/timing' });
      }
    }
    for (const currentTimer of this._timers) {
      if (!timerIds.has(currentTimer.trigger.id)) {
        errors.push({ code: 'missingField', path: `triggers.timers.${currentTimer.trigger.id}`, message: 'timer snapshot 缺少当前 definition' });
      }
    }
    for (const record of data.ledger?.records || []) {
      const trigger = this._triggersById.get(record.triggerId);
      if (!trigger) errors.push({ code: 'invalidReference', path: `triggers.ledger.${record.triggerId}`, message: 'ledger trigger 引用无效' });
      if (record.definitionRevision !== this.definitionRevision) errors.push({ code: 'definitionRevisionMismatch', path: `triggers.ledger.${record.triggerId}.definitionRevision`, message: 'ledger definition revision 不匹配' });
      if (record.operationId && record.fingerprint !== this._operationFingerprint(trigger, record.operationId)) {
        errors.push({ code: 'invalidFingerprint', path: `triggers.ledger.${record.triggerId}.fingerprint`, message: 'operation fingerprint 不匹配' });
      }
      if (this.operationFingerprintValidator && record.operationId
        && this.operationFingerprintValidator(record, trigger) !== true) {
        errors.push({ code: 'invalidFingerprint', path: `triggers.ledger.${record.triggerId}.fingerprint`, message: 'operation fingerprint validator 拒绝' });
      }
    }
    return { ok: errors.length === 0, errors };
  }

  deserialize(data) {
    const validation = this.validateSnapshot(data);
    if (!validation.ok) return validation;
    const now = this.monotonicClock.now();
    const nextLedger = new ScenarioExecutionLedger().restore(data.ledger);
    const nextOnce = new Set(data.firedOnce);
    const nextCooldowns = Object.create(null);
    for (const [id, saved] of Object.entries(data.cooldowns)) {
      nextCooldowns[id] = {
        duration: saved.duration,
        nextDue: this._restoreDue(saved, now, this._triggersById.get(id)?.catchUpPolicy || 'resume')
      };
    }
    const nextTimers = data.timers.map(saved => {
      const trigger = this._triggersById.get(saved.triggerId);
      const definitionTimer = this._timers.find(entry => entry.trigger.id === saved.triggerId);
      return {
        trigger,
        interval: definitionTimer.interval,
        catchUpPolicy: definitionTimer.catchUpPolicy,
        maxCatchUp: definitionTimer.maxCatchUp,
        nextDue: this._restoreDue(saved, now, definitionTimer.catchUpPolicy),
        remaining: saved.remaining
      };
    });
    for (const active of this._active.values()) active.cancelled = true;
    this._active.clear();
    this._queues.clear();
    this.ledger = nextLedger;
    this._firedOnce = nextOnce;
    this._cooldowns = nextCooldowns;
    this._timers = nextTimers;
    return { ok: true, errors: [] };
  }

  _validTiming(value) {
    return Number.isFinite(value?.remaining) && value.remaining >= 0
      && Number.isFinite(value?.nextDue) && value.nextDue >= 0
      && (value.duration === undefined || (Number.isFinite(value.duration) && value.duration >= 0))
      && (value.interval === undefined || (Number.isFinite(value.interval) && value.interval > 0));
  }

  _restoreDue(saved, now, policy) {
    if (policy === 'all') return saved.nextDue;
    if (policy === 'single' && saved.nextDue <= now) return now;
    if (policy === 'skip' && saved.nextDue <= now) return now + (saved.interval || saved.duration || saved.remaining);
    return now + saved.remaining;
  }

  _createTimer(trigger) {
    const interval = Number(trigger.when.params?.seconds || 0) * 1000;
    const catchUpPolicy = trigger.catchUpPolicy || trigger.when.params?.catchUpPolicy || 'resume';
    if (!Number.isFinite(interval) || interval <= 0) throw new Error(`TriggerSystem.register: ${trigger.id} timer seconds 必须大于 0`);
    if (!CATCH_UP_POLICIES.has(catchUpPolicy)) throw new Error(`TriggerSystem.register: ${trigger.id} catchUpPolicy 非法`);
    return {
      trigger, interval, catchUpPolicy,
      maxCatchUp: Math.max(1, Math.floor(Number(trigger.maxCatchUp || trigger.when.params?.maxCatchUp || 100))),
      nextDue: this.monotonicClock.now() + interval,
      remaining: interval
    };
  }

  _reentryPolicy(trigger) { return trigger.reentryPolicy || trigger.reentry || 'reject'; }

  _operationFingerprint(trigger, operationId) {
    if (!trigger) return '';
    return stableDigest({
      triggerId: trigger.id,
      definitionRevision: this.definitionRevision,
      operationId,
      actions: trigger.do || []
    });
  }

  _validateDefinitionReferences(trigger, errors) {
    const policy = this._reentryPolicy(trigger);
    for (const [index, action] of (trigger.do || []).entries()) {
      const descriptor = this.actionDescriptorRegistry?.get?.(action?.action);
      if (!descriptor && typeof this.actions[action?.action] !== 'function') {
        errors.push({ code: 'invalidReference', path: `triggers.definitions.${trigger.id}.do[${index}].action`, message: `未知 action ${String(action?.action)}` });
      }
      if (descriptor && !descriptor.allowedReentryPolicies.includes(policy)) {
        errors.push({ code: 'invalidReentry', path: `triggers.definitions.${trigger.id}.reentryPolicy`, message: `action ${action.action} 不允许 ${policy}` });
      }
      for (const ref of action?.serviceRefs || []) this._validateServiceRef(ref, `${trigger.id}.do[${index}]`, errors);
    }
    for (const ref of trigger.serviceRefs || []) this._validateServiceRef(ref, trigger.id, errors);
    for (const raw of trigger.bindingRefs || []) {
      const id = typeof raw === 'string' ? raw : raw?.id;
      const resolver = this.bindingReferenceResolver || this.ctx.triggerBindings;
      const exists = typeof resolver === 'function' ? resolver(id) : (resolver?.has?.(id) || resolver?.get?.(id));
      if (!hasText(id) || !exists) errors.push({ code: 'invalidReference', path: `triggers.definitions.${trigger.id}.bindingRefs`, message: `未知 binding ${String(id)}` });
    }
  }

  _validateServiceRef(raw, owner, errors) {
    const id = typeof raw === 'string' ? raw : raw?.id;
    const resolver = this.serviceReferenceResolver || this.ctx.services;
    const exists = typeof resolver === 'function' ? resolver(id) : (resolver?.has?.(id) || resolver?.get?.(id) || resolver?.[id]);
    if (!hasText(id) || !exists) errors.push({ code: 'invalidReference', path: `triggers.definitions.${owner}.serviceRefs`, message: `未知 service ${String(id)}` });
  }
}

export default TriggerSystem;
