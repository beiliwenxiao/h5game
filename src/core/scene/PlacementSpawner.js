/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const REGISTRY_KEYS = Object.freeze({
  item: 'items',
  equipment: 'equipment',
  enemy: 'enemies',
  npc: 'npcs',
  building: 'buildings',
  vehicle: 'vehicles',
  resourceNode: 'resourceNodes'
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}

/** 合并顶层字段，并对其直接子对象再合并一层。 */
function mergeOverrides(base, overrides) {
  const output = cloneValue(base || {});
  for (const [key, value] of Object.entries(overrides || {})) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = { ...output[key], ...cloneValue(value) };
    } else {
      output[key] = cloneValue(value);
    }
  }
  return output;
}

function registryGet(registries, kind, ref) {
  const registry = registries?.[REGISTRY_KEYS[kind]];
  if (!registry) return null;
  if (typeof registry.get === 'function') return registry.get(ref) || null;
  return registry[ref] || null;
}

function toStringList(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values
    .flatMap(entry => String(entry ?? '').split(','))
    .map(entry => entry.trim())
    .filter(Boolean))];
}

function normalizeSelector(selector = {}) {
  return {
    placementIds: toStringList(selector.placementIds ?? selector.placementId),
    group: typeof selector.group === 'string' ? selector.group.trim() : '',
    tags: toStringList(selector.tags ?? selector.tag),
    tagMode: selector.tagMode === 'all' ? 'all' : 'any',
    sceneId: typeof selector.sceneId === 'string' ? selector.sceneId.trim() : '',
    kinds: toStringList(selector.kinds ?? selector.kind)
  };
}

function placementMatches(placement, selector) {
  if (!placement || !selector) return false;
  const hasCriterion = selector.placementIds.length || selector.group || selector.tags.length || selector.sceneId || selector.kinds.length;
  if (!hasCriterion) return false;
  if (selector.placementIds.length && !selector.placementIds.includes(placement.id)) return false;
  if (selector.group && placement.group !== selector.group) return false;
  if (selector.sceneId && placement.sceneId !== selector.sceneId) return false;
  if (selector.kinds.length && !selector.kinds.includes(placement.kind)) return false;
  if (selector.tags.length) {
    const placementTags = toStringList(placement.tags);
    const tagMatched = selector.tagMode === 'all'
      ? selector.tags.every(tag => placementTags.includes(tag))
      : selector.tags.some(tag => placementTags.includes(tag));
    if (!tagMatched) return false;
  }
  return true;
}

/** 将分组放置点与内容注册表定义组合为运行时对象。 */
export class PlacementSpawner {
  constructor({
    entityFactory = null,
    entityStore = null,
    aiSystem = null,
    assetManager = null,
    onEntityImageError = null,
    onNpcImageError = null,
    onSpawn = null,
    shouldSpawn = null
  } = {}) {
    this.entityFactory = entityFactory;
    this.entityStore = entityStore;
    this.aiSystem = aiSystem;
    this.assetManager = assetManager;
    this.onEntityImageError = typeof onEntityImageError === 'function' ? onEntityImageError : null;
    this.onNpcImageError = onNpcImageError;
    this.onSpawn = onSpawn;
    this.shouldSpawn = typeof shouldSpawn === 'function' ? shouldSpawn : null;
    this.spawnedPlacementIds = new Set();
  }

  forgetPlacements(ids = []) {
    let removed = 0;
    for (const id of ids || []) {
      if (id && this.spawnedPlacementIds.delete(id)) removed++;
    }
    return removed;
  }

  rememberPlacements(ids = []) {
    let added = 0;
    for (const id of ids || []) {
      if (!id || this.spawnedPlacementIds.has(id)) continue;
      this.spawnedPlacementIds.add(id);
      added++;
    }
    return added;
  }

  /**
   * 兼容旧触发器：按组名生成放置点。
   * @param {Object} options
   * @returns {Object}
   */
  spawnGroup({ group, placements = [], registries = {} } = {}) {
    return this.spawnMatching({ placements, registries, selector: { group } });
  }

