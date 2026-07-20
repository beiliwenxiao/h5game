/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-02-10
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

import { UIElement } from './UIElement.js';

/**
 * 小地图组件（9宫格）
 * 
 * 以真实地图为基础，缩小到指定比例（默认10%）显示。
 * 支持多 terrain chunk（9宫格大地图），将所有已加载的 terrain
 * 渲染到一张离屏 canvas 上生成缩略图，标注玩家和敌人位置。
 * 
 * 使用方式：
 *   minimap.setTerrains(terrainArray)  — 绑定所有 terrain 实例
 *   minimap.setPlayerPosition(pos)     — 每帧更新玩家位置
 *   minimap.setViewBounds(bounds)      — 每帧更新相机视野
 */
export class Minimap extends UIElement {
  /**
   * @param {Object} options
   * @param {number} [options.scale=0.1] - 地图缩放比例（0.1 = 10%）
   * @param {string} [options.backgroundColor] - 背景色
   * @param {string} [options.borderColor] - 边框色
   * @param {string} [options.playerColor] - 玩家标记色
   * @param {string} [options.enemyColor] - 敌人标记色
   * @param {string} [options.npcColor] - NPC 标记色
   * @param {number} [options.markerSize=4] - 标记半径
   * @param {number} [options.borderWidth=2] - 边框宽度
   */
  constructor(options = {}) {
    super(options);

    this.mapScale = options.scale || 0.1;
    this.backgroundColor = options.backgroundColor || 'rgba(20, 15, 10, 0.85)';
    this.borderColor = options.borderColor || '#8B7355';
    this.playerColor = options.playerColor || '#00ff00';
    this.enemyColor = options.enemyColor || '#ff3333';
    this.npcColor = options.npcColor || '#ffdd00';
    this.markerSize = options.markerSize || 4;
    this.borderWidth = options.borderWidth || 2;
    this.padding = 4;

    // 地形实例列表
    this._terrains = [];
    // 缩略图离屏 canvas
    this._mapCache = null;
    // 缓存脏标记版本号
    this._cacheVersion = 0;
    // 上次成功构建时的版本
    this._builtVersion = -1;
    // 缓存重建间隔（避免每帧都尝试重建）
    this._rebuildCooldown = 0;
    this._rebuildInterval = 500; // ms

    // 世界坐标范围（所有 terrain 的包围盒）
    this._worldMinX = 0;
    this._worldMinY = 0;
    this._worldMaxX = 0;
    this._worldMaxY = 0;
    // 缩略图实际绘制尺寸
    this._drawW = 0;
    this._drawH = 0;

    // 玩家、敌人、NPC 位置（世界坐标）
    this.playerPosition = null;
    this.enemyPositions = [];
    this.npcPositions = [];
    // 相机视野范围
    this.viewBounds = null;
  }

  /**
   * 绑定 terrain 实例列表（支持9宫格多 chunk）
   * @param {Array<Scene1Terrain>} terrains
   */
  setTerrains(terrains) {
    this._terrains = terrains || [];
    this._invalidateCache();
  }

  /**
   * 绑定单个 terrain（兼容接口）
   * @param {Scene1Terrain} terrain
   */
  setTerrain(terrain) {
    if (terrain) {
      this._terrains = [terrain];
    } else {
      this._terrains = [];
    }
    this._invalidateCache();
  }

  /** 标记缓存需要重建 */
  _invalidateCache() {
    this._cacheVersion++;
  }

  /** 释放缩略图缓存（场景离开时调用） */
  dispose() {
    this._mapCache = null;
    this._terrains = [];
    this._builtVersion = -1;
  }

  setPlayerPosition(position) { this.playerPosition = position; }
  setEnemyPositions(positions) { this.enemyPositions = positions || []; }
  setNPCPositions(positions) { this.npcPositions = positions || []; }
  setViewBounds(bounds) { this.viewBounds = bounds; }

