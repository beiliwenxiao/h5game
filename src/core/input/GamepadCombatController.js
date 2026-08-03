/**
 * GamepadCombatController - 手柄战斗操作控制器
 *
 * 处理手柄的「按住→瞄准→释放」三段式操作：
 *   RT  普通攻击（右摇杆方向，快按=面向攻击，长按=精确朝向）
 *   RB  释放当前选中技能（右摇杆瞄准）
 *   LB  切换技能（按住弹环形轮盘，右摇杆选择，松开确认）
 *   Y   轻功（按住+左摇杆目标位置+释放触发）
 *   B   投掷（按住+右摇杆方向+释放）
 *   LT  格挡（按住期间生效）
 *
 * 该控制器不直接修改游戏状态，而是产出「意图」供场景逻辑执行。
 * 场景每帧调用 update() → 读取 intents → 执行对应操作 → 调用 consumeIntents()。
 */

import {
  PadButton,
  ATTACK_ACTION,
  SKILL_RELEASE_ACTION,
  SKILL_SWITCH_ACTION,
  FLIGHT_ACTION,
  THROW_ACTION,
  BLOCK_ACTION
} from './Xbox360Profile.js';

/** 快按阈值（毫秒）：按住时间低于此值视为快按 */
const QUICK_TAP_MS = 150;
/** 环形轮盘弹出延迟（毫秒）：LB 按住超过此时间才弹轮盘，否则为快切 */
const WHEEL_POPUP_MS = 200;

/**
 * 意图类型
 */
export const IntentType = {
  ATTACK: 'attack',             // 普通攻击
  SKILL_RELEASE: 'skillRelease', // 释放技能
  SKILL_SWITCH: 'skillSwitch',   // 切换技能（快按顺切）
  SKILL_WHEEL_OPEN: 'skillWheelOpen',   // 打开轮盘
  SKILL_WHEEL_CLOSE: 'skillWheelClose', // 关闭轮盘并确认
  FLIGHT: 'flight',             // 轻功
  THROW: 'throw',               // 投掷
  BLOCK_START: 'blockStart',    // 格挡开始
  BLOCK_END: 'blockEnd'         // 格挡结束
};

export class GamepadCombatController {
  constructor() {
    /** 当前选中的技能索引（0-based，对应 combat.skills 中可用技能列表） */
    this.currentSkillIndex = 0;
    /** 可用技能数量（由场景设置） */
    this.skillCount = 5;

    // ---- 内部状态 ----
    this._attackHolding = false;
    this._skillHolding = false;
    this._flightHolding = false;
    this._throwHolding = false;
    this._blockActive = false;
    this._wheelOpen = false;
    this._wheelHoldStart = 0;

    /** 本帧产出的意图列表 */
    this.intents = [];

    /** 最近一次瞄准方向（归一化），供场景读取 */
    this.aimDirection = { x: 0, y: 0 };
    /** 最近一次瞄准推杆量（0~1） */
    this.aimMagnitude = 0;
    /** 轻功目标方向（左摇杆） */
    this.flightDirection = { x: 0, y: 0 };
    this.flightMagnitude = 0;
    /** 轮盘选中索引（-1=未选） */
    this.wheelSelectedIndex = -1;
  }

  /**
   * 每帧更新，读取 GamepadManager 状态产出意图。
   * @param {import('./GamepadManager.js').GamepadManager} gamepad
   */
  update(gamepad) {
    this.intents = [];
    if (!gamepad || !gamepad.isConnected()) return;

    const rightStick = gamepad.rightStick;
    const leftStick = gamepad.leftStick;

    // 更新瞄准方向（右摇杆）
    if (rightStick.magnitude > 0) {
      this.aimDirection = { x: rightStick.x, y: rightStick.y };
      this.aimMagnitude = rightStick.magnitude;
    }

    // ---- RT 攻击 ----
    this._processAttack(gamepad, rightStick);

    // ---- RB 释放技能 ----
    this._processSkillRelease(gamepad, rightStick);

    // ---- LB 切换技能 / 环形轮盘 ----
    this._processSkillSwitch(gamepad, rightStick);

    // ---- Y 轻功 ----
    this._processFlight(gamepad, leftStick);

    // ---- B 投掷 ----
    this._processThrow(gamepad, rightStick);

    // ---- LT 格挡 ----
    this._processBlock(gamepad);
  }

