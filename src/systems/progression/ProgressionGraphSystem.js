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
 * ProgressionGraphSystem.js
 * 统一成长图系统（S3 内核）。
 *
 * 一套内核承载四类成长表现：
 *   classSkill    技能树（主动技能与暗黑式强化分支）
 *   classTalent   职业天赋树
 *   unitTalent    兵种天赋树
 *   passiveBoard  天赋盘（POE 式路径构筑）
 *
 * 关键约束：
 *   - 节点定义只读且全局共享，角色状态保存在 ProgressionState
 *   - 分配流程为：校验前置与点数 → 草稿变更 → 一次提交 → 同步效果来源
 *   - 任一步失败时，分配状态与点数池均保持不变
 *   - 效果一律通过 EffectResolver 输出，本系统不直接改写角色属性
 */

import { GraphDefinition, GraphMode, PointPool } from './GraphDefinition.js';
import { ProgressionState } from './ProgressionState.js';
import { PointLedger } from './PointLedger.js';
import { ProgressionProfile } from './ProgressionProfile.js';
import { EffectResolver } from '../effects/EffectResolver.js';
import { EffectSource, EffectSourceKind } from '../effects/EffectSource.js';
import {
  AllocationReject,
  checkPrerequisites,
  checkExclusive,
  checkConnectivity,
  checkGates,
  checkNoOrphans,
  countSpentInGraph,
  countSpentInRegion
} from './AllocationRules.js';

/** 图模式 → 效果来源种类 */
const SOURCE_KIND_BY_MODE = {
  [GraphMode.CLASS_SKILL]: EffectSourceKind.SKILL,
  [GraphMode.CLASS_TALENT]: EffectSourceKind.TALENT,
  [GraphMode.UNIT_TALENT]: EffectSourceKind.UNIT_TALENT,
  [GraphMode.PASSIVE_BOARD]: EffectSourceKind.PASSIVE_BOARD
};

export class ProgressionGraphSystem {
  /**
   * @param {Object} [config]
   * @param {EffectResolver} [config.effectResolver] - 统一效果结算器
   * @param {ProgressionProfile|Object} [config.profile] - 项目级成长配置
   * @param {Object} [config.pointAliases] - 点数池别名，用于共享点数（profile 未提供时使用）
   * @param {Function} [config.onEvent] - (evt, data) => void
   */
  constructor(config = {}) {
    /** @type {Map<string, GraphDefinition>} */
    this.graphs = new Map();
    /** @type {Map<string, ProgressionState>} */
    this.states = new Map();
    /** @type {Map<string, PointLedger>} */
    this.ledgers = new Map();
    /** @type {Map<string, Map<string, {fingerprint:string, result:Object}>>} */
    this.pointGrantOperations = new Map();
    this.maxPointGrantOperations = Math.max(16, Number(config.maxPointGrantOperations) || 256);

    this.effectResolver = config.effectResolver || new EffectResolver();

    this.profile = config.profile
      ? (config.profile instanceof ProgressionProfile ? config.profile : new ProgressionProfile(config.profile))
      : null;

    this.pointAliases = this.profile
      ? this.profile.getPointAliases()
      : (config.pointAliases || {});

    this.onEvent = config.onEvent || (() => {});
  }

  /**
   * 设置项目级成长配置。
   * 已创建的账本会同步别名，保证共享点数配置生效。
   * @param {ProgressionProfile|Object} profile
   */
  setProfile(profile) {
    this.profile = profile instanceof ProgressionProfile ? profile : new ProgressionProfile(profile);
    this.pointAliases = this.profile.getPointAliases();
    for (const ledger of this.ledgers.values()) {
      ledger.aliases = { ...this.pointAliases };
    }
  }

  /**
   * 判断某张图当前是否被 Profile 启用。
   * 未设置 Profile 时视为全部启用。
   * @param {string} graphId
   * @returns {boolean}
   */
  isGraphEnabled(graphId) {
    if (!this.profile) return true;
    const graph = this.getGraph(graphId);
    if (!graph) return false;
    return this.profile.getEnabledModes().includes(graph.mode);
  }

  // ---------------- 图注册 ----------------

