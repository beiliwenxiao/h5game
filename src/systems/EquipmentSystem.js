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
 * EquipmentSystem.js
 * 装备系统 - 管理装备的穿戴、卸下和属性计算
 */

/**
 * 装备系统类
 */
export class EquipmentSystem {
  constructor() {
    this.name = 'EquipmentSystem';
  }

  /**
   * 更新装备系统
   * @param {number} deltaTime - 帧间隔时间
   * @param {Array} entities - 实体数组
   */
  update(deltaTime, entities) {
    // 装备系统主要处理装备变化时的属性重新计算
    // 这里可以添加装备耐久度损耗等逻辑
    for (const entity of entities) {
      const equipmentComponent = entity.getComponent('equipment');
      if (equipmentComponent) {
        this.updateEquipmentEffects(entity, equipmentComponent, deltaTime);
      }
    }
  }

  /**
   * 更新装备效果
   * @param {Entity} entity - 实体
   * @param {EquipmentComponent} equipmentComponent - 装备组件
   * @param {number} deltaTime - 帧间隔时间
   */
  updateEquipmentEffects(entity, equipmentComponent, deltaTime) {
    // 这里可以添加装备的特殊效果处理
    // 比如装备耐久度损耗、特殊装备的持续效果等
  }

  /**
   * 装备物品
   * @param {Entity} entity - 实体
   * @param {string} slotType - 装备槽位
   * @param {Object} equipment - 装备数据
   * @returns {Object|null} 被替换的装备
   */
  equipItem(entity, slotType, equipment) {
    const equipmentComponent = entity.getComponent('equipment');
    if (!equipmentComponent) {
      console.warn('Entity does not have equipment component');
      return null;
    }

    // 装备物品
    const oldEquipment = equipmentComponent.equip(slotType, equipment);
    
    // 更新实体属性
    this.updateEntityStats(entity);
    
    return oldEquipment;
  }

  /**
   * 卸下装备
   * @param {Entity} entity - 实体
   * @param {string} slotType - 装备槽位
   * @returns {Object|null} 被卸下的装备
   */
  unequipItem(entity, slotType) {
    const equipmentComponent = entity.getComponent('equipment');
    if (!equipmentComponent) {
      console.warn('Entity does not have equipment component');
      return null;
    }

    // 卸下装备
    const equipment = equipmentComponent.unequip(slotType);
    
    // 更新实体属性
    this.updateEntityStats(entity);
    
    return equipment;
  }
  /**
   * 更新实体属性（应用装备加成）
   * @param {Entity} entity - 实体
   */
  updateEntityStats(entity) {
    const statsComponent = entity.getComponent('stats');
    const equipmentComponent = entity.getComponent('equipment');
    
    if (!statsComponent || !equipmentComponent) return;

    // 先重置到基础属性
    statsComponent.resetToBaseStats();

    // 获取装备属性加成
    const bonusStats = equipmentComponent.getBonusStats();
    
    // 保存当前HP/MP比例
    const hpRatio = statsComponent.maxHp > 0 ? statsComponent.hp / statsComponent.maxHp : 1;
    const mpRatio = statsComponent.maxMp > 0 ? statsComponent.mp / statsComponent.maxMp : 1;
    
    // 应用装备加成
    if (bonusStats.attack) {
      statsComponent.attack += bonusStats.attack;
    }
    if (bonusStats.defense) {
      statsComponent.defense += bonusStats.defense;
    }
    if (bonusStats.maxHp) {
      statsComponent.maxHp += bonusStats.maxHp;
      statsComponent.hp = Math.floor(statsComponent.maxHp * hpRatio);
    }
    if (bonusStats.maxMp) {
      statsComponent.maxMp += bonusStats.maxMp;
      statsComponent.mp = Math.floor(statsComponent.maxMp * mpRatio);
    }
    if (bonusStats.speed) {
      statsComponent.speed += bonusStats.speed;
    }
    
    // 应用元素攻击加成
    if (bonusStats.elementAttack) {
      for (const elementType in bonusStats.elementAttack) {
        statsComponent.addElementAttack(elementType, bonusStats.elementAttack[elementType]);
      }
    }
    
    // 应用元素防御加成
    if (bonusStats.elementDefense) {
      for (const elementType in bonusStats.elementDefense) {
        statsComponent.addElementDefense(elementType, bonusStats.elementDefense[elementType]);
      }
    }
    
    console.log('EquipmentSystem: 更新实体属性', {
      attack: statsComponent.attack,
      defense: statsComponent.defense,
      maxHp: statsComponent.maxHp,
      maxMp: statsComponent.maxMp,
      speed: statsComponent.speed
    });
  }

