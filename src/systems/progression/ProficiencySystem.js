/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * YiJian18-Engine - 通用熟练度状态系统
 ************************************************************/

const SCHEMA_VERSION = 1;
const DEFAULT_OPERATION_LIMIT = 256;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeError(code, path, message) {
  return { code, path, message };
}

/**
 * 独立于成长点池的熟练度系统。
 * 所有写入遵循 validate → draft → commit → emit，operationId 提供有界幂等。
 */
export class ProficiencySystem {
  constructor(config = {}) {
    if (config.schemaVersion !== undefined && Number(config.schemaVersion) !== SCHEMA_VERSION) {
      throw new TypeError(`ProficiencySystem only supports schemaVersion ${SCHEMA_VERSION}`);
    }
    if (config.maxCompletedOperations !== undefined
      && (!Number.isInteger(config.maxCompletedOperations) || config.maxCompletedOperations < 1)) {
      throw new TypeError('maxCompletedOperations must be a positive integer');
    }
    this.schemaVersion = SCHEMA_VERSION;
    this.operationLimit = Number.isInteger(config.maxCompletedOperations)
      ? Math.max(1, config.maxCompletedOperations)
      : DEFAULT_OPERATION_LIMIT;
    this.onEvent = typeof config.onEvent === 'function' ? config.onEvent : () => {};
    this.definitions = new Map();
    this.characters = new Map();
    this.completedOperations = new Map();

    const definitionCheck = this._prepareDefinitions(config.types || {});
    if (!definitionCheck.ok) {
      throw new TypeError(definitionCheck.errors.map(error => `${error.path}: ${error.message}`).join('; '));
    }
    this.definitions = definitionCheck.value;
  }

  getDefinition(type) {
    const definition = this.definitions.get(type);
    return definition ? clone(definition) : null;
  }

  getState(characterId, type = null) {
    const states = this.characters.get(String(characterId || '')) || new Map();
    if (type) return this._describeState(type, states.get(type) || this._initialState(type));
    return Object.fromEntries([...this.definitions.keys()].map(key => [
      key, this._describeState(key, states.get(key) || this._initialState(key))
    ]));
  }

  gainExperience({ characterId, type, amount, operationId } = {}) {
    const id = typeof characterId === 'string' ? characterId.trim() : '';
    const proficiencyType = typeof type === 'string' ? type.trim() : '';
    const xp = Number(amount);
    const opId = typeof operationId === 'string' ? operationId.trim() : '';
    if (!id) return { ok: false, code: 'invalidCharacterId' };
    if (!this.definitions.has(proficiencyType)) return { ok: false, code: 'unknownProficiencyType' };
    if (!Number.isFinite(xp) || xp <= 0) return { ok: false, code: 'invalidExperience' };
    if (!opId) return { ok: false, code: 'missingOperationId' };

    const normalizedAmount = Math.floor(xp);
    if (normalizedAmount <= 0) return { ok: false, code: 'invalidExperience' };
    const fingerprint = JSON.stringify([id, proficiencyType, normalizedAmount]);
    const completed = this.completedOperations.get(opId);
    if (completed) {
      return completed.fingerprint === fingerprint
        ? { ...clone(completed.result), idempotent: true }
        : { ok: false, code: 'operationConflict', operationId: opId };
    }

    const definition = this.definitions.get(proficiencyType);
    const current = this.characters.get(id)?.get(proficiencyType) || this._initialState(proficiencyType);
    const maxExperience = definition.thresholds[definition.thresholds.length - 1];
    const nextExperience = Math.min(maxExperience, current.experience + normalizedAmount);
    const nextLevel = this._levelForExperience(definition, nextExperience);
    const draft = { level: nextLevel, experience: nextExperience };
    const result = {
      ok: true,
      characterId: id,
      type: proficiencyType,
      operationId: opId,
      amountRequested: normalizedAmount,
      amountApplied: nextExperience - current.experience,
      previousLevel: current.level,
      level: nextLevel,
      experience: nextExperience,
      leveledUp: nextLevel > current.level,
      idempotent: false
    };

    const states = new Map(this.characters.get(id) || []);
    states.set(proficiencyType, draft);
    this.characters.set(id, states);
    this._rememberOperation(opId, fingerprint, result);
    this._emit('experienceGained', result);
    if (result.leveledUp) this._emit('levelUp', result);
    return clone(result);
  }

  serialize() {
    return {
      schemaVersion: SCHEMA_VERSION,
      characters: [...this.characters.entries()].map(([characterId, states]) => ({
        characterId,
        proficiencies: Object.fromEntries([...states.entries()].map(([type, state]) => [type, { ...state }]))
      })),
      completedOperations: [...this.completedOperations.entries()].map(([operationId, entry]) => ({
        operationId,
        fingerprint: entry.fingerprint,
        result: clone(entry.result)
      }))
    };
  }

  validateSerialized(data = {}) {
    const prepared = this._prepareSerialized(data);
    return { ok: prepared.ok, errors: prepared.errors };
  }

  deserialize(data = {}) {
    const prepared = this._prepareSerialized(data);
    if (!prepared.ok) return { ok: false, errors: prepared.errors };
    this.characters = prepared.characters;
    this.completedOperations = prepared.completedOperations;
    return { ok: true, errors: [] };
  }

