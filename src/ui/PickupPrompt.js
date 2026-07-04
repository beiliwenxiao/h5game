/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-02-10
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * PickupPrompt.js
 * 物品拾取提示UI组件
 */

import { UIElement } from './UIElement.js';

/**
 * 拾取提示组件
 */
export class PickupPrompt extends UIElement {
  /**
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super({
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || 200,
      height: options.height || 80,
      visible: false,
      zIndex: options.zIndex || 200
    });

    this.groundItems = [];
    this.selectedIndex = 0;
    this.showTime = 0;
    this.maxShowTime = 5000; // 5秒后自动隐藏
    
    // 按键提示
    this.pickupKey = options.pickupKey || 'F';
    this.pickupAllKey = options.pickupAllKey || 'G';
    
    // 事件回调
    this.onPickup = options.onPickup || null;
    this.onPickupAll = options.onPickupAll || null;
  }

  /**
   * 显示拾取提示
   * @param {Array} groundItems - 地面物品列表
   * @param {Object} position - 显示位置
   */
  show(groundItems, position) {
    if (groundItems.length === 0) {
      this.hide();
      return;
    }

    this.groundItems = [...groundItems];
    this.selectedIndex = 0;
    this.showTime = 0;
    this.visible = true;
    
    // 设置位置（在物品上方显示）
    this.x = position.x - this.width / 2;
    this.y = position.y - this.height - 20;
  }

  /**
   * 隐藏拾取提示
   */
  hide() {
    this.visible = false;
    this.groundItems = [];
    this.selectedIndex = 0;
    this.showTime = 0;
  }

  /**
   * 更新拾取提示
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    if (!this.visible) return;

    this.showTime += deltaTime;
    
    // 自动隐藏
    if (this.showTime > this.maxShowTime) {
      this.hide();
    }
  }

  /**
   * 渲染拾取提示
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  render(ctx) {
    if (!this.visible || this.groundItems.length === 0) return;

    ctx.save();

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    // 边框
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // 当前选中的物品
    const currentItem = this.groundItems[this.selectedIndex];
    if (currentItem) {
      this.renderItemInfo(ctx, currentItem);
    }

    // 按键提示
    this.renderKeyHints(ctx);

    ctx.restore();
  }

  /**
   * 渲染物品信息
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {GroundItem} groundItem - 地面物品
   */
  renderItemInfo(ctx, groundItem) {
    const item = groundItem.item;
    
    // 物品名称
    ctx.fillStyle = this.getItemRarityColor(item);
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, this.x + this.width / 2, this.y + 20);
    
    // 数量
    if (groundItem.quantity > 1) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      ctx.fillText(`x${groundItem.quantity}`, this.x + this.width / 2, this.y + 35);
    }
    
    // 多个物品时显示索引
    if (this.groundItems.length > 1) {
      ctx.fillStyle = '#cccccc';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(`${this.selectedIndex + 1}/${this.groundItems.length}`, this.x + this.width - 10, this.y + 15);
    }
  }

  /**
   * 渲染按键提示
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderKeyHints(ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    let hintY = this.y + this.height - 15;
    
    // 拾取提示
    ctx.fillText(`按 ${this.pickupKey} 拾取`, this.x + this.width / 2, hintY);
    
    // 全部拾取提示（多个物品时）
    if (this.groundItems.length > 1) {
      hintY += 12;
      ctx.fillText(`按 ${this.pickupAllKey} 全部拾取`, this.x + this.width / 2, hintY);
    }
  }

  /**
   * 获取物品稀有度颜色
   * @param {Object} item - 物品数据
   * @returns {string}
   */
  getItemRarityColor(item) {
    const colors = ['#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000'];
    return colors[item.rarity] || '#ffffff';
  }

  /**
   * 切换到下一个物品
   */
  nextItem() {
    if (this.groundItems.length > 1) {
      this.selectedIndex = (this.selectedIndex + 1) % this.groundItems.length;
    }
  }

  /**
   * 切换到上一个物品
   */
  previousItem() {
    if (this.groundItems.length > 1) {
      this.selectedIndex = (this.selectedIndex - 1 + this.groundItems.length) % this.groundItems.length;
    }
  }

  /**
   * 拾取当前选中的物品
   */
  pickupCurrentItem() {
    if (this.groundItems.length > 0 && this.onPickup) {
      const currentItem = this.groundItems[this.selectedIndex];
      this.onPickup(currentItem);
      
      // 从列表中移除已拾取的物品
      this.groundItems.splice(this.selectedIndex, 1);
      
      // 调整选中索引
      if (this.selectedIndex >= this.groundItems.length) {
        this.selectedIndex = Math.max(0, this.groundItems.length - 1);
      }
      
      // 如果没有物品了，隐藏提示
      if (this.groundItems.length === 0) {
        this.hide();
      }
    }
  }

  /**
   * 拾取所有物品
   */
  pickupAllItems() {
    if (this.groundItems.length > 0 && this.onPickupAll) {
      this.onPickupAll([...this.groundItems]);
      this.hide();
    }
  }

  /**
   * 处理键盘输入
   * @param {string} key - 按键
   */
  handleKeyInput(key) {
    if (!this.visible) return false;

    switch (key.toUpperCase()) {
      case this.pickupKey.toUpperCase():
        this.pickupCurrentItem();
        return true;
      
      case this.pickupAllKey.toUpperCase():
        this.pickupAllItems();
        return true;
      
      case 'ARROWUP':
      case 'W':
        this.previousItem();
        return true;
      
      case 'ARROWDOWN':
      case 'S':
        this.nextItem();
        return true;
      
      case 'ESCAPE':
        this.hide();
        return true;
    }

    return false;
  }

  /**
   * 获取当前选中的物品
   * @returns {GroundItem|null}
   */
  getCurrentItem() {
    return this.groundItems[this.selectedIndex] || null;
  }

  /**
   * 检查是否有物品可拾取
   * @returns {boolean}
   */
  hasItems() {
    return this.groundItems.length > 0;
  }
}