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
 * QuestSystem.js
 * 任务系统 - 管理任务接取、进度追踪和完成奖励
 */

/**
 * 任务类型枚举
 */
export const QuestType = {
  MAIN: 'main',           // 主线任务
  SIDE: 'side',           // 支线任务
  DAILY: 'daily',         // 日常任务
  WEEKLY: 'weekly',       // 周常任务
  REPEATABLE: 'repeatable', // 可重复任务
  EVENT: 'event'          // 活动任务
};

/**
 * 任务状态枚举
 */
export const QuestState = {
  AVAILABLE: 'available',   // 可接取
  ACTIVE: 'active',         // 进行中
  COMPLETED: 'completed',   // 已完成（待提交）
  TURNED_IN: 'turned_in',   // 已提交
  FAILED: 'failed',         // 失败
  LOCKED: 'locked'          // 锁定（未解锁）
};

/**
 * 任务目标类型枚举
 */
export const ObjectiveType = {
  KILL: 'kill',             // 击杀怪物
  COLLECT: 'collect',       // 收集物品
  TALK: 'talk',             // 与NPC对话
  EXPLORE: 'explore',       // 探索区域
  ESCORT: 'escort',         // 护送
  DELIVER: 'deliver',       // 送达物品
  USE_ITEM: 'use_item',     // 使用物品
  REACH_LEVEL: 'reach_level', // 达到等级
  CRAFT: 'craft'            // 制作物品
};

/**
 * 任务目标类
 */
export class QuestObjective {
  constructor(config = {}) {
    this.id = config.id || `objective_${Date.now()}`;
    this.type = config.type || ObjectiveType.KILL;
    this.description = config.description || '';
    this.targetId = config.targetId || null;
    this.targetName = config.targetName || '';
    this.requiredCount = config.requiredCount || 1;
    this.currentCount = config.currentCount || 0;
    this.optional = config.optional || false;
    this.hidden = config.hidden || false;
  }

  /**
   * 更新进度
   * @param {number} amount
   * @returns {boolean} 是否完成
   */
  updateProgress(amount = 1) {
    this.currentCount = Math.min(this.requiredCount, this.currentCount + amount);
    return this.isComplete();
  }

  /**
   * 检查是否完成
   * @returns {boolean}
   */
  isComplete() {
    return this.currentCount >= this.requiredCount;
  }

  /**
   * 获取进度百分比
   * @returns {number}
   */
  getProgressPercent() {
    return (this.currentCount / this.requiredCount) * 100;
  }

  /**
   * 重置进度
   */
  reset() {
    this.currentCount = 0;
  }

  /**
   * 序列化
   * @returns {Object}
   */
  serialize() {
    return {
      id: this.id,
      type: this.type,
      currentCount: this.currentCount,
      requiredCount: this.requiredCount
    };
  }
}

/**
 * 任务奖励类
 */
export class QuestReward {
  constructor(config = {}) {
    this.exp = config.exp || 0;
    this.gold = config.gold || 0;
    this.items = config.items || [];
    this.reputation = config.reputation || {};
    this.skillPoints = config.skillPoints || 0;
    this.unlocks = config.unlocks || [];
  }
}


/**
 * 任务类
 */
export class Quest {
  constructor(config = {}) {
    this.id = config.id || `quest_${Date.now()}`;
    this.name = config.name || 'Unknown Quest';
    this.type = config.type || QuestType.SIDE;
    this.description = config.description || '';
    this.shortDescription = config.shortDescription || '';
    
    // 任务NPC
    this.giverNPCId = config.giverNPCId || null;
    this.turnInNPCId = config.turnInNPCId || null;
    
    // 等级要求
    this.minLevel = config.minLevel || 1;
    this.maxLevel = config.maxLevel || 999;
    this.recommendedLevel = config.recommendedLevel || this.minLevel;
    
    // 前置条件
    this.prerequisites = config.prerequisites || [];
    this.requiredQuests = config.requiredQuests || [];
    this.requiredItems = config.requiredItems || [];
    
    // 目标
    this.objectives = (config.objectives || []).map(obj => new QuestObjective(obj));
    
    // 奖励
    this.reward = new QuestReward(config.reward || {});
    
    // 状态
    this.state = QuestState.LOCKED;
    this.acceptedTime = null;
    this.completedTime = null;
    
    // 时间限制
    this.timeLimit = config.timeLimit || 0; // 0表示无限制
    this.expiresAt = null;
    
    // 可重复
    this.repeatable = config.repeatable || false;
    this.repeatCooldown = config.repeatCooldown || 86400000; // 默认24小时
    this.lastCompletedTime = null;
    
    // 对话
    this.acceptDialog = config.acceptDialog || '接受任务';
    this.progressDialog = config.progressDialog || '任务进行中...';
    this.completeDialog = config.completeDialog || '任务完成！';
    
    // 追踪
    this.tracked = false;
  }

