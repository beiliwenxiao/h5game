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
 * InventoryComponent.js
 * 背包组件 - 管理实体的物品存储
 */

import { Component } from '../Component.js';

/**
 * 物品堆叠信息
 */
class ItemStack {
  constructor(item, quantity = 1) {
    this.item = item;
    this.quantity = quantity;
    this.maxStack = item.maxStack || 1;
  }

  /**
   * 是否可以堆叠更多物品
   * @param {number} amount - 要添加的数量
   * @returns {boolean}
   */
  canStack(amount = 1) {
    return this.quantity + amount <= this.maxStack;
  }

  /**
   * 添加物品到堆叠
   * @param {number} amount - 添加数量
   * @returns {number} 实际添加的数量
   */
  addToStack(amount) {
    const canAdd = Math.min(amount, this.maxStack - this.quantity);
    this.quantity += canAdd;
    return canAdd;
  }

  /**
   * 从堆叠中移除物品
   * @param {number} amount - 移除数量
   * @returns {number} 实际移除的数量
   */
  removeFromStack(amount) {
    const canRemove = Math.min(amount, this.quantity);
    this.quantity -= canRemove;
    return canRemove;
  }

  /**
   * 是否为空堆叠
   * @returns {boolean}
   */
  isEmpty() {
    return this.quantity <= 0;
  }

  /**
   * 是否为满堆叠
   * @returns {boolean}
   */
  isFull() {
    return this.quantity >= this.maxStack;
  }
}

/**
 * 背包组件
 */
export class InventoryComponent extends Component {
  /**
   * @param {Object} options - 背包配置
   * @param {number} options.maxSlots - 最大槽位数量
   * @param {Array} options.items - 初始物品
   */
  constructor(options = {}) {
    super('inventory');
    this.definitionResolver = typeof options.definitionResolver === 'function' ? options.definitionResolver : null;
    
    this.maxSlots = options.maxSlots || 24; // 默认24个槽位（6x4）
    this.slots = new Array(this.maxSlots).fill(null); // 槽位数组
    
    // 物品分类过滤器
    this.filters = {
      all: () => true,
      equipment: (item) => item.type === 'equipment' || ['weapon', 'armor', 'helmet', 'boots', 'gloves', 'accessory'].includes(item.type),
      consumable: (item) => item.type === 'consumable',
      material: (item) => item.type === 'material',
      quest: (item) => item.type === 'quest'
    };
    
    this.currentFilter = 'all';
    
    // 初始化物品
    if (options.items) {
      this.loadItems(options.items);
    }
  }

  setDefinitionResolver(definitionResolver) {
    this.definitionResolver = typeof definitionResolver === 'function' ? definitionResolver : null;
    return this;
  }

  /**
   * 只扩不缩地确保背包具有至少指定数量的槽位，保留全部现有物品。
   * @param {number} minimumSlots
   * @returns {boolean} 是否扩容
   */
  ensureSlotCapacity(minimumSlots) {
    const target = Math.max(0, Math.floor(Number(minimumSlots) || 0));
    if (target <= this.maxSlots) return false;
    this.slots.push(...new Array(target - this.maxSlots).fill(null));
    this.maxSlots = target;
    return true;
  }

  /**
   * 添加物品到背包
   * @param {Object} item - 物品数据
   * @param {number} quantity - 数量
   * @returns {number} 实际添加的数量
   */
  addItem(item, quantity = 1) {
    let remainingQuantity = quantity;
    
    // 首先尝试堆叠到现有物品
    if (item.maxStack > 1) {
      for (let i = 0; i < this.slots.length && remainingQuantity > 0; i++) {
        const slot = this.slots[i];
        if (slot && slot.item.id === item.id &&
            !slot.item.instanceId && !item.instanceId && !slot.isFull()) {
          const added = slot.addToStack(remainingQuantity);
          remainingQuantity -= added;
        }
      }
    }
    
    // 然后添加到空槽位
    for (let i = 0; i < this.slots.length && remainingQuantity > 0; i++) {
      if (this.slots[i] === null) {
        const stackSize = Math.min(remainingQuantity, item.maxStack || 1);
        this.slots[i] = new ItemStack(item, stackSize);
        remainingQuantity -= stackSize;
      }
    }
    
    return quantity - remainingQuantity;
  }

