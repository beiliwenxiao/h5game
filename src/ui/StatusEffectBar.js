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
 * StatusEffectBar.js
 * 状态效果栏组件 - 显示角色身上的状态效果图标
 */

import { UIElement } from './UIElement.js';
import { StatusEffectData } from '../ecs/components/StatusEffectComponent.js';

/**
 * 状态效果栏
 * 显示实体身上的所有状态效果，包括图标、持续时间等
 */
export class StatusEffectBar extends UIElement {
  /**
   * @param {Object} options - 配置选项
   * @param {Entity} options.entity - 要显示状态效果的实体
   * @param {number} [options.iconSize=32] - 图标大小
   * @param {number} [options.spacing=4] - 图标间距
   * @param {number} [options.maxIcons=8] - 最大显示图标数
   * @param {boolean} [options.showDuration=true] - 是否显示持续时间
   * @param {string} [options.layout='horizontal'] - 布局方式 'horizontal' 或 'vertical'
   */
  constructor(options = {}) {
    super(options);
    
    this.entity = options.entity;
    this.iconSize = options.iconSize || 32;
    this.spacing = options.spacing || 4;
    this.maxIcons = options.maxIcons || 8;
    this.showDuration = options.showDuration !== undefined ? options.showDuration : true;
    this.layout = options.layout || 'horizontal';
    
    // 动画相关
    this.animationTime = 0;
    this.pulseSpeed = 2; // 脉冲动画速度
    
    // 工具提示
    this.hoveredEffect = null;
    this.tooltipDelay = 500; // 工具提示延迟（毫秒）
    this.tooltipTimer = 0;
    
    // 更新尺寸
    this.updateSize();
  }

  /**
   * 设置目标实体
   * @param {Entity} entity - 实体
   */
  setEntity(entity) {
    this.entity = entity;
  }

  /**
   * 更新组件尺寸
   */
  updateSize() {
    if (!this.entity) return;
    
    const statusEffect = this.entity.getComponent('statusEffect');
    if (!statusEffect) return;
    
    const effectCount = Math.min(statusEffect.getEffectCount(), this.maxIcons);
    
    if (this.layout === 'horizontal') {
      this.width = effectCount * (this.iconSize + this.spacing) - this.spacing;
      this.height = this.iconSize;
    } else {
      this.width = this.iconSize;
      this.height = effectCount * (this.iconSize + this.spacing) - this.spacing;
    }
    
    // 确保最小尺寸
    this.width = Math.max(this.width, 0);
    this.height = Math.max(this.height, 0);
  }

  /**
   * 更新状态效果栏
   * @param {number} deltaTime - 帧间隔时间（毫秒）
   */
  update(deltaTime) {
    if (!this.visible || !this.entity) return;
    
    // 更新动画时间
    this.animationTime += deltaTime / 1000;
    
    // 更新尺寸（效果数量可能变化）
    this.updateSize();
    
    // 更新工具提示计时器
    if (this.hoveredEffect) {
      this.tooltipTimer += deltaTime;
    } else {
      this.tooltipTimer = 0;
    }
  }

  /**
   * 渲染状态效果栏
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  render(ctx) {
    if (!this.visible || !this.entity) return;
    
    const statusEffect = this.entity.getComponent('statusEffect');
    if (!statusEffect || !statusEffect.hasAnyEffect()) return;
    
    const effects = statusEffect.getAllEffects();
    const visibleEffects = effects.slice(0, this.maxIcons);
    
    ctx.save();
    
    // 渲染每个状态效果图标
    for (let i = 0; i < visibleEffects.length; i++) {
      const effect = visibleEffects[i];
      const iconPos = this.getIconPosition(i);
      
      this.renderEffectIcon(ctx, effect, iconPos.x, iconPos.y);
    }
    
    // 渲染工具提示
    if (this.hoveredEffect && this.tooltipTimer > this.tooltipDelay) {
      this.renderTooltip(ctx, this.hoveredEffect);
    }
    
    ctx.restore();
  }

  /**
   * 获取图标位置
   * @param {number} index - 图标索引
   * @returns {Object} 位置 {x, y}
   */
  getIconPosition(index) {
    if (this.layout === 'horizontal') {
      return {
        x: this.x + index * (this.iconSize + this.spacing),
        y: this.y
      };
    } else {
      return {
        x: this.x,
        y: this.y + index * (this.iconSize + this.spacing)
      };
    }
  }

