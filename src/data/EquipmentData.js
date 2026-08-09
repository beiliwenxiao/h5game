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
 * EquipmentData.js
 * 装备数据定义和管理
 */

/**
 * 装备品质枚举
 */
export const EquipmentQuality = {
  COMMON: 0,     // 普通 - 白色
  UNCOMMON: 1,   // 不凡 - 绿色
  RARE: 2,       // 稀有 - 蓝色
  EPIC: 3,       // 史诗 - 紫色
  LEGENDARY: 4   // 传说 - 橙色
};

/**
 * 装备品质颜色映射
 */
export const QualityColors = {
  [EquipmentQuality.COMMON]: '#ffffff',
  [EquipmentQuality.UNCOMMON]: '#1eff00',
  [EquipmentQuality.RARE]: '#0070dd',
  [EquipmentQuality.EPIC]: '#a335ee',
  [EquipmentQuality.LEGENDARY]: '#ff8000'
};

/**
 * 装备品质名称映射
 */
export const QualityNames = {
  [EquipmentQuality.COMMON]: '普通',
  [EquipmentQuality.UNCOMMON]: '不凡',
  [EquipmentQuality.RARE]: '稀有',
  [EquipmentQuality.EPIC]: '史诗',
  [EquipmentQuality.LEGENDARY]: '传说'
};

/**
 * 装备类型枚举
 */
export const EquipmentType = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
  HELMET: 'helmet',
  BOOTS: 'boots',
  GLOVES: 'gloves',
  ACCESSORY: 'accessory'
};

/**
 * 装备数据管理类
 */
export class EquipmentData {
  constructor() {
    this.equipmentTemplates = this.initEquipmentTemplates();
  }