  /**
   * 注册成长图；校验失败时不写入
   * @param {GraphDefinition|Object} definition
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  registerGraph(definition) {
    const graph = definition instanceof GraphDefinition
      ? definition
      : new GraphDefinition(definition);

    const result = graph.validate();
    if (!result.ok) return result;

    this.graphs.set(graph.id, graph);
    return { ok: true, errors: [] };
  }

  /**
   * 批量注册
   * @param {Array<Object>} list
   * @returns {{registered: number, errors: Array<Object>}}
   */
  registerGraphs(list = []) {
    let registered = 0;
    const errors = [];
    for (const item of list) {
      const result = this.registerGraph(item);
      if (result.ok) registered++;
      else errors.push({ id: item && item.id, errors: result.errors });
    }
    return { registered, errors };
  }

  /**
   * 获取图定义
   * @param {string} graphId
   * @returns {GraphDefinition|null}
   */
  getGraph(graphId) {
    return this.graphs.get(graphId) || null;
  }

  /** 全部图 */
  getAllGraphs() {
    return Array.from(this.graphs.values());
  }

  /**
   * 按模式查询图
   * @param {string} mode
   * @returns {Array<GraphDefinition>}
   */
  getGraphsByMode(mode) {
    return this.getAllGraphs().filter(g => g.mode === mode);
  }

  // ---------------- 角色状态 ----------------

  /**
   * 获取或创建角色成长状态
   * @param {string} characterId
   * @returns {ProgressionState}
   */
  getState(characterId) {
    if (!this.states.has(characterId)) {
      this.states.set(characterId, new ProgressionState({ characterId }));
    }
    return this.states.get(characterId);
  }

  /**
   * 获取或创建角色点数账本
   * @param {string} characterId
   * @returns {PointLedger}
   */
  getLedger(characterId) {
    if (!this.ledgers.has(characterId)) {
      this.ledgers.set(characterId, new PointLedger({ aliases: this.pointAliases }));
    }
    return this.ledgers.get(characterId);
  }

  /**
   * 发放点数
   * @param {string} characterId
   * @param {string} pool - skill / talent / unit / passive
   * @param {number} amount
   */
  grantPoints(characterId, pool, amount) {
    this.getLedger(characterId).grant(pool, amount);
    this.onEvent('pointsGranted', { characterId, pool, amount });
  }

  /**
   * 以稳定 operationId 幂等发放点数；同 ID 不同载荷会被拒绝。
   * @returns {{ok:boolean,idempotent?:boolean,code?:string,characterId?:string,pool?:string,amount?:number,operationId?:string}}
   */
  grantPointsOnce(characterId, pool, amount, operationId) {
    const normalizedCharacterId = String(characterId || '');
    const normalizedPool = String(pool || '');
    const normalizedAmount = Number(amount);
    const normalizedOperationId = String(operationId || '');
    if (!normalizedCharacterId || !normalizedPool || !normalizedOperationId
      || !Number.isInteger(normalizedAmount) || normalizedAmount <= 0) {
      return { ok: false, code: 'invalidPointGrant' };
    }

    let operations = this.pointGrantOperations.get(normalizedCharacterId);
    if (!operations) {
      operations = new Map();
      this.pointGrantOperations.set(normalizedCharacterId, operations);
    }
    const fingerprint = JSON.stringify([normalizedPool, normalizedAmount]);
    const known = operations.get(normalizedOperationId);
    if (known) {
      return known.fingerprint === fingerprint
        ? { ...known.result, idempotent: true }
        : { ok: false, code: 'operationConflict', operationId: normalizedOperationId };
    }

    this.grantPoints(normalizedCharacterId, normalizedPool, normalizedAmount);
    const result = {
      ok: true,
      characterId: normalizedCharacterId,
      pool: normalizedPool,
      amount: normalizedAmount,
      operationId: normalizedOperationId
    };
    operations.set(normalizedOperationId, { fingerprint, result: { ...result } });
    while (operations.size > this.maxPointGrantOperations) {
      operations.delete(operations.keys().next().value);
    }
    return result;
  }

  /**
   * 获取节点已分配等级
   * @param {string} characterId
   * @param {string} graphId
   * @param {string} nodeId
   * @returns {number}
   */
  getRank(characterId, graphId, nodeId) {
    return this.getState(characterId).getRank(graphId, nodeId);
  }

  // ---------------- 分配与撤销 ----------------

