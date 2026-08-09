/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * YiJian18-Engine - Battle domain coordinator
 ************************************************************/

export const BattleMode = Object.freeze({
  OBSERVE: 'observe',
  INTERVENE: 'intervene'
});

export const BattleState = Object.freeze({
  IDLE: 'idle',
  AWAITING_MODE: 'awaitingMode',
  ACTIVE: 'active',
  RESOLVED: 'resolved'
});

const clone = value => JSON.parse(JSON.stringify(value));
const fingerprint = value => JSON.stringify(value);

/**
 * BattleSystem owns the irreversible mode choice and the single frozen result.
 * CombatSystem remains the executor; BattleClient remains the only result transport.
 */
export class BattleSystem {
  constructor(config = {}) {
    this.battleClient = config.battleClient || null;
    this.validator = config.validator || null;
    this.now = config.now || (() => Date.now());
    this.onEvent = config.onEvent || (() => {});
    this.maxOperations = Math.max(16, Number(config.maxOperations) || 256);
    this.reset();
  }

  reset() {
    this.state = BattleState.IDLE;
    this.definition = null;
    this.mode = null;
    this.frozenResult = null;
    this._operations = new Map();
  }

  async start(definition, options = {}) {
    if (!this.battleClient?.createBattle) return { ok: false, code: 'battleClientMissing' };
    const error = this._validateDefinition(definition);
    if (error) return { ok: false, code: 'invalidDefinition', message: error };
    if (this.state !== BattleState.IDLE) {
      return this.definition?.battleId === definition.battleId
        ? { ok: true, idempotent: true, state: this.getState() }
        : { ok: false, code: 'battleAlreadyActive' };
    }

    const response = await this.battleClient.createBattle(clone(definition.createParams), {
      requestId: options.requestId || `create:${definition.battleId}`
    });
    this.definition = clone(definition);
    this.state = BattleState.AWAITING_MODE;
    this.onEvent('battleStarted', { battleId: definition.battleId, response: clone(response) });
    return { ok: true, response, state: this.getState() };
  }

  /**
   * 读档后重建无状态/本地 transport 中的战役会话，不改变已恢复的模式和战果。
   * createBattle 契约必须按 requestId 幂等，因此重复调用不会重复创建领域状态。
   */
  async rehydrate(options = {}) {
    if (this.state === BattleState.IDLE) return { ok: true, skipped: true, state: this.getState() };
    if (!this.battleClient?.createBattle) return { ok: false, code: 'battleClientMissing' };
    if (!this.definition?.battleId || !this.definition?.createParams) {
      return { ok: false, code: 'battleDefinitionMissing' };
    }
    const response = await this.battleClient.createBattle(clone(this.definition.createParams), {
      requestId: options.requestId || `create:${this.definition.battleId}`
    });
    this.onEvent('battleRehydrated', { battleId: this.definition.battleId, response: clone(response) });
    return { ok: true, response, state: this.getState() };
  }

  async selectMode(mode, options = {}) {
    if (!Object.values(BattleMode).includes(mode)) return { ok: false, code: 'invalidMode' };
    if (this.state === BattleState.IDLE) return { ok: false, code: 'battleNotStarted' };
    if (this.state === BattleState.RESOLVED) return { ok: false, code: 'battleResolved' };

    const operationId = String(options.operationId || `mode:${this.definition.battleId}:${mode}`);
    const payload = { mode, heroId: options.heroId || null, entryPoint: options.entryPoint || null };
    const known = this._lookupOperation(operationId, payload);
    if (known) return known;
    if (this.mode) {
      return this.mode === mode
        ? { ok: true, idempotent: true, mode: this.mode }
        : { ok: false, code: 'modeLocked', mode: this.mode };
    }

    let response = null;
    if (mode === BattleMode.INTERVENE) {
      if (!options.heroId || !options.entryPoint) return { ok: false, code: 'interventionContextMissing' };
      response = await this.battleClient.intervene({
        battleId: this.definition.battleId,
        heroId: options.heroId,
        entryPoint: clone(options.entryPoint)
      }, { requestId: operationId });
    }

    this.mode = mode;
    this.state = BattleState.ACTIVE;
    const result = { ok: true, mode, response };
    this._rememberOperation(operationId, payload, result);
    this.onEvent('battleModeSelected', { battleId: this.definition.battleId, mode });
    return result;
  }

  async reportResult(params = {}, options = {}) {
    if (!this.battleClient?.reportBattleResult) return { ok: false, code: 'battleClientMissing' };
    if (!this.mode) return { ok: false, code: 'modeRequired' };
    if (this.frozenResult) return { ok: true, idempotent: true, result: clone(this.frozenResult) };
    const candidate = await this.battleClient.reportBattleResult({
      ...clone(params),
      battleId: this.definition.battleId
    }, { requestId: options.requestId || `result:${this.definition.battleId}` });
    return this.freezeResult(candidate);
  }

