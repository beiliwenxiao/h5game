/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

function abortError() {
  const error = new Error('World map load session is no longer active');
  error.name = 'AbortError';
  return error;
}

function cloneValue(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) copy[key] = cloneValue(value[key], seen);
  return copy;
}

function errorRecord(stage, error, extra = {}) {
  return {
    stage,
    ...extra,
    error,
    message: error instanceof Error ? error.message : String(error)
  };
}

function projectObject(source, offset, chunk) {
  const projected = cloneValue(source);
  if (typeof projected.x === 'number') projected.x += offset.x;
  if (typeof projected.y === 'number') projected.y += offset.y;
  if (typeof projected.sortY === 'number') projected.sortY += offset.y;
  if (Array.isArray(projected.points)) {
    projected.points = projected.points.map(point => {
      if (Array.isArray(point)) return [point[0] + offset.x, point[1] + offset.y, ...point.slice(2)];
      if (point && typeof point === 'object') {
        return {
          ...point,
          ...(typeof point.x === 'number' ? { x: point.x + offset.x } : {}),
          ...(typeof point.y === 'number' ? { y: point.y + offset.y } : {})
        };
      }
      return point;
    });
  }
  projected.sceneId = chunk.sceneId;
  projected.row = chunk.row;
  projected.col = chunk.col;
  Object.defineProperty(projected, '_worldOffsetApplied', { value: true });
  return projected;
}

/** 加载项目世界地图，并缓存项目及每个场景的唯一加载 Promise。 */
export class WorldMapLoadSession {
  constructor({ loadProject, loadScene, loadSceneFallback = null, scope = null } = {}) {
    if (typeof loadProject !== 'function') throw new TypeError('loadProject must be a function');
    if (typeof loadScene !== 'function') throw new TypeError('loadScene must be a function');
    this.loadProject = loadProject;
    this.loadScene = loadScene;
    this.loadSceneFallback = loadSceneFallback;
    this.scope = scope;
    this._projectPromises = new Map();
    this._scenePromises = new Map();
    this._sceneData = new Map();
    this._lastResult = null;
    this._version = 0;
    this._disposed = false;
    this._detachScope = typeof scope?.add === 'function' ? scope.add(() => this.dispose()) : null;
  }

  async load({ projectUrl = 'game.project.json', regionIndex = 0 } = {}) {
    if (this._disposed) throw abortError();
    const version = ++this._version;
    const errors = [];
    let project = null;

    try {
      project = await this._getProjectPromise(projectUrl);
    } catch (error) {
      errors.push(errorRecord('project', error, { projectUrl }));
    }
    this._assertActive(version);

    const regions = project?.worldMap?.regions || project?.regions || [];
    const region = regions[regionIndex] || null;
    if (!region) {
      errors.push(errorRecord('region', new Error(`Region ${regionIndex} was not found`), { regionIndex }));
      return this._commit(version, { project, region: null, chunks: [], sceneObjects: [], placements: [], triggerBindings: [], effectZones: [], errors });
    }

    const chunkSpecs = this._chunkSpecs(region);
    const sceneIds = [...new Set(chunkSpecs.map(chunk => chunk.sceneId).filter(Boolean))];
    const loaded = await Promise.all(sceneIds.map(async sceneId => {
      const outcome = await this._getScenePromise(sceneId, project);
      return [sceneId, outcome];
    }));
    this._assertActive(version);

    const sceneOutcomes = new Map(loaded);
    for (const [sceneId, outcome] of loaded) {
      errors.push(...outcome.errors.map(entry => ({ ...entry, sceneId })));
      if (outcome.data) this._sceneData.set(sceneId, outcome.data);
    }

    const chunks = chunkSpecs.map(spec => ({
      ...spec,
      sceneData: sceneOutcomes.get(spec.sceneId)?.data || null
    }));
    const sceneObjects = [];
    const placements = [];
    const triggerBindings = [];
    const effectZones = [];
    for (const chunk of chunks) this._collectChunkObjects(chunk, sceneObjects, placements, effectZones, triggerBindings);

    return this._commit(version, { project, region, chunks, sceneObjects, placements, triggerBindings, effectZones, errors });
  }

  getSceneData(sceneId) {
    return this._sceneData.get(sceneId) || null;
  }

