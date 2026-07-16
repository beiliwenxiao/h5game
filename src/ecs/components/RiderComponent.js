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
 * RiderComponent.js
 * 乘员组件 —— 记录该实体当前驾乘的载具与席位（§14.3 驾乘关系）
 *
 * authority: 'server'
 *
 * 挂在“上了载具”的单位实体上；下车时移除。VehicleSystem 用它把乘员
 * 位置同步到载具 seat.offset，并按 seat.role 路由玩家 intent（§14.5）。
 */

import { Component } from '../Component.js';

export class RiderComponent extends Component {
  /**
   * @param {Object} config
   * @param {string} config.vehicleId - 所乘载具实体 id
   * @param {string} config.seatId - 所占席位 id
   * @param {string} [config.role] - 席位角色（driver/gunner/passenger）
   * @param {Object} [config.savedController] - 上车前的控制者快照（下车恢复）
   */
  constructor(config = {}) {
    super('rider');
    this.vehicleId = config.vehicleId || null;
    this.seatId = config.seatId || null;
    this.role = config.role || null;
    this.savedController = config.savedController || null;
  }

  serialize() {
    return { vehicleId: this.vehicleId, seatId: this.seatId, role: this.role };
  }

  deserialize(data) {
    if (!data) return;
    this.vehicleId = data.vehicleId ?? this.vehicleId;
    this.seatId = data.seatId ?? this.seatId;
    this.role = data.role ?? this.role;
  }
}

export default RiderComponent;