  /**
   * 移除物品
   * @param {string} itemId - 物品ID
   * @param {number} quantity - 移除数量
   * @returns {number} 实际移除的数量
   */
  removeItem(itemId, quantity = 1) {
    let remainingQuantity = quantity;
    
    for (let i = 0; i < this.slots.length && remainingQuantity > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.item.id === itemId) {
        const removed = slot.removeFromStack(remainingQuantity);
        remainingQuantity -= removed;
        
        if (slot.isEmpty()) {
          this.slots[i] = null;
        }
      }
    }
    
    return quantity - remainingQuantity;
  }

  /**
   * 移除指定槽位的物品
   * @param {number} slotIndex - 槽位索引
   * @param {number} quantity - 移除数量
   * @returns {Object|null} 移除的物品信息
   */
  removeFromSlot(slotIndex, quantity = 1) {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return null;
    
    const slot = this.slots[slotIndex];
    if (!slot) return null;
    
    const actualQuantity = Math.min(quantity, slot.quantity);
    const removedItem = {
      item: slot.item,
      quantity: actualQuantity
    };
    
    slot.removeFromStack(actualQuantity);
    if (slot.isEmpty()) {
      this.slots[slotIndex] = null;
    }
    
    return removedItem;
  }

  /**
   * 获取物品数量
   * @param {string} itemId - 物品ID
   * @returns {number}
   */
  getItemCount(itemId) {
    let count = 0;
    for (const slot of this.slots) {
      if (slot && slot.item.id === itemId) {
        count += slot.quantity;
      }
    }
    return count;
  }

  /**
   * 检查是否有足够的物品
   * @param {string} itemId - 物品ID
   * @param {number} quantity - 需要的数量
   * @returns {boolean}
   */
  hasItem(itemId, quantity = 1) {
    return this.getItemCount(itemId) >= quantity;
  }

  /**
   * 获取指定槽位的物品
   * @param {number} slotIndex - 槽位索引
   * @returns {ItemStack|null}
   */
  getSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return null;
    return this.slots[slotIndex];
  }

  /**
   * 设置槽位物品
   * @param {number} slotIndex - 槽位索引
   * @param {ItemStack|null} itemStack - 物品堆叠
   */
  setSlot(slotIndex, itemStack) {
    if (slotIndex >= 0 && slotIndex < this.slots.length) {
      this.slots[slotIndex] = itemStack;
    }
  }

  /**
   * 交换两个槽位的物品
   * @param {number} fromIndex - 源槽位
   * @param {number} toIndex - 目标槽位
   * @returns {boolean} 是否成功交换
   */
  swapSlots(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.slots.length ||
        toIndex < 0 || toIndex >= this.slots.length) {
      return false;
    }
    
    const temp = this.slots[fromIndex];
    this.slots[fromIndex] = this.slots[toIndex];
    this.slots[toIndex] = temp;
    return true;
  }

  /**
   * 移动物品到指定槽位
   * @param {number} fromIndex - 源槽位
   * @param {number} toIndex - 目标槽位
   * @param {number} quantity - 移动数量
   * @returns {boolean} 是否成功移动
   */
  moveItem(fromIndex, toIndex, quantity = null) {
    const fromSlot = this.getSlot(fromIndex);
    if (!fromSlot) return false;
    
    const toSlot = this.getSlot(toIndex);
    const moveQuantity = quantity || fromSlot.quantity;
    
    // 如果目标槽位为空
    if (!toSlot) {
      const newStack = new ItemStack(fromSlot.item, moveQuantity);
      this.setSlot(toIndex, newStack);
      fromSlot.removeFromStack(moveQuantity);
      
      if (fromSlot.isEmpty()) {
        this.setSlot(fromIndex, null);
      }
      return true;
    }
    
    // 如果目标槽位有相同物品且可以堆叠
    if (toSlot.item.id === fromSlot.item.id && toSlot.canStack(moveQuantity)) {
      const actualMoved = toSlot.addToStack(moveQuantity);
      fromSlot.removeFromStack(actualMoved);
      
      if (fromSlot.isEmpty()) {
        this.setSlot(fromIndex, null);
      }
      return true;
    }
    
    // 否则交换位置
    return this.swapSlots(fromIndex, toIndex);
  }

  /**
   * 获取空槽位数量
   * @returns {number}
   */
  getEmptySlotCount() {
    return this.slots.filter(slot => slot === null).length;
  }

  /**
   * 获取已使用槽位数量
   * @returns {number}
   */
  getUsedSlotCount() {
    return this.slots.filter(slot => slot !== null).length;
  }

  /**
   * 检查背包是否已满
   * @returns {boolean}
   */
  isFull() {
    return this.getEmptySlotCount() === 0;
  }

  /**
   * 检查背包是否为空
   * @returns {boolean}
   */
  isEmpty() {
    return this.getUsedSlotCount() === 0;
  }

  /**
   * 根据当前过滤器获取物品
   * @returns {Array} 过滤后的物品列表
   */
  getFilteredItems() {
    const filter = this.filters[this.currentFilter] || this.filters.all;
    return this.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot && filter(slot.item));
  }

  /**
   * 设置物品过滤器
   * @param {string} filterName - 过滤器名称
   */
  setFilter(filterName) {
    if (this.filters[filterName]) {
      this.currentFilter = filterName;
    }
  }

  /**
   * 获取所有物品（不包括空槽位）
   * @returns {Array}
   */
  getAllItems() {
    return this.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot !== null);
  }

  /**
   * 使用物品
   * @param {number} slotIndex - 槽位索引
   * @param {number} quantity - 使用数量
   * @returns {Object|null} 使用的物品信息
   */
  useItem(slotIndex, quantity = 1) {
    const slot = this.getSlot(slotIndex);
    if (!slot || !slot.item.usable) return null;
    
    const usedItem = {
      item: slot.item,
      quantity: Math.min(quantity, slot.quantity)
    };
    
    slot.removeFromStack(usedItem.quantity);
    if (slot.isEmpty()) {
      this.setSlot(slotIndex, null);
    }
    
    return usedItem;
  }

  /**
   * 加载物品数据
   * @param {Array} items - 物品数据数组
   */
  loadItems(items) {
    this.slots.fill(null);
    
    for (const itemData of items) {
      if (itemData?.definitionId) {
        const definition = this.definitionResolver?.(itemData.definitionId);
        if (!definition) throw new Error(`inventoryDefinitionMissing:${itemData.definitionId}`);
        const item = itemData.instanceId
          ? { ...definition, instanceId: itemData.instanceId, ...(itemData.mutable || {}) }
          : definition;
        this.addItem(item, itemData.instanceId ? 1 : itemData.quantity);
      } else if (itemData.item && itemData.quantity) {
        this.addItem(itemData.item, itemData.quantity);
      }
    }
  }

  /** 正式快照只导出稳定定义/实例引用、数量与最小 mutable state。 */
  exportRuntimeStates() {
    return this.slots.filter(Boolean).map(slot => {
      const definitionId = slot.item.definitionId || slot.item.id;
      if (!slot.item.instanceId) return { definitionId, quantity: slot.quantity };
      const mutable = {};
      for (const key of ['durability', 'binding', 'charges', 'container']) {
        if (slot.item[key] !== undefined) mutable[key] = structuredClone(slot.item[key]);
      }
      return { definitionId, instanceId: slot.item.instanceId, mutable };
    });
  }

  /**
   * 导出背包数据
   * @returns {Array} 背包数据
   */
  exportItems() {
    return this.slots
      .filter(slot => slot !== null)
      .map(slot => ({
        item: slot.item,
        quantity: slot.quantity
      }));
  }

  /**
   * 清空背包
   */
  clear() {
    this.slots.fill(null);
  }

  /**
   * 整理背包（合并相同物品）
   */
  organize() {
    const items = this.exportItems();
    this.clear();
    
    for (const itemData of items) {
      this.addItem(itemData.item, itemData.quantity);
    }
  }
}