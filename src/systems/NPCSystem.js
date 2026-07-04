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
 * NPCSystem.js
 * NPC交互系统 - 管理NPC、对话、商店和任务交互
 */

/**
 * NPC类型枚举
 */
export const NPCType = {
  QUEST_GIVER: 'quest_giver',     // 任务NPC
  MERCHANT: 'merchant',           // 商人
  TRAINER: 'trainer',             // 训练师
  GUARD: 'guard',                 // 守卫
  VILLAGER: 'villager',           // 村民
  BLACKSMITH: 'blacksmith',       // 铁匠
  INNKEEPER: 'innkeeper',         // 旅店老板
  BANKER: 'banker'                // 银行家
};

/**
 * NPC状态枚举
 */
export const NPCState = {
  IDLE: 'idle',           // 空闲
  WALKING: 'walking',     // 行走
  TALKING: 'talking',     // 对话中
  WORKING: 'working',     // 工作中
  SLEEPING: 'sleeping'    // 睡眠
};

/**
 * 对话选项类
 */
export class DialogOption {
  constructor(config = {}) {
    this.id = config.id || `option_${Date.now()}`;
    this.text = config.text || '';
    this.nextDialogId = config.nextDialogId || null;
    this.action = config.action || null; // 'open_shop', 'accept_quest', 'complete_quest', etc.
    this.condition = config.condition || null;
    this.visible = config.visible !== false;
  }

  /**
   * 检查选项是否可用
   * @param {Object} context - 上下文（玩家数据等）
   * @returns {boolean}
   */
  isAvailable(context) {
    if (!this.visible) return false;
    if (!this.condition) return true;
    
    // 检查条件
    if (this.condition.minLevel && (context.level || 1) < this.condition.minLevel) {
      return false;
    }
    if (this.condition.requiredQuest && !context.completedQuests?.includes(this.condition.requiredQuest)) {
      return false;
    }
    if (this.condition.requiredItem && !context.inventory?.includes(this.condition.requiredItem)) {
      return false;
    }
    return true;
  }
}

/**
 * 对话节点类
 */
export class DialogNode {
  constructor(config = {}) {
    this.id = config.id || `dialog_${Date.now()}`;
    this.speaker = config.speaker || 'NPC';
    this.text = config.text || '';
    this.options = (config.options || []).map(opt => new DialogOption(opt));
    this.onEnter = config.onEnter || null;
    this.onExit = config.onExit || null;
  }

  /**
   * 获取可用选项
   * @param {Object} context
   * @returns {DialogOption[]}
   */
  getAvailableOptions(context) {
    return this.options.filter(opt => opt.isAvailable(context));
  }
}

/**
 * 对话树类
 */
export class DialogTree {
  constructor(config = {}) {
    this.id = config.id || `dialog_tree_${Date.now()}`;
    this.nodes = new Map();
    this.startNodeId = config.startNodeId || null;
    
    // 初始化节点
    if (config.nodes) {
      config.nodes.forEach(node => {
        this.addNode(new DialogNode(node));
      });
    }
  }

  /**
   * 添加对话节点
   * @param {DialogNode} node
   */
  addNode(node) {
    this.nodes.set(node.id, node);
    if (!this.startNodeId) {
      this.startNodeId = node.id;
    }
  }

  /**
   * 获取节点
   * @param {string} nodeId
   * @returns {DialogNode|null}
   */
  getNode(nodeId) {
    return this.nodes.get(nodeId) || null;
  }

  /**
   * 获取起始节点
   * @returns {DialogNode|null}
   */
  getStartNode() {
    return this.getNode(this.startNodeId);
  }
}


/**
 * NPC数据类
 */
