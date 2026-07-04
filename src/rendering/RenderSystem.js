/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * RenderSystem.js
 * 渲染系统 - 负责渲染所有可见实体
 */

import { Camera } from './Camera.js';
import { SpriteRenderer } from './SpriteRenderer.js';

/**
 * 渲染系统
 * 管理游戏的渲染流程，包括视锥剔除、排序和分层渲染
 */
export class RenderSystem {
  /**
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   * @param {AssetManager} assetManager - 资源管理器
   * @param {number} width - 视野宽度
   * @param {number} height - 视野高度
   */
  constructor(ctx, assetManager = null, width = 1280, height = 720) {
    this.ctx = ctx;
    this.camera = new Camera(0, 0, width, height);
    this.spriteRenderer = new SpriteRenderer(assetManager);
    
    // 渲染层
    this.layers = {
      background: [],
      entities: [],
      ui: []
    };
    // 世界子层顺序（按此顺序绘制）
    this.layerOrder = ['ground', 'decal', 'entity', 'aerial', 'effect'];
    // 当前楼层（用于楼层过滤）
    this.currentFloorId = 'ground';
    // 跨楼层半透明
    this.crossFloorAlpha = 0.0;
    
    // 调试模式
    this.debugMode = false;
    
    // 等距投影设置
    this.isometricEnabled = true;  // 启用等距投影
    this.isometricRatio = 0.5;     // Y轴压缩比例（0.5 = 2:1等距效果）
    
    // 离屏Canvas缓存（用于静态背景）
    this.backgroundCache = null;
    this.backgroundCacheEnabled = true;
    this.backgroundCacheDirty = true;
    
    // 缓存的地图范围
    this.cachedMapBounds = {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    };
  }

  /**
   * 设置调试模式
   * @param {boolean} enabled - 是否启用
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.spriteRenderer.setDebugMode(enabled);
  }

  /**
   * 设置 elevation 视觉缩放系数（影响 SpriteRenderer）
   * @param {number} k
   */
  setElevationScale(k) {
    this.spriteRenderer.setElevationScale(k);
  }

  /**
   * 设置世界子层顺序
   * @param {string[]} order
   */
  setLayerOrder(order) {
    if (Array.isArray(order) && order.length > 0) this.layerOrder = order.slice();
  }

  /**
   * 设置当前楼层 id（用于楼层过滤）
   * @param {string} id
   */
  setCurrentFloor(id) {
    this.currentFloorId = id;
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
    // 更新相机
    this.camera.update(deltaTime);
  }

  /**
   * 渲染所有实体
   * @param {Entity[]} entities - 实体列表
   */
  render(entities) {
    // 清空Canvas
    this.clear();
    
    // 保存上下文状态
    this.ctx.save();
    
    // 应用相机变换
    this.applyCameraTransform();
    
    // 1. 渲染背景层
    this.renderBackgroundLayer();
    
    // 2. 渲染实体层
    this.renderEntityLayer(entities);
    
    // 恢复上下文状态
    this.ctx.restore();
    
    // 3. 渲染UI层（不受相机影响）
    this.renderUILayer();
    
    // 渲染调试信息
    if (this.debugMode) {
      this.renderDebugInfo(entities);
    }
  }

