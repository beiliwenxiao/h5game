/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const DEFAULT_CONFIG = Object.freeze({ duration: 0.8, peakHeight: 18 });

/**
 * 通用攀爬执行器。攀爬面由场景解析为世界坐标目标，本系统只拥有
 * 运动中的瞬时状态；技能解锁、体力和冷却由 AbilitySystem 负责。
 */
export class ClimbSystem {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._active = new Map();
  }

  startClimb(entity, target = {}, options = {}) {
    const transform = entity?.getComponent?.('transform');
    if (!transform || this._active.has(entity)) return false;
    const targetX = Number(target.x);
    const targetY = Number(target.y);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return false;

    entity.getComponent?.('movement')?.stop?.();
    const state = {
      transform,
      startX: transform.position.x,
      startY: transform.position.y,
      targetX,
      targetY,
      baseElevation: transform.position.elevation || 0,
      elapsed: 0,
      duration: Math.max(0.1, Number(options.duration) || this.config.duration),
      peakHeight: Math.max(0, Number(options.peakHeight) || this.config.peakHeight),
      ...this._acquireLayer(entity)
    };
    this._active.set(entity, state);
    return true;
  }

  isClimbing(entity) {
    return this._active.has(entity);
  }

  update(deltaTime) {
    for (const [entity, state] of this._active) {
      const transform = entity?.getComponent?.('transform');
      if (!transform) {
        this._finish(entity, state);
        continue;
      }
      state.elapsed += Math.max(0, Number(deltaTime) || 0);
      this._applyStatePosition(state);
      if (state.elapsed >= state.duration) this._finish(entity, state);
    }
  }

  cancel(entity, { restoreStart = false } = {}) {
    const state = this._active.get(entity);
    if (!state) return false;
    if (restoreStart) {
      state.transform.position.x = state.startX;
      state.transform.position.y = state.startY;
    }
    this._finish(entity, state);
    return true;
  }

  serialize(entity) {
    const state = this._active.get(entity);
    if (!state) return { schemaVersion: 1, active: false };
    return {
      schemaVersion: 1,
      active: true,
      startX: state.startX,
      startY: state.startY,
      targetX: state.targetX,
      targetY: state.targetY,
      baseElevation: state.baseElevation,
      elapsed: state.elapsed,
      duration: state.duration,
      peakHeight: state.peakHeight
    };
  }

  validateSerialized(data = {}) {
    if (data == null) return { ok: true };
    if (data.schemaVersion !== 1 || typeof data.active !== 'boolean') return { ok: false, code: 'invalidClimbState' };
    if (!data.active) return { ok: true };
    const fields = ['startX', 'startY', 'targetX', 'targetY', 'baseElevation', 'elapsed', 'duration', 'peakHeight'];
    if (fields.some(key => !Number.isFinite(Number(data[key]))) || Number(data.duration) <= 0 || Number(data.elapsed) < 0) {
      return { ok: false, code: 'invalidClimbState' };
    }
    return { ok: true };
  }

  /** 只校验并构造恢复草稿，不触碰当前位移、坐标或层。 */
  prepareDeserialize(entity, data = {}) {
    const check = this.validateSerialized(data);
    if (!check.ok) return check;
    if (!data.active) return { ok: true, draft: { active: false } };
    const transform = entity?.getComponent?.('transform');
    if (!transform) return { ok: false, code: 'climbRestoreFailed' };
    return {
      ok: true,
      draft: {
        active: true,
        transform,
        startX: Number(data.startX),
        startY: Number(data.startY),
        targetX: Number(data.targetX),
        targetY: Number(data.targetY),
        baseElevation: Number(data.baseElevation),
        elapsed: Number(data.elapsed),
        duration: Number(data.duration),
        peakHeight: Math.max(0, Number(data.peakHeight))
      }
    };
  }

  /** 已准备草稿的一次性提交；准备成功后本阶段不再包含可失败前置。 */
  commitDeserialize(entity, draft) {
    const previous = this._active.get(entity);
    if (previous) this._finish(entity, previous);
    if (!draft?.active) return { ok: true };

    entity.getComponent?.('movement')?.stop?.();
    const state = { ...draft, ...this._acquireLayer(entity) };
    this._applyStatePosition(state);
    if (state.elapsed >= state.duration) {
      state.transform.position.elevation = state.baseElevation;
      this._releaseLayer(entity, state);
      return { ok: true };
    }
    this._active.set(entity, state);
    return { ok: true };
  }

  deserialize(entity, data = {}) {
    const prepared = this.prepareDeserialize(entity, data);
    if (!prepared.ok) return prepared;
    return this.commitDeserialize(entity, prepared.draft);
  }

  cleanup() {
    for (const [entity, state] of this._active) this._finish(entity, state);
    this._active.clear();
  }

  _applyStatePosition(state) {
    const progress = Math.min(1, Math.max(0, state.elapsed / state.duration));
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    state.transform.position.x = state.startX + (state.targetX - state.startX) * eased;
    state.transform.position.y = state.startY + (state.targetY - state.startY) * eased;
    state.transform.position.elevation = state.baseElevation + state.peakHeight * 4 * progress * (1 - progress);
  }

  _acquireLayer(entity) {
    const layer = entity.getComponent?.('layer');
    if (!layer) return { layerPushed: false, layerToken: null };
    if (typeof layer.acquireLayer === 'function') {
      const layerToken = layer.acquireLayer('aerial', 'climb');
      return { layerPushed: !!layerToken, layerToken };
    }
    layer.pushLayer?.('aerial');
    return { layerPushed: true, layerToken: null };
  }

  _releaseLayer(entity, state) {
    if (!state.layerPushed) return;
    const layer = entity.getComponent?.('layer');
    if (state.layerToken && typeof layer?.releaseLayer === 'function') layer.releaseLayer(state.layerToken);
    else layer?.popLayer?.();
    state.layerPushed = false;
    state.layerToken = null;
  }

  _finish(entity, state) {
    state.transform.position.elevation = state.baseElevation;
    this._releaseLayer(entity, state);
    this._active.delete(entity);
  }
}

export default ClimbSystem;