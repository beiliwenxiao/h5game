import { PlatformProfile } from '../core/PlatformProfile.js';

/**
 * UILayoutLoader - UI 布局加载器（框架级）
 *
 * 加载 UI 编辑器保存的布局 JSON（UILayout.desktop.json / UILayout.mobile.json），
 * 按平台选择，对外提供"按组件 id 取百分比布局"的能力。
 *
 * 布局以百分比(0~1)存储，与分辨率无关：
 *   - DOM 按钮：left = xPct × 容器宽，top = yPct × 容器高
 *   - Canvas 面板：x = xPct × logicalWidth，width = wPct × logicalWidth
 *
 * 用法：
 *   const loader = new UILayoutLoader({ basePath: 'config/' });
 *   await loader.load();                  // 按当前平台加载
 *   const rect = loader.getPct('act-attack'); // { xPct, yPct, wPct, hPct } | null
 */
export class UILayoutLoader {
  /**
   * @param {Object} options
   * @param {string} [options.basePath='config/'] - JSON 所在目录(相对游戏入口)
   * @param {string} [options.platform] - 强制平台，不传则用 PlatformProfile
   */
  constructor(options = {}) {
    this.basePath = options.basePath || 'config/';
    this.platform = options.platform || PlatformProfile.platform;
    this.layout = null;        // 已加载的布局对象
    this._map = {};            // id -> component
    this.loaded = false;
  }

  /** 当前平台对应的文件名 */
  _fileName() {
    return this.platform === 'mobile' ? 'UILayout.mobile.json' : 'UILayout.desktop.json';
  }

  /**
   * 加载布局 JSON。失败(文件不存在等)时静默，getPct 返回 null，调用方用默认布局。
   * @returns {Promise<boolean>} 是否成功加载
   */
  async load() {
    const url = this.basePath + this._fileName();
    try {
      const res = await fetch(url);
      if (!res.ok) { this.loaded = false; return false; }
      const data = await res.json();
      this.layout = data;
      this._map = {};
      if (data && Array.isArray(data.components)) {
        for (const c of data.components) this._map[c.id] = c;
      }
      this.loaded = true;
      return true;
    } catch (e) {
      console.warn('UILayoutLoader: 加载布局失败', url, e);
      this.loaded = false;
      return false;
    }
  }

  /**
   * 取组件的百分比布局
   * @param {string} id
   * @returns {{xPct:number,yPct:number,wPct:number,hPct:number}|null}
   */
  getPct(id) {
    const c = this._map[id];
    if (!c || c.xPct === undefined) return null;
    return { xPct: c.xPct, yPct: c.yPct, wPct: c.wPct, hPct: c.hPct };
  }

  /**
   * 取组件在给定容器尺寸下的像素矩形
   * @param {string} id
   * @param {number} containerW
   * @param {number} containerH
   * @returns {{x:number,y:number,width:number,height:number}|null}
   */
  getRect(id, containerW, containerH) {
    const p = this.getPct(id);
    if (!p) return null;
    return {
      x: Math.round(p.xPct * containerW),
      y: Math.round(p.yPct * containerH),
      width: Math.round(p.wPct * containerW),
      height: Math.round(p.hPct * containerH)
    };
  }

  /**
   * 把布局应用到一个 DOM 元素(用 CSS 绝对定位 left/top/width/height)
   * @param {string} id
   * @param {HTMLElement} el
   * @param {number} containerW
   * @param {number} containerH
   */
  applyToDom(id, el, containerW, containerH) {
    const r = this.getRect(id, containerW, containerH);
    if (!r || !el) return false;
    el.style.position = 'absolute';
    el.style.left = r.x + 'px';
    el.style.top = r.y + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
    // 清除可能冲突的 right/bottom 定位
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    return true;
  }

  /**
   * 把布局应用到一个 Canvas UI 元素(设置 x/y/width/height 属性)
   * @param {string} id
   * @param {Object} uiElement - 含 x/y/width/height 的对象
   * @param {number} logicalW
   * @param {number} logicalH
   */
  applyToCanvasPanel(id, uiElement, logicalW, logicalH) {
    const r = this.getRect(id, logicalW, logicalH);
    if (!r || !uiElement) return false;
    uiElement.x = r.x;
    uiElement.y = r.y;
    uiElement.width = r.width;
    uiElement.height = r.height;
    return true;
  }
}

export default UILayoutLoader;
