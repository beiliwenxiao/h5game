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
 * ProgressionViewModel.js
 * 成长系统 UI 视图模型。
 *
 * 职责边界：
 *   - 只读聚合 ProgressionGraphSystem 的状态，供 UI 渲染
 *   - UI 通过本层提交分配、撤销、重置命令，不直接改状态或点数
 *   - 页签顺序与可见性由 ProgressionProfile 决定
 *
 * 桌面与移动端共用同一 ViewModel，只在面板布局与输入映射上分流。
 */

import { KIND_TO_MODE, KIND_TO_POOL } from '../../systems/progression/ProgressionProfile.js';

/** 页签显示名 */
const TAB_LABELS = {
  skillTree: '技能',
  talentTree: '职业天赋',
  unitTalent: '兵种天赋',
  passiveBoard: '天赋盘'
};

export class ProgressionViewModel {
  /**
   * @param {Object} config
   * @param {ProgressionGraphSystem} config.progressionSystem
   * @param {Function} [config.resolveGraphId] - (kind, character) => string|null
   * @param {Function} [config.onChange] - 状态变化通知，UI 用于重绘
   */
  constructor(config = {}) {
    this.progressionSystem = config.progressionSystem || null;
    this.onChange = config.onChange || (() => {});

    this.resolveGraphId = config.resolveGraphId || ((kind, character) => {
      const mode = KIND_TO_MODE[kind];
      if (!mode || !this.progressionSystem) return null;

      // 项目配置可以为每种成长结构指定图；仅接受模式匹配的有效图，避免错误配置破坏回退策略。
      const configuredGraphId = this.profile?.graphIds?.[kind];
      const configuredGraph = configuredGraphId
        ? this.progressionSystem.getGraph(configuredGraphId)
        : null;
      if (configuredGraph?.mode === mode) return configuredGraph.id;

      const graphs = this.progressionSystem.getGraphsByMode(mode);
      if (graphs.length === 0) return null;

      // 优先匹配 <职业>-<后缀> 命名，其次取该模式下第一张图。
      const className = character && character.class;
      if (className) {
        const matched = graphs.find(g => g.id.startsWith(`${className}-`));
        if (matched) return matched.id;
      }
      return graphs[0].id;
    });

    this.character = null;
    this.activeTab = null;
  }

  /** 当前 Profile */
  get profile() {
    return this.progressionSystem ? this.progressionSystem.profile : null;
  }

  /**
   * 绑定角色，并把默认页签设为 Profile 指定的主要成长
   * @param {Object} character
   */
  setCharacter(character) {
    this.character = character;
    const tabs = this.getTabs();
    this.activeTab = tabs.length > 0 ? tabs[0].kind : null;
    this.onChange();
  }

  /**
   * 解析角色标识
   * @private
   */
  _characterId() {
    const c = this.character;
    if (!c) return 'unknown-character';
    return String(c.id || c.characterId || c.name || 'default-character');
  }

  /**
   * 条件求值上下文
   * @private
   */
  _context() {
    return { characterLevel: this.character && this.character.level ? this.character.level : 1 };
  }

  /**
   * 获取页签列表。主要成长排在首位，未启用的结构不出现。
   * @returns {Array<{kind: string, label: string, primary: boolean, graphId: string|null, available: boolean, availablePoints: number}>}
   */
  getTabs() {
    const profile = this.profile;
    if (!profile || !this.progressionSystem) return [];

    const characterId = this._characterId();
    const ledger = this.progressionSystem.getLedger(characterId);

    return profile.getTabOrder().map(kind => {
      const graphId = this.resolveGraphId(kind, this.character);
      const pool = KIND_TO_POOL[kind];
      return {
        kind,
        label: TAB_LABELS[kind] || kind,
        primary: profile.isPrimary(kind),
        graphId,
        available: graphId !== null,
        availablePoints: pool ? ledger.getAvailable(pool) : 0
      };
    });
  }

