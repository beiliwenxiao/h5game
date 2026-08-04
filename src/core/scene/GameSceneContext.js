/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { SceneEntityStore } from './SceneEntityStore.js';

const GROUP_DEFAULTS = Object.freeze({
  input: Object.freeze({ manager: null, bindings: null, gamepad: null }),
  camera: Object.freeze({ instance: null, renderer: null }),
  runtime: Object.freeze({ canvas: null, context: null, width: 0, height: 0, active: false }),
  systems: Object.freeze({ container: null }),
  player: Object.freeze({ entity: null, inherited: false }),
  ui: Object.freeze({ layout: null }),
  world: Object.freeze({ terrain: null }),
  presentation: Object.freeze({ renderer: null }),
  services: Object.freeze({}),
  lifecycle: Object.freeze({ scope: null, coordinator: null, state: 'idle' })
});

function createGroup(name, initial) {
  return Object.assign({}, GROUP_DEFAULTS[name], initial || {});
}

function resetGroup(target, defaults) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, defaults);
}

/**
 * 场景运行状态的显式分组上下文。
 * SceneEntityStore 必须由组合根注入，Context 不创建第二份实体所有权。
 */
export class GameSceneContext {
  constructor(config = {}) {
    if (!(config.entities instanceof SceneEntityStore)) {
      throw new TypeError('GameSceneContext requires an injected SceneEntityStore');
    }

    this.input = createGroup('input', config.input);
    this.camera = createGroup('camera', config.camera);
    this.runtime = createGroup('runtime', config.runtime);
    this.systems = createGroup('systems', config.systems);
    this.entities = config.entities;
    this.player = createGroup('player', config.player);
    this.ui = createGroup('ui', config.ui);
    this.world = createGroup('world', config.world);

    this.presentation = createGroup('presentation', config.presentation);
    this.services = createGroup('services', config.services);
    this.lifecycle = createGroup('lifecycle', config.lifecycle);
  }

  /** 记录当前 Canvas、绘图上下文和逻辑尺寸。 */
  setCanvasRuntime(canvas, context = null) {
    this.runtime.canvas = canvas || null;
    this.runtime.context = context || null;
    this.runtime.width = Number(canvas?.width) || 0;
    this.runtime.height = Number(canvas?.height) || 0;
    this.runtime.active = Boolean(canvas);
    return this.runtime;
  }

  /**
   * 清空一次场景驻留期内的状态，同时保留注入的 EntityStore 和 services。
   * 所有分组对象及实体数组均原地清空，已有消费者持有的引用不会失效。
   */
  resetTransient() {
    resetGroup(this.input, GROUP_DEFAULTS.input);
    resetGroup(this.camera, GROUP_DEFAULTS.camera);
    resetGroup(this.runtime, GROUP_DEFAULTS.runtime);
    resetGroup(this.systems, GROUP_DEFAULTS.systems);
    this.entities.clear();
    resetGroup(this.player, GROUP_DEFAULTS.player);
    resetGroup(this.ui, GROUP_DEFAULTS.ui);
    resetGroup(this.world, GROUP_DEFAULTS.world);
    resetGroup(this.presentation, GROUP_DEFAULTS.presentation);
    resetGroup(this.lifecycle, GROUP_DEFAULTS.lifecycle);
    return this;
  }
}

export default GameSceneContext;