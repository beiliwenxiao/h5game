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
 * DataDrivenPrologueScene - 数据驱动序章场景（P4-5 逐幕迁移落点）
 *
 * 继承 BaseGameScene（通用可玩管线），并【迁移】Act1 中的通用地形/火堆代码
 * （相机限制、盆地/水池/树/多边形碰撞、火堆渲染+火焰粒子），
 * 不继承 Act1 的脚本流程（阶段机/渐进提示/刷怪/倒计时切幕/迷雾）——这些改由
 * GameProject（game.project.json）的 triggers + 逻辑对象逐步重建。
 *
 * 与旧 Act1 并存：?ddscene=1 进本场景，默认仍进旧 Act1（逐幕对照验收）。
 * 待迁移：渐进提示 / 点火交互 / 拾取物 / 刷怪波次 / 倒计时切幕。
 */

import { BaseGameScene } from './BaseGameScene.js';
import { Scene1Terrain } from './Scene1Terrain.js';
import { GameLoader } from '../../../src/core/GameLoader.js';

export class DataDrivenPrologueScene extends BaseGameScene {
  constructor() {
    super(1, {
      title: '数据驱动序章',
      description: '第一幕（数据驱动重建，与旧 Act1 并存对照）'
    });

    // 盆地火堆（含火焰帧动画字段，迁移自 Act1）
    this.campfire = {
      x: 350,
      y: 250,
      lit: false,
      emitters: [],
      emitterSmoke: null,
      fireImage: null,
      imageLoaded: false,
      frameWidth: 658 / 4,
      frameHeight: 712 / 3,
      frameCols: 4,
      frameRows: 3,
      frameCount: 12,
      currentFrame: 0,
      frameTime: 0,
      frameDuration: 0.16,
      autoIgniteTimer: 0,
      autoIgniteDelay: 10
    };

    // 开场迷雾（模糊黑雾 + 玩家周围 2.5D 椭圆透光；点燃火堆后淡出，迁移自 Act1）
    this.fog = {
      opacity: 0.85,
      targetOpacity: 0.85,
      fadeSpeed: 0.4,
      color: 'rgba(30, 30, 40,',
      active: true
    };

    this.terrain = null;
    this.gameLoader = null;
  }

  enter(data = null) {
    // 复用父类：初始化 canvas/相机/inputManager/全部系统/UI/玩家创建
    super.enter(data);

    // 盆地地形（与旧场景同一份编辑器数据，视觉+碰撞一致）
    this.terrain = new Scene1Terrain({
      centerX: this.campfire.x,
      centerY: this.campfire.y,
      width: 1280,
      height: 720
    });

    // 火焰图（父类 loadFireImage 会写入 this.campfire.fireImage）
    this.loadFireImage();
    // 火堆初始熄灭：由数据驱动的 interact 触发器点燃（靠近按 E），或 timer 自燃兜底

    // 加载场景放置点（type:'ref'），供 spawnGroup 按组实例化（位置来自场景编辑器）
    this._placements = [];
    this._loadScenePlacements();

    // 数据驱动：装配 GameProject 触发器/黑板/对话，fire(sceneEnter)
    this._initGameLoader();

    console.log('DataDrivenPrologueScene: 进入（数据驱动序章）');
  }

  update(deltaTime) {
    if (!this.isActive) return;

    if (this.isTransitioning) {
      this.updateTransition(deltaTime);
      if (this.transitionPhase === 'show_text' || this.transitionPhase === 'switch_scene') {
        this.inputManager.update();
        return;
      }
    }

    // 火焰动画 + 粒子发射器更新
    this.updateCampfireAnimation(deltaTime);

    // 开场迷雾淡出
    this.updateFog(deltaTime);

    // 通用可玩管线（移动/战斗/相机含 postCameraUpdate/渲染系统/粒子等）
    super.update(deltaTime);

    // 数据驱动触发器（timer 等）
    if (this.gameLoader) this.gameLoader.update(deltaTime);

    // 事件源：物品被拾取 → fire('itemPickup', {item:id})（供"拾取X后掉落Y"类触发器）
    this._checkItemPickupEvents();

    // 事件源：敌人死亡 fire('kill')、某组敌人全灭 fire('waveCleared', {group})
    this._checkWaveEvents();

    // 事件源：① 渐进提示条件 —— playerMoved（移动一段距离）/ panelOpen（背包/属性面板打开）
    this._checkTutorialEventSources();

    // ⑤ 切幕：倒计时 / 提示按键
    this._updateSceneCountdown(deltaTime);
    this._updatePromptSwitch();

    // 事件源：靠近火堆按 E / 点击 → fire('interact', {target:'campfire'})
    this._checkCampfireInteract();

    // 地形碰撞（火堆 + 盆地边界/水池/树/编辑器多边形）
    this.checkCampfireCollision();
    this.checkTerrainCollision();
  }

