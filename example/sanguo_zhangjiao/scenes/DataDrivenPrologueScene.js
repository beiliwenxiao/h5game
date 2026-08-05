/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * DataDrivenPrologueScene - 数据驱动序章场景（P4-5 逐幕迁移落点）
 *
 * 继承 BaseGameScene（通用可玩管线），并【迁移】Act1 中的通用地形/火堆代码
 * （相机限制、盆地/水池/树/多边形碰撞、火堆渲染+火焰粒子），
 * 不继承 Act1 的脚本流程（阶段机/渐进提示/刷怪/倒计时切幕/迷雾）——这些改由
 * GameProject（game.project.json）的 triggers + 逻辑对象逐步重建。
 *
 * 当前作为 Demo 唯一运行时大地图场景；?ddscene=preview 进入静态编辑器预览。
 * 各幕流程由 GameProject triggers 与区块传送驱动。
 */

import { BaseGameScene } from './BaseGameScene.js';
import { InputHints } from '../../../src/core/input/InputHints.js';
import { Scene1Terrain } from './Scene1Terrain.js';
import { loadSceneFromStorage, loadSceneFromFile } from '../../../src/core/SceneDataReader.js';
import { WorldMapLoadSession } from '../../../src/core/scene/WorldMapLoadSession.js';
import { WorldReadyGate } from '../../../src/core/scene/WorldReadyGate.js';
import { ChunkNavigator } from '../../../src/core/scene/ChunkNavigator.js';
import { PlacementSpawner } from '../../../src/core/scene/PlacementSpawner.js';
import { FadeOverlayTransition } from '../../../src/core/scene/FadeOverlayTransition.js';
import { SceneGameLoaderBridge } from '../../../src/core/scene/SceneGameLoaderBridge.js';
import { EffectZoneRenderer } from '../../../src/rendering/EffectZoneRenderer.js';
import { WeatherSystem } from '../../../src/systems/WeatherSystem.js';
import { TimeSystem } from '../../../src/systems/TimeSystem.js';
import { ClassSystem, ClassType, ClassNames } from '../../../src/systems/ClassSystem.js';

export class DataDrivenPrologueScene extends BaseGameScene {
  // 覆盖父类：DDScene 自行通过 _loadWorldTerrains 管理地形，不需要父类创建
  _initEditorTerrain() { /* 由 _loadWorldTerrains 代替 */ }

  constructor() {
    super({
      name: 'DataDrivenPrologueScene',
      title: '数据驱动序章',
      description: '数据驱动大地图场景'
    });

    // 盆地火堆（含火焰帧动画字段，迁移自 Act1）
    // 局部坐标，enter() 中会加 worldOffset
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

    // 饥民逐渐生成器（第二波，复用旧 Act1 starvingSpawner 逻辑）
    this._starvingSpawner = {
      active: false,
      totalCount: 18,
      spawnedCount: 0,
      spawnInterval: 0.6,
      spawnTimer: 0,
      group: null       // 完成后 fire waveCleared 用的组名
    };

    // 提示"按 N 进入下一波"状态（promptNextWave 动作设置）
    this._promptNextWave = null; // { text }

    this.terrain = null;
    this.gameLoader = null;

    // 天气系统和时间系统（配置从 game.project.json 的 system 字段加载）
    this.weatherSystem = new WeatherSystem();
    this.timeSystem = new TimeSystem({ enabled: false }); // 默认禁用，异步加载配置后启用
  }