  /**
   * 切换页签
   * @param {string} kind
   * @returns {boolean} 是否成功切换
   */
  setActiveTab(kind) {
    const tab = this.getTabs().find(t => t.kind === kind);
    if (!tab) return false;
    this.activeTab = kind;
    this.onChange();
    return true;
  }

  /** 当前页签对应的图标识 */
  getActiveGraphId() {
    if (!this.activeTab) return null;
    return this.resolveGraphId(this.activeTab, this.character);
  }

  /**
   * 获取当前页签的图视图
   * @returns {Object|null}
   */
  getActiveGraphView() {
    const graphId = this.getActiveGraphId();
    if (!graphId || !this.progressionSystem) return null;
    return this.progressionSystem.getViewModel(this._characterId(), graphId, this._context());
  }

  /**
   * 获取指定节点的详情，用于悬浮提示
   * @param {string} nodeId
   * @returns {Object|null}
   */
  getNodeDetail(nodeId) {
    const graphId = this.getActiveGraphId();
    if (!graphId || !this.progressionSystem) return null;

    const graph = this.progressionSystem.getGraph(graphId);
    const node = graph ? graph.getNode(nodeId) : null;
    if (!node) return null;

    const characterId = this._characterId();
    const rank = this.progressionSystem.getRank(characterId, graphId, nodeId);
    const preview = this.progressionSystem.previewAllocate(characterId, graphId, nodeId, this._context());

    return {
      id: node.id,
      name: node.name,
      description: node.description,
      kind: node.kind,
      region: node.region,
      rank,
      maxRank: node.maxRank,
      costs: node.getCostsAtRank(1),
      currentEffects: node.getEffectsAtRank(rank),
      nextEffects: rank < node.maxRank ? node.getEffectsAtRank(rank + 1) : null,
      canAllocate: preview.ok,
      rejectReason: preview.ok ? null : preview.reason,
      rejectMessage: preview.ok ? null : preview.message,
      choiceGroup: node.choiceGroup,
      gates: { ...node.gates }
    };
  }

  /**
   * 提交分配命令
   * @param {string} nodeId
   * @returns {Object} 分配结果
   */
  allocate(nodeId) {
    const graphId = this.getActiveGraphId();
    if (!graphId) return { ok: false, message: '未选择成长结构' };

    const result = this.progressionSystem.allocateNode(
      this._characterId(), graphId, nodeId, this._context()
    );
    if (result.ok) this.onChange();
    return result;
  }

  /**
   * 提交撤销命令
   * @param {string} nodeId
   * @returns {Object}
   */
  deallocate(nodeId) {
    const graphId = this.getActiveGraphId();
    if (!graphId) return { ok: false, message: '未选择成长结构' };

    const result = this.progressionSystem.deallocateNode(this._characterId(), graphId, nodeId);
    if (result.ok) this.onChange();
    return result;
  }

  /**
   * 重置当前页签的整张图
   * @returns {Object}
   */
  resetActiveGraph() {
    const graphId = this.getActiveGraphId();
    if (!graphId) return { ok: false, message: '未选择成长结构' };

    const result = this.progressionSystem.resetGraph(this._characterId(), graphId);
    if (result.ok) this.onChange();
    return result;
  }

  /**
   * 获取全部未分配点数，用于 HUD 提示。
   * 主要成长结构排在首位。
   * @returns {Array<{kind: string, label: string, points: number, primary: boolean}>}
   */
  getPendingPoints() {
    return this.getTabs()
      .filter(tab => tab.availablePoints > 0)
      .map(tab => ({
        kind: tab.kind,
        label: tab.label,
        points: tab.availablePoints,
        primary: tab.primary
      }));
  }

  /** 是否存在任何未分配点数（HUD 红点） */
  hasPendingPoints() {
    return this.getPendingPoints().length > 0;
  }
}

export default ProgressionViewModel;
