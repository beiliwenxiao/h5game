/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * YiJian18-Engine - read-only battle mode confirmation view
 ************************************************************/

import { UIElement } from './UIElement.js';
import { InputHints } from '../core/input/InputHints.js';
import { PadButton } from '../core/input/Xbox360Profile.js';
import { BattleMode } from '../systems/BattleSystem.js';

const clone = value => value ? JSON.parse(JSON.stringify(value)) : null;

/** UI only emits commands; BattleSystem owns the irreversible decision. */
export class BattleModeView extends UIElement {
  constructor(options = {}) {
    super({
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || 560,
      height: options.height || 300,
      visible: false,
      zIndex: options.zIndex || 120
    });
    this.onCommand = options.onCommand || (() => {});
    this.snapshot = null;
    this.selectedMode = BattleMode.OBSERVE;
    this.busy = false;
  }

  open(snapshot) {
    this.snapshot = clone(snapshot);
    this.selectedMode = snapshot?.selectedMode === BattleMode.INTERVENE
      ? BattleMode.INTERVENE
      : BattleMode.OBSERVE;
    this.busy = false;
    this.visible = true;
  }

  close() {
    this.visible = false;
    this.snapshot = null;
    this.busy = false;
  }

  setBusy(value) {
    this.busy = value === true;
  }

  _layout(viewWidth, viewHeight) {
    const width = Math.min(this.width, viewWidth - 32);
    const height = this.height;
    const x = (viewWidth - width) / 2;
    const y = (viewHeight - height) / 2;
    const gap = 16;
    const cardWidth = (width - 48 - gap) / 2;
    return {
      x, y, width, height,
      observe: { x: x + 24, y: y + 104, width: cardWidth, height: 126 },
      intervene: { x: x + 24 + cardWidth + gap, y: y + 104, width: cardWidth, height: 126 }
    };
  }

  handleInput({ inputManager, gamepad, viewWidth, viewHeight } = {}) {
    if (!this.visible) return false;
    // 模态框提交期间仍必须吞掉世界输入，避免点击/按键穿透到战斗和移动。
    if (this.busy || !inputManager) return true;
    const left = inputManager.isKeyPressed?.('arrowleft') || inputManager.isKeyPressed?.('a');
    const right = inputManager.isKeyPressed?.('arrowright') || inputManager.isKeyPressed?.('d');
    if (left) this.selectedMode = BattleMode.OBSERVE;
    if (right) this.selectedMode = BattleMode.INTERVENE;

    const clicked = inputManager.isMouseClicked?.() === true && !inputManager.isMouseClickHandled?.();
    if (clicked) {
      const mouse = inputManager.getMousePosition?.() || { x: -1, y: -1 };
      const layout = this._layout(viewWidth, viewHeight);
      const mode = this._modeAt(mouse.x, mouse.y, layout);
      inputManager.markMouseClickHandled?.();
      if (mode) {
        if (this.selectedMode === mode) this._confirm();
        else this.selectedMode = mode;
      }
    }

    const confirmed = inputManager.isKeyPressed?.('e')
      || inputManager.isKeyPressed?.('enter')
      || gamepad?.isButtonPressed?.(PadButton.A) === true
      || gamepad?.isButtonPressed?.(PadButton.X) === true;
    if (confirmed) this._confirm();

    const cancelled = inputManager.isKeyPressed?.('escape')
      || gamepad?.isButtonPressed?.(PadButton.B) === true;
    if (cancelled && this.snapshot?.allowCancel === true) this.onCommand({ type: 'cancel' });
    return true;
  }

  _confirm() {
    if (this.busy) return;
    this.onCommand({ type: 'selectMode', mode: this.selectedMode });
  }

  _modeAt(x, y, layout) {
    for (const mode of [BattleMode.OBSERVE, BattleMode.INTERVENE]) {
      const box = layout[mode];
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) return mode;
    }
    return null;
  }

  render(ctx, viewWidth = ctx?.canvas?.width || 1280, viewHeight = ctx?.canvas?.height || 720) {
    if (!this.visible || !ctx || !this.snapshot) return;
    const layout = this._layout(viewWidth, viewHeight);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, viewWidth, viewHeight);
    ctx.fillStyle = 'rgba(22,24,28,0.98)';
    ctx.strokeStyle = '#d6b85f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(layout.x, layout.y, layout.width, layout.height, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f2d17a';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(this.snapshot.title || '战役抉择', layout.x + layout.width / 2, layout.y + 18);
    ctx.fillStyle = '#e5e0d5';
    ctx.font = '14px Arial';
    ctx.fillText(this.snapshot.description || '选择一旦确认，本场战役不可更改。', layout.x + layout.width / 2, layout.y + 56);
    ctx.fillStyle = '#efb45c';
    ctx.font = '12px Arial';
    ctx.fillText('选择不可逆，请确认后果', layout.x + layout.width / 2, layout.y + 80);

    this._renderModeCard(ctx, layout.observe, BattleMode.OBSERVE, this.snapshot.observe || {});
    this._renderModeCard(ctx, layout.intervene, BattleMode.INTERVENE, this.snapshot.intervene || {});

    ctx.fillStyle = this.busy ? '#f0cf77' : '#c9c9c9';
    ctx.font = '13px Arial';
    const hint = this.busy
      ? '正在提交战役模式……'
      : `${InputHints.phrase('confirm')}确认${this.snapshot.allowCancel ? `，${InputHints.phrase('modalCancel')}返回` : ''}`;
    ctx.fillText(hint, layout.x + layout.width / 2, layout.y + layout.height - 38);
    ctx.restore();
  }

  _renderModeCard(ctx, box, mode, data) {
    const selected = this.selectedMode === mode;
    ctx.fillStyle = selected ? 'rgba(214,184,95,0.2)' : 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = selected ? '#f2d17a' : '#676767';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.width, box.height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = selected ? '#f2d17a' : '#e0e0e0';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(data.label || (mode === BattleMode.OBSERVE ? '观战' : '介入'), box.x + box.width / 2, box.y + 14);
    ctx.fillStyle = '#d0d0d0';
    ctx.font = '12px Arial';
    const lines = Array.isArray(data.consequences) ? data.consequences : [];
    lines.slice(0, 4).forEach((line, index) => {
      ctx.fillText(String(line), box.x + box.width / 2, box.y + 48 + index * 18);
    });
  }
}

export default BattleModeView;
