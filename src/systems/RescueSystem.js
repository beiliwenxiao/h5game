/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * YiJian18-Engine - generic timed rescue state machine
 ************************************************************/

export const RescueStatus = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed'
});

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const fingerprint = value => JSON.stringify(value);

/**
 * 通用救援状态机。只解释阶段、时限与模式，不识别场景或人物名称。
 */
export class RescueSystem {
  constructor(config = {}) {
    this.now = config.now || (() => performance.now() / 1000);
    this.onEvent = config.onEvent || (() => {});
    this.maxOperations = Math.max(16, Number(config.maxOperations) || 256);
    this.reset();
  }

  reset() {
    this.definition = null;
    this.status = RescueStatus.IDLE;
    this.stageIndex = -1;
    this.startedAt = null;
    this.deadline = null;
    this.result = null;
    this.failureReason = null;
    this.costs = {};
    this.completedStageIds = [];
    this._operations = new Map();
  }

  start(definition, options = {}) {
    const error = this._validateDefinition(definition);
    if (error) return { ok: false, code: 'invalidDefinition', message: error };
    const mode = options.mode || null;
    if (definition.allowedModes?.length && !definition.allowedModes.includes(mode)) {
      return { ok: false, code: 'modeNotAllowed', mode };
    }
    const operationId = String(options.operationId || `start:${definition.id}`);
    const payload = { definitionId: definition.id, mode, costs: options.costs || definition.costs || {} };
    const known = this._lookupOperation(operationId, payload);
    if (known) return known;
    if (this.status !== RescueStatus.IDLE) {
      return this.definition?.id === definition.id
        ? { ok: true, idempotent: true, state: this.getState() }
        : { ok: false, code: 'rescueAlreadyStarted' };
    }

    const startedAt = Number(options.startedAt ?? this.now());
    if (!Number.isFinite(startedAt) || startedAt < 0) return { ok: false, code: 'invalidStartedAt' };
    this.definition = clone(definition);
    this.status = RescueStatus.ACTIVE;
    this.stageIndex = 0;
    this.startedAt = startedAt;
    this.deadline = startedAt + Number(definition.duration);
    this.costs = clone(options.costs || definition.costs || {});
    const result = { ok: true, state: this.getState(startedAt) };
    this._rememberOperation(operationId, payload, result);
    this.onEvent('rescueStarted', this.getState(startedAt));
    return result;
  }

  completeStage(stageId, options = {}) {
    if (this.status !== RescueStatus.ACTIVE) return this._terminalOrInactive();
    const current = this.definition.stages[this.stageIndex];
    if (current?.id !== stageId) {
      return { ok: false, code: 'stageNotActive', stageId: current?.id || null };
    }
    const completedAt = Number(options.completedAt ?? this.now());
    if (!Number.isFinite(completedAt) || completedAt < this.startedAt) {
      return { ok: false, code: 'invalidCompletedAt' };
    }
    const operationId = String(options.operationId || `stage:${this.definition.id}:${stageId}`);
    const payload = { stageId, completedAt };
    const known = this._lookupOperation(operationId, payload);
    if (known) return known;
    if (completedAt > this.deadline) {
      return this._settle(RescueStatus.FAILED, completedAt, 'deadlineExceeded', operationId, payload);
    }

    this.completedStageIds.push(stageId);
    const isFinal = this.stageIndex >= this.definition.stages.length - 1;
    if (isFinal) return this._settle(RescueStatus.SUCCEEDED, completedAt, null, operationId, payload);
    this.stageIndex++;
    const result = { ok: true, completed: false, state: this.getState(completedAt) };
    this._rememberOperation(operationId, payload, result);
    this.onEvent('rescueStageAdvanced', this.getState(completedAt));
    return result;
  }

  update(timestamp = this.now()) {
    if (this.status !== RescueStatus.ACTIVE) return this._terminalOrInactive();
    const currentTime = Number(timestamp);
    if (!Number.isFinite(currentTime) || currentTime < this.startedAt) {
      return { ok: false, code: 'invalidTimestamp' };
    }
    if (currentTime <= this.deadline) return { ok: true, active: true, state: this.getState(currentTime) };
    return this._settle(
      RescueStatus.FAILED,
      currentTime,
      'deadlineExceeded',
      `timeout:${this.definition.id}`,
      { deadline: this.deadline }
    );
  }

  fail(reason = 'objectiveFailed', options = {}) {
    if (this.status !== RescueStatus.ACTIVE) return this._terminalOrInactive();
    const failedAt = Number(options.failedAt ?? this.now());
    if (!Number.isFinite(failedAt) || failedAt < this.startedAt) {
      return { ok: false, code: 'invalidFailedAt' };
    }
    const operationId = String(options.operationId || `fail:${this.definition.id}:${reason}`);
    return this._settle(RescueStatus.FAILED, failedAt, String(reason), operationId, { reason, failedAt });
  }

  getState(timestamp = this.now()) {
    const currentTime = Number(timestamp);
    const stage = this.stageIndex >= 0 ? this.definition?.stages?.[this.stageIndex] : null;
    return clone({
      schemaVersion: 1,
      definitionId: this.definition?.id || null,
      battleId: this.definition?.battleId || null,
      status: this.status,
      stageId: stage?.id || null,
      stageIndex: this.stageIndex,
      totalStages: this.definition?.stages?.length || 0,
      objective: stage?.objective || '',
      startedAt: this.startedAt,
      deadline: this.deadline,
      remaining: this.status === RescueStatus.ACTIVE && Number.isFinite(currentTime)
        ? Math.max(0, this.deadline - currentTime)
        : 0,
      result: this.result,
      failureReason: this.failureReason,
      costs: this.costs,
      completedStageIds: this.completedStageIds
    });
  }

