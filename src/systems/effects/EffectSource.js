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
 * EffectSource.js
 * 效果来源容器：一个来源代表一次可整体添加或移除的效果集合。
 *
 * 典型来源：技能树节点、职业天赋节点、兵种天赋节点、天赋盘节点、
 * 装备、状态效果、职业固定修正。
 */

import { normalizeEffects, fromLegacyEffects } from './EffectTypes.js';

/** 来源种类 */
export const EffectSourceKind = {
  CLASS: 'class',
  SKILL: 'skill',
  TALENT: 'talent',
  UNIT_TALENT: 'unitTalent',
  PASSIVE_BOARD: 'passiveBoard',
  EQUIPMENT: 'equipment',
  STATUS: 'status',
  PROFICIENCY: 'proficiency',
  OTHER: 'other'
};

export class EffectSource {
  /**
   * @param {Object} config
   * @param {string} config.id - 来源唯一标识，同一实体内唯一
   * @param {string} [config.kind] - 来源种类
   * @param {Array<Object>} [config.effects] - 标准效果列表
   * @param {Object} [config.legacyEffects] - 旧版自由键值效果
   * @param {number} [config.priority] - override 冲突时的优先级
   */
  constructor(config = {}) {
    this.id = config.id;
    this.kind = config.kind || EffectSourceKind.OTHER;
    this.priority = typeof config.priority === 'number' ? config.priority : 0;

    const meta = { sourceId: this.id, sourceKind: this.kind };

    this.effects = normalizeEffects(config.effects, meta)
      .map(e => ({ ...e, priority: e.priority || this.priority }));

    this.unmappedLegacy = {};
    if (config.legacyEffects) {
      const converted = fromLegacyEffects(config.legacyEffects, meta);
      for (const e of converted.effects) {
        this.effects.push({ ...e, priority: e.priority || this.priority });
      }
      this.unmappedLegacy = converted.unmapped;
    }
  }

  /** 是否包含有效效果 */
  hasEffects() {
    return this.effects.length > 0;
  }

  /** 是否存在条件效果（用于决定能否缓存结算结果） */
  hasConditionalEffects() {
    return this.effects.some(e => e.condition !== null);
  }

  /**
   * 由旧版节点结构快速构造来源
   * @param {string} id
   * @param {string} kind
   * @param {Object} legacyEffects
   * @returns {EffectSource}
   */
  static fromLegacy(id, kind, legacyEffects) {
    return new EffectSource({ id, kind, legacyEffects });
  }
}

export default EffectSource;
