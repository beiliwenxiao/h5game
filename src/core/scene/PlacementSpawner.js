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
  vehicle: 'vehicles'
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

/** 将分组放置点与内容注册表定义组合为运行时对象。 */
export class PlacementSpawner {
  constructor({
    entityFactory = null,
    entityStore = null,
    aiSystem = null,
    assetManager = null,
    onNpcImageError = null,
    onSpawn = null
  } = {}) {
    this.entityFactory = entityFactory;
    this.entityStore = entityStore;
    this.aiSystem = aiSystem;
    this.assetManager = assetManager;
    this.onNpcImageError = onNpcImageError;
    this.onSpawn = onSpawn;
  }

  spawnGroup({ group, placements = [], registries = {} } = {}) {
    const counts = { item: 0, equipment: 0, enemy: 0, npc: 0, building: 0, vehicle: 0, total: 0 };
    const entities = [];
    const errors = [];
    if (group == null) return { group, counts, entities, errors };

    for (const placement of placements) {
      if (!placement || placement.group !== group) continue;
      const kind = placement.kind;
      if (!REGISTRY_KEYS[kind]) continue;
      const definition = registryGet(registries, kind, placement.ref);
      if (!definition) {
        errors.push({ kind, ref: placement.ref, placement, reason: 'definitionNotFound' });
        continue;
      }

      try {
        const data = mergeOverrides(definition, placement.overrides);
        data.position = { x: Number(placement.x) || 0, y: Number(placement.y) || 0 };
        const entity = this._spawn(kind, data, placement);
        if (!entity) {
          errors.push({ kind, ref: placement.ref, placement, reason: 'factoryUnavailable' });
          continue;
        }
        entities.push(entity);
        counts[kind]++;
        counts.total++;
        if (kind === 'npc') this._preloadNpcImage(data, entity, placement);
        if (typeof this.onSpawn === 'function') {
          try {
            this.onSpawn({ entity, kind, group, placement, definition: data });
          } catch (error) {
            errors.push({ kind, ref: placement.ref, placement, reason: 'onSpawnFailed', error });
          }
        }
      } catch (error) {
        errors.push({ kind, ref: placement.ref, placement, reason: 'spawnFailed', error });
      }
    }

    return { group, counts, entities, errors };
  }

  _spawn(kind, data, placement) {
    const factory = this.entityFactory;
    const store = this.entityStore;
    if (kind === 'item') {
      if (data.worldProp) {
        const entity = factory?.createProp?.(data);
        if (entity) store?.add?.(entity);
        return entity;
      }
      const item = { ...data, x: data.position.x, y: data.position.y, picked: false };
      store?.addPickup?.(item);
      return item;
    }
    if (kind === 'equipment') {
      const equipment = { ...data, x: data.position.x, y: data.position.y, picked: false };
      store?.addEquipmentItem?.(equipment);
      return equipment;
    }
    if (kind === 'enemy') {
      const entity = factory?.createEnemy?.({ ...data, templateId: data.templateId || placement.ref });
      if (!entity) return null;
      if (typeof store?.addEnemy === 'function') store.addEnemy(entity);
      else store?.add?.(entity);
      this.aiSystem?.registerAI?.(entity, data.aiType || 'aggressive');
      return entity;
    }
    const methods = { npc: 'createNPC', building: 'createBuilding', vehicle: 'createVehicle' };
    const entity = factory?.[methods[kind]]?.(data);
    if (entity) store?.add?.(entity);
    return entity;
  }

  _preloadNpcImage(data, entity, placement) {
    const sprite = data.sprite || {};
    const key = sprite.sheet || sprite.src || data.spriteSheet;
    if (!key || typeof this.assetManager?.loadImage !== 'function') return;
    const present = typeof this.assetManager.hasImage === 'function'
      ? this.assetManager.hasImage(key)
      : this.assetManager.getAsset?.(key);
    if (present) return;
    const source = sprite.url || sprite.src || sprite.sheet || data.spriteSheet;
    const url = typeof this.assetManager.resolveAssetPath === 'function'
      ? this.assetManager.resolveAssetPath(source)
      : source;
    Promise.resolve(this.assetManager.loadImage(key, url)).catch(error => {
      if (typeof this.onNpcImageError === 'function') {
        this.onNpcImageError({ error, key, url, entity, placement, definition: data });
      }
    });
  }
}

export { mergeOverrides };
export default PlacementSpawner;