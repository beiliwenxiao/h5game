/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-16
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * DebugPanel - 游戏调试面板（左上角浮层）
 *
 * 显示：帧率、玩家属性、敌人波次、敌人情况、当前事件、地图位置
 * 操作：上一事件、下一事件、执行事件、跳过事件、跳转到指定幕
 *
 * 通过触发器动作 `toggleDebug` 启用/停用。
 * DOM 渲染，不走 Canvas，始终覆盖在游戏上层。
 */
export class DebugPanel {
  /**
   * @param {Object} opts
   * @param {Function} [opts.getScene] - 返回当前活动场景
   * @param {Function} [opts.getSceneManager] - 返回 sceneManager
   */
  constructor(opts = {}) {
    this.getScene = opts.getScene || (() => null);
    this.getSceneManager = opts.getSceneManager || (() => null);
    this.visible = false;
    this._el = null;
    this._rafId = null;
    this._fps = 0;
    this._frames = 0;
    this._lastFpsTime = performance.now();
  }

  /** 切换显示/隐藏 */
  toggle() {
    this.visible = !this.visible;
    if (this.visible) {
      this._create();
      this._startLoop();
    } else {
      this._destroy();
    }
  }

  /** 显示 */
  show() {
    if (!this.visible) this.toggle();
  }

  /** 隐藏 */
  hide() {
    if (this.visible) this.toggle();
  }

  /** 创建 DOM */
  _create() {
    if (this._el) return;
    const el = document.createElement('div');
    el.id = 'debug-panel';
    el.innerHTML = `
      <div class="dp-header">
        <span>🐞 调试面板</span>
        <button class="dp-close" title="关闭">✕</button>
      </div>
      <div class="dp-body">
        <div class="dp-section">
          <div class="dp-row"><span>FPS:</span><span id="dp-fps">--</span></div>
          <div class="dp-row"><span>位置:</span><span id="dp-pos">--</span></div>
          <div class="dp-row"><span>当前幕:</span><span id="dp-act">--</span></div>
        </div>
        <div class="dp-section">
          <div class="dp-title">玩家属性</div>
          <div id="dp-player">--</div>
        </div>
        <div class="dp-section">
          <div class="dp-title">敌人情况</div>
          <div id="dp-enemies">--</div>
        </div>
        <div class="dp-section">
          <div class="dp-title">触发器事件</div>
          <div id="dp-triggers">--</div>
        </div>
        <div class="dp-section dp-actions">
          <div class="dp-title">操作</div>
          <div class="dp-btn-row">
            <button id="dp-prev-event">◀ 上一事件</button>
            <button id="dp-next-event">下一事件 ▶</button>
          </div>
          <div class="dp-btn-row">
            <button id="dp-fire-event">⚡ 执行事件</button>
            <button id="dp-skip-event">⏭ 跳过事件</button>
          </div>
          <div class="dp-btn-row">
            <select id="dp-goto-act">
              <option value="">跳转到...</option>
              <option value="Act1Scene">第一幕</option>
              <option value="Act2Scene">第二幕</option>
              <option value="Act3Scene">第三幕</option>
              <option value="Act4Scene">第四幕</option>
              <option value="Act5Scene">第五幕</option>
              <option value="Act6Scene">第六幕</option>
            </select>
            <button id="dp-goto-btn">跳转</button>
          </div>
        </div>
      </div>
    `;
    this._injectStyles();
    document.body.appendChild(el);
    this._el = el;
    this._bindEvents();
  }

  /** 注入样式 */
  _injectStyles() {
    if (document.getElementById('dp-styles')) return;
    const s = document.createElement('style');
    s.id = 'dp-styles';
    s.textContent = `
      #debug-panel { position:fixed; top:10px; left:10px; width:280px; max-height:90vh; overflow-y:auto;
        background:rgba(0,0,0,0.88); color:#ddd; font:12px/1.5 monospace; border:1px solid #4CAF50;
        border-radius:6px; z-index:99999; user-select:text; }
      #debug-panel .dp-header { display:flex; justify-content:space-between; align-items:center;
        padding:6px 10px; background:#1a3a1a; border-bottom:1px solid #4CAF50; font-weight:bold; color:#4CAF50; }
      #debug-panel .dp-close { background:none; border:none; color:#f88; cursor:pointer; font-size:14px; }
      #debug-panel .dp-body { padding:8px 10px; }
      #debug-panel .dp-section { margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #333; }
      #debug-panel .dp-title { color:#8cf; font-weight:bold; margin-bottom:4px; }
      #debug-panel .dp-row { display:flex; justify-content:space-between; margin-bottom:2px; }
      #debug-panel .dp-row span:first-child { color:#999; }
      #debug-panel .dp-row span:last-child { color:#fff; }
      #debug-panel .dp-actions button, #debug-panel .dp-actions select {
        padding:4px 8px; background:#2a3a2a; border:1px solid #4CAF50; color:#fff;
        border-radius:3px; cursor:pointer; font-size:11px; }
      #debug-panel .dp-actions button:hover { background:#3a5a3a; }
      #debug-panel .dp-btn-row { display:flex; gap:4px; margin-bottom:4px; flex-wrap:wrap; }
      #debug-panel .dp-actions select { flex:1; min-width:0; }
    `;
    document.head.appendChild(s);
  }

