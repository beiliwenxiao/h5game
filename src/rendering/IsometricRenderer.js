/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * IsometricRenderer.js
 * 统一渲染系统 - 整合等距视角和原有渲染功能
 * 
 * 功能：
 * - 相机系统（Camera）
 * - 等距坐标转换（世界坐标 ↔ 屏幕坐标）
 * - 深度排序（Y-Sort）
 * - 视锥剔除
 * - 等距网格和地图渲染
 * - 背景缓存优化
 */

import { Camera } from './Camera.js';
import { SpriteRenderer } from './SpriteRenderer.js';

export class IsometricRenderer {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    
    // 画布尺寸
    this.canvasWidth = options.width || 800;
    this.canvasHeight = options.height || 600;
    
    // 等距参数（2:1 比例）
    this.tileWidth = options.tileWidth || 64;
    this.tileHeight = options.tileHeight || 32;
    
    // 相机系统（整合自 RenderSystem）
    this.camera = new Camera(0, 0, this.canvasWidth, this.canvasHeight);
    
    // 精灵渲染器
    this.spriteRenderer = options.assetManager ? new SpriteRenderer(options.assetManager) : null;
    
    // 地图数据
    this.mapData = null;
    this.mapTileset = null;
    
    // 调试模式
    this.debugMode = options.debug || false;
    
    // 网格显示
    this.showGrid = options.showGrid || false;
    this.gridSize = options.gridSize || 20;
    
    // 渲染层（整合自 RenderSystem）
    this.layers = {
      background: [],
      entities: [],
      ui: []
    };
    