  /**
   * 预检分配（不修改任何状态）
   * @param {string} characterId
   * @param {string} graphId
   * @param {string} nodeId
   * @param {Object} [context] - { characterLevel }
   * @returns {{ok: boolean, reason?: string, message?: string, costs?: Object, nextRank?: number}}
   */
  previewAllocate(characterId, graphId, nodeId, context = {}) {
    const graph = this.getGraph(graphId);
    if (!graph) {
      return { ok: false, reason: AllocationReject.NODE_NOT_FOUND, message: `成长图不存在: ${graphId}` };
    }

    if (!this.isGraphEnabled(graphId)) {
      return {
        ok: false,
        reason: AllocationReject.GRAPH_DISABLED,
        message: `当前项目未启用该成长结构: ${graphId}`
      };
    }

    const node = graph.getNode(nodeId);
    if (!node) {
      return { ok: false, reason: AllocationReject.NODE_NOT_FOUND, message: `节点不存在: ${nodeId}` };
    }

    const state = this.getState(characterId);
    const currentRank = state.getRank(graphId, nodeId);

    if (currentRank >= node.maxRank) {
      return { ok: false, reason: AllocationReject.MAX_RANK, message: `已达最大等级: ${node.name}` };
    }

    if (!checkPrerequisites(graph, state, node)) {
      return { ok: false, reason: AllocationReject.PREREQUISITE, message: `前置条件未满足: ${node.name}` };
    }

    const exclusive = checkExclusive(graph, state, node);
    if (!exclusive.ok) {
      return {
        ok: false,
        reason: AllocationReject.EXCLUSIVE,
        message: `与已选节点互斥: ${exclusive.conflictId}`,
        conflictId: exclusive.conflictId
      };
    }

    const gate = checkGates(graph, state, node, context);
    if (!gate.ok) {
      return { ok: false, reason: gate.reason, message: '未达到节点门槛要求', required: gate.required };
    }

    if (!checkConnectivity(graph, state, node)) {
      return { ok: false, reason: AllocationReject.NOT_CONNECTED, message: `节点未与已分配路径相连: ${node.name}` };
    }

    // 单级消耗：默认由 costs 指定，未指定时按图的点数池扣 1 点
    const costs = this._singleRankCosts(graph, node);
    const afford = this.getLedger(characterId).canAfford(costs);
    if (!afford.ok) {
      return {
        ok: false,
        reason: AllocationReject.INSUFFICIENT_POINTS,
        message: '成长点数不足',
        missing: afford.missing,
        costs
      };
    }

    return { ok: true, costs, nextRank: currentRank + 1, node };
  }

  /**
   * 分配一级节点
   * @param {string} characterId
   * @param {string} graphId
   * @param {string} nodeId
   * @param {Object} [context]
   * @returns {{ok: boolean, reason?: string, message?: string, rank?: number}}
   */
  allocateNode(characterId, graphId, nodeId, context = {}) {
    const check = this.previewAllocate(characterId, graphId, nodeId, context);
    if (!check.ok) {
      this.onEvent('allocationRejected', { characterId, graphId, nodeId, reason: check.reason });
      return check;
    }

    const graph = this.getGraph(graphId);
    const state = this.getState(characterId);
    const ledger = this.getLedger(characterId);

    // 先扣点，失败则不修改分配；扣点成功后再写入等级并同步效果
    if (!ledger.spend(check.costs)) {
      return { ok: false, reason: AllocationReject.INSUFFICIENT_POINTS, message: '成长点数不足' };
    }

    state.setRank(graphId, nodeId, check.nextRank, graph.version);
    this.syncEffectSource(characterId, graphId);

    this.onEvent('nodeAllocated', { characterId, graphId, nodeId, rank: check.nextRank });
    return { ok: true, rank: check.nextRank, costs: check.costs };
  }

  /**
   * 撤销一级节点；撤销后若产生孤立节点则拒绝并保持原状态
   * @param {string} characterId
   * @param {string} graphId
   * @param {string} nodeId
   * @returns {{ok: boolean, reason?: string, message?: string, rank?: number}}
   */
  deallocateNode(characterId, graphId, nodeId) {
    const graph = this.getGraph(graphId);
    if (!graph) {
      return { ok: false, reason: AllocationReject.NODE_NOT_FOUND, message: `成长图不存在: ${graphId}` };
    }

    const node = graph.getNode(nodeId);
    if (!node) {
      return { ok: false, reason: AllocationReject.NODE_NOT_FOUND, message: `节点不存在: ${nodeId}` };
    }

    const state = this.getState(characterId);
    const currentRank = state.getRank(graphId, nodeId);
    if (currentRank <= 0) {
      return { ok: false, reason: AllocationReject.NOT_ALLOCATED, message: `节点未分配: ${node.name}` };
    }

    // 在草稿上验证撤销结果，避免破坏已分配路径
    const draft = state.clone();
    draft.setRank(graphId, nodeId, currentRank - 1, graph.version);

    const orphanCheck = checkNoOrphans(graph, draft);
    if (!orphanCheck.ok) {
      return {
        ok: false,
        reason: AllocationReject.WOULD_ORPHAN,
        message: `撤销会使节点失去前置或连接: ${orphanCheck.orphanId}`,
        orphanId: orphanCheck.orphanId
      };
    }

    state.replaceWith(draft);
    this.getLedger(characterId).refund(this._singleRankCosts(graph, node));
    this.syncEffectSource(characterId, graphId);

    this.onEvent('nodeDeallocated', { characterId, graphId, nodeId, rank: currentRank - 1 });
    return { ok: true, rank: currentRank - 1 };
  }