  /**
   * 波次事件源：敌人死亡 fire('kill', {enemyType, group})；
   * 某 spawnGroup 生成的敌人全灭 fire('waveCleared', {group})（每组一次）。
   * @private
   */
  _checkWaveEvents() {
    if (!this.gameLoader || !this._groupEnemies) return;
    if (!this._clearedGroups) this._clearedGroups = new Set();
    if (!this._deadFired) this._deadFired = new Set();
    for (const [group, list] of Object.entries(this._groupEnemies)) {
      if (this._clearedGroups.has(group)) continue;
      let alive = 0;
      for (const e of list) {
        const dead = this._isEntityDead(e);
        if (dead && !this._deadFired.has(e.id)) {
          this._deadFired.add(e.id);
          this.gameLoader.triggerSystem.fire('kill', { enemyType: e.templateId, group });
        }
        if (!dead) alive++;
      }
      if (list.length > 0 && alive === 0) {
        this._clearedGroups.add(group);
        this.gameLoader.triggerSystem.fire('waveCleared', { group });
        console.log('[DDScene] waveCleared:', group);
      }
    }
  }

  /**
   * ① 渐进提示事件源：
   *   - playerMoved：玩家离开出生点一定距离 → fire('playerMoved')（一次）
   *   - panelOpen：背包/属性面板打开 → fire('panelOpen', {panel:'inventory'|'stats'})
   * @private
   */
  _checkTutorialEventSources() {
    if (!this.gameLoader) return;
    const trig = this.gameLoader.triggerSystem;
    if (!this._tutFired) this._tutFired = new Set();

    // playerMoved
    const t = this.playerEntity && this.playerEntity.getComponent('transform');
    if (t) {
      if (!this._startPos) this._startPos = { x: t.position.x, y: t.position.y };
      if (!this._tutFired.has('moved')) {
        const d = Math.hypot(t.position.x - this._startPos.x, t.position.y - this._startPos.y);
        if (d > 60) { this._tutFired.add('moved'); trig.fire('playerMoved', {}); }
      }
    }

    // panelOpen（上升沿：false→true 时触发）
    const invVis = !!(this.inventoryPanel && this.inventoryPanel.visible);
    if (invVis && !this._invWasOpen) trig.fire('panelOpen', { panel: 'inventory' });
    this._invWasOpen = invVis;

    const statsVis = !!(this.playerInfoPanel && this.playerInfoPanel.visible);
    if (statsVis && !this._statsWasOpen) trig.fire('panelOpen', { panel: 'stats' });
    this._statsWasOpen = statsVis;
  }

  /**
   * 提示切幕（动作 promptSwitch）：显示提示，等待按 N 或交互键 E 再切场景。
   * @param {Object} p - { scene:目标场景名, text:提示文案 }
   * @private
   */
  _startPromptSwitch(p = {}) {
    this._promptSwitch = {
      scene: p.scene || 'Act2Scene',
      text: p.text || '序章完成 — 按 N 或 交互键(E) 进入下一幕'
    };
  }

  /** @private 提示切幕刷新 + 按键切场景 */
  _updatePromptSwitch() {
    if (!this._promptSwitch) return;
    this._showScreenTip(this._promptSwitch.text, { persist: true });
    const im = this.inputManager;
    if (!im) return;
    const pressed = (k) => (im.isKeyPressed ? im.isKeyPressed(k) : im.isKeyDown(k));
    if (pressed('n') || pressed('N') || pressed('e') || pressed('E')) {
      const scene = this._promptSwitch.scene;
      this._promptSwitch = null;
      this._hideScreenTip();
      const sm = (window.gameEngine && window.gameEngine.sceneManager) || this.sceneManager;
      if (sm && sm.switchTo) {
        console.log('[DDScene] 提示切幕：切换场景 →', scene);
        sm.switchTo(scene);
      }
    }
  }

  /**
   * ⑤ 启动倒计时切幕（动作 sceneCountdown）。
   * @param {Object} p - { scene:目标场景名, seconds:倒计时秒数(默认5), text:提示文案 }
   * @private
   */
  _startSceneCountdown(p = {}) {
    if (this._countdown) return; // 已在倒计时
    this._countdown = {
      scene: p.scene || 'Act2Scene',
      remain: p.seconds != null ? p.seconds : 5,
      text: p.text || '序章完成，即将进入下一幕'
    };
  }

  /** @private 倒计时刷新 + 到点切场景 */
  _updateSceneCountdown(deltaTime) {
    if (!this._countdown) return;
    this._countdown.remain -= deltaTime;
    const sec = Math.max(0, Math.ceil(this._countdown.remain));
    this._showScreenTip(`${this._countdown.text}（${sec}）`, { persist: true });
    if (this._countdown.remain <= 0) {
      const scene = this._countdown.scene;
      this._countdown = null;
      this._hideScreenTip();
      const eng = window.gameEngine;
      const sm = (eng && eng.sceneManager) || this.sceneManager;
      if (sm && sm.switchTo) {
        console.log('[DDScene] 倒计时结束，切换场景 →', scene);
        sm.switchTo(scene);
      }
    }
  }

  /** 判断实体是否已死亡/移除 */
  _isEntityDead(e) {
    if (!e) return true;
    if (e.isDead || e.isDying || e.active === false) return true;
    const s = e.getComponent && e.getComponent('stats');
    if (s && s.hp <= 0) return true;
    if (this.entities.indexOf(e) === -1) return true;
    return false;
  }