export class NPC {
  constructor(config = {}) {
    this.id = config.id || `npc_${Date.now()}`;
    this.name = config.name || 'Unknown NPC';
    this.type = config.type || NPCType.VILLAGER;
    this.title = config.title || '';
    this.description = config.description || '';
    
    // 位置和外观
    this.mapId = config.mapId || 'default';
    this.position = config.position || { x: 0, y: 0 };
    this.sprite = config.sprite || 'default_npc';
    this.direction = config.direction || 'down';
    
    // 状态
    this.state = NPCState.IDLE;
    this.interactionRadius = config.interactionRadius || 50;
    
    // 对话
    this.dialogTree = config.dialogTree ? new DialogTree(config.dialogTree) : null;
    this.greeting = config.greeting || '你好，旅行者。';
    
    // 商店（如果是商人）
    this.shopId = config.shopId || null;
    this.shopItems = config.shopItems || [];
    
    // 任务
    this.availableQuests = config.availableQuests || [];
    this.completableQuests = config.completableQuests || [];
    
    // AI行为
    this.patrolPath = config.patrolPath || null;
    this.patrolIndex = 0;
    this.patrolSpeed = config.patrolSpeed || 50;
    this.schedule = config.schedule || null;
    
    // 好感度
    this.friendliness = config.friendliness || 50; // 0-100
    
    // 回调
    this.onInteract = null;
    this.onDialogStart = null;
    this.onDialogEnd = null;
  }

  /**
   * 检查玩家是否在交互范围内
   * @param {Object} playerPosition
   * @returns {boolean}
   */
  isInRange(playerPosition) {
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    return Math.sqrt(dx * dx + dy * dy) <= this.interactionRadius;
  }

  /**
   * 开始交互
   * @param {Object} player
   */
  interact(player) {
    this.state = NPCState.TALKING;
    this.onInteract && this.onInteract(this, player);
  }

  /**
   * 结束交互
   */
  endInteraction() {
    this.state = NPCState.IDLE;
  }

  /**
   * 更新NPC
   * @param {number} deltaTime
   */
  update(deltaTime) {
    if (this.state === NPCState.WALKING && this.patrolPath) {
      this.updatePatrol(deltaTime);
    }
  }

  /**
   * 更新巡逻
   * @param {number} deltaTime
   */
  updatePatrol(deltaTime) {
    if (!this.patrolPath || this.patrolPath.length === 0) return;

    const target = this.patrolPath[this.patrolIndex];
    const dx = target.x - this.position.x;
    const dy = target.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) {
      // 到达目标点，移动到下一个
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPath.length;
    } else {
      // 移动向目标
      const speed = this.patrolSpeed * (deltaTime / 1000);
      this.position.x += (dx / distance) * speed;
      this.position.y += (dy / distance) * speed;
      
      // 更新朝向
      if (Math.abs(dx) > Math.abs(dy)) {
        this.direction = dx > 0 ? 'right' : 'left';
      } else {
        this.direction = dy > 0 ? 'down' : 'up';
      }
    }
  }

  /**
   * 开始巡逻
   */
  startPatrol() {
    if (this.patrolPath && this.patrolPath.length > 0) {
      this.state = NPCState.WALKING;
    }
  }

  /**
   * 停止巡逻
   */
  stopPatrol() {
    this.state = NPCState.IDLE;
  }

  /**
   * 获取可用任务
   * @param {Object} playerContext
   * @returns {string[]}
   */
  getAvailableQuests(playerContext) {
    return this.availableQuests.filter(questId => {
      // 这里可以添加更多条件检查
      return !playerContext.activeQuests?.includes(questId) &&
             !playerContext.completedQuests?.includes(questId);
    });
  }

  /**
   * 获取可完成任务
   * @param {Object} playerContext
   * @returns {string[]}
   */
  getCompletableQuests(playerContext) {
    return this.completableQuests.filter(questId => {
      return playerContext.activeQuests?.includes(questId);
    });
  }

  /**
   * 检查是否有任务标记
   * @param {Object} playerContext
   * @returns {string|null} 'available', 'completable', null
   */
  getQuestMarker(playerContext) {
    if (this.getCompletableQuests(playerContext).length > 0) {
      return 'completable';
    }
    if (this.getAvailableQuests(playerContext).length > 0) {
      return 'available';
    }
    return null;
  }

  /**
   * 增加好感度
   * @param {number} amount
   */
  addFriendliness(amount) {
    this.friendliness = Math.max(0, Math.min(100, this.friendliness + amount));
  }

  /**
   * 序列化
   * @returns {Object}
   */
  serialize() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      mapId: this.mapId,
      position: this.position,
      state: this.state,
      friendliness: this.friendliness,
      patrolIndex: this.patrolIndex
    };
  }
}


