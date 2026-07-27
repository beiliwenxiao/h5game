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
 * AllocationRules.js
 * 节点分配与撤销的纯规则校验，不修改任何状态。
 *
 * 覆盖：
 *   - 等级上限
 *   - 前置条件 all / any（暗黑式多入口）
 *   - 互斥组与显式互斥
 *   - 门槛（角色等级、区域累计投入）
 *   - 天赋盘路径连通（POE 式）
 *   - 撤销后不得产生孤立节点
 */

import { PrerequisiteMode } from './NodeDefinition.js';

/** 拒绝原因 */
export const AllocationReject = {
  NODE_NOT_FOUND: 'nodeNotFound',
  MAX_RANK: 'maxRank',
  PREREQUISITE: 'prerequisite',
  EXCLUSIVE: 'exclusive',
  GATE_LEVEL: 'gateLevel',
  GATE_REGION: 'gateRegion',
  NOT_CONNECTED: 'notConnected',
  INSUFFICIENT_POINTS: 'insufficientPoints',
  NOT_ALLOCATED: 'notAllocated',
  WOULD_ORPHAN: 'wouldOrphan'
};

/**
 * 统计图内某区域已投入点数
 * @param {GraphDefinition} graph
 * @param {ProgressionState} state
 * @param {string|null} region
 * @returns {number}
 */
export function countSpentInRegion(graph, state, region) {
  let total = 0;
  for (const { nodeId, rank } of state.getAllocations(graph.id)) {
    const node = graph.getNode(nodeId);
    if (!node) continue;
    if (region && node.region !== region) continue;
    total += rank;
  }
  return total;
}

/**
 * 统计图内已投入总点数
 * @param {GraphDefinition} graph
 * @param {ProgressionState} state
 * @returns {number}
 */
export function countSpentInGraph(graph, state) {
  return countSpentInRegion(graph, state, null);
}

/**
 * 校验前置条件
 * @param {GraphDefinition} graph
 * @param {ProgressionState} state
 * @param {NodeDefinition} node
 * @returns {boolean}
 */
export function checkPrerequisites(graph, state, node) {
  const { mode, nodes } = node.prerequisites;
  if (nodes.length === 0) return true;

  const satisfied = nodes.filter(id => state.getRank(graph.id, id) > 0);
  if (mode === PrerequisiteMode.ANY) return satisfied.length > 0;
  return satisfied.length === nodes.length;
}

/**
 * 校验互斥关系
 * @param {GraphDefinition} graph
 * @param {ProgressionState} state
 * @param {NodeDefinition} node
 * @returns {{ok: boolean, conflictId?: string}}
 */
export function checkExclusive(graph, state, node) {
  // 已分配过的节点继续升级不受互斥限制
  if (state.getRank(graph.id, node.id) > 0) return { ok: true };

  for (const otherId of node.exclusiveWith) {
    if (state.getRank(graph.id, otherId) > 0) return { ok: false, conflictId: otherId };
  }

  if (node.choiceGroup) {
    for (const other of graph.getChoiceGroupNodes(node.choiceGroup)) {
      if (other.id === node.id) continue;
      if (state.getRank(graph.id, other.id) > 0) return { ok: false, conflictId: other.id };
    }
  }

  return { ok: true };
}

/**
 * 校验天赋盘路径连通：新节点必须与起点或已分配节点相邻
 * @param {GraphDefinition} graph
 * @param {ProgressionState} state
 * @param {NodeDefinition} node
 * @returns {boolean}
 */
export function checkConnectivity(graph, state, node) {
  if (!graph.rules.requireConnected) return true;
  if (state.getRank(graph.id, node.id) > 0) return true;
  if (graph.startNodes.includes(node.id)) return true;

  const allocated = state.getAllocatedIds(graph.id);
  for (const neighbor of graph.getNeighbors(node.id)) {
    if (allocated.has(neighbor)) return true;
    // 起点视为天然可达，无需先分配
    if (graph.startNodes.includes(neighbor)) return true;
  }
  return false;
}

/**
 * 校验门槛
 * @param {GraphDefinition} graph
 * @param {ProgressionState} state
 * @param {NodeDefinition} node
 * @param {Object} context - { characterLevel }
 * @returns {{ok: boolean, reason?: string, required?: number}}
 */
export function checkGates(graph, state, node, context = {}) {
  const gates = node.gates || {};

  if (typeof gates.characterLevel === 'number') {
    const level = context.characterLevel || 0;
    if (level < gates.characterLevel) {
      return { ok: false, reason: AllocationReject.GATE_LEVEL, required: gates.characterLevel };
    }
  }

  if (typeof gates.spentInRegion === 'number') {
    const spent = countSpentInRegion(graph, state, node.region);
    if (spent < gates.spentInRegion) {
      return { ok: false, reason: AllocationReject.GATE_REGION, required: gates.spentInRegion };
    }
  }

  if (typeof gates.spentInGraph === 'number') {
    const spent = countSpentInGraph(graph, state);
    if (spent < gates.spentInGraph) {
      return { ok: false, reason: AllocationReject.GATE_REGION, required: gates.spentInGraph };
    }
  }

  return { ok: true };
}

/**
 * 判断撤销某节点后，其余已分配节点是否仍保持合法
 * @param {GraphDefinition} graph
 * @param {ProgressionState} draft - 已应用撤销的草稿状态
 * @returns {{ok: boolean, orphanId?: string}}
 */
export function checkNoOrphans(graph, draft) {
  const allocated = draft.getAllocatedIds(graph.id);

  for (const nodeId of allocated) {
    const node = graph.getNode(nodeId);
    if (!node) continue;

    if (!checkPrerequisites(graph, draft, node)) {
      return { ok: false, orphanId: nodeId };
    }

    if (graph.rules.requireConnected && !graph.startNodes.includes(nodeId)) {
      const reachable = graph.getNeighbors(nodeId).some(
        n => allocated.has(n) || graph.startNodes.includes(n)
      );
      if (!reachable) return { ok: false, orphanId: nodeId };
    }
  }

  return { ok: true };
}
