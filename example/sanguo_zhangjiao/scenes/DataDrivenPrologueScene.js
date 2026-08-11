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
import { registerSceneTriggerActions } from '../../../src/core/scene/SceneTriggerActionProvider.js';
import { SANGUO_ZHANGJIAO_CONTENT_POLICY } from '../config/SanguoZhangjiaoContentPolicy.js';
import { EffectZoneRenderer } from '../../../src/rendering/EffectZoneRenderer.js';
import { WeatherSystem } from '../../../src/systems/WeatherSystem.js';
import { TimeSystem } from '../../../src/systems/TimeSystem.js';
import { ClassSystem, ClassType, ClassNames } from '../../../src/systems/ClassSystem.js';
import { BattleSystem, BattleMode, BattleState } from '../../../src/systems/BattleSystem.js';
import { BattlefieldRuntimeSystem } from '../../../src/systems/BattlefieldRuntimeSystem.js';
import { CityWarSystem } from '../../../src/systems/CityWarSystem.js';
import { RescueSystem, RescueStatus } from '../../../src/systems/RescueSystem.js';
import { ConstructionSystem } from '../../../src/systems/ConstructionSystem.js';
import { PadButton } from '../../../src/core/input/Xbox360Profile.js';
import { ProgressionViewModel } from '../../../src/ui/progression/ProgressionViewModel.js';
import { ProgressionPanel } from '../../../src/ui/progression/ProgressionPanel.js';
import { CityStateSummaryPanel } from '../../../src/ui/CityStateSummaryPanel.js';
import { BattleModeView } from '../../../src/ui/BattleModeView.js';
import { BattleHudView } from '../../../src/ui/BattleHudView.js';
import { BattleResultView } from '../../../src/ui/BattleResultView.js';
import { RescueObjectiveView } from '../../../src/ui/RescueObjectiveView.js';
import { IrreversibleChoiceView } from '../../../src/ui/IrreversibleChoiceView.js';
import { ProficiencySystem } from '../../../src/systems/progression/ProficiencySystem.js';
import { S09AudioDirector } from '../systems/S09AudioDirector.js';
import { S04RouteCoordinator, S04_ROUTE_CONFIGS } from '../systems/S04RouteCoordinator.js';

const S01_TUTORIAL_KEYS = Object.freeze([
  'move', 'attack', 'pickup', 'jump', 'gather', 'durability', 'capacity'
]);
const S01_TUTORIAL_IDS = Object.freeze(S01_TUTORIAL_KEYS.map(key => `s01.${key}`));
const S09_CITY_ID = 'city.s09_guangzong_camp';
const S09_REFUGEE_DIALOGUE_ID = 'dialogue.s09.refugeeConflict';
const S09_REFUGEE_GROUP = 'S09-refugee-conflict';
const S09_SILENCE_EVENT_TYPE = 's09.silenceFoodCollapse';
const S09_HARDLINE_ESCAPE_EVENT_TYPE = 's09.hardlineEscape';
const S09_HARDLINE_ESCAPE_CHANCE = 0.35;
const S03_BATTLE_ID = 'battle.s03.yingchuan';
const S04_BATTLE_ID = 'battle.s04.changshe';
const S05_BATTLE_ID = 'battle.s05_wancheng_outskirts';
const S07_BATTLE_ID = 'battle.s07_xihua_delay';
const S04_BOCAI_RESCUE_ID = 'rescue.s04.bocai';
const S05_ZHANG_MANCHENG_RESCUE_ID = 'rescue.s05.zhangMancheng';
const S01_INITIAL_FOG_OPACITY = 1.0;
const BATTLE_FLOW_BY_SCENE = Object.freeze({
  S03: Object.freeze({
    battleId: S03_BATTLE_ID,
    locationName: '颍川',
    unavailableMessage: '颍川战役运行时尚未就绪',
    conflictMessage: '另一场战役尚未完成结算，不能切换到颍川战役。',
    activeMessage: '颍川战役正在进行，当前参战方式不可更改。',
    appliedTitle: '颍川首战·已结算战果',
    resultTitle: '颍川首战·战果',
    resultMessage: '战果已冻结并保存；北侧出口现可前往长社战场。',
    settlementMessage: '颍川战果已写入城市与战争状态，时间推进至五月。',
    interventionMessage: '你已进入黄巾前线。击溃官军或使其士气崩溃。',
    worldChanges: Object.freeze({ month: 5 }),
    resolvedKey: 's03BattleResolved',
    winnerKey: 's03WinnerFactionId',
    checkpointId: 'checkpoint.S03.battleResolved'
  }),
  S04: Object.freeze({
    battleId: S04_BATTLE_ID,
    locationName: '长社',
    unavailableMessage: '长社战役运行时尚未就绪',
    conflictMessage: '上一场战役尚未完成结算，不能进入长社战役。',
    activeMessage: '长社战役正在进行，当前参战方式不可更改。',
    appliedTitle: '长社战场·已结算战果',
    resultTitle: '长社战场·战果',
    resultMessage: '长社战果已冻结并保存；若已介入，仍可完成进行中的波才救援。',
    settlementMessage: '长社战果已写入城市与战争状态。',
    interventionMessage: '你已进入长社黄巾阵线，可在西侧残旗下启动波才救援。',
    worldChanges: Object.freeze({ month: 5 }),
    resolvedKey: 's04BattleResolved',
    winnerKey: 's04WinnerFactionId',
    checkpointId: 'checkpoint.S04.battleResolved'
  }),
  S05: Object.freeze({
    battleId: S05_BATTLE_ID,
    locationName: '宛城外围',
    unavailableMessage: '宛城外围战役运行时尚未就绪',
    conflictMessage: '上一场战役尚未完成结算，不能进入宛城外围战役。',
    activeMessage: '宛城外围战役正在进行，当前参战方式不可更改。',
    appliedTitle: '宛城外围·已结算战果',
    resultTitle: '宛城外围·战果',
    resultMessage: '宛城外围战果已冻结并保存；张曼成存活后方可前往宛城围攻。',
    settlementMessage: '宛城外围战果已写入城市与战争状态。',
    interventionMessage: '你已进入宛城外围黄巾阵线，可启动 60 秒张曼成救援并以远程攻击打断秦颉。',
    worldChanges: Object.freeze({}),
    resolvedKey: 's05BattleResolved',
    winnerKey: 's05WinnerFactionId',
    checkpointId: 'checkpoint.S05.battleResolved'
  }),
  S07: Object.freeze({
    battleId: S07_BATTLE_ID,
    locationName: '西华',
    unavailableMessage: '西华三线阻滞战运行时尚未就绪',
    conflictMessage: '上一场战役尚未完成结算，不能进入西华阻滞战。',
    activeMessage: '西华阻滞战正在进行，当前参战方式不可更改。',
    appliedTitle: '西华阻滞战·已结算战果',
    resultTitle: '西华阻滞战·战果',
    resultMessage: '西华战果已冻结并保存；介入者还需提交三线阻滞点才能保存残部。',
    settlementMessage: '西华战果已写入城市与战争状态。',
    interventionMessage: '你已进入黄巾残部阵线。依次投入资源完成 north、center、south 三线阻滞。',
    worldChanges: Object.freeze({ month: 6 }),
    resolvedKey: 's07BattleResolved',
    winnerKey: 's07WinnerFactionId',
    checkpointId: 'checkpoint.S07.battleResolved'
  })
});
const BATTLE_FLOW_BY_ID = Object.freeze({
  [S03_BATTLE_ID]: BATTLE_FLOW_BY_SCENE.S03,
  [S04_BATTLE_ID]: BATTLE_FLOW_BY_SCENE.S04,
  [S05_BATTLE_ID]: BATTLE_FLOW_BY_SCENE.S05,
  [S07_BATTLE_ID]: BATTLE_FLOW_BY_SCENE.S07
});
const RESCUE_TITLE_BY_ID = Object.freeze({
  [S04_BOCAI_RESCUE_ID]: '波才限时救援',
  [S05_ZHANG_MANCHENG_RESCUE_ID]: '张曼成限时救援'
});
const cloneData = value => value == null ? value : JSON.parse(JSON.stringify(value));
const S10_CONSTRUCTION_SITE_KEYS = Object.freeze({
  'site.s10.campfire': 'campfire',
  'site.s10.barricade': 'barricade',
  'site.s10.simple_wall': 'simpleWall',
  'site.s10.arrow_tower': 'arrowTower'
});
const S06_FIELD_CONSTRUCTION_SITE_ID = 'site.s06.field_barricade';

