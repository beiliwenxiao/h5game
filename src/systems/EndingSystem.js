/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * YiJian18-Engine - deterministic, atomic ending resolution
 ************************************************************/

export const EndingId = Object.freeze({
  SCORCHED_EARTH: 'scorched-earth',
  OBSERVER: 'observer',
  SPARK: 'spark',
  EMBER: 'ember',
  METEOR: 'meteor',
  DUST: 'dust'
});

const SNAPSHOT_SCHEMA_VERSION = 1;
const PRIORITY_KEYS = Object.freeze([
  'SCORCHED_EARTH',
  'OBSERVER',
  'SPARK',
  'EMBER',
  'METEOR',
  'DUST'
]);

const isRecord = value => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const failure = (code, path, details = {}) => ({ ok: false, code, path, ...details });

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeJson(value, path = 'input', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value: Object.is(value, -0) ? 0 : value }
      : failure('nonFiniteNumber', path);
  }
  if (typeof value !== 'object') return failure('nonSerializableValue', path);
  if (seen.has(value)) return failure('circularReference', path);
  seen.add(value);

  if (Array.isArray(value)) {
    const output = [];
    for (let index = 0; index < value.length; index++) {
      if (!(index in value)) {
        seen.delete(value);
        return failure('nonSerializableValue', `${path}.${index}`);
      }
      const normalized = normalizeJson(value[index], `${path}.${index}`, seen);
      if (!normalized.ok) {
        seen.delete(value);
        return normalized;
      }
      output.push(normalized.value);
    }
    seen.delete(value);
    return { ok: true, value: output };
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(value);
    return failure('nonPlainObject', path);
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    const normalized = normalizeJson(value[key], `${path}.${key}`, seen);
    if (!normalized.ok) {
      seen.delete(value);
      return normalized;
    }
    output[key] = normalized.value;
  }
  seen.delete(value);
  return { ok: true, value: output };
}

function hashCanonical(value) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function validateNonNegativeInteger(value, path) {
  return Number.isInteger(value) && value >= 0
    ? { ok: true }
    : failure('invalidNonNegativeInteger', path, { actual: value });
}

function validateRatio(value, path) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? { ok: true }
    : failure('invalidRatio', path, { expected: '[0,1]', actual: value });
}

function validateHeroGroup(group, path, ids) {
  if (!Array.isArray(group)) return failure('missingField', path);
  if (group.length !== 2) return failure('invalidHeroCount', path, { expected: 2, actual: group.length });
  for (let index = 0; index < group.length; index++) {
    const heroPath = `${path}.${index}`;
    const hero = group[index];
    if (!isRecord(hero)) return failure('invalidObject', heroPath);
    if (typeof hero.id !== 'string' || hero.id.trim() === '') return failure('invalidStableId', `${heroPath}.id`);
    if (ids.has(hero.id)) return failure('duplicateHeroId', `${heroPath}.id`, { actual: hero.id });
    if (typeof hero.alive !== 'boolean') return failure('invalidBoolean', `${heroPath}.alive`);
    ids.add(hero.id);
  }
  return { ok: true };
}

/**
 * Resolves one ending from a JSON-safe input projection. Runtime ownership,
 * event delivery and checkpoint persistence are provided by dependency injection.
 */
export class EndingSystem {
  constructor(config = {}) {
    this.readState = config.readState || null;
    this.commitState = config.commitState || null;
    this.restoreState = config.restoreState || null;
    this.projectInput = config.projectInput || (state => state?.endingInput);
    this.emit = config.emit || config.onEvent || (() => {});
    this.checkpoint = config.checkpoint || config.createCheckpoint || null;
    this.endingIds = Object.freeze({ ...EndingId, ...(config.endingIds || {}) });
    this.scorchedDamageThreshold = Number.isFinite(config.scorchedDamageThreshold)
      ? Math.min(1, Math.max(0, config.scorchedDamageThreshold))
      : 0.8;
    this.maxOperations = Math.max(16, Number(config.maxOperations) || 256);
    this.maxSnapshots = Math.max(16, Number(config.maxSnapshots) || 256);
    this._operations = new Map();
    this._snapshots = new Map();
    this.busy = false;
  }

