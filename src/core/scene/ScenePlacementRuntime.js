/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { PlacementSpawner } from './PlacementSpawner.js';

function copyEntries(entries = []) {
  return entries.map(([id, state]) => [id, state == null ? state : JSON.parse(JSON.stringify(state))]);
}

function normalizeStateEntries(entries = []) {
  return (entries || [])
    .filter(entry => typeof entry?.id === 'string' && entry.state && typeof entry.state === 'object')
    .map(entry => [entry.id, JSON.parse(JSON.stringify(entry.state))]);
}

/**
 * 场景放置点的唯一运行时：拥有投影、生成幂等、pending 状态、出生点消费与原子重建。
 * 具体游戏只注入条件数据源和生成后的剧情索引副作用。
 */
export class ScenePlacementRuntime {
  constructor(config = {}) {
    if (!config.entityStore) throw new TypeError('ScenePlacementRuntime requires entityStore');
    this.scope = config.scope || null;
    this.entityStore = config.entityStore;
    this.aiSystem = config.aiSystem || null;
    this.getWorldPromise = config.getWorldPromise || (() => null);
    this.getLoadedChunks = config.getLoadedChunks || (() => new Map());
    this.getRegistries = config.getRegistries || (() => ({}));
    this.validatePlacementReferences = config.validatePlacementReferences || (() => ({ ok: true, errors: [] }));
    this.setValidationErrors = config.setValidationErrors || (() => {});
    this.getConditionRoot = config.getConditionRoot || (() => undefined);
    this.getCurrentSceneId = config.getCurrentSceneId || (() => null);
    this.getPlayer = config.getPlayer || (() => null);
    this.getCamera = config.getCamera || (() => null);
    this.consumeInitialPlayerSpawn = config.consumeInitialPlayerSpawn || (() => {});
    this.getPlayerStartMode = config.getPlayerStartMode || (() => 'restore');
    this.onCampfireSpawn = config.onCampfireSpawn || null;
    this.getCampfirePosition = config.getCampfirePosition || (() => null);
    this.syncProjection = config.syncProjection || (() => false);
    this.clearProjectionBindings = config.clearProjectionBindings || (() => {});
    this.getReadyGate = config.getReadyGate || (() => null);
    this.onProjectionReady = config.onProjectionReady || (() => {});
    this.onSpawn = config.onSpawn || null;
    this.onRemove = config.onRemove || null;
    this.logger = config.logger || console;


    this.placements = [];
    this.pendingPlacementStates = new Map();
    this.pendingResourceNodeStates = new Map();
    this.disposed = false;
    this.spawner = new PlacementSpawner({
      entityFactory: config.entityFactory,
      entityStore: this.entityStore,
      aiSystem: this.aiSystem,
      assetManager: config.assetManager,
      onEntityImageError: config.onEntityImageError,
      onNpcImageError: config.onNpcImageError,
      shouldSpawn: ({ placement }) => this.shouldSpawn(placement),
      onSpawn: detail => this._handleSpawn(detail)
    });
  }

  setProjection(placements = []) {
    this.placements = Array.isArray(placements) ? placements : [];
    return this.placements;
  }

  getPlacements() {
    return this.placements;
  }

  getPendingStateSnapshot() {
    return {
      resourceNodes: copyEntries([...this.pendingResourceNodeStates.entries()]),
      placementStates: copyEntries([...this.pendingPlacementStates.entries()])
    };
  }

  restorePendingStateSnapshot(snapshot = {}) {
    this.pendingResourceNodeStates = new Map(copyEntries(snapshot.resourceNodes || []));
    this.pendingPlacementStates = new Map(copyEntries(snapshot.placementStates || []));
    return { ok: true };
  }

  setPendingStates({ resourceNodes = [], placementStates = [] } = {}) {
    this.pendingResourceNodeStates = new Map(normalizeStateEntries(resourceNodes));
    this.pendingPlacementStates = new Map(normalizeStateEntries(placementStates));
    return this.getPendingStateSnapshot();
  }

  addPendingResourceNodeState(id, state) {
    if (!id || !state || typeof state !== 'object') return false;
    this.pendingResourceNodeStates.set(id, JSON.parse(JSON.stringify(state)));
    return true;
  }

  addPendingPlacementState(id, state) {
    if (!id || !state || typeof state !== 'object') return false;
    this.pendingPlacementStates.set(id, JSON.parse(JSON.stringify(state)));
    return true;
  }

