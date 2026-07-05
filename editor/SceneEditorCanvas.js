/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 */

import { ShapeRenderer } from '../src/rendering/ShapeRenderer.js';

/**
 * SceneEditorCanvas - 场景编辑器渲染模块
 * 负责所有 Canvas 绘制逻辑
 */
export class SceneEditorCanvas {
  /**
   * @param {import('./SceneEditor.js').SceneEditor} editor - 主编辑器实例
   */
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * 渲染场景
   */
  render() {
    const editor = this.editor;
    const canvas = document.getElementById('editor-canvas');
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(editor.viewport.offsetX, editor.viewport.offsetY);
    ctx.scale(editor.viewport.scale, editor.viewport.scale);

    // 计算场景可见区域（以地形中心为基准居中）
    const centerX = editor.sceneData.centerX || editor.sceneData.width / 2;
    const centerY = editor.sceneData.centerY || editor.sceneData.height / 2;
    const sceneW = editor.sceneData.width;
    const sceneH = editor.sceneData.height;
    const sceneX = centerX - sceneW / 2;
    const sceneY = centerY - sceneH / 2;

    // 绘制背景（辅助用的长方形纯色背景）
    if (editor.options.showBackground) {
      ctx.fillStyle = editor.sceneData.backgroundColor || '#1a2a1a';
      ctx.fillRect(sceneX, sceneY, sceneW, sceneH);
    }

    // 绘制场景边框（辅助线）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1 / editor.viewport.scale;
    ctx.strokeRect(sceneX, sceneY, sceneW, sceneH);

    // === 按图层顺序渲染，地形效果穿插在对应图层位置 ===
    const data = editor.sceneData;
    const hasTerrain = !!data.terrain;

    for (let i = 0; i < data.layers.length; i++) {
      const layer = data.layers[i];
      if (!layer.visible) continue;

      // 背景填充层：渲染地形背景椭圆（草地）
      if (layer.id === 'layer_fill' && hasTerrain) {
        this._renderTerrainBackground(ctx);
      }

      // 遮罩层：渲染地形遮罩效果（森林环带）
      if (layer.id === 'layer_mask' && hasTerrain) {
        this._renderTerrainMask(ctx);
      }

      // 渲染该图层的所有对象
      for (const obj of layer.objects) this._renderObject(ctx, obj);
    }

    // 绘制网格（以地形中心为基准对齐）
    if (editor.options.showGrid) this._renderGrid(ctx, sceneX, sceneY, sceneW, sceneH);

    ctx.restore();
    this._renderSelection();
  }

  /**
   * 渲染网格
   * @private
   */
  _renderGrid(ctx, startX, startY, width, height) {
    const editor = this.editor;
    const gridSize = editor.options.gridSize;
    const sx = startX !== undefined ? startX : 0;
    const sy = startY !== undefined ? startY : 0;
    const w = width !== undefined ? width : editor.sceneData.width;
    const h = height !== undefined ? height : editor.sceneData.height;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1 / editor.viewport.scale;

    const gridStartX = Math.ceil(sx / gridSize) * gridSize;
    const gridStartY = Math.ceil(sy / gridSize) * gridSize;

    for (let x = gridStartX; x <= sx + w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x, sy + h);
      ctx.stroke();
    }

