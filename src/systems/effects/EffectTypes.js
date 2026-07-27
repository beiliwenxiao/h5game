/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * EffectTypes.js
 * 统一效果协议：类型、操作、规范化与旧字段兼容映射。
 *
 * 所有成长来源（技能树、职业天赋、兵种天赋、天赋盘、装备、状态效果、职业修正）
 * 都必须产出本文件定义的标准效果，由 EffectResolver 统一结算。
 */

/** 效果类型 */
export const EffectType = {
  ATTRIBUTE_MODIFY: 'attribute.modify',
  COMBAT_MODIFY: 'combat.modify',
  SKILL_UNLOCK: 'skill.unlock',
  SKILL_MODIFY: 'skill.modify',
  STATUS_GRANT: 'status.grant',
  GATHER_MODIFY: 'gather.modify',
  CONSTRUCTION_UNLOCK: 'construction.unlock',
  INVENTORY_MODIFY: 'inventory.modify',
  VEHICLE_MODIFY: 'vehicle.modify',
  RULE_OVERRIDE: 'rule.override'
};

/**
 * 效果操作
 * 结算顺序：add → addPercent → multiply → override → clamp
 */
export const EffectOperation = {
  ADD: 'add',
  ADD_PERCENT: 'addPercent',
  MULTIPLY: 'multiply',
  OVERRIDE: 'override',
  CLAMP_MIN: 'clampMin',
  CLAMP_MAX: 'clampMax'
};

/** 数值型效果类型（参与 ModifierStack 结算） */
const NUMERIC_TYPES = new Set([
  EffectType.ATTRIBUTE_MODIFY,
  EffectType.COMBAT_MODIFY,
  EffectType.SKILL_MODIFY,
  EffectType.GATHER_MODIFY,
  EffectType.INVENTORY_MODIFY,
  EffectType.VEHICLE_MODIFY
]);

/** 标记型效果类型（不参与数值结算，按标记查询） */
const FLAG_TYPES = new Set([
  EffectType.SKILL_UNLOCK,
  EffectType.STATUS_GRANT,
  EffectType.CONSTRUCTION_UNLOCK,
  EffectType.RULE_OVERRIDE
]);

/**
 * 判断效果类型是否参与数值结算
 * @param {string} type
 * @returns {boolean}
 */
export function isNumericEffectType(type) {
  return NUMERIC_TYPES.has(type);
}

/**
 * 判断效果类型是否为标记型
 * @param {string} type
 * @returns {boolean}
 */
export function isFlagEffectType(type) {
  return FLAG_TYPES.has(type);
}

/**
 * 旧字段兼容映射：现有 SkillTreeSystem / TalentSystem / AttributeSystem / ClassSystem
 * 使用的自由键值效果，映射为标准效果描述。
 * value 语义：
 *   add        直接相加
 *   addPercent 视为百分比增量（0.1 = +10%）
 *   multiply   视为倍率因子（1.4 = 原值 ×1.4）
 */
export const LEGACY_FIELD_MAP = {
  // 属性
  attackBonus: { type: EffectType.ATTRIBUTE_MODIFY, target: 'attack', operation: EffectOperation.ADD },
  magicAttackBonus: { type: EffectType.ATTRIBUTE_MODIFY, target: 'magicAttack', operation: EffectOperation.ADD },
  defenseBonus: { type: EffectType.ATTRIBUTE_MODIFY, target: 'defense', operation: EffectOperation.ADD },
  maxHpBonus: { type: EffectType.ATTRIBUTE_MODIFY, target: 'maxHp', operation: EffectOperation.ADD },
  maxManaBonus: { type: EffectType.ATTRIBUTE_MODIFY, target: 'maxMp', operation: EffectOperation.ADD },
  speedBonus: { type: EffectType.ATTRIBUTE_MODIFY, target: 'speed', operation: EffectOperation.ADD },
  hpRegenBonus: { type: EffectType.ATTRIBUTE_MODIFY, target: 'hpRegen', operation: EffectOperation.ADD },
  manaRegenBonus: { type: EffectType.ATTRIBUTE_MODIFY, target: 'manaRegen', operation: EffectOperation.ADD },
  carryCapacityBonus: { type: EffectType.INVENTORY_MODIFY, target: 'carryCapacity', operation: EffectOperation.ADD },

  // 战斗
  criticalChance: { type: EffectType.COMBAT_MODIFY, target: 'criticalChance', operation: EffectOperation.ADD },
  criticalDamage: { type: EffectType.COMBAT_MODIFY, target: 'criticalDamage', operation: EffectOperation.ADD },
  dodgeChance: { type: EffectType.COMBAT_MODIFY, target: 'dodgeChance', operation: EffectOperation.ADD },
  damageReduction: { type: EffectType.COMBAT_MODIFY, target: 'damageReduction', operation: EffectOperation.ADD },
  attackSpeedBonus: { type: EffectType.COMBAT_MODIFY, target: 'attackSpeed', operation: EffectOperation.ADD_PERCENT },
  rangeBonus: { type: EffectType.COMBAT_MODIFY, target: 'attackRange', operation: EffectOperation.ADD },
  spellPenetration: { type: EffectType.COMBAT_MODIFY, target: 'spellPenetration', operation: EffectOperation.ADD },
  statusResistance: { type: EffectType.COMBAT_MODIFY, target: 'statusResistance', operation: EffectOperation.ADD },

  // 倍率型
  attackMultiplier: { type: EffectType.ATTRIBUTE_MODIFY, target: 'attack', operation: EffectOperation.MULTIPLY },
  healthMultiplier: { type: EffectType.ATTRIBUTE_MODIFY, target: 'maxHp', operation: EffectOperation.MULTIPLY },
  defenseMultiplier: { type: EffectType.ATTRIBUTE_MODIFY, target: 'defense', operation: EffectOperation.MULTIPLY },
  speedMultiplier: { type: EffectType.ATTRIBUTE_MODIFY, target: 'speed', operation: EffectOperation.MULTIPLY },
  weaponDamageMultiplier: { type: EffectType.COMBAT_MODIFY, target: 'weaponDamage', operation: EffectOperation.MULTIPLY },
  spellDamageMultiplier: { type: EffectType.COMBAT_MODIFY, target: 'spellDamage', operation: EffectOperation.MULTIPLY }
};

