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
import { RegionCoordinator } from '../../../src/core/scene/RegionCoordinator.js';
import { WorldReadyGate } from '../../../src/core/scene/WorldReadyGate.js';
import { ChunkNavigator } from '../../../src/core/scene/ChunkNavigator.js';
import { PlacementSpawner } from '../../../src/core/scene/PlacementSpawner.js';
import { FadeOverlayTransition } from '../../../src/core/scene/FadeOverlayTransition.js';
import { SceneGameLoaderBridge } from '../../../src/core/scene/SceneGameLoaderBridge.js';
import { SANGUO_ZHANGJIAO_CONTENT_POLICY } from '../config/SanguoZhangjiaoContentPolicy.js';
import { EffectZoneRenderer } from '../../../src/rendering/EffectZoneRenderer.js';
import { WeatherSystem } from '../../../src/systems/WeatherSystem.js';
import { TimeSystem } from '../../../src/systems/TimeSystem.js';
import { ClassSystem, ClassType, ClassNames } from '../../../src/systems/ClassSystem.js';
import { PadButton } from '../../../src/core/input/Xbox360Profile.js';
import { ProgressionViewModel } from '../../../src/ui/progression/ProgressionViewModel.js';
import { ProgressionPanel } from '../../../src/ui/progression/ProgressionPanel.js';
import { CityStateSummaryPanel } from '../../../src/ui/CityStateSummaryPanel.js';
import { ProficiencySystem } from '../../../src/systems/progression/ProficiencySystem.js';
import { S09AudioDirector } from '../systems/S09AudioDirector.js';

const S01_TUTORIAL_KEYS = Object.freeze([
  'move', 'attack', 'pickup', 'jump', 'gather', 'durability', 'capacity'
]);
const S01_TUTORIAL_IDS = Object.freeze(S01_TUTORIAL_KEYS.map(key => `s01.${key}`));
const S09_CITY_ID = 'city.s09_guangzong_camp';
const S09_REFUGEE_DIALOGUE_ID = 'dialogue.s09.refugeeConflict';
const S09_REFUGEE_GROUP = 'S09-refugee-conflict';
const S09_SILENCE_EVENT_TYPE = 's09.silenceFoodCollapse';

export class DataDrivenPrologueScene extends BaseGameScene {
  // 覆盖父类：DDScene 自行通过 _loadWorldTerrains 管理地形，不需要父类创建
  _initEditorTerrain() { /* 由 _loadWorldTerrains 代替 */ }

  constructor() {
    super({
      name: 'DataDrivenPrologueScene',
      title: '三国张角传',
      description: 'S01 干旱平原'
    });
    this.currentSceneId = 'S01';

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
    this.progressionViewModel = null;
    this.progressionPanel = null;
    this.proficiencySystem = null;
    this.cityStateSummaryPanel = null;
    this._progressionBootstrap = { isNewGame: false };
    this.classSystem = null;
    this._classSelected = false;
    this.selectedClass = null;
    this._classConfirm = null;
    this._classSelectionBusy = false;
    this._s09AudioDirector = null;
    this._appliedGatheringPolicyOperations = new Set();
    this._s09RefugeeChoiceBusy = false;
    this._processingDelayedStoryEvents = false;

    // 天气系统和时间系统；游戏日从 1 开始并随完整昼夜周期推进。
    this.weatherSystem = new WeatherSystem();
    this.timeSystem = new TimeSystem({ enabled: true, currentDay: 1 });
  }

  /** 由宿主在 GameLoader 完成前标记本次启动是新档还是读档。 */
  setProgressionBootstrap({ isNewGame = false } = {}) {
    this._progressionBootstrap = { isNewGame: isNewGame === true };
  }

  /** 启动闸门：只接受位于 20×20 网格 (1,1) 的 canonical S01。 */
  _validateWorldLoadResult(result) {
    const region = result?.region;
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    const grid = region?.grid;
    const chunk = result?.chunks?.find(item => item.sceneId === 'S01');
    const valid = errors.length === 0
      && region?.cols === 20
      && region?.rows === 20
      && Array.isArray(grid)
      && grid.length === 20
      && grid[1]?.[1] === 'S01'
      && chunk?.row === 1
      && chunk?.col === 1
      && chunk?.offset?.x === 1280
      && chunk?.offset?.y === 720
      && Array.isArray(chunk?.sceneData?.layers);
    if (!valid) {
      const detail = errors[0]?.message || 'S01 必须位于 20×20 网格 (1,1)，且场景 layers 必须有效';
      throw new Error(`世界内容校验失败: ${detail}`);
    }
    return result;
  }

  _createWorldLoadSession(scope = this.resourceScope) {
    const gameId = 'sanguo_zhangjiao';
    return new WorldMapLoadSession({
      scope,
      loadProject: async projectUrl => {
        const response = await fetch(projectUrl);
        if (!response.ok) throw new Error(`加载 ${projectUrl} 失败: HTTP ${response.status}`);
        return response.json();
      },
      loadScene: async sceneId => {
        const scene = await loadSceneFromFile(sceneId);
        if (!scene || !Array.isArray(scene.layers)) throw new Error(`场景 JSON 无有效 layers: ${sceneId}`);
        return scene;
      },
      loadSceneFallback: sceneId => {
        const scene = loadSceneFromStorage(gameId, sceneId);
        if (!scene || !Array.isArray(scene.layers)) throw new Error(`场景缓存无有效 layers: ${sceneId}`);
        return scene;
      }
    });
  }

