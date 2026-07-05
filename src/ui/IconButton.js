/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

import { UIElement } from './UIElement.js';

/**
 * IconButton - 通用图标按钮（Canvas 渲染，可点击）
 *
 * 用于 PC 端等需要在画布上放置可点击功能按钮的场景（如属性、背包按钮）。
 * 支持 UI 编辑器布局：位置/大小由 x/y/width/height 决定，可被 UILayout 覆盖。
 */
export class IconButton extends UIElement {
  /**
   * @param {Object} options
   * @param {string} [options.icon] - 图标（emoji 或短文本）
   * @param {string} [options.label] - 底部标签文字
   * @param {Function} [options.onClick] - 点击回调
   * @param {string} [options.bgColor] - 背景色
   * @param {string} [options.borderColor] - 边框色
   */
  constructor(options = {}) {
    super({
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || 50,
      height: options.height || 50,
      visible: options.visible !== false,
      zIndex: options.zIndex || 210
    });
    this.icon = options.icon || '';
    this.label = options.label || '';
    this.hotkey = options.hotkey || '';   // 快捷键提示（如 'C'、'B'）
    this.onClick = options.onClick || null;
    this.bgColor = options.bgColor || 'rgba(40, 40, 40, 0.85)';
    this.borderColor = options.borderColor || '#888';
    this.hovered = false;
  }

  /**
   * 渲染按钮
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible) return;
    const { x, y, width: w, height: h } = this;

    ctx.save();
    // 背景
    ctx.fillStyle = this.hovered ? 'rgba(90, 90, 90, 0.9)' : this.bgColor;
    ctx.fillRect(x, y, w, h);
    // 边框
    ctx.strokeStyle = this.hovered ? '#ffffff' : this.borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    const cx = x + w / 2;
    const cy = y + h / 2;

    // 图标
    if (this.icon) {
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.floor(h * 0.42)}px Arial`;
      ctx.fillText(this.icon, cx, cy - (this.label ? h * 0.12 : 0));
    }
    // 标签
    if (this.label) {
      ctx.fillStyle = '#dddddd';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.floor(h * 0.22)}px Arial`;
      ctx.fillText(this.label, cx, cy + h * 0.3);
    }
    // 快捷键（右上角）
    if (this.hotkey) {
      ctx.fillStyle = '#ffd479';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.font = `bold ${Math.floor(h * 0.26)}px Arial`;
      ctx.fillText(this.hotkey, x + w - 3, y + 2);
    }
    ctx.restore();
  }

  /**
   * 更新鼠标悬停状态
   * @param {number} x
   * @param {number} y
   */
  handleMouseMove(x, y) {
    if (!this.visible) { this.hovered = false; return; }
    this.hovered = this.containsPoint(x, y);
  }

  /**
   * 处理点击
   * @param {number} x
   * @param {number} y
   * @param {string} button
   * @returns {boolean} 是否处理了点击
   */
  handleMouseClick(x, y, button = 'left') {
    if (!this.visible || button !== 'left' || !this.containsPoint(x, y)) return false;
    if (this.onClick) this.onClick();
    return true;
  }
}

export default IconButton;
