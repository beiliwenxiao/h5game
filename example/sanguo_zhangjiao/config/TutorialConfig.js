/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 */

/**
 * TutorialConfig - 基础教程配置（平台选择器）
 *
 * 按当前平台（PlatformProfile）在桌面 / 移动两套文案之间选择。
 * 下游 import 方式不变，无需感知平台。
 */

import { PlatformProfile } from '../../../src/core/PlatformProfile.js';
import { TutorialConfigDesktop } from './TutorialConfig.desktop.js';
import { TutorialConfigMobile } from './TutorialConfig.mobile.js';

export const TutorialConfig = PlatformProfile.isMobile
  ? TutorialConfigMobile
  : TutorialConfigDesktop;

export default TutorialConfig;