  enter(data = null) {
    // 复用父类：初始化 canvas/相机/inputManager/全部系统/UI/玩家创建
    super.enter(data);
    this._configureS01Tutorial();

    this._s09AudioDirector?.dispose?.();
    const s09AudioDirector = new S09AudioDirector({ audioManager: this.audioManager });
    this._s09AudioDirector = s09AudioDirector;
    s09AudioDirector.syncScene(this.currentSceneId);
    this.resourceScope?.track(() => {
      s09AudioDirector.dispose();
      if (this._s09AudioDirector === s09AudioDirector) this._s09AudioDirector = null;
    });

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
      this._pendingResourceNodeStates?.clear?.();
      this._pendingPlacementStates?.clear?.();
      this._regionDynamicStates?.clear?.();
      this.gameLoader = null;
      this.classSystem = null;
      this.proficiencySystem = null;
      this.cityStateSummaryPanel = null;
      this._classConfirm = null;
      this._classSelectionBusy = false;
    });

    // 大地图 chunk 偏移：从 game.project.json worldMap 动态加载地形
    // 编辑器中每个 scene 的坐标是 0~chunkWidth 局部坐标，运行时加 worldOffset 转为世界坐标
    const chunkWidth = 1280;
    const chunkHeight = 720;
    this._prologueOffset = { x: 1 * chunkWidth, y: 1 * chunkHeight };

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
    const scope = this.resourceScope;
    this._worldLoadSession = this._createWorldLoadSession(scope);
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
    this._pendingResourceNodeStates = new Map();
    this._pendingPlacementStates = new Map();
    this._regionDynamicStates = new Map();
    this._currentRegionIndex = 0;
    this._worldLoadResult = null;
    this._regionCoordinator = new RegionCoordinator({
      createSession: () => this._createWorldLoadSession(this.resourceScope),
      getCurrentSession: () => this._worldLoadSession,
      captureDraft: () => ({
        saveState: this.captureSaveState(),
        worldResult: this._worldLoadResult,
        regionIndex: this._currentRegionIndex
      }),
      validateTarget: context => this._validateRegionTarget(context),
      commitTarget: context => this._commitRegionTarget(context),
      restoreDraft: context => this._restoreRegionDraft(context)
    });

    this._fadeOverlayTransition = new FadeOverlayTransition({ duration: 0.3, scope });
    this._placementSpawner = new PlacementSpawner({
      entityFactory: this.entityFactory,
      entityStore: this.entityStore,
      aiSystem: this.aiSystem,
      assetManager: this.assetManager,
      onNpcImageError: scope?.guard(({ url }) => {
        console.warn('[DDScene] NPC 图集加载失败（将用占位）:', url);
      }),
      shouldSpawn: ({ placement }) => this._shouldSpawnPlacement(placement),
      onSpawn: scope?.guard(({ entity, kind, group, placement }) => {
        if (entity && Array.isArray(placement?.tags)) {
          entity.tags = [...new Set([...(entity.tags || []), ...placement.tags])];
        }
        if (kind === 'resourceNode') this._applyPendingResourceNodeState(entity);
        if (this._applyPendingPlacementState(entity, placement)) return;
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
      onSceneEnter: async ({ sceneId, x, y }) => {
        this.currentSceneId = sceneId;
        this._s09AudioDirector?.syncScene?.(sceneId);
        if (this.gameLoader?.triggerSystem) {
          const blackboard = this.gameLoader.blackboard;
          const storyState = blackboard?.get?.('storyState');
          if (storyState) blackboard.set('storyState', { ...storyState, currentSceneId: sceneId });
          this.gameLoader.triggerSystem.fire('sceneEnter', { sceneId });
        }
        // 此时淡黑层处于完全覆盖状态；自动存档必须等 teleportToChunk 在淡入结束后再请求。
        console.log(`[DDScene] teleportToChunk → ${sceneId} (${x}, ${y})`);
      },
      onFallback: ({ reason, sceneId }) => {
        if (reason === 'missingSceneId') {
          console.warn('[DDScene] teleportToChunk: 缺少 scene 参数');
          return null;
        }
        // Act 推进必须走已配置的 chunk；不能将未知 ID 误当作旧独立场景切换。
        console.warn('[DDScene] teleportToChunk: 在 grid 中未找到', sceneId);
        return null;
      },
      transition: (type, commit) => type === 'fadeBlack' ? this._fadeTransition(commit) : commit()
    });
    this._worldLoadPromise = this._worldLoadSession
      .load({ projectUrl: 'game.project.json', regionIndex: 0 })
      .then(result => {
        const validated = this._validateWorldLoadResult(result);
        this._worldLoadResult = validated;
        return validated;
      });
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

    // 轮盘已在帧首处理 LB 输入；冻结剧情与环境更新，但保留后续帧的手柄轮询以接收松开沿。
    if (this.isSkillWheelWorldPaused) {
      this._inputFlow?.flush?.();
      return;
    }

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

    // 天气和时间系统更新；跨日后只投影一次 StoryState 并处理到期事件。
    if (this.weatherSystem) this.weatherSystem.update(deltaTime);
    if (this.timeSystem) {
      const previousDay = this.timeSystem.getCurrentDay();
      this.timeSystem.update(deltaTime);
      const currentDay = this.timeSystem.getCurrentDay();
      if (currentDay !== previousDay) this._onGameDayChanged(currentDay);
    }
    this._processDueStoryEvents();
    this._updateCityStateSummary();

    // 提示切幕已由 SceneInputFlow 在帧首统一处理，确保手柄/键鼠只消费一次。

    // 提示按 N 进入下一波（同样在 super.update 前检测按键）
    this._updatePromptNextWave();

    // 职业确认窗口检测（第四幕，确认窗口打开时优先处理点击，阻止穿透到 NPC 交互）
    this._updateClassConfirmation();

    // NPC 交互候选尚未迁移，保留现有专用路径。
    this._checkNpcInteract();

    // approach/enter/leave 统一由框架空间绑定系统处理。
    this._sceneTriggerBindings?.update();

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

    // 地形碰撞（火堆 + 水池/树/编辑器碰撞多边形）
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

  _configureS01Tutorial() {
    const tutorials = [
      ['move', '移动', '使用 {move} 移动，离开火堆附近。'],
      ['attack', '攻击', '使用 {attack} 进行一次攻击。'],
      ['pickup', '拾取', '靠近物资后使用 {pickup} 拾取。'],
      ['jump', '跳跃', '使用 {jump} 越过障碍。'],
      ['gather', '采集', '靠近资源节点后使用 {harvest} 开始采集，再按一次可取消。'],
      ['durability', '工具耐久', '再使用斧头完成一次采集。采集成功才消耗耐久，归零后本次产物仍会保留。'],
      ['capacity', '背包容量', '再完成一次采集。系统只结算背包可容纳的数量，溢出资源会留在节点中。']
    ];
    for (const [key, title, text] of tutorials) {
      this.tutorialSystem.registerTutorial(`s01.${key}`, {
        title, steps: [{ text }], category: 's01-survival', canSkip: false, autoTrigger: false
      });
    }
    this.tutorialSystem.onShow(data => {
      this._showScreenTip(data?.step?.text || '', {
        title: data?.tutorialTitle || '教学', persist: true, owner: 'tutorial'
      });
    });
    this.tutorialSystem.onHide(() => this._hideScreenTip('tutorial'));
    this.tutorialSystem.onComplete(() => {
      this.resourceScope?.setTimeout(() => this._showNextS01Tutorial(), 0);
    });
  }

  _showNextS01Tutorial() {
    if (this.currentSceneId !== 'S01' || this.tutorialSystem.isShowingTutorial()) return false;
    const next = S01_TUTORIAL_IDS.find(id => !this.tutorialSystem.isTutorialCompleted(id));
    return next ? this.tutorialSystem.showTutorial(next) : false;
  }

  _completeS01TutorialStep(key) {
    const id = `s01.${key}`;
    if (this.currentSceneId !== 'S01' || this.tutorialSystem.isTutorialCompleted(id)) return false;
    this.tutorialSystem.completeTutorial(id);
    if (!this.tutorialSystem.isShowingTutorial()) this._showNextS01Tutorial();
    return true;
  }

  onPlayerTutorialAction(action) {
    if (action === 'attack' || action === 'jump') this._completeS01TutorialStep(action);
  }

  /** S09 未许可采粮政策参与 GatheringSystem 提交，前置失败不会消耗节点或工具。 */
  prepareGatheringSettlement(context = {}) {
    const { operationId, node, owner } = context;
    if (this.currentSceneId !== 'S09' || node?.resourceType !== 'food') return null;
    if (this._appliedGatheringPolicyOperations.has(operationId)) {
      return { ok: true, idempotent: true };
    }
    const blackboard = this.gameLoader?.blackboard;
    const permissions = blackboard?.get?.('resourcePermissions') || {};
    if (permissions.S09?.food === true) return null;

    const cityStates = blackboard?.get?.('cityStates');
    const cityIndex = Array.isArray(cityStates)
      ? cityStates.findIndex(city => city?.id === 'city.s09_guangzong_camp')
      : -1;
    if (cityIndex < 0 || !owner?.id) return { ok: false, code: 'missingS09CityState' };
    const cityValidation = this.gameLoader?.contentValidator?.validate?.(
      cityStates[cityIndex], 'city', `variables.cityStates[${cityIndex}]`
    );
    if (cityValidation && !cityValidation.ok) return { ok: false, code: 'invalidS09CityState' };
    const reputationBefore = Number(blackboard.get('reputation'));
    if (!Number.isFinite(reputationBefore)) return { ok: false, code: 'invalidReputation' };

    const storyBefore = JSON.parse(JSON.stringify(blackboard.get('storyState') || {}));
    const guardIds = Array.isArray(node.guardUnitIds) ? node.guardUnitIds : [];
    const guards = guardIds
      .map(id => (this.enemies || []).find(enemy => enemy?.id === id))
      .filter(Boolean);
    if (guards.length !== guardIds.length) return { ok: false, code: 'missingS09GranaryGuards' };
    const guardStates = guards.map(guard => ({
      guard,
      state: this.aiSystem?.getRuntimeState?.(guard)
    }));

    return {
      ok: true,
      commit: () => {
        blackboard.set('reputation', Math.max(0, reputationBefore - 5));
        blackboard.set('storyState', {
          ...storyBefore,
          s09UnauthorizedHarvests: Math.max(0, Number(storyBefore.s09UnauthorizedHarvests) || 0) + 1
        });
        for (const guard of guards) {
          if (this._isEntityDead(guard)) continue;
          if (!this.aiSystem?.activateAI?.(guard, guard.aiType || 'aggressive')) {
            throw new Error(`无法激活粮仓哨兵: ${guard.id}`);
          }
        }
        this._appliedGatheringPolicyOperations.add(operationId);
        return { ok: true };
      },
      rollback: () => {
        blackboard.set('reputation', reputationBefore);
        blackboard.set('storyState', storyBefore);
        for (const entry of guardStates) {
          if (entry.state) this.aiSystem?.restoreRuntimeState?.(entry.guard, entry.state);
        }
        this._appliedGatheringPolicyOperations.delete(operationId);
      }
    };
  }

  onGatheringEvent(event, data = {}) {
    if (event === 'completed' && data.idempotent === true) {
      this._showScreenTip('该次采集已经结算，不会重复获得资源或扣除声望。');
      return;
    }
    super.onGatheringEvent(event, data);
    if (event === 'completed' && this._appliedGatheringPolicyOperations.has(data.operationId)) {
      this._showScreenTip('未获许可取走粮食：声望 -5，粮仓哨兵已被惊动。');
    }
    if (event === 'completed' && Number(data.accepted) > 0 && data.operationId) {
      const definition = this.proficiencySystem?.getDefinition?.('gathering');
      const amount = Math.max(1, Math.floor(Number(data.accepted) * (definition?.experiencePerUnit || 1)));
      const experienceResult = this.proficiencySystem?.gainExperience?.({
        characterId: this.playerEntity?.id,
        type: 'gathering',
        amount,
        operationId: `gathering:${data.operationId}`
      });
      if (experienceResult?.ok === false) {
        console.warn('[DDScene] 采集熟练度提交失败:', experienceResult.code);
      }
    }
    if (event === 'riskTriggered') {
      this.gameLoader?.triggerSystem?.fire?.('gatheringRisk', {
        riskId: data.id,
        riskType: data.type,
        nodeId: data.nodeId
      });
      return;
    }
    if (event !== 'completed') return;
    if (!this.tutorialSystem.isTutorialCompleted('s01.gather')) {
      this._completeS01TutorialStep('gather');
      return;
    }
    if (!this.tutorialSystem.isTutorialCompleted('s01.durability')) {
      if (data.toolInstanceId) this._completeS01TutorialStep('durability');
      return;
    }
    this._completeS01TutorialStep('capacity');
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

    // playerMoved：完成事实只存 TutorialSystem.completedTutorials。
    const t = this.playerEntity && this.playerEntity.getComponent('transform');
    if (t) {
      if (!this._startPos) this._startPos = { x: t.position.x, y: t.position.y };
      if (!this.tutorialSystem.isTutorialCompleted('s01.move')) {
        const d = Math.hypot(t.position.x - this._startPos.x, t.position.y - this._startPos.y);
        if (d > 60) {
          this._completeS01TutorialStep('move');
          trig.fire('playerMoved', {});
        }
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
    const scene = p.scene || p.sceneId || null;
    if (!scene) {
      console.warn('[DDScene] promptSwitch: 缺少 canonical 目标场景');
      return;
    }
    this._promptSwitch = {
      scene,
      spawnRef: p.spawnRef || null,
      text: p.text || '当前区域目标已完成'
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
    const scene = p.scene || p.sceneId || null;
    if (!scene) {
      console.warn('[DDScene] sceneCountdown: 缺少 canonical 目标场景');
      return;
    }
    this._countdown = {
      scene,
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
    const scene = this._nextSceneTarget;
    if (!scene) {
      console.warn('[DDScene] switchToNextScene: 没有已配置的 canonical 目标场景');
      return false;
    }
    console.log('[DDScene] switchToNextScene → teleportToChunk:', scene);
    return this.teleportToChunk({ scene, transition: 'fadeBlack' });
  }

  /**
   * 大地图内传送：移动玩家到目标 chunk 的世界坐标
   * @param {Object} p - { scene, spawnRef, x, y, transition, region }
   * @returns {Promise|void}
   */
  teleportToChunk(p = {}) {
    const sceneId = p.sceneId || p.scene;
    const teleport = this._chunkNavigator?.teleport({ ...p, sceneId });
    if (!teleport || typeof teleport.then !== 'function') return teleport;

    // FadeOverlayTransition 的 Promise 仅在淡入完成后兑现；此时宿主已可缓存目标区块的有效画面。
    return teleport.then(result => {
      if (result === false || result?.cancelled) return result;
      return Promise.resolve(this.requestAutoSave({ reason: 'map-change', sceneId }))
        .catch(error => {
          console.warn('[DDScene] 地图切换自动存档失败:', error);
          return null;
        })
        .then(() => result);
    });
  }

  _findRegionIndexForScene(sceneId) {
    const regions = this._worldLoadResult?.project?.worldMap?.regions || [];
    return regions.findIndex(region => {
      if ((region.chunks || []).some(chunk => chunk?.sceneId === sceneId)) return true;
      return (region.grid || []).some(row => (row || []).includes(sceneId));
    });
  }

  async prepareRestoreRegion(saveState = {}) {
    const sceneId = saveState?.currentSceneId;
    const regionIndex = this._findRegionIndexForScene(sceneId);
    if (regionIndex < 0) {
      return { ok: false, errors: [{ code: 'missingTargetScene', path: 'currentSceneId', message: `存档场景 ${sceneId} 不在世界地图中` }] };
    }
    if (regionIndex === this._currentRegionIndex) return { ok: true, errors: [] };
    return this._regionCoordinator.switchTo({
      projectUrl: 'game.project.json', regionIndex, sceneId, spawnRef: 'player'
    });
  }

  async travelToRegion({ regionIndex, sceneId, spawnRef = 'player' } = {}) {
    const result = await this._regionCoordinator?.switchTo?.({
      projectUrl: 'game.project.json', regionIndex, sceneId, spawnRef
    });
    if (!result?.ok) {
      const message = result?.errors?.[0]?.message || `无法进入 ${sceneId || '目标区域'}`;
      this._showScreenTip(message, { title: '大区切换失败' });
      return result || { ok: false, errors: [{ code: 'regionCoordinatorUnavailable', path: 'region', message }] };
    }
    this._s09AudioDirector?.syncScene?.(sceneId);
    const saveResult = await this.requestAutoSave({ reason: 'region-change', sceneId });
    if (!saveResult?.ok) this._showScreenTip('已进入目标区域，但自动存档失败', { title: '保存失败' });
    return result;
  }

  _validateRegionTarget({ request, result, shadowSession }) {
    const errors = [...(result?.errors || []).map((entry, index) => ({
      code: 'regionLoadFailed', path: `region.errors[${index}]`, message: entry.message || String(entry.error || entry)
    }))];
    const region = result?.region;
    if (!region) errors.push({ code: 'missingRegion', path: 'region', message: `未找到大区索引 ${request.regionIndex}` });
    if (region?.previewOnly === true) errors.push({ code: 'previewRegion', path: 'region.previewOnly', message: '预览大区不能进入主流程' });
    const chunk = result?.chunks?.find(entry => entry.sceneId === request.sceneId);
    if (!chunk) errors.push({ code: 'missingTargetScene', path: 'region.chunks', message: `目标大区不包含 ${request.sceneId}` });
    if (chunk?.sceneData?.previewOnly === true || chunk?.sceneData?.productionState === 'greybox') {
      errors.push({ code: 'previewScene', path: `scenes.${request.sceneId}`, message: `${request.sceneId} 尚未达到可玩状态` });
    }
    if (!shadowSession?.findSpawn?.(request.sceneId, request.spawnRef || 'player')) {
      errors.push({ code: 'missingSpawn', path: `scenes.${request.sceneId}.spawn`, message: `${request.sceneId} 缺少出生点 ${request.spawnRef || 'player'}` });
    }
    return { ok: errors.length === 0, errors };
  }

  _extractRegionDynamicState(sceneState = {}) {
    const keys = [
      'campfireLit', 'firedPickups', 'clearedGroups', 'resourceNodes',
      'placementStates', 'deathDrops', 'gatheringState', 'puppetState', 'gatheringPolicyOperations',
      'nextSceneTarget', 'playerDiedTriggered'
    ];
    const state = {};
    for (const key of keys) {
      if (sceneState[key] !== undefined) state[key] = JSON.parse(JSON.stringify(sceneState[key]));
    }
    return state;
  }

  _clearRegionRuntime(result = this._worldLoadResult) {
    this.gatheringPuppetSystem?.cancelActive?.('regionUnload', { silent: true });
    const placementIds = new Set((result?.placements || [])
      .filter(placement => placement?.type === 'ref' && placement.id)
      .map(placement => placement.id));
    const values = new Set([
      ...(this.entities || []).filter(entity => entity !== this.playerEntity),
      ...(this.pickupItems || []),
      ...(this.equipmentItems || [])
    ]);
    for (const value of values) this.aiSystem?.unregisterAI?.(value);
    this.entityStore?.removeMany?.(values);
    for (const value of values) {
      try { value?.destroy?.(); } catch (error) { /* best-effort region unload */ }
    }
    this._placementSpawner?.forgetPlacements?.(placementIds);
    this._groupEnemies = {};
    this._npcEntities = [];
  }

  async _commitRegionTarget({ request, result, shadowSession, draft }) {
    const oldRegionId = this._worldLoadResult?.region?.id;
    const oldSceneState = draft?.saveState?.scene;
    if (oldRegionId && oldSceneState) {
      this._regionDynamicStates.set(oldRegionId, this._extractRegionDynamicState(oldSceneState));
    }
    this._clearRegionRuntime(this._worldLoadResult);
    this._pendingResourceNodeStates = new Map();
    this._pendingPlacementStates = new Map();
    this._restoreCampfireState(false);
    this._worldLoadSession = shadowSession;
    this._worldLoadResult = result;
    this._currentRegionIndex = request.regionIndex;
    this._worldLoadPromise = Promise.resolve(result);
    this._loadWorldTerrains();
    this._loadScenePlacements();
    await this._worldLoadPromise;
    await Promise.resolve();

    if (this._worldRegion !== result.region || this._placements !== result.placements) {
      return { ok: false, errors: [{ code: 'regionProjectionFailed', path: 'region', message: '目标大区投影未完成' }] };
    }
    this.currentSceneId = request.sceneId;
    const spawn = shadowSession.findSpawn(request.sceneId, request.spawnRef || 'player');
    const transform = this.playerEntity?.getComponent?.('transform');
    if (!spawn || !transform) {
      return { ok: false, errors: [{ code: 'missingSpawn', path: `scenes.${request.sceneId}.spawn`, message: '目标出生点不可用' }] };
    }
    transform.position.x = spawn.x;
    transform.position.y = spawn.y;
    this.camera?.setPosition?.(spawn.x, spawn.y);

    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (storyState) {
      blackboard.set('storyState', {
        ...storyState,
        currentSceneId: request.sceneId,
        unlockedScenes: [...new Set([...(storyState.unlockedScenes || []), request.sceneId])]
      });
    }
    this.gameLoader?.triggerSystem?.fire?.('sceneEnter', { sceneId: request.sceneId });
    await this._spawnPlacements({ sceneId: request.sceneId });

    const targetRegionId = result.region?.id;
    const targetState = targetRegionId ? this._regionDynamicStates.get(targetRegionId) : null;
    if (targetState) {
      this._regionDynamicStates.delete(targetRegionId);
      const restored = this.restoreSceneSaveState({
        ...targetState,
        regionStates: [...this._regionDynamicStates.entries()].map(([regionId, state]) => ({ regionId, state })),
        defeatState: this.playerDefeatService?.serialize?.() || null,
        gatheringState: targetState.gatheringState || this.gatheringSystem?.serialize?.() || null
      });
      if (restored?.ok === false) return restored;
    }
    return { ok: true, errors: [] };
  }

  async _restoreRegionDraft({ draft, oldSession }) {
    if (!draft?.worldResult) return { ok: false, errors: [{ code: 'missingRegionDraft', path: 'region', message: '缺少旧大区回滚草稿' }] };
    this._clearRegionRuntime(this._worldLoadResult);
    this._worldLoadSession = oldSession || this._worldLoadSession;
    this._worldLoadResult = draft.worldResult;
    this._currentRegionIndex = draft.regionIndex;
    this._worldLoadPromise = Promise.resolve(draft.worldResult);
    this._loadWorldTerrains();
    this._loadScenePlacements();
    await this._worldLoadPromise;
    await Promise.resolve();
    return this.restoreSaveState(draft.saveState);
  }

  resolvePlayerDefeatResolution() {
    const storyState = this.gameLoader?.blackboard?.get?.('storyState') || {};
    if (storyState.pendingDefeatResolution !== 'specialFaint') return { type: 'normalDeath' };
    const allowed = ['passerby', 'patrol', 'temporaryCamp'];
    return {
      type: 'specialFaint',
      rescueType: allowed.includes(storyState.specialFaintRescueType)
        ? storyState.specialFaintRescueType
        : 'passerby'
    };
  }

  resolvePlayerRespawnPosition() {
    if (this.currentSceneId === 'S01' && this.campfire?.lit) {
      return { x: this.campfire.x + 48, y: this.campfire.y + 64, label: '已点燃的火堆旁' };
    }
    const spawnId = `${this.currentSceneId}-spawn-player`;
    const spawn = (this._placements || []).find(placement => placement.id === spawnId);
    return spawn ? { x: spawn.x, y: spawn.y, label: `${this.currentSceneId}入口` } : null;
  }

  onPlayerDefeatResolved(result = {}) {
    if (result.type !== 'specialFaint') {
      super.onPlayerDefeatResolved(result);
      return;
    }
    const labels = { passerby: '路人救援', patrol: '小股官兵救援', temporaryCamp: '临时扎营' };
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (storyState) {
      blackboard.set('storyState', {
        ...storyState,
        pendingDefeatResolution: null,
        lastSpecialFaintRescueType: result.rescueType
      });
    }
    const location = result.respawnPosition?.label || '安全处';
    this._showScreenTip(`${labels[result.rescueType] || '路人救援'}：你在${location}醒来，未扣除资源，也未生成遗失物资`);
  }

  /** Demo 专属运行状态；玩家/任务/黑板由 BaseGameScene 统一保存。 */
  captureSceneSaveState() {
    const resourceNodeStates = new Map(this._pendingResourceNodeStates || []);
    for (const entity of this.entities || []) {
      const node = entity?.getComponent?.('resourceNode');
      if (node) resourceNodeStates.set(entity.id, node.serialize());
    }
    const deathDrops = (this.equipmentItems || [])
      .filter(entity => entity?.getComponent?.('deathDrop'))
      .map(entity => ({
        id: entity.id,
        position: { ...entity.getComponent('transform').position },
        state: entity.getComponent('deathDrop').serialize()
      }));
    const placementStates = new Map(this._pendingPlacementStates || []);
    for (const item of this.pickupItems || []) {
      const placementId = item?.placementId;
      if (!placementId) continue;
      placementStates.set(placementId, {
        kind: 'item', removed: item.picked === true, quantity: Math.max(0, Math.floor(Number(item.quantity) || 0))
      });
    }
    const seenEnemies = new Set();
    for (const list of Object.values(this._groupEnemies || {})) {
      for (const enemy of list || []) {
        if (!enemy?.id || seenEnemies.has(enemy.id)) continue;
        seenEnemies.add(enemy.id);
        const stats = enemy.getComponent?.('stats');
        const transform = enemy.getComponent?.('transform');
        placementStates.set(enemy.id, {
          kind: 'enemy', removed: this._isEntityDead(enemy),
          hp: Math.max(0, Number(stats?.hp) || 0),
          position: transform ? { x: transform.position.x, y: transform.position.y } : null,
          ai: this.aiSystem?.getRuntimeState?.(enemy) || null
        });
      }
    }
    return {
      regionStates: [...(this._regionDynamicStates || new Map()).entries()].map(([regionId, state]) => ({
        regionId,
        state: JSON.parse(JSON.stringify(state))
      })),
      campfireLit: !!this.campfire?.lit,
      firedPickups: [...(this._firedPickups || [])],
      clearedGroups: [...(this._clearedGroups || [])],
      resourceNodes: [...resourceNodeStates.entries()].map(([id, state]) => ({ id, state })),
      placementStates: [...placementStates.entries()].map(([id, state]) => ({ id, state })),
      deathDrops,
      defeatState: this.playerDefeatService?.serialize?.() || null,
      gatheringState: this.gatheringSystem?.serialize?.() || null,
      puppetState: this.gatheringPuppetSystem?.serialize?.() || null,
      proficiencyState: this.proficiencySystem?.serialize?.() || null,
      gatheringPolicyOperations: [...(this._appliedGatheringPolicyOperations || new Set())],
      timeState: this.timeSystem?.serialize?.() || null,
      nextSceneTarget: this._nextSceneTarget || null,
      playerDiedTriggered: !!this._playerDiedTriggered
    };
  }

  restoreSceneSaveState(data = {}) {
    if (data.proficiencyState && !this.proficiencySystem) {
      return { ok: false, errors: [{
        code: 'proficiencyRuntimeUnavailable', path: 'proficiencyState', message: '熟练度运行时尚未就绪'
      }] };
    }
    const proficiencyCheck = this.proficiencySystem?.validateSerialized?.(data.proficiencyState || {});
    if (proficiencyCheck?.ok === false) {
      return {
        ok: false,
        errors: proficiencyCheck.errors.map(error => ({
          ...error,
          path: error.path ? `proficiencyState.${error.path}` : 'proficiencyState'
        }))
      };
    }
    this._regionDynamicStates = new Map((data.regionStates || [])
      .filter(entry => typeof entry?.regionId === 'string' && entry.state && typeof entry.state === 'object')
      .map(entry => [entry.regionId, JSON.parse(JSON.stringify(entry.state))]));
    this._firedPickups = new Set(data.firedPickups || []);
    this._clearedGroups = new Set(data.clearedGroups || []);
    this._appliedGatheringPolicyOperations = new Set(data.gatheringPolicyOperations || []);
    this._nextSceneTarget = data.nextSceneTarget || null;
    this._playerDiedTriggered = !!data.playerDiedTriggered;
    const restoredStoryDay = Math.max(1, Math.floor(Number(
      this.gameLoader?.blackboard?.get?.('storyState')?.currentDay
    ) || 1));
    if (data.timeState) this.timeSystem?.deserialize?.(data.timeState);
    this.timeSystem?.setCurrentDay?.(restoredStoryDay);
    this._pendingResourceNodeStates = new Map((data.resourceNodes || [])
      .filter(entry => typeof entry?.id === 'string' && entry.state && typeof entry.state === 'object')
      .map(entry => [entry.id, entry.state]));
    this._pendingPlacementStates = new Map((data.placementStates || [])
      .filter(entry => typeof entry?.id === 'string' && entry.state && typeof entry.state === 'object')
      .map(entry => [entry.id, entry.state]));

    const rebuild = this._rebuildCurrentScenePlacements();
    if (!rebuild.ok) return rebuild;
    for (const entity of [...(this.entities || [])]) {
      this._applyPendingResourceNodeState(entity);
      this._applyPendingPlacementState(entity, { id: entity?.placementId || entity?.id });
    }
    for (const item of [...(this.pickupItems || []), ...(this.equipmentItems || [])]) {
      this._applyPendingPlacementState(item, { id: item?.placementId });
    }

    this.playerDefeatService?.deserialize?.(data.defeatState || {});
    this.gatheringSystem?.deserialize?.(data.gatheringState || {});
    const proficiencyRestore = this.proficiencySystem?.deserialize?.(data.proficiencyState || {});
    if (proficiencyRestore?.ok === false) {
      return {
        ok: false,
        errors: proficiencyRestore.errors.map(error => ({
          ...error,
          path: error.path ? `proficiencyState.${error.path}` : 'proficiencyState'
        }))
      };
    }
    const currentDrops = (this.equipmentItems || [])
      .filter(entity => entity?.getComponent?.('deathDrop'));
    this.entityStore?.removeMany?.(currentDrops);
    for (const drop of currentDrops) {
      try { drop?.destroy?.(); } catch (error) { /* best-effort snapshot replacement */ }
    }
    for (const entry of data.deathDrops || []) {
      if (!entry?.id || !entry.state?.stacks?.length) continue;
      const drop = this.entityFactory?.createDeathDrop?.({
        id: entry.id,
        deathId: entry.state.deathId,
        stacks: entry.state.stacks,
        position: entry.position
      });
      if (!drop) {
        return { ok: false, errors: [{ code: 'deathDropRestoreFailed', path: `deathDrops.${entry.id}`, message: '死亡掉落重建失败' }] };
      }
      this.entityStore.add(drop);
      this.entityStore.addEquipmentItem(drop);
    }

    const restoredClass = this.playerEntity?.getComponent?.('stats')?.class;
    const restoredStory = this.gameLoader?.blackboard?.get?.('storyState') || {};
    const supportedClasses = ['warrior', 'archer', 'strategist'];
    if (restoredStory.classSelectionCommitted === true
      && (!supportedClasses.includes(restoredClass) || restoredStory.selectedClass !== restoredClass)) {
      return { ok: false, errors: [{
        code: 'classStateMismatch', path: 'selectedClass', message: '职业存档事实与玩家属性不一致'
      }] };
    }
    if (supportedClasses.includes(restoredClass)) {
      const classSystem = this._ensureClassSystem();
      if (!classSystem?.restoreClass?.(this.playerEntity.id, restoredClass)) {
        return { ok: false, errors: [{
          code: 'classRestoreFailed', path: 'selectedClass', message: `职业运行状态恢复失败: ${restoredClass}`
        }] };
      }
      this._classSelected = true;
      this.selectedClass = restoredClass;
      this.playerEntity.class = restoredClass;
    } else {
      const classSystem = this._ensureClassSystem();
      classSystem?.clearClass?.(this.playerEntity?.id);
      if (this.playerEntity) delete this.playerEntity.class;
      const stats = this.playerEntity?.getComponent?.('stats');
      if (stats) delete stats.class;
      this._classSelected = false;
      this.selectedClass = null;
    }
    this._syncPlayerClassAppearance(this.selectedClass);
    this._syncUnlockedClassSkills();
    const puppetRestore = this.gatheringPuppetSystem?.deserialize?.(data.puppetState || {}, {
      owner: this.playerEntity,
      resolveNode: nodeId => (this.entities || []).find(entity => entity?.id === nodeId) || null
    });
    if (puppetRestore?.ok === false) {
      return { ok: false, errors: [{
        code: puppetRestore.code || 'puppetRestoreFailed',
        path: 'puppetState',
        message: `采集傀儡恢复失败: ${puppetRestore.code || 'unknown'}`
      }] };
    }
    const refugeeConflict = restoredStory.s09RefugeeConflict;
    if (refugeeConflict && this.dialogueSystem?.getCurrentDialogue?.()?.id === S09_REFUGEE_DIALOGUE_ID) {
      if (refugeeConflict.branch) {
        this._setRefugeeDialogueNode(this._refugeeBranchResultNode(refugeeConflict));
      } else if (refugeeConflict.donationCommitted) {
        this._setRefugeeDialogueNode('branchChoice');
      } else if (refugeeConflict.status === 'started') {
        this._setRefugeeDialogueNode('donationOffer');
      }
    }
    this._classConfirm = null;
    this._classSelectionBusy = false;
    this._restoreCampfireState(data.campfireLit === true);
    this._startPos = this.playerEntity?.getComponent?.('transform')?.position
      ? { ...this.playerEntity.getComponent('transform').position }
      : null;
    this._s09AudioDirector?.syncScene?.(this.currentSceneId);
    this.resourceScope?.setTimeout(() => this._showNextS01Tutorial(), 0);
    return { ok: true, errors: [] };
  }

  _rebuildCurrentScenePlacements() {
    if (!this._placementSpawner || !this.gameLoader || !this.entityStore) {
      return { ok: false, errors: [{ code: 'placementRuntimeUnavailable', path: 'placementStates', message: '场景放置运行时尚未就绪' }] };
    }
    const restoreIds = new Set([
      ...this._pendingPlacementStates.keys(),
      ...this._pendingResourceNodeStates.keys()
    ]);
    for (const placement of this._placements || []) {
      if (placement?.type === 'ref' && placement.sceneId === this.currentSceneId && placement.id) {
        restoreIds.add(placement.id);
      }
    }
    const placements = (this._placements || []).filter(placement =>
      placement?.type === 'ref' && placement.id && restoreIds.has(placement.id)
    );
    const placementIds = new Set(placements.map(placement => placement.id));
    const values = new Set([
      ...(this.entities || []),
      ...(this.pickupItems || []),
      ...(this.equipmentItems || [])
    ].filter(value => placementIds.has(value?.placementId || value?.id)));

    for (const value of values) this.aiSystem?.unregisterAI?.(value);
    this.entityStore.removeMany(values);
    for (const value of values) {
      try { value?.destroy?.(); } catch (error) { /* best-effort rebuild cleanup */ }
    }
    this._npcEntities = (this._npcEntities || []).filter(entity => !values.has(entity));
    for (const [group, enemies] of Object.entries(this._groupEnemies || {})) {
      this._groupEnemies[group] = (enemies || []).filter(entity => !values.has(entity));
    }

    this._placementSpawner.forgetPlacements(placementIds);
    const result = this._placementSpawner.spawnMatching({
      selector: { placementIds: [...placementIds] },
      placements: this._placements || [],
      registries: this.gameLoader.registries
    });
    if (result.errors.length > 0) {
      return {
        ok: false,
        errors: result.errors.map((entry, index) => ({
          code: entry.reason || 'placementRestoreFailed',
          path: `placementStates.${entry.placement?.id || index}`,
          message: `放置对象重建失败: ${entry.ref || entry.placement?.id || index}`
        }))
      };
    }
    return { ok: true, errors: [] };
  }

  _applyPendingPlacementState(value, placement = {}) {
    const placementId = placement?.id || value?.placementId || value?.id;
    const state = this._pendingPlacementStates?.get(placementId);
    if (!placementId || !state) return false;
    if (state.removed === true) {
      value.picked = state.kind === 'item' || value.picked === true;
      value.isDead = state.kind === 'enemy' || value.isDead === true;
      value.isDying = state.kind === 'enemy' || value.isDying === true;
      this.entityStore?.remove?.(value);
      return true;
    }
    if (state.kind === 'item' && Number.isFinite(state.quantity)) {
      value.quantity = Math.max(0, Math.floor(state.quantity));
    }
    if (state.kind === 'enemy') {
      const stats = value.getComponent?.('stats');
      const transform = value.getComponent?.('transform');
      if (stats && Number.isFinite(state.hp)) stats.hp = Math.min(stats.maxHp, Math.max(0, state.hp));
      if (transform && Number.isFinite(state.position?.x) && Number.isFinite(state.position?.y)) {
        transform.position.x = state.position.x;
        transform.position.y = state.position.y;
      }
      if (state.ai) this.aiSystem?.restoreRuntimeState?.(value, state.ai);
    }
    this._pendingPlacementStates.delete(placementId);
    return false;
  }

  _applyPendingResourceNodeState(entity) {
    const node = entity?.getComponent?.('resourceNode');
    const state = this._pendingResourceNodeStates?.get(entity?.id);
    if (!node || !state) return false;
    node.deserialize(state);
    this._pendingResourceNodeStates.delete(entity.id);
    return true;
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

  /** 实际拾取提交后的统一事件出口；教学和数据触发器不再依赖已被移除的世界对象。 */
  onWorldItemPicked(item) {
    if (!this.gameLoader || !item) return false;
    if (!this._firedPickups) this._firedPickups = new Set();
    const uid = item.placementId || item._pickUid || item.entityId || item.id;
    if (item.placementId && item.picked === true) {
      this._pendingPlacementStates?.set(item.placementId, { kind: 'item', removed: true, quantity: 0 });
    }
    if (!uid || this._firedPickups.has(uid)) return false;
    this._firedPickups.add(uid);
    const itemId = item.itemId || item.id;
    this._completeS01TutorialStep('pickup');
    this.gameLoader.triggerSystem.fire('itemPickup', { item: itemId, id: itemId });
    console.log('[DDScene] itemPickup:', itemId);
    return true;
  }

  /**
   * 拾取事件源：兼容仍留在世界列表中的 picked 对象；正常路径由 onWorldItemPicked 即时处理。
   * @private
   */
  _checkItemPickupEvents() {
    if (!this.gameLoader) return;
    const scan = (list) => {
      for (const item of (list || [])) {
        if (item.picked) this.onWorldItemPicked(item);
      }
    };
    scan(this.pickupItems);
    scan(this.equipmentItems);
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
        loaderConfig: { contentPolicy: SANGUO_ZHANGJIAO_CONTENT_POLICY },
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
        sceneId: 'S01',
        registerActions: (trig, gameLoader) => this._registerGameLoaderActions(trig, gameLoader),
        onReady: async (gameLoader, trig) => {
          const offTriggerLog = trig.on((evt, t) => {
            if (evt === 'triggerStart') console.log('[DDScene][Trigger] 执行:', t.id, t.do);
          });
          this.resourceScope?.track(offTriggerLog);

          if (!this.assetManager?.registerManifest) {
            throw new Error('场景 AssetManager 不支持稳定资源 Manifest');
          }
          const manifestResult = this.assetManager.registerManifest(gameLoader.project.assetManifest);
          if (manifestResult.queued > 0) await this.assetManager.loadAll();
          this.entityRenderer2D?.clearCaches?.();
          const currentClass = this.playerEntity?.getComponent?.('stats')?.class || this.playerEntity?.class;
          this._syncPlayerClassAppearance(currentClass);

          this._configureSharedClassEffects(gameLoader);
          this._installProgressionUI(gameLoader);
        }
      });
      // initialize() 在首次 await 前已创建 loader；立即保留旧字段投影。
      this.gameLoader = bridge.loader;
      this._gameLoaderReady = ready.then(this.resourceScope.guard(async gameLoader => {
        if (this._gameLoaderBridge !== bridge || bridge.loader !== gameLoader) return gameLoader;
        await this._worldLoadPromise;
        const placementValidation = gameLoader.validatePlacementReferences(this._placements || []);
        if (!placementValidation.ok) {
          gameLoader.lastValidationErrors = placementValidation.errors;
          throw gameLoader.createValidationError(placementValidation.errors);
        }
        this.gameLoader = gameLoader;
        const storyDay = gameLoader.blackboard?.get?.('storyState')?.currentDay;
        this.timeSystem?.setCurrentDay?.(storyDay);
        this._sceneTriggerBindings?.setTriggerSystem(gameLoader.triggerSystem);
        if (this._progressionBootstrap?.isNewGame) this._showNextS01Tutorial();
        console.log('%c[DDScene][GameLoader] 装配完成，触发器数量:', 'color:#4CAF50', gameLoader.triggerSystem.triggers.length);
        return gameLoader;
      })).catch(this.resourceScope.guard(e => {
        console.error('[DDScene][GameLoader] 加载失败:', e);
        throw e;
      }));
    } catch (e) {
      console.warn('[DDScene][GameLoader] 初始化失败:', e);
      this._gameLoaderReady = Promise.reject(e);
      this._gameLoaderReady.catch(() => {});
    }
  }

  /** 将职业、成长、采集、资源容量与能力执行接到同一个 EffectResolver。 */
  _configureSharedClassEffects(gameLoader) {
    const resolver = gameLoader?.progressionSystem?.effectResolver;
    if (!resolver) return false;
    const proficiencyConfig = gameLoader?.project?.progression?.proficiency || {};
    this.proficiencySystem = new ProficiencySystem({
      ...proficiencyConfig,
      onEvent: (event, data) => {
        if (event !== 'levelUp') return;
        const definition = this.proficiencySystem?.getDefinition?.(data.type);
        this.notificationSystem?.addNotification?.(
          `${definition?.name || data.type}熟练度提升至 ${data.level} 级`,
          'success'
        );
      }
    });
    this.classSystem = new ClassSystem({ effectResolver: resolver });
    this.gatheringSystem?.setEffectResolver?.(resolver);
    this.gatheringSystem?.setSettlementPolicy?.(context => this.prepareGatheringSettlement(context));
    this.inventoryTransactions?.configureEffects?.({
      effectResolver: resolver,
      getEntityId: () => this.playerEntity?.id || null,
      baseResourceCapacity: 120
    });
    this._gameplaySystemAssembler?.configureAbilities?.({
      skillRegistry: gameLoader.skillRegistry,
      effectResolver: resolver
    });
    this.gatheringPuppetSystem?.configure?.({ effectResolver: resolver, owner: this.playerEntity });
    this._syncUnlockedClassSkills();
    return true;
  }

  _ensureClassSystem() {
    const resolver = this.gameLoader?.progressionSystem?.effectResolver;
    if (!resolver) return null;
    if (!this.classSystem || this.classSystem.effectResolver !== resolver) {
      this.classSystem = new ClassSystem({ effectResolver: resolver });
    }
    return this.classSystem;
  }

  /** 把 EffectResolver 的技能解锁投影到兼容快捷栏；定义本身仍由 SkillRegistry 拥有。 */
  _syncUnlockedClassSkills() {
    const player = this.playerEntity;
    const combat = player?.getComponent?.('combat');
    const resolver = this.gameLoader?.progressionSystem?.effectResolver;
    const registry = this.gameLoader?.skillRegistry;
    if (!combat || !resolver || !registry || !player?.id) return false;
    const canonicalIds = new Set(['cleave', 'arrow_shot', 'talisman_water', 'gathering_puppet']);
    const removedLegacyIds = new Set(['flame_palm', 'ice_finger', 'inferno_palm', 'heal', 'meditation']);
    const unlockedIds = new Set(resolver.getUnlockedSkills(player.id).filter(id => canonicalIds.has(id)));
    const previousCooldowns = new Map(combat.skillCooldowns || []);
    combat.skills = (combat.skills || []).filter(skill =>
      !canonicalIds.has(skill?.id) && !removedLegacyIds.has(skill?.id)
    );
    for (const skillId of [...canonicalIds, ...removedLegacyIds]) {
      combat.skillCooldowns.delete(skillId);
    }
    for (const skillId of unlockedIds) {
      const definition = registry.get(skillId);
      if (!definition) continue;
      const view = definition.resolveVariant(null);
      combat.addSkill({
        id: view.id,
        name: view.name,
        description: view.description,
        type: view.category,
        category: view.category,
        targeting: view.targeting,
        ...view.params,
        manaCost: view.costs.mp || 0,
        staminaCost: view.costs.stamina || 0,
        effectType: view.vfx?.effect || view.id
      });
      if (previousCooldowns.has(skillId)) {
        combat.skillCooldowns.set(skillId, previousCooldowns.get(skillId));
      }
    }
    this.gatheringPuppetSystem?.configure?.({ effectResolver: resolver, owner: player });
    this.gatheringPuppetSystem?.initializeCharges?.();
    return true;
  }

  /** AbilitySystem 的 Demo 编排出口；未处理返回 null，由框架回退 CombatSystem。 */
  executeAbility(context = {}) {
    const { skillId, caster, targetPosition, params = {}, view = {} } = context;
    if (skillId === 'gathering_puppet') {
      const nodeEntity = this._findResourceNodeNear(targetPosition, 72);
      const result = this.gatheringPuppetSystem?.summon?.({
        nodeEntity,
        duration: params.duration,
        backlashDamage: params.backlashDamage || 15
      });
      if (!result?.ok) {
        this._showScreenTip(`无法召唤采集傀儡：${result?.code || '目标无效'}`);
        return false;
      }
      return true;
    }

    const resolver = this.gameLoader?.progressionSystem?.effectResolver;
    const isRangedLure = resolver?.hasRuleOverride?.(
      caster?.id, 'gather.rangedGuardLure', { scene: this, targetPosition }
    ) === true;
    if (isRangedLure && view.tags?.includes?.('ranged') && this.currentSceneId === 'S09') {
      const guard = this._findGuardNear(targetPosition, 180);
      if (guard && this.aiSystem?.lureToPosition?.(guard, targetPosition, { duration: 8 })) {
        this._showScreenTip('箭矢声响引开了粮仓哨兵，抓紧时间行动。');
        return true;
      }
    }
    return null;
  }

  _findResourceNodeNear(position, radius = 72) {
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;
    let nearest = null;
    let nearestDistance = radius;
    for (const entity of this.entities || []) {
      if (!entity?.getComponent?.('resourceNode')) continue;
      const transform = entity.getComponent('transform');
      if (!transform) continue;
      const distance = Math.hypot(position.x - transform.position.x, position.y - transform.position.y);
      if (distance <= nearestDistance) {
        nearest = entity;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  _findGuardNear(position, radius = 180) {
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;
    let nearest = null;
    let nearestDistance = radius;
    for (const enemy of this.enemies || []) {
      if (!enemy?.tags?.includes?.('s09GranaryGuard') || this._isEntityDead(enemy)) continue;
      const transform = enemy.getComponent?.('transform');
      if (!transform) continue;
      const distance = Math.hypot(position.x - transform.position.x, position.y - transform.position.y);
      if (distance <= nearestDistance) {
        nearest = enemy;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  onGatheringPuppetEvent(event, data = {}) {
    if (event === 'summoned') this._showScreenTip('采集傀儡已开始工作，本检查点仅可召唤一次。');
    else if (event === 'destroyed' || event === 'expired') {
      this._showScreenTip('采集傀儡被摧毁，产物取消并受到反噬。');
    }
  }

  onAbilityEvent(_event, _data = {}) {}

  /** 安装统一成长面板；UI 只经 ViewModel 调用成长领域命令。 */
  _installProgressionUI(gameLoader) {
    const progressionSystem = gameLoader?.progressionSystem;
    const player = this.playerEntity;
    if (!progressionSystem || !player || !this.uiSystem || !this.uiClickHandler || !this.inputManager) return;

    this._grantStarterProgressionPoints(progressionSystem, player.id);

    const viewModel = new ProgressionViewModel({ progressionSystem });
    viewModel.setCharacter(player);

    const margin = 20;
    const width = Math.min(800, Math.max(320, this.logicalWidth - margin * 2));
    const height = Math.min(560, Math.max(360, this.logicalHeight - margin * 2));
    const panel = new ProgressionPanel({
      viewModel,
      isMobile: this.isMobileLayout,
      x: Math.round((this.logicalWidth - width) / 2),
      y: Math.round((this.logicalHeight - height) / 2),
      width,
      height,
      zIndex: 150
    });
    const hotkeyId = 'progression-panel';
    const togglePanel = () => {
      if (this.dialogueSystem?.isDialogueActive() || this.itemGainedPopup?.visible || this._classConfirm) return;
      const selectedClass = this.playerEntity?.getComponent?.('stats')?.class;
      if (!['warrior', 'archer', 'strategist'].includes(selectedClass)) {
        this._showScreenTip('加入黄巾并确认职业后才能打开角色成长');
        return;
      }
      if (panel.visible) {
        panel.hide();
      } else {
        this.backpackPanel?.hide?.();
        panel.show();
      }
    };

    this.uiSystem.registerPanel('progression', panel);
    this.uiClickHandler.registerElement(panel);
    // 't' 同时是 InputHints/手柄绑定表中的技能树虚拟动作；展示文案仍由 InputHints 生成。
    this.inputManager.registerHotkey(hotkeyId, ['t', 'T'], togglePanel);
    Object.assign(this.context.ui, { progression: panel });
    this.progressionViewModel = viewModel;
    this.progressionPanel = panel;
    this._installCityStateSummaryUI(gameLoader);

    this.resourceScope?.track(() => {
      this.inputManager?.unregisterHotkey?.(hotkeyId);
      this.uiClickHandler?.unregisterElement?.(panel);
      this.uiSystem?.unregisterPanel?.('progression');
      if (this.context.ui.progression === panel) this.context.ui.progression = null;
      if (this.progressionPanel === panel) this.progressionPanel = null;
      if (this.progressionViewModel === viewModel) this.progressionViewModel = null;
    });
  }

  /** 安装 S09 只读城市摘要；面板只接收快照，不读取或修改 Blackboard。 */
  _installCityStateSummaryUI(gameLoader) {
    if (!gameLoader?.blackboard || !this.uiSystem) return;
    const compact = this.isMobileLayout === true;
    const width = compact ? Math.min(224, this.logicalWidth - 24) : 270;
    const height = compact ? 112 : 126;
    const panel = new CityStateSummaryPanel({
      x: compact ? 12 : this.logicalWidth - width - 16,
      y: 12,
      width,
      height,
      compact,
      visible: false,
      zIndex: 45,
      resolveImage: imageId => this.assetManager?.getAsset?.(imageId) || null
    });
    this.uiSystem.registerPanel('cityStateSummary', panel);
    Object.assign(this.context.ui, { cityStateSummary: panel });
    this.cityStateSummaryPanel = panel;
    this._updateCityStateSummary();

    this.resourceScope?.track(() => {
      this.uiSystem?.unregisterPanel?.('cityStateSummary');
      if (this.context.ui.cityStateSummary === panel) this.context.ui.cityStateSummary = null;
      if (this.cityStateSummaryPanel === panel) this.cityStateSummaryPanel = null;
    });
  }

  _updateCityStateSummary() {
    const panel = this.cityStateSummaryPanel;
    if (!panel) return;
    if (this.currentSceneId !== 'S09') {
      panel.hide();
      return;
    }
    const context = this._getS09CityContext();
    if (!context) {
      panel.hide();
      return;
    }
    const conflict = context.storyState.s09RefugeeConflict || {};
    const silenceEvent = (context.storyState.delayedConsequences || [])
      .find(event => event?.type === S09_SILENCE_EVENT_TYPE);
    const branchLabels = {
      hardline: '强硬控制',
      appease: conflict.result === 'foodRestored' ? '安抚采集成功' : '安抚采集遇袭',
      silence: silenceEvent?.status === 'completed' ? '沉默（粮食已归零）' : '沉默（后果待结算）'
    };
    let refugeeStatus = '尚未发生';
    if (conflict.branch) refugeeStatus = branchLabels[conflict.branch] || conflict.branch;
    else if (conflict.donationCommitted) refugeeStatus = '已捐粮，等待抉择';
    else if (conflict.status === 'started') refugeeStatus = '争斗处理中';
    else if (conflict.status === 'ready') refugeeStatus = '现场已出现';

    panel.setSnapshot({
      cityName: context.city.name,
      resources: context.city.resources,
      damageRatio: context.city.damageRatio,
      morale: context.city.morale,
      reputation: context.blackboard.get('reputation'),
      currentDay: this.timeSystem?.getCurrentDay?.() || context.storyState.currentDay || 1,
      refugeeStatus,
      icons: {
        morale: 's09.ui.morale',
        reputation: 's09.ui.reputation',
        story: 's09.ui.storyChoice'
      }
    });
    panel.show();
  }

  /** 新档只在成长账本首次建立前发放四类独立起始点；读档永不发放。 */
  _grantStarterProgressionPoints(progressionSystem, characterId) {
    if (!this._progressionBootstrap?.isNewGame || !characterId) return;
    if (progressionSystem.states.has(characterId) || progressionSystem.ledgers.has(characterId)) return;
    progressionSystem.grantPoints(characterId, 'skill', 1);
    progressionSystem.grantPoints(characterId, 'talent', 1);
    progressionSystem.grantPoints(characterId, 'unit', 1);
    progressionSystem.grantPoints(characterId, 'passive', 1);
  }

  /** 将本场景现有触发动作注册到 SceneGameLoaderBridge 创建的 loader。 */
  _registerGameLoaderActions(trig, gameLoader) {
    // 场景专属动作：点燃火堆（触发器 do:lightCampfire 调用）
    trig.registerAction('lightCampfire', () => this.lightCampfire());
    // 场景专属动作：按组激活场景放置点（兼容既有触发器）。
    trig.registerAction('spawnGroup', (p) => this._spawnGroup(p));
    // 场景专属动作：按指定物品、组名或标签放置场景物品。
    trig.registerAction('spawnPlacements', (p) => this._spawnPlacements(p?.selector || p));
    // 场景专属动作：倒计时后触发死亡过渡→传送到目标区块
    trig.registerAction('sceneCountdown', (p) => this._startSceneCountdown(p));
    // 场景专属动作：提示切幕（等待按 N 或交互键 E 再传送）
    trig.registerAction('promptSwitch', (p) => this._startPromptSwitch(p));
    // 大地图传送（直接传送到指定区块，不切换独立场景）
    trig.registerAction('teleportToChunk', (p) => this.teleportToChunk(p));
    // S01 教学完成后的单一事务出口：一次性奖励、解锁 S02、传送。
    trig.registerAction('completeS01AndTravel', (p) => this.completeS01AndTravel(p));
    // S02 召见对话完成后创建可恢复检查点，再通过 RegionCoordinator 前往 S09。
    trig.registerAction('acceptS02Summons', (p) => this.acceptS02Summons(p));
    trig.registerAction('travelToS09', () => this.travelToS09());
    trig.registerAction('acceptS09Enlistment', () => this.acceptS09Enlistment());
    trig.registerAction('prepareS09RefugeeConflict', () => this.prepareS09RefugeeConflict());
    trig.registerAction('startS09RefugeeConflict', () => this.startS09RefugeeConflict());
    trig.registerAction('handleS09RefugeeChoice', (_params, _ctx, event) => (
      this.handleS09RefugeeChoice(event?.params?.choiceId)
    ));
    trig.registerAction('advanceGameDay', (p = {}) => this.advanceGameDay(p.days));
    trig.registerAction('prepareSpecialFaint', (p) => this.setPendingSpecialFaint(p));
    trig.registerAction('clearSpecialFaint', () => this.clearPendingSpecialFaint());
    // 特殊剧情可显式请求自动存档；实际存储由宿主统一排队执行。
    trig.registerAction('autoSave', (p = {}) => this.requestAutoSave({ reason: p.reason || 'story-event' }));
    // 切换到显式注册的独立场景（副本/过场等）；大地图 Act 推进一律走 teleportToChunk。
    trig.registerAction('switchScene', async (p) => {
      const scene = p.scene || p.target;
      if (!scene) { console.warn('[DDScene] switchScene: 缺少 scene 参数'); return null; }
      const sm = (window.gameEngine && window.gameEngine.sceneManager) || this.sceneManager;
      if (!sm?.scenes?.has?.(scene)) {
        console.warn('[DDScene] switchScene: 未注册独立场景；区块推进请使用 teleportToChunk', scene);
        return null;
      }
      await this.requestAutoSave({ reason: 'map-change', sceneId: scene });
      console.log('[DDScene] switchScene →', scene);
      sm.switchTo(scene, p);
      return scene;
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
    // S09 职业选择：空间 binding 打开确认框，确认后由单一事务提交职业。
    trig.registerAction('selectClass', (p) => this._selectClass(p));
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

  /**
   * S01 完成事务：先校验教学、目标 chunk/spawn、奖励定义与容量，再一次提交奖励和 StoryState。
   * 传送被取消时恢复提交前库存和黑板，保证失败不留下半完成状态。
   */
  async completeS01AndTravel(params = {}) {
    if (this.currentSceneId !== 'S01') return false;
    const incomplete = S01_TUTORIAL_IDS.find(id => !this.tutorialSystem.isTutorialCompleted(id));
    if (incomplete) {
      this._showNextS01Tutorial();
      if (!this.tutorialSystem.isShowingTutorial()) {
        this._showScreenTip('请先完成当前生存教学', { title: '尚未完成' });
      }
      return false;
    }

    try {
      await this._worldLoadPromise;
    } catch (error) {
      this._showScreenTip(`无法前往 S02：${error.message || error}`, { title: '场景加载失败' });
      return false;
    }
    const targetSceneId = params.scene || params.sceneId || 'S02';
    const spawnRef = params.spawnRef || 'player';
    const targetChunk = this._worldLoadSession?.getChunk?.(targetSceneId);
    const targetSpawn = this._worldLoadSession?.findSpawn?.(targetSceneId, spawnRef);
    if (!targetChunk || !targetSpawn) {
      this._showScreenTip(`无法前往 ${targetSceneId}：目标区块或出生点不存在`, { title: '场景配置错误' });
      return false;
    }

    const blackboard = this.gameLoader?.blackboard;
    const previousStoryState = blackboard?.get?.('storyState') || {};
    const alreadyCompleted = previousStoryState.s01Completed === true;
    const inventory = this.playerEntity?.getComponent?.('inventory');
    let inventoryBefore = null;
    if (!alreadyCompleted) {
      if (!inventory || !blackboard) return false;
      const rewardSpecs = Array.isArray(params.rewards) && params.rewards.length
        ? params.rewards
        : [{ itemId: 'resource.wood', quantity: 3 }, { itemId: 'resource.herb', quantity: 2 }];
      const itemRegistry = this.gameLoader?.getRegistry?.('items');
      const rewardEntries = rewardSpecs.map(spec => ({
        item: itemRegistry?.get?.(spec.itemId),
        quantity: Math.max(0, Math.floor(Number(spec.quantity) || 0))
      }));
      if (rewardEntries.some(entry => !entry.item?.id || entry.quantity <= 0)) {
        this._showScreenTip('S01 完成奖励配置无效', { title: '内容配置错误' });
        return false;
      }
      const preview = this.inventoryTransactions.previewBatchAdd(inventory, rewardEntries);
      if (preview.remainder > 0) {
        this._showScreenTip('背包空间不足，整理后再前往废弃营地', { title: '无法领取奖励' });
        return false;
      }
      inventoryBefore = inventory.exportItems();
      const rewardResult = this.inventoryTransactions.commit({
        type: 'batchAdd', inventory, entries: rewardEntries, allowPartial: false
      });
      if (!rewardResult.ok) {
        this._showScreenTip('完成奖励结算失败，库存未改变', { title: '结算失败' });
        return false;
      }
      blackboard.set('storyState', {
        ...previousStoryState,
        s01Completed: true,
        currentSceneId: targetSceneId,
        pendingDefeatResolution: null,
        specialFaintRescueType: null,
        unlockedScenes: [...new Set([...(previousStoryState.unlockedScenes || []), targetSceneId])]
      });
    }

    const result = await this.teleportToChunk({
      scene: targetSceneId,
      spawnRef,
      transition: params.transition || 'fadeBlack'
    });
    if (result === false || result == null || result?.cancelled) {
      if (!alreadyCompleted && inventoryBefore) {
        inventory.loadItems(inventoryBefore);
        blackboard.set('storyState', previousStoryState);
      }
      return false;
    }
    if (blackboard) {
      const committedStoryState = blackboard.get('storyState') || previousStoryState;
      blackboard.set('storyState', {
        ...committedStoryState,
        currentSceneId: targetSceneId,
        pendingDefeatResolution: null,
        specialFaintRescueType: null
      });
    }
    if (!alreadyCompleted) this._showScreenTip('完成 S01：获得木材 ×3、草药 ×2，已开放 S02');
    return true;
  }

  setPendingSpecialFaint(params = {}) {
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (!blackboard || !storyState || this.currentSceneId !== 'S01') return false;
    const rescueType = ['passerby', 'patrol', 'temporaryCamp'].includes(params.rescueType)
      ? params.rescueType
      : 'passerby';
    blackboard.set('storyState', {
      ...storyState,
      pendingDefeatResolution: 'specialFaint',
      specialFaintRescueType: rescueType
    });
    this._showScreenTip('你选择不逃跑：若在这场抵抗中倒下，将进入特殊救援昏迷');
    return true;
  }

  clearPendingSpecialFaint() {
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (!blackboard || !storyState || storyState.pendingDefeatResolution !== 'specialFaint') return false;
    blackboard.set('storyState', {
      ...storyState,
      pendingDefeatResolution: null,
      specialFaintRescueType: null
    });
    return true;
  }

  /** S02 接受召见：StoryState 与自动检查点共用一个可回滚提交入口。 */
  async acceptS02Summons() {
    if (this.currentSceneId !== 'S02') return false;
    const blackboard = this.gameLoader?.blackboard;
    const previousStoryState = blackboard?.get?.('storyState');
    if (!blackboard || !previousStoryState) return false;
    if (previousStoryState.s02SummonsAccepted === true) {
      this._showScreenTip('召见已接受，前往粥棚营地的路线正在准备中');
      return true;
    }
    blackboard.set('storyState', {
      ...previousStoryState,
      s02SummonsAccepted: true,
      lastCheckpointId: 'checkpoint.S02.summonsAccepted'
    });
    try {
      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S02.summonsAccepted', sceneId: 'S02'
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '自动存档未提交');
    } catch (error) {
      blackboard.set('storyState', previousStoryState);
      this.dialogueSystem?.clearCompleted?.('dialogue.s02.zhangjiaoSummons');
      this.gameLoader?.triggerSystem?.clearFiredOnce?.('trg_s02_zhangjiao_summons');
      this.gameLoader?.triggerSystem?.clearFiredOnce?.('trg_s02_accept_summons');
      this._sceneTriggerBindings?.resetBinding?.('S02-binding-zhangjiao-summons');
      this._showScreenTip('召见检查点保存失败，剧情状态未提交，可重新与信使交谈', { title: '保存失败' });
      return false;
    }
    this._showScreenTip('已接受张角召见并创建检查点，正在前往粥棚营地');
    const travel = await this.travelToS09();
    if (!travel?.ok) {
      this._showScreenTip('召见检查点已保留；可从东北出口重试前往粥棚营地', { title: '路线暂不可用' });
      return false;
    }
    return true;
  }

  async travelToS09() {
    if (this.currentSceneId !== 'S02') return { ok: false, errors: [{ code: 'wrongScene', path: 'currentSceneId', message: '只能从 S02 前往 S09' }] };
    const storyState = this.gameLoader?.blackboard?.get?.('storyState');
    if (storyState?.s02SummonsAccepted !== true) {
      this._showScreenTip('先与黄巾信使交谈并接受召见', { title: '尚未获得路线' });
      return { ok: false, errors: [{ code: 'summonsRequired', path: 'storyState.s02SummonsAccepted', message: '尚未接受张角召见' }] };
    }
    return this.travelToRegion({ regionIndex: 1, sceneId: 'S09', spawnRef: 'player' });
  }

  /** S09 入伍承诺：剧情事实与检查点共同提交，失败后可重新与张角交谈。 */
  async acceptS09Enlistment() {
    if (this.currentSceneId !== 'S09') return false;
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (!blackboard || !storyState) return false;
    if (storyState.joinedYellowTurban === true) {
      this._showScreenTip('你已加入黄巾，请在三面军旗下确认职业');
      return true;
    }

    const before = JSON.parse(JSON.stringify(blackboard.serialize()));
    blackboard.set('storyState', {
      ...storyState,
      joinedYellowTurban: true,
      lastCheckpointId: 'checkpoint.S09.enlisted'
    });
    blackboard.set('joinedYellowTurban', true);
    try {
      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S09.enlisted', sceneId: 'S09'
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '自动存档未提交');
    } catch (error) {
      blackboard.deserialize(before);
      this.dialogueSystem?.clearCompleted?.('dialogue.s09.enlistment');
      this.gameLoader?.triggerSystem?.clearFiredOnce?.('trg_s09_zhangjiao_enlistment');
      this.gameLoader?.triggerSystem?.clearFiredOnce?.('trg_s09_accept_enlistment');
      this._sceneTriggerBindings?.resetBinding?.('S09-binding-zhangjiao-enlistment');
      this._showScreenTip('入伍检查点保存失败，状态未提交，可重新与张角交谈', { title: '保存失败' });
      return false;
    }
    this._showScreenTip('你已加入黄巾。前往战士、弓手或军师旗帜确认职业。');
    return true;
  }

  _getS09CityContext() {
    const blackboard = this.gameLoader?.blackboard;
    const cityStates = blackboard?.get?.('cityStates');
    const cityIndex = Array.isArray(cityStates)
      ? cityStates.findIndex(city => city?.id === S09_CITY_ID)
      : -1;
    if (!blackboard || cityIndex < 0) return null;
    return {
      blackboard,
      cityStates,
      cityIndex,
      city: cityStates[cityIndex],
      storyState: blackboard.get('storyState') || {}
    };
  }

  _validateS09City(city, cityIndex) {
    const result = this.gameLoader?.contentValidator?.validate?.(
      city, 'city', `variables.cityStates[${cityIndex}]`
    );
    return !result || result.ok === true;
  }

  _setS09City(context, city) {
    context.blackboard.set('cityStates', context.cityStates.map((entry, index) => (
      index === context.cityIndex ? city : entry
    )));
  }

  _setRefugeeDialogueNode(nodeId) {
    if (this.dialogueSystem?.getCurrentDialogue?.()?.id !== S09_REFUGEE_DIALOGUE_ID) return false;
    return this.dialogueSystem.goToNode(nodeId, { player: this.playerEntity, scene: this });
  }

  _refugeeBranchResultNode(conflict = {}) {
    if (conflict.branch === 'hardline') return 'hardlineResult';
    if (conflict.branch === 'appease') {
      return conflict.result === 'foodRestored' ? 'appeaseSuccessResult' : 'appeaseScoutResult';
    }
    if (conflict.branch === 'silence') return 'silenceResult';
    return 'branchChoice';
  }

  /** 城损与粮仓损毁达标后建立一次性剧情事实，并按 StoryState 恢复现场。 */
  async prepareS09RefugeeConflict() {
    if (this.currentSceneId !== 'S09') return false;
    const context = this._getS09CityContext();
    if (!context || Number(context.city.damageRatio) < 0.4
      || Number(context.city.buildingDamage?.['granary.s09']) <= 0) return false;

    const currentDay = Math.max(1, Math.floor(Number(context.storyState.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    let conflict = context.storyState.s09RefugeeConflict;
    const firstTrigger = !conflict;
    if (!conflict) {
      conflict = {
        status: 'available',
        triggeredDay: currentDay,
        donationCommitted: false,
        branch: null,
        result: null,
        presentationActive: true
      };
      context.blackboard.set('storyState', {
        ...context.storyState,
        currentDay,
        delayedConsequences: Array.isArray(context.storyState.delayedConsequences)
          ? context.storyState.delayedConsequences : [],
        storyTags: Array.isArray(context.storyState.storyTags) ? context.storyState.storyTags : [],
        hiddenClues: Array.isArray(context.storyState.hiddenClues) ? context.storyState.hiddenClues : [],
        s09RefugeeConflict: conflict
      });
    }

    await this._spawnPlacements({ group: S09_REFUGEE_GROUP });
    if (firstTrigger) {
      this._s09AudioDirector?.playFeedback?.('conflict');
      this._showScreenTip('粮仓损毁引发饥民争斗。难民区出现伤兵、妇孺与死者，请查看现场。', {
        title: '饥民争斗'
      });
    }
    return true;
  }

  /** 由 S09 磁盘场景中的可视化交互 binding 启动或恢复剧情。 */
  async startS09RefugeeConflict() {
    if (this.currentSceneId !== 'S09' || this.dialogueSystem?.isDialogueActive?.()) return false;
    await this.prepareS09RefugeeConflict();
    const context = this._getS09CityContext();
    const conflict = context?.blackboard?.get?.('storyState')?.s09RefugeeConflict;
    if (!context || !conflict) return false;
    const oneArmed = (this._npcEntities || []).find(entity => entity?.id === 'S09-refugee-one-armed');
    const playerPosition = this.playerEntity?.getComponent?.('transform')?.position;
    const refugeePosition = oneArmed?.getComponent?.('transform')?.position;
    if (!playerPosition || !refugeePosition
      || Math.hypot(playerPosition.x - refugeePosition.x, playerPosition.y - refugeePosition.y) > 110) {
      return false;
    }
    if (conflict.status === 'resolved') {
      this._showScreenTip('饥民争斗已经作出选择，现场只留下选择后的沉默。');
      return false;
    }

    const resumeStatus = conflict.status;
    if (!this.dialogueSystem.startDialogue(S09_REFUGEE_DIALOGUE_ID, {
      player: this.playerEntity, scene: this
    })) return false;
    if (conflict.donationCommitted) this._setRefugeeDialogueNode('branchChoice');
    else if (resumeStatus === 'started') this._setRefugeeDialogueNode('donationOffer');

    if (resumeStatus === 'available') {
      const storyState = context.blackboard.get('storyState') || {};
      context.blackboard.set('storyState', {
        ...storyState,
        s09RefugeeConflict: { ...conflict, status: 'started' }
      });
    }
    return true;
  }

  async handleS09RefugeeChoice(choiceId) {
    if (this._s09RefugeeChoiceBusy || this.currentSceneId !== 'S09') return false;
    if (choiceId === 'defer') return true;
    this._s09RefugeeChoiceBusy = true;
    try {
      if (choiceId === 'donate_food' || choiceId === 'retry_donation') {
        const result = await this._commitS09RefugeeDonation();
        const conflict = this._getS09CityContext()?.blackboard?.get?.('storyState')?.s09RefugeeConflict;
        this._setRefugeeDialogueNode(conflict?.donationCommitted ? 'branchChoice' : 'donationFailed');
        return result;
      }
      if (['hardline', 'appease', 'silence'].includes(choiceId)) {
        const result = await this._commitS09RefugeeBranch(choiceId);
        const conflict = this._getS09CityContext()?.blackboard?.get?.('storyState')?.s09RefugeeConflict;
        this._setRefugeeDialogueNode(conflict?.branch
          ? this._refugeeBranchResultNode(conflict)
          : 'branchChoice');
        return result;
      }
      return false;
    } finally {
      this._s09RefugeeChoiceBusy = false;
    }
  }

  /** 扣粮、士气和暂停损毁作为一个可回滚检查点事务。 */
  async _commitS09RefugeeDonation() {
    const context = this._getS09CityContext();
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const conflict = context?.storyState?.s09RefugeeConflict;
    if (!context || !inventory || !conflict) return false;
    if (conflict.donationCommitted) {
      this._setRefugeeDialogueNode('branchChoice');
      return true;
    }

    const quantity = 20;
    if (this.inventoryTransactions.previewRemove(inventory, 'resource.food', quantity).remainder > 0) {
      this._setRefugeeDialogueNode('donationFailed');
      this._showScreenTip('需要粮食 ×20 才能稳定现场；库存未改变。', { title: '粮食不足' });
      return false;
    }
    const currentDay = Math.max(1, Math.floor(Number(context.storyState.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    const cityDraft = JSON.parse(JSON.stringify(context.city));
    cityDraft.morale = Math.max(0, Math.floor(Number(cityDraft.morale) || 0) + 5);
    cityDraft.damagePausedUntilDay = Math.max(
      Math.floor(Number(cityDraft.damagePausedUntilDay) || 0), currentDay + 1
    );
    if (!this._validateS09City(cityDraft, context.cityIndex)) {
      this._setRefugeeDialogueNode('donationFailed');
      return false;
    }

    const inventoryBefore = JSON.parse(JSON.stringify(inventory.exportItems()));
    const blackboardBefore = JSON.parse(JSON.stringify(context.blackboard.serialize()));
    const operationId = 'story:S09:refugee-donation';
    const removed = this.inventoryTransactions.commit({
      type: 'batchRemove', inventory,
      entries: [{ itemId: 'resource.food', quantity }],
      operationId
    });
    if (!removed.ok) {
      this._setRefugeeDialogueNode('donationFailed');
      return false;
    }

    this._setS09City(context, cityDraft);
    const storyState = context.blackboard.get('storyState') || {};
    context.blackboard.set('storyState', {
      ...storyState,
      s09RefugeeConflict: {
        ...conflict,
        status: 'donated',
        donationCommitted: true,
        donationOperationId: operationId,
        donationDay: currentDay
      }
    });

    try {
      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S09.refugeeDonation', sceneId: 'S09'
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '捐粮检查点未提交');
    } catch (error) {
      inventory.loadItems(inventoryBefore);
      this.inventoryTransactions.forgetOperation?.(operationId);
      context.blackboard.deserialize(blackboardBefore);
      this._setRefugeeDialogueNode('donationFailed');
      this._showScreenTip('捐粮检查点保存失败，粮食、士气和损毁暂停均已回滚。', { title: '保存失败' });
      return false;
    }

    this._s09AudioDirector?.playFeedback?.('donation');
    this._setRefugeeDialogueNode('branchChoice');
    this._showScreenTip('捐出粮食 ×20：城市士气 +5，损毁暂停一个游戏日。');
    return true;
  }

  _findValidInventoryTool(inventory, toolType) {
    return (inventory?.slots || [])
      .map(stack => stack?.item)
      .find(item => item?.toolType === toolType && Number(item.durability) > 0) || null;
  }

  async _commitS09RefugeeBranch(branch) {
    const context = this._getS09CityContext();
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const conflict = context?.storyState?.s09RefugeeConflict;
    if (!context || !inventory || !conflict?.donationCommitted) {
      this._setRefugeeDialogueNode('donationFailed');
      return false;
    }
    if (conflict.branch) {
      this._setRefugeeDialogueNode(this._refugeeBranchResultNode(conflict));
      return conflict.branch === branch;
    }

    const currentDay = Math.max(1, Math.floor(Number(context.storyState.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    const blackboardBefore = JSON.parse(JSON.stringify(context.blackboard.serialize()));
    const cityDraft = JSON.parse(JSON.stringify(context.city));
    const tags = new Set(context.storyState.storyTags || []);
    const delayedConsequences = [...(context.storyState.delayedConsequences || [])];
    let result = 'committed';
    let resultNode = 'hardlineResult';
    let scoutTriggered = false;

    if (branch === 'hardline') {
      tags.add('s09.refugees.hardline');
    } else if (branch === 'appease') {
      const axe = this._findValidInventoryTool(inventory, 'axe');
      if (axe) {
        cityDraft.resources = { ...cityDraft.resources, food: Math.max(0, Math.floor(Number(cityDraft.resources?.food) || 0) + 30) };
        result = 'foodRestored';
        resultNode = 'appeaseSuccessResult';
        tags.add('s09.refugees.appeasedWithGathering');
      } else {
        result = 'scoutTriggered';
        resultNode = 'appeaseScoutResult';
        scoutTriggered = true;
        tags.add('s09.refugees.scoutTriggered');
      }
    } else if (branch === 'silence') {
      const eventId = 'story:S09:silence-food-collapse';
      if (!delayedConsequences.some(event => event?.id === eventId)) {
        delayedConsequences.push({
          id: eventId,
          type: S09_SILENCE_EVENT_TYPE,
          dueDay: currentDay + 1,
          status: 'pending',
          sourceSceneId: 'S09'
        });
      }
      result = 'delayedFoodCollapse';
      resultNode = 'silenceResult';
      tags.add('s09.refugees.silence');
    }

    if (!this._validateS09City(cityDraft, context.cityIndex)) return false;
    this._setS09City(context, cityDraft);
    context.blackboard.set('storyState', {
      ...context.storyState,
      storyTags: [...tags],
      delayedConsequences,
      s09RefugeeConflict: {
        ...conflict,
        status: 'resolved',
        branch,
        result,
        scoutTriggered,
        branchOperationId: `story:S09:refugee-branch:${branch}`,
        resolvedDay: currentDay
      }
    });

    try {
      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: `checkpoint.S09.refugeeBranch.${branch}`, sceneId: 'S09'
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '分支检查点未提交');
    } catch (error) {
      context.blackboard.deserialize(blackboardBefore);
      this._setRefugeeDialogueNode('branchChoice');
      this._showScreenTip('剧情分支保存失败，城市、标签与延迟事件均已回滚，可重新选择。', { title: '保存失败' });
      return false;
    }

    this._s09AudioDirector?.playFeedback?.(branch);
    this._setRefugeeDialogueNode(resultNode);
    if (scoutTriggered) await this._spawnPlacements({ group: 'S09-refugee-scout' });
    const messages = {
      hardline: '你选择强硬压下争斗，这一决定已记录。',
      appease: result === 'foodRestored' ? '有效斧头帮助收集燃料与散粮，城市粮食 +30。' : '没有有效斧头，安抚失败并引来了官军斥候。',
      silence: '你选择沉默；下一游戏日将结算粮食耗尽的延迟后果。'
    };
    this._showScreenTip(messages[branch] || '剧情分支已提交。');
    return true;
  }

  _onGameDayChanged(currentDay) {
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (!blackboard || !storyState) return false;
    blackboard.set('storyState', { ...storyState, currentDay });
    this._processDueStoryEvents();
    return true;
  }

  advanceGameDay(days = 1) {
    const currentDay = this.timeSystem?.advanceDays?.(Math.max(1, Math.floor(Number(days) || 1)));
    if (!currentDay) return false;
    this._onGameDayChanged(currentDay);
    return currentDay;
  }

  /** 到期后果按 StoryState event id 幂等提交；保存失败恢复草稿并在下一帧重试。 */
  async _processDueStoryEvents() {
    if (this._processingDelayedStoryEvents || !this.gameLoader) return false;
    const context = this._getS09CityContext();
    const storyState = context?.storyState;
    const currentDay = Math.max(1, Math.floor(Number(storyState?.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    const dueEvent = (storyState?.delayedConsequences || []).find(event => (
      event?.status === 'pending' && Number(event.dueDay) <= currentDay
    ));
    if (!context || !dueEvent) return false;
    if (dueEvent.type !== S09_SILENCE_EVENT_TYPE) return false;

    this._processingDelayedStoryEvents = true;
    const blackboardBefore = JSON.parse(JSON.stringify(context.blackboard.serialize()));
    try {
      const cityDraft = JSON.parse(JSON.stringify(context.city));
      cityDraft.resources = { ...cityDraft.resources, food: 0 };
      if (!this._validateS09City(cityDraft, context.cityIndex)) throw new Error('延迟后果生成了非法 CityState');
      this._setS09City(context, cityDraft);
      const hiddenClues = new Set(storyState.hiddenClues || []);
      hiddenClues.add('s09.refugees.breadArmClue');
      context.blackboard.set('storyState', {
        ...storyState,
        hiddenClues: [...hiddenClues],
        delayedConsequences: storyState.delayedConsequences.map(event => (
          event?.id === dueEvent.id
            ? { ...event, status: 'completed', completedDay: currentDay }
            : event
        ))
      });
      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: `checkpoint.${dueEvent.id}`, sceneId: this.currentSceneId
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '延迟后果检查点未提交');
      this._showScreenTip('新的一日到来：营地粮食耗尽，断臂饥民手中的饼留下了一条隐藏线索。', {
        title: '延迟后果'
      });
      return true;
    } catch (error) {
      context.blackboard.deserialize(blackboardBefore);
      console.warn('[DDScene] 延迟剧情结算失败，已回滚并等待重试', error);
      return false;
    } finally {
      this._processingDelayedStoryEvents = false;
    }
  }

  // ==================== 火堆（迁移自 Act1） ====================

  _restoreCampfireState(lit) {
    if (lit) {
      if (!this.campfire.lit) this.lightCampfire({ emitEvent: false });
      this.fog.opacity = 0;
      this.fog.targetOpacity = 0;
      return;
    }
    for (const emitter of this.campfire.emitters || []) emitter.active = false;
    this.campfire.emitters = [];
    if (this.campfire.emitterSmoke) this.campfire.emitterSmoke.active = false;
    this.campfire.emitterSmoke = null;
    this.campfire.lit = false;
    this.fog.opacity = 0.85;
    this.fog.targetOpacity = 0.85;
  }

  /** 点燃火堆并创建火焰粒子（7 组发射器） */
  lightCampfire({ emitEvent = true } = {}) {
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

    // 当前火堆剧情归属 S01；存档恢复只重建表现，不重复发布剧情事件。
    if (emitEvent && this.gameLoader) this.gameLoader.triggerSystem.fire('campfireLit', { sceneId: 'S01' });
  }

  /** 通用放置条件：从 Blackboard 纯数据路径读取 exists/equals/in，不让 PlacementSpawner 依赖剧情。 */
  _shouldSpawnPlacement(placement = {}) {
    const condition = placement.spawnWhen;
    if (!condition || typeof condition !== 'object') return true;
    const root = this.gameLoader?.blackboard?.get?.(condition.blackboardKey || 'storyState');
    let value = root;
    for (const segment of String(condition.path || '').split('.').filter(Boolean)) {
      value = value && typeof value === 'object' ? value[segment] : undefined;
    }
    if (condition.exists === true && value === undefined) return false;
    if (condition.exists === false && value !== undefined) return false;
    if (Object.prototype.hasOwnProperty.call(condition, 'equals') && value !== condition.equals) return false;
    if (Array.isArray(condition.in) && !condition.in.includes(value)) return false;
    return true;
  }

  /**
   * 兼容旧触发器：按组名放置对应场景引用。
   * @param {Object} p - { group }
   * @private
   */
  _spawnGroup(p = {}) {
    return this._spawnPlacements({ group: p.group });
  }

  /**
   * 按放置点 ID、组名或标签生成场景物品/实体。
   * 世界放置点异步加载完成前先等待，防止 once 触发器空生成后永久失效。
   * @param {Object} selector - { placementIds?, group?, tag?, tags?, sceneId?, kinds? }
   * @private
   */
  async _spawnPlacements(selector = {}) {
    const scope = this.resourceScope;
    if (!scope || scope.disposed || !this.gameLoader) return;
    try {
      await this._worldLoadPromise;
    } catch (error) {
      if (!scope.disposed) console.warn('[DDScene] 放置点加载失败，无法生成场景物品', error);
      return;
    }
    if (scope.disposed || this.resourceScope !== scope || !this.gameLoader || !this._placementSpawner) return;

    const placementValidation = this.gameLoader.validatePlacementReferences(this._placements || []);
    if (!placementValidation.ok) {
      this.gameLoader.lastValidationErrors = placementValidation.errors;
      console.error('[DDScene] 放置点引用校验失败', placementValidation.errors);
      return { ok: false, errors: placementValidation.errors };
    }

    const reg = this.gameLoader.registries;
    const result = this._placementSpawner.spawnMatching({
      selector,
      placements: this._placements || [],
      registries: reg
    });
    for (const entry of result.errors) {
      if (entry.reason === 'definitionNotFound') {
        console.warn('[DDScene] spawnPlacements 未找到定义', entry.kind, entry.ref);
      }
    }

    let worldPropN = 0;
    for (const placement of result.matchedPlacements) {
      if (placement.kind !== 'item') continue;
      const baseDef = reg[this._regKey(placement.kind)]?.get(placement.ref);
      const definition = placement.overrides ? this._mergeOverrides(baseDef, placement.overrides) : baseDef;
      if (definition?.worldProp) worldPropN++;
    }
    const itemN = Math.max(0, result.counts.item - worldPropN);
    const eqN = result.counts.equipment;
    const entN = worldPropN + result.counts.enemy + result.counts.npc +
      result.counts.building + result.counts.vehicle;
    console.log('[DDScene] spawnPlacements', {
      selector: result.selector,
      matched: result.matchedPlacements.map(placement => placement.id),
      items: itemN,
      equipment: eqN,
      others: entN
    });
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

  /** 职业事实到玩家基础动画外观挂点的唯一投影入口。 */
  _syncPlayerClassAppearance(classId = null) {
    return this._playerFactory?.applyClassAppearance?.(this, this.playerEntity, classId) === true;
  }

  /** 打开 S09 职业不可逆确认框。 */
  _showClassConfirmation(p = {}) {
    const classId = p.classId || p.class || ClassType.WARRIOR;
    const supported = [ClassType.WARRIOR, ClassType.ARCHER, ClassType.STRATEGIST];
    if (!supported.includes(classId)) {
      console.warn('[DDScene] confirmClass: 不支持的职业', classId);
      return false;
    }
    const storyState = this.gameLoader?.blackboard?.get?.('storyState');
    if (this.currentSceneId !== 'S09' || storyState?.joinedYellowTurban !== true) {
      this._showScreenTip('先在 S09 与张角交谈并加入黄巾', { title: '尚未入伍' });
      return false;
    }
    if (storyState.classSelectionCommitted === true || this._classSelected) {
      this._showScreenTip(`职业已经固定为${ClassNames[storyState.selectedClass || this.selectedClass] || '当前职业'}`);
      return false;
    }

    const descriptions = {
      warrior: '采集速度更快，但可携带的资源总量较低。',
      archer: '采集速度较慢，可用远程攻击引开守卫。',
      strategist: '可召唤一次采集傀儡协助获取资源。'
    };
    this._classConfirm = {
      classId,
      className: ClassNames[classId] || classId,
      description: descriptions[classId] || '',
      confirmHover: false,
      cancelHover: false
    };
    console.log(`[DDScene] 显示职业确认窗口: ${this._classConfirm.className}`);
    return true;
  }

  _classModalLayout() {
    const w = 460, h = 220;
    const px = (this.logicalWidth - w) / 2;
    const py = (this.logicalHeight - h) / 2;
    const btnW = 140, btnH = 40;
    const btnY = py + h - 58;
    return {
      w, h, px, py, btnW, btnH, btnY,
      confirmX: px + w / 2 - btnW - 14,
      cancelX: px + w / 2 + 14
    };
  }

  _updateClassConfirmationHover() {
    const cf = this._classConfirm;
    if (!cf || !this.inputManager) return;
    const layout = this._classModalLayout();
    const mouse = this.inputManager.getMousePosition();
    cf.confirmHover = mouse.x >= layout.confirmX && mouse.x <= layout.confirmX + layout.btnW
      && mouse.y >= layout.btnY && mouse.y <= layout.btnY + layout.btnH;
    cf.cancelHover = mouse.x >= layout.cancelX && mouse.x <= layout.cancelX + layout.btnW
      && mouse.y >= layout.btnY && mouse.y <= layout.btnY + layout.btnH;
  }

  /** SceneInputFlow 的 MODAL_UI 出口；弹窗存在时无条件吞掉世界输入。 */
  handleModalInput({ inputManager, gamepad } = {}) {
    const cf = this._classConfirm;
    if (!cf || !inputManager) return false;
    this._updateClassConfirmationHover();

    const clicked = inputManager.isMouseClicked?.() === true && !inputManager.isMouseClickHandled?.();
    const confirmPressed = inputManager.isKeyPressed?.('e')
      || inputManager.isKeyPressed?.('enter') || inputManager.isKeyPressed?.('Enter');
    const cancelPressed = inputManager.isKeyPressed?.('escape')
      || gamepad?.isButtonPressed?.(PadButton.B) === true;

    if (clicked) inputManager.markMouseClickHandled?.();
    if (!this._classSelectionBusy && (confirmPressed || (clicked && cf.confirmHover))) {
      this._confirmClassSelection(cf.classId);
    } else if (!this._classSelectionBusy && (cancelPressed || (clicked && cf.cancelHover))) {
      this._classConfirm = null;
      console.log('[DDScene] 取消职业选择');
    }
    return true;
  }

  /** 保留旧 update 调用点，只更新 hover；点击和键位统一由 SceneInputFlow 处理。 */
  _updateClassConfirmation() {
    this._updateClassConfirmationHover();
  }

  async _confirmClassSelection(classId) {
    const success = await this._selectClass({ classId });
    if (success) this._classConfirm = null;
    return success;
  }

  /** 渲染职业确认窗口；提示文本始终由 InputHints 根据当前设备生成。 */
  _renderClassConfirmation(ctx) {
    const cf = this._classConfirm;
    if (!cf) return;
    const { w, h, px, py, btnW, btnH, btnY, confirmX, cancelX } = this._classModalLayout();

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    ctx.fillStyle = 'rgba(16,24,40,0.97)';
    ctx.strokeStyle = '#d6b85f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, 10);
    ctx.fill();
    ctx.stroke();

    const classIcon = this.assetManager?.getAsset?.(`s09.ui.class.${cf.classId}`);
    const classIconReady = classIcon && (classIcon.complete !== false)
      && (classIcon.naturalWidth || classIcon.width || 0) > 0;
    if (classIconReady) ctx.drawImage(classIcon, px + 16, py + 12, 38, 38);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('确认职业选择', px + w / 2, py + 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px Arial';
    ctx.fillText(`确定选择「${cf.className}」吗？选择后不可更改。`, px + w / 2, py + 57);
    ctx.fillStyle = '#d6d9df';
    ctx.font = '14px Arial';
    ctx.fillText(cf.description, px + w / 2, py + 88);
    if (this._classSelectionBusy) {
      ctx.fillStyle = '#f0cf77';
      ctx.fillText('正在创建职业检查点……', px + w / 2, py + 116);
    }

    ctx.fillStyle = cf.confirmHover ? '#5dba68' : '#4CAF50';
    ctx.beginPath();
    ctx.roundRect(confirmX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`确认（${InputHints.key('confirm')}）`, confirmX + btnW / 2, btnY + 11);

    ctx.fillStyle = cf.cancelHover ? '#555' : '#3a3a3a';
    ctx.beginPath();
    ctx.roundRect(cancelX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(`取消（${InputHints.key('modalCancel')}）`, cancelX + btnW / 2, btnY + 11);
    ctx.restore();
  }

  /**
   * S09 职业事务：装备、职业来源、初始能力、StoryState 和 checkpoint 要么全部成功，要么全部回滚。
   */
  async _selectClass(p = {}) {
    const classType = p.classId || p.class || ClassType.WARRIOR;
    const supported = [ClassType.WARRIOR, ClassType.ARCHER, ClassType.STRATEGIST];
    if (!supported.includes(classType) || this._classSelectionBusy) return false;

    const player = this.playerEntity;
    const playerId = player?.id;
    const stats = player?.getComponent?.('stats');
    const inventory = player?.getComponent?.('inventory');
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    const progression = this.gameLoader?.progressionSystem;
    const classSystem = this._ensureClassSystem();
    if (this.currentSceneId !== 'S09' || !playerId || !stats || !inventory || !blackboard
      || !progression || !classSystem || storyState?.joinedYellowTurban !== true) {
      this._showScreenTip('职业选择前置状态不完整', { title: '无法选择职业' });
      return false;
    }

    if (storyState.classSelectionCommitted === true) {
      if (storyState.selectedClass !== classType) {
        this._showScreenTip('职业已经固定，不能改选', { title: '不可更改' });
        return false;
      }
      classSystem.restoreClass(playerId, classType);
      this._classSelected = true;
      this.selectedClass = classType;
      this._syncPlayerClassAppearance(classType);
      this._syncUnlockedClassSkills();
      return true;
    }
    if (classSystem.getCharacterClass(playerId)) {
      this._showScreenTip('检测到未完成的职业运行状态，请重新读取检查点', { title: '状态冲突' });
      return false;
    }

    const classData = classSystem.getClassData(classType);
    const itemRegistry = this.gameLoader.getRegistry?.('items');
    const equipmentEntries = classSystem.getStartingEquipment(classType).map(spec => ({
      item: itemRegistry?.get?.(spec.id),
      quantity: Math.max(1, Math.floor(Number(spec.quantity) || 1))
    }));
    if (!classData || equipmentEntries.length === 0 || equipmentEntries.some(entry => !entry.item?.id)) {
      this._showScreenTip('职业初始装备定义缺失', { title: '内容配置错误' });
      return false;
    }
    const inventoryPreview = this.inventoryTransactions.previewBatchAdd(inventory, equipmentEntries);
    if (!inventoryPreview.valid || inventoryPreview.remainder > 0) {
      this._showScreenTip('背包空间不足，整理后再确认职业', { title: '无法领取初始装备' });
      return false;
    }

    const initialNodeByClass = {
      warrior: { graphId: 'warrior-skill', nodeId: 'cleave', passiveStart: 'start_warrior' },
      archer: { graphId: 'archer-skill', nodeId: 'arrow_shot', passiveStart: 'start_archer' },
      strategist: { graphId: 'strategist-skill', nodeId: 'talisman_water', passiveStart: 'start_strategist' }
    };
    const initial = initialNodeByClass[classType];
    if (!progression.getGraph(initial.graphId)?.getNode?.(initial.nodeId)
      || !progression.getGraph('global-passive')?.getNode?.(initial.passiveStart)) {
      this._showScreenTip(`职业初始能力或天赋盘起点不存在：${initial.nodeId}`, { title: '成长配置错误' });
      return false;
    }

    const inventoryBefore = JSON.parse(JSON.stringify(inventory.exportItems()));
    const blackboardBefore = JSON.parse(JSON.stringify(blackboard.serialize()));
    const progressionBefore = JSON.parse(JSON.stringify(progression.serializeCharacter(playerId)));
    const statsBefore = {
      class: stats.class,
      skillPoints: stats.skillPoints,
      unitType: stats.unitType
    };
    const playerClassBefore = player.class;
    const operationId = `class-select:${playerId}:${classType}`;
    this._classSelectionBusy = true;

    try {
      const equipmentResult = this.inventoryTransactions.commit({
        type: 'batchAdd', inventory, entries: equipmentEntries, allowPartial: false, operationId
      });
      if (!equipmentResult.ok) throw new Error(equipmentResult.code || '初始装备提交失败');
      if (!classSystem.selectClass(playerId, classType)) throw new Error('职业系统拒绝选择');

      player.class = classType;
      stats.class = classType;
      if (typeof stats.setUnitType === 'function') stats.setUnitType(classData.baseUnitType);
      else stats.unitType = classData.baseUnitType;

      const ledger = progression.getLedger(playerId);
      const starterPointTotals = { skill: 8, talent: 4, unit: 4, passive: 4 };
      for (const [pool, targetTotal] of Object.entries(starterPointTotals)) {
        const currentTotal = ledger.getAvailable(pool) + ledger.getSpent(pool);
        if (currentTotal < targetTotal) progression.grantPoints(playerId, pool, targetTotal - currentTotal);
      }
      if (progression.getRank(playerId, initial.graphId, initial.nodeId) === 0) {
        const allocated = progression.allocateNode(playerId, initial.graphId, initial.nodeId, {
          characterLevel: Number(stats.level) || 1
        });
        if (!allocated.ok) throw new Error(allocated.message || `无法解锁 ${initial.nodeId}`);
      }
      if (progression.getRank(playerId, 'global-passive', initial.passiveStart) === 0) {
        const startAllocated = progression.allocateNode(playerId, 'global-passive', initial.passiveStart, {
          characterLevel: Number(stats.level) || 1
        });
        if (!startAllocated.ok) throw new Error(startAllocated.message || `无法激活 ${initial.passiveStart}`);
      }
      stats.skillPoints = progression.getLedger(playerId).getAvailable('skill');

      blackboard.set('storyState', {
        ...storyState,
        joinedYellowTurban: true,
        classSelectionCommitted: true,
        selectedClass: classType,
        lastCheckpointId: 'checkpoint.S09.classSelected'
      });
      blackboard.set('joinedYellowTurban', true);
      blackboard.set('selectedClass', classType);
      blackboard.set('classSelected', true);
      this._classSelected = true;
      this.selectedClass = classType;
      this._syncUnlockedClassSkills();

      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S09.classSelected', sceneId: 'S09'
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '职业检查点未提交');
    } catch (error) {
      inventory.loadItems(inventoryBefore);
      this.inventoryTransactions.forgetOperation?.(operationId);
      progression.deserializeCharacter(playerId, progressionBefore);
      classSystem.clearClass(playerId);
      player.class = playerClassBefore;
      for (const [key, value] of Object.entries(statsBefore)) {
        if (value === undefined) delete stats[key];
        else stats[key] = value;
      }
      blackboard.deserialize(blackboardBefore);
      this._classSelected = false;
      this.selectedClass = null;
      this.gatheringPuppetSystem?.cancelActive?.('classRollback');
      if (this.gatheringPuppetSystem) this.gatheringPuppetSystem.chargesRemaining = null;
      this._syncUnlockedClassSkills();
      this._showScreenTip(`职业提交失败：${error.message || error}。状态已回滚，可重试。`, { title: '检查点失败' });
      return false;
    } finally {
      this._classSelectionBusy = false;
    }

    this._syncPlayerClassAppearance(classType);
    this._s09AudioDirector?.playFeedback?.('classSelected');
    const className = ClassNames[classType] || classType;
    this.notificationSystem?.addNotification?.(`你选择了${className}，初始能力和装备已发放`, 'success');
    this.gameLoader?.triggerSystem?.fire('classSelected', { class: classType, className });
    console.log('%c[DDScene] S09 职业检查点已提交:', 'color:#4CAF50', className);
    return true;
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
      this._sceneTriggerBindings?.setBindings(result.triggerBindings || [], result.sceneObjects || []);
      this._applySpawnPoints(placements);
      this._worldReadyGate?.resolve('placements', placements);
      this._syncWorldReadyProjection();
    })).catch(this.resourceScope.guard(e => {
      console.warn('[DDScene] 加载 game.project.json 失败:', e);
      this._placements = [];
      this._sceneTriggerBindings?.setBindings([]);
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
        if (o.type === 'ref' || o.type === 'spawn') {
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

  /** 地形碰撞（水面 + 树木 + 编辑器碰撞多边形） */
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