  /**
   * 初始化装备模板数据
   */
  initEquipmentTemplates() {
    return {
      // 武器
      rusty_sword: {
        id: 'rusty_sword',
        name: '生锈的剑',
        type: EquipmentType.WEAPON,
        quality: EquipmentQuality.COMMON,
        level: 1,
        description: '一把生锈的铁剑，虽然破旧但仍能使用',
        icon: 'icon_rusty_sword',
        stats: {
          attack: 5,
          elementAttack: { 0: 2 } // 火攻击+2
        },
        requirements: {
          level: 1,
          class: ['warrior']
        },
        value: 10
      },
      iron_sword: {
        id: 'iron_sword',
        name: '铁剑',
        type: EquipmentType.WEAPON,
        quality: EquipmentQuality.UNCOMMON,
        level: 5,
        description: '锋利的铁制长剑，战士的可靠伙伴',
        icon: 'icon_iron_sword',
        stats: {
          attack: 12,
          elementAttack: { 0: 5 } // 火攻击+5
        },
        requirements: {
          level: 5,
          class: ['warrior']
        },
        value: 50
      },
      strategist_talisman_staff: {
        id: 'strategist_talisman_staff',
        name: '符杖',
        type: EquipmentType.WEAPON,
        quality: EquipmentQuality.UNCOMMON,
        level: 3,
        description: '用于施展符法与指挥战阵的木制符杖',
        icon: 'icon_strategist_talisman_staff',
        stats: {
          attack: 3,
          maxMp: 20,
          elementAttack: { 2: 8, 5: 4 } // 水攻击+8，电攻击+4
        },
        requirements: {
          level: 3,
          class: ['strategist']
        },
        value: 40
      },
      hunting_bow: {
        id: 'hunting_bow',
        name: '猎弓',
        type: EquipmentType.WEAPON,
        quality: EquipmentQuality.COMMON,
        level: 2,
        description: '轻便的猎弓，适合远程攻击',
        icon: 'icon_hunting_bow',
        stats: {
          attack: 8,
          speed: 5,
          elementAttack: { 4: 4, 11: 2 } // 风攻击+4，木攻击+2
        },
        requirements: {
          level: 2,
          class: ['archer']
        },
        value: 25
      },

      // 护甲
      leather_armor: {
        id: 'leather_armor',
        name: '皮甲',
        type: EquipmentType.ARMOR,
        quality: EquipmentQuality.COMMON,
        level: 1,
        description: '简单的皮制护甲，提供基础防护',
        icon: 'icon_leather_armor',
        stats: {
          defense: 3,
          maxHp: 10,
          elementDefense: { 11: 2 } // 木防御+2
        },
        requirements: {
          level: 1
        },
        value: 15
      },
      chain_mail: {
        id: 'chain_mail',
        name: '锁子甲',
        type: EquipmentType.ARMOR,
        quality: EquipmentQuality.UNCOMMON,
        level: 4,
        description: '金属环扣编织的护甲，防护力不错',
        icon: 'icon_chain_mail',
        stats: {
          defense: 8,
          maxHp: 25,
          elementDefense: { 0: 3, 9: 4 } // 火防御+3，土防御+4
        },
        requirements: {
          level: 4,
          class: ['warrior']
        },
        value: 60
      },
      strategist_robe: {
        id: 'strategist_robe',
        name: '军师道袍',
        type: EquipmentType.ARMOR,
        quality: EquipmentQuality.UNCOMMON,
        level: 3,
        description: '便于行军与施展符法的轻便道袍',
        icon: 'icon_strategist_robe',
        stats: {
          defense: 4,
          maxMp: 30,
          elementDefense: { 2: 6, 5: 5 } // 水防御+6，电防御+5
        },
        requirements: {
          level: 3,
          class: ['strategist']
        },
        value: 45
      },

      // 头盔
      iron_helmet: {
        id: 'iron_helmet',
        name: '铁盔',
        type: EquipmentType.HELMET,
        quality: EquipmentQuality.COMMON,
        level: 2,
        description: '简单的铁制头盔，保护头部',
        icon: 'icon_iron_helmet',
        stats: {
          defense: 2,
          maxHp: 5,
          elementDefense: { 9: 2 } // 土防御+2
        },
        requirements: {
          level: 2
        },
        value: 20
      },
      strategist_headpiece: {
        id: 'strategist_headpiece',
        name: '军师方巾',
        type: EquipmentType.HELMET,
        quality: EquipmentQuality.UNCOMMON,
        level: 4,
        description: '军师常用方巾，有助于凝神筹策',
        icon: 'icon_strategist_headpiece',
        stats: {
          maxMp: 15,
          elementAttack: { 2: 3, 5: 2 } // 水攻击+3，电攻击+2
        },
        requirements: {
          level: 4,
          class: ['strategist']
        },
        value: 35
      },

      // 靴子
      leather_boots: {
        id: 'leather_boots',
        name: '皮靴',
        type: EquipmentType.BOOTS,
        quality: EquipmentQuality.COMMON,
        level: 1,
        description: '舒适的皮制靴子，略微提升移动速度',
        icon: 'icon_leather_boots',
        stats: {
          defense: 1,
          speed: 5
        },
        requirements: {
          level: 1
        },
        value: 12
      },
      swift_boots: {
        id: 'swift_boots',
        name: '疾行靴',
        type: EquipmentType.BOOTS,
        quality: EquipmentQuality.RARE,
        level: 6,
        description: '附魔的靴子，大幅提升移动速度',
        icon: 'icon_swift_boots',
        stats: {
          defense: 2,
          speed: 20,
          elementDefense: { 4: 3 } // 风防御+3
        },
        requirements: {
          level: 6
        },
        value: 80
      },

      // 手套
      leather_gloves: {
        id: 'leather_gloves',
        name: '皮手套',
        type: EquipmentType.GLOVES,
        quality: EquipmentQuality.COMMON,
        level: 1,
        description: '简单的皮制手套，提供基础保护',
        icon: 'icon_leather_gloves',
        stats: {
          defense: 1,
          attack: 1
        },
        requirements: {
          level: 1
        },
        value: 8
      },
      power_gauntlets: {
        id: 'power_gauntlets',
        name: '力量护手',
        type: EquipmentType.GLOVES,
        quality: EquipmentQuality.RARE,
        level: 7,
        description: '增强力量的魔法护手',
        icon: 'icon_power_gauntlets',
        stats: {
          defense: 3,
          attack: 8,
          elementAttack: { 0: 4 } // 火攻击+4
        },
        requirements: {
          level: 7,
          class: ['warrior']
        },
        value: 100
      },

      // 饰品
      health_ring: {
        id: 'health_ring',
        name: '生命戒指',
        type: EquipmentType.ACCESSORY,
        quality: EquipmentQuality.UNCOMMON,
        level: 3,
        description: '增加生命值的魔法戒指',
        icon: 'icon_health_ring',
        stats: {
          maxHp: 20,
          elementDefense: { 2: 2 } // 水防御+2
        },
        requirements: {
          level: 3
        },
        value: 40
      },
      strategist_talisman: {
        id: 'strategist_talisman',
        name: '护身符',
        type: EquipmentType.ACCESSORY,
        quality: EquipmentQuality.UNCOMMON,
        level: 4,
        description: '增加法力并辅助符阵运转的太平道护符',
        icon: 'icon_strategist_talisman',
        stats: {
          maxMp: 25,
          elementAttack: { 5: 3 } // 电攻击+3
        },
        requirements: {
          level: 4,
          class: ['strategist']
        },
        value: 50
      },
      speed_pendant: {
        id: 'speed_pendant',
        name: '敏捷吊坠',
        type: EquipmentType.ACCESSORY,
        quality: EquipmentQuality.RARE,
        level: 5,
        description: '提升敏捷的风元素吊坠',
        icon: 'icon_speed_pendant',
        stats: {
          speed: 15,
          elementAttack: { 4: 5 }, // 风攻击+5
          elementDefense: { 4: 3 } // 风防御+3
        },
        requirements: {
          level: 5
        },
        value: 75
      }
    };
  }

