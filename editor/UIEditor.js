/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 */

/**
 * UIEditor - 界面 UI 编辑器
 *
 * 可视化编辑游戏 UI 组件（按钮、面板、摇杆等）的位置和大小，
 * 分 PC、Android 游戏 UI 与 PC/Android 登录页面四套布局，保存为 JSON 配置文件：
 *   - config/UILayout.desktop.json
 *   - config/UILayout.mobile.json
 *   - config/LoginLayout.desktop.json
 *   - config/LoginLayout.mobile.json
 *
 * 保存通过 Vite dev server 的 /api/save-file 写入实际文件。
 * 游戏入口运行时根据平台加载对应 JSON 动态应用布局。
 */

// 各平台默认组件定义（与游戏实际 UI 对齐）
// 坐标系：以“逻辑画布”左上角为原点；锚点说明见各组件 anchor 字段
const DEFAULT_COMPONENTS = {
  desktop: {
    // 画布逻辑尺寸（仅用于编辑器预览参考）
    canvas: { width: 1280, height: 720 },
    components: [
      // 右侧 Canvas HUD：Android/PC 共用稳定 ID，运行时按当前平台布局加载。
      { id: 'minimap', label: '小地图', x: 1120, y: 10, width: 150, height: 150, anchor: 'topleft', kind: 'panel' },
      { id: 'timeWeatherBadge', label: '时间/天气', x: 960, y: 10, width: 150, height: 54, anchor: 'topleft', kind: 'panel' },
      { id: 'combatStateBadge', label: '战斗/灵魂状态', x: 1030, y: 72, width: 80, height: 30, anchor: 'topleft', kind: 'panel' },
      // 统一背包外框（属性、装备和物品栏的内部部件由 PanelEditor 编辑）
      { id: 'backpackPanel', label: '背包', x: 190, y: 100, width: 900, height: 520, anchor: 'topleft', kind: 'panel' },
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
      // 格挡 / 跳跃 / 轻功 / 投掷
      { id: 'pc-block', label: '格挡', x: 666, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      { id: 'pc-jump', label: '跳跃', x: 722, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      { id: 'pc-flight', label: '轻功', x: 778, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      { id: 'pc-throw', label: '投掷', x: 834, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      // 统一背包入口 + 系统设置
      { id: 'pc-bag', label: '背包', x: 890, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' },
      { id: 'pc-settings', label: '系统设置', x: 946, y: 640, width: 50, height: 50, anchor: 'topleft', kind: 'button' }
    ]
  },
  mobile: {
    canvas: { width: 1280, height: 600 },
    components: [
      { id: 'minimap', label: '小地图', x: 1120, y: 10, width: 150, height: 150, anchor: 'topleft', kind: 'panel' },
      { id: 'timeWeatherBadge', label: '时间/天气', x: 960, y: 10, width: 150, height: 54, anchor: 'topleft', kind: 'panel' },
      { id: 'combatStateBadge', label: '战斗/灵魂状态', x: 1030, y: 72, width: 80, height: 30, anchor: 'topleft', kind: 'panel' },
      { id: 'backpackPanel', label: '背包', x: 190, y: 40, width: 900, height: 500, anchor: 'topleft', kind: 'panel' },
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
      { id: 'act-flight', label: '轻功', x: 956, y: 476, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'act-jump', label: '跳跃', x: 956, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'act-interact', label: '交互', x: 1176, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'act-throw', label: '投掷', x: 1244, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'act-axe', label: '采集', x: 1312, y: 544, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-hp', label: '红瓶', x: 440, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-mp', label: '蓝瓶', x: 510, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-bag', label: '背包', x: 650, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-settings', label: '系统设置', x: 580, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-skill6', label: '回血', x: 720, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' },
      { id: 'hb-skill7', label: '打坐', x: 790, y: 540, width: 56, height: 56, anchor: 'topleft', kind: 'button' }
    ]
  },
  login: {
    canvas: { width: 1280, height: 720 },
    components: [
      { id: 'login-panel', label: '登录布局容器', x: 460, y: 263, width: 460, height: 266, anchor: 'topleft', kind: 'login-panel' },
      { id: 'login-title', label: '标题', x: 280, y: 80, width: 720, height: 56, anchor: 'topleft', kind: 'login-title' },
      { id: 'login-subtitle', label: '副标题', x: 360, y: 155, width: 560, height: 32, anchor: 'topleft', kind: 'login-subtitle' },
      { id: 'login-description', label: '文字描述', x: 400, y: 200, width: 480, height: 34, anchor: 'topleft', kind: 'login-description' },
      { id: 'login-actions', label: '主操作区', x: 570, y: 297, width: 230, height: 162, anchor: 'topleft', kind: 'login-actions' }
    ]
  }
};

const EDITABLE_LAYOUT_PLATFORMS = ['desktop', 'mobile', 'loginDesktop', 'loginMobile'];
const LOGIN_LAYOUT_PLATFORMS = new Set(['loginDesktop', 'loginMobile']);

function layoutFileName(platform) {
  if (platform === 'desktop') return 'UILayout.desktop.json';
  if (platform === 'mobile') return 'UILayout.mobile.json';
  return platform === 'loginMobile' ? 'LoginLayout.mobile.json' : 'LoginLayout.desktop.json';
}

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
      mobile: this._cloneDefault('mobile'),
      loginDesktop: this._cloneDefault('loginDesktop'),
      loginMobile: this._cloneDefault('loginMobile')
    };
    this.selectedId = null;
    this.scale = 1; // 预览缩放

    this._dragState = null;
    this._initialized = false;
    this._loginBackgroundImage = '';

    // 手柄绑定编辑器数据（与 Xbox360Profile.DEFAULT_BINDINGS 同构）
    this._defaultGamepadBindings = null; // 异步加载
    this._gamepadBindings = {};
    this._gamepadDeadzone = 0.22;
    this._gamepadTriggerThreshold = 0.5;
    this._gamepadMeta = null; // { PadButton, PAD_BUTTON_LABELS, BINDABLE_ACTIONS, ... }
  }

  _cloneDefault(platform) {
    const defaultPlatform = LOGIN_LAYOUT_PLATFORMS.has(platform) ? 'login' : platform;
    return JSON.parse(JSON.stringify(DEFAULT_COMPONENTS[defaultPlatform]));
  }

  /** 初始化（首次显示时调用） */
  async init() {
    if (this._initialized) return;
    this._initialized = true;
    this._buildUI();
    await this._loadFromFiles();
    await this._loadLoginBackgroundConfig();
    await this._loadPanelLayout();
    // 面板的内外框比例由面板编辑器维护，这里先把历史数据规范到该比例
    this._normalizePanelAspects();
    await this._loadGamepadConfig();
    await this._loadHintsConfig();
    this._render();
  }

  /** 从项目配置读取登录页背景，保持编辑器预览与游戏运行时一致。 */
  async _loadLoginBackgroundConfig() {
    this._loginBackgroundImage = '';
    try {
      const projectFile = `example/${this.gameId}/game.project.json`;
      const response = await fetch('/api/read-file?path=' + encodeURIComponent(projectFile));
      if (!response.ok) return;
      const data = await response.json();
      if (!data || !data.ok || !data.content) return;
      const project = JSON.parse(data.content);
      const imagePath = project?.system?.login?.backgroundImage;
      if (typeof imagePath !== 'string' || !imagePath.trim()) return;

      const normalizedPath = imagePath.trim().replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');
      this._loginBackgroundImage = normalizedPath.startsWith('assets/')
        ? `../example/${this.gameId}/${normalizedPath}`
        : normalizedPath;
    } catch (e) {
      console.warn('UIEditor: 登录背景配置加载失败', e);
    }
  }

  /**
   * 加载操作提示文案表（内置默认 + config/InputHints.json 覆盖）。
   * 文案表由框架的 InputHints 提供，编辑器只做展示与写回，避免两处维护默认值。
   */
  async _loadHintsConfig() {
    try {
      const mod = await import('../src/core/input/InputHints.js');
      this._inputHints = mod.InputHints;
      this._hintDefaults = this._inputHints.getDefaultActions();
      // 先叠加项目已保存的覆盖，再取全量表
      const file = this.configBase + 'InputHints.json';
      try {
        const res = await fetch('/api/read-file?path=' + encodeURIComponent(file));
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok && data.content) {
            const parsed = JSON.parse(data.content);
            this._inputHints.merge(parsed && parsed.actions ? parsed.actions : parsed);
          }
        }
      } catch (e) {
        // 没有覆盖文件，用默认表
      }
      this._hintActions = this._inputHints.getActions();
    } catch (e) {
      console.warn('UIEditor: InputHints 加载失败，提示文案编辑器不可用', e);
      this._inputHints = null;
      this._hintActions = null;
    }
  }

  /** 保存提示文案覆盖到 config/InputHints.json */
  async _saveHintsConfig() {
    if (!this._hintActions) return;
    const file = this.configBase + 'InputHints.json';
    const content = JSON.stringify({ actions: this._hintActions }, null, 2);
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file, content })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '保存失败');
    } catch (e) {
      this._setStatus(`提示文案保存失败: ${e.message}`, true);
    }
  }

  /**
   * 三套方案下该动作的短语预览。
   * 把编辑中的文案表和手柄绑定灌进 InputHints 再强制方案取值，
   * 保证预览与游戏内实际显示完全同源。
   * @private
   */
  _previewHint(action, scheme) {
    if (!this._inputHints) return '';
    const hints = this._inputHints;
    hints.merge(this._hintActions);
    hints.setInputManager({
      gamepad: { isConnected: () => true, bindings: this._gamepadBindings }
    });
    hints.setScheme(scheme);
    const text = hints.phrase(action);
    hints.setScheme(null);
    return text;
  }

  /**
   * 取组件被锁定的宽高比（来自面板编辑器的面板尺寸）。
   * @param {Object} comp - UI 布局组件
   * @returns {number|null} 宽/高比，无约束时返回 null
   */
  _getLockedAspect(comp) {
    const panel = comp && this._panelLayouts ? this._panelLayouts[comp.id] : null;
    if (!panel || !panel.width || !panel.height) return null;
    return panel.width / panel.height;
  }

  /**
   * 把面板类组件的尺寸规范到面板编辑器定义的比例。
   * 取放大方向（面积不缩小），符合"等比时尽量最大化"。
   */
  _normalizePanelAspects() {
    for (const platform of EDITABLE_LAYOUT_PLATFORMS) {
      const layout = this.layouts[platform];
      if (!layout || !Array.isArray(layout.components)) continue;
      for (const comp of layout.components) {
        const aspect = this._getLockedAspect(comp);
        if (!aspect) continue;
        const byWidth = comp.width;
        const byHeight = Math.round(comp.height * aspect);
        const width = Math.max(byWidth, byHeight);
        comp.width = width;
        comp.height = Math.round(width / aspect);
      }
    }
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

  /** 从 JSON 文件加载已保存布局（覆盖默认值）。旧 LoginLayout.json 仅兼容为 PC 登录布局回退。 */
  async _loadFromFiles() {
    for (const platform of EDITABLE_LAYOUT_PLATFORMS) {
      const fileNames = [layoutFileName(platform)];
      if (platform === 'loginDesktop') fileNames.push('LoginLayout.json');
      for (const fileName of fileNames) {
        const file = this.configBase + fileName;
        try {
          const res = await fetch('/api/read-file?path=' + encodeURIComponent(file));
          if (!res.ok) continue;
          const data = await res.json();
          if (!data?.ok || !data.content) continue;
          const parsed = JSON.parse(data.content);
          // 合并：以文件为准，但保留默认组件中文件缺失的项
          this.layouts[platform] = this._mergeLayout(this._cloneDefault(platform), parsed);
          break;
        } catch (e) {
          console.warn('UIEditor: 加载布局失败', platform, e);
        }
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
            <button data-platform="loginDesktop">🖥️ PC UI 登录页面</button>
            <button data-platform="loginMobile">📱 Android UI 登录页面</button>
            <button data-platform="gamepad">🎮 手柄</button>
            <button data-platform="hints">💬 提示文案</button>
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
      if (this.platform === 'hints') {
        if (this._hintDefaults && confirm('恢复提示文案为默认？(未保存)')) {
          this._hintActions = JSON.parse(JSON.stringify(this._hintDefaults));
          this._render();
        }
        return;
      }
      if (this.platform === 'gamepad') {
        if (confirm('恢复手柄绑定为默认？(未保存)')) {
          this._gamepadBindings = { ...this._defaultGamepadBindings };
          this._gamepadDeadzone = 0.22;
          this._gamepadTriggerThreshold = 0.5;
          this._render();
        }
        return;
      }
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
      .uie-stage { position:relative; background:#1a2238; border:2px solid #4CAF50; box-shadow:0 0 30px rgba(0,0,0,0.6); }
      .uie-stage.login-stage { background-color:#211613; background-image:none; background-position:center; background-size:cover; background-repeat:no-repeat; }
      .uie-stage.no-bg { background-image:none !important; }
      .uie-comp { position:absolute; box-sizing:border-box; border:1.5px solid rgba(120,180,255,0.8); background:rgba(80,140,255,0.18); color:#cfe3ff; font-size:11px; display:flex; align-items:center; justify-content:center; cursor:move; user-select:none; overflow:hidden; }
      .uie-comp.zone { border-style:dashed; background:rgba(255,200,80,0.12); border-color:rgba(255,200,80,0.7); color:#ffe7a8; }
      .uie-comp.button { border-radius:50%; }
      .uie-comp.login-panel { border:1.5px dashed rgba(231,199,120,0.7); border-radius:12px; background:transparent; color:#f0d997; box-shadow:none; }
      .uie-comp.login-title { border-color:rgba(231,199,120,0.8); background:rgba(25,15,8,0.25); color:#f0d997; font-size:13px; font-weight:bold; }
      .uie-comp.login-subtitle, .uie-comp.login-description { border-color:rgba(255,255,255,0.5); background:rgba(0,0,0,0.2); color:#eee; }
      .uie-comp.login-actions { display:grid; grid-template-rows:repeat(3, 1fr); gap:10px; padding:0; border:0; background:transparent; overflow:visible; }
      .uie-login-preview-action { display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.18); border-radius:6px; background:#4b6728; color:#fff; font-size:12px; pointer-events:none; }
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
    if (this.platform === 'hints') {
      this._renderHintsEditor();
      return;
    }
    if (this.platform === 'gamepad') {
      this._renderGamepadEditor();
      return;
    }
    const layout = this.layouts[this.platform];
    const stage = this.container.querySelector('#uie-stage');
    if (!stage) return;
    const isLoginPreview = LOGIN_LAYOUT_PLATFORMS.has(this.platform);
    stage.classList.toggle('login-stage', isLoginPreview);
    stage.classList.toggle('no-bg', this.platform === 'gamepad' || this.platform === 'hints');
    const safeLoginBackground = isLoginPreview
      ? this._loginBackgroundImage.replace(/["'()]/g, '')
      : '';
    stage.style.backgroundImage = safeLoginBackground ? `url("${safeLoginBackground}")` : '';

    // 计算预览缩放（适配舞台容器宽度）
    const wrap = this.container.querySelector('.uie-stage-wrap');
    // 布局画布需要居中展示
    if (wrap) wrap.style.alignItems = 'center';
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
      } else if (LOGIN_LAYOUT_PLATFORMS.has(this.platform) && comp.kind === 'login-actions') {
        el.textContent = '';
        for (const label of ['开始游戏', '读取存档', '退出游戏']) {
          const action = document.createElement('span');
          action.className = 'uie-login-preview-action';
          action.textContent = label;
          el.appendChild(action);
        }
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
      const aspect = this._getLockedAspect(ds.comp);
      if (aspect) {
        // 面板只允许等比缩放：取水平/垂直中更大的推进量，既跟手又保持比例
        const scale = Math.max((ds.startW + dx) / ds.startW, (ds.startH + dy) / ds.startH);
        const width = Math.max(16, Math.round(ds.startW * scale));
        ds.comp.width = width;
        ds.comp.height = Math.max(16, Math.round(width / aspect));
      } else {
        ds.comp.width = Math.max(16, Math.round(ds.startW + dx));
        ds.comp.height = Math.max(16, Math.round(ds.startH + dy));
      }
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
      ${this._getLockedAspect(comp)
        ? '<div class="uie-prop-empty" style="margin-top:6px">比例由面板编辑器维护，仅支持等比缩放（改宽或高会自动联动）。</div>'
        : ''}
      <div class="uie-prop-empty" style="margin-top:10px">画布: ${layout.canvas.width}×${layout.canvas.height}</div>
    `;
    props.querySelectorAll('input[data-k]').forEach(input => {
      input.addEventListener('input', () => {
        const k = input.dataset.k;
        const v = parseInt(input.value, 10);
        if (isNaN(v)) return;
        const aspect = this._getLockedAspect(comp);
        if (aspect && k === 'width') {
          comp.width = v;
          comp.height = Math.max(16, Math.round(v / aspect));
        } else if (aspect && k === 'height') {
          comp.height = v;
          comp.width = Math.max(16, Math.round(v * aspect));
        } else {
          comp[k] = v;
        }
        this._render();
      });
    });
  }

  _setStatus(msg, isError) {
    const el = this.container.querySelector('#uie-status');
    if (el) { el.textContent = msg; el.style.color = isError ? '#ff8888' : '#8aa'; }
  }

  /** 保存 PC、Android 游戏 UI 与两套登录页面布局到 JSON 文件（坐标转为百分比，自适配分辨率） */
  async save() {
    // 手柄绑定保存到独立文件
    await this._saveGamepadConfig();
    // 操作提示文案保存到独立文件
    await this._saveHintsConfig();

    for (const platform of EDITABLE_LAYOUT_PLATFORMS) {
      const fileName = layoutFileName(platform);
      const file = this.configBase + fileName;
      const layout = this.layouts[platform];
      const cw = layout.canvas.width;
      const ch = layout.canvas.height;
      // 输出：每个组件附带百分比坐标(0~1)，游戏端按实际屏幕尺寸还原
      const out = {
        ...(LOGIN_LAYOUT_PLATFORMS.has(platform) ? { version: 1 } : {}),
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
    this._setStatus(`✅ 已保存布局、手柄绑定和提示文案到 ${this.configBase}`);
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

  // ═══════════════════════════════════════════════════════════════════
  // 手柄绑定编辑器
  // ═══════════════════════════════════════════════════════════════════

  /** 加载手柄绑定配置（从 config/gamepad.json）和 Xbox360Profile 元数据 */
  async _loadGamepadConfig() {
    // 动态 import Xbox360Profile（编辑器不在 src 下，用相对路径）
    try {
      const mod = await import('../src/core/input/Xbox360Profile.js');
      this._gamepadMeta = {
        PadButton: mod.PadButton,
        PAD_BUTTON_LABELS: mod.PAD_BUTTON_LABELS,
        BINDABLE_ACTIONS: mod.BINDABLE_ACTIONS,
        ACTION_LABELS: mod.ACTION_LABELS,
        DEFAULT_BINDINGS: mod.DEFAULT_BINDINGS,
        ATTACK_ACTION: mod.ATTACK_ACTION,
        NONE_ACTION: mod.NONE_ACTION,
        BINDING_DESCRIPTIONS: mod.BINDING_DESCRIPTIONS
      };
      this._defaultGamepadBindings = { ...mod.DEFAULT_BINDINGS };
      this._gamepadBindings = { ...mod.DEFAULT_BINDINGS };
    } catch (e) {
      console.warn('UIEditor: 无法加载 Xbox360Profile，手柄编辑器不可用', e);
      return;
    }

    // 尝试加载已保存的配置
    const file = this.configBase + 'gamepad.json';
    try {
      const res = await fetch('/api/read-file?path=' + encodeURIComponent(file));
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.content) {
          const cfg = JSON.parse(data.content);
          if (cfg.bindings) {
            for (const [k, v] of Object.entries(cfg.bindings)) {
              this._gamepadBindings[Number(k)] = v;
            }
          }
          if (cfg.deadzone != null) this._gamepadDeadzone = cfg.deadzone;
          if (cfg.triggerThreshold != null) this._gamepadTriggerThreshold = cfg.triggerThreshold;
        }
      }
    } catch (e) {
      // 无配置文件，用默认绑定
    }
  }

  /** 保存手柄绑定配置到 config/gamepad.json */
  async _saveGamepadConfig() {
    if (!this._gamepadMeta) return;
    const file = this.configBase + 'gamepad.json';
    const cfg = {
      bindings: this._gamepadBindings,
      deadzone: this._gamepadDeadzone,
      triggerThreshold: this._gamepadTriggerThreshold
    };
    const content = JSON.stringify(cfg, null, 2);
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file, content })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '保存失败');
    } catch (e) {
      this._setStatus(`手柄配置保存失败: ${e.message}`, true);
    }
  }

  /** 渲染操作提示文案编辑界面（pc / android / gamepad 三套） */
  _renderHintsEditor() {
    const stage = this.container.querySelector('#uie-stage');
    const props = this.container.querySelector('#uie-props');
    if (!stage || !props) return;

    // 文案表格很长，取消垂直居中避免内容被裁切到容器外
    const wrap = this.container.querySelector('.uie-stage-wrap');
    if (wrap) wrap.style.alignItems = 'flex-start';

    if (!this._hintActions) {
      stage.innerHTML = '<div style="padding:40px;color:#ff8888;text-align:center;">InputHints 加载失败，提示文案编辑器不可用</div>';
      props.innerHTML = '';
      return;
    }

    stage.style.width = '980px';
    stage.style.height = 'auto';
    stage.style.minHeight = '400px';
    stage.style.overflow = 'auto';
    stage.style.padding = '12px 20px 20px';
    stage.style.display = 'block';

    // 手柄列用绑定动作下拉：文案跟随绑定，不写死按钮名
    const bindable = (this._gamepadMeta && this._gamepadMeta.BINDABLE_ACTIONS) || [];

    let html = `
      <h3 style="color:#8fc7ff;margin:0 0 16px">操作提示文案（三套输入方案）</h3>
      <p style="color:#778;font-size:12px;margin-bottom:16px;">
        游戏里的提示、教程、按钮角标都从这里取文案。写一份模板如
        <code style="color:#8fc">{bag}打开背包</code>，运行时按玩家当前设备替换。
        手柄列选的是"绑定动作"，实际按钮名由手柄绑定表反查，改绑定后提示自动跟着变。
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:2.2;">
        <thead>
          <tr style="border-bottom:1px solid #2a3a5e;">
            <th style="text-align:left;padding:10px 8px;color:#4CAF50;width:110px;">动作</th>
            <th style="text-align:left;padding:10px 8px;color:#4CAF50;width:120px;">PC 按键</th>
            <th style="text-align:left;padding:10px 8px;color:#4CAF50;width:90px;">PC 句式</th>
            <th style="text-align:left;padding:10px 8px;color:#4CAF50;width:130px;">Android 控件</th>
            <th style="text-align:left;padding:10px 8px;color:#4CAF50;width:150px;">手柄绑定动作</th>
            <th style="text-align:left;padding:10px 8px;color:#4CAF50;">预览（键鼠 / 触屏 / 手柄）</th>
          </tr>
        </thead>
        <tbody>
    `;

    const inputStyle = 'width:100%;background:#0a1020;color:#fff;border:1px solid #2a3a5e;padding:6px 8px;border-radius:3px;font-size:12px;';

    for (const [action, def] of Object.entries(this._hintActions)) {
      const pcKey = (def.pc && def.pc.key) || '';
      const pcKind = (def.pc && def.pc.kind) || 'key';
      const android = def.android || '';
      const padKey = def.padKey || '';
      const padFixed = def.padFixed || '';

      let padCell;
      if (padFixed) {
        // 摇杆等固定部件不参与绑定反查
        padCell = `<span style="color:#8aa;">固定：${padFixed}</span>`;
      } else {
        let options = `<option value="">（未绑定）</option>`;
        for (const a of bindable) {
          if (!a.value) continue;
          const sel = a.value === padKey ? 'selected' : '';
          options += `<option value="${a.value}" ${sel}>${a.label}（${a.value}）</option>`;
        }
        padCell = `<select data-hint-pad="${action}" style="${inputStyle}">${options}</select>`;
      }

      const preview = [
        this._previewHint(action, 'pc'),
        this._previewHint(action, 'android'),
        this._previewHint(action, 'gamepad')
      ].join(' / ');

      html += `
        <tr style="border-bottom:1px solid #1a2540;">
          <td style="padding:10px 8px;font-weight:bold;color:#cfe3ff;">${action}</td>
          <td style="padding:10px 8px;">
            <input type="text" data-hint-pckey="${action}" value="${pcKey}" style="${inputStyle}">
          </td>
          <td style="padding:10px 8px;">
            <select data-hint-pckind="${action}" style="${inputStyle}">
              <option value="key" ${pcKind === 'key' ? 'selected' : ''}>按X键</option>
              <option value="raw" ${pcKind === 'raw' ? 'selected' : ''}>点击X</option>
            </select>
          </td>
          <td style="padding:10px 8px;">
            <input type="text" data-hint-android="${action}" value="${android}" style="${inputStyle}">
          </td>
          <td style="padding:10px 8px;">${padCell}</td>
          <td style="padding:10px 8px;color:#9fb;">${preview}</td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    stage.innerHTML = html;

    const onEdit = () => {
      this._renderHintsEditor();
      this._setStatus('提示文案已修改，记得点「💾 保存到文件」');
    };

    stage.querySelectorAll('input[data-hint-pckey]').forEach(el => {
      el.addEventListener('change', () => {
        const action = el.dataset.hintPckey;
        this._hintActions[action].pc = { ...(this._hintActions[action].pc || {}), key: el.value };
        onEdit();
      });
    });
    stage.querySelectorAll('select[data-hint-pckind]').forEach(el => {
      el.addEventListener('change', () => {
        const action = el.dataset.hintPckind;
        this._hintActions[action].pc = { ...(this._hintActions[action].pc || {}), kind: el.value };
        onEdit();
      });
    });
    stage.querySelectorAll('input[data-hint-android]').forEach(el => {
      el.addEventListener('change', () => {
        this._hintActions[el.dataset.hintAndroid].android = el.value;
        onEdit();
      });
    });
    stage.querySelectorAll('select[data-hint-pad]').forEach(el => {
      el.addEventListener('change', () => {
        this._hintActions[el.dataset.hintPad].padKey = el.value;
        onEdit();
      });
    });

    props.innerHTML = `
      <h4>提示文案</h4>
      <div class="uie-prop-empty" style="line-height:1.7">
        占位符两种写法：<br>
        <code style="color:#8fc">{bag}</code> → 完整短语（含按/点击）<br>
        <code style="color:#8fc">{key:bag}</code> → 只要按键名<br><br>
        Android 控件名若本身带动作词（如"点击地面"），不会再叠加"点击"。<br><br>
        保存位置：<br><code style="color:#8aa">${this.configBase}InputHints.json</code>
      </div>
    `;
  }

  /** 渲染手柄绑定编辑界面 */
  _renderGamepadEditor() {
    const stage = this.container.querySelector('#uie-stage');
    const props = this.container.querySelector('#uie-props');
    if (!stage || !props) return;

    // 表格长列表，取消垂直居中
    const wrap = this.container.querySelector('.uie-stage-wrap');
    if (wrap) wrap.style.alignItems = 'flex-start';

    if (!this._gamepadMeta) {
      stage.innerHTML = '<div style="padding:40px;color:#ff8888;text-align:center;">Xbox360Profile 加载失败，手柄编辑器不可用</div>';
      props.innerHTML = '';
      return;
    }

    const { PadButton, PAD_BUTTON_LABELS, BINDABLE_ACTIONS, ACTION_LABELS, ATTACK_ACTION, NONE_ACTION } = this._gamepadMeta;

    // 舞台：手柄按键绑定列表（表格形式，每行一个按钮 + 下拉选择动作）
    stage.style.width = '600px';
    stage.style.height = 'auto';
    stage.style.minHeight = '400px';
    stage.style.overflow = 'auto';
    stage.style.padding = '20px';
    stage.style.display = 'block';

    const buttonIndices = Object.keys(PadButton).map(k => PadButton[k]).filter(v => typeof v === 'number');

    let html = `
      <h3 style="color:#8fc7ff;margin:0 0 16px">Xbox 360 手柄按键绑定</h3>
      <p style="color:#778;font-size:12px;margin-bottom:16px;">为每个手柄按钮选择对应的游戏动作。左摇杆固定为移动、右摇杆固定为瞄准，不可更改。</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #2a3a5e;">
            <th style="text-align:left;padding:8px;color:#4CAF50;width:100px;">按钮</th>
            <th style="text-align:left;padding:8px;color:#4CAF50;">绑定动作</th>
            <th style="text-align:left;padding:8px;color:#4CAF50;width:100px;">默认</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const idx of buttonIndices) {
      if (idx === PadButton.GUIDE) continue; // Guide 键大多驱动不上报，不让用户绑
      const btnLabel = PAD_BUTTON_LABELS[idx] || `按钮${idx}`;
      const currentAction = this._gamepadBindings[idx] != null ? this._gamepadBindings[idx] : NONE_ACTION;
      const defaultAction = this._defaultGamepadBindings[idx] != null ? this._defaultGamepadBindings[idx] : NONE_ACTION;
      const defaultLabel = ACTION_LABELS[defaultAction] || (defaultAction === ATTACK_ACTION ? '攻击' : '—');

      // 按分组渲染 options
      const groups = {};
      for (const a of BINDABLE_ACTIONS) {
        if (!groups[a.group]) groups[a.group] = [];
        groups[a.group].push(a);
      }

      let options = '';
      for (const [groupName, actions] of Object.entries(groups)) {
        options += `<optgroup label="${groupName}">`;
        for (const a of actions) {
          const sel = a.value === currentAction ? 'selected' : '';
          options += `<option value="${a.value}" ${sel}>${a.label}</option>`;
        }
        options += '</optgroup>';
      }

      const isDefault = currentAction === defaultAction;
      const rowColor = isDefault ? '' : 'background:rgba(76,175,80,0.08);';

      html += `
        <tr style="border-bottom:1px solid #1a2540;${rowColor}">
          <td style="padding:6px 8px;font-weight:bold;color:#cfe3ff;">${btnLabel}</td>
          <td style="padding:6px 8px;">
            <select data-btn="${idx}" style="width:100%;background:#0a1020;color:#fff;border:1px solid #2a3a5e;padding:5px;border-radius:3px;">
              ${options}
            </select>
          </td>
          <td style="padding:6px 8px;color:#556;font-size:11px;">${defaultLabel}</td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    stage.innerHTML = html;

    // 绑定下拉事件
    stage.querySelectorAll('select[data-btn]').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.btn);
        this._gamepadBindings[idx] = sel.value;
        this._setStatus('已修改（未保存）');
      });
    });

    // 右侧属性面板：死区 + 扳机阈值
    props.innerHTML = `
      <h4 style="color:#4CAF50;">手柄参数</h4>
      <div class="uie-prop-row">
        <label style="width:80px;">摇杆死区</label>
        <input type="number" id="gp-deadzone" value="${this._gamepadDeadzone}" step="0.01" min="0" max="0.5" style="width:70px;background:#0a1020;border:1px solid #2a3a5e;color:#fff;padding:5px;border-radius:3px;">
      </div>
      <div class="uie-prop-empty" style="margin-bottom:8px;font-size:11px;">推荐 0.15~0.3，越大松手回归越灵敏</div>
      <div class="uie-prop-row">
        <label style="width:80px;">扳机阈值</label>
        <input type="number" id="gp-trigger" value="${this._gamepadTriggerThreshold}" step="0.05" min="0.1" max="0.9" style="width:70px;background:#0a1020;border:1px solid #2a3a5e;color:#fff;padding:5px;border-radius:3px;">
      </div>
      <div class="uie-prop-empty" style="margin-bottom:16px;font-size:11px;">LT/RT 超过此值视为按下</div>
      <div style="border-top:1px solid #2a3a5e;padding-top:12px;margin-top:12px;">
        <h4 style="color:#778;font-size:12px;">固定映射（不可更改）</h4>
        <p style="color:#556;font-size:11px;line-height:1.6;">
          左摇杆 → 移动（模拟量）<br>
          右摇杆 → 瞄准准星<br>
          十字键 → 方向移动（数字）
        </p>
      </div>
    `;

    const dzInput = props.querySelector('#gp-deadzone');
    const tgInput = props.querySelector('#gp-trigger');
    if (dzInput) dzInput.addEventListener('input', () => {
      const v = parseFloat(dzInput.value);
      if (!isNaN(v) && v >= 0 && v <= 0.5) this._gamepadDeadzone = v;
    });
    if (tgInput) tgInput.addEventListener('input', () => {
      const v = parseFloat(tgInput.value);
      if (!isNaN(v) && v >= 0.1 && v <= 0.9) this._gamepadTriggerThreshold = v;
    });
  }
}
export default UIEditor;
