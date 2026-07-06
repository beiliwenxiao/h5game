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
 * ObjectiveComponent.js
 * 战场目标物组件 —— 标记胜负目标（§14.2 / §14.3）
 *
 * authority: 'server'  // 胜负目标达成是权威判定
 *
 * kind：
 *   'building'  绑定一个可摧毁建筑（如城门），destroyed → onDestroyed
 *   'reachZone' 绑定一个区域（如出口），有目标单位到达 → onReached
 *   'survive'   守住到计时结束 → onReached（用作守方胜利）
 *   'eliminate' 消灭指定阵营全部单位 → onReached
 * onXXX 是数据化动作序列（如 [{action:'battleWin',params:{team:'attacker'}}]），交 TriggerSystem 执行。
 */

import { Component } from '../Component.js';

export const ObjectiveKind = {
  BUILDING: 'building',
  REACH_ZONE: 'reachZone',
  SURVIVE: 'survive',
  ELIMINATE: 'eliminate'
};

export class ObjectiveComponent extends Component {
  /**
   * @param {Object} config
   * @param {string} config.objectiveId - 目标 id
   * @param {string} config.kind - building|reachZone|survive|eliminate
   * @param {string} [config.team] - 归属阵营（谁的目标）
   * @param {string} [config.region] - reachZone 时绑定的区域 id
   * @param {string} [config.targetTeam] - reachZone/eliminate 针对哪个阵营
   * @param {number} [config.surviveSeconds] - survive 时的目标秒数
   * @param {Array} [config.onReached] - 达成动作序列
   * @param {Array} [config.onDestroyed] - 摧毁动作序列
   */
  constructor(config = {}) {
    super('objective');
    this.objectiveId = config.objectiveId || null;
    this.kind = config.kind || ObjectiveKind.BUILDING;
    this.team = config.team || null;
    this.region = config.region || null;
    this.targetTeam = config.targetTeam || null;
    this.surviveSeconds = config.surviveSeconds || 0;
    this.onReached = config.onReached || [];
    this.onDestroyed = config.onDestroyed || [];
    this.completed = false;
    this._elapsed = 0;
  }

  markCompleted() {
    this.completed = true;
  }

  isCompleted() {
    return this.completed;
  }

  /** survive 类型累计计时；返回是否达标 */
  tickSurvive(dt) {
    if (this.kind !== ObjectiveKind.SURVIVE || this.completed) return false;
    this._elapsed += dt;
    return this._elapsed >= this.surviveSeconds;
  }

  serialize() {
    return { objectiveId: this.objectiveId, completed: this.completed, elapsed: this._elapsed };
  }

  deserialize(data) {
    if (!data) return;
    this.completed = !!data.completed;
    this._elapsed = data.elapsed || 0;
  }
}

export default ObjectiveComponent;