  enter(data = null) {
    // 复用父类：初始化 canvas/相机/inputManager/全部系统/UI/玩家创建
    super.enter(data);

    this.resourceScope?.track(() => {
      for (const emitter of this.campfire.emitters) emitter.active = false;
      this.campfire.emitters.length = 0;
      if (this.campfire.emitterSmoke) this.campfire.emitterSmoke.active = false;
      this.campfire.emitterSmoke = null;
      this.effectZoneRenderer?.clear?.();
      this._terrains.length = 0;
      this.terrain = null;
      this.terrainAct1 = null;
      this._worldRegion = null;
      this.context.world.terrain = null;
      this.context.world.terrains = null;
      this.context.world.region = null;
      this.gameLoader = null;
    });

    // 大地图 chunk 偏移：从 game.project.json worldMap 动态加载地形
    // 编辑器中每个 scene 的坐标是 0~chunkWidth 局部坐标，运行时加 worldOffset 转为世界坐标
    const chunkWidth = 1280;
    const chunkHeight = 720;
    this._prologueOffset = { x: 1 * chunkWidth, y: 0 * chunkHeight };

    // 同步先把火堆/玩家/相机放到正确的世界位置（默认序章 chunk 偏移），
    // 避免异步 _applySpawnPoints 完成前先渲染在局部坐标再"跳变"到目标位置。
    // 之后 _applySpawnPoints 若有编辑器放置点会再精修（通常同值，无跳变）。
    this.campfire.x = 350 + this._prologueOffset.x;
    this.campfire.y = 250 + this._prologueOffset.y;
    const _pt0 = this.playerEntity && this.playerEntity.getComponent('transform');
    if (_pt0) {
      _pt0.position.x = this.campfire.x + 70;
      _pt0.position.y = this.campfire.y + 80;
    }
    if (this.camera && _pt0) {
      this.camera.position.x = _pt0.position.x;
      this.camera.position.y = _pt0.position.y;
    }

    // 地形实例在 _loadWorldTerrains 中动态创建
    this.terrain = null;
    this.terrainAct1 = null;
    this._terrains = [];
    this._worldRegion = null;
    this._teleportFade = null;

    // 每次 enter 都创建独立 session；地形与放置点只共享这一份世界加载 Promise。
    const gameId = 'sanguo_zhangjiao';
    const scope = this.resourceScope;
    this._worldLoadSession = new WorldMapLoadSession({
      scope,
      loadProject: async projectUrl => {
        const response = await fetch(projectUrl);
        if (!response.ok) throw new Error(`加载 ${projectUrl} 失败: HTTP ${response.status}`);
        return response.json();
      },
      loadScene: async sceneId => {
        const scene = await loadSceneFromFile(sceneId);
        if (!scene || !Array.isArray(scene.layers)) {
          throw new Error(`场景 JSON 无有效 layers: ${sceneId}`);
        }
        return scene;
      },
      loadSceneFallback: sceneId => {
        const scene = loadSceneFromStorage(gameId, sceneId);
        if (!scene || !Array.isArray(scene.layers)) {
          throw new Error(`场景缓存无有效 layers: ${sceneId}`);
        }
        return scene;
      }
    });
    this._worldReadyGate = new WorldReadyGate({
      required: ['terrains', 'placements'],
      timeout: 3000,
      scope,
      onReady: () => this._syncWorldReadyProjection(),
      onTimeout: () => this._syncWorldReadyProjection()
    });
    // wait() 在 timeout/dispose 时会 reject；显式消费，避免未处理 rejection。
    this._worldReadyGate.wait().catch(() => {});
    this._sceneReady = false;
    this._terrainsLoaded = false;
    this._spawnApplied = false;

    this._fadeOverlayTransition = new FadeOverlayTransition({ duration: 0.3, scope });
    this._placementSpawner = new PlacementSpawner({
      entityFactory: this.entityFactory,
      entityStore: this.entityStore,
      aiSystem: this.aiSystem,
      assetManager: this.assetManager,
      onNpcImageError: scope?.guard(({ url }) => {
        console.warn('[DDScene] NPC 图集加载失败（将用占位）:', url);
      }),
      onSpawn: scope?.guard(({ entity, kind, group }) => {
        if (kind === 'npc') {
          this._npcEntities = this._npcEntities || [];
          this._npcEntities.push(entity);
        } else if (kind === 'enemy') {
          this._groupEnemies = this._groupEnemies || {};
          (this._groupEnemies[group] = this._groupEnemies[group] || []).push(entity);
        }
      })
    });
    this._chunkNavigator = new ChunkNavigator({
      getRegion: () => this._worldRegion,
      getChunk: sceneId => this._worldLoadSession?.getChunk(sceneId),
      findSpawn: (sceneId, spawnRef) => this._worldLoadSession?.findSpawn(sceneId, spawnRef),
      getPlayer: () => this.playerEntity,
      getCamera: () => this.camera,
      onSceneEnter: ({ sceneId, x, y }) => {
        if (this.gameLoader?.triggerSystem) {
          this.gameLoader.triggerSystem.fire('sceneEnter', { sceneId });
        }
        console.log(`[DDScene] teleportToChunk → ${sceneId} (${x}, ${y})`);
      },
      onFallback: ({ reason, sceneId }) => {
        if (reason === 'missingSceneId') {
          console.warn('[DDScene] teleportToChunk: 缺少 scene 参数');
          return null;
        }
        console.warn('[DDScene] teleportToChunk: 在 grid 中未找到', sceneId);
        const sm = this.sceneManager || (window.gameEngine && window.gameEngine.sceneManager);
        if (sm?.switchTo) sm.switchTo(sceneId);
        return null;
      },
      transition: (type, commit) => type === 'fadeBlack' ? this._fadeTransition(commit) : commit()
    });
    this._worldLoadPromise = this._worldLoadSession.load({ projectUrl: 'game.project.json', regionIndex: 0 });
    this._loadWorldTerrains();

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

    // 顶层输入流程必须在本场景读取 E/N/反引号之前启动；同帧 super.update 会被守卫跳过。
    this._beginInputFrame(deltaTime);

    // 传送淡黑效果更新
    this._updateTeleportFade(deltaTime);

    // 必须在任何 inputManager.update() 之前读取，否则本帧按下状态会被清空
    const debugPanelKeyPressed = !!this.inputManager?.isKeyPressed?.('`');

    if (this.isTransitioning &&
        (this.transitionPhase === 'show_text' || this.transitionPhase === 'switch_scene')) {
      if (debugPanelKeyPressed) {
        console.warn('[DDScene][DebugPanel] 反引号已收到，但当前过场阶段会提前结束本帧', {
          transitionPhase: this.transitionPhase,
          isTransitioning: this.isTransitioning
        });
      }
      // 转场提前返回只结束本次输入编排，绝不调用 inputManager.update() 清帧。
      this._inputFlow?.releaseFrame?.();
      return;
    }

    // 玩家实体就绪后同步到触发器上下文（保证 giveReward/heal 等动作能拿到 ctx.player）
    if (this.gameLoader && this.playerEntity && !this._playerCtxSynced) {
      this.gameLoader.updateContext({ player: this.playerEntity });
      this._playerCtxSynced = true;
    }

    // 火焰动画 + 粒子发射器更新
    this.updateCampfireAnimation(deltaTime);

    // 开场迷雾淡出
    this.updateFog(deltaTime);

    // 天气和时间系统更新
    if (this.weatherSystem) this.weatherSystem.update(deltaTime);
    if (this.timeSystem) this.timeSystem.update(deltaTime);

    // 提示切幕已由 SceneInputFlow 在帧首统一处理，确保手柄/键鼠只消费一次。

    // 提示按 N 进入下一波（同样在 super.update 前检测按键）
    this._updatePromptNextWave();

    // 事件源：靠近火堆按 E / 点击 → fire('interact', {target:'campfire'})（同样需要在 inputManager.update 之前检测按键）
    this._checkCampfireInteract();

    // 职业确认窗口检测（第四幕，确认窗口打开时优先处理点击，阻止穿透到 NPC 交互）
    this._updateClassConfirmation();

    // NPC 交互：靠近 NPC 按 E / 点击 → 触发其对话/商店
    this._checkNpcInteract();

    // 事件源：场景触发器靠近检测（approach）
    this._checkApproachTriggers();

    // 调试面板快捷键：反引号 `
    if (debugPanelKeyPressed) {
      console.log('[DDScene][DebugPanel] update 捕获反引号，准备切换面板', {
        scene: this.name,
        isActive: this.isActive,
        isPaused: this.isPaused,
        isTransitioning: this.isTransitioning,
        transitionPhase: this.transitionPhase,
        panelExists: !!this.debugPanel,
        visibleBefore: this.debugPanel?.visible ?? false
      });
      this._toggleDebugPanel();
    }

    // 通用可玩管线（移动/战斗/相机含 postCameraUpdate/渲染系统/粒子等）
    // 注：基类 super.update 内部已驱动 this.gameLoader.update（timer 触发器），此处无需重复调
    super.update(deltaTime);

    // 饥民逐渐生成器（第二波）
    this._updateStarvingSpawner(deltaTime);

    // 事件源：物品被拾取 → fire('itemPickup', {item:id})（供"拾取X后掉落Y"类触发器）
    this._checkItemPickupEvents();

    // 事件源：敌人死亡 fire('kill')、某组敌人全灭 fire('waveCleared', {group})
    this._checkWaveEvents();

    // 事件源：① 渐进提示条件 —— playerMoved（移动一段距离）/ panelOpen（背包/属性面板打开）
    this._checkTutorialEventSources();

    // ⑤ 切幕：倒计时
    this._updateSceneCountdown(deltaTime);

    // 地形碰撞（火堆 + 盆地边界/水池/树/编辑器多边形）
    this.checkCampfireCollision();
    const terrainCollisionState = (this._terrains || []).map((terrain, index) => ({
      index,
      sceneId: terrain._editorSceneId || null,
      worldOffset: terrain.worldOffset || null,
      collisionShapeCount: terrain._collisionShapes?.length || 0
    }));
    const terrainCollisionSignature = JSON.stringify(terrainCollisionState);
    if (terrainCollisionSignature !== this._terrainCollisionSignature) {
      const playerTransform = this.playerEntity?.getComponent('transform');
      console.log('[DDScene][Collision] 地形碰撞数据状态变化', {
        terrains: terrainCollisionState,
        mainTerrainSceneId: this.terrain?._editorSceneId || null,
        playerPosition: playerTransform
          ? { x: playerTransform.position.x, y: playerTransform.position.y }
          : null
      });
      this._terrainCollisionSignature = terrainCollisionSignature;
    }
  }