  updatePendingResourceNodeStates(updater) {
    if (typeof updater !== 'function') return 0;
    let updated = 0;
    for (const [id, state] of this.pendingResourceNodeStates) {
      if (updater(state, id) === true) updated++;
    }
    return updated;
  }

  shouldSpawn(placement = {}) {
    const condition = placement.spawnWhen;
    if (!condition || typeof condition !== 'object') return true;
    let value = this.getConditionRoot(condition.blackboardKey || 'storyState');
    for (const segment of String(condition.path || '').split('.').filter(Boolean)) {
      value = value && typeof value === 'object' ? value[segment] : undefined;
    }
    if (condition.exists === true && value === undefined) return false;
    if (condition.exists === false && value !== undefined) return false;
    if (Object.prototype.hasOwnProperty.call(condition, 'equals') && value !== condition.equals) return false;
    if (Object.prototype.hasOwnProperty.call(condition, 'gte') && !(Number(value) >= Number(condition.gte))) return false;
    if (Object.prototype.hasOwnProperty.call(condition, 'lte') && !(Number(value) <= Number(condition.lte))) return false;
    if (Array.isArray(condition.in) && !condition.in.includes(value)) return false;
    return true;
  }

  validateProjection() {
    const result = this.validatePlacementReferences(this.placements) || { ok: true, errors: [] };
    if (!result.ok) this.setValidationErrors(result.errors || []);
    return result;
  }

  async spawn(selector = {}) {
    if (!this._isActive()) return { ok: false, errors: [{ code: 'placementRuntimeDisposed', path: 'placements', message: '场景放置运行时已释放' }] };
    const scope = this.scope;
    try {
      await this.getWorldPromise();
    } catch (error) {
      if (this._isActive(scope)) this.logger.warn('[ScenePlacementRuntime] 世界尚未就绪，无法生成放置点', error);
      return { ok: false, errors: [{ code: 'placementWorldLoadFailed', path: 'placements', message: error?.message || String(error) }] };
    }
    if (!this._isActive(scope)) return { ok: false, errors: [{ code: 'placementRuntimeDisposed', path: 'placements', message: '场景放置运行时已释放' }] };

    const validation = this.validateProjection();
    if (!validation.ok) {
      this.logger.error('[ScenePlacementRuntime] 放置点引用校验失败', validation.errors);
      return { ok: false, errors: validation.errors || [] };
    }
    const result = this.spawner.spawnMatching({
      selector,
      placements: this.placements,
      registries: this.getRegistries()
    });
    for (const entry of result.errors) {
      if (entry.reason === 'definitionNotFound') {
        this.logger.warn('[ScenePlacementRuntime] 未找到放置定义', entry.kind, entry.ref);
      }
    }
    this.logger.log('[ScenePlacementRuntime] spawn', {
      selector: result.selector,
      matched: result.matchedPlacements.map(placement => placement.id),
      counts: result.counts,
      errors: result.errors.length
    });
    return { ok: true, ...result };
  }

  spawnGroup(group) {
    const value = typeof group === 'object' ? group?.group : group;
    return this.spawn({ group: value });
  }

  async spawnLoadedChunks() {
    const source = this.getLoadedChunks();
    const chunks = [...(source?.values?.() || source || [])]
      .filter(chunk => chunk?.sceneId && (chunk.placements || []).length > 0)
      .sort((a, b) => (a.row - b.row) || (a.col - b.col) || a.sceneId.localeCompare(b.sceneId));
    for (const chunk of chunks) {
      const result = await this.spawn({ sceneId: chunk.sceneId });
      if (result?.ok === false) return result;
    }
    return { ok: true, errors: [] };
  }


