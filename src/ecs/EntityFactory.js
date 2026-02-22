/**
 * EntityFactory.js
 * 实体工厂 - 根据模板数据创建实体
 */

import { Entity } from './Entity.js';
import { TransformComponent } from './components/TransformComponent.js';
import { StatsComponent } from './components/StatsComponent.js';
import { SpriteComponent } from './components/SpriteComponent.js';
import { CombatComponent } from './components/CombatComponent.js';
import { MovementComponent } from './components/MovementComponent.js';
import { EquipmentComponent } from './components/EquipmentComponent.js';
import { InventoryComponent } from './components/InventoryComponent.js';
import { NameComponent } from './components/NameComponent.js';

/**
 * 实体工厂类
 * 提供创建各种游戏实体的工厂方法
 */
export class EntityFactory {
  constructor() {
    this.entityIdCounter = 0;
  }

  /**
   * 生成唯一实体ID
   * @returns {string}
   */
  generateId() {
    return `entity_${++this.entityIdCounter}`;
  }

  /**
   * 创建玩家实体
   * @param {Object} characterData - 角色数据
   * @param {string} characterData.name - 角色名称
   * @param {string} characterData.class - 职业
   * @param {number} characterData.level - 等级
   * @param {Object} characterData.stats - 属性数据
   * @param {Object} characterData.position - 位置
   * @param {Array} characterData.skills - 技能列表
   * @returns {Entity}
   */
  createPlayer(characterData) {
    const entity = new Entity(characterData.id || this.generateId(), 'player');
    
    // 设置阵营（玩家/友军阵营）
    entity.faction = 'ally';
    
    // 添加变换组件
    const position = characterData.position || { x: 0, y: 0 };
    entity.addComponent(new TransformComponent(position.x, position.y));
    
    // 添加属性组件
    const stats = characterData.stats || {};
    entity.addComponent(new StatsComponent({
      maxHp: stats.maxHp || 100,
      hp: stats.hp,
      maxMp: stats.maxMp || 100,
      mp: stats.mp,
      attack: stats.attack || 10,
      defense: stats.defense || 5,
      speed: stats.speed || 100,
      level: characterData.level || 1,
      exp: characterData.exp || 0,
      mainElement: stats.mainElement || 0,
      elementAttack: stats.elementAttack || {},
      elementDefense: stats.elementDefense || {},
      unitType: stats.unitType || 0
    }));
    
    // 添加精灵组件（使用4x8动画精灵）
    const spriteSheet = 'player_animated'; // 使用新的精灵图
    const sprite = new SpriteComponent(spriteSheet, {
      width: 64,   // 放大两倍：32 -> 64
      height: 64,  // 放大两倍：32 -> 64
      defaultAnimation: 'idle',
      useAnimatedSprite: true,   // 启用动画精灵
      spriteColumns: 4,          // 4列（动画帧）
      spriteRows: 8,             // 8行（方向）
      direction: 'down',         // 默认朝下
      walkFrameDuration: 150,    // 每帧150ms
      directionRowMap: {
        'down-left': 0,
        'up-right': 1,
        'up-left': 2,
        'down-right': 3,
        'left': 4,
        'right': 5,
        'up': 6,
        'down': 7,
        'idle': 7       // idle用down行
      }
    });
    
    // 添加基础动画
    this.addCharacterAnimations(sprite);
    entity.addComponent(sprite);
    
    // 添加战斗组件
    const combat = new CombatComponent({
      attackRange: 50,
      attackCooldown: 1000
    });
    
    // 添加技能
    if (characterData.skills) {
      characterData.skills.forEach(skill => {
        combat.addSkill(skill);
      });
    }
    entity.addComponent(combat);
    
    // 添加移动组件
    entity.addComponent(new MovementComponent({
      speed: stats.speed || 100
    }));
    
    // 添加装备组件
    entity.addComponent(new EquipmentComponent({
      equipment: characterData.equipment || {}
    }));
    
    // 添加背包组件
    entity.addComponent(new InventoryComponent({
      maxSlots: 30,
      items: characterData.inventory || []
    }));
    
    // 存储角色名称和职业
    entity.name = characterData.name;
    entity.class = characterData.class;
    
    return entity;
  }