  /**
   * 波次事件源：敌人死亡 fire('kill', {enemyType, group})；
   * 某 spawnGroup 生成的敌人全灭 fire('waveCleared', {group})（每组一次）。
   * @private
   */
  _checkWaveEvents() {
    if (!this.gameLoader || !this._groupEnemies) return;
    if (!this._clearedGroups) this._clearedGroups = new Set();
    // 注：通用 kill 事件源已由 CombatSystem.setOnKillCallback → GameLoader 桥接统一发出，
    // 此处只负责按组统计存活数、fire('waveCleared')（波次全灭，每组一次）。
    for (const [group, list] of Object.entries(this._groupEnemies)) {
      if (this._clearedGroups.has(group)) continue;
      // 对于逐渐生成的波次（starvingSpawner），必须等全部生成完毕才判定全灭
      const sp = this._starvingSpawner;
      if (sp.active && sp.group === group && sp.spawnedCount < sp.totalCount) continue;
      let alive = 0;
      for (const e of list) {
        if (!this._isEntityDead(e)) alive++;
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
      scene: p.scene || 's1-1',
      spawnRef: p.spawnRef || null,
      text: p.text || '序章完成 — 按 N 或 交互键(E) 进入下一幕'
    };
  }

  /** @private 提示切幕刷新 + 按键传送到目标区块 */
  _updatePromptSwitch() {
    if (!this._promptSwitch) return;
    this._showScreenTip(this._promptSwitch.text, { persist: true });
    const im = this.inputManager;
    if (!im) return;
    const pressed = (k) => (im.isKeyPressed ? im.isKeyPressed(k) : im.isKeyDown(k));
    if (pressed('n') || pressed('N') || pressed('e') || pressed('E')) {
      const scene = this._promptSwitch.scene;
      const spawnRef = this._promptSwitch.spawnRef || null;
      this._promptSwitch = null;
      this._hideScreenTip();
      console.log('[DDScene] 提示切幕：传送到区块 →', scene);
      this.teleportToChunk({ scene, spawnRef, transition: 'fadeBlack' });
    }
  }

  /**
   * 提示按 N 进入下一波（动作 promptNextWave）。
   * 显示提示文案，等待按 N → fire('nextWave')，触发器可监听 nextWave 执行 spawnStarvingWave。
   * @param {Object} p - { text:提示文案 }
   * @private
   */
  _startPromptNextWave(p = {}) {
    this._promptNextWave = {
      text: p.text || '按 N 继续'
    };
  }

  /** @private 每帧检测 N 键 → fire nextWave 事件 */
  _updatePromptNextWave() {
    if (!this._promptNextWave) return;
    this._showScreenTip(this._promptNextWave.text, { persist: true });
    const im = this.inputManager;
    if (!im) return;
    const pressed = (k) => (im.isKeyPressed ? im.isKeyPressed(k) : im.isKeyDown(k));
    if (pressed('n') || pressed('N')) {
      this._promptNextWave = null;
      this._hideScreenTip();
      console.log('[DDScene] 按 N：fire nextWave');
      if (this.gameLoader) this.gameLoader.triggerSystem.fire('nextWave', {});
    }
  }

  /**
   * 启动饥民逐渐生成（动作 spawnStarvingWave）。
   * 从玩家四面八方逐渐涌出饥民，每 0.6 秒一个，总计 18 个。
   * 全部生成后由 _updateStarvingSpawner 自动追踪死亡 → fire waveCleared。
   * @param {Object} p - { group:组名(默认'act1_wave2'), count:总数(默认18), interval:间隔秒(默认0.6) }
   * @private
   */
  _startStarvingWave(p = {}) {
    const group = p.group || 'act1_wave2';
    this._starvingSpawner.active = true;
    this._starvingSpawner.totalCount = p.count || 18;
    this._starvingSpawner.spawnedCount = 0;
    this._starvingSpawner.spawnTimer = 0;
    this._starvingSpawner.spawnInterval = p.interval || 0.6;
    this._starvingSpawner.group = group;
    // 初始化该组的追踪列表
    this._groupEnemies = this._groupEnemies || {};
    this._groupEnemies[group] = [];
    console.log(`[DDScene] 启动饥民逐渐生成，组: ${group}，总数: ${this._starvingSpawner.totalCount}`);
  }

  /** @private 每帧更新饥民逐渐生成器 */
  _updateStarvingSpawner(deltaTime) {
    const sp = this._starvingSpawner;
    if (!sp.active) return;
    if (sp.spawnedCount >= sp.totalCount) return;

    sp.spawnTimer += deltaTime;
    if (sp.spawnTimer >= sp.spawnInterval) {
      sp.spawnTimer -= sp.spawnInterval;
      this._spawnSingleStarving(sp.group);
    }
  }

  /**
   * 从画面边缘随机位置生成一个饥民（复用旧 Act1 spawnSingleStarving 逻辑）
   * @private
   */
  _spawnSingleStarving(group) {
    const playerTransform = this.playerEntity && this.playerEntity.getComponent('transform');
    const centerX = playerTransform ? playerTransform.position.x : this.campfire.x;
    const centerY = playerTransform ? playerTransform.position.y : this.campfire.y;

    // 从玩家四面八方生成（距离 150~250 像素）
    const spawnDistance = 150 + Math.random() * 100;
    const angle = Math.random() * Math.PI * 2;
    const x = centerX + Math.cos(angle) * spawnDistance;
    const y = centerY + Math.sin(angle) * spawnDistance;

    const enemy = this.entityFactory.createEnemy({
      name: '饥民',
      templateId: 'starving',
      level: 2,
      position: { x, y },
      stats: { maxHp: 40, attack: 6, defense: 3 },
      aiType: 'aggressive'
    });

    this.entityStore.addEnemy(enemy);
    if (this.aiSystem && this.aiSystem.registerAI) {
      this.aiSystem.registerAI(enemy, 'aggressive');
    }

    // 追踪到组（供 _checkWaveEvents 检测全灭）
    this._groupEnemies = this._groupEnemies || {};
    (this._groupEnemies[group] = this._groupEnemies[group] || []).push(enemy);

    this._starvingSpawner.spawnedCount++;
  }

  /**
   * 数据驱动：批量生成一波敌人（第五幕战役）。围绕玩家四周随机散布。
   * 触发器 do:spawnWave 调用，明细直接写在触发器 params（可含小兵+名将 BOSS）。
   * @param {Object} p - {
   *   group: 组名（供 waveCleared 判定；默认 'act5_wave'）,
   *   enemies: [ { name, count, templateId, level, stats:{maxHp,attack,defense,speed}, color, aiType } ]
   * }
   * @private
   */
  _spawnWave(p = {}) {
    const group = p.group || 'act5_wave';
    const entries = Array.isArray(p.enemies) ? p.enemies : [];
    if (entries.length === 0) { console.warn('[DDScene] spawnWave: enemies 为空'); return; }
    const pt = this.playerEntity && this.playerEntity.getComponent('transform');
    const cx = pt ? pt.position.x : this.campfire.x;
    const cy = pt ? pt.position.y : this.campfire.y;
    this._groupEnemies = this._groupEnemies || {};
    this._groupEnemies[group] = this._groupEnemies[group] || [];
    let total = 0;
    for (const e of entries) {
      const count = Math.max(1, e.count || 1);
      for (let i = 0; i < count; i++) {
        // 四周环形随机散布（BOSS 距离更近一些）
        const dist = (e.count === 1 ? 200 : 260) + Math.random() * 220;
        const angle = Math.random() * Math.PI * 2;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const st = e.stats || {};
        const enemy = this.entityFactory.createEnemy({
          name: e.name || '官府士兵',
          templateId: e.templateId || 'soldier',
          level: e.level || 3,
          position: { x, y },
          stats: {
            maxHp: st.maxHp || 60, hp: st.maxHp || 60,
            attack: st.attack || 8, defense: st.defense || 5, speed: st.speed || 85
          },
          color: e.color || null,
          aiType: e.aiType || 'aggressive'
        });
        this.entityStore.addEnemy(enemy);
        if (this.aiSystem && this.aiSystem.registerAI) {
          this.aiSystem.registerAI(enemy, e.aiType || 'aggressive');
        }
        this._groupEnemies[group].push(enemy);
        total++;
      }
    }
    console.log(`[DDScene] spawnWave(${group}): 生成 ${total} 个敌人`);
  }

  /**
   * ⑤ 启动倒计时切幕（动作 sceneCountdown）。
   * 与旧 Act1 一致：倒计时结束 → triggerPlayerDeath → 黑屏过渡 → switchToNextScene。
   * @param {Object} p - { scene:目标场景名, seconds:倒计时秒数(默认20), text:提示文案 }
   * @private
   */
  _startSceneCountdown(p = {}) {
    if (this._countdown) return; // 已在倒计时
    this._countdown = {
      scene: p.scene || 's1-1',
      remain: p.seconds != null ? p.seconds : 20,
      text: p.text || '战斗结束！可以拾取物品'
    };
    // 退出战斗状态，方便玩家拾取物品
    if (this.combatSystem && this.combatSystem.isInCombat()) {
      this.combatSystem.exitCombat();
    }
  }

  /** @private 倒计时刷新 + 到点触发死亡过渡（与旧 Act1 一致） */
  _updateSceneCountdown(deltaTime) {
    if (!this._countdown) return;
    this._countdown.remain -= deltaTime;
    const sec = Math.max(0, Math.ceil(this._countdown.remain));
    this._showScreenTip(`${this._countdown.text}。${sec}秒后进入下一幕`, { persist: true });
    if (this._countdown.remain <= 0) {
      const scene = this._countdown.scene;
      this._countdown = null;
      this._hideScreenTip();
      // 与旧 Act1 一致：设 HP=0 + 黑屏过渡 + switchToNextScene
      this._nextSceneTarget = scene;
      this._triggerPlayerDeath();
    }
  }

  /**
   * 模拟旧 Act1 的 triggerPlayerDeath：HP=0 → 1秒后 startTransition → switchToNextScene
   * @private
   */
  _triggerPlayerDeath() {
    if (this._playerDiedTriggered) return;
    this._playerDiedTriggered = true;
    console.log('[DDScene] triggerPlayerDeath: 触发死亡过渡');
    const stats = this.playerEntity && this.playerEntity.getComponent('stats');
    if (stats) stats.hp = 0;
    this.resourceScope?.setTimeout(
      () => this.startTransition('眼前一黑，你晕了过去...'),
      1000
    );
  }

  /**
   * 覆盖 BaseGameScene.switchToNextScene：传送到数据指定的目标区块
   */
  switchToNextScene() {
    const scene = this._nextSceneTarget || 's1-1';
    console.log('[DDScene] switchToNextScene → teleportToChunk:', scene);
    this.teleportToChunk({ scene, transition: 'fadeBlack' });
  }

  /**
   * 大地图内传送：移动玩家到目标 chunk 的世界坐标
   * @param {Object} p - { scene, spawnRef, x, y, transition, region }
   * @returns {Promise|void}
   */
  teleportToChunk(p = {}) {
    const sceneId = p.sceneId || p.scene;
    return this._chunkNavigator?.teleport({ ...p, sceneId });
  }

  /**
   * 淡黑过渡（0.3s 淡黑 → 执行回调 → 0.3s 淡出）
   * 对外保持旧契约：完成 resolve true，取消/被替换 resolve false。
   * @private
   */
  _fadeTransition(callback) {
    if (!this._fadeOverlayTransition) return Promise.resolve(false);
    return this._fadeOverlayTransition.start(callback)
      .then(result => !result?.cancelled);
  }

  /** @private 每帧更新传送淡黑效果 */
  _updateTeleportFade(dt) {
    this._fadeOverlayTransition?.update(dt);
  }

  /** @private 渲染传送淡黑遮罩 */
  _renderTeleportFade(ctx) {
    this._fadeOverlayTransition?.render(ctx, {
      width: this.logicalWidth,
      height: this.logicalHeight
    });
  }

  /**
   * 从 worldMap grid 中查找目标 sceneId 的 chunk 位置
   * @private
   * @returns {{col, row}|null}
   */
  _findChunkInGrid(sceneId) {
    const region = this._worldRegion;
    if (!region || !region.grid) return null;
    for (let row = 0; row < region.grid.length; row++) {
      const rowArr = region.grid[row];
      if (!rowArr) continue;
      for (let col = 0; col < rowArr.length; col++) {
        if (rowArr[col] === sceneId) return { col, row };
      }
    }
    return null;
  }

  /**
   * 从目标场景的 terrain 数据中查找 spawn 点
   * @private
   */
  _findSpawnInChunk(sceneId, spawnRef) {
    for (const t of this._terrains || []) {
      if (t._editorSceneId !== sceneId) continue;
      const scene = t._sceneDataRaw;
      if (!scene || !Array.isArray(scene.layers)) continue;
      for (const layer of scene.layers) {
        if (!Array.isArray(layer.objects)) continue;
        for (const obj of layer.objects) {
          if (obj.type === 'spawn' && obj.ref === spawnRef) {
            return { x: obj.x, y: obj.y };
          }
        }
      }
    }
    return null;
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

  /**
   * NPC 交互检测：遍历已生成的 NPC，玩家在交互范围内时：
   * - trigger==='approach'：进入范围自动触发一次
   * - trigger==='interact'：按 E / 点击 NPC 触发
   * 触发内容：优先对话(dialogueId)，其次商店(shopId)。同时 fire('interact',{target:npcId})。
   *
   * 对话已讲完（DialogueSystem.hasCompleted）且未标记 repeatableDialogue 时，不再重播剧情：
   * 有商店则开商店，否则飘一句"XXX 看了你一眼，继续忙事情去了。"
   * @private
   */
  _checkNpcInteract() {
    const npcs = this._npcEntities;
    if (!npcs || npcs.length === 0) return;
    const pt = this.playerEntity && this.playerEntity.getComponent('transform');
    if (!pt) return;
    // 对话进行中不重复触发
    if (this.dialogueSystem && this.dialogueSystem.isDialogueActive && this.dialogueSystem.isDialogueActive()) return;

    const ePressed = this.inputManager.isKeyDown('e') || this.inputManager.isKeyDown('E');
    const clicked = this.inputManager.isMouseClicked && this.inputManager.isMouseClicked() && !this.inputManager.isMouseClickHandled();
    const m = this.inputManager.mouse;

    for (const npc of npcs) {
      const nt = npc.getComponent('transform');
      const nc = npc.getComponent('npc');
      if (!nt || !nc || !nc.hasInteraction()) continue;

      const dist = Math.hypot(nt.position.x - pt.position.x, nt.position.y - pt.position.y);
      const inRange = dist <= (nc.interactionRadius || 60);
      nc.inRange = inRange;

      const doInteract = () => {
        this.gameLoader && this.gameLoader.triggerSystem.fire('interact', { target: nc.npcId });

        const ds = this.dialogueSystem;
        const dialogueDone = !!(nc.dialogueId && ds && ds.hasCompleted && ds.hasCompleted(nc.dialogueId));
        const canTalk = nc.dialogueId && ds && ds.startDialogue && (nc.repeatableDialogue || !dialogueDone);

        if (canTalk) {
          ds.startDialogue(nc.dialogueId);
        } else if (nc.shopId && this.shopSystem && this.shopSystem.openShop) {
          this.shopSystem.openShop(nc.shopId);
        } else if (dialogueDone) {
          this._showNpcIdleText(npc, nc);
        }
      };

      if (nc.interactionTrigger === 'approach') {
        // 靠近自动触发一次
        if (inRange && !nc.interacted) {
          nc.interacted = true;
          doInteract();
          return;
        }
        if (!inRange) nc.interacted = false;
      } else {
        // 按 E 或点击 NPC
        if (!inRange) continue;
        let clickedNpc = false;
        if (clicked && m) {
          const sp = npc.getComponent('sprite');
          const hh = (sp?.height || 48) * (sp?.scale || 1);
          const hw = (sp?.width || 32) * (sp?.scale || 1);
          if (Math.abs(m.worldX - nt.position.x) <= hw / 2 + 10 && (nt.position.y - m.worldY) <= hh + 10 && (m.worldY - nt.position.y) <= 20) {
            clickedNpc = true;
          }
        }
        if (ePressed || clickedNpc) {
          if (clickedNpc) this.inputManager.markMouseClickHandled && this.inputManager.markMouseClickHandled();
          doInteract();
          return;
        }
      }
    }
  }

  /**
   * 对话已讲完的 NPC 再次交互时的反馈：NPC 头顶飘一句忙碌台词。
   * 带 2 秒节流，避免按住 E 时每帧刷屏。
   * @param {Entity} npc
   * @param {NpcComponent} nc
   * @private
   */
  _showNpcIdleText(npc, nc) {
    const now = performance.now();
    if (nc._idleTextAt && now - nc._idleTextAt < 2000) return;
    nc._idleTextAt = now;

    const nameC = npc.getComponent && npc.getComponent('name');
    const npcName = (nameC && nameC.name) || npc.name || nc.npcId || '';
    const text = nc.getIdleText ? nc.getIdleText(npcName) : `${npcName} 看了你一眼，继续忙事情去了。`;

    const nt = npc.getComponent('transform');
    if (nt && this.floatingTextManager) {
      const sp = npc.getComponent('sprite');
      const height = (sp?.height || 48) * (sp?.scale || 1);
      this.floatingTextManager.addText(nt.position.x, nt.position.y - height - 20, text, '#cccccc');
    }
    if (this.notificationSystem) this.notificationSystem.addNotification(text, 'info');
  }

  /**
   * 覆盖父类：装备变更回调 → fire('equipItem') 事件源
   * 触发器可监听 equipItem 来做"装备武器后刷怪"等逻辑。
   *
   * slot 用内容侧的逻辑名（武器统一为 'weapon'），因为 EquipmentComponent 的真实槽位叫
   * 'mainhand'，而 game.project.json 的触发器写的是 'weapon'。
   *
   * @param {string[]} messages
   * @param {Object} [info] - { slot, item, oldItem, action }，来自知道细节的调用方
   */
  onEquipmentChanged(messages, info = null) {
    super.onEquipmentChanged(messages, info);
    if (!this.gameLoader) return;

    const eq = this.playerEntity && this.playerEntity.getComponent('equipment');
    const slots = (eq && eq.slots) || {};
    // 槽位：优先用调用方给的真实槽位，否则兜底按主手武器推断（旧路径不传 info）
    const rawSlot = (info && info.slot) || (slots.mainhand ? 'mainhand' : 'weapon');
    const slot = rawSlot === 'mainhand' ? 'weapon' : rawSlot;
    // 卸下用独立事件，否则"卸下武器"也会命中 equipItem 触发器（如误刷野狗）
    const isUnequip = !!(info && info.action === 'unequip');
    const changed = isUnequip
      ? (info.oldItem || null)
      : ((info && info.item) || slots[rawSlot] || slots.mainhand || slots.weapon || null);

    this.gameLoader.triggerSystem.fire(isUnequip ? 'unequipItem' : 'equipItem', {
      slot,
      rawSlot,
      item: changed ? (changed.id || changed.name || '') : ''
    });
  }

  /**
   * 检测场景触发器的「靠近 approach」事件：
   * 遍历放置点中 event==='approach' 的触发器，检测玩家是否在其 radius 范围内。
   * 进入范围时 fire('approach', { target, triggerId })，离开时 fire('leave', { target, triggerId })。
   * @private
   */
  _checkApproachTriggers() {
    if (!this.gameLoader) return;
    const pt = this.playerEntity && this.playerEntity.getComponent('transform');
    if (!pt) return;
    const px = pt.position.x;
    const py = pt.position.y;

    // 从所有地形场景的逻辑层收集 approach 触发器
    if (!this._approachTriggers) {
      this._approachTriggers = [];
      this._approachState = {}; // triggerId → boolean (是否在范围内)
      // 从 _placements 中找 approach 类型触发器
      for (const pl of (this._placements || [])) {
        if (pl.type === 'trigger' && pl.event === 'approach') {
          this._approachTriggers.push(pl);
          this._approachState[pl.triggerId || pl.id] = false;
        }
      }
      // 也从场景数据中直接收集（可能不在 placements 中）
      for (const t of this._terrains || []) {
        if (!t._sceneDataRaw) continue;
        const scene = t._sceneDataRaw;
        if (!Array.isArray(scene.layers)) continue;
        for (const layer of scene.layers) {
          for (const obj of (layer.objects || [])) {
            if (obj.type === 'trigger' && obj.event === 'approach') {
              // 加上该地形的 worldOffset
              const wo = t.worldOffset || { x: 0, y: 0 };
              const key = obj.triggerId || obj.id;
              if (this._approachState[key] !== undefined) continue; // 已收集
              this._approachTriggers.push({
                ...obj,
                x: obj.x + (obj.width || 0) / 2 + wo.x,
                y: obj.y + (obj.height || 0) / 2 + wo.y
              });
              this._approachState[key] = false;
            }
          }
        }
      }
    }

    const trig = this.gameLoader.triggerSystem;
    for (const at of this._approachTriggers) {
      const key = at.triggerId || at.id;
      const radius = at.radius || 60;
      const tx = at.x + (at.width ? at.width / 2 : 0);
      const ty = at.y + (at.height ? at.height / 2 : 0);
      const dist = Math.hypot(px - tx, py - ty);
      const inRange = dist <= radius;
      const wasInRange = this._approachState[key];

      if (inRange && !wasInRange) {
        // 进入范围
        this._approachState[key] = true;
        trig.fire('approach', { target: at.target || '', triggerId: key });
      } else if (!inRange && wasInRange) {
        // 离开范围
        this._approachState[key] = false;
        trig.fire('leave', { target: at.target || '', triggerId: key });
      }
    }
  }

  /** 相机后处理：限制在大地图边缘（被 BaseGameScene.update 调用） */
  postCameraUpdate() {
    this.clampCameraToWorldBounds();
  }

  /**
   * 装配 GameProject（触发器/黑板/对话/任务），fire(sceneEnter)。showTip 走屏幕居中提示。
   * @private
   */
  _initGameLoader() {
    try {
      const eng = window.gameEngine;
      const bridge = new SceneGameLoaderBridge({
        scope: this.resourceScope,
        dialogueSystem: this.dialogueSystem,
        deps: {
          dialogueSystem: this.dialogueSystem,
          questSystem: this.questSystem,
          combatSystem: this.combatSystem,
          sceneManager: eng ? eng.sceneManager : (this.sceneManager || null),
          audioManager: this.audioManager || (eng && eng.audioManager) || null,
          floatingText: this.floatingTextManager,
          scene: this
        },
        onShowTip: text => this._showScreenTip(text || ''),
        onItemGained: (item, player) => this.onItemGained(item, player || this.playerEntity),
        getPlayer: () => this.playerEntity || null
      });
      this._gameLoaderBridge = bridge;
      this.resourceScope?.track(() => bridge.dispose());

      const ready = bridge.initialize({
        projectUrl: 'game.project.json',
        sceneFlag: 'ddScene',
        sceneId: 'scene_Prologue',
        registerActions: (trig, gameLoader) => this._registerGameLoaderActions(trig, gameLoader),
        onReady: (gameLoader, trig) => {
          const offTriggerLog = trig.on((evt, t) => {
            if (evt === 'triggerStart') console.log('[DDScene][Trigger] 执行:', t.id, t.do);
          });
          this.resourceScope?.track(offTriggerLog);
        }
      });
      // initialize() 在首次 await 前已创建 loader；立即保留旧字段投影。
      this.gameLoader = bridge.loader;
      this._gameLoaderReady = ready.then(this.resourceScope.guard(gameLoader => {
        if (this._gameLoaderBridge !== bridge || bridge.loader !== gameLoader) return gameLoader;
        this.gameLoader = gameLoader;
        console.log('%c[DDScene][GameLoader] 装配完成，触发器数量:', 'color:#4CAF50', gameLoader.triggerSystem.triggers.length);
        return gameLoader;
      })).catch(this.resourceScope.guard(
        e => console.error('[DDScene][GameLoader] 加载失败:', e)
      ));
    } catch (e) {
      console.warn('[DDScene][GameLoader] 初始化失败:', e);
    }
  }

  /** 将本场景现有触发动作注册到 SceneGameLoaderBridge 创建的 loader。 */
  _registerGameLoaderActions(trig, gameLoader) {
    // 场景专属动作：点燃火堆（触发器 do:lightCampfire 调用）
    trig.registerAction('lightCampfire', () => this.lightCampfire());
    // 场景专属动作：按组激活场景放置点（方案A）—— 明细来自内容库定义，位置来自场景放置点
    trig.registerAction('spawnGroup', (p) => this._spawnGroup(p));
    // 场景专属动作：倒计时后触发死亡过渡→传送到目标区块
    trig.registerAction('sceneCountdown', (p) => this._startSceneCountdown(p));
    // 场景专属动作：提示切幕（等待按 N 或交互键 E 再传送）
    trig.registerAction('promptSwitch', (p) => this._startPromptSwitch(p));
    // 大地图传送（直接传送到指定区块，不切换独立场景）
    trig.registerAction('teleportToChunk', (p) => this.teleportToChunk(p));
    // 切换到独立场景（离开大地图，进入副本/过场等独立场景）
    trig.registerAction('switchScene', (p) => {
      const scene = p.scene || p.target;
      if (!scene) { console.warn('[DDScene] switchScene: 缺少 scene 参数'); return; }
      console.log('[DDScene] switchScene →', scene);
      const sm = (window.gameEngine && window.gameEngine.sceneManager) || this.sceneManager;
      if (sm && sm.switchTo) sm.switchTo(scene, p);
    });
    // 通用动作：切换调试面板
    trig.registerAction('toggleDebug', () => this._toggleDebugPanel());
    // 天气系统动作
    trig.registerAction('setWeather', (p) => {
      if (this.weatherSystem && p.type) this.weatherSystem.setWeather(p.type, p);
    });
    // 时间系统动作
    trig.registerAction('setTime', (p) => {
      if (this.timeSystem && p.period) this.timeSystem.setTimePeriod(p.period);
    });
    // 场景专属动作：提示按 N 进入下一波（第一波打完→等按N→第二波）
    trig.registerAction('promptNextWave', (p) => this._startPromptNextWave(p));
    // 场景专属动作：逐渐生成饥民（第二波，从四面八方涌入）
    trig.registerAction('spawnStarvingWave', (p) => this._startStarvingWave(p));
    // 场景专属动作：批量生成一波敌人（第五幕战役，小兵+名将）
    trig.registerAction('spawnWave', (p) => this._spawnWave(p));
    // 场景专属动作：选择职业（第四幕，对话结束后由 dialogueEnd 触发器调用）
    trig.registerAction('selectClass', (p) => this._selectClass(p));
    // 场景专属动作：弹出职业确认窗口（第四幕，对话结束后调用；玩家点确认才真正选职业）
    trig.registerAction('confirmClass', (p) => this._showClassConfirmation(p));
    // 通用动作：标记当前幕完成 → fire('sceneComplete') 供 promptSwitch 切幕触发器响应
    trig.registerAction('completeScene', (p = {}) => {
      const sceneId = p.sceneId || p.scene;
      if (!sceneId) { console.warn('[DDScene] completeScene: 缺少 sceneId'); return; }
      console.log('[DDScene] completeScene →', sceneId);
      trig.fire('sceneComplete', { sceneId });
    });
    // 通用动作：关闭获得物品弹窗（剧情自动推进前调用，避免弹窗与对话冲突）
    trig.registerAction('dismissPopup', () => {
      if (this.itemGainedPopup && this.itemGainedPopup.visible) {
        this.itemGainedPopup.hide();
      }
      this._gainedQueue = [];
    });
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

    // 点燃火堆后驱散开场薄雾
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

    const result = this._placementSpawner.spawnGroup({ group, placements, registries: reg });
    for (const entry of result.errors) {
      if (entry.reason === 'definitionNotFound') {
        console.warn('[DDScene] spawnGroup 未找到定义', entry.kind, entry.ref);
      }
    }

    // 保持旧计数口径：静态 worldProp 归入“其它”。
    let worldPropN = 0;
    for (const pl of placements) {
      if (pl.kind !== 'item') continue;
      const baseDef = reg[this._regKey(pl.kind)]?.get(pl.ref);
      const def = pl.overrides ? this._mergeOverrides(baseDef, pl.overrides) : baseDef;
      if (def?.worldProp) worldPropN++;
    }
    const itemN = Math.max(0, result.counts.item - worldPropN);
    const eqN = result.counts.equipment;
    const entN = worldPropN + result.counts.enemy + result.counts.npc +
      result.counts.building + result.counts.vehicle;
    console.log(`[DDScene] spawnGroup(${group}): 物品${itemN} 装备${eqN} 其它${entN}`);
  }

  /**
   * 合并放置点覆盖到库定义（不修改库定义本身）。
   * 普通对象递归合并一层，这样只覆盖 interaction.radius 时不会丢掉库里的 prompt/trigger；
   * 数组与基本类型直接整体替换。
   * @param {Object} base - 内容库定义
   * @param {Object} overrides - 放置点上的覆盖
   * @returns {Object} 新对象
   * @private
   */
  _mergeOverrides(base, overrides) {
    const out = { ...base };
    for (const [k, v] of Object.entries(overrides || {})) {
      const isPlain = v && typeof v === 'object' && !Array.isArray(v);
      const basePlain = out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]);
      out[k] = (isPlain && basePlain) ? this._mergeOverrides(out[k], v) : v;
    }
    return out;
  }