  /**
   * 清空Canvas
   */
  clear() {
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  /**
   * 应用相机变换
   */
  applyCameraTransform() {
    const halfWidth = this.camera.width / 2;
    const halfHeight = this.camera.height / 2;
    
    // 平移到相机位置
    this.ctx.translate(
      halfWidth - this.camera.position.x,
      halfHeight - this.camera.position.y * this.isometricRatio
    );
    
    // 应用等距投影变换
    if (this.isometricEnabled) {
      this.ctx.scale(1, this.isometricRatio);
    }
  }

  /**
   * 世界坐标转等距坐标
   * @param {number} x - 世界X坐标
   * @param {number} y - 世界Y坐标
   * @returns {{x: number, y: number}} 等距坐标
   */
  worldToIsometric(x, y) {
    if (!this.isometricEnabled) {
      return { x, y };
    }
    return {
      x: x,
      y: y * this.isometricRatio
    };
  }

  /**
   * 等距坐标转世界坐标
   * @param {number} isoX - 等距X坐标
   * @param {number} isoY - 等距Y坐标
   * @returns {{x: number, y: number}} 世界坐标
   */
  isometricToWorld(isoX, isoY) {
    if (!this.isometricEnabled) {
      return { x: isoX, y: isoY };
    }
    return {
      x: isoX,
      y: isoY / this.isometricRatio
    };
  }

  /**
   * 设置等距投影
   * @param {boolean} enabled - 是否启用
   * @param {number} ratio - Y轴压缩比例（默认0.5）
   */
  setIsometric(enabled, ratio = 0.5) {
    this.isometricEnabled = enabled;
    this.isometricRatio = ratio;
    this.invalidateBackgroundCache();
  }

  /**
   * 渲染背景层
   */
  renderBackgroundLayer() {
    if (this.backgroundCacheEnabled) {
      this.renderCachedBackground();
    } else {
      this.renderBackgroundDirect();
    }
  }

  /**
   * 直接渲染背景（不使用缓存）
   */
  renderBackgroundDirect() {
    // 绘制简单的网格背景
    this.renderGrid();
    
    // 渲染背景层中的其他元素
    for (const item of this.layers.background) {
      if (typeof item.render === 'function') {
        item.render(this.ctx, this.camera);
      }
    }
  }

  /**
   * 使用缓存渲染背景
   */
  renderCachedBackground() {
    // 如果缓存为空或需要更新，重新生成缓存
    if (!this.backgroundCache || this.backgroundCacheDirty) {
      this.updateBackgroundCache();
    }
    
    // 绘制缓存的背景
    if (this.backgroundCache) {
      const bounds = this.camera.getViewBounds();
      
      // 计算源矩形（从缓存中裁剪的区域）
      const srcX = Math.max(0, bounds.left - this.cachedMapBounds.left);
      const srcY = Math.max(0, bounds.top - this.cachedMapBounds.top);
      const srcWidth = Math.min(
        this.backgroundCache.width - srcX,
        bounds.right - bounds.left
      );
      const srcHeight = Math.min(
        this.backgroundCache.height - srcY,
        bounds.bottom - bounds.top
      );
      
      // 计算目标矩形（在屏幕上绘制的位置）
      const destX = bounds.left;
      const destY = bounds.top;
      
      // 绘制缓存的背景
      if (srcWidth > 0 && srcHeight > 0) {
        this.ctx.drawImage(
          this.backgroundCache,
          srcX, srcY, srcWidth, srcHeight,
          destX, destY, srcWidth, srcHeight
        );
      }
    }
  }

  /**
   * 更新背景缓存
   * @param {number} [mapWidth=2000] - 地图宽度
   * @param {number} [mapHeight=2000] - 地图高度
   */
  updateBackgroundCache(mapWidth = 2000, mapHeight = 2000) {
    // 创建离屏Canvas
    if (!this.backgroundCache) {
      this.backgroundCache = document.createElement('canvas');
    }
    
    this.backgroundCache.width = mapWidth;
    this.backgroundCache.height = mapHeight;
    
    const cacheCtx = this.backgroundCache.getContext('2d');
    
    // 保存当前相机位置
    const originalCameraPos = { ...this.camera.position };
    
    // 临时设置相机到地图中心
    this.camera.position.x = mapWidth / 2;
    this.camera.position.y = mapHeight / 2;
    
    // 保存原始上下文
    const originalCtx = this.ctx;
    this.ctx = cacheCtx;
    
    // 渲染背景到缓存
    cacheCtx.save();
    cacheCtx.translate(0, 0);
    
    // 绘制网格
    this.renderGridToCache(cacheCtx, 0, 0, mapWidth, mapHeight);
    
    // 渲染背景层元素
    for (const item of this.layers.background) {
      if (typeof item.render === 'function') {
        item.render(cacheCtx, this.camera);
      }
    }
    
    cacheCtx.restore();
    
    // 恢复原始上下文和相机位置
    this.ctx = originalCtx;
    this.camera.position = originalCameraPos;
    
    // 更新缓存的地图范围
    this.cachedMapBounds = {
      left: 0,
      top: 0,
      right: mapWidth,
      bottom: mapHeight
    };
    
    this.backgroundCacheDirty = false;
  }

  /**
   * 渲染网格到缓存
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {number} left - 左边界
   * @param {number} top - 上边界
   * @param {number} width - 宽度
   * @param {number} height - 高度
   */
  renderGridToCache(ctx, left, top, width, height) {
    const gridSize = 64;
    
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(left, top, width, height);
    
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;
    
    // 绘制垂直线
    for (let x = left; x <= left + width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
    }
    
    // 绘制水平线
    for (let y = top; y <= top + height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
    }
  }

  /**
   * 渲染网格背景
   */
  renderGrid() {
    const bounds = this.camera.getViewBounds();
    const gridSize = 64;
    
    this.ctx.strokeStyle = '#2a2a3e';
    this.ctx.lineWidth = 1;
    
    // 绘制垂直线
    const startX = Math.floor(bounds.left / gridSize) * gridSize;
    const endX = Math.ceil(bounds.right / gridSize) * gridSize;
    for (let x = startX; x <= endX; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, bounds.top);
      this.ctx.lineTo(x, bounds.bottom);
      this.ctx.stroke();
    }
    
    // 绘制水平线
    const startY = Math.floor(bounds.top / gridSize) * gridSize;
    const endY = Math.ceil(bounds.bottom / gridSize) * gridSize;
    for (let y = startY; y <= endY; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(bounds.left, y);
      this.ctx.lineTo(bounds.right, y);
      this.ctx.stroke();
    }
  }

