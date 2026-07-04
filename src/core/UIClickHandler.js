/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * UIClickHandler - UI 点击事件处理器
 * 
 * 负责管理所有 UI 元素的点击检测，按 z-index 优先级处理点击事件，
 * 并决定是否阻止事件传播到游戏世界层。
 * 
 * @class UIClickHandler
 */
class UIClickHandler {
  /**
   * 创建 UIClickHandler 实例
   */
  constructor() {
    /**
     * UI 元素列表
     * @type {Array<UIElement>}
     * @private
     */
    this.uiElements = [];

    /**
     * 按 z-index 排序的 UI 元素列表
     * @type {Array<UIElement>}
     * @private
     */
    this.sortedElements = [];

    /**
     * 是否需要重新排序
     * @type {boolean}
     * @private
     */
    this.needsSort = false;
  }

  /**
   * 注册 UI 元素到点击处理器
   * 
   * @param {UIElement} element - 要注册的 UI 元素
   * @throws {Error} 如果 element 为 null 或 undefined
   */
  registerElement(element) {
    if (!element) {
      throw new Error('UIClickHandler: Cannot register null or undefined element');
    }

    // 避免重复注册
    if (this.uiElements.includes(element)) {
      console.warn('UIClickHandler: Element already registered, skipping');
      return;
    }

    this.uiElements.push(element);
    this.needsSort = true;
  }

  /**
   * 从点击处理器中注销 UI 元素
   * 
   * @param {UIElement} element - 要注销的 UI 元素
   * @returns {boolean} 是否成功注销
   */
  unregisterElement(element) {
    const index = this.uiElements.indexOf(element);
    if (index > -1) {
      this.uiElements.splice(index, 1);
      this.needsSort = true;
      return true;
    }
    return false;
  }

  /**
   * 按 z-index 从高到低排序 UI 元素
   * z-index 越大的元素越优先处理（显示在最上层）
   * 
   * @private
   */
  sortElements() {
    this.sortedElements = [...this.uiElements].sort((a, b) => {
      const zIndexA = a.zIndex || 0;
      const zIndexB = b.zIndex || 0;
      return zIndexB - zIndexA; // 降序排列
    });
    this.needsSort = false;
  }

  /**
   * 处理点击事件
   * 按 z-index 从高到低检查每个可见的 UI 元素，
   * 一旦有元素处理了点击，立即返回 true 阻止事件传播
   * 
   * @param {number} x - 点击 X 坐标（Canvas 坐标系）
   * @param {number} y - 点击 Y 坐标（Canvas 坐标系）
   * @param {string} button - 鼠标按钮（'left' 或 'right'）
   * @returns {boolean} 是否有 UI 元素处理了该点击
   */
  handleClick(x, y, button = 'left') {
    // 如果需要，重新排序
    if (this.needsSort) {
      this.sortElements();
    }

    // 按 z-index 从高到低检查每个可见的 UI 元素
    for (const element of this.sortedElements) {
      // 跳过不可见的元素（性能优化）
      if (!element.visible) {
        continue;
      }

      // 检查点击是否在元素范围内
      if (this.hitTest(element, x, y)) {
        // 让元素处理点击
        const handled = element.handleMouseClick 
          ? element.handleMouseClick(x, y, button)
          : true; // 如果元素没有 handleMouseClick 方法，默认认为已处理

        if (handled) {
          return true; // 事件已被处理，阻止传播
        }
      }
    }

    return false; // 没有 UI 元素处理该点击
  }

  /**
   * 碰撞检测 - 检查点击位置是否在 UI 元素范围内
   * 使用矩形碰撞检测（AABB - Axis-Aligned Bounding Box）
   * 
   * @param {UIElement} element - UI 元素
   * @param {number} x - 点击 X 坐标
   * @param {number} y - 点击 Y 坐标
   * @returns {boolean} 是否命中
   */
  hitTest(element, x, y) {
    // 检查元素是否有必要的属性
    if (typeof element.x !== 'number' || 
        typeof element.y !== 'number' ||
        typeof element.width !== 'number' ||
        typeof element.height !== 'number') {
      console.warn('UIClickHandler: Element missing required properties (x, y, width, height)');
      return false;
    }

    // AABB 碰撞检测
    return x >= element.x &&
           x <= element.x + element.width &&
           y >= element.y &&
           y <= element.y + element.height;
  }

  /**
   * 检查指定位置是否有任何可见的 UI 元素
   * 用于快速判断某个位置是否被 UI 占用
   * 
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   * @returns {boolean} 是否有 UI 元素在该位置
   */
  isUIAtPosition(x, y) {
    // 如果需要，重新排序
    if (this.needsSort) {
      this.sortElements();
    }

    // 检查是否有可见的 UI 元素在该位置
    for (const element of this.sortedElements) {
      if (!element.visible) {
        continue;
      }

      if (this.hitTest(element, x, y)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取当前注册的 UI 元素数量
   * 
   * @returns {number} UI 元素数量
   */
  getElementCount() {
    return this.uiElements.length;
  }

  /**
   * 清除所有注册的 UI 元素
   */
  clear() {
    this.uiElements = [];
    this.sortedElements = [];
    this.needsSort = false;
  }
}

export default UIClickHandler;