    for (let y = gridStartY; y <= sy + h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + w, y);
      ctx.stroke();
    }
  }

  /**
   * 为 ShapeRenderer 提供资源解析器（图片/切片）
   * @private
   */
  _shapeResolver() {
    if (!this._shapeResolverObj) {
      const editor = this.editor;
      this._shapeResolverObj = {
        getImage: (key) => editor.loadedImages.get(key) || null,
        getSliceSource: (shape) => this._getEllipseSliceSource(shape)
      };
    }
    return this._shapeResolverObj;
  }

  /**
   * 渲染对象
   * @private
   */
  _renderObject(ctx, obj) {
    if (obj.type === 'shape') {
      ShapeRenderer.render(ctx, obj, this._shapeResolver(), { showLabel: true });
    } else if (obj.type === 'fill') {
      // 旧 fill = 矩形填充，交给统一 ShapeRenderer
      ShapeRenderer.render(ctx, { ...obj, shapeType: 'rect' }, this._shapeResolver());
    } else if (obj.type === 'ellipse') {
      // 旧 ellipse = 椭圆 shape
      ShapeRenderer.render(ctx, { ...obj, shapeType: 'ellipse' }, this._shapeResolver(), { showLabel: true });
    } else if (obj.type === 'deco') {
      this._renderDecoObject(ctx, obj);
    } else if (obj.type === 'rect') {
      ctx.fillStyle = obj.fill || '#4a5a8e';
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
    } else if (obj.type === 'circle') {
      ctx.fillStyle = obj.fill || '#4a8e5a';
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (obj.type === 'image') {
      const img = this.editor.loadedImages.get(obj.imageId);
      if (img) {
        ctx.save();
        ctx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2);
        if (obj.rotation) ctx.rotate(obj.rotation * Math.PI / 180);
        ctx.drawImage(img, -obj.width / 2, -obj.height / 2, obj.width, obj.height);
        ctx.restore();
      }
    } else if (obj.type === 'slice') {
      this._renderSliceObject(ctx, obj);
    }
  }

  /**
   * 渲染切片对象
   * @private
   */
  _renderSliceObject(ctx, obj) {
    const editor = this.editor;
    let img, sx, sy, sw, sh;

    if (obj.decoKey) {
      const sprite = editor.sceneData.decoSprites?.[obj.decoKey];
      img = editor.loadedImages.get('terrain_atlas');
      if (!img && editor.sceneData.atlases) {
        for (const atlas of editor.sceneData.atlases) {
          const a = editor.loadedImages.get(atlas.id);
          if (a) { img = a; break; }
        }
      }
      if (sprite) { sx = sprite.sx; sy = sprite.sy; sw = sprite.sw; sh = sprite.sh; }
    } else {
      const atlas = editor.sceneData.atlases?.find(a => a.id === obj.atlasId);
      const slice = atlas?.slices?.[obj.sliceKey];
      img = editor.loadedImages.get(obj.atlasId);
      if (slice) { sx = slice.sx; sy = slice.sy; sw = slice.sw; sh = slice.sh; }
    }

    if (img && sw != null) {
      ctx.drawImage(img, sx, sy, sw, sh, obj.x, obj.y, obj.width, obj.height);
    } else {
      ctx.fillStyle = '#3a5a3a';
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      ctx.strokeStyle = '#5a8a5a';
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
    }
  }

  /**
   * 渲染装饰物对象（type:'deco'）
   * @private
   */
  _renderDecoObject(ctx, obj) {
    const editor = this.editor;
    const decoSprites = editor.sceneData.decoSprites;
    const key = obj.decoKey || obj.name;

    if (!decoSprites || !decoSprites[key]) {
      ctx.fillStyle = key && key.includes('tree') ? '#2a5a2a' : '#5a8a4a';
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(key ? key.substring(0, 4) : '?', obj.x + obj.width / 2, obj.y + obj.height / 2);
      ctx.textAlign = 'left';
      return;
    }

    const sprite = decoSprites[key];
    let img = editor.loadedImages.get('terrain_atlas');
    if (!img && editor.sceneData.atlases) {
      for (const atlas of editor.sceneData.atlases) {
        const a = editor.loadedImages.get(atlas.id);
        if (a) { img = a; break; }
      }
    }

    if (img) {
      ctx.drawImage(img, sprite.sx, sprite.sy, sprite.sw, sprite.sh, obj.x, obj.y, obj.width, obj.height);
    } else {
      ctx.fillStyle = key.includes('tree') ? '#2a5a2a' : '#5a8a4a';
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      ctx.strokeStyle = '#4a8a4a';
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(key.substring(0, 4), obj.x + obj.width / 2, obj.y + obj.height / 2);
      ctx.textAlign = 'left';
    }
  }

  /**
   * 渲染背景填充对象
   * @private
   */
  _renderFillObject(ctx, obj) {
    const editor = this.editor;
    const x = obj.x || 0;
    const y = obj.y || 0;
    const w = obj.width || editor.sceneData.width;
    const h = obj.height || editor.sceneData.height;

    ctx.save();
    if (obj.opacity !== undefined) {
      ctx.globalAlpha = obj.opacity;
    }

    const fillMode = obj.fillMode || 'color';

    if (fillMode === 'color') {
      ctx.fillStyle = obj.fillColor || '#333333';
      ctx.fillRect(x, y, w, h);
    } else if (fillMode === 'gradient') {
      let grad;
      if (obj.gradientType === 'radial') {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = Math.max(w, h) / 2;
        grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      } else {
        const angle = (obj.gradientAngle || 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        grad = ctx.createLinearGradient(
          x + w / 2 - cos * w / 2, y + h / 2 - sin * h / 2,
          x + w / 2 + cos * w / 2, y + h / 2 + sin * h / 2
        );
      }
      const stops = obj.gradientStops || [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#333333' }
      ];
      for (const stop of stops) {
        grad.addColorStop(stop.offset, stop.color);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    } else if (fillMode === 'image') {
      const img = editor.loadedImages.get(obj.imageId || obj.imageSrc);
      if (img) {
        const drawMode = obj.imageMode || 'stretch';
        if (drawMode === 'stretch') {
          ctx.drawImage(img, x, y, w, h);
        } else if (drawMode === 'cover') {
          const imgRatio = img.width / img.height;
          const boxRatio = w / h;
          let sw, sh, sx, sy;
          if (imgRatio > boxRatio) {
            sh = img.height; sw = sh * boxRatio; sx = (img.width - sw) / 2; sy = 0;
          } else {
            sw = img.width; sh = sw / boxRatio; sx = 0; sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
        } else if (drawMode === 'contain') {
          const imgRatio = img.width / img.height;
          const boxRatio = w / h;
          let dw, dh, dx, dy;
          if (imgRatio > boxRatio) {
            dw = w; dh = w / imgRatio; dx = x; dy = y + (h - dh) / 2;
          } else {
            dh = h; dw = h * imgRatio; dx = x + (w - dw) / 2; dy = y;
          }
          ctx.drawImage(img, dx, dy, dw, dh);
        } else if (drawMode === 'tile') {
          const pattern = ctx.createPattern(img, 'repeat');
          ctx.fillStyle = pattern;
          ctx.translate(x, y);
          ctx.fillRect(0, 0, w, h);
          ctx.translate(-x, -y);
        }
      } else {
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#5a5a5a';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        ctx.setLineDash([]);
        ctx.fillStyle = '#888';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🖼️ ' + (obj.imageSrc || '未设置图片'), x + w / 2, y + h / 2);
      }
    } else if (fillMode === 'pattern') {
      const patternType = obj.patternType || 'grid';
      const patternColor = obj.patternColor || '#444444';
      const patternBg = obj.patternBg || '#222222';
      const patternSize = obj.patternSize || 32;

      ctx.fillStyle = patternBg;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = patternColor;
      ctx.fillStyle = patternColor;
      ctx.lineWidth = 1;

      if (patternType === 'grid') {
        for (let px = x; px < x + w; px += patternSize) {
          ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
        }
        for (let py = y; py < y + h; py += patternSize) {
          ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke();
        }
      } else if (patternType === 'dots') {
        for (let px = x + patternSize / 2; px < x + w; px += patternSize) {
          for (let py = y + patternSize / 2; py < y + h; py += patternSize) {
            ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
          }
        }
      } else if (patternType === 'diagonal') {
        ctx.beginPath();
        for (let d = -h; d < w + h; d += patternSize) {
          ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h);
        }
        ctx.stroke();
      } else if (patternType === 'crosshatch') {
        ctx.beginPath();
        for (let d = -h; d < w + h; d += patternSize) {
          ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h);
          ctx.moveTo(x + d + h, y); ctx.lineTo(x + d, y + h);
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * 渲染地形背景效果（草地椭圆）
   * 注意：椭圆对象已独立为 type:'ellipse'，此处只渲染非椭圆的辅助效果
   * @private
   */
  _renderTerrainBackground(ctx) {
    const data = this.editor.sceneData;
    if (!data.terrain) return;

    const terrainType = data.terrain.type || 'basin';

    if (terrainType === 'indoor') {
      ctx.fillStyle = data.backgroundColor || '#2a2020';
      ctx.fillRect(0, 0, data.width, data.height);
      const tileSize = data.terrain?.tileSize || 48;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      for (let x = 0; x < data.width; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, data.height); ctx.stroke();
      }
      for (let y = 0; y < data.height; y += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(data.width, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, data.width, 60);
      ctx.fillRect(0, 0, 40, data.height);
      ctx.fillRect(data.width - 40, 0, 40, data.height);
      ctx.fillRect(0, data.height - 40, data.width, 40);
    }
    // 非 indoor 场景：椭圆由 type:'ellipse' 对象渲染，此处不再自动画
  }

  /**
   * 渲染地形遮罩效果（森林环带渐变）
   * @private
   */
  _renderTerrainMask(ctx) {
    const data = this.editor.sceneData;
    if (!data.terrain) return;

    const terrainType = data.terrain.type || 'basin';
    if (terrainType === 'indoor') return;

    // 优先从 layer_fill 中的 ellipse 对象读取参数
    let centerX, centerY, radiusX, aspectY;
    const fillLayer = data.layers.find(l => l.id === 'layer_fill');
    const ellipseObj = fillLayer && fillLayer.objects.find(o =>
      o.type === 'ellipse' || (o.type === 'shape' && o.shapeType === 'ellipse'));
    if (ellipseObj) {
      centerX = ellipseObj.x + ellipseObj.width / 2;
      centerY = ellipseObj.y + ellipseObj.height / 2;
      radiusX = ellipseObj.width / 2;
      aspectY = ellipseObj.height / ellipseObj.width;
    } else {
      centerX = data.centerX || data.width / 2;
      centerY = (data.centerY || data.height / 2) - 32;
      radiusX = data.basinRadius || 640;
      aspectY = data.basinAspectY || 0.65;
    }

    let forestColor = 'rgba(35, 58, 25, 1)';
    if (terrainType === 'battlefield') forestColor = 'rgba(50, 30, 25, 1)';
    else if (terrainType === 'mountain') forestColor = 'rgba(40, 45, 30, 1)';
    else if (terrainType === 'camp') forestColor = 'rgba(30, 50, 35, 1)';

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(1, aspectY);
    const grad = ctx.createRadialGradient(0, 0, radiusX - 10, 0, 0, radiusX + 110);
    grad.addColorStop(0, forestColor);
    grad.addColorStop(0.55, forestColor.replace('1)', '0.92)'));
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radiusX + 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 渲染椭圆对象
   * 支持填充模式：color（纯色）/ image（图片）/ slice（图集切片）
   * 支持边缘淡化特效 edgeFade（0~1）
   * @private
   */
  _renderEllipseObject(ctx, obj) {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const rx = obj.width / 2;
    const ry = obj.height / 2;
    const fillMode = obj.fillMode || 'color';
    const bx = obj.x, by = obj.y, bw = obj.width, bh = obj.height;

    ctx.save();
    if (obj.opacity !== undefined) ctx.globalAlpha = obj.opacity;

    // 椭圆裁剪区
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    // 按填充模式绘制
    if (fillMode === 'image') {
      const img = this.editor.loadedImages.get(obj.imageId) ||
                  this.editor.loadedImages.get(obj.imageSrc);
      if (img) {
        this._drawImageInBox(ctx, img, bx, by, bw, bh, obj.imageMode || 'cover');
      } else {
        ctx.fillStyle = obj.fill || '#3a5a2a';
        ctx.fillRect(bx, by, bw, bh);
      }
    } else if (fillMode === 'slice') {
      const drawn = this._drawSliceInBox(ctx, obj, bx, by, bw, bh, obj.sliceMode || 'tile');
      if (!drawn) { ctx.fillStyle = obj.fill || '#3a5a2a'; ctx.fillRect(bx, by, bw, bh); }
    } else {
      ctx.fillStyle = obj.fillColor || obj.fill || '#3a5a2a';
      ctx.fillRect(bx, by, bw, bh);
    }

    // 边缘淡化：在裁剪区内用 destination-out 径向渐变擦除边缘
    const edgeFade = Math.max(0, Math.min(1, obj.edgeFade || 0));
    if (edgeFade > 0) {
      const fadeStart = 1 - edgeFade; // 从此比例处开始向边缘淡出
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx); // 让径向渐变呈椭圆形
      const grad = ctx.createRadialGradient(0, 0, rx * fadeStart, 0, 0, rx);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // 退出裁剪

    // 边框（不裁剪）
    if (obj.stroke && (obj.strokeWidth || 0) > 0) {
      ctx.strokeStyle = obj.stroke;
      ctx.lineWidth = obj.strokeWidth;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 名称标签
    if (obj.name) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#fff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obj.name, cx, cy);
    }

    ctx.restore();
  }

  /**
   * 将图片按指定模式绘制到矩形框内（stretch/cover/contain/tile）
   * @private
   */
  _drawImageInBox(ctx, img, x, y, w, h, mode) {
    if (mode === 'stretch') {
      ctx.drawImage(img, x, y, w, h);
    } else if (mode === 'contain') {
      const imgRatio = img.width / img.height;
      const boxRatio = w / h;
      let dw, dh, dx, dy;
      if (imgRatio > boxRatio) { dw = w; dh = w / imgRatio; dx = x; dy = y + (h - dh) / 2; }
      else { dh = h; dw = h * imgRatio; dx = x + (w - dw) / 2; dy = y; }
      ctx.drawImage(img, dx, dy, dw, dh);
    } else if (mode === 'tile') {
      const pattern = ctx.createPattern(img, 'repeat');
      ctx.fillStyle = pattern;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else {
      // cover（默认）
      const imgRatio = img.width / img.height;
      const boxRatio = w / h;
      let sw, sh, sx, sy;
      if (imgRatio > boxRatio) { sh = img.height; sw = sh * boxRatio; sx = (img.width - sw) / 2; sy = 0; }
      else { sw = img.width; sh = sw / boxRatio; sx = 0; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }
  }

  /**
   * 获取椭圆填充切片的图源信息
   * @private
   * @returns {{img, sx, sy, sw, sh}|null}
   */
  _getEllipseSliceSource(obj) {
    const editor = this.editor;
    let img, sx, sy, sw, sh;
    if (obj.decoKey) {
      const sprite = editor.sceneData.decoSprites?.[obj.decoKey];
      img = editor.loadedImages.get('terrain_atlas');
      if (!img && editor.sceneData.atlases) {
        for (const atlas of editor.sceneData.atlases) {
          const a = editor.loadedImages.get(atlas.id);
          if (a) { img = a; break; }
        }
      }
      if (sprite) { sx = sprite.sx; sy = sprite.sy; sw = sprite.sw; sh = sprite.sh; }
    } else if (obj.atlasId && obj.sliceKey) {
      const atlas = editor.sceneData.atlases?.find(a => a.id === obj.atlasId);
      const slice = atlas?.slices?.[obj.sliceKey];
      img = editor.loadedImages.get(obj.atlasId);
      if (slice) { sx = slice.sx; sy = slice.sy; sw = slice.sw; sh = slice.sh; }
    }
    if (img && sw != null) return { img, sx, sy, sw, sh };
    return null;
  }

  /**
   * 将图集切片平铺/拉伸绘制到矩形框内
   * @private
   * @returns {boolean} 是否成功绘制
   */
  _drawSliceInBox(ctx, obj, x, y, w, h, mode) {
    const src = this._getEllipseSliceSource(obj);
    if (!src) return false;
    const { img, sx, sy, sw, sh } = src;

    if (mode === 'stretch') {
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      return true;
    }
    // tile（默认）：先把单个切片画到离屏 canvas，再平铺
    const tile = document.createElement('canvas');
    tile.width = sw;
    tile.height = sh;
    tile.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.fillStyle = pattern;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return true;
  }

  /**
   * 渲染选中框
   * @private
   */
  _renderSelection() {
    const editor = this.editor;
    const overlay = document.getElementById('editor-overlay');
    if (!overlay) return;

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (editor.selectedObjects.length === 0) return;

    ctx.save();
    ctx.translate(editor.viewport.offsetX, editor.viewport.offsetY);
    ctx.scale(editor.viewport.scale, editor.viewport.scale);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / editor.viewport.scale;
    ctx.setLineDash([6 / editor.viewport.scale, 4 / editor.viewport.scale]);

    const handleSize = 8 / editor.viewport.scale;

    for (const obj of editor.selectedObjects) {
      let x, y, w, h;

      if (obj.type === 'decoration') {
        w = obj.width || 64;
        h = obj.height || 64;
        x = obj.x - w / 2 - 2;
        y = obj.y - h - 2;
        w += 4;
        h += 4;
        ctx.strokeRect(x, y, w, h);
      } else if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill' || obj.type === 'deco' || obj.type === 'ellipse') {
        x = obj.x - 2;
        y = obj.y - 2;
        w = obj.width + 4;
        h = obj.height + 4;
        ctx.strokeRect(x, y, w, h);
      } else if (obj.type === 'circle') {
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      } else if (obj.type === 'shape') {
        const bb = ShapeRenderer.getBBox(obj);
        x = bb.x - 2; y = bb.y - 2; w = bb.w + 4; h = bb.h + 4;
        ctx.strokeRect(x, y, w, h);
        // 多边形/路径：显示可拖拽的顶点手柄，不显示缩放手柄
        if ((obj.shapeType === 'polygon' || obj.shapeType === 'path') && Array.isArray(obj.points)) {
          ctx.setLineDash([]);
          ctx.fillStyle = '#ffdd44';
          ctx.strokeStyle = '#4a90d9';
          ctx.lineWidth = 1.5 / editor.viewport.scale;
          const vs = handleSize;
          for (const p of obj.points) {
            ctx.fillRect(p[0] - vs / 2, p[1] - vs / 2, vs, vs);
            ctx.strokeRect(p[0] - vs / 2, p[1] - vs / 2, vs, vs);
          }
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / editor.viewport.scale;
          ctx.setLineDash([6 / editor.viewport.scale, 4 / editor.viewport.scale]);
          continue;
        }
        // rect/ellipse/circle 形状：继续走下方缩放手柄
      } else {
        continue;
      }

      // 绘制右下角缩放手柄
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = 1.5 / editor.viewport.scale;
      const hx = x + w - handleSize / 2;
      const hy = y + h - handleSize / 2;
      ctx.fillRect(hx, hy, handleSize, handleSize);
      ctx.strokeRect(hx, hy, handleSize, handleSize);

      // 恢复虚线样式
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / editor.viewport.scale;
      ctx.setLineDash([6 / editor.viewport.scale, 4 / editor.viewport.scale]);
    }

    ctx.restore();
  }
}
