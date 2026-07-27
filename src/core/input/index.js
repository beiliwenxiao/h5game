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
