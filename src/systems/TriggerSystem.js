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
const COORDINATION_POLICIES = new Set(['broadcast', 'firstSuccess']);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const coordinationOf = trigger => {
  const value = trigger?.coordination || {};
  return {
    group: hasText(value.group) ? value.group.trim() : null,
    priority: Number.isInteger(value.priority) ? value.priority : 0,
    policy: hasText(value.policy) ? value.policy : 'broadcast'
  };
};

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
    this.sceneEventDefinitionRepository = config.sceneEventDefinitionRepository || null;
    this.flowGroupDefinitionRepository = config.flowGroupDefinitionRepository || this.sceneEventDefinitionRepository;
    this.flowGroupStateMachine = config.flowGroupStateMachine || null;
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
    this._coordinationTails = new Map();
    this._coordinationGeneration = 0;
    this._operationSequence = 0;
    this._eventSequence = 0;
  }

  init(ctx = {}) {
    this.ctx = { ...ctx, triggerSystem: this };
    this.runtimeConfig = ctx.runtimeConfig || this.runtimeConfig;
    this.debugMode = normalizeRuntimeDebugMode(this.runtimeConfig?.debug);
    this.sceneDiagnostics = ctx.sceneDiagnostics || ctx.services?.diagnostics || this.sceneDiagnostics;
    this.sceneEventDefinitionRepository = ctx.sceneEventDefinitionRepository
      || this.sceneEventDefinitionRepository;
    this.flowGroupDefinitionRepository = ctx.flowGroupDefinitionRepository
      || this.sceneEventDefinitionRepository
      || this.flowGroupDefinitionRepository;
    this.flowGroupStateMachine = ctx.flowGroupStateMachine || this.flowGroupStateMachine;
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
    if (Object.prototype.hasOwnProperty.call(patch, 'sceneEventDefinitionRepository')) {
      this.sceneEventDefinitionRepository = patch.sceneEventDefinitionRepository || null;
      this.flowGroupDefinitionRepository = patch.flowGroupDefinitionRepository
        || this.sceneEventDefinitionRepository
        || this.flowGroupDefinitionRepository;
    } else if (Object.prototype.hasOwnProperty.call(patch, 'flowGroupDefinitionRepository')) {
      this.flowGroupDefinitionRepository = patch.flowGroupDefinitionRepository || null;
      this.sceneEventDefinitionRepository = this.flowGroupDefinitionRepository || this.sceneEventDefinitionRepository;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'flowGroupStateMachine')) {
      this.flowGroupStateMachine = patch.flowGroupStateMachine || null;
    }
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

  _validateSceneEventReference(trigger) {
    // 双字段兼容：flowGroupId 优先，回退 sceneEventId
    const hasFg = Object.prototype.hasOwnProperty.call(trigger, 'flowGroupId');
    const hasSe = Object.prototype.hasOwnProperty.call(trigger, 'sceneEventId');
    if (!hasFg && !hasSe) return true;
    const fgId = typeof trigger?.flowGroupId === 'string' ? trigger.flowGroupId.trim() : '';
    const seId = typeof trigger?.sceneEventId === 'string' ? trigger.sceneEventId.trim() : '';
    const resolved = fgId || seId;
    const label = hasFg ? 'flowGroupId' : 'sceneEventId';
    if (!resolved) {
      throw new Error(`TriggerSystem.register: ${trigger?.id || '<unknown>'}.${label} 必须是非空字符串（兼容 sceneEventId）`);
    }
    const repo = this.flowGroupDefinitionRepository || this.sceneEventDefinitionRepository;
    if (repo?.has && !repo.has(resolved)) {
      throw new Error(`TriggerSystem.register: ${trigger.id}.${label} 未登记 "${resolved}"（FlowGroup / SceneEvent）`);
    }
    return true;
  }

  register(trigger) {
    if (!trigger || !hasText(trigger.id)) throw new Error('TriggerSystem.register: trigger.id 必须是非空字符串');
    if (!trigger.when?.type) throw new Error(`TriggerSystem.register: ${trigger.id}.when.type 不能为空`);
    this._validateSceneEventReference(trigger);
    this._validateActionStepDefinitions(trigger);
    if (this._triggersById.has(trigger.id)) throw new Error(`TriggerSystem.register: 重复 trigger.id "${trigger.id}"（triggers/tutorials 共用命名空间）`);
    const policy = this._reentryPolicy(trigger);
    if (!REENTRY_POLICIES.has(policy)) throw new Error(`TriggerSystem.register: ${trigger.id}.reentryPolicy 非法`);
    this._validateCoordinationDefinition(trigger);
    this.triggers.push(trigger);
    this._triggersById.set(trigger.id, trigger);
    this.ledger.registerIdle(trigger.id, this.definitionRevision);
    if (trigger.when.type === 'timer') this._timers.push(this._createTimer(trigger));
    return trigger;
  }

  registerAll(list = []) {
    const seen = new Set(this._triggersById.keys());
    const coordinationPolicies = this._coordinationPolicyIndex(this.triggers);
    for (const trigger of list) {
      if (!trigger || !hasText(trigger.id)) throw new Error('TriggerSystem.registerAll: trigger.id 必须是非空字符串');
      if (!trigger.when?.type) throw new Error(`TriggerSystem.registerAll: ${trigger.id}.when.type 不能为空`);
      this._validateSceneEventReference(trigger);
      this._validateActionStepDefinitions(trigger);
      if (seen.has(trigger.id)) throw new Error(`TriggerSystem.registerAll: 重复 trigger.id "${trigger.id}"（triggers/tutorials 共用命名空间）`);
      const policy = this._reentryPolicy(trigger);
      if (!REENTRY_POLICIES.has(policy)) throw new Error(`TriggerSystem.registerAll: ${trigger.id}.reentryPolicy 非法`);
      this._validateCoordinationDefinition(trigger, coordinationPolicies);
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
    this._coordinationGeneration += 1;
    this._coordinationTails.clear();
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

  /**
   * 对同一内容事件执行确定性仲裁；旧 fire/fireById 保持原有 accepted 语义。
   * 未配置 coordination 的 trigger 各自作为 broadcast 候选，行为保持兼容。
   */
  async fireCoordinated(whenType, params = {}) {
    const matched = this.triggers
      .map((trigger, index) => ({ trigger, index, coordination: coordinationOf(trigger) }))
      .filter(candidate => candidate.trigger.when?.type === whenType
        && this._matchParams(candidate.trigger.when.params, params));
    if (matched.length === 0) {
      return {
        ok: true, accepted: 0, succeeded: 0, failed: 0, skipped: 0,
        winners: [], records: [], matchedTriggerIds: []
      };
    }

    const groups = new Map();
    for (const candidate of matched) {
      const key = candidate.coordination.group
        ? `${whenType}:group:${candidate.coordination.group}`
        : `${whenType}:trigger:${candidate.trigger.id}`;
      const group = groups.get(key) || {
        key,
        group: candidate.coordination.group,
        policy: candidate.coordination.policy,
        candidates: []
      };
      group.candidates.push(candidate);
      groups.set(key, group);
    }

    const generation = this._coordinationGeneration;
    const groupResults = await Promise.all([...groups.values()].map(group => (
      this._enqueueCoordinationGroup(group.key, async () => {
        if (generation !== this._coordinationGeneration) {
          return {
            ok: true,
            entries: group.candidates.map(candidate => ({
              triggerId: candidate.trigger.id,
              operationId: null,
              status: 'skipped',
              code: 'coordinationReset'
            }))
          };
        }
        return this._runCoordinatedGroup(group, whenType, params);
      })
    )));
    const records = groupResults.flatMap(result => result.entries || []);
    const succeededRecords = records.filter(record => record.status === 'succeeded');
    const failedRecords = records.filter(record => record.status === 'failed');
    const skippedRecords = records.filter(record => record.status === 'skipped');
    const result = {
      ok: groupResults.every(group => group.ok !== false),
      accepted: succeededRecords.length + failedRecords.length,
      succeeded: succeededRecords.length,
      failed: failedRecords.length,
      skipped: skippedRecords.length,
      winners: groupResults.flatMap(group => group.winners || []),
      records,
      matchedTriggerIds: matched.map(candidate => candidate.trigger.id)
    };
    if (matched.length > 1 || failedRecords.length > 0
      || skippedRecords.some(record => record.code === 'skippedByConflictPolicy')) {
      this.sceneDiagnostics?.recordEventConflict?.({
        type: 'eventConflict',
        eventType: whenType,
        eventId: params.eventId || null,
        operationId: params.operationId || null,
        matchedTriggerIds: result.matchedTriggerIds,
        winnerTriggerIds: result.winners,
        skippedTriggerIds: skippedRecords.map(record => record.triggerId),
        failedTriggerIds: failedRecords.map(record => record.triggerId),
        status: result.ok ? 'resolved' : 'failed',
        code: result.ok ? null : 'allCandidatesFailed'
      }, { openPanel: false });
    }
    return result;
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

  async _enqueueCoordinationGroup(key, run) {
    const previous = this._coordinationTails.get(key) || Promise.resolve();
    const current = previous.catch(() => null).then(run);
    this._coordinationTails.set(key, current);
    try {
      return await current;
    } finally {
      if (this._coordinationTails.get(key) === current) this._coordinationTails.delete(key);
    }
  }

  async _runCoordinatedGroup(group, whenType, params) {
    const candidates = [...group.candidates].sort((left, right) => (
      right.coordination.priority - left.coordination.priority || left.index - right.index
    ));
    const entries = [];
    const winners = [];
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const sourceOperationId = hasText(params.operationId)
        ? params.operationId
        : (hasText(params.eventId) ? params.eventId : null);
      const eventParams = sourceOperationId
        ? { ...params, operationId: `${sourceOperationId}:trigger:${candidate.trigger.id}` }
        : params;
      const request = this._enqueueRun(candidate.trigger, { type: whenType, params: eventParams });
      if (!request) {
        entries.push({
          triggerId: candidate.trigger.id,
          operationId: null,
          status: 'skipped',
          code: 'notEligible'
        });
        continue;
      }
      const settled = await request.completion;
      if (settled?.skipped) {
        entries.push({
          triggerId: candidate.trigger.id,
          operationId: request.operationId,
          status: 'skipped',
          code: settled.code || 'notEligible'
        });
        continue;
      }
      const record = settled?.record || this.ledger.get(candidate.trigger.id);
      const succeeded = settled?.value?.ok === true && record?.status === 'succeeded';
      entries.push({
        triggerId: candidate.trigger.id,
        operationId: request.operationId,
        status: succeeded ? 'succeeded' : 'failed',
        code: succeeded ? null : (record?.result?.code || settled?.error?.code || 'triggerFailed'),
        record
      });
      if (!succeeded) continue;
      winners.push(candidate.trigger.id);
      if (group.policy !== 'firstSuccess') continue;
      for (const skipped of candidates.slice(index + 1)) {
        entries.push({
          triggerId: skipped.trigger.id,
          operationId: null,
          status: 'skipped',
          code: 'skippedByConflictPolicy'
        });
      }
      break;
    }
    const attempted = entries.filter(entry => entry.status !== 'skipped');
    const succeeded = entries.filter(entry => entry.status === 'succeeded');
    return {
      ok: group.policy === 'firstSuccess'
        ? (succeeded.length > 0 || attempted.length === 0)
        : entries.every(entry => entry.status !== 'failed'),
      winners,
      entries
    };
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

  /** Trigger 所属 FlowGroup（双字段读取：flowGroupId 优先，回退 sceneEventId）。 */
  _flowGroupIdOf(trigger) {
    if (hasText(trigger?.flowGroupId)) return trigger.flowGroupId.trim();
    if (hasText(trigger?.sceneEventId)) return trigger.sceneEventId.trim();
    return '';
  }

  _eligible(trigger) {
    if (trigger.enabled === false) return false;
    if (trigger.once && this._firedOnce.has(trigger.id)) return false;
    const cooldown = this._cooldowns[trigger.id];
    if (cooldown && this.monotonicClock.now() < cooldown.nextDue) return false;
    if (trigger.if && !this.expr.eval(trigger.if)) return false;
    // FlowGroup 状态机门控：locked/dormant/completed 阶段组的 Trigger 不可运行。
    // 无状态机或无归属的 Trigger（未挂组）不受影响，保持旧行为。
    if (this.flowGroupStateMachine) {
      const flowGroupId = this._flowGroupIdOf(trigger);
      if (flowGroupId && !this.flowGroupStateMachine.isRunnable(flowGroupId)) {
        // 例外：一次性 state.transaction 收尾触发器允许在组 COMPLETED 后补触发。
        // 组的完成条件常由同组成员提交的事务写入：黑板写入会同步触发状态机完成，
        // 而该事务的通知事件在提交之后才派发——若此时仍按 active 门控，监听
        // "完成事务"的 once 触发器将永远无法运行，导致后续流程死锁。
        const completionNotice = trigger.once === true
          && trigger?.when?.type === 'state.transaction'
          && this.flowGroupStateMachine.getPhase(flowGroupId) === 'completed';
        if (!completionNotice) return false;
      }
    }
    return true;
  }

  _createRequest(trigger, event) {
    const explicit = event?.params?.operationId;
    const sequence = ++this._operationSequence;
    const operationId = hasText(explicit) ? explicit : this.operationIdFactory({
      triggerId: trigger.id, definitionRevision: this.definitionRevision, sequence, eventType: event?.type
    });
    if (!hasText(operationId)) throw new TypeError('Trigger operationIdFactory must return a stable non-empty ID');
    let resolveCompletion;
    const completion = new Promise(resolve => { resolveCompletion = resolve; });
    return {
      event,
      operationId,
      fingerprint: this._operationFingerprint(trigger, operationId),
      completion,
      resolveCompletion
    };
  }

  _startExecution(trigger, request) {
    const token = { cancelled: false, promise: null };
    this._active.set(trigger.id, token);
    const executionPromise = this._execute(trigger, request, token);
    token.promise = executionPromise.then(
      value => {
        request.resolveCompletion({ value, record: clone(this.ledger.get(trigger.id)) });
        return value;
      },
      error => {
        request.resolveCompletion({ error, record: clone(this.ledger.get(trigger.id)) });
        throw error;
      }
    ).finally(() => {
      if (this._active.get(trigger.id) !== token) return;
      this._active.delete(trigger.id);
      const queue = this._queues.get(trigger.id) || [];
      const next = queue.shift();
      if (trigger.once && this._firedOnce.has(trigger.id)) {
        this._queues.delete(trigger.id);
        const record = clone(this.ledger.get(trigger.id));
        for (const skipped of [next, ...queue].filter(Boolean)) {
          skipped.resolveCompletion({
            value: null,
            record,
            skipped: true,
            code: 'onceAlreadyFired'
          });
        }
        return;
      }
      if (queue.length) this._queues.set(trigger.id, queue);
      else this._queues.delete(trigger.id);
      if (next) this._startExecution(trigger, next);
    });
    // debug 模式会保留 TriggerExecutionError；显式观察避免无人等待时产生未处理拒绝。
    token.promise.catch(() => {});
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
      // FlowGroup 状态机进度通知（trigger 成功 → 组 progress+1）。状态机异常不得打断触发流程。
      if (this.flowGroupStateMachine) {
        const flowGroupId = this._flowGroupIdOf(trigger);
        if (flowGroupId) {
          try { this.flowGroupStateMachine.notifyProgress(flowGroupId, trigger.id, 'trigger'); }
          catch (error) { console.warn('TriggerSystem: FlowGroup 进度通知失败', error); }
        }
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
        // debug 模式下失败诊断必须进入 DebugPanel 并展开面板（debug failure exposure contract）；
        // 非 debug 由 SceneDiagnostics.recordTriggerFailure 直接拒绝，不打断玩家流程。
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
  /**
   * action 级 operationId：
   * - 显式 action.operationId 优先；
   * - 有 stepId（归属 FlowGroup 的稳定步骤）→ `${request.operationId}:trigger:${id}:step:${stepId}` 稳定身份；
   * - 无 stepId → 单动作链直接复用 request.operationId，多动作链用 `:action:${index}`
   *   （可预测格式，命令侧与 property 模型依赖此约定）。
   */
  _actionOperationId(trigger, action, index, request) {
    if (hasText(action?.operationId)) return action.operationId.trim();
    if (hasText(action?.stepId)) {
      return `${request.operationId}:trigger:${trigger.id}:step:${action.stepId.trim()}`;
    }
    return (trigger.do || []).length === 1
      ? request.operationId
      : `${request.operationId}:action:${index}`;
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
    this._coordinationGeneration += 1;
    this._coordinationTails.clear();
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

  _coordinationPolicyIndex(triggers = []) {
    const index = new Map();
    for (const trigger of triggers) {
      if (trigger?.coordination === undefined) continue;
      const coordination = coordinationOf(trigger);
      if (!coordination.group || !trigger.when?.type) continue;
      index.set(`${trigger.when.type}:${coordination.group}`, coordination.policy);
    }
    return index;
  }

  _validateCoordinationDefinition(trigger, policyIndex = null) {
    const raw = trigger?.coordination;
    if (raw === undefined) return true;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`TriggerSystem.register: ${trigger.id}.coordination 必须是对象`);
    }
    if (!hasText(raw.group)) {
      throw new Error(`TriggerSystem.register: ${trigger.id}.coordination.group 必须是非空字符串`);
    }
    if (raw.priority !== undefined && !Number.isInteger(raw.priority)) {
      throw new Error(`TriggerSystem.register: ${trigger.id}.coordination.priority 必须是整数`);
    }
    const policy = raw.policy === undefined ? 'broadcast' : raw.policy;
    if (!COORDINATION_POLICIES.has(policy)) {
      throw new Error(`TriggerSystem.register: ${trigger.id}.coordination.policy 非法`);
    }
    if (policy === 'firstSuccess' && !hasText(raw.group)) {
      throw new Error(`TriggerSystem.register: ${trigger.id} 的 firstSuccess 必须声明 coordination.group`);
    }
    const group = raw.group.trim();
    const key = `${trigger.when.type}:${group}`;
    const policies = policyIndex || this._coordinationPolicyIndex(this.triggers);
    const existing = policies.get(key);
    if (existing && existing !== policy) {
      throw new Error(`TriggerSystem.register: ${trigger.id} 与 ${key} 组内 coordination.policy 不一致`);
    }
    policies.set(key, policy);
    return true;
  }

  _validateActionStepDefinitions(trigger) {
    const identities = new Set();
    const requiresStableSteps = hasText(trigger?.flowGroupId) || hasText(trigger?.sceneEventId);
    for (const [index, action] of (trigger?.do || []).entries()) {
      const stepId = hasText(action?.stepId) ? action.stepId.trim() : '';
      if (requiresStableSteps && !stepId) {
        throw new Error(`TriggerSystem.register: ${trigger.id}.do[${index}].stepId 必须是非空稳定 ID`);
      }
      if (requiresStableSteps && Object.prototype.hasOwnProperty.call(action || {}, 'await')) {
        throw new Error(`TriggerSystem.register: ${trigger.id}.do[${index}].await 已废弃；动作始终严格串行等待`);
      }
      const identity = stepId || `legacy-${stableDigest(action || {})}`;
      if (identities.has(identity)) {
        throw new Error(`TriggerSystem.register: ${trigger.id}.do[${index}] 动作步骤身份重复: ${identity}`);
      }
      identities.add(identity);
    }
    return true;
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