/**
 * NPC系统主类
 */
export class NPCSystem {
  constructor() {
    this.npcs = new Map();
    this.npcsByMap = new Map();
    this.activeDialog = null;
    this.currentNPC = null;
    this.currentDialogNode = null;
    
    // 事件监听器
    this.listeners = new Map();
    
    // 初始化默认NPC
    this.initDefaultNPCs();
  }

  /**
   * 初始化默认NPC
   */
  initDefaultNPCs() {
    // 村长 - 任务NPC
    this.registerNPC(new NPC({
      id: 'village_chief',
      name: '村长李',
      type: NPCType.QUEST_GIVER,
      title: '新手村村长',
      description: '一位慈祥的老人，管理着这个小村庄。',
      mapId: 'starter_village',
      position: { x: 200, y: 150 },
      greeting: '欢迎来到新手村，年轻的冒险者！',
      availableQuests: ['quest_tutorial', 'quest_first_hunt'],
      dialogTree: {
        startNodeId: 'start',
        nodes: [
          {
            id: 'start',
            speaker: '村长李',
            text: '欢迎来到新手村！我是这里的村长。你看起来像是一位有潜力的冒险者。',
            options: [
              { id: 'ask_quest', text: '有什么任务吗？', nextDialogId: 'quest_info' },
              { id: 'ask_village', text: '能介绍一下这个村庄吗？', nextDialogId: 'village_info' },
              { id: 'goodbye', text: '再见', action: 'end_dialog' }
            ]
          },
          {
            id: 'quest_info',
            speaker: '村长李',
            text: '最近村子周围出现了一些野狼，威胁到了村民的安全。如果你能帮忙清理一些，我会给你报酬的。',
            options: [
              { id: 'accept', text: '我接受这个任务', action: 'accept_quest', nextDialogId: 'quest_accepted' },
              { id: 'decline', text: '我再考虑一下', nextDialogId: 'start' }
            ]
          },
          {
            id: 'quest_accepted',
            speaker: '村长李',
            text: '太好了！去村子东边的森林，消灭5只野狼后回来找我。祝你好运！',
            options: [
              { id: 'ok', text: '我这就去', action: 'end_dialog' }
            ]
          },
          {
            id: 'village_info',
            speaker: '村长李',
            text: '这是一个宁静的小村庄。村子里有铁匠铺、杂货店和旅馆。东边是森林，北边是矿洞。',
            options: [
              { id: 'back', text: '谢谢介绍', nextDialogId: 'start' }
            ]
          }
        ]
      }
    }));

    // 铁匠 - 商人NPC
    this.registerNPC(new NPC({
      id: 'blacksmith_wang',
      name: '铁匠老王',
      type: NPCType.BLACKSMITH,
      title: '村庄铁匠',
      description: '一位经验丰富的铁匠，可以打造和强化装备。',
      mapId: 'starter_village',
      position: { x: 350, y: 200 },
      greeting: '需要打造装备吗？我的手艺可是一流的！',
      shopId: 'blacksmith_shop',
      shopItems: [
        { id: 'iron_sword', name: '铁剑', price: 100, type: 'weapon' },
        { id: 'iron_shield', name: '铁盾', price: 80, type: 'armor' },
        { id: 'iron_helmet', name: '铁头盔', price: 60, type: 'armor' }
      ],
      dialogTree: {
        startNodeId: 'start',
        nodes: [
          {
            id: 'start',
            speaker: '铁匠老王',
            text: '欢迎光临！需要什么服务？',
            options: [
              { id: 'shop', text: '看看你的商品', action: 'open_shop' },
              { id: 'enhance', text: '强化装备', action: 'open_enhance' },
              { id: 'goodbye', text: '再见', action: 'end_dialog' }
            ]
          }
        ]
      }
    }));

    // 杂货商 - 商人NPC
    this.registerNPC(new NPC({
      id: 'merchant_chen',
      name: '商人陈',
      type: NPCType.MERCHANT,
      title: '杂货商人',
      description: '贩卖各种日常用品和消耗品的商人。',
      mapId: 'starter_village',
      position: { x: 150, y: 300 },
      greeting: '来看看我的商品吧，保证物美价廉！',
      shopId: 'general_store',
      shopItems: [
        { id: 'health_potion', name: '生命药水', price: 50, type: 'consumable' },
        { id: 'mana_potion', name: '魔法药水', price: 50, type: 'consumable' },
        { id: 'antidote', name: '解毒剂', price: 30, type: 'consumable' },
        { id: 'torch', name: '火把', price: 10, type: 'tool' }
      ]
    }));

    // 旅店老板
    this.registerNPC(new NPC({
      id: 'innkeeper_liu',
      name: '刘掌柜',
      type: NPCType.INNKEEPER,
      title: '旅店老板',
      description: '经营着村里唯一的旅店。',
      mapId: 'starter_village',
      position: { x: 400, y: 350 },
      greeting: '欢迎来到安宁旅店！需要休息吗？',
      dialogTree: {
        startNodeId: 'start',
        nodes: [
          {
            id: 'start',
            speaker: '刘掌柜',
            text: '欢迎来到安宁旅店！住一晚只要20金币，可以完全恢复体力。',
            options: [
              { id: 'rest', text: '我要休息（20金币）', action: 'rest_inn' },
              { id: 'decline', text: '不用了，谢谢', action: 'end_dialog' }
            ]
          }
        ]
      }
    }));

    // 守卫
    this.registerNPC(new NPC({
      id: 'guard_zhang',
      name: '守卫小张',
      type: NPCType.GUARD,
      title: '村庄守卫',
      description: '负责保护村庄安全的年轻守卫。',
      mapId: 'starter_village',
      position: { x: 100, y: 100 },
      greeting: '站住！哦，是冒险者啊，请便。',
      patrolPath: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 }
      ],
      patrolSpeed: 30
    }));

    // 训练师
    this.registerNPC(new NPC({
      id: 'trainer_sun',
      name: '孙教官',
      type: NPCType.TRAINER,
      title: '战斗训练师',
      description: '教授战斗技巧的退役老兵。',
      mapId: 'starter_village',
      position: { x: 450, y: 150 },
      greeting: '想变强吗？来，我教你几招！',
      dialogTree: {
        startNodeId: 'start',
        nodes: [
          {
            id: 'start',
            speaker: '孙教官',
            text: '年轻人，想学习战斗技巧吗？',
            options: [
              { id: 'learn', text: '教我战斗技巧', action: 'open_trainer' },
              { id: 'tips', text: '有什么战斗建议？', nextDialogId: 'tips' },
              { id: 'goodbye', text: '再见', action: 'end_dialog' }
            ]
          },
          {
            id: 'tips',
            speaker: '孙教官',
            text: '记住，战斗中要注意观察敌人的动作。合理使用技能，不要浪费魔法值。还有，装备很重要，去找铁匠老王看看。',
            options: [
              { id: 'back', text: '谢谢指导', nextDialogId: 'start' }
            ]
          }
        ]
      }
    }));
  }

  /**
   * 注册NPC
   * @param {NPC} npc
   */
  registerNPC(npc) {
    this.npcs.set(npc.id, npc);
    
    // 按地图分组
    if (!this.npcsByMap.has(npc.mapId)) {
      this.npcsByMap.set(npc.mapId, new Map());
    }
    this.npcsByMap.get(npc.mapId).set(npc.id, npc);
  }

  /**
   * 获取NPC
   * @param {string} npcId
   * @returns {NPC|null}
   */
  getNPC(npcId) {
    return this.npcs.get(npcId) || null;
  }

  /**
   * 获取地图上的所有NPC
   * @param {string} mapId
   * @returns {NPC[]}
   */
  getNPCsByMap(mapId) {
    const mapNPCs = this.npcsByMap.get(mapId);
    return mapNPCs ? Array.from(mapNPCs.values()) : [];
  }

  /**
   * 获取范围内的NPC
   * @param {string} mapId
   * @param {Object} position
   * @param {number} radius
   * @returns {NPC[]}
   */
  getNPCsInRange(mapId, position, radius) {
    return this.getNPCsByMap(mapId).filter(npc => {
      const dx = npc.position.x - position.x;
      const dy = npc.position.y - position.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }

  /**
   * 获取可交互的NPC
   * @param {string} mapId
   * @param {Object} playerPosition
   * @returns {NPC|null}
   */
  getInteractableNPC(mapId, playerPosition) {
    const npcs = this.getNPCsByMap(mapId);
    for (const npc of npcs) {
      if (npc.isInRange(playerPosition) && npc.state !== NPCState.TALKING) {
        return npc;
      }
    }
    return null;
  }

  /**
   * 开始与NPC对话
   * @param {string} npcId
   * @param {Object} playerContext
   * @returns {DialogNode|null}
   */
  startDialog(npcId, playerContext) {
    const npc = this.getNPC(npcId);
    if (!npc) return null;

    npc.interact(playerContext);
    this.currentNPC = npc;

    if (npc.dialogTree) {
      this.currentDialogNode = npc.dialogTree.getStartNode();
      this.emit('dialogStart', { npc, node: this.currentDialogNode, context: playerContext });
      return this.currentDialogNode;
    }

    // 没有对话树，返回简单问候
    this.currentDialogNode = new DialogNode({
      id: 'greeting',
      speaker: npc.name,
      text: npc.greeting,
      options: [{ id: 'goodbye', text: '再见', action: 'end_dialog' }]
    });
    
    this.emit('dialogStart', { npc, node: this.currentDialogNode, context: playerContext });
    return this.currentDialogNode;
  }

  /**
   * 选择对话选项
   * @param {string} optionId
   * @param {Object} playerContext
   * @returns {Object} { node, action }
   */
  selectOption(optionId, playerContext) {
    if (!this.currentDialogNode || !this.currentNPC) {
      return { node: null, action: null };
    }

    const option = this.currentDialogNode.options.find(opt => opt.id === optionId);
    if (!option) {
      return { node: null, action: null };
    }

    // 处理动作
    if (option.action) {
      this.emit('dialogAction', { 
        npc: this.currentNPC, 
        action: option.action, 
        context: playerContext 
      });

      if (option.action === 'end_dialog') {
        this.endDialog();
        return { node: null, action: option.action };
      }
    }

    // 移动到下一个节点
    if (option.nextDialogId && this.currentNPC.dialogTree) {
      this.currentDialogNode = this.currentNPC.dialogTree.getNode(option.nextDialogId);
      this.emit('dialogProgress', { 
        npc: this.currentNPC, 
        node: this.currentDialogNode, 
        context: playerContext 
      });
      return { node: this.currentDialogNode, action: option.action };
    }

    return { node: this.currentDialogNode, action: option.action };
  }

  /**
   * 结束对话
   */
  endDialog() {
    if (this.currentNPC) {
      this.currentNPC.endInteraction();
      this.emit('dialogEnd', { npc: this.currentNPC });
    }
    this.currentNPC = null;
    this.currentDialogNode = null;
  }

  /**
   * 更新系统
   * @param {number} deltaTime
   */
  update(deltaTime) {
    for (const npc of this.npcs.values()) {
      npc.update(deltaTime);
    }
  }

  /**
   * 添加事件监听器
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);
  }

  /**
   * 移除事件监听器
   * @param {string} eventName
   * @param {Function} callback
   */
  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   * @param {string} eventName
   * @param {*} data
   */
  emit(eventName, data) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      totalNPCs: this.npcs.size,
      mapCount: this.npcsByMap.size,
      isInDialog: this.currentNPC !== null
    };
  }

  /**
   * 重置系统
   */
  reset() {
    this.endDialog();
    this.npcs.clear();
    this.npcsByMap.clear();
    this.initDefaultNPCs();
  }
}
