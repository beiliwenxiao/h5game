/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { SceneObjectProjector } from './scene/SceneObjectProjector.js';
import { createSpatialTriggerBinding } from './scene/SpatialTriggerBinding.js';

const CHUNK_STATE_SCHEMA_VERSION = 1;

function cloneValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPromise(value) {
  return !!value && typeof value.then === 'function';
}

/**
 * detached chunk 容器。实体创建完全委托 placementAdapter，core 不解释 Demo 内容库。
 */
export class LoadedChunk {
  constructor(options = {}) {
    this.key = options.key || '';
    this.regionId = options.regionId || 'default';
    this.chunkId = options.chunkId || options.sceneId || '';
    this.sceneId = options.sceneId || this.chunkId;
    this.sceneNamespace = options.sceneNamespace || this.sceneId.replace(/-C\d{2}$/, '');
    this.col = Number(options.col) || 0;
    this.row = Number(options.row) || 0;
    this.origin = options.origin || { x: 0, y: 0 };
    this.sceneData = options.sceneData || null;
    this.placementAdapter = options.placementAdapter || null;
    this.projector = options.projector || new SceneObjectProjector();
    this.entityIds = [];
    this.entities = [];
    this.decorations = [];
    this.sceneObjects = [];
    this.placements = [];
    this.triggerBindings = [];
    this.effectZones = [];
    this._commitHandle = null;
    this._state = this._emptyState();
    if (options.savedState) {
      const restored = this.restoreState(options.savedState);
      if (!restored.ok) throw new TypeError(`LoadedChunk ${this.chunkId} savedState is invalid`);
    }
  }

  _emptyState() {
    return {
      schemaVersion: CHUNK_STATE_SCHEMA_VERSION,
      pickedItems: [],
      killedEnemies: [],
      switches: {},
      npcPositions: {},
      placementState: null
    };
  }

  _context(extra = {}) {
    return {
      chunk: this,
      key: this.key,
      regionId: this.regionId,
      chunkId: this.chunkId,
      sceneId: this.sceneId,
      sceneNamespace: this.sceneNamespace,
      col: this.col,
      row: this.row,
      origin: { ...this.origin },
      sceneData: this.sceneData,
      state: cloneValue(this._state),
      ...extra
    };
  }

  async prepare({ signal = null, savedState = null } = {}) {
    if (signal?.aborted) return { ok: false, errors: [{ code: 'aborted', path: '', message: 'Chunk 准备已取消' }] };
    if (savedState) {
      const check = this.validateState(savedState);
      if (!check.ok) return check;
    }
    const placements = [];
    const decorations = [];
    const sceneObjects = [];
    const triggerBindings = [];
    const effectZones = [];
    for (const layer of this.sceneData?.layers || []) {
      if (!layer || layer.visible === false) continue;
      for (const object of layer.objects || []) {
        if (!object) continue;
        const projected = this._projectObject(object);
        if (object.type === 'trigger') {
          if (object.enabled === false) continue;
          triggerBindings.push(createSpatialTriggerBinding(projected));
          continue;
        }
        sceneObjects.push(projected);
        if (object.type === 'ref' || object.type === 'spawn') placements.push(projected);
        if (object.type === 'effectZone') effectZones.push(projected);
        if (object.type === 'deco' || object.type === 'slice' || object.type === 'image') decorations.push(projected);
      }
    }
    const objects = this.sceneData?.objects || {};
    for (const list of [objects.npcs, objects.spawns, objects.portals, objects.regions]) {
      for (const object of list || []) {
        const projected = this._projectObject(object);
        sceneObjects.push(projected);
        placements.push(projected);
      }
    }
    let placementDraft = null;
    if (typeof this.placementAdapter?.prepare === 'function') {
      placementDraft = await this.placementAdapter.prepare(this._context({ placements, signal }));
      if (placementDraft?.ok === false) return placementDraft;
    }
    return {
      ok: true,
      placements,
      decorations,
      sceneObjects,
      triggerBindings,
      effectZones,
      placementDraft: placementDraft?.draft ?? placementDraft
    };
  }

  validatePrepared(prepared) {
    const errors = [];
    if (!prepared || prepared.ok === false || !Array.isArray(prepared.placements) ||
        !Array.isArray(prepared.decorations) || !Array.isArray(prepared.sceneObjects) ||
        !Array.isArray(prepared.triggerBindings) || !Array.isArray(prepared.effectZones)) {
      errors.push({ code: 'invalidChunkDraft', path: '', message: 'Chunk detached 草稿无效' });
      return { ok: false, errors };
    }
    if (typeof this.placementAdapter?.validatePrepared === 'function') {
      const check = this.placementAdapter.validatePrepared(prepared.placementDraft, this._context());
      if (isPromise(check)) {
        errors.push({ code: 'asyncValidationUnsupported', path: 'placementDraft', message: '提交前校验必须同步完成' });
      } else if (check?.ok === false) {
        errors.push(...(check.errors || [{ code: 'invalidPlacementDraft', path: 'placementDraft', message: '放置草稿无效' }]));
      }
    }
    return { ok: errors.length === 0, errors };
  }