  /**
   * 按放置点 ID、组名、标签、场景或类型筛选并生成。
   * 各筛选条件同时存在时取交集；未给任何条件时不生成任何对象。
   * @param {Object} options
   * @param {Array<Object>} options.placements
   * @param {Object} options.registries
   * @param {Object} options.selector
   * @returns {{selector:Object, matchedPlacements:Array<Object>, counts:Object, entities:Array, errors:Array}}
   */
  spawnMatching({ placements = [], registries = {}, selector = {} } = {}) {
    const normalized = normalizeSelector(selector);
    const counts = { item: 0, equipment: 0, enemy: 0, npc: 0, building: 0, vehicle: 0, resourceNode: 0, total: 0 };
    const entities = [];
    const errors = [];
    const matchedPlacements = (placements || []).filter(placement => placementMatches(placement, normalized));

    for (const placement of matchedPlacements) {
      const kind = placement.kind;
      if (!REGISTRY_KEYS[kind]) continue;
      if (placement.id && this.spawnedPlacementIds.has(placement.id)) continue;
      if (this.shouldSpawn) {
        try {
          if (this.shouldSpawn({ placement, selector: normalized }) === false) continue;
        } catch (error) {
          errors.push({ kind, ref: placement.ref, placement, reason: 'spawnConditionFailed', error });
          continue;
        }
      }
      const definition = registryGet(registries, kind, placement.ref);
      if (!definition) {
        errors.push({ kind, ref: placement.ref, placement, reason: 'definitionNotFound' });
        continue;
      }

      try {
        const data = mergeOverrides(definition, placement.overrides);
        if (kind === 'enemy' && data.corpse?.resourceNodeRef) {
          const resourceNode = registryGet(registries, 'resourceNode', data.corpse.resourceNodeRef);
          if (!resourceNode) {
            errors.push({ kind, ref: placement.ref, placement, reason: 'corpseResourceNodeNotFound' });
            continue;
          }
          data.corpse = {
            ...data.corpse,
            resourceNode: mergeOverrides(resourceNode, data.corpse.resourceNode)
          };
        }
        data.position = { x: Number(placement.x) || 0, y: Number(placement.y) || 0 };
        const entity = this._spawn(kind, data, placement);
        if (!entity) {
          errors.push({ kind, ref: placement.ref, placement, reason: 'factoryUnavailable' });
          continue;
        }
        // 地面可拾取物与装备同样可以声明稳定 imageId，需要一起预载图片。
        if (['npc', 'enemy', 'resourceNode', 'item', 'equipment'].includes(kind)) {
          this._preloadEntityImage(kind, data, entity, placement);
        }
        if (typeof this.onSpawn === 'function') {
          try {
            this.onSpawn({ entity, kind, group: placement.group || normalized.group || null, placement, definition: data });
          } catch (error) {
            this.aiSystem?.unregisterAI?.(entity);
            this.entityStore?.remove?.(entity);
            try { entity?.destroy?.(); } catch (destroyError) { /* best-effort rollback */ }
            errors.push({ kind, ref: placement.ref, placement, reason: 'onSpawnFailed', error });
            continue;
          }
        }
        entities.push(entity);
        if (placement.id) this.spawnedPlacementIds.add(placement.id);
        counts[kind]++;
        counts.total++;
      } catch (error) {
        errors.push({ kind, ref: placement.ref, placement, reason: 'spawnFailed', error });
      }
    }

    return { selector: normalized, matchedPlacements, counts, entities, errors };
  }

  _spawn(kind, data, placement) {
    const factory = this.entityFactory;
    const store = this.entityStore;
    if (kind === 'item') {
      if (data.worldProp) {
        const entity = factory?.createProp?.(data);
        if (entity) {
          entity.placementId = placement.id || entity.placementId || null;
          store?.add?.(entity);
        }
        return entity;
      }
      const item = { ...data, placementId: placement.id, x: data.position.x, y: data.position.y, picked: false };
      store?.addPickup?.(item);
      return item;
    }
    if (kind === 'equipment') {
      const equipment = { ...data, placementId: placement.id, x: data.position.x, y: data.position.y, picked: false };
      store?.addEquipmentItem?.(equipment);
      return equipment;
    }
    if (kind === 'enemy') {
      const entity = factory?.createEnemy?.({
        ...data,
        id: placement.id || data.id,
        contentId: data.id,
        templateId: data.templateId || placement.ref
      });
      if (!entity) return null;
      if (typeof store?.addEnemy === 'function') store.addEnemy(entity);
      else store?.add?.(entity);
      const aiType = data.aiType || 'aggressive';
      if (data.aiActive === false) this.aiSystem?.deactivateAI?.(entity, aiType);
      else this.aiSystem?.registerAI?.(entity, aiType);
      return entity;
    }
    if (kind === 'resourceNode') {
      const entity = factory?.createResourceNode?.({ ...data, id: placement.id });
      if (entity) store?.add?.(entity);
      return entity;
    }
    const methods = { npc: 'createNPC', building: 'createBuilding', vehicle: 'createVehicle' };
    const entityData = {
      ...data,
      id: placement.id || data.id,
      contentId: data.id,
      ...(kind === 'npc' ? { npcId: data.npcId || data.id } : {})
    };
    const entity = factory?.[methods[kind]]?.(entityData);
    if (entity) store?.add?.(entity);
    return entity;
  }

  _preloadEntityImage(kind, data, entity, placement) {
    const sprite = data.sprite || {};
    const stableId = data.imageId || data.assetId || sprite.imageId || sprite.assetId || null;
    const legacyKey = sprite.sheet || sprite.src || data.spriteSheet || null;
    const resolved = stableId
      ? this.assetManager?.resolveManifestAsset?.(stableId, '2d')
      : null;
    const key = resolved?.key || stableId || legacyKey;
    const source = resolved?.url || sprite.url || sprite.src || sprite.sheet || data.spriteSheet;
    if (!key || !source || typeof this.assetManager?.loadImage !== 'function') return;

    const present = typeof this.assetManager.hasImage === 'function'
      ? this.assetManager.hasImage(key)
      : this.assetManager.getAsset?.(key);
    if (present) return;
    const url = resolved?.url || (typeof this.assetManager.resolveAssetPath === 'function'
      ? this.assetManager.resolveAssetPath(source)
      : source);
    Promise.resolve(this.assetManager.loadImage(key, url)).catch(error => {
      const detail = { error, kind, key, url, entity, placement, definition: data };
      if (this.onEntityImageError) this.onEntityImageError(detail);
      if (kind === 'npc' && typeof this.onNpcImageError === 'function') {
        this.onNpcImageError(detail);
      }
    });
  }

  // 保留旧私有入口，供尚未迁移的扩展调用。
  _preloadNpcImage(data, entity, placement) {
    return this._preloadEntityImage('npc', data, entity, placement);
  }
}

export { mergeOverrides };
export default PlacementSpawner;