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
 * ability/index.js
 * 技能定义与执行系统导出入口。
 */

export {
  SkillDefinition,
  SkillTargeting,
  SkillCategory,
  MODIFIABLE_SKILL_PARAMS
} from './SkillDefinition.js';

export { SkillRegistry } from './SkillRegistry.js';
export { AbilitySystem, AbilityRejectReason } from './AbilitySystem.js';
