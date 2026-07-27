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
 * EffectResolver.js
 * 统一效果结算器（成长系统 S1 基础设施）。
 *
 * 职责：
 *   - 按实体收集效果来源（技能、职业天赋、兵种天赋、天赋盘、装备、状态、职业修正）
 *   - 按固定顺序结算数值：base + add → ×(1+addPercent) → ×multiply → override → clamp
 *   - 提供标记查询（技能解锁、规则覆盖、建造解锁等）
 *   - 提供 explain 来源明细，保证效果可追溯
 *   - 来源变化时按实体失效缓存，不做每帧全量重算
 *
 * 业务系统只读取本结算器结果，禁止各自解释效果字段。
 */

import { EffectType, isFlagEffectType, isNumericEffectType } from './EffectTypes.js';
import { ModifierStack } from './ModifierStack.js';
import { EffectSource } from './EffectSource.js';

export class EffectResolver {
  /**
   * @param {Object} [config]
   * @param {Function} [config.conditionEvaluator] - (condition, effect, context) => boolean
   * @param {Function} [config.onChange] - (entityId) => void，来源变化通知
   */
  constructor(config = {}) {
    /** @type {Map<string, Map<string, EffectSource>>} entityId -> sourceId -> source */
    this.sources = new Map();
    /** @type {Map<string, Map<string, number>>} 结算缓存 */
    this._cache = new Map();
    /** @type {Map<string, boolean>} 实体是否存在条件效果 */
    this._conditionalFlags = new Map();

    this.conditionEvaluator = config.conditionEvaluator || null;
    this.onChange = config.onChange || null;
  }

  // ---------------- 来源管理 ----------------

  /**
   * 添加或替换一个效果来源
   * @param {string} entityId
   * @param {EffectSource|Object} source - EffectSource 实例或其构造配置
   * @returns {boolean} 是否成功
   */
  addSource(entityId, source) {
    if (!entityId || !source) return false;
    const instance = source instanceof EffectSource ? source : new EffectSource(source);
    if (!instance.id) return false;

    if (!this.sources.has(entityId)) this.sources.set(entityId, new Map());
    this.sources.get(entityId).set(instance.id, instance);
    this.invalidate(entityId);
    return true;
  }

  /**
   * 批量添加来源
   * @param {string} entityId
   * @param {Array<EffectSource|Object>} sources
   * @returns {number} 成功数量
   */
  addSources(entityId, sources = []) {
    let count = 0;
    for (const s of sources) {
      if (this.addSource(entityId, s)) count++;
    }
    return count;
  }

  /**
   * 移除一个来源
   * @param {string} entityId
   * @param {string} sourceId
   * @returns {boolean}
   */
  removeSource(entityId, sourceId) {
    const map = this.sources.get(entityId);
    if (!map || !map.has(sourceId)) return false;
    map.delete(sourceId);
    this.invalidate(entityId);
    return true;
  }

  /**
   * 按来源种类批量移除，例如重置天赋盘
   * @param {string} entityId
   * @param {string} kind
   * @returns {number} 移除数量
   */
  removeSourcesByKind(entityId, kind) {
    const map = this.sources.get(entityId);
    if (!map) return 0;
    let count = 0;
    for (const [id, source] of map) {
      if (source.kind === kind) {
        map.delete(id);
        count++;
      }
    }
    if (count > 0) this.invalidate(entityId);
    return count;
  }

  /** 清除实体的全部来源 */
  clearEntity(entityId) {
    this.sources.delete(entityId);
    this.invalidate(entityId);
  }

  /**
   * 获取实体的来源列表
   * @param {string} entityId
   * @returns {Array<EffectSource>}
   */
  getSources(entityId) {
    const map = this.sources.get(entityId);
    return map ? Array.from(map.values()) : [];
  }

  /** 是否存在指定来源 */
  hasSource(entityId, sourceId) {
    const map = this.sources.get(entityId);
    return !!(map && map.has(sourceId));
  }

  // ---------------- 缓存 ----------------

  /**
   * 失效实体缓存（来源变化时调用）
   * @param {string} entityId
   */
  invalidate(entityId) {
    this._cache.delete(entityId);
    this._conditionalFlags.delete(entityId);
    if (this.onChange) {
      try {
        this.onChange(entityId);
      } catch (e) {
        console.warn('EffectResolver: onChange 回调出错', e);
      }
    }
  }

