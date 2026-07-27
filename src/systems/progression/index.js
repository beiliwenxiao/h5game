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
 * progression/index.js
 * 统一成长图系统导出入口。
 */

export { NodeDefinition, NodeKind, PrerequisiteMode } from './NodeDefinition.js';
export { GraphDefinition, GraphMode, PointPool } from './GraphDefinition.js';
export { ProgressionState } from './ProgressionState.js';
export { PointLedger } from './PointLedger.js';
export {
  AllocationReject,
  checkPrerequisites,
  checkExclusive,
  checkConnectivity,
  checkGates,
  checkNoOrphans,
  countSpentInGraph,
  countSpentInRegion
} from './AllocationRules.js';
export { ProgressionGraphSystem } from './ProgressionGraphSystem.js';
export { LegacyProgressionAdapter } from './LegacyProgressionAdapter.js';
export {
  convertLegacyEffects,
  convertSkillNode,
  convertTalentNode,
  convertSkillTree,
  convertTalentTree,
  convertSkillTreeSystem,
  convertTalentSystem
} from './LegacyTreeConverter.js';
