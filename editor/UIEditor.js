/**
 * UIEditor - 界面 UI 编辑器
 *
 * 可视化编辑游戏 UI 组件（按钮、面板、摇杆等）的位置和大小，
 * 分 PC 和 Android 两套布局，保存为 JSON 配置文件：
 *   - config/UILayout.desktop.json
 *   - config/UILayout.mobile.json
 *
 * 保存通过 Vite dev server 的 /api/save-file 写入实际文件。
 * 游戏入口运行时根据平台加载对应 JSON 动态应用布局。
 */

// 各平台默认组件定义（与游戏实际 UI 对齐）
// 坐标系：以"逻辑画布"左上角为原点；锚点说明见各组件 anchor 字段
const DEFAULT_COMPONENTS = {
  desktop: {
    // 画布逻辑尺寸（仅用于编辑器预览参考）
    canvas: { width: 1280, height: 720 },
    components: [
      { id: 'bottomControlBar', label: '底部控制栏', x: 0, y: 620, width: 1280, height: 100, anchor: 'topleft', kind: 'panel' },
      { id: 'playerInfoPanel', label: '角色/装备面板', x: 10, y: 40, width: 320, height: 580, anchor: 'topleft', kind: 'panel' },
      { id: 'inventoryPanel', label: '背包面板', x: 900, y: 270, width: 370, height: 350, anchor: 'topleft', kind: 'panel' }
    ]
  },
  mobile: {
    canvas: { width: 1280, height: 600 },
    components: [
      { id: 'joystick', label: '摇杆区', x: 0, y: 270, width: 384, height: 330, anchor: 'topleft', kind: 'zone' },
      { id: 'hud-avatar', label: 'HUD头像', x: 10, y: 10, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hud-name', label: 'HUD昵称', x: 78, y: 10, width: 140, height: 20, anchor: 'topleft', kind: 'panel' },
      { id: 'hud-hp', label: 'HUD血条', x: 78, y: 32, width: 140, height: 14, anchor: 'topleft', kind: 'panel' },
      { id: 'hud-mp', label: 'HUD蓝条', x: 78, y: 52, width: 140, height: 14, anchor: 'topleft', kind: 'panel' },
      { id: 'act-attack', label: '攻击', x: 1126, y: 510, width: 78, height: 78, anchor: 'topleft', kind: 'button' },
      { id: 'act-skill3', label: '技能3', x: 1102, y: 452, width: 62, height: 62, anchor: 'topleft', kind: 'button' },
      { id: 'act-skill4', label: '技能4', x: 1062, y: 386, width: 62, height: 62, anchor: 'topleft', kind: 'button' },
      { id: 'act-skill5', label: '技能5', x: 986, y: 380, width: 62, height: 62, anchor: 'topleft', kind: 'button' },
      { id: 'act-flight', label: '轻功', x: 956, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'act-interact', label: '交互', x: 1176, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'act-throw', label: '投掷', x: 1244, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'act-axe', label: '采集', x: 1312, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-hp', label: '红瓶', x: 440, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-mp', label: '蓝瓶', x: 510, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-char', label: '装备', x: 580, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-bag', label: '背包', x: 650, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-skill6', label: '回血', x: 720, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-skill7', label: '打坐', x: 790, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' }
    ]
  }
};

export class UIEditor {
  /**
   * @param {HTMLElement} container - 编辑器挂载容器
   * @param {Object} options
   * @param {string} [options.gameId='sanguo_zhangjiao']
   */
  constructor(container, options = {}) {
    this.container = container;
    this.gameId = options.gameId || 'sanguo_zhangjiao';
    // 配置文件相对仓库根目录的路径
    this.configBase = `example/${this.gameId}/config/`;

    this.platform = 'mobile'; // 当前编辑平台
    this.layouts = {
      desktop: this._cloneDefault('desktop'),
      mobile: this._cloneDefault('mobile')
    };
    this.selectedId = null;
    this.scale = 1; // 预览缩放

    this._dragState = null;
    this._initialized = false;
  }

  _cloneDefault(platform) {
    return JSON.parse(JSON.stringify(DEFAULT_COMPONENTS[platform]));
  }

  /** 初始化（首次显示时调用） */
  async init() {
    if (this._initialized) return;
    this._initialized = true;
    this._buildUI();
    await this._loadFromFiles();
    this._render();
  }

  /** 从 JSON 文件加载已保存布局（覆盖默认值） */
  async _loadFromFiles() {
    for (const platform of ['desktop', 'mobile']) {
      const file = this.configBase + (platform === 'desktop' ? 'UILayout.desktop.json' : 'UILayout.mobile.json');
      try {
        const res = await fetch('/api/read-file?path=' + encodeURIComponent(file));
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.ok && data.content) {
          const parsed = JSON.parse(data.content);
          // 合并：以文件为准，但保留默认组件中文件缺失的项
          this.layouts[platform] = this._mergeLayout(this._cloneDefault(platform), parsed);
        }
      } catch (e) {
        console.warn('UIEditor: 加载布局失败', platform, e);
      }
    }
  }

  /** 合并已存布局到默认结构（优先用百分比还原到当前编辑器画布像素） */
  _mergeLayout(base, saved) {
    if (!saved || !Array.isArray(saved.components)) return base;
    if (saved.canvas) base.canvas = saved.canvas;
    const cw = base.canvas.width;
    const ch = base.canvas.height;
    const savedMap = {};
    for (const c of saved.components) savedMap[c.id] = c;
    for (const comp of base.components) {
      const s = savedMap[comp.id];
      if (!s) continue;
      // 优先用百分比(分辨率无关)，缺失则退回绝对像素
      if (s.xPct !== undefined) {
        comp.x = Math.round(s.xPct * cw);
        comp.y = Math.round(s.yPct * ch);
        comp.width = Math.round(s.wPct * cw);
        comp.height = Math.round(s.hPct * ch);
      } else {
        comp.x = s.x; comp.y = s.y;
        comp.width = s.width; comp.height = s.height;
      }
    }
    return base;
  }

  /** 构建编辑器 DOM 结构 */
  _buildUI() {
    this.container.innerHTML = `
      <div class="uie-root">
        <div class="uie-toolbar">
          <div class="uie-platform-switch">
            <button data-platform="mobile" class="active">📱 Android UI</button>
            <button data-platform="desktop">🖥️ PC UI</button>
          </div>
          <div class="uie-actions">
            <button id="uie-reset">恢复默认</button>
            <button id="uie-save" class="primary">💾 保存到文件</button>
          </div>
        </div>
        <div class="uie-main">
          <div class="uie-stage-wrap">
            <div class="uie-stage" id="uie-stage"></div>
          </div>
          <div class="uie-props" id="uie-props">
            <h4>属性</h4>
            <div class="uie-prop-empty">选择一个组件</div>
          </div>
        </div>
        <div class="uie-status" id="uie-status"></div>
      </div>
    `;
    this._injectStyles();

    // 平台切换
    this.container.querySelectorAll('.uie-platform-switch button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.platform = btn.dataset.platform;
        this.container.querySelectorAll('.uie-platform-switch button')
          .forEach(b => b.classList.toggle('active', b === btn));
        this.selectedId = null;
        this._render();
      });
    });

    this.container.querySelector('#uie-save').addEventListener('click', () => this.save());
    this.container.querySelector('#uie-reset').addEventListener('click', () => {
      if (confirm('恢复当前平台为默认布局？(未保存)')) {
        this.layouts[this.platform] = this._cloneDefault(this.platform);
        this.selectedId = null;
        this._render();
      }
    });
  }

  _injectStyles() {
    if (document.getElementById('uie-styles')) return;
    const style = document.createElement('style');
    style.id = 'uie-styles';
    style.textContent = `
      .uie-root { display:flex; flex-direction:column; height:100%; background:#0d1326; color:#fff; }
      .uie-toolbar { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:#16213e; border-bottom:1px solid #2a3a5e; }
      .uie-platform-switch button { padding:8px 14px; margin-right:8px; background:#3a4a7e; border:none; border-radius:4px; color:#fff; cursor:pointer; }
      .uie-platform-switch button.active { background:#4CAF50; color:#000; }
      .uie-actions button { padding:8px 14px; margin-left:8px; background:#3a4a7e; border:none; border-radius:4px; color:#fff; cursor:pointer; }
      .uie-actions button.primary { background:#4CAF50; color:#000; font-weight:bold; }
      .uie-main { flex:1; display:flex; overflow:hidden; }
      .uie-stage-wrap { flex:1; display:flex; align-items:center; justify-content:center; overflow:auto; padding:20px; background:#070b18; }
      .uie-stage { position:relative; background:#1a2238 url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M20 0H0V20" fill="none" stroke="%23223" stroke-width="1"/></svg>'); border:2px solid #4CAF50; box-shadow:0 0 30px rgba(0,0,0,0.6); }
      .uie-comp { position:absolute; box-sizing:border-box; border:1.5px solid rgba(120,180,255,0.8); background:rgba(80,140,255,0.18); color:#cfe3ff; font-size:11px; display:flex; align-items:center; justify-content:center; cursor:move; user-select:none; overflow:hidden; }
      .uie-comp.zone { border-style:dashed; background:rgba(255,200,80,0.12); border-color:rgba(255,200,80,0.7); color:#ffe7a8; }
      .uie-comp.button { border-radius:50%; }
      .uie-comp.selected { border-color:#ff5; background:rgba(255,255,100,0.25); z-index:10; }
      .uie-comp .uie-handle { position:absolute; right:-5px; bottom:-5px; width:12px; height:12px; background:#ff5; border:1px solid #000; cursor:nwse-resize; }
      .uie-props { width:240px; background:#111a30; border-left:1px solid #2a3a5e; padding:14px; overflow-y:auto; }
      .uie-props h4 { color:#4CAF50; margin-bottom:10px; }
      .uie-prop-empty { color:#778; font-size:13px; }
      .uie-prop-row { display:flex; align-items:center; margin-bottom:8px; }
      .uie-prop-row label { width:50px; font-size:12px; color:#9ab; }
      .uie-prop-row input { flex:1; background:#0a1020; border:1px solid #2a3a5e; color:#fff; padding:5px; border-radius:3px; width:60px; }
      .uie-prop-name { font-weight:bold; color:#fff; margin-bottom:12px; font-size:14px; }
      .uie-status { padding:6px 16px; font-size:12px; color:#8aa; background:#0a1020; min-height:24px; }
    `;
    document.head.appendChild(style);
  }

  /** 渲染当前平台的舞台和组件 */
  _render() {
    const layout = this.layouts[this.platform];
    const stage = this.container.querySelector('#uie-stage');
    if (!stage) return;

    // 计算预览缩放（适配舞台容器宽度）
    const wrap = this.container.querySelector('.uie-stage-wrap');
    const maxW = (wrap.clientWidth || 800) - 40;
    const maxH = (wrap.clientHeight || 500) - 40;
    const cw = layout.canvas.width;
    const ch = layout.canvas.height;
    this.scale = Math.min(maxW / cw, maxH / ch, 1);

    stage.style.width = (cw * this.scale) + 'px';
    stage.style.height = (ch * this.scale) + 'px';
    stage.innerHTML = '';

    for (const comp of layout.components) {
      const el = document.createElement('div');
      el.className = 'uie-comp ' + (comp.kind || '');
      if (comp.id === this.selectedId) el.classList.add('selected');
      el.style.left = (comp.x * this.scale) + 'px';
      el.style.top = (comp.y * this.scale) + 'px';
      el.style.width = (comp.width * this.scale) + 'px';
      el.style.height = (comp.height * this.scale) + 'px';
      el.textContent = comp.label;
      el.dataset.id = comp.id;

      // 拖拽
      el.addEventListener('mousedown', (e) => this._startDrag(e, comp, 'move'));

      // 缩放手柄
      const handle = document.createElement('div');
      handle.className = 'uie-handle';
      handle.addEventListener('mousedown', (e) => { e.stopPropagation(); this._startDrag(e, comp, 'resize'); });
      el.appendChild(handle);

      stage.appendChild(el);
    }

    this._renderProps();
  }

  _startDrag(e, comp, mode) {
    e.preventDefault();
    this.selectedId = comp.id;
    this._dragState = {
      mode, comp,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: comp.x, startY: comp.y,
      startW: comp.width, startH: comp.height
    };
    const onMove = (ev) => this._onDragMove(ev);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      this._dragState = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    this._render();
  }

  _onDragMove(e) {
    if (!this._dragState) return;
    const ds = this._dragState;
    const dx = (e.clientX - ds.startMouseX) / this.scale;
    const dy = (e.clientY - ds.startMouseY) / this.scale;
    if (ds.mode === 'move') {
      ds.comp.x = Math.round(ds.startX + dx);
      ds.comp.y = Math.round(ds.startY + dy);
    } else {
      ds.comp.width = Math.max(16, Math.round(ds.startW + dx));
      ds.comp.height = Math.max(16, Math.round(ds.startH + dy));
    }
    this._render();
  }

  _renderProps() {
    const props = this.container.querySelector('#uie-props');
    const layout = this.layouts[this.platform];
    const comp = layout.components.find(c => c.id === this.selectedId);
    if (!comp) {
      props.innerHTML = '<h4>属性</h4><div class="uie-prop-empty">选择一个组件</div>';
      return;
    }
    props.innerHTML = `
      <h4>属性</h4>
      <div class="uie-prop-name">${comp.label} <span style="color:#778;font-size:11px">(${comp.id})</span></div>
      ${['x', 'y', 'width', 'height'].map(k => `
        <div class="uie-prop-row">
          <label>${k}</label>
          <input type="number" data-k="${k}" value="${comp[k]}">
        </div>
      `).join('')}
      <div class="uie-prop-empty" style="margin-top:10px">画布: ${layout.canvas.width}×${layout.canvas.height}</div>
    `;
    props.querySelectorAll('input[data-k]').forEach(input => {
      input.addEventListener('input', () => {
        const k = input.dataset.k;
        const v = parseInt(input.value, 10);
        if (!isNaN(v)) { comp[k] = v; this._render(); }
      });
    });
  }

  _setStatus(msg, isError) {
    const el = this.container.querySelector('#uie-status');
    if (el) { el.textContent = msg; el.style.color = isError ? '#ff8888' : '#8aa'; }
  }

  /** 保存当前两套布局到 JSON 文件（坐标转为百分比，自适配分辨率） */
  async save() {
    for (const platform of ['desktop', 'mobile']) {
      const file = this.configBase + (platform === 'desktop' ? 'UILayout.desktop.json' : 'UILayout.mobile.json');
      const layout = this.layouts[platform];
      const cw = layout.canvas.width;
      const ch = layout.canvas.height;
      // 输出：每个组件附带百分比坐标(0~1)，游戏端按实际屏幕尺寸还原
      const out = {
        canvas: layout.canvas,
        components: layout.components.map(c => ({
          id: c.id,
          label: c.label,
          kind: c.kind,
          anchor: c.anchor || 'topleft',
          // 像素值（编辑器画布下）
          x: c.x, y: c.y, width: c.width, height: c.height,
          // 百分比值（相对画布，0~1）—— 游戏端优先用这个
          xPct: +(c.x / cw).toFixed(5),
          yPct: +(c.y / ch).toFixed(5),
          wPct: +(c.width / cw).toFixed(5),
          hPct: +(c.height / ch).toFixed(5)
        }))
      };
      const content = JSON.stringify(out, null, 2);
      try {
        const res = await fetch('/api/save-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: file, content })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || '保存失败');
      } catch (e) {
        this._setStatus(`保存失败(${platform}): ${e.message}`, true);
        return;
      }
    }
    this._setStatus(`✅ 已保存到 ${this.configBase}UILayout.desktop.json 和 UILayout.mobile.json`);
  }
}

export default UIEditor;
