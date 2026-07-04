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
 * NPCRecruitmentSystem - NPC招募系统
 * 
 * 功能：
 * - NPC数据管理
 * - 招募条件检查
 * - NPC加入队伍逻辑
 * - 招募状态跟踪
 * - NPC战斗能力管理
 * 
 * 需求：25, 26, 29
 * - 需求25: 广宗之战救援张梁后，管骇加入队伍
 * - 需求26: 阳城之战救援张宝后，周仓加入队伍
 * - 需求29: NPC招募系统（管骇、周仓）
 * 
 * @author Kiro
 * @date 2026-01-08
 */

export class NPCRecruitmentSystem {
  constructor() {
    // 所有可招募的NPC数据
    this.npcs = new Map();
    
    // 已招募的NPC
    this.recruitedNPCs = new Map();
    
    // 招募条件检查器
    this.conditionCheckers = new Map();
    
    // 回调函数
    this.callbacks = {
      onNPCRecruited: null,
      onNPCDismissed: null,
      onRecruitmentAvailable: null
    };
  }

  /**
   * 注册NPC
   * @param {Object} npc - NPC配置
   * @param {string} npc.id - NPC ID
   * @param {string} npc.name - NPC名称
   * @param {string} npc.description - NPC描述
   * @param {Object} npc.attributes - NPC属性（生命、攻击、防御等）
   * @param {Array} npc.skills - NPC技能列表
   * @param {string} npc.unitType - 兵种类型
   * @param {Object} npc.recruitCondition - 招募条件
   * @param {Object} npc.dialogue - 招募对话
   */
  registerNPC(npc) {
    if (!npc.id) {
      throw new Error('NPC must have an id');
    }

    if (!npc.name) {
      throw new Error('NPC must have a name');
    }

    // 初始化NPC数据
    const npcData = {
      id: npc.id,
      name: npc.name,
      description: npc.description || '',
      attributes: {
        health: npc.attributes?.health || 100,
        maxHealth: npc.attributes?.maxHealth || 100,
        attack: npc.attributes?.attack || 10,
        defense: npc.attributes?.defense || 5,
        speed: npc.attributes?.speed || 100,
        ...npc.attributes
      },
      skills: npc.skills || [],
      unitType: npc.unitType || 'infantry',
      recruitCondition: npc.recruitCondition || { type: 'always' },
      dialogue: npc.dialogue || {
        recruitment: `${npc.name}愿意加入你的队伍！`,
        greeting: `我是${npc.name}。`
      },
      loyalty: npc.loyalty || 100,
      isRecruited: false,
      isAvailable: false
    };

    this.npcs.set(npc.id, npcData);
  }

  /**
   * 注册招募条件检查器
   * @param {string} conditionType - 条件类型
   * @param {Function} checker - 检查函数，返回boolean
   */
  registerConditionChecker(conditionType, checker) {
    this.conditionCheckers.set(conditionType, checker);
  }

  /**
   * 检查NPC招募条件
   * @param {string} npcId - NPC ID
   * @param {Object} context - 上下文数据（玩家状态、游戏进度等）
   * @returns {boolean} 是否满足招募条件
   */
  checkRecruitmentCondition(npcId, context = {}) {
    const npc = this.npcs.get(npcId);
    if (!npc) {
      console.warn(`NPC ${npcId} not found`);
      return false;
    }

    // 如果已经招募，返回false
    if (npc.isRecruited) {
      return false;
    }

    const condition = npc.recruitCondition;

    // 总是可招募
    if (condition.type === 'always') {
      return true;
    }

    // 使用注册的条件检查器
    const checker = this.conditionCheckers.get(condition.type);
    if (checker) {
      return checker(condition, context);
    }

    // 默认条件检查
    switch (condition.type) {
      case 'quest_completed':
        // 检查任务是否完成
        return context.completedQuests?.includes(condition.questId) || false;

      case 'battle_won':
        // 检查战斗是否胜利
        return context.wonBattles?.includes(condition.battleId) || false;

      case 'rescue_success':
        // 检查救援是否成功
        return context.rescuedTargets?.includes(condition.targetId) || false;

      case 'level_requirement':
        // 检查等级要求
        return (context.playerLevel || 0) >= (condition.level || 1);

      case 'item_owned':
        // 检查是否拥有特定物品
        return context.inventory?.some(item => item.id === condition.itemId) || false;

      default:
        console.warn(`Unknown condition type: ${condition.type}`);
        return false;
    }
  }

