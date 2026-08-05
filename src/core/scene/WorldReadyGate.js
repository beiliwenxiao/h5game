/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { SceneResourceScope } from './SceneResourceScope.js';

function makeError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** 汇合多个异步世界资源，并将超时计时器托管给场景资源作用域。 */
export class WorldReadyGate {
  constructor({
    required = ['terrains', 'placements'],
    timeout = 3000,
    scope = null,
    onReady = null,
    onTimeout = null
  } = {}) {
    this.required = [...new Set(required)];
    this.timeout = Math.max(0, Number(timeout) || 0);
    this.scope = scope || new SceneResourceScope();
    this.onReady = onReady;
    this.onTimeout = onTimeout;
    this._ownsScope = !scope;
    this._state = 'pending';
    this._entries = new Map(this.required.map(name => [name, { state: 'pending' }]));
    this._waiters = [];
    this._timer = null;
    this._detachScope = this._ownsScope || typeof this.scope.add !== 'function'
      ? null
      : this.scope.add(() => this.dispose());
    this._startTimer();
    this._checkReady();
  }

  get ready() {
    return this._state === 'ready';
  }

  get status() {
    const entries = {};
    for (const [name, entry] of this._entries) entries[name] = { ...entry };
    return {
      state: this._state,
      required: [...this.required],
      pending: this.required.filter(name => this._entries.get(name)?.state === 'pending'),
      entries
    };
  }

  resolve(name, value) {
    if (this._state !== 'pending') return false;
    const current = this._entries.get(name);
    if (current && current.state !== 'pending') return false;
    this._entries.set(name, { state: 'resolved', value });
    this._checkReady();
    return true;
  }

  reject(name, error) {
    if (this._state !== 'pending') return false;
    const current = this._entries.get(name);
    if (current && current.state !== 'pending') return false;
    const reason = error instanceof Error ? error : new Error(String(error));
    this._entries.set(name, { state: 'rejected', error: reason });
    this._finish('rejected', reason);
    return true;
  }

  wait() {
    if (this.ready) return Promise.resolve(this._values());
    if (this._state === 'rejected') return Promise.reject(this._terminalError);
    if (this._state === 'timedOut') return Promise.reject(this._terminalError);
    if (this._state === 'disposed') return Promise.reject(this._terminalError);
    return new Promise((resolve, reject) => this._waiters.push({ resolve, reject }));
  }

  dispose() {
    if (this._state === 'disposed') return false;
    const wasPending = this._state === 'pending';
    this._clearTimer();
    this._state = 'disposed';
    this._terminalError = makeError('AbortError', 'World ready gate was disposed');
    if (wasPending) this._settleWaiters(false, this._terminalError);
    const detach = this._detachScope;
    this._detachScope = null;
    if (detach) detach();
    if (this._ownsScope && !this.scope.disposed) this.scope.dispose();
    return true;
  }

  _startTimer() {
    if (this._state !== 'pending') return;
    if (typeof this.scope.setTimeout !== 'function') {
      throw new TypeError('WorldReadyGate scope must provide setTimeout');
    }
    this._timer = this.scope.setTimeout(() => {
      if (this._state !== 'pending') return;
      const error = makeError('TimeoutError', `World readiness timed out after ${this.timeout}ms`);
      for (const name of this.required) {
        if (this._entries.get(name)?.state === 'pending') {
          this._entries.set(name, { state: 'timedOut', error });
        }
      }
      this._state = 'timedOut';
      this._terminalError = error;
      this._timer = null;
      this._call(this.onTimeout, this.status);
      this._settleWaiters(false, error);
    }, this.timeout);
  }

  _checkReady() {
    if (this._state !== 'pending') return;
    if (!this.required.every(name => this._entries.get(name)?.state === 'resolved')) return;
    this._finish('ready', this._values());
  }

  _finish(state, payload) {
    this._state = state;
    this._clearTimer();
    if (state === 'ready') {
      this._call(this.onReady, payload);
      this._settleWaiters(true, payload);
    } else {
      this._terminalError = payload;
      this._settleWaiters(false, payload);
    }
  }

  _values() {
    return Object.fromEntries(this.required.map(name => [name, this._entries.get(name)?.value]));
  }

  _clearTimer() {
    if (this._timer === null) return;
    if (typeof this.scope.clearTimeout === 'function') this.scope.clearTimeout(this._timer);
    this._timer = null;
  }

  _settleWaiters(success, payload) {
    const waiters = this._waiters.splice(0);
    for (const waiter of waiters) success ? waiter.resolve(payload) : waiter.reject(payload);
  }

  _call(callback, payload) {
    if (typeof callback !== 'function') return;
    try {
      callback(payload);
    } catch (error) {
      console.warn('WorldReadyGate callback failed', error);
    }
  }
}

export default WorldReadyGate;