  /**
   * 重置整张图并返还全部点数
   * @param {string} characterId
   * @param {string} graphId
   * @returns {{ok: boolean, refunded?: Object}}
   */
  resetGraph(characterId, graphId) {
    const graph = this.getGraph(graphId);
    if (!graph) return { ok: false, reason: AllocationReject.NODE_NOT_FOUND };

    const state = this.getState(characterId);
    const ledger = this.getLedger(characterId);
    const refunded = {};

    for (const { nodeId, rank } of state.getAllocations(graphId)) {
      const node = graph.getNode(nodeId);
      if (!node) continue;
      const costs = node.getCostsAtRank(rank);
      const effective = Object.keys(costs).length > 0 ? costs : { [graph.pointPool]: rank };
      for (const [pool, amount] of Object.entries(effective)) {
        refunded[pool] = (refunded[pool] || 0) + amount;
      }
    }

    state.clearGraph(graphId);
    ledger.refund(refunded);
    this.syncEffectSource(characterId, graphId);

    this.onEvent('graphReset', { characterId, graphId, refunded });
    return { ok: true, refunded };
  }

  /**
   * 单级消耗：节点未声明 costs 时按图的点数池扣 1 点
   * @private
   * @param {GraphDefinition} graph
   * @param {NodeDefinition} node
   * @returns {Object}
   */
  _singleRankCosts(graph, node) {
    if (Object.keys(node.costs).length > 0) return { ...node.costs };
    return { [graph.pointPool]: 1 };
  }

  // ---------------- 效果同步 ----------------

  /**
   * 把某角色在某图的全部已分配效果同步为一个 EffectResolver 来源
   * @param {string} characterId
   * @param {string} graphId
   * @returns {string} 来源标识
   */
  syncEffectSource(characterId, graphId) {
    const graph = this.getGraph(graphId);
    const sourceId = `progression:${graphId}`;
    if (!graph) return sourceId;

    const state = this.getState(characterId);
    const allocations = state.getAllocations(graphId);

    if (allocations.length === 0) {
      this.effectResolver.removeSource(characterId, sourceId);
      return sourceId;
    }

    const effects = [];
    for (const { nodeId, rank } of allocations) {
      const node = graph.getNode(nodeId);
      if (!node) continue;
      for (const effect of node.getEffectsAtRank(rank)) {
        effects.push({ ...effect, stackGroup: effect.stackGroup || null });
      }
    }

    this.effectResolver.addSource(characterId, new EffectSource({
      id: sourceId,
      kind: SOURCE_KIND_BY_MODE[graph.mode] || EffectSourceKind.OTHER,
      effects
    }));

    return sourceId;
  }

  /**
   * 同步角色全部图的效果来源（存档恢复后调用）
   * @param {string} characterId
   */
  syncAllEffectSources(characterId) {
    for (const graph of this.getAllGraphs()) {
      this.syncEffectSource(characterId, graph.id);
    }
  }

  // ---------------- 查询 ----------------

  /**
   * 获取图内可分配节点标识列表
   * @param {string} characterId
   * @param {string} graphId
   * @param {Object} [context]
   * @returns {Array<string>}
   */
  getAllocatableNodes(characterId, graphId, context = {}) {
    const graph = this.getGraph(graphId);
    if (!graph) return [];
    return graph.getAllNodes()
      .filter(node => this.previewAllocate(characterId, graphId, node.id, context).ok)
      .map(node => node.id);
  }

  /**
   * 获取图内已投入点数
   * @param {string} characterId
   * @param {string} graphId
   * @param {string} [region] - 指定区域时只统计该区域
   * @returns {number}
   */
  getSpentPoints(characterId, graphId, region = null) {
    const graph = this.getGraph(graphId);
    if (!graph) return 0;
    const state = this.getState(characterId);
    return region
      ? countSpentInRegion(graph, state, region)
      : countSpentInGraph(graph, state);
  }