  /**
   * 设置NPC为可招募状态
   * @param {string} npcId - NPC ID
   */
  makeAvailable(npcId) {
    const npc = this.npcs.get(npcId);
    if (!npc) {
      console.warn(`NPC ${npcId} not found`);
      return;
    }

    if (npc.isRecruited) {
      console.warn(`NPC ${npcId} is already recruited`);
      return;
    }

    npc.isAvailable = true;

    // 触发回调
    if (this.callbacks.onRecruitmentAvailable) {
      this.callbacks.onRecruitmentAvailable(npc);
    }
  }

  /**
   * 招募NPC
   * @param {string} npcId - NPC ID
   * @param {Object} context - 上下文数据
   * @returns {Object|null} 招募结果
   */
  recruitNPC(npcId, context = {}) {
    const npc = this.npcs.get(npcId);
    if (!npc) {
      return {
        success: false,
        reason: 'npc_not_found',
        message: `NPC ${npcId} 不存在`
      };
    }

    // 检查是否已经招募
    if (npc.isRecruited) {
      return {
        success: false,
        reason: 'already_recruited',
        message: `${npc.name} 已经在队伍中了`
      };
    }

    // 检查招募条件
    if (!this.checkRecruitmentCondition(npcId, context)) {
      return {
        success: false,
        reason: 'condition_not_met',
        message: `不满足招募 ${npc.name} 的条件`
      };
    }

    // 招募成功
    npc.isRecruited = true;
    npc.isAvailable = false;
    this.recruitedNPCs.set(npcId, npc);

    // 触发回调
    if (this.callbacks.onNPCRecruited) {
      this.callbacks.onNPCRecruited(npc);
    }

    return {
      success: true,
      npc: npc,
      message: npc.dialogue.recruitment
    };
  }

  /**
   * 解雇NPC
   * @param {string} npcId - NPC ID
   * @returns {boolean} 是否成功解雇
   */
  dismissNPC(npcId) {
    const npc = this.recruitedNPCs.get(npcId);
    if (!npc) {
      console.warn(`NPC ${npcId} is not in the party`);
      return false;
    }

    npc.isRecruited = false;
    this.recruitedNPCs.delete(npcId);

    // 触发回调
    if (this.callbacks.onNPCDismissed) {
      this.callbacks.onNPCDismissed(npc);
    }

    return true;
  }

  /**
   * 获取NPC信息
   * @param {string} npcId - NPC ID
   * @returns {Object|null} NPC信息
   */
  getNPC(npcId) {
    return this.npcs.get(npcId) || null;
  }

  /**
   * 获取所有已招募的NPC
   * @returns {Array} 已招募的NPC列表
   */
  getRecruitedNPCs() {
    return Array.from(this.recruitedNPCs.values());
  }

  /**
   * 获取所有可招募的NPC
   * @param {Object} context - 上下文数据
   * @returns {Array} 可招募的NPC列表
   */
  getAvailableNPCs(context = {}) {
    const available = [];
    
    for (const npc of this.npcs.values()) {
      if (!npc.isRecruited && this.checkRecruitmentCondition(npc.id, context)) {
        available.push(npc);
      }
    }
    
    return available;
  }

  /**
   * 检查NPC是否已招募
   * @param {string} npcId - NPC ID
   * @returns {boolean} 是否已招募
   */
  isRecruited(npcId) {
    return this.recruitedNPCs.has(npcId);
  }