  getChunk(sceneOrQuery, occurrence = 0) {
    const chunks = this._lastResult?.chunks || [];
    if (sceneOrQuery && typeof sceneOrQuery === 'object') {
      return chunks.find(chunk =>
        (sceneOrQuery.sceneId == null || chunk.sceneId === sceneOrQuery.sceneId) &&
        (sceneOrQuery.row == null || chunk.row === sceneOrQuery.row) &&
        (sceneOrQuery.col == null || chunk.col === sceneOrQuery.col)
      ) || null;
    }
    return chunks.filter(chunk => chunk.sceneId === sceneOrQuery)[occurrence] || null;
  }

  findSpawn(sceneId, spawnRef = null) {
    const placements = this._lastResult?.placements || [];
    return placements.find(placement => {
      if (placement.type !== 'spawn' || placement.sceneId !== sceneId) return false;
      if (spawnRef == null) return true;
      return placement.ref === spawnRef || placement.id === spawnRef || placement.name === spawnRef;
    }) || null;
  }

  dispose() {
    if (this._disposed) return false;
    this._disposed = true;
    this._version++;
    this._sceneData.clear();
    this._lastResult = null;
    this._projectPromises.clear();
    this._scenePromises.clear();
    const detach = this._detachScope;
    this._detachScope = null;
    if (detach) detach();
    return true;
  }

  _getProjectPromise(projectUrl) {
    if (!this._projectPromises.has(projectUrl)) {
      this._projectPromises.set(projectUrl, Promise.resolve().then(() => this.loadProject(projectUrl)));
    }
    return this._projectPromises.get(projectUrl);
  }

  _getScenePromise(sceneId, project) {
    if (!this._scenePromises.has(sceneId)) {
      const promise = Promise.resolve()
        .then(() => this.loadScene(sceneId, project))
        .then(data => ({ data, errors: [] }))
        .catch(async primaryError => {
          const errors = [errorRecord('scene', primaryError, { loader: 'primary' })];
          if (typeof this.loadSceneFallback !== 'function') return { data: null, errors };
          try {
            const data = await this.loadSceneFallback(sceneId, project, primaryError);
            return { data, errors };
          } catch (fallbackError) {
            errors.push(errorRecord('scene', fallbackError, { loader: 'fallback' }));
            return { data: null, errors };
          }
        });
      this._scenePromises.set(sceneId, promise);
    }
    return this._scenePromises.get(sceneId);
  }

  _chunkSpecs(region) {
    const width = Number(region.chunkWidth) || 1280;
    const height = Number(region.chunkHeight) || 720;
    const chunks = [];
    if (Array.isArray(region.grid)) {
      for (let row = 0; row < region.grid.length; row++) {
        const cells = region.grid[row] || [];
        for (let col = 0; col < cells.length; col++) {
          const cell = cells[col];
          const sceneId = typeof cell === 'string' ? cell : cell?.sceneId ?? cell?.scene ?? cell?.id;
          if (sceneId) chunks.push({ sceneId, row, col, offset: { x: col * width, y: row * height } });
        }
      }
      return chunks;
    }
    for (const item of region.chunks || []) {
      const sceneId = item?.sceneId ?? item?.scene ?? item?.id;
      if (!sceneId) continue;
      const row = Number(item.row) || 0;
      const col = Number(item.col) || 0;
      chunks.push({ sceneId, row, col, offset: { x: col * width, y: row * height } });
    }
    return chunks;
  }

  _collectChunkObjects(chunk, sceneObjects, placements, effectZones, triggerBindings) {
    if (!chunk.sceneData) return;
    const candidates = [];
    for (const layer of chunk.sceneData.layers || []) candidates.push(...(layer?.objects || []));
    if (Array.isArray(chunk.sceneData.objects)) candidates.push(...chunk.sceneData.objects);
    if (Array.isArray(chunk.sceneData.placements)) candidates.push(...chunk.sceneData.placements);
    if (Array.isArray(chunk.sceneData.effectZones)) candidates.push(...chunk.sceneData.effectZones);
    const seen = new Set();
    for (const object of candidates) {
      if (!object || typeof object !== 'object' || seen.has(object)) continue;
      seen.add(object);
      const projected = projectObject(object, chunk.offset, chunk);
      sceneObjects.push(projected);
      if (object.type === 'ref' || object.type === 'spawn') {
        placements.push(projected);
      } else if (object.type === 'trigger') {
        triggerBindings.push(projected);
      } else if (object.type === 'effectZone') {
        effectZones.push(projected);
      }
    }
  }

  _assertActive(version) {
    if (this._disposed || version !== this._version || this.scope?.disposed) throw abortError();
  }

  _commit(version, result) {
    this._assertActive(version);
    this._lastResult = result;
    return result;
  }
}

export default WorldMapLoadSession;