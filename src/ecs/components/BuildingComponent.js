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
 * BuildingComponent.js
 * 建筑组件 —— 城墙/城门/箭塔/兵营等（§14.3）
 *
 * authority: 'server'  // 建筑血量/摧毁是权威状态
 *
 * 特点：可摧毁（有独立 HP，也可复用 StatsComponent）、占地碰撞（矩形/圆）、
 * 可被玩家操作（如箭塔=可控建筑，配合 ControllerComponent + SeatComponent）。
 * 摧毁时触发 onDestroyed（数据化动作序列，交 TriggerSystem 执行）。
 */

import { Component } from '../Component.js';

/** 建筑类型 */
export const BuildingType = {
  WALL: 'wall',        // 城墙
  GATE: 'gate',        // 城门
  TOWER: 'tower',      // 箭塔（可控）
  BARRACKS: 'barracks',// 兵营（产兵）
  GENERIC: 'generic'
};

export class BuildingComponent extends Component {
  /**
   * @param {Object} config
   * @param {string} config.buildingType - wall|gate|tower|barracks|generic
   * @param {number} config.maxHp - 最大血量
   * @param {number} [config.hp] - 当前血量（默认满）
   * @param {string} [config.team] - 所属阵营
   * @param {{w:number,h:number}} [config.footprint] - 占地矩形（碰撞）
   * @param {number} [config.colliderRadius] - 占地半径（圆形碰撞，与 footprint 二选一）
   * @param {boolean} [config.controllable] - 是否可被玩家操作（如箭塔）
   * @param {Array} [config.onDestroyed] - 摧毁时执行的动作序列（数据化）
   */
  constructor(config = {}) {
    super('building');
    this.buildingType = config.buildingType || BuildingType.GENERIC;
    this.maxHp = config.maxHp != null ? config.maxHp : 1000;
    this.hp = config.hp != null ? config.hp : this.maxHp;
    this.team = config.team || null;
    this.footprint = config.footprint || null;
    this.colliderRadius = config.colliderRadius || 0;
    this.controllable = !!config.controllable;
    this.onDestroyed = config.onDestroyed || [];
    this.destroyed = false;
  }

  /**
   * 承受伤害（纯状态改动；演出/触发由外部结算，§13 约定1）
   * @param {number} amount
   * @returns {{dead:boolean, hp:number}}
   */
  takeDamage(amount) {
    if (this.destroyed) return { dead: true, hp: 0 };
    this.hp = Math.max(0, this.hp - (amount || 0));
    if (this.hp <= 0) this.destroyed = true;
    return { dead: this.destroyed, hp: this.hp };
  }

  isAlive() {
    return !this.destroyed && this.hp > 0;
  }

  getHpRatio() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  serialize() {
    return {
      buildingType: this.buildingType,
      hp: this.hp,
      maxHp: this.maxHp,
      team: this.team,
      destroyed: this.destroyed
    };
  }

  deserialize(data) {
    if (!data) return;
    this.hp = data.hp != null ? data.hp : this.hp;
    this.maxHp = data.maxHp != null ? data.maxHp : this.maxHp;
    this.team = data.team ?? this.team;
    this.destroyed = !!data.destroyed;
  }
}

export default BuildingComponent;
