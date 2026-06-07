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
