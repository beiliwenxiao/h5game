/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

import { ShapeRenderer } from './ShapeRenderer.js';

/**
 * WorldTerrainRenderer - 无缝大地图地形渲染器（P5-4）
 *
 * authority: 'client'  // 纯表现层
 *
 * 职责：
 *   - 渲染全局地形（worldTerrains 中的 shape 数据，世界坐标定义，跨 chunk 连续无缝）
 *   - 渲染已加载 chunk 的图层（背景 shape/deco/image/slice，局部坐标+origin 偏移）
 *   - 按相机视口裁剪，只画可见区域
 *   - 背景色填充
 *
 * 使用方式：
 *   const wtr = new WorldTerrainRenderer();
 *   wtr.init(worldTerrain, resolver);
 *   // 每帧渲染：
 *   wtr.render(ctx, camera, loadedChunks);
 */
export class WorldTerrainRenderer {
  constructor() {
    this.worldTerrain = null;  // { shapes:[], backgroundColor }
    this.resolver = null;      // ShapeRenderer 的 resolver（getImage/getAtlas）
    this._shapeRenderer = new ShapeRenderer();
  }

  /**
   * 初始化
   * @param {Object} worldTerrain - project.worldTerrains[id] = { shapes:[], backgroundColor }
   * @param {Object} resolver - { getImage(src), getAtlas(atlasId) } 供 ShapeRenderer
   */
  init(worldTerrain, resolver) {
    this.worldTerrain = worldTerrain || { shapes: [], backgroundColor: '#1a2a1a' };
    this.resolver = resolver || {};
  }

  /**
   * 渲染大地图地形
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} camera - 相机（需有 getViewBounds()）
   * @param {Array<LoadedChunk>} loadedChunks - 当前已加载的 chunk 列表
   */
  render(ctx, camera, loadedChunks = []) {
    const bounds = camera.getViewBounds();

    // 1. 背景色填充（整个视口）
    if (this.worldTerrain.backgroundColor) {
      ctx.save();
      ctx.fillStyle = this.worldTerrain.backgroundColor;
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.restore();
    }

    // 2. 全局地形 shape（世界坐标，跨 chunk 无缝）
    if (Array.isArray(this.worldTerrain.shapes)) {
      ctx.save();
      // 应用相机变换：世界坐标 → 屏幕坐标
      ctx.translate(-bounds.left, -bounds.top);
      for (const shape of this.worldTerrain.shapes) {
        if (!this._shapeInView(shape, bounds)) continue;
        ShapeRenderer.render(ctx, shape, this.resolver);
      }
      ctx.restore();
    }

    // 3. 各 chunk 的图层渲染（局部坐标 + origin 偏移）
    for (const chunk of loadedChunks) {
      if (!this._chunkInView(chunk, bounds, camera)) continue;
      this._renderChunkLayers(ctx, chunk, bounds);
    }
  }

  /**
   * 渲染单个 chunk 的图层
   * @private
   */
  _renderChunkLayers(ctx, chunk, bounds) {
    if (!Array.isArray(chunk.layers)) return;

    ctx.save();
    // 偏移到 chunk 世界原点（相对视口）
    ctx.translate(chunk.origin.x - bounds.left, chunk.origin.y - bounds.top);

    for (const layer of chunk.layers) {
      if (layer.visible === false) continue;
      if (!Array.isArray(layer.objects)) continue;

      for (const obj of layer.objects) {
        if (obj.type === 'shape' || obj.type === 'fill' || obj.type === 'ellipse') {
          ShapeRenderer.render(ctx, obj, this.resolver);
        } else if (obj.type === 'deco') {
          this._renderDeco(ctx, obj);
        } else if (obj.type === 'image') {
          this._renderImage(ctx, obj);
        }
        // ref/spawn/region 等逻辑对象不渲染
      }
    }

    ctx.restore();
  }

  /**
   * 渲染装饰物（简易：用 resolver 取图集切片绘制）
   * @private
   */
  _renderDeco(ctx, obj) {
    // 尝试从 resolver 获取图集切片
    if (!this.resolver || !this.resolver.getDecoSprite) return;
    const sprite = this.resolver.getDecoSprite(obj.decoKey);
    if (!sprite || !sprite.image) return;

    const w = obj.width || sprite.sw * (obj.scale || 1);
    const h = obj.height || sprite.sh * (obj.scale || 1);
    ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, obj.x, obj.y, w, h);
  }

  /**
   * 渲染图片对象
   * @private
   */
  _renderImage(ctx, obj) {
    if (!this.resolver || !this.resolver.getImage) return;
    const img = this.resolver.getImage(obj.imageId || obj.imageSrc);
    if (!img || !img.complete) return;

    const w = obj.width || img.naturalWidth;
    const h = obj.height || img.naturalHeight;
    ctx.drawImage(img, obj.x || 0, obj.y || 0, w, h);
  }

  /**
   * 粗裁剪：shape 是否在视口内
   * @private
   */
  _shapeInView(shape, bounds) {
    // 简单包围盒检查
    const x = shape.x || 0;
    const y = shape.y || 0;
    const w = shape.width || shape.radius * 2 || 200;
    const h = shape.height || shape.radius * 2 || 200;
    return !(x + w < bounds.left || x > bounds.right || y + h < bounds.top || y > bounds.bottom);
  }

  /**
   * 粗裁剪：chunk 是否在视口内
   * @private
   */
  _chunkInView(chunk, bounds, camera) {
    const ox = chunk.origin.x, oy = chunk.origin.y;
    // chunk 尺寸从 sceneData 或默认 1280x720
    const cw = (chunk.sceneData && chunk.sceneData.size && chunk.sceneData.size.width) || 1280;
    const ch = (chunk.sceneData && chunk.sceneData.size && chunk.sceneData.size.height) || 720;
    return !(ox + cw < bounds.left || ox > bounds.right || oy + ch < bounds.top || oy > bounds.bottom);
  }
}

export default WorldTerrainRenderer;
