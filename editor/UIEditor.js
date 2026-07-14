/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 */

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
      // 大面板
      { id: 'playerInfoPanel', label: '属性面板', x: 10, y: 40, width: 320, height: 580, anchor: 'topleft', kind: 'panel' },
      { id: 'equipmentPanel', label: '装备面板', x: 340, y: 220, width: 300, height: 400, anchor: 'topleft', kind: 'panel' },
      { id: 'inventoryPanel', label: '背包面板', x: 900, y: 270, width: 360, height: 340, anchor: 'topleft', kind: 'panel' },
      // 底部控制栏拆分为独立小控件（血球/蓝球/2药水/5技能）
      { id: 'pc-hp-orb', label: '血球', x: 397, y: 625, width: 70, height: 70, anchor: 'topleft', kind: 'button' },
      { id: 'pc-potion1', label: '红瓶', x: 482, y: 640, width: 40, height: 40, anchor: 'topleft', kind: 'button' },
      { id: 'pc-potion2', label: '蓝瓶', x: 528, y: 640, width: 40, height: 40, anchor: 'topleft', kind: 'button' },
      { id: 'pc-skill1', label: '技能1', x: 574, y: 640, width: 40, height: 40, anchor: 'topleft', kind: 'button' },
      { id: 'pc-skill2', label: '技能2', x: 620, y: 640, width: 40, height: 40, anchor: 'topleft', kind: 'button' },
      { id: 'pc-skill3', label: '技能3', x: 666, y: 640, width: 40, height: 40, anchor: 'topleft', kind: 'button' },
      { id: 'pc-skill4', label: '技能4', x: 712, y: 640, width: 40, height: 40, anchor: 'topleft', kind: 'button' },
      { id: 'pc-skill5', label: '技能5', x: 758, y: 640, width: 40, height: 40, anchor: 'topleft', kind: 'button' },
      { id: 'pc-mp-orb', label: '蓝球', x: 813, y: 625, width: 70, height: 70, anchor: 'topleft', kind: 'button' },
      // 格挡 / 轻功 / 投掷（等价 Q / Ctrl+左键 / Shift+左键）
      { id: 'pc-block', label: '格挡', x: 666, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      { id: 'pc-flight', label: '轻功', x: 722, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      { id: 'pc-throw', label: '投掷', x: 778, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      // 功能按钮：属性 / 装备 / 背包
      { id: 'pc-char', label: '属性', x: 834, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      { id: 'pc-equip', label: '装备', x: 890, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      { id: 'pc-bag', label: '背包', x: 946, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' }
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
      { id: 'act-block', label: '格挡', x: 1126, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
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
    await this._loadPanelLayout();
    this._render();
  }

  /** 加载面板编辑器的布局数据（用于真实面板预览） */
  async _loadPanelLayout() {
    this._panelLayouts = {};
    try {
      const file = this.configBase + 'PanelLayout.json';
      const res = await fetch('/api/read-file?path=' + encodeURIComponent(file));
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && data.content) {
        const parsed = JSON.parse(data.content);
        if (parsed && Array.isArray(parsed.panels)) {
          for (const p of parsed.panels) {
            this._panelLayouts[p.id] = p;
          }
        }
      }
    } catch (e) {
      // 没有面板布局文件，不影响
    }
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
      el.dataset.id = comp.id;

      // 面板类型：用 canvas 绘制真实预览
      const panelDef = this._panelLayouts && this._panelLayouts[comp.id];
      if (comp.kind === 'panel' && panelDef) {
        el.textContent = '';
        el.style.background = 'none';
        el.style.border = comp.id === this.selectedId ? '2px solid #ff5' : '1px solid rgba(76,175,80,0.4)';
        el.style.overflow = 'hidden';
        const cvs = document.createElement('canvas');
        const cw = Math.round(comp.width * this.scale);
        const ch = Math.round(comp.height * this.scale);
        cvs.width = cw;
        cvs.height = ch;
        cvs.style.width = '100%';
        cvs.style.height = '100%';
        cvs.style.pointerEvents = 'none';
        this._drawPanelPreview(cvs, panelDef, cw, ch);
        el.appendChild(cvs);
      } else {
        el.textContent = comp.label;
      }

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

  /**
   * 在 canvas 上绘制面板真实预览
   * 内部部件保持 1:1 原始坐标，不随外框拉伸缩放。
   * 外框大小只决定可见区域（裁剪）。
   * @param {HTMLCanvasElement} cvs
   * @param {Object} panelDef - 面板定义（来自 PanelLayout.json）
   * @param {number} cw - canvas 像素宽（= comp.width * editorScale）
   * @param {number} ch - canvas 像素高（= comp.height * editorScale）
   */
  _drawPanelPreview(cvs, panelDef, cw, ch) {
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    // editorScale = 外框像素 / 外框逻辑尺寸（即 UI 编辑器的整体缩放）
    // 但面板内容按面板自身坐标 1:1 绘制，只需要同样的 editorScale
    const editorScale = this.scale;
    ctx.save();
    ctx.scale(editorScale, editorScale);

    // 面板背景填满外框（comp 当前大小），内部部件按原始坐标 1:1 绘制
    const compW = cw / editorScale;
    const compH = ch / editorScale;
    ctx.fillStyle = panelDef.backgroundColor || 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, compW, compH);
    ctx.strokeStyle = panelDef.borderColor || '#4a9eff';
    ctx.lineWidth = panelDef.borderWidth || 2;
    ctx.strokeRect(0, 0, compW, compH);

    // 渲染部件（按面板自身坐标，不随外框拉伸）
    for (const part of panelDef.parts) {
      const { x, y, width, height } = part;
      switch (part.type) {
        case 'text':
          ctx.fillStyle = part.color || '#ffffff';
          ctx.font = `${part.fontWeight || 'normal'} ${part.fontSize || 14}px Arial`;
          ctx.textAlign = part.align || 'left';
          ctx.textBaseline = 'top';
          const tx = part.align === 'center' ? x + width / 2 : part.align === 'right' ? x + width : x;
          ctx.fillText(part.text || '', tx, y);
          ctx.textAlign = 'left';
          break;
        case 'line':
          ctx.strokeStyle = part.color || '#4a9eff';
          ctx.lineWidth = height || 1;
          ctx.beginPath();
          ctx.moveTo(x, y + height / 2);
          ctx.lineTo(x + width, y + height / 2);
          ctx.stroke();
          break;
        case 'button':
          ctx.fillStyle = part.bgColor || '#3a4a7e';
          ctx.fillRect(x, y, width, height);
          ctx.strokeStyle = part.borderColor || '#666';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, width, height);
          ctx.fillStyle = part.color || '#ffffff';
          ctx.font = `${part.fontSize || 12}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(part.text || '', x + width / 2, y + height / 2);
          ctx.textAlign = 'left';
          break;
        case 'equip-slot':
          ctx.fillStyle = part.slotBgColor || 'rgba(30,30,30,0.9)';
          ctx.fillRect(x, y, width, height);
          ctx.strokeStyle = part.slotBorderColor || '#555';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x, y, width, height);
          ctx.fillStyle = '#888';
          ctx.font = '10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(part.slotLabel || '', x + width / 2, y + height / 2);
          ctx.textAlign = 'left';
          break;
        case 'slot-grid': {
          const cols = part.cols || 6;
          const rows = part.rows || 4;
          const sz = part.slotSize || 50;
          const pad = part.slotPadding || 5;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const gx = x + c * (sz + pad);
              const gy = y + r * (sz + pad);
              ctx.fillStyle = part.slotBgColor || 'rgba(50,50,50,0.8)';
              ctx.fillRect(gx, gy, sz, sz);
              ctx.strokeStyle = part.slotBorderColor || '#666';
              ctx.lineWidth = 1;
              ctx.strokeRect(gx, gy, sz, sz);
            }
          }
          break;
        }
        case 'attr-row':
          ctx.fillStyle = part.labelColor || '#aaaaaa';
          ctx.font = `${part.fontSize || 13}px Arial`;
          ctx.textBaseline = 'top';
          ctx.fillText(`${part.attrLabel || ''}:`, x, y);
          ctx.fillStyle = part.attrColor || '#ffffff';
          ctx.fillText('999/999', x + 60, y);
          break;
        case 'scrollbar':
          ctx.fillStyle = part.trackColor || 'rgba(255,255,255,0.1)';
          ctx.fillRect(x, y, width, height);
          ctx.fillStyle = part.thumbColor || 'rgba(255,255,255,0.4)';
          ctx.fillRect(x, y, width, height * 0.4);
          break;
        case 'icon':
          ctx.font = `${part.fontSize || 24}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(part.icon || '⚔️', x + width / 2, y + height / 2);
          ctx.textAlign = 'left';
          break;
        case 'progress-bar':
          ctx.fillStyle = part.bgColor || '#333';
          ctx.fillRect(x, y, width, height);
          ctx.fillStyle = part.fillColor || '#4CAF50';
          ctx.fillRect(x, y, width * (part.value || 0.5), height);
          ctx.strokeStyle = part.borderColor || '#666';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, width, height);
          break;
      }
    }
    ctx.restore();
  }
}
export default UIEditor;