  /** kind → registries 键名 */
  _regKey(kind) {
    return ({ item: 'items', equipment: 'equipment', npc: 'npcs', enemy: 'enemies', shop: 'shops', vehicle: 'vehicles', building: 'buildings' })[kind] || null;
  }

  /**
   * 弹出职业确认窗口（Canvas 绘制）。玩家点"确认"后调用 _selectClass，点"取消"关闭。
   * @param {Object} p - { classId }
   * @private
   */
  _showClassConfirmation(p = {}) {
    const classId = p.classId || p.class || 'warrior';
    if (this._classSelected) return;

    const classNames = { warrior: '战士', archer: '弓箭手', mage: '法师' };
    const className = classNames[classId] || classId;

    // 存到实例上，由 render 绘制、update 检测点击
    this._classConfirm = {
      classId,
      className,
      confirmHover: false,
      cancelHover: false
    };
    console.log(`[DDScene] 显示职业确认窗口: ${className}`);
  }

  /**
   * 每帧检测职业确认窗口的按钮点击（在 update 中调用）
   * @private
   */
  _updateClassConfirmation() {
    const cf = this._classConfirm;
    if (!cf || !this.inputManager) return;

    const w = 380, h = 180;
    const px = (this.logicalWidth - w) / 2;
    const py = (this.logicalHeight - h) / 2;
    const btnW = 110, btnH = 38;
    const btnY = py + h - 56;
    const confirmX = px + w / 2 - btnW - 12;
    const cancelX = px + w / 2 + 12;

    const mouse = this.inputManager.getMousePosition();
    cf.confirmHover = mouse.x >= confirmX && mouse.x <= confirmX + btnW && mouse.y >= btnY && mouse.y <= btnY + btnH;
    cf.cancelHover = mouse.x >= cancelX && mouse.x <= cancelX + btnW && mouse.y >= btnY && mouse.y <= btnY + btnH;

    if (!this.inputManager.isMouseClicked() || this.inputManager.isMouseClickHandled()) return;

    if (cf.confirmHover) {
      this.inputManager.markMouseClickHandled();
      this._classConfirm = null;
      this._selectClass({ classId: cf.classId });
    } else if (cf.cancelHover) {
      this.inputManager.markMouseClickHandled();
      this._classConfirm = null;
      console.log('[DDScene] 取消职业选择');
    }
  }