  _prepareDefinitions(types) {
    const errors = [];
    const definitions = new Map();
    const entries = Object.entries(types || {});
    if (entries.length === 0) {
      errors.push(makeError('missingDefinitions', 'types', '至少需要一种熟练度定义'));
    }
    for (const [type, raw] of entries) {
      const path = `types.${type}`;
      const thresholds = Array.isArray(raw?.thresholds) ? raw.thresholds.map(Number) : [];
      const validThresholds = thresholds.length > 0
        && thresholds[0] === 0
        && thresholds.every((value, index) => Number.isInteger(value) && value >= 0
          && (index === 0 || value > thresholds[index - 1]));
      if (!type || !validThresholds) {
        errors.push(makeError('invalidThresholds', `${path}.thresholds`, '阈值必须从 0 开始并严格递增'));
        continue;
      }
      const declaredMax = raw?.maxLevel === undefined ? thresholds.length : Number(raw.maxLevel);
      if (!Number.isInteger(declaredMax) || declaredMax !== thresholds.length) {
        errors.push(makeError('invalidMaxLevel', `${path}.maxLevel`, 'maxLevel 必须等于 thresholds 长度'));
        continue;
      }
      const experiencePerUnit = raw?.experiencePerUnit === undefined ? 1 : Number(raw.experiencePerUnit);
      if (!Number.isFinite(experiencePerUnit) || experiencePerUnit <= 0) {
        errors.push(makeError('invalidExperienceRate', `${path}.experiencePerUnit`, '单位经验必须大于 0'));
        continue;
      }
      definitions.set(type, {
        type,
        name: typeof raw.name === 'string' && raw.name ? raw.name : type,
        maxLevel: declaredMax,
        thresholds,
        experiencePerUnit
      });
    }
    return { ok: errors.length === 0, errors, value: definitions };
  }

  _prepareSerialized(data) {
    const errors = [];
    const source = data && typeof data === 'object' ? data : {};
    const version = source.schemaVersion === undefined ? SCHEMA_VERSION : Number(source.schemaVersion);
    if (version !== SCHEMA_VERSION) {
      errors.push(makeError('versionMismatch', 'schemaVersion', `熟练度存档版本必须为 ${SCHEMA_VERSION}`));
    }

    const characters = new Map();
    for (const [index, entry] of (Array.isArray(source.characters) ? source.characters : []).entries()) {
      const path = `characters[${index}]`;
      const characterId = typeof entry?.characterId === 'string' ? entry.characterId.trim() : '';
      if (!characterId || characters.has(characterId)) {
        errors.push(makeError('invalidCharacterId', `${path}.characterId`, '角色 ID 缺失或重复'));
        continue;
      }
      const states = new Map();
      for (const [type, raw] of Object.entries(entry.proficiencies || {})) {
        const definition = this.definitions.get(type);
        const experience = Number(raw?.experience);
        const level = Number(raw?.level);
        if (!definition) {
          errors.push(makeError('unknownProficiencyType', `${path}.proficiencies.${type}`, `未知熟练度类型: ${type}`));
          continue;
        }
        const maxExperience = definition.thresholds[definition.thresholds.length - 1];
        if (!Number.isInteger(experience) || experience < 0 || experience > maxExperience
          || !Number.isInteger(level) || level !== this._levelForExperience(definition, experience)) {
          errors.push(makeError('invalidProficiencyState', `${path}.proficiencies.${type}`, '等级与经验值不一致或越界'));
          continue;
        }
        states.set(type, { level, experience });
      }
      characters.set(characterId, states);
    }

    const completedOperations = new Map();
    const rawOperations = Array.isArray(source.completedOperations) ? source.completedOperations : [];
    for (const [index, entry] of rawOperations.slice(-this.operationLimit).entries()) {
      const operationId = typeof entry?.operationId === 'string' ? entry.operationId.trim() : '';
      if (!operationId || completedOperations.has(operationId) || typeof entry.fingerprint !== 'string'
        || entry.result?.ok !== true) {
        errors.push(makeError('invalidOperationRecord', `completedOperations[${index}]`, '幂等记录缺失、重复或无效'));
        continue;
      }
      completedOperations.set(operationId, {
        fingerprint: entry.fingerprint,
        result: clone(entry.result)
      });
    }
    return { ok: errors.length === 0, errors, characters, completedOperations };
  }

  _initialState(type) {
    return { level: this.definitions.has(type) ? 1 : 0, experience: 0 };
  }

  _levelForExperience(definition, experience) {
    let level = 1;
    for (let index = 1; index < definition.thresholds.length; index++) {
      if (experience < definition.thresholds[index]) break;
      level = index + 1;
    }
    return level;
  }

  _describeState(type, state) {
    const definition = this.definitions.get(type);
    if (!definition) return null;
    const nextThreshold = state.level < definition.maxLevel
      ? definition.thresholds[state.level]
      : null;
    return {
      type,
      name: definition.name,
      level: state.level,
      maxLevel: definition.maxLevel,
      experience: state.experience,
      nextThreshold
    };
  }

  _rememberOperation(operationId, fingerprint, result) {
    this.completedOperations.set(operationId, { fingerprint, result: clone(result) });
    while (this.completedOperations.size > this.operationLimit) {
      this.completedOperations.delete(this.completedOperations.keys().next().value);
    }
  }

  _emit(event, payload) {
    try {
      this.onEvent(event, clone(payload));
    } catch (error) {
      console.warn('ProficiencySystem: 事件监听器执行失败', error);
    }
  }
}

export default ProficiencySystem;