  /**
   * 尝试构建/重建缩略图缓存
   * 遍历所有 terrain，将其地面内容渲染到一张离屏 canvas（按 mapScale 缩小）
   * @param {number} deltaTime - 帧间隔 ms
   */
  _tryBuildCache(deltaTime) {
    // 冷却中不重建
    if (this._rebuildCooldown > 0) {
      this._rebuildCooldown -= deltaTime;
      return;
    }

    // 已经是最新则跳过
    if (this._builtVersion === this._cacheVersion && this._mapCache) return;

    if (this._terrains.length === 0) return;

    // 检查是否有至少一个 terrain 准备好了可渲染的内容
    // 条件：terrain 有 _combinedGroundCache 或其图集已加载（loaded.mountain）
    let anyReady = false;
    for (const t of this._terrains) {
      if (t._combinedGroundCache || t.loaded.mountain) {
        anyReady = true;
        break;
      }
    }
    if (!anyReady) {
      this._rebuildCooldown = this._rebuildInterval;
      return;
    }

    // 计算所有 terrain 的世界坐标包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of this._terrains) {
      const ox = t.worldOffset ? t.worldOffset.x : 0;
      const oy = t.worldOffset ? t.worldOffset.y : 0;
      // terrain 有效区域 = worldOffset + 盆地范围
      const left = ox + t.centerX - t.basinRadiusX - 60;
      const top = oy + t.centerY - t.basinRadiusY - 60;
      const right = ox + t.centerX + t.basinRadiusX + 60;
      const bottom = oy + t.centerY + t.basinRadiusY + 60;
      if (left < minX) minX = left;
      if (top < minY) minY = top;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (worldW <= 0 || worldH <= 0) return;

    this._worldMinX = minX;
    this._worldMinY = minY;
    this._worldMaxX = maxX;
    this._worldMaxY = maxY;

    // 计算缩略图实际尺寸（保持宽高比，fit 到小地图内部区域）
    const innerW = this.width - this.padding * 2;
    const innerH = this.height - this.padding * 2;
    const scaleX = innerW / worldW;
    const scaleY = innerH / worldH;
    const scale = Math.min(scaleX, scaleY);

    const drawW = Math.max(1, Math.floor(worldW * scale));
    const drawH = Math.max(1, Math.floor(worldH * scale));
    this._drawW = drawW;
    this._drawH = drawH;

    // 创建离屏 canvas
    const canvas = document.createElement('canvas');
    canvas.width = drawW;
    canvas.height = drawH;
    const ctx = canvas.getContext('2d');

    // 缩放变换：世界坐标 → 缩略图像素
    ctx.scale(scale, scale);
    ctx.translate(-minX, -minY);

    // 逐个 terrain 渲染地面
    for (const t of this._terrains) {
      if (t._combinedGroundCache) {
        // 有合并缓存直接绘制
        ctx.drawImage(
          t._combinedGroundCache,
          t._combinedGroundCacheX,
          t._combinedGroundCacheY
        );
      } else if (t.loaded.mountain) {
        // 缓存未就绪但图集已加载，调用渲染方法
        ctx.save();
        t._ensureTerrainEllipseData();
        t._renderTerrainEllipse(ctx);
        t._renderWaterPatches(ctx);
        ctx.restore();
      }
      // 不渲染 shape / 装饰物（缩略图不需要细节）
    }

    this._mapCache = canvas;
    this._builtVersion = this._cacheVersion;
    this._rebuildCooldown = this._rebuildInterval;
  }

  /**
   * 世界坐标 → 小地图屏幕坐标
   * @param {Object} worldPos - {x, y}
   * @returns {Object|null}
   */
  _worldToMinimap(worldPos) {
    if (!this._mapCache || this._drawW === 0) return null;

    const worldW = this._worldMaxX - this._worldMinX;
    const worldH = this._worldMaxY - this._worldMinY;
    if (worldW <= 0 || worldH <= 0) return null;

    const relX = (worldPos.x - this._worldMinX) / worldW;
    const relY = (worldPos.y - this._worldMinY) / worldH;

    // 地图缓存在面板中居中的偏移
    const innerW = this.width - this.padding * 2;
    const innerH = this.height - this.padding * 2;
    const offsetX = this.x + this.padding + (innerW - this._drawW) / 2;
    const offsetY = this.y + this.padding + (innerH - this._drawH) / 2;

    return {
      x: offsetX + relX * this._drawW,
      y: offsetY + relY * this._drawH
    };
  }

  /**
   * 更新（每帧调用，节流重建缓存）
   * @param {number} deltaTime - ms
   */
  update(deltaTime) {
    this._tryBuildCache(deltaTime);
  }

  /**
   * 渲染小地图
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible) return;

    ctx.save();
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;

    // 背景
    ctx.fillStyle = this.backgroundColor;
    this._roundRect(ctx, this.x, this.y, this.width, this.height, 4);
    ctx.fill();

    // 边框
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = this.borderWidth;
    this._roundRect(ctx, this.x, this.y, this.width, this.height, 4);
    ctx.stroke();

    if (this._mapCache) {
      const innerW = this.width - this.padding * 2;
      const innerH = this.height - this.padding * 2;
      const offsetX = this.x + this.padding + (innerW - this._drawW) / 2;
      const offsetY = this.y + this.padding + (innerH - this._drawH) / 2;

      // 裁剪
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.x + this.padding, this.y + this.padding, innerW, innerH);
      ctx.clip();

      ctx.drawImage(this._mapCache, offsetX, offsetY);

      // 视野框
      this._renderViewBounds(ctx);
      // 敌人
      this._renderEnemyMarkers(ctx);
      // NPC
      this._renderNPCMarkers(ctx);
      // 玩家（最上层）
      this._renderPlayerMarker(ctx);

      ctx.restore();
    } else {
      // 加载中提示
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('地图加载中...', this.x + this.width / 2, this.y + this.height / 2);
    }

    ctx.restore();
  }

  // ─── 内部渲染方法 ───────────────────────────────────────

  _renderViewBounds(ctx) {
    if (!this.viewBounds) return;
    const tl = this._worldToMinimap({ x: this.viewBounds.left, y: this.viewBounds.top });
    const br = this._worldToMinimap({ x: this.viewBounds.right, y: this.viewBounds.bottom });
    if (!tl || !br) return;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  }

  _renderPlayerMarker(ctx) {
    if (!this.playerPosition) return;
    const pos = this._worldToMinimap(this.playerPosition);
    if (!pos) return;
    ctx.fillStyle = this.playerColor;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, this.markerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, this.markerSize, 0, Math.PI * 2);
    ctx.stroke();
  }

  _renderEnemyMarkers(ctx) {
    ctx.fillStyle = this.enemyColor;
    for (const pos of this.enemyPositions) {
      const p = this._worldToMinimap(pos);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.markerSize - 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _renderNPCMarkers(ctx) {
    ctx.fillStyle = this.npcColor;
    for (const pos of this.npcPositions) {
      const p = this._worldToMinimap(pos);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.markerSize - 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _roundRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  containsPoint(x, y) {
    return x >= this.x && x <= this.x + this.width &&
           y >= this.y && y <= this.y + this.height;
  }
}
