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
 * SkillDefinition.js
 * 技能定义（只读）。
 *
 * 定义层只描述“技能是什么”，不保存任何角色运行状态：
 *   - 角色是否学会 → 由成长系统（技能树）产出 skill.unlock 效果
 *   - 冷却与施法状态 → 保存在 CombatComponent
 *   - 运行期参数修改 → 由 EffectResolver 的 skill.modify 效果提供
 *
 * 与旧版 combat.skills 中的自由对象兼容：fromLegacy 可把现有技能数据升格为定义。
 */

/** 技能目标方式 */
export const SkillTargeting = {
  SELF: 'self',
  ENTITY: 'entity',
  POSITION: 'position',
  DIRECTION: 'direction',
  AREA: 'area'
};

/** 技能分类 */
export const SkillCategory = {
  ATTACK: 'attack',
  HEAL: 'heal',
  BUFF: 'buff',
  LOCOMOTION: 'locomotion',
  UTILITY: 'utility'
};

/**
 * 技能形态（variant）：同一技能的不同玩法版本。
 * 由 skill.modify 效果的 `skill.<id>.variant` 目标选择，
 * 暗黑式分支中的“形态替换”节点使用此机制。
 */
export const SKILL_VARIANT_TARGET = 'variant';

/** 可被 skill.modify 效果调整的运行期参数白名单 */
export const MODIFIABLE_SKILL_PARAMS = [
  'damage',
  'damageMultiplier',
  'range',
  'radius',
  'cooldown',
  'castTime',
  'manaCost',
  'staminaCost',
  'duration',
  'healAmount',
  'projectileCount'
];

export class SkillDefinition {
  /**
   * @param {Object} config
   * @param {string} config.id - 技能唯一标识
   * @param {string} [config.name] - 显示名
   * @param {string} [config.description] - 说明
   * @param {string} [config.category] - 分类
   * @param {string} [config.targeting] - 目标方式
   * @param {Object} [config.params] - 运行期参数（damage/range/cooldown 等）
   * @param {Object} [config.costs] - 消耗，如 { mp: 20, stamina: 10 }
   * @param {Array<string>} [config.tags] - 标签，如 ['fire','projectile']
   * @param {Object} [config.vfx] - 表现引用，由 CombatSystem 消费
   */
  constructor(config = {}) {
    this.id = config.id;
    this.name = config.name || config.id;
    this.description = config.description || '';
    this.category = config.category || SkillCategory.ATTACK;
    this.targeting = config.targeting || SkillTargeting.ENTITY;

    this.params = { ...(config.params || {}) };
    this.costs = { ...(config.costs || {}) };
    this.tags = Array.isArray(config.tags) ? [...config.tags] : [];
    this.vfx = config.vfx ? { ...config.vfx } : null;

    /**
     * 技能形态表：variantId -> { name?, category?, targeting?, params?, costs?, vfx?, tags? }
     * 未被形态覆盖的字段沿用基础定义。
     */
    this.variants = {};
    for (const [variantId, variant] of Object.entries(config.variants || {})) {
      this.variants[variantId] = {
        name: variant.name || null,
        description: variant.description || null,
        category: variant.category || null,
        targeting: variant.targeting || null,
        params: { ...(variant.params || {}) },
        costs: { ...(variant.costs || {}) },
        vfx: variant.vfx ? { ...variant.vfx } : null,
        tags: Array.isArray(variant.tags) ? [...variant.tags] : []
      };
    }

    // 冷却与施法时间保留在 params 中，便于统一被 skill.modify 修改
    if (config.cooldown !== undefined && this.params.cooldown === undefined) {
      this.params.cooldown = config.cooldown;
    }
    if (config.castTime !== undefined && this.params.castTime === undefined) {
      this.params.castTime = config.castTime;
    }
    if (config.range !== undefined && this.params.range === undefined) {
      this.params.range = config.range;
    }

    Object.freeze(this.tags);
  }

  /** 是否为位移类技能（轻功、跳跃等） */
  isLocomotion() {
    return this.category === SkillCategory.LOCOMOTION;
  }

  /** 是否存在指定形态 */
  hasVariant(variantId) {
    return !!(variantId && this.variants[variantId]);
  }

