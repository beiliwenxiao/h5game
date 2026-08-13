/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * GameSceneRuntime.js
 * 场景运行时：系统容器 + 输入路由 + 检查点的统一装配。
 *
 * 从 BaseGameScene 提取的通用能力，不含任何剧情或历史内容。
 * 现有场景可增量采纳：先用容器管理系统与清理，再逐步把输入迁到路由。
 *
 * 帧内固定顺序：
 *   1. 输入采集与分发（拾取先于攻击，由 InputActionRouter 保证）
 *   2. 系统按 order 更新
 *   3. 场景自定义逻辑
 *   4. InputManager 清帧
 *
 * 注意：InputManager.update() 会清空本帧按键状态，
 * 因此必须在输入分发与系统更新之后调用。
 */

import { SceneSystemContainer } from './SceneSystemContainer.js';
import { InputActionRouter } from '../input/InputActionRouter.js';
import { SnapshotManager } from '../snapshot/SnapshotManager.js';

/** 系统更新顺序基准值，便于插入自定义系统 */
export const UpdateOrder = {
  INPUT: 0,
  MOVEMENT: 100,
  COMBAT: 200,
  AI: 300,
  COLLISION: 400,
  GAMEPLAY: 500,
  EFFECTS: 700,
  UI: 900
};

/**
 * 帧阶段名称。SceneFramePipeline 可在不改动旧调用顺序的前提下逐段接入，
 * 新场景则可用 runFrame 一次性执行完整运行时帧。
 */
export const FramePhase = Object.freeze({
  BEFORE_INPUT: 'beforeInput',
  PRIORITY_INPUT: 'priorityInput',
  SYSTEMS: 'systems',
  AFTER_SCENE: 'afterScene'
});

export class GameSceneRuntime {
  /**
   * @param {Object} [config]
   * @param {InputManager} [config.inputManager]
   * @param {Object} [config.camera]
   * @param {SnapshotManager} [config.snapshotManager]
   * @param {Function} [config.onError]
   */
  constructor(config = {}) {
    this.container = new SceneSystemContainer({ onError: config.onError });

    this.inputRouter = new InputActionRouter({
      inputManager: config.inputManager || null,
      camera: config.camera || null
    });

    this.snapshotManager = config.snapshotManager || new SnapshotManager();

    this.inputManager = config.inputManager || null;
    this.camera = config.camera || null;

    /** 场景自定义每帧逻辑（旧 update API 兼容） */
    this._updateHooks = [];
    /** 分阶段钩子，供迁移中的 SceneFramePipeline 精确调度。 */
    this._phaseHooks = new Map(
      Object.values(FramePhase).map(phase => [phase, []])
    );
    /** 退出时需要执行的清理 */
    this._disposers = [];

    this.isActive = false;
  }

  // ---------------- 装配 ----------------

  /**
   * 设置输入管理器与相机（场景 enter 中 canvas 就绪后调用）
   * @param {Object} deps - { inputManager, camera }
   */
  setInput(deps = {}) {
    if (deps.inputManager) {
      this.inputManager = deps.inputManager;
      this.inputRouter.inputManager = deps.inputManager;
    }
    if (deps.camera) {
      this.camera = deps.camera;
      this.inputRouter.setCamera(deps.camera);
    }
  }

  /**
   * 提供共享依赖
   * @param {Object} deps
   */
  provide(deps = {}) {
    this.container.provide(deps);
  }

  /**
   * 注册系统
   * @param {string} name
   * @param {*} system
   * @param {Object} [options]
   * @returns {*}
   */
  registerSystem(name, system, options = {}) {
    return this.container.register(name, system, options);
  }

  /**
   * 获取系统或依赖
   * @param {string} name
   * @returns {*}
   */
  get(name) {
    return this.container.resolve(name);
  }

  /**
   * 注册输入处理者。返回的注销函数会在 dispose 时自动执行，
   * 避免场景重入时重复注册。
   *
   * @param {string} handlerName - InputHandler
   * @param {Object} config - { id, canHandle, handle }
   * @returns {Function} 注销函数
   */
  registerInputHandler(handlerName, config) {
    const off = this.inputRouter.register(handlerName, config);
    this._disposers.push(off);
    return off;
  }

  /**
   * 注册检查点参与者
   * @param {string} key
   * @param {Object} provider - { snapshot, validate, restore, required }
   * @returns {Function} 注销函数
   */
  registerSnapshotProvider(key, provider) {
    const off = this.snapshotManager.register(key, provider);
    this._disposers.push(off);
    return off;
  }

  /**
   * 将 core WorldStreamingManager 注册为唯一快照参与者，并可选按玩家坐标驱动。
   * manager 自己处理 latest-wins 并发；运行时不把 deltaTime 误当世界坐标。
   */
  attachWorldStreaming(manager, {
    key = 'worldStreaming',
    getPosition = null,
    onTransition = null,
    onError = null
  } = {}) {
    if (!manager || typeof manager.serialize !== 'function' || typeof manager.deserialize !== 'function') {
      throw new TypeError('GameSceneRuntime.attachWorldStreaming requires WorldStreamingManager');
    }
    const offSnapshot = this.registerSnapshotProvider(key, {
      snapshot: () => manager.serialize(),
      validate: data => manager.validateSerialized(data),
      restore: data => manager.deserialize(data),
      required: true
    });
    const offUpdate = typeof getPosition === 'function'
      ? this.onFramePhase(FramePhase.AFTER_SCENE, () => {
        const position = getPosition();
        if (!position) return;
        Promise.resolve(manager.update(position.x, position.y))
          .then(result => {
            if (result?.ok) onTransition?.(result);
            else if (!result?.superseded) onError?.(result);
          })
          .catch(error => onError?.({
            ok: false,
            errors: [{ code: 'streamingUpdateFailed', path: '', message: error?.message || String(error) }]
          }));
      })
      : () => {};
    return () => {
      offUpdate();
      offSnapshot();
    };
  }

