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
 * InputActionRouter.js
 * 统一输入路由：一个输入事件最多被一个业务处理者消费。
 *
 * 固定优先级（与既有拾取交互约定一致）：
 *   模态 UI → 面板 UI → 瞄准状态 → Ctrl 轻功 → Shift 投掷
 *   → 拾取 → 技能 → 攻击 → 右键移动
 *
 * 关键约定：拾取判定必须在攻击之前。
 * 旧实现依赖 markMouseClickHandled 的调用顺序来保证这一点，
 * 顺序一旦改变就会先触发攻击；本路由把顺序固化为数据。
 *
 * InputManager 继续负责采集设备状态，本类只负责分发。
 */

import { InputEvent, InputEventType, InputDevice, PointerButton, InputHandler } from './InputEvent.js';

/** 处理者优先级，下标越小越先获得事件 */
export const HANDLER_PRIORITY = [
  InputHandler.MODAL_UI,
  InputHandler.PANEL_UI,
  InputHandler.AIMING,
  InputHandler.FLIGHT,
  InputHandler.THROW,
  InputHandler.PICKUP,
  InputHandler.SKILL,
  InputHandler.ATTACK,
  InputHandler.MOVE
];

/**
 * 内置的按键与修饰键约束。
 *
 * 「攻击只响应左键、移动只响应右键、轻功需 Ctrl、投掷需 Shift」
 * 是本项目的稳定约定，写进路由比每次接线时重复声明更可靠：
 * 接线方漏写 canHandle 时，不会出现右键被攻击抢走这类问题。
 *
 * 约束语义：
 *   buttons        指针事件允许的按键；null 表示不限制
 *   requireCtrl    必须按下 Ctrl
 *   forbidCtrl     必须未按 Ctrl
 *   requireShift / forbidShift 同理
 *
 * 键盘事件不受 buttons 约束，仅受修饰键约束。
 */
export const HANDLER_CONSTRAINTS = {
  [InputHandler.FLIGHT]: { buttons: [PointerButton.LEFT], requireCtrl: true },
  [InputHandler.THROW]: { buttons: [PointerButton.LEFT], requireShift: true, forbidCtrl: true },
  [InputHandler.PICKUP]: { buttons: [PointerButton.LEFT], forbidCtrl: true, forbidShift: true },
  [InputHandler.ATTACK]: { buttons: [PointerButton.LEFT], forbidCtrl: true, forbidShift: true },
  [InputHandler.MOVE]: { buttons: [PointerButton.RIGHT] }
};

/**
 * 判断事件是否满足约束
 * @param {InputEvent} event
 * @param {Object|null} constraint
 * @returns {boolean}
 */
export function matchesConstraint(event, constraint) {
  if (!constraint) return true;

  if (constraint.requireCtrl && !event.modifiers.ctrl) return false;
  if (constraint.forbidCtrl && event.modifiers.ctrl) return false;
  if (constraint.requireShift && !event.modifiers.shift) return false;
  if (constraint.forbidShift && event.modifiers.shift) return false;

  // 按键约束只作用于指针事件，键盘与虚拟按钮不受影响
  const isPointer = event.type === InputEventType.POINTER_DOWN
    || event.type === InputEventType.POINTER_UP;
  if (isPointer && Array.isArray(constraint.buttons)) {
    return constraint.buttons.includes(event.button);
  }

  return true;
}

export class InputActionRouter {
  /**
   * @param {Object} [config]
   * @param {InputManager} [config.inputManager] - 原始输入采集器
   * @param {Object} [config.camera] - 用于屏幕坐标转世界坐标
   * @param {Function} [config.onEvent] - (event) => void，调试或日志用
   */
  constructor(config = {}) {
    this.inputManager = config.inputManager || null;
    this.camera = config.camera || null;
    this.onEvent = config.onEvent || null;

    /** @type {Map<string, Array<{id: string, canHandle: Function, handle: Function}>>} */
    this.handlers = new Map();
    for (const name of HANDLER_PRIORITY) this.handlers.set(name, []);

    /** 本帧事件队列 */
    this.queue = [];
    /** 最近一帧的分发结果，供调试面板查看 */
    this.lastDispatched = [];
  }