  /** Validate and canonicalize the complete ending input without changing runtime state. */
  freezeEndingInput(input) {
    const validation = this.validateInput(input);
    if (!validation.ok) return validation;
    const normalized = normalizeJson(input);
    if (!normalized.ok) return normalized;
    const canonicalInput = JSON.stringify(normalized.value);
    const endingSnapshotId = `ending.v${SNAPSHOT_SCHEMA_VERSION}.${hashCanonical(canonicalInput)}`;
    return {
      ok: true,
      endingSnapshotId,
      canonicalInput,
      frozenInput: deepFreeze(normalized.value)
    };
  }

  /** Pure preview. It neither writes state nor emits/checkpoints. */
  selectEnding(input) {
    const frozen = this.freezeEndingInput(input);
    if (!frozen.ok) return frozen;
    const selected = this._selectFrozen(frozen.frozenInput);
    if (!selected.ok) return selected;
    return {
      ok: true,
      endingId: selected.endingId,
      endingSnapshotId: frozen.endingSnapshotId,
      snapshot: this._createSnapshot(frozen, selected)
    };
  }

  validateInput(input) {
    if (!isRecord(input)) return failure('invalidObject', 'input');
    for (const key of ['storyState', 'cityState', 'warState', 'heroStates', 'battleModeStats', 'hiddenInputs']) {
      if (!isRecord(input[key])) return failure('missingField', `input.${key}`);
    }
    if (typeof input.retreatReadiness !== 'boolean') {
      return failure('invalidBoolean', 'input.retreatReadiness');
    }

    const damage = validateRatio(input.cityState.coreDamageRatio, 'input.cityState.coreDamageRatio');
    if (!damage.ok) return damage;

    const ids = new Set();
    const primary = validateHeroGroup(input.heroStates.primary, 'input.heroStates.primary', ids);
    if (!primary.ok) return primary;
    const support = validateHeroGroup(input.heroStates.support, 'input.heroStates.support', ids);
    if (!support.ok) return support;

    const stats = input.battleModeStats;
    for (const key of ['optionalBattles', 'observed', 'intervened']) {
      const checked = validateNonNegativeInteger(stats[key], `input.battleModeStats.${key}`);
      if (!checked.ok) return checked;
    }
    if (stats.observed + stats.intervened !== stats.optionalBattles) {
      return failure('incompleteBattleModeStats', 'input.battleModeStats', {
        expected: stats.optionalBattles,
        actual: stats.observed + stats.intervened
      });
    }

    const hidden = input.hiddenInputs;
    const gathered = validateNonNegativeInteger(hidden.totalGathered, 'input.hiddenInputs.totalGathered');
    if (!gathered.ok) return gathered;
    if (typeof hidden.cityMaintenanceLevel !== 'number'
      || !Number.isFinite(hidden.cityMaintenanceLevel)
      || hidden.cityMaintenanceLevel < 0) {
      return failure('invalidNonNegativeNumber', 'input.hiddenInputs.cityMaintenanceLevel', {
        actual: hidden.cityMaintenanceLevel
      });
    }
    const constructionScore = validateNonNegativeInteger(
      hidden.resourceConstructionScore,
      'input.hiddenInputs.resourceConstructionScore'
    );
    if (!constructionScore.ok) return constructionScore;
    for (const key of ['allOptionalBattlesObserved', 'cityDamageNeglected', 'scorchedEarthChosen']) {
      if (typeof hidden[key] !== 'boolean') return failure('invalidBoolean', `input.hiddenInputs.${key}`);
    }
    const allObserved = stats.optionalBattles > 0 && stats.observed === stats.optionalBattles;
    if (hidden.allOptionalBattlesObserved !== allObserved) {
      return failure('inconsistentDerivedField', 'input.hiddenInputs.allOptionalBattlesObserved', {
        expected: allObserved,
        actual: hidden.allOptionalBattlesObserved
      });
    }

    return { ok: true };
  }

