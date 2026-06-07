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

  /**
   * 移动端背包：3 行 5 列，带滚动条
   */
  getInventoryOptions() {
    const slotSize = 50;
    const slotPadding = 5;
    const slotsPerRow = 5;
    const maxVisibleRows = 3;
    // 宽度：左边距20 + 列宽 - 末尾padding + 滚动条(8+4) + 右边距16
    const width = 20 + slotsPerRow * (slotSize + slotPadding) - slotPadding + 12 + 16;
    // 高度：顶部80 + 行高 - 末尾padding + 底部留白(金币行)40
    const height = 80 + maxVisibleRows * (slotSize + slotPadding) - slotPadding + 40;
    return { slotSize, slotPadding, slotsPerRow, maxVisibleRows, width, height };
  }

  /**
   * 移动端背包：水平居中，底部与底部快捷栏对齐
   */
  layoutInventoryPanel(panel, width, height) {
    if (!panel) return;
    panel.x = Math.round((width - panel.width) / 2);
    // 底部对齐：底部快捷栏在屏幕底部约 8~70px，这里让背包底部留出约 78px
    const bottomGap = 78;
    panel.y = Math.max(10, height - bottomGap - panel.height);
  }
}

export default MobileUIStrategy;