  /**
   * 检查NPC是否可招募
   * @param {string} npcId - NPC ID
   * @param {Object} context - 上下文数据
   * @returns {boolean} 是否可招募
   */
  isAvailable(npcId, context = {}) {
    const npc = this.npcs.get(npcId);
    if (!npc) {
      return false;
    }

    return !npc.isRecruited && this.checkRecruitmentCondition(npcId, context);
  }

  /**
   * 获取队伍中NPC的总战斗力
   * @returns {number} 总战斗力
   */
  getPartyPower() {
    let totalPower = 0;
    
    for (const npc of this.recruitedNPCs.values()) {
      // 简单的战斗力计算：攻击 + 防御 + 生命/10
      totalPower += npc.attributes.attack + npc.attributes.defense + (npc.attributes.maxHealth / 10);
    }
    
    return Math.floor(totalPower);
  }

  /**
   * 更新NPC属性
   * @param {string} npcId - NPC ID
   * @param {Object} attributes - 要更新的属性
   */
  updateNPCAttributes(npcId, attributes) {
    const npc = this.npcs.get(npcId);
    if (!npc) {
      console.warn(`NPC ${npcId} not found`);
      return;
    }

    Object.assign(npc.attributes, attributes);
  }

  /**
   * 更新NPC忠诚度
   * @param {string} npcId - NPC ID
   * @param {number} change - 忠诚度变化值
   */
  updateLoyalty(npcId, change) {
    const npc = this.npcs.get(npcId);
    if (!npc) {
      console.warn(`NPC ${npcId} not found`);
      return;
    }

    npc.loyalty = Math.max(0, Math.min(100, npc.loyalty + change));

    // 如果忠诚度过低，可能会自动离队
    if (npc.loyalty <= 0 && npc.isRecruited) {
      this.dismissNPC(npcId);
    }
  }

  /**
   * 设置回调函数
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    const callbackKey = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    if (this.callbacks.hasOwnProperty(callbackKey)) {
      this.callbacks[callbackKey] = callback;
    }
  }

  /**
   * 保存招募状态
   * @returns {Object} 招募状态数据
   */
  saveState() {
    return {
      recruitedNPCs: Array.from(this.recruitedNPCs.keys()),
      npcStates: Array.from(this.npcs.values()).map(npc => ({
        id: npc.id,
        isRecruited: npc.isRecruited,
        isAvailable: npc.isAvailable,
        loyalty: npc.loyalty,
        attributes: { ...npc.attributes }
      }))
    };
  }

  /**
   * 加载招募状态
   * @param {Object} state - 招募状态数据
   */
  loadState(state) {
    if (!state) {
      return;
    }

    // 恢复NPC状态
    if (state.npcStates) {
      for (const npcState of state.npcStates) {
        const npc = this.npcs.get(npcState.id);
        if (npc) {
          npc.isRecruited = npcState.isRecruited;
          npc.isAvailable = npcState.isAvailable;
          npc.loyalty = npcState.loyalty;
          Object.assign(npc.attributes, npcState.attributes);
        }
      }
    }

    // 恢复已招募的NPC
    if (state.recruitedNPCs) {
      this.recruitedNPCs.clear();
      for (const npcId of state.recruitedNPCs) {
        const npc = this.npcs.get(npcId);
        if (npc && npc.isRecruited) {
          this.recruitedNPCs.set(npcId, npc);
        }
      }
    }
  }

  /**
   * 重置系统
   */
  reset() {
    this.recruitedNPCs.clear();
    
    // 重置所有NPC状态
    for (const npc of this.npcs.values()) {
      npc.isRecruited = false;
      npc.isAvailable = false;
      npc.loyalty = 100;
    }
  }

  /**
   * 清空所有NPC
   */
  clear() {
    this.npcs.clear();
    this.recruitedNPCs.clear();
    this.conditionCheckers.clear();
  }
}