  /** 失效全部缓存 */
  invalidateAll() {
    this._cache.clear();
    this._conditionalFlags.clear();
  }

  /**
   * 实体是否存在条件效果（存在则不缓存结算结果）
   * @private
   */
  _hasConditional(entityId) {
    if (this._conditionalFlags.has(entityId)) {
      return this._conditionalFlags.get(entityId);
    }
    let flag = false;
    for (const source of this.getSources(entityId)) {
      if (source.hasConditionalEffects()) {
        flag = true;
        break;
      }
    }
    this._conditionalFlags.set(entityId, flag);
    return flag;
  }

  // ---------------- 数值结算 ----------------

  /**
   * 构建指定目标的修饰栈
   * @private
   * @param {string} entityId
   * @param {string} target
   * @param {string|null} [typeFilter] - 限定效果类型
   * @returns {ModifierStack}
   */
  _buildStack(entityId, target, typeFilter = null) {
    const stack = new ModifierStack(target);
    for (const source of this.getSources(entityId)) {
      for (const effect of source.effects) {
        if (!isNumericEffectType(effect.type)) continue;
        if (effect.target !== target) continue;
        if (typeFilter && effect.type !== typeFilter) continue;
        stack.add(effect);
      }
    }
    return stack;
  }

  /**
   * 条件求值封装
   * @private
   */
  _makeEvaluator(context) {
    if (!this.conditionEvaluator) {
      // 未注入求值器时，带条件的效果默认不生效，避免误加成
      return () => false;
    }
    return (condition, effect) => {
      try {
        return !!this.conditionEvaluator(condition, effect, context);
      } catch (e) {
        console.warn('EffectResolver: 条件求值出错，视为不满足', e);
        return false;
      }
    };
  }

  /**
   * 结算目标数值
   * @param {string} entityId
   * @param {string} target - 目标数值名，如 'attack'、'gather.duration'
   * @param {number} [baseValue] - 基线值（含职业固定修正）
   * @param {Object} [context] - 条件求值上下文
   * @returns {number}
   */
  getValue(entityId, target, baseValue = 0, context = null) {
    if (!entityId || !target) return baseValue;

    const conditional = this._hasConditional(entityId);
    const cacheKey = `${target}|${baseValue}`;

    if (!conditional) {
      const entityCache = this._cache.get(entityId);
      if (entityCache && entityCache.has(cacheKey)) {
        return entityCache.get(cacheKey);
      }
    }

    const stack = this._buildStack(entityId, target);
    if (stack.isEmpty()) return baseValue;

    const resolved = stack.resolve(baseValue, this._makeEvaluator(context));

    if (!conditional) {
      if (!this._cache.has(entityId)) this._cache.set(entityId, new Map());
      this._cache.get(entityId).set(cacheKey, resolved.value);
    }

    return resolved.value;
  }

  /**
   * 结算属性数值（attribute.modify 的语义化封装）
   * @param {string} entityId
   * @param {string} attribute
   * @param {number} [baseValue]
   * @param {Object} [context]
   * @returns {number}
   */
  getAttribute(entityId, attribute, baseValue = 0, context = null) {
    return this.getValue(entityId, attribute, baseValue, context);
  }

  /**
   * 批量结算多个目标
   * @param {string} entityId
   * @param {Object} baseValues - { attack: 10, defense: 5 }
   * @param {Object} [context]
   * @returns {Object} 结算后的同结构对象
   */
  resolveAll(entityId, baseValues = {}, context = null) {
    const result = {};
    for (const [target, base] of Object.entries(baseValues)) {
      result[target] = typeof base === 'number'
        ? this.getValue(entityId, target, base, context)
        : base;
    }
    return result;
  }

  /**
   * 获取作用于目标的原始修饰列表（只读）
   * @param {string} entityId
   * @param {string} target
   * @returns {Array<Object>}
   */
  getModifiers(entityId, target) {
    return this._buildStack(entityId, target).modifiers.map(m => ({ ...m }));
  }

