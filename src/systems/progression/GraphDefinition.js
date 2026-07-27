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
 * GraphDefinition.js
 * 成长图定义（只读）。
 *
 * 一张图对应一种成长表现：
 *   classSkill    技能树（主动技能与强化分支）
 *   classTalent   职业天赋树
 *   unitTalent    兵种天赋树
 *   passiveBoard  天赋盘（需要路径连通）
 */

import { NodeDefinition, NodeKind } from './NodeDefinition.js';

/** 图模式 */
export const GraphMode = {
  CLASS_SKILL: 'classSkill',
  CLASS_TALENT: 'classTalent',
  UNIT_TALENT: 'unitTalent',
  PASSIVE_BOARD: 'passiveBoard'
};

/** 点数池标识 */
export const PointPool = {
  SKILL: 'skill',
  TALENT: 'talent',
  UNIT: 'unit',
  PASSIVE: 'passive'
};

/** 各模式默认点数池 */
const DEFAULT_POOL_BY_MODE = {
  [GraphMode.CLASS_SKILL]: PointPool.SKILL,
  [GraphMode.CLASS_TALENT]: PointPool.TALENT,
  [GraphMode.UNIT_TALENT]: PointPool.UNIT,
  [GraphMode.PASSIVE_BOARD]: PointPool.PASSIVE
};

export class GraphDefinition {
  /**
   * @param {Object} config
   * @param {string} config.id - 图唯一标识
   * @param {string} [config.mode] - 图模式
   * @param {number} [config.version] - 版本号，用于存档迁移
   * @param {string} [config.pointPool] - 使用的点数池
   * @param {Array<Object>} [config.nodes] - 节点定义
   * @param {Array<Array<string>>} [config.edges] - 无向连接 [[a,b], ...]，天赋盘用
   * @param {Array<string>} [config.startNodes] - 起点节点标识
   * @param {Object} [config.rules] - 图级规则，如 { requireConnected: true }
   */
  constructor(config = {}) {
    this.id = config.id;
    this.mode = config.mode || GraphMode.CLASS_TALENT;
    this.version = typeof config.version === 'number' ? config.version : 1;
    this.pointPool = config.pointPool || DEFAULT_POOL_BY_MODE[this.mode] || PointPool.TALENT;

    /** @type {Map<string, NodeDefinition>} */
    this.nodes = new Map();
    for (const nodeConfig of config.nodes || []) {
      const node = nodeConfig instanceof NodeDefinition ? nodeConfig : new NodeDefinition(nodeConfig);
      this.nodes.set(node.id, node);
    }

    this.edges = (config.edges || []).map(e => [e[0], e[1]]);

    this.startNodes = Array.isArray(config.startNodes) && config.startNodes.length > 0
      ? [...config.startNodes]
      : this.getAllNodes().filter(n => n.isStart()).map(n => n.id);

    this.rules = {
      // 天赋盘默认要求路径连通，树形图默认不要求
      requireConnected: this.mode === GraphMode.PASSIVE_BOARD,
      ...(config.rules || {})
    };

    /** @type {Map<string, Set<string>>} 邻接索引 */
    this._adjacency = this._buildAdjacency();
    /** @type {Map<string, Array<NodeDefinition>>} 区域索引 */
    this._regionIndex = this._buildRegionIndex();
  }

  /** @private 构建邻接索引 */
  _buildAdjacency() {
    const adjacency = new Map();
    const ensure = (id) => {
      if (!adjacency.has(id)) adjacency.set(id, new Set());
      return adjacency.get(id);
    };

    for (const id of this.nodes.keys()) ensure(id);

    for (const [a, b] of this.edges) {
      if (!this.nodes.has(a) || !this.nodes.has(b)) continue;
      ensure(a).add(b);
      ensure(b).add(a);
    }

    // 树形图用前置关系补充邻接，便于统一查询
    if (this.mode !== GraphMode.PASSIVE_BOARD) {
      for (const node of this.nodes.values()) {
        for (const prereq of node.prerequisites.nodes) {
          if (!this.nodes.has(prereq)) continue;
          ensure(node.id).add(prereq);
          ensure(prereq).add(node.id);
        }
      }
    }

    return adjacency;
  }

  /** @private 构建区域索引 */
  _buildRegionIndex() {
    const index = new Map();
    for (const node of this.nodes.values()) {
      const key = node.region || '_default';
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(node);
    }
    return index;
  }

  /**
   * 获取节点
   * @param {string} nodeId
   * @returns {NodeDefinition|null}
   */
  getNode(nodeId) {
    return this.nodes.get(nodeId) || null;
  }

