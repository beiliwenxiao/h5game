/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-02-10
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * ShopPanel.js
 * 商店面板UI组件
 */

import { ShopType, CurrencyType } from '../systems/ShopSystem.js';

export class ShopPanel {
  constructor(shopSystem) {
    this.shopSystem = shopSystem;
    this.container = null;
    this.currentShop = null;
    this.isVisible = false;
    
    this.currencyIcons = {
      [CurrencyType.GOLD]: '💰',
      [CurrencyType.DIAMOND]: '💎',
      [CurrencyType.HONOR]: '🏅',
      [CurrencyType.REPUTATION]: '⭐',
      [CurrencyType.EVENT_TOKEN]: '🎫'
    };

    this.init();
  }

  init() {
    this.createContainer();
    this.bindEvents();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'shop-panel';
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 800px;
      max-width: 95vw;
      max-height: 85vh;
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid #ffd700;
      border-radius: 10px;
      color: white;
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      z-index: 1000;
      display: none;
      flex-direction: column;
    `;

    // 标题栏
    const header = document.createElement('div');
    header.id = 'shop-header';
    header.style.cssText = `
      padding: 15px 20px;
      background: linear-gradient(135deg, #4a3728, #2a1f18);
      border-bottom: 1px solid #ffd700;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 8px 8px 0 0;
    `;
    this.container.appendChild(header);

    // 货币显示
    this.currencyBar = document.createElement('div');
    this.currencyBar.style.cssText = `
      padding: 10px 20px;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      gap: 20px;
      border-bottom: 1px solid #4a4a4a;
    `;
    this.container.appendChild(this.currencyBar);

    // 商品列表
    this.itemList = document.createElement('div');
    this.itemList.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      align-content: start;
    `;
    this.container.appendChild(this.itemList);

    document.body.appendChild(this.container);
  }

  bindEvents() {
    if (this.shopSystem) {
      this.shopSystem.on('itemPurchased', () => this.refresh());
      this.shopSystem.on('itemSold', () => this.refresh());
    }
  }

  openShop(shopId) {
    const shop = this.shopSystem?.getShop(shopId);
    if (!shop) return;
    
    this.currentShop = shop;
    this.show();
    this.refresh();
  }

  show() {
    this.container.style.display = 'flex';
    this.isVisible = true;
  }

  hide() {
    this.container.style.display = 'none';
    this.isVisible = false;
    this.currentShop = null;
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  refresh() {
    if (!this.currentShop) return;
    this.renderHeader();
    this.renderCurrencyBar();
    this.renderItems();
  }

  renderHeader() {
    const header = document.getElementById('shop-header');
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 24px;">${this.currentShop.icon}</span>
        <div>
          <div style="font-size: 18px; font-weight: bold;">${this.currentShop.name}</div>
          <div style="font-size: 12px; color: #95a5a6;">${this.currentShop.description}</div>
        </div>
      </div>
      <button onclick="window.shopPanel.hide()" style="
        background: none;
        border: none;
        color: #999;
        font-size: 24px;
        cursor: pointer;
      ">×</button>
    `;
  }

  renderCurrencyBar() {
    const currencies = this.shopSystem?.playerCurrencies || {};
    this.currencyBar.innerHTML = Object.entries(currencies).map(([type, amount]) => `
      <div style="display: flex; align-items: center; gap: 5px;">
        <span>${this.currencyIcons[type] || '💵'}</span>
        <span style="font-weight: bold;">${amount.toLocaleString()}</span>
      </div>
    `).join('');
  }

  renderItems() {
    const items = this.currentShop?.getAllItems() || [];
    const playerContext = { level: 10, currencies: this.shopSystem?.playerCurrencies };
    
    this.itemList.innerHTML = items.map(item => {
      const { canBuy, reason } = item.canPurchase(playerContext);
      const actualPrice = item.getActualPrice();
      const hasDiscount = item.discount > 0;
      
      return `
        <div class="shop-item" style="
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid ${canBuy ? '#4a4a4a' : '#333'};
          border-radius: 8px;
          padding: 12px;
          cursor: ${canBuy ? 'pointer' : 'not-allowed'};
          opacity: ${canBuy ? 1 : 0.6};
          transition: all 0.2s;
        " ${canBuy ? `onclick="window.shopPanel.buyItem('${item.id}')"` : ''}>
          <div style="text-align: center; font-size: 32px; margin-bottom: 8px;">${item.icon}</div>
          <div style="font-weight: bold; text-align: center; margin-bottom: 4px;">${item.name}</div>
          <div style="font-size: 11px; color: #95a5a6; text-align: center; margin-bottom: 8px; height: 30px; overflow: hidden;">${item.description}</div>
          <div style="text-align: center;">
            ${hasDiscount ? `<span style="text-decoration: line-through; color: #7f8c8d; font-size: 12px;">${item.price}</span>` : ''}
            <span style="color: #ffd700; font-weight: bold;">${this.currencyIcons[item.currency] || '💰'} ${actualPrice}</span>
            ${hasDiscount ? `<span style="color: #2ecc71; font-size: 11px;">-${Math.round(item.discount * 100)}%</span>` : ''}
          </div>
          ${item.stock >= 0 ? `<div style="font-size: 11px; color: #7f8c8d; text-align: center; margin-top: 4px;">库存: ${item.stock}</div>` : ''}
          ${!canBuy ? `<div style="font-size: 11px; color: #e74c3c; text-align: center; margin-top: 4px;">${reason}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  buyItem(itemId) {
    if (!this.currentShop || !this.shopSystem) return;
    
    const playerContext = { level: 10, currencies: this.shopSystem.playerCurrencies };
    const result = this.shopSystem.buyItem(this.currentShop.id, itemId, 1, playerContext);
    
    if (result.success) {
      this.showMessage(`购买成功: ${result.item.name}`, 'success');
    } else {
      this.showMessage(result.message, 'error');
    }
    
    this.refresh();
  }

  showMessage(text, type = 'info') {
    const msg = document.createElement('div');
    msg.style.cssText = `
      position: fixed;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      padding: 15px 30px;
      background: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : '#3498db'};
      color: white;
      border-radius: 5px;
      z-index: 2000;
      animation: fadeInOut 2s forwards;
    `;
    msg.textContent = text;
    document.body.appendChild(msg);
    
    setTimeout(() => msg.remove(), 2000);
    
    if (!document.getElementById('shop-msg-style')) {
      const style = document.createElement('style');
      style.id = 'shop-msg-style';
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          20% { opacity: 1; transform: translateX(-50%) translateY(0); }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  destroy() {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

window.shopPanel = null;
