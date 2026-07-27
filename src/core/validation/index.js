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
 * core/validation/index.js
 * 内容校验导出入口。
 */

export { ContentValidator, FieldType } from './ContentValidator.js';
export {
  ValidationCode,
  makeError,
  prefixErrors,
  locateJsonError,
  formatErrors
} from './ValidationError.js';
export {
  CONTENT_SCHEMAS,
  EFFECT_SCHEMA,
  SKILL_SCHEMA,
  NODE_SCHEMA,
  GRAPH_SCHEMA,
  PROGRESSION_CONFIG_SCHEMA,
  createContentValidator
} from './ContentSchemas.js';