  /**
   * 获取装备模板
   * @param {string} equipmentId - 装备ID
   * @returns {Object|null}
   */
  getEquipmentTemplate(equipmentId) {
    return this.equipmentTemplates[equipmentId] || null;
  }

  /**
   * 获取所有装备模板
   * @returns {Object}
   */
  getAllEquipmentTemplates() {
    return this.equipmentTemplates;
  }

  /**
   * 根据类型获取装备模板
   * @param {string} type - 装备类型
   * @returns {Array}
   */
  getEquipmentsByType(type) {
    return Object.values(this.equipmentTemplates).filter(equipment => equipment.type === type);
  }

  /**
   * 根据品质获取装备模板
   * @param {number} quality - 装备品质
   * @returns {Array}
   */
  getEquipmentsByQuality(quality) {
    return Object.values(this.equipmentTemplates).filter(equipment => equipment.quality === quality);
  }

  /**
   * 根据等级获取装备模板
   * @param {number} level - 等级
   * @returns {Array}
   */
  getEquipmentsByLevel(level) {
    return Object.values(this.equipmentTemplates).filter(equipment => equipment.level <= level);
  }

  /**
   * 创建装备实例
   * @param {string} equipmentId - 装备ID
   * @param {Object} options - 选项
   * @returns {Object|null}
   */
  createEquipment(equipmentId, options = {}) {
    const template = this.getEquipmentTemplate(equipmentId);
    if (!template) {
      console.warn(`Equipment template not found: ${equipmentId}`);
      return null;
    }

    // 创建装备实例
    const equipment = {
      ...template,
      instanceId: `${equipmentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      durability: options.durability || 100,
      enhancement: options.enhancement || 0,
      stats: { ...template.stats }
    };

    // 应用强化等级
    if (equipment.enhancement > 0) {
      this.applyEnhancement(equipment);
    }

    return equipment;
  }

  /**
   * 应用装备强化
   * @param {Object} equipment - 装备实例
   */
  applyEnhancement(equipment) {
    const enhancementLevel = equipment.enhancement;
    const baseMultiplier = 1 + (enhancementLevel * 0.1); // 每级+10%

    // 强化基础属性
    if (equipment.stats.attack) {
      equipment.stats.attack = Math.floor(equipment.stats.attack * baseMultiplier);
    }
    if (equipment.stats.defense) {
      equipment.stats.defense = Math.floor(equipment.stats.defense * baseMultiplier);
    }
    if (equipment.stats.maxHp) {
      equipment.stats.maxHp = Math.floor(equipment.stats.maxHp * baseMultiplier);
    }
    if (equipment.stats.maxMp) {
      equipment.stats.maxMp = Math.floor(equipment.stats.maxMp * baseMultiplier);
    }

    // 强化元素属性
    if (equipment.stats.elementAttack) {
      for (const elementType in equipment.stats.elementAttack) {
        equipment.stats.elementAttack[elementType] = Math.floor(
          equipment.stats.elementAttack[elementType] * baseMultiplier
        );
      }
    }
    if (equipment.stats.elementDefense) {
      for (const elementType in equipment.stats.elementDefense) {
        equipment.stats.elementDefense[elementType] = Math.floor(
          equipment.stats.elementDefense[elementType] * baseMultiplier
        );
      }
    }
  }

  /**
   * 检查角色是否满足装备需求
   * @param {Object} equipment - 装备数据
   * @param {Object} character - 角色数据
   * @returns {boolean}
   */
  canEquip(equipment, character) {
    if (!equipment.requirements) return true;

    // 检查等级需求
    if (equipment.requirements.level && character.level < equipment.requirements.level) {
      return false;
    }

    // 检查职业需求
    if (equipment.requirements.class && !equipment.requirements.class.includes(character.class)) {
      return false;
    }

    return true;
  }
}