  /**
   * 拾取事件源：检测 pickupItems/equipmentItems 中新变为 picked 的物品，
   * fire('itemPickup', {item:id})。供"拾取 X 后掉落/生成 Y"类触发器使用。
   * @private
   */
  _checkItemPickupEvents() {
    if (!this.gameLoader) return;
    if (!this._firedPickups) this._firedPickups = new Set();
    const scan = (list) => {
      for (const it of (list || [])) {
        if (it.picked && it.id && !this._firedPickups.has(it._pickUid || it.id)) {
          const uid = it._pickUid || it.id;
          this._firedPickups.add(uid);
          this.gameLoader.triggerSystem.fire('itemPickup', { item: it.id, id: it.id });
          console.log('[DDScene] itemPickup:', it.id);
        }
      }
    };
    scan(this.pickupItems);
    scan(this.equipmentItems);
  }

  /**
   * 火堆交互事件源（数据驱动）：靠近火堆（≤60px）按 E 或点击火堆附近，
   * 触发 interact 事件；由 GameProject 触发器 do:lightCampfire 点燃。
   * @private
   */
  _checkCampfireInteract() {
    if (this.campfire.lit || !this.gameLoader) return;
    const transform = this.playerEntity && this.playerEntity.getComponent('transform');
    if (!transform) return;

    const campfireCenterY = this.campfire.y - 15;
    const dist = Math.hypot(this.campfire.x - transform.position.x, campfireCenterY - transform.position.y);

    const ePressed = this.inputManager.isKeyDown('e') || this.inputManager.isKeyDown('E');
    let clickedNear = false;
    if (this.inputManager.isMouseClicked && this.inputManager.isMouseClicked() &&
        !this.inputManager.isMouseClickHandled()) {
      const m = this.inputManager.mouse;
      if (Math.hypot(this.campfire.x - m.worldX, campfireCenterY - m.worldY) <= 80) clickedNear = true;
    }

    if ((ePressed || clickedNear) && dist <= 60) {
      this.gameLoader.triggerSystem.fire('interact', { target: 'campfire' });
    }
  }

  /** 相机后处理：限制在盆地内（被 BaseGameScene.update 调用） */
  postCameraUpdate() {
    this.clampCameraToBasin();
  }

  /**
   * 装配 GameProject（触发器/黑板/对话/任务），fire(sceneEnter)。showTip 走屏幕居中提示。
   * @private
   */
  _initGameLoader() {
    try {
      this.gameLoader = new GameLoader();
      const eng = window.gameEngine;
      this._gameLoaderReady = this.gameLoader.load('game.project.json', {
        dialogueSystem: this.dialogueSystem,
        questSystem: this.questSystem,
        sceneManager: eng ? eng.sceneManager : (this.sceneManager || null),
        audioManager: this.audioManager || (eng && eng.audioManager) || null,
        floatingText: this.floatingTextManager,
        tutorial: { showTip: (p) => this._showScreenTip(p.text || '') },
        player: this.playerEntity || null
      }).then(() => {
        const trig = this.gameLoader.triggerSystem;
        trig.on((evt, t) => {
          if (evt === 'triggerStart') console.log('[DDScene][Trigger] 执行:', t.id, t.do);
        });
        // 标记本场景为数据驱动（供仅本场景生效的触发器用 if 判定，避免污染旧 Act1）
        this.gameLoader.blackboard.set('ddScene', true);
        // 场景专属动作：点燃火堆（触发器 do:lightCampfire 调用）
        trig.registerAction('lightCampfire', () => this.lightCampfire());
        // 场景专属动作：按组激活场景放置点（方案A）—— 明细来自内容库定义，位置来自场景放置点
        trig.registerAction('spawnGroup', (p) => this._spawnGroup(p));
        // 场景专属动作：倒计时后切换场景（⑤ 倒计时→切幕，演出层）
        trig.registerAction('sceneCountdown', (p) => this._startSceneCountdown(p));
        // 场景专属动作：提示切幕（等待按 N 或交互键 E 再切下一幕）
        trig.registerAction('promptSwitch', (p) => this._startPromptSwitch(p));
        if (this.dialogueSystem && this.dialogueSystem.onEnd) {
          this.dialogueSystem.onEnd(() => trig.fire('dialogueEnd', {}));
        }
        if (this.playerEntity) this.gameLoader.updateContext({ player: this.playerEntity });
        trig.fire('sceneEnter', { sceneId: 'scene_Prologue' });
        console.log('%c[DDScene][GameLoader] 装配完成，触发器数量:', 'color:#4CAF50', trig.triggers.length);
      }).catch(e => console.error('[DDScene][GameLoader] 加载失败:', e));
    } catch (e) {
      console.warn('[DDScene][GameLoader] 初始化失败:', e);
    }
  }

