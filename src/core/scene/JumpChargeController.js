/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/**
 * JumpChargeController - 蓄力跳跃控制器
 *
 * 规则：
 * - 按下跳跃键（空格/触屏跳跃按钮）开始蓄力；
 * - 按住 < 0.5s 松开 → 短跳 60px；
 * - 按住 ≥ 0.5s → 玩家头顶出现蓄力条，蓄力每多 0.1s 距离增加一部分；
 * - 蓄满 3s → 距离达到最大 180px（蓄力条加满）；
 * - 松开按键 → 按蓄力时间决定落点距离并起跳（60~180px 线性）。
 *
 * 本控制器只读输入保持状态与跳转回调，不持有业务规则；渲染头顶蓄力条为世界空间。
 */
export class JumpChargeController {
  constructor(config = {}) {
    this.config = {
      tapMaxMs: 500,        // < 0.5s 视为点按短跳
      chargeMaxMs: 3000,    // 蓄满 3s 达到最大距离
      tapDistance: 60,      // 点按短跳距离（px）
      maxDistance: 180,     // 满蓄力距离（px）
      barWidth: 72,
      barHeight: 8,
      barOffsetY: 22,
      ...config
    };
    this._now = config.now || (() => performance.now());
    this.active = false;
    this.actor = null;
    this.startMs = 0;
    this.holdMs = 0;
    this._jumpFn = null;
  }

  /** 设置松手后的跳跃执行回调（由场景注入，负责真正起跳）。 */
  setJumpCallback(fn) {
    this._jumpFn = typeof fn === 'function' ? fn : null;
  }

  /**
   * 每帧由输入驱动调用；内部按按键边沿自动 begin/accumulate/release。
   * @param {Object} options
   * @param {boolean} options.held - 当前跳跃键是否处于按住状态
   * @param {boolean} [options.blocked] - 是否应取消蓄力（如死亡/对话中）
   * @returns {Object|null}
   */
  update({ held = false, blocked = false, actor = null } = {}) {
    if (blocked && this.active) {
      this.cancel();
      return { charging: false, cancelled: true };
    }
    if (held) {
      if (!this.active) {
        this.active = true;
        this.actor = actor || this.actor;
        this.startMs = this._now();
        this.holdMs = 0;
      } else {
        this.holdMs = this._now() - this.startMs;
      }
      return { charging: true, progress: this.getProgress(), holdMs: this.holdMs };
    }
    if (this.active) {
      return this.release();
    }
    return null;
  }

  /** 主动释放（触屏按钮松手）：按当前蓄力时间起跳。 */
  release() {
    if (!this.active) return null;
    const holdMs = this._now() - this.startMs;
    const distance = this._distanceForHold(holdMs);
    const actor = this.actor;
    this.active = false;
    this.actor = null;
    this.holdMs = 0;
    this._jumpFn?.({ distance, holdMs, actor });
    return { charging: false, distance, holdMs };
  }

  /** 取消蓄力，不起跳。 */
  cancel() {
    this.active = false;
    this.actor = null;
    this.holdMs = 0;
  }

  isCharging() {
    return this.active;
  }

  /** 蓄力条进度 0~1；<0.5s 为 0，3s 为 1。 */
  getProgress() {
    if (!this.active) return 0;
    const { tapMaxMs, chargeMaxMs } = this.config;
    if (this.holdMs <= tapMaxMs) return 0;
    return Math.min(1, (this.holdMs - tapMaxMs) / Math.max(1, chargeMaxMs - tapMaxMs));
  }

  /** 蓄力时间 → 落点距离：<0.5s=60px；之后每 0.1s 增加一部分，3s=180px。 */
  _distanceForHold(holdMs) {
    const { tapMaxMs, chargeMaxMs, tapDistance, maxDistance } = this.config;
    if (holdMs <= tapMaxMs) return tapDistance;
    const ratio = Math.min(1, (holdMs - tapMaxMs) / Math.max(1, chargeMaxMs - tapMaxMs));
    return Math.round(tapDistance + (maxDistance - tapDistance) * ratio);
  }

  /** 渲染玩家头顶蓄力条（世界空间坐标）；仅按住超过 0.1s 后显示。 */
  render(ctx) {
    if (!this.active || !this.actor) return false;
    if (this.holdMs <= this.config.tapMaxMs) return false; // <0.1s 不显示
    const transform = this.actor.getComponent?.('transform');
    if (!transform?.position) {
      this.cancel();
      return false;
    }
    const sprite = this.actor.getComponent?.('sprite');
    const spriteHeight = (Number(sprite?.height) || 48) * (Number(sprite?.scale) || 1);
    const x = transform.position.x;
    const y = transform.position.y - (Number(transform.position.elevation) || 0)
      - spriteHeight - this.config.barOffsetY;
    const progress = this.getProgress();
    const { barWidth, barHeight } = this.config;
    const left = x - barWidth / 2;
    const top = y - barHeight / 2;
    const fillWidth = Math.max(0, (barWidth - 2) * progress);

    ctx.save();
    ctx.fillStyle = 'rgba(12, 10, 8, 0.88)';
    ctx.fillRect(left - 2, top - 2, barWidth + 4, barHeight + 4);
    ctx.fillStyle = '#3a2f45';
    ctx.fillRect(left, top, barWidth, barHeight);
    if (fillWidth > 0) {
      ctx.fillStyle = progress >= 1 ? '#ffd75e' : '#ff9d3f';
      ctx.fillRect(left + 1, top + 1, fillWidth, barHeight - 2);
    }
    ctx.strokeStyle = '#ffc46b';
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 0.5, top - 0.5, barWidth + 1, barHeight + 1);
    ctx.restore();
    return true;
  }

  dispose() {
    this.cancel();
  }
}

export default JumpChargeController;
