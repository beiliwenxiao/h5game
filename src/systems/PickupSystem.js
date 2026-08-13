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
import { InventoryTransactionService } from './InventoryTransactionService.js';

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
    this.inventoryTransactions = config.inventoryTransactions || new InventoryTransactionService();
    this._requestSequence = 0;
    
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
    this.inventoryTransactions = deps.inventoryTransactions || this.inventoryTransactions;
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
    
    return this._tryPickup(playerEntity, pickupItems, equipmentItems);
  }

  /**
   * 外部触发一次范围拾取（供 PC 左键点击物品、交互按钮等复用）
   * 效果等价于按 E 键：拾取玩家拾取半径内的物品。
   * @param {Object} playerEntity - 玩家实体
   * @param {Array} pickupItems - 可拾取物品列表
   * @param {Array} equipmentItems - 装备/掉落物品列表
   * @returns {Object} { pickedItems, removedEntities }
   */
  triggerPickup(playerEntity, pickupItems, equipmentItems, request = {}) {
    if (!playerEntity) return { pickedItems: [], removedEntities: [] };
    return this._tryPickup(playerEntity, pickupItems, equipmentItems, request);
  }

  /** 统一设备无关的拾取请求入口。 */
  requestPickup({ playerEntity, pickupItems = [], equipmentItems = [], ...request } = {}) {
    return this.triggerPickup(playerEntity, pickupItems, equipmentItems, request);
  }

  /**
   * 拾取核心逻辑：检测冷却并批量拾取范围内物品
   * @private
   */
  _tryPickup(playerEntity, pickupItems, equipmentItems, request = {}) {
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
        const result = this.pickupItem(item, playerEntity, request.operationId);
        if (result.accepted > 0) {
          pickedItems.push(item);
          pickedAny = true;
        }
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
        let result;
        if (item.getComponent?.('deathDrop')) {
          result = this.pickupContainer(item, playerEntity, request.operationId);
          if (result.complete) removedEntities.push(item);
        } else if (item.tags && item.tags.includes('loot')) {
          result = this.pickupLoot(item, playerEntity, request.operationId);
          if (result.complete) removedEntities.push(item);
        } else {
          result = this.pickupItem(item, playerEntity, request.operationId);
          if (result.accepted > 0) pickedItems.push(item);
        }
        if (result.accepted > 0) pickedAny = true;
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
  pickupItem(item, playerEntity, requestId = null) {
    if (item.picked) return { accepted: 0, remainder: 0, complete: true };

    const inventory = playerEntity.getComponent('inventory');
    const requested = Math.max(1, Number(item.quantity) || 1);
    if (!inventory) return { accepted: 0, remainder: requested, complete: false, code: 'missingInventory' };

    const itemData = {
      id: item.itemId || item.id,
      instanceId: item.instanceId,
      name: item.name,
      type: item.type,
      subType: item.subType,
      description: item.description || '',
      rarity: item.rarity || 0,
      maxStack: item.instanceId ? 1 : (item.maxStack || 1),
      usable: item.usable || false,
      effect: item.effect || null,
      stats: item.stats || {}
    };
    // 稳定资源 ID 必须随物品进入背包，否则 UI 图标会退回硬编码手绘或首字占位。
    for (const key of ['heal', 'attackSpeed', 'ranged', 'attackRange', 'attackDistance', 'pierce', 'multishot',
      'toolType', 'durability', 'maxDurability', 'imageId', 'assetId', 'iconImageId']) {
      if (item[key] !== undefined) itemData[key] = item[key];
    }

    const stableId = item.placementId || item.entityId || item.id || 'world-item';
    const result = this.inventoryTransactions.commit({
      type: 'add', inventory, item: itemData, quantity: requested, allowPartial: true,
      operationId: requestId
        ? `${requestId}:${stableId}:${requested}`
        : `pickup:${stableId}:${requested}:${this._requestSequence++}`
    });
    const accepted = result.ok ? result.accepted : 0;
    const remainder = requested - accepted;
    item.quantity = remainder;
    item.picked = remainder === 0;
    if (accepted === 0) return { ...result, accepted, remainder, complete: false };

    this._showPickupFeedback(item.name, accepted, playerEntity);
    if (this.onPickupCallback) {
      this.onPickupCallback({ ...item, quantity: accepted, picked: item.picked }, playerEntity);
    }
    return { ...result, accepted, remainder, complete: item.picked };
  }

  _showPickupFeedback(name, quantity, playerEntity) {
    if (!this.floatingTextManager) return;
    const transform = playerEntity.getComponent('transform');
    if (!transform) return;
    const text = quantity > 1 ? `获得 ${name} ×${quantity}` : `获得 ${name}`;
    this.floatingTextManager.addText(
      transform.position.x,
      transform.position.y - 30,
      text,
      '#00ff00'
    );
  }

  /** DeathDrop 多物品容器支持逐项、部分拾取；溢出保留在世界。 */
  pickupContainer(dropEntity, playerEntity, requestId = null) {
    const container = dropEntity?.getComponent?.('deathDrop');
    const inventory = playerEntity?.getComponent?.('inventory');
    if (!container || !inventory || dropEntity.picked) {
      return { accepted: 0, complete: !!dropEntity?.picked, code: 'invalidContainer' };
    }
    let accepted = 0;
    const picked = [];
    for (const stack of [...container.stacks]) {
      const result = this.inventoryTransactions.commit({
        type: 'add', inventory, item: stack.item, quantity: stack.quantity, allowPartial: true,
        operationId: requestId
          ? `${requestId}:${dropEntity.id}:${stack.id}:${stack.quantity}`
          : `deathdrop:${dropEntity.id}:${stack.id}:${stack.quantity}:${this._requestSequence++}`
      });
      const quantity = result.ok ? result.accepted : 0;
      if (quantity <= 0) continue;
      container.take(stack.id, quantity);
      accepted += quantity;
      picked.push({ item: stack.item, quantity });
      this._showPickupFeedback(stack.item.name || stack.item.id, quantity, playerEntity);
      this.onPickupCallback?.({ ...stack.item, quantity }, playerEntity);
    }
    dropEntity.picked = container.isEmpty();
    return {
      ok: accepted > 0,
      code: accepted > 0 ? null : 'inventoryFull',
      accepted,
      picked,
      remainder: container.stacks.reduce((sum, stack) => sum + stack.quantity, 0),
      complete: dropEntity.picked
    };
  }

  /**
   * 拾取掉落物
   * @param {Object} lootEntity - 掉落物实体
   * @param {Object} playerEntity - 玩家实体
   */
  pickupLoot(lootEntity, playerEntity, requestId = null) {
    const itemData = lootEntity.itemData;
    if (!itemData || lootEntity.picked) return { accepted: 0, remainder: 0, complete: !!lootEntity.picked };

    const inventory = playerEntity.getComponent('inventory');
    if (!inventory) return { accepted: 0, remainder: 1, complete: false, code: 'missingInventory' };
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
      if (itemData.type === 'health_potion') item.effect = { type: 'heal', value: itemData.value || 50 };
      else if (itemData.type === 'mana_potion') item.effect = { type: 'restore_mana', value: itemData.value || 30 };
    }

    const result = this.inventoryTransactions.commit({
      type: 'add', inventory, item, quantity: 1, allowPartial: false,
      operationId: requestId
        ? `${requestId}:${lootEntity.id || item.id}`
        : `pickup-loot:${lootEntity.id || item.id}:${this._requestSequence++}`
    });
    const accepted = result.ok ? result.accepted : 0;
    lootEntity.picked = accepted === 1;
    if (accepted) this._showPickupFeedback(item.name, accepted, playerEntity);
    return { ...result, accepted, remainder: 1 - accepted, complete: lootEntity.picked };
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
    // 不设图片来源（掉落物由 renderEntity 的占位分支/ItemIconRenderer 绘制），
    // 避免 renderEntity 每帧 getAsset('loot_sprite') 刷 "Image not found" 警告
    const sprite = new SpriteComponent('', {
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
