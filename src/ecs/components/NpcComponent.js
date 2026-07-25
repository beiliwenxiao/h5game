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
 * NpcComponent.js
 * NPC 组件 - 存储 NPC 的交互/对话/立绘/称号/阵营等配置。
 *
 * 与 SpriteComponent（序列帧）、StatsComponent（属性）、NameComponent（名字）配合，
 * 组成一个数据驱动的独立 NPC 对象。所有字段来自内容库定义（library.npcs）。
 *
 * authority: 'client'  // 纯表现/交互数据，联网时对话/商店由 server 权威裁决
 */

import { Component } from '../Component.js';

export class NpcComponent extends Component {
  /**
   * @param {Object} config - NPC 配置（来自 library.npcs 定义）
   */
  constructor(config = {}) {
    super('npc');

    this.npcId = config.id || null;
    this.title = config.title || '';          // 称号（名字上方显示）
    this.portrait = config.portrait || null;  // 立绘 key（对话框用）
    this.faction = config.faction || 'friendly'; // friendly/neutral/hostile
    this.renderStyle = config.renderStyle || null; // 无序列帧图片时用内置代码立绘（如 'zhangjiao'）

    // 交互绑定
    this.dialogueId = config.dialogueId || '';
    this.shopId = config.shopId || '';
    this.questId = config.questId || '';

    // 交互配置
    const it = config.interaction || {};
    this.interactionRadius = it.radius != null ? it.radius : 60;
    this.interactionPrompt = it.prompt || '按 E 对话';
    this.interactionTrigger = it.trigger || 'interact'; // interact(按键) | approach(靠近自动)

    // 运行时状态
    this.interacted = false;   // 是否已交互过（approach 触发用，避免重复）
    this.inRange = false;      // 玩家是否在交互范围
  }

  /** 是否有可交互内容 */
  hasInteraction() {
    return !!(this.dialogueId || this.shopId || this.questId);
  }

  serialize() {
    return {
      npcId: this.npcId,
      dialogueId: this.dialogueId,
      shopId: this.shopId,
      questId: this.questId,
      interacted: this.interacted
    };
  }

  deserialize(data = {}) {
    if (data.dialogueId !== undefined) this.dialogueId = data.dialogueId;
    if (data.shopId !== undefined) this.shopId = data.shopId;
    if (data.questId !== undefined) this.questId = data.questId;
    if (data.interacted !== undefined) this.interacted = data.interacted;
  }
}