  /** 消费意图（场景处理完毕后调用） */
  consumeIntents() {
    this.intents = [];
  }

  /** 查询是否有指定类型的意图 */
  hasIntent(type) {
    return this.intents.some(i => i.type === type);
  }

  /** 获取指定类型的意图 */
  getIntent(type) {
    return this.intents.find(i => i.type === type) || null;
  }

  /** 轮盘是否打开中 */
  get isWheelOpen() {
    return this._wheelOpen;
  }

  /** 是否正在瞄准（攻击/技能/投掷按住中） */
  get isAiming() {
    return this._attackHolding || this._skillHolding || this._throwHolding;
  }

  /** 是否正在瞄准轻功 */
  get isFlightAiming() {
    return this._flightHolding;
  }

  // ==================== 私有处理方法 ====================

  _getButtonForAction(gamepad, action) {
    for (const [indexStr, bound] of Object.entries(gamepad.bindings)) {
      if (bound === action) return Number(indexStr);
    }
    return -1;
  }

  _processAttack(gamepad, rightStick) {
    const btn = this._getButtonForAction(gamepad, ATTACK_ACTION);
    if (btn < 0) return;

    const pressed = gamepad.isButtonPressed(btn);
    const released = gamepad.buttonsReleased.has(btn);
    const down = gamepad.isButtonDown(btn);

    if (pressed) {
      this._attackHolding = true;
    }

    if (released && this._attackHolding) {
      this._attackHolding = false;
      const holdMs = gamepad.getButtonHoldDuration(btn);
      // 快按：面向方向攻击；长按：右摇杆精确方向
      const direction = holdMs < QUICK_TAP_MS
        ? null  // null 表示用角色当前面向
        : { x: this.aimDirection.x, y: this.aimDirection.y };
      this.intents.push({
        type: IntentType.ATTACK,
        direction,
        holdMs,
        isQuickTap: holdMs < QUICK_TAP_MS
      });
    }
  }

  _processSkillRelease(gamepad, rightStick) {
    const btn = this._getButtonForAction(gamepad, SKILL_RELEASE_ACTION);
    if (btn < 0) return;

    const pressed = gamepad.isButtonPressed(btn);
    const released = gamepad.buttonsReleased.has(btn);

    if (pressed) {
      this._skillHolding = true;
    }

    if (released && this._skillHolding) {
      this._skillHolding = false;
      this.intents.push({
        type: IntentType.SKILL_RELEASE,
        skillIndex: this.currentSkillIndex,
        direction: { x: this.aimDirection.x, y: this.aimDirection.y },
        magnitude: this.aimMagnitude
      });
    }
  }

  _processSkillSwitch(gamepad, rightStick) {
    const btn = this._getButtonForAction(gamepad, SKILL_SWITCH_ACTION);
    if (btn < 0) return;

    const pressed = gamepad.isButtonPressed(btn);
    const released = gamepad.buttonsReleased.has(btn);
    const down = gamepad.isButtonDown(btn);

    if (pressed) {
      this._wheelHoldStart = performance.now();
    }

    // 按住超过阈值：弹出轮盘
    if (down && !this._wheelOpen) {
      const elapsed = performance.now() - this._wheelHoldStart;
      if (elapsed >= WHEEL_POPUP_MS) {
        this._wheelOpen = true;
        this.wheelSelectedIndex = this.currentSkillIndex;
        this.intents.push({ type: IntentType.SKILL_WHEEL_OPEN });
      }
    }

    // 轮盘打开期间：右摇杆选择
    if (this._wheelOpen && rightStick.magnitude > 0.4) {
      // 按角度确定选中索引
      const angle = Math.atan2(rightStick.y, rightStick.x);
      // 将 -PI~PI 映射到 0~skillCount 的索引
      const normalizedAngle = (angle + Math.PI) / (Math.PI * 2); // 0~1
      this.wheelSelectedIndex = Math.floor(normalizedAngle * this.skillCount) % this.skillCount;
    }

    // 释放
    if (released) {
      if (this._wheelOpen) {
        // 轮盘确认
        this._wheelOpen = false;
        if (this.wheelSelectedIndex >= 0 && this.wheelSelectedIndex < this.skillCount) {
          this.currentSkillIndex = this.wheelSelectedIndex;
        }
        this.intents.push({
          type: IntentType.SKILL_WHEEL_CLOSE,
          selectedIndex: this.currentSkillIndex
        });
      } else {
        // 快按：顺序切到下一个
        this.currentSkillIndex = (this.currentSkillIndex + 1) % this.skillCount;
        this.intents.push({
          type: IntentType.SKILL_SWITCH,
          selectedIndex: this.currentSkillIndex
        });
      }
      this._wheelHoldStart = 0;
    }
  }

