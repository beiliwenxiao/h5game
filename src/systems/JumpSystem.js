/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const DEFAULT_CONFIG = Object.freeze({ distance: 56, duration: 0.6, peakHeight: 32, deadzone: 0.2 });

/**
 * 通用跳跃系统：elevation 负责视觉高度，地面位移按增量推进，
 * 因而仍可由现有碰撞系统逐帧修正，不会穿透静态障碍。
 */
export class JumpSystem {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._active = new Map();
  }

  startJump(entity, direction = { x: 0, y: 0 }, options = {}) {
    const transform = entity?.getComponent?.('transform');
    if (!transform || this._active.has(entity)) return false;
    const magnitude = Math.hypot(direction.x || 0, direction.y || 0);
    const moving = magnitude >= this.config.deadzone;
    const movement = entity.getComponent?.('movement');
    movement?.stop?.();
    this._active.set(entity, {
      transform,
      mode: options.mode === 'power' ? 'power' : 'normal',
      elapsed: 0,
      chargeDuration: Math.max(0, Number(options.chargeDuration) || 0),
      horizontalProgress: 0,
      baseElevation: transform.position.elevation || 0,
      direction: moving
        ? { x: direction.x / magnitude, y: direction.y / magnitude }
        : { x: 0, y: 0 },
      distance: moving ? Math.max(0, Number(options.distance) || this.config.distance) : 0,
      duration: Math.max(0.1, Number(options.duration) || this.config.duration),
      peakHeight: Math.max(0, Number(options.peakHeight) || this.config.peakHeight)
    });
    return true;
  }

  isJumping(entity) {
    return this._active.has(entity);
  }

  update(deltaTime) {
    for (const [entity, data] of this._active) {
      const transform = entity?.getComponent?.('transform');
      if (!transform) {
        this._active.delete(entity);
        continue;
      }
      data.elapsed += Math.max(0, deltaTime || 0);
      if (data.elapsed < data.chargeDuration) {
        transform.position.elevation = data.baseElevation;
        continue;
      }
      const airborneElapsed = data.elapsed - data.chargeDuration;
      const progress = Math.min(1, airborneElapsed / data.duration);
      // easeOutQuad：起跳立即开始前移，不保留起步预备缓动；落地自然减速。
      const horizontal = 1 - (1 - progress) * (1 - progress);
      const step = (horizontal - data.horizontalProgress) * data.distance;
      transform.position.x += data.direction.x * step;
      transform.position.y += data.direction.y * step;
      transform.position.elevation = data.baseElevation +
        data.peakHeight * 4 * progress * (1 - progress);
      data.horizontalProgress = horizontal;
      if (progress >= 1) {
        transform.position.elevation = data.baseElevation;
        this._active.delete(entity);
      }
    }
  }

  cleanup() {
    for (const data of this._active.values()) {
      data.transform.position.elevation = data.baseElevation;
    }
    this._active.clear();
  }
}

export default JumpSystem;
