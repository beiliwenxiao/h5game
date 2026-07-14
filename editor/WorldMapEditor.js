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

/**
 * WorldMapEditor - 世界地图编辑器 Tab（P5-5）
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
      const raw = localStorage.getItem('h5game_editor_data_scenes_' + this.gameId);
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
      const r = this.project.worldMap.regions[0];
      this.region = {
        id: r.id || 'default',
        chunkWidth: r.chunkWidth || 1280,
        chunkHeight: r.chunkHeight || 720,
        cols: r.cols || 2,
        rows: r.rows || 2,
        grid: r.grid || []
      };
      this._normalizeGrid();
    }

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
    this.project.worldMap.regions[0] = { ...this.region };

    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.projectPath, content: JSON.stringify(this.project, null, 2) })
      });
      if (res.ok) {
        this._showToast('世界地图已保存 ✓');
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
        <label>Region ID: <input type="text" class="wme-region-id" value="${this.region.id}" /></label>
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
    this._el.querySelector('.wme-chunk-w').oninput = (e) => { this.region.chunkWidth = parseInt(e.target.value) || 1280; };
    this._el.querySelector('.wme-chunk-h').oninput = (e) => { this.region.chunkHeight = parseInt(e.target.value) || 720; };
  }

  /** 渲染网格视图 */
  _render() {
    const gc = this._el.querySelector('.wme-grid-container');
    if (!gc) return;

    const sceneOpts = ['<option value="">(空)</option>']
      .concat(this.availableScenes.map(id => `<option value="${id}">${id}</option>`))
      .join('');

    let html = `<table class="wme-grid" style="border-collapse:collapse;">`;
    for (let r = 0; r < this.region.rows; r++) {
      html += '<tr>';
      for (let c = 0; c < this.region.cols; c++) {
        const val = (this.region.grid[r] && this.region.grid[r][c]) || '';
        html += `<td style="border:1px solid #555;padding:4px;min-width:120px;">
          <div style="font-size:10px;color:#888;">(${c},${r})</div>
          <select data-r="${r}" data-c="${c}" class="wme-cell-select" style="width:100%;font-size:12px;">
            ${sceneOpts.replace(`value="${val}"`, `value="${val}" selected`)}
          </select>
        </td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    html += `<div style="margin-top:8px;color:#aaa;font-size:12px;">${this.region.cols}×${this.region.rows} 格，chunk ${this.region.chunkWidth}×${this.region.chunkHeight}px</div>`;

    gc.innerHTML = html;

    // 绑定 select 变化
    gc.querySelectorAll('.wme-cell-select').forEach(sel => {
      sel.onchange = (e) => {
        const r = parseInt(e.target.dataset.r);
        const c = parseInt(e.target.dataset.c);
        this.region.grid[r][c] = e.target.value || null;
      };
    });
  }

  _showToast(msg) {
    const t = this._el.querySelector('.wme-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    t.style.cssText = 'display:block;position:fixed;bottom:20px;right:20px;background:#4CAF50;color:#fff;padding:10px 20px;border-radius:6px;z-index:99999;';
    setTimeout(() => { t.style.display = 'none'; }, 2000);
  }
}

export default WorldMapEditor;
