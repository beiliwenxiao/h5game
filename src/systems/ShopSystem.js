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
 * ShopSystem.js
 * 商店系统 - 管理商店、商品和交易
 */

/**
 * 商店类型枚举
 */
export const ShopType = {
  GENERAL: 'general',       // 杂货店
  WEAPON: 'weapon',         // 武器店
  ARMOR: 'armor',           // 防具店
  POTION: 'potion',         // 药水店
  MATERIAL: 'material',     // 材料店
  SPECIAL: 'special',       // 特殊商店
  REPUTATION: 'reputation', // 声望商店
  EVENT: 'event'            // 活动商店
};

/**
 * 货币类型枚举
 */
export const CurrencyType = {
  GOLD: 'gold',             // 金币
  DIAMOND: 'diamond',       // 钻石
  HONOR: 'honor',           // 荣誉点
  REPUTATION: 'reputation', // 声望
  EVENT_TOKEN: 'event_token' // 活动代币
};

/**
 * 商品类
 */
export class ShopItem {
  constructor(config = {}) {
    this.id = config.id || `item_${Date.now()}`;
    this.itemId = config.itemId || config.id;
    this.name = config.name || 'Unknown Item';
    this.description = config.description || '';
    this.icon = config.icon || '📦';
    this.type = config.type || 'misc';
    
    // 价格
    this.price = config.price || 0;
    this.currency = config.currency || CurrencyType.GOLD;
    this.originalPrice = config.originalPrice || this.price;
    this.discount = config.discount || 0;
    
    // 库存
    this.stock = config.stock ?? -1; // -1表示无限
    this.maxStock = config.maxStock ?? -1;
    this.restockTime = config.restockTime || 0;
    this.lastRestockTime = 0;
    
    // 购买限制
    this.buyLimit = config.buyLimit || 0; // 0表示无限制
    this.buyLimitPeriod = config.buyLimitPeriod || 'none'; // 'daily', 'weekly', 'none'
    this.purchaseCount = 0;
    this.lastPurchaseReset = 0;
    
    // 解锁条件
    this.requiredLevel = config.requiredLevel || 1;
    this.requiredReputation = config.requiredReputation || 0;
    this.requiredQuests = config.requiredQuests || [];
    
    // 是否可用
    this.available = config.available !== false;
  }

  /**
   * 获取实际价格（考虑折扣）
   * @returns {number}
   */
  getActualPrice() {
    if (this.discount > 0) {
      return Math.floor(this.price * (1 - this.discount));
    }
    return this.price;
  }

  /**
   * 检查是否可购买
   * @param {Object} playerContext
   * @returns {{ canBuy: boolean, reason: string }}
   */
  canPurchase(playerContext) {
    if (!this.available) {
      return { canBuy: false, reason: '商品不可用' };
    }
    
    if (this.stock === 0) {
      return { canBuy: false, reason: '库存不足' };
    }
    
    if (playerContext.level < this.requiredLevel) {
      return { canBuy: false, reason: `需要等级 ${this.requiredLevel}` };
    }
    
    const playerCurrency = playerContext.currencies?.[this.currency] || 0;
    if (playerCurrency < this.getActualPrice()) {
      return { canBuy: false, reason: '货币不足' };
    }
    
    if (this.buyLimit > 0 && this.purchaseCount >= this.buyLimit) {
      return { canBuy: false, reason: '已达购买上限' };
    }
    
    return { canBuy: true, reason: '' };
  }

  /**
   * 购买商品
   * @returns {boolean}
   */
  purchase() {
    if (this.stock > 0) {
      this.stock--;
    }
    this.purchaseCount++;
    return true;
  }

  /**
   * 补货
   */
  restock() {
    if (this.maxStock > 0) {
      this.stock = this.maxStock;
    }
    this.lastRestockTime = Date.now();
  }

  /**
   * 重置购买计数
   */
  resetPurchaseCount() {
    this.purchaseCount = 0;
    this.lastPurchaseReset = Date.now();
  }
}


/**
 * 商店类
 */
