/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-16
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
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
    const before = {
      visible: this.visible,
      hasElement: !!this._el,
      isConnected: this._el?.isConnected || false,
      domCount: typeof document !== 'undefined' ? document.querySelectorAll('#debug-panel').length : 0
    };
    console.log('[DebugPanel] toggle 开始', before);

    this.visible = !this.visible;
    if (this.visible) {
      this._create();
      this._startLoop();
    } else {
      this._destroy();
    }

    const domElement = typeof document !== 'undefined' ? document.getElementById('debug-panel') : null;
    let computedStyle = null;
    let bounds = null;
    if (domElement && typeof window !== 'undefined') {
      const style = window.getComputedStyle(domElement);
      computedStyle = {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        zIndex: style.zIndex
      };
      const rect = domElement.getBoundingClientRect();
      bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    console.log('[DebugPanel] toggle 完成', {
      visible: this.visible,
      hasElement: !!this._el,
      isConnected: this._el?.isConnected || false,
      bodyExists: typeof document !== 'undefined' && !!document.body,
      domCount: typeof document !== 'undefined' ? document.querySelectorAll('#debug-panel').length : 0,
      computedStyle,
      bounds,
      rafActive: this._rafId !== null
    });
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
          <div class="dp-row"><span>Draw/帧:</span><span id="dp-drawcalls">--</span></div>
          <div class="dp-row"><span>纹理内存:</span><span id="dp-texmem">--</span></div>
          <div class="dp-row"><span>当前幕:</span><span id="dp-act">--</span></div>
          <div class="dp-row"><span>教程阶段:</span><span id="dp-phase">--</span></div>
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
        <div class="dp-section">
          <div class="dp-title">天气</div>
          <div id="dp-weather">--</div>
        </div>
        <div class="dp-section">
          <div class="dp-title">时间</div>
          <div id="dp-time">--</div>
        </div>
        <div class="dp-section dp-actions">
          <div class="dp-title">调试显示</div>
          <label class="dp-check-row">
            <input type="checkbox" id="dp-show-collision" ${this.getScene()?.debugShowCollisionPolygons ? 'checked' : ''}>
            显示地形碰撞多边形（70%）
          </label>
        </div>
        <div class="dp-section dp-actions">
          <div class="dp-title">天气控制</div>
          <div class="dp-btn-row">
            <select id="dp-weather-select">
              <option value="clear">晴天</option>
              <option value="breeze">微风</option>
              <option value="wind">大风</option>
              <option value="lightRain">小雨</option>
              <option value="heavyRain">大雨</option>
              <option value="lightFog">小雾</option>
              <option value="heavyFog">大雾</option>
              <option value="storm">雷暴</option>
            </select>
            <button id="dp-weather-apply">应用</button>
          </div>
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
        display:block; pointer-events:auto; background:rgba(0,0,0,0.88); color:#ddd; font:12px/1.5 monospace; border:1px solid #4CAF50;
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
      #debug-panel .dp-check-row { display:flex; align-items:center; gap:7px; color:#fff; cursor:pointer; }
      #debug-panel .dp-check-row input { margin:0; accent-color:#ff9800; cursor:pointer; }
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
    el.querySelector('#dp-show-collision').addEventListener('change', (event) => {
      const scene = this.getScene();
      if (!scene) return;
      scene.debugShowCollisionPolygons = event.target.checked;
      console.log('[DebugPanel] 地形碰撞多边形显示:', event.target.checked ? '开启' : '关闭');
    });
    el.querySelector('#dp-weather-apply').addEventListener('click', () => {
      const scene = this.getScene();
      if (!scene || !scene.weatherSystem) return;
      const type = el.querySelector('#dp-weather-select').value;
      scene.weatherSystem.setWeather(type);
      console.log('[DebugPanel] 天气切换:', type);
    });

    // 动态加载场景列表到跳转下拉
    this._loadSceneList();
  }

  /** 从 _scene_order.json 动态加载场景列表 */
  async _loadSceneList() {
    const select = this._el && this._el.querySelector('#dp-goto-act');
    if (!select) return;
    try {
      // 尝试 fetch 场景列表文件
      const res = await fetch('assets/scenes/_scene_order.json');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      if (data && data.order && data.scenes) {
        for (const id of data.order) {
          const info = data.scenes[id];
          if (!info) continue;
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = info.name || id;
          select.appendChild(opt);
        }
        return;
      }
    } catch (e) { /* fallback */ }

    // 回退：从 game.project.json 的 worldMap grid 中提取
    try {
      const res = await fetch('game.project.json');
      if (!res.ok) return;
      const project = await res.json();
      if (project && project.worldMap && project.worldMap.regions) {
        const seen = new Set();
        for (const region of project.worldMap.regions) {
          if (!region.grid) continue;
          for (const row of region.grid) {
            if (!row) continue;
            for (const sceneId of row) {
              if (sceneId && !seen.has(sceneId)) {
                seen.add(sceneId);
                const opt = document.createElement('option');
                opt.value = sceneId;
                opt.textContent = sceneId;
                select.appendChild(opt);
              }
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
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

    // 使用主游戏循环桥接的真实 FPS；桥接尚未就绪时回退到面板刷新率
    const gameLoopFps = Number.isFinite(scene.gameLoopFps) ? scene.gameLoopFps : this._fps;
    this._el.querySelector('#dp-fps').textContent = gameLoopFps;

    // Draw call / 纹理内存
    const pm = scene.performanceMonitor;
    if (pm && pm.metrics) {
      this._el.querySelector('#dp-drawcalls').textContent = pm.metrics.drawCallsPerFrame || 0;
      this._el.querySelector('#dp-texmem').textContent = pm._formatBytes
        ? pm._formatBytes(pm.metrics.textureMemory)
        : (pm.metrics.textureMemory ? (pm.metrics.textureMemory / 1048576).toFixed(1) + ' MB' : '0 B');
    }

    // 位置
    const player = scene.playerEntity;
    const transform = player?.getComponent('transform');
    this._el.querySelector('#dp-pos').textContent = transform
      ? `${Math.floor(transform.position.x)}, ${Math.floor(transform.position.y)}`
      : '--';

    // 当前幕与旧面板的教程阶段
    const actNum = scene.actNumber || '?';
    const title = scene.sceneData?.title || scene.title || '';
    this._el.querySelector('#dp-act').textContent = `${actNum} ${title}`;
    this._el.querySelector('#dp-phase').textContent = scene.tutorialPhase || '-';

    // 玩家属性
    const stats = player?.getComponent('stats');
    if (stats) {
      this._el.querySelector('#dp-player').innerHTML =
        `HP: ${Math.floor(stats.hp)}/${stats.maxHp}<br>` +
        `MP: ${Math.floor(stats.mp)}/${stats.maxMp}<br>` +
        `攻: ${stats.attack} 防: ${stats.defense} 速: ${stats.speed}<br>` +
        `等级: ${stats.level}`;
    } else {
      this._el.querySelector('#dp-player').textContent = '--';
    }

    // 与旧面板一致：仅统计 enemyEntities 中 HP 大于 0 的敌人
    const enemyEntities = Array.isArray(scene.enemyEntities) ? scene.enemyEntities : [];
    const aliveEnemies = enemyEntities.filter(enemy => {
      const enemyStats = enemy?.getComponent?.('stats');
      return enemyStats && enemyStats.hp > 0;
    });
    this._el.querySelector('#dp-enemies').textContent =
      `存活: ${aliveEnemies.length} / 总数: ${enemyEntities.length}`;

    // 场景状态可能由外部代码改变，保持复选框显示同步
    const collisionToggle = this._el.querySelector('#dp-show-collision');
    if (collisionToggle) collisionToggle.checked = scene.debugShowCollisionPolygons === true;

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

    // 天气系统
    const ws = scene.weatherSystem;
    if (ws) {
      const fogAdd = ws.getFogAdd().toFixed(2);
      this._el.querySelector('#dp-weather').innerHTML =
        `当前: ${ws.currentWeather}` +
        (ws.currentWeather !== ws.targetWeather ? ` → ${ws.targetWeather}` : '') +
        `<br>雾叠加: ${fogAdd}`;
      // 同步下拉框
      const sel = this._el.querySelector('#dp-weather-select');
      if (sel && sel.value !== ws.targetWeather) sel.value = ws.targetWeather;
    } else {
      this._el.querySelector('#dp-weather').textContent = '未加载';
    }

    // 时间系统
    const ts = scene.timeSystem;
    if (ts && ts.enabled) {
      const period = ts.getCurrentPeriod();
      const progress = (ts.getProgress() * 100).toFixed(0);
      const brightness = ts.getBrightness().toFixed(2);
      const fogOp = ts.getFogOpacity().toFixed(2);
      this._el.querySelector('#dp-time').innerHTML =
        `${period} (${progress}%)<br>` +
        `明暗: ${brightness} | 雾: ${fogOp}`;
    } else {
      this._el.querySelector('#dp-time').textContent = ts ? '已禁用' : '未加载';
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

    // 优先大地图内传送（当前场景支持 teleportToChunk 时）
    const scene = this.getScene();
    if (scene && scene.teleportToChunk) {
      scene.teleportToChunk({ scene: sceneId, transition: 'fadeBlack' });
      select.value = '';
      return;
    }

    // 回退：SceneManager 切换
    const sm = this.getSceneManager();
    if (sm) {
      sm.switchTo(sceneId);
    }
    select.value = '';
  }
}

export default DebugPanel;