/** 同一剧情操作和逻辑日始终得到同一结果，checkpoint 失败重试不会重新掷骰。 */
const stableStoryRoll = (...parts) => {
  const text = parts.map(part => String(part ?? '')).join('|');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
};

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
      opacity: S01_INITIAL_FOG_OPACITY,
      targetOpacity: S01_INITIAL_FOG_OPACITY,
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
    this._progressionBootstrap = { isNewGame: false, playerStartMode: 'restore' };
    this._playerStartMode = 'restore';
    this._initialPlayerSpawnPending = false;
    this.classSystem = null;
    this._classSelected = false;
    this.selectedClass = null;
    this._classConfirm = null;
    this._classSelectionBusy = false;
    this._s09AudioDirector = null;
    this.battleSystem = null;
    this.battlefieldRuntime = null;
    this.cityWarSystem = null;
    this.battleModeView = null;
    this.battleHudView = null;
    this.battleResultView = null;
    this.rescueSystem = null;
    this.constructionSystem = null;
    this.rescueObjectiveView = null;
    this.irreversibleChoiceView = null;
    this.s04RouteCoordinator = null;
    this._s03BattleConfig = null;
    this._s04BattleConfig = null;
    this._s05BattleConfig = null;
    this._s07BattleConfig = null;
    this._s04BocaiRescueConfig = null;
    this._s05ZhangManchengRescueConfig = null;
    this._activeBattleConfig = null;
    this._battleFlowsByScene = null;
    this._battleFlowsById = null;
    this._s03BattleBusy = false;
    this._s04RescueBusy = false;
    this._s05RescueBusy = false;
    this._s04RouteBusy = false;
    this._s07PointBusy = false;
    this._s07ExitBusy = false;
    this._s08DecisionBusy = false;
    this._s08RecallBusy = false;
    this._s10StoryBusy = false;
    this._constructionCheckpointBusy = false;
    this._appliedGatheringPolicyOperations = new Set();
    this._s05MinePendingSettlements = new Map();
    this._s05MineBusy = false;
    this._s06DecisionBusy = false;
    this._s06RecallBusy = false;
    this._s09RefugeeChoiceBusy = false;
    this._processingDelayedStoryEvents = false;

    // 天气系统和时间系统；游戏日从 1 开始并随完整昼夜周期推进。
    this.weatherSystem = new WeatherSystem();
    this.timeSystem = new TimeSystem({ enabled: true, currentDay: 1 });
  }

  /** 由宿主在 enter() 前标记本次启动意图；读档与继承玩家不得消费场景出生点。 */
  setProgressionBootstrap({ isNewGame = false, playerStartMode = null } = {}) {
    const newGame = isNewGame === true;
    const allowedModes = new Set(['newGame', 'restore', 'inherit', 'preserve']);
    const resolvedMode = allowedModes.has(playerStartMode)
      ? playerStartMode
      : (newGame ? 'newGame' : 'restore');
    this._progressionBootstrap = { isNewGame: newGame, playerStartMode: resolvedMode };
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
    this._s05MinePendingSettlements.clear();
    this._s05MineBusy = false;
    this._s06DecisionBusy = false;
    const inheritedPlayer = this.context?.player?.inherited === true;
    this._playerStartMode = inheritedPlayer
      ? 'inherit'
      : (this._progressionBootstrap?.playerStartMode || 'restore');
    this._initialPlayerSpawnPending = this._playerStartMode === 'newGame';
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
      this.battleModeView?.close?.();
      this.battleResultView?.close?.();
      this.battlefieldRuntime?.dispose?.(this.entities || []);
      this.battleSystem = null;
      this.battlefieldRuntime = null;
      this.cityWarSystem = null;
      this.battleModeView = null;
      this.battleHudView = null;
      this.battleResultView = null;
      this.rescueObjectiveView?.clear?.();
      this.irreversibleChoiceView?.close?.();
      this.rescueSystem = null;
      this.constructionSystem = null;
      this._constructionCheckpointBusy = false;
      this.rescueObjectiveView = null;
      this.irreversibleChoiceView = null;
      this.s04RouteCoordinator = null;
      this._s03BattleConfig = null;
      this._s04BattleConfig = null;
      this._s05BattleConfig = null;
      this._s07BattleConfig = null;
      this._s04BocaiRescueConfig = null;
      this._s05ZhangManchengRescueConfig = null;
      this._activeBattleConfig = null;
      this._battleFlowsByScene = null;
      this._battleFlowsById = null;
      this._s03BattleBusy = false;
      this._s04RescueBusy = false;
      this._s05RescueBusy = false;
      this._s04RouteBusy = false;
    });

    // 大地图 chunk 偏移：从 game.project.json worldMap 动态加载地形
    // 编辑器中每个 scene 的坐标是 0~chunkWidth 局部坐标，运行时加 worldOffset 转为世界坐标
    const chunkWidth = 1280;
    const chunkHeight = 720;
    this._prologueOffset = { x: 1 * chunkWidth, y: 1 * chunkHeight };

    // 火堆先使用世界坐标兜底，placements 就绪后再由当前场景的 canonical spawn 精确覆盖。
    // 玩家位置不在这里预写：新游戏、读档、继承和显式传送各有且只有一个位置权威。
    this.campfire.x = 350 + this._prologueOffset.x;
    this.campfire.y = 250 + this._prologueOffset.y;

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
        if (sceneId === 'S05') void this._syncS05MineWorldState();
        if (sceneId === 'S07') this._syncS07DelayWorldState();
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

    // 营建工期随正常游戏帧推进；终态在异步 checkpoint 完成前暂停继续计时。
    this._updateConstructionRuntime(deltaTime);

    // Combat/AI/Collision 已在父类帧管线完成；随后按配置优先级判断实时战役结果。
    this._updateS03BattleRuntime(deltaTime);
    // 救援计时与护送跟随复用同一帧的实体状态；deadline 仅由 RescueSystem 判定。
    this._updateS04BocaiRescue(deltaTime);
    this._updateS05ZhangManchengRescue(deltaTime);

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

  _configureS01Tutorial(project = null) {
    const fallbackTutorials = [
      { id: 's01.move', title: '移动', steps: [{ text: '使用 {move} 移动，离开火堆附近。' }] },
      { id: 's01.attack', title: '攻击', steps: [{ text: '使用 {attack} 进行一次攻击。' }] },
      { id: 's01.pickup', title: '拾取', steps: [{ text: '靠近物资后使用 {pickup} 拾取。' }] },
      { id: 's01.jump', title: '跳跃', steps: [{ text: '使用 {jump} 越过障碍。' }] },
      { id: 's01.gather', title: '采集', steps: [{ text: '靠近资源节点后使用 {harvest} 开始采集，再按一次可取消。' }] },
      { id: 's01.durability', title: '工具耐久', steps: [{ text: '再使用斧头完成一次采集。采集成功才消耗耐久，归零后本次产物仍会保留。' }] },
      { id: 's01.capacity', title: '背包容量', steps: [{ text: '再完成一次采集。系统只结算背包可容纳的数量，溢出资源会留在节点中。' }] }
    ];
    const configured = project?.extensions?.sanguoZhangjiao?.s01Tutorials;
    const configuredById = new Map((Array.isArray(configured) ? configured : [])
      .filter(definition => S01_TUTORIAL_IDS.includes(definition?.id))
      .map(definition => [definition.id, definition]));
    const definitions = fallbackTutorials.map(fallback => {
      const override = configuredById.get(fallback.id);
      return override && Array.isArray(override.steps)
        ? { ...fallback, ...cloneData(override) }
        : fallback;
    });
    for (const definition of definitions) {
      this.tutorialSystem.registerTutorial(definition.id, {
        ...cloneData(definition),
        category: definition.category || 's01-survival',
        canSkip: definition.canSkip === true,
        autoTrigger: definition.autoTrigger === true
      });
    }
    if (project || this._s01TutorialCallbacksBound) return;
    this._s01TutorialCallbacksBound = true;
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

  /** 场景采集政策统一入口：S05 处理强制工具损毁，S09 处理未许可采粮。 */
  prepareGatheringSettlement(context = {}) {
    const { operationId, node, owner } = context;
    if (this.currentSceneId === 'S05' && node?.resourceType === 'iron') {
      return this._prepareS05MineGatheringSettlement(context);
    }
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

  _prepareS05MineGatheringSettlement(context = {}) {
    const { operationId, nodeEntity, node, inventory, tool } = context;
    const blackboard = this.gameLoader?.blackboard;
    const storyBefore = cloneData(blackboard?.get?.('storyState') || {});
    const mineState = storyBefore.s05Mine || {};
    if (!blackboard || nodeEntity?.id !== 'S05-iron-ore') return { ok: false, code: 'invalidS05MineNode' };
    if (mineState.prepared !== true) return { ok: false, code: 's05MineNotPrepared' };
    if (mineState.collapseCommitted === true) return { ok: false, code: 's05MineCollapsed' };
    if (!tool || tool.toolType !== 'pickaxe' || Number(tool.durability) !== 1) {
      return { ok: false, code: 's05WornPickaxeRequired' };
    }
    if (!operationId || this._s05MinePendingSettlements.has(operationId)) {
      return { ok: false, code: 's05MineSettlementBusy' };
    }

    const inventoryBefore = inventory?.exportItems?.();
    const nodeBefore = node.serialize?.();
    if (!inventoryBefore || !nodeBefore) return { ok: false, code: 's05MineSnapshotUnavailable' };
    return {
      ok: true,
      commit: ({ accepted }) => {
        if (Number(tool.durability) !== 0 || Number(accepted) <= 0) {
          throw new Error('s05PickaxeDidNotBreak');
        }
        const draftStory = {
          ...storyBefore,
          s05Mine: {
            ...mineState,
            prepared: true,
            status: 'collapsed',
            toolBroken: true,
            collapseCommitted: true,
            ambushActivated: true,
            retreatCompleted: false,
            gatheredIron: Math.max(0, Number(mineState.gatheredIron) || 0) + Number(accepted),
            settlementOperationId: operationId
          },
          lastCheckpointId: 'checkpoint.S05.mineCollapse'
        };
        blackboard.set('storyState', draftStory);
        this._s05MinePendingSettlements.set(operationId, {
          storyBefore, inventory, inventoryBefore, node, nodeBefore,
          inventoryOperationId: `${operationId}:settle`
        });
        return { ok: true };
      },
      rollback: () => {
        blackboard.set('storyState', storyBefore);
        this._s05MinePendingSettlements.delete(operationId);
      }
    };
  }

  async _finalizeS05MineCollapse(data = {}) {
    const operationId = data.operationId;
    const pending = this._s05MinePendingSettlements.get(operationId);
    if (!pending || this._s05MineBusy) return false;
    this._s05MineBusy = true;
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S05.mineCollapse', sceneId: 'S05'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      this._s05MinePendingSettlements.delete(operationId);
      await this._syncS05MineWorldState();
      this._grantGatheringProficiency(data);
      this._showScreenTip(
        '鹤嘴镐已经折断，碎石封住近路，官军伏兵同时现身。带着铁矿无法开路，只能前往西侧撤退区徒手突围。',
        { title: '矿坑塌方' }
      );
      return true;
    } catch (error) {
      this.gameLoader?.blackboard?.set?.('storyState', pending.storyBefore);
      pending.inventory?.loadItems?.(pending.inventoryBefore);
      pending.node?.deserialize?.(pending.nodeBefore);
      this.gatheringSystem?.completedOperations?.delete?.(operationId);
      this.inventoryTransactions?.forgetOperation?.(pending.inventoryOperationId);
      this._s05MinePendingSettlements.delete(operationId);
      this._showScreenTip(`矿坑检查点失败：${error?.message || error}。铁矿、工具、节点与剧情状态已回滚，可重新尝试。`, {
        title: '保存失败'
      });
      return false;
    } finally {
      this._s05MineBusy = false;
    }
  }

  _grantGatheringProficiency(data = {}) {
    if (Number(data.accepted) <= 0 || !data.operationId) return false;
    const definition = this.proficiencySystem?.getDefinition?.('gathering');
    const amount = Math.max(1, Math.floor(Number(data.accepted) * (definition?.experiencePerUnit || 1)));
    const result = this.proficiencySystem?.gainExperience?.({
      characterId: this.playerEntity?.id,
      type: 'gathering',
      amount,
      operationId: `gathering:${data.operationId}`
    });
    if (result?.ok === false) console.warn('[DDScene] 采集熟练度提交失败:', result.code);
    return result?.ok !== false;
  }

  onGatheringEvent(event, data = {}) {
    if (event === 'completed' && data.idempotent === true) {
      this._showScreenTip('该次采集已经结算，不会重复获得资源或扣除声望。');
      return;
    }
    super.onGatheringEvent(event, data);
    if ((event === 'completed' || event === 'interrupted')
      && data.toolBroken === true
      && this._s05MinePendingSettlements.has(data.operationId)) {
      void this._finalizeS05MineCollapse(data);
      return;
    }
    if (event === 'completed' && this._appliedGatheringPolicyOperations.has(data.operationId)) {
      this._showScreenTip('未获许可取走粮食：声望 -5，粮仓哨兵已被惊动。');
    }
    if (event === 'completed') this._grantGatheringProficiency(data);
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
    if (!this._getBattleFlowByScene(request.sceneId)) {
      this.battleModeView?.close?.();
      this.battleResultView?.close?.();
      this.battleHudView?.clear?.();
      if (this.battlefieldRuntime?.active) {
        this.battlefieldRuntime.stop({ entities: this.entities || [], preserveSnapshot: true });
      }
    }
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
      constructionState: this.constructionSystem?.serialize?.() || null,
      battleState: this.battleSystem?.serialize?.() || null,
      battlefieldRuntimeState: this.battlefieldRuntime?.serialize?.() || null,
      cityWarState: this.cityWarSystem?.serialize?.() || null,
      rescueState: this.rescueSystem?.serialize?.() || null,
      gatheringPolicyOperations: [...(this._appliedGatheringPolicyOperations || new Set())],
      timeState: this.timeSystem?.serialize?.() || null,
      nextSceneTarget: this._nextSceneTarget || null,
      playerDiedTriggered: !!this._playerDiedTriggered
    };
  }

  restoreSceneSaveState(data = {}) {
    if (data.battleState) {
      if (!this.battleSystem) {
        return { ok: false, errors: [{ code: 'battleRuntimeUnavailable', path: 'battleState', message: '战役运行时尚未就绪' }] };
      }
      const probe = new BattleSystem();
      const check = probe.deserialize(data.battleState);
      if (!check.ok) {
        return { ok: false, errors: [{ code: check.code, path: 'battleState', message: `战役状态校验失败: ${check.code}` }] };
      }
      const battleId = data.battleState.definition?.battleId;
      if (!this._getBattleFlowById(battleId)
        || !this._getBattleConfigById(battleId)) {
        return { ok: false, errors: [{
          code: 'unknownBattleId', path: 'battleState.definition.battleId', message: `未知战役配置: ${battleId || 'missing'}`
        }] };
      }
    }
    if (data.battlefieldRuntimeState) {
      if (!this.battlefieldRuntime) {
        return { ok: false, errors: [{ code: 'battlefieldRuntimeUnavailable', path: 'battlefieldRuntimeState', message: '实时战场运行时尚未就绪' }] };
      }
      const check = this.battlefieldRuntime.validateSerialized(data.battlefieldRuntimeState);
      if (!check.ok) {
        return { ok: false, errors: [{ code: check.code, path: 'battlefieldRuntimeState', message: `实时战场状态校验失败: ${check.code}` }] };
      }
    }
    if (data.cityWarState) {
      if (!this.cityWarSystem) {
        return { ok: false, errors: [{ code: 'cityWarRuntimeUnavailable', path: 'cityWarState', message: '城市战争运行时尚未就绪' }] };
      }
      const probe = new CityWarSystem();
      const check = probe.deserialize(data.cityWarState);
      if (!check.ok) {
        return { ok: false, errors: [{ code: check.code, path: 'cityWarState', message: `城市战争状态校验失败: ${check.code}` }] };
      }
    }
    if (data.rescueState) {
      if (!this.rescueSystem) {
        return { ok: false, errors: [{ code: 'rescueRuntimeUnavailable', path: 'rescueState', message: '救援运行时尚未就绪' }] };
      }
      const check = this.rescueSystem.validateSerialized(data.rescueState);
      if (!check.ok) {
        return { ok: false, errors: [{ code: check.code, path: 'rescueState', message: `救援状态校验失败: ${check.code}` }] };
      }
      const rescueId = data.rescueState.definition?.id || null;
      if (rescueId && !Object.prototype.hasOwnProperty.call(RESCUE_TITLE_BY_ID, rescueId)) {
        return { ok: false, errors: [{
          code: 'unknownRescueId', path: 'rescueState.definition.id', message: `未知救援配置: ${rescueId}`
        }] };
      }
    }
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
    if (data.constructionState) {
      if (!this.constructionSystem) {
        return { ok: false, errors: [{
          code: 'constructionRuntimeUnavailable', path: 'constructionState', message: '营建运行时尚未就绪'
        }] };
      }
      const inventory = this.playerEntity?.getComponent?.('inventory');
      const constructionCheck = this.constructionSystem.validateSerialized(data.constructionState, {
        resolveInventory: characterId => characterId === this.playerEntity?.id ? inventory : null
      });
      if (!constructionCheck.ok) {
        return { ok: false, errors: constructionCheck.errors.map(error => ({
          ...error,
          path: error.path ? `constructionState.${error.path}` : 'constructionState'
        })) };
      }
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
    this._syncWarResourceNodeStates(this.gameLoader?.blackboard?.get?.('warResourceNodeStates') || []);

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
    if (data.constructionState) {
      const inventory = this.playerEntity?.getComponent?.('inventory');
      const constructionRestore = this.constructionSystem.deserialize(data.constructionState, {
        resolveInventory: characterId => characterId === this.playerEntity?.id ? inventory : null
      });
      if (!constructionRestore.ok) {
        return { ok: false, errors: constructionRestore.errors.map(error => ({
          ...error,
          path: error.path ? `constructionState.${error.path}` : 'constructionState'
        })) };
      }
    }
    if (data.battleState) {
      const restored = this.battleSystem.deserialize(data.battleState);
      if (!restored.ok) return { ok: false, errors: [{ code: restored.code, path: 'battleState', message: '战役状态恢复失败' }] };
      const battleId = data.battleState.definition?.battleId;
      const config = this._getBattleConfigById(battleId);
      if (!config) {
        return { ok: false, errors: [{ code: 'unknownBattleId', path: 'battleState.definition.battleId', message: `未知战役配置: ${battleId}` }] };
      }
      this._activeBattleConfig = config;
    }
    if (data.battlefieldRuntimeState) {
      const restored = this.battlefieldRuntime.deserialize(data.battlefieldRuntimeState, {
        entities: this.entities || [],
        playerEntity: this.playerEntity,
        playerFactionId: this._activeBattleConfig?.playerInterventionFactionId || 'yellow_turban'
      });
      if (!restored.ok) {
        return { ok: false, errors: [{ code: restored.code, path: 'battlefieldRuntimeState', message: '实时战场状态恢复失败' }] };
      }
      this.battleHudView?.setSnapshot?.(
        this.battlefieldRuntime.active ? this.battlefieldRuntime.getSnapshot() : null
      );
    }
    if (data.cityWarState) {
      const restored = this.cityWarSystem.deserialize(data.cityWarState);
      if (!restored.ok) return { ok: false, errors: [{ code: restored.code, path: 'cityWarState', message: '城市战争状态恢复失败' }] };
    }
    if (data.rescueState) {
      const restored = this.rescueSystem.deserialize(data.rescueState);
      if (!restored.ok) return { ok: false, errors: [{ code: restored.code, path: 'rescueState', message: '救援状态恢复失败' }] };
      if (restored.state?.definitionId) this._setRescueObjectiveTitle(restored.state.definitionId);
      this.rescueObjectiveView?.setSnapshot?.(restored.state);
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
    if (this.currentSceneId === 'S05') void this._syncS05MineWorldState();
    if (this.currentSceneId === 'S07') this._syncS07DelayWorldState();
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

          // 项目扩展配置覆盖启动期兼容定义；新游戏首条教学只会在 GameLoader ready 后显示。
          this._configureS01Tutorial(gameLoader.project);
          this._configureSharedClassEffects(gameLoader);
          this._installBattleFlow(gameLoader);
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
    const constructionConfig = gameLoader?.project?.construction || {};
    const constructionSites = new Map((constructionConfig.sites || []).map(site => [site.id, site]));
    const itemRegistry = gameLoader?.getRegistry?.('items');
    this.constructionSystem = new ConstructionSystem({
      inventoryTransactions: this.inventoryTransactions,
      proficiencySystem: this.proficiencySystem,
      maxOperations: constructionConfig.maxOperations,
      itemResolver: itemId => cloneData(itemRegistry?.get?.(itemId) || null),
      validateSite: ({ siteId, definition }) => {
        const site = constructionSites.get(siteId);
        if (!site || site.sceneId !== this.currentSceneId || site.definitionId !== definition.id) {
          return { ok: false, code: 'invalidSite' };
        }
        const story = gameLoader.blackboard?.get?.('storyState') || {};
        if (site.sceneId === 'S06') {
          const rescueSucceeded = story.zhangManchengSurvived === true
            && story.rescueResults?.[S05_ZHANG_MANCHENG_RESCUE_ID]?.survived === true;
          return rescueSucceeded && story.s06Decision?.committed !== true
            ? { ok: true }
            : { ok: false, code: 'constructionSiteLocked' };
        }
        if (story.constructionSiteUnlocked !== true || story.s10CampRelocation?.completed !== true) {
          return { ok: false, code: 'constructionSiteLocked' };
        }
        return { ok: true };
      }
    });
    const registered = this.constructionSystem.registerDefinitions(constructionConfig.definitions || []);
    if (!registered.ok || !this.proficiencySystem.getDefinition?.('construction')) {
      throw new Error(`营建配置无效: ${registered.code || 'missingConstructionProficiency'}`);
    }
    this._gameplaySystemAssembler?.configureAbilities?.({
      skillRegistry: gameLoader.skillRegistry,
      effectResolver: resolver
    });
    this.gatheringPuppetSystem?.configure?.({ effectResolver: resolver, owner: this.playerEntity });
    this._syncUnlockedClassSkills();
    return true;
  }

  /** 安装 S03/S04/S05/S07 战役与通用救援领域系统；UI 只发命令，Blackboard 由事务 adapter 提交。 */
  _getBattleFlowByScene(sceneId) {
    return this._battleFlowsByScene?.get?.(sceneId) || BATTLE_FLOW_BY_SCENE[sceneId] || null;
  }

  _getBattleFlowById(battleId) {
    return this._battleFlowsById?.get?.(battleId) || BATTLE_FLOW_BY_ID[battleId] || null;
  }

  _getBattleFlows() {
    return this._battleFlowsByScene?.size
      ? [...this._battleFlowsByScene.values()]
      : Object.values(BATTLE_FLOW_BY_SCENE);
  }

  _installBattleFlow(gameLoader) {
    const s03Source = (gameLoader?.project?.battles || []).find(entry => entry?.battleId === S03_BATTLE_ID);
    const s04Source = (gameLoader?.project?.battles || []).find(entry => entry?.battleId === S04_BATTLE_ID);
    const s05Source = (gameLoader?.project?.battles || []).find(entry => entry?.battleId === S05_BATTLE_ID);
    const s07Source = (gameLoader?.project?.battles || []).find(entry => entry?.battleId === S07_BATTLE_ID);
    const s04RescueSource = (gameLoader?.project?.rescues || []).find(entry => entry?.id === S04_BOCAI_RESCUE_ID);
    const s05RescueSource = (gameLoader?.project?.rescues || []).find(
      entry => entry?.id === S05_ZHANG_MANCHENG_RESCUE_ID
    );
    if (!s03Source) throw new Error(`缺少战役配置 ${S03_BATTLE_ID}`);
    if (!s04Source) throw new Error(`缺少战役配置 ${S04_BATTLE_ID}`);
    if (!s05Source) throw new Error(`缺少战役配置 ${S05_BATTLE_ID}`);
    if (!s07Source) throw new Error(`缺少战役配置 ${S07_BATTLE_ID}`);
    if (!s04RescueSource) throw new Error(`缺少救援配置 ${S04_BOCAI_RESCUE_ID}`);
    if (!s05RescueSource) throw new Error(`缺少救援配置 ${S05_ZHANG_MANCHENG_RESCUE_ID}`);

    const definition = cloneData(s03Source);
    const s04Definition = cloneData(s04Source);
    const s05Definition = cloneData(s05Source);
    const s07Definition = cloneData(s07Source);
    const s04RescueDefinition = cloneData(s04RescueSource);
    const s05RescueDefinition = cloneData(s05RescueSource);
    const battleFlowSources = [
      ['S03', s03Source], ['S04', s04Source], ['S05', s05Source], ['S07', s07Source]
    ];
    this._battleFlowsByScene = new Map();
    this._battleFlowsById = new Map();
    for (const [sceneId, source] of battleFlowSources) {
      const configured = cloneData(source.sceneFlow || {});
      if (configured.sceneId && configured.sceneId !== sceneId) {
        throw new Error(`战役 ${source.battleId} 的 sceneFlow.sceneId 与 ${sceneId} 不一致`);
      }
      const flow = Object.freeze({
        ...BATTLE_FLOW_BY_SCENE[sceneId],
        ...configured,
        sceneId,
        battleId: source.battleId,
        worldChanges: Object.freeze(cloneData(configured.worldChanges
          ?? BATTLE_FLOW_BY_SCENE[sceneId].worldChanges ?? {}))
      });
      this._battleFlowsByScene.set(sceneId, flow);
      this._battleFlowsById.set(source.battleId, flow);
    }
    definition.playerEntityId = this.playerEntity?.id || definition.playerEntityId;
    s04Definition.playerEntityId = this.playerEntity?.id || s04Definition.playerEntityId;
    s05Definition.playerEntityId = this.playerEntity?.id || s05Definition.playerEntityId;
    s07Definition.playerEntityId = this.playerEntity?.id || s07Definition.playerEntityId;
    const battleSystem = new BattleSystem({
      battleClient: gameLoader.battleClient,
      validator: gameLoader.contentValidator,
      onEvent: (event, data) => {
        if (event === 'battleModeSelected') {
          this.notificationSystem?.addNotification?.(
            data.mode === BattleMode.OBSERVE ? '本场已选择观战' : '本场已选择介入',
            'info'
          );
        }
      }
    });
    const previousEffectFilter = this.combatSystem?.setEffectAmountFilter?.(
      (context, amount) => battleSystem.filterEffectAmount(context, amount)
    ) || null;
    const cityWarSystem = new CityWarSystem({
      validator: gameLoader.contentValidator,
      readState: () => this._readCityWarState(),
      commitState: draft => this._commitCityWarState(draft),
      restoreState: before => this._restoreCityWarState(before),
      createCheckpoint: checkpoint => this.requestAutoSave({
        reason: 'checkpoint', checkpointId: checkpoint.checkpointId, sceneId: this.currentSceneId
      }),
      onEvent: event => {
        if (event === 'battleResultRolledBack') {
          this.notificationSystem?.addNotification?.('战果检查点失败，城市与战争状态已回滚', 'error');
        }
      }
    });
    const battleModeView = new BattleModeView({
      width: Math.min(560, this.logicalWidth - 32),
      onCommand: command => { void this._handleBattleModeCommand(command); }
    });
    const battleHudView = new BattleHudView({ width: Math.min(500, this.logicalWidth - 32) });
    const battleResultView = new BattleResultView({
      width: Math.min(520, this.logicalWidth - 32),
      onCommand: command => {
        if (command.type === 'close') battleResultView.close();
      }
    });
    const battlefieldRuntime = new BattlefieldRuntimeSystem({
      battleSystem,
      aiSystem: this.aiSystem,
      onEvent: (event, data) => {
        if (event === 'battlefieldStarted') battleHudView.setSnapshot(data);
        if (event === 'battlefieldResolved') battleHudView.clear();
      }
    });
    const rescueObjectiveView = new RescueObjectiveView({
      width: Math.min(500, this.logicalWidth - 32),
      title: '波才限时救援'
    });
    const irreversibleChoiceView = new IrreversibleChoiceView({
      width: Math.min(600, this.logicalWidth - 32),
      onCommand: command => { void this._handleIrreversibleChoiceCommand(command); }
    });
    const rescueSystem = new RescueSystem({
      onEvent: (event, data) => {
        if (event === 'rescueStarted' || event === 'rescueStageAdvanced') {
          rescueObjectiveView.setSnapshot(data);
        }
      }
    });
    const offS05CombatDamage = this.combatSystem?.addDamageListener?.(
      event => this._handleS05CombatDamage(event)
    ) || (() => {});
    this.resourceScope?.track(offS05CombatDamage);
    const s04RouteCoordinator = new S04RouteCoordinator({
      readState: () => ({
        storyState: cloneData(gameLoader.blackboard?.get?.('storyState') || {}),
        warState: cloneData(gameLoader.blackboard?.get?.('warState') || {}),
        appliedBattleResultIds: cloneData(gameLoader.blackboard?.get?.('appliedBattleResultIds') || [])
      }),
      writeStoryState: storyState => {
        if (!gameLoader.blackboard) return false;
        gameLoader.blackboard.set('storyState', cloneData(storyState));
        return true;
      },
      hasTarget: sceneId => !!this._worldLoadSession?.getChunk?.(sceneId)
        && !!this._worldLoadSession?.findSpawn?.(sceneId, 'player'),
      createCheckpoint: checkpoint => this.requestAutoSave({
        reason: 'checkpoint', checkpointId: checkpoint.checkpointId, sceneId: checkpoint.sceneId
      }),
      onCommitted: ({ route, operationId }) => gameLoader.triggerSystem?.fire?.('routeSelected', {
        routeId: route.id, entrySceneId: route.entrySceneId, operationId
      })
    });

    this.battleSystem = battleSystem;
    this.battlefieldRuntime = battlefieldRuntime;
    this.cityWarSystem = cityWarSystem;
    this.battleModeView = battleModeView;
    this.battleHudView = battleHudView;
    this.battleResultView = battleResultView;
    this.rescueSystem = rescueSystem;
    this.rescueObjectiveView = rescueObjectiveView;
    this.irreversibleChoiceView = irreversibleChoiceView;
    this.s04RouteCoordinator = s04RouteCoordinator;
    this._s03BattleConfig = definition;
    this._s04BattleConfig = s04Definition;
    this._s05BattleConfig = s05Definition;
    this._s07BattleConfig = s07Definition;
    this._s04BocaiRescueConfig = s04RescueDefinition;
    this._s05ZhangManchengRescueConfig = s05RescueDefinition;
    this._activeBattleConfig = definition;
    this._s03BattleBusy = false;
    this._s04RescueBusy = false;
    this._s05RescueBusy = false;
    this._s04RouteBusy = false;
    this._s07PointBusy = false;
    this._s07ExitBusy = false;
    this._s08DecisionBusy = false;
    this._s08RecallBusy = false;
    this.resourceScope?.track(() => {
      battleModeView.close();
      battleResultView.close();
      battleHudView.clear();
      rescueObjectiveView.clear();
      irreversibleChoiceView.close();
      battlefieldRuntime.dispose(this.entities || []);
      if (this.battleSystem === battleSystem) {
        this.combatSystem?.setEffectAmountFilter?.(previousEffectFilter);
        this.battleSystem = null;
      }
      if (this.battlefieldRuntime === battlefieldRuntime) this.battlefieldRuntime = null;
      if (this.cityWarSystem === cityWarSystem) this.cityWarSystem = null;
      if (this.battleModeView === battleModeView) this.battleModeView = null;
      if (this.battleHudView === battleHudView) this.battleHudView = null;
      if (this.battleResultView === battleResultView) this.battleResultView = null;
      if (this.rescueSystem === rescueSystem) this.rescueSystem = null;
      if (this.rescueObjectiveView === rescueObjectiveView) this.rescueObjectiveView = null;
      if (this.irreversibleChoiceView === irreversibleChoiceView) this.irreversibleChoiceView = null;
      if (this.s04RouteCoordinator === s04RouteCoordinator) this.s04RouteCoordinator = null;
      if (this._s03BattleConfig === definition) this._s03BattleConfig = null;
      if (this._s04BattleConfig === s04Definition) this._s04BattleConfig = null;
      if (this._s05BattleConfig === s05Definition) this._s05BattleConfig = null;
      if (this._s07BattleConfig === s07Definition) this._s07BattleConfig = null;
      if (this._s04BocaiRescueConfig === s04RescueDefinition) this._s04BocaiRescueConfig = null;
      if (this._s05ZhangManchengRescueConfig === s05RescueDefinition) {
        this._s05ZhangManchengRescueConfig = null;
      }
      this._activeBattleConfig = null;
      this._battleFlowsByScene = null;
      this._battleFlowsById = null;
      this._s03BattleBusy = false;
      this._s04RescueBusy = false;
      this._s05RescueBusy = false;
      this._s04RouteBusy = false;
      this._s07PointBusy = false;
      this._s07ExitBusy = false;
      this._s08DecisionBusy = false;
      this._s08RecallBusy = false;
      this._s10StoryBusy = false;
    });
    return true;
  }

  _readCityWarState() {
    const blackboard = this.gameLoader?.blackboard;
    const configuredNodes = (this.gameLoader?.project?.library?.resourceNodes || []).map(node => ({
      id: node.id,
      damageRatio: Number(node.damageRatio) || 0
    }));
    const savedNodes = blackboard?.get?.('warResourceNodeStates');
    return cloneData({
      storyState: blackboard?.get?.('storyState') || {},
      cityStates: blackboard?.get?.('cityStates') || [],
      warState: blackboard?.get?.('warState') || { battles: {}, casualties: {} },
      appliedBattleResultIds: blackboard?.get?.('appliedBattleResultIds') || [],
      resourceNodes: Array.isArray(savedNodes) && savedNodes.length ? savedNodes : configuredNodes
    });
  }

  _projectBattleStoryState(state) {
    const projected = cloneData(state);
    const activeBattleId = this.battleSystem?.definition?.battleId;
    if (activeBattleId && !this._getBattleFlowById(activeBattleId)) {
      throw new Error(`unknownBattleId:${activeBattleId}`);
    }
    const battleModes = { ...(projected.storyState?.battleModes || {}) };
    if (activeBattleId && this.battleSystem?.mode) battleModes[activeBattleId] = this.battleSystem.mode;
    projected.storyState = { ...(projected.storyState || {}), battleModes };
    for (const flow of this._getBattleFlows()) {
      const result = projected.warState?.battles?.[flow.battleId];
      if (!result) continue;
      projected.storyState = {
        ...projected.storyState,
        [flow.resolvedKey]: true,
        [flow.winnerKey]: result.winnerFactionId,
        lastCheckpointId: flow.checkpointId
      };
      if (flow.battleId === S03_BATTLE_ID) {
        projected.storyState.month = Math.max(5, Math.floor(Number(projected.storyState.month) || 0));
      }
      if (flow.battleId === S07_BATTLE_ID) {
        projected.storyState.month = Math.max(6, Math.floor(Number(projected.storyState.month) || 0));
      }
    }
    return projected;
  }

  _commitCityWarState(draft) {
    const blackboard = this.gameLoader?.blackboard;
    if (!blackboard) return false;
    const before = cloneData(blackboard.serialize());
    try {
      const committed = this._projectBattleStoryState(draft);
      blackboard.set('storyState', cloneData(committed.storyState));
      blackboard.set('cityStates', cloneData(committed.cityStates));
      blackboard.set('warState', cloneData(committed.warState));
      blackboard.set('appliedBattleResultIds', cloneData(committed.appliedBattleResultIds));
      blackboard.set('warResourceNodeStates', cloneData(committed.resourceNodes));
      this._syncWarResourceNodeStates(committed.resourceNodes);
      return true;
    } catch (error) {
      blackboard.deserialize(before);
      return false;
    }
  }

  _restoreCityWarState(before) {
    return this._commitCityWarState(before);
  }

  _syncWarResourceNodeStates(states = []) {
    const byId = new Map((states || []).map(state => [state.id, state]));
    for (const entity of this.entities || []) {
      const node = entity?.getComponent?.('resourceNode');
      const state = byId.get(entity?.id);
      if (node && state) node.damageRatio = Math.min(1, Math.max(0, Number(state.damageRatio) || 0));
    }
    for (const [id, pending] of this._pendingResourceNodeStates || []) {
      const state = byId.get(id);
      if (state) pending.damageRatio = Math.min(1, Math.max(0, Number(state.damageRatio) || 0));
    }
  }

  _getBattleConfigById(battleId) {
    const configs = {
      [S03_BATTLE_ID]: this._s03BattleConfig,
      [S04_BATTLE_ID]: this._s04BattleConfig,
      [S05_BATTLE_ID]: this._s05BattleConfig,
      [S07_BATTLE_ID]: this._s07BattleConfig
    };
    return Object.prototype.hasOwnProperty.call(configs, battleId) ? configs[battleId] : null;
  }

  _setRescueObjectiveTitle(definitionId) {
    const title = RESCUE_TITLE_BY_ID[definitionId];
    if (!title || !this.rescueObjectiveView) return false;
    this.rescueObjectiveView.title = title;
    return true;
  }

  _markS05Visited() {
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = blackboard?.get?.('storyState');
    if (!beforeStory || (beforeStory.visitedScenes || []).includes('S05')) return true;
    blackboard.set('storyState', {
      ...beforeStory,
      visitedScenes: [...new Set([...(beforeStory.visitedScenes || []), 'S05'])]
    });
    return true;
  }

  _activateBattleConfig(definition) {
    if (!definition || !this.battleSystem || !this.battlefieldRuntime) return false;
    const currentBattleId = this.battleSystem.definition?.battleId;
    if (!currentBattleId || currentBattleId === definition.battleId) {
      this._activeBattleConfig = definition;
      return true;
    }
    if (this.battleSystem.state !== BattleState.RESOLVED) return false;
    const frozenResult = this.battleSystem.getState().result;
    const applied = frozenResult
      && (this.gameLoader?.blackboard?.get?.('appliedBattleResultIds') || []).includes(frozenResult.resultId);
    if (!applied) return false;
    this.battlefieldRuntime.stop({ entities: this.entities || [] });
    this.battlefieldRuntime.reset();
    this.battleSystem.reset();
    this._activeBattleConfig = definition;
    return true;
  }

  async openS03BattleMode() {
    return this._openBattleMode('S03');
  }

  async openS04BattleMode() {
    return this._openBattleMode('S04');
  }

  async openS05BattleMode() {
    return this._openBattleMode('S05');
  }

  async openS07BattleMode() {
    return this._openBattleMode('S07');
  }

  async _openBattleMode(sceneId) {
    const flow = this._getBattleFlowByScene(sceneId);
    const config = flow ? this._getBattleConfigById(flow.battleId) : null;
    if (!flow || this.currentSceneId !== sceneId || !this.battleSystem || !config) {
      this._showScreenTip(flow?.unavailableMessage || '未知战役不能选择参战模式', { title: '无法选择战役模式' });
      return false;
    }
    if (!this._activateBattleConfig(config)) {
      this._showScreenTip(flow.conflictMessage, { title: '战役状态冲突' });
      return false;
    }
    if (sceneId === 'S05') this._markS05Visited();
    const frozenResult = this.battleSystem.getState().result;
    const resultApplied = frozenResult
      && (this.gameLoader?.blackboard?.get?.('appliedBattleResultIds') || []).includes(frozenResult.resultId);
    if (this.battleSystem.state === BattleState.RESOLVED && resultApplied) {
      this.battleResultView?.open?.({
        title: flow.appliedTitle,
        result: frozenResult,
        mode: this.battleSystem.mode,
        winnerName: frozenResult?.winnerFactionId,
        worldChanges: cloneData(flow.worldChanges),
        message: '该战果已经冻结并写入检查点，不能重新选择参战模式。'
      });
      return true;
    }
    if (this.battleSystem.state === BattleState.ACTIVE && this.battlefieldRuntime?.active) {
      this._showScreenTip(flow.activeMessage, { title: '战役进行中' });
      return true;
    }
    try {
      if (this.battleSystem.state === BattleState.IDLE) {
        const started = await this.battleSystem.start(config, { requestId: `create:${flow.battleId}` });
        if (!started?.ok) throw new Error(started?.code || 'battleStartRejected');
      } else {
        const restored = await this.battleSystem.rehydrate({ requestId: `create:${flow.battleId}` });
        if (!restored?.ok) throw new Error(restored?.code || 'battleRehydrateRejected');
      }
      this.battleModeView?.open?.({
        ...cloneData(config.modeView || {}),
        description: sceneId === 'S03' && frozenResult
          ? '战果已冻结，但上次检查点未提交。确认原模式以重试城市与战争结算。'
          : config.modeView?.description,
        selectedMode: this.battleSystem.mode || BattleMode.OBSERVE
      });
      return true;
    } catch (error) {
      this._showScreenTip(`创建${flow.locationName}战役失败：${error?.message || error}`, { title: '战役服务错误' });
      return false;
    }
  }

  async _handleBattleModeCommand(command = {}) {
    if (command.type === 'cancel') {
      if (!this._s03BattleBusy) this.battleModeView?.close?.();
      return true;
    }
    if (command.type !== 'selectMode') return false;
    const handlers = {
      S03: () => this.selectS03BattleMode(command.mode),
      S04: () => this.selectS04BattleMode(command.mode),
      S05: () => this.selectS05BattleMode(command.mode),
      S07: () => this.selectS07BattleMode(command.mode)
    };
    return handlers[this.currentSceneId]?.() ?? false;
  }

  async selectS03BattleMode(mode) {
    return this._selectBattleMode(mode, this._s03BattleConfig, 'S03');
  }

  async selectS04BattleMode(mode) {
    return this._selectBattleMode(mode, this._s04BattleConfig, 'S04');
  }

  async selectS05BattleMode(mode) {
    if (this.currentSceneId !== 'S05') return false;
    this._markS05Visited();
    return this._selectBattleMode(mode, this._s05BattleConfig, 'S05');
  }

  async selectS07BattleMode(mode) {
    return this._selectBattleMode(mode, this._s07BattleConfig, 'S07');
  }

  async _selectBattleMode(mode, config, sceneId) {
    const flow = this._getBattleFlowByScene(sceneId);
    if (this._s03BattleBusy || !flow || this.currentSceneId !== sceneId
      || !config || config.battleId !== flow.battleId
      || !this.battleSystem || !this.cityWarSystem || !this.battlefieldRuntime) return false;
    if (!this._activateBattleConfig(config)) return false;
    this._s03BattleBusy = true;
    this.battleModeView?.setBusy?.(true);
    try {
      if (this.battleSystem.mode && this.battleSystem.mode !== mode) {
        throw new Error(`modeLocked:${this.battleSystem.mode}`);
      }

      const frozenResult = this.battleSystem.getState().result;
      if (frozenResult) {
        await this._settleBattleResult(frozenResult, this.battlefieldRuntime.getSnapshot());
        this.battleModeView?.close?.();
        return true;
      }

      const entry = this._worldLoadSession?.findSpawn?.(
        sceneId, config.entryPointRef || 'battle-intervention'
      );
      if (!this.battleSystem.mode) {
        const selected = await this.battleSystem.selectMode(mode, {
          operationId: `mode:${config.battleId}:${mode}`,
          heroId: this.playerEntity?.id,
          entryPoint: entry ? { x: entry.x, y: entry.y } : null
        });
        if (!selected?.ok) throw new Error(selected?.code || 'modeSelectionRejected');
      }

      const started = this.battlefieldRuntime.start({
        entities: this.entities || [],
        playerEntity: this.playerEntity,
        playerFactionId: config.playerInterventionFactionId || 'yellow_turban'
      });
      if (!started?.ok) throw new Error(started?.code || 'battlefieldStartRejected');

      if (this.battleSystem.mode === BattleMode.INTERVENE && entry) {
        const transform = this.playerEntity?.getComponent?.('transform');
        if (transform) {
          transform.position.x = entry.x;
          transform.position.y = entry.y;
          this.camera?.setPosition?.(entry.x, entry.y);
        }
      }
      this.battleHudView?.setSnapshot?.(started.snapshot);
      this.battleModeView?.close?.();
      const observing = this.battleSystem.mode === BattleMode.OBSERVE;
      this._showScreenTip(
        observing
          ? `${flow.locationName}两军开始交战。观战期间不能影响参战单位。`
          : flow.interventionMessage,
        { title: '战役开始' }
      );
      return true;
    } catch (error) {
      this._showScreenTip(`战役模式未启动：${error?.message || error}。可保留当前选择重试。`, { title: '启动失败' });
      return false;
    } finally {
      this._s03BattleBusy = false;
      this.battleModeView?.setBusy?.(false);
    }
  }

  _updateS03BattleRuntime(deltaTime) {
    if (!this._getBattleFlowByScene(this.currentSceneId)
      || !this.battlefieldRuntime?.active || this._s03BattleBusy) return;
    const updated = this.battlefieldRuntime.update(deltaTime, this.entities || []);
    if (updated?.snapshot) this.battleHudView?.setSnapshot?.(updated.snapshot);
    if (!updated?.resolved || !updated.result) return;
    this._s03BattleBusy = true;
    void this._settleBattleResult(updated.result, updated.snapshot)
      .catch(error => {
        this._showScreenTip(`战果检查点未提交：${error?.message || error}。可在军令旗处重试。`, { title: '结算失败' });
      })
      .finally(() => { this._s03BattleBusy = false; });
  }

  async _settleBattleResult(result, battleSnapshot = null) {
    const flow = this._getBattleFlowById(result?.battleId);
    if (!flow) throw new Error(`unknownBattleId:${result?.battleId || 'missing'}`);
    const settled = await this.cityWarSystem.applyBattleResult({
      result,
      operationId: `settle:${result.resultId}`,
      context: { mode: this.battleSystem.mode, checkpointId: flow.checkpointId }
    });
    if (!settled?.ok) throw new Error(settled?.message || settled?.code || 'battleSettlementRejected');

    const faction = battleSnapshot?.factions?.[result.winnerFactionId];
    this.battleHudView?.clear?.();
    this.battleResultView?.open?.({
      title: flow.resultTitle,
      result,
      mode: this.battleSystem.mode,
      winnerName: faction?.name || result.winnerFactionId,
      worldChanges: cloneData(flow.worldChanges),
      message: flow.resultMessage
    });
    this._showScreenTip(flow.settlementMessage, { title: '战役结算完成' });
    return settled;
  }

  async _settleS03BattleResult(result, battleSnapshot = null) {
    return this._settleBattleResult(result, battleSnapshot);
  }

  async checkS03Exit() {
    if (this.currentSceneId !== 'S03') return false;
    const resolved = this.gameLoader?.blackboard?.get?.('warState')?.battles?.[S03_BATTLE_ID];
    if (!resolved) {
      this._showScreenTip('先在中央军令旗确认观战或介入，并完成颍川战果结算', { title: '战役尚未完成' });
      return false;
    }
    const targetChunk = this._worldLoadSession?.getChunk?.('S04');
    const targetSpawn = this._worldLoadSession?.findSpawn?.('S04', 'player');
    if (!targetChunk || !targetSpawn) {
      this._showScreenTip('S04 区块或玩家出生点缺失', { title: '长社路线不可用' });
      return false;
    }
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    blackboard?.set?.('storyState', {
      ...beforeStory,
      unlockedScenes: [...new Set([...(beforeStory.unlockedScenes || []), 'S04'])]
    });
    try {
      const result = await this.teleportToChunk({ scene: 'S04', spawnRef: 'player', transition: 'fadeBlack' });
      if (result === false || result?.cancelled) throw new Error('sceneTransitionCancelled');
      this.battleModeView?.close?.();
      this.battleResultView?.close?.();
      this.battleHudView?.clear?.();
      this._showScreenTip('已抵达五月的长社战场。', { title: 'S04·长社战场' });
      return true;
    } catch (error) {
      blackboard?.set?.('storyState', beforeStory);
      this._showScreenTip(`前往长社失败：${error?.message || error}`, { title: '场景切换失败' });
      return false;
    }
  }

  startS04BocaiRescue() {
    if (this.currentSceneId !== 'S04' || !this.rescueSystem || !this._s04BocaiRescueConfig) return false;
    this._setRescueObjectiveTitle(S04_BOCAI_RESCUE_ID);
    if (this.battleSystem?.mode !== BattleMode.INTERVENE) {
      this._showScreenTip('只有在长社战役选择介入后才能启动波才救援。', { title: '救援不可用' });
      return false;
    }
    const existing = this.rescueSystem.getState();
    if (existing.status !== RescueStatus.IDLE) {
      this.rescueObjectiveView?.setSnapshot?.(existing);
      this._showScreenTip(
        existing.status === RescueStatus.ACTIVE ? '波才救援正在进行。' : '波才救援结果已经冻结。',
        { title: '救援状态' }
      );
      return true;
    }
    const targetId = this._s04BocaiRescueConfig.targetEntityId;
    const target = (this.entities || []).find(entity => entity?.id === targetId);
    if (!target) {
      this._showScreenTip(`救援目标 ${targetId} 尚未生成`, { title: '救援配置错误' });
      return false;
    }
    const started = this.rescueSystem.start(this._s04BocaiRescueConfig, {
      mode: this.battleSystem.mode,
      operationId: `start:${S04_BOCAI_RESCUE_ID}`
    });
    if (!started.ok) {
      this._showScreenTip(`救援未启动：${started.message || started.code}`, { title: '救援失败' });
      return false;
    }
    this.rescueObjectiveView?.setSnapshot?.(started.state);
    this._showScreenTip('90 秒计时开始。靠近波才后向东侧绿色撤离区移动。', { title: '护送波才' });
    return true;
  }

  completeS04BocaiEvacuation() {
    if (this.currentSceneId !== 'S04' || this.rescueSystem?.status !== RescueStatus.ACTIVE) return false;
    const definition = this._s04BocaiRescueConfig;
    const target = (this.entities || []).find(entity => entity?.id === definition?.targetEntityId);
    const evacuation = this._worldLoadSession?.findSpawn?.('S04', definition?.evacuationRef);
    const transform = target?.getComponent?.('transform');
    if (!transform || !evacuation) return false;
    const dx = transform.position.x - evacuation.x;
    const dy = transform.position.y - evacuation.y;
    if (Math.hypot(dx, dy) > 80) {
      this._showScreenTip('波才尚未进入东侧撤离点，请继续护送。', { title: '撤离未完成' });
      return false;
    }
    const before = this.rescueSystem.serialize();
    const outcome = this.rescueSystem.completeStage('escort-east', {
      operationId: `complete:${S04_BOCAI_RESCUE_ID}:escort-east`
    });
    if (!outcome?.completed) return false;
    void this._settleS04BocaiRescue(outcome.result, before);
    return true;
  }

  _updateS04BocaiRescue(deltaTime) {
    if (this.currentSceneId !== 'S04' || this.rescueSystem?.status !== RescueStatus.ACTIVE || this._s04RescueBusy) return;
    const definition = this._s04BocaiRescueConfig;
    const target = (this.entities || []).find(entity => entity?.id === definition?.targetEntityId);
    const targetStats = target?.getComponent?.('stats');
    const targetTransform = target?.getComponent?.('transform');
    const playerTransform = this.playerEntity?.getComponent?.('transform');
    const before = this.rescueSystem.serialize();
    let outcome = null;
    if (!target || !targetStats || Number(targetStats.hp) <= 0) {
      outcome = this.rescueSystem.fail('targetDefeated', { operationId: `fail:${S04_BOCAI_RESCUE_ID}:target` });
    } else {
      outcome = this.rescueSystem.update();
      if (outcome?.active && targetTransform) {
        const evacuation = this._worldLoadSession?.findSpawn?.('S04', definition?.evacuationRef);
        if (evacuation && Math.hypot(
          targetTransform.position.x - evacuation.x,
          targetTransform.position.y - evacuation.y
        ) <= 80) {
          outcome = this.rescueSystem.completeStage('escort-east', {
            operationId: `complete:${S04_BOCAI_RESCUE_ID}:escort-east`
          });
        }
      }
      if (outcome?.active && targetTransform && playerTransform) {
        const dx = playerTransform.position.x - targetTransform.position.x;
        const dy = playerTransform.position.y - targetTransform.position.y;
        const distance = Math.hypot(dx, dy);
        const movement = target.getComponent?.('movement');
        if (movement && distance > 62 && distance < 260) {
          movement.setPath([{ x: playerTransform.position.x - 28, y: playerTransform.position.y + 18 }]);
        } else if (movement && distance <= 62) {
          movement.stop();
        }
      }
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem.getState());
    if (outcome?.completed && outcome.result) void this._settleS04BocaiRescue(outcome.result, before);
  }

  async _settleS04BocaiRescue(result, beforeRescueState) {
    if (this._s04RescueBusy) return false;
    this._s04RescueBusy = true;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    const rescueResults = { ...(beforeStory.rescueResults || {}), [S04_BOCAI_RESCUE_ID]: cloneData(result) };
    try {
      blackboard?.set?.('storyState', {
        ...beforeStory,
        rescueResults,
        bocaiSurvived: result.survived === true,
        lastCheckpointId: 'checkpoint.S04.bocaiRescue'
      });
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S04.bocaiRescue', sceneId: 'S04'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem.getState());
      this._showScreenTip(
        result.survived ? '波才已从东侧撤离，后续可在 S12 作为友军出现。' : '波才未能在时限内撤离。',
        { title: result.survived ? '救援成功' : '救援失败' }
      );
      return true;
    } catch (error) {
      blackboard?.set?.('storyState', beforeStory);
      const restored = this.rescueSystem.deserialize(beforeRescueState);
      this._setRescueObjectiveTitle(S04_BOCAI_RESCUE_ID);
      this.rescueObjectiveView?.setSnapshot?.(restored?.state || this.rescueSystem.getState());
      this._showScreenTip(`救援检查点失败：${error?.message || error}，结果已回滚。`, { title: '保存失败' });
      return false;
    } finally {
      this._s04RescueBusy = false;
    }
  }

  async prepareS05Mine() {
    if (this.currentSceneId !== 'S05' || this._s05MineBusy) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    const existing = beforeStory.s05Mine || {};
    if (existing.prepared === true) {
      this.showS05MineStatus();
      return true;
    }
    const nodePlacement = (this._placements || []).find(entry => entry.id === 'S05-iron-ore');
    const toolPlacement = (this._placements || []).find(entry => entry.id === 'S05-worn-pickaxe');
    if (!blackboard || !nodePlacement || !toolPlacement) {
      this._showScreenTip('矿坑铁矿或破旧铁镐配置缺失。', { title: '矿坑不可用' });
      return false;
    }
    this._s05MineBusy = true;
    blackboard.set('storyState', {
      ...beforeStory,
      s05Mine: {
        ...existing,
        prepared: true,
        status: 'prepared',
        toolBroken: false,
        collapseCommitted: false,
        ambushActivated: false,
        retreatCompleted: false,
        gatheredIron: 0,
        ironDiscarded: 0
      },
      lastCheckpointId: 'checkpoint.S05.minePrepared'
    });
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S05.minePrepared', sceneId: 'S05'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      await this._spawnPlacements({ placementIds: ['S05-worn-pickaxe', 'S05-iron-ore'] });
      this._showScreenTip('矿坑边只剩一把耐久 1 的破旧铁镐。拾取后采下一批铁矿；镐一旦折断，近路会被塌方封死。', {
        title: '矿坑准备完成'
      });
      return true;
    } catch (error) {
      blackboard.set('storyState', beforeStory);
      this._showScreenTip(`矿坑准备失败：${error?.message || error}，剧情状态已回滚。`, { title: '保存失败' });
      return false;
    } finally {
      this._s05MineBusy = false;
    }
  }

  showS05MineStatus() {
    if (this.currentSceneId !== 'S05') return false;
    const mine = this.gameLoader?.blackboard?.get?.('storyState')?.s05Mine || {};
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const hasPickaxe = (inventory?.slots || []).some(stack => (
      stack?.item?.id === 'tool.worn_pickaxe' && Number(stack.item.durability) > 0
    ));
    if (mine.prepared !== true) {
      this._showScreenTip('先检查矿坑入口，确认铁镐、塌方风险与撤退路线。', { title: '矿坑尚未准备' });
    } else if (mine.collapseCommitted !== true) {
      this._showScreenTip(
        hasPickaxe ? '靠近铁矿使用 {harvest} 开采。破旧铁镐只够完成一次结算。' : '先拾取矿坑边的破旧铁镐。',
        { title: '矿坑开采' }
      );
    } else if (mine.retreatCompleted !== true) {
      this._showScreenTip('近路已被碎石封死，官军伏兵已激活。前往西侧撤退区，丢下本次铁矿后徒手撤退。', {
        title: '必须撤退'
      });
    } else {
      this._showScreenTip('矿坑撤退已完成。现在可以介入宛城外围战役并救援张曼成。', { title: '矿坑事件完成' });
    }
    return true;
  }

  async completeS05MineRetreat() {
    if (this.currentSceneId !== 'S05' || this._s05MineBusy) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    const mine = beforeStory.s05Mine || {};
    if (mine.retreatCompleted === true) {
      this._showScreenTip('你已经从塌方矿坑撤出，本次铁矿不会重复丢弃。', { title: '撤退已完成' });
      return true;
    }
    if (mine.collapseCommitted !== true || mine.ambushActivated !== true) {
      this._showScreenTip('铁镐尚未损毁，当前不需要从矿坑徒手撤退。', { title: '撤退条件未满足' });
      return false;
    }
    const inventory = this.playerEntity?.getComponent?.('inventory');
    if (!blackboard || !inventory || this.gatheringSystem?.isActive?.()) return false;
    const inventoryBefore = inventory.exportItems?.();
    const discardRequested = Math.max(0, Math.floor(Number(mine.gatheredIron) || 0));
    const discardQuantity = discardRequested > 0
      ? this.inventoryTransactions.previewRemove(inventory, 'resource.iron', discardRequested).accepted
      : 0;
    const operationId = 'story:S05:mine-retreat';
    let removal = { ok: true, accepted: 0 };
    if (discardQuantity > 0) {
      removal = this.inventoryTransactions.commit({
        type: 'remove', inventory, itemId: 'resource.iron', quantity: discardQuantity,
        allowPartial: false, operationId
      });
      if (!removal.ok) return false;
    }
    blackboard.set('storyState', {
      ...beforeStory,
      s05Mine: {
        ...mine,
        status: 'retreated',
        retreatCompleted: true,
        ironDiscarded: removal.accepted || 0,
        retreatOperationId: operationId
      },
      lastCheckpointId: 'checkpoint.S05.mineRetreat'
    });
    this._s05MineBusy = true;
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S05.mineRetreat', sceneId: 'S05'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      this._showScreenTip(
        `你丢下 ${removal.accepted || 0} 份铁矿，从伏兵夹缝中徒手撤出。矿坑近路永久关闭，张曼成救援入口已经开放。`,
        { title: '徒手撤退完成' }
      );
      return true;
    } catch (error) {
      inventory.loadItems?.(inventoryBefore);
      blackboard.set('storyState', beforeStory);
      if (discardQuantity > 0) this.inventoryTransactions.forgetOperation?.(operationId);
      this._showScreenTip(`撤退检查点失败：${error?.message || error}，库存与剧情状态已回滚。`, { title: '保存失败' });
      return false;
    } finally {
      this._s05MineBusy = false;
    }
  }

  async _syncS05MineWorldState() {
    const mine = this.gameLoader?.blackboard?.get?.('storyState')?.s05Mine || {};
    const collapsed = mine.collapseCommitted === true;
    const placement = (this._placements || []).find(entry => entry.id === 'S05-mine-collapse');
    const collider = placement?.overrides?.collision;
    if (placement && collider) {
      this._terrainBinding?.setDynamicCollider?.({
        sceneId: 'S05', id: 'S05-mine-collapse', enabled: collapsed,
        shape: {
          type: 'rect',
          x: Number(placement.x) + Number(collider.x),
          y: Number(placement.y) + Number(collider.y),
          width: Number(collider.width),
          height: Number(collider.height)
        }
      });
    }
    if (!collapsed || this.currentSceneId !== 'S05') return collapsed;
    await this._spawnPlacements({ group: 'S05-mine-collapse' });
    await this._spawnPlacements({ group: 'S05-mine-ambush' });
    for (const enemy of this._groupEnemies?.['S05-mine-ambush'] || []) {
      if (!this._isEntityDead(enemy)) this.aiSystem?.activateAI?.(enemy, enemy.aiType || 'aggressive');
    }
    return true;
  }

  startS05ZhangManchengRescue() {
    if (this.currentSceneId !== 'S05' || !this.rescueSystem || !this._s05ZhangManchengRescueConfig) {
      this._showScreenTip('张曼成救援只可在 S05 宛城外围启动。', { title: '救援不可用' });
      return false;
    }
    const activeBattleId = this.battleSystem?.definition?.battleId;
    if (this.battleSystem?.mode !== BattleMode.INTERVENE
      || activeBattleId !== S05_BATTLE_ID
      || this.battleSystem?.state !== BattleState.ACTIVE
      || this.battlefieldRuntime?.active !== true) {
      this._showScreenTip('先在宛城外围战役选择介入并让实时战场进入进行中状态。', { title: '救援不可用' });
      return false;
    }
    const mineState = this.gameLoader?.blackboard?.get?.('storyState')?.s05Mine || {};
    if (mineState.retreatCompleted !== true) {
      this._showScreenTip('必须先经历铁镐损毁、矿坑塌方与徒手撤退，才能赶到张曼成身边。', { title: '救援路线尚未打通' });
      return false;
    }
    const zhangMancheng = (this.entities || []).find(entity => entity?.id === 'S05-zhang-mancheng');
    const qinJie = (this.entities || []).find(entity => entity?.id === 'S05-qin-jie');
    if (!zhangMancheng || !qinJie) {
      this._showScreenTip('张曼成或秦颉实体尚未生成，无法启动致命一击事件。', { title: '救援配置错误' });
      return false;
    }

    const existing = this.rescueSystem.getState();
    if (existing.status !== RescueStatus.IDLE) {
      if (existing.definitionId === S05_ZHANG_MANCHENG_RESCUE_ID) {
        this._setRescueObjectiveTitle(S05_ZHANG_MANCHENG_RESCUE_ID);
        this.rescueObjectiveView?.setSnapshot?.(existing);
        this._showScreenTip(
          existing.status === RescueStatus.ACTIVE ? '张曼成救援正在进行。' : '张曼成救援结果已经冻结。',
          { title: '救援状态' }
        );
        return true;
      }
      const storyState = this.gameLoader?.blackboard?.get?.('storyState') || {};
      const s04Persisted = !!storyState.rescueResults?.[S04_BOCAI_RESCUE_ID];
      const s04Terminal = existing.definitionId === S04_BOCAI_RESCUE_ID
        && [RescueStatus.SUCCEEDED, RescueStatus.FAILED].includes(existing.status);
      if (s04Terminal && s04Persisted) {
        this.rescueSystem.reset();
      } else {
        this._showScreenTip(
          existing.status === RescueStatus.ACTIVE
            ? '上一项救援仍在进行，不能启动张曼成救援。'
            : '上一项救援结果尚未写入检查点，不能切换救援目标。',
          { title: '救援状态冲突' }
        );
        return false;
      }
    }

    const started = this.rescueSystem.start(this._s05ZhangManchengRescueConfig, {
      mode: this.battleSystem.mode,
      operationId: `start:${S05_ZHANG_MANCHENG_RESCUE_ID}`
    });
    if (!started.ok) {
      this._showScreenTip(`救援未启动：${started.message || started.code}`, { title: '救援失败' });
      return false;
    }
    this._setRescueObjectiveTitle(S05_ZHANG_MANCHENG_RESCUE_ID);
    this.rescueObjectiveView?.setSnapshot?.(started.state);
    this._showScreenTip('60 秒内以远程攻击、远程技能或投掷命中秦颉，打断对张曼成的致命一击。', {
      title: '张曼成限时救援'
    });
    return true;
  }

  _handleS05CombatDamage(event = {}) {
    const rescueState = this.rescueSystem?.getState?.();
    if (this.currentSceneId !== 'S05'
      || rescueState?.definitionId !== S05_ZHANG_MANCHENG_RESCUE_ID
      || rescueState.status !== RescueStatus.ACTIVE
      || event.target?.id !== 'S05-qin-jie'
      || event.sourceEntityId !== this.playerEntity?.id
      || !['ranged', 'skill-ranged', 'throw'].includes(event.attackKind)) return false;
    const beforeRescueState = this.rescueSystem.serialize();
    const outcome = this.rescueSystem.completeStage('interrupt-lethal-strike', {
      operationId: `complete:${S05_ZHANG_MANCHENG_RESCUE_ID}:interrupt-lethal-strike`
    });
    this._setRescueObjectiveTitle(S05_ZHANG_MANCHENG_RESCUE_ID);
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem.getState());
    if (!outcome?.completed || !outcome.result) return false;
    void this._settleS05ZhangManchengRescue(outcome.result, beforeRescueState);
    return true;
  }

  _updateS05ZhangManchengRescue(deltaTime) {
    const rescueState = this.rescueSystem?.getState?.();
    if (this.currentSceneId !== 'S05'
      || rescueState?.definitionId !== S05_ZHANG_MANCHENG_RESCUE_ID
      || rescueState.status !== RescueStatus.ACTIVE
      || this._s05RescueBusy) return;
    const targetId = this._s05ZhangManchengRescueConfig?.targetEntityId;
    const target = (this.entities || []).find(entity => entity?.id === targetId);
    const stats = target?.getComponent?.('stats');
    const beforeRescueState = this.rescueSystem.serialize();
    let outcome;
    let targetHpRollback = null;
    if (!target || !stats || Number(stats.hp) <= 0) {
      outcome = this.rescueSystem.fail('targetDefeated', {
        operationId: `fail:${S05_ZHANG_MANCHENG_RESCUE_ID}:target`
      });
    } else {
      outcome = this.rescueSystem.update();
      if (outcome?.completed && outcome.result?.failureReason === 'deadlineExceeded') {
        targetHpRollback = { targetId, hp: Number(stats.hp) };
        const qinJie = (this.entities || []).find(entity => entity?.id === 'S05-qin-jie');
        this.combatSystem?.applyDamage?.(
          target,
          Math.max(1, Number(stats.hp)),
          null,
          '致命一击',
          { sourceEntity: qinJie || null, attackKind: 'scripted-lethal', deferDeathEffects: true }
        );
      }
    }
    this._setRescueObjectiveTitle(S05_ZHANG_MANCHENG_RESCUE_ID);
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem.getState());
    if (outcome?.completed && outcome.result) {
      void this._settleS05ZhangManchengRescue(outcome.result, beforeRescueState, targetHpRollback);
    }
  }

  async _settleS05ZhangManchengRescue(result, beforeRescueState, targetHpRollback = null) {
    if (this._s05RescueBusy || result?.rescueId !== S05_ZHANG_MANCHENG_RESCUE_ID) return false;
    this._s05RescueBusy = true;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    const survived = result.survived === true;
    const storyTags = new Set(beforeStory.storyTags || []);
    storyTags.delete(survived ? 'rescue.zhangMancheng.failed' : 'rescue.zhangMancheng.survived');
    storyTags.add(survived ? 'rescue.zhangMancheng.survived' : 'rescue.zhangMancheng.failed');
    const draftStory = {
      ...beforeStory,
      rescueResults: {
        ...(beforeStory.rescueResults || {}),
        [S05_ZHANG_MANCHENG_RESCUE_ID]: cloneData(result)
      },
      zhangManchengSurvived: survived,
      wanchengDefenseExtendedMonths: survived
        ? Math.max(1, Number(beforeStory.wanchengDefenseExtendedMonths) || 0)
        : Math.max(0, Number(beforeStory.wanchengDefenseExtendedMonths) || 0),
      s06AvailableUntilMonth: survived ? 9 : (beforeStory.s06AvailableUntilMonth || null),
      unlockedScenes: survived
        ? [...new Set([...(beforeStory.unlockedScenes || []), 'S06'])]
        : [...(beforeStory.unlockedScenes || [])],
      storyTags: [...storyTags],
      lastCheckpointId: 'checkpoint.S05.zhangManchengRescue'
    };
    try {
      if (!blackboard) throw new Error('storyStateUnavailable');
      blackboard.set('storyState', draftStory);
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S05.zhangManchengRescue', sceneId: 'S05'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      if (!survived && targetHpRollback) {
        const defeatedTarget = (this.entities || []).find(entity => entity?.id === targetHpRollback.targetId);
        if (defeatedTarget && !defeatedTarget.isDying && !defeatedTarget.isDead) {
          this.combatSystem?.spawnLoot?.(defeatedTarget);
          this.combatSystem?.triggerDeathEffect?.(defeatedTarget);
        }
      }
      this._setRescueObjectiveTitle(S05_ZHANG_MANCHENG_RESCUE_ID);
      this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem.getState());
      this._showScreenTip(
        survived
          ? '你远程打断了秦颉的致命一击，张曼成存活，S06 宛城围攻已经开放。'
          : '张曼成未能撑过 60 秒，宛城围攻路线未开放。',
        { title: survived ? '救援成功' : '救援失败' }
      );
      return true;
    } catch (error) {
      blackboard?.set?.('storyState', beforeStory);
      const restored = this.rescueSystem.deserialize(beforeRescueState);
      if (targetHpRollback && Number.isFinite(targetHpRollback.hp)) {
        const target = (this.entities || []).find(entity => entity?.id === targetHpRollback.targetId);
        const stats = target?.getComponent?.('stats');
        if (stats) stats.hp = targetHpRollback.hp;
      }
      this._setRescueObjectiveTitle(S05_ZHANG_MANCHENG_RESCUE_ID);
      this.rescueObjectiveView?.setSnapshot?.(restored?.state || this.rescueSystem.getState());
      this._showScreenTip(`张曼成救援检查点失败：${error?.message || error}，剧情、救援与生命值已回滚。`, {
        title: '保存失败'
      });
      return false;
    } finally {
      this._s05RescueBusy = false;
    }
  }

  async checkS05Exit() {
    if (this.currentSceneId !== 'S05') {
      this._showScreenTip('只有在 S05 宛城外围才能前往宛城围攻。', { title: '出口不可用' });
      return false;
    }
    const blackboard = this.gameLoader?.blackboard;
    const battleResult = blackboard?.get?.('warState')?.battles?.[S05_BATTLE_ID];
    if (!battleResult) {
      this._showScreenTip('先完成宛城外围战役并冻结战果。', { title: '战役尚未完成' });
      return false;
    }
    const appliedResultIds = blackboard?.get?.('appliedBattleResultIds') || [];
    if (!battleResult.resultId || !appliedResultIds.includes(battleResult.resultId)) {
      this._showScreenTip('宛城外围战果尚未成功写入检查点，请在军令旗处重试结算。', { title: '战果尚未应用' });
      return false;
    }
    const rescueResult = blackboard?.get?.('storyState')?.rescueResults?.[S05_ZHANG_MANCHENG_RESCUE_ID];
    if (rescueResult?.survived !== true) {
      this._showScreenTip('只有张曼成救援成功并保存后，才能延长战线进入 S06。', { title: '宛城围攻未开放' });
      return false;
    }
    const targetChunk = this._worldLoadSession?.getChunk?.('S06');
    const targetSpawn = this._worldLoadSession?.findSpawn?.('S06', 'player');
    if (!targetChunk || !targetSpawn) {
      this._showScreenTip('S06 区块或玩家出生点缺失。', { title: '宛城围攻路线不可用' });
      return false;
    }
    try {
      const transition = await this.teleportToChunk({ scene: 'S06', spawnRef: 'player', transition: 'fadeBlack' });
      if (transition === false || transition?.cancelled) throw new Error('sceneTransitionCancelled');
      this.battleModeView?.close?.();
      this.battleResultView?.close?.();
      this.battleHudView?.clear?.();
      this.rescueObjectiveView?.clear?.();
      this._showScreenTip('张曼成率余部延长战线，你已抵达宛城城下。', { title: 'S06·宛城围攻' });
      return true;
    } catch (error) {
      this._showScreenTip(`前往宛城围攻失败：${error?.message || error}`, { title: '场景切换失败' });
      return false;
    }
  }

  async startS06FieldConstruction() {
    if (this.currentSceneId !== 'S06' || !this.constructionSystem || this._constructionCheckpointBusy) return false;
    const blackboard = this.gameLoader?.blackboard;
    const story = cloneData(blackboard?.get?.('storyState') || {});
    if (!blackboard || story.s06Decision?.committed === true) {
      this._showScreenTip('守撤决策已经锁定，不能再开始临时工事。', { title: '施工已关闭' });
      return false;
    }
    if (story.s06Construction?.toolBreakExperienced === true) {
      this._showScreenTip('旧铲损毁和材料退回已经结算，请到军令旗决定守撤。', { title: '临时工事已作废' });
      return true;
    }
    const pending = this.constructionSystem.getPending(S06_FIELD_CONSTRUCTION_SITE_ID);
    if (pending?.status === 'refundPending') {
      const refundRollback = this._captureConstructionRollback();
      const retried = this.constructionSystem.retryRefund(S06_FIELD_CONSTRUCTION_SITE_ID);
      if (retried.status !== 'cancelled') {
        this._showScreenTip('清理背包空间后才能退回工事材料。', { title: '退款等待中' });
        return false;
      }
      this._constructionCheckpointBusy = true;
      try {
        return await this._checkpointS06ConstructionTerminal([retried], refundRollback);
      } finally {
        this._constructionCheckpointBusy = false;
      }
    } else if (pending) {
      this._showScreenTip(`拒马施工进度 ${Math.floor(pending.progress * 100)}%。旧铲只剩最后一点耐久。`, {
        title: '临时工事施工中'
      });
      return true;
    }
    const inventory = this.playerEntity?.getComponent?.('inventory');
    if (!inventory || !this.playerEntity?.id) return false;
    const attempt = Math.max(0, Math.floor(Number(story.s06Construction?.attempt) || 0)) + 1;
    const operationId = `construction:S06:fieldBarricade:${attempt}`;
    const rollback = this._captureConstructionRollback();
    const cityDamageRatio = Number((blackboard.get('cityStates') || [])
      .find(city => city?.id === 'city.s05_wancheng')?.damageRatio) || 0;
    const started = this.constructionSystem.start({
      characterId: this.playerEntity.id,
      inventory,
      definitionId: 'construction.barricade',
      siteId: S06_FIELD_CONSTRUCTION_SITE_ID,
      operationId,
      cityDamageRatio,
      context: { sceneId: 'S06' }
    });
    if (!started.ok) {
      const message = started.code === 'materialsRequired'
        ? `缺少 ${started.itemId} × ${started.quantity}，材料未扣除。先拾取缺口旁的木铁。`
        : started.code === 'toolRequired'
          ? '缺少可用铲子，材料未扣除。先拾取缺口旁开裂的旧铲。'
          : `临时工事未开始：${started.code || 'unknown'}。材料未扣除。`;
      this._showScreenTip(message, { title: '施工前置不足' });
      return false;
    }
    blackboard.set('storyState', {
      ...story,
      s06Construction: {
        ...(story.s06Construction || {}),
        pending: true,
        attempt,
        siteId: S06_FIELD_CONSTRUCTION_SITE_ID,
        operationId
      },
      lastCheckpointId: 'checkpoint.S06.fieldConstructionStart'
    });
    this._constructionCheckpointBusy = true;
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S06.fieldConstructionStart', sceneId: 'S06'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      this._showScreenTip(`拒马开始施工，预计 ${Math.ceil(started.duration)} 秒；这把旧铲只剩 1 点耐久。`, {
        title: '宛城缺口抢修'
      });
      return true;
    } catch (error) {
      this._restoreConstructionRollback(rollback, [`${operationId}:materials`]);
      this._showScreenTip(`临时工事保存失败：${error?.message || error}，材料和施工状态已回滚。`, { title: '保存失败' });
      return false;
    } finally {
      this._constructionCheckpointBusy = false;
    }
  }

  openS06DefenseChoice() {
    if (this.currentSceneId !== 'S06' || !this.irreversibleChoiceView) return false;
    const blackboard = this.gameLoader?.blackboard;
    const story = blackboard?.get?.('storyState') || {};
    if (story.zhangManchengSurvived !== true
      || story.rescueResults?.[S05_ZHANG_MANCHENG_RESCUE_ID]?.survived !== true) {
      this._showScreenTip('张曼成未能从 S05 存活，宛城延长战线无效。', { title: 'S06 不可用' });
      return false;
    }
    if (story.s06Construction?.toolBreakExperienced !== true) {
      this._showScreenTip('先到城墙缺口尝试修筑拒马，经历旧铲损毁与材料退回后再决定守撤。', {
        title: '先处理临时工事'
      });
      return false;
    }
    if (story.s06Decision?.committed === true) {
      const label = story.s06Decision.choiceId === 'hold' ? '继续坚守' : '主动撤离';
      this._showScreenTip(`宛城决策已锁定为“${label}”，不能重复扣除资源或改变城损。`, { title: '决策已完成' });
      return true;
    }
    const city = (blackboard?.get?.('cityStates') || []).find(entry => entry?.id === 'city.s05_wancheng');
    if (!city) {
      this._showScreenTip('宛城 CityState 缺失，不能评估防线。', { title: '城市状态错误' });
      return false;
    }
    this.irreversibleChoiceView.open({
      title: '宛城围攻·延长战线',
      description: `当前城损 ${Math.round(Number(city.damageRatio) * 100)}%，木材 ${city.resources?.wood || 0}，铁料 ${city.resources?.iron || 0}。`,
      allowCancel: true,
      selectedId: 'hold',
      choices: [
        {
          id: 'hold', label: '继续坚守',
          consequences: ['消耗城市木材 12', '消耗城市铁料 8', '城损 -5%', '士气 +8']
        },
        {
          id: 'withdraw', label: '主动撤离',
          consequences: ['不消耗修补资源', '城损 +12%', '士气 -10', '保存南阳战果后撤出']
        }
      ]
    });
    return true;
  }

  async _handleS06DefenseChoiceCommand(command = {}) {
    if (command.type === 'cancel') {
      if (!this._s06DecisionBusy) this.irreversibleChoiceView?.close?.();
      return true;
    }
    if (command.type !== 'selectChoice') return false;
    return this._commitS06DefenseChoice(command.choiceId);
  }

  async _commitS06DefenseChoice(choiceId) {
    if (this.currentSceneId !== 'S06' || this._s06DecisionBusy
      || !['hold', 'withdraw'].includes(choiceId)) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    const beforeCities = cloneData(blackboard?.get?.('cityStates') || []);
    if (beforeStory.s06Decision?.committed === true) return this.openS06DefenseChoice();
    const cityIndex = beforeCities.findIndex(entry => entry?.id === 'city.s05_wancheng');
    if (!blackboard || cityIndex < 0) return false;
    const city = cloneData(beforeCities[cityIndex]);
    const resources = { ...(city.resources || {}) };
    if (choiceId === 'hold' && (Number(resources.wood) < 12 || Number(resources.iron) < 8)) {
      this._showScreenTip('继续坚守至少需要城市木材 12、铁料 8；资源不足时只能撤离。', { title: '修补资源不足' });
      return false;
    }
    if (choiceId === 'hold') {
      resources.wood -= 12;
      resources.iron -= 8;
      city.damageRatio = Math.max(0, Number(city.damageRatio) - 0.05);
      city.morale = Math.min(100, Math.max(0, Number(city.morale) + 8));
    } else {
      city.damageRatio = Math.min(1, Number(city.damageRatio) + 0.12);
      city.morale = Math.min(100, Math.max(0, Number(city.morale) - 10));
    }
    city.resources = resources;
    const cityCheck = this.gameLoader?.contentValidator?.validate?.(city, 'city', `variables.cityStates[${cityIndex}]`);
    if (cityCheck && !cityCheck.ok) {
      this._showScreenTip('宛城决策会产生非法 CityState，提交已拒绝。', { title: '状态校验失败' });
      return false;
    }
    const draftCities = cloneData(beforeCities);
    draftCities[cityIndex] = city;
    const nanyangIntervened = beforeStory.nanyangIntervened === true
      || (this.battleSystem?.definition?.battleId === S05_BATTLE_ID
        && this.battleSystem?.mode === BattleMode.INTERVENE);
    const draftStory = {
      ...beforeStory,
      visitedScenes: [...new Set([...(beforeStory.visitedScenes || []), 'S06'])],
      nanyangIntervened,
      s06Resolved: true,
      s06Decision: {
        committed: true,
        choiceId,
        cityId: city.id,
        resourceCost: choiceId === 'hold' ? { wood: 12, iron: 8 } : { wood: 0, iron: 0 },
        damageRatioAfter: city.damageRatio,
        moraleAfter: city.morale,
        operationId: `story:S06:defense:${choiceId}`
      },
      lastCheckpointId: 'checkpoint.S06.defenseDecision'
    };

    this._s06DecisionBusy = true;
    this.irreversibleChoiceView?.setBusy?.(true);
    blackboard.set('cityStates', draftCities);
    blackboard.set('storyState', draftStory);
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S06.defenseDecision', sceneId: 'S06'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      this.irreversibleChoiceView?.close?.();
      this._showScreenTip(
        choiceId === 'hold'
          ? '木铁被投入缺口，张曼成争来的一个月得以延续；南阳介入标志与城市状态已经保存。'
          : '你下令保存余部主动撤离，宛城损毁继续扩大；南阳战果已经保存。',
        { title: choiceId === 'hold' ? '宛城继续坚守' : '宛城主动撤离' }
      );
      return true;
    } catch (error) {
      blackboard.set('cityStates', beforeCities);
      blackboard.set('storyState', beforeStory);
      this._showScreenTip(`宛城决策保存失败：${error?.message || error}，城市与剧情状态已回滚。`, { title: '提交失败' });
      return false;
    } finally {
      this._s06DecisionBusy = false;
      this.irreversibleChoiceView?.setBusy?.(false);
    }
  }

  async completeS06Recall() {
    if (this.currentSceneId !== 'S06' || this._s06RecallBusy) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    if (!blackboard || beforeStory.s06Decision?.committed !== true) {
      this._showScreenTip('先在宛城军令旗完成继续坚守或主动撤离决策。', { title: '尚不能响应召回' });
      return false;
    }
    if (beforeStory.yuzhouRoute?.routeId !== 'nanyang') return false;

    if (beforeStory.messengerRecallReceived !== true) {
      const draftStory = {
        ...beforeStory,
        messengerRecallReceived: true,
        s06Resolved: true,
        month: Math.max(8, Math.floor(Number(beforeStory.month) || 0)),
        pendingSceneId: 'S10',
        s06RecallOperationId: 'story:S06:messengerRecall',
        lastCheckpointId: 'checkpoint.S06.messengerRecall'
      };
      this._s06RecallBusy = true;
      blackboard.set('storyState', draftStory);
      try {
        const saved = await this.requestAutoSave({
          reason: 'checkpoint', checkpointId: 'checkpoint.S06.messengerRecall', sceneId: 'S06'
        });
        if (!saved?.ok) throw new Error(saved?.message || saved?.errors?.[0]?.message || 'checkpointFailed');
      } catch (error) {
        blackboard.set('storyState', beforeStory);
        this._showScreenTip(`南阳召回保存失败：${error?.message || error}，状态已回滚。`, { title: '提交失败' });
        this._s06RecallBusy = false;
        return false;
      }
      this._s06RecallBusy = false;
    }

    const regionIndex = this._findRegionIndexForScene('S10');
    if (regionIndex < 0) {
      this._showScreenTip('南阳战果与召回检查点已保存，但 S10 尚未登记。', { title: '冀州急召' });
      return true;
    }
    this._s06RecallBusy = true;
    try {
      const traveled = await this.travelToRegion({ regionIndex, sceneId: 'S10', spawnRef: 'player' });
      return traveled?.ok === true;
    } finally {
      this._s06RecallBusy = false;
    }
  }

  _getS07DelayPointDefinition(pointId) {
    return (this._s07BattleConfig?.delayPoints || []).find(point => point?.id === pointId) || null;
  }

  _syncS07DelayWorldState() {
    const committed = this.gameLoader?.blackboard?.get?.('storyState')?.s07DelayPoints || {};
    for (const point of this._s07BattleConfig?.delayPoints || []) {
      if (!point?.id || !point.collider) continue;
      this._terrainBinding?.setDynamicCollider?.({
        sceneId: 'S07',
        id: `S07-delay-${point.id}`,
        enabled: committed[point.id]?.committed === true,
        shape: cloneData(point.collider)
      });
    }
    return committed;
  }

  async commitS07DelayPoint({ pointId } = {}) {
    const point = this._getS07DelayPointDefinition(pointId);
    if (this.currentSceneId !== 'S07' || !point || this._s07PointBusy) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    const beforeCities = cloneData(blackboard?.get?.('cityStates') || []);
    if (!blackboard || beforeStory.yuzhouRoute?.routeId !== 'xihua') {
      this._showScreenTip('只有已锁定西华路线的队伍才能提交阻滞点。', { title: '路线状态不符' });
      return false;
    }
    if (beforeStory.s07DelayPoints?.[pointId]?.committed === true) {
      this._showScreenTip(`${point.label}已经完成，资源不会重复扣除。`, { title: '阻滞点已提交' });
      return true;
    }
    if (this.battleSystem?.definition?.battleId !== S07_BATTLE_ID
      || this.battleSystem?.mode !== BattleMode.INTERVENE
      || ![BattleState.ACTIVE, BattleState.RESOLVED].includes(this.battleSystem?.state)) {
      this._showScreenTip('先在军令旗选择介入并启动西华战役；观战不能亲自布置阻滞。', { title: '无法提交阻滞点' });
      return false;
    }
    if (this.battleSystem.state === BattleState.RESOLVED) {
      const frozen = this.battleSystem.getState().result;
      const applied = frozen?.resultId
        && (blackboard.get('appliedBattleResultIds') || []).includes(frozen.resultId);
      if (!applied) {
        this._showScreenTip('西华战果仍未写入检查点，请先在军令旗重试结算。', { title: '战果未保存' });
        return false;
      }
    }

    const cityIndex = beforeCities.findIndex(city => city?.id === 'city.s07_xihua');
    if (cityIndex < 0) {
      this._showScreenTip('西华 CityState 缺失，不能结算阻滞资源。', { title: '城市状态错误' });
      return false;
    }
    const city = cloneData(beforeCities[cityIndex]);
    const resources = { ...(city.resources || {}) };
    const cost = cloneData(point.cost || {});
    const missing = Object.entries(cost).find(([resource, amount]) => (
      !Number.isInteger(amount) || amount < 0 || Number(resources[resource] || 0) < amount
    ));
    if (missing) {
      this._showScreenTip(`${point.label}需要 ${missing[0]} ${missing[1]}，西华战略资源不足。`, { title: '阻滞资源不足' });
      return false;
    }
    for (const [resource, amount] of Object.entries(cost)) resources[resource] -= amount;
    city.resources = resources;
    const cityCheck = this.gameLoader?.contentValidator?.validate?.(
      city, 'city', `variables.cityStates[${cityIndex}]`
    );
    if (cityCheck && !cityCheck.ok) {
      this._showScreenTip(`${point.label}会产生非法 CityState，提交已拒绝。`, { title: '状态校验失败' });
      return false;
    }

    const draftCities = cloneData(beforeCities);
    draftCities[cityIndex] = city;
    const operationId = `story:S07:delay:${pointId}`;
    const draftStory = {
      ...beforeStory,
      visitedScenes: [...new Set([...(beforeStory.visitedScenes || []), 'S07'])],
      s07DelayPoints: {
        ...(beforeStory.s07DelayPoints || {}),
        [pointId]: { committed: true, pointId, cost, operationId }
      },
      lastCheckpointId: `checkpoint.S07.delay.${pointId}`
    };

    this._s07PointBusy = true;
    blackboard.set('cityStates', draftCities);
    blackboard.set('storyState', draftStory);
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: draftStory.lastCheckpointId, sceneId: 'S07'
      });
      if (!saved?.ok) throw new Error(saved?.message || saved?.errors?.[0]?.message || 'checkpointFailed');
      this._syncS07DelayWorldState();
      const committedCount = Object.values(draftStory.s07DelayPoints)
        .filter(entry => entry?.committed === true).length;
      this._showScreenTip(
        `${point.label}已锁定，消耗 ${Object.entries(cost).map(([key, value]) => `${key} ${value}`).join('、')}。当前 ${committedCount}/3。`,
        { title: '阻滞点完成' }
      );
      return true;
    } catch (error) {
      blackboard.set('cityStates', beforeCities);
      blackboard.set('storyState', beforeStory);
      this._showScreenTip(`阻滞点保存失败：${error?.message || error}，资源与剧情状态已回滚。`, { title: '提交失败' });
      return false;
    } finally {
      this._s07PointBusy = false;
    }
  }

  _getAppliedS07BattleResult() {
    const blackboard = this.gameLoader?.blackboard;
    const result = blackboard?.get?.('warState')?.battles?.[S07_BATTLE_ID] || null;
    return result?.resultId && (blackboard?.get?.('appliedBattleResultIds') || []).includes(result.resultId)
      ? result
      : null;
  }

  _buildS07RouteResult({ story, city, battleResult, battleMode }) {
    const delayPointCount = (this._s07BattleConfig?.delayPoints || [])
      .filter(point => story.s07DelayPoints?.[point.id]?.committed === true).length;
    const yellowTurbanWon = battleResult.winnerFactionId === 'yellow_turban';
    const survivorCount = Math.min(60, Math.max(0,
      (battleMode === BattleMode.INTERVENE ? 28 : 18)
      + delayPointCount * 6
      + (yellowTurbanWon ? 8 : 0)
    ));
    const resources = city?.resources || {};
    const carriedResources = {
      food: Math.min(18, Math.floor(Math.max(0, Number(resources.food) || 0) * 0.4)),
      wood: Math.min(12, Math.floor(Math.max(0, Number(resources.wood) || 0) * 0.5)),
      iron: Math.min(8, Math.floor(Math.max(0, Number(resources.iron) || 0) * 0.5)),
      herb: Math.min(6, Math.floor(Math.max(0, Number(resources.herb) || 0) * 0.5))
    };
    const pursuitIntensity = Math.min(5, Math.max(1,
      4 - delayPointCount + (yellowTurbanWon ? 0 : 1) + (battleMode === BattleMode.OBSERVE ? 1 : 0)
    ));
    return {
      schemaVersion: 1,
      battleResultId: battleResult.resultId,
      battleMode,
      winnerFactionId: battleResult.winnerFactionId,
      delayPointCount,
      survivorCount,
      carriedResources,
      pursuitIntensity,
      frozenAtCheckpointId: 'checkpoint.S07.routeResult'
    };
  }

  async checkS07Exit({ sceneId = 'S08', spawnRef = 'player', transition = 'fadeBlack' } = {}) {
    if (this.currentSceneId !== 'S07' || this._s07ExitBusy) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    if (!blackboard || beforeStory.yuzhouRoute?.routeId !== 'xihua') return false;
    const battleResult = this._getAppliedS07BattleResult();
    if (!battleResult) {
      this._showScreenTip('先完成西华战役并让战果成功写入检查点。', { title: '尚不能撤离' });
      return false;
    }
    const battleMode = beforeStory.battleModes?.[S07_BATTLE_ID]
      || (this.battleSystem?.definition?.battleId === S07_BATTLE_ID ? this.battleSystem.mode : null);
    const pointDefinitions = this._s07BattleConfig?.delayPoints || [];
    const committedCount = pointDefinitions
      .filter(point => beforeStory.s07DelayPoints?.[point.id]?.committed === true).length;
    if (battleMode === BattleMode.INTERVENE && committedCount !== pointDefinitions.length) {
      this._showScreenTip(`介入路线还需完成 ${pointDefinitions.length - committedCount} 处阻滞点。`, { title: '三线尚未完成' });
      return false;
    }
    if (![BattleMode.OBSERVE, BattleMode.INTERVENE].includes(battleMode)) {
      this._showScreenTip('西华参战方式缺失，不能冻结残部结果。', { title: '战役状态错误' });
      return false;
    }
    if (!this._worldLoadSession?.getChunk?.(sceneId)
      || !this._worldLoadSession?.findSpawn?.(sceneId, spawnRef)) {
      this._showScreenTip(`${sceneId} 区块或玩家出生点缺失。`, { title: '西华余部路线不可用' });
      return false;
    }

    if (beforeStory.s07RouteResult?.battleResultId === battleResult.resultId) {
      const traveled = await this.teleportToChunk({ scene: sceneId, spawnRef, transition });
      return traveled !== false && !traveled?.cancelled;
    }
    const city = (blackboard.get('cityStates') || []).find(entry => entry?.id === 'city.s07_xihua');
    if (!city) return false;
    const routeResult = this._buildS07RouteResult({ story: beforeStory, city, battleResult, battleMode });
    const draftStory = {
      ...beforeStory,
      visitedScenes: [...new Set([...(beforeStory.visitedScenes || []), 'S07'])],
      unlockedScenes: [...new Set([...(beforeStory.unlockedScenes || []), sceneId])],
      s07RouteResult: routeResult,
      s07Resolved: true,
      lastCheckpointId: 'checkpoint.S07.routeResult'
    };

    this._s07ExitBusy = true;
    blackboard.set('storyState', draftStory);
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S07.routeResult', sceneId: 'S07'
      });
      if (!saved?.ok) throw new Error(saved?.message || saved?.errors?.[0]?.message || 'checkpointFailed');
    } catch (error) {
      blackboard.set('storyState', beforeStory);
      this._showScreenTip(`残部结果保存失败：${error?.message || error}，可在出口重试。`, { title: '撤离失败' });
      this._s07ExitBusy = false;
      return false;
    }
    try {
      const traveled = await this.teleportToChunk({ scene: sceneId, spawnRef, transition });
      if (traveled === false || traveled?.cancelled) throw new Error('sceneTransitionCancelled');
      this.battleModeView?.close?.();
      this.battleResultView?.close?.();
      this.battleHudView?.clear?.();
      this._showScreenTip(
        `西华残部 ${routeResult.survivorCount} 人、追兵强度 ${routeResult.pursuitIntensity} 已冻结。`,
        { title: 'S08·西华余部' }
      );
      return true;
    } catch (error) {
      this._showScreenTip(`残部结果已保存，但前往 S08 失败：${error?.message || error}。可在出口重试。`, { title: '场景切换失败' });
      return false;
    } finally {
      this._s07ExitBusy = false;
    }
  }

  openS08RetreatChoice() {
    if (this.currentSceneId !== 'S08' || !this.irreversibleChoiceView) return false;
    const story = this.gameLoader?.blackboard?.get?.('storyState') || {};
    const routeResult = story.s07RouteResult;
    if (!routeResult) {
      this._showScreenTip('缺少 S07 残部结果，不能决定马车撤退方式。', { title: '前置状态缺失' });
      return false;
    }
    if (story.s08RetreatDecision?.committed === true) {
      const label = story.s08RetreatDecision.choiceId === 'discard' ? '丢弃物资' : '保留物资';
      this._showScreenTip(`西华撤退决策已锁定为“${label}”，不能重复改变残部。`, { title: '决策已完成' });
      return true;
    }
    const resourceText = Object.entries(routeResult.carriedResources || {})
      .map(([key, value]) => `${key} ${value}`).join('、');
    this.irreversibleChoiceView.open({
      title: '西华余部·泥泞马车',
      description: `现有残部 ${routeResult.survivorCount} 人，追兵强度 ${routeResult.pursuitIntensity}；马车装有 ${resourceText || '无物资'}。`,
      allowCancel: true,
      selectedId: 'discard',
      choices: [
        { id: 'discard', label: '丢弃物资', consequences: ['放弃全部木铁与一半粮药', '残部 +8', '追兵强度 -2'] },
        { id: 'preserve', label: '保留物资', consequences: ['保留全部战略物资', '残部 -4', '追兵强度 +1'] }
      ]
    });
    return true;
  }

  async _handleS08RetreatChoiceCommand(command = {}) {
    if (command.type === 'cancel') {
      if (!this._s08DecisionBusy) this.irreversibleChoiceView?.close?.();
      return true;
    }
    if (command.type !== 'selectChoice') return false;
    return this._commitS08RetreatChoice(command.choiceId);
  }

  async _commitS08RetreatChoice(choiceId) {
    if (this.currentSceneId !== 'S08' || this._s08DecisionBusy
      || !['discard', 'preserve'].includes(choiceId)) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    if (!blackboard || !beforeStory.s07RouteResult) return false;
    if (beforeStory.s08RetreatDecision?.committed === true) return this.openS08RetreatChoice();

    const routeResult = beforeStory.s07RouteResult;
    const originalResources = cloneData(routeResult.carriedResources || {});
    const finalResources = choiceId === 'discard'
      ? {
          food: Math.floor(Number(originalResources.food) / 2),
          wood: 0,
          iron: 0,
          herb: Math.floor(Number(originalResources.herb) / 2)
        }
      : originalResources;
    const finalResult = {
      ...cloneData(routeResult),
      survivorCount: Math.max(0, Number(routeResult.survivorCount) + (choiceId === 'discard' ? 8 : -4)),
      carriedResources: finalResources,
      pursuitIntensity: Math.min(5, Math.max(0,
        Number(routeResult.pursuitIntensity) + (choiceId === 'discard' ? -2 : 1)
      )),
      retreatChoiceId: choiceId,
      frozenAtCheckpointId: 'checkpoint.S08.retreatDecision'
    };
    const operationId = `story:S08:retreat:${choiceId}`;
    const draftStory = {
      ...beforeStory,
      visitedScenes: [...new Set([...(beforeStory.visitedScenes || []), 'S08'])],
      s08RetreatDecision: { committed: true, choiceId, operationId },
      s08RouteResult: finalResult,
      s08Resolved: true,
      lastCheckpointId: 'checkpoint.S08.retreatDecision'
    };

    this._s08DecisionBusy = true;
    this.irreversibleChoiceView?.setBusy?.(true);
    blackboard.set('storyState', draftStory);
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S08.retreatDecision', sceneId: 'S08'
      });
      if (!saved?.ok) throw new Error(saved?.message || saved?.errors?.[0]?.message || 'checkpointFailed');
      this.irreversibleChoiceView?.close?.();
      this._showScreenTip(
        choiceId === 'discard'
          ? '绳索被割断，木铁陷在泥里；更多人甩开了追兵。'
          : '众人推着马车继续前进，物资保住了，但队伍付出了伤亡。',
        { title: choiceId === 'discard' ? '丢车保人' : '保留物资' }
      );
      return true;
    } catch (error) {
      blackboard.set('storyState', beforeStory);
      this._showScreenTip(`撤退决策保存失败：${error?.message || error}，残部状态已回滚。`, { title: '提交失败' });
      return false;
    } finally {
      this._s08DecisionBusy = false;
      this.irreversibleChoiceView?.setBusy?.(false);
    }
  }

  async completeS08Recall() {
    if (this.currentSceneId !== 'S08' || this._s08RecallBusy) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    if (!blackboard || beforeStory.s08RetreatDecision?.committed !== true || !beforeStory.s08RouteResult) {
      this._showScreenTip('先在泥泞马车旁完成残部撤退决策。', { title: '尚不能响应召回' });
      return false;
    }

    if (beforeStory.messengerRecallReceived !== true) {
      const draftStory = {
        ...beforeStory,
        visitedScenes: [...new Set([...(beforeStory.visitedScenes || []), 'S08'])],
        messengerRecallReceived: true,
        s08Resolved: true,
        month: Math.max(8, Math.floor(Number(beforeStory.month) || 0)),
        pendingSceneId: 'S10',
        s08RecallOperationId: 'story:S08:messengerRecall',
        lastCheckpointId: 'checkpoint.S08.messengerRecall'
      };
      this._s08RecallBusy = true;
      blackboard.set('storyState', draftStory);
      try {
        const saved = await this.requestAutoSave({
          reason: 'checkpoint', checkpointId: 'checkpoint.S08.messengerRecall', sceneId: 'S08'
        });
        if (!saved?.ok) throw new Error(saved?.message || saved?.errors?.[0]?.message || 'checkpointFailed');
      } catch (error) {
        blackboard.set('storyState', beforeStory);
        this._showScreenTip(`信使召回保存失败：${error?.message || error}，召回状态已回滚。`, { title: '提交失败' });
        this._s08RecallBusy = false;
        return false;
      }
      this._s08RecallBusy = false;
    }

    const regionIndex = this._findRegionIndexForScene('S10');
    if (regionIndex < 0) {
      this._showScreenTip('大贤良师病重，召回检查点已保存；S10 广城外围尚未登记，完成内容后可从此处继续。', {
        title: '冀州急召'
      });
      return true;
    }
    this._s08RecallBusy = true;
    try {
      const traveled = await this.travelToRegion({ regionIndex, sceneId: 'S10', spawnRef: 'player' });
      return traveled?.ok === true;
    } finally {
      this._s08RecallBusy = false;
    }
  }

  async _commitS10StoryCheckpoint({ checkpointId, prepare, successTitle, successMessage }) {
    if (this.currentSceneId !== 'S10' || this._s10StoryBusy || typeof prepare !== 'function') return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = cloneData(blackboard?.get?.('storyState') || {});
    if (!blackboard) return false;
    const prepared = prepare(beforeStory);
    if (prepared?.idempotent) {
      this._showScreenTip(prepared.message || successMessage, { title: successTitle });
      return true;
    }
    if (!prepared?.ok || !prepared.storyState) {
      this._showScreenTip(prepared?.message || '当前剧情条件不足。', { title: prepared?.title || '尚不能继续' });
      return false;
    }

    this._s10StoryBusy = true;
    blackboard.set('storyState', prepared.storyState);
    try {
      const saved = await this.requestAutoSave({ reason: 'checkpoint', checkpointId, sceneId: 'S10' });
      if (!saved?.ok) throw new Error(saved?.message || saved?.errors?.[0]?.message || 'checkpointFailed');
      this._showScreenTip(successMessage, { title: successTitle });
      return true;
    } catch (error) {
      blackboard.set('storyState', beforeStory);
      this._showScreenTip(`剧情检查点保存失败：${error?.message || error}，状态已回滚。`, { title: '提交失败' });
      return false;
    } finally {
      this._s10StoryBusy = false;
    }
  }

  async commitS10ZhangJiaoDeath() {
    return this._commitS10StoryCheckpoint({
      checkpointId: 'checkpoint.S10.zhangJiaoDeath',
      successTitle: '八月·张角病逝',
      successMessage: '帐中没有军令，只有药味。张角已经病逝；这是不可救援、不可逆转的历史事件。',
      prepare: before => {
        const existing = before.historicalEvents?.['history.zhangjiao.death'];
        if (existing?.committed === true) {
          return { idempotent: true, message: '张角病逝已经写入历史，不存在救援倒计时，也不能重复改写。' };
        }
        if (before.messengerRecallReceived !== true) {
          return { ok: false, message: '尚未收到冀州急召，不能提前进入张角病逝事件。' };
        }
        const event = {
          id: 'history.zhangjiao.death',
          committed: true,
          sceneId: 'S10',
          month: 8,
          rescuable: false,
          operationId: 'story:S10:zhangJiaoDeath'
        };
        return {
          ok: true,
          storyState: {
            ...before,
            month: Math.max(8, Math.floor(Number(before.month) || 0)),
            visitedScenes: [...new Set([...(before.visitedScenes || []), 'S10'])],
            historicalEvents: { ...(before.historicalEvents || {}), [event.id]: event },
            zhangJiaoDied: true,
            zhangJiaoRescueAvailable: false,
            pendingSceneId: null,
            lastCheckpointId: 'checkpoint.S10.zhangJiaoDeath'
          }
        };
      }
    });
  }

  async acknowledgeS10TemporaryCamp() {
    return this._commitS10StoryCheckpoint({
      checkpointId: 'checkpoint.S10.temporaryCamp',
      successTitle: '临时营地评估',
      successMessage: '这里能挡住小股官兵，但离水源远、只能住几天，也不适合筑城。必须拔营沿溪寻找新址。',
      prepare: before => {
        if (before.s10TemporaryCamp?.evaluated === true) {
          return { idempotent: true, message: '临时营地已经评估：可短住、可挡小股官兵，但缺水且不可筑城。' };
        }
        if (before.historicalEvents?.['history.zhangjiao.death']?.committed !== true) {
          return { ok: false, message: '先进入病帐，完成张角病逝事件。' };
        }
        return {
          ok: true,
          storyState: {
            ...before,
            s10TemporaryCamp: {
              evaluated: true,
              active: true,
              canResistSmallRaid: true,
              nearWater: false,
              suitableForConstruction: false,
              maxStayDays: 3,
              continuedFromSpecialFaint: !!before.lastSpecialFaintRescueType,
              rescueType: before.lastSpecialFaintRescueType || null,
              operationId: 'story:S10:temporaryCamp'
            },
            lastCheckpointId: 'checkpoint.S10.temporaryCamp'
          }
        };
      }
    });
  }

  async completeS10CampRelocation() {
    return this._commitS10StoryCheckpoint({
      checkpointId: 'checkpoint.S10.campRelocation',
      successTitle: '沿溪新址',
      successMessage: '临时营地已经拔除。队伍沿溪找到可长期取水的新址，营建阶段现已开放。',
      prepare: before => {
        if (before.s10CampRelocation?.completed === true) {
          return { idempotent: true, message: '队伍已经沿溪迁至新址，重复交互不会再次推进月份或改变状态。' };
        }
        if (before.s10TemporaryCamp?.evaluated !== true) {
          return { ok: false, message: '先检查临时营地，确认缺水与不可筑城的限制。' };
        }
        return {
          ok: true,
          storyState: {
            ...before,
            s10TemporaryCamp: { ...before.s10TemporaryCamp, active: false },
            s10CampRelocation: {
              completed: true,
              fromSiteId: 'site.s10.temporaryCamp',
              toSiteId: 'site.s10.creekConstruction',
              waterAccess: true,
              suitableForConstruction: true,
              operationId: 'story:S10:campRelocation'
            },
            constructionSiteUnlocked: true,
            constructionSiteId: 'site.s10.creekConstruction',
            lastCheckpointId: 'checkpoint.S10.campRelocation'
          }
        };
      }
    });
  }

  _captureConstructionRollback() {
    const inventory = this.playerEntity?.getComponent?.('inventory');
    return {
      inventory,
      inventoryState: cloneData(inventory?.exportItems?.() || []),
      constructionRuntime: this.constructionSystem?.captureRuntime?.() || null,
      proficiencyState: cloneData(this.proficiencySystem?.serialize?.() || null),
      storyState: cloneData(this.gameLoader?.blackboard?.get?.('storyState') || {})
    };
  }

  _restoreConstructionRollback(snapshot, operationIds = []) {
    if (!snapshot) return false;
    snapshot.inventory?.loadItems?.(snapshot.inventoryState || []);
    this.constructionSystem?.restoreRuntime?.(snapshot.constructionRuntime);
    if (snapshot.proficiencyState) this.proficiencySystem?.deserialize?.(snapshot.proficiencyState);
    this.gameLoader?.blackboard?.set?.('storyState', snapshot.storyState || {});
    for (const operationId of operationIds.filter(Boolean)) {
      this.inventoryTransactions?.forgetOperation?.(operationId);
    }
    return true;
  }

  _updateConstructionRuntime(deltaTime) {
    if (!this.constructionSystem || this._constructionCheckpointBusy) return;
    const pending = this.constructionSystem.serialize().pending;
    const willReachTerminal = pending.some(entry => (
      entry.status === 'active' && entry.elapsed + Math.max(0, Number(deltaTime) || 0) >= entry.duration
    ));
    const rollback = willReachTerminal ? this._captureConstructionRollback() : null;
    const terminal = this.constructionSystem.update(deltaTime);
    if (terminal.length === 0) return;
    if (terminal.some(result => result?.status === 'refundPending')) {
      this._showScreenTip('施工已取消，但背包暂时无法容纳退回材料。清理空间后再次与施工点交互。', {
        title: '材料等待退回'
      });
      return;
    }
    this._constructionCheckpointBusy = true;
    void this._checkpointS10ConstructionTerminal(terminal, rollback).finally(() => {
      this._constructionCheckpointBusy = false;
    });
  }

  async startS10Construction(params = {}) {
    if (this.currentSceneId !== 'S10' || !this.constructionSystem || this._constructionCheckpointBusy) return false;
    const siteId = String(params.siteId || '');
    const definitionId = String(params.definitionId || '');
    const siteKey = S10_CONSTRUCTION_SITE_KEYS[siteId];
    const blackboard = this.gameLoader?.blackboard;
    const story = cloneData(blackboard?.get?.('storyState') || {});
    if (!blackboard || !siteKey || !definitionId) {
      this._showScreenTip('施工点或工事定义无效。', { title: '营建配置错误' });
      return false;
    }
    if (story.constructionSiteUnlocked !== true || story.s10CampRelocation?.completed !== true) {
      this._showScreenTip('先评估临时营地并沿溪迁至新址，才能开始施工。', { title: '施工点未开放' });
      return false;
    }
    const completed = this.constructionSystem.getStructure(siteId);
    if (completed) {
      this._showScreenTip(`${this.constructionSystem.getDefinition(definitionId)?.name || '工事'}已经完成，耐久 ${completed.durability}/${completed.maxDurability}。`, {
        title: '工事状态'
      });
      return true;
    }
    const existing = this.constructionSystem.getPending(siteId);
    if (existing?.status === 'refundPending') return this.cancelS10Construction({ siteId });
    if (existing) {
      this._showScreenTip(`施工进度 ${Math.floor(existing.progress * 100)}%，材料已托管，不会重复扣除。`, {
        title: '正在施工'
      });
      return true;
    }

    const inventory = this.playerEntity?.getComponent?.('inventory');
    if (!inventory || !this.playerEntity?.id) return false;
    const rollback = this._captureConstructionRollback();
    const attempt = Math.max(0, Math.floor(Number(story.s10Construction?.attempts?.[siteKey]) || 0)) + 1;
    const operationId = `construction:S10:${siteKey}:${attempt}`;
    const cityStates = blackboard.get('cityStates') || [];
    const cityDamageRatio = Number(cityStates.find(city => city?.id === 'city.s09_guangzong_camp')?.damageRatio) || 0;
    const result = this.constructionSystem.start({
      characterId: this.playerEntity.id,
      inventory,
      definitionId,
      siteId,
      operationId,
      cityDamageRatio,
      context: { sceneId: 'S10' }
    });
    if (!result.ok) {
      const messages = {
        proficiencyRequired: `营建熟练度不足：需要 ${result.required} 级，当前 ${result.actual} 级。材料未扣除。`,
        materialsRequired: `材料不足：缺少 ${result.itemId} × ${result.quantity}。材料未扣除。`,
        toolRequired: '缺少可用铲子。材料未扣除。',
        toolInstanceRequired: '铲子缺少稳定实例 ID，无法安全预留。材料未扣除。',
        toolReserved: '这把铲子正在另一处施工中。材料未扣除。',
        constructionSiteLocked: '沿溪施工地尚未开放。材料未扣除。',
        invalidSite: '此处不允许修筑该工事。材料未扣除。'
      };
      this._showScreenTip(messages[result.code] || `施工未开始：${result.code || 'unknown'}。材料未扣除。`, {
        title: '前置不足'
      });
      return false;
    }

    const beforeConstruction = story.s10Construction || {};
    blackboard.set('storyState', {
      ...story,
      s10Construction: {
        ...beforeConstruction,
        attempts: { ...(beforeConstruction.attempts || {}), [siteKey]: attempt },
        pendingSites: {
          ...(beforeConstruction.pendingSites || {}),
          [siteKey]: { siteId, definitionId, operationId, status: 'active' }
        }
      },
      lastCheckpointId: `checkpoint.S10.constructionStart.${siteKey}`
    });
    this._constructionCheckpointBusy = true;
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: `checkpoint.S10.constructionStart.${siteKey}`, sceneId: 'S10'
      });
      if (!saved?.ok) throw new Error(saved?.message || saved?.errors?.[0]?.message || 'checkpointFailed');
      const definition = this.constructionSystem.getDefinition(definitionId);
      this._showScreenTip(`${definition?.name || '工事'}开始施工，预计 ${Math.ceil(result.duration)} 秒。`, {
        title: result.emergency ? '抢修开始（完成时仅 50% 耐久）' : '施工开始'
      });
      return true;
    } catch (error) {
      this._restoreConstructionRollback(rollback, [`${operationId}:materials`]);
      this._showScreenTip(`施工检查点失败：${error?.message || error}，材料与施工状态已回滚。`, { title: '保存失败' });
      return false;
    } finally {
      this._constructionCheckpointBusy = false;
    }
  }

  async cancelS10Construction({ siteId } = {}) {
    if (this.currentSceneId !== 'S10' || !this.constructionSystem || this._constructionCheckpointBusy) return false;
    const siteKey = S10_CONSTRUCTION_SITE_KEYS[siteId];
    const pending = this.constructionSystem.getPending(siteId);
    if (!siteKey || !pending) {
      this._showScreenTip('此施工点没有可取消的在建工事。', { title: '无在建工事' });
      return false;
    }
    const rollback = this._captureConstructionRollback();
    const result = this.constructionSystem.cancel(siteId, 'cancelledByPlayer');
    if (result.status === 'refundPending') {
      this._showScreenTip('背包空间不足，材料尚未退回；清理空间后再次交互重试。', { title: '退款等待中' });
      return false;
    }
    const blackboard = this.gameLoader.blackboard;
    const story = cloneData(blackboard.get('storyState') || {});
    const pendingSites = { ...(story.s10Construction?.pendingSites || {}) };
    delete pendingSites[siteKey];
    blackboard.set('storyState', {
      ...story,
      s10Construction: { ...(story.s10Construction || {}), pendingSites },
      lastCheckpointId: `checkpoint.S10.constructionCancelled.${siteKey}`
    });
    this._constructionCheckpointBusy = true;
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: `checkpoint.S10.constructionCancelled.${siteKey}`, sceneId: 'S10'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      this._showScreenTip('施工已取消，托管材料已全部退回。', { title: '施工取消' });
      return true;
    } catch (error) {
      this._restoreConstructionRollback(rollback, [`${pending.operationId}:refund`]);
      this._showScreenTip(`取消施工保存失败：${error?.message || error}，状态已回滚。`, { title: '保存失败' });
      return false;
    } finally {
      this._constructionCheckpointBusy = false;
    }
  }

  async _checkpointS10ConstructionTerminal(results, rollback) {
    if (results.some(result => (result?.structure?.siteId || result?.siteId) === S06_FIELD_CONSTRUCTION_SITE_ID)) {
      return this._checkpointS06ConstructionTerminal(results, rollback);
    }
    const blackboard = this.gameLoader?.blackboard;
    if (!blackboard || !rollback) return false;
    const beforeStory = cloneData(blackboard.get('storyState') || {});
    const construction = cloneData(beforeStory.s10Construction || {});
    construction.pendingSites = { ...(construction.pendingSites || {}) };
    construction.completedSites = { ...(construction.completedSites || {}) };
    construction.cancelledSites = { ...(construction.cancelledSites || {}) };
    const completedKeys = [];
    const rollbackOperationIds = [];

    for (const result of results) {
      const siteId = result?.structure?.siteId || result?.siteId;
      const siteKey = S10_CONSTRUCTION_SITE_KEYS[siteId];
      if (!siteKey) continue;
      delete construction.pendingSites[siteKey];
      if (result.status === 'completed') {
        construction.completedSites[siteKey] = true;
        completedKeys.push(siteKey);
      } else {
        construction.cancelledSites[siteKey] = result.code || 'cancelled';
        if (result.code === 'toolBroken') {
          construction.toolBreakExperienced = true;
          construction.toolBreakSiteKey = siteKey;
        }
        rollbackOperationIds.push(`${result.operationId}:refund`);
      }
    }

    const allCompleted = ['campfire', 'barricade', 'simpleWall', 'arrowTower']
      .every(key => construction.completedSites[key] === true);
    construction.completed = allCompleted;
    construction.lastTerminalAtScene = 'S10';
    const nextStory = {
      ...beforeStory,
      s10Construction: construction,
      month: allCompleted ? Math.max(10, Math.floor(Number(beforeStory.month) || 0)) : beforeStory.month,
      unlockedScenes: allCompleted
        ? [...new Set([...(beforeStory.unlockedScenes || []), 'S11'])]
        : beforeStory.unlockedScenes,
      pendingSceneId: allCompleted ? 'S11' : beforeStory.pendingSceneId,
      lastCheckpointId: allCompleted
        ? 'checkpoint.S10.constructionComplete'
        : 'checkpoint.S10.constructionTerminal'
    };
    blackboard.set('storyState', nextStory);

    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: nextStory.lastCheckpointId, sceneId: 'S10'
      });
      if (!saved?.ok) throw new Error(saved?.message || saved?.errors?.[0]?.message || 'checkpointFailed');
      for (const siteKey of completedKeys) {
        await this._spawnPlacements({ group: `S10-built-${siteKey === 'simpleWall' ? 'simple-wall' : siteKey === 'arrowTower' ? 'arrow-tower' : siteKey}` });
      }
      if (allCompleted) {
        this._showScreenTip('四类工事已全部完成，时间推进至十月，S11 广宗战场已经开放。', { title: '溪畔营地建成' });
      } else if (results.some(result => result.code === 'toolBroken')) {
        this._showScreenTip('旧铲在施工完成前折断，本次工事作废，全部材料已恢复。请换用完好的营建铁铲。', {
          title: '铲子损毁'
        });
      } else {
        const names = results.filter(result => result.status === 'completed')
          .map(result => this.constructionSystem.getDefinition(result.structure.definitionId)?.name)
          .filter(Boolean);
        this._showScreenTip(`${names.join('、') || '工事'}已完成并写入检查点。`, { title: '施工完成' });
      }
      return true;
    } catch (error) {
      this._restoreConstructionRollback(rollback, rollbackOperationIds);
      this._showScreenTip(`施工终态保存失败：${error?.message || error}，工具、熟练度、工事与材料已回滚。`, {
        title: '保存失败'
      });
      return false;
    }
  }

  async _checkpointS06ConstructionTerminal(results, rollback) {
    const blackboard = this.gameLoader?.blackboard;
    if (!blackboard || !rollback) return false;
    const result = results.find(entry => (entry?.structure?.siteId || entry?.siteId) === S06_FIELD_CONSTRUCTION_SITE_ID);
    const beforeStory = cloneData(blackboard.get('storyState') || {});
    const completed = result?.status === 'completed';
    blackboard.set('storyState', {
      ...beforeStory,
      s06Construction: {
        ...(beforeStory.s06Construction || {}),
        pending: false,
        completed,
        toolBreakExperienced: result?.code === 'toolBroken'
          || beforeStory.s06Construction?.toolBreakExperienced === true,
        materialsRefunded: result?.refunded === true,
        terminalCode: result?.code || result?.status || 'unknown',
        operationId: result?.operationId || null
      },
      lastCheckpointId: 'checkpoint.S06.fieldConstruction'
    });
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S06.fieldConstruction', sceneId: 'S06'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointFailed');
      if (completed) {
        await this._spawnPlacements({ group: 'S06-built-barricade' });
        this._showScreenTip('拒马已经完成，可回军令旗决定继续坚守或撤离。', { title: '临时工事完成' });
      } else {
        this._showScreenTip('旧铲在夯土时折断，拒马作废；木铁已全部退回。你只能带着这次损失重新评估守撤。', {
          title: '第一次失去铲子'
        });
      }
      return true;
    } catch (error) {
      this._restoreConstructionRollback(rollback, [`${result?.operationId}:refund`]);
      this._showScreenTip(`S06 工事检查点失败：${error?.message || error}，材料和工具状态已回滚。`, { title: '保存失败' });
      return false;
    }
  }

  async openS04RouteChoice() {
    if (this.currentSceneId !== 'S04' || !this.irreversibleChoiceView || !this.s04RouteCoordinator) return false;
    const availability = this.s04RouteCoordinator.validateOpen({
      rescueActive: this.rescueSystem?.status === RescueStatus.ACTIVE
    });
    if (availability.committed) {
      try {
        return await this._travelS04SelectedRoute(availability.route.routeId);
      } catch (error) {
        this._showScreenTip(`前往已选路线失败：${error?.message || error}`, { title: '场景切换失败' });
        return false;
      }
    }
    if (!availability.ok) {
      const messages = {
        battleResultNotApplied: '先完成长社战役并让战果成功写入检查点。',
        rescueActive: '波才救援仍在计时，先完成或结束救援再离开长社。',
        routeTargetMissing: `${availability.sceneId || '目标'} 区块或玩家出生点缺失。`
      };
      this._showScreenTip(messages[availability.code] || '豫州路线当前不可用。', { title: '路线尚未开放' });
      return false;
    }

    this.irreversibleChoiceView.open({
      title: '长社战后·选择豫州进军路线',
      description: '南阳与西华路线互斥，确认并写入检查点后不可更改。',
      allowCancel: true,
      selectedId: 'nanyang',
      choices: Object.values(S04_ROUTE_CONFIGS).map(route => ({
        id: route.id,
        label: route.label,
        consequences: route.consequences
      }))
    });
    return true;
  }

  async _handleIrreversibleChoiceCommand(command = {}) {
    if (this.currentSceneId === 'S06') return this._handleS06DefenseChoiceCommand(command);
    if (this.currentSceneId === 'S08') return this._handleS08RetreatChoiceCommand(command);
    return this._handleS04RouteChoiceCommand(command);
  }

  async _handleS04RouteChoiceCommand(command = {}) {
    if (command.type === 'cancel') {
      if (!this._s04RouteBusy) this.irreversibleChoiceView?.close?.();
      return true;
    }
    if (command.type !== 'selectChoice') return false;
    return this._commitS04RouteChoice(command.choiceId);
  }

  async _commitS04RouteChoice(routeId) {
    if (this._s04RouteBusy || this.currentSceneId !== 'S04') return false;
    const route = S04_ROUTE_CONFIGS[routeId];
    const coordinator = this.s04RouteCoordinator;
    if (!route || !coordinator) {
      this._showScreenTip('所选豫州路线不存在或路线服务尚未就绪。', { title: '路线不可用' });
      return false;
    }

    this._s04RouteBusy = true;
    this.irreversibleChoiceView?.setBusy?.(true);
    try {
      const result = await coordinator.commit(routeId, {
        rescueActive: this.rescueSystem?.status === RescueStatus.ACTIVE
      });
      if (!result.ok) {
        const messages = {
          routeLocked: `豫州路线已锁定为${S04_ROUTE_CONFIGS[result.routeId]?.label || result.routeId || '其他路线'}。`,
          routeCommitRolledBack: `路线检查点失败：${result.message || '保存失败'}，选择未写入。`,
          routeBusy: '路线选择正在提交，请稍候。',
          battleResultNotApplied: '先完成长社战役并让战果成功写入检查点。',
          rescueActive: '波才救援仍在计时，先完成或结束救援再选择路线。',
          routeTargetMissing: `${result.sceneId || '目标'} 区块或玩家出生点缺失。`,
          invalidRoute: '所选豫州路线不存在。'
        };
        const titles = {
          routeLocked: '路线不可更改',
          routeCommitRolledBack: '路线提交失败',
          routeBusy: '路线正在提交'
        };
        this._showScreenTip(messages[result.code] || '豫州路线当前不可提交。', {
          title: titles[result.code] || '路线不可用'
        });
        return false;
      }

      this.irreversibleChoiceView?.close?.();
      if (!result.idempotent) {
        this._showScreenTip(`${route.label}已锁定，另一条豫州路线不再开放。`, { title: '路线确认完成' });
      }
      if (result.eventError) {
        console.warn('[DDScene] 路线已持久化，但 routeSelected 事件处理失败:', result.eventError);
      }

      try {
        return await this._travelS04SelectedRoute(routeId);
      } catch (error) {
        this._showScreenTip(
          `路线已保存，但前往 ${route.entrySceneId} 失败：${error?.message || error}。可在路线军令旗处重试。`,
          { title: '场景切换失败' }
        );
        return false;
      }
    } catch (error) {
      this._showScreenTip(`路线提交失败：${error?.message || error}`, { title: '路线提交失败' });
      return false;
    } finally {
      this._s04RouteBusy = false;
      this.irreversibleChoiceView?.setBusy?.(false);
    }
  }

  async _travelS04SelectedRoute(routeId) {
    const route = S04_ROUTE_CONFIGS[routeId];
    if (!route || this.currentSceneId !== 'S04') return false;
    if (!this._worldLoadSession?.getChunk?.(route.entrySceneId)
      || !this._worldLoadSession?.findSpawn?.(route.entrySceneId, 'player')) {
      throw new Error(`${route.entrySceneId} 区块或玩家出生点缺失`);
    }
    const result = await this.teleportToChunk({
      scene: route.entrySceneId, spawnRef: 'player', transition: 'fadeBlack'
    });
    if (result === false || result?.cancelled) throw new Error('sceneTransitionCancelled');
    this.battleModeView?.close?.();
    this.battleResultView?.close?.();
    this.battleHudView?.clear?.();
    this._showScreenTip(`已进入${route.label}。当前场景为后续内容制作的灰盒入口。`, {
      title: `${route.entrySceneId}·${route.label}`
    });
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
    registerSceneTriggerActions(trig, {
      spawnPlacements: selector => this._spawnPlacements(selector),
      teleportToChunk: params => this.teleportToChunk(params),
      requestAutoSave: params => this.requestAutoSave(params),
      weatherSystem: this.weatherSystem,
      timeSystem: this.timeSystem,
      logger: console
    });
    // 场景专属动作：点燃火堆（触发器 do:lightCampfire 调用）
    trig.registerAction('lightCampfire', () => this.lightCampfire());
    // 场景专属动作：按组激活场景放置点（兼容既有触发器）。
    trig.registerAction('spawnGroup', (p) => this._spawnGroup(p));
    // 场景专属动作：倒计时后触发死亡过渡→传送到目标区块
    trig.registerAction('sceneCountdown', (p) => this._startSceneCountdown(p));
    // 场景专属动作：提示切幕（等待按 N 或交互键 E 再传送）
    trig.registerAction('promptSwitch', (p) => this._startPromptSwitch(p));
    // S01 教学完成后的单一事务出口：一次性奖励、解锁 S02、传送。
    trig.registerAction('completeS01AndTravel', (p) => this.completeS01AndTravel(p));
    // S02 召见对话完成后创建可恢复检查点，再通过 RegionCoordinator 前往 S09。
    trig.registerAction('acceptS02Summons', (p) => this.acceptS02Summons(p));
    trig.registerAction('travelToS09', () => this.travelToS09());
    trig.registerAction('travelToS03', () => this.travelToS03());
    trig.registerAction('openS03BattleMode', () => this.openS03BattleMode());
    trig.registerAction('checkS03Exit', () => this.checkS03Exit());
    trig.registerAction('openS04BattleMode', () => this.openS04BattleMode());
    trig.registerAction('startS04BocaiRescue', () => this.startS04BocaiRescue());
    trig.registerAction('completeS04BocaiEvacuation', () => this.completeS04BocaiEvacuation());
    trig.registerAction('openS04RouteChoice', () => this.openS04RouteChoice());
    trig.registerAction('openS05BattleMode', () => this.openS05BattleMode());
    trig.registerAction('prepareS05Mine', () => this.prepareS05Mine());
    trig.registerAction('showS05MineStatus', () => this.showS05MineStatus());
    trig.registerAction('completeS05MineRetreat', () => this.completeS05MineRetreat());
    trig.registerAction('startS05ZhangManchengRescue', () => this.startS05ZhangManchengRescue());
    trig.registerAction('checkS05Exit', () => this.checkS05Exit());
    trig.registerAction('openS06DefenseChoice', () => this.openS06DefenseChoice());
    trig.registerAction('startS06FieldConstruction', () => this.startS06FieldConstruction());
    trig.registerAction('completeS06Recall', () => this.completeS06Recall());
    trig.registerAction('openS07BattleMode', () => this.openS07BattleMode());
    trig.registerAction('commitS07DelayPoint', (p = {}) => this.commitS07DelayPoint(p));
    trig.registerAction('checkS07Exit', (p = {}) => this.checkS07Exit(p));
    trig.registerAction('openS08RetreatChoice', () => this.openS08RetreatChoice());
    trig.registerAction('completeS08Recall', () => this.completeS08Recall());
    trig.registerAction('commitS10ZhangJiaoDeath', () => this.commitS10ZhangJiaoDeath());
    trig.registerAction('acknowledgeS10TemporaryCamp', () => this.acknowledgeS10TemporaryCamp());
    trig.registerAction('completeS10CampRelocation', () => this.completeS10CampRelocation());
    trig.registerAction('startS10Construction', (p = {}) => this.startS10Construction(p));
    trig.registerAction('cancelS10Construction', (p = {}) => this.cancelS10Construction(p));
    trig.registerAction('acceptS09Enlistment', () => this.acceptS09Enlistment());
    trig.registerAction('prepareS09RefugeeConflict', () => this.prepareS09RefugeeConflict());
    trig.registerAction('startS09RefugeeConflict', () => this.startS09RefugeeConflict());
    trig.registerAction('handleS09RefugeeChoice', (_params, _ctx, event) => (
      this.handleS09RefugeeChoice(event?.params?.choiceId)
    ));
    trig.registerAction('advanceGameDay', (p = {}) => this.advanceGameDay(p.days));
    trig.registerAction('prepareSpecialFaint', (p) => this.setPendingSpecialFaint(p));
    trig.registerAction('clearSpecialFaint', () => this.clearPendingSpecialFaint());
    // 切换到显式注册的独立场景（副本/过场等）；大地图推进一律走 teleportToChunk。
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
    // 场景专属动作：提示按 N 进入下一波（第一波打完→等按N→第二波）
    trig.registerAction('promptNextWave', (p) => this._startPromptNextWave(p));
    // 场景专属动作：逐渐生成饥民（第二波，从四面八方涌入）
    trig.registerAction('spawnStarvingWave', (p) => this._startStarvingWave(p));
    // 场景专属动作：批量生成一波敌人（第五幕战役，小兵+名将）
    trig.registerAction('spawnWave', (p) => this._spawnWave(p));
    // S09 职业选择：空间 binding 打开确认框，确认后由单一事务提交职业。
    trig.registerAction('selectClass', (p) => this._selectClass(p));
    trig.registerAction('confirmClass', (p) => this._showClassConfirmation(p));
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

  /** S09 出征旗是进入 S03 的唯一正常入口；跨区提交成功后 RegionCoordinator 才会解锁 S03。 */
  async travelToS03() {
    if (this.currentSceneId !== 'S09') {
      return { ok: false, errors: [{ code: 'wrongScene', path: 'currentSceneId', message: '只能从 S09 出征颍川' }] };
    }
    const storyState = this.gameLoader?.blackboard?.get?.('storyState');
    if (storyState?.joinedYellowTurban !== true || storyState?.classSelectionCommitted !== true) {
      this._showScreenTip('加入黄巾并确认职业后，才能持军令出征颍川', { title: '出征条件不足' });
      return { ok: false, errors: [{
        code: 's03PrerequisiteMissing', path: 'storyState.classSelectionCommitted', message: 'S03 需要完成入伍和职业确认'
      }] };
    }
    const regionIndex = this._findRegionIndexForScene('S03');
    if (regionIndex < 0) {
      return { ok: false, errors: [{ code: 'missingTargetScene', path: 'worldMap', message: '世界地图未登记 S03' }] };
    }
    return this.travelToRegion({ regionIndex, sceneId: 'S03', spawnRef: 'player' });
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
  _getS09RefugeeConfig() {
    const configured = this.gameLoader?.project?.extensions?.sanguoZhangjiao?.s09RefugeeConflict || {};
    const positiveInteger = (value, fallback) => {
      const number = Math.floor(Number(value));
      return Number.isFinite(number) && number > 0 ? number : fallback;
    };
    const ratio = Number(configured.minimumCityDamageRatio);
    const chance = Number(configured.hardlineEscapeChance);
    return {
      minimumCityDamageRatio: Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 0.4,
      donationFood: positiveInteger(configured.donationFood, 20),
      donationMorale: positiveInteger(configured.donationMorale, 5),
      damagePauseDays: positiveInteger(configured.damagePauseDays, 1),
      hardlineMorale: positiveInteger(configured.hardlineMorale, 10),
      hardlineEscapeChance: Number.isFinite(chance) && chance >= 0 && chance <= 1
        ? chance : S09_HARDLINE_ESCAPE_CHANCE,
      appeaseFood: positiveInteger(configured.appeaseFood, 30),
      consequenceDelayDays: positiveInteger(configured.consequenceDelayDays, 1)
    };
  }

  async prepareS09RefugeeConflict() {
    if (this.currentSceneId !== 'S09') return false;
    const rules = this._getS09RefugeeConfig();
    const context = this._getS09CityContext();
    if (!context || Number(context.city.damageRatio) < rules.minimumCityDamageRatio
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
    const rules = this._getS09RefugeeConfig();
    const context = this._getS09CityContext();
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const conflict = context?.storyState?.s09RefugeeConflict;
    if (!context || !inventory || !conflict) return false;
    if (conflict.donationCommitted) {
      this._setRefugeeDialogueNode('branchChoice');
      return true;
    }

    const quantity = rules.donationFood;
    if (this.inventoryTransactions.previewRemove(inventory, 'resource.food', quantity).remainder > 0) {
      this._setRefugeeDialogueNode('donationFailed');
      this._showScreenTip(`需要粮食 ×${quantity} 才能稳定现场；库存未改变。`, { title: '粮食不足' });
      return false;
    }
    const currentDay = Math.max(1, Math.floor(Number(context.storyState.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    const cityDraft = JSON.parse(JSON.stringify(context.city));
    cityDraft.morale = Math.max(0,
      Math.floor(Number(cityDraft.morale) || 0) + rules.donationMorale);
    cityDraft.damagePausedUntilDay = Math.max(
      Math.floor(Number(cityDraft.damagePausedUntilDay) || 0), currentDay + rules.damagePauseDays
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
    this._showScreenTip(
      `捐出粮食 ×${quantity}：城市士气 +${rules.donationMorale}，损毁暂停 ${rules.damagePauseDays} 个游戏日。`
    );
    return true;
  }

  _findValidInventoryTool(inventory, toolType) {
    return (inventory?.slots || [])
      .map(stack => stack?.item)
      .find(item => item?.toolType === toolType && Number(item.durability) > 0) || null;
  }

  async _commitS09RefugeeBranch(branch) {
    const rules = this._getS09RefugeeConfig();
    const context = this._getS09CityContext();
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const conflict = context?.storyState?.s09RefugeeConflict;
    if (!context || !inventory || !conflict?.donationCommitted) {
      this._setRefugeeDialogueNode('donationFailed');
      return false;
    }
    if (!['hardline', 'appease', 'silence'].includes(branch)) return false;
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
    let delayedEventId = null;

    if (branch === 'hardline') {
      delayedEventId = 'story:S09:hardline-escape';
      cityDraft.morale = Math.min(100, Math.max(0,
        Math.floor(Number(cityDraft.morale) || 0) + rules.hardlineMorale));
      tags.add('s09.refugees.hardline');
      tags.add('s09.refugees.strictCommander');
      if (!delayedConsequences.some(event => event?.id === delayedEventId)) {
        const playerId = this.playerEntity?.id || 'player';
        const classId = context.storyState.selectedClass || this.selectedClass || 'unselected';
        delayedConsequences.push({
          id: delayedEventId,
          type: S09_HARDLINE_ESCAPE_EVENT_TYPE,
          dueDay: currentDay + rules.consequenceDelayDays,
          status: 'pending',
          sourceSceneId: 'S09',
          payload: {
            chance: rules.hardlineEscapeChance,
            willEscape: stableStoryRoll(delayedEventId, currentDay, playerId, classId)
              < rules.hardlineEscapeChance
          }
        });
      }
      result = 'hardlineEscapeScheduled';
    } else if (branch === 'appease') {
      const axe = this._findValidInventoryTool(inventory, 'axe');
      if (axe) {
        cityDraft.resources = {
          ...cityDraft.resources,
          food: Math.max(0, Math.floor(Number(cityDraft.resources?.food) || 0) + rules.appeaseFood)
        };
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
      delayedEventId = 'story:S09:silence-food-collapse';
      if (!delayedConsequences.some(event => event?.id === delayedEventId)) {
        delayedConsequences.push({
          id: delayedEventId,
          type: S09_SILENCE_EVENT_TYPE,
          dueDay: currentDay + rules.consequenceDelayDays,
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
        delayedEventId,
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
      hardline: '残兵控制住人群：城市士气 +10，获得“严苛统领”标签；下一游戏日将结算逃亡风险。',
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

  /** 到期后果按 StoryState event id 幂等提交；保存失败恢复草稿并等待重试。 */
  async _processDueStoryEvents() {
    if (this._processingDelayedStoryEvents || !this.gameLoader) return false;
    const context = this._getS09CityContext();
    const storyState = context?.storyState;
    const currentDay = Math.max(1, Math.floor(Number(storyState?.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    const supportedTypes = new Set([S09_SILENCE_EVENT_TYPE, S09_HARDLINE_ESCAPE_EVENT_TYPE]);
    const dueEvent = (storyState?.delayedConsequences || []).find(event => (
      event?.status === 'pending'
      && Number(event.dueDay) <= currentDay
      && supportedTypes.has(event.type)
    ));
    if (!context || !dueEvent) return false;

    this._processingDelayedStoryEvents = true;
    const blackboardBefore = JSON.parse(JSON.stringify(context.blackboard.serialize()));
    try {
      let storyDraft = { ...storyState };
      let eventOutcome = 'completed';
      let tipTitle = '延迟后果';
      let tipMessage = '';

      if (dueEvent.type === S09_SILENCE_EVENT_TYPE) {
        const cityDraft = JSON.parse(JSON.stringify(context.city));
        cityDraft.resources = { ...cityDraft.resources, food: 0 };
        if (!this._validateS09City(cityDraft, context.cityIndex)) {
          throw new Error('延迟后果生成了非法 CityState');
        }
        this._setS09City(context, cityDraft);
        const hiddenClues = new Set(storyState.hiddenClues || []);
        hiddenClues.add('s09.refugees.breadArmClue');
        storyDraft = { ...storyDraft, hiddenClues: [...hiddenClues] };
        eventOutcome = 'foodCollapsed';
        tipMessage = '新的一日到来：营地粮食耗尽，断臂饥民手中的饼留下了一条隐藏线索。';
      } else if (dueEvent.type === S09_HARDLINE_ESCAPE_EVENT_TYPE) {
        const willEscape = dueEvent.payload?.willEscape === true;
        const tags = new Set(storyState.storyTags || []);
        if (willEscape) tags.add('s09.refugees.escapeOccurred');
        storyDraft = {
          ...storyDraft,
          storyTags: [...tags],
          s09RefugeeConflict: {
            ...(storyState.s09RefugeeConflict || {}),
            hardlineEscapeOccurred: willEscape,
            hardlineEscapeDay: currentDay
          }
        };
        eventOutcome = willEscape ? 'escapeOccurred' : 'noEscape';
        tipTitle = willEscape ? '夜间逃亡' : '营地守夜';
        tipMessage = willEscape
          ? '新的一日到来：几顶帐篷已经空了，泥地上的脚印一路通向营外。'
          : '新的一日到来：残兵守住了营地，这一夜无人逃亡。';
      }

      storyDraft.delayedConsequences = storyState.delayedConsequences.map(event => (
        event?.id === dueEvent.id
          ? { ...event, status: 'completed', completedDay: currentDay, outcome: eventOutcome }
          : event
      ));
      context.blackboard.set('storyState', storyDraft);

      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: `checkpoint.${dueEvent.id}`, sceneId: this.currentSceneId
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '延迟后果检查点未提交');
      this._showScreenTip(tipMessage, { title: tipTitle });
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
    this.fog.opacity = S01_INITIAL_FOG_OPACITY;
    this.fog.targetOpacity = S01_INITIAL_FOG_OPACITY;
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
    if (this.battleResultView?.visible) {
      return this.battleResultView.handleInput({
        inputManager,
        gamepad,
        viewWidth: this.logicalWidth,
        viewHeight: this.logicalHeight
      });
    }
    if (this.irreversibleChoiceView?.visible) {
      return this.irreversibleChoiceView.handleInput({
        inputManager,
        gamepad,
        viewWidth: this.logicalWidth,
        viewHeight: this.logicalHeight
      });
    }
    if (this.battleModeView?.visible) {
      return this.battleModeView.handleInput({
        inputManager,
        gamepad,
        viewWidth: this.logicalWidth,
        viewHeight: this.logicalHeight
      });
    }
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
      this._applySpawnPoints(placements, {
        sceneId: this.currentSceneId,
        applyPlayer: this._initialPlayerSpawnPending === true
      });
      this._worldReadyGate?.resolve('placements', placements);
      this._syncWorldReadyProjection();
    })).catch(this.resourceScope.guard(e => {
      console.warn('[DDScene] 加载 game.project.json 失败:', e);
      this._placements = [];
      this._sceneTriggerBindings?.setBindings([]);
      this._applySpawnPoints(this._placements, {
        sceneId: this.currentSceneId,
        applyPlayer: this._initialPlayerSpawnPending === true
      });
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
   * 应用当前业务场景的出生点。玩家出生点只允许由新游戏启动消费一次；
   * 读档、继承玩家与显式传送分别由 SaveGame、ScenePlayerLifecycle 和 Navigator 持有位置权威。
   * @private
   */
  _applySpawnPoints(placements, { sceneId = this.currentSceneId, applyPlayer = false } = {}) {
    const scenePlacements = (placements || []).filter(placement => placement.sceneId === sceneId);
    const campfireSpawn = scenePlacements.find(placement =>
      placement.type === 'spawn' && placement.ref === 'campfire');
    if (campfireSpawn) {
      this.campfire.x = campfireSpawn.x;
      this.campfire.y = campfireSpawn.y;
    }

    let playerMoved = false;
    if (applyPlayer) {
      const playerSpawn = scenePlacements.find(placement =>
        placement.type === 'spawn' && (placement.ref === 'player' || placement.kind === 'player'));
      const transform = this.playerEntity?.getComponent?.('transform');
      if (playerSpawn && transform) {
        transform.position.x = playerSpawn.x;
        transform.position.y = playerSpawn.y;
        this.camera?.setPosition?.(playerSpawn.x, playerSpawn.y);
        this._initialPlayerSpawnPending = false;
        playerMoved = true;
      } else {
        console.error(`[DDScene] 新游戏缺少 canonical 玩家出生点: ${sceneId}`);
      }
    }

    console.log('[DDScene] 场景放置点:', placements?.length || 0,
      '当前场景:', sceneId,
      '启动模式:', this._playerStartMode,
      '玩家出生点已应用:', playerMoved,
      '玩家:', this.playerEntity?.getComponent('transform')?.position,
      '火堆:', this.campfire.x, this.campfire.y);
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
    // 战中 HUD 与救援 HUD 只绘制领域系统的不可变快照。
    this.battleHudView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
    this.rescueObjectiveView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
    // 职业确认窗口（最上层，半透明遮罩 + 面板）
    this._renderClassConfirmation(ctx);
    // 战役模式确认优先于其他场景弹窗，且不直接修改领域状态。
    this.battleModeView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
    // 路线选择只发命令；互斥、幂等和 checkpoint 由场景领域事务拥有。
    this.irreversibleChoiceView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
    // 战果面板最后绘制并吞掉全部世界输入，关闭只影响 UI 可见性。
    this.battleResultView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
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
    // 使用分层 alpha 合成而不是直接相加；开场基础雾可达到纯黑，玩家与营火透光区仍由遮罩挖出。
    const timeFogOpacity = Math.min(1, Math.max(0, timeFogAdd * 0.3));
    const weatherFogOpacity = Math.min(1, Math.max(0, weatherFogAdd));
    const composedFogOpacity = 1
      - (1 - Math.min(1, Math.max(0, baseFogOpacity)))
      * (1 - timeFogOpacity)
      * (1 - weatherFogOpacity);
    const totalFogOpacity = Math.min(1.0, composedFogOpacity);

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
    const viewBounds = this.camera.getViewBounds();
    for (const entity of this.entities) {
      const transform = entity.getComponent('transform');
      if (transform) {
        renderQueue.push({ type: 'entity', y: transform.position.y, sortPriority: 2, entity });
      }
    }
    renderQueue.push({ type: 'campfire_bottom', y: this.campfire.y, sortPriority: 0, render: () => this.renderCampfireBottom(ctx) });
    renderQueue.push({ type: 'campfire_top', y: this.campfire.y - 1, sortPriority: 0, render: () => this.renderCampfireTop(ctx) });

    for (const t of this._terrains) {
      t.renderBelowDecorations(ctx);
      t.collectDecorations(renderQueue, ctx, viewBounds);
    }
    this.particleSystem?.collectDepthSorted?.(renderQueue, ctx, this.camera, viewBounds);

    renderQueue.sort((a, b) => (a.y - b.y) || ((a.sortPriority || 0) - (b.sortPriority || 0)));
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