export class Shop {
  constructor(config = {}) {
    this.id = config.id || `shop_${Date.now()}`;
    this.name = config.name || 'Unknown Shop';
    this.type = config.type || ShopType.GENERAL;
    this.description = config.description || '';
    this.icon = config.icon || '🏪';
    
    // 商店NPC
    this.npcId = config.npcId || null;
    
    // 商品列表
    this.items = new Map();
    if (config.items) {
      config.items.forEach(item => {
        this.addItem(new ShopItem(item));
      });
    }
    
    // 买卖比例
    this.buyRate = config.buyRate || 1.0;  // 购买价格倍率
    this.sellRate = config.sellRate || 0.5; // 出售价格倍率
    
    // 刷新设置
    this.refreshInterval = config.refreshInterval || 0; // 0表示不刷新
    this.lastRefreshTime = 0;
    
    // 解锁条件
    this.requiredLevel = config.requiredLevel || 1;
    this.requiredReputation = config.requiredReputation || 0;
    
    // 营业时间
    this.openHours = config.openHours || null; // { start: 8, end: 20 }
    
    // 是否开放
    this.isOpen = config.isOpen !== false;
  }

  /**
   * 添加商品
   * @param {ShopItem} item
   */
  addItem(item) {
    this.items.set(item.id, item);
  }

  /**
   * 移除商品
   * @param {string} itemId
   */
  removeItem(itemId) {
    this.items.delete(itemId);
  }

  /**
   * 获取商品
   * @param {string} itemId
   * @returns {ShopItem|null}
   */
  getItem(itemId) {
    return this.items.get(itemId) || null;
  }

  /**
   * 获取所有商品
   * @returns {ShopItem[]}
   */
  getAllItems() {
    return Array.from(this.items.values());
  }

  /**
   * 获取可购买商品
   * @param {Object} playerContext
   * @returns {ShopItem[]}
   */
  getAvailableItems(playerContext) {
    return this.getAllItems().filter(item => item.canPurchase(playerContext).canBuy);
  }