  /** 设置相机 */
  setCamera(camera) {
    this.camera = camera;
  }

  /**
   * 注册处理者。
   *
   * 按键与修饰键约束由 HANDLER_CONSTRAINTS 自动应用，
   * 无需在 canHandle 中重复判断；可通过 config.constraint 覆盖，
   * 或 config.constraint = null 显式取消约束。
   *
   * @param {string} handlerName - InputHandler 之一
   * @param {Object} config
   * @param {string} [config.id] - 便于调试与注销
   * @param {Object|null} [config.constraint] - 覆盖内置约束
   * @param {Function} [config.canHandle] - (event) => boolean，业务侧附加条件
   * @param {Function} config.handle - (event) => boolean，返回 true 表示消费
   * @returns {Function} 注销函数
   */
  register(handlerName, config = {}) {
    if (!this.handlers.has(handlerName)) {
      console.warn('InputActionRouter: 未知处理者', handlerName);
      return () => {};
    }
    if (typeof config.handle !== 'function') {
      console.warn('InputActionRouter: 处理者缺少 handle 函数', handlerName);
      return () => {};
    }

    const constraint = Object.prototype.hasOwnProperty.call(config, 'constraint')
      ? config.constraint
      : (HANDLER_CONSTRAINTS[handlerName] || null);

    const entry = {
      id: config.id || `${handlerName}-${this.handlers.get(handlerName).length}`,
      constraint,
      canHandle: typeof config.canHandle === 'function' ? config.canHandle : () => true,
      handle: config.handle
    };

    this.handlers.get(handlerName).push(entry);

    return () => {
      const list = this.handlers.get(handlerName);
      const index = list.indexOf(entry);
      if (index !== -1) list.splice(index, 1);
    };
  }

  /** 注销某优先级下的全部处理者 */
  clearHandlers(handlerName) {
    if (this.handlers.has(handlerName)) this.handlers.set(handlerName, []);
  }

  /** 注销全部处理者 */
  clearAll() {
    for (const name of HANDLER_PRIORITY) this.handlers.set(name, []);
  }

  /**
   * 手动入队一个事件（虚拟按钮、脚本触发用）
   * @param {InputEvent|Object} event
   * @returns {InputEvent}
   */
  enqueue(event) {
    const instance = event instanceof InputEvent ? event : new InputEvent(event);
    this.queue.push(instance);
    return instance;
  }

  /**
   * 构造并入队一次交互请求。
   * E 键、移动端交互按钮、触屏交互按钮统一走此入口，
   * 保证不同入口产生相同的拾取候选集合。
   *
   * @param {string} [device] - InputDevice
   * @returns {InputEvent}
   */
  enqueueInteract(device = InputDevice.VIRTUAL) {
    return this.enqueueKey('e', device);
  }

  /** 虚拟按钮与脚本动作统一构造键按下事件。 */
  enqueueKey(key, device = InputDevice.VIRTUAL, modifiers = null) {
    return this.enqueue(new InputEvent({
      type: InputEventType.KEY_PRESS,
      device,
      key,
      modifiers
    }));
  }

  /**
   * 从 InputManager 采集本帧输入并生成事件。
   *
   * 必须在 InputManager.update() 清空本帧状态之前调用。
   *
   * @param {Array<string>} [watchedKeys] - 需要生成事件的按键
   * @returns {Array<InputEvent>} 本帧事件
   */
  collect(watchedKeys = ['e', 'space', 'skill1', 'skill2', 'skill3', 'skill4']) {
    const im = this.inputManager;
    if (!im) return this.queue;

    const modifiers = {
      ctrl: im.isKeyDown ? !!im.isKeyDown('ctrl') : false,
      shift: im.isKeyDown ? !!im.isKeyDown('shift') : false,
      alt: im.isKeyDown ? !!im.isKeyDown('alt') : false
    };

    // 键盘
    for (const key of watchedKeys) {
      if (im.isKeyPressed && im.isKeyPressed(key)) {
        this.queue.push(new InputEvent({
          type: InputEventType.KEY_PRESS,
          device: InputDevice.KEYBOARD,
          key,
          modifiers
        }));
      }
    }

    // 指针
    if (im.isMouseClicked && im.isMouseClicked()) {
      const screen = im.getMousePosition ? im.getMousePosition() : null;
      this.queue.push(new InputEvent({
        type: InputEventType.POINTER_DOWN,
        device: im.mouse && im.mouse.isTouch ? InputDevice.TOUCH : InputDevice.MOUSE,
        button: im.getMouseButton ? im.getMouseButton() : PointerButton.LEFT,
        modifiers,
        screen,
        world: this._toWorld(screen)
      }));
    }

    return this.queue;
  }

