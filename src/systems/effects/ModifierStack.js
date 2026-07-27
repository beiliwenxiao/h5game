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
 * ModifierStack.js
 * 单个目标数值的修饰栈结算。
 *
 * 结算顺序固定为：
 *   base
 *   + Σ add
 *   × (1 + Σ addPercent)
 *   × Π multiply
 *   → override（按 priority 最大者生效，同优先级取最后加入者）
 *   → clampMin / clampMax
 *
 * 顺序固定可保证“职业固定修正为基线、其余来源在其上叠加”的可预期结果。
 */

import { EffectOperation } from './EffectTypes.js';

export class ModifierStack {
  /**
   * @param {string} target - 目标数值名，如 'attack'
   */
  constructor(target) {
    this.target = target;
    this.modifiers = [];
  }

  /**
   * 加入一个已规范化的效果
   * @param {Object} effect
   */
  add(effect) {
    if (!effect) return;
    this.modifiers.push(effect);
  }

  /** 是否为空 */
  isEmpty() {
    return this.modifiers.length === 0;
  }

  /**
   * 按 stackGroup 过滤：同组只保留绝对值最大的一条，避免同源重复叠加
   * @private
   * @param {Array<Object>} modifiers
   * @returns {Array<Object>}
   */
  _applyStackGroups(modifiers) {
    const grouped = new Map();
    const result = [];

    for (const m of modifiers) {
      if (!m.stackGroup) {
        result.push(m);
        continue;
      }
      const key = `${m.stackGroup}|${m.operation}`;
      const current = grouped.get(key);
      if (!current || Math.abs(m.value) > Math.abs(current.value)) {
        grouped.set(key, m);
      }
    }

    for (const m of grouped.values()) result.push(m);
    return result;
  }

  /**
   * 结算数值
   * @param {number} baseValue - 基线值（含职业固定修正）
   * @param {Function} [conditionEvaluator] - (condition, effect) => boolean
   * @returns {{value: number, contributions: Array<Object>, skipped: Array<Object>}}
   */
  resolve(baseValue = 0, conditionEvaluator = null) {
    const active = [];
    const skipped = [];

    for (const m of this.modifiers) {
      if (m.condition && conditionEvaluator && !conditionEvaluator(m.condition, m)) {
        skipped.push(m);
        continue;
      }
      active.push(m);
    }

    const effective = this._applyStackGroups(active);

    let addSum = 0;
    let percentSum = 0;
    let multiplyProduct = 1;
    let override = null;
    let clampMin = null;
    let clampMax = null;

    for (const m of effective) {
      switch (m.operation) {
        case EffectOperation.ADD:
          addSum += m.value;
          break;
        case EffectOperation.ADD_PERCENT:
          percentSum += m.value;
          break;
        case EffectOperation.MULTIPLY:
          multiplyProduct *= m.value;
          break;
        case EffectOperation.OVERRIDE:
          if (!override || m.priority >= override.priority) override = m;
          break;
        case EffectOperation.CLAMP_MIN:
          clampMin = clampMin === null ? m.value : Math.max(clampMin, m.value);
          break;
        case EffectOperation.CLAMP_MAX:
          clampMax = clampMax === null ? m.value : Math.min(clampMax, m.value);
          break;
        default:
          break;
      }
    }

    let value = (baseValue + addSum) * (1 + percentSum) * multiplyProduct;
    if (override) value = override.value;
    if (clampMin !== null) value = Math.max(clampMin, value);
    if (clampMax !== null) value = Math.min(clampMax, value);

    return {
      value,
      contributions: effective,
      skipped
    };
  }

  /**
   * 生成可读的来源明细，用于调试与 UI 展示
   * @param {number} baseValue
   * @param {Function} [conditionEvaluator]
   * @returns {Object}
   */
  explain(baseValue = 0, conditionEvaluator = null) {
    const resolved = this.resolve(baseValue, conditionEvaluator);
    return {
      target: this.target,
      baseValue,
      finalValue: resolved.value,
      sources: resolved.contributions.map(m => ({
        sourceId: m.sourceId,
        sourceKind: m.sourceKind,
        operation: m.operation,
        value: m.value
      })),
      inactiveSources: resolved.skipped.map(m => ({
        sourceId: m.sourceId,
        sourceKind: m.sourceKind,
        operation: m.operation,
        value: m.value,
        reason: 'conditionNotMet'
      }))
    };
  }
}

export default ModifierStack;