  /**
   * 渲染职业确认窗口（在 render 中调用）
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  _renderClassConfirmation(ctx) {
    const cf = this._classConfirm;
    if (!cf) return;

    const w = 380, h = 180;
    const px = (this.logicalWidth - w) / 2;
    const py = (this.logicalHeight - h) / 2;

    ctx.save();
    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    // 面板背景
    ctx.fillStyle = 'rgba(16,24,40,0.95)';
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, 10);
    ctx.fill();
    ctx.stroke();
    // 标题
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('确认职业选择', px + w / 2, py + 18);
    // 说明文字
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px Arial';
    ctx.fillText(`确定要选择「${cf.className}」吗？选择后不可更改。`, px + w / 2, py + 60);
    // 按钮
    const btnW = 110, btnH = 38;
    const btnY = py + h - 56;
    const confirmX = px + w / 2 - btnW - 12;
    const cancelX = px + w / 2 + 12;
    // 确认按钮
    ctx.fillStyle = cf.confirmHover ? '#5dba68' : '#4CAF50';
    ctx.beginPath();
    ctx.roundRect(confirmX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 15px Arial';
    ctx.fillText('确认', confirmX + btnW / 2, btnY + 10);
    // 取消按钮
    ctx.fillStyle = cf.cancelHover ? '#555' : '#3a3a3a';
    ctx.beginPath();
    ctx.roundRect(cancelX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cancelX, btnY, btnW, btnH, 6);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText('取消', cancelX + btnW / 2, btnY + 10);
    ctx.restore();
  }

  /**
   * 数据驱动：选择职业（第四幕）。触发器 dialogueEnd{id:warrior_intro/archer_intro} → selectClass{classId}
   * @private
   */
  _selectClass(p = {}) {
    const classType = p.classId || p.class || ClassType.WARRIOR;
    if (this._classSelected) { console.log('[DDScene] 已选择过职业，忽略'); return; }
    // 懒创建职业系统（复用框架 ClassSystem）
    if (!this.classSystem) this.classSystem = new ClassSystem();
    const ok = this.classSystem.selectClass('player', classType);
    if (!ok) { console.warn('[DDScene] selectClass 失败:', classType); return; }
    this._classSelected = true;
    this.selectedClass = classType;

    // 更新玩家实体职业/技能点
    if (this.playerEntity) {
      const stats = this.playerEntity.getComponent('stats');
      if (stats) {
        stats.class = classType;
        stats.skillPoints = (stats.skillPoints || 0) + 5;
        const classData = this.classSystem.getClassData(classType);
        if (classData && typeof stats.setUnitType === 'function' && classData.baseUnitType != null) {
          stats.setUnitType(classData.baseUnitType);
        }
      }
    }

    // 给予职业初始装备（放进背包）
    try {
      const startingEquipment = this.classSystem.getStartingEquipment(classType) || [];
      const inventory = this.playerEntity && this.playerEntity.getComponent('inventory');
      if (inventory) {
        for (const eq of startingEquipment) {
          const isAmmo = eq.type === 'ammo';
          const item = {
            id: eq.id,
            name: eq.name,
            type: isAmmo ? 'equipment' : 'equipment',
            subType: isAmmo ? 'ammo' : eq.type,
            rarity: 1,
            maxStack: isAmmo ? 99 : 1,
            stats: {}
          };
          inventory.addItem(item, isAmmo ? (eq.quantity || 30) : 1);
        }
      }
    } catch (e) { console.warn('[DDScene] 发放职业装备失败:', e); }

    const className = ClassNames[classType] || classType;
    if (this.notificationSystem && this.notificationSystem.notify) {
      this.notificationSystem.notify(`你选择了 ${className} 职业！`, 'success');
    } else {
      this._showScreenTip && this._showScreenTip(`你选择了 ${className} 职业！`);
    }
    console.log('%c[DDScene] 选择职业:', 'color:#4CAF50', className);

    // 数据驱动事件源：可供 when:classSelected 触发器继续推进剧情
    if (this.gameLoader && this.gameLoader.triggerSystem) {
      this.gameLoader.triggerSystem.fire('classSelected', { class: classType, className });
    }
    // 同步黑板变量，供条件判定
    if (this.gameLoader && this.gameLoader.blackboard) {
      this.gameLoader.blackboard.set('selectedClass', classType);
      this.gameLoader.blackboard.set('classSelected', true);
    }
  }

