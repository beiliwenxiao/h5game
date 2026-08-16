/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

/** DeathDrop 的场景列表捕获、纯校验和 draft-first 原子替换恢复。 */
export class SceneDeathDropRuntime {
  constructor({ itemRuntimeFactory, entityStore, getPresentation = null } = {}) {
    if (!itemRuntimeFactory || !entityStore) {
      throw new TypeError('SceneDeathDropRuntime requires ItemRuntimeFactory and entityStore');
    }
    this.itemRuntimeFactory = itemRuntimeFactory;
    this.entityStore = entityStore;
    this.getPresentation = typeof getPresentation === 'function' ? getPresentation : () => ({});
  }

  capture(predicate = null) {
    return this._getCurrentDrops()
      .filter(entity => typeof predicate !== 'function' || predicate(entity) === true)
      .map(entity => ({
        id: entity.id,
        position: { ...entity.getComponent('transform').position },
        state: entity.getComponent('deathDrop').serialize()
      }));
  }

  validate(entries) {
    if (entries == null) return { ok: true, errors: [] };
    if (!Array.isArray(entries)) {
      return this._failure('invalidDeathDrops', 'deathDrops', '死亡掉落列表无效');
    }
    const ids = new Set();
    const errors = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry?.id || ids.has(entry.id)) {
        errors.push({ code: 'invalidDeathDropState', path: `deathDrops[${index}].id`, message: '死亡掉落 ID 无效或重复' });
        continue;
      }
      ids.add(entry.id);
      const checked = this.itemRuntimeFactory.validateDeathDropProjection({
        entityId: entry.id,
        deathId: entry.state?.deathId,
        stacks: entry.state?.stacks,
        transform: entry.position
      }, `deathDrops[${index}]`);
      errors.push(...checked.errors);
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true, errors: [] };
  }

  /**
   * 先创建全部未注册草稿，再替换 selectCurrent 选中的旧掉落。
   * 创建阶段失败时旧状态不变；提交阶段失败时恢复旧实体的集合注册。
   */
  restore(entries = [], { selectCurrent = null } = {}) {
    const checked = this.validate(entries);
    if (!checked.ok) return checked;

    let current;
    try {
      current = this._getCurrentDrops()
        .filter(entity => typeof selectCurrent !== 'function' || selectCurrent(entity) === true);
    } catch (error) {
      return this._failure('deathDropSelectionFailed', 'deathDrops', error?.message || '死亡掉落替换范围解析失败');
    }

    const selected = new Set(current);
    const retainedEntities = new Set([
      ...(this.entityStore.all || []),
      ...(this.entityStore.enemies || []),
      ...(this.entityStore.pickups || []),
      ...(this.entityStore.equipmentItems || [])
    ]);
    const retainedIds = new Set([...retainedEntities]
      .filter(entity => !selected.has(entity) && entity?.id)
      .map(entity => entity.id));
    const conflicting = entries.find(entry => retainedIds.has(entry.id));
    if (conflicting) {
      return this._failure(
        'deathDropIdConflict', `deathDrops.${conflicting.id}`, '死亡掉落 ID 与保留实体冲突'
      );
    }

    const drafts = [];
    try {
      for (const entry of entries) {
        const drop = this.itemRuntimeFactory.createDeathDropProjection({
          entityId: entry.id,
          deathId: entry.state.deathId,
          stacks: clone(entry.state.stacks),
          transform: clone(entry.position),
          presentation: this.getPresentation(entry)
        });
        if (!drop) throw new Error(`DeathDrop draft was not created: ${entry.id}`);
        drafts.push(drop);
      }
    } catch (error) {
      this._destroyMany(drafts);
      return this._failure(
        'deathDropRestoreFailed',
        `deathDrops.${entries[drafts.length]?.id || drafts.length}`,
        error?.message || '死亡掉落草稿重建失败'
      );
    }

    const registrations = current.map(entity => ({
      entity,
      all: this.entityStore.all.includes(entity),
      enemy: this.entityStore.enemies.includes(entity),
      pickup: this.entityStore.pickups.includes(entity),
      equipment: this.entityStore.equipmentItems.includes(entity)
    }));
    try {
      this.entityStore.removeMany(current);
      for (const draft of drafts) {
        this.entityStore.add(draft);
        this.entityStore.addEquipmentItem(draft);
      }
    } catch (error) {
      this.entityStore.removeMany(drafts);
      let rollbackFailed = false;
      try {
        for (const item of registrations) this._restoreRegistration(item);
      } catch (rollbackError) {
        rollbackFailed = true;
      }
      this._destroyMany(drafts);
      return this._failure(
        rollbackFailed ? 'deathDropRollbackFailed' : 'deathDropCommitFailed',
        'deathDrops',
        rollbackFailed ? '死亡掉落替换失败且旧注册恢复失败' : (error?.message || '死亡掉落替换提交失败')
      );
    }

    this._destroyMany(current);
    return { ok: true, errors: [] };
  }

  _getCurrentDrops() {
    return this.entityStore.equipmentItems
      .filter(entity => entity?.getComponent?.('deathDrop'));
  }

  _restoreRegistration(item) {
    if (item.all) this.entityStore.add(item.entity);
    if (item.enemy) this.entityStore.addEnemy(item.entity);
    if (item.pickup) this.entityStore.addPickup(item.entity);
    if (item.equipment) this.entityStore.addEquipmentItem(item.entity);
  }

  _destroyMany(values) {
    for (const value of values) {
      try { value?.destroy?.(); } catch (error) { /* best-effort lifecycle cleanup */ }
    }
  }

  _failure(code, path, message) {
    return { ok: false, errors: [{ code, path, message }] };
  }
}

export default SceneDeathDropRuntime;