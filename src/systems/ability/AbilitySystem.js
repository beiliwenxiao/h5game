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
 * AbilitySystem.js
 * 技能执行准入与运行期参数解析。
 *
 * 职责划分（S2 拆分结果）：
 *   SkillRegistry     技能是什么（只读定义）
 *   成长系统           角色是否学会（产出 skill.unlock 效果）
 *   EffectResolver    技能参数如何被强化（skill.modify 效果）
 *   AbilitySystem     能否释放：解锁、冷却、消耗、距离、目标、施法状态
 *   CombatSystem      实际表现与伤害结算（作为执行器被调用）
 *
 * 冷却与施法状态继续复用 CombatComponent，不新建重复组件。
 */

import { SkillTargeting } from './SkillDefinition.js';

/** 拒绝原因 */
export const AbilityRejectReason = {
  NO_DEFINITION: 'noDefinition',
  NOT_UNLOCKED: 'notUnlocked',
  NO_COMBAT_COMPONENT: 'noCombatComponent',
  ON_COOLDOWN: 'onCooldown',
  CASTING: 'casting',
  INSUFFICIENT_COST: 'insufficientCost',
  OUT_OF_RANGE: 'outOfRange',
  INVALID_TARGET: 'invalidTarget',
  NO_EXECUTOR: 'noExecutor'
};

export class AbilitySystem {
  /**
   * @param {Object} config
   * @param {SkillRegistry} config.skillRegistry - 技能定义注册表
   * @param {EffectResolver} [config.effectResolver] - 统一效果结算器
   * @param {Function} [config.executor] - (context) => boolean，实际执行技能表现与结算
   * @param {Function} [config.now] - () => number，单调时间源（毫秒）
   * @param {Function} [config.onEvent] - (evt, data) => void
   */
  constructor(config = {}) {
    this.skillRegistry = config.skillRegistry || null;
    this.effectResolver = config.effectResolver || null;
    this.executor = config.executor || null;
    this.now = config.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.onEvent = config.onEvent || (() => {});

    /** 是否要求技能必须由成长系统解锁；未接入成长系统时可关闭 */
    this.requireUnlock = config.requireUnlock !== false;
  }

  /** 设置执行器（通常为 CombatSystem 的技能执行入口） */
  setExecutor(executor) {
    this.executor = executor;
  }

  /**
   * 解析实体在效果系统中的标识
   * @private
   */
  _entityId(entity) {
    if (!entity) return 'unknown-entity';
    return String(entity.id || entity.name || 'unknown-entity');
  }

  /**
   * 判断技能是否已解锁
   * @param {Entity} caster
   * @param {string} skillId
   * @returns {boolean}
   */
  isUnlocked(caster, skillId) {
    if (!this.requireUnlock) return true;
    if (!this.effectResolver) return true;
    return this.effectResolver.getUnlockedSkills(this._entityId(caster)).includes(skillId);
  }

  /**
   * 解析当前生效的技能形态。
   *
   * 形态由 rule.override 效果指定，目标为 `skill.<skillId>.variant`；
   * 暗黑式分支中的“形态替换”节点通过该效果生效。
   *
   * @param {Entity} caster
   * @param {string} skillId
   * @param {Object} [context]
   * @returns {string|null}
   */
  resolveSkillVariant(caster, skillId, context = null) {
    if (!this.effectResolver) return null;

    const def = this.skillRegistry ? this.skillRegistry.get(skillId) : null;
    if (!def) return null;

    const variantId = this.effectResolver.getRuleValue(
      this._entityId(caster),
      `skill.${skillId}.variant`,
      null,
      context
    );

    return def.hasVariant(variantId) ? variantId : null;
  }

  /**
   * 解析技能的运行期视图：形态覆盖为基线，skill.modify 效果在其上叠加
   * @param {Entity} caster
   * @param {string} skillId
   * @param {Object} [context]
   * @returns {Object|null}
   */
  resolveSkillView(caster, skillId, context = null) {
    const def = this.skillRegistry ? this.skillRegistry.get(skillId) : null;
    if (!def) return null;
    return def.resolveVariant(this.resolveSkillVariant(caster, skillId, context));
  }