  /**
   * 创建敌人实体
   * @param {Object} enemyData - 敌人数据
   * @param {string} enemyData.templateId - 敌人模板ID
   * @param {string} enemyData.name - 敌人名称
   * @param {number} enemyData.level - 等级
   * @param {Object} enemyData.stats - 属性数据
   * @param {Object} enemyData.position - 位置
   * @param {string} enemyData.aiType - AI类型
   * @returns {Entity}
   */
  createEnemy(enemyData) {
    const entity = new Entity(enemyData.id || this.generateId(), 'enemy');
    
    // 设置阵营（敌人阵营）
    entity.faction = 'enemy';
    
    // 添加变换组件
    const position = enemyData.position || { x: 0, y: 0 };
    entity.addComponent(new TransformComponent(position.x, position.y));
    
    // 添加属性组件
    const stats = enemyData.stats || {};
    entity.addComponent(new StatsComponent({
      maxHp: stats.maxHp || 50,
      hp: stats.hp,
      maxMp: stats.maxMp || 0,
      mp: stats.mp,
      attack: stats.attack || 5,
      defense: stats.defense || 2,
      speed: stats.speed || 80,
      level: enemyData.level || 1,
      exp: 0,
      mainElement: stats.mainElement || 0,
      elementAttack: stats.elementAttack || {},
      elementDefense: stats.elementDefense || {},
      unitType: stats.unitType || 0
    }));
    
    // 添加精灵组件
    const spriteSheet = this.getSpriteSheetForEnemy(enemyData.templateId);
    const isAnimated = spriteSheet.startsWith('enemy_animated_');
    const sprite = new SpriteComponent(spriteSheet, {
      width: isAnimated ? 64 : 32,
      height: isAnimated ? 64 : 32,
      defaultAnimation: 'idle',
      useAnimatedSprite: isAnimated,
      spriteColumns: isAnimated ? 4 : undefined,
      spriteRows: isAnimated ? 8 : undefined,
      direction: 'down',
      walkFrameDuration: 150,
      directionRowMap: isAnimated ? {
        'down-left': 0,
        'up-right': 1,
        'up-left': 2,
        'down-right': 3,
        'left': 4,
        'right': 5,
        'up': 6,
        'down': 7,
        'idle': 7
      } : undefined
    });
    
    // 添加基础动画
    this.addCharacterAnimations(sprite);
    entity.addComponent(sprite);
    
    // 添加战斗组件
    const combat = new CombatComponent({
      attackRange: 40,
      attackCooldown: 1500
    });
    entity.addComponent(combat);
    
    // 添加移动组件
    entity.addComponent(new MovementComponent({
      speed: stats.speed || 80
    }));
    
    // 添加名字组件
    entity.addComponent(new NameComponent(enemyData.name, {
      color: '#ff6666',
      fontSize: 14,
      offsetY: -10
    }));
    
    // 存储敌人信息
    entity.name = enemyData.name;
    entity.templateId = enemyData.templateId;
    entity.aiType = enemyData.aiType || 'passive';
    entity.lootTable = enemyData.lootTable || [];
    
    // 添加敌人标签
    entity.tags = entity.tags || [];
    entity.tags.push('enemy');
    
    return entity;
  }

  /**
   * 根据职业获取精灵图集
   * @param {string} className - 职业名称
   * @returns {string}
   */
  getSpriteSheetForClass(className) {
    // 返回九宫格方向精灵的名称
    const spriteSheets = {
      'warrior': 'directional_warrior',
      'mage': 'directional_mage',
      'archer': 'directional_archer',
      'refugee': 'directional_refugee'
    };
    return spriteSheets[className] || 'directional_refugee';
  }

  /**
   * 根据敌人模板ID获取精灵图集
   * @param {string} templateId - 模板ID
   * @returns {string}
   */
  getSpriteSheetForEnemy(templateId) {
    // 支持4x8动画精灵的敌人类型
    const animatedEnemies = {
      'wild_dog': 'enemy_animated_wild_dog',
      'soldier': 'enemy_animated_soldier',
      'government_soldier': 'enemy_animated_government_soldier',
      'bandit': 'enemy_animated_bandit',
      'starving': 'enemy_animated_starving',
      'refugee': 'enemy_animated_refugee'
    };
    if (animatedEnemies[templateId]) {
      return animatedEnemies[templateId];
    }
    const spriteSheets = {
      'slime': 'slime_sprite',
      'goblin': 'goblin_sprite',
      'skeleton': 'skeleton_sprite'
    };
    return spriteSheets[templateId] || 'enemy_default_sprite';
  }

  /**
   * 为角色添加基础动画
   * @param {SpriteComponent} sprite - 精灵组件
   */
  addCharacterAnimations(sprite) {
    // 待机动画
    sprite.addAnimation('idle', {
      frames: [0],
      frameRate: 1,
      loop: true
    });
    
    // 行走动画
    sprite.addAnimation('walk', {
      frames: [0, 1, 2, 3],
      frameRate: 8,
      loop: true
    });
    
    // 攻击动画
    sprite.addAnimation('attack', {
      frames: [4, 5, 6],
      frameRate: 10,
      loop: false
    });
    
    // 技能动画
    sprite.addAnimation('skill', {
      frames: [7, 8, 9],
      frameRate: 10,
      loop: false
    });
    
    // 受击动画
    sprite.addAnimation('hit', {
      frames: [10],
      frameRate: 10,
      loop: false
    });
    
    // 死亡动画
    sprite.addAnimation('death', {
      frames: [11, 12, 13],
      frameRate: 8,
      loop: false
    });
  }

  /**
   * 创建NPC实体
   * @param {Object} npcData - NPC数据
   * @returns {Entity}
   */
  createNPC(npcData) {
    const entity = new Entity(npcData.id || this.generateId(), 'npc');
    
    // 添加变换组件
    const position = npcData.position || { x: 0, y: 0 };
    entity.addComponent(new TransformComponent(position.x, position.y));
    
    // 添加精灵组件
    const sprite = new SpriteComponent(npcData.spriteSheet || 'npc_sprite', {
      width: 32,
      height: 32,
      defaultAnimation: 'idle'
    });
    sprite.addAnimation('idle', {
      frames: [0],
      frameRate: 1,
      loop: true
    });
    entity.addComponent(sprite);
    
    // 存储NPC信息
    entity.name = npcData.name;
    entity.dialogue = npcData.dialogue || [];
    
    return entity;
  }
}