    // 背景缓存（整合自 RenderSystem）
    this.backgroundCache = null;
    this.backgroundCacheEnabled = false; // 等距地图不使用缓存
    this.backgroundCacheDirty = true;
  }

  /**
   * 获取相机
   * @returns {Camera}
   */
  getCamera() {
    return this.camera;
  }

  /**
   * 更新渲染系统
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    this.camera.update(deltaTime);
  }

  /**
   * 应用相机变换到 Canvas 上下文
   */
  applyCameraTransform() {
    const viewBounds = this.camera.getViewBounds();
    this.ctx.translate(-viewBounds.left, -viewBounds.top);
  }

  /**
   * 世界坐标转等距屏幕坐标（格子坐标）
   * @param {number} gridX - 格子X坐标
   * @param {number} gridY - 格子Y坐标
   * @returns {{x: number, y: number}} 屏幕坐标
   */
  gridToScreen(gridX, gridY) {
    const screenX = (gridX - gridY) * (this.tileWidth / 2);
    const screenY = (gridX + gridY) * (this.tileHeight / 2);
    return { x: screenX, y: screenY };
  }

  /**
   * 屏幕坐标转格子坐标
   * @param {number} screenX - 屏幕X坐标
   * @param {number} screenY - 屏幕Y坐标
   * @returns {{x: number, y: number}} 格子坐标
   */
  screenToGrid(screenX, screenY) {
    const gridX = (screenX / (this.tileWidth / 2) + screenY / (this.tileHeight / 2)) / 2;
    const gridY = (screenY / (this.tileHeight / 2) - screenX / (this.tileWidth / 2)) / 2;
    return { x: gridX, y: gridY };
  }

  /**
   * 计算实体的深度值（用于排序）
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} z - Z坐标（高度，可选）
   * @returns {number} 深度值
   */
  calculateDepth(x, y, z = 0) {
    // 简单的 Y 排序，Y 值越大越靠前
    return y - z * 0.01;
  }

  /**
   * 对实体列表进行深度排序
   * @param {Array} entities - 实体列表
   * @returns {Array} 排序后的实体列表
   */
  sortByDepth(entities) {
    return [...entities].sort((a, b) => {
      const transformA = a.getComponent ? a.getComponent('transform') : a;
      const transformB = b.getComponent ? b.getComponent('transform') : b;
      
      const posA = transformA.position || transformA;
      const posB = transformB.position || transformB;
      
      const depthA = this.calculateDepth(posA.x, posA.y, posA.z || 0);
      const depthB = this.calculateDepth(posB.x, posB.y, posB.z || 0);
      
      return depthA - depthB;
    });
  }

  /**
   * 视锥剔除 - 过滤出可见实体
   * @param {Entity[]} entities - 实体列表
   * @returns {Entity[]} 可见实体列表
   */
  cullEntities(entities) {
    const visible = [];
    
    for (const entity of entities) {
      if (!entity.active) continue;
      
      const transform = entity.getComponent('transform');
      const sprite = entity.getComponent('sprite');
      
      if (!transform || !sprite || !sprite.visible) continue;
      
      const width = sprite.width || 32;
      const height = sprite.height || 32;
      
      if (this.camera.isRectVisible(
        transform.position.x,
        transform.position.y,
        width,
        height
      )) {
        visible.push(entity);
      }
    }
    
    return visible;
  }

  /**
   * 设置地图数据
   * @param {Array<Array<number>>} mapData - 2D地图数组
   * @param {Object} tileset - 图块集配置
   */
  setMapData(mapData, tileset) {
    this.mapData = mapData;
    this.mapTileset = tileset;
  }

  /**
   * 绘制等距地图
   */
  drawMap() {
    if (!this.mapData) return;
    
    for (let y = 0; y < this.mapData.length; y++) {
      for (let x = 0; x < this.mapData[y].length; x++) {
        const tileId = this.mapData[y][x];
        if (tileId === 0) continue;
        
        const tileColor = this.getTileColor(tileId);
        this.drawIsometricTile(x, y, tileColor, 'rgba(0,0,0,0.2)');
      }
    }
  }

  /**
   * 绘制单个等距菱形格子
   */
  drawIsometricTile(gridX, gridY, fillColor = null, strokeColor = null) {
    const ctx = this.ctx;
    const screen = this.gridToScreen(gridX, gridY);
    
    const halfW = this.tileWidth / 2;
    const halfH = this.tileHeight / 2;
    
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y - halfH);
    ctx.lineTo(screen.x + halfW, screen.y);
    ctx.lineTo(screen.x, screen.y + halfH);
    ctx.lineTo(screen.x - halfW, screen.y);
    ctx.closePath();
    
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    
    if (strokeColor !== false) {
      ctx.strokeStyle = strokeColor || 'rgba(100, 100, 150, 0.3)';
      ctx.stroke();
    }
  }

  /**
   * 绘制无限延伸的等距网格（基于相机视野）
   * @param {Object} viewBounds - 相机视野边界 {left, top, right, bottom}
   */
  drawInfiniteGrid(viewBounds) {
    const ctx = this.ctx;
    ctx.save();
    
    ctx.strokeStyle = 'rgba(100, 100, 150, 0.3)';
    ctx.lineWidth = 1;
    
    // 大幅增加绘制范围，确保用户看不到边缘
    const padding = 30;
    
    // 计算视野范围（考虑等距视角的对角线特性）
    const viewWidth = viewBounds.right - viewBounds.left;
    const viewHeight = viewBounds.bottom - viewBounds.top;
    const centerX = (viewBounds.left + viewBounds.right) / 2;
    const centerY = (viewBounds.top + viewBounds.bottom) / 2;
    
    // 根据视野中心计算格子范围
    const minGridX = Math.floor((centerX - viewWidth) / this.tileWidth) - padding;
    const maxGridX = Math.ceil((centerX + viewWidth) / this.tileWidth) + padding;
    const minGridY = Math.floor((centerY - viewHeight) / this.tileWidth) - padding;
    const maxGridY = Math.ceil((centerY + viewHeight) / this.tileWidth) + padding;
    
    // 绘制网格线
    for (let x = minGridX; x <= maxGridX; x++) {
      for (let y = minGridY; y <= maxGridY; y++) {
        this.drawIsometricTile(x, y, null, 'rgba(100, 100, 150, 0.3)');
      }
    }
    
    ctx.restore();
  }

  /**
   * 绘制等距网格（固定范围）
   */
  drawGrid() {
    const ctx = this.ctx;
    ctx.save();
    
    ctx.strokeStyle = 'rgba(100, 100, 150, 0.3)';
    ctx.lineWidth = 1;
    
    const halfGrid = Math.floor(this.gridSize / 2);
    
    for (let i = -halfGrid; i <= halfGrid; i++) {
      for (let j = -halfGrid; j <= halfGrid; j++) {
        this.drawIsometricTile(i, j);
      }
    }
    
    ctx.restore();
  }

  /**
   * 获取图块颜色
   */
  getTileColor(tileId) {
    const colors = {
      1: '#3d5c3d',  // 草地
      2: '#8b7355',  // 泥土
      3: '#6b6b6b',  // 石头
      4: '#4a7ab0',  // 水
      5: '#c2b280',  // 沙地
    };
    return colors[tileId] || '#555555';
  }

  /**
   * 高亮鼠标所在的格子
   */
  highlightTileAtMouse(mouseX, mouseY) {
    const grid = this.screenToGrid(mouseX, mouseY);
    const gridX = Math.floor(grid.x);
    const gridY = Math.floor(grid.y);
    
    this.drawIsometricTile(gridX, gridY, 'rgba(255, 255, 0, 0.3)', '#ffff00');
    
    return { gridX, gridY };
  }

  /**
   * 绘制等距精灵
   */
  drawSprite(image, worldX, worldY, options = {}) {
    const ctx = this.ctx;
    
    const width = options.width || image.width;
    const height = options.height || image.height;
    const anchorX = options.anchorX || 0.5;
    const anchorY = options.anchorY || 1.0;  // 底部中心锚点
    const scale = options.scale || 1;
    const alpha = options.alpha || 1;
    const frameX = options.frameX || 0;
    const frameY = options.frameY || 0;
    const frameW = options.frameW || width;
    const frameH = options.frameH || height;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    const drawX = worldX - frameW * anchorX * scale;
    const drawY = worldY - frameH * anchorY * scale;
    const drawW = frameW * scale;
    const drawH = frameH * scale;
    
    ctx.drawImage(
      image,
      frameX, frameY, frameW, frameH,
      drawX, drawY, drawW, drawH
    );
    
    ctx.restore();
    
    if (this.debugMode) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(worldX, worldY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 颜色变暗
   */
  darkenColor(color, factor) {
    const hex = color.replace('#', '');
    const r = Math.floor(parseInt(hex.substr(0, 2), 16) * factor);
    const g = Math.floor(parseInt(hex.substr(2, 2), 16) * factor);
    const b = Math.floor(parseInt(hex.substr(4, 2), 16) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * 设置调试模式
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    if (this.spriteRenderer) {
      this.spriteRenderer.setDebugMode(enabled);
    }
  }

  /**
   * 设置网格显示
   */
  setShowGrid(enabled) {
    this.showGrid = enabled;
  }

  /**
   * 获取渲染统计信息
   */
  getRenderStats(entities) {
    const visibleEntities = this.cullEntities(entities);
    
    return {
      totalEntities: entities.length,
      visibleEntities: visibleEntities.length,
      culledEntities: entities.length - visibleEntities.length,
      cameraPosition: { x: this.camera.position.x, y: this.camera.position.y }
    };
  }
}

export default IsometricRenderer;