  /**
   * 获取角色已解锁的主动技能标识（供 AbilitySystem 使用）
   * @param {string} characterId
   * @returns {Array<string>}
   */
  getUnlockedSkills(characterId) {
    return this.effectResolver.getUnlockedSkills(characterId);
  }

  /**
   * 生成 UI 视图模型：节点定义 + 当前等级 + 可否分配
   * @param {string} characterId
   * @param {string} graphId
   * @param {Object} [context]
   * @returns {Object|null}
   */
  getViewModel(characterId, graphId, context = {}) {
    const graph = this.getGraph(graphId);
    if (!graph) return null;

    const state = this.getState(characterId);
    const ledger = this.getLedger(characterId);

    return {
      graphId: graph.id,
      mode: graph.mode,
      version: graph.version,
      pointPool: graph.pointPool,
      availablePoints: ledger.getAvailable(graph.pointPool),
      spentPoints: countSpentInGraph(graph, state),
      startNodes: [...graph.startNodes],
      edges: graph.edges.map(e => [e[0], e[1]]),
      nodes: graph.getAllNodes().map(node => {
        const rank = state.getRank(graph.id, node.id);
        const preview = this.previewAllocate(characterId, graph.id, node.id, context);
        return {
          id: node.id,
          name: node.name,
          description: node.description,
          kind: node.kind,
          region: node.region,
          position: { ...node.position },
          rank,
          maxRank: node.maxRank,
          allocated: rank > 0,
          canAllocate: preview.ok,
          rejectReason: preview.ok ? null : preview.reason
        };
      })
    };
  }

  // ---------------- 序列化 ----------------

  /**
   * 序列化角色成长数据（存档）
   * @param {string} characterId
   * @returns {Object}
   */
  serializeCharacter(characterId) {
    const operations = this.pointGrantOperations.get(characterId) || new Map();
    return {
      state: this.getState(characterId).serialize(),
      ledger: this.getLedger(characterId).serialize(),
      pointGrantOperations: [...operations.entries()].map(([operationId, entry]) => ({
        operationId,
        fingerprint: entry.fingerprint,
        result: { ...entry.result }
      }))
    };
  }

  /**
   * 从存档恢复角色成长数据，恢复后重新同步效果来源
   * @param {string} characterId
   * @param {Object} data
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  deserializeCharacter(characterId, data) {
    if (!data || !data.state) {
      return { ok: false, errors: [{ code: 'missingField', path: 'state', message: '缺少成长状态' }] };
    }

    const errors = [];
    const state = ProgressionState.deserialize(data.state);
    const operations = new Map();
    for (const [index, entry] of (data.pointGrantOperations || []).entries()) {
      if (!entry?.operationId || typeof entry.fingerprint !== 'string' || entry.result?.ok !== true) {
        errors.push({
          code: 'invalidPointGrantOperation',
          path: `pointGrantOperations[${index}]`,
          message: '成长点奖励幂等记录无效'
        });
        continue;
      }
      if (operations.has(entry.operationId)) {
        errors.push({
          code: 'duplicateOperation',
          path: `pointGrantOperations[${index}].operationId`,
          message: `重复的成长点奖励 operationId: ${entry.operationId}`
        });
        continue;
      }
      operations.set(entry.operationId, {
        fingerprint: entry.fingerprint,
        result: { ...entry.result }
      });
    }

    // 版本不一致时报告，交由上层迁移器处理
    for (const [graphId, graphData] of state.graphs) {
      const graph = this.getGraph(graphId);
      if (!graph) {
        errors.push({ code: 'invalidReference', path: `graphs.${graphId}`, message: '存档引用了未注册的成长图' });
        continue;
      }
      if (graphData.version !== graph.version) {
        errors.push({
          code: 'versionMismatch',
          path: `graphs.${graphId}.version`,
          message: `存档版本 ${graphData.version} 与当前图版本 ${graph.version} 不一致`
        });
      }
    }

    if (errors.length > 0) return { ok: false, errors };

    this.states.set(characterId, state);
    this.ledgers.set(characterId, PointLedger.deserialize(data.ledger));
    this.pointGrantOperations.set(characterId, operations);
    this.syncAllEffectSources(characterId);

    return { ok: true, errors: [] };
  }
}

export { GraphMode, PointPool };
export default ProgressionGraphSystem;