  /**
   * 检查是否可以接取
   * @param {Object} playerContext
   * @returns {boolean}
   */
  canAccept(playerContext) {
    // 检查等级
    if (playerContext.level < this.minLevel || playerContext.level > this.maxLevel) {
      return false;
    }
    
    // 检查前置任务
    for (const questId of this.requiredQuests) {
      if (!playerContext.completedQuests?.includes(questId)) {
        return false;
      }
    }
    
    // 检查是否已接取或完成
    if (playerContext.activeQuests?.includes(this.id)) {
      return false;
    }
    
    if (!this.repeatable && playerContext.completedQuests?.includes(this.id)) {
      return false;
    }
    
    // 检查重复冷却
    if (this.repeatable && this.lastCompletedTime) {
      if (Date.now() - this.lastCompletedTime < this.repeatCooldown) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 接取任务
   * @returns {boolean}
   */
  accept() {
    if (this.state !== QuestState.AVAILABLE && this.state !== QuestState.LOCKED) {
      return false;
    }
    
    this.state = QuestState.ACTIVE;
    this.acceptedTime = Date.now();
    
    if (this.timeLimit > 0) {
      this.expiresAt = this.acceptedTime + this.timeLimit;
    }
    
    // 重置目标进度
    this.objectives.forEach(obj => obj.reset());
    
    return true;
  }

  /**
   * 放弃任务
   * @returns {boolean}
   */
  abandon() {
    if (this.state !== QuestState.ACTIVE) {
      return false;
    }
    
    this.state = QuestState.AVAILABLE;
    this.acceptedTime = null;
    this.expiresAt = null;
    this.objectives.forEach(obj => obj.reset());
    
    return true;
  }

  /**
   * 更新目标进度
   * @param {string} objectiveType
   * @param {string} targetId
   * @param {number} amount
   * @returns {boolean} 是否有进度更新
   */
  updateObjective(objectiveType, targetId, amount = 1) {
    if (this.state !== QuestState.ACTIVE) {
      return false;
    }
    
    let updated = false;
    
    for (const objective of this.objectives) {
      if (objective.type === objectiveType && 
          (objective.targetId === targetId || objective.targetId === null)) {
        if (!objective.isComplete()) {
          objective.updateProgress(amount);
          updated = true;
        }
      }
    }
    
    // 检查是否所有必要目标都完成
    if (updated && this.checkCompletion()) {
      this.state = QuestState.COMPLETED;
      this.completedTime = Date.now();
    }
    
    return updated;
  }

  /**
   * 检查任务是否完成
   * @returns {boolean}
   */
  checkCompletion() {
    return this.objectives
      .filter(obj => !obj.optional)
      .every(obj => obj.isComplete());
  }

  /**
   * 提交任务
   * @returns {QuestReward|null}
   */
  turnIn() {
    if (this.state !== QuestState.COMPLETED) {
      return null;
    }
    
    this.state = QuestState.TURNED_IN;
    this.lastCompletedTime = Date.now();
    
    return this.reward;
  }

  /**
   * 检查是否过期
   * @returns {boolean}
   */
  isExpired() {
    if (!this.expiresAt) return false;
    return Date.now() > this.expiresAt;
  }

  /**
   * 获取剩余时间（秒）
   * @returns {number}
   */
  getRemainingTime() {
    if (!this.expiresAt) return -1;
    return Math.max(0, Math.floor((this.expiresAt - Date.now()) / 1000));
  }

  /**
   * 获取总进度百分比
   * @returns {number}
   */
  getProgressPercent() {
    const requiredObjectives = this.objectives.filter(obj => !obj.optional);
    if (requiredObjectives.length === 0) return 100;
    
    const totalProgress = requiredObjectives.reduce((sum, obj) => sum + obj.getProgressPercent(), 0);
    return totalProgress / requiredObjectives.length;
  }

  /**
   * 序列化
   * @returns {Object}
   */
  serialize() {
    return {
      id: this.id,
      state: this.state,
      acceptedTime: this.acceptedTime,
      completedTime: this.completedTime,
      expiresAt: this.expiresAt,
      lastCompletedTime: this.lastCompletedTime,
      tracked: this.tracked,
      objectives: this.objectives.map(obj => obj.serialize())
    };
  }

  /**
   * 反序列化
   * @param {Object} data
   */
  deserialize(data) {
    this.state = data.state || this.state;
    this.acceptedTime = data.acceptedTime;
    this.completedTime = data.completedTime;
    this.expiresAt = data.expiresAt;
    this.lastCompletedTime = data.lastCompletedTime;
    this.tracked = data.tracked || false;
    
    if (data.objectives) {
      data.objectives.forEach(objData => {
        const objective = this.objectives.find(o => o.id === objData.id);
        if (objective) {
          objective.currentCount = objData.currentCount;
        }
      });
    }
  }
}


/**
 * 任务系统主类
 */
export class QuestSystem {
  constructor() {
    this.quests = new Map();
    this.activeQuests = new Map();
    this.completedQuests = new Set();
    this.questLog = [];
    this.maxLogSize = 100;
    
    // 事件监听器
    this.listeners = new Map();
    
    // 初始化默认任务
    this.initDefaultQuests();
  }

  /**
   * 初始化默认任务
   */
  initDefaultQuests() {
    // 新手教程任务
    this.registerQuest(new Quest({
      id: 'quest_tutorial',
      name: '冒险的开始',
      type: QuestType.MAIN,
      description: '与村长对话，了解这个世界的基本情况。',
      shortDescription: '与村长对话',
      giverNPCId: 'village_chief',
      turnInNPCId: 'village_chief',
      minLevel: 1,
      objectives: [
        { id: 'talk_chief', type: ObjectiveType.TALK, targetId: 'village_chief', targetName: '村长李', requiredCount: 1, description: '与村长对话' }
      ],
      reward: { exp: 50, gold: 10 },
      acceptDialog: '欢迎来到这个世界！让我告诉你一些基本的事情...',
      completeDialog: '很好，你已经了解了基本情况。现在去帮助村民们吧！'
    }));

    // 第一次狩猎任务
    this.registerQuest(new Quest({
      id: 'quest_first_hunt',
      name: '初次狩猎',
      type: QuestType.MAIN,
      description: '村子周围出现了野狼，威胁到了村民的安全。去消灭5只野狼。',
      shortDescription: '消灭5只野狼',
      giverNPCId: 'village_chief',
      turnInNPCId: 'village_chief',
      minLevel: 1,
      requiredQuests: ['quest_tutorial'],
      objectives: [
        { id: 'kill_wolves', type: ObjectiveType.KILL, targetId: 'wolf', targetName: '野狼', requiredCount: 5, description: '消灭野狼 (0/5)' }
      ],
      reward: { exp: 200, gold: 50, items: [{ id: 'health_potion', name: '生命药水', count: 3 }] },
      acceptDialog: '村子东边的森林里有很多野狼，去消灭5只吧。',
      progressDialog: '还没消灭完吗？加油！',
      completeDialog: '干得好！这些药水给你，以后会用得上的。'
    }));

    // 收集草药任务
    this.registerQuest(new Quest({
      id: 'quest_collect_herbs',
      name: '草药收集',
      type: QuestType.SIDE,
      description: '商人陈需要一些草药来制作药水，帮他收集10株草药。',
      shortDescription: '收集10株草药',
      giverNPCId: 'merchant_chen',
      turnInNPCId: 'merchant_chen',
      minLevel: 2,
      objectives: [
        { id: 'collect_herbs', type: ObjectiveType.COLLECT, targetId: 'herb', targetName: '草药', requiredCount: 10, description: '收集草药 (0/10)' }
      ],
      reward: { exp: 100, gold: 30 },
      repeatable: true,
      repeatCooldown: 3600000 // 1小时
    }));

    // 探索森林任务
    this.registerQuest(new Quest({
      id: 'quest_explore_forest',
      name: '森林探索',
      type: QuestType.SIDE,
      description: '探索绿野森林的各个区域，绘制地图。',
      shortDescription: '探索森林区域',
      giverNPCId: 'guard_zhang',
      turnInNPCId: 'guard_zhang',
      minLevel: 3,
      objectives: [
        { id: 'explore_forest_entrance', type: ObjectiveType.EXPLORE, targetId: 'forest_entrance', targetName: '森林入口', requiredCount: 1, description: '探索森林入口' },
        { id: 'explore_forest_deep', type: ObjectiveType.EXPLORE, targetId: 'forest_deep', targetName: '森林深处', requiredCount: 1, description: '探索森林深处' },
        { id: 'explore_forest_lake', type: ObjectiveType.EXPLORE, targetId: 'forest_lake', targetName: '森林湖泊', requiredCount: 1, description: '探索森林湖泊', optional: true }
      ],
      reward: { exp: 300, gold: 100 }
    }));

    // 铁匠的请求
    this.registerQuest(new Quest({
      id: 'quest_blacksmith_ore',
      name: '铁匠的请求',
      type: QuestType.SIDE,
      description: '铁匠老王需要铁矿石来打造装备，去矿洞收集5块铁矿石。',
      shortDescription: '收集5块铁矿石',
      giverNPCId: 'blacksmith_wang',
      turnInNPCId: 'blacksmith_wang',
      minLevel: 5,
      objectives: [
        { id: 'collect_ore', type: ObjectiveType.COLLECT, targetId: 'iron_ore', targetName: '铁矿石', requiredCount: 5, description: '收集铁矿石 (0/5)' }
      ],
      reward: { exp: 250, gold: 80, items: [{ id: 'iron_sword', name: '铁剑', count: 1 }] }
    }));

    // 日常任务 - 每日狩猎
    this.registerQuest(new Quest({
      id: 'quest_daily_hunt',
      name: '每日狩猎',
      type: QuestType.DAILY,
      description: '每天消灭10只怪物，保持战斗技巧。',
      shortDescription: '消灭10只怪物',
      giverNPCId: 'trainer_sun',
      turnInNPCId: 'trainer_sun',
      minLevel: 1,
      objectives: [
        { id: 'kill_monsters', type: ObjectiveType.KILL, targetId: null, targetName: '任意怪物', requiredCount: 10, description: '消灭怪物 (0/10)' }
      ],
      reward: { exp: 100, gold: 20 },
      repeatable: true,
      repeatCooldown: 86400000 // 24小时
    }));
  }

  /**
   * 注册任务
   * @param {Quest} quest
   */
  registerQuest(quest) {
    this.quests.set(quest.id, quest);
  }

  /**
   * 获取任务
   * @param {string} questId
   * @returns {Quest|null}
   */
  getQuest(questId) {
    return this.quests.get(questId) || null;
  }

  /**
   * 获取所有任务
   * @returns {Quest[]}
   */
  getAllQuests() {
    return Array.from(this.quests.values());
  }

  /**
   * 获取可接取的任务
   * @param {Object} playerContext
   * @returns {Quest[]}
   */
  getAvailableQuests(playerContext) {
    return this.getAllQuests().filter(quest => {
      quest.state = this.calculateQuestState(quest, playerContext);
      return quest.state === QuestState.AVAILABLE;
    });
  }

  /**
   * 计算任务状态
   * @param {Quest} quest
   * @param {Object} playerContext
   * @returns {string}
   */
  calculateQuestState(quest, playerContext) {
    if (this.activeQuests.has(quest.id)) {
      const activeQuest = this.activeQuests.get(quest.id);
      return activeQuest.state;
    }
    
    if (this.completedQuests.has(quest.id) && !quest.repeatable) {
      return QuestState.TURNED_IN;
    }
    
    if (quest.canAccept(playerContext)) {
      return QuestState.AVAILABLE;
    }
    
    return QuestState.LOCKED;
  }

  /**
   * 接取任务
   * @param {string} questId
   * @param {Object} playerContext
   * @returns {boolean}
   */
  acceptQuest(questId, playerContext) {
    const quest = this.getQuest(questId);
    if (!quest) return false;
    
    if (!quest.canAccept(playerContext)) return false;
    
    // 创建任务副本用于追踪
    const activeQuest = new Quest(quest);
    activeQuest.accept();
    
    this.activeQuests.set(questId, activeQuest);
    this.addToLog('accept', quest);
    this.emit('questAccepted', { quest: activeQuest });
    
    return true;
  }

  /**
   * 放弃任务
   * @param {string} questId
   * @returns {boolean}
   */
  abandonQuest(questId) {
    const quest = this.activeQuests.get(questId);
    if (!quest) return false;
    
    quest.abandon();
    this.activeQuests.delete(questId);
    this.addToLog('abandon', quest);
    this.emit('questAbandoned', { quest });
    
    return true;
  }

  /**
   * 更新任务进度
   * @param {string} objectiveType
   * @param {string} targetId
   * @param {number} amount
   */
  updateProgress(objectiveType, targetId, amount = 1) {
    for (const [questId, quest] of this.activeQuests) {
      const updated = quest.updateObjective(objectiveType, targetId, amount);
      
      if (updated) {
        this.emit('questProgress', { quest, objectiveType, targetId, amount });
        
        if (quest.state === QuestState.COMPLETED) {
          this.emit('questCompleted', { quest });
        }
      }
    }
  }

  /**
   * 提交任务
   * @param {string} questId
   * @returns {QuestReward|null}
   */
  turnInQuest(questId) {
    const quest = this.activeQuests.get(questId);
    if (!quest || quest.state !== QuestState.COMPLETED) {
      return null;
    }
    
    const reward = quest.turnIn();
    this.activeQuests.delete(questId);
    this.completedQuests.add(questId);
    this.addToLog('turnIn', quest);
    this.emit('questTurnedIn', { quest, reward });
    
    return reward;
  }

  /**
   * 获取活跃任务
   * @returns {Quest[]}
   */
  getActiveQuests() {
    return Array.from(this.activeQuests.values());
  }

  /**
   * 获取已完成任务ID列表
   * @returns {string[]}
   */
  getCompletedQuestIds() {
    return Array.from(this.completedQuests);
  }

  /**
   * 获取NPC的可接取任务
   * @param {string} npcId
   * @param {Object} playerContext
   * @returns {Quest[]}
   */
  getQuestsForNPC(npcId, playerContext) {
    return this.getAvailableQuests(playerContext).filter(quest => quest.giverNPCId === npcId);
  }

  /**
   * 获取NPC的可提交任务
   * @param {string} npcId
   * @returns {Quest[]}
   */
  getCompletableQuestsForNPC(npcId) {
    return this.getActiveQuests().filter(quest => 
      quest.turnInNPCId === npcId && quest.state === QuestState.COMPLETED
    );
  }

  /**
   * 切换任务追踪
   * @param {string} questId
   * @returns {boolean}
   */
  toggleTracking(questId) {
    const quest = this.activeQuests.get(questId);
    if (!quest) return false;
    
    quest.tracked = !quest.tracked;
    this.emit('questTrackingChanged', { quest });
    return quest.tracked;
  }

  /**
   * 获取追踪的任务
   * @returns {Quest[]}
   */
  getTrackedQuests() {
    return this.getActiveQuests().filter(quest => quest.tracked);
  }

  /**
   * 检查过期任务
   */
  checkExpiredQuests() {
    for (const [questId, quest] of this.activeQuests) {
      if (quest.isExpired()) {
        quest.state = QuestState.FAILED;
        this.activeQuests.delete(questId);
        this.addToLog('expired', quest);
        this.emit('questFailed', { quest, reason: 'expired' });
      }
    }
  }

  /**
   * 添加到日志
   * @param {string} action
   * @param {Quest} quest
   */
  addToLog(action, quest) {
    this.questLog.push({
      action,
      questId: quest.id,
      questName: quest.name,
      timestamp: Date.now()
    });
    
    if (this.questLog.length > this.maxLogSize) {
      this.questLog.shift();
    }
  }

  /**
   * 获取任务日志
   * @param {number} limit
   * @returns {Object[]}
   */
  getQuestLog(limit = 20) {
    return this.questLog.slice(-limit);
  }

  /**
   * 更新系统
   * @param {number} deltaTime
   */
  update(deltaTime) {
    this.checkExpiredQuests();
  }

  /**
   * 添加事件监听器
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);
  }

  /**
   * 移除事件监听器
   */
  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) callbacks.splice(index, 1);
    }
  }

  /**
   * 触发事件
   */
  emit(eventName, data) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalQuests: this.quests.size,
      activeQuests: this.activeQuests.size,
      completedQuests: this.completedQuests.size,
      trackedQuests: this.getTrackedQuests().length
    };
  }

  /**
   * 序列化
   */
  serialize() {
    return {
      activeQuests: Array.from(this.activeQuests.entries()).map(([id, quest]) => ({
        id,
        data: quest.serialize()
      })),
      completedQuests: Array.from(this.completedQuests),
      questLog: this.questLog
    };
  }

  /**
   * 反序列化
   */
  deserialize(data) {
    if (data.completedQuests) {
      this.completedQuests = new Set(data.completedQuests);
    }
    
    if (data.activeQuests) {
      data.activeQuests.forEach(({ id, data: questData }) => {
        const quest = this.getQuest(id);
        if (quest) {
          const activeQuest = new Quest(quest);
          activeQuest.deserialize(questData);
          this.activeQuests.set(id, activeQuest);
        }
      });
    }
    
    if (data.questLog) {
      this.questLog = data.questLog;
    }
  }

  /**
   * 重置系统
   */
  reset() {
    this.activeQuests.clear();
    this.completedQuests.clear();
    this.questLog = [];
  }
}
