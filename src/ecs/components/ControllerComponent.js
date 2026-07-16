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
 * ControllerComponent.js
 * 控制权组件 —— 标记某个可控实体（单位/建筑/载具/席位）由谁操控（§14.4）
 *
 * authority: 'server'  // 控制权分配将来由服务器裁决；单机全部本地
 *
 * 网络红利（§13）：单机时 kind 只有 'ai' 与 'localPlayer'；
 * 联网时把部分 'ai' 换成 'remotePlayer' 即可，战斗/移动逻辑不变。
 * 载具席位各自持有 ControllerComponent（挂在 seat 上），实现多人协作驾乘。
 */

import { Component } from '../Component.js';

/** 控制者类型 */
export const ControllerKind = {
  AI: 'ai',
  LOCAL_PLAYER: 'localPlayer',
  REMOTE_PLAYER: 'remotePlayer'
};

export class ControllerComponent extends Component {
  /**
   * @param {Object} config
   * @param {'ai'|'localPlayer'|'remotePlayer'} config.kind - 控制者类型
   * @param {string} [config.playerId] - 玩家 ID（localPlayer/remotePlayer 时）
   * @param {string} [config.team] - 所属阵营 id（配合 BattleConfig.teams）
   */
  constructor(config = {}) {
    super('controller');
    this.kind = config.kind || ControllerKind.AI;
    this.playerId = config.playerId || null;
    this.team = config.team || null;
    // 待路由的 intent 队列（本地立即消费；联网时改为发服务器）
    this.intents = [];
  }

  isPlayer() {
    return this.kind === ControllerKind.LOCAL_PLAYER || this.kind === ControllerKind.REMOTE_PLAYER;
  }

  isLocalPlayer() {
    return this.kind === ControllerKind.LOCAL_PLAYER;
  }

  isAI() {
    return this.kind === ControllerKind.AI;
  }

  /** 设置控制者（转移控制权，如上/下载具） */
  setController(kind, playerId = null) {
    this.kind = kind;
    this.playerId = playerId;
  }

  /** 压入一个 intent（§13 约定2：输入 Intent 化） */
  pushIntent(intent) {
    if (intent) this.intents.push(intent);
  }

  /** 取出并清空 intent 队列 */
  drainIntents() {
    const list = this.intents;
    this.intents = [];
    return list;
  }

  /** 序列化（§13 约定3） */
  serialize() {
    return { kind: this.kind, playerId: this.playerId, team: this.team };
  }

  deserialize(data) {
    if (!data) return;
    this.kind = data.kind || this.kind;
    this.playerId = data.playerId ?? this.playerId;
    this.team = data.team ?? this.team;
  }
}

export default ControllerComponent;
