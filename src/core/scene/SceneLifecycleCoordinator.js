/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { DependencyOwnership } from './SceneSystemContainer.js';

const NOOP = () => {};

function inferredDisposer(resource) {
  if (typeof resource === 'function') return resource;
  for (const method of ['dispose', 'destroy', 'cleanup', 'exit']) {
    if (typeof resource?.[method] === 'function') return () => resource[method]();
  }
  return NOOP;
}

/** 进入按 (order,sequence)，退出严格逆序；borrowed 只解除投影。 */
export class SceneLifecycleCoordinator {
  constructor({ context = null, onError = NOOP } = {}) {
    this.context = context;
    this.onError = typeof onError === 'function' ? onError : NOOP;
    this.state = 'idle';
    this._entries = new Map();
    this._active = [];
    this._ownedIdentities = new Map();
    this._sequence = 0;
    this._exitResult = null;
  }

  register(name, {
    enter = NOOP,
    exit = null,
    order = 0,
    ownership = DependencyOwnership.OWNED,
    identity = null
  } = {}) {
    if (!name) throw new TypeError('SceneLifecycleCoordinator.register requires name');
    if (this._entries.has(name)) throw new Error(`SceneLifecycleCoordinator: duplicate "${name}"`);
    if (this.state !== 'idle') throw new Error(`SceneLifecycleCoordinator: cannot register while ${this.state}`);
    this._entries.set(name, {
      name,
      enter: typeof enter === 'function' ? enter : NOOP,
      exit: typeof exit === 'function' ? exit : null,
      ownership,
      identity,
      order: Number(order) || 0,
      sequence: this._sequence++
    });
    return this;
  }

  get(name) {
    return this._active.find(entry => entry.name === name)?.resource;
  }

  track(name, resource, disposer = null, order = 0, options = {}) {
    if (!name) throw new TypeError('SceneLifecycleCoordinator.track requires name');
    if (this._active.some(entry => entry.name === name)) {
      throw new Error(`SceneLifecycleCoordinator: duplicate active resource "${name}"`);
    }
    const ownership = options.ownership || DependencyOwnership.OWNED;
    const identity = options.identity ?? resource;
    if (ownership === DependencyOwnership.OWNED && this._ownedIdentities.has(identity)) {
      throw new Error(`SceneLifecycleCoordinator: identity already owned by "${this._ownedIdentities.get(identity)}"`);
    }
    const entry = {
      name,
      resource,
      identity,
      ownership,
      dispose: ownership === DependencyOwnership.OWNED
        ? (typeof disposer === 'function' ? disposer : inferredDisposer(resource))
        : NOOP,
      detach: typeof options.detach === 'function' ? options.detach : NOOP,
      order: Number(order) || 0,
      sequence: this._sequence++,
      disposed: false
    };
    this._active.push(entry);
    if (ownership === DependencyOwnership.OWNED) this._ownedIdentities.set(identity, name);
    return resource;
  }

  async enter(params = {}) {
    if (this.state === 'active') return this;
    if (this.state !== 'idle') throw new Error(`SceneLifecycleCoordinator: cannot enter while ${this.state}`);
    this.state = 'entering';
    const entries = [...this._entries.values()]
      .sort((a, b) => a.order - b.order || a.sequence - b.sequence);
    try {
      for (const entry of entries) {
        const resource = await entry.enter(params, this.context);
        this.track(entry.name, resource, entry.exit
          ? () => entry.exit(resource, this.context)
          : null, entry.order, {
          ownership: entry.ownership,
          identity: entry.identity ?? resource
        });
      }
      this.state = 'active';
      return this;
    } catch (error) {
      this.state = 'rollingBack';
      await this._disposeActive('rollback', false);
      this.state = 'failed';
      this._reportError('enter', error);
      throw error;
    }
  }

  /**
   * 唯一退出入口。同步 Scene API 传 synchronous:true；重复调用严格 no-op。
   */
  exit({ synchronous = false } = {}) {
    if (this._exitResult) return this._exitResult;
    if (this.state === 'exited' || (this.state === 'idle' && this._active.length === 0)) {
      this.state = 'exited';
      this._exitResult = synchronous ? this : Promise.resolve(this);
      return this._exitResult;
    }
    this.state = 'exiting';
    if (synchronous) {
      this._disposeActiveSync('exit');
      this.state = 'exited';
      this._exitResult = this;
      return this;
    }
    this._exitResult = this._disposeActive('exit', false).then(() => {
      this.state = 'exited';
      return this;
    });
    return this._exitResult;
  }

  _orderedForDisposal() {
    return [...this._active]
      .sort((a, b) => b.order - a.order || b.sequence - a.sequence);
  }

  _disposeActiveSync(phase) {
    const entries = this._orderedForDisposal();
    this._active.length = 0;
    this._ownedIdentities.clear();
    for (const entry of entries) {
      if (entry.disposed) continue;
      entry.disposed = true;
      try {
        const result = entry.ownership === DependencyOwnership.OWNED
          ? entry.dispose(entry.resource, this.context)
          : entry.detach(entry.resource, this.context);
        if (result && typeof result.then === 'function') {
          this._reportError(phase, new Error('async disposer requires asynchronous exit()'), entry.name);
        }
      } catch (error) {
        this._reportError(phase, error, entry.name);
      }
    }
  }

  async _disposeActive(phase) {
    const entries = this._orderedForDisposal();
    this._active.length = 0;
    this._ownedIdentities.clear();
    for (const entry of entries) {
      if (entry.disposed) continue;
      entry.disposed = true;
      try {
        if (entry.ownership === DependencyOwnership.OWNED) {
          await entry.dispose(entry.resource, this.context);
        } else {
          await entry.detach(entry.resource, this.context);
        }
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
