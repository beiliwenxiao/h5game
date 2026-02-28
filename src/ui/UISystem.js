/**
 * UI系统
 * 管理所有UI元素的更新和渲染
 */
export class UISystem {
  constructor() {
    this.elements = [];
    this.panels = new Map(); // 命名面板管理 name -> panel
    this.enabled = true;
  }

  /**
   * 添加UI元素
   * @param {UIElement} element - UI元素
   */
  addElement(element) {
    this.elements.push(element);
    // 按zIndex排序
    this.elements.sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * 移除UI元素
   * @param {UIElement} element - UI元素
   */
  removeElement(element) {
    const index = this.elements.indexOf(element);
    if (index !== -1) {
      this.elements.splice(index, 1);
    }
  }

  /**
   * 注册命名面板（方便按名称管理）
   * @param {string} name - 面板名称
   * @param {Object} panel - 面板对象
   */
  registerPanel(name, panel) {
    this.panels.set(name, panel);
    if (!this.elements.includes(panel)) {
      this.addElement(panel);
    }
  }

  /**
   * 获取命名面板
   * @param {string} name - 面板名称
   * @returns {Object|undefined}
   */
  getPanel(name) {
    return this.panels.get(name);
  }

  /**
   * 移除命名面板
   * @param {string} name - 面板名称
   */
  unregisterPanel(name) {
    const panel = this.panels.get(name);
    if (panel) {
      this.removeElement(panel);
      this.panels.delete(name);
    }
  }

  /**
   * 更新所有面板的鼠标悬停状态
   * @param {number} mouseX - 鼠标X坐标
   * @param {number} mouseY - 鼠标Y坐标
   */
  updateHover(mouseX, mouseY) {
    for (const panel of this.panels.values()) {
      if (panel.visible && panel.handleMouseMove) {
        panel.handleMouseMove(mouseX, mouseY);
      }
    }
  }

  /**
   * 清空所有UI元素
   */
  clear() {
    this.elements = [];
    this.panels.clear();
  }

  /**
   * 更新所有UI元素
   * @param {number} deltaTime - 帧间隔时间（毫秒）
   */
  update(deltaTime) {
    if (!this.enabled) return;

    for (const element of this.elements) {
      if (element.visible) {
        element.update(deltaTime);
      }
    }
  }

  /**
   * 渲染所有UI元素
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  render(ctx) {
    if (!this.enabled) return;

    // 保存当前状态
    ctx.save();

    // 按zIndex顺序渲染
    for (const element of this.elements) {
      if (element.visible) {
        ctx.save();

        // 应用透明度
        if (element.alpha !== undefined && element.alpha < 1.0) {
          ctx.globalAlpha = element.alpha;
        }

        element.render(ctx);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /**
   * 获取指定位置的UI元素
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @returns {UIElement|null}
   */
  getElementAt(x, y) {
    // 从上层到下层查找（反向遍历）
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const element = this.elements[i];
      if (element.visible && element.containsPoint && element.containsPoint(x, y)) {
        return element;
      }
    }
    return null;
  }

  /**
   * 启用UI系统
   */
  enable() {
    this.enabled = true;
  }

  /**
   * 禁用UI系统
   */
  disable() {
    this.enabled = false;
  }
}