  /**
   * 加载场景放置点（type:'ref'/'spawn'）：从 game.project.json 的 worldMap 动态读取所有场景
   * @private
   */
  _loadScenePlacements() {
    const loadPromise = this._worldLoadPromise;
    if (!loadPromise) return;

    loadPromise.then(this.resourceScope.guard(result => {
      if (!result.region) {
        console.warn('[DDScene] game.project.json 无 worldMap 配置');
      }
      const placements = result.placements || [];
      this._placements = placements;
      this._applySpawnPoints(placements);
      this._worldReadyGate?.resolve('placements', placements);
      this._syncWorldReadyProjection();
    })).catch(this.resourceScope.guard(e => {
      console.warn('[DDScene] 加载 game.project.json 失败:', e);
      this._placements = [];
      this._applySpawnPoints(this._placements);
      this._worldReadyGate?.resolve('placements', this._placements);
      this._syncWorldReadyProjection();
    }));
  }

  /**
   * 从场景数据中收集放置点，坐标加 offset
   * @private
   */
  _collectPlacements(scene, placements, offset) {
    if (!scene || !Array.isArray(scene.layers)) return;
    for (const layer of scene.layers) {
      for (const o of (layer.objects || [])) {
        if (o.type === 'ref' || o.type === 'spawn' || o.type === 'trigger') {
          placements.push({
            ...o,
            x: o.x + (offset ? offset.x : 0),
            y: o.y + (offset ? offset.y : 0)
          });
        }
      }
    }
  }

