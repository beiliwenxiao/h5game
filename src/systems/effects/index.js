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
 * effects/index.js
 * 统一效果系统导出入口。
 */

export {
  EffectType,
  EffectOperation,
  LEGACY_FIELD_MAP,
  isNumericEffectType,
  isFlagEffectType,
  normalizeEffect,
  normalizeEffects,
  fromLegacyEffects,
  createEffect
} from './EffectTypes.js';

export { ModifierStack } from './ModifierStack.js';
export { EffectSource, EffectSourceKind } from './EffectSource.js';
export { EffectResolver } from './EffectResolver.js';