  /**
   * 注册每帧逻辑，在系统更新之后执行
   * @param {Function} hook - (deltaTime) => void
   * @returns {Function} 注销函数
   */
  onUpdate(hook) {
    if (typeof hook !== 'function') return () => {};
    this._updateHooks.push(hook);

    const off = () => {
      const index = this._updateHooks.indexOf(hook);
      if (index !== -1) this._updateHooks.splice(index, 1);
    };
    this._disposers.push(off);
    return off;
  }

  /**
   * 注册任意清理逻辑（事件监听、定时器、DOM 元素等）
   * @param {Function} disposer
   */
  addDisposer(disposer) {
    if (typeof disposer === 'function') this._disposers.push(disposer);
  }

  // ---------------- 生命周期 ----------------

  /** 场景进入 */
  enter() {
    this.isActive = true;
    return this;
  }

  /**
   * 注册指定帧阶段的回调。阶段回调不会隐式清帧，适合逐步接入旧场景。
   * @param {string} phase FramePhase 中的阶段名
   * @param {(deltaTime:number, context:Object) => void} hook
   * @returns {Function} 注销函数
   */
  onFramePhase(phase, hook) {
    const hooks = this._phaseHooks.get(phase);
    if (!hooks || typeof hook !== 'function') return () => {};
    hooks.push(hook);
    const off = () => {
      const index = hooks.indexOf(hook);
      if (index !== -1) hooks.splice(index, 1);
    };
    this._disposers.push(off);
    return off;
  }

  /**
   * 执行一个确定的帧阶段。
   * systems 阶段仅在 updateSystems=true 时运行容器，保证迁移期的旧系统
   * 链仍由宿主在原有位置调用，不会被运行时悄然重排。
   */
  runFramePhase(phase, deltaTime, options = {}) {
    if (!this.isActive) return false;
    if (phase === FramePhase.PRIORITY_INPUT && options.routeInput) {
      this.inputRouter.update(options.watchedKeys);
    }
    if (phase === FramePhase.SYSTEMS && options.updateSystems) {
      this.container.update(deltaTime, ...(options.systemArgs || []));
    }
    const context = { runtime: this, phase, scene: options.scene || null };
    for (const hook of this._phaseHooks.get(phase) || []) {
      try {
        hook(deltaTime, context);
      } catch (error) {
        console.warn(`GameSceneRuntime: ${phase} 阶段钩子出错`, error);
      }
    }
    return true;
  }

  /** 在宿主已完成本帧全部输入读取后执行清帧。 */
  flushInput(options = {}) {
    if (!options.skipInputFlush && this.inputManager?.update) this.inputManager.update();
  }

  /**
   * 每帧更新。
   *
   * @param {number} deltaTime
   * @param {Object} [options]
   * @param {Array<string>} [options.watchedKeys] - 需要生成事件的按键
   * @param {boolean} [options.skipInputFlush] - 由调用方自行调用 inputManager.update()
   * @param {Array<*>} [options.systemArgs] - 透传给系统 update 的额外参数
   */
  update(deltaTime, options = {}) {
    if (!this.isActive) return;

    this.runFramePhase(FramePhase.BEFORE_INPUT, deltaTime, options);
    // 输入分发仍在系统更新之前；旧场景可改为逐段调用 runFramePhase。
    this.runFramePhase(FramePhase.PRIORITY_INPUT, deltaTime, { ...options, routeInput: true });
    this.runFramePhase(FramePhase.SYSTEMS, deltaTime, { ...options, updateSystems: true });

    for (const hook of this._updateHooks) {
      try {
        hook(deltaTime);
      } catch (e) {
        console.warn('GameSceneRuntime: update 钩子出错', e);
      }
    }
    this.runFramePhase(FramePhase.AFTER_SCENE, deltaTime, options);

    // 清帧必须最后执行，否则本帧按键状态会被提前清空。
    this.flushInput(options);
  }

  /**
   * 渲染声明了 render 的系统
   * @param {CanvasRenderingContext2D} ctx
   * @param {...*} args
   */
  render(ctx, ...args) {
    if (!this.isActive) return;
    this.container.render(ctx, ...args);
  }

  /**
   * 采集检查点
   * @param {Object} [meta]
   * @returns {Object}
   */
  captureCheckpoint(meta = {}) {
    return this.snapshotManager.capture(meta);
  }

  /**
   * 恢复检查点（原子，失败不改运行状态）
   * @param {Object} snapshot
   * @returns {Object}
   */
  restoreCheckpoint(snapshot) {
    return this.snapshotManager.restore(snapshot);
  }

  /**
   * 场景退出：执行全部清理。
   *
   * 顺序为「自定义清理 → 输入路由 → 系统容器」，
   * 保证系统被销毁前其输入处理者已注销。
   *
   * @returns {{disposers: number, systems: Array<string>}}
   */
  dispose() {
    this.isActive = false;

    let disposed = 0;
    for (const disposer of this._disposers.slice().reverse()) {
      try {
        disposer();
        disposed++;
      } catch (e) {
        console.warn('GameSceneRuntime: 清理出错', e);
      }
    }
    this._disposers = [];
    this._updateHooks = [];
    for (const hooks of this._phaseHooks.values()) hooks.length = 0;

    this.inputRouter.clearAll();
    const systems = this.container.destroy();

    return { disposers: disposed, systems };
  }
}

export default GameSceneRuntime;