  /**
   * 应用出生点（火堆 + 玩家）
   * @private
   */
  _applySpawnPoints(placements) {
    // 从编辑器放置点读取火堆位置（type:'spawn', ref:'campfire'）
    const campfireSpawn = placements.find(pl => pl.type === 'spawn' && pl.ref === 'campfire');
    if (campfireSpawn) {
      this.campfire.x = campfireSpawn.x;
      this.campfire.y = campfireSpawn.y;
    } else {
      this.campfire.x = 350 + (this._prologueOffset ? this._prologueOffset.x : 0);
      this.campfire.y = 250 + (this._prologueOffset ? this._prologueOffset.y : 0);
    }

    // 从编辑器放置点读取玩家出生点（type:'spawn', ref:'player'）
    const playerSpawn = placements.find(pl => pl.type === 'spawn' && (pl.ref === 'player' || pl.kind === 'player'));
    if (playerSpawn) {
      const pt = this.playerEntity && this.playerEntity.getComponent('transform');
      if (pt) {
        pt.position.x = playerSpawn.x;
        pt.position.y = playerSpawn.y;
      }
    } else {
      const pt = this.playerEntity && this.playerEntity.getComponent('transform');
      if (pt) {
        pt.position.x = this.campfire.x + 70;
        pt.position.y = this.campfire.y + 80;
      }
    }

    // 出生点定位完成后，把相机同步到玩家最终位置（避免相机残留在旧位置造成跳变）
    const finalPt = this.playerEntity && this.playerEntity.getComponent('transform');
    if (this.camera && finalPt) {
      this.camera.setPosition(finalPt.position.x, finalPt.position.y);
    }

    console.log('[DDScene] 场景放置点:', placements.length, '玩家:',
      this.playerEntity?.getComponent('transform')?.position, '火堆:', this.campfire.x, this.campfire.y);
  }

  /**
   * 从 game.project.json 的 worldMap 动态创建地形实例
   * @private
   */
  _loadWorldTerrains() {
    const loadPromise = this._worldLoadPromise;
    if (!loadPromise) return;

    loadPromise.then(this.resourceScope.guard(result => {
      const project = result.project;
      const region = result.region;
      this._worldRegion = region;
      this.context.world.region = region;
      this._terrains.length = 0;
      this.terrain = null;
      this.terrainAct1 = null;

      if (region) {
        const chunkWidth = Number(region.chunkWidth) || 1280;
        const chunkHeight = Number(region.chunkHeight) || 720;
        for (const chunk of result.chunks) {
          const terrain = new Scene1Terrain({
            centerX: chunkWidth / 2,
            centerY: chunkHeight / 2,
            width: chunkWidth,
            height: chunkHeight,
            editorSceneId: chunk.sceneId,
            worldOffset: chunk.offset,
            skipEditorLoad: true,
            // 每个 terrain 持有独立数据副本，避免重复 sceneId 的 chunk 共享可变对象。
            sceneData: chunk.sceneData && Array.isArray(chunk.sceneData.layers)
              ? JSON.parse(JSON.stringify(chunk.sceneData))
              : null
          });
          this._terrains.push(terrain);
          if (!this.terrain) this.terrain = terrain;
        }
      }

      // 兼容旧代码中 terrainAct1 的引用
      if (this._terrains.length > 1) this.terrainAct1 = this._terrains[0];
      this.context.world.terrain = this.terrain;
      this.context.world.terrains = this._terrains;

      // 加载天气和时间系统配置
      if (project?.system) {
        if (project.system.weather) {
          this.weatherSystem = new WeatherSystem(project.system.weather);
        }
        if (project.system.time) {
          this.timeSystem = new TimeSystem(project.system.time);
        }
      }

      // effectZones 已由 session 投影到世界坐标，禁止再次叠加 worldOffset。
      this._initMultiChunkEffectZones(result.effectZones || []);
      this._worldReadyGate?.resolve('terrains', this._terrains);
      this._syncWorldReadyProjection();
    })).catch(this.resourceScope.guard(e => {
      console.warn('[DDScene] 加载 worldMap 地形失败:', e);
      this._worldReadyGate?.resolve('terrains', []);
      this._syncWorldReadyProjection();
    }));
  }

  /**
   * 多 chunk 场景的特效区域初始化：遍历所有场景文件，收集 effectZone 数据。
   * @private
   */
  _initMultiChunkEffectZones(effectZones) {
    if (!this.particleSystem) return;
    const renderer = new EffectZoneRenderer(this.particleSystem);
    this.effectZoneRenderer?.clear?.();
    this.effectZoneRenderer = renderer;
    renderer.zones = Array.isArray(effectZones) ? effectZones : [];
    renderer._accumulators = renderer.zones.map(() => 0);
    if (renderer.zones.length > 0) {
      console.log(`[DDScene] 加载了 ${renderer.zones.length} 个特效区域`);
    }
  }

  /** 将 WorldReadyGate 状态投影到旧兼容字段；真实渲染门只读取 gate。 */
  _syncWorldReadyProjection() {
    const status = this._worldReadyGate?.status;
    if (!status) return;
    const timedOut = status.state === 'timedOut';
    this._terrainsLoaded = timedOut || status.entries.terrains?.state === 'resolved';
    this._spawnApplied = timedOut || status.entries.placements?.state === 'resolved';
    this._sceneReady = status.state === 'ready' || timedOut;
  }

  /** 地形 + 放置点都就绪后开放渲染（兼容入口，真实状态来自 WorldReadyGate） */
  _checkSceneReady() {
    this._syncWorldReadyProjection();
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

  /** 渲染：父类管线 + 碰撞多边形调试层 + 传送淡黑遮罩 */
  render(ctx) {
    // 加载门：地形/放置点异步加载完成前只填背景色，避免先渲染在默认位置再"跳变"、
    // 以及编辑器数据加载前闪现程序化默认树。
    const worldGateState = this._worldReadyGate?.status.state;
    if (worldGateState !== 'ready' && worldGateState !== 'timedOut') {
      const bg = (this.terrain && this.terrain.sceneBackgroundColor) || '#1f1a14';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this.logicalWidth || (ctx.canvas && ctx.canvas.width) || 1280, this.logicalHeight || (ctx.canvas && ctx.canvas.height) || 720);
      return;
    }
    super.render(ctx);
    this._renderCollisionShapesDebug(ctx);
    this._renderTeleportFade(ctx);
    // 职业确认窗口（最上层，半透明遮罩 + 面板）
    this._renderClassConfirmation(ctx);
  }

