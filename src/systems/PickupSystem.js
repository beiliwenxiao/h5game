/**
 * PickupSystem.js
 * 拾取系统 - 处理物品拾取、掉落物拾取、武器拾取
 * 
 * 支持：
 * - 按键触发批量拾取
 * - 拾取范围检测
 * - 物品添加到背包
 * - 掉落物生成
 * - 飘字提示
 */

import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../ecs/components/TransformComponent.js';
import { SpriteComponent } from '../ecs/components/SpriteComponent.js';
import { NameComponent } from '../ecs/components/NameComponent.js';

export class PickupSystem {
  /**
   * @param {Object} config - 配置
   * @param {number} config.pickupRadius - 拾取半径，默认75
   * @param {number} config.pickupCooldown - 拾取冷却（毫秒），默认300
   * @param {string} config.pickupKey - 拾取按键，默认'e'
   */
  constructor(config = {}) {
    this.pickupRadius = config.pickupRadius ?? 75;
    this.pickupCooldown = config.pickupCooldown ?? 300;
    this.pickupKey = config.pickupKey ?? 'e';
    this.lastPickupTime = 0;
    
    // 外部引用（通过 init 注入）
    this.inputManager = null;
    this.floatingTextManager = null;
    this.weaponRenderer = null;
    
    // 回调
    this.onPickupCallback = null;
  }

  /**
   * 初始化系统依赖
   * @param {Object} deps - 依赖注入
   */
  init(deps = {}) {
    this.inputManager = deps.inputManager || null;
    this.floatingTextManager = deps.floatingTextManager || null;
    this.weaponRenderer = deps.weaponRenderer || null;
  }

  /**
   * 设置拾取回调
   * @param {Function} callback - (item, playerEntity) => void
   */
  onPickup(callback) {
    this.onPickupCallback = callback;
  }

  /**
   * 更新拾取检测
   * @param {Object} playerEntity - 玩家实体
   * @param {Array} pickupItems - 可拾取物品列表
   * @param {Array} equipmentItems - 装备物品列表
   * @param {Array} entities - 实体列表（用于移除掉落物）
   * @returns {Object} { pickedItems, removedEntities } 拾取结果
   */
  update(playerEntity, pickupItems, equipmentItems, entities) {
    if (!playerEntity || !this.inputManager) return { pickedItems: [], removedEntities: [] };
    
    const ePressed = this.inputManager.isKeyDown(this.pickupKey) || 
                     this.inputManager.isKeyDown(this.pickupKey.toUpperCase());
    if (!ePressed) return { pickedItems: [], removedEntities: [] };
    
    const transform = playerEntity.getComponent('transform');
    if (!transform) return { pickedItems: [], removedEntities: [] };
    
    const now = Date.now();
    if (now - this.lastPickupTime < this.pickupCooldown) {
      return { pickedItems: [], removedEntities: [] };
    }
    
    const playerX = transform.position.x;
    const playerY = transform.position.y;
    const pickedItems = [];
    const removedEntities = [];
    let pickedAny = false;
    
    // 批量检查可拾取物品
    for (const item of pickupItems) {
      if (item.picked) continue;
      
      const dx = item.x - playerX;
      const dy = item.y - playerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= this.pickupRadius) {
        this.pickupItem(item, playerEntity);
        pickedItems.push(item);
        pickedAny = true;
      }
    }
    