  /**
   * 解析技能的运行期参数：形态与定义参数为基线，skill.modify 效果在其上叠加
   * @param {Entity} caster
   * @param {string} skillId
   * @param {Object} [context] - 条件求值上下文
   * @returns {Object|null} 运行期参数快照
   */
  resolveSkillParams(caster, skillId, context = null) {
    const view = this.resolveSkillView(caster, skillId, context);
    if (!view) return null;

    const params = { ...view.params };
    if (!this.effectResolver) return params;

    const entityId = this._entityId(caster);
    for (const [key, baseValue] of Object.entries(params)) {
      if (typeof baseValue !== 'number') continue;
      // 目标命名约定：skill.<skillId>.<param>
      params[key] = this.effectResolver.getValue(entityId, `skill.${skillId}.${key}`, baseValue, context);
    }

    return params;
  }

  /**
   * 解析技能消耗（同样可被效果调整）
   * @param {Entity} caster
   * @param {string} skillId
   * @param {Object} [context]
   * @returns {Object}
   */
  resolveSkillCosts(caster, skillId, context = null) {
    const view = this.resolveSkillView(caster, skillId, context);
    if (!view) return {};

    const costs = { ...view.costs };
    if (!this.effectResolver) return costs;

    const entityId = this._entityId(caster);
    for (const [key, baseValue] of Object.entries(costs)) {
      if (typeof baseValue !== 'number') continue;
      const resolved = this.effectResolver.getValue(entityId, `skill.${skillId}.cost.${key}`, baseValue, context);
      costs[key] = Math.max(0, resolved);
    }

    return costs;
  }

  /**
   * 判定技能能否释放
   * @param {Entity} caster
   * @param {string} skillId
   * @param {Object} [options] - { target, targetPosition, currentTime, context }
   * @returns {{ok: boolean, reason?: string, message?: string, params?: Object, costs?: Object}}
   */
  canUse(caster, skillId, options = {}) {
    const def = this.skillRegistry ? this.skillRegistry.get(skillId) : null;
    if (!def) {
      return { ok: false, reason: AbilityRejectReason.NO_DEFINITION, message: `技能定义不存在: ${skillId}` };
    }

    if (!this.isUnlocked(caster, skillId)) {
      return { ok: false, reason: AbilityRejectReason.NOT_UNLOCKED, message: `技能未解锁: ${def.name}` };
    }

    const combat = caster && caster.getComponent ? caster.getComponent('combat') : null;
    if (!combat) {
      return { ok: false, reason: AbilityRejectReason.NO_COMBAT_COMPONENT, message: '实体缺少 combat 组件' };
    }

    if (combat.isCasting) {
      return { ok: false, reason: AbilityRejectReason.CASTING, message: '正在施法中' };
    }

    const currentTime = options.currentTime !== undefined ? options.currentTime : this.now();
    const context = options.context || null;

    const view = this.resolveSkillView(caster, skillId, context);
    const params = this.resolveSkillParams(caster, skillId, context);
    const costs = this.resolveSkillCosts(caster, skillId, context);

    // 冷却：以解析后的 cooldown 为准，兼容 CombatComponent 中的记录
    const cooldownSeconds = typeof params.cooldown === 'number' ? params.cooldown : 0;
    if (cooldownSeconds > 0) {
      const lastUseTime = combat.skillCooldowns.get(skillId) || 0;
      if (lastUseTime > 0 && currentTime - lastUseTime < cooldownSeconds * 1000) {
        const remaining = cooldownSeconds * 1000 - (currentTime - lastUseTime);
        return {
          ok: false,
          reason: AbilityRejectReason.ON_COOLDOWN,
          message: `技能冷却中: ${def.name}`,
          remaining
        };
      }
    }

    // 消耗
    const stats = caster.getComponent ? caster.getComponent('stats') : null;
    if (stats) {
      if (costs.mp && (stats.mp || 0) < costs.mp) {
        return { ok: false, reason: AbilityRejectReason.INSUFFICIENT_COST, message: '法力不足', costs };
      }
      if (costs.stamina && (stats.stamina || 0) < costs.stamina) {
        return { ok: false, reason: AbilityRejectReason.INSUFFICIENT_COST, message: '体力不足', costs };
      }
    }

    // 目标与距离：使用形态解析后的目标方式
    const rangeCheck = this._checkTargeting(caster, view, params, options);
    if (!rangeCheck.ok) return { ...rangeCheck, params, costs };

    return { ok: true, params, costs, definition: def, view };
  }