  /** 全部节点 */
  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  /** 节点数量 */
  get size() {
    return this.nodes.size;
  }

  /**
   * 获取相邻节点标识
   * @param {string} nodeId
   * @returns {Array<string>}
   */
  getNeighbors(nodeId) {
    const set = this._adjacency.get(nodeId);
    return set ? Array.from(set) : [];
  }

  /**
   * 按区域查询节点
   * @param {string} region
   * @returns {Array<NodeDefinition>}
   */
  getNodesByRegion(region) {
    return this._regionIndex.get(region) ? [...this._regionIndex.get(region)] : [];
  }

  /**
   * 按类型查询节点
   * @param {string} kind
   * @returns {Array<NodeDefinition>}
   */
  getNodesByKind(kind) {
    return this.getAllNodes().filter(n => n.kind === kind);
  }

  /**
   * 获取同一互斥组的节点
   * @param {string} choiceGroup
   * @returns {Array<NodeDefinition>}
   */
  getChoiceGroupNodes(choiceGroup) {
    return this.getAllNodes().filter(n => n.choiceGroup === choiceGroup);
  }

  /**
   * 校验整图合法性：节点、引用、起点、连通要求
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  validate() {
    const errors = [];

    if (!this.id || typeof this.id !== 'string') {
      errors.push({ code: 'missingField', path: 'id', message: '成长图必须包含字符串 id' });
    }
    if (!Object.values(GraphMode).includes(this.mode)) {
      errors.push({ code: 'outOfRange', path: 'mode', message: '未知图模式', actual: this.mode });
    }
    if (this.nodes.size === 0) {
      errors.push({ code: 'missingField', path: 'nodes', message: '成长图至少需要一个节点' });
    }

    for (const node of this.nodes.values()) {
      const result = node.validate();
      for (const e of result.errors) {
        errors.push({ ...e, path: `nodes.${node.id}.${e.path}` });
      }
      for (const prereq of node.prerequisites.nodes) {
        if (!this.nodes.has(prereq)) {
          errors.push({
            code: 'invalidReference',
            path: `nodes.${node.id}.prerequisites`,
            message: `前置节点不存在: ${prereq}`
          });
        }
      }
      for (const exclusive of node.exclusiveWith) {
        if (!this.nodes.has(exclusive)) {
          errors.push({
            code: 'invalidReference',
            path: `nodes.${node.id}.exclusiveWith`,
            message: `互斥节点不存在: ${exclusive}`
          });
        }
      }
    }

    for (const [a, b] of this.edges) {
      if (!this.nodes.has(a) || !this.nodes.has(b)) {
        errors.push({ code: 'invalidReference', path: 'edges', message: `连接引用了不存在的节点: ${a}-${b}` });
      }
    }

    if (this.rules.requireConnected && this.startNodes.length === 0) {
      errors.push({ code: 'missingField', path: 'startNodes', message: '要求路径连通的图必须定义起点' });
    }
    for (const start of this.startNodes) {
      if (!this.nodes.has(start)) {
        errors.push({ code: 'invalidReference', path: 'startNodes', message: `起点节点不存在: ${start}` });
      }
    }

    const cycle = this._findPrerequisiteCycle();
    if (cycle) {
      errors.push({ code: 'invalidReference', path: 'prerequisites', message: `前置关系存在环: ${cycle.join(' → ')}` });
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * 检测前置关系环
   * @private
   * @returns {Array<string>|null}
   */
  _findPrerequisiteCycle() {
    const visiting = new Set();
    const visited = new Set();
    const stack = [];

    const dfs = (id) => {
      if (visited.has(id)) return null;
      if (visiting.has(id)) return [...stack.slice(stack.indexOf(id)), id];

      visiting.add(id);
      stack.push(id);

      const node = this.nodes.get(id);
      if (node) {
        for (const prereq of node.prerequisites.nodes) {
          if (!this.nodes.has(prereq)) continue;
          const found = dfs(prereq);
          if (found) return found;
        }
      }

      stack.pop();
      visiting.delete(id);
      visited.add(id);
      return null;
    };

    for (const id of this.nodes.keys()) {
      const found = dfs(id);
      if (found) return found;
    }
    return null;
  }

  /** 输出可再次解析的规范对象 */
  toJSON() {
    return {
      id: this.id,
      mode: this.mode,
      version: this.version,
      pointPool: this.pointPool,
      startNodes: [...this.startNodes],
      rules: { ...this.rules },
      nodes: this.getAllNodes().map(n => n.toJSON()),
      edges: this.edges.map(e => [e[0], e[1]])
    };
  }
}

export { NodeKind };
export default GraphDefinition;