  serialize() {
    const capturedAt = Number(this.now());
    const remaining = this.status === RescueStatus.ACTIVE && Number.isFinite(capturedAt)
      ? Math.max(0, this.deadline - capturedAt)
      : 0;
    return {
      schemaVersion: 1,
      definition: clone(this.definition),
      status: this.status,
      stageIndex: this.stageIndex,
      startedAt: this.startedAt,
      deadline: this.deadline,
      remaining,
      result: clone(this.result),
      failureReason: this.failureReason,
      costs: clone(this.costs),
      completedStageIds: clone(this.completedStageIds),
      operations: [...this._operations.entries()].map(([id, value]) => ({ id, ...clone(value) }))
    };
  }

  validateSerialized(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Object.values(RescueStatus).includes(snapshot.status)) {
      return { ok: false, code: 'invalidSnapshot' };
    }
    if (snapshot.status !== RescueStatus.IDLE) {
      const error = this._validateDefinition(snapshot.definition);
      if (error) return { ok: false, code: 'invalidSnapshotDefinition', message: error };
    }
    if (!Number.isInteger(snapshot.stageIndex) || snapshot.stageIndex < -1) {
      return { ok: false, code: 'invalidStageIndex' };
    }
    if (snapshot.status === RescueStatus.ACTIVE
      && (snapshot.stageIndex < 0 || snapshot.stageIndex >= snapshot.definition.stages.length)) {
      return { ok: false, code: 'invalidStageIndex' };
    }
    if (snapshot.status === RescueStatus.ACTIVE
      && (!Number.isFinite(Number(snapshot.remaining))
        || Number(snapshot.remaining) < 0
        || Number(snapshot.remaining) > Number(snapshot.definition.duration))) {
      return { ok: false, code: 'invalidRemainingTime' };
    }
    if (!Array.isArray(snapshot.completedStageIds) || !Array.isArray(snapshot.operations || [])) {
      return { ok: false, code: 'invalidSnapshotCollections' };
    }
    return { ok: true };
  }

  deserialize(snapshot) {
    const check = this.validateSerialized(snapshot);
    if (!check.ok) return check;
    const operations = new Map();
    for (const entry of snapshot.operations || []) {
      if (!entry?.id || typeof entry.fingerprint !== 'string') {
        return { ok: false, code: 'invalidOperation' };
      }
      operations.set(entry.id, { fingerprint: entry.fingerprint, result: clone(entry.result) });
    }
    this.definition = clone(snapshot.definition);
    this.status = snapshot.status;
    this.stageIndex = snapshot.stageIndex;
    if (snapshot.status === RescueStatus.ACTIVE) {
      const restoredAt = Number(this.now());
      const remaining = Number(snapshot.remaining);
      const elapsed = Math.max(0, Number(snapshot.definition.duration) - remaining);
      this.startedAt = restoredAt - elapsed;
      this.deadline = restoredAt + remaining;
    } else {
      this.startedAt = snapshot.startedAt;
      this.deadline = snapshot.deadline;
    }
    this.result = clone(snapshot.result);
    this.failureReason = snapshot.failureReason || null;
    this.costs = clone(snapshot.costs || {});
    this.completedStageIds = clone(snapshot.completedStageIds);
    this._operations = operations;
    return { ok: true, state: this.getState() };
  }

  _settle(status, completedAt, failureReason, operationId, payload) {
    if (this.status !== RescueStatus.ACTIVE) return this._terminalOrInactive();
    this.status = status;
    this.failureReason = failureReason;
    this.result = {
      rescueId: this.definition.id,
      battleId: this.definition.battleId,
      status,
      survived: status === RescueStatus.SUCCEEDED,
      completedAt,
      failureReason,
      completedStageIds: clone(this.completedStageIds),
      costs: clone(this.costs)
    };
    const result = { ok: true, completed: true, result: clone(this.result), state: this.getState(completedAt) };
    this._rememberOperation(operationId, payload, result);
    this.onEvent('rescueResolved', clone(result));
    return result;
  }

  _terminalOrInactive() {
    if (this.result) return { ok: true, completed: true, idempotent: true, result: clone(this.result), state: this.getState() };
    return { ok: false, code: 'rescueNotActive' };
  }

  _validateDefinition(definition) {
    if (!definition || typeof definition !== 'object') return '救援定义必须是对象';
    if (typeof definition.id !== 'string' || !definition.id) return '缺少救援 id';
    if (typeof definition.battleId !== 'string' || !definition.battleId) return '缺少 battleId';
    if (!Number.isFinite(Number(definition.duration)) || Number(definition.duration) <= 0) return 'duration 必须大于 0';
    if (!Array.isArray(definition.stages) || definition.stages.length === 0) return '至少需要一个阶段';
    const ids = new Set();
    for (const stage of definition.stages) {
      if (typeof stage?.id !== 'string' || !stage.id || typeof stage.objective !== 'string') return '阶段字段不完整';
      if (ids.has(stage.id)) return `重复阶段 id: ${stage.id}`;
      ids.add(stage.id);
    }
    if (definition.allowedModes && (!Array.isArray(definition.allowedModes)
      || definition.allowedModes.some(mode => typeof mode !== 'string'))) return 'allowedModes 非法';
    return null;
  }

  _lookupOperation(operationId, payload) {
    const known = this._operations.get(operationId);
    if (!known) return null;
    if (known.fingerprint !== fingerprint(payload)) return { ok: false, code: 'operationConflict' };
    return { ...clone(known.result), idempotent: true };
  }

  _rememberOperation(operationId, payload, result) {
    this._operations.set(operationId, { fingerprint: fingerprint(payload), result: clone(result) });
    while (this._operations.size > this.maxOperations) this._operations.delete(this._operations.keys().next().value);
  }
}

export default RescueSystem;
