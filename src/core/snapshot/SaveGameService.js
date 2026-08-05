/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { SnapshotManager } from './SnapshotManager.js';
import { LocalStorageAdapter } from './LocalStorageAdapter.js';

/**
 * 三槽存档服务。业务层只需提供 capture / restore，存储、校验和原子回滚
 * 继续复用 SnapshotManager 与 LocalStorageAdapter。
 */
export class SaveGameService {
  constructor({ gameId = 'game', slotCount = 3, storage = null, now = null } = {}) {
    this.gameId = gameId;
    this.slotCount = Math.max(1, slotCount | 0);
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

  slotId(index) {
    const value = Number(index);
    if (!Number.isInteger(value) || value < 1 || value > this.slotCount) {
      throw new RangeError(`无效存档槽: ${index}`);
    }
    return `slot-${value}`;
  }

  listSlots() {
    const slots = [];
    for (let index = 1; index <= this.slotCount; index++) {
      const id = this.slotId(index);
      slots.push({ index, id, exists: this.storage.has(id), info: this.storage.getInfo(id) });
    }
    return slots;
  }

  hasAny() {
    return this.listSlots().some(slot => slot.exists);
  }

  save(index, meta = {}) {
    return this.manager.save(this.slotId(index), { gameId: this.gameId, slot: index, ...meta });
  }

  load(index) {
    return this.manager.load(this.slotId(index));
  }

  clear(index) {
    return this.storage.remove(this.slotId(index));
  }
}

export default SaveGameService;