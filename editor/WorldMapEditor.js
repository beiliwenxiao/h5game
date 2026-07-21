/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

import { SceneEditorCanvas } from './SceneEditorCanvas.js';

/**
 * WorldMapEditor - 大地图块编辑器 Tab（P5-5）
 *
 * 功能：
 *   - 网格视图（cols×rows）编辑 worldMap.regions[0].grid
 *   - 每格可分配一个已有 scene（下拉选择）或置空
 *   - 设置 chunkWidth/chunkHeight、region id
 *   - 增减行列
 *   - 全局拼接预览（缩略图）
 *   - 读写 game.project.json 的 worldMap 字段
 *
 * 与 EditorDataManager 通信：读写同一份 GameProject（localStorage + /api/save-file）
 */
export class WorldMapEditor {
  /**
   * @param {HTMLElement} container - 编辑器挂载容器
   * @param {Object} opts - { dataManager, onSave }
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.gameId = opts.gameId || 'sanguo_zhangjiao';
    this.projectPath = `example/${this.gameId}/game.project.json`;
    this.project = null;

    // 当前编辑的 region 数据
    this.region = {
      id: 'prologue_world',
      chunkWidth: 1280,
      chunkHeight: 720,
      cols: 2,
      rows: 2,
      grid: [
        [null, null],
        [null, null]
      ]
    };

    // 可选场景列表（从 GameProject.scenes 读取）
    this.availableScenes = [];

    this._el = null;
  }

  /**
   * 初始化 UI
   */
  async init() {
    this._el = document.createElement('div');
    this._el.className = 'world-map-editor';
    this._el.innerHTML = this._buildHTML();
    this.container.innerHTML = '';
    this.container.appendChild(this._el);
    this._bindEvents();
    await this.loadFromProject();
  }

  /**
   * 从 game.project.json 加载 worldMap 数据
   */
  async loadFromProject() {
    try {
      const res = await fetch('/api/read-file?path=' + encodeURIComponent(this.projectPath));
      if (!res.ok) { console.warn('[WorldMapEditor] 加载失败', res.status); return; }
      const data = await res.json();
      this.project = typeof data.content === 'string' ? JSON.parse(data.content) : data;
    } catch (e) {
      console.warn('[WorldMapEditor] 加载异常', e);
      return;
    }

    // 读可选场景列表（从 localStorage 编辑器场景数据 + project.scenes）
    this.availableScenes = [];
    if (Array.isArray(this.project.scenes)) {
      for (const s of this.project.scenes) {
        if (s && s.id) this.availableScenes.push(s.id);
      }
    }
    // 也从 localStorage 读编辑器已保存的场景 id
    try {
      const raw = localStorage.getItem('yijian18-engine_editor_data_scenes_' + this.gameId);
      if (raw) {
        const scenes = JSON.parse(raw);
        if (Array.isArray(scenes)) {
          for (const s of scenes) {
            if (s && s.id && !this.availableScenes.includes(s.id)) {
              this.availableScenes.push(s.id);
            }
          }
        }
      }
    } catch (e) { /* ignore */ }

    // 读 worldMap
    if (this.project.worldMap && this.project.worldMap.regions && this.project.worldMap.regions[0]) {
      this._currentRegionIndex = 0;
      const r = this.project.worldMap.regions[0];
      this.region = {
        id: r.id || 'default',
        name: r.name || '',
        chunkWidth: r.chunkWidth || 1280,
        chunkHeight: r.chunkHeight || 720,
        cols: r.cols || 2,
        rows: r.rows || 2,
        grid: r.grid || []
      };
      this._normalizeGrid();
    }

    this._populateRegionSelect();
    // 更新输入框
    this._el.querySelector('.wme-region-name').value = this.region.name || '';
    this._render();
  }