  loadProjection({ sceneId = null, consumePlayerSpawn = false } = {}) {
    const promise = this.getWorldPromise();
    if (!promise || typeof promise.then !== 'function') return Promise.resolve({ ok: false, errors: [] });
    const scope = this.scope;
    return promise.then(result => {
      if (!this._isActive(scope)) return { ok: false, errors: [] };
      if (!result?.region) this.logger.warn('[ScenePlacementRuntime] game.project.json 无 worldMap 配置');
      const targetSceneId = sceneId ?? result?.worldIndex?.getEntry?.()?.sceneId ?? this.getCurrentSceneId();
      this.syncProjection();
      this.applySpawnPoints({ sceneId: targetSceneId, applyPlayer: consumePlayerSpawn });
      this.getReadyGate()?.resolve?.('placements', this.placements);
      this.onProjectionReady();
      return { ok: true, placements: this.placements };
    }).catch(error => {
      if (!this._isActive(scope)) return { ok: false, errors: [] };
      this.logger.warn('[ScenePlacementRuntime] 加载 game.project.json 失败:', error);
      this.setProjection([]);
      this.clearProjectionBindings();
      this.applySpawnPoints({ sceneId: sceneId ?? this.getCurrentSceneId(), applyPlayer: consumePlayerSpawn });
      this.getReadyGate()?.resolve?.('placements', this.placements);
      this.onProjectionReady();
      return { ok: false, errors: [{ code: 'placementProjectionFailed', path: 'placements', message: error?.message || String(error) }] };
    });
  }

  applySpawnPoints({ sceneId = this.getCurrentSceneId(), applyPlayer = false } = {}) {
    const scenePlacements = this.placements.filter(placement => placement.sceneId === sceneId);
    const campfireSpawn = scenePlacements.find(placement => placement.type === 'spawn' && placement.ref === 'campfire');
    if (campfireSpawn) this.onCampfireSpawn?.(campfireSpawn);

    let playerMoved = false;
    if (applyPlayer) {
      const playerSpawn = scenePlacements.find(placement => placement.type === 'spawn'
        && (placement.ref === 'player' || placement.kind === 'player'));
      const transform = this.getPlayer()?.getComponent?.('transform');
      if (playerSpawn && transform) {
        transform.position.x = playerSpawn.x;
        transform.position.y = playerSpawn.y;
        this.getCamera()?.setPosition?.(playerSpawn.x, playerSpawn.y);
        this.consumeInitialPlayerSpawn(playerSpawn);
        playerMoved = true;
      } else {
        this.logger.error(`[ScenePlacementRuntime] 新游戏缺少 canonical 玩家出生点: ${sceneId}`);
      }
    }
    this.logger.log('[ScenePlacementRuntime] 场景放置点', {
      total: this.placements.length,
      sceneId,
      playerStartMode: this.getPlayerStartMode(),
      playerMoved,
      player: this.getPlayer()?.getComponent?.('transform')?.position,
      campfire: this.getCampfirePosition()
    });
    return { playerMoved, campfireSpawn: campfireSpawn || null };
  }

  getSpawnPoint(sceneId, ref = 'player') {
    return this.placements.find(placement => placement.sceneId === sceneId
      && placement.type === 'spawn'
      && (placement.ref === ref || (ref === 'player' && placement.kind === 'player'))) || null;
  }

  rebuild(sceneId = this.getCurrentSceneId()) {
    if (this.disposed || !this.spawner || !this.entityStore) {
      return { ok: false, errors: [{ code: 'placementRuntimeUnavailable', path: 'placementStates', message: '场景放置运行时尚未就绪' }] };
    }
    const restoreIds = new Set([
      ...this.pendingPlacementStates.keys(),
      ...this.pendingResourceNodeStates.keys()
    ]);
    for (const placement of this.placements) {
      if (placement?.type === 'ref' && placement.sceneId === sceneId && placement.id) restoreIds.add(placement.id);
    }
    const placementIds = new Set(this.placements
      .filter(placement => placement?.type === 'ref' && placement.id && restoreIds.has(placement.id))
      .map(placement => placement.id));
    const oldValues = new Set([
      ...this.entityStore.all,
      ...this.entityStore.pickups,
      ...this.entityStore.equipmentItems
    ].filter(value => placementIds.has(value?.placementId || value?.id)));
    const previouslySpawnedIds = [...placementIds]
      .filter(id => this.spawner.spawnedPlacementIds.has(id));
    const oldAiStates = [...oldValues]
      .filter(value => value?.type === 'enemy' || value?.isAI || value?.aiType)
      .map(value => ({ value, state: this.aiSystem?.getRuntimeState?.(value) || null }));
    const pendingBefore = this.getPendingStateSnapshot();

    for (const entry of oldAiStates) this.aiSystem?.unregisterAI?.(entry.value);
    this.spawner.forgetPlacements(placementIds);
    const result = this.spawner.spawnMatching({
      selector: { placementIds: [...placementIds] },
      placements: this.placements,
      registries: this.getRegistries()
    });
    if (result.errors.length > 0) {
      this._destroyValues(result.entities);
      this._restoreAIStates(oldAiStates);
      this.restorePendingStateSnapshot(pendingBefore);
      this.spawner.forgetPlacements(placementIds);
      this.spawner.rememberPlacements(previouslySpawnedIds);
      return {
        ok: false,
        errors: result.errors.map((entry, index) => ({
          code: entry.reason || 'placementRestoreFailed',
          path: `placementStates.${entry.placement?.id || index}`,
          message: `放置对象重建失败: ${entry.ref || entry.placement?.id || index}`
        }))
      };
    }
    this._destroyValues(oldValues, { unregisterAI: false });
    return { ok: true, errors: [] };
  }

