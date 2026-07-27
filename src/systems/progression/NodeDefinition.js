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
 * NodeDefinition.js
 * 成长节点定义（只读）。
 *
 * 定义中禁止出现角色运行状态（currentRank / isLearned / isUnlocked），
 * 角色的分配情况一律保存在 ProgressionState 中。
 */

/** 节点类型 */
export const NodeKind = {
  ACTIVE_SKILL: 'activeSkill',       // 主动技能解锁
  SKILL_MODIFIER: 'skillModifier',   // 技能强化（暗黑式分支）
  PASSIVE: 'passive',                // 普通被动
  SPECIALIZATION: 'specialization',  // 职业专精
  MINOR: 'minor',                    // 天赋盘小点
  NOTABLE: 'notable',                // 天赋盘重要节点
  KEYSTONE: 'keystone',              // 核心天赋（带取舍）
  MASTERY: 'mastery',                // 分类精通
  SOCKET: 'socket',                  // 插槽
  START: 'start'                     // 起点
};

/** 前置条件模式 */
export const PrerequisiteMode = {
  ALL: 'all',   // 全部满足
  ANY: 'any'    // 任一满足
};

export class NodeDefinition {
  /**
   * @param {Object} config
   * @param {string} config.id - 节点唯一标识
   * @param {string} [config.name] - 显示名
   * @param {string} [config.description] - 说明
   * @param {string} [config.kind] - 节点类型
   * @param {number} [config.maxRank] - 最大等级
   * @param {Object} [config.costs] - 每级消耗，如 { skill: 1 }
   * @param {Object|Array<string>} [config.prerequisites] - 前置条件
   * @param {string} [config.choiceGroup] - 互斥组标识
   * @param {Array<string>} [config.exclusiveWith] - 显式互斥节点
   * @param {Object} [config.position] - 布局坐标 { x, y }
   * @param {string} [config.region] - 所属区域
   * @param {Array<Object>} [config.effects] - 每级效果（标准效果协议）
   * @param {Object} [config.gates] - 门槛，如 { characterLevel: 10, spentInRegion: 5 }
   * @param {Array<string>} [config.tags] - 标签
   */
  constructor(config = {}) {
    this.id = config.id;
    this.name = config.name || config.id;
    this.description = config.description || '';
    this.kind = config.kind || NodeKind.PASSIVE;
    this.maxRank = typeof config.maxRank === 'number' ? config.maxRank : 1;
    this.costs = { ...(config.costs || {}) };
    this.prerequisites = this._normalizePrerequisites(config.prerequisites);
    this.choiceGroup = config.choiceGroup || null;
    this.exclusiveWith = Array.isArray(config.exclusiveWith) ? [...config.exclusiveWith] : [];
    this.position = config.position ? { ...config.position } : { x: 0, y: 0 };
    this.region = config.region || null;
    this.effects = Array.isArray(config.effects) ? config.effects.map(e => ({ ...e })) : [];
    this.gates = { ...(config.gates || {}) };
    this.tags = Array.isArray(config.tags) ? [...config.tags] : [];
  }

  /**
   * 统一前置条件结构，兼容旧版数组写法
   * @private
   * @param {Object|Array<string>|undefined} prerequisites
   * @returns {{mode: string, nodes: Array<string>}}
   */
  _normalizePrerequisites(prerequisites) {
    if (!prerequisites) return { mode: PrerequisiteMode.ALL, nodes: [] };

    if (Array.isArray(prerequisites)) {
      return { mode: PrerequisiteMode.ALL, nodes: [...prerequisites] };
    }

    return {
      mode: prerequisites.mode === PrerequisiteMode.ANY ? PrerequisiteMode.ANY : PrerequisiteMode.ALL,
      nodes: Array.isArray(prerequisites.nodes) ? [...prerequisites.nodes] : []
    };
  }

  /** 是否为天赋盘起点 */
  isStart() {
    return this.kind === NodeKind.START;
  }

  /**
   * 获取指定等级的效果列表。
   * 数值效果按等级线性累计；数组值按等级取对应项。
   * @param {number} rank - 当前等级
   * @returns {Array<Object>}
   */
  getEffectsAtRank(rank) {
    if (rank <= 0) return [];

    const result = [];
    for (const effect of this.effects) {
      const copy = { ...effect };
      if (Array.isArray(effect.value)) {
        copy.value = effect.value[Math.min(rank - 1, effect.value.length - 1)];
      } else if (typeof effect.value === 'number' && effect.perRank !== false) {
        copy.value = effect.value * rank;
      }
      delete copy.perRank;
      result.push(copy);
    }
    return result;
  }

  /**
   * 获取指定等级的总消耗
   * @param {number} rank
   * @returns {Object} 点数池 -> 数量
   */
  getCostsAtRank(rank) {
    const total = {};
    for (const [pool, amount] of Object.entries(this.costs)) {
      if (typeof amount !== 'number') continue;
      total[pool] = amount * Math.max(0, rank);
    }
    return total;
  }

  /**
   * 校验定义合法性
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  validate() {
    const errors = [];

    if (!this.id || typeof this.id !== 'string') {
      errors.push({ code: 'missingField', path: 'id', message: '节点必须包含字符串 id' });
    }
    if (!Object.values(NodeKind).includes(this.kind)) {
      errors.push({ code: 'outOfRange', path: 'kind', message: '未知节点类型', actual: this.kind });
    }
    if (!Number.isInteger(this.maxRank) || this.maxRank < 1) {
      errors.push({ code: 'outOfRange', path: 'maxRank', message: 'maxRank 必须为不小于 1 的整数', actual: this.maxRank });
    }
    for (const [pool, amount] of Object.entries(this.costs)) {
      if (typeof amount !== 'number' || amount < 0) {
        errors.push({ code: 'outOfRange', path: `costs.${pool}`, message: '消耗必须为非负数', actual: amount });
      }
    }
    if (this.prerequisites.nodes.includes(this.id)) {
      errors.push({ code: 'invalidReference', path: 'prerequisites', message: '节点不得以自身为前置' });
    }

    return { ok: errors.length === 0, errors };
  }

  /** 输出可再次解析的规范对象 */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      kind: this.kind,
      maxRank: this.maxRank,
      costs: { ...this.costs },
      prerequisites: { mode: this.prerequisites.mode, nodes: [...this.prerequisites.nodes] },
      choiceGroup: this.choiceGroup,
      exclusiveWith: [...this.exclusiveWith],
      position: { ...this.position },
      region: this.region,
      effects: this.effects.map(e => ({ ...e })),
      gates: { ...this.gates },
      tags: [...this.tags]
    };
  }
}

export default NodeDefinition;
