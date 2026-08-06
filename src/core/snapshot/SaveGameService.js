/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { SnapshotManager } from './SnapshotManager.js';
import { LocalStorageAdapter } from './LocalStorageAdapter.js';

/** 最大手动存档位数，自动存档位不计入该上限。 */
export const MAX_MANUAL_SAVE_SLOTS = 100;

/**
 * 多栏位存档服务：一个独立自动存档位 + 最多 100 个手动存档位。
 * 业务层只提供 capture / validate / restore；原子校验和回滚继续由
 * SnapshotManager 与 LocalStorageAdapter 负责。
 */
export class SaveGameService {
  constructor({ gameId = 'game', slotCount = MAX_MANUAL_SAVE_SLOTS, autoSlotId = 'autosave', storage = null, now = null } = {}) {
    this.gameId = gameId;
    this.slotCount = Math.min(MAX_MANUAL_SAVE_SLOTS, Math.max(1, slotCount | 0));
    this.autoSlotId = autoSlotId || 'autosave';
    this.storage = storage || new LocalStorageAdapter({ prefix: `yijian18:${gameId}:save` });
    this.manager = new SnapshotManager({ storage: this.storage, now: now || (() => Date.now()) });
    this._providerOff = null;
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

  /** 独立自动存档槽的摘要，不会与手动栏位混用。 */
  getAutoSlot() {
    return {
      type: 'auto',
      id: this.autoSlotId,
      exists: this.storage.has(this.autoSlotId),
      info: this.storage.getInfo(this.autoSlotId)
    };
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
    return this.getAutoSlot().exists || this.listSlots().some(slot => slot.exists);
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

  /** 写入独立自动存档位。 */
  saveAuto(meta = {}) {
    return this.manager.save(this.autoSlotId, { gameId: this.gameId, kind: 'auto', ...meta });
  }

  /** 读取独立自动存档位。 */
  loadAuto() {
    return this.manager.load(this.autoSlotId);
  }

  clearAuto() {
    return this.storage.remove(this.autoSlotId);
  }
}

export default SaveGameService;