  _processFlight(gamepad, leftStick) {
    const btn = this._getButtonForAction(gamepad, FLIGHT_ACTION);
    if (btn < 0) return;

    const pressed = gamepad.isButtonPressed(btn);
    const released = gamepad.buttonsReleased.has(btn);
    const rightStick = gamepad.rightStick;

    if (pressed) {
      this._flightHolding = true;
      this.flightDirection = { x: 0, y: 0 };
      this.flightMagnitude = 0;
    }

    // 按住期间：右摇杆更新目标方向（统一用右摇杆瞄准）
    if (this._flightHolding && rightStick.magnitude > 0) {
      this.flightDirection = { x: rightStick.x, y: rightStick.y };
      this.flightMagnitude = rightStick.magnitude;
    }

    if (released && this._flightHolding) {
      this._flightHolding = false;
      const holdMs = gamepad.getButtonHoldDuration(btn);

      if (holdMs < QUICK_TAP_MS) {
        // 快按：面向方向轻功（由场景用角色朝向填充方向）
        this.intents.push({
          type: IntentType.FLIGHT,
          direction: null, // null = 用角色面向
          magnitude: 1,
          isQuickTap: true
        });
      } else if (this.flightMagnitude > 0.2) {
        // 长按+推了摇杆：精确位置轻功
        this.intents.push({
          type: IntentType.FLIGHT,
          direction: { ...this.flightDirection },
          magnitude: this.flightMagnitude,
          isQuickTap: false
        });
      }
      // 长按但没推摇杆 = 取消
      this.flightMagnitude = 0;
    }
  }

  _processThrow(gamepad, rightStick) {
    const btn = this._getButtonForAction(gamepad, THROW_ACTION);
    if (btn < 0) return;

    const pressed = gamepad.isButtonPressed(btn);
    const released = gamepad.buttonsReleased.has(btn);

    if (pressed) {
      this._throwHolding = true;
      this._throwDirection = { x: 0, y: 0 };
      this._throwMagnitude = 0;
    }

    // 按住期间：右摇杆更新投掷方向（统一用右摇杆瞄准）
    if (this._throwHolding && rightStick.magnitude > 0) {
      this._throwDirection = { x: rightStick.x, y: rightStick.y };
      this._throwMagnitude = rightStick.magnitude;
    }

    if (released && this._throwHolding) {
      this._throwHolding = false;
      const holdMs = gamepad.getButtonHoldDuration(btn);

      if (holdMs < QUICK_TAP_MS) {
        // 快按：面向方向投掷（由场景用角色朝向填充方向）
        this.intents.push({
          type: IntentType.THROW,
          direction: null, // null = 用角色面向
          magnitude: 1,
          isQuickTap: true
        });
      } else if (this._throwMagnitude > 0.2) {
        // 长按+推了摇杆：精确方向投掷
        this.intents.push({
          type: IntentType.THROW,
          direction: { ...this._throwDirection },
          magnitude: this._throwMagnitude,
          isQuickTap: false
        });
      }
      // 长按但没推摇杆 = 取消
      this._throwMagnitude = 0;
    }
  }

  _processBlock(gamepad) {
    const btn = this._getButtonForAction(gamepad, BLOCK_ACTION);
    if (btn < 0) return;

    const pressed = gamepad.isButtonPressed(btn);
    const released = gamepad.buttonsReleased.has(btn);

    if (pressed && !this._blockActive) {
      this._blockActive = true;
      this.intents.push({ type: IntentType.BLOCK_START });
    }

    if (released && this._blockActive) {
      this._blockActive = false;
      this.intents.push({ type: IntentType.BLOCK_END });
    }
  }
}

export default GamepadCombatController;
