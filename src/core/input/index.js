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
 * core/input/index.js
 * 统一输入路由导出入口。
 */

export {
  InputEvent,
  InputEventType,
  InputDevice,
  PointerButton,
  InputHandler
} from './InputEvent.js';

export {
  InputActionRouter,
  HANDLER_PRIORITY,
  HANDLER_CONSTRAINTS,
  matchesConstraint
} from './InputActionRouter.js';

export { GamepadManager, ATTACK_BUTTON } from './GamepadManager.js';
export { SceneInputFlow } from './SceneInputFlow.js';

export {
  PadButton,
  PadAxis,
  DEFAULT_BINDINGS,
  ATTACK_ACTION,
  NONE_ACTION,
  PAD_LAYOUT,
  PAD_BUTTON_LABELS,
  BINDING_DESCRIPTIONS,
  BINDABLE_ACTIONS,
  ACTION_LABELS,
  isStandardMapping,
  looksLikeXboxPad
} from './Xbox360Profile.js';
