/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * VehicleComponent.js
 * 载具组件 —— 战马/战车/八床弩等（§14.3）
 *
 * authority: 'server'  // 载具血量/席位占用是权威状态
 *
 * 席位（seats）各有角色：driver（驾驶=移动）/ gunner（操作武器=开火）等。
 * 每个席位可被不同玩家占用 → 一辆战车 A 驾驶 B 操弩，多人协作（§14.4 席位级控制）。
 * 移动仍走 MovementSystem（用载具 speed/turnRate），攻击仍走 CombatSystem（用载具武器），
 * VehicleSystem 只管驾乘关系与 intent 路由（§14.5）。
 */

import { Component } from '../Component.js';

/** 席位角色 */
export const SeatRole = {
  DRIVER: 'driver',
  GUNNER: 'gunner',
  PASSENGER: 'passenger'
};

export class VehicleComponent extends Component {
  /**
   * @param {Object} config
   * @param {string} config.vehicleType - chariot|horse|ballista...
   * @param {number} [config.speed] - 载具移动速度
   * @param {number} [config.turnRate] - 转向速率
   * @param {number} [config.maxHp]
   * @param {number} [config.hp]
   * @param {Array<Object>} config.seats - [{id,role,weapon?,offset:[dx,dy]}]
   * @param {string} [config.onDestroyed] - 'eject' 摧毁时乘员下车+受伤
   */
  constructor(config = {}) {
    super('vehicle');
    this.vehicleType = config.vehicleType || 'chariot';
    this.speed = config.speed != null ? config.speed : 120;
    this.turnRate = config.turnRate != null ? config.turnRate : 3;
    this.maxHp = config.maxHp != null ? config.maxHp : 500;
    this.hp = config.hp != null ? config.hp : this.maxHp;
    this.onDestroyed = config.onDestroyed || 'eject';
    this.destroyed = false;

    // 席位：id -> { id, role, weapon, offset:[dx,dy], riderId:null }
    this.seats = {};
    (config.seats || [{ id: 'drv', role: SeatRole.DRIVER, offset: [0, 0] }]).forEach(s => {
      this.seats[s.id] = {
        id: s.id,
        role: s.role || SeatRole.PASSENGER,
        weapon: s.weapon || null,
        offset: s.offset || [0, 0],
        riderId: null
      };
    });
  }

  /** 找一个空席位（优先 driver） */
  findFreeSeat(preferRole = null) {
    if (preferRole) {
      for (const s of Object.values(this.seats)) {
        if (!s.riderId && s.role === preferRole) return s;
      }
    }
    for (const s of Object.values(this.seats)) {
      if (!s.riderId) return s;
    }
    return null;
  }

  getSeat(seatId) {
    return this.seats[seatId] || null;
  }

  /** 席位落座 */
  occupySeat(seatId, riderId) {
    const seat = this.seats[seatId];
    if (!seat || seat.riderId) return false;
    seat.riderId = riderId;
    return true;
  }

  /** 释放席位（按 riderId 或 seatId） */
  releaseSeat(riderId) {
    for (const s of Object.values(this.seats)) {
      if (s.riderId === riderId) { s.riderId = null; return s; }
    }
    return null;
  }

  /** 是否有驾驶员 */
  hasDriver() {
    return Object.values(this.seats).some(s => s.role === SeatRole.DRIVER && s.riderId);
  }

  /** 当前所有乘员 riderId */
  getRiders() {
    return Object.values(this.seats).filter(s => s.riderId).map(s => s.riderId);
  }

  takeDamage(amount) {
    if (this.destroyed) return { dead: true, hp: 0 };
    this.hp = Math.max(0, this.hp - (amount || 0));
    if (this.hp <= 0) this.destroyed = true;
    return { dead: this.destroyed, hp: this.hp };
  }

  serialize() {
    const seats = {};
    for (const [k, s] of Object.entries(this.seats)) seats[k] = { riderId: s.riderId };
    return { vehicleType: this.vehicleType, hp: this.hp, destroyed: this.destroyed, seats };
  }

  deserialize(data) {
    if (!data) return;
    this.hp = data.hp != null ? data.hp : this.hp;
    this.destroyed = !!data.destroyed;
    if (data.seats) {
      for (const [k, v] of Object.entries(data.seats)) {
        if (this.seats[k]) this.seats[k].riderId = v.riderId || null;
      }
    }
  }
}

export default VehicleComponent;
