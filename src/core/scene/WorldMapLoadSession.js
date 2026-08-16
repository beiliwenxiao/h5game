/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { ProjectWorldIndex } from '../ProjectWorldIndex.js';
import { SceneObjectProjector } from './SceneObjectProjector.js';
import { createSpatialTriggerBinding } from './SpatialTriggerBinding.js';

function abortError() {
  const error = new Error('World map load session is no longer active');
  error.name = 'AbortError';
  return error;
}

function errorRecord(stage, error, extra = {}) {
  return {
    stage,
    ...extra,
    error,
    message: error instanceof Error ? error.message : String(error)
  };
}

/** 加载项目世界地图，并缓存项目及每个场景的唯一加载 Promise。 */
export class WorldMapLoadSession {
  constructor({ repository = null, loadProject = null, loadScene = null, loadSceneFallback = null, scope = null, projector = null } = {}) {
    if (!repository && typeof loadProject !== 'function') throw new TypeError('loadProject must be a function');
    if (!repository && typeof loadScene !== 'function') throw new TypeError('loadScene must be a function');
    this.repository = repository;
    this.loadProject = loadProject;
    this.loadScene = loadScene;
    this.loadSceneFallback = loadSceneFallback;
    this.scope = scope;
    this.projector = projector || new SceneObjectProjector();
    this._projectPromises = new Map();
    this._scenePromises = new Map();
    this._sceneData = new Map();
    this._generationSnapshot = null;
    this._lastResult = null;
    this._version = 0;
    this._disposed = false;
    this._detachScope = typeof scope?.add === 'function' ? scope.add(() => this.dispose()) : null;
  }

  async load({ projectUrl = 'game.project.json', regionIndex = null, sceneIds = null } = {}) {
    if (this._disposed) throw abortError();
    const version = ++this._version;
    const errors = [];
    const warnings = [];
    this._projectPromises = new Map();
    this._scenePromises = new Map();
    this._generationSnapshot = null;
    let project = null;
    let worldIndex = null;

    try {
      if (this.repository) {
        const repositoryResult = await this.repository.refresh();
        this._generationSnapshot = repositoryResult.snapshot;
        warnings.push(...(repositoryResult.warnings || []));
        if (!repositoryResult.ok) {
          errors.push(...repositoryResult.errors.map(error => errorRecord('canonicalSceneRepository', error, {
            projectUrl,
            category: error.category,
            source: error.source
          })));
        }
        project = this._generationSnapshot?.project || null;
      } else {
        project = await this._getProjectPromise(projectUrl);
      }
      worldIndex = ProjectWorldIndex.build(project);
    } catch (error) {
      errors.push(errorRecord('projectWorldIndex', error, {
        projectUrl,
        errors: error?.errors || []
      }));
    }
    this._assertActive(version);

    const resolvedRegionRef = regionIndex ?? (sceneIds === 'entry'
      ? worldIndex?.getEntry?.()?.regionId
      : 0);
    const region = worldIndex?.getRegion(resolvedRegionRef) || null;
    if (!region) {
      errors.push(errorRecord('region', new Error(`Region ${resolvedRegionRef} was not found`), {
        regionIndex: resolvedRegionRef
      }));
      return this._commit(version, {
        project, worldIndex, repositorySnapshot: this._generationSnapshot,
        region: null, chunks: [], sceneObjects: [], placements: [], triggerBindings: [], effectZones: [],
        sceneProvenance: {}, warnings, errors
      });
    }

    const chunkSpecs = this._chunkSpecs(worldIndex, region);
    const regionSceneIds = [...new Set(chunkSpecs.map(chunk => chunk.sceneId).filter(Boolean))];
    const requestedValues = sceneIds === 'entry'
      ? [worldIndex.getEntry()?.sceneId]
      : sceneIds;
    const requestedSceneIds = Array.isArray(requestedValues)
      ? [...new Set(requestedValues.filter(sceneId => regionSceneIds.includes(sceneId)))]
      : regionSceneIds;
    const loaded = await Promise.all(requestedSceneIds.map(async sceneId => {
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

    const sceneProvenance = Object.fromEntries(requestedSceneIds.map(sceneId => [
      sceneId,
      this._generationSnapshot?.getProvenance?.(sceneId) || null
    ]));
    return this._commit(version, {
      project, worldIndex, repositorySnapshot: this._generationSnapshot,
      region, chunks, sceneObjects, placements, triggerBindings, effectZones,
      sceneProvenance, warnings, errors
    });
  }

  getSceneData(sceneId) {
    return this._sceneData.get(sceneId) || null;
  }

  async loadSceneData(sceneId, project = this._lastResult?.project || null) {
    if (this._disposed) throw abortError();
    const outcome = await this._getScenePromise(sceneId, project);
    if (!outcome?.data) {
      const error = new Error(outcome?.errors?.[0]?.message || `场景 ${sceneId} 加载失败`);
      error.errors = outcome?.errors || [];
      throw error;
    }
    this._sceneData.set(sceneId, outcome.data);
    const chunk = this._lastResult?.chunks?.find(entry => entry.sceneId === sceneId);
    if (chunk && !chunk.sceneData) {
      chunk.sceneData = outcome.data;
      this._collectChunkObjects(
        chunk,
        this._lastResult.sceneObjects,
        this._lastResult.placements,
        this._lastResult.effectZones,
        this._lastResult.triggerBindings
      );
    }
    return outcome.data;
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

  findSceneObject(sceneId, objectId) {
    if (!sceneId || !objectId) return null;
    return this._lastResult?.sceneObjects?.find(object => (
      object?.sceneId === sceneId && object?.id === objectId
    )) || null;
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
    this._generationSnapshot = null;
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
      if (this._generationSnapshot) {
        const record = this._generationSnapshot.getRecord(sceneId);
        const promise = record
          ? Promise.resolve({ data: record.data, errors: [] })
          : Promise.resolve({
            data: null,
            errors: [errorRecord('scene', new Error(`场景不在当前 repository snapshot: ${sceneId}`), {
              loader: 'repository', sceneId
            })]
          });
        this._scenePromises.set(sceneId, promise);
        return promise;
      }
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

  _chunkSpecs(worldIndex, region) {
    return worldIndex.getCells(region.id).map(cell => ({
      sceneId: cell.sceneId,
      row: cell.row,
      col: cell.col,
      offset: cell.offset
    }));
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
      const projected = this.projector.project(object, chunk.offset, {
        sceneId: chunk.sceneId,
        row: chunk.row,
        col: chunk.col
      });
      if (object.type === 'trigger') {
        triggerBindings.push(createSpatialTriggerBinding(projected));
        continue;
      }
      sceneObjects.push(projected);
      if (object.type === 'ref' || object.type === 'spawn') {
        placements.push(projected);
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