  /**
   * 校验目标方式与距离
   * @private
   * @param {Entity} caster
   * @param {Object} def - 技能定义或形态解析视图
   * @param {Object} params
   * @param {Object} options
   */
  _checkTargeting(caster, def, params, options) {
    if (def.targeting === SkillTargeting.SELF) return { ok: true };

    const casterTransform = caster.getComponent ? caster.getComponent('transform') : null;
    if (!casterTransform) return { ok: true };

    let targetPos = options.targetPosition || null;
    if (!targetPos && options.target && options.target.getComponent) {
      const t = options.target.getComponent('transform');
      targetPos = t ? t.position : null;
    }

    if (def.targeting === SkillTargeting.ENTITY && !options.target) {
      return { ok: false, reason: AbilityRejectReason.INVALID_TARGET, message: '需要选择目标' };
    }

    const range = typeof params.range === 'number' ? params.range : 0;
    if (range > 0 && targetPos) {
      const dx = targetPos.x - casterTransform.position.x;
      const dy = targetPos.y - casterTransform.position.y;
      if (Math.sqrt(dx * dx + dy * dy) > range) {
        return { ok: false, reason: AbilityRejectReason.OUT_OF_RANGE, message: '超出施法距离' };
      }
    }

    return { ok: true };
  }

  /**
   * 释放技能：准入判定通过后先扣消耗与进入冷却，再交由执行器完成表现与结算。
   *
   * @param {Entity} caster
   * @param {string} skillId
   * @param {Object} [options] - { target, targetPosition, currentTime, context, entities }
   * @returns {{ok: boolean, reason?: string, message?: string}}
   */
  use(caster, skillId, options = {}) {
    const check = this.canUse(caster, skillId, options);
    if (!check.ok) {
      this.onEvent('abilityRejected', { casterId: this._entityId(caster), skillId, reason: check.reason });
      return check;
    }

    if (!this.executor) {
      return { ok: false, reason: AbilityRejectReason.NO_EXECUTOR, message: '未设置技能执行器' };
    }

    const currentTime = options.currentTime !== undefined ? options.currentTime : this.now();
    const combat = caster.getComponent('combat');
    const stats = caster.getComponent ? caster.getComponent('stats') : null;
    const { params, costs, definition, view } = check;

    // 保存回滚快照：执行器失败时恢复消耗与冷却
    const snapshot = {
      lastUse: combat.skillCooldowns.get(skillId),
      mp: stats ? stats.mp : null,
      stamina: stats ? stats.stamina : null,
      isCasting: combat.isCasting,
      castingSkill: combat.castingSkill,
      castStartTime: combat.castStartTime
    };

    // 扣消耗
    if (stats) {
      if (costs.mp) stats.mp = Math.max(0, (stats.mp || 0) - costs.mp);
      if (costs.stamina) stats.stamina = Math.max(0, (stats.stamina || 0) - costs.stamina);
    }

    // 进入冷却
    combat.skillCooldowns.set(skillId, currentTime);

    // 施法状态
    const castTime = typeof params.castTime === 'number' ? params.castTime : 0;
    if (castTime > 0) {
      combat.isCasting = true;
      combat.castingSkill = { id: skillId, name: view.name, castTime };
      combat.castStartTime = currentTime;
    }

    let executed = false;
    try {
      executed = this.executor({
        caster,
        skillId,
        definition,
        // view 为形态解析后的运行期视图，执行器应优先使用它
        view,
        variantId: view.variantId,
        params,
        costs,
        target: options.target || null,
        targetPosition: options.targetPosition || null,
        entities: options.entities || null,
        currentTime
      }) !== false;
    } catch (e) {
      console.warn('AbilitySystem: 技能执行器抛出异常', skillId, e);
      executed = false;
    }

    if (!executed) {
      // 回滚，保持“失败不产生消耗与冷却”
      if (snapshot.lastUse === undefined) combat.skillCooldowns.delete(skillId);
      else combat.skillCooldowns.set(skillId, snapshot.lastUse);
      if (stats) {
        if (snapshot.mp !== null) stats.mp = snapshot.mp;
        if (snapshot.stamina !== null) stats.stamina = snapshot.stamina;
      }
      combat.isCasting = snapshot.isCasting;
      combat.castingSkill = snapshot.castingSkill;
      combat.castStartTime = snapshot.castStartTime;

      this.onEvent('abilityFailed', { casterId: this._entityId(caster), skillId });
      return { ok: false, reason: 'executionFailed', message: `技能执行失败: ${view.name}` };
    }

    this.onEvent('abilityUsed', {
      casterId: this._entityId(caster),
      skillId,
      variantId: view.variantId,
      params,
      costs,
      currentTime
    });
    return { ok: true, params, costs, definition, view };
  }

