import { UIStrategy } from './UIStrategy.js';

/**
 * MobileUIStrategy - 移动（触屏）UI 装配策略
 *
 * - 底部控制栏隐藏血球/蓝球和数字快捷键（手指操作，数字键无意义）
 * - 显示左上角玩家状态 HUD（头像 + 昵称 + 血条 + 蓝条）替代底部血球
 */
export class MobileUIStrategy extends UIStrategy {
  get platform() {
    return 'mobile';
  }

  getBottomControlBarOptions() {
    return { showOrbs: false, showHotkeyNumbers: false };
  }

  isBottomControlBarVisible() {
    // 移动端不再使用引擎底部控制栏，改用 DOM 的右侧动作按钮 + 底部快捷栏
    return false;
  }

  isPlayerStatusHUDVisible() {
    return true;
  }

  layoutPlayerStatusHUD(hud, width, height) {
    if (!hud) return;
    // 固定左上角；如有需要可按宽度自适应
    hud.x = 10;
    hud.y = 10;
    if (typeof hud.layout === 'function') hud.layout();
  }
}

export default MobileUIStrategy;
