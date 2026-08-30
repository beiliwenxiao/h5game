/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/**
 * EventTargetFlash - 事件目标世界空间闪烁光（框架级）
 *
 * 事件触发时在目标物周围冒出星星闪光 + 呼吸式光晕，用于把玩家视线引向目标对象。
 * 样式参考道具掉落时的星星闪光/闪烁。
 *
 * 用法：
 *   flash.spawn({ worldX, worldY, color })
 *   flash.update(deltaTime)   // 或交给 render 内 push 演进
 *   flash.render(ctx)         // 世界坐标绘制
 *   flash.reset()             // 切场景清空
 */

/** 单次闪光存活时长（毫秒） */
const FLASH_DURATION = 900;
/** 星星数量 */
const SPARKLE_COUNT = 6;
/** 光晕基准半径 */
const HALO_RADIUS = 22;
/** 星星闪光的华彩颜色 */
const SPARKLE_COLOR = '#ffd75e';

/** 独立时间源（便于测试注入固定时钟）。 */
const nowFn = (typeof performance !== 'undefined' ? performance.now.bind(performance) : Date.now);

export class EventTargetFlash {
  constructor(config = {}) {
    this.duration = Number(config.duration) || FLASH_DURATION;
    this.haloRadius = Number(config.haloRadius) || HALO_RADIUS;
    this.sparkleCount = Number(config.sparkleCount) || SPARKLE_COUNT;
    this._now = typeof config.now === 'function' ? config.now : nowFn;
    /** @type {Array<Object>} 进行中的闪光记录 */
    this.flashes = [];
    /** 事件级去重：同一 eventId 只闪一次，避免桥重试/重放重复闪烁 */
    this._flashedEventIds = new Set();
  }

  /**
   * 生成一个星星闪光。
   * @param {Object} params
   * @param {number} params.worldX - 目标世界 X
   * @param {number} params.worldY - 目标世界 Y
   * @param {string} [params.color] - 光晕主色
   * @param {string} [params.eventId] - 事件去重键
   * @returns {boolean} 是否真正生成了新闪光
   */
  spawn({ worldX, worldY, color = '#ffd75e', eventId = null } = {}) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return false;
    if (eventId) {
      if (this._flashedEventIds.has(eventId)) return false;
      this._flashedEventIds.add(eventId);
    }
    this.flashes.push({
      x: worldX,
      y: worldY,
      startTime: this._now(),
      duration: this.duration,
      haloColor: color,
      phase: Math.random() * Math.PI * 2
    });
    if (this.flashes.length > 64) this.flashes.splice(0, this.flashes.length - 64);
    return true;
  }

  /** 剔除已过期的闪光。 */
  prune() {
    if (this.flashes.length === 0) return;
    const now = this._now();
    this.flashes = this.flashes.filter(f => now - f.startTime < f.duration);
  }

  /** 清除全部闪光（切场景调用）。 */
  reset() {
    this.flashes.length = 0;
    this._flashedEventIds.clear();
  }

  /**
   * 渲染世界空间星星闪光与呼吸光晕。
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (this.flashes.length === 0) return;
    const now = this._now();
    for (const flash of this.flashes) {
      const progress = (now - flash.startTime) / flash.duration;
      if (progress >= 1) continue;

      // 淡入-强闪-淡出：后半段快速衰减
      let alpha;
      if (progress < 0.15) alpha = progress / 0.15;
      else if (progress < 0.5) alpha = 1;
      else alpha = Math.max(0, 1 - (progress - 0.5) / 0.5);

      // 呼吸式缩放：先放大再回落
      const sizeFactor = progress < 0.3
        ? 0.6 + (progress / 0.3) * 0.8
        : 1.4 - ((progress - 0.3) / 0.7) * 0.8;

      const radiusX = this.haloRadius * sizeFactor;
      const radiusY = radiusX * 0.5; // 2.5D 压扁
      if (radiusX < 2) continue;

      ctx.save();

      // 主光晕：径向渐变（柔光圆）
      const glow = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radiusX);
      glow.addColorStop(0, flash.haloColor);
      glow.addColorStop(0.4, `rgba(255, 215, 94, ${0.5 * alpha})`);
      glow.addColorStop(1, 'rgba(255, 215, 94, 0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(flash.x, flash.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();

      // 星星闪光：四周星芒，随时间旋转
      ctx.strokeStyle = SPARKLE_COLOR;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const angleOffset = flash.phase + progress * 3;
      for (let i = 0; i < this.sparkleCount; i++) {
        const angle = angleOffset + (Math.PI * 2 * i) / this.sparkleCount;
        const outer = radiusX * (0.85 - 0.25 * Math.abs(Math.sin(progress * 6 + i)));
        const inner = radiusX * 0.18;
        const cx = flash.x + Math.cos(angle) * radiusX * 0.15;
        const cy = flash.y + Math.sin(angle) * radiusY * 0.15;
        const ox = Math.cos(angle) * outer;
        const oy = Math.sin(angle) * outer;
        const ix = Math.cos(angle) * inner;
        const iy = Math.sin(angle) * inner;
        ctx.beginPath();
        ctx.moveTo(cx + ix, cy - iy * 0.5);
        ctx.lineTo(cx + ox, cy - oy * 0.5);
        ctx.stroke();
      }

      ctx.restore();
    }
  }
}

export default EventTargetFlash;