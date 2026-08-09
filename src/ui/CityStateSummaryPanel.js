/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * YiJian18-Engine - 城市状态只读摘要
 ************************************************************/

import { UIElement } from './UIElement.js';

function cloneSnapshot(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

/** 只绘制调用方提供的领域快照，不持有也不修改 Blackboard。 */
export class CityStateSummaryPanel extends UIElement {
  constructor(options = {}) {
    super({
      x: options.x || 12,
      y: options.y || 12,
      width: options.width || 250,
      height: options.height || 154,
      visible: options.visible === true,
      zIndex: options.zIndex || 45
    });
    this.compact = options.compact === true;
    this.snapshot = null;
  }

  setSnapshot(snapshot) {
    this.snapshot = cloneSnapshot(snapshot);
  }

  render(ctx) {
    if (!this.visible || !ctx || !this.snapshot) return;
    const data = this.snapshot;
    const pad = this.compact ? 8 : 10;
    const lineHeight = this.compact ? 15 : 18;
    const fontSize = this.compact ? 11 : 12;

    ctx.save();
    ctx.fillStyle = 'rgba(20, 18, 14, 0.88)';
    ctx.strokeStyle = 'rgba(214, 184, 95, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(this.x, this.y, this.width, this.height, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f2d17a';
    ctx.font = `bold ${fontSize + 2}px Arial`;
    ctx.fillText(`${data.cityName || '城市'} · 第 ${data.currentDay || 1} 日`, this.x + pad, this.y + pad);

    let y = this.y + pad + lineHeight + 2;
    ctx.fillStyle = '#eee4cf';
    ctx.font = `${fontSize}px Arial`;
    const resources = data.resources || {};
    const lines = [
      `粮 ${resources.food || 0}  木 ${resources.wood || 0}  药 ${resources.herb || 0}  铁 ${resources.iron || 0}`,
      `损毁 ${Math.round((data.damageRatio || 0) * 100)}%  士气 ${data.morale || 0}  声望 ${data.reputation || 0}`,
      `饥民事件：${data.refugeeStatus || '尚未发生'}`
    ];
    for (const line of lines) {
      ctx.fillText(line, this.x + pad, y);
      y += lineHeight;
    }
    ctx.restore();
  }
}

export default CityStateSummaryPanel;