  freezeResult(candidate) {
    if (this.frozenResult) {
      return this.frozenResult.resultId === candidate?.resultId
        ? { ok: true, idempotent: true, result: clone(this.frozenResult) }
        : { ok: false, code: 'resultAlreadyFrozen', resultId: this.frozenResult.resultId };
    }
    const loaded = this.validator?.loadCandidate
      ? this.validator.loadCandidate(candidate, 'battleResult', null)
      : { committed: candidate && typeof candidate.resultId === 'string', value: candidate, errors: [] };
    if (!loaded.committed) return { ok: false, code: 'invalidBattleResult', errors: loaded.errors || [] };
    if (loaded.value.battleId !== this.definition?.battleId) {
      return { ok: false, code: 'battleIdMismatch' };
    }
    this.frozenResult = clone(loaded.value);
    this.state = BattleState.RESOLVED;
    this.onEvent('battleResolved', { result: clone(this.frozenResult), mode: this.mode });
    return { ok: true, result: clone(this.frozenResult) };
  }

  evaluateOutcome(signals = {}, resultFactory) {
    if (!this.mode) return { ok: false, code: 'modeRequired' };
    if (this.frozenResult) return { ok: true, idempotent: true, result: clone(this.frozenResult) };
    const rules = this.definition?.outcomePriority || [];
    const matched = rules.find(rule => signals[rule.signal] === true);
    if (!matched) return { ok: false, code: 'battleOngoing' };
    if (typeof resultFactory !== 'function') return { ok: false, code: 'resultFactoryMissing' };
    return this.freezeResult(resultFactory({
      battleId: this.definition.battleId,
      winnerFactionId: matched.winnerFactionId,
      reason: matched.reason || matched.signal,
      completedAt: this.now()
    }));
  }

  filterEffectAmount(context = {}, amount = 0) {
    const effectType = context.effectType;
    const participantFactions = this.definition?.participantFactionIds || [];
    const playerId = this.definition?.playerEntityId;
    const targetsBattle = participantFactions.includes(context.targetFactionId);
    const fromPlayer = context.sourceEntityId === playerId;
    if (!fromPlayer || !targetsBattle || (effectType !== 'damage' && effectType !== 'heal')) return amount;
    if (this.mode === BattleMode.OBSERVE) return 0;
    const sourceFactionId = context.sourceEntity?.factionId || null;
    if (this.mode === BattleMode.INTERVENE && sourceFactionId === context.targetFactionId) return 0;
    return amount;
  }

  canUseRescue() {
    return this.mode === BattleMode.INTERVENE && this.state === BattleState.ACTIVE;
  }

  getState() {
    return {
      state: this.state,
      battleId: this.definition?.battleId || null,
      mode: this.mode,
      result: this.frozenResult ? clone(this.frozenResult) : null
    };
  }

  serialize() {
    return {
      schemaVersion: 1,
      state: this.state,
      definition: this.definition ? clone(this.definition) : null,
      mode: this.mode,
      frozenResult: this.frozenResult ? clone(this.frozenResult) : null,
      operations: [...this._operations.entries()].map(([id, value]) => ({ id, ...clone(value) }))
    };
  }

  deserialize(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Object.values(BattleState).includes(snapshot.state)) {
      return { ok: false, code: 'invalidSnapshot' };
    }
    if (snapshot.mode !== null && !Object.values(BattleMode).includes(snapshot.mode)) {
      return { ok: false, code: 'invalidSnapshotMode' };
    }
    const operations = new Map();
    for (const entry of snapshot.operations || []) {
      if (!entry?.id || typeof entry.fingerprint !== 'string') return { ok: false, code: 'invalidOperation' };
      operations.set(entry.id, { fingerprint: entry.fingerprint, result: clone(entry.result) });
    }
    this.state = snapshot.state;
    this.definition = snapshot.definition ? clone(snapshot.definition) : null;
    this.mode = snapshot.mode;
    this.frozenResult = snapshot.frozenResult ? clone(snapshot.frozenResult) : null;
    this._operations = operations;
    return { ok: true };
  }

  _validateDefinition(definition) {
    if (!definition || typeof definition !== 'object') return '战役定义必须是对象';
    if (!definition.battleId || !definition.createParams) return '缺少 battleId/createParams';
    if (definition.createParams.battleId !== definition.battleId) return 'createParams.battleId 不一致';
    if (!Array.isArray(definition.outcomePriority) || definition.outcomePriority.length === 0) return '缺少胜负优先级';
    if (definition.outcomePriority.some(rule => !rule?.signal || !rule?.winnerFactionId)) return '胜负规则字段不完整';
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

export default BattleSystem;
