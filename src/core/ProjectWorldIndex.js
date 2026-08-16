/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { getWorldMapCellSceneId, isReservedWorldMapCell } from './WorldMapCell.js';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function issue(errors, code, path, message) {
  errors.push({ code, path, message });
}

export class ProjectWorldIndexValidationError extends TypeError {
  constructor(errors) {
    super(errors[0]?.message || 'Project world map is invalid');
    this.name = 'ProjectWorldIndexValidationError';
    this.code = 'invalidProjectWorld';
    this.errors = errors;
  }
}

/** 只从完整、已校验的项目世界配置派生 Region、边界、入口与 offset。 */
export class ProjectWorldIndex {
  static fromRegion(region) {
    if (!region || !Array.isArray(region.grid) || !Number.isInteger(region.rows) || !Number.isInteger(region.cols)) return null;
    const id = region.id || 'default';
    const cells = [];
    const locations = new Map();
    for (let row = 0; row < region.rows; row++) {
      for (let col = 0; col < region.cols; col++) {
        const sceneId = getWorldMapCellSceneId(region.grid[row]?.[col]);
        if (!sceneId) continue;
        const cell = freeze({
          regionId: id, regionIndex: 0, sceneId, row, col, reserved: false, loadable: true,
          offset: Number.isFinite(region.chunkWidth) && Number.isFinite(region.chunkHeight)
            ? { x: col * region.chunkWidth, y: row * region.chunkHeight } : null
        });
        cells.push(cell);
        locations.set(sceneId, cell);
      }
    }
    const record = freeze({
      id, regionIndex: 0, name: region.name || '', rows: region.rows, cols: region.cols,
      chunkWidth: region.chunkWidth, chunkHeight: region.chunkHeight,
      bounds: Number.isFinite(region.chunkWidth) && Number.isFinite(region.chunkHeight)
        ? { left: 0, top: 0, right: region.cols * region.chunkWidth, bottom: region.rows * region.chunkHeight,
          width: region.cols * region.chunkWidth, height: region.rows * region.chunkHeight }
        : null,
      cells
    });
    return new ProjectWorldIndex([record], locations, null);
  }

  static build(project) {
    const errors = [];
    const worldMap = project?.worldMap;
    const regions = worldMap?.regions;
    if (!worldMap || !Array.isArray(regions) || regions.length === 0) {
      throw new ProjectWorldIndexValidationError([
        { code: 'missingRegions', path: 'worldMap.regions', message: 'worldMap.regions 必须是非空数组' }
      ]);
    }

    const regionIds = new Set();
    const canonicalSceneIds = new Set((project?.scenes || []).map(scene => scene?.id).filter(Boolean));
    const sceneLocations = new Map();
    const regionRecords = [];
    for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
      const source = regions[regionIndex];
      const base = `worldMap.regions[${regionIndex}]`;
      const id = typeof source?.id === 'string' && source.id.length > 0 ? source.id : null;
      const rows = source?.rows;
      const cols = source?.cols;
      const chunkWidth = source?.chunkWidth;
      const chunkHeight = source?.chunkHeight;
      if (!id) issue(errors, 'invalidRegionId', `${base}.id`, 'Region id 必须是非空字符串');
      else if (regionIds.has(id)) issue(errors, 'duplicateRegionId', `${base}.id`, `Region id 重复: ${id}`);
      else regionIds.add(id);
      if (!Number.isInteger(rows) || rows <= 0) issue(errors, 'invalidRows', `${base}.rows`, 'rows 必须是正整数');
      if (!Number.isInteger(cols) || cols <= 0) issue(errors, 'invalidCols', `${base}.cols`, 'cols 必须是正整数');
      if (!Number.isFinite(chunkWidth) || chunkWidth <= 0) issue(errors, 'invalidChunkWidth', `${base}.chunkWidth`, 'chunkWidth 必须是正数');
      if (!Number.isFinite(chunkHeight) || chunkHeight <= 0) issue(errors, 'invalidChunkHeight', `${base}.chunkHeight`, 'chunkHeight 必须是正数');
      if (!Array.isArray(source?.grid) || source.grid.length !== rows) {
        issue(errors, 'gridRowMismatch', `${base}.grid`, `grid 行数必须等于 rows (${rows})`);
      }

      const cells = [];
      for (let row = 0; row < (Number.isInteger(rows) && rows > 0 ? rows : 0); row++) {
        const sourceRow = source?.grid?.[row];
        if (!Array.isArray(sourceRow) || sourceRow.length !== cols) {
          issue(errors, 'gridColumnMismatch', `${base}.grid[${row}]`, `grid 列数必须等于 cols (${cols})`);
        }
        for (let col = 0; col < (Number.isInteger(cols) && cols > 0 ? cols : 0); col++) {
          const raw = sourceRow?.[col] ?? null;
          const path = `${base}.grid[${row}][${col}]`;
          const reserved = isReservedWorldMapCell(raw);
          const sceneId = getWorldMapCellSceneId(raw, { includeReserved: true });
          const validEmpty = raw == null;
          const validLoadable = typeof raw === 'string' && raw.length > 0;
          const validReserved = reserved && typeof sceneId === 'string' && sceneId.length > 0;
          if (!validEmpty && !validLoadable && !validReserved) {
            issue(errors, 'invalidWorldCell', path, '单元必须为 null、sceneId 字符串或 {sceneId,reserved:true}');
            continue;
          }
          if (!sceneId) continue;
          if (!canonicalSceneIds.has(sceneId)) {
            issue(errors, 'unknownSceneId', path, `sceneId 不在 canonical project.scenes 中: ${sceneId}`);
          }
          if (sceneLocations.has(sceneId)) {
            issue(errors, 'duplicateSceneLocation', path, `sceneId 只能定位一次: ${sceneId}`);
            continue;
          }
          const cell = freeze({
            regionId: id,
            regionIndex,
            sceneId,
            row,
            col,
            reserved,
            loadable: !reserved,
            offset: { x: col * chunkWidth, y: row * chunkHeight }
          });
          sceneLocations.set(sceneId, cell);
          cells.push(cell);
        }
      }
      regionRecords.push(freeze({
        id,
        regionIndex,
        name: typeof source?.name === 'string' ? source.name : '',
        previewOnly: source?.previewOnly === true,
        rows,
        cols,
        chunkWidth,
        chunkHeight,
        bounds: { left: 0, top: 0, right: cols * chunkWidth, bottom: rows * chunkHeight,
          width: cols * chunkWidth, height: rows * chunkHeight },
        cells
      }));
    }