/**
 * 规范化单个效果，补齐默认字段
 * @param {Object} effect - 原始效果
 * @param {Object} [meta] - 来源信息 { sourceId, sourceKind }
 * @returns {Object|null} 规范化效果，非法时返回 null
 */
export function normalizeEffect(effect, meta = {}) {
  if (!effect || typeof effect !== 'object') return null;
  if (typeof effect.type !== 'string' || effect.type === '') return null;
  if (typeof effect.target !== 'string' || effect.target === '') return null;

  const numeric = isNumericEffectType(effect.type);
  const operation = effect.operation || (numeric ? EffectOperation.ADD : EffectOperation.OVERRIDE);

  if (numeric && !Object.values(EffectOperation).includes(operation)) return null;
  if (numeric && typeof effect.value !== 'number') return null;
  if (numeric && !Number.isFinite(effect.value)) return null;

  return {
    type: effect.type,
    target: effect.target,
    operation,
    value: effect.value,
    sourceId: effect.sourceId || meta.sourceId || 'unknown',
    sourceKind: effect.sourceKind || meta.sourceKind || 'unknown',
    condition: effect.condition || null,
    duration: effect.duration === undefined ? null : effect.duration,
    stackGroup: effect.stackGroup || null,
    priority: typeof effect.priority === 'number' ? effect.priority : 0
  };
}

/**
 * 批量规范化效果列表，忽略非法项
 * @param {Array<Object>} effects
 * @param {Object} [meta]
 * @returns {Array<Object>}
 */
export function normalizeEffects(effects, meta = {}) {
  if (!Array.isArray(effects)) return [];
  const result = [];
  for (const e of effects) {
    const n = normalizeEffect(e, meta);
    if (n) result.push(n);
  }
  return result;
}

/**
 * 将旧版自由键值效果对象转换为标准效果列表。
 * 未在 LEGACY_FIELD_MAP 中登记的键不会被丢弃，而是产出 `legacy.raw` 效果，
 * 供调用方通过 EffectResolver.getRawLegacy 读取，避免静默丢失数据。
 *
 * @param {Object} legacyEffects - 形如 { attackBonus: 5, defenseMultiplier: 0.1 }
 * @param {Object} [meta] - { sourceId, sourceKind }
 * @returns {{effects: Array<Object>, unmapped: Object}}
 */
export function fromLegacyEffects(legacyEffects, meta = {}) {
  const effects = [];
  const unmapped = {};
  if (!legacyEffects || typeof legacyEffects !== 'object') {
    return { effects, unmapped };
  }

  for (const [key, value] of Object.entries(legacyEffects)) {
    const mapping = LEGACY_FIELD_MAP[key];
    if (!mapping) {
      unmapped[key] = value;
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      unmapped[key] = value;
      continue;
    }
    const normalized = normalizeEffect({
      type: mapping.type,
      target: mapping.target,
      operation: mapping.operation,
      value
    }, meta);
    if (normalized) effects.push(normalized);
  }

  return { effects, unmapped };
}

/**
 * 构造标准效果的便捷方法
 * @param {string} type
 * @param {string} target
 * @param {string} operation
 * @param {number} value
 * @param {Object} [extra]
 * @returns {Object|null}
 */
export function createEffect(type, target, operation, value, extra = {}) {
  return normalizeEffect({ type, target, operation, value, ...extra });
}