  /**
   * Atomic command: validate -> prepare draft -> commit -> emit -> checkpoint.
   * @param {{input?: Object, operationId?: string, checkpointId?: string}} command
   */
  async resolveEnding(command = {}) {
    if (this.busy) return failure('endingBusy', 'operation');
    const dependencyError = this._validateDependencies();
    if (dependencyError) return dependencyError;

    let before;
    try {
      before = clone(await this.readState());
    } catch (error) {
      return failure('stateReadFailed', 'dependencies.readState', { message: String(error?.message || error) });
    }
    if (!isRecord(before)) return failure('invalidRuntimeState', 'runtimeState');
    if (!isRecord(before.storyState)) return failure('missingField', 'runtimeState.storyState');

    let projectedInput;
    try {
      projectedInput = command.input === undefined ? this.projectInput(clone(before)) : command.input;
    } catch (error) {
      return failure('inputProjectionFailed', 'dependencies.projectInput', { message: String(error?.message || error) });
    }
    const frozen = this.freezeEndingInput(projectedInput);
    if (!frozen.ok) return frozen;

    const checkpointId = String(command.checkpointId || `checkpoint.${frozen.endingSnapshotId}`);
    const operationId = String(command.operationId || `resolve:${frozen.endingSnapshotId}`);
    const operationPayload = { endingSnapshotId: frozen.endingSnapshotId, checkpointId };
    const knownOperation = this._lookupOperation(operationId, operationPayload);
    if (knownOperation) return knownOperation;

    const existing = this._readExistingEnding(before.storyState, frozen.endingSnapshotId);
    if (existing) return existing;
    const knownSnapshot = this._lookupSnapshot(frozen);
    if (knownSnapshot) return knownSnapshot;

    const selected = this._selectFrozen(frozen.frozenInput);
    if (!selected.ok) return selected;
    const snapshot = this._createSnapshot(frozen, selected);
    const draft = clone(before);
    draft.storyState.endingId = selected.endingId;
    draft.storyState.endingSnapshotId = frozen.endingSnapshotId;
    draft.storyState.endingSnapshot = clone(snapshot);

    this.busy = true;
    try {
      try {
        const committed = await this.commitState(clone(draft));
        if (committed === false) throw new Error('stateCommitRejected');
        const emitted = await this.emit('endingResolved', clone(snapshot));
        if (emitted === false) throw new Error('endingEventRejected');
        const checkpoint = await this.checkpoint({
          checkpointId,
          operationId,
          endingId: selected.endingId,
          endingSnapshotId: frozen.endingSnapshotId,
          snapshot: clone(snapshot)
        });
        if (checkpoint?.ok === false) throw new Error(checkpoint.message || 'checkpointRejected');
      } catch (error) {
        return await this._rollback(before, frozen.endingSnapshotId, error);
      }

      const result = {
        ok: true,
        endingId: selected.endingId,
        endingSnapshotId: frozen.endingSnapshotId,
        snapshot: clone(snapshot)
      };
      this._rememberSnapshot(frozen, result);
      this._rememberOperation(operationId, operationPayload, result);
      return result;
    } finally {
      this.busy = false;
    }
  }

