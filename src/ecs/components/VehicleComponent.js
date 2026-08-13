/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
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
    this.destroyed = this.hp <= 0;
    this.logistics = {
      odometer: Math.max(0, Number(config.logistics?.odometer) || 0),
      distanceSinceFeed: Math.max(0, Number(config.logistics?.distanceSinceFeed) || 0),
      foodConsumed: Math.max(0, Math.floor(Number(config.logistics?.foodConsumed) || 0)),
      travelBatchProgress: Math.max(0, Number(config.logistics?.travelBatchProgress) || 0),
      starved: config.logistics?.starved === true,
      ladderEntryDisabled: config.logistics?.ladderEntryDisabled === true,
      catapultAssembled: config.logistics?.catapultAssembled === true,
      catapultShots: Math.max(0, Math.floor(Number(config.logistics?.catapultShots) || 0))
    };

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
    const damage = Math.max(0, Number(amount) || 0);
    this.hp = Math.max(0, this.hp - damage);
    if (this.hp <= 0) this.destroyed = true;
    return { dead: this.destroyed, hp: this.hp };
  }

  serialize() {
    const seats = {};
    for (const [key, seat] of Object.entries(this.seats)) seats[key] = { riderId: seat.riderId };
    return {
      schemaVersion: 1,
      vehicleType: this.vehicleType,
      hp: this.hp,
      destroyed: this.destroyed,
      seats,
      logistics: { ...this.logistics }
    };
  }

  /** 严格校验运行态快照；定义态仍由内容配置创建，不从存档覆盖。 */
  validateSerialized(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.schemaVersion !== 1) {
      return { ok: false, code: 'invalidVehicleSnapshot', path: 'schemaVersion' };
    }
    if (typeof data.vehicleType !== 'string' || data.vehicleType !== this.vehicleType) {
      return { ok: false, code: 'vehicleTypeMismatch', path: 'vehicleType' };
    }
    if (!Number.isFinite(data.hp) || data.hp < 0 || data.hp > this.maxHp) {
      return { ok: false, code: 'invalidVehicleHp', path: 'hp' };
    }
    if (typeof data.destroyed !== 'boolean' || data.destroyed !== (data.hp === 0)) {
      return { ok: false, code: 'invalidVehicleDestroyedState', path: 'destroyed' };
    }

    const savedSeats = data.seats;
    const expectedSeatIds = Object.keys(this.seats).sort();
    const savedSeatIds = savedSeats && typeof savedSeats === 'object' && !Array.isArray(savedSeats)
      ? Object.keys(savedSeats).sort()
      : [];
    if (expectedSeatIds.length !== savedSeatIds.length
      || expectedSeatIds.some((seatId, index) => seatId !== savedSeatIds[index])) {
      return { ok: false, code: 'vehicleSeatDefinitionMismatch', path: 'seats' };
    }
    const riders = new Set();
    for (const seatId of expectedSeatIds) {
      const seat = savedSeats[seatId];
      const riderId = seat?.riderId;
      if (!seat || typeof seat !== 'object' || Array.isArray(seat)
        || (riderId !== null && (typeof riderId !== 'string' || riderId.length === 0))) {
        return { ok: false, code: 'invalidVehicleSeatState', path: `seats.${seatId}.riderId` };
      }
      if (riderId !== null && riders.has(riderId)) {
        return { ok: false, code: 'duplicateVehicleRider', path: `seats.${seatId}.riderId` };
      }
      if (riderId !== null) riders.add(riderId);
    }

    const logistics = data.logistics;
    if (!logistics || typeof logistics !== 'object' || Array.isArray(logistics)) {
      return { ok: false, code: 'invalidVehicleLogistics', path: 'logistics' };
    }
    for (const key of ['odometer', 'distanceSinceFeed', 'travelBatchProgress']) {
      if (!Number.isFinite(logistics[key]) || logistics[key] < 0) {
        return { ok: false, code: 'invalidVehicleLogistics', path: `logistics.${key}` };
      }
    }
    for (const key of ['foodConsumed', 'catapultShots']) {
      if (!Number.isInteger(logistics[key]) || logistics[key] < 0) {
        return { ok: false, code: 'invalidVehicleLogistics', path: `logistics.${key}` };
      }
    }
    for (const key of ['starved', 'ladderEntryDisabled', 'catapultAssembled']) {
      if (typeof logistics[key] !== 'boolean') {
        return { ok: false, code: 'invalidVehicleLogistics', path: `logistics.${key}` };
      }
    }
    return { ok: true };
  }

  deserialize(data) {
    const checked = this.validateSerialized(data);
    if (!checked.ok) return checked;
    const nextLogistics = { ...data.logistics };
    const nextRiders = Object.fromEntries(
      Object.entries(data.seats).map(([seatId, seat]) => [seatId, seat.riderId])
    );

    this.hp = data.hp;
    this.destroyed = data.destroyed;
    this.logistics = nextLogistics;
    for (const [seatId, riderId] of Object.entries(nextRiders)) {
      this.seats[seatId].riderId = riderId;
    }
    return { ok: true };
  }
}

export default VehicleComponent;
