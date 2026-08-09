/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * YiJian18-Engine - atomic city/war battle-result settlement
 ************************************************************/

const clone = value => JSON.parse(JSON.stringify(value));
const fingerprint = value => JSON.stringify(value);

/**
 * Applies one canonical BattleResult in the fixed order:
 * resources -> city damage -> resource nodes -> war state -> story statistics.
 * Runtime ownership is injected so the engine does not depend on Blackboard.
 */
export class CityWarSystem {
  constructor(config = {}) {
    this.validator = config.validator || null;
    this.readState = config.readState || null;
    this.commitState = config.commitState || null;
    this.restoreState = config.restoreState || null;
    this.createCheckpoint = config.createCheckpoint || null;
    this.onEvent = config.onEvent || (() => {});
    this.maxAppliedResults = Math.max(16, Number(config.maxAppliedResults) || 256);
    this.maxOperations = Math.max(16, Number(config.maxOperations) || 256);
    this._operations = new Map();
  }

  prepareDraft(state, result, context = {}) {
    const validation = this._validateInput(state, result);
    if (!validation.ok) return validation;
    const applied = state.appliedBattleResultIds || [];
    if (applied.includes(result.resultId)) {
      return { ok: true, idempotent: true, draft: clone(state) };
    }

    const draft = clone(state);
    const cities = new Map(draft.cityStates.map(city => [city.id, city]));
    const transfer = result.resourceTransfer;
    const source = cities.get(transfer.fromCityId);
    const destination = cities.get(transfer.toCityId);
    const affected = cities.get(result.affectedCityId);

    for (const [resource, amount] of Object.entries(transfer.resources)) {
      const available = Number(source.resources?.[resource]) || 0;
      if (available < amount) {
        return {
          ok: false,
          code: 'insufficientCityResource',
          path: `cityStates.${source.id}.resources.${resource}`,
          expected: amount,
          actual: available
        };
      }
    }

    // 1. Resource transfer.
    for (const [resource, amount] of Object.entries(transfer.resources)) {
      source.resources[resource] = (Number(source.resources[resource]) || 0) - amount;
      destination.resources[resource] = (Number(destination.resources?.[resource]) || 0) + amount;
    }

    // 2. City damage.
    affected.damageRatio = Math.min(1, (Number(affected.damageRatio) || 0) + result.cityDamage);

    // 3. Resource-node damage.
    const nodes = new Map(draft.resourceNodes.map(node => [node.id, node]));
    for (const nodeId of result.damagedResourceNodeIds) {
      const node = nodes.get(nodeId);
      if (!node) return { ok: false, code: 'resourceNodeMissing', path: `resourceNodes.${nodeId}` };
      node.damageRatio = 1;
    }

    // 4. War state.
    draft.warState = draft.warState || {};
    draft.warState.battles = { ...(draft.warState.battles || {}) };
    draft.warState.battles[result.battleId] = {
      resultId: result.resultId,
      winnerFactionId: result.winnerFactionId,
      casualties: clone(result.casualties),
      completedAt: result.completedAt,
      mode: context.mode || null
    };
    draft.warState.casualties = { ...(draft.warState.casualties || {}) };
    for (const [armyId, amount] of Object.entries(result.casualties)) {
      draft.warState.casualties[armyId] = (Number(draft.warState.casualties[armyId]) || 0) + amount;
    }

    // 5. Story statistics and idempotency ledger.
    draft.storyState = draft.storyState || {};
    const battleStats = { ...(draft.storyState.battleStats || {}) };
    battleStats.total = (Number(battleStats.total) || 0) + 1;
    if (context.mode === 'observe') battleStats.observed = (Number(battleStats.observed) || 0) + 1;
    if (context.mode === 'intervene') battleStats.intervened = (Number(battleStats.intervened) || 0) + 1;
    draft.storyState.battleStats = battleStats;
    draft.storyState.lastBattleResultId = result.resultId;
    draft.appliedBattleResultIds = [...applied, result.resultId].slice(-this.maxAppliedResults);

    return { ok: true, draft };
  }

  async applyBattleResult({ result, operationId, context = {} } = {}) {
    if (!this.readState || !this.commitState || !this.restoreState || !this.createCheckpoint) {
      return { ok: false, code: 'stateAdapterMissing' };
    }
    const opId = String(operationId || `battle-result:${result?.resultId || 'missing'}`);
    const payload = { result, context };
    const known = this._lookupOperation(opId, payload);
    if (known) return known;

    const before = clone(this.readState());
    const prepared = this.prepareDraft(before, result, context);
    if (!prepared.ok || prepared.idempotent) return prepared;

    try {
      const committed = await this.commitState(clone(prepared.draft));
      if (committed === false) throw new Error('stateCommitRejected');
      this.onEvent('battleResultApplied', { result: clone(result), context: clone(context) });
      const checkpoint = await this.createCheckpoint({
        checkpointId: context.checkpointId || `checkpoint.${result.battleId}.resolved`,
        result: clone(result)
      });
      if (checkpoint?.ok === false) throw new Error(checkpoint.errors?.[0]?.message || 'checkpointRejected');
    } catch (error) {
      await this.restoreState(before);
      this.onEvent('battleResultRolledBack', { resultId: result?.resultId, reason: String(error?.message || error) });
      return { ok: false, code: 'settlementRolledBack', message: String(error?.message || error) };
    }

    const settled = { ok: true, resultId: result.resultId, state: clone(prepared.draft) };
    this._rememberOperation(opId, payload, settled);
    return settled;
  }

  serialize() {
    return {
      schemaVersion: 1,
      operations: [...this._operations.entries()].map(([id, entry]) => ({ id, ...clone(entry) }))
    };
  }

  deserialize(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.operations)) {
      return { ok: false, code: 'invalidSnapshot' };
    }
    const next = new Map();
    for (const entry of snapshot.operations) {
      if (!entry?.id || typeof entry.fingerprint !== 'string' || !entry.result) {
        return { ok: false, code: 'invalidOperation' };
      }
      next.set(entry.id, { fingerprint: entry.fingerprint, result: clone(entry.result) });
    }
    this._operations = next;
    return { ok: true };
  }

  _validateInput(state, result) {
    if (!state || !Array.isArray(state.cityStates) || !Array.isArray(state.resourceNodes)) {
      return { ok: false, code: 'invalidRuntimeState' };
    }
    const loaded = this.validator?.loadCandidate
      ? this.validator.loadCandidate(result, 'battleResult', null)
      : { committed: result && typeof result.resultId === 'string', value: result, errors: [] };
    if (!loaded.committed) return { ok: false, code: 'invalidBattleResult', errors: loaded.errors || [] };

    const cityIds = new Set(state.cityStates.map(city => city.id));
    const requiredCities = [
      result.affectedCityId,
      result.resourceTransfer?.fromCityId,
      result.resourceTransfer?.toCityId
    ];
    const missing = requiredCities.find(cityId => !cityIds.has(cityId));
    if (missing) return { ok: false, code: 'cityMissing', path: `cityStates.${missing}` };
    return { ok: true };
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

export default CityWarSystem;
