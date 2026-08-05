/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const NOOP = () => {};

function inferredDisposer(resource) {
  if (typeof resource === 'function') return resource;
  for (const method of ['dispose', 'destroy', 'cleanup', 'exit']) {
    if (typeof resource?.[method] === 'function') return () => resource[method]();
  }
  return NOOP;
}

/** 按显式 order 进入、按逆序可靠释放的场景生命周期协调器。 */
export class SceneLifecycleCoordinator {
  constructor({ context = null, onError = NOOP } = {}) {
    this.context = context;
    this.onError = typeof onError === 'function' ? onError : NOOP;
    this.state = 'idle';
    this._entries = new Map();
    this._active = [];
    this._sequence = 0;
    this._exitPromise = null;
  }

  register(name, { enter = NOOP, exit = null, order = 0 } = {}) {
    if (!name) throw new TypeError('SceneLifecycleCoordinator.register requires name');
    if (this._entries.has(name)) throw new Error(`SceneLifecycleCoordinator: duplicate "${name}"`);
    if (this.state !== 'idle' && this.state !== 'exited') {
      throw new Error(`SceneLifecycleCoordinator: cannot register while ${this.state}`);
    }
    this._entries.set(name, {
      name,
      enter: typeof enter === 'function' ? enter : NOOP,
      exit: typeof exit === 'function' ? exit : null,
      order: Number(order) || 0,
      sequence: this._sequence++
    });
    return this;
  }

  get(name) {
    return this._active.find(entry => entry.name === name)?.resource;
  }

  track(name, resource, disposer = null, order = 0) {
    if (!name) throw new TypeError('SceneLifecycleCoordinator.track requires name');
    if (this._active.some(entry => entry.name === name)) {
      throw new Error(`SceneLifecycleCoordinator: duplicate active resource "${name}"`);
    }
    this._active.push({
      name,
      resource,
      dispose: typeof disposer === 'function' ? disposer : inferredDisposer(resource),
      order: Number(order) || 0,
      sequence: this._sequence++
    });
    return resource;
  }

  async enter(params = {}) {
    if (this.state === 'active') return this;
    if (this.state === 'entering' || this.state === 'exiting') {
      throw new Error(`SceneLifecycleCoordinator: cannot enter while ${this.state}`);
    }
    this.state = 'entering';
    this._exitPromise = null;
    this._active.length = 0;
    const entries = [...this._entries.values()]
      .sort((a, b) => a.order - b.order || a.sequence - b.sequence);

    try {
      for (const entry of entries) {
        const resource = await entry.enter(params, this.context);
        this._active.push({
          name: entry.name,
          resource,
          dispose: entry.exit
            ? () => entry.exit(resource, this.context)
            : inferredDisposer(resource),
          order: entry.order,
          sequence: entry.sequence
        });
      }
      this.state = 'active';
      return this;
    } catch (error) {
      this.state = 'rollingBack';
      await this._disposeActive('rollback');
      this.state = 'failed';
      this._reportError('enter', error);
      throw error;
    }
  }

  exit() {
    if (this._exitPromise) return this._exitPromise;
    if (this.state === 'exited' || (this.state === 'idle' && this._active.length === 0)) {
      this.state = 'exited';
      return Promise.resolve(this);
    }
    this.state = 'exiting';
    this._exitPromise = this._disposeActive('exit').then(() => {
      this.state = 'exited';
      return this;
    });
    return this._exitPromise;
  }

  /**
   * 同步 Scene.exit() 契约使用的释放入口。异步 disposer 会被报告为配置错误，
   * 需要异步退出的宿主应继续使用 exit()。
   */
  exitSync() {
    if (this.state === 'exited') return this;
    this.state = 'exiting';
    const entries = [...this._active]
      .sort((a, b) => b.order - a.order || b.sequence - a.sequence);
    this._active.length = 0;
    for (const entry of entries) {
      try {
        const result = entry.dispose(entry.resource, this.context);
        if (result && typeof result.then === 'function') {
          this._reportError('exitSync', new Error('async disposer requires exit()'), entry.name);
        }
      } catch (error) {
        this._reportError('exitSync', error, entry.name);
      }
    }
    this.state = 'exited';
    return this;
  }

  async _disposeActive(phase) {
    const entries = [...this._active]
      .sort((a, b) => b.order - a.order || b.sequence - a.sequence);
    this._active.length = 0;
    for (const entry of entries) {
      try {
        await entry.dispose(entry.resource, this.context);
      } catch (error) {
        this._reportError(phase, error, entry.name);
      }
    }
  }

  _reportError(phase, error, name = null) {
    try {
      this.onError(phase, name, error);
    } catch (_) {
      // 错误回调不得打断回滚或退出。
    }
  }
}

export default SceneLifecycleCoordinator;