  /**
   * 计算装备总价值
   * @param {Entity} entity - 实体
   * @returns {number} 总价值
   */
  calculateTotalEquipmentValue(entity) {
    const equipmentComponent = entity.getComponent('equipment');
    if (!equipmentComponent) return 0;

    let totalValue = 0;
    const allEquipment = equipmentComponent.getAllEquipment();
    
    for (const slotType in allEquipment) {
      const equipment = allEquipment[slotType];
      if (equipment && equipment.value) {
        totalValue += equipment.value;
      }
    }
    
    return totalValue;
  }

  /**
   * 获取装备总属性加成
   * @param {Entity} entity - 实体
   * @returns {Object} 属性加成对象
   */
  getTotalEquipmentBonus(entity) {
    const equipmentComponent = entity.getComponent('equipment');
    if (!equipmentComponent) {
      return {
        attack: 0,
        defense: 0,
        maxHp: 0,
        maxMp: 0,
        speed: 0,
        elementAttack: {},
        elementDefense: {}
      };
    }

    return equipmentComponent.getBonusStats();
  }

  /**
   * 检查装备是否损坏
   * @param {Entity} entity - 实体
   * @returns {Array} 损坏的装备列表
   */
  getBrokenEquipment(entity) {
    const equipmentComponent = entity.getComponent('equipment');
    if (!equipmentComponent) return [];

    const brokenEquipment = [];
    const allEquipment = equipmentComponent.getAllEquipment();
    
    for (const slotType in allEquipment) {
      const equipment = allEquipment[slotType];
      if (equipment && equipment.durability <= 0) {
        brokenEquipment.push({ slotType, equipment });
      }
    }
    
    return brokenEquipment;
  }

  /**
   * 修复装备
   * @param {Entity} entity - 实体
   * @param {string} slotType - 装备槽位
   * @param {number} repairAmount - 修复量（0-100）
   * @returns {boolean} 是否修复成功
   */
  repairEquipment(entity, slotType, repairAmount = 100) {
    const equipmentComponent = entity.getComponent('equipment');
    if (!equipmentComponent) return false;

    const equipment = equipmentComponent.getEquipment(slotType);
    if (!equipment) return false;

    equipment.durability = Math.min(100, equipment.durability + repairAmount);
    return true;
  }

  /**
   * 损坏装备（战斗中使用）
   * @param {Entity} entity - 实体
   * @param {number} damageAmount - 损坏量
   */
  damageEquipment(entity, damageAmount = 1) {
    const equipmentComponent = entity.getComponent('equipment');
    if (!equipmentComponent) return;

    const allEquipment = equipmentComponent.getAllEquipment();
    
    // 随机选择一件装备进行损坏
    const equippedSlots = Object.keys(allEquipment).filter(slot => allEquipment[slot] !== null);
    if (equippedSlots.length === 0) return;

    const randomSlot = equippedSlots[Math.floor(Math.random() * equippedSlots.length)];
    const equipment = allEquipment[randomSlot];
    
    if (equipment) {
      equipment.durability = Math.max(0, equipment.durability - damageAmount);
      
      // 如果装备完全损坏，可能需要特殊处理
      if (equipment.durability === 0) {
        console.log(`Equipment ${equipment.name} is broken!`);
        // 这里可以触发装备损坏事件
      }
    }
  }
}