  /**
   * 保存到 game.project.json
   */
  async save() {
    if (!this.project) {
      this._showToast('无工程数据，请先加载', 'error');
      return;
    }

    if (!this.project.worldMap) this.project.worldMap = { regions: [] };
    if (!this.project.worldMap.regions) this.project.worldMap.regions = [];
    const idx = this._currentRegionIndex || 0;
    this.project.worldMap.regions[idx] = { ...this.region };

    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.projectPath, content: JSON.stringify(this.project, null, 2) })
      });
      if (res.ok) {
        this._showToast('大地图已保存 ✓');
      } else {
        this._showToast('保存失败: ' + res.status, 'error');
      }
    } catch (e) {
      this._showToast('保存异常: ' + e.message, 'error');
    }
  }

  /** 增加一列 */
  addCol() {
    this.region.cols++;
    for (const row of this.region.grid) row.push(null);
    this._render();
  }

  /** 增加一行 */
  addRow() {
    this.region.rows++;
    this.region.grid.push(new Array(this.region.cols).fill(null));
    this._render();
  }

  /** 删除最后一列（至少保留 1 列） */
  removeCol() {
    if (this.region.cols <= 1) return;
    this.region.cols--;
    for (const row of this.region.grid) row.pop();
    this._render();
  }

  /** 删除最后一行（至少保留 1 行） */
  removeRow() {
    if (this.region.rows <= 1) return;
    this.region.rows--;
    this.region.grid.pop();
    this._render();
  }

  // ================ 内部方法 ================

  /** 确保 grid 尺寸与 cols/rows 一致 */
  _normalizeGrid() {
    while (this.region.grid.length < this.region.rows) {
      this.region.grid.push(new Array(this.region.cols).fill(null));
    }
    for (let r = 0; r < this.region.rows; r++) {
      if (!this.region.grid[r]) this.region.grid[r] = [];
      while (this.region.grid[r].length < this.region.cols) this.region.grid[r].push(null);
    }
  }

  _buildHTML() {
    return `
      <div class="wme-toolbar">
        <label>地图: <select class="wme-region-select"></select></label>
        <button class="wme-add-region">+ 新建地图</button>
        <span style="margin:0 8px;color:#555;">|</span>
        <label>Region ID: <input type="text" class="wme-region-id" value="${this.region.id}" /></label>
        <label>名称: <input type="text" class="wme-region-name" value="${this.region.name || ''}" /></label>
        <label>Chunk宽: <input type="number" class="wme-chunk-w" value="${this.region.chunkWidth}" min="320" step="64" /></label>
        <label>Chunk高: <input type="number" class="wme-chunk-h" value="${this.region.chunkHeight}" min="320" step="64" /></label>
        <button class="wme-add-col">+列</button>
        <button class="wme-remove-col">-列</button>
        <button class="wme-add-row">+行</button>
        <button class="wme-remove-row">-行</button>
        <button class="wme-save">💾 保存</button>
      </div>
      <div class="wme-grid-container"></div>
      <div class="wme-toast" style="display:none;"></div>
    `;
  }

  _bindEvents() {
    this._el.querySelector('.wme-add-col').onclick = () => this.addCol();
    this._el.querySelector('.wme-remove-col').onclick = () => this.removeCol();
    this._el.querySelector('.wme-add-row').onclick = () => this.addRow();
    this._el.querySelector('.wme-remove-row').onclick = () => this.removeRow();
    this._el.querySelector('.wme-save').onclick = () => this.save();

    this._el.querySelector('.wme-region-id').oninput = (e) => { this.region.id = e.target.value; };
    this._el.querySelector('.wme-region-name').oninput = (e) => { this.region.name = e.target.value; };
    this._el.querySelector('.wme-chunk-w').oninput = (e) => { this.region.chunkWidth = parseInt(e.target.value) || 1280; };
    this._el.querySelector('.wme-chunk-h').oninput = (e) => { this.region.chunkHeight = parseInt(e.target.value) || 720; };

    // 地图选择器
    this._el.querySelector('.wme-region-select').onchange = (e) => {
      const idx = parseInt(e.target.value);
      if (!isNaN(idx)) this._switchRegion(idx);
    };
    this._el.querySelector('.wme-add-region').onclick = () => this._addNewRegion();
  }

  /** 切换当前编辑的 region */
  _switchRegion(index) {
    if (!this.project || !this.project.worldMap || !this.project.worldMap.regions) return;
    const regions = this.project.worldMap.regions;
    if (index < 0 || index >= regions.length) return;
    this._currentRegionIndex = index;
    const r = regions[index];
    this.region = {
      id: r.id || 'default',
      name: r.name || '',
      chunkWidth: r.chunkWidth || 1280,
      chunkHeight: r.chunkHeight || 720,
      cols: r.cols || 2,
      rows: r.rows || 2,
      grid: r.grid || []
    };
    this._normalizeGrid();
    // 更新输入框
    this._el.querySelector('.wme-region-id').value = this.region.id;
    this._el.querySelector('.wme-region-name').value = this.region.name || '';
    this._el.querySelector('.wme-chunk-w').value = this.region.chunkWidth;
    this._el.querySelector('.wme-chunk-h').value = this.region.chunkHeight;
    this._render();
  }

  /** 新建地图 region */
  _addNewRegion() {
    const name = prompt('新地图名称:', '新地图');
    if (!name) return;
    const id = 'region_' + Date.now();
    const newRegion = {
      id, name,
      chunkWidth: 1280, chunkHeight: 720,
      cols: 2, rows: 2,
      grid: [[null, null], [null, null]]
    };
    if (!this.project) this.project = {};
    if (!this.project.worldMap) this.project.worldMap = { regions: [] };
    if (!this.project.worldMap.regions) this.project.worldMap.regions = [];
    this.project.worldMap.regions.push(newRegion);
    this._populateRegionSelect();
    // 切换到新建的
    const idx = this.project.worldMap.regions.length - 1;
    this._el.querySelector('.wme-region-select').value = idx;
    this._switchRegion(idx);
    this._showToast(`已创建地图: ${name}`);
  }

  /** 填充 region 下拉选择器 */
  _populateRegionSelect() {
    const select = this._el.querySelector('.wme-region-select');
    if (!select) return;
    const regions = (this.project && this.project.worldMap && this.project.worldMap.regions) || [];
    select.innerHTML = regions.map((r, i) =>
      `<option value="${i}"${i === (this._currentRegionIndex || 0) ? ' selected' : ''}>${r.name || r.id}</option>`
    ).join('');
  }

  /** 渲染网格视图 */
  _render() {
    const gc = this._el.querySelector('.wme-grid-container');
    if (!gc) return;

    // 缩略图宽度固定 256，高度按 chunk 宽高比
    const thumbW = 256;
    const thumbH = Math.round(thumbW * (this.region.chunkHeight / this.region.chunkWidth));

    const sceneOpts = ['<option value="">(空)</option>']
      .concat(this.availableScenes.map(id => `<option value="${id}">${id}</option>`))
      .join('');

    let html = `<div class="wme-grid" style="display:grid;grid-template-columns:repeat(${this.region.cols},${thumbW}px);gap:4px;">`;
    for (let r = 0; r < this.region.rows; r++) {
      for (let c = 0; c < this.region.cols; c++) {
        const val = (this.region.grid[r] && this.region.grid[r][c]) || '';
        html += `
          <div class="wme-cell" data-r="${r}" data-c="${c}"
               style="width:${thumbW}px;height:${thumbH}px;
                      border:1px solid #444;border-radius:4px;position:relative;
                      cursor:pointer;overflow:hidden;background:#111;">
            <canvas class="wme-cell-canvas" width="${thumbW}" height="${thumbH}"
                    style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
            <span class="wme-cell-label" style="position:absolute;bottom:0;left:0;right:0;
                  font-size:10px;color:#ccc;background:rgba(0,0,0,0.6);
                  text-align:center;padding:2px 0;pointer-events:none;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${val || '(空)'}
            </span>
            <div class="wme-cell-overlay" style="display:none;position:absolute;inset:0;
                 background:rgba(0,0,0,0.7);flex-direction:column;align-items:center;
                 justify-content:center;gap:6px;padding:8px;border-radius:4px;">
              <div style="font-size:11px;color:#8cf;font-weight:bold;">(${r}, ${c})</div>
              <select class="wme-cell-select" data-r="${r}" data-c="${c}"
                      style="width:92%;font-size:11px;background:#222;color:#eee;border:1px solid #666;
                             border-radius:3px;padding:3px;">
                ${sceneOpts.replace(`value="${val}"`, `value="${val}" selected`)}
              </select>
            </div>
          </div>`;
      }
    }
    html += '</div>';
    html += `<div style="margin-top:8px;color:#aaa;font-size:12px;">${this.region.cols}×${this.region.rows} 格，chunk ${this.region.chunkWidth}×${this.region.chunkHeight}px</div>`;

    gc.innerHTML = html;

    // 绑定 hover
    gc.querySelectorAll('.wme-cell').forEach(cell => {
      const overlay = cell.querySelector('.wme-cell-overlay');
      cell.addEventListener('mouseenter', () => { overlay.style.display = 'flex'; });
      cell.addEventListener('mouseleave', () => { overlay.style.display = 'none'; });
    });

    // 绑定 select 变化
    gc.querySelectorAll('.wme-cell-select').forEach(sel => {
      sel.onchange = (e) => {
        const r = parseInt(e.target.dataset.r);
        const c = parseInt(e.target.dataset.c);
        const val = e.target.value || null;
        this.region.grid[r][c] = val;
        const cell = e.target.closest('.wme-cell');
        cell.querySelector('.wme-cell-label').textContent = val || '(空)';
        this._renderCellThumbnail(cell, val, thumbW, thumbH);
      };
    });

    // 绘制所有格子的缩略图
    gc.querySelectorAll('.wme-cell').forEach(cell => {
      const r = parseInt(cell.dataset.r);
      const c = parseInt(cell.dataset.c);
      const sceneId = (this.region.grid[r] && this.region.grid[r][c]) || null;
      this._renderCellThumbnail(cell, sceneId, thumbW, thumbH);
    });
  }

  /**
   * 绘制单格缩略图：直接当真实游戏场景来画（缩小 20%），复用场景编辑器渲染
   * @private
   */
  _renderCellThumbnail(cell, sceneId, thumbW, thumbH) {
    const canvas = cell.querySelector('.wme-cell-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, thumbW, thumbH);

    if (!sceneId) {
      ctx.strokeStyle = '#333';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(thumbW, thumbH);
      ctx.moveTo(thumbW, 0); ctx.lineTo(0, thumbH);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const scene = this._getSceneData(sceneId);
    if (!scene) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, thumbW, thumbH);
      ctx.fillStyle = '#555';
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('无场景数据', thumbW / 2, thumbH / 2);
      return;
    }

    // 确保图片已加载（首次会触发异步加载，加载完后重绘）
    this._ensureImagesLoaded(scene, () => {
      this._drawSceneToCanvas(ctx, scene, thumbW, thumbH);
    });

    // 同步先画一次（图片可能已缓存）
    this._drawSceneToCanvas(ctx, scene, thumbW, thumbH);
  }

  /**
   * 把场景数据绘制到 canvas（与场景编辑器完全一致的渲染）
   * @private
   */
  _drawSceneToCanvas(ctx, scene, thumbW, thumbH) {
    const sceneW = scene.width || this.region.chunkWidth;
    const sceneH = scene.height || this.region.chunkHeight;
    const scale = thumbW / sceneW;

    ctx.clearRect(0, 0, thumbW, thumbH);

    // 背景色
    ctx.fillStyle = scene.backgroundColor || '#1a2a1a';
    ctx.fillRect(0, 0, thumbW, thumbH);

    // 构造 fake editor
    const fakeEditor = {
      sceneData: {
        ...scene,
        // 补充 decoSprites（场景数据可能没存，用默认配置兜底）
        decoSprites: scene.decoSprites || this._defaultDecoSprites || {}
      },
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      options: { showGrid: false, showBackground: true },
      loadedImages: this._loadedImages,
      selectedObjects: [],
      activeLayerIndex: 0
    };

    if (!this._canvasRenderer) {
      this._canvasRenderer = new SceneEditorCanvas(fakeEditor);
    } else {
      this._canvasRenderer.editor = fakeEditor;
      // 清除缓存的 resolver，让它用新 editor 的 loadedImages
      this._canvasRenderer._shapeResolverObj = null;
    }
    const renderer = this._canvasRenderer;

    // 缩放到场景坐标系
    ctx.save();
    const sceneX = 0;
    const sceneY = 0;
    ctx.scale(scale, scale);
    ctx.translate(-sceneX, -sceneY);

    // 按图层顺序渲染
    if (Array.isArray(scene.layers)) {
      for (const layer of scene.layers) {
        if (layer.visible === false) continue;
        if (!Array.isArray(layer.objects)) continue;
        const lid = (layer.id || '').toLowerCase();
        if (/logic|placement/.test(lid)) continue;

        for (const obj of layer.objects) {
          if (obj.type === 'region' || obj.type === 'spawn' || obj.type === 'portal' || obj.type === 'npc' || obj.type === 'ref') continue;
          try {
            renderer._renderObject(ctx, obj);
          } catch (e) { /* 静默 */ }
        }
      }
    }

    ctx.restore();
  }

  /**
   * 确保场景所需的图集/图片已加载到 _loadedImages 缓存
   * @private
   */
  _ensureImagesLoaded(scene, onComplete) {
    if (!this._loadedImages) this._loadedImages = new Map();
    const toLoad = [];

    // 地形图集（terrain_atlas）
    const terrainImg = scene.terrain && scene.terrain.image;
    if (terrainImg && !this._loadedImages.has('terrain_atlas')) {
      toLoad.push({ id: 'terrain_atlas', src: terrainImg });
    }

    // 场景图集列表
    if (Array.isArray(scene.atlases)) {
      for (const atlas of scene.atlases) {
        if (atlas.id && atlas.path && !this._loadedImages.has(atlas.id)) {
          toLoad.push({ id: atlas.id, src: atlas.path });
        }
      }
    }

    // 场景没存 atlases 时，用默认图集配置（与场景编辑器一致）
    if (!scene.atlases && !this._defaultAtlasLoaded) {
      this._defaultAtlasLoaded = true;
      // 从 config/atlases.json 异步加载
      fetch('./config/atlases.json').then(r => r.json()).then(cfg => {
        if (cfg && Array.isArray(cfg.atlases)) {
          let loaded2 = 0;
          for (const atlas of cfg.atlases) {
            if (this._loadedImages.has(atlas.id)) { loaded2++; continue; }
            const img = new Image();
            img.onload = () => {
              this._loadedImages.set(atlas.id, img);
              // 也设为 terrain_atlas（场景编辑器惯例）
              if (!this._loadedImages.has('terrain_atlas')) this._loadedImages.set('terrain_atlas', img);
              loaded2++;
              if (loaded2 >= cfg.atlases.length && onComplete) onComplete();
            };
            img.onerror = () => { loaded2++; if (loaded2 >= cfg.atlases.length && onComplete) onComplete(); };
            img.src = atlas.path;
          }
        }
      }).catch(() => {});
    }

    // 场景没存 decoSprites 时，从 config/deco-sprites.json 加载
    if (!scene.decoSprites && !this._defaultDecoLoaded) {
      this._defaultDecoLoaded = true;
      fetch('./config/deco-sprites.json').then(r => r.json()).then(cfg => {
        // 合并 outdoor + indoor 到场景 decoSprites
        this._defaultDecoSprites = { ...(cfg.outdoor || {}), ...(cfg.indoor || {}) };
      }).catch(() => {});
    }

    // 场景内嵌图片（imageAssets）
    if (scene.imageAssets) {
      for (const [id, asset] of Object.entries(scene.imageAssets)) {
        if (!this._loadedImages.has(id)) {
          const src = typeof asset === 'string' ? asset : (asset && asset.src);
          if (src) toLoad.push({ id, src: this._resolveImagePath(src) });
        }
      }
    }

    if (toLoad.length === 0) return;

    let loaded = 0;
    for (const item of toLoad) {
      const img = new Image();
      img.onload = () => {
        this._loadedImages.set(item.id, img);
        loaded++;
        if (loaded >= toLoad.length && onComplete) onComplete();
      };
      img.onerror = () => {
        loaded++;
        if (loaded >= toLoad.length && onComplete) onComplete();
      };
      img.src = this._resolveImagePath(item.src);
    }
  }

  /**
   * 解析图片路径（编辑器上下文中直接用原始路径，因为 WorldMapEditor 和场景编辑器在同一 HTML）
   * @private
   */
  _resolveImagePath(src) {
    return src || '';
  }

  _showToast(msg) {
    const t = this._el.querySelector('.wme-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    t.style.cssText = 'display:block;position:fixed;bottom:20px;right:20px;background:#4CAF50;color:#fff;padding:10px 20px;border-radius:6px;z-index:99999;';
    setTimeout(() => { t.style.display = 'none'; }, 2000);
  }

  /**
   * 从 localStorage 获取场景数据
   * @private
   */
  _getSceneData(sceneId) {
    try {
      const raw = localStorage.getItem('yijian18-engine_editor_data_scenes_' + this.gameId);
      if (!raw) return null;
      const scenes = JSON.parse(raw);
      if (!Array.isArray(scenes)) return null;
      return scenes.find(s => s && s.id === sceneId) || null;
    } catch (e) {
      return null;
    }
  }
}


export default WorldMapEditor;
