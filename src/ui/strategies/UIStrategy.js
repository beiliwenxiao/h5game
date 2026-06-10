/**
 * UIStrategy - UI 装配策略基类（框架级）
 *
 * 把"不同平台的 UI 装配差异"封装成策略对象，避免在场景里写
 * `if (isMobile)` 分支。场景只持有一个 strategy，调用其方法获取
 * 平台相关的配置 / 行为。
 *
 * 子类：DesktopUIStrategy（桌面/键鼠）、MobileUIStrategy（移动/触屏）。
 *
 * 设计原则：
 *   - 策略只决定"差异部分"（开关、可见性、布局微调），
 *     不接管面板的创建细节（创建仍在场景里，保持可读）。
 *   - 返回纯配置对象 / 执行轻量布局，便于复用与测试。
 */
export class UIStrategy {
  /** 平台标识，子类覆盖 */
  get platform() {
    return 'base';
  }

  /**
   * 底部控制栏的平台相关选项
   * @returns {{ showOrbs: boolean, showHotkeyNumbers: boolean }}
   */
  getBottomControlBarOptions() {
    return { showOrbs: true, showHotkeyNumbers: true };
  }

  /**
   * 左上角玩家状态 HUD 是否显示（头像 + 昵称 + 血条 + 蓝条）
   * @returns {boolean}
   */
  isPlayerStatusHUDVisible() {
    return false;
  }

  /**
   * 是否显示底部控制栏
   * @returns {boolean}
   */
  isBottomControlBarVisible() {
    return true;
  }

  /**
   * 布局玩家状态 HUD（窗口尺寸变化时调用）。
   * 默认无操作，子类可覆盖。
   * @param {Object} hud - PlayerStatusHUD 实例
   * @param {number} width
   * @param {number} height
   */
  layoutPlayerStatusHUD(hud, width, height) {
    // 默认固定在左上角，无需重排
  }

  /**
   * 背包面板的平台相关选项（列数 / 行数等）。
   * 返回 null 表示使用面板默认值。
   * @returns {Object|null}
   */
  getInventoryOptions() {
    return null;
  }

  /**
   * 布局背包面板（窗口尺寸变化 / 打开时调用）。
   * 默认无操作，子类可覆盖以实现居中、底部对齐等。
   * @param {Object} panel - InventoryPanel 实例
   * @param {number} width
   * @param {number} height
   */
  layoutInventoryPanel(panel, width, height) {
    // 默认不改变位置
  }

  /**
   * 布局角色信息/装备面板（PlayerInfoPanel）。
   * 默认无操作，子类可覆盖。
   * @param {Object} panel
   * @param {number} width
   * @param {number} height
   */
  layoutPlayerInfoPanel(panel, width, height) {
    // 默认不改变位置
  }

  /**
   * 角色信息面板的平台相关选项（宽高/布局方向等）。
   * 返回 null 表示使用默认。
   * @returns {Object|null}
   */
  getPlayerInfoOptions() {
    return null;
  }
}

export default UIStrategy;