  /** 绑定按钮事件 */
  _bindEvents() {
    const el = this._el;
    el.querySelector('.dp-close').addEventListener('click', () => this.toggle());
    el.querySelector('#dp-prev-event').addEventListener('click', () => this._prevEvent());
    el.querySelector('#dp-next-event').addEventListener('click', () => this._nextEvent());
    el.querySelector('#dp-fire-event').addEventListener('click', () => this._fireEvent());
    el.querySelector('#dp-skip-event').addEventListener('click', () => this._skipEvent());
    el.querySelector('#dp-goto-btn').addEventListener('click', () => this._gotoAct());
  }

  /** 销毁 DOM */
  _destroy() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._el) { this._el.remove(); this._el = null; }
  }

  /** 启动刷新循环 */
  _startLoop() {
    const tick = () => {
      if (!this.visible) return;
      this._updateFps();
      this._updateInfo();
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _updateFps() {
    this._frames++;
    const now = performance.now();
    if (now - this._lastFpsTime >= 1000) {
      this._fps = this._frames;
      this._frames = 0;
      this._lastFpsTime = now;
    }
  }

  /** 刷新信息显示 */
  _updateInfo() {
    if (!this._el) return;
    const scene = this.getScene();
    if (!scene) return;

    // FPS
    this._el.querySelector('#dp-fps').textContent = this._fps;

    // 位置
    const player = scene.playerEntity;
    if (player) {
      const t = player.getComponent('transform');
      if (t) {
        this._el.querySelector('#dp-pos').textContent = `${Math.round(t.position.x)}, ${Math.round(t.position.y)}`;
      }
    }

    // 当前幕
    const actNum = scene.actNumber || '?';
    const title = scene.sceneData?.title || scene.title || '';
    this._el.querySelector('#dp-act').textContent = `${actNum} ${title}`;

    // 玩家属性
    if (player) {
      const stats = player.getComponent('stats');
      if (stats) {
        this._el.querySelector('#dp-player').innerHTML =
          `HP: ${Math.round(stats.hp)}/${stats.maxHp}<br>` +
          `MP: ${Math.round(stats.mp)}/${stats.maxMp}<br>` +
          `攻: ${stats.attack} 防: ${stats.defense} 速: ${stats.speed}<br>` +
          `等级: ${stats.level}`;
      }
    }

    // 敌人情况
    const enemies = (scene.entities || []).filter(e => e !== player && !e.isDead);
    const enemyCount = enemies.length;
    this._el.querySelector('#dp-enemies').textContent = `存活: ${enemyCount}`;

    // 触发器事件
    const gl = scene.gameLoader;
    if (gl && gl.triggerSystem) {
      const triggers = gl.triggerSystem.triggers || [];
      const firedOnce = gl.triggerSystem._firedOnce;
      const pending = triggers.filter(t => t.enabled !== false && !(t.once && firedOnce.has(t.id)));
      const lastFired = gl.triggerSystem._lastFiredId || '--';
      this._el.querySelector('#dp-triggers').innerHTML =
        `总计: ${triggers.length} | 待触发: ${pending.length}<br>` +
        `最近触发: ${lastFired}`;
    }
  }

  // ─── 操作 ─────────────────────────────

  _getTriggersInfo() {
    const scene = this.getScene();
    if (!scene || !scene.gameLoader || !scene.gameLoader.triggerSystem) return null;
    return scene.gameLoader.triggerSystem;
  }

  _prevEvent() {
    const trig = this._getTriggersInfo();
    if (!trig) return;
    const pending = trig.triggers.filter(t => t.enabled !== false && !(t.once && trig._firedOnce.has(t.id)));
    if (pending.length > 0) {
      this._selectedEventIndex = Math.max(0, (this._selectedEventIndex || 0) - 1);
      const t = pending[this._selectedEventIndex];
      if (t) this._el.querySelector('#dp-triggers').innerHTML += `<br>→ ${t.id}`;
    }
  }

  _nextEvent() {
    const trig = this._getTriggersInfo();
    if (!trig) return;
    const pending = trig.triggers.filter(t => t.enabled !== false && !(t.once && trig._firedOnce.has(t.id)));
    if (pending.length > 0) {
      this._selectedEventIndex = Math.min(pending.length - 1, (this._selectedEventIndex || 0) + 1);
      const t = pending[this._selectedEventIndex];
      if (t) this._el.querySelector('#dp-triggers').innerHTML += `<br>→ ${t.id}`;
    }
  }

  _fireEvent() {
    const trig = this._getTriggersInfo();
    if (!trig) return;
    const pending = trig.triggers.filter(t => t.enabled !== false && !(t.once && trig._firedOnce.has(t.id)));
    const idx = this._selectedEventIndex || 0;
    const t = pending[idx];
    if (t && t.when) {
      trig.fire(t.when.type, t.when.params || {});
    }
  }

  _skipEvent() {
    const trig = this._getTriggersInfo();
    if (!trig) return;
    const pending = trig.triggers.filter(t => t.enabled !== false && !(t.once && trig._firedOnce.has(t.id)));
    const idx = this._selectedEventIndex || 0;
    const t = pending[idx];
    if (t && t.once) {
      trig._firedOnce.add(t.id); // 标记为已触发，等于跳过
    }
  }

  _gotoAct() {
    const select = this._el.querySelector('#dp-goto-act');
    const sceneId = select.value;
    if (!sceneId) return;
    const sm = this.getSceneManager();
    if (sm) {
      sm.switchTo(sceneId);
    }
  }
}

export default DebugPanel;