  /**
   * 获取目标数值的来源明细，用于调试与 UI
   * @param {string} entityId
   * @param {string} target
   * @param {number} [baseValue]
   * @param {Object} [context]
   * @returns {Object}
   */
  explain(entityId, target, baseValue = 0, context = null) {
    const stack = this._buildStack(entityId, target);
    return stack.explain(baseValue, this._makeEvaluator(context));
  }

  // ---------------- 标记查询 ----------------

  /**
   * 获取指定类型的标记集合
   * @private
   * @param {string} entityId
   * @param {string} type
   * @param {Object} [context]
   * @returns {Array<Object>}
   */
  _collectFlags(entityId, type, context = null) {
    const evaluator = this._makeEvaluator(context);
    const result = [];
    for (const source of this.getSources(entityId)) {
      for (const effect of source.effects) {
        if (effect.type !== type) continue;
        if (!isFlagEffectType(effect.type)) continue;
        if (effect.condition && !evaluator(effect.condition, effect)) continue;
        result.push({
          target: effect.target,
          value: effect.value,
          sourceId: effect.sourceId,
          sourceKind: effect.sourceKind,
          priority: effect.priority
        });
      }
    }
    return result;
  }

  /**
   * 获取已解锁技能标识列表
   * @param {string} entityId
   * @param {Object} [context]
   * @returns {Array<string>}
   */
  getUnlockedSkills(entityId, context = null) {
    const flags = this._collectFlags(entityId, EffectType.SKILL_UNLOCK, context);
    return Array.from(new Set(flags.map(f => f.target)));
  }

  /**
   * 获取已解锁建造项标识列表
   * @param {string} entityId
   * @param {Object} [context]
   * @returns {Array<string>}
   */
  getUnlockedConstructions(entityId, context = null) {
    const flags = this._collectFlags(entityId, EffectType.CONSTRUCTION_UNLOCK, context);
    return Array.from(new Set(flags.map(f => f.target)));
  }

  /**
   * 获取由成长赋予的状态效果标识列表
   * @param {string} entityId
   * @param {Object} [context]
   * @returns {Array<string>}
   */
  getGrantedStatuses(entityId, context = null) {
    const flags = this._collectFlags(entityId, EffectType.STATUS_GRANT, context);
    return Array.from(new Set(flags.map(f => f.target)));
  }

  /**
   * 判断某项规则是否被覆盖（keystone 类取舍规则）
   * @param {string} entityId
   * @param {string} ruleName
   * @param {Object} [context]
   * @returns {boolean}
   */
  hasRuleOverride(entityId, ruleName, context = null) {
    const flags = this._collectFlags(entityId, EffectType.RULE_OVERRIDE, context);
    const matched = flags.filter(f => f.target === ruleName);
    if (matched.length === 0) return false;
    matched.sort((a, b) => b.priority - a.priority);
    const top = matched[0];
    return top.value === undefined ? true : !!top.value;
  }

  /**
   * 获取规则覆盖的原始值（支持非布尔覆盖）
   * @param {string} entityId
   * @param {string} ruleName
   * @param {*} [defaultValue]
   * @param {Object} [context]
   * @returns {*}
   */
  getRuleValue(entityId, ruleName, defaultValue = null, context = null) {
    const flags = this._collectFlags(entityId, EffectType.RULE_OVERRIDE, context)
      .filter(f => f.target === ruleName);
    if (flags.length === 0) return defaultValue;
    flags.sort((a, b) => b.priority - a.priority);
    return flags[0].value === undefined ? defaultValue : flags[0].value;
  }

  /**
   * 获取未被标准协议覆盖的旧版效果字段，便于迁移期排查
   * @param {string} entityId
   * @returns {Object} sourceId -> 未映射字段
   */
  getRawLegacy(entityId) {
    const result = {};
    for (const source of this.getSources(entityId)) {
      if (source.unmappedLegacy && Object.keys(source.unmappedLegacy).length > 0) {
        result[source.id] = { ...source.unmappedLegacy };
      }
    }
    return result;
  }

  // ---------------- 序列化 ----------------

  /**
   * 序列化来源清单（存档用；效果定义本身由配置提供，此处只保存来源引用）
   * @param {string} entityId
   * @returns {Array<Object>}
   */
  serializeEntity(entityId) {
    return this.getSources(entityId).map(s => ({
      id: s.id,
      kind: s.kind,
      priority: s.priority
    }));
  }
}

export default EffectResolver;