  /**
   * 渲染状态效果图标
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   * @param {StatusEffect} effect - 状态效果
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   */
  renderEffectIcon(ctx, effect, x, y) {
    const data = effect.data;
    const remainingPercent = effect.getRemainingPercent();
    
    // 绘制背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(x, y, this.iconSize, this.iconSize);
    
    // 绘制边框
    ctx.strokeStyle = data.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, this.iconSize, this.iconSize);
    
    // 绘制图标（使用简单的几何形状代替真实图标）
    this.renderEffectShape(ctx, effect, x + 4, y + 4, this.iconSize - 8);
    
    // 绘制持续时间进度条
    if (this.showDuration && effect.duration > 0) {
      const progressHeight = 4;
      const progressY = y + this.iconSize - progressHeight;
      
      // 背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(x, progressY, this.iconSize, progressHeight);
      
      // 进度条
      ctx.fillStyle = data.color;
      ctx.fillRect(x, progressY, this.iconSize * remainingPercent, progressHeight);
    }
    
    // 绘制持续时间文字
    if (this.showDuration && effect.remainingTime > 0) {
      const timeText = Math.ceil(effect.remainingTime).toString();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      // 文字阴影
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 2;
      ctx.fillText(timeText, x + this.iconSize / 2, y + this.iconSize - 6);
      ctx.shadowBlur = 0;
    }
    
    // 脉冲动画（剩余时间少于5秒时）
    if (effect.remainingTime < 5) {
      const pulseAlpha = 0.3 + 0.3 * Math.sin(this.animationTime * this.pulseSpeed * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
      ctx.fillRect(x, y, this.iconSize, this.iconSize);
    }
  }

