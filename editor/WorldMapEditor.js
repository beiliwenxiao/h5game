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
import { ProjectWorldIndex } from '../src/core/ProjectWorldIndex.js';
import { CanonicalSceneRepository } from '../src/core/scene/CanonicalSceneRepository.js';
import { FetchDiskSceneAdapter, LocalStorageSceneCacheAdapter } from '../src/core/scene/CanonicalSceneAdapters.js';
import { getWorldMapCellSceneId, isReservedWorldMapCell } from '../src/core/WorldMapCell.js';

export function validateWorldMapRepositoryClosure(project, repositorySceneIds) {
  const closure = repositorySceneIds instanceof Set
    ? repositorySceneIds
    : new Set(repositorySceneIds || []);
  const errors = [];
  for (const [regionIndex, region] of (project?.worldMap?.regions || []).entries()) {
    for (const [rowIndex, row] of (region?.grid || []).entries()) {
      for (const [colIndex, cell] of (row || []).entries()) {
        const sceneId = getWorldMapCellSceneId(cell, { includeReserved: true });
        if (sceneId && !closure.has(sceneId)) {
          errors.push({
            code: 'sceneOutsideRepositoryClosure',
            path: `worldMap.regions[${regionIndex}].grid[${rowIndex}][${colIndex}]`,
            message: `场景 ID 不在磁盘 repository closure: ${sceneId}`
          });
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * WorldMapEditor - 大地图块编辑器 Tab（P5-5）
 *
 * 功能：
 *   - 网格视图（cols×rows）编辑 worldMap.regions[].grid
 *   - 支持切换多个 Region，并显示 reserved 规划单元
 *   - 每格可分配一个已有 scene（下拉选择）或置空
 *   - 设置 chunkWidth/chunkHeight、region id
 *   - 增减行列
 *   - 全局拼接预览（缩略图）
 *   - 读写 game.project.json 的 worldMap 字段
 *
 * 通过共享 CanonicalEditorSession 编辑 project.worldMap；场景缩略图仍从磁盘 repository 读取。
 */
export class WorldMapEditor {
  /**
   * @param {HTMLElement} container - 编辑器挂载容器
   * @param {Object} opts - { gameId, projectPath, canonicalSession }
   */
  constructor(container, opts = {}) {
    if (!opts.canonicalSession) {
      throw new TypeError('WorldMapEditor requires a shared CanonicalEditorSession');
    }
    this.container = container;
    this.gameId = opts.gameId || 'sanguo_zhangjiao';
    this.canonicalSession = opts.canonicalSession;
    this.projectPath = this._normalizeProjectPath(
      this.canonicalSession.sourceUri || opts.projectPath || `example/${this.gameId}/game.project.json`
    );
    this.project = null;
    this.worldIndex = null;
    this._sceneDataById = new Map();
    this._repositorySceneIds = null;

    // 项目加载前不生成 Demo 尺寸或入口；加载成功后只从 ProjectWorldIndex 投影可编辑草稿。
    this.region = { id: '', name: '', chunkWidth: '', chunkHeight: '', cols: 0, rows: 0, grid: [] };

    // 可选场景列表（从 GameProject.scenes 读取）
    this.availableScenes = [];

    this._el = null;
  }

  _normalizeProjectPath(projectPath) {
    return String(projectPath || '')
      .replace(/\\/g, '/')
      .replace(/^(?:\.\.\/)+/, '')
      .replace(/^\//, '');
  }

  /** 切换当前游戏时同步项目上下文，防止复用旧实例继续读取上一个项目。 */
  setProjectContext({ gameId, projectPath, canonicalSession } = {}) {
    const nextGameId = gameId || this.gameId;
    const nextSession = canonicalSession || this.canonicalSession;
    if (!nextSession) throw new TypeError('WorldMapEditor requires a shared CanonicalEditorSession');
    const nextProjectPath = this._normalizeProjectPath(
      nextSession.sourceUri || projectPath || `example/${nextGameId}/game.project.json`
    );
    const changed = nextGameId !== this.gameId
      || nextProjectPath !== this.projectPath
      || nextSession !== this.canonicalSession;
    this.gameId = nextGameId;
    this.projectPath = nextProjectPath;
    this.canonicalSession = nextSession;
    if (changed) {
      this.project = null;
      this.worldIndex = null;
      this._sceneDataById.clear();
      this._repositorySceneIds = null;
      this._loadedImages?.clear?.();
    }
    return changed;
  }

  /**
   * 初始化 UI
   */
  async init() {
    this._el = document.createElement('div');
    this._el.className = 'world-map-editor';
    this._el.style.cssText = 'width:max-content;min-width:100%;';
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
      this.project = structuredClone(this.canonicalSession.getValue() || {});
    } catch (error) {
      console.warn('[WorldMapEditor] 从共享 canonical candidate 加载失败', error);
      this._showToast?.(`加载失败: ${error.message}`, 'error');
      return;
    }

    try {
      this.worldIndex = ProjectWorldIndex.build(this.project);
    } catch (error) {
      console.warn('[WorldMapEditor] 世界索引校验失败', error?.errors || error);
      this._showToast?.(error?.errors?.[0]?.message || error.message, 'error');
      return;
    }

    // 可选场景只来自 canonical project closure；localStorage 不得扩展 ID 集合。
    this.availableScenes = Array.isArray(this.project.scenes)
      ? this.project.scenes.map(scene => scene?.id).filter(Boolean)
      : [];

    this._currentRegionIndex = 0;
    const indexedRegion = this.worldIndex.getRegion(0);
    if (indexedRegion) this.region = this._createRegionDraft(indexedRegion);

    await this._loadSceneDataFromDisk();
    this._populateRegionSelect();
    // 更新输入框
    this._el.querySelector('.wme-region-name').value = this.region.name || '';
    this._render();
  }

  _createRegionDraft(indexedRegion) {
    const grid = Array.from({ length: indexedRegion.rows }, () => Array(indexedRegion.cols).fill(null));
    for (const cell of this.worldIndex.getCells(indexedRegion.id, { includeReserved: true })) {
      grid[cell.row][cell.col] = cell.reserved
        ? { sceneId: cell.sceneId, reserved: true }
        : cell.sceneId;
    }
    return {
      id: indexedRegion.id,
      name: indexedRegion.name,
      chunkWidth: indexedRegion.chunkWidth,
      chunkHeight: indexedRegion.chunkHeight,
      cols: indexedRegion.cols,
      rows: indexedRegion.rows,
      grid
    };
  }

  _collectLoadableSceneIds() {
    return this.worldIndex
      ? this.worldIndex.regions.flatMap(region => this.worldIndex.getCells(region.id).map(cell => cell.sceneId))
      : [];
  }

  async _readJsonFile(filePath) {
    try {
      const response = await fetch('/api/read-file?path=' + encodeURIComponent(filePath));
      if (response.ok) {
        const payload = await response.json();
        const content = typeof payload.content === 'string' ? payload.content : payload;
        return typeof content === 'string' ? JSON.parse(content) : content;
      }
    } catch (error) { /* 回退到静态文件 */ }

    try {
      const response = await fetch('/' + filePath.replace(/^\/+/, ''));
      return response.ok ? await response.json() : null;
    } catch (error) {
      return null;
    }
  }

  /** 磁盘 repository 是缩略图事实源；缓存仅在同 ID 不可读/解析失败时受限 fallback。 */
  async _loadSceneDataFromDisk() {
    this._sceneDataById.clear();
    const basePath = this.projectPath.slice(0, this.projectPath.lastIndexOf('/') + 1);
    const repository = new CanonicalSceneRepository({
      diskAdapter: new FetchDiskSceneAdapter({
        projectUrl: `/${this.projectPath}`,
        sceneBaseUrl: `/${basePath}assets/scenes/`
      }),
      cacheAdapter: new LocalStorageSceneCacheAdapter({ gameId: this.gameId }),
      mode: 'thumbnail'
    });
    const result = await repository.refresh();
    if (!result.ok) {
      console.warn('[WorldMapEditor] canonical 场景仓库刷新失败', result.errors);
      return;
    }
    this._repositorySceneIds = new Set(result.snapshot.ids);
    this.availableScenes = result.snapshot.ids.slice();
    for (const sceneId of this._collectLoadableSceneIds()) {
      const scene = result.snapshot.getScene(sceneId);
      if (scene) this._sceneDataById.set(sceneId, scene);
    }
  }

  /**
   * 保存到 game.project.json
   */
  async save() {
    if (!this.project) {
      this._showToast('无工程数据，请先加载', 'error');
      return { ok: false, committed: false, status: 'rejected', code: 'missingProject' };
    }

    const idx = this._currentRegionIndex || 0;
    const candidate = structuredClone(this.project);
    if (!candidate.worldMap || !Array.isArray(candidate.worldMap.regions)) {
      this._showToast('项目缺少 canonical worldMap.regions', 'error');
      return { ok: false, committed: false, status: 'rejected', code: 'missingWorldMap' };
    }
    candidate.worldMap.regions[idx] = structuredClone(this.region);
    const closureResult = validateWorldMapRepositoryClosure(candidate, this._repositorySceneIds);
    if (!closureResult.ok) {
      this._showToast(closureResult.errors[0].message, 'error');
      return { ok: false, committed: false, status: 'rejected', errors: closureResult.errors };
    }
    try {
      ProjectWorldIndex.build(candidate);
    } catch (error) {
      const message = error?.errors?.[0]?.message || error.message;
      this._showToast(message, 'error');
      return { ok: false, committed: false, status: 'rejected', errors: error?.errors || [], error };
    }

    try {
      this.canonicalSession.patch('worldMap', structuredClone(candidate.worldMap));
      const result = await this.canonicalSession.save();
      if (result?.ok !== true || result.committed !== true) {
        const firstError = result?.errors?.[0];
        const message = [firstError?.path, firstError?.message || firstError?.reason]
          .filter(Boolean)
          .join(': ') || result?.error?.message || result?.error || '磁盘未提交';
        this._showToast(`保存失败: ${message}`, 'error');
        return result;
      }
      this.project = structuredClone(this.canonicalSession.getValue() || candidate);
      this.worldIndex = ProjectWorldIndex.build(this.project);
      this._showToast(
        result.degraded ? '大地图已提交，但缓存/通知同步降级' : '大地图已保存 ✓',
        result.degraded ? 'warn' : 'success'
      );
      return result;
    } catch (error) {
      this._showToast('保存异常: ' + error.message, 'error');
      return error.result || { ok: false, committed: false, status: 'failed', error };
    }
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
      <div class="wme-toolbar" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0;">
        <label>地图: <select class="wme-region-select"></select></label>
        <button class="wme-add-region">+ 新建地图</button>
        <span style="margin:0 8px;color:#555;">|</span>
        <label>Region ID: <input type="text" class="wme-region-id" value="${this.region.id}" /></label>
        <label>名称: <input type="text" class="wme-region-name" value="${this.region.name || ''}" /></label>
        <label>Chunk宽: <input type="number" class="wme-chunk-w" value="${this.region.chunkWidth}" min="320" step="64" /></label>
        <label>Chunk高: <input type="number" class="wme-chunk-h" value="${this.region.chunkHeight}" min="320" step="64" /></label>
        <span style="margin:0 8px;color:#555;">|</span>
        <label>列数: <input type="number" class="wme-cols" value="${this.region.cols}" min="1" max="100" style="width:50px;" /></label>
        <label>行数: <input type="number" class="wme-rows" value="${this.region.rows}" min="1" max="100" style="width:50px;" /></label>
        <button class="wme-apply-size">应用尺寸</button>
        <button class="wme-focus-used">◎ 定位已配置场景</button>
        <button class="wme-save">💾 保存</button>
      </div>
      <div class="wme-grid-container" style="position:relative;"></div>
      <div class="wme-toast" style="display:none;"></div>
    `;
  }

  _bindEvents() {
    this._el.querySelector('.wme-save').onclick = async () => {
      await this.save();
    };
    this._el.querySelector('.wme-apply-size').onclick = () => this._applySize();
    this._el.querySelector('.wme-focus-used').onclick = () => this._focusUsedArea({ smooth: true });

    this._el.querySelector('.wme-region-id').oninput = (e) => { this.region.id = e.target.value; };
    this._el.querySelector('.wme-region-name').oninput = (e) => { this.region.name = e.target.value; };
    this._el.querySelector('.wme-chunk-w').oninput = (e) => {
      const value = Number(e.target.value);
      if (Number.isFinite(value) && value > 0) this.region.chunkWidth = value;
    };
    this._el.querySelector('.wme-chunk-h').oninput = (e) => {
      const value = Number(e.target.value);
      if (Number.isFinite(value) && value > 0) this.region.chunkHeight = value;
    };

    // 地图选择器
    this._el.querySelector('.wme-region-select').onchange = (e) => {
      const idx = parseInt(e.target.value);
      if (!isNaN(idx)) this._switchRegion(idx);
    };
    this._el.querySelector('.wme-add-region').onclick = () => this._addNewRegion();
  }

  /**
   * 应用用户输入的行列数
   * 缩小时不能小于已有地图块的范围，扩大时最大 100
   */
  _applySize() {
    const colsInput = this._el.querySelector('.wme-cols');
    const rowsInput = this._el.querySelector('.wme-rows');
    let newCols = parseInt(colsInput.value) || this.region.cols;
    let newRows = parseInt(rowsInput.value) || this.region.rows;

    // 限制最大 100
    newCols = Math.min(100, Math.max(1, newCols));
    newRows = Math.min(100, Math.max(1, newRows));

    // 计算已有地图块的最大行列（不能缩小到比这个更小）
    let maxUsedCol = 0;
    let maxUsedRow = 0;
    for (let r = 0; r < this.region.grid.length; r++) {
      if (!this.region.grid[r]) continue;
      for (let c = 0; c < this.region.grid[r].length; c++) {
        if (this.region.grid[r][c]) {
          if (c + 1 > maxUsedCol) maxUsedCol = c + 1;
          if (r + 1 > maxUsedRow) maxUsedRow = r + 1;
        }
      }
    }

    if (newCols < maxUsedCol) {
      newCols = maxUsedCol;
      this._showToast(`列数不能小于 ${maxUsedCol}（已有地图块占用）`, 'warn');
    }
    if (newRows < maxUsedRow) {
      newRows = maxUsedRow;
      this._showToast(`行数不能小于 ${maxUsedRow}（已有地图块占用）`, 'warn');
    }

    // 更新输入框显示
    colsInput.value = newCols;
    rowsInput.value = newRows;

    // 调整 grid 尺寸
    this.region.cols = newCols;
    this.region.rows = newRows;

    // 裁剪多余的列
    for (let r = 0; r < this.region.grid.length; r++) {
      if (this.region.grid[r] && this.region.grid[r].length > newCols) {
        this.region.grid[r].length = newCols;
      }
    }
    // 裁剪多余的行
    if (this.region.grid.length > newRows) {
      this.region.grid.length = newRows;
    }

    this._normalizeGrid();
    this._render();
    this._showToast(`尺寸已设为 ${newCols}×${newRows}`);
  }

  /** 切换当前编辑的 region */
  _switchRegion(index) {
    const indexedRegion = this.worldIndex?.getRegion?.(index);
    if (!indexedRegion) return;
    this._currentRegionIndex = index;
    this.region = this._createRegionDraft(indexedRegion);
    // 更新输入框
    this._el.querySelector('.wme-region-id').value = this.region.id;
    this._el.querySelector('.wme-region-name').value = this.region.name || '';
    this._el.querySelector('.wme-chunk-w').value = this.region.chunkWidth;
    this._el.querySelector('.wme-chunk-h').value = this.region.chunkHeight;
    this._el.querySelector('.wme-cols').value = this.region.cols;
    this._el.querySelector('.wme-rows').value = this.region.rows;
    this._render();
  }

  /** 新建地图 region */
  _addNewRegion() {
    const name = prompt('新地图名称:', '新地图');
    if (!name || !this.worldIndex) return;
    const sourceRegion = this.worldIndex.getRegion(this._currentRegionIndex || 0);
    if (!sourceRegion) return;
    const id = 'region_' + Date.now();
    const newRegion = {
      id, name,
      chunkWidth: sourceRegion.chunkWidth,
      chunkHeight: sourceRegion.chunkHeight,
      cols: sourceRegion.cols,
      rows: sourceRegion.rows,
      grid: Array.from({ length: sourceRegion.rows }, () => Array(sourceRegion.cols).fill(null))
    };
    const candidate = JSON.parse(JSON.stringify(this.project));
    candidate.worldMap.regions.push(newRegion);
    try {
      this.worldIndex = ProjectWorldIndex.build(candidate);
      this.project = candidate;
    } catch (error) {
      this._showToast(error?.errors?.[0]?.message || error.message, 'error');
      return;
    }
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

    let html = `<div class="wme-grid" style="display:grid;grid-template-columns:repeat(${this.region.cols},${thumbW}px);gap:4px;width:max-content;">`;
    for (let r = 0; r < this.region.rows; r++) {
      for (let c = 0; c < this.region.cols; c++) {
        const cellValue = (this.region.grid[r] && this.region.grid[r][c]) || null;
        const sceneId = getWorldMapCellSceneId(cellValue, { includeReserved: true });
        const reserved = isReservedWorldMapCell(cellValue);
        const cellLabel = sceneId ? `${sceneId}${reserved ? '（预留）' : ''}` : '(空)';
        const cellSceneOpts = reserved && sceneId && !this.availableScenes.includes(sceneId)
          ? `${sceneOpts}<option value="${sceneId}">${sceneId}（预留，未加载）</option>`
          : sceneOpts;
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
              ${cellLabel}
            </span>
            <div class="wme-cell-overlay" style="display:none;position:absolute;inset:0;
                 background:rgba(0,0,0,0.7);flex-direction:column;align-items:center;
                 justify-content:center;gap:6px;padding:8px;border-radius:4px;">
              <div style="font-size:11px;color:#8cf;font-weight:bold;">(${r}, ${c})</div>
              <select class="wme-cell-select" data-r="${r}" data-c="${c}"
                      style="width:92%;font-size:11px;background:#222;color:#eee;border:1px solid #666;
                             border-radius:3px;padding:3px;">
                ${cellSceneOpts.replace(`value="${sceneId}"`, `value="${sceneId}" selected`)}
              </select>
            </div>
          </div>`;
      }
    }
    html += '</div>';
    html += `<div style="margin-top:8px;color:#aaa;font-size:12px;">${this.region.cols}×${this.region.rows} 格，chunk ${this.region.chunkWidth}×${this.region.chunkHeight}px</div>`;
    // 计算小地图外框比例与地图有效区域一致
    const mmMaxDim = 180;
    let mmUsedCols = this.region.cols, mmUsedRows = this.region.rows;
    // 找有效范围
    let _maxC = 0, _maxR = 0;
    for (let r = 0; r < this.region.rows; r++) {
      if (!this.region.grid[r]) continue;
      for (let c = 0; c < this.region.cols; c++) {
        if (this.region.grid[r][c]) { if (c + 1 > _maxC) _maxC = c + 1; if (r + 1 > _maxR) _maxR = r + 1; }
      }
    }
    if (_maxC > 0) { mmUsedCols = _maxC; mmUsedRows = _maxR; }
    const mmWorldW = mmUsedCols * this.region.chunkWidth;
    const mmWorldH = mmUsedRows * this.region.chunkHeight;
    const mmAspect = mmWorldW / mmWorldH;
    let mmW, mmH;
    if (mmAspect >= 1) { mmW = mmMaxDim; mmH = Math.round(mmMaxDim / mmAspect); }
    else { mmH = mmMaxDim; mmW = Math.round(mmMaxDim * mmAspect); }

    // 右上角小地图容器（fixed 定位，比例与地图一致）
    html += `<div class="wme-minimap" style="position:fixed;top:60px;right:24px;
              width:${mmW}px;height:${mmH}px;background:rgba(20,15,10,0.9);
              border:2px solid #8B7355;border-radius:4px;overflow:hidden;pointer-events:none;z-index:10;">
              <canvas class="wme-minimap-canvas" width="${mmW}" height="${mmH}" style="width:100%;height:100%;"></canvas>
            </div>`;

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
        // 格子内容变化后刷新小地图
        this._refreshMinimap(gc, thumbW, thumbH);
      };
    });

    // 绘制所有格子的缩略图
    gc.querySelectorAll('.wme-cell').forEach(cell => {
      const r = parseInt(cell.dataset.r);
      const c = parseInt(cell.dataset.c);
      const cellValue = (this.region.grid[r] && this.region.grid[r][c]) || null;
      this._renderCellThumbnail(cell, cellValue, thumbW, thumbH);
    });

    // 保存小地图刷新参数，供后续实时更新
    this._minimapParams = { gc, thumbW, thumbH };
    // 绘制右上角小地图（延迟，等缩略图绘制完成）
    setTimeout(() => this._renderMinimap(gc, thumbW, thumbH), 300);
    requestAnimationFrame(() => this._focusUsedArea());
  }

  /** 将滚动视口定位到当前 Region 已配置单元的包围盒中心。 */
  _focusUsedArea({ smooth = false } = {}) {
    const page = this.container.closest('#world-map-editor-page');
    if (!page) return false;
    const cells = [...this._el.querySelectorAll('.wme-cell')].filter(cell => {
      const row = Number(cell.dataset.r);
      const col = Number(cell.dataset.c);
      return Boolean(this.region.grid[row]?.[col]);
    });
    if (cells.length === 0) return false;

    const pageRect = page.getBoundingClientRect();
    const rects = cells.map(cell => cell.getBoundingClientRect());
    const left = Math.min(...rects.map(rect => rect.left));
    const right = Math.max(...rects.map(rect => rect.right));
    const top = Math.min(...rects.map(rect => rect.top));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    page.scrollTo({
      left: Math.max(0, page.scrollLeft + (left + right) / 2 - pageRect.left - page.clientWidth / 2),
      top: Math.max(0, page.scrollTop + (top + bottom) / 2 - pageRect.top - page.clientHeight / 2),
      behavior: smooth ? 'smooth' : 'auto'
    });
    return true;
  }

  /**
   * 刷新小地图（使用保存的参数或传入新参数）
   * @param {HTMLElement} [gc] - 网格容器（可选，默认用保存的）
   * @param {number} [thumbW] - 格子缩略图宽度
   * @param {number} [thumbH] - 格子缩略图高度
   */
  _refreshMinimap(gc = null, thumbW = null, thumbH = null) {
    const params = this._minimapParams;
    const container = gc || params?.gc;
    const w = thumbW || params?.thumbW;
    const h = thumbH || params?.thumbH;
    if (container && w && h) {
      // 延迟执行，等当前帧格子缩略图绘制完成
      requestAnimationFrame(() => this._renderMinimap(container, w, h));
    }
  }

  /**
   * 绘制右上角小地图预览（缩小的全局视图，与游戏中小地图一致的布局）
   * @private
   */
  _renderMinimap(gc, thumbW, thumbH) {
    const minimapCanvas = gc.querySelector('.wme-minimap-canvas');
    if (!minimapCanvas) return;
    const ctx = minimapCanvas.getContext('2d');
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    ctx.clearRect(0, 0, mw, mh);

    // 背景
    ctx.fillStyle = 'rgba(20, 15, 10, 1)';
    ctx.fillRect(0, 0, mw, mh);

    const { cols, rows, chunkWidth, chunkHeight, grid } = this.region;

    // 找到有场景的格子范围
    let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    for (let r = 0; r < rows; r++) {
      if (!grid[r]) continue;
      for (let c = 0; c < cols; c++) {
        if (grid[r][c]) {
          if (c < minCol) minCol = c;
          if (c > maxCol) maxCol = c;
          if (r < minRow) minRow = r;
          if (r > maxRow) maxRow = r;
        }
      }
    }
    if (minCol === Infinity) return; // 全空

    const usedCols = maxCol - minCol + 1;
    const usedRows = maxRow - minRow + 1;
    const worldW = usedCols * chunkWidth;
    const worldH = usedRows * chunkHeight;

    // 计算缩放让内容 fit 到小地图（带边距）
    const pad = 8;
    const scaleX = (mw - pad * 2) / worldW;
    const scaleY = (mh - pad * 2) / worldH;
    const scale = Math.min(scaleX, scaleY);
    const drawW = worldW * scale;
    const drawH = worldH * scale;
    const offsetX = pad + (mw - pad * 2 - drawW) / 2;
    const offsetY = pad + (mh - pad * 2 - drawH) / 2;

    // 绘制每个有场景的格子
    for (let r = minRow; r <= maxRow; r++) {
      if (!grid[r]) continue;
      for (let c = minCol; c <= maxCol; c++) {
        const sceneId = grid[r][c];
        if (!sceneId) continue;

        const x = offsetX + (c - minCol) * chunkWidth * scale;
        const y = offsetY + (r - minRow) * chunkHeight * scale;
        const w = chunkWidth * scale;
        const h = chunkHeight * scale;

        // 尝试从格子缩略图 canvas 中获取图像
        const cell = gc.querySelector(`.wme-cell[data-r="${r}"][data-c="${c}"]`);
        const cellCanvas = cell && cell.querySelector('.wme-cell-canvas');
        if (cellCanvas && cellCanvas.width > 0) {
          try {
            ctx.drawImage(cellCanvas, x, y, w, h);
          } catch (e) {
            ctx.fillStyle = '#1b450c';
            ctx.fillRect(x, y, w, h);
          }
        } else {
          ctx.fillStyle = '#1b450c';
          ctx.fillRect(x, y, w, h);
        }

        // 格子边框
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, w, h);
      }
    }
  }

  /**
   * 绘制单格缩略图：直接当真实游戏场景来画（缩小 20%），复用场景编辑器渲染
   * @private
   */
  _renderCellThumbnail(cell, cellValue, thumbW, thumbH) {
    const canvas = cell.querySelector('.wme-cell-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, thumbW, thumbH);

    const sceneId = getWorldMapCellSceneId(cellValue, { includeReserved: true });
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

    if (isReservedWorldMapCell(cellValue)) {
      ctx.fillStyle = '#171717';
      ctx.fillRect(0, 0, thumbW, thumbH);
      ctx.strokeStyle = '#8B7355';
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(4, 4, thumbW - 8, thumbH - 8);
      ctx.setLineDash([]);
      ctx.fillStyle = '#c9ad7a';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${sceneId} · 规划位置`, thumbW / 2, thumbH / 2);
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
      // 图片加载完成后刷新小地图
      this._refreshMinimap();
    });

    // 同步先画一次（图片可能已缓存）
    this._drawSceneToCanvas(ctx, scene, thumbW, thumbH);
    // 同步绘制后也刷新小地图（延迟到下一帧，等 canvas 内容更新）
    requestAnimationFrame(() => this._refreshMinimap());
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

  _showToast(msg, type = 'success') {
    const t = this._el.querySelector('.wme-toast');
    if (!t) return;
    const backgrounds = {
      success: '#2e7d32',
      warn: '#9a6700',
      error: '#b3261e'
    };
    t.textContent = msg;
    t.dataset.type = type;
    t.style.cssText = `display:block;position:fixed;bottom:20px;right:20px;background:${backgrounds[type] || backgrounds.success};color:#fff;padding:10px 20px;border-radius:6px;z-index:99999;`;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.style.display = 'none';
      this._toastTimer = null;
    }, 2500);
  }

  _isCompleteSceneData(scene, sceneId) {
    return scene?.id === sceneId
      && Array.isArray(scene.layers)
      && scene.imageAssets !== null
      && typeof scene.imageAssets === 'object'
      && !Array.isArray(scene.imageAssets);
  }

  /**
   * 磁盘场景优先；仅在磁盘读取失败时使用完整的 localStorage 场景缓存。
   * @private
   */
  _getSceneData(sceneId) {
    const diskScene = this._sceneDataById.get(sceneId);
    if (this._isCompleteSceneData(diskScene, sceneId)) return diskScene;
    try {
      const raw = localStorage.getItem('yijian18-engine_editor_data_scenes_' + this.gameId);
      if (!raw) return null;
      const scenes = JSON.parse(raw);
      if (!Array.isArray(scenes)) return null;
      const cachedScene = scenes.find(scene => scene?.id === sceneId);
      return this._isCompleteSceneData(cachedScene, sceneId) ? cachedScene : null;
    } catch (error) {
      return null;
    }
  }
}


export default WorldMapEditor;
