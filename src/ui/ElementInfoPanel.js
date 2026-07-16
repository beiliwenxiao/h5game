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
 * ElementInfoPanel.js
 * 元素信息面板 - 显示角色元素属性和相克关系
 */

import { UIElement } from './UIElement.js';
import { ElementSystem, ElementTypes, ElementNames } from '../systems/ElementSystem.js';

/**
 * 元素信息面板
 */
export class ElementInfoPanel extends UIElement {
  /**
   * @param {Object} config - 配置
   * @param {number} config.x - X坐标
   * @param {number} config.y - Y坐标
   * @param {number} config.width - 宽度
   * @param {number} config.height - 高度
   */
  constructor(config = {}) {
    super(config);
    
    this.elementSystem = new ElementSystem();
    this.playerEntity = null;
    this.targetEntity = null;
    
    // 面板配置
    this.panelWidth = config.width || 300;
    this.panelHeight = config.height || 200;
    this.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.borderColor = '#4a90e2';
    this.textColor = '#ffffff';
    
    // 元素颜色映射
    this.elementColors = {
      [ElementTypes.FIRE]: '#ff4444',
      [ElementTypes.EXPLOSION]: '#ff8800',
      [ElementTypes.WATER]: '#4488ff',
      [ElementTypes.ICE]: '#88ccff',
      [ElementTypes.WIND]: '#88ff88',
      [ElementTypes.ELECTRIC]: '#ffff44',
      [ElementTypes.STORM]: '#44ff44',
      [ElementTypes.THUNDER]: '#ffff88',
      [ElementTypes.THUNDERSTORM]: '#88ffff',
      [ElementTypes.EARTH]: '#aa6644',
      [ElementTypes.ROCKFALL]: '#884422',
      [ElementTypes.WOOD]: '#228844',
      [ElementTypes.TIMBER]: '#446622'
    };
  }
  
  /**
   * 设置玩家实体
   * @param {Entity} entity - 玩家实体
   */
  setPlayerEntity(entity) {
    this.playerEntity = entity;
  }
  
  /**
   * 设置目标实体
   * @param {Entity} entity - 目标实体
   */
  setTargetEntity(entity) {
    this.targetEntity = entity;
  }
  
  /**
   * 渲染元素信息面板
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  render(ctx) {
    if (!this.visible || !this.playerEntity) return;
    
    ctx.save();
    
    // 绘制背景
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(this.x, this.y, this.panelWidth, this.panelHeight);
    
    // 绘制边框
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.panelWidth, this.panelHeight);
    
    // 绘制标题
    ctx.fillStyle = this.textColor;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('元素信息', this.x + this.panelWidth / 2, this.y + 25);
    
    // 获取玩家属性
    const playerStats = this.playerEntity.getComponent('stats');
    if (!playerStats) {
      ctx.restore();
      return;
    }
    
    let yOffset = 50;
    
    // 显示玩家主元素
    this.renderPlayerElementInfo(ctx, playerStats, yOffset);
    yOffset += 60;
    
    // 如果有目标，显示相克关系
    if (this.targetEntity) {
      const targetStats = this.targetEntity.getComponent('stats');
      if (targetStats) {
        this.renderElementCounterInfo(ctx, playerStats, targetStats, yOffset);
      }
    }
    
    ctx.restore();
  }
  
  /**
   * 渲染玩家元素信息
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {StatsComponent} playerStats - 玩家属性
   * @param {number} yOffset - Y偏移
   */
  renderPlayerElementInfo(ctx, playerStats, yOffset) {
    const mainElement = playerStats.getMainElement();
    const elementName = ElementNames[mainElement] || '未知';
    const elementColor = this.elementColors[mainElement] || '#ffffff';
    
    // 主元素标题
    ctx.fillStyle = this.textColor;
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('主元素:', this.x + 10, this.y + yOffset);
    
    // 元素名称（带颜色）
    ctx.fillStyle = elementColor;
    ctx.font = 'bold 14px Arial';
    ctx.fillText(elementName, this.x + 80, this.y + yOffset);
    
    // 元素攻击力
    yOffset += 20;
    ctx.fillStyle = this.textColor;
    ctx.font = '12px Arial';
    const elementAttack = playerStats.getElementAttack(mainElement);
    ctx.fillText(`${elementName}攻击: ${elementAttack}`, this.x + 10, this.y + yOffset);
    
    // 元素防御力
    yOffset += 15;
    const elementDefense = playerStats.getElementDefense(mainElement);
    ctx.fillText(`${elementName}防御: ${elementDefense}`, this.x + 10, this.y + yOffset);
  }
  
  /**
   * 渲染元素相克信息
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {StatsComponent} playerStats - 玩家属性
   * @param {StatsComponent} targetStats - 目标属性
   * @param {number} yOffset - Y偏移
   */
  renderElementCounterInfo(ctx, playerStats, targetStats, yOffset) {
    const playerElement = playerStats.getMainElement();
    const targetElement = targetStats.getMainElement();
    
    const counterInfo = this.elementSystem.getElementCounterInfo(playerElement, targetElement);
    
    // 相克关系标题
    ctx.fillStyle = this.textColor;
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('相克关系:', this.x + 10, this.y + yOffset);
    
    yOffset += 20;
    
    // 显示相克信息
    let relationshipText = '';
    let relationshipColor = this.textColor;
    
    if (counterInfo.relationship === 'advantage') {
      relationshipText = `${counterInfo.attackElementName} 克制 ${counterInfo.defendElementName}`;
      relationshipColor = '#44ff44'; // 绿色表示优势
    } else if (counterInfo.relationship === 'disadvantage') {
      relationshipText = `${counterInfo.attackElementName} 被 ${counterInfo.defendElementName} 克制`;
      relationshipColor = '#ff4444'; // 红色表示劣势
    } else {
      relationshipText = `${counterInfo.attackElementName} vs ${counterInfo.defendElementName} (无相克)`;
      relationshipColor = '#ffff44'; // 黄色表示平衡
    }
    
    ctx.fillStyle = relationshipColor;
    ctx.font = '12px Arial';
    ctx.fillText(relationshipText, this.x + 10, this.y + yOffset);
    
    // 显示伤害倍率
    yOffset += 15;
    ctx.fillStyle = this.textColor;
    const multiplierText = `伤害倍率: ${(counterInfo.multiplier * 100).toFixed(0)}%`;
    ctx.fillText(multiplierText, this.x + 10, this.y + yOffset);
  }
  
  /**
   * 获取元素颜色
   * @param {number} elementType - 元素类型
   * @returns {string} 颜色值
   */
  getElementColor(elementType) {
    return this.elementColors[elementType] || '#ffffff';
  }
  
  /**
   * 切换显示状态
   */
  toggle() {
    this.visible = !this.visible;
  }
  
  /**
   * 显示面板
   */
  show() {
    this.visible = true;
  }
  
  /**
   * 隐藏面板
   */
  hide() {
    this.visible = false;
  }
}