    // 批量检查装备/掉落物品
    for (let i = equipmentItems.length - 1; i >= 0; i--) {
      const item = equipmentItems[i];
      if (item.picked) continue;
      
      const itemTransform = item.getComponent ? item.getComponent('transform') : null;
      const itemX = itemTransform ? itemTransform.position.x : item.x;
      const itemY = itemTransform ? itemTransform.position.y : item.y;
      
      const dx = itemX - playerX;
      const dy = itemY - playerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= this.pickupRadius) {
        if (item.tags && item.tags.includes('loot')) {
          this.pickupLoot(item, playerEntity);
          equipmentItems.splice(i, 1);
          removedEntities.push(item);
        } else {
          this.pickupItem(item, playerEntity);
          pickedItems.push(item);
        }
        pickedAny = true;
      }
    }
    
    if (pickedAny) {
      this.lastPickupTime = now;
    }
    
    return { pickedItems, removedEntities };
  }

  /**
   * 拾取物品
   * @param {Object} item - 物品对象
   * @param {Object} playerEntity - 玩家实体
   */
  pickupItem(item, playerEntity) {
    if (item.picked) return;
    
    item.picked = true;
    
    const inventory = playerEntity.getComponent('inventory');
    if (inventory) {
      const itemData = {
        id: item.id,
        name: item.name,
        type: item.type,
        subType: item.subType,
        description: item.description || '',
        rarity: item.rarity || 0,
        maxStack: item.maxStack || 1,
        usable: item.usable || false,
        effect: item.effect || null,
        stats: item.stats || {}
      };
      
      if (item.heal) itemData.heal = item.heal;
      if (item.attackSpeed != null) itemData.attackSpeed = item.attackSpeed;
      if (item.ranged) itemData.ranged = true;
      if (item.quantity != null) itemData.quantity = item.quantity;
      if (item.attackRange != null) itemData.attackRange = item.attackRange;
      if (item.attackDistance != null) itemData.attackDistance = item.attackDistance;
      if (item.pierce != null) itemData.pierce = item.pierce;
      if (item.multishot != null) itemData.multishot = item.multishot;
      
      inventory.addItem(itemData, item.quantity || 1);
    }
    
    if (this.onPickupCallback) {
      this.onPickupCallback(item, playerEntity);
    }
  }

  /**
   * 拾取掉落物
   * @param {Object} lootEntity - 掉落物实体
   * @param {Object} playerEntity - 玩家实体
   */
  pickupLoot(lootEntity, playerEntity) {
    const itemData = lootEntity.itemData;
    if (!itemData) return;

    const inventory = playerEntity.getComponent('inventory');
    if (inventory) {
      const item = {
        id: itemData.id || itemData.type,
        name: itemData.name,
        type: 'consumable',
        subType: itemData.type,
        description: itemData.description || '',
        rarity: itemData.rarity || 'common',
        maxStack: itemData.maxStack || 20,
        usable: true,
        effect: itemData.effect || null,
        stats: {}
      };

      if (!item.effect) {
        if (itemData.type === 'health_potion') {
          item.effect = { type: 'heal', value: itemData.value || 50 };
        } else if (itemData.type === 'mana_potion') {
          item.effect = { type: 'restore_mana', value: itemData.value || 30 };
        }
      }

      inventory.addItem(item);

      const transform = playerEntity.getComponent('transform');
      if (transform && this.floatingTextManager) {
        this.floatingTextManager.addText(
          transform.position.x,
          transform.position.y - 30,
          `获得: ${item.name}`,
          '#00ff00'
        );
      }
    }
  }

  /**
   * 生成掉落物
   * @param {Object} position - {x, y} 掉落位置
   * @param {Array} lootItems - 掉落物品列表
   * @returns {Array} 创建的掉落物实体列表
   */
  spawnLootItems(position, lootItems) {
    if (!lootItems || lootItems.length === 0) return [];
    
    const entities = [];
    lootItems.forEach((item, index) => {
      const angle = (index / lootItems.length) * Math.PI * 2;
      const radius = 30;
      const dropX = position.x + Math.cos(angle) * radius;
      const dropY = position.y + Math.sin(angle) * radius;
      
      const lootEntity = this.createLootEntity(item, dropX, dropY);
      entities.push(lootEntity);
    });
    return entities;
  }

  /**
   * 创建掉落物实体
   * @param {Object} item - 物品数据
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @returns {Entity} 掉落物实体
   */
  createLootEntity(item, x, y) {
    const entity = new Entity(`loot_${Date.now()}_${Math.random()}`, 'loot');
    
    entity.addComponent(new TransformComponent(x, y));
    
    const color = item.type === 'health_potion' ? '#ff3333' : '#3333ff';
    const sprite = new SpriteComponent('loot_sprite', {
      width: 16, height: 24, color, visible: true, defaultAnimation: 'idle'
    });
    sprite.addAnimation('idle', { frames: [0], frameRate: 1, loop: true });
    sprite.playAnimation('idle');
    entity.addComponent(sprite);
    
    const nameComp = new NameComponent(item.name, {
      color: '#ffff00', fontSize: 14, offsetY: -20, visible: true
    });
    entity.addComponent(nameComp);
    
    entity.itemData = item;
    entity.tags = ['loot'];
    
    return entity;
  }

  /**
   * 检查武器拾取
   * @param {Object} playerEntity - 玩家实体
   * @returns {boolean} 是否拾取成功
   */
  checkWeaponPickup(playerEntity) {
    if (!this.weaponRenderer || !playerEntity) return false;
    
    const playerTransform = playerEntity.getComponent('transform');
    if (!playerTransform) return false;
    
    const picked = this.weaponRenderer.retrieveWeapon(playerEntity);
    
    if (picked && this.floatingTextManager) {
      this.floatingTextManager.addText(
        playerTransform.position.x,
        playerTransform.position.y - 30,
        '拾取武器',
        '#00ff00'
      );
    }
    
    return picked;
  }
}
