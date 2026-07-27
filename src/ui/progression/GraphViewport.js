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
 * GraphViewport.js
 * 成长图视口：缩放、平移、坐标换算与可见节点裁剪。
 *
 * 天赋盘节点数量较多，渲染必须只处理可见节点，
 * 因此裁剪结果按视口状态缓存，状态未变时不重复计算。
 */

export class GraphViewport {
  /**
   * @param {Object} [config]
   * @param {number} [config.width] - 视口宽度（像素）
   * @param {number} [config.height] - 视口高度
   * @param {number} [config.nodeSpacing] - 节点栅格间距
   * @param {number} [config.nodeRadius] - 节点半径，用于裁剪外扩
   * @param {number} [config.minScale]
   * @param {number} [config.maxScale]
   */
  constructor(config = {}) {
    this.width = config.width || 800;
    this.height = config.height || 600;
    this.nodeSpacing = config.nodeSpacing || 70;
    this.nodeRadius = config.nodeRadius || 18;

    this.minScale = config.minScale || 0.5;
    this.maxScale = config.maxScale || 2.0;

    this.scale = config.scale || 1.0;
    this.offsetX = 0;
    this.offsetY = 0;

    this._cacheKey = null;
    this._cacheResult = null;
  }

  /** 视口状态签名，用于裁剪缓存 */
  _stateKey(nodeCount) {
    return `${this.scale}|${this.offsetX}|${this.offsetY}|${this.width}|${this.height}|${nodeCount}`;
  }

  /** 使裁剪缓存失效 */
  invalidate() {
    this._cacheKey = null;
    this._cacheResult = null;
  }

  /**
   * 设置视口尺寸
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.invalidate();
  }

  /**
   * 缩放，围绕视口中心
   * @param {number} delta - 缩放增量
   */
  zoomBy(delta) {
    const next = Math.max(this.minScale, Math.min(this.maxScale, this.scale + delta));
    if (next === this.scale) return;
    this.scale = next;
    this.invalidate();
  }

  /**
   * 直接设置缩放
   * @param {number} scale
   */
  setScale(scale) {
    const next = Math.max(this.minScale, Math.min(this.maxScale, scale));
    if (next === this.scale) return;
    this.scale = next;
    this.invalidate();
  }

  /**
   * 平移
   * @param {number} dx
   * @param {number} dy
   */
  panBy(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
    this.invalidate();
  }

  /** 重置视口 */
  reset() {
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.invalidate();
  }

  /**
   * 节点栅格坐标 → 视口内屏幕坐标
   * @param {{x: number, y: number}} position
   * @returns {{x: number, y: number}}
   */
  toScreen(position) {
    return {
      x: (position.x * this.nodeSpacing + this.offsetX) * this.scale,
      y: (position.y * this.nodeSpacing + this.offsetY) * this.scale
    };
  }

  /**
   * 视口内屏幕坐标 → 节点栅格坐标
   * @param {number} screenX
   * @param {number} screenY
   * @returns {{x: number, y: number}}
   */
  toGraph(screenX, screenY) {
    return {
      x: (screenX / this.scale - this.offsetX) / this.nodeSpacing,
      y: (screenY / this.scale - this.offsetY) / this.nodeSpacing
    };
  }

  /**
   * 把指定节点栅格坐标居中显示
   * @param {{x: number, y: number}} position
   */
  centerOn(position) {
    this.offsetX = this.width / (2 * this.scale) - position.x * this.nodeSpacing;
    this.offsetY = this.height / (2 * this.scale) - position.y * this.nodeSpacing;
    this.invalidate();
  }

  /**
   * 自动缩放平移以容纳全部节点
   * @param {Array<{position: {x: number, y: number}}>} nodes
   * @param {number} [padding] - 边距像素
   */
  fitToNodes(nodes = [], padding = 40) {
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x);
      maxY = Math.max(maxY, node.position.y);
    }

    const spanX = (maxX - minX) * this.nodeSpacing + this.nodeRadius * 2;
    const spanY = (maxY - minY) * this.nodeSpacing + this.nodeRadius * 2;

    const scaleX = (this.width - padding * 2) / Math.max(1, spanX);
    const scaleY = (this.height - padding * 2) / Math.max(1, spanY);
    this.setScale(Math.min(scaleX, scaleY));

    this.centerOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  }

  /**
   * 判断节点是否落在视口内（含半径外扩）
   * @param {{x: number, y: number}} position
   * @returns {boolean}
   */
  isVisible(position) {
    const screen = this.toScreen(position);
    const margin = this.nodeRadius * this.scale + 2;
    return screen.x >= -margin && screen.x <= this.width + margin
      && screen.y >= -margin && screen.y <= this.height + margin;
  }

  /**
   * 裁剪出可见节点与可见连线，结果按视口状态缓存。
   *
   * @param {Array<Object>} nodes - 视图节点，需含 id 与 position
   * @param {Array<Array<string>>} [edges]
   * @returns {{nodes: Array<Object>, edges: Array<Array<string>>}}
   */
  cull(nodes = [], edges = []) {
    const key = this._stateKey(nodes.length);
    if (this._cacheKey === key && this._cacheResult) return this._cacheResult;

    const visibleNodes = [];
    const visibleIds = new Set();

    for (const node of nodes) {
      if (!node || !node.position) continue;
      if (!this.isVisible(node.position)) continue;
      visibleNodes.push(node);
      visibleIds.add(node.id);
    }

    // 连线只要有一端可见就绘制，避免边界处出现断线
    const visibleEdges = edges.filter(([a, b]) => visibleIds.has(a) || visibleIds.has(b));

    this._cacheKey = key;
    this._cacheResult = { nodes: visibleNodes, edges: visibleEdges };
    return this._cacheResult;
  }

  /**
   * 命中测试：返回屏幕坐标下最近的节点
   * @param {Array<Object>} nodes
   * @param {number} screenX
   * @param {number} screenY
   * @returns {Object|null}
   */
  hitTest(nodes = [], screenX, screenY) {
    const radius = this.nodeRadius * this.scale;
    let best = null;
    let bestDist = Infinity;

    for (const node of nodes) {
      if (!node || !node.position) continue;
      const screen = this.toScreen(node.position);
      const dx = screen.x - screenX;
      const dy = screen.y - screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius && dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    }

    return best;
  }

  /** 序列化视口状态，供 UI 记住上次浏览位置 */
  serialize() {
    return { scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY };
  }

  /**
   * 恢复视口状态
   * @param {Object} data
   */
  deserialize(data) {
    if (!data) return;
    if (typeof data.scale === 'number') this.setScale(data.scale);
    if (typeof data.offsetX === 'number') this.offsetX = data.offsetX;
    if (typeof data.offsetY === 'number') this.offsetY = data.offsetY;
    this.invalidate();
  }
}

export default GraphViewport;