  /**
   * 屏幕提示（showTip 动作用）：优先复用原版提示面板 window.__ddShowTips（与旧序章样式一致），
   * 约 3.5 秒后自动隐藏；不可用时回退到简易黑框。
   * @param {string} text
   * @param {Object} [opts] - { persist:true 不自动隐藏（供 promptSwitch/countdown 每帧刷新用） }
   */
  _showScreenTip(text, opts = {}) {
    if (typeof window !== 'undefined' && window.__ddShowTips) {
      window.__ddShowTips('提示', text);
      clearTimeout(this._tipTimer);
      if (!opts.persist) {
        this._tipTimer = setTimeout(() => { if (window.__ddHideTips) window.__ddHideTips(); }, 3500);
      }
      return;
    }
    // 回退：简易黑框
    let el = document.getElementById('dd-trigger-tip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dd-trigger-tip';
      el.style.cssText = 'position:fixed;top:22%;left:50%;transform:translateX(-50%);' +
        'background:rgba(0,0,0,0.82);color:#fff;padding:14px 28px;border-radius:8px;' +
        'font-size:18px;z-index:99999;pointer-events:none;transition:opacity 0.3s;';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(this._tipTimer);
    if (!opts.persist) this._tipTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
  }

  /** 隐藏提示面板 */
  _hideScreenTip() {
    if (typeof window !== 'undefined' && window.__ddHideTips) window.__ddHideTips();
    const el = document.getElementById('dd-trigger-tip');
    if (el) el.style.opacity = '0';
  }

  // ==================== 火堆（迁移自 Act1） ====================

  /** 点燃火堆并创建火焰粒子（7 组发射器） */
  lightCampfire() {
    if (this.campfire.lit) return;
    this.campfire.lit = true;
    this.campfire.emitters = [];

    const fireBaseY = this.campfire.y - 15;
    const firePoint = { x: this.campfire.x, y: fireBaseY };
    const mk = (rate, vy, life, size, color, alpha) => this.campfire.emitters.push(
      this.particleSystem.createEmitter({
        position: { x: firePoint.x, y: firePoint.y },
        rate,
        duration: Infinity,
        particleConfig: {
          position: { x: firePoint.x, y: firePoint.y },
          velocity: { x: 0, y: vy },
          life, size, color, alpha, gravity: 0, friction: 0.95
        }
      })
    );

    mk(6, -50, 250, 8.5, '#ffaa22', 0.85);  // 大火焰
    mk(8, -35, 200, 6, '#ff8833', 0.8);     // 中火焰
    mk(4, -120, 400, 4.5, '#ffffee', 1.0);  // 白色亮点
    mk(10, -100, 350, 3.5, '#ffee44', 0.9); // 亮黄火星
    mk(8, -80, 300, 2.5, '#ff9933', 0.85);  // 橙色火星
    mk(6, -60, 250, 2, '#ff5522', 0.8);     // 红色火星
    mk(12, -40, 200, 2, '#ff6633', 0.7);    // 小火星

    console.log('DataDrivenPrologueScene: 火焰粒子效果已创建（1个发射点，7种粒子）');

    // 点燃火堆后迷雾消散
    this.fog.targetOpacity = 0;

    // 事件源：火堆点燃 → 触发器 trg_spawn_pickup 生成拾取物
    if (this.gameLoader) this.gameLoader.triggerSystem.fire('campfireLit', {});
  }

  /**
   * 按组激活场景放置点（方案A）：找出该 group 的 type:'ref' 放置点，
   * 按 kind 从内容库(registries)取明细定义 + 放置点坐标 → 生成拾取物/装备/敌人等。
   * 明细在内容库、位置在场景编辑器、触发器只给组名 —— 三者解耦。
   * @param {Object} p - { group }
   * @private
   */
  _spawnGroup(p = {}) {
    const group = p.group;
    if (!group || !this.gameLoader) return;
    const reg = this.gameLoader.registries;
    const placements = (this._placements || []).filter(pl => pl.group === group);
    // 诊断：放置点坐标 vs 玩家/火堆坐标（用于排查位置偏差）
    const _pt = this.playerEntity && this.playerEntity.getComponent('transform');
    console.log('%c[DDScene] spawnGroup 诊断', 'color:#ff9800',
      '\n  组:', group,
      '\n  放置点:', placements.map(pl => `${pl.ref}@(${pl.x},${pl.y}) kind=${pl.kind}`).join(' | ') || '(无)',
      '\n  玩家:', _pt ? `(${Math.round(_pt.position.x)},${Math.round(_pt.position.y)})` : '?',
      '\n  火堆:', `(${this.campfire.x},${this.campfire.y})`);
    let itemN = 0, eqN = 0, entN = 0;
    for (const pl of placements) {
      const def = reg[this._regKey(pl.kind)] ? reg[this._regKey(pl.kind)].get(pl.ref) : null;
      if (!def) { console.warn('[DDScene] spawnGroup 未找到定义', pl.kind, pl.ref); continue; }
      if (pl.kind === 'item') {
        this.pickupItems.push({ ...def, x: pl.x, y: pl.y, picked: false });
        itemN++;
      } else if (pl.kind === 'equipment') {
        this.equipmentItems.push({ ...def, x: pl.x, y: pl.y, picked: false });
        eqN++;
      } else if (pl.kind === 'enemy') {
        // 敌人：经 EntityFactory 实例化，加入实体列表 + 敌人列表（AI/战斗系统继承自 BaseGameScene）
        const enemy = this.entityFactory.createEnemy({
          templateId: def.templateId || pl.ref,
          name: def.name || '敌人',
          level: def.level || 1,
          stats: def.stats || {},
          aiType: def.aiType || 'aggressive',
          lootTable: def.lootTable || [],
          position: { x: pl.x, y: pl.y }
        });
        this.entities.push(enemy);
        this.enemyEntities.push(enemy);
        // 注册 AI 控制器，敌人才会主动追击/攻击玩家
        if (this.aiSystem && this.aiSystem.registerAI) {
          this.aiSystem.registerAI(enemy, def.aiType || 'aggressive');
        }
        this._groupEnemies = this._groupEnemies || {};
        (this._groupEnemies[group] = this._groupEnemies[group] || []).push(enemy);
        entN++;
      } else if (pl.kind === 'npc') {
        const npc = this.entityFactory.createNPC({ ...def, position: { x: pl.x, y: pl.y } });
        this.entities.push(npc);
        entN++;
      } else if (pl.kind === 'building') {
        const b = this.entityFactory.createBuilding({ ...def, position: { x: pl.x, y: pl.y } });
        this.entities.push(b);
        entN++;
      } else if (pl.kind === 'vehicle') {
        const v = this.entityFactory.createVehicle({ ...def, position: { x: pl.x, y: pl.y } });
        this.entities.push(v);
        entN++;
      }
    }
    console.log(`[DDScene] spawnGroup(${group}): 物品${itemN} 装备${eqN} 其它${entN}`);
  }

  /** kind → registries 键名 */
  _regKey(kind) {
    return ({ item: 'items', equipment: 'equipment', npc: 'npcs', enemy: 'enemies', shop: 'shops', vehicle: 'vehicles', building: 'buildings' })[kind] || null;
  }

  /**
   * 加载场景放置点（type:'ref'）：从 localStorage 或导出 JSON 读同一份 scene_Prologue，
   * 收集所有图层里 type==='ref' 的对象（含 group/kind/ref/x/y）。
   * @private
   */
  async _loadScenePlacements() {
    const gameId = 'sanguo_zhangjiao';
    const sceneId = 'scene_Prologue';
    let scene = null;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('h5game_editor_data_scenes_' + gameId);
        if (raw) {
          const scenes = JSON.parse(raw);
          scene = Array.isArray(scenes) ? scenes.find(s => s && s.id === sceneId) : null;
        }
      }
    } catch (e) { /* ignore */ }
    if (!scene && typeof fetch !== 'undefined') {
      try {
        const path = 'assets/scenes/' + encodeURIComponent('序章 - 盆地营地.json');
        const res = await fetch(path);
        if (res.ok) {
          const scenes = await res.json();
          scene = Array.isArray(scenes) ? scenes.find(s => s && s.id === sceneId) : (scenes && scenes.id === sceneId ? scenes : null);
        }
      } catch (e) { /* ignore */ }
    }
    const placements = [];
    if (scene && Array.isArray(scene.layers)) {
      for (const layer of scene.layers) {
        for (const o of (layer.objects || [])) {
          if (o.type === 'ref') placements.push(o);
        }
      }
    }
    this._placements = placements;
    console.log('[DDScene] 场景放置点(type:ref):', placements.length);
  }

  /** 迷雾淡出（平滑过渡到目标浓度） */
  updateFog(deltaTime) {
    if (!this.fog.active) return;
    if (Math.abs(this.fog.opacity - this.fog.targetOpacity) > 0.01) {
      if (this.fog.opacity > this.fog.targetOpacity) {
        this.fog.opacity -= this.fog.fadeSpeed * deltaTime;
        if (this.fog.opacity < this.fog.targetOpacity) this.fog.opacity = this.fog.targetOpacity;
      }
    } else if (this.fog.targetOpacity === 0) {
      this.fog.opacity = 0;
      this.fog.active = false;
    }
  }

  /** 渲染：父类管线之上叠加开场迷雾（玩家周围 2.5D 椭圆透光区） */
  render(ctx) {
    super.render(ctx);
    if (!(this.fog.active && this.fog.opacity > 0.01)) return;

    ctx.save();
    const playerTransform = this.playerEntity && this.playerEntity.getComponent('transform');
    const viewBounds = this.camera.getViewBounds();
    if (playerTransform) {
      const playerScreenX = playerTransform.position.x - viewBounds.left;
      const playerScreenY = playerTransform.position.y - viewBounds.top;
      const lightRadius = 120;

      if (!this._fogCanvas) this._fogCanvas = document.createElement('canvas');
      if (this._fogCanvas.width !== this.logicalWidth || this._fogCanvas.height !== this.logicalHeight) {
        this._fogCanvas.width = this.logicalWidth;
        this._fogCanvas.height = this.logicalHeight;
      }
      const fogCtx = this._fogCanvas.getContext('2d');

      fogCtx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
      fogCtx.fillStyle = `${this.fog.color} ${this.fog.opacity})`;
      fogCtx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

      // destination-out 挖出玩家周围椭圆透光区（Y 轴压缩，符合 2.5D 视角）
      fogCtx.globalCompositeOperation = 'destination-out';
      const yScale = 0.6;
      fogCtx.save();
      fogCtx.translate(playerScreenX, playerScreenY);
      fogCtx.scale(1, yScale);
      const gradient = fogCtx.createRadialGradient(0, 0, 0, 0, 0, lightRadius);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
      gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.6)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      fogCtx.fillStyle = gradient;
      fogCtx.beginPath();
      fogCtx.arc(0, 0, lightRadius, 0, Math.PI * 2);
      fogCtx.fill();
      fogCtx.restore();
      fogCtx.globalCompositeOperation = 'source-over';

      ctx.drawImage(this._fogCanvas, 0, 0);
    } else {
      ctx.fillStyle = `${this.fog.color} ${this.fog.opacity})`;
      ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    }
    ctx.restore();
  }

  /** 更新火焰帧动画与粒子发射器位置 */
  updateCampfireAnimation(deltaTime) {
    if (this.campfire.lit && this.campfire.imageLoaded) {
      this.campfire.frameTime += deltaTime;
      if (this.campfire.frameTime >= this.campfire.frameDuration) {
        this.campfire.frameTime = 0;
        this.campfire.currentFrame = (this.campfire.currentFrame + 1) % this.campfire.frameCount;
      }
    }

    if (this.campfire.lit) {
      const time = performance.now() / 1000;
      this.campfire.emitters.forEach((emitter, index) => {
        if (!emitter) return;
        let swayAmount;
        if (index < 2) {
          swayAmount = (Math.random() - 0.5) * 10;
        } else {
          swayAmount = Math.sin(time * 2 + index * 0.5) * 4 + (Math.random() - 0.5) * 2;
        }
        const baseX = this.campfire.x;
        const baseY = this.campfire.y + 2;
        emitter.position.x = baseX + swayAmount;
        emitter.position.y = baseY - 15;
        emitter.particleConfig.velocity.x = (Math.random() - 0.5) * 10;
        this.particleSystem.updateEmitter(emitter, deltaTime);
      });
    }
  }

  // ==================== 渲染（迁移自 Act1） ====================

  /** 背景：盆地草地+水池（Scene1Terrain） */
  renderBackground(ctx) {
    if (this.terrain) {
      ctx.fillStyle = '#1f1a14';
      const vb = this.camera.getViewBounds();
      ctx.fillRect(vb.left, vb.top, vb.right - vb.left, vb.bottom - vb.top);
      this.terrain.renderGround(ctx);
    } else {
      super.renderBackground(ctx);
    }
  }

  /** 世界对象：实体 + 火堆 + 盆地装饰 Y-sort + 悬崖 */
  renderWorldObjects(ctx) {
    const renderQueue = [];
    for (const entity of this.entities) {
      const transform = entity.getComponent('transform');
      if (transform) {
        renderQueue.push({ type: 'entity', y: transform.position.y, entity });
      }
    }
    renderQueue.push({ type: 'campfire_bottom', y: this.campfire.y, render: () => this.renderCampfireBottom(ctx) });
    renderQueue.push({ type: 'campfire_top', y: this.campfire.y - 1, render: () => this.renderCampfireTop(ctx) });

    if (this.terrain) this.terrain.renderBelowDecorations(ctx);
    if (this.terrain) this.terrain.collectDecorations(renderQueue, ctx);

    renderQueue.sort((a, b) => a.y - b.y);
    for (const item of renderQueue) {
      if (item.type === 'entity') this.renderEntity(ctx, item.entity);
      else if (item.render) item.render();
    }

    if (this.terrain) this.terrain.renderCliffs(ctx);
  }

  /** 火堆下半部分 */
  renderCampfireBottom(ctx) {
    const x = this.campfire.x;
    const y = this.campfire.y;

    if (!this.campfire.lit) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 30, y - 15, 60, 15);
      ctx.clip();
      ctx.strokeStyle = '#5a4a3a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x - 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 18, y - 15); ctx.lineTo(x + 18, y - 15); ctx.stroke();
      ctx.strokeStyle = '#4a3a2a';
      ctx.beginPath(); ctx.moveTo(x - 15, y - 7); ctx.lineTo(x - 5, y - 27); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 15, y - 7); ctx.lineTo(x + 5, y - 27); ctx.stroke();
      ctx.restore();

      const time = performance.now() / 1000;
      const blinkAlpha = 0.7 + 0.3 * Math.abs(Math.sin(time * 2.5));
      const dotRadius = 4 + 1 * Math.sin(time * 3);
      ctx.save();
      ctx.globalAlpha = blinkAlpha;
      const outerGlow = ctx.createRadialGradient(x, y - 15, 0, x, y - 15, dotRadius + 6);
      outerGlow.addColorStop(0, 'rgba(255, 100, 50, 0.8)');
      outerGlow.addColorStop(0.5, 'rgba(255, 50, 20, 0.4)');
      outerGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath(); ctx.arc(x, y - 15, dotRadius + 6, 0, Math.PI * 2); ctx.fill();
      const dotGradient = ctx.createRadialGradient(x, y - 15, 0, x, y - 15, dotRadius);
      dotGradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
      dotGradient.addColorStop(0.4, 'rgba(255, 120, 60, 1)');
      dotGradient.addColorStop(1, 'rgba(255, 50, 20, 0)');
      ctx.fillStyle = dotGradient;
      ctx.beginPath(); ctx.arc(x, y - 15, dotRadius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 30, y - 15, 60, 15);
      ctx.clip();
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x - 20, y - 25); ctx.stroke();
      ctx.restore();

      const gradient = ctx.createRadialGradient(x, y - 15, 0, x, y - 15, 60);
      gradient.addColorStop(0, 'rgba(255, 200, 0, 0.4)');
      gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(x, y - 15, 60, 0, Math.PI * 2); ctx.fill();

      const centerGlow = ctx.createRadialGradient(x, y - 15, 0, x, y - 15, 20);
      centerGlow.addColorStop(0, 'rgba(255, 255, 200, 0.6)');
      centerGlow.addColorStop(0.5, 'rgba(255, 150, 0, 0.3)');
      centerGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = centerGlow;
      ctx.beginPath(); ctx.arc(x, y - 15, 20, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 火堆上半部分（木材 + 火焰帧动画） */
  renderCampfireTop(ctx) {
    const x = this.campfire.x;
    const y = this.campfire.y;

    if (!this.campfire.lit) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 30, y - 45, 60, 30);
      ctx.clip();
      ctx.strokeStyle = '#5a4a3a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x - 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 18, y - 15); ctx.lineTo(x + 18, y - 15); ctx.stroke();
      ctx.strokeStyle = '#4a3a2a';
      ctx.beginPath(); ctx.moveTo(x - 15, y - 7); ctx.lineTo(x - 5, y - 27); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 15, y - 7); ctx.lineTo(x + 5, y - 27); ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText('熄灭的火堆', x, y - 55);
      if (!(this.uiStrategy && this.uiStrategy.platform === 'mobile')) {
        ctx.fillText('按 E 点燃', x, y - 40);
      }
      ctx.shadowBlur = 0;
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 30, y - 45, 60, 30);
    ctx.clip();
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 20, y - 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x - 20, y - 25); ctx.stroke();
    ctx.restore();

    if (this.campfire.imageLoaded && this.campfire.fireImage) {
      const col = this.campfire.currentFrame % this.campfire.frameCols;
      const row = Math.floor(this.campfire.currentFrame / this.campfire.frameCols);
      const frameX = col * this.campfire.frameWidth;
      const frameY = row * this.campfire.frameHeight;
      const fireWidth = 40;
      const fireHeight = 60;
      const fireX = x - fireWidth / 2;
      const fireY = y - fireHeight - 5;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(
        this.campfire.fireImage,
        frameX, frameY, this.campfire.frameWidth, this.campfire.frameHeight,
        fireX, fireY, fireWidth, fireHeight
      );
      ctx.globalAlpha = 1.0;
    }
  }

  // ==================== 相机 / 碰撞（迁移自 Act1） ====================

  /** 限制相机在盆地范围内 */
  clampCameraToBasin() {
    if (!this.terrain || !this.camera) return;
    const t = this.terrain;
    const halfW = this.camera.width / 2;
    const halfH = this.camera.height / 2;
    const maxCamX = t.basinRadiusX - halfW;
    const maxCamY = t.basinRadiusY - halfH;
    const clampX = maxCamX > 0 ? Math.max(-maxCamX, Math.min(maxCamX, this.camera.position.x - t.centerX)) : 0;
    const clampY = maxCamY > 0 ? Math.max(-maxCamY, Math.min(maxCamY, this.camera.position.y - t.centerY)) : 0;
    this.camera.position.x = t.centerX + clampX;
    this.camera.position.y = t.centerY + clampY;
  }

  /** 火堆碰撞（阻止玩家穿过火堆） */
  checkCampfireCollision() {
    if (this.flightSystem && this.flightSystem.isPlayerFlying()) return;
    const transform = this.playerEntity && this.playerEntity.getComponent('transform');
    if (!transform) return;

    const playerX = transform.position.x;
    const playerY = transform.position.y;
    const playerRadius = 20;
    const fullWidth = 50, fullHeight = 30;
    const collisionWidth = fullWidth * 0.8;
    const collisionHeight = fullHeight * 0.75;
    const campfireLeft = this.campfire.x - collisionWidth / 2;
    const campfireRight = this.campfire.x + collisionWidth / 2;
    const campfireTop = this.campfire.y - 15;
    const campfireBottom = this.campfire.y - 15 + collisionHeight;

    const playerLeft = playerX - playerRadius;
    const playerRight = playerX + playerRadius;
    const playerTop = playerY - playerRadius;
    const playerBottom = playerY + playerRadius;

    if (playerRight > campfireLeft && playerLeft < campfireRight &&
        playerBottom > campfireTop && playerTop < campfireBottom) {
      const dx = playerX - this.campfire.x;
      const dy = playerY - this.campfire.y;
      const overlapX = dx > 0 ? (campfireRight - playerLeft) : (campfireLeft - playerRight);
      const overlapY = dy > 0 ? (campfireBottom - playerTop) : (campfireTop - playerBottom);
      if (Math.abs(overlapX) < Math.abs(overlapY)) transform.position.x += overlapX;
      else transform.position.y += overlapY;
    }
  }

  /** 盆地地形碰撞（椭圆盆地边界 + 水池 + 树 + 编辑器多边形） */
  checkTerrainCollision() {
    if (!this.terrain) return;
    const t = this.terrain;
    const cx = t.centerX, cy = t.centerY;
    const irx = t.basinInnerRadiusX, iry = t.basinInnerRadiusY;
    const halfAng = t.entranceAngleHalfWidth;

    for (const entity of this.entities) {
      if (entity.isDead || entity.isDying) continue;
      const transform = entity.getComponent('transform');
      if (!transform) continue;
      const p = transform.position;

      // 1) 椭圆盆地边界（南向入口扇形可通过）
      const dx = p.x - cx, dy = p.y - cy;
      const ed = Math.hypot(dx / irx, dy / iry);
      if (ed < 0.85) entity._leftBasin = false;
      if (!entity._leftBasin && ed > 1) {
        const ang = Math.atan2(dy, dx);
        const angDist = Math.abs(((ang - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (angDist < halfAng) {
          entity._leftBasin = true;
        } else if (ed > 0.001) {
          const k = 0.99 / ed;
          p.x = cx + dx * k;
          p.y = cy + dy * k;
        }
      }

      // 2) 水池（推开）
      for (const pond of t.waterPatches) {
        const pdx = (p.x - pond.x), pdy = (p.y - pond.y);
        const nx = pdx / pond.rx, ny = pdy / pond.ry;
        const d2 = nx * nx + ny * ny;
        if (d2 < 1 && d2 > 0) {
          const k = 1 / Math.sqrt(d2);
          p.x = pond.x + pdx * k * 1.02;
          p.y = pond.y + pdy * k * 1.02;
        } else if (d2 === 0) {
          p.y = pond.y - pond.ry - 1;
        }
      }

      // 3) 树木（圆形障碍，推开）
      const entityRadius = 12;
      const trees = t.getTreeColliders();
      for (const tree of trees) {
        const tdx = p.x - tree.x, tdy = p.y - tree.y;
        const minDist = tree.r + entityRadius;
        const d2 = tdx * tdx + tdy * tdy;
        if (d2 < minDist * minDist) {
          const td = Math.sqrt(d2);
          if (td > 0.001) {
            const k = minDist / td;
            p.x = tree.x + tdx * k;
            p.y = tree.y + tdy * k;
          } else {
            p.y = tree.y + minDist;
          }
        }
      }

      // 4) 编辑器 collide shape（多边形/矩形/椭圆，精确边界推开）
      if (t._collisionShapes && t._collisionShapes.length) {
        for (const s of t._collisionShapes) {
          this._resolveShapeCollision(p, s, entityRadius);
        }
      }
    }
  }

  /** 把点推出一个 collide shape（多边形/矩形精确边界，椭圆/圆边界） */
  _resolveShapeCollision(p, s, radius) {
    const t = this.terrain;
    if (!t || !t._pointInCollisionShape(s, p.x, p.y)) return;
    const EPS = 0.5;
    const st = s.shapeType;
    if (st === 'circle' || st === 'ellipse') {
      const cx = (s.x || 0) + (s.width || 0) / 2;
      const cy = (s.y || 0) + (s.height || 0) / 2;
      const dirx = p.x - cx, diry = p.y - cy;
      const dl = Math.hypot(dirx, diry) || 1;
      const rx = (st === 'circle' ? Math.min(s.width, s.height) : s.width) / 2 || 1;
      const ry = (st === 'circle' ? Math.min(s.width, s.height) : s.height) / 2 || 1;
      const ux = dirx / rx, uy = diry / ry;
      const d = Math.hypot(ux, uy) || 1;
      p.x = cx + dirx / d + dirx / dl * EPS;
      p.y = cy + diry / d + diry / dl * EPS;
      return;
    }
    let pts = s.points;
    if (st === 'rect' || !Array.isArray(pts)) {
      const x = s.x || 0, y = s.y || 0, w = s.width || 0, h = s.height || 0;
      pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    }
    this._pushOutOfPolygon(p, pts, EPS);
  }

  /** 把点沿最近边外法向推出多边形（点须已在内） */
  _pushOutOfPolygon(p, pts, radius) {
    if (!pts || pts.length < 3) return;
    let ccx = 0, ccy = 0;
    for (const q of pts) { ccx += q[0]; ccy += q[1]; }
    ccx /= pts.length; ccy /= pts.length;

    let best = null, bestD = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j], b = pts[i];
      const np = this._closestOnSegment(p.x, p.y, a[0], a[1], b[0], b[1]);
      const d = Math.hypot(p.x - np.x, p.y - np.y);
      if (d < bestD) {
        bestD = d;
        let nx = -(b[1] - a[1]), ny = (b[0] - a[0]);
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (nx * (mx - ccx) + ny * (my - ccy) < 0) { nx = -nx; ny = -ny; }
        best = { x: np.x, y: np.y, nx, ny };
      }
    }
    if (best) {
      p.x = best.x + best.nx * radius;
      p.y = best.y + best.ny * radius;
    }
  }

  /** 点到线段最近点 */
  _closestOnSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    let tt = ((px - ax) * dx + (py - ay) * dy) / l2;
    tt = Math.max(0, Math.min(1, tt));
    return { x: ax + dx * tt, y: ay + dy * tt };
  }
}

export default DataDrivenPrologueScene;