  /**
   * 获取技能冷却剩余时间（毫秒）
   * @param {Entity} caster
   * @param {string} skillId
   * @param {number} [currentTime]
   * @returns {number}
   */
  getCooldownRemaining(caster, skillId, currentTime = null) {
    const combat = caster && caster.getComponent ? caster.getComponent('combat') : null;
    if (!combat) return 0;

    const params = this.resolveSkillParams(caster, skillId);
    const cooldownSeconds = params && typeof params.cooldown === 'number' ? params.cooldown : 0;
    if (cooldownSeconds <= 0) return 0;

    const lastUseTime = combat.skillCooldowns.get(skillId) || 0;
    if (lastUseTime === 0) return 0;

    const time = currentTime !== null ? currentTime : this.now();
    return Math.max(0, cooldownSeconds * 1000 - (time - lastUseTime));
  }

  /**
   * 获取技能冷却进度 0-1
   * @param {Entity} caster
   * @param {string} skillId
   * @param {number} [currentTime]
   * @returns {number}
   */
  getCooldownProgress(caster, skillId, currentTime = null) {
    const params = this.resolveSkillParams(caster, skillId);
    const cooldownSeconds = params && typeof params.cooldown === 'number' ? params.cooldown : 0;
    if (cooldownSeconds <= 0) return 1;

    const remaining = this.getCooldownRemaining(caster, skillId, currentTime);
    return Math.max(0, Math.min(1, 1 - remaining / (cooldownSeconds * 1000)));
  }

  /**
   * 获取角色当前可用技能定义列表（已解锁且有定义）
   * @param {Entity} caster
   * @returns {Array<SkillDefinition>}
   */
  getAvailableSkills(caster) {
    if (!this.skillRegistry) return [];
    if (!this.requireUnlock || !this.effectResolver) return this.skillRegistry.getAll();

    const unlocked = this.effectResolver.getUnlockedSkills(this._entityId(caster));
    return unlocked
      .map(id => this.skillRegistry.get(id))
      .filter(def => def !== null);
  }

  /**
   * 每帧更新：处理施法完成
   * @param {number} deltaTime
   * @param {Array<Entity>} entities
   */
  update(deltaTime, entities = []) {
    const currentTime = this.now();
    for (const entity of entities) {
      const combat = entity && entity.getComponent ? entity.getComponent('combat') : null;
      if (!combat || !combat.isCasting || !combat.castingSkill) continue;

      const castTime = combat.castingSkill.castTime || 0;
      if (currentTime - combat.castStartTime >= castTime) {
        const skill = combat.completeCast();
        this.onEvent('castCompleted', { casterId: this._entityId(entity), skillId: skill ? skill.id : null });
      }
    }
  }
}

export default AbilitySystem;
