/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-08-02
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

import { UIElement } from './UIElement.js';
import { InputHints } from '../core/input/InputHints.js';
import {
  PAD_LAYOUT,
  PAD_BUTTON_LABELS,
  BINDING_DESCRIPTIONS
} from '../core/input/Xbox360Profile.js';

/**
 * GamepadPanel - Xbox 360 手柄示意 UI
 *
 * 两种用途：
 *   1. 手柄连接后左下角常驻一个小状态指示（HUD 模式）
 *   2. 打开面板显示完整手柄图 + 按键映射表，实时高亮按下的键（可视化调试/说明）
 *
 * 纯 Canvas 绘制，无外部图片依赖（微信小游戏也能画）。数据来自 InputManager.gamepad。
 *
 * authority: 'client'  // 纯表现
 */
export class GamepadPanel extends UIElement {
  /**
   * @param {Object} options
   * @param {import('../core/InputManager.js').InputManager} options.inputManager
   * @param {number} [options.x] / [options.y] / [options.width] / [options.height]
   */
  constructor(options = {}) {
    super({
      x: options.x != null ? options.x : 0,
      y: options.y != null ? options.y : 0,
      width: options.width || 460,
      height: options.height || 360,
      visible: options.visible || false,
      zIndex: options.zIndex || 900
    });
    this.inputManager = options.inputManager || null;

    // HUD 常驻小指示（手柄连上就显示，不受面板 visible 影响）
    this.showHud = options.showHud !== false;
    this.hudX = options.hudX != null ? options.hudX : 12;
    this.hudY = options.hudY != null ? options.hudY : 12;

    this._pulse = 0; // 高亮呼吸动画计时
  }

  /** 面板显隐切换 */
  toggle() {
    this.visible = !this.visible;
  }

  get gamepad() {
    return this.inputManager ? this.inputManager.gamepad : null;
  }

  update(deltaTime) {
    this._pulse += (deltaTime || 16) / 1000;
  }

  render(ctx) {
    const gp = this.gamepad;
    // HUD 小指示：手柄已连接且启用
    if (this.showHud && gp && gp.isConnected()) {
      this._renderHud(ctx, gp);
    }
    if (!this.visible) return;
    this._renderPanel(ctx, gp);
  }

  /** @private 左下角小指示：🎮 + 手柄名 + 方案状态 */
  _renderHud(ctx, gp) {
    const info = gp.info || {};
    const isActive = InputHints.scheme === 'gamepad';
    const label = isActive
      ? (info.isXbox ? 'Xbox 手柄' : '手柄')
      : (info.isXbox ? 'Xbox (暂停)' : '手柄 (暂停)');
    ctx.save();
    ctx.font = '13px Arial';
    const textW = ctx.measureText(label).width;
    const w = 30 + textW + 12;
    const h = 26;
    const x = this.hudX;
    const y = this.hudY;

    ctx.fillStyle = 'rgba(20,28,40,0.78)';
    this._roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = isActive ? 'rgba(80,200,120,0.7)' : 'rgba(200,200,80,0.5)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();

    ctx.fillStyle = isActive ? '#5fd07a' : '#aaa06a';
    ctx.font = '15px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(isActive ? '🎮' : '⏸️', x + 8, y + h / 2 + 1);
    ctx.fillStyle = isActive ? '#dfe8f0' : '#999980';
    ctx.font = '13px Arial';
    ctx.fillText(label, x + 28, y + h / 2 + 1);
    ctx.restore();
  }

  /** @private 完整面板：标题 + 手柄图 + 映射表 */
  _renderPanel(ctx, gp) {
    const x = this.x;
    const y = this.y;
    const w = this.width;
    const h = this.height;

    ctx.save();
    // 背板
    ctx.fillStyle = 'rgba(12,18,30,0.94)';
    this._roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,140,200,0.6)';
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();

    // 标题
    ctx.fillStyle = '#8fc7ff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('手柄 (Xbox 360)', x + 16, y + 12);

    // 连接状态
    const connected = !!(gp && gp.isConnected());
    ctx.textAlign = 'right';
    ctx.font = '12px Arial';
    ctx.fillStyle = connected ? '#5fd07a' : '#d06a6a';
    ctx.fillText(connected ? (gp.info.isXbox ? '● 已连接 Xbox 手柄' : '● 已连接手柄') : '○ 未检测到手柄', x + w - 16, y + 15);

    // 手柄绘制区（左半）
    const padArea = { x: x + 16, y: y + 44, w: w * 0.54, h: h - 64 };
    this._renderPad(ctx, gp, padArea);

