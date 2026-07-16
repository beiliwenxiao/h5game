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

import { UIElement } from './UIElement.js';

/**
 * 生命值条组件
 * 显示角色或敌人的生命值，支持平滑过渡动画
 */
export class HealthBar extends UIElement {
  /**
   * @param {Object} options - 配置选项
   * @param {number} options.currentValue - 当前生命值
   * @param {number} options.maxValue - 最大生命值
   * @param {string} [options.barColor='#00ff00'] - 生命值条颜色
   * @param {string} [options.backgroundColor='#333333'] - 背景颜色
   * @param {string} [options.borderColor='#ffffff'] - 边框颜色
   * @param {boolean} [options.showText=true] - 是否显示文字
   * @param {boolean} [options.showPercentage=true] - 是否显示百分比
   * @param {number} [options.animationSpeed=0.1] - 动画速度（0-1）
   */
  constructor(options = {}) {
    super(options);
    
    this.currentValue = options.currentValue || 100;
    this.maxValue = options.maxValue || 100;
    this.displayValue = this.currentValue; // 用于平滑动画的显示值
    
    this.barColor = options.barColor || '#00ff00';
    this.backgroundColor = options.backgroundColor || '#333333';
    this.borderColor = options.borderColor || '#ffffff';
    
    this.showText = options.showText !== undefined ? options.showText : true;
    this.showPercentage = options.showPercentage !== undefined ? options.showPercentage : true;
    this.animationSpeed = options.animationSpeed || 0.1;
    
    // 边框和内边距
    this.borderWidth = 2;
    this.padding = 2;
  }

  /**
   * 设置当前值
   * @param {number} value - 新的生命值
   */
  setValue(value) {
    this.currentValue = Math.max(0, Math.min(value, this.maxValue));
  }

  /**
   * 设置最大值
   * @param {number} value - 新的最大生命值
   */
  setMaxValue(value) {
    this.maxValue = Math.max(1, value);
    this.currentValue = Math.min(this.currentValue, this.maxValue);
  }

  /**
   * 更新生命值条（平滑过渡动画）
   * @param {number} deltaTime - 帧间隔时间（毫秒）
   */
  update(deltaTime) {
    // 平滑过渡到目标值
    const diff = this.currentValue - this.displayValue;
    if (Math.abs(diff) > 0.1) {
      this.displayValue += diff * this.animationSpeed;
    } else {
      this.displayValue = this.currentValue;
    }
  }

  /**
   * 渲染生命值条
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  render(ctx) {
    if (!this.visible) return;

    const percentage = this.displayValue / this.maxValue;
    const innerWidth = this.width - (this.borderWidth + this.padding) * 2;
    const innerHeight = this.height - (this.borderWidth + this.padding) * 2;
    const innerX = this.x + this.borderWidth + this.padding;
    const innerY = this.y + this.borderWidth + this.padding;

    // 绘制边框
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = this.borderWidth;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // 绘制背景
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(innerX, innerY, innerWidth, innerHeight);

    // 绘制生命值条
    const barWidth = innerWidth * percentage;
    ctx.fillStyle = this.getBarColor(percentage);
    ctx.fillRect(innerX, innerY, barWidth, innerHeight);

    // 绘制文字
    if (this.showText) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      let text = '';
      if (this.showPercentage) {
        text = `${Math.round(percentage * 100)}%`;
      } else {
        text = `${Math.round(this.displayValue)}/${this.maxValue}`;
      }
      
      // 添加文字阴影以提高可读性
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 3;
      ctx.fillText(text, this.x + this.width / 2, this.y + this.height / 2);
      ctx.shadowBlur = 0;
    }
  }

  /**
   * 根据百分比获取生命值条颜色
   * @param {number} percentage - 生命值百分比（0-1）
   * @returns {string} 颜色值
   */
  getBarColor(percentage) {
    if (percentage > 0.5) {
      return '#00ff00'; // 绿色
    } else if (percentage > 0.25) {
      return '#ffff00'; // 黄色
    } else {
      return '#ff0000'; // 红色
    }
  }

  /**
   * 获取当前百分比
   * @returns {number} 百分比（0-1）
   */
  getPercentage() {
    return this.currentValue / this.maxValue;
  }
}
