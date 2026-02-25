/**
 * ItemIconRenderer.js
 * 物品/装备图标绘制工具类
 * 统一管理所有物品和装备的图标绘制逻辑，供各UI面板复用
 */

export class ItemIconRenderer {

  /**
   * 绘制物品图标（通用入口）
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} item - 物品对象（需要 id, effect 等属性）
   * @param {number} cx - 中心X
   * @param {number} cy - 中心Y
   * @param {number} slotSize - 格子尺寸，用于缩放
   * @returns {boolean} 是否成功绘制了图标
   */
  static drawIcon(ctx, item, cx, cy, slotSize) {
    const id = item.id || '';
    const effectType = item.effect?.type || '';
    const scale = slotSize / 32;

    if (id === 'leftover_food') {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, ItemIconRenderer.drawLeftoverFood);
    }
    if (id === 'ragged_clothes') {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, ItemIconRenderer.drawRaggedClothes);
    }
    if (id === 'wooden_sword') {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, ItemIconRenderer.drawWoodenSword);
    }
    if (id === 'wooden_sword') {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, ItemIconRenderer.drawWoodenSword);
    }
    if (id === 'cloth_armor') {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, ItemIconRenderer.drawClothArmor);
    }
    if (id === 'wooden_bow') {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, ItemIconRenderer.drawWoodenBow);
    }
    if (id === 'wooden_arrow') {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, ItemIconRenderer.drawWoodenArrow);
    }
    if (id.includes('health_potion') || (item.type === 'consumable' && effectType === 'heal')) {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, (c) => ItemIconRenderer.drawPotion(c, '#ff3333', '#ff6666', '#cc0000'));
    }
    if (id.includes('mana_potion') || (item.type === 'consumable' && effectType === 'restore_mana')) {
      return ItemIconRenderer._drawScaled(ctx, cx, cy, scale, (c) => ItemIconRenderer.drawPotion(c, '#3366ff', '#6699ff', '#0033cc'));
    }
    return false;
  }

  /** @private 缩放绘制包装 */
  static _drawScaled(ctx, cx, cy, scale, drawFn) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    drawFn(ctx);
    ctx.restore();
    return true;
  }

  /**
   * 绘制残羹图标（中国碗 + 米粒）
   */
  static drawLeftoverFood(ctx) {
    // 碗身（贝塞尔曲线，口大底小）
    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.moveTo(-13, -5);
    ctx.bezierCurveTo(-12, 0, -6, 6, -4, 8);
    ctx.lineTo(4, 8);
    ctx.bezierCurveTo(6, 6, 12, 0, 13, -5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 碗底座
    ctx.fillStyle = '#7a6345';
    ctx.beginPath();
    ctx.ellipse(0, 8, 4, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 碗口
    ctx.fillStyle = '#a08060';
    ctx.beginPath();
    ctx.ellipse(0, -5, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 碗内部
    ctx.fillStyle = '#6b5a48';
    ctx.beginPath();
    ctx.ellipse(0, -5, 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 裂缝
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, -8);
    ctx.lineTo(9, -3);
    ctx.lineTo(10, 2);
    ctx.stroke();

    // 碗口缺口
    ctx.fillStyle = '#6b5a48';
    ctx.beginPath();
    ctx.arc(-9, -7, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 碗内米粒
    ctx.fillStyle = '#f5f0e0';
    const grains = [[-3, -5], [1, -6], [4, -5], [-1, -4], [2, -4]];
    for (const [gx, gy] of grains) {
      ctx.beginPath();
      ctx.ellipse(gx, gy, 1.5, 0.8, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 碗外散落米粒
    ctx.fillStyle = '#e8e0c8';
    ctx.beginPath();
    ctx.ellipse(-8, 2, 1.2, 0.7, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, 3, 1, 0.6, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 绘制破旧衣服图标
   */
  static drawRaggedClothes(ctx) {
    ctx.fillStyle = '#8B6914';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(-6, -10);
    ctx.lineTo(-12, -4);
    ctx.lineTo(-10, -2);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-8, 10);
    ctx.lineTo(8, 10);
    ctx.lineTo(7, -6);
    ctx.lineTo(10, -2);
    ctx.lineTo(12, -4);
    ctx.lineTo(6, -10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a4a0a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 领口
    ctx.fillStyle = '#6b5210';
    ctx.beginPath();
    ctx.ellipse(0, -11, 4, 2, 0, 0, Math.PI);
    ctx.fill();

    // 补丁
    ctx.fillStyle = '#6b5a10';
    ctx.fillRect(-5, 0, 4, 4);
    ctx.strokeStyle = '#4a3a08';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([1, 1]);
    ctx.strokeRect(-5, 0, 4, 4);
    ctx.setLineDash([]);

    // 破洞
    ctx.fillStyle = '#2a1a00';
    ctx.beginPath();
    ctx.ellipse(4, 3, 2, 1.5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // 撕裂痕迹
    ctx.strokeStyle = '#5a4a0a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-6, 10);
    ctx.lineTo(-5, 12);
    ctx.moveTo(-2, 10);
    ctx.lineTo(-1, 11);
    ctx.moveTo(3, 10);
    ctx.lineTo(4, 12);
    ctx.stroke();
  }

  /**
   * 绘制木剑图标
   */
  static drawWoodenSword(ctx) {
    // 剑身（木质剑刃）
    ctx.fillStyle = '#a08030';
    ctx.beginPath();
    ctx.moveTo(0, -14);    // 剑尖
    ctx.lineTo(3, -10);
    ctx.lineTo(3, 2);
    ctx.lineTo(-3, 2);
    ctx.lineTo(-3, -10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6b5210';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 剑身高光
    ctx.fillStyle = '#c0a050';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(1.5, -10);
    ctx.lineTo(1.5, 1);
    ctx.lineTo(0, 1);
    ctx.closePath();
    ctx.fill();

    // 护手（横条）
    ctx.fillStyle = '#5a4a0a';
    ctx.fillRect(-5, 2, 10, 2.5);

    // 剑柄
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(-1.5, 4.5, 3, 8);

    // 剑柄缠绕纹理
    ctx.strokeStyle = '#6b5210';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      const yy = 5.5 + i * 2.5;
      ctx.beginPath();
      ctx.moveTo(-1.5, yy);
      ctx.lineTo(1.5, yy + 1);
      ctx.stroke();
    }

    // 剑柄底部圆头
    ctx.fillStyle = '#5a4a0a';
    ctx.beginPath();
    ctx.arc(0, 13, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 绘制药水瓶图标
   */
  static drawPotion(ctx, mainColor, lightColor, darkColor) {
    const isHealth = mainColor === '#ff3333';
    const bodyColor = isHealth ? '#ff3333' : '#3366ff';
    const liquidColor = isHealth ? '#cc0000' : '#0033cc';
    const highlightColor = isHealth ? '#ff8888' : '#88aaff';

    ctx.translate(0, 12);

    // 瓶身
    const bw = 12, bh = 16;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-bw/2, -4);
    ctx.quadraticCurveTo(-bw/2, -bh - 2, -3, -bh - 2);
    ctx.lineTo(3, -bh - 2);
    ctx.quadraticCurveTo(bw/2, -bh - 2, bw/2, -4);
    ctx.quadraticCurveTo(bw/2, 0, 0, 0);
    ctx.quadraticCurveTo(-bw/2, 0, -bw/2, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 液体
    ctx.fillStyle = liquidColor;
    ctx.fillRect(-bw/2 + 1, -bh/2, bw - 2, bh/2 - 1);

    // 高光
    ctx.fillStyle = highlightColor;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-bw/2 + 2, -bh, 3, bh - 4);
    ctx.globalAlpha = 1.0;

    // 瓶口
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-3, -bh - 6, 6, 5);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(-3, -bh - 6, 6, 5);

    // 瓶盖
    ctx.fillStyle = '#654321';
    ctx.fillRect(-4, -bh - 8, 8, 3);
  }

  /**
   * 绘制木剑图标
   */
  static drawWoodenSword(ctx) {
    // 剑身
    ctx.strokeStyle = '#a08030';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.lineTo(0, -11);
    ctx.stroke();

    // 剑尖
    ctx.fillStyle = '#c0a040';
    ctx.beginPath();
    ctx.moveTo(-2, -10);
    ctx.lineTo(2, -10);
    ctx.lineTo(0, -15);
    ctx.closePath();
    ctx.fill();

    // 护手（横档）
    ctx.strokeStyle = '#6b5210';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, 4);
    ctx.lineTo(8, 4);
    ctx.stroke();

    // 剑柄
    ctx.strokeStyle = '#5a3a0a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, 13);
    ctx.stroke();

    // 剑柄缠绕纹
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-3, 6 + i * 2.5);
      ctx.lineTo(3, 6 + i * 2.5);
      ctx.stroke();
    }

    // 剑身高光
    ctx.strokeStyle = '#d4b860';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-1, -8);
    ctx.lineTo(-1, 3);
    ctx.stroke();
  }

  /**
   * 绘制木弓图标
   */
  static drawWoodenBow(ctx) {
    // 弓身（弧形）
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(4, 0, 14, Math.PI * 0.65, Math.PI * 1.35);
    ctx.stroke();

    // 弓身纹理
    ctx.strokeStyle = '#6b5210';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(4, 0, 13, Math.PI * 0.75, Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4, 0, 13, Math.PI * 1.1, Math.PI * 1.2);
    ctx.stroke();

    // 弓弦
    ctx.strokeStyle = '#c8b88a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4 + 14 * Math.cos(Math.PI * 0.65), 14 * Math.sin(Math.PI * 0.65));
    ctx.lineTo(4 + 14 * Math.cos(Math.PI * 1.35), 14 * Math.sin(Math.PI * 1.35));
    ctx.stroke();

    // 弓把缠绕
    ctx.strokeStyle = '#5a3a0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(4, 0, 14, Math.PI * 0.95, Math.PI * 1.05);
    ctx.stroke();
  }

  /**
   * 绘制木箭图标
   */
  static drawWoodenArrow(ctx) {
    // 箭杆
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -10);
    ctx.stroke();

    // 箭头（三角形）
    ctx.fillStyle = '#888888';
    ctx.beginPath();
    ctx.moveTo(-3, -9);
    ctx.lineTo(3, -9);
    ctx.lineTo(0, -15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 箭羽（两片）
    ctx.fillStyle = '#cc8844';
    ctx.beginPath();
    ctx.moveTo(-1, 10);
    ctx.lineTo(-5, 13);
    ctx.lineTo(-1, 7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1, 10);
    ctx.lineTo(5, 13);
    ctx.lineTo(1, 7);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 绘制布衣图标
   */
  static drawClothArmor(ctx) {
    // 主体
    ctx.fillStyle = '#6B8E6B';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(-7, -10);
    ctx.lineTo(-13, -4);
    ctx.lineTo(-11, -1);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-9, 12);
    ctx.lineTo(9, 12);
    ctx.lineTo(8, -5);
    ctx.lineTo(11, -1);
    ctx.lineTo(13, -4);
    ctx.lineTo(7, -10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4a6a4a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 领口
    ctx.fillStyle = '#4a6a4a';
    ctx.beginPath();
    ctx.ellipse(0, -12, 4, 2, 0, 0, Math.PI);
    ctx.fill();

    // 腰带
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(-9, 3, 18, 3);
    ctx.strokeStyle = '#5a4a0a';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-9, 3, 18, 3);

    // 腰带扣
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(-2, 3, 4, 3);

    // 布纹线条
    ctx.strokeStyle = '#4a6a4a';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-4, -8);
    ctx.lineTo(-4, 2);
    ctx.moveTo(4, -8);
    ctx.lineTo(4, 2);
    ctx.stroke();
  }
}
