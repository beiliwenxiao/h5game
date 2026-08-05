/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

function cancellableResolved(value) {
  const promise = Promise.resolve(value);
  promise.cancel = () => false;
  return promise;
}

/** 由场景 update/render 驱动的淡黑覆盖层，不持有场景或渲染循环。 */
export class FadeOverlayTransition {
  constructor({ duration = 0.3, scope = null } = {}) {
    this.duration = Math.max(0, Number(duration) || 0);
    this.scope = scope;
    this.active = false;
    this.alpha = 0;
    this.phase = 'idle';
    this._elapsed = 0;
    this._callback = null;
    this._callbackValue = undefined;
    this._resolve = null;
    this._reject = null;
    this._version = 0;
    this._disposed = false;
    this._detachScope = typeof scope?.add === 'function'
      ? scope.add(() => {
        this._disposed = true;
        this.cancel('disposed');
      })
      : null;
  }

  start(callback = null) {
    if (this._disposed || this.scope?.disposed) {
      return cancellableResolved({ cancelled: true, reason: 'disposed' });
    }
    if (this.active) this.cancel('superseded');
    const version = ++this._version;
    this.active = true;
    this.alpha = 0;
    this.phase = 'fadeOut';
    this._elapsed = 0;
    this._callback = callback;
    this._callbackValue = undefined;

    const promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    promise.cancel = () => this.cancel('cancelled');
    if (this.duration === 0) this._beginCallback(version);
    return promise;
  }

  update(dt = 0) {
    if (!this.active) return false;
    if (this._disposed || this.scope?.disposed) return this.cancel('disposed');
    const delta = Math.max(0, Number(dt) || 0);
    if (this.phase === 'fadeOut') {
      this._elapsed += delta;
      this.alpha = this.duration === 0 ? 1 : Math.min(1, this._elapsed / this.duration);
      if (this.alpha >= 1) this._beginCallback(this._version);
      return true;
    }
    if (this.phase === 'fadeIn') {
      this._elapsed += delta;
      this.alpha = this.duration === 0 ? 0 : Math.max(0, 1 - this._elapsed / this.duration);
      if (this.alpha <= 0) this._complete(this._version);
      return true;
    }
    return true;
  }

  render(ctx, { width = ctx?.canvas?.width || 0, height = ctx?.canvas?.height || 0 } = {}) {
    if (!this.active || !ctx) return false;
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, this.alpha))})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return true;
  }

  cancel(reason = 'cancelled') {
    if (!this.active) return false;
    this._version++;
    const resolve = this._resolve;
    this._reset();
    if (resolve) resolve({ cancelled: true, reason });
    return true;
  }

  _beginCallback(version) {
    if (!this._isCurrent(version) || this.phase !== 'fadeOut') return;
    this.alpha = 1;
    this.phase = 'callback';
    let value;
    try {
      value = typeof this._callback === 'function' ? this._callback() : undefined;
    } catch (error) {
      this._fail(version, error);
      return;
    }
    Promise.resolve(value).then(
      result => {
        if (!this._isCurrent(version)) return;
        this._callbackValue = result;
        this.phase = 'fadeIn';
        this._elapsed = 0;
        if (this.duration === 0) this._complete(version);
      },
      error => this._fail(version, error)
    );
  }

  _complete(version) {
    if (!this._isCurrent(version)) return;
    const resolve = this._resolve;
    const value = this._callbackValue;
    this._reset();
    if (resolve) resolve({ cancelled: false, value });
  }

  _fail(version, error) {
    if (!this._isCurrent(version)) return;
    const reject = this._reject;
    this._reset();
    if (reject) reject(error);
  }

  _isCurrent(version) {
    return this.active && version === this._version && !this._disposed && !this.scope?.disposed;
  }

  _reset() {
    this.active = false;
    this.alpha = 0;
    this.phase = 'idle';
    this._elapsed = 0;
    this._callback = null;
    this._callbackValue = undefined;
    this._resolve = null;
    this._reject = null;
  }
}

export default FadeOverlayTransition;