    const entrySceneId = worldMap.entrySceneId;
    if (typeof entrySceneId !== 'string' || entrySceneId.length === 0) {
      issue(errors, 'missingEntrySceneId', 'worldMap.entrySceneId', '必须显式声明唯一入口 sceneId');
    }
    const entry = sceneLocations.get(entrySceneId);
    if (entrySceneId && !entry) issue(errors, 'entrySceneNotFound', 'worldMap.entrySceneId', `入口未在世界网格中定位: ${entrySceneId}`);
    else if (entry?.reserved) issue(errors, 'reservedEntryScene', 'worldMap.entrySceneId', '入口不能是 reserved 单元');

    if (errors.length > 0) throw new ProjectWorldIndexValidationError(errors);
    return new ProjectWorldIndex(regionRecords, sceneLocations, entry);
  }

  constructor(regions, sceneLocations, entry) {
    this._regions = freeze(regions.slice());
    this._regionById = new Map(regions.map(region => [region.id, region]));
    this._cellsByRegion = new Map(regions.map(region => [
      region.id,
      new Map(region.cells.map(cell => [`${cell.row},${cell.col}`, cell]))
    ]));
    this._sceneLocations = new Map(sceneLocations);
    this._entry = entry;
    Object.freeze(this);
  }

  get regions() { return this._regions; }
  getRegion(regionRef = 0) {
    return typeof regionRef === 'number' ? this._regions[regionRef] || null : this._regionById.get(regionRef) || null;
  }
  getCell(regionRef, row, col) {
    const region = this.getRegion(regionRef);
    if (!region || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= region.rows || col >= region.cols) return null;
    return this._cellsByRegion.get(region.id)?.get(`${row},${col}`) || null;
  }
  findScene(sceneId) { return this._sceneLocations.get(sceneId) || null; }
  getBounds(regionRef) { return this.getRegion(regionRef)?.bounds || null; }
  getEntry() { return this._entry; }
  getOffset(sceneOrRegion, row, col) {
    if (typeof sceneOrRegion === 'string' && row === undefined) return this.findScene(sceneOrRegion)?.offset || null;
    const region = this.getRegion(sceneOrRegion);
    return region && Number.isInteger(row) && Number.isInteger(col)
      ? freeze({ x: col * region.chunkWidth, y: row * region.chunkHeight }) : null;
  }
  isLoadable(sceneOrRegion, row, col) {
    const cell = row === undefined ? this.findScene(sceneOrRegion) : this.getCell(sceneOrRegion, row, col);
    return cell?.loadable === true;
  }
  getCells(regionRef, { includeReserved = false } = {}) {
    const cells = this.getRegion(regionRef)?.cells || [];
    return Object.freeze(includeReserved ? cells.slice() : cells.filter(cell => cell.loadable));
  }
}

export default ProjectWorldIndex;
