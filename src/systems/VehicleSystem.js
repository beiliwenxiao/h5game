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
 * VehicleSystem.js
 * 载具系统（§14.5）—— 只管驾乘关系与 intent 路由，不重写移动/战斗
 *
 * authority: 'server'  // 上/下载具、席位占用是权威状态
 *
 * 职责：
 *   mount(rider, vehicle, seatId)   上车：占席位 + 转移控制权 + 附着
 *   dismount(rider)                 下车：释放席位 + 恢复控制权 + 落地
 *   update(dt)                      同步乘员到 seat.offset；空载具静止
 *   onVehicleDestroyed(vehicle)     摧毁时 eject 所有乘员 + 受伤
 *   routeIntent(playerId, intent)   按席位角色路由 intent 到移动/武器
 *
 * 移动仍走 MovementSystem（用载具 speed/turnRate），攻击仍走 CombatSystem（用载具武器）。
 * 依赖注入（§13 约定6：可注入）：config.resolveEntity(id) 用于按 id 找实体。
 */

import { RiderComponent } from '../ecs/components/RiderComponent.js';
import { SeatRole } from '../ecs/components/VehicleComponent.js';
import { ControllerKind } from '../ecs/components/ControllerComponent.js';

export class VehicleSystem {
  /**
   * @param {Object} config
   * @param {Function} [config.resolveEntity] - (id) => Entity，按实体 id 查找
   * @param {Function} [config.onEvent] - (evt, data) => void，演出层订阅（§13 约定1）
   */
  constructor(config = {}) {
    this.resolveEntity = config.resolveEntity || (() => null);
    this.onEvent = config.onEvent || (() => {});
    // 已注册的载具实体（可选，update 遍历用）
    this.vehicles = new Set();
  }

  /** 注册/注销载具（供 update 遍历同步乘员位置） */
  registerVehicle(vehicle) {
    if (vehicle && vehicle.hasComponent && vehicle.hasComponent('vehicle')) this.vehicles.add(vehicle);
  }
  unregisterVehicle(vehicle) {
    this.vehicles.delete(vehicle);
  }

  /**
   * 上车
   * @param {Entity} rider - 乘员实体
   * @param {Entity} vehicle - 载具实体
   * @param {string} [seatId] - 指定席位；不传则自动找空位（优先 driver）
   * @returns {boolean} 是否成功
   */
  mount(rider, vehicle, seatId = null) {
    if (!rider || !vehicle) return false;
    const vc = vehicle.getComponent('vehicle');
    if (!vc || vc.destroyed) return false;
    if (rider.hasComponent('rider')) return false; // 已在车上

    let seat = seatId ? vc.getSeat(seatId) : vc.findFreeSeat(SeatRole.DRIVER);
    if (!seat || seat.riderId) {
      if (seatId) return false;
      seat = vc.findFreeSeat();
    }
    if (!seat || seat.riderId) return false;

    if (!vc.occupySeat(seat.id, rider.id)) return false;

    // 保存乘员上车前控制者快照，转移控制权到载具席位
    const riderCtrl = rider.getComponent('controller');
    const savedController = riderCtrl ? riderCtrl.serialize() : null;

    rider.addComponent(new RiderComponent({
      vehicleId: vehicle.id,
      seatId: seat.id,
      role: seat.role,
      savedController
    }));

    // 席位控制者 = 乘员的控制者（多人时各席位独立）
    if (riderCtrl) {
      const vSeatCtrl = vehicle.getComponent('controller');
      // driver 席位掌管载具移动：把载具控制者设为该乘员
      if (seat.role === SeatRole.DRIVER && vSeatCtrl) {
        vSeatCtrl.setController(riderCtrl.kind, riderCtrl.playerId);
      }
    }

    // 乘员移动交由载具接管：暂停其自身移动
    const rm = rider.getComponent('movement');
    if (rm) rm.enabled = false;

    this.onEvent('mount', { riderId: rider.id, vehicleId: vehicle.id, seatId: seat.id, role: seat.role });
    return true;
  }

