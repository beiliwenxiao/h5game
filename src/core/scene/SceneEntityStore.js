/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

function addUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function removeFrom(list, value) {
  let removed = false;
  for (let index = list.length - 1; index >= 0; index--) {
    if (list[index] === value) {
      list.splice(index, 1);
      removed = true;
    }
  }
  return removed;
}

/** 场景实体集合的唯一所有者；所有操作均原地修改稳定数组引用。 */
export class SceneEntityStore {
  constructor() {
    Object.defineProperties(this, {
      all: { value: [], enumerable: true },
      enemies: { value: [], enumerable: true },
      pickups: { value: [], enumerable: true },
      equipmentItems: { value: [], enumerable: true },
      _byId: { value: new Map(), enumerable: false }
    });
    this.player = null;
  }

  getById(id) {
    return id == null ? null : (this._byId.get(String(id)) || null);
  }

  _index(entity) {
    if (entity?.id != null && String(entity.id)) this._byId.set(String(entity.id), entity);
  }

  _unindex(entity) {
    if (entity?.id == null) return;
    const id = String(entity.id);
    if (this._byId.get(id) !== entity) return;
    const replacement = this.all.findLast(candidate => candidate?.id != null && String(candidate.id) === id);
    if (replacement) this._byId.set(id, replacement);
    else this._byId.delete(id);
  }

  add(entity) {
    if (!entity) return null;
    addUnique(this.all, entity);
    this._index(entity);
    if (entity.type === 'player') this.player = entity;
    return entity;
  }

  addEnemy(entity) {
    if (!entity) return null;
    this.add(entity);
    addUnique(this.enemies, entity);
    return entity;
  }

  addPickup(item) {
    if (!item) return null;
    addUnique(this.pickups, item);
    return item;
  }

  addEquipmentItem(item) {
    if (!item) return null;
    addUnique(this.equipmentItems, item);
    return item;
  }

  remove(entity) {
    if (!entity) return false;
    const removed = removeFrom(this.all, entity);
    const removedEnemy = removeFrom(this.enemies, entity);
    const removedPickup = removeFrom(this.pickups, entity);
    const removedEquipment = removeFrom(this.equipmentItems, entity);
    if (removed) this._unindex(entity);
    if (this.player === entity) this.player = null;
    return removed || removedEnemy || removedPickup || removedEquipment;
  }

  removeMany(values) {
    const targets = new Set(values || []);
    if (targets.size === 0) return [];
    const removed = [];
    for (const list of [this.all, this.enemies, this.pickups, this.equipmentItems]) {
      for (let index = list.length - 1; index >= 0; index--) {
        if (targets.has(list[index])) {
          if (!removed.includes(list[index])) removed.push(list[index]);
          list.splice(index, 1);
        }
      }
    }
    for (const entity of removed) this._unindex(entity);
    if (targets.has(this.player)) this.player = null;
    return removed;
  }

  removeDead(predicate = entity => entity?.isDead === true) {
    return this.removeMany(this.all.filter(predicate));
  }

  destroyAll() {
    const values = new Set([...this.all, ...this.enemies, ...this.pickups, ...this.equipmentItems]);
    if (this.player) values.add(this.player);
    for (const value of values) {
      if (typeof value?.destroy !== 'function') continue;
      try {
        value.destroy();
      } catch (error) {
        console.warn('SceneEntityStore: entity destroy failed', error);
      }
    }
    this.clear();
  }

  clear() {
    this.all.length = 0;
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.equipmentItems.length = 0;
    this._byId.clear();
    this.player = null;
  }
}

export default SceneEntityStore;