  /**
   * 检查商店是否开放
   * @returns {boolean}
   */
  checkOpen() {
    if (!this.isOpen) return false;
    
    if (this.openHours) {
      const hour = new Date().getHours();
      if (hour < this.openHours.start || hour >= this.openHours.end) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 刷新商店
   */
  refresh() {
    this.items.forEach(item => {
      item.restock();
      item.resetPurchaseCount();
    });
    this.lastRefreshTime = Date.now();
  }

  /**
   * 检查是否需要刷新
   * @returns {boolean}
   */
  needsRefresh() {
    if (this.refreshInterval <= 0) return false;
    return Date.now() - this.lastRefreshTime >= this.refreshInterval;
  }

  /**
   * 计算出售价格
   * @param {Object} item - 玩家物品
   * @returns {number}
   */
  calculateSellPrice(item) {
    const basePrice = item.price || item.value || 0;
    return Math.floor(basePrice * this.sellRate);
  }
}

/**
 * 商店系统主类
 */
export class ShopSystem {
  constructor() {
    this.shops = new Map();
    this.transactionHistory = [];
    this.maxHistorySize = 100;
    
    // 玩家货币（简化版，实际应该在玩家数据中）
    this.playerCurrencies = {
      [CurrencyType.GOLD]: 1000,
      [CurrencyType.DIAMOND]: 0,
      [CurrencyType.HONOR]: 0
    };
    
    // 事件监听器
    this.listeners = new Map();
    
    // 初始化默认商店
    this.initDefaultShops();
  }

  /**
   * 初始化默认商店
   */
  initDefaultShops() {
    // 杂货店
    this.registerShop(new Shop({
      id: 'general_store',
      name: '杂货店',
      type: ShopType.GENERAL,
      description: '出售各种日常用品和消耗品',
      icon: '🏪',
      npcId: 'merchant_chen',
      items: [
        { id: 'health_potion_small', itemId: 'health_potion_small', name: '小型生命药水', description: '恢复50点生命值', icon: '🧪', type: 'consumable', price: 50 },
        { id: 'health_potion_medium', itemId: 'health_potion_medium', name: '中型生命药水', description: '恢复150点生命值', icon: '🧪', type: 'consumable', price: 150 },
        { id: 'mana_potion_small', itemId: 'mana_potion_small', name: '小型魔法药水', description: '恢复30点魔法值', icon: '💧', type: 'consumable', price: 50 },
        { id: 'mana_potion_medium', itemId: 'mana_potion_medium', name: '中型魔法药水', description: '恢复100点魔法值', icon: '💧', type: 'consumable', price: 150 },
        { id: 'antidote', itemId: 'antidote', name: '解毒剂', description: '解除中毒状态', icon: '💊', type: 'consumable', price: 30 },
        { id: 'torch', itemId: 'torch', name: '火把', description: '照亮黑暗区域', icon: '🔥', type: 'tool', price: 10 },
        { id: 'rope', itemId: 'rope', name: '绳索', description: '用于攀爬和捆绑', icon: '🪢', type: 'tool', price: 20 }
      ]
    }));

    // 武器店
    this.registerShop(new Shop({
      id: 'weapon_shop',
      name: '铁匠铺',
      type: ShopType.WEAPON,
      description: '出售各种武器和防具',
      icon: '⚔️',
      npcId: 'blacksmith_wang',
      items: [
        { id: 'wooden_sword', itemId: 'wooden_sword', name: '木剑', description: '新手用的木制剑', icon: '🗡️', type: 'weapon', price: 50 },
        { id: 'iron_sword', itemId: 'iron_sword', name: '铁剑', description: '普通的铁制剑', icon: '⚔️', type: 'weapon', price: 200, requiredLevel: 5 },
        { id: 'steel_sword', itemId: 'steel_sword', name: '钢剑', description: '锋利的钢制剑', icon: '⚔️', type: 'weapon', price: 500, requiredLevel: 10 },
        { id: 'wooden_shield', itemId: 'wooden_shield', name: '木盾', description: '简单的木制盾牌', icon: '🛡️', type: 'armor', price: 30 },
        { id: 'iron_shield', itemId: 'iron_shield', name: '铁盾', description: '坚固的铁制盾牌', icon: '🛡️', type: 'armor', price: 150, requiredLevel: 5 },
        { id: 'leather_armor', itemId: 'leather_armor', name: '皮甲', description: '轻便的皮革护甲', icon: '🥋', type: 'armor', price: 100 },
        { id: 'iron_armor', itemId: 'iron_armor', name: '铁甲', description: '坚固的铁制护甲', icon: '🛡️', type: 'armor', price: 300, requiredLevel: 8 }
      ]
    }));

    // 特殊商店（限时）
    this.registerShop(new Shop({
      id: 'special_shop',
      name: '神秘商人',
      type: ShopType.SPECIAL,
      description: '出售稀有物品，库存有限',
      icon: '✨',
      refreshInterval: 86400000, // 24小时刷新
      items: [
        { id: 'rare_gem', itemId: 'rare_gem', name: '稀有宝石', description: '闪闪发光的宝石', icon: '💎', type: 'material', price: 1000, stock: 3, maxStock: 3 },
        { id: 'exp_scroll', itemId: 'exp_scroll', name: '经验卷轴', description: '使用后获得500经验', icon: '📜', type: 'consumable', price: 500, stock: 5, maxStock: 5, buyLimit: 2, buyLimitPeriod: 'daily' },
        { id: 'mystery_box', itemId: 'mystery_box', name: '神秘宝箱', description: '打开后随机获得物品', icon: '📦', type: 'consumable', price: 300, stock: 10, maxStock: 10 }
      ]
    }));
  }

  /**
   * 注册商店
   * @param {Shop} shop
   */
  registerShop(shop) {
    this.shops.set(shop.id, shop);
  }

  /**
   * 获取商店
   * @param {string} shopId
   * @returns {Shop|null}
   */
  getShop(shopId) {
    return this.shops.get(shopId) || null;
  }

  /**
   * 获取NPC的商店
   * @param {string} npcId
   * @returns {Shop|null}
   */
  getShopByNPC(npcId) {
    for (const shop of this.shops.values()) {
      if (shop.npcId === npcId) {
        return shop;
      }
    }
    return null;
  }

  /**
   * 获取所有商店
   * @returns {Shop[]}
   */
  getAllShops() {
    return Array.from(this.shops.values());
  }

  /**
   * 购买商品
   * @param {string} shopId
   * @param {string} itemId
   * @param {number} quantity
   * @param {Object} playerContext
   * @returns {{ success: boolean, message: string, item?: ShopItem }}
   */
  buyItem(shopId, itemId, quantity = 1, playerContext) {
    const shop = this.getShop(shopId);
    if (!shop) {
      return { success: false, message: '商店不存在' };
    }
    
    if (!shop.checkOpen()) {
      return { success: false, message: '商店已关闭' };
    }
    
    const item = shop.getItem(itemId);
    if (!item) {
      return { success: false, message: '商品不存在' };
    }
    
    const { canBuy, reason } = item.canPurchase(playerContext);
    if (!canBuy) {
      return { success: false, message: reason };
    }
    
    const totalPrice = item.getActualPrice() * quantity;
    const currency = item.currency;
    
    // 检查货币
    if ((this.playerCurrencies[currency] || 0) < totalPrice) {
      return { success: false, message: '货币不足' };
    }
    
    // 扣除货币
    this.playerCurrencies[currency] -= totalPrice;
    
    // 更新商品
    for (let i = 0; i < quantity; i++) {
      item.purchase();
    }
    
    // 记录交易
    this.addTransaction({
      type: 'buy',
      shopId,
      itemId,
      itemName: item.name,
      quantity,
      price: totalPrice,
      currency
    });
    
    this.emit('itemPurchased', { shop, item, quantity, totalPrice });
    
    return { success: true, message: '购买成功', item };
  }

  /**
   * 出售物品
   * @param {string} shopId
   * @param {Object} playerItem
   * @param {number} quantity
   * @returns {{ success: boolean, message: string, gold?: number }}
   */
  sellItem(shopId, playerItem, quantity = 1) {
    const shop = this.getShop(shopId);
    if (!shop) {
      return { success: false, message: '商店不存在' };
    }
    
    if (!shop.checkOpen()) {
      return { success: false, message: '商店已关闭' };
    }
    
    const sellPrice = shop.calculateSellPrice(playerItem) * quantity;
    
    // 增加货币
    this.playerCurrencies[CurrencyType.GOLD] += sellPrice;
    
    // 记录交易
    this.addTransaction({
      type: 'sell',
      shopId,
      itemId: playerItem.id,
      itemName: playerItem.name,
      quantity,
      price: sellPrice,
      currency: CurrencyType.GOLD
    });
    
    this.emit('itemSold', { shop, item: playerItem, quantity, sellPrice });
    
    return { success: true, message: '出售成功', gold: sellPrice };
  }

  /**
   * 添加交易记录
   * @param {Object} transaction
   */
  addTransaction(transaction) {
    this.transactionHistory.push({
      ...transaction,
      timestamp: Date.now()
    });
    
    if (this.transactionHistory.length > this.maxHistorySize) {
      this.transactionHistory.shift();
    }
  }

  /**
   * 获取交易历史
   * @param {number} limit
   * @returns {Object[]}
   */
  getTransactionHistory(limit = 20) {
    return this.transactionHistory.slice(-limit);
  }

  /**
   * 获取货币
   * @param {string} currencyType
   * @returns {number}
   */
  getCurrency(currencyType) {
    return this.playerCurrencies[currencyType] || 0;
  }

  /**
   * 设置货币
   * @param {string} currencyType
   * @param {number} amount
   */
  setCurrency(currencyType, amount) {
    this.playerCurrencies[currencyType] = Math.max(0, amount);
  }

  /**
   * 添加货币
   * @param {string} currencyType
   * @param {number} amount
   */
  addCurrency(currencyType, amount) {
    this.playerCurrencies[currencyType] = (this.playerCurrencies[currencyType] || 0) + amount;
  }

  /**
   * 更新系统
   * @param {number} deltaTime
   */
  update(deltaTime) {
    for (const shop of this.shops.values()) {
      if (shop.needsRefresh()) {
        shop.refresh();
        this.emit('shopRefreshed', { shop });
      }
    }
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
      totalShops: this.shops.size,
      currencies: { ...this.playerCurrencies },
      transactionCount: this.transactionHistory.length
    };
  }

  /**
   * 重置系统
   */
  reset() {
    this.transactionHistory = [];
    this.playerCurrencies = {
      [CurrencyType.GOLD]: 1000,
      [CurrencyType.DIAMOND]: 0,
      [CurrencyType.HONOR]: 0
    };
  }
}