  serialize() {
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      operations: [...this._operations.entries()].map(([id, entry]) => ({ id, ...clone(entry) })),
      snapshots: [...this._snapshots.entries()].map(([id, entry]) => ({ id, ...clone(entry) }))
    };
  }

  /** Validate the full ledger before replacing either current map. */
  deserialize(snapshot) {
    if (!isRecord(snapshot)) return failure('invalidObject', 'snapshot');
    if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      return failure('unsupportedSchemaVersion', 'snapshot.schemaVersion', {
        expected: SNAPSHOT_SCHEMA_VERSION,
        actual: snapshot.schemaVersion
      });
    }
    if (!Array.isArray(snapshot.operations)) return failure('missingField', 'snapshot.operations');
    if (!Array.isArray(snapshot.snapshots)) return failure('missingField', 'snapshot.snapshots');
    if (snapshot.operations.length > this.maxOperations) {
      return failure('operationLimitExceeded', 'snapshot.operations', { expected: this.maxOperations });
    }
    if (snapshot.snapshots.length > this.maxSnapshots) {
      return failure('snapshotLimitExceeded', 'snapshot.snapshots', { expected: this.maxSnapshots });
    }

    const nextOperations = new Map();
    for (let index = 0; index < snapshot.operations.length; index++) {
      const path = `snapshot.operations.${index}`;
      const entry = snapshot.operations[index];
      if (!isRecord(entry)) return failure('invalidObject', path);
      if (typeof entry.id !== 'string' || entry.id === '') return failure('invalidStableId', `${path}.id`);
      if (nextOperations.has(entry.id)) return failure('duplicateOperationId', `${path}.id`);
      if (typeof entry.fingerprint !== 'string') return failure('invalidFingerprint', `${path}.fingerprint`);
      const resultCheck = this._validateStoredResult(entry.result, `${path}.result`);
      if (!resultCheck.ok) return resultCheck;
      nextOperations.set(entry.id, { fingerprint: entry.fingerprint, result: clone(entry.result) });
    }

    const nextSnapshots = new Map();
    for (let index = 0; index < snapshot.snapshots.length; index++) {
      const path = `snapshot.snapshots.${index}`;
      const entry = snapshot.snapshots[index];
      if (!isRecord(entry)) return failure('invalidObject', path);
      if (typeof entry.id !== 'string' || entry.id === '') return failure('invalidStableId', `${path}.id`);
      if (nextSnapshots.has(entry.id)) return failure('duplicateEndingSnapshotId', `${path}.id`);
      if (typeof entry.canonicalInput !== 'string') return failure('invalidCanonicalInput', `${path}.canonicalInput`);

      let parsed;
      try {
        parsed = JSON.parse(entry.canonicalInput);
      } catch (error) {
        return failure('invalidCanonicalInput', `${path}.canonicalInput`, { message: String(error?.message || error) });
      }
      const normalized = normalizeJson(parsed);
      if (!normalized.ok || JSON.stringify(normalized.value) !== entry.canonicalInput) {
        return failure('nonCanonicalInput', `${path}.canonicalInput`);
      }
      const expectedId = `ending.v${SNAPSHOT_SCHEMA_VERSION}.${hashCanonical(entry.canonicalInput)}`;
      if (entry.id !== expectedId) {
        return failure('snapshotIdMismatch', `${path}.id`, { expected: expectedId, actual: entry.id });
      }
      const inputCheck = this.validateInput(parsed);
      if (!inputCheck.ok) return { ...inputCheck, path: `${path}.canonicalInput.${inputCheck.path}` };
      const resultCheck = this._validateStoredResult(entry.result, `${path}.result`, entry.id, entry.canonicalInput);
      if (!resultCheck.ok) return resultCheck;
      nextSnapshots.set(entry.id, { canonicalInput: entry.canonicalInput, result: clone(entry.result) });
    }

    this._operations = nextOperations;
    this._snapshots = nextSnapshots;
    return { ok: true };
  }

  _selectFrozen(input) {
    const primaryAlive = input.heroStates.primary.filter(hero => hero.alive).length;
    const supportAlive = input.heroStates.support.filter(hero => hero.alive).length;
    const stats = input.battleModeStats;
    const hidden = input.hiddenInputs;

    const conditions = {
      scorchedEarth: {
        matched: hidden.scorchedEarthChosen
          && input.cityState.coreDamageRatio >= this.scorchedDamageThreshold
          && hidden.resourceConstructionScore >= 3,
        explicitChoice: hidden.scorchedEarthChosen,
        coreDamageRatio: input.cityState.coreDamageRatio,
        threshold: this.scorchedDamageThreshold,
        cityDamageNeglected: hidden.cityDamageNeglected,
        resourceConstructionScore: hidden.resourceConstructionScore,
        requiredResourceConstructionScore: 3
      },
      observer: {
        matched: hidden.allOptionalBattlesObserved,
        optionalBattles: stats.optionalBattles,
        observed: stats.observed
      },
      spark: {
        matched: primaryAlive === 2 && input.retreatReadiness,
        primaryAlive,
        retreatReadiness: input.retreatReadiness
      },
      ember: {
        matched: primaryAlive === 1 || (primaryAlive === 2 && !input.retreatReadiness),
        primaryAlive,
        retreatReadiness: input.retreatReadiness
      },
      meteor: {
        matched: primaryAlive === 0 && supportAlive >= 1,
        primaryAlive,
        supportAlive
      },
      dust: {
        matched: true,
        primaryAlive,
        supportAlive,
        intervened: stats.intervened,
        fallback: true
      }
    };

    const ordered = [
      ['SCORCHED_EARTH', conditions.scorchedEarth],
      ['OBSERVER', conditions.observer],
      ['SPARK', conditions.spark],
      ['EMBER', conditions.ember],
      ['METEOR', conditions.meteor],
      ['DUST', conditions.dust]
    ];
    const first = ordered.find(([, condition]) => condition.matched);
    if (!first) return failure('endingNotMatched', 'input');
    return {
      ok: true,
      endingId: this.endingIds[first[0]],
      conditions,
      priority: PRIORITY_KEYS.map(key => this.endingIds[key])
    };
  }

  _createSnapshot(frozen, selected) {
    return deepFreeze({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      endingSnapshotId: frozen.endingSnapshotId,
      endingId: selected.endingId,
      priority: clone(selected.priority),
      conditions: clone(selected.conditions),
      input: clone(frozen.frozenInput)
    });
  }

  _validateDependencies() {
    for (const key of ['readState', 'commitState', 'restoreState', 'projectInput', 'emit', 'checkpoint']) {
      if (typeof this[key] !== 'function') return failure('dependencyMissing', `dependencies.${key}`);
    }
    const ids = PRIORITY_KEYS.map(key => this.endingIds[key]);
    if (ids.some(id => typeof id !== 'string' || id === '')) {
      return failure('invalidEndingId', 'dependencies.endingIds');
    }
    if (new Set(ids).size !== ids.length) return failure('duplicateEndingId', 'dependencies.endingIds');
    return null;
  }

  _readExistingEnding(storyState, endingSnapshotId) {
    const existingId = storyState.endingId;
    const existingSnapshotId = storyState.endingSnapshotId;
    if (!existingId && !existingSnapshotId) return null;
    if (existingId && existingSnapshotId === endingSnapshotId) {
      return {
        ok: true,
        idempotent: true,
        endingId: existingId,
        endingSnapshotId: existingSnapshotId,
        snapshot: clone(storyState.endingSnapshot || null)
      };
    }
    return failure('endingAlreadyResolved', existingSnapshotId
      ? 'runtimeState.storyState.endingSnapshotId'
      : 'runtimeState.storyState.endingId', {
      endingId: existingId || null,
      endingSnapshotId: existingSnapshotId || null
    });
  }

  _lookupOperation(operationId, payload) {
    const known = this._operations.get(operationId);
    if (!known) return null;
    const fingerprint = JSON.stringify(payload);
    if (known.fingerprint !== fingerprint) {
      return failure('operationConflict', 'operationId', { actual: operationId });
    }
    return { ...clone(known.result), idempotent: true };
  }

  _rememberOperation(operationId, payload, result) {
    this._operations.set(operationId, {
      fingerprint: JSON.stringify(payload),
      result: clone(result)
    });
    while (this._operations.size > this.maxOperations) {
      this._operations.delete(this._operations.keys().next().value);
    }
  }

  _lookupSnapshot(frozen) {
    const known = this._snapshots.get(frozen.endingSnapshotId);
    if (!known) return null;
    if (known.canonicalInput !== frozen.canonicalInput) {
      return failure('endingSnapshotConflict', 'endingSnapshotId', {
        actual: frozen.endingSnapshotId
      });
    }
    return { ...clone(known.result), idempotent: true };
  }

  _rememberSnapshot(frozen, result) {
    this._snapshots.set(frozen.endingSnapshotId, {
      canonicalInput: frozen.canonicalInput,
      result: clone(result)
    });
    while (this._snapshots.size > this.maxSnapshots) {
      this._snapshots.delete(this._snapshots.keys().next().value);
    }
  }

  _validateStoredResult(result, path, expectedSnapshotId = null, canonicalInput = null) {
    if (!isRecord(result) || result.ok !== true) return failure('invalidStoredResult', path);
    if (typeof result.endingSnapshotId !== 'string' || result.endingSnapshotId === '') {
      return failure('invalidStableId', `${path}.endingSnapshotId`);
    }
    if (expectedSnapshotId && result.endingSnapshotId !== expectedSnapshotId) {
      return failure('snapshotIdMismatch', `${path}.endingSnapshotId`, {
        expected: expectedSnapshotId,
        actual: result.endingSnapshotId
      });
    }
    if (!Object.values(this.endingIds).includes(result.endingId)) {
      return failure('invalidEndingId', `${path}.endingId`, { actual: result.endingId });
    }
    if (!isRecord(result.snapshot)) return failure('invalidObject', `${path}.snapshot`);
    if (result.snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      return failure('unsupportedSchemaVersion', `${path}.snapshot.schemaVersion`, {
        expected: SNAPSHOT_SCHEMA_VERSION,
        actual: result.snapshot.schemaVersion
      });
    }
    if (result.snapshot.endingSnapshotId !== result.endingSnapshotId) {
      return failure('snapshotIdMismatch', `${path}.snapshot.endingSnapshotId`);
    }
    if (result.snapshot.endingId !== result.endingId) {
      return failure('endingIdMismatch', `${path}.snapshot.endingId`);
    }
    const priority = PRIORITY_KEYS.map(key => this.endingIds[key]);
    if (!Array.isArray(result.snapshot.priority)
      || JSON.stringify(result.snapshot.priority) !== JSON.stringify(priority)) {
      return failure('invalidEndingPriority', `${path}.snapshot.priority`);
    }
    if (!isRecord(result.snapshot.conditions)) {
      return failure('invalidObject', `${path}.snapshot.conditions`);
    }
    const inputCheck = this.validateInput(result.snapshot.input);
    if (!inputCheck.ok) return { ...inputCheck, path: `${path}.snapshot.${inputCheck.path}` };
    if (canonicalInput) {
      const normalized = normalizeJson(result.snapshot.input);
      if (!normalized.ok || JSON.stringify(normalized.value) !== canonicalInput) {
        return failure('snapshotInputMismatch', `${path}.snapshot.input`);
      }
    }
    return { ok: true };
  }

  async _rollback(before, endingSnapshotId, error) {
    let rollbackError = null;
    try {
      const restored = await this.restoreState(clone(before));
      if (restored === false) throw new Error('stateRestoreRejected');
    } catch (restoreError) {
      rollbackError = String(restoreError?.message || restoreError);
    }
    try {
      await this.emit('endingResolutionRolledBack', {
        endingSnapshotId,
        reason: String(error?.message || error),
        rollbackError
      });
    } catch (_) {
      // A rollback notification must never hide the transaction result.
    }
    return {
      ok: false,
      code: rollbackError ? 'endingRollbackFailed' : 'endingResolutionRolledBack',
      path: rollbackError ? 'dependencies.restoreState' : 'operation',
      message: String(error?.message || error),
      ...(rollbackError ? { rollbackError } : {})
    };
  }
}

export default EndingSystem;
