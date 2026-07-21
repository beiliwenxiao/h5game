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

    // 缩放级别：0=最大（本屏+10%），1=中间，2=最小（全部9宫格）
    this._zoomLevel = 1; // 默认中间
    this._maxZoomLevel = 2;

    // 地形实例列表
    this._terrains = [];
    // 大地图 region 边界数据（优先于 terrain 包围盒）
    this._worldRegion = null;
    // 缩略图离屏 canvas
    this._mapCache = null;
    // 缓存脏标记版本号
    this._cacheVersion = 0;
    // 上次成功构建时的版本
    this._builtVersion = -1;
    // 缓存重建间隔（避免每帧都尝试重建），单位：秒
    this._rebuildCooldown = 0;
    this._rebuildInterval = 0.5; // 0.5秒

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
   * 设置大地图 region 数据（用于确定小地图整体边界）
   * @param {Object|null} region - { cols, rows, chunkWidth, chunkHeight }
   */
  setWorldRegion(region) {
    this._worldRegion = region || null;
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

  /** 放大小地图（显示更小范围，更多细节） */
  zoomIn() {
    if (this._zoomLevel > 0) {
      this._zoomLevel--;
      this._invalidateCache();
    }
  }

  /** 缩小小地图（显示更大范围） */
  zoomOut() {
    if (this._zoomLevel < this._maxZoomLevel) {
      this._zoomLevel++;
      this._invalidateCache();
    }
  }

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
    let anyReady = false;
    for (const t of this._terrains) {
      if (t._combinedGroundCache || t._groundDecoCache || t.loaded.mountain ||
          t._bgImageCache ||
          (t._editorBackgroundImages && t._editorBackgroundImages.some(bg => bg._loaded))) {
        anyReady = true;
        break;
      }
    }
    if (!anyReady) {
      this._rebuildCooldown = this._rebuildInterval;
      return;
    }

    // 先计算全部 terrain 包围盒（zoom=2 最小缩放用）
    let fullMinX = Infinity, fullMinY = Infinity, fullMaxX = -Infinity, fullMaxY = -Infinity;
    const chunkW = (this._worldRegion && this._worldRegion.chunkWidth) || 1280;
    const chunkH = (this._worldRegion && this._worldRegion.chunkHeight) || 720;

    for (const t of this._terrains) {
      const ox = t.worldOffset ? t.worldOffset.x : 0;
      const oy = t.worldOffset ? t.worldOffset.y : 0;
      const left = ox;
      const top = oy;
      const right = ox + chunkW;
      const bottom = oy + chunkH;
      if (left < fullMinX) fullMinX = left;
      if (top < fullMinY) fullMinY = top;
      if (right > fullMaxX) fullMaxX = right;
      if (bottom > fullMaxY) fullMaxY = bottom;
    }

    // 根据缩放级别决定显示范围
    let minX, minY, maxX, maxY;
    if (this._zoomLevel === 0 && this.viewBounds) {
      // 最大缩放：显示本屏范围 + 10%
      const vb = this.viewBounds;
      const vw = vb.right - vb.left;
      const vh = vb.bottom - vb.top;
      const expand = 0.1;
      minX = vb.left - vw * expand;
      minY = vb.top - vh * expand;
      maxX = vb.right + vw * expand;
      maxY = vb.bottom + vh * expand;
    } else if (this._zoomLevel === 1 && this.playerPosition) {
      // 中间级别：以玩家为中心显示 3×3 chunk 范围
      const px = this.playerPosition.x;
      const py = this.playerPosition.y;
      const halfW = chunkW * 1.5;
      const halfH = chunkH * 1.5;
      minX = px - halfW;
      minY = py - halfH;
      maxX = px + halfW;
      maxY = py + halfH;
    } else {
      // 最小缩放（zoom=2）：显示全部
      minX = fullMinX;
      minY = fullMinY;
      maxX = fullMaxX;
      maxY = fullMaxY;
    }

    // clamp 到全部范围
    if (minX < fullMinX) minX = fullMinX;
    if (minY < fullMinY) minY = fullMinY;
    if (maxX > fullMaxX) maxX = fullMaxX;
    if (maxY > fullMaxY) maxY = fullMaxY;

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (worldW <= 0 || worldH <= 0) return;

    this._worldMinX = minX;
    this._worldMinY = minY;
    this._worldMaxX = maxX;
    this._worldMaxY = maxY;

    // 外框尺寸固定为九宫格（全部 terrain）比例，只计算一次
    if (!this._frameSizeSet) {
      const fullW = fullMaxX - fullMinX;
      const fullH = fullMaxY - fullMinY;
      if (fullW > 0 && fullH > 0) {
        const maxDim = Math.max(this.width, this.height);
        const fullAspect = fullW / fullH;
        if (fullAspect >= 1) {
          this.width = maxDim;
          this.height = Math.round(maxDim / fullAspect);
        } else {
          this.height = maxDim;
          this.width = Math.round(maxDim * fullAspect);
        }
        if (this._anchorRight !== undefined) {
          this.x = this._anchorRight - this.width;
        }
        this._frameSizeSet = true;
      }
    }

    // 计算缩略图实际尺寸
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

    // 逐个 terrain 渲染背景层 + 装饰层
    for (const t of this._terrains) {
      // --- 区块背景色（填满整个 chunk 格子，与编辑器一致）---
      const bgColor = t.sceneBackgroundColor || '#1f1a14';
      const ox = t.worldOffset ? t.worldOffset.x : 0;
      const oy = t.worldOffset ? t.worldOffset.y : 0;
      // 使用 chunk 尺寸（从 region 或默认 1280×720）
      const chunkW = (this._worldRegion && this._worldRegion.chunkWidth) || 1280;
      const chunkH = (this._worldRegion && this._worldRegion.chunkHeight) || 720;
      ctx.fillStyle = bgColor;
      ctx.fillRect(ox, oy, chunkW, chunkH);

      // --- 背景层 ---
      if (t._combinedGroundCache) {
        // 有合并缓存直接绘制（包含地形椭圆 + 水池 + 背景图片）
        ctx.drawImage(
          t._combinedGroundCache,
          t._combinedGroundCacheX,
          t._combinedGroundCacheY
        );
      } else {
        // 缓存未就绪，逐步渲染各层
        if (t.loaded.mountain) {
          ctx.save();
          t._ensureTerrainEllipseData();
          t._renderTerrainEllipse(ctx);
          ctx.restore();
        }
        t._renderWaterPatches(ctx);
        // 背景图片（编辑器中放置的图片对象）
        if (t._bgImageCache) {
          ctx.drawImage(t._bgImageCache, t._bgImageCacheX, t._bgImageCacheY);
        } else if (t._editorBackgroundImages && t._editorBackgroundImages.length > 0) {
          for (const bgImg of t._editorBackgroundImages) {
            if (!bgImg._loaded || !bgImg._img) continue;
            ctx.save();
            if (bgImg.opacity !== undefined) ctx.globalAlpha = bgImg.opacity;
            ctx.drawImage(bgImg._img, bgImg.x, bgImg.y, bgImg.width, bgImg.height);
            ctx.restore();
          }
        }
      }

      // --- 装饰层（草地/灌木等非碰撞装饰物的离屏缓存）---
      if (t._groundDecoCache) {
        ctx.drawImage(
          t._groundDecoCache,
          t._groundDecoCacheX,
          t._groundDecoCacheY
        );
      }
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
    // 对于跟随玩家/相机的缩放级别，持续使缓存过期（由 cooldown 节流）
    if (this._zoomLevel < 2) {
      this._invalidateCache();
    }
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

    // 左下角 +/- 缩放按钮
    this._renderZoomButtons(ctx);

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

  /**
   * 处理点击事件（检测 +/- 按钮）
   * @param {number} x - 屏幕坐标
   * @param {number} y - 屏幕坐标
   * @returns {boolean} 是否消费了点击
   */
  handleClick(x, y) {
    if (!this.visible) return false;
    const btnSize = 18;
    const gap = 4;
    const bx = this.x + this.padding;
    const by = this.y + this.height - this.padding - btnSize;

    // + 按钮
    if (x >= bx && x <= bx + btnSize && y >= by && y <= by + btnSize) {
      this.zoomIn();
      return true;
    }
    // - 按钮
    const bx2 = bx + btnSize + gap;
    if (x >= bx2 && x <= bx2 + btnSize && y >= by && y <= by + btnSize) {
      this.zoomOut();
      return true;
    }
    return false;
  }

  /** 渲染左下角 +/- 按钮 */
  _renderZoomButtons(ctx) {
    const btnSize = 18;
    const gap = 4;
    const bx = this.x + this.padding;
    const by = this.y + this.height - this.padding - btnSize;

    // + 按钮
    ctx.fillStyle = this._zoomLevel > 0 ? 'rgba(60,80,60,0.85)' : 'rgba(40,40,40,0.6)';
    ctx.fillRect(bx, by, btnSize, btnSize);
    ctx.strokeStyle = '#8B7355';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, btnSize, btnSize);
    ctx.fillStyle = this._zoomLevel > 0 ? '#fff' : '#666';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', bx + btnSize / 2, by + btnSize / 2);

    // - 按钮
    const bx2 = bx + btnSize + gap;
    ctx.fillStyle = this._zoomLevel < this._maxZoomLevel ? 'rgba(60,80,60,0.85)' : 'rgba(40,40,40,0.6)';
    ctx.fillRect(bx2, by, btnSize, btnSize);
    ctx.strokeStyle = '#8B7355';
    ctx.strokeRect(bx2, by, btnSize, btnSize);
    ctx.fillStyle = this._zoomLevel < this._maxZoomLevel ? '#fff' : '#666';
    ctx.fillText('-', bx2 + btnSize / 2, by + btnSize / 2);

    // 重置 textBaseline
    ctx.textBaseline = 'alphabetic';
  }
}
