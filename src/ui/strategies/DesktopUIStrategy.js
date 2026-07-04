/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-02-10
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

import { UIStrategy } from './UIStrategy.js';

/**
 * DesktopUIStrategy - 桌面（键鼠）UI 装配策略
 *
 * - 底部控制栏显示血球/蓝球 + 数字快捷键
 * - 不显示左上角玩家状态 HUD（信息已在底部血球体现）
 */
export class DesktopUIStrategy extends UIStrategy {
  get platform() {
    return 'desktop';
  }

  getBottomControlBarOptions() {
    return { showOrbs: true, showHotkeyNumbers: true };
  }

  isPlayerStatusHUDVisible() {
    return false;
  }
}

export default DesktopUIStrategy;