  /**
   * 渲染状态效果形状（代替真实图标）
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   * @param {StatusEffect} effect - 状态效果
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} size - 尺寸
   */
  renderEffectShape(ctx, effect, x, y, size) {
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size / 3;
    
    ctx.fillStyle = effect.data.color;
    
    switch (effect.type) {
      case 0: // POISON - 骷髅头形状
        this.drawSkull(ctx, centerX, centerY, radius);
        break;
        
      case 1: // REGENERATION - 十字形状
        this.drawCross(ctx, centerX, centerY, radius);
        break;
        
      case 2: // HASTE - 闪电形状
        this.drawLightning(ctx, centerX, centerY, size);
        break;
        
      case 3: // SHIELD - 盾牌形状
        this.drawShield(ctx, centerX, centerY, radius);
        break;
        
      case 4: // WEAKNESS - 向下箭头
        this.drawDownArrow(ctx, centerX, centerY, radius);
        break;
        
      case 5: // RAGE - 向上箭头
        this.drawUpArrow(ctx, centerX, centerY, radius);
        break;
        
      default:
        // 默认圆形
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  /**
   * 绘制骷髅头形状
   */
  drawSkull(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y - radius * 0.2, radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    // 眼睛
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.15, 0, Math.PI * 2);
    ctx.arc(x + radius * 0.3, y - radius * 0.3, radius * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 绘制十字形状
   */
  drawCross(ctx, x, y, radius) {
    const thickness = radius * 0.3;
    
    // 垂直线
    ctx.fillRect(x - thickness / 2, y - radius, thickness, radius * 2);
    // 水平线
    ctx.fillRect(x - radius, y - thickness / 2, radius * 2, thickness);
  }

  /**
   * 绘制闪电形状
   */
  drawLightning(ctx, x, y, size) {
    const points = [
      { x: x - size * 0.2, y: y - size * 0.4 },
      { x: x + size * 0.1, y: y - size * 0.1 },
      { x: x - size * 0.1, y: y - size * 0.1 },
      { x: x + size * 0.2, y: y + size * 0.4 },
      { x: x - size * 0.1, y: y + size * 0.1 },
      { x: x + size * 0.1, y: y + size * 0.1 }
    ];
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 绘制盾牌形状
   */
  drawShield(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.quadraticCurveTo(x + radius, y - radius * 0.5, x + radius, y);
    ctx.quadraticCurveTo(x + radius, y + radius * 0.5, x, y + radius);
    ctx.quadraticCurveTo(x - radius, y + radius * 0.5, x - radius, y);
    ctx.quadraticCurveTo(x - radius, y - radius * 0.5, x, y - radius);
    ctx.fill();
  }

  /**
   * 绘制向下箭头
   */
  drawDownArrow(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.moveTo(x, y + radius);
    ctx.lineTo(x - radius * 0.6, y - radius * 0.2);
    ctx.lineTo(x - radius * 0.3, y - radius * 0.2);
    ctx.lineTo(x - radius * 0.3, y - radius);
    ctx.lineTo(x + radius * 0.3, y - radius);
    ctx.lineTo(x + radius * 0.3, y - radius * 0.2);
    ctx.lineTo(x + radius * 0.6, y - radius * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 绘制向上箭头
   */
  drawUpArrow(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x - radius * 0.6, y + radius * 0.2);
    ctx.lineTo(x - radius * 0.3, y + radius * 0.2);
    ctx.lineTo(x - radius * 0.3, y + radius);
    ctx.lineTo(x + radius * 0.3, y + radius);
    ctx.lineTo(x + radius * 0.3, y + radius * 0.2);
    ctx.lineTo(x + radius * 0.6, y + radius * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 渲染工具提示
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   * @param {StatusEffect} effect - 状态效果
   */
  renderTooltip(ctx, effect) {
    const data = effect.data;
    const padding = 8;
    const lineHeight = 16;
    
    // 准备文本
    const lines = [
      data.name,
      data.description,
      `剩余时间: ${Math.ceil(effect.remainingTime)}秒`
    ];
    
    // 计算工具提示尺寸
    ctx.font = '12px Arial';
    let maxWidth = 0;
    for (const line of lines) {
      const width = ctx.measureText(line).width;
      maxWidth = Math.max(maxWidth, width);
    }
    
    const tooltipWidth = maxWidth + padding * 2;
    const tooltipHeight = lines.length * lineHeight + padding * 2;
    
    // 计算位置（避免超出屏幕）
    let tooltipX = this.x + this.width + 10;
    let tooltipY = this.y;
    
    // 检查边界
    if (tooltipX + tooltipWidth > ctx.canvas.width) {
      tooltipX = this.x - tooltipWidth - 10;
    }
    if (tooltipY + tooltipHeight > ctx.canvas.height) {
      tooltipY = ctx.canvas.height - tooltipHeight;
    }
    
    // 绘制背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    
    // 绘制边框
    ctx.strokeStyle = data.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    
    // 绘制文本
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    for (let i = 0; i < lines.length; i++) {
      const textY = tooltipY + padding + i * lineHeight;
      
      if (i === 0) {
        // 标题使用效果颜色
        ctx.fillStyle = data.color;
        ctx.font = 'bold 12px Arial';
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
      }
      
      ctx.fillText(lines[i], tooltipX + padding, textY);
    }
  }

  /**
   * 检查点是否在组件内
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @returns {boolean}
   */
  containsPoint(x, y) {
    return x >= this.x && x <= this.x + this.width &&
           y >= this.y && y <= this.y + this.height;
  }

  /**
   * 处理鼠标移动事件
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   */
  onMouseMove(x, y) {
    if (!this.entity) return;
    
    const statusEffect = this.entity.getComponent('statusEffect');
    if (!statusEffect) return;
    
    // 检查鼠标是否悬停在某个图标上
    const effects = statusEffect.getAllEffects();
    const visibleEffects = effects.slice(0, this.maxIcons);
    
    this.hoveredEffect = null;
    
    for (let i = 0; i < visibleEffects.length; i++) {
      const iconPos = this.getIconPosition(i);
      
      if (x >= iconPos.x && x <= iconPos.x + this.iconSize &&
          y >= iconPos.y && y <= iconPos.y + this.iconSize) {
        this.hoveredEffect = visibleEffects[i];
        this.tooltipTimer = 0; // 重置工具提示计时器
        break;
      }
    }
  }

  /**
   * 处理鼠标离开事件
   */
  onMouseLeave() {
    this.hoveredEffect = null;
    this.tooltipTimer = 0;
  }
}