  /**
   * 下车
   * @param {Entity} rider - 乘员实体
   * @returns {boolean}
   */
  dismount(rider) {
    if (!rider) return false;
    const rc = rider.getComponent('rider');
    if (!rc) return false;

    const vehicle = this.resolveEntity(rc.vehicleId);
    if (vehicle) {
      const vc = vehicle.getComponent('vehicle');
      if (vc) {
        const seat = vc.releaseSeat(rider.id);
        // 若离开的是 driver 席位，载具控制权归还 AI
        if (seat && seat.role === SeatRole.DRIVER) {
          const vSeatCtrl = vehicle.getComponent('controller');
          if (vSeatCtrl) vSeatCtrl.setController(ControllerKind.AI, null);
        }
      }
    }

    // 恢复乘员自身控制者与移动
    const riderCtrl = rider.getComponent('controller');
    if (riderCtrl && rc.savedController) riderCtrl.deserialize(rc.savedController);
    const rm = rider.getComponent('movement');
    if (rm) rm.enabled = true;

    // 落地到载具旁
    this._placeBeside(rider, vehicle);

    rider.removeComponent('rider');
    this.onEvent('dismount', { riderId: rider.id, vehicleId: rc.vehicleId });
    return true;
  }

  /**
   * 每帧同步：把乘员实体位置贴到载具席位偏移处
   * @param {number} dt
   */
  update(dt) {
    for (const vehicle of this.vehicles) {
      const vc = vehicle.getComponent('vehicle');
      const vt = vehicle.getComponent('transform');
      if (!vc || !vt) continue;
      if (vc.destroyed) { this.onVehicleDestroyed(vehicle); continue; }

      const angle = vt.rotation || 0;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const seat of Object.values(vc.seats)) {
        if (!seat.riderId) continue;
        const rider = this.resolveEntity(seat.riderId);
        if (!rider) continue;
        const rt = rider.getComponent('transform');
        if (!rt) continue;
        const [ox, oy] = seat.offset || [0, 0];
        // 按载具朝向旋转偏移
        const wx = vt.position.x + (ox * cos - oy * sin);
        const wy = vt.position.y + (ox * sin + oy * cos);
        rt.setPosition(wx, wy);
      }
    }
  }

  /**
   * 载具摧毁：弹出所有乘员并受伤（onDestroyed='eject'）
   * @param {Entity} vehicle
   */
  onVehicleDestroyed(vehicle) {
    const vc = vehicle.getComponent('vehicle');
    if (!vc) return;
    const riders = vc.getRiders();
    for (const riderId of riders) {
      const rider = this.resolveEntity(riderId);
      if (!rider) continue;
      this.dismount(rider);
      // eject 受伤（纯状态；演出订阅事件）
      const stats = rider.getComponent('stats');
      if (stats && typeof stats.takeDamage === 'function') {
        stats.takeDamage(Math.round((vc.maxHp || 100) * 0.1));
      }
    }
    this.vehicles.delete(vehicle);
    this.onEvent('vehicleDestroyed', { vehicleId: vehicle.id });
  }

  /**
   * 按席位角色路由玩家 intent（§14.5）
   * @param {Entity} rider - 发出 intent 的乘员
   * @param {Object} intent - { type:'move'|'attack'|'useSkill', ... }
   * @returns {{target:'vehicle'|'self', role:string, intent:Object}|null}
   */
  routeIntent(rider, intent) {
    if (!rider) return null;
    const rc = rider.getComponent('rider');
    if (!rc) return { target: 'self', role: null, intent }; // 未在车上，作用于自身

    const vehicle = this.resolveEntity(rc.vehicleId);
    if (!vehicle) return { target: 'self', role: null, intent };

    // driver：move 作用于载具；gunner：attack/useSkill 作用于载具武器
    if (rc.role === SeatRole.DRIVER && intent.type === 'move') {
      return { target: 'vehicle', role: rc.role, intent, vehicle };
    }
    if (rc.role === SeatRole.GUNNER && (intent.type === 'attack' || intent.type === 'useSkill')) {
      return { target: 'vehicle', role: rc.role, intent, vehicle };
    }
    // 其它 intent 交给自身（乘客/无对应角色）
    return { target: 'self', role: rc.role, intent };
  }

  /** 把乘员落在载具旁一点 */
  _placeBeside(rider, vehicle) {
    const rt = rider && rider.getComponent('transform');
    const vt = vehicle && vehicle.getComponent('transform');
    if (!rt || !vt) return;
    rt.setPosition(vt.position.x + 40, vt.position.y);
  }
}

export default VehicleSystem;
