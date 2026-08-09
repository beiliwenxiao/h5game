/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { SnapshotManager } from './SnapshotManager.js';
import { LocalStorageAdapter } from './LocalStorageAdapter.js';

/** 最大手动存档位数，自动存档位不计入该上限。 */
export const MAX_MANUAL_SAVE_SLOTS = 100;
/** 自动存档固定保留最近三份。 */
export const AUTO_SAVE_SLOT_COUNT = 3;

/**
 * 多栏位存档服务：三个轮换自动存档位 + 最多 100 个手动存档位。
 * 业务层只提供 capture / validate / restore；原子校验和回滚继续由
 * SnapshotManager 与 LocalStorageAdapter 负责。
 */
export class SaveGameService {
  constructor({
    gameId = 'game',
    slotCount = MAX_MANUAL_SAVE_SLOTS,
    autoSlotCount = AUTO_SAVE_SLOT_COUNT,
    autoSlotPrefix = null,
    autoSlotId = 'autosave',
    migrateLegacyAutoSlot = true,
    storage = null,
    now = null
  } = {}) {
    this.gameId = gameId;
    this.slotCount = Math.min(MAX_MANUAL_SAVE_SLOTS, Math.max(1, slotCount | 0));
    this.autoSlotCount = Math.min(AUTO_SAVE_SLOT_COUNT, Math.max(1, autoSlotCount | 0));
    this.autoSlotPrefix = autoSlotPrefix || autoSlotId || 'autosave';
    this.storage = storage || new LocalStorageAdapter({ prefix: `yijian18:${gameId}:save` });
    this.manager = new SnapshotManager({ storage: this.storage, now: now || (() => Date.now()) });
    this._providerOff = null;
    if (migrateLegacyAutoSlot) this._migrateLegacyAutoSlot();
  }

  /** 切换当前运行时状态提供者；同一时刻只允许一个游戏状态参与者。 */
  setStateProvider(provider) {
    this._providerOff?.();
    this._providerOff = null;
    if (!provider) return;
    this._providerOff = this.manager.register('game', {
      required: true,
      snapshot: () => provider.capture(),
      validate: data => provider.validate ? provider.validate(data) : this._validateGameState(data),
      restore: data => provider.restore(data)
    });
  }

  _validateGameState(data) {
    const errors = [];
    if (!data || typeof data !== 'object') {
      errors.push({ code: 'missingField', path: '', message: '游戏状态为空' });
    } else if (!data.player || typeof data.player !== 'object') {
      errors.push({ code: 'missingField', path: 'player', message: '缺少玩家状态' });
    }
    return { ok: errors.length === 0, errors };
  }

  /** 手动槽位的存储标识。 */
  slotId(index) {
    const value = Number(index);
    if (!Number.isInteger(value) || value < 1 || value > this.slotCount) {
      throw new RangeError(`无效手动存档槽: ${index}`);
    }
    return `slot-${value}`;
  }

  /** 自动槽位的存储标识。 */
  autoSlotId(index) {
    const value = Number(index);
    if (!Number.isInteger(value) || value < 1 || value > this.autoSlotCount) {
      throw new RangeError(`无效自动存档槽: ${index}`);
    }
    return `${this.autoSlotPrefix}-${value}`;
  }

  /** 列出三个自动栏位，按栏位编号稳定排序。 */
  getAutoSlots() {
    const slots = [];
    for (let index = 1; index <= this.autoSlotCount; index++) {
      const id = this.autoSlotId(index);
      slots.push({ type: 'auto', index, id, exists: this.storage.has(id), info: this.storage.getInfo(id) });
    }
    return slots;
  }

  /** 兼容单自动槽查询；默认返回自动栏位 1。 */
  getAutoSlot(index = 1) {
    return this.getAutoSlots()[Number(index) - 1] || null;
  }

  /** 获取最新的自动存档摘要；无存档时返回 null。 */
  getLatestAutoSlot() {
    return this.getAutoSlots()
      .filter(slot => slot.exists)
      .sort((a, b) => (Number(b.info?.createdAt) || 0) - (Number(a.info?.createdAt) || 0))[0] || null;
  }