  /**
   * 渲染实体层（按子层分桶）
   * @param {Entity[]} entities - 实体列表
   */
  renderEntityLayer(entities) {
    // 视锥剔除
    const visibleEntities = this.cullEntities(entities);

    // 按 worldLayer 分桶
    const buckets = {
      ground: [],
      decal: [],
      entity: [],
      aerial: [],
      effect: []
    };
    const order = this.layerOrder || ['ground', 'decal', 'entity', 'aerial', 'effect'];

    for (const e of visibleEntities) {
      const layer = e.getComponent?.('layer');
      const key = (layer && layer.worldLayer) || 'entity';
      (buckets[key] || buckets.entity).push(e);
    }

    // 依次渲染
    for (const key of order) {
      const list = buckets[key];
      if (!list || list.length === 0) continue;
      const needsYSort = (key === 'entity' || key === 'decal' || key === 'aerial');
      const sorted = list.slice().sort((a, b) => {
        const la = a.getComponent?.('layer');
        const lb = b.getComponent?.('layer');
        const ra = la?.renderOrder ?? 0;
        const rb = lb?.renderOrder ?? 0;
        if (ra !== rb) return ra - rb;
        if (!needsYSort) return 0;
        const ta = a.getComponent?.('transform');
        const tb = b.getComponent?.('transform');
        const az = ta ? (ta.position.z ?? ta.position.y ?? 0) : 0;
        const bz = tb ? (tb.position.z ?? tb.position.y ?? 0) : 0;
        return az - bz;
      });
      for (const entity of sorted) this.renderEntity(entity);
    }
  }

