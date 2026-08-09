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
 * ProgressionPanel.js
 * 统一「角色成长」面板：技能、职业天赋、兵种天赋、天赋盘共用一个入口。
 *
 * 设计约束：
 *   - 只读 ProgressionViewModel，不直接修改成长状态或点数
 *   - 页签由 ProgressionProfile 决定，主要成长默认选中
 *   - 大图使用 GraphViewport 做缩放平移与可见节点裁剪
 *   - 桌面与移动端共用逻辑，仅通过配置调整布局与交互阈值
 */

import { UIElement } from '../UIElement.js';
import { GraphViewport } from './GraphViewport.js';
import { NodeKind } from '../../systems/progression/NodeDefinition.js';

/** 节点类型对应的视觉尺寸倍率 */
const KIND_SIZE = {
  [NodeKind.START]: 1.4,
  [NodeKind.KEYSTONE]: 1.5,
  [NodeKind.NOTABLE]: 1.25,
  [NodeKind.MASTERY]: 1.25,
  [NodeKind.SOCKET]: 1.1,
  [NodeKind.ACTIVE_SKILL]: 1.2
};

export class ProgressionPanel extends UIElement {
  /**
   * @param {Object} config
   * @param {ProgressionViewModel} config.viewModel
   * @param {boolean} [config.isMobile] - 移动端布局
   */
  constructor(config = {}) {
    super({
      x: config.x !== undefined ? config.x : 60,
      y: config.y !== undefined ? config.y : 40,
      width: config.width || 800,
      height: config.height || 560,
      visible: false,
      zIndex: config.zIndex || 100
    });

    this.viewModel = config.viewModel || null;
    this.isMobile = !!config.isMobile;

    this.tabHeight = 36;
    this.footerHeight = 44;
    this.infoWidth = this.isMobile ? 0 : 220;

    this.viewport = new GraphViewport({
      width: this.width - this.infoWidth,
      height: this.height - this.tabHeight - this.footerHeight,
      nodeSpacing: config.nodeSpacing || 70,
      nodeRadius: config.nodeRadius || 18
    });

    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this.statusMessage = '';

    // 拖拽平移状态
    this._dragging = false;
    this._dragStart = null;
    this._dragMoved = false;
    // 移动端需要二次确认，避免误点消耗点数
    this.requireConfirm = this.isMobile;
    this._pendingConfirmId = null;

    if (this.viewModel) {
      this.viewModel.onChange = () => this.onStateChanged();
    }
  }

  /** 成长状态变化时刷新裁剪缓存 */
  onStateChanged() {
    this.viewport.invalidate();
  }

  /** 面板绘图区域原点 */
  get graphOrigin() {
    return { x: this.x, y: this.y + this.tabHeight };
  }

  show() {
    super.show();
    const view = this.viewModel ? this.viewModel.getActiveGraphView() : null;
    if (view && view.nodes.length > 0) this.viewport.fitToNodes(view.nodes);
  }

  hide() {
    super.hide();
    this._dragging = false;
    this._pendingConfirmId = null;
  }

  /**
   * 切换页签，切换后自动适配视口
   * @param {string} kind
   * @returns {boolean}
   */
  switchTab(kind) {
    if (!this.viewModel) return false;
    if (!this.viewModel.setActiveTab(kind)) return false;

    this.selectedNodeId = null;
    this._pendingConfirmId = null;
    this.viewport.reset();

    const view = this.viewModel.getActiveGraphView();
    if (view && view.nodes.length > 0) this.viewport.fitToNodes(view.nodes);
    return true;
  }

  /**
   * 获取页签矩形区域
   * @returns {Array<{kind: string, x: number, y: number, width: number, height: number, tab: Object}>}
   */
  getTabRects() {
    if (!this.viewModel) return [];
    const tabs = this.viewModel.getTabs();
    if (tabs.length === 0) return [];

    const tabWidth = this.width / tabs.length;
    return tabs.map((tab, index) => ({
      kind: tab.kind,
      tab,
      x: this.x + index * tabWidth,
      y: this.y,
      width: tabWidth,
      height: this.tabHeight
    }));
  }

  /** 视口区域（屏幕坐标） */
  getViewportRect() {
    const origin = this.graphOrigin;
    return {
      x: origin.x,
      y: origin.y,
      width: this.width - this.infoWidth,
      height: this.height - this.tabHeight - this.footerHeight
    };
  }

  /**
   * 屏幕坐标是否落在视口内
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isPointInViewport(x, y) {
    const rect = this.getViewportRect();
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  /**
   * 命中测试节点
   * @param {number} x - 屏幕坐标
   * @param {number} y
   * @returns {Object|null}
   */
  getNodeAt(x, y) {
    if (!this.viewModel || !this.isPointInViewport(x, y)) return null;

    const view = this.viewModel.getActiveGraphView();
    if (!view) return null;

    const rect = this.getViewportRect();
    const visible = this.viewport.cull(view.nodes, view.edges);
    return this.viewport.hitTest(visible.nodes, x - rect.x, y - rect.y);
  }