  /**
   * 解析形态后的定义视图（只读快照）。
   * 形态只覆盖显式声明的字段，其余沿用基础定义。
   *
   * @param {string|null} variantId
   * @returns {{id: string, name: string, category: string, targeting: string, params: Object, costs: Object, vfx: Object|null, tags: Array<string>, variantId: string|null}}
   */
  resolveVariant(variantId = null) {
    const base = {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      targeting: this.targeting,
      params: { ...this.params },
      costs: { ...this.costs },
      vfx: this.vfx ? { ...this.vfx } : null,
      tags: [...this.tags],
      variantId: null
    };

    const variant = variantId ? this.variants[variantId] : null;
    if (!variant) return base;

    return {
      ...base,
      name: variant.name || base.name,
      description: variant.description || base.description,
      category: variant.category || base.category,
      targeting: variant.targeting || base.targeting,
      params: { ...base.params, ...variant.params },
      costs: { ...base.costs, ...variant.costs },
      vfx: variant.vfx ? { ...base.vfx, ...variant.vfx } : base.vfx,
      tags: Array.from(new Set([...base.tags, ...variant.tags])),
      variantId
    };
  }

  /**
   * 校验定义合法性
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  validate() {
    const errors = [];
    if (!this.id || typeof this.id !== 'string') {
      errors.push({ code: 'missingField', path: 'id', message: '技能必须包含字符串 id' });
    }
    if (!Object.values(SkillTargeting).includes(this.targeting)) {
      errors.push({
        code: 'outOfRange',
        path: 'targeting',
        message: `targeting 必须是 ${Object.values(SkillTargeting).join('/')} 之一`,
        actual: this.targeting
      });
    }
    for (const [key, value] of Object.entries(this.params)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (value < 0) {
        errors.push({ code: 'outOfRange', path: `params.${key}`, message: '参数不得为负', actual: value });
      }
    }
    return { ok: errors.length === 0, errors };
  }

  /** 输出可再次解析的规范对象 */
  toJSON() {
    const variants = {};
    for (const [variantId, variant] of Object.entries(this.variants)) {
      variants[variantId] = {
        name: variant.name,
        description: variant.description,
        category: variant.category,
        targeting: variant.targeting,
        params: { ...variant.params },
        costs: { ...variant.costs },
        vfx: variant.vfx ? { ...variant.vfx } : null,
        tags: [...variant.tags]
      };
    }

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      targeting: this.targeting,
      params: { ...this.params },
      costs: { ...this.costs },
      tags: [...this.tags],
      vfx: this.vfx ? { ...this.vfx } : null,
      variants
    };
  }

  /**
   * 由旧版技能对象升格为定义（兼容 combat.skills 与 MockDataService）
   * @param {Object} legacy - 形如 { id, name, damage, range, cooldown, manaCost, type }
   * @returns {SkillDefinition}
   */
  static fromLegacy(legacy = {}) {
    const params = {};
    for (const key of MODIFIABLE_SKILL_PARAMS) {
      if (typeof legacy[key] === 'number') params[key] = legacy[key];
    }

    const costs = {};
    if (typeof legacy.manaCost === 'number') costs.mp = legacy.manaCost;
    if (typeof legacy.staminaCost === 'number') costs.stamina = legacy.staminaCost;

    let targeting = legacy.targeting;
    if (!targeting) {
      if (legacy.aoe || legacy.radius) targeting = SkillTargeting.AREA;
      else if (legacy.type === 'heal' || legacy.type === 'buff') targeting = SkillTargeting.SELF;
      else targeting = SkillTargeting.ENTITY;
    }

    let category = legacy.category;
    if (!category) {
      if (legacy.type === 'heal') category = SkillCategory.HEAL;
      else if (legacy.type === 'buff') category = SkillCategory.BUFF;
      else category = SkillCategory.ATTACK;
    }

    return new SkillDefinition({
      id: legacy.id,
      name: legacy.name,
      description: legacy.description,
      category,
      targeting,
      params,
      costs,
      tags: legacy.tags,
      vfx: legacy.vfx || (legacy.effect ? { effect: legacy.effect } : null)
    });
  }
}

export default SkillDefinition;