  /**
   * 视锥剔除 - 过滤出可见实体
   * 同时按 currentFloorId 过滤楼层（未挂 LayerComponent / transform.floorId 默认 'ground'）
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

      // 楼层过滤（跨楼层 alpha==0 时隐藏）
      const entityFloor = transform.floorId ?? entity.getComponent('layer')?.floorId ?? 'ground';
      if (entityFloor !== this.currentFloorId) {
        if (this.crossFloorAlpha <= 0) continue;
        // 否则保留并由 SpriteRenderer 根据 alpha 半透明绘制（这里暂不实现，留给 M6）
      }
      
      // 检查实体是否在视野内
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
   * 按Y坐标排序实体（实现深度效果）
   * 阶段 A：优先读取 position.z（与 position.y 等价），为后续 3D 迁移做准备
   * @param {Entity[]} entities - 实体列表
   * @returns {Entity[]} 排序后的实体列表
   */
  sortEntitiesByDepth(entities) {
    return entities.slice().sort((a, b) => {
      const transformA = a.getComponent('transform');
      const transformB = b.getComponent('transform');
      
      if (!transformA || !transformB) return 0;
      
      // 按地面深度排序（深度越大越靠前渲染）
      const az = transformA.position.z !== undefined
        ? transformA.position.z
        : transformA.position.y;
      const bz = transformB.position.z !== undefined
        ? transformB.position.z
        : transformB.position.y;
      return az - bz;
    });
  }

  /**
   * 渲染单个实体
   * @param {Entity} entity - 实体
   */
  renderEntity(entity) {
    const transform = entity.getComponent('transform');
    const sprite = entity.getComponent('sprite');
    
    if (!transform || !sprite || !sprite.visible) return;
    
    // 使用SpriteRenderer渲染精灵
    this.spriteRenderer.render(this.ctx, entity, transform, sprite);
  }

  /**
   * 渲染UI层
   */
  renderUILayer() {
    for (const item of this.layers.ui) {
      if (typeof item.render === 'function') {
        item.render(this.ctx);
      }
    }
  }

  /**
   * 渲染调试信息
   * @param {Entity[]} entities - 实体列表
   */
  renderDebugInfo(entities) {
    const visibleCount = this.cullEntities(entities).length;
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '14px monospace';
    this.ctx.textAlign = 'left';
    
    let y = 20;
    const lineHeight = 20;
    
    this.ctx.fillText(`Entities: ${entities.length}`, 10, y);
    y += lineHeight;
    this.ctx.fillText(`Visible: ${visibleCount}`, 10, y);
    y += lineHeight;
    this.ctx.fillText(`Camera: (${Math.round(this.camera.position.x)}, ${Math.round(this.camera.position.y)})`, 10, y);
  }

  /**
   * 添加背景层元素
   * @param {Object} item - 背景元素
   */
  addBackgroundItem(item) {
    this.layers.background.push(item);
  }

  /**
   * 添加UI层元素
   * @param {Object} item - UI元素
   */
  addUIItem(item) {
    this.layers.ui.push(item);
  }

  /**
   * 清空所有层
   */
  clearLayers() {
    this.layers.background = [];
    this.layers.entities = [];
    this.layers.ui = [];
    this.invalidateBackgroundCache();
  }

  /**
   * 启用/禁用背景缓存
   * @param {boolean} enabled - 是否启用
   */
  setBackgroundCacheEnabled(enabled) {
    this.backgroundCacheEnabled = enabled;
  }

  /**
   * 标记背景缓存为脏（需要更新）
   */
  invalidateBackgroundCache() {
    this.backgroundCacheDirty = true;
  }

  /**
   * 设置地图大小并更新背景缓存
   * @param {number} width - 地图宽度
   * @param {number} height - 地图高度
   */
  setMapSize(width, height) {
    this.updateBackgroundCache(width, height);
  }

  /**
   * 获取渲染统计信息
   * @param {Entity[]} entities - 实体列表
   * @returns {Object} 统计信息
   */
  getRenderStats(entities) {
    const visibleEntities = this.cullEntities(entities);
    
    return {
      totalEntities: entities.length,
      visibleEntities: visibleEntities.length,
      culledEntities: entities.length - visibleEntities.length,
      backgroundCacheEnabled: this.backgroundCacheEnabled,
      backgroundCacheSize: this.backgroundCache ? 
        `${this.backgroundCache.width}x${this.backgroundCache.height}` : 'none'
    };
  }
}