    // 映射表（右半）
    const listArea = { x: x + w * 0.56, y: y + 44, w: w * 0.42, h: h - 64 };
    this._renderBindingList(ctx, gp, listArea);

    if (!connected) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('连接手柄后按任意键测试', x + w / 2, y + h - 18);
    }
    ctx.restore();
  }

  /** @private 画手柄本体（摇杆 + 按钮），按下的键高亮 */
  _renderPad(ctx, gp, area) {
    // 手柄外壳
    ctx.fillStyle = 'rgba(30,38,52,0.9)';
    this._roundRect(ctx, area.x, area.y + area.h * 0.18, area.w, area.h * 0.68, 18);
    ctx.fill();

    const glow = 0.5 + 0.5 * Math.sin(this._pulse * 6); // 呼吸高亮

    // 摇杆
    for (const st of PAD_LAYOUT.sticks) {
      const cx = area.x + st.cx * area.w;
      const cy = area.y + st.cy * area.h;
      const r = st.r * area.w;
      // 底盘
      ctx.fillStyle = 'rgba(15,20,30,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // 摇杆帽（随实际推杆偏移）
      let dx = 0, dy = 0;
      if (gp && gp.isConnected()) {
        const v = st.axis === 'left' ? gp.leftStick : gp.rightStick;
        dx = v.x * r * 0.5;
        dy = v.y * r * 0.5;
      }
      const pressed = gp && gp.isConnected() && gp.isButtonDown(st.clickButton);
      ctx.fillStyle = pressed ? `rgba(95,208,122,${0.6 + 0.4 * glow})` : 'rgba(120,140,170,0.95)';
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c1220';
      ctx.font = `${Math.round(r * 0.5)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.label, cx + dx, cy + dy);
    }

    // 按钮
    for (const btn of PAD_LAYOUT.buttons) {
      const active = gp && gp.isConnected() && gp.isButtonDown(btn.index);
      const label = PAD_BUTTON_LABELS[btn.index] || '';
      const baseColor = btn.color || 'rgba(90,105,130,0.95)';
      const cx = area.x + btn.x * area.w;
      const cy = area.y + btn.y * area.h;

      ctx.fillStyle = active ? this._highlight(baseColor, glow) : baseColor;
      if (btn.shape === 'circle') {
        const r = btn.r * area.w;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        if (active) { ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * glow})`; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.max(9, Math.round(r * 0.9))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
      } else {
        const bw = btn.w * area.w;
        const bh = btn.h * area.h;
        this._roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 4);
        ctx.fill();
        if (active) { ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * glow})`; ctx.lineWidth = 2; this._roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 4); ctx.stroke(); }
        ctx.fillStyle = '#e6ecf2';
        ctx.font = `${Math.max(8, Math.round(bh * 0.55))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
      }
    }
  }

  /** @private 右侧按键→功能映射表 */
  _renderBindingList(ctx, gp, area) {
    const rows = Object.keys(BINDING_DESCRIPTIONS)
      .map(Number)
      .filter(idx => BINDING_DESCRIPTIONS[idx] && BINDING_DESCRIPTIONS[idx] !== '—');

    const lineH = Math.min(20, area.h / rows.length);
    ctx.textBaseline = 'middle';
    let ty = area.y + lineH / 2;
    for (const idx of rows) {
      const active = gp && gp.isConnected() && gp.isButtonDown(idx);
      const label = PAD_BUTTON_LABELS[idx] || '';
      const desc = BINDING_DESCRIPTIONS[idx];

      // 按键徽标
      ctx.fillStyle = active ? '#5fd07a' : 'rgba(70,88,115,0.9)';
      this._roundRect(ctx, area.x, ty - lineH * 0.38, 34, lineH * 0.76, 4);
      ctx.fill();
      ctx.fillStyle = active ? '#0c1220' : '#cdd7e2';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, area.x + 17, ty);

      // 功能名
      ctx.fillStyle = active ? '#eaffea' : '#9fb0c2';
      ctx.font = '12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(desc, area.x + 42, ty);

      ty += lineH;
    }
  }

  /** @private 让按下的按钮颜色更亮 */
  _highlight(color, glow) {
    // 简单叠一层白，兼容 rgba/#hex
    return `rgba(255,255,255,${0.35 + 0.35 * glow})`;
  }

  /** @private 圆角矩形路径 */
  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** 面板内点击一律消费，避免穿透到游戏世界 */
  handleMouseClick(x, y, button = 'left') {
    return this.visible && this.isPointInside(x, y);
  }
}

export default GamepadPanel;
