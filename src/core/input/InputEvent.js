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
 * InputEvent.js
 * 统一输入事件。
 *
 * 由 InputManager 采集的原始设备状态转换而来，
 * 每个事件最多被一个业务处理者消费（consumedBy 只能设置一次）。
 */

/** 输入来源设备 */
export const InputDevice = {
  KEYBOARD: 'keyboard',
  MOUSE: 'mouse',
  TOUCH: 'touch',
  VIRTUAL: 'virtual'   // 移动端虚拟按钮
};

/** 输入类型 */
export const InputEventType = {
  KEY_PRESS: 'keyPress',
  POINTER_DOWN: 'pointerDown',
  POINTER_UP: 'pointerUp',
  POINTER_MOVE: 'pointerMove',
  WHEEL: 'wheel'
};

/** 鼠标按键 */
export const PointerButton = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2
};

/**
 * 业务处理者标识。
 * 顺序即消费优先级，见 InputActionRouter.HANDLER_PRIORITY。
 */
export const InputHandler = {
  MODAL_UI: 'modalUI',       // 对话、背包、装备等模态界面
  PANEL_UI: 'panelUI',       // 非模态面板
  AIMING: 'aiming',          // 正在瞄准状态
  FLIGHT: 'flight',          // Ctrl + 左键 轻功
  THROW: 'throw',            // Shift + 左键 投掷
  PICKUP: 'pickup',          // E 键 / 交互按钮 / 左键命中物品
  SKILL: 'skill',            // 技能快捷键
  ATTACK: 'attack',          // 左键攻击
  MOVE: 'move'               // 右键移动
};

let nextEventId = 1;

export class InputEvent {
  /**
   * @param {Object} config
   * @param {string} config.type - InputEventType
   * @param {string} config.device - InputDevice
   * @param {number} [config.button] - 鼠标按键
   * @param {string} [config.key] - 键名
   * @param {Object} [config.modifiers] - { ctrl, shift, alt }
   * @param {Object} [config.screen] - 屏幕坐标 { x, y }
   * @param {Object} [config.world] - 世界坐标 { x, y }
   * @param {number} [config.delta] - 滚轮增量
   */
  constructor(config = {}) {
    this.id = nextEventId++;
    this.type = config.type;
    this.device = config.device || InputDevice.KEYBOARD;
    this.button = config.button !== undefined ? config.button : null;
    this.key = config.key || null;

    this.modifiers = {
      ctrl: !!(config.modifiers && config.modifiers.ctrl),
      shift: !!(config.modifiers && config.modifiers.shift),
      alt: !!(config.modifiers && config.modifiers.alt)
    };

    this.screen = config.screen ? { ...config.screen } : null;
    this.world = config.world ? { ...config.world } : null;
    this.delta = config.delta !== undefined ? config.delta : 0;

    /** 消费者标识；null 表示尚未被消费 */
    this.consumedBy = null;
    /** 消费时附带的业务信息，便于调试 */
    this.consumeInfo = null;
  }

  /** 是否已被消费 */
  isConsumed() {
    return this.consumedBy !== null;
  }

  /**
   * 消费事件。
   * 已被消费时返回 false，保证一个事件只有一个处理者。
   *
   * @param {string} handler - InputHandler
   * @param {Object} [info] - 附加信息
   * @returns {boolean} 是否成功消费
   */
  consume(handler, info = null) {
    if (this.consumedBy !== null) return false;
    this.consumedBy = handler;
    this.consumeInfo = info;
    return true;
  }

  /** 是否为左键按下 */
  isLeftDown() {
    return this.type === InputEventType.POINTER_DOWN && this.button === PointerButton.LEFT;
  }

  /** 是否为右键按下 */
  isRightDown() {
    return this.type === InputEventType.POINTER_DOWN && this.button === PointerButton.RIGHT;
  }

  /** 是否为指定按键按下 */
  isKey(key) {
    return this.type === InputEventType.KEY_PRESS && this.key === key;
  }

  /** 调试用摘要 */
  describe() {
    const mods = Object.entries(this.modifiers)
      .filter(([, on]) => on)
      .map(([name]) => name)
      .join('+');
    const target = this.key !== null ? this.key : `button${this.button}`;
    return `[${this.device}] ${this.type} ${mods ? mods + '+' : ''}${target} → ${this.consumedBy || 'unconsumed'}`;
  }
}

export default InputEvent;
