/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-15
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * PanelLayoutLoader - 面板布局加载器（框架级）
 *
 * 加载面板编辑器保存的 PanelLayout.json，供各 UI 面板读取部件布局。
 * 面板组件通过 getPanel(panelId) 获取面板定义，再按 parts 数据渲染。
 *
 * 用法：
 *   const loader = new PanelLayoutLoader({ basePath: 'config/' });
 *   await loader.load();
 *   const panel = loader.getPanel('playerInfoPanel');
 *   // panel.parts 即各部件的位置/大小/属性
 */
export class PanelLayoutLoader {
  /**
   * @param {Object} options
   * @param {string} [options.basePath='config/'] - JSON 所在目录(相对游戏入口)
   */
  constructor(options = {}) {
    this.basePath = options.basePath || 'config/';
    this._panels = {};  // id -> panel definition
    this.loaded = false;
  }

  /**
   * 加载 PanelLayout.json。失败时静默，getPanel 返回 null，调用方用默认布局。
   * @returns {Promise<boolean>}
   */
  async load() {
    const url = this.basePath + 'PanelLayout.json';
    try {
      const res = await fetch(url);
      if (!res.ok) { this.loaded = false; return false; }
      const data = await res.json();
      this._panels = {};
      if (data && Array.isArray(data.panels)) {
        for (const p of data.panels) {
          this._panels[p.id] = p;
        }
      }
      this.loaded = true;
      return true;
    } catch (e) {
      console.warn('PanelLayoutLoader: 加载失败', url, e);
      this.loaded = false;
      return false;
    }
  }

  /**
   * 获取面板定义
   * @param {string} panelId
   * @returns {Object|null} { id, name, width, height, backgroundColor, borderColor, borderWidth, parts[] }
   */
  getPanel(panelId) {
    return this._panels[panelId] || null;
  }

  /**
   * 获取面板中某个部件
   * @param {string} panelId
   * @param {string} partId
   * @returns {Object|null}
   */
  getPart(panelId, partId) {
    const panel = this._panels[panelId];
    if (!panel || !panel.parts) return null;
    return panel.parts.find(p => p.id === partId) || null;
  }

  /**
   * 获取面板中某类型的所有部件
   * @param {string} panelId
   * @param {string} type
   * @returns {Array}
   */
  getPartsByType(panelId, type) {
    const panel = this._panels[panelId];
    if (!panel || !panel.parts) return [];
    return panel.parts.filter(p => p.type === type);
  }
}

export default PanelLayoutLoader;