  /** 迷雾效果层（在世界对象之后、UI 面板之前渲染） */
  renderFogLayer(ctx) {
    const w = this.logicalWidth;
    const h = this.logicalHeight;

    // 1) 时间系统：明暗度和色调叠加
    if (this.timeSystem) {
      this.timeSystem.render(ctx, w, h);
    }

    // 2) 迷雾（受时间系统 fogOpacity 调节）
    const timeFogAdd = this.timeSystem?.enabled ? this.timeSystem.getFogOpacity() : 0;
    const weatherFogAdd = this.weatherSystem ? this.weatherSystem.getFogAdd() : 0;
    const baseFogOpacity = this.fog.active ? this.fog.opacity : 0;
    const totalFogOpacity = Math.min(1, baseFogOpacity + timeFogAdd * 0.3 + weatherFogAdd);

    if (totalFogOpacity > 0.01) {
      ctx.save();
      const playerTransform = this.playerEntity && this.playerEntity.getComponent('transform');
      const viewBounds = this.camera.getViewBounds();
      if (playerTransform) {
        const playerScreenX = playerTransform.position.x - viewBounds.left;
        const playerScreenY = playerTransform.position.y - viewBounds.top;
        const lightRadius = 150;

        if (!this._fogCanvas) this._fogCanvas = document.createElement('canvas');
        if (this._fogCanvas.width !== w || this._fogCanvas.height !== h) {
          this._fogCanvas.width = w;
          this._fogCanvas.height = h;
        }
        const fogCtx = this._fogCanvas.getContext('2d');

        fogCtx.clearRect(0, 0, w, h);
        fogCtx.fillStyle = `${this.fog.color} ${totalFogOpacity})`;
        fogCtx.fillRect(0, 0, w, h);

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

        // 火堆点燃后在火堆位置也挖出 2.5D 椭圆透光区
        if (this.campfire.lit) {
          const campScreenX = this.campfire.x - viewBounds.left;
          const campScreenY = this.campfire.y - viewBounds.top;
          const campLightRadius = 150;
          fogCtx.save();
          fogCtx.translate(campScreenX, campScreenY);
          fogCtx.scale(1, yScale);
          const campGradient = fogCtx.createRadialGradient(0, 0, 0, 0, 0, campLightRadius);
          campGradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
          campGradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.8)');
          campGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          fogCtx.fillStyle = campGradient;
          fogCtx.beginPath();
          fogCtx.arc(0, 0, campLightRadius, 0, Math.PI * 2);
          fogCtx.fill();
          fogCtx.restore();
        }

        fogCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this._fogCanvas, 0, 0);
      } else {
        ctx.fillStyle = `${this.fog.color} ${totalFogOpacity})`;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    // 3) 天气粒子效果（雨、风线等）
    if (this.weatherSystem) {
      this.weatherSystem.render(ctx, w, h);
    }
  }

  /** 在迷雾之上绘制编辑器碰撞多边形调试层 */
  _renderCollisionShapesDebug(ctx) {
    if (!this.debugShowCollisionPolygons || !this.camera || !Array.isArray(this._terrains)) return;

    // 调试日志：每 60 帧打印一次，方便排查渲染是否到达此处
    if (!this._collisionDebugRenderCount) this._collisionDebugRenderCount = 0;
    this._collisionDebugRenderCount++;
    if (this._collisionDebugRenderCount % 120 === 1) {
      const shapeInfo = this._terrains.map((t, i) => {
        const s0 = t._collisionShapes?.[0];
        return `[${i}] ${t._editorSceneId}: ${t._collisionShapes?.length || 0} shapes` +
          (s0 ? `, first.points[0..1]=${JSON.stringify(s0.points?.slice(0,2))}` : '');
      });
      const vb = this.camera.getViewBounds();
      console.log('[DDScene][CollisionDebug]', shapeInfo.join(' | '),
        `| view: L=${Math.round(vb.left)} T=${Math.round(vb.top)} R=${Math.round(vb.right)} B=${Math.round(vb.bottom)}`);
    }

    ctx.save();
    const viewBounds = this.camera.getViewBounds();
    ctx.translate(-viewBounds.left, -viewBounds.top);

    // 直接遍历所有地形碰撞 shape 绘制，不走 ShapeRenderer 以确保可见
    for (const terrain of this._terrains) {
      const shapes = terrain._collisionShapes;
      if (!shapes || shapes.length === 0) continue;
      for (const shape of shapes) {
        if (shape.shapeType === 'polygon' && Array.isArray(shape.points) && shape.points.length > 2) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0][0], shape.points[0][1]);
          for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i][0], shape.points[i][1]);
          }
          ctx.closePath();
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ff9800';
          ctx.fill();
          ctx.strokeStyle = '#ff3b30';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (shape.shapeType === 'rect' || (shape.x !== undefined && shape.width)) {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ff9800';
          ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
          ctx.strokeStyle = '#ff3b30';
          ctx.lineWidth = 2;
          ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        } else if (shape.shapeType === 'ellipse' || shape.shapeType === 'circle') {
          const cx = (shape.x || 0) + (shape.width || 0) / 2;
          const cy = (shape.y || 0) + (shape.height || 0) / 2;
          const rx = (shape.width || 0) / 2;
          const ry = (shape.height || 0) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ff9800';
          ctx.fill();
          ctx.strokeStyle = '#ff3b30';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
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
    if (this._terrains.length > 0) {
      const bgColor = (this.terrain && this.terrain.sceneBackgroundColor) || '#1f1a14';
      ctx.fillStyle = bgColor;
      const vb = this.camera.getViewBounds();
      ctx.fillRect(vb.left, vb.top, vb.right - vb.left, vb.bottom - vb.top);
      for (const t of this._terrains) t.renderGround(ctx);
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

    for (const t of this._terrains) {
      t.renderBelowDecorations(ctx);
      t.collectDecorations(renderQueue, ctx);
    }

    renderQueue.sort((a, b) => a.y - b.y);
    for (const item of renderQueue) {
      if (item.type === 'entity') this.renderEntity(ctx, item.entity);
      else if (item.render) item.render();
    }

    for (const t of this._terrains) t.renderCliffs(ctx);

    // 渲染 Buff 多边形区域
    this._renderBuffZones(ctx);
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
      ctx.fillText(InputHints.format('{interact}点燃'), x, y - 40);
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

  /** 限制相机在盆地范围内 — 大地图模式下不限制 */
  clampCameraToBasin() {
    // if (!this.terrain || !this.camera) return;
    // const t = this.terrain;
    // const halfW = this.camera.width / 2;
    // const halfH = this.camera.height / 2;
    // const maxCamX = t.basinRadiusX - halfW;
    // const maxCamY = t.basinRadiusY - halfH;
    // const clampX = maxCamX > 0 ? Math.max(-maxCamX, Math.min(maxCamX, this.camera.position.x - t.centerX)) : 0;
    // const clampY = maxCamY > 0 ? Math.max(-maxCamY, Math.min(maxCamY, this.camera.position.y - t.centerY)) : 0;
    // this.camera.position.x = t.centerX + clampX;
    // this.camera.position.y = t.centerY + clampY;
  }

  /** 限制相机不超出大地图世界边界 */
  clampCameraToWorldBounds() {
    if (!this.camera) return;
    // 从 worldMap region 动态计算大地图尺寸
    const region = this._worldRegion;
    const cols = region ? region.cols : 4;
    const rows = region ? region.rows : 4;
    const chunkW = region ? region.chunkWidth : 1280;
    const chunkH = region ? region.chunkHeight : 720;
    const worldWidth = cols * chunkW;
    const worldHeight = rows * chunkH;

    const halfW = this.camera.width / 2;
    const halfH = this.camera.height / 2;

    this.camera.position.x = Math.max(halfW, Math.min(worldWidth - halfW, this.camera.position.x));
    this.camera.position.y = Math.max(halfH, Math.min(worldHeight - halfH, this.camera.position.y));
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
    if (!this._ctcFirstLog) { console.log('%c[DDScene] checkTerrainCollision 进入方法体', 'color:lime;font-size:14px'); this._ctcFirstLog = true; }
    if (this._terrains.length === 0) { if (!this._noTerrainLogged) { console.warn('[DDScene] checkTerrainCollision: 地形未加载'); this._noTerrainLogged = true; } return; }
    const t = this.terrain || this._terrains[0];
    if (!this._collisionInitLogged) {
      console.log('[DDScene] checkTerrainCollision, collisionShapes:', t._collisionShapes?.length,
        'act1 shapes:', this.terrainAct1?._collisionShapes?.length);
      if (t._collisionShapes) {
        for (let i = 0; i < Math.min(3, t._collisionShapes.length); i++) {
          const s = t._collisionShapes[i];
          console.log(`[DDScene] shape[${i}]: type=${s.shapeType}, points前3个=`,
            s.points ? s.points.slice(0, 3) : 'NO POINTS');
        }
      }
      const pt = this.playerEntity?.getComponent('transform');
      console.log('[DDScene] 玩家位置:', pt ? `(${Math.round(pt.position.x)},${Math.round(pt.position.y)})` : 'null');
      this._collisionInitLogged = true;
    }
    this._terrainBinding.checkTerrainCollision();
  }
}

export default DataDrivenPrologueScene;