  /**
   * 屏幕坐标转世界坐标：优先使用相机，回退到 InputManager
   * @private
   */
  _toWorld(screen) {
    if (!screen) return null;
    if (this.camera && typeof this.camera.screenToWorld === 'function') {
      return this.camera.screenToWorld(screen.x, screen.y);
    }
    if (this.inputManager && typeof this.inputManager.getMouseWorldPosition === 'function') {
      return this.inputManager.getMouseWorldPosition();
    }
    return null;
  }

  /**
   * 按固定优先级分发本帧全部事件，并清空队列。
   *
   * 同一优先级内按注册顺序尝试；任一处理者返回 true 即消费该事件，
   * 后续优先级不再看到它。
   *
   * @returns {Array<InputEvent>} 已分发的事件（含 consumedBy）
   */
  dispatch() {
    const events = this.queue;
    this.queue = [];

    for (const event of events) {
      for (const handlerName of HANDLER_PRIORITY) {
        if (event.isConsumed()) break;

        for (const entry of this.handlers.get(handlerName)) {
          if (event.isConsumed()) break;

          // 先应用内置按键与修饰键约束，再交给业务条件
          if (!matchesConstraint(event, entry.constraint)) continue;

          let allowed = false;
          try {
            allowed = entry.canHandle(event);
          } catch (e) {
            console.warn('InputActionRouter: canHandle 出错', entry.id, e);
          }
          if (!allowed) continue;

          let handled = false;
          try {
            handled = entry.handle(event) === true;
          } catch (e) {
            console.warn('InputActionRouter: handle 出错', entry.id, e);
          }

          if (handled) {
            event.consume(handlerName, { handlerId: entry.id });
            // 桥接旧机制：指针事件被非攻击处理者消费时，
            // 同步标记 InputManager，避免尚未迁移的系统重复响应
            this._syncLegacyHandled(event, handlerName);
          }
        }
      }

      if (this.onEvent) {
        try {
          this.onEvent(event);
        } catch (e) {
          console.warn('InputActionRouter: onEvent 回调出错', e);
        }
      }
    }

    this.lastDispatched = events;
    return events;
  }

  /**
   * 与旧 markMouseClickHandled 机制桥接。
   *
   * 迁移期内 MeleeAttackSystem 等仍读取 isMouseClickHandled，
   * 因此当指针事件被攻击之前的处理者消费时，必须同步标记，
   * 否则会出现"路由已消费但旧系统仍触发攻击"的双重响应。
   *
   * @private
   */
  _syncLegacyHandled(event, handlerName) {
    if (event.type !== InputEventType.POINTER_DOWN) return;
    if (handlerName === InputHandler.ATTACK || handlerName === InputHandler.MOVE) return;
    if (!this.inputManager || typeof this.inputManager.markMouseClickHandled !== 'function') return;
    this.inputManager.markMouseClickHandled();
  }

  /**
   * 采集并分发，供场景每帧调用。
   *
   * 必须在 InputManager.update() 之前调用，
   * 否则本帧按下状态已被清空。
   *
   * @param {Array<string>} [watchedKeys]
   * @returns {Array<InputEvent>}
   */
  update(watchedKeys) {
    this.collect(watchedKeys);
    return this.dispatch();
  }

  /**
   * 查询某个事件最终由谁消费，便于调试输入争抢
   * @param {number} eventId
   * @returns {string|null}
   */
  getConsumerOf(eventId) {
    const event = this.lastDispatched.find(e => e.id === eventId);
    return event ? event.consumedBy : null;
  }

  /**
   * 本帧分发摘要，供调试面板输出
   * @returns {Array<string>}
   */
  describeLastFrame() {
    return this.lastDispatched.map(e => e.describe());
  }
}

export default InputActionRouter;
