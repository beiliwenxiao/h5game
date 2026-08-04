/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 ************************************************************/

/**
 * ItemSpriteRenderer - 世界地面物品的手绘精灵（框架级，纯绘制无状态）
 *
 * 全部为静态方法，只依赖 ctx 与坐标，不持有任何游戏状态。
 * 用于渲染掉落在地上的可拾取物品图标（与 UI 里的 ItemIconRenderer 区分：
 * 后者画背包格子内的小图标，本类画世界坐标里的地面物件，带 y 偏移与阴影语义）。
 *
 * 用法：
 *   ItemSpriteRenderer.draw(ctx, 'leftover_food', x, y);
 *   ItemSpriteRenderer.drawPotion(ctx, x, y, 'health_potion');
 */
export class ItemSpriteRenderer {
  /**
   * 按物品 id 分发到对应画法。
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} itemId - 物品 id
   * @param {number} x - 世界 X
   * @param {number} y - 世界 Y（物品落地点）
   * @returns {boolean} 是否有对应画法（false 时调用方需自行兜底）
   */
  static draw(ctx, itemId, x, y) {
    switch (itemId) {
      case 'leftover_food': this.drawLeftoverFood(ctx, x, y); return true;
      case 'ragged_clothes': this.drawRaggedClothes(ctx, x, y); return true;
      case 'wooden_sword': this.drawWoodenSword(ctx, x, y); return true;
      case 'wooden_bow': this.drawWoodenBow(ctx, x, y); return true;
      case 'wooden_arrow': this.drawWoodenArrow(ctx, x, y); return true;
      case 'health_potion':
      case 'mana_potion': this.drawPotion(ctx, x, y, itemId); return true;
      default: return false;
    }
  }

  /** 剩饭（中国碗，口大底小，带裂缝与米粒） */
  static drawLeftoverFood(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 8);

    // 碗身：贝塞尔画出口大底小
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

    // 裂缝（破碗）
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

    ctx.restore();
  }

  /** 破旧衣服（补丁 + 破洞 + 撕裂下摆） */
  static drawRaggedClothes(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 8);

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

    ctx.restore();
  }

  /** 木剑（斜放 45 度） */
  static drawWoodenSword(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 10);
    ctx.rotate(-Math.PI / 4);

    // 剑身
    ctx.fillStyle = '#a08030';
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(3.5, -12);
    ctx.lineTo(3.5, 3);
    ctx.lineTo(-3.5, 3);
    ctx.lineTo(-3.5, -12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6b5210';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 剑身高光
    ctx.fillStyle = '#c0a050';
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(1.5, -12);
    ctx.lineTo(1.5, 2);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();

    // 护手
    ctx.fillStyle = '#5a4a0a';
    ctx.fillRect(-6, 3, 12, 3);

    // 剑柄
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(-2, 6, 4, 9);

    // 剑柄底部
    ctx.fillStyle = '#5a4a0a';
    ctx.beginPath();
    ctx.arc(0, 16, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** 木弓（弧形木杆 + 弓弦） */
  static drawWoodenBow(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 10);

    // 弓身
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(4, 0, 14, Math.PI * 0.7, Math.PI * 1.3, false);
    ctx.stroke();

    // 弓身高光
    ctx.strokeStyle = '#a08030';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(4, 0, 13, Math.PI * 0.8, Math.PI * 1.2, false);
    ctx.stroke();

    // 弓弦
    ctx.strokeStyle = '#d4c4a0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4 + 14 * Math.cos(Math.PI * 0.7), 14 * Math.sin(Math.PI * 0.7));
    ctx.lineTo(4 + 14 * Math.cos(Math.PI * 1.3), 14 * Math.sin(Math.PI * 1.3));
    ctx.stroke();

    ctx.restore();
  }

  /** 木箭（一捆 3 支） */
  static drawWoodenArrow(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 8);

    for (let i = -1; i <= 1; i++) {
      const ox = i * 3;
      const rot = i * 0.15;
      ctx.save();
      ctx.translate(ox, 0);
      ctx.rotate(rot);

      // 箭杆
      ctx.strokeStyle = '#8B6914';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, -8);
      ctx.stroke();

      // 箭头
      ctx.fillStyle = '#888888';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(-2.5, -7);
      ctx.lineTo(2.5, -7);
      ctx.closePath();
      ctx.fill();

      // 箭羽
      ctx.fillStyle = '#cc4444';
      ctx.beginPath();
      ctx.moveTo(-2, 8);
      ctx.lineTo(0, 5);
      ctx.lineTo(2, 8);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * 药水瓶
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {string} potionType - 'health_potion' | 'mana_potion'
   */
  static drawPotion(ctx, x, y, potionType) {
    const isHealth = potionType === 'health_potion';
    const bodyColor = isHealth ? '#ff3333' : '#3366ff';
    const liquidColor = isHealth ? '#cc0000' : '#0033cc';
    const highlightColor = isHealth ? '#ff8888' : '#88aaff';

    ctx.save();
    ctx.translate(x, y);

    // 瓶身
    const bw = 12, bh = 16;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-bw / 2, -4);
    ctx.quadraticCurveTo(-bw / 2, -bh - 2, -3, -bh - 2);
    ctx.lineTo(3, -bh - 2);
    ctx.quadraticCurveTo(bw / 2, -bh - 2, bw / 2, -4);
    ctx.quadraticCurveTo(bw / 2, 0, 0, 0);
    ctx.quadraticCurveTo(-bw / 2, 0, -bw / 2, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 液体
    ctx.fillStyle = liquidColor;
    ctx.fillRect(-bw / 2 + 1, -bh / 2, bw - 2, bh / 2 - 1);

    // 高光
    ctx.fillStyle = highlightColor;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-bw / 2 + 2, -bh, 3, bh - 4);
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

    ctx.restore();
  }
}

export default ItemSpriteRenderer;