  async commit(prepared) {
    const check = this.validatePrepared(prepared);
    if (!check.ok) return check;
    let adapterResult = { ok: true, entities: [], entityIds: [], rollback: null };
    if (typeof this.placementAdapter?.commit === 'function') {
      adapterResult = await this.placementAdapter.commit(prepared.placementDraft, this._context({ placements: prepared.placements }));
      if (adapterResult?.ok === false) return adapterResult;
    }
    this.decorations = prepared.decorations;
    this.sceneObjects = prepared.sceneObjects;
    this.placements = prepared.placements;
    this.triggerBindings = prepared.triggerBindings;
    this.effectZones = prepared.effectZones;
    this.entities = Array.isArray(adapterResult?.entities) ? adapterResult.entities : [];
    this.entityIds = Array.isArray(adapterResult?.entityIds)
      ? adapterResult.entityIds.slice()
      : this.entities.map(entity => entity?.id).filter(Boolean);
    this._commitHandle = adapterResult?.commitHandle ?? null;
    return { ok: true, rollback: adapterResult?.rollback ?? null, adapterResult };
  }

  async rollbackPrepared(commitResult, prepared) {
    if (typeof this.placementAdapter?.rollback === 'function') {
      await this.placementAdapter.rollback(
        commitResult?.rollback ?? commitResult?.adapterResult?.rollback ?? null,
        this._context({ placementDraft: prepared?.placementDraft })
      );
    } else if (typeof this.placementAdapter?.release === 'function') {
      await this.placementAdapter.release(this._context({ commitHandle: this._commitHandle }));
    }
    this.entityIds = [];
    this.entities = [];
    this.decorations = [];
    this.sceneObjects = [];
    this.placements = [];
    this.triggerBindings = [];
    this.effectZones = [];
    this._commitHandle = null;
    return { ok: true };
  }

  async discardPrepared(prepared) {
    if (typeof this.placementAdapter?.discard === 'function') {
      await this.placementAdapter.discard(prepared?.placementDraft, this._context());
    }
  }

  /** 兼容入口；正式流式路径使用 prepare → validatePrepared → commit。 */
  async instantiate(placementAdapter = this.placementAdapter) {
    if (placementAdapter) this.placementAdapter = placementAdapter;
    const prepared = await this.prepare();
    if (prepared?.ok === false) return prepared;
    return this.commit(prepared);
  }

  _projectObject(object) {
    return this.projector.project(object, this.origin, {
      sceneId: this.sceneId,
      chunkId: this.chunkId,
      sceneNamespace: this.sceneNamespace,
      row: this.row,
      col: this.col
    });
  }

  markItemPicked(itemId) {
    if (itemId && !this._state.pickedItems.includes(itemId)) this._state.pickedItems.push(itemId);
  }

  markEnemyKilled(enemyId) {
    if (enemyId && !this._state.killedEnemies.includes(enemyId)) this._state.killedEnemies.push(enemyId);
  }

  setSwitch(switchId, value) {
    if (switchId) this._state.switches[switchId] = !!value;
  }

  saveNpcPosition(npcId, x, y) {
    if (!npcId || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return false;
    this._state.npcPositions[npcId] = { x: Number(x) - this.origin.x, y: Number(y) - this.origin.y };
    return true;
  }

  serialize() {
    let placementState = this._state.placementState;
    if (typeof this.placementAdapter?.capture === 'function') {
      placementState = this.placementAdapter.capture(this._context({
        entities: this.entities,
        entityIds: this.entityIds,
        commitHandle: this._commitHandle
      }));
      if (isPromise(placementState)) throw new TypeError('LoadedChunk placementAdapter.capture must be synchronous');
    }
    return cloneValue({ ...this._state, placementState });
  }

  validateState(state) {
    const errors = [];
    if (!state || state.schemaVersion !== CHUNK_STATE_SCHEMA_VERSION) {
      errors.push({ code: 'chunkStateVersionMismatch', path: 'schemaVersion', message: 'Chunk 状态版本不兼容' });
      return { ok: false, errors };
    }
    if (!Array.isArray(state.pickedItems) || !Array.isArray(state.killedEnemies) ||
        !state.switches || typeof state.switches !== 'object' ||
        !state.npcPositions || typeof state.npcPositions !== 'object') {
      errors.push({ code: 'invalidChunkState', path: '', message: 'Chunk 动态状态字段无效' });
    }
    for (const [id, position] of Object.entries(state.npcPositions || {})) {
      if (!id || !Number.isFinite(Number(position?.x)) || !Number.isFinite(Number(position?.y))) {
        errors.push({ code: 'invalidNpcPosition', path: `npcPositions.${id}`, message: 'NPC 局部坐标无效' });
      }
    }
    if (typeof this.placementAdapter?.validateState === 'function' && state.placementState != null) {
      const check = this.placementAdapter.validateState(state.placementState, this._context());
      if (isPromise(check)) {
        errors.push({ code: 'asyncValidationUnsupported', path: 'placementState', message: 'Chunk 状态校验必须同步' });
      } else if (check?.ok === false) {
        errors.push(...(check.errors || []).map(error => ({
          ...error,
          path: `placementState${error.path ? `.${error.path}` : ''}`
        })));
      }
    }
    return { ok: errors.length === 0, errors };
  }

  restoreState(state) {
    const check = this.validateState(state);
    if (!check.ok) return check;
    this._state = cloneValue(state);
    return { ok: true, errors: [] };
  }

  async release() {
    if (typeof this.placementAdapter?.release === 'function') {
      await this.placementAdapter.release(this._context({
        entities: this.entities,
        entityIds: this.entityIds,
        commitHandle: this._commitHandle
      }));
    }
    this.entityIds = [];
    this.entities = [];
    this.decorations = [];
    this.sceneObjects = [];
    this.placements = [];
    this.triggerBindings = [];
    this.effectZones = [];
    this._commitHandle = null;
  }

  destroy() {
    const result = this.release();
    if (isPromise(result)) result.catch(error => console.warn('LoadedChunk: 异步释放失败', this.key, error));
  }
}

export { CHUNK_STATE_SCHEMA_VERSION };
export default LoadedChunk;