  applyPendingToExisting(values = []) {
    for (const value of values) {
      this.applyPendingResourceNodeState(value);
      this.applyPendingPlacementState(value, { id: value?.placementId || value?.id });
    }
  }

  applyPendingPlacementState(value, placement = {}) {
    const placementId = placement?.id || value?.placementId || value?.id;
    const state = this.pendingPlacementStates.get(placementId);
    if (!placementId || !state) return false;
    if (state.removed === true) {
      value.picked = state.kind === 'item' || value.picked === true;
      value.isDead = state.kind === 'enemy' || value.isDead === true;
      value.isDying = state.kind === 'enemy' || value.isDying === true;
      this._destroyValues([value]);
      return true;
    }
    if (state.kind === 'item' && Number.isFinite(state.quantity)) {
      value.quantity = Math.max(0, Math.floor(state.quantity));
    }
    const stats = value?.getComponent?.('stats');
    const transform = value?.getComponent?.('transform');
    if (stats && Number.isFinite(state.hp)) {
      const maxHp = Number.isFinite(Number(stats.maxHp)) ? Number(stats.maxHp) : Number(state.hp);
      stats.hp = Math.min(maxHp, Math.max(0, Number(state.hp)));
    }
    if (transform && Number.isFinite(state.position?.x) && Number.isFinite(state.position?.y)) {
      transform.position.x = state.position.x;
      transform.position.y = state.position.y;
    }
    if (state.kind === 'enemy' && state.ai) this.aiSystem?.restoreRuntimeState?.(value, state.ai);
    this.pendingPlacementStates.delete(placementId);
    return false;
  }

  applyPendingResourceNodeState(entity) {
    const node = entity?.getComponent?.('resourceNode');
    const state = this.pendingResourceNodeStates.get(entity?.id);
    if (!node || !state) return false;
    node.deserialize(state);
    this.pendingResourceNodeStates.delete(entity.id);
    return true;
  }


  forgetPlacements(ids = []) {
    return this.spawner.forgetPlacements(ids);
  }

  reset({ clearProjection = true, clearPending = true, clearSpawned = false } = {}) {
    if (clearProjection) this.placements = [];
    if (clearPending) {
      this.pendingPlacementStates.clear();
      this.pendingResourceNodeStates.clear();
    }
    if (clearSpawned) this.spawner.spawnedPlacementIds.clear();
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    this.reset({ clearProjection: true, clearPending: true, clearSpawned: true });
    return true;
  }

  _handleSpawn(detail) {
    if (detail.kind === 'resourceNode') this.applyPendingResourceNodeState(detail.entity);
    if (this.applyPendingPlacementState(detail.entity, detail.placement)) return;
    this.onSpawn?.(detail);
  }

  _destroyValues(values = [], { unregisterAI = true } = {}) {
    const unique = new Set(values || []);
    if (unique.size === 0) return [];
    if (unregisterAI) {
      for (const value of unique) this.aiSystem?.unregisterAI?.(value);
    }
    const removed = this.entityStore.removeMany(unique);
    this.onRemove?.(unique);
    for (const value of unique) {
      try { value?.destroy?.(); } catch (error) { /* best-effort runtime cleanup */ }
    }
    return removed;
  }

  _restoreAIStates(entries = []) {
    for (const { value, state } of entries) {
      if (state) this.aiSystem?.restoreRuntimeState?.(value, state);
    }
  }

  _isActive(scope = this.scope) {
    return !this.disposed && (!scope || (!scope.disposed && scope === this.scope));
  }
}

export default ScenePlacementRuntime;