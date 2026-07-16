/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-02-10
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

import { PlatformProfile } from '../../core/PlatformProfile.js';
import { DesktopUIStrategy } from './DesktopUIStrategy.js';
import { MobileUIStrategy } from './MobileUIStrategy.js';

export { UIStrategy } from './UIStrategy.js';
export { DesktopUIStrategy } from './DesktopUIStrategy.js';
export { MobileUIStrategy } from './MobileUIStrategy.js';

/**
 * 根据平台创建对应的 UI 策略
 * @param {string} [platform] - 不传则用 PlatformProfile 自动判定
 * @returns {UIStrategy}
 */
export function createUIStrategy(platform) {
  const p = platform || PlatformProfile.platform;
  return p === 'mobile' ? new MobileUIStrategy() : new DesktopUIStrategy();
}
