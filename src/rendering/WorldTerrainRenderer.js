/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-16
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

import { ShapeRenderer } from './ShapeRenderer.js';

/**
 * WorldTerrainRenderer - 全局地形渲染器
 *
 * 渲染跨 chunk 连续的世界地形（shape 定义，世界坐标）。
 * 按相机视口裁剪，只画可见区域内的 shape，保证大地图下的渲染性能。
 *
 * 地形数据来自 GameProject.worldTerrains[terrainId]：
 *   { shapes: Shape[], backgroundColor: string }
 * shape 使用世界坐标定义，天然跨 chunk 无缝。
 *
 * 性能策略：
 * - 空间网格索引（gridCellSize）加速视口裁剪
 * - 静态 shape 离屏缓存（per-chunk 级别，可选）
 */
export class WorldTerrainRenderer {
  /**
   * @param {Object} options
   * @param {Array} [options.shapes] - 地形 shape 数组（世界坐标）
   * @param {string} [options.backgroundColor] - 全局背景色
   * @param {number} [options.gridCellSize=512] - 空间索引格子大小
   * @param {Object} [options.resolver] - ShapeRenderer 资源解析器
   */
  constructor(options = {}) {
    this.shapes = options.shapes || [];
    this.backgroundColor = options.backgroundColor || '#1a2a1a';
    this.gridCellSize = options.gridCellSize || 512;
    this.resolver = options.resolver || null;

    // 空间网格索引：gridKey -> shape[]
    this._grid = new Map();
    this._buildSpatialIndex();
  }

  /**
   * 设置地形数据
   * @param {Object} terrainData - { shapes, backgroundColor }
   */
  setTerrainData(terrainData) {
    if (!terrainData) return;
    this.shapes = terrainData.shapes || [];
    this.backgroundColor = terrainData.backgroundColor || this.backgroundColor;
    this._buildSpatialIndex();
  }

  /**
   * 设置资源解析器
   * @param {Object} resolver - { getImage(key), getSliceSource(shape) }
   */
  setResolver(resolver) {
    this.resolver = resolver;
  }

  /**
   * 构建空间网格索引
   * @private
   */
  _buildSpatialIndex() {
    this._grid.clear();
    const cellSize = this.gridCellSize;

    for (const shape of this.shapes) {
      const bounds = this._getShapeBounds(shape);
      if (!bounds) continue;

      const startCol = Math.floor(bounds.left / cellSize);
      const endCol = Math.floor(bounds.right / cellSize);
      const startRow = Math.floor(bounds.top / cellSize);
      const endRow = Math.floor(bounds.bottom / cellSize);

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const key = `${c},${r}`;
          if (!this._grid.has(key)) this._grid.set(key, []);
          this._grid.get(key).push(shape);
        }
      }
    }
  }

  /**
   * 获取 shape 的 AABB 包围盒
   * @private
   */
  _getShapeBounds(shape) {
    const x = shape.x || 0;
    const y = shape.y || 0;
    const w = shape.width || 0;
    const h = shape.height || 0;

    if (shape.shapeType === 'polygon' || shape.shapeType === 'path') {
      if (!shape.points || shape.points.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of shape.points) {
        const wx = x + px;
        const wy = y + py;
        if (wx < minX) minX = wx;
        if (wy < minY) minY = wy;
        if (wx > maxX) maxX = wx;
        if (wy > maxY) maxY = wy;
      }
      return { left: minX, top: minY, right: maxX, bottom: maxY };
    }

    return { left: x, top: y, right: x + w, bottom: y + h };
  }

  /**
   * 查询视口内的 shape（使用空间索引加速）
   * @param {{left, top, right, bottom}} viewBounds - 相机视口（世界坐标）
   * @returns {Array} 可能可见的 shape 列表（可能有少量重复，但无大影响）
   */
  queryVisible(viewBounds) {
    const cellSize = this.gridCellSize;
    const startCol = Math.floor(viewBounds.left / cellSize);
    const endCol = Math.floor(viewBounds.right / cellSize);
    const startRow = Math.floor(viewBounds.top / cellSize);
    const endRow = Math.floor(viewBounds.bottom / cellSize);

    const seen = new Set();
    const result = [];

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const key = `${c},${r}`;
        const shapes = this._grid.get(key);
        if (!shapes) continue;
        for (const shape of shapes) {
          if (!seen.has(shape)) {
            seen.add(shape);
            result.push(shape);
          }
        }
      }
    }

    return result;
  }

  /**
   * 渲染地形（只画视口内可见的 shape）
   * 调用前 ctx 应已应用相机 translate（世界坐标系）
   * @param {CanvasRenderingContext2D} ctx
   * @param {{left, top, right, bottom}} viewBounds - 相机视口
   */
  render(ctx, viewBounds) {
    // 全局背景色
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(viewBounds.left, viewBounds.top,
      viewBounds.right - viewBounds.left,
      viewBounds.bottom - viewBounds.top);

    // 渲染可见 shape
    const visible = this.queryVisible(viewBounds);
    for (const shape of visible) {
      ShapeRenderer.render(ctx, shape, this.resolver);
    }
  }

  /**
   * 添加 shape 到地形
   * @param {Object} shape
   */
  addShape(shape) {
    this.shapes.push(shape);
    // 增量更新索引
    const bounds = this._getShapeBounds(shape);
    if (!bounds) return;
    const cellSize = this.gridCellSize;
    const startCol = Math.floor(bounds.left / cellSize);
    const endCol = Math.floor(bounds.right / cellSize);
    const startRow = Math.floor(bounds.top / cellSize);
    const endRow = Math.floor(bounds.bottom / cellSize);
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const key = `${c},${r}`;
        if (!this._grid.has(key)) this._grid.set(key, []);
        this._grid.get(key).push(shape);
      }
    }
  }

  /**
   * 清空地形数据
   */
  clear() {
    this.shapes = [];
    this._grid.clear();
  }
}

export default WorldTerrainRenderer;