  /** 自动存档先填空位，全部占用后覆盖创建时间最早的一位。 */
  getNextAutoSlot() {
    const slots = this.getAutoSlots();
    return slots.find(slot => !slot.exists)
      || slots.slice().sort((a, b) => {
        const delta = (Number(a.info?.createdAt) || 0) - (Number(b.info?.createdAt) || 0);
        return delta || a.index - b.index;
      })[0];
  }

  /** 列出全部手动栏位（1 至 slotCount）。 */
  listSlots() {
    const slots = [];
    for (let index = 1; index <= this.slotCount; index++) {
      const id = this.slotId(index);
      slots.push({ type: 'manual', index, id, exists: this.storage.has(id), info: this.storage.getInfo(id) });
    }
    return slots;
  }

  hasAny() {
    return this.getAutoSlots().some(slot => slot.exists) || this.listSlots().some(slot => slot.exists);
  }

  /** 只读检查手动栏位：执行迁移与校验，但不修改任何运行状态。 */
  inspect(index) {
    return this._inspectSlot(this.slotId(index));
  }

  /** 只读检查自动栏位：执行迁移与校验，但不修改任何运行状态。 */
  inspectAuto(index = 1) {
    return this._inspectSlot(this.autoSlotId(index));
  }

  _inspectSlot(slot) {
    const loaded = this.storage.load(slot);
    if (!loaded || loaded.ok === false) {
      return { ok: false, errors: loaded?.errors || [{ code: 'loadFailed', path: slot, message: '读取存档失败' }] };
    }
    const raw = loaded.snapshot !== undefined ? loaded.snapshot : loaded;
    const migrated = this.manager.migrate(raw);
    if (!migrated.ok) return migrated;
    const validation = this.manager.validate(migrated.snapshot);
    if (!validation.ok) return validation;
    return { ok: true, errors: [], snapshot: migrated.snapshot };
  }

  /** 写入手动栏位。 */
  save(index, meta = {}) {
    return this.manager.save(this.slotId(index), { gameId: this.gameId, kind: 'manual', slot: Number(index), ...meta });
  }

  /** 读取手动栏位。 */
  load(index) {
    return this.manager.load(this.slotId(index));
  }

  clear(index) {
    return this.storage.remove(this.slotId(index));
  }

  /** 写入下一自动栏位，并返回本次实际覆盖的栏位信息。 */
  saveAuto(meta = {}) {
    const slot = this.getNextAutoSlot();
    const result = this.manager.save(slot.id, {
      gameId: this.gameId,
      kind: 'auto',
      autoSlot: slot.index,
      ...meta
    });
    return { ...result, autoSlotId: slot.id, autoSlotIndex: slot.index };
  }

  /** 读取指定自动栏位。 */
  loadAuto(index = 1) {
    return this.manager.load(this.autoSlotId(index));
  }

  /** 清理指定自动栏位；不传 index 时清理全部自动栏位。 */
  clearAuto(index = null) {
    if (index != null) return this.storage.remove(this.autoSlotId(index));
    return this.getAutoSlots().every(slot => this.storage.remove(slot.id));
  }

  /** 将旧单自动位迁移到第一个轮换自动位，避免已有进度丢失。 */
  _migrateLegacyAutoSlot() {
    const legacyId = this.autoSlotPrefix;
    if (!this.storage?.has?.(legacyId) || this.getAutoSlots().some(slot => slot.exists)) return;
    const loaded = this.storage.load(legacyId);
    if (!loaded.ok || !loaded.snapshot) return;
    const snapshot = {
      ...loaded.snapshot,
      meta: { ...(loaded.snapshot.meta || {}), kind: 'auto', autoSlot: 1, migratedLegacyAutoSlot: true }
    };
    const migrated = this.storage.save(this.autoSlotId(1), snapshot);
    if (migrated?.ok) this.storage.remove(legacyId);
  }
}

export default SaveGameService;