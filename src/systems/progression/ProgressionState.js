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
 * ProgressionState.js
 * 角色成长状态：每个角色单独保存，禁止写入共享的节点定义。
 *
 * 存档结构按 graphId 分命名空间，禁用某图时不删除其状态，
 * 重新启用后可恢复。
 */

export class ProgressionState {
  /**
   * @param {Object} config
   * @param {string} config.characterId - 角色标识
   * @param {Object} [config.graphs] - graphId -> { version, allocations, revision }
   */
  constructor(config = {}) {
    this.characterId = config.characterId;
    /** @type {Map<string, {version: number, allocations: Map<string, number>, revision: number}>} */
    this.graphs = new Map();

    for (const [graphId, data] of Object.entries(config.graphs || {})) {
      this.graphs.set(graphId, {
        version: typeof data.version === 'number' ? data.version : 1,
        allocations: new Map(Object.entries(data.allocations || {})),
        revision: typeof data.revision === 'number' ? data.revision : 0
      });
    }
  }

  /**
   * 获取或创建图状态
   * @param {string} graphId
   * @param {number} [version]
   * @returns {{version: number, allocations: Map<string, number>, revision: number}}
   */
  ensureGraph(graphId, version = 1) {
    if (!this.graphs.has(graphId)) {
      this.graphs.set(graphId, { version, allocations: new Map(), revision: 0 });
    }
    return this.graphs.get(graphId);
  }

  /**
   * 获取节点已分配等级
   * @param {string} graphId
   * @param {string} nodeId
   * @returns {number}
   */
  getRank(graphId, nodeId) {
    const graph = this.graphs.get(graphId);
    if (!graph) return 0;
    return graph.allocations.get(nodeId) || 0;
  }

  /**
   * 设置节点等级；等级为 0 时移除记录
   * @param {string} graphId
   * @param {string} nodeId
   * @param {number} rank
   * @param {number} [version]
   */
  setRank(graphId, nodeId, rank, version = 1) {
    const graph = this.ensureGraph(graphId, version);
    if (rank <= 0) graph.allocations.delete(nodeId);
    else graph.allocations.set(nodeId, rank);
    graph.revision++;
  }

  /**
   * 获取图内全部已分配节点
   * @param {string} graphId
   * @returns {Array<{nodeId: string, rank: number}>}
   */
  getAllocations(graphId) {
    const graph = this.graphs.get(graphId);
    if (!graph) return [];
    return Array.from(graph.allocations.entries()).map(([nodeId, rank]) => ({ nodeId, rank }));
  }

  /**
   * 图内已分配节点标识集合
   * @param {string} graphId
   * @returns {Set<string>}
   */
  getAllocatedIds(graphId) {
    const graph = this.graphs.get(graphId);
    return new Set(graph ? graph.allocations.keys() : []);
  }

  /**
   * 清空某图的分配
   * @param {string} graphId
   */
  clearGraph(graphId) {
    const graph = this.graphs.get(graphId);
    if (!graph) return;
    graph.allocations.clear();
    graph.revision++;
  }

  /**
   * 创建深拷贝草稿，用于“先在草稿上校验、成功后再提交”的原子分配
   * @returns {ProgressionState}
   */
  clone() {
    return new ProgressionState(this.serialize());
  }

  /**
   * 用另一个状态的内容整体替换当前内容（提交草稿）
   * @param {ProgressionState} other
   */
  replaceWith(other) {
    this.graphs = new Map();
    for (const [graphId, data] of other.graphs) {
      this.graphs.set(graphId, {
        version: data.version,
        allocations: new Map(data.allocations),
        revision: data.revision
      });
    }
  }

  /** 序列化为存档结构 */
  serialize() {
    const graphs = {};
    for (const [graphId, data] of this.graphs) {
      graphs[graphId] = {
        version: data.version,
        allocations: Object.fromEntries(data.allocations),
        revision: data.revision
      };
    }
    return { characterId: this.characterId, graphs };
  }

  /**
   * 从存档结构恢复
   * @param {Object} data
   * @returns {ProgressionState}
   */
  static deserialize(data) {
    return new ProgressionState(data || {});
  }
}

export default ProgressionState;