  // ---------------- 交互 ----------------

  /**
   * 处理点击
   * @param {number} x
   * @param {number} y
   * @param {string} [button] - 'left' | 'right'
   * @returns {boolean} 是否消费了本次点击
   */
  handleClick(x, y, button = 'left') {
    if (!this.visible || !this.isPointInside(x, y)) return false;

    // 页签
    for (const rect of this.getTabRects()) {
      if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
        if (rect.tab.available) this.switchTab(rect.kind);
        else this.statusMessage = '该成长结构当前不可用';
        return true;
      }
    }

    // 底部按钮
    if (this._isPointInResetButton(x, y)) {
      this._handleReset();
      return true;
    }

    const node = this.getNodeAt(x, y);
    if (!node) {
      // 点击空白只清除选中，仍消费点击避免穿透到游戏世界
      this.selectedNodeId = null;
      this._pendingConfirmId = null;
      return true;
    }

    // 右键撤销，左键分配
    if (button === 'right') this._handleDeallocate(node);
    else this._handleAllocate(node);

    return true;
  }

  /**
   * 与 UIClickHandler 对齐的入口
   * @param {number} x
   * @param {number} y
   * @param {string} button
   * @returns {boolean}
   */
  handleMouseClick(x, y, button = 'left') {
    return this.handleClick(x, y, button);
  }

  /**
   * 分配节点。移动端需要二次确认。
   * @private
   */
  _handleAllocate(node) {
    this.selectedNodeId = node.id;

    if (this.requireConfirm && this._pendingConfirmId !== node.id) {
      this._pendingConfirmId = node.id;
      this.statusMessage = `再次点击确认投入：${node.name}`;
      return;
    }

    this._pendingConfirmId = null;
    const result = this.viewModel.allocate(node.id);
    this.statusMessage = result.ok
      ? `已投入：${node.name}（${result.rank}/${node.maxRank}）`
      : (result.message || '无法投入该节点');
  }

  /**
   * 撤销节点
   * @private
   */
  _handleDeallocate(node) {
    this.selectedNodeId = node.id;
    this._pendingConfirmId = null;

    const result = this.viewModel.deallocate(node.id);
    this.statusMessage = result.ok
      ? `已撤销：${node.name}`
      : (result.message || '无法撤销该节点');
  }

  /**
   * 重置当前图
   * @private
   */
  _handleReset() {
    const result = this.viewModel.resetActiveGraph();
    if (result.ok) {
      this.selectedNodeId = null;
      const refunded = Object.entries(result.refunded || {})
        .map(([pool, amount]) => `${pool} ${amount}`)
        .join('，');
      this.statusMessage = refunded ? `已重置，返还 ${refunded}` : '已重置';
    } else {
      this.statusMessage = result.message || '无法重置';
    }
  }

  /**
   * 悬浮处理
   * @param {number} x
   * @param {number} y
   */
  handleMouseMove(x, y) {
    if (!this.visible) return;

    if (this._dragging && this._dragStart) {
      const dx = (x - this._dragStart.x) / this.viewport.scale;
      const dy = (y - this._dragStart.y) / this.viewport.scale;
      if (Math.abs(x - this._dragStart.x) > 3 || Math.abs(y - this._dragStart.y) > 3) {
        this._dragMoved = true;
      }
      this.viewport.panBy(dx, dy);
      this._dragStart = { x, y };
      return;
    }

    const node = this.getNodeAt(x, y);
    this.hoveredNodeId = node ? node.id : null;
  }

  /**
   * 开始拖拽平移
   * @param {number} x
   * @param {number} y
   * @returns {boolean} 是否进入拖拽
   */
  beginDrag(x, y) {
    if (!this.visible || !this.isPointInViewport(x, y)) return false;
    this._dragging = true;
    this._dragMoved = false;
    this._dragStart = { x, y };
    return true;
  }

  /**
   * 结束拖拽
   * @returns {boolean} 本次是否发生了实际拖动（用于抑制误触发点击）
   */
  endDrag() {
    const moved = this._dragMoved;
    this._dragging = false;
    this._dragStart = null;
    this._dragMoved = false;
    return moved;
  }

  /**
   * 缩放
   * @param {number} delta
   */
  handleZoom(delta) {
    if (!this.visible) return;
    this.viewport.zoomBy(delta);
  }

  /** 把视口聚焦到指定节点，用于搜索结果定位 */
  focusNode(nodeId) {
    if (!this.viewModel) return false;
    const view = this.viewModel.getActiveGraphView();
    if (!view) return false;

    const node = view.nodes.find(n => n.id === nodeId);
    if (!node) return false;

    this.viewport.centerOn(node.position);
    this.selectedNodeId = nodeId;
    return true;
  }

  /**
   * 按名称搜索节点
   * @param {string} keyword
   * @returns {Array<Object>}
   */
  searchNodes(keyword) {
    if (!this.viewModel || !keyword) return [];
    const view = this.viewModel.getActiveGraphView();
    if (!view) return [];

    const lower = String(keyword).toLowerCase();
    return view.nodes.filter(n =>
      (n.name && n.name.toLowerCase().includes(lower)) || n.id.toLowerCase().includes(lower)
    );
  }

  /** 重置按钮区域 */
  _getResetButtonRect() {
    return {
      x: this.x + this.width - 110,
      y: this.y + this.height - this.footerHeight + 8,
      width: 96,
      height: 28
    };
  }

  /** @private */
  _isPointInResetButton(x, y) {
    const r = this._getResetButtonRect();
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  }

  // ---------------- 渲染 ----------------

  /**
   * 渲染面板
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible || !ctx || !this.viewModel) return;

    ctx.save();
    ctx.globalAlpha = this.alpha;

    this._renderBackground(ctx);
    this._renderTabs(ctx);
    this._renderGraph(ctx);
    if (this.infoWidth > 0) this._renderNodeInfo(ctx);
    this._renderFooter(ctx);

    ctx.restore();
  }

  /** @private */
  _renderBackground(ctx) {
    ctx.fillStyle = 'rgba(18, 18, 24, 0.94)';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.strokeStyle = '#5a4a30';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  }

  /** @private */
  _renderTabs(ctx) {
    for (const rect of this.getTabRects()) {
      const active = rect.kind === this.viewModel.activeTab;

      ctx.fillStyle = active ? '#3a3020' : '#22222c';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeStyle = '#4a3c28';
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

      ctx.fillStyle = rect.tab.available ? (active ? '#ffd479' : '#c8c8c8') : '#666';
      ctx.font = active ? 'bold 14px Arial' : '14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 主要成长结构加标记，未分配点数直接显示在页签上
      const label = rect.tab.primary ? `${rect.tab.label} ★` : rect.tab.label;
      const suffix = rect.tab.availablePoints > 0 ? ` (${rect.tab.availablePoints})` : '';
      ctx.fillText(label + suffix, rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
  }

  /** @private */
  _renderGraph(ctx) {
    const view = this.viewModel.getActiveGraphView();
    const rect = this.getViewportRect();

    if (!view) {
      ctx.fillStyle = '#888';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('当前成长结构不可用', rect.x + rect.width / 2, rect.y + rect.height / 2);
      return;
    }

    // 视口裁剪：只绘制可见节点与连线
    const visible = this.viewport.cull(view.nodes, view.edges);
    const nodeById = new Map(view.nodes.map(n => [n.id, n]));

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.translate(rect.x, rect.y);

    this._renderEdges(ctx, visible.edges, nodeById);
    this._renderNodes(ctx, visible.nodes);

    ctx.restore();
  }

  /** @private */
  _renderEdges(ctx, edges, nodeById) {
    ctx.lineWidth = 2;

    for (const [aId, bId] of edges) {
      const a = nodeById.get(aId);
      const b = nodeById.get(bId);
      if (!a || !b) continue;

      const pa = this.viewport.toScreen(a.position);
      const pb = this.viewport.toScreen(b.position);

      // 两端都已分配的路径高亮，便于看清已走通的线路
      ctx.strokeStyle = (a.allocated && b.allocated) ? '#d8a13a' : '#3c3c46';
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }

  /** @private */
  _renderNodes(ctx, nodes) {
    const baseRadius = this.viewport.nodeRadius * this.viewport.scale;

    for (const node of nodes) {
      const pos = this.viewport.toScreen(node.position);
      const radius = baseRadius * (KIND_SIZE[node.kind] || 1);

      let fill = '#2a2a34';
      if (node.allocated) fill = node.rank >= node.maxRank ? '#c8a13a' : '#7a6a3a';
      else if (node.canAllocate) fill = '#3f5a3f';

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // 核心天赋与插槽用不同描边区分
      if (node.kind === NodeKind.KEYSTONE) ctx.strokeStyle = '#ff7a3a';
      else if (node.kind === NodeKind.SOCKET) ctx.strokeStyle = '#6ac8ff';
      else if (node.id === this.selectedNodeId) ctx.strokeStyle = '#ffffff';
      else if (node.id === this.hoveredNodeId) ctx.strokeStyle = '#ffd479';
      else ctx.strokeStyle = '#4a4a56';

      ctx.lineWidth = (node.id === this.selectedNodeId ? 3 : 2);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 缩放过小时不绘制文字，避免堆叠
      if (this.viewport.scale >= 0.75 && node.maxRank > 1) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(9, Math.round(10 * this.viewport.scale))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${node.rank}/${node.maxRank}`, pos.x, pos.y);
      }
    }
  }

  /** @private */
  _renderNodeInfo(ctx) {
    const infoX = this.x + this.width - this.infoWidth;
    const infoY = this.y + this.tabHeight;
    const infoH = this.height - this.tabHeight - this.footerHeight;

    ctx.fillStyle = 'rgba(30, 30, 38, 0.95)';
    ctx.fillRect(infoX, infoY, this.infoWidth, infoH);
    ctx.strokeStyle = '#4a3c28';
    ctx.strokeRect(infoX, infoY, this.infoWidth, infoH);

    const nodeId = this.hoveredNodeId || this.selectedNodeId;
    const detail = nodeId ? this.viewModel.getNodeDetail(nodeId) : null;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (!detail) {
      ctx.fillStyle = '#888';
      ctx.font = '13px Arial';
      ctx.fillText('选择一个节点查看详情', infoX + 12, infoY + 14);
      return;
    }

    let ty = infoY + 12;
    ctx.fillStyle = '#ffd479';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(detail.name, infoX + 12, ty);
    ty += 22;

    ctx.fillStyle = '#aaa';
    ctx.font = '12px Arial';
    ctx.fillText(`${detail.kind}  ${detail.rank}/${detail.maxRank}`, infoX + 12, ty);
    ty += 20;

    for (const line of this._wrapText(detail.description, 15)) {
      ctx.fillStyle = '#ccc';
      ctx.fillText(line, infoX + 12, ty);
      ty += 16;
    }

    ty += 6;
    const costs = Object.entries(detail.costs || {}).map(([p, a]) => `${p} ${a}`).join('，');
    if (costs) {
      ctx.fillStyle = '#9ad';
      ctx.fillText(`消耗：${costs}`, infoX + 12, ty);
      ty += 18;
    }

    const effectSources = [...new Set((detail.effectExplanations || [])
      .flatMap(explanation => explanation.sources || [])
      .map(source => source.sourceId))];
    if (effectSources.length > 0) {
      ctx.fillStyle = '#8fcf9b';
      for (const line of this._wrapText(`效果来源：${effectSources.join('、')}`, 15)) {
        ctx.fillText(line, infoX + 12, ty);
        ty += 16;
      }
    }

    if (detail.choiceGroup) {
      ctx.fillStyle = '#e8a';
      ctx.fillText('互斥选择节点', infoX + 12, ty);
      ty += 18;
    }

    if (!detail.canAllocate && detail.rejectMessage) {
      ctx.fillStyle = '#f88';
      for (const line of this._wrapText(detail.rejectMessage, 15)) {
        ctx.fillText(line, infoX + 12, ty);
        ty += 16;
      }
    }
  }

  /** @private */
  _renderFooter(ctx) {
    const footerY = this.y + this.height - this.footerHeight;

    ctx.fillStyle = 'rgba(24, 24, 30, 0.95)';
    ctx.fillRect(this.x, footerY, this.width, this.footerHeight);

    ctx.fillStyle = '#ccc';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const view = this.viewModel.getActiveGraphView();
    const summary = view
      ? `已投入 ${view.spentPoints} 级  可用 ${view.availablePoints} 点  缩放 ${this.viewport.scale.toFixed(2)}`
      : '';
    ctx.fillText(summary, this.x + 12, footerY + this.footerHeight / 2);

    if (this.statusMessage) {
      ctx.fillStyle = '#ffd479';
      ctx.fillText(this.statusMessage, this.x + 12, footerY + this.footerHeight / 2 + 14);
    }

    const reset = this._getResetButtonRect();
    ctx.fillStyle = '#4a2a2a';
    ctx.fillRect(reset.x, reset.y, reset.width, reset.height);
    ctx.strokeStyle = '#8a4a4a';
    ctx.strokeRect(reset.x, reset.y, reset.width, reset.height);
    ctx.fillStyle = '#ffb';
    ctx.textAlign = 'center';
    ctx.fillText('重置本页', reset.x + reset.width / 2, reset.y + reset.height / 2);
  }

  /**
   * 按字数折行
   * @private
   * @param {string} text
   * @param {number} perLine
   * @returns {Array<string>}
   */
  _wrapText(text, perLine) {
    if (!text) return [];
    const lines = [];
    for (let i = 0; i < text.length; i += perLine) {
      lines.push(text.slice(i, i + perLine));
    }
    return lines;
  }
}

export default ProgressionPanel;
