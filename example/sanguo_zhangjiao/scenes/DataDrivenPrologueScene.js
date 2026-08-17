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
 * DataDrivenPrologueScene - 数据驱动 S01–S14 世界场景
 *
 * 继承 BaseGameScene（通用可玩管线），通过 SceneTerrainBinding、
 * SceneCampfireService 与 GameProject 的 canonical 场景数据装配地形、碰撞、火堆与表现。
 * 流程由 GameProject（game.project.json）的 triggers、领域 command 与区块传送驱动。
 *
 * 当前作为 Demo 唯一运行时大地图场景；?ddscene=preview 进入静态编辑器预览。
 * 各场景流程由 GameProject triggers 与区块传送驱动。
 */

import { BaseGameScene } from './BaseGameScene.js';
import { InputHints } from '../../../src/core/input/InputHints.js';
import { Scene1Terrain } from './Scene1Terrain.js';
import { WorldMapLoadSession } from '../../../src/core/scene/WorldMapLoadSession.js';
import { CanonicalSceneRepository } from '../../../src/core/scene/CanonicalSceneRepository.js';
import { FetchDiskSceneAdapter, LocalStorageSceneCacheAdapter } from '../../../src/core/scene/CanonicalSceneAdapters.js';
import { SceneStreamingRuntime } from '../../../src/core/scene/SceneStreamingRuntime.js';
import { RegionCoordinator } from '../../../src/core/scene/RegionCoordinator.js';
import { WorldReadyGate } from '../../../src/core/scene/WorldReadyGate.js';
import { ChunkNavigator } from '../../../src/core/scene/ChunkNavigator.js';
import { SceneNavigationProjection } from '../../../src/core/scene/SceneNavigationProjection.js';
import { SceneWorldQuery } from '../../../src/core/scene/SceneWorldQuery.js';
import { ScenePickedObjectObserver } from '../../../src/core/scene/ScenePickedObjectObserver.js';
import { ScenePlacementRuntime } from '../../../src/core/scene/ScenePlacementRuntime.js';
import { SceneVehicleRuntime } from '../../../src/core/scene/SceneVehicleRuntime.js';
import { SceneGameLoaderBridge } from '../../../src/core/scene/SceneGameLoaderBridge.js';
import { SceneCityWarStateBridge } from '../../../src/core/scene/SceneCityWarStateBridge.js';
import { SANGUO_ZHANGJIAO_CONTENT_POLICY } from '../config/SanguoZhangjiaoContentPolicy.js';
import { registerSceneTriggerActions } from '../../../src/core/scene/SceneTriggerActionProvider.js';
import { ScenarioCommandService, SCENARIO_COMMANDS } from '../../../src/systems/ScenarioCommandService.js';
import { DomainCommandService } from '../../../src/systems/DomainCommandService.js';
import { CanonicalStateTransactionService } from '../../../src/systems/CanonicalStateTransactionService.js';
import { SanguoDomainCommandFacade } from '../systems/SanguoDomainCommandFacade.js';
import { WeatherSystem } from '../../../src/systems/WeatherSystem.js';
import { TimeSystem } from '../../../src/systems/TimeSystem.js';
import { ClassType, ClassNames } from '../../../src/systems/ClassSystem.js';
import { PadButton } from '../../../src/core/input/Xbox360Profile.js';
import { ProgressionViewModel } from '../../../src/ui/progression/ProgressionViewModel.js';
import { ProgressionPanel } from '../../../src/ui/progression/ProgressionPanel.js';
import { CityStateSummaryPanel } from '../../../src/ui/CityStateSummaryPanel.js';
import { CargoTransferView } from '../../../src/ui/CargoTransferView.js';
import { SanguoSceneLifecycleCoordinator } from '../systems/SanguoSceneLifecycleCoordinator.js';
import { SanguoPlacementCoordinator } from '../systems/SanguoPlacementCoordinator.js';
import { S01S02Coordinator } from '../systems/S01S02SceneFlow.js';
import { SceneTutorialFlow } from '../../../src/core/scene/SceneTutorialFlow.js';
import { SceneCampfireService } from '../../../src/core/scene/SceneCampfireService.js';
import { SceneNpcInteractionFlow } from '../../../src/core/scene/SceneNpcInteractionFlow.js';
import {
  S03S08Coordinator, S03_BATTLE_ID
} from '../systems/S03S08SceneFlow.js';
import {
  S05SceneCoordinator, S05_ZHANG_MANCHENG_RESCUE_ID
} from '../systems/S05SceneFlow.js';
import { S06SceneCoordinator } from '../systems/S06SceneFlow.js';
import {
  S07S08Coordinator, S07_BATTLE_ID
} from '../systems/S07S08SceneFlow.js';
import {
  S09RefugeeCoordinator, S09_SILENCE_EVENT_TYPE
} from '../systems/S09RefugeeFlow.js';
import { S09ClassSelectionCoordinator } from '../systems/S09ClassSelectionFlow.js';
import { S10ConstructionCoordinator } from '../systems/S10ConstructionFlow.js';
import { S10StoryCoordinator } from '../systems/S10StoryFlow.js';
import { S11S14SceneCoordinator } from '../systems/S11S14SceneFlow.js';
import { SanguoSceneNavigationCoordinator } from '../systems/SanguoSceneNavigationFlow.js';
import { SanguoSceneCommandCoordinator } from '../systems/SanguoSceneCommandFlow.js';
import { S03S14BattleCoordinator } from '../systems/S03S14BattleCoordinator.js';
import { SanguoSceneStateFlow } from '../systems/SanguoSceneStateFlow.js';
import { SanguoWorldRuntimeCoordinator } from '../systems/SanguoWorldRuntimeCoordinator.js';

const cloneData = value => value == null ? value : JSON.parse(JSON.stringify(value));

export class DataDrivenPrologueScene extends BaseGameScene {
  // 覆盖父类：DDScene 自行通过 _loadWorldTerrains 管理地形，不需要父类创建
  _initEditorTerrain() { /* 由 _loadWorldTerrains 代替 */ }

  constructor() {
    super({
      name: 'DataDrivenPrologueScene',
      title: '三国张角传',
      description: 'S01 干旱平原'
    });
    // 启动场景只在 ProjectWorldIndex 构建成功后由显式 entrySceneId 决定。
    this.currentSceneId = null;
    this._worldQuery = new SceneWorldQuery({
      getSession: () => this._worldLoadSession,
      getCurrentSceneId: () => this.currentSceneId,
      getProjectedObjects: () => this._worldLoadResult?.sceneObjects || []
    });
    this.context.services.worldQuery = this._worldQuery;

    this._tutorialFlow = new SceneTutorialFlow({
      tutorialSystem: this.tutorialSystem,
      getScope: () => ({ sceneId: this.currentSceneId }),
      presenter: {
        show: data => this._showScreenTip(data?.step?.text || '', {
          title: data?.tutorialTitle || '教学', persist: true, owner: 'tutorial'
        }),
        hide: () => this._hideScreenTip('tutorial')
      },
      scheduler: callback => this.resourceScope?.setTimeout(callback, 0)
    });
    this.context.services.tutorialFlow = this._tutorialFlow;
    this._s01s02Coordinator = new S01S02Coordinator(this);
    Object.assign(this.context.services, {
      s01s02: this._s01s02Coordinator,
      defeatPolicy: this._s01s02Coordinator
    });

    // 火堆服务只保存运行态；表现参数由当前 canonical scene gameplay consumer 发布后配置。
    this._campfireService = new SceneCampfireService({
      onIgnited: () => this.gameLoader?.triggerSystem?.fire?.('campfireLit', { sceneId: this.currentSceneId }),
      logger: console
    });
    this.context.services.campfire = this._campfireService;

    this._placementCoordinator = new SanguoPlacementCoordinator({
      getNpcEntities: () => (this._npcEntities = this._npcEntities || []),
      getGroupEnemies: () => (this._groupEnemies = this._groupEnemies || {})
    });
    this._npcInteractionFlow = new SceneNpcInteractionFlow({
      getNpcs: () => this._npcEntities || [],
      getPlayer: () => this.playerEntity,
      getDialogueSystem: () => this.dialogueSystem,
      getShopSystem: () => this.shopSystem,
      onInteract: target => this.gameLoader?.triggerSystem?.fire?.('interact', { target }),
      showIdleText: ({ npc, text }) => this._presentNpcIdleText(npc, text)
    });
    this.context.services.npcInteraction = this._npcInteractionFlow;
    this._pickedObjectObserver = new ScenePickedObjectObserver({
      lists: [() => this.pickupItems, () => this.equipmentItems],
      onPicked: value => this.onWorldItemPicked(value)
    });
    this.context.services.pickedObjectObserver = this._pickedObjectObserver;

    this.terrain = null;
    this.worldStreamingManager = null;
    this._detachWorldStreaming = null;
    this._worldStreamingRuntime = new SceneStreamingRuntime({
      createTerrain: ({ chunk, chunkWidth, chunkHeight, sceneData }) => new Scene1Terrain({
        centerX: chunkWidth / 2,
        centerY: chunkHeight / 2,
        width: chunkWidth,
        height: chunkHeight,
        editorSceneId: chunk.sceneId,
        worldOffset: chunk.origin,
        skipEditorLoad: true,
        sceneData
      }),
      getPosition: () => this.playerEntity?.getComponent?.('transform')?.position || null,
      getCurrentSceneId: () => this.currentSceneId,
      getRuntime: () => this.sceneRuntime,
      onChunkUnload: ({ chunk }) => this.sanguoWorldRuntimeCoordinator.releaseStreamedChunkRuntime(chunk),
      onProjection: ({ manager, chunks, terrains, terrain }) => {
        this.worldStreamingManager = manager;
        this._terrains = terrains;
        this.terrain = terrain;
        this.context.world.terrain = terrain;
        this.context.world.terrains = terrains;
        this.context.services.placements?.setProjection(chunks.flatMap(chunk => chunk.placements || []));
        const sceneObjects = chunks.flatMap(chunk => chunk.sceneObjects || []);
        const triggerBindings = chunks.flatMap(chunk => chunk.triggerBindings || []);
        const effectZones = chunks.flatMap(chunk => chunk.effectZones || []);
        this._sceneTriggerBindings?.setBindings(triggerBindings, sceneObjects);
        const effectZoneRenderer = this._terrainBinding.setEffectZones(effectZones);
        if (effectZoneRenderer?.zones.length > 0) {
          console.log(`[DDScene] 加载了 ${effectZoneRenderer.zones.length} 个特效区域`);
        }
      },
      onTransition: async ({ manager }) => {
        const placementResult = await this.context.services.placements?.spawnLoadedChunks();
        if (placementResult?.ok === false) {
          this._showScreenTip(placementResult.errors?.[0]?.message || '地图块放置点生成失败', { title: '地图加载失败' });
          return;
        }
        const position = this.playerEntity?.getComponent?.('transform')?.position;
        const center = position ? manager.worldToChunk(position.x, position.y) : null;
        const chunkId = center ? manager.getSceneId(center.col, center.row) : null;
        const sceneId = chunkId ? manager.getSceneNamespace(chunkId) : null;
        if (sceneId && sceneId !== this.currentSceneId) {
          await this.sanguoWorldRuntimeCoordinator.enterStreamedScene(sceneId);
        } else if (sceneId) {
          const restored = this.sanguoWorldRuntimeCoordinator.restoreStreamedDomainState(sceneId);
          if (restored?.ok === false) {
            this._showScreenTip(`地图块动态状态恢复失败：${restored.code || 'unknown'}`, { title: '恢复失败' });
          }
        }
      },
      onError: failure => {
        const message = failure?.errors?.[0]?.message || '相邻地图块加载失败';
        this._showScreenTip(message, { title: '地图加载失败' });
      }
    });
    this._pendingChunkDomainStates = new Map();
    this.sanguoWorldRuntimeCoordinator = new SanguoWorldRuntimeCoordinator(this);
    this.context.services.sanguoWorldRuntime = this.sanguoWorldRuntimeCoordinator;
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
    this.rescueSystem = null;
    this.constructionSystem = null;
    this.vehicleSystem = null;
    this.vehicleLogisticsSystem = null;
    this.mannedStructureAdapter = null;
    this._s10StructureEntities = new Map();
    this._sceneVehicleEntities = new Map();
    this._sceneVehicleRuntime = new SceneVehicleRuntime({
      entityFactory: this.entityFactory,
      entityStore: this.entityStore,
      entities: this._sceneVehicleEntities,
      getCurrentSceneId: () => this.currentSceneId,
      getChunk: sceneId => this._worldLoadSession?.getChunk?.(sceneId) || null,
      findMarker: (sceneId, objectId) => this._worldLoadSession?.findSceneObject?.(sceneId, objectId) || null,
      getVehicleSystem: () => this.context?.systems?.vehicle || this.vehicleSystem,
      getLogisticsSystem: () => this.context?.systems?.vehicleLogistics || this.vehicleLogisticsSystem,
      getPlayer: () => this.context?.player?.entity || this.playerEntity,
      team: 'yellow_turban',
      createTags: (sceneId, definition) => [
        `${sceneId.toLowerCase()}Vehicle`, definition.vehicleType, 'yellow_turban'
      ],
      onAfterDisposeScene: sceneId => {
        if (sceneId !== 'S14') return;
        this.vehicleWeaponSystem?.dispose?.();
        this.vehicleWeaponSystem = null;
        this._s14CatapultFireBusy = false;
      }
    });
    this.context.services.vehicles = this._sceneVehicleRuntime;
    // Demo 历史编排兼容别名；与通用 map 是同一引用，不形成第二份状态。
    this._s14VehicleEntities = this._sceneVehicleEntities;
    this._s10StructureInteractionBusy = false;
    this.rescueObjectiveView = null;
    this.irreversibleChoiceView = null;
    this.cargoTransferView = new CargoTransferView({
      width: 680,
      onCommand: command => { void this.s11s14SceneCoordinator?._handleCargoTransferCommand(command); }
    });
    this._cargoTransferBusy = false;
    this._cargoTransferPendingOperation = null;
    this._cargoTransferSequence = 0;
    this.endingPresentationView = null;
    this.endingSystem = null;
    this.s04RouteCoordinator = null;
    this.s11s12Coordinator = null;
    this.s13s14Coordinator = null;
    this._s12GateEntity = null;
    this._s13PendingSettlement = null;
    this._endingConfig = null;
    this._s04RescueBusy = false;
    this._s05RescueBusy = false;
    this._s04RouteBusy = false;
    this._s07PointBusy = false;
    this._s07ExitBusy = false;
    this._s08DecisionBusy = false;
    this._s08RecallBusy = false;
    this._s10StoryBusy = false;
    this._constructionCheckpointBusy = false;
    this._s05MinePendingSettlements = new Map();
    this._s05MineBusy = false;
    this._s06DecisionBusy = false;
    this._s06RecallBusy = false;
    this._s09RefugeeChoiceBusy = false;
    this._processingDelayedStoryEvents = false;

    // 历史场景编排使用显式 coordinator；Scene 只保留装配和入口调用。
    this.s03s08Coordinator = new S03S08Coordinator(this);
    this.s05SceneCoordinator = new S05SceneCoordinator(this);
    this.s06SceneCoordinator = new S06SceneCoordinator(this);
    this.s07s08Coordinator = new S07S08Coordinator(this);
    this.s09RefugeeCoordinator = new S09RefugeeCoordinator(this);
    this.s09ClassSelectionCoordinator = new S09ClassSelectionCoordinator(this);
    this.context.services.s09ClassSelection = this.s09ClassSelectionCoordinator;
    this.s10StoryCoordinator = new S10StoryCoordinator(this);
    this.s10ConstructionCoordinator = new S10ConstructionCoordinator(this);
    this.s11s14SceneCoordinator = new S11S14SceneCoordinator(this);
    this.sanguoSceneNavigationCoordinator = new SanguoSceneNavigationCoordinator(this);
    this.sanguoSceneCommandCoordinator = new SanguoSceneCommandCoordinator(this);
    this.s03s14BattleCoordinator = new S03S14BattleCoordinator(this);
    this.sanguoSceneStateFlow = new SanguoSceneStateFlow(this);
    this.sanguoSceneLifecycleCoordinator = new SanguoSceneLifecycleCoordinator(this);
    Object.assign(this.context.services, {
      sanguoSceneState: this.sanguoSceneStateFlow,
      sanguoSceneLifecycle: this.sanguoSceneLifecycleCoordinator
    });
    this.cityWarStateBridge = new SceneCityWarStateBridge({
      getBlackboard: () => this.gameLoader?.blackboard || null,
      getConfiguredResourceNodes: () => this.gameLoader?.project?.library?.resourceNodes || [],
      getEntities: () => this.entityStore.all,
      updatePendingResourceNodes: updater => (
        this.context.services.placements?.updatePendingResourceNodeStates?.(updater) || 0
      ),
      getActiveBattle: () => {
        const session = this.context.services.battleRuntime?.getSessionState?.() || {};
        return { battleId: session.battleId || null, mode: session.mode || null };
      },
      getBattleFlowById: battleId => this.getBattleFlowById(battleId),
      getBattleFlows: () => this.getBattleFlows()
    });
    this.context.services.cityWarState = this.cityWarStateBridge;

    // 天气/时间只在 canonical runtime config 发布成功后创建。
    this.weatherSystem = new WeatherSystem(null);
    this.timeSystem = new TimeSystem({ enabled: false, currentDay: 1 });
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

  /** 启动闸门：项目世界索引、显式入口与目标 Region 必须完整有效。 */
  _validateWorldLoadResult(result) {
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    const worldIndex = result?.worldIndex;
    const entry = worldIndex?.getEntry?.();
    const chunk = entry ? result?.chunks?.find(item => item.sceneId === entry.sceneId) : null;
    const valid = errors.length === 0
      && result?.region
      && entry?.loadable === true
      && worldIndex?.isLoadable?.(entry.sceneId) === true
      && chunk?.row === entry.row
      && chunk?.col === entry.col
      && chunk?.offset === entry.offset
      && Array.isArray(chunk?.sceneData?.layers);
    if (!valid) {
      const detail = errors[0]?.message || '显式入口必须是唯一、非 reserved 且具有有效场景 layers';
      throw new Error(`世界内容校验失败: ${detail}`);
    }
    return result;
  }

  _createWorldLoadSession(scope = this.resourceScope) {
    const gameId = 'sanguo_zhangjiao';
    const repository = new CanonicalSceneRepository({
      diskAdapter: new FetchDiskSceneAdapter({
        projectUrl: 'game.project.json',
        sceneBaseUrl: 'assets/scenes/'
      }),
      cacheAdapter: new LocalStorageSceneCacheAdapter({ gameId }),
      mode: 'runtime'
    });
    return new WorldMapLoadSession({ scope, repository });
  }

  /** 流式动态状态由 Demo 世界协调器拥有；保留稳定兼容入口。 */
  _createStreamingStateProvider() {
    return this.sanguoWorldRuntimeCoordinator.createStreamingStateProvider();
  }

  _captureStreamedChunkState(chunk) {
    return this.sanguoWorldRuntimeCoordinator.captureStreamedChunkState(chunk);
  }

  _releaseStreamedChunkRuntime(chunk) {
    return this.sanguoWorldRuntimeCoordinator.releaseStreamedChunkRuntime(chunk);
  }

  _restoreStreamedDomainState(sceneId) {
    return this.sanguoWorldRuntimeCoordinator.restoreStreamedDomainState(sceneId);
  }

  async _prepareWorldStreamingManager(result, targetSceneId = this.currentSceneId, session = this._worldLoadSession) {
    return this.sanguoWorldRuntimeCoordinator.prepareWorldStreamingManager(result, targetSceneId, session);
  }

  async _initializeWorldStreaming(result, targetSceneId = this.currentSceneId, options = {}) {
    return this.sanguoWorldRuntimeCoordinator.initializeWorldStreaming(result, targetSceneId, options);
  }

  _syncWorldStreamingProjection() {
    return this.sanguoWorldRuntimeCoordinator.syncWorldStreamingProjection();
  }

  async _enterStreamedScene(sceneId) {
    return this.sanguoWorldRuntimeCoordinator.enterStreamedScene(sceneId);
  }

  enter(data = null) {
    // 父类仍负责 canvas/相机/输入与通用系统；Demo 初始化由协调器接手。
    super.enter(data);
    this.sanguoSceneLifecycleCoordinator.initializeEnteredRuntime();

    this.resourceScope?.track(() => {
      this._campfireService.dispose();
      if (this.context.services.worldReadyGate === this._worldReadyGate) {
        this.context.services.worldReadyGate = null;
      }
      this._worldReadyGate = null;
      this.effectZoneRenderer?.clear?.();
      this._terrains.length = 0;
      this.terrain = null;
      this._worldRegion = null;
      this._worldIndex = null;
      this.context.world.terrain = null;
      this.context.world.terrains = null;
      this.context.world.region = null;
      this.context.world.worldIndex = null;
      this.context.services.placements?.reset?.({ clearProjection: true, clearPending: true, clearSpawned: true });
      this._regionDynamicStates?.clear?.();
      this._pendingChunkDomainStates?.clear?.();
      this._worldStreamingRuntime?.dispose?.();
      this._detachWorldStreaming = null;
      this.worldStreamingManager = null;
      this.gameLoader = null;
      this.cityStateSummaryPanel = null;
      this._classConfirm = null;
      this._classSelectionBusy = false;
      this.rescueObjectiveView?.clear?.();
      this.irreversibleChoiceView?.close?.();
      this.cargoTransferView?.close?.();
      this._cargoTransferBusy = false;
      this._cargoTransferPendingOperation = null;
      this.rescueSystem = null;
      this.s10ConstructionCoordinator._disposeS10Structures();
      this._disposeAllSceneVehicles();
      this._constructionCheckpointBusy = false;
      this._s10StructureInteractionBusy = false;
      this.rescueObjectiveView = null;
      this.irreversibleChoiceView = null;
      this.s04RouteCoordinator = null;
      this._s04RescueBusy = false;
      this._s05RescueBusy = false;
      this._s04RouteBusy = false;
    });

    // 世界 offset 在 ProjectWorldIndex 构建成功后派生；这里不预写 Demo 尺寸或入口。

    // 地形实例在 _loadWorldTerrains 中动态创建
    this.terrain = null;
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
    this.context.services.worldReadyGate = this._worldReadyGate;
    // wait() 在 timeout/dispose 时会 reject；显式消费，避免未处理 rejection。
    this._worldReadyGate.wait().catch(() => {});
    this._sceneReady = false;
    this._terrainsLoaded = false;
    this._spawnApplied = false;
    this._pendingChunkDomainStates = new Map();
    this._regionDynamicStates = new Map();
    this._currentRegionIndex = -1;
    this._worldLoadResult = null;
    this._navigationProjection = new SceneNavigationProjection({
      getCurrentSceneId: () => this.currentSceneId,
      setCurrentSceneId: sceneId => { this.currentSceneId = sceneId; },
      getStoryState: () => this.gameLoader?.blackboard?.get?.('storyState') || null,
      setStoryState: storyState => this.gameLoader?.blackboard?.set?.('storyState', storyState),
      onSceneChanged: sceneId => this._s09AudioDirector?.syncScene?.(sceneId)
    });
    this.context.services.navigationProjection = this._navigationProjection;
    this._regionCoordinator = new RegionCoordinator({
      createSession: () => this._createWorldLoadSession(this.resourceScope),
      getCurrentSession: () => this._worldLoadSession,
      captureDraft: () => ({
        saveState: this.captureSaveState(),
        worldResult: this._worldLoadResult,
        regionIndex: this._currentRegionIndex
      }),
      validateTarget: context => this.sanguoWorldRuntimeCoordinator.validateRegionTarget(context),
      commitTarget: context => this.sanguoWorldRuntimeCoordinator.commitRegionTarget(context),
      restoreDraft: context => this.sanguoWorldRuntimeCoordinator.restoreRegionDraft(context)
    });

    const placements = new ScenePlacementRuntime({
      scope,
      entityFactory: this.entityFactory,
      entityStore: this.entityStore,
      aiSystem: this.aiSystem,
      assetManager: this.assetManager,
      getWorldPromise: () => this._worldLoadPromise,
      getLoadedChunks: () => this.worldStreamingManager?.getLoadedChunks?.() || new Map(),
      getRegistries: () => this.gameLoader?.registries || {},
      validatePlacementReferences: values => this.gameLoader?.validatePlacementReferences?.(values)
        || { ok: true, errors: [] },
      setValidationErrors: errors => {
        if (this.gameLoader) this.gameLoader.lastValidationErrors = errors;
      },
      getConditionRoot: key => this.gameLoader?.blackboard?.get?.(key),
      getCurrentSceneId: () => this.currentSceneId,
      getPlayer: () => this.playerEntity,
      getCamera: () => this.camera,
      consumeInitialPlayerSpawn: () => { this._initialPlayerSpawnPending = false; },
      getPlayerStartMode: () => this._playerStartMode,
      onCampfireSpawn: spawn => this._campfireService.setPosition(spawn),
      getCampfirePosition: () => this._campfireService.getPosition(),
      syncProjection: () => this._syncWorldStreamingProjection(),
      clearProjectionBindings: () => this._sceneTriggerBindings?.setBindings?.([]),
      getReadyGate: () => this._worldReadyGate,
      onProjectionReady: () => this._syncWorldReadyProjection(),
      onNpcImageError: scope?.guard(({ url }) => {
        console.warn('[DDScene] NPC 图集加载失败（将用占位）:', url);
      }),
      onSpawn: detail => this._placementCoordinator.handleSpawn(detail),
      onRemove: values => this._placementCoordinator.removeValues(values),
      logger: console
    });
    this.context.services.placements = placements;
    scope?.track(() => placements.dispose());
    this._chunkNavigator = new ChunkNavigator({
      getWorldIndex: () => this._worldLoadResult?.worldIndex || this._worldLoadSession?._lastResult?.worldIndex || null,
      getChunk: sceneId => this._worldLoadSession?.getChunk(sceneId),
      findSpawn: (sceneId, spawnRef) => this._worldLoadSession?.findSpawn(sceneId, spawnRef),
      getPlayer: () => this.playerEntity,
      getCamera: () => this.camera,
      prepareTarget: async ({ x, y }) => {
        if (!this.worldStreamingManager) {
          return { ok: false, errors: [{ code: 'streamingUnavailable', path: 'world', message: '世界流式加载尚未就绪' }] };
        }
        const result = await this.worldStreamingManager.update(x, y);
        if (result?.ok === false) return result;
        this._syncWorldStreamingProjection();
        const placementResult = await this.context.services.placements?.spawnLoadedChunks();
        if (placementResult?.ok === false) return placementResult;
        return { ok: true };
      },
      captureState: () => ({
        ...this._navigationProjection.capture(),
        worldStreamingState: cloneData(this.worldStreamingManager?.serialize?.())
      }),
      restoreState: snapshot => {
        if (!snapshot) return;
        if (snapshot.worldStreamingState && this.worldStreamingManager?.deserialize) {
          const restored = this.worldStreamingManager.deserialize(snapshot.worldStreamingState);
          if (restored?.ok === false) {
            throw new Error(restored.errors?.[0]?.message || '世界流式状态回滚失败');
          }
          this._syncWorldStreamingProjection();
        }
        this._navigationProjection.restore(snapshot);
      },
      onSceneEnter: async ({ sceneId, x, y }) => {
        this._navigationProjection.apply({ sceneId, projectStory: false });
        const placementResult = await this.context.services.placements?.spawnLoadedChunks();
        if (placementResult?.ok === false) {
          throw new Error(placementResult.errors?.[0]?.message || '地图块放置点生成失败');
        }
        const runtimeProjection = await this.sanguoSceneNavigationCoordinator.projectEntryRuntime(sceneId);
        if (runtimeProjection?.ok === false) {
          throw new Error(runtimeProjection.code || '地图块运行时投影失败');
        }
        const domainRestore = await this._restoreStreamedDomainState(sceneId);
        if (domainRestore?.ok === false) {
          throw new Error(domainRestore.errors?.[0]?.message || domainRestore.code || '区块领域状态恢复失败');
        }
        this._navigationProjection.apply({ sceneId });
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
    this._scenarioCommandService = new ScenarioCommandService({
      dialogueSystem: this.dialogueSystem,
      tutorialSystem: this.tutorialSystem,
      getChunkNavigator: () => this._chunkNavigator,
      getRegionCoordinator: () => this._regionCoordinator,
      getWorldIndex: () => this._worldLoadResult?.worldIndex || null,
      getCurrentRegionIndex: () => this._currentRegionIndex,
      getSaveGameService: () => this._saveGameService,
      getSnapshotManager: () => this.sceneRuntime?.snapshotManager || null
    });
    this.context.services.scenarioCommands = this._scenarioCommandService;
    const unsubscribeNavigationEvents = this.sceneRuntime?.notificationBus?.subscribe(async event => {
      if (event?.value?.type !== SCENARIO_COMMANDS.WORLD_TELEPORT) return;
      const outcome = event.value.payload?.value || {};
      const sceneId = outcome.sceneId || outcome.request?.sceneId || null;
      await this._forwardCommittedSceneEnter(sceneId);
    });
    if (unsubscribeNavigationEvents) this.resourceScope?.track(unsubscribeNavigationEvents);
    for (const commandType of Object.values(SCENARIO_COMMANDS)) {
      this.sceneRuntime.registerCommandHandler(commandType, this._scenarioCommandService);
    }
    this._canonicalStateTransactions = new CanonicalStateTransactionService({
      definitionRepository: {
        get: (kind, id) => this.gameLoader?.definitionRepository?.get?.(kind, id) || null
      },
      getBlackboard: () => this.gameLoader?.blackboard || null,
      getInventory: () => this.playerEntity?.getComponent?.('inventory') || null,
      inventoryTransactions: this.inventoryTransactions,
      getItem: itemId => this.gameLoader?.getRegistry?.('items')?.get?.(itemId) || null,
      tutorialComplete: id => this._tutorialFlow?.isCompleted?.(id) === true,
      executeScenarioCommand: (intentType, payload, command) => this._executeScenarioCommand(
        intentType,
        payload,
        `${command.operationId}:${intentType}`
      )
    });
    this.sceneRuntime.registerCommandHandler('state.transaction', this._canonicalStateTransactions);
    this.context.services.canonicalStateTransactions = this._canonicalStateTransactions;
    this._sanguoDomainFacade = new SanguoDomainCommandFacade(this);
    this._domainCommandService = new DomainCommandService({
      statePrefix: 'sanguo:command',
      ports: Object.fromEntries([
        'scenario.command', 'battle.command', 'rescue.command', 'construction.command',
        'vehicle.command', 'ending.command'
      ].map(commandType => [commandType, this._sanguoDomainFacade]))
    });
    this.context.services.domainCommands = this._domainCommandService;
    for (const commandType of ['scenario.command', 'battle.command', 'rescue.command', 'construction.command', 'vehicle.command', 'ending.command']) {
      this.sceneRuntime.registerCommandHandler(commandType, this._domainCommandService);
    }
    this._worldLoadPromise = this._worldLoadSession
      .load({ projectUrl: 'game.project.json', sceneIds: 'entry' })
      .then(async result => {
        const validated = this._validateWorldLoadResult(result);
        this._worldLoadResult = validated;
        this._worldIndex = validated.worldIndex;
        const entry = validated.worldIndex.getEntry();
        this.currentSceneId = entry.sceneId;
        this._currentRegionIndex = entry.regionIndex;
        this._prologueOffset = entry.offset;
        this._campfireService.setPosition(
          this._worldLoadSession.projector.project({ x: 350, y: 250 }, entry.offset)
        );
        await this._initializeWorldStreaming(validated);
        return validated;
      });
    this._loadWorldTerrains();

    // 火焰帧图在 Manifest 注册完成后按稳定资源 ID 注入框架火堆服务。
    // 火堆初始熄灭：由数据驱动的 interact 触发器点燃（靠近按 E），或 timer 自燃兜底

    // 由框架 placement runtime 等待世界加载、投影出生点并解析 ready gate。
    void this.context.services.placements?.loadProjection({
      consumePlayerSpawn: this._initialPlayerSpawnPending === true
    });

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

    // Demo 环境、时间、职业 UI 与领域入口通知由协调器处理；输入和转场控制仍留在 Scene 顶层。
    this.sanguoSceneLifecycleCoordinator.updateBeforeBase(deltaTime);

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

    // 基类完成通用帧后，再由 Demo coordinator 驱动营建、载具、救援、结局和领域观察。
    this.sanguoSceneLifecycleCoordinator.updateAfterBase(deltaTime);
  }

  /** 波次事件由放置点 coordinator 扫描分组，Scene 仅注入 trigger 与死亡谓词。 */
  _checkWaveEvents() {
    if (!this.gameLoader) return 0;
    this._clearedGroups ||= new Set();
    return this._placementCoordinator.checkWaveEvents({
      clearedGroups: this._clearedGroups,
      isEntityDead: entity => this._isEntityDead(entity),
      triggerSystem: this.gameLoader.triggerSystem
    });
  }

  /** S14 gunner 指针意图和 S01 教学许可均由 Demo coordinator 投影。 */
  canPerformBasicAttack() {
    return this.sanguoSceneCommandCoordinator.canPerformBasicAttack();
  }

  /** 将所有成功采集原子投影为结局隐藏输入，再组合场景专属政策。 */
  prepareGatheringSettlement(context = {}) {
    const scenePolicy = this._prepareSceneGatheringSettlement(context);
    if (scenePolicy?.ok === false || scenePolicy?.idempotent === true) return scenePolicy;
    const { operationId, node } = context;
    const resourceType = node?.resourceType;
    if (!operationId || !['wood', 'iron', 'food', 'herb'].includes(resourceType)) return scenePolicy;
    const blackboard = this.gameLoader?.blackboard;
    if (!blackboard) return { ok: false, code: 'storyStateUnavailable' };
    const storyBefore = cloneData(blackboard.get('storyState') || {});
    const applied = storyBefore.endingInputs?.gatheringOperations || [];
    if (applied.includes(operationId)) return { ok: true, idempotent: true };
    return {
      ok: true,
      commit: details => {
        const sceneResult = scenePolicy?.commit?.(details);
        if (sceneResult === false || sceneResult?.ok === false) {
          throw new Error(sceneResult?.code || 'sceneGatheringPolicyRejected');
        }
        const current = cloneData(blackboard.get('storyState') || storyBefore);
        const endingInputs = cloneData(current.endingInputs || {});
        const cumulative = cloneData(endingInputs.cumulativeGathering || { wood: 0, iron: 0, food: 0, herb: 0 });
        cumulative[resourceType] = Math.max(0, Math.floor(Number(cumulative[resourceType]) || 0))
          + Math.max(0, Math.floor(Number(details?.accepted) || 0));
        endingInputs.cumulativeGathering = cumulative;
        endingInputs.gatheringOperations = [...new Set([...(endingInputs.gatheringOperations || []), operationId])].slice(-512);
        blackboard.set('storyState', { ...current, endingInputs });
        return { ok: true };
      },
      rollback: () => {
        try { scenePolicy?.rollback?.(); } finally { blackboard.set('storyState', storyBefore); }
      }
    };
  }

  /** 场景只按当前 canonical 区块路由采集政策；历史规则由对应 coordinator 持有。 */
  _prepareSceneGatheringSettlement(context = {}) {
    return this.sanguoSceneCommandCoordinator.prepareGatheringSettlement(context);
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
      void this.s05SceneCoordinator._finalizeS05MineCollapse(data);
      return;
    }
    if (event === 'completed' && this.s09RefugeeCoordinator.hasUnauthorizedHarvest(data.operationId)) {
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
    if (event === 'completed') this._tutorialFlow.notify('gatheringCompleted', data);
  }

  /**
   * ① 渐进提示事件源：
   *   - playerMoved：玩家离开出生点一定距离 → fire('playerMoved')（一次）
   *   - panelOpen：背包/属性面板打开 → fire('panelOpen', {panel:'inventory'|'stats'})
   * @private
   */
  _checkTutorialEventSources() {
    if (!this.gameLoader) return;
    const triggerSystem = this.gameLoader.triggerSystem;
    this._tutorialFlow.observeEventSources({
      position: this.playerEntity?.getComponent?.('transform')?.position || null,
      panels: {
        inventory: this.inventoryPanel,
        stats: this.playerInfoPanel
      },
      onMovementComplete: () => triggerSystem.fire('playerMoved', {}),
      onPanelVisible: ({ id }) => triggerSystem.fire('panelOpen', { panel: id })
    });
  }

  /** 仅转发已由 Authority 提交的 world.teleport 应用通知，不参与导航事实提交。 */
  async _forwardCommittedSceneEnter(sceneId) {
    if (!sceneId || !this.gameLoader?.triggerSystem?.fire) return false;
    await this.gameLoader.triggerSystem.fire('sceneEnter', { sceneId });
    return true;
  }

  async _executeScenarioCommand(intentType, payload = {}, operationId = null) {
    const gateway = this.sceneRuntime?.commandGateway;
    const actorRef = this.playerEntity;
    if (!gateway || !actorRef?.id) {
      return { ok: false, code: 'scenarioCommandUnavailable', error: { message: '场景命令端口不可用' } };
    }
    const normalizedPayload = intentType === SCENARIO_COMMANDS.WORLD_TELEPORT
      ? { ...payload, sceneId: payload.sceneId || payload.scene }
      : { ...payload };
    const generatedOperationId = operationId || `scene:${intentType}:${actorRef.id}:${++this._scenarioCommandSequence}`;
    return gateway.execute({
      intentType,
      actorRef,
      operationId: generatedOperationId,
      payload: normalizedPayload
    });
  }

  /**
   * 大地图内传送兼容入口：仍由 ChunkNavigator/RegionCoordinator 完成，
   * 但所有调用统一经 world.teleport CommandGateway。
   * @param {Object} p - { scene, spawnRef, x, y, transition, region }
   * @returns {Promise<Object>}
   */
  async teleportToChunk(p = {}) {
    const result = await this._executeScenarioCommand(
      SCENARIO_COMMANDS.WORLD_TELEPORT,
      p,
      p.operationId || null
    );
    if (!result?.ok) {
      return {
        ok: false,
        cancelled: true,
        code: result?.code || 'worldTeleportRejected',
        errors: result?.error ? [{ code: result.code || 'worldTeleportRejected', message: result.error.message }] : []
      };
    }
    return result.value || { ok: true };
  }

  _findRegionIndexForScene(sceneId) {
    return this._worldLoadResult?.worldIndex?.findScene?.(sceneId)?.regionIndex ?? -1;
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

  async travelToRegion({ sceneId, spawnRef = 'player' } = {}) {
    const result = await this.teleportToChunk({ scene: sceneId, spawnRef });
    if (!result?.ok) {
      const message = result?.errors?.[0]?.message || `无法进入 ${sceneId || '目标区域'}`;
      this._showScreenTip(message, { title: '大区切换失败' });
      return result || { ok: false, errors: [{ code: 'regionCoordinatorUnavailable', path: 'region', message }] };
    }
    return result;
  }

  /** 跨 Region 的 Demo 状态校验、提交与回滚由世界协调器拥有；保留兼容入口。 */
  async _validateRegionTarget(context) {
    return this.sanguoWorldRuntimeCoordinator.validateRegionTarget(context);
  }

  _extractRegionDynamicState(sceneState = {}) {
    return this.sanguoWorldRuntimeCoordinator.extractRegionDynamicState(sceneState);
  }

  _clearRegionRuntime(result = this._worldLoadResult) {
    return this.sanguoWorldRuntimeCoordinator.clearRegionRuntime(result);
  }

  async _commitRegionTarget(context) {
    return this.sanguoWorldRuntimeCoordinator.commitRegionTarget(context);
  }

  async _restoreRegionDraft(context) {
    return this.sanguoWorldRuntimeCoordinator.restoreRegionDraft(context);
  }

  getDeathDropPresentation() {
    return {
      imageId: 'world.loot.deathDrop',
      assetId: 'world.loot.deathDrop',
      width: 48,
      height: 40,
      name: '遗失物资'
    };
  }

  resolvePlayerRespawnPosition() {
    return this._s01s02Coordinator.resolveRespawnPosition()
      || super.resolvePlayerRespawnPosition();
  }

  /** Demo 专属运行状态由显式 coordinator 组合；玩家/任务/黑板仍由 BaseGameScene 统一保存。 */
  captureSceneSaveState() {
    return this.sanguoSceneStateFlow.captureSceneSaveState();
  }

  restoreSceneSaveState(data = {}) {
    return this.sanguoSceneStateFlow.restoreSceneSaveState(data);
  }

  /** 实际拾取提交后的稳定 Scene 入口；S01–S14 状态映射由 Demo coordinator 拥有。 */
  onWorldItemPicked(item) {
    return this.sanguoSceneStateFlow.handleWorldItemPicked(item);
  }

  /**
   * NPC 忙碌台词的纯表现 adapter；节流和可交互判定由 SceneNpcInteractionFlow 统一拥有。
   * @private
   */
  _presentNpcIdleText(npc, text) {
    const transform = npc?.getComponent?.('transform');
    if (transform && this.floatingTextManager) {
      const sprite = npc.getComponent?.('sprite');
      const height = (sprite?.height || 48) * (sprite?.scale || 1);
      this.floatingTextManager.addText(
        transform.position.x,
        transform.position.y - height - 20,
        text,
        '#cccccc'
      );
    }
    this.notificationSystem?.addNotification?.(text, 'info');
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
          tutorialSystem: this.tutorialSystem,
          questSystem: this.questSystem,
          commandGateway: this.sceneRuntime?.commandGateway || null,
          combatSystem: this.combatSystem,
          sceneManager: eng ? eng.sceneManager : (this.sceneManager || null),
          audioManager: this.audioManager || (eng && eng.audioManager) || null,
          floatingText: this.floatingTextManager,
          scene: this,
          sceneDiagnostics: this._diagnostics
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
        registerActions: (trig, gameLoader) => this._registerGameLoaderActions(trig, gameLoader),
        onReady: async (gameLoader, trig) => {
          this.gameLoader = gameLoader;
          this.applyRuntimeConfig(gameLoader.runtimeConfigSnapshot);
          const offTriggerLog = trig.on((evt, t) => {
            if (evt === 'triggerStart') console.log('[DDScene][Trigger] 执行:', t.id, t.do);
          });
          this.resourceScope?.track(offTriggerLog);

          if (!this.assetManager?.registerManifest) {
            throw new Error('场景 AssetManager 不支持稳定资源 Manifest');
          }
          const manifestResult = this.assetManager.registerManifest(gameLoader.project.assetManifest);
          if (manifestResult.queued > 0) await this.assetManager.loadAll();
          const fireAsset = this.assetManager.resolveManifestAsset?.('vfx.freePixel.fire', '2d');
          this._campfireService.setFireImage(
            this.assetManager.getAsset?.(fireAsset?.key || 'vfx.freePixel.fire') || null
          );
          this.entityRenderer2D?.clearCaches?.();
          const currentClass = this.playerEntity?.getComponent?.('stats')?.class || this.playerEntity?.class;
          this._syncPlayerClassAppearance(currentClass);

          // TutorialDefinition 已由 GameLoader 原子发布给唯一 TutorialSystem。
          this._configureSharedClassEffects(gameLoader);
          await this._installBattleFlow(gameLoader);
          this._installProgressionUI(gameLoader);
        }
      });
      // initialize() 在首次 await 前已创建 loader；立即保留旧字段投影。
      this.gameLoader = bridge.loader;
      this._gameLoaderReady = ready.then(this.resourceScope.guard(async gameLoader => {
        if (this._gameLoaderBridge !== bridge || bridge.loader !== gameLoader) return gameLoader;
        await this._worldLoadPromise;
        if (!this.currentSceneId) throw new Error('ProjectWorldIndex 未提供有效启动入口');
        gameLoader.triggerSystem.fire('sceneEnter', { sceneId: this.currentSceneId });
        const placementRuntime = this.context.services.placements;
        const placementValidation = placementRuntime?.validateProjection?.()
          || { ok: false, errors: [{ code: 'placementRuntimeUnavailable', path: 'placements', message: '场景放置运行时尚未就绪' }] };
        if (!placementValidation.ok) {
          throw gameLoader.createValidationError(placementValidation.errors);
        }
        this.gameLoader = gameLoader;
        const placementResult = await placementRuntime.spawnLoadedChunks();
        if (placementResult?.ok === false) {
          throw gameLoader.createValidationError(placementResult.errors || []);
        }
        const storyDay = gameLoader.blackboard?.get?.('storyState')?.currentDay;
        this.timeSystem?.setCurrentDay?.(storyDay);
        this._sceneTriggerBindings?.setTriggerSystem(gameLoader.triggerSystem);
        if (this._progressionBootstrap?.isNewGame) this._tutorialFlow.showNext();
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

  /** 将 Demo 配置与历史策略注入框架共享玩法装配器。 */
  _configureSharedClassEffects(gameLoader) {
    const resolver = gameLoader?.progressionSystem?.effectResolver;
    if (!resolver) return false;
    const proficiencyConfig = gameLoader?.project?.progression?.proficiency || {};
    const constructionConfig = gameLoader?.project?.construction || {};
    const constructionSites = new Map((constructionConfig.sites || []).map(site => [site.id, site]));
    const itemRegistry = gameLoader?.getRegistry?.('items');
    const trigger = (name, event, data) => (
      this.gameLoader?.triggerSystem?.fire?.(`${name}.${event}`, cloneData(data))
    );

    const sharedPlan = this._gameplaySystemAssembler.configureSharedSystems({
      effectResolver: resolver,
      skillRegistry: gameLoader.skillRegistry,
      proficiency: {
        config: proficiencyConfig,
        onEvent: (event, data) => {
          if (event !== 'levelUp') return;
          const definition = this.proficiencySystem?.getDefinition?.(data.type);
          this.notificationSystem?.addNotification?.(
            `${definition?.name || data.type}熟练度提升至 ${data.level} 级`,
            'success'
          );
        }
      },
      inventoryEffects: {
        getEntityId: () => this.playerEntity?.id || null,
        baseResourceCapacity: 120
      },
      gathering: {
        settlementPolicy: context => this.prepareGatheringSettlement(context)
      },
      construction: {
        definitions: constructionConfig.definitions || [],
        maxOperations: constructionConfig.maxOperations,
        requiredProficiencyType: 'construction',
        itemResolver: itemId => cloneData(itemRegistry?.get?.(itemId) || null),
        createCheckpoint: checkpoint => this.s10ConstructionCoordinator._checkpointConstructionRepair(checkpoint),
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
      },
      vehicles: {
        resolveEntity: id => this.entityStore?.all?.find?.(entity => entity?.id === id) || null,
        getInventoryOwnerId: inventory => this._resolveVehicleInventoryOwnerId(inventory),
        createCheckpoint: checkpoint => this._executeScenarioCommand(
          SCENARIO_COMMANDS.CHECKPOINT_REQUEST,
          {
            reason: 'checkpoint',
            checkpointId: checkpoint.checkpointId,
            sceneId: this.currentSceneId
          },
          checkpoint.operationId || null
        ),
        onVehicleEvent: (event, data) => trigger('vehicle', event, data),
        onLogisticsEvent: (event, data) => trigger('vehicleLogistics', event, data),
        onMannedStructureEvent: (event, data) => trigger('mannedStructure', event, data)
      }
    });
    if (!sharedPlan) return false;
    this.sceneRuntime.applyRegistrationPlan(sharedPlan);

    this.s10ConstructionCoordinator._ensureS10StructureEntities();
    this._ensureSceneVehicleEntities(this.currentSceneId);
    this._syncUnlockedClassSkills();
    return true;
  }

  /** 由显式 Demo coordinator 装配战役定义、通用运行时与历史策略。 */
  async _installBattleFlow(gameLoader) {
    return this.s03s14BattleCoordinator.initialize(gameLoader);
  }

  /** 从当前磁盘场景投影中解析最近的可攀爬面；目标坐标只应用一次 chunk offset。 */
  /**
   * 在没有更高优先级空间 trigger 提示时显示攀爬操作；文案保留 InputHints token，
   * 由 SceneHintPresenter 按当前输入设备格式化。
   * @private
   */
  _updateClimbPrompt() {
    if (this._sceneTriggerBindings?.hasActivePrompt?.()) return;
    const player = this.playerEntity;
    const canClimb = !!player && this.abilitySystem?.isUnlocked?.(player, 'climb') === true;
    const target = canClimb ? this.resolveClimbTarget({ entity: player }) : null;
    if (target?.promptTemplate) this.showHint(target.promptTemplate, '攀爬');
    else this.hideHint();
  }

  resolveClimbTarget({ entity } = {}) {
    return this._worldQuery.resolveClimbTarget({ entity });
  }

  _getSceneVehicleDefinitions(sceneId = this.currentSceneId) {
    return this._sceneVehicleRuntime.getDefinitions(sceneId);
  }

  _ensureSceneVehicleEntities(sceneId = this.currentSceneId) {
    return this._sceneVehicleRuntime.ensure(sceneId);
  }

  _disposeSceneVehicles(sceneId, definitionId = null) {
    return this._sceneVehicleRuntime.disposeScene(sceneId, definitionId);
  }

  _disposeAllSceneVehicles() {
    return this._sceneVehicleRuntime.disposeAll();
  }

  _resolveVehicleInventoryOwnerId(inventory) {
    return this._sceneVehicleRuntime.resolveInventoryOwnerId(inventory);
  }

  _captureSceneVehicleStates(sceneId = this.currentSceneId) {
    return this._sceneVehicleRuntime.capture(sceneId);
  }

  _validateSceneVehicleStates(sceneId, states, logisticsState = null) {
    return this._sceneVehicleRuntime.validate(sceneId, states, logisticsState);
  }

  _restoreSceneVehicleStates(sceneId, states = [], logisticsState = null) {
    return this._sceneVehicleRuntime.restore(sceneId, states, logisticsState);
  }

  // S14 编排兼容入口；状态所有权已经统一到 scene vehicle store。
  _getS14VehicleDefinitions() { return this._getSceneVehicleDefinitions('S14'); }
  _ensureS14VehicleEntities() { return this._ensureSceneVehicleEntities('S14'); }
  _disposeS14Vehicles() { return this._disposeSceneVehicles('S14'); }
  _captureS14VehicleStates() { return this._captureSceneVehicleStates('S14'); }
  _validateS14VehicleStates(states, logisticsState = null) {
    return this._validateSceneVehicleStates('S14', states, logisticsState);
  }
  _restoreS14VehicleStates(states = [], logisticsState = null) {
    return this._restoreSceneVehicleStates('S14', states, logisticsState);
  }

  async _handleIrreversibleChoiceCommand(command = {}) {
    return this.sanguoSceneCommandCoordinator.handleIrreversibleChoice(command);
  }


  _ensureClassSystem() {
    const system = this.context?.systems?.classes
      || this._gameplaySystemAssembler?.getSharedSystems?.()?.classSystem
      || null;
    if (system) this.classSystem = system;
    return system;
  }

  /** 把 EffectResolver 的技能解锁投影到兼容快捷栏；定义本身仍由 SkillRegistry 拥有。 */
  _syncUnlockedClassSkills() {
    const player = this.playerEntity;
    const combat = player?.getComponent?.('combat');
    const resolver = this.gameLoader?.progressionSystem?.effectResolver;
    const registry = this.gameLoader?.skillRegistry;
    if (!combat || !resolver || !registry || !player?.id) return false;
    const canonicalIds = new Set(['cleave', 'arrow_shot', 'talisman_water', 'gathering_puppet', 'power_jump']);
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
    const context = this.s09RefugeeCoordinator._getS09CityContext();
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

  /** Scene 只装配通用空间 action；所有业务触发器均由 descriptor command 执行。 */
  _registerGameLoaderActions(triggerSystem) {
    return registerSceneTriggerActions(triggerSystem, {
      spawnPlacements: selector => this.context.services.placements?.spawn(selector),
      weatherSystem: this.weatherSystem,
      timeSystem: this.timeSystem,
      logger: console
    });
  }

  /** 职业事实到玩家基础动画外观挂点的唯一投影入口。 */
  _syncPlayerClassAppearance(classId = null) {
    return this._playerFactory?.applyClassAppearance?.(this, this.playerEntity, classId) === true;
  }

  /** S09 职业确认表现由专属 coordinator 拥有；保留触发器兼容入口。 */
  _showClassConfirmation(payload = {}) {
    return this.s09ClassSelectionCoordinator.showConfirmation(payload);
  }

  _classModalLayout() {
    return this.s09ClassSelectionCoordinator.getConfirmationLayout();
  }

  _updateClassConfirmationHover() {
    return this.s09ClassSelectionCoordinator.updateConfirmationHover();
  }

  /** SceneInputFlow 的 MODAL_UI 出口；弹窗存在时无条件吞掉世界输入。 */
  handleModalInput({ inputManager, gamepad } = {}) {
    if (this.endingPresentationView?.visible) {
      return this.endingPresentationView.handleInput(
        this.s11s14SceneCoordinator._createEndingInputContext({ inputManager, gamepad })
      );
    }
    if (this.cargoTransferView?.visible) {
      return this.cargoTransferView.handleInput({
        inputManager,
        gamepad,
        viewWidth: this.logicalWidth,
        viewHeight: this.logicalHeight
      });
    }
    if (this.s03s14BattleCoordinator.isInputLayerVisible('result')) {
      return this.s03s14BattleCoordinator.handleInputLayer('result', {
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
    if (this.s03s14BattleCoordinator.isInputLayerVisible('mode')) {
      return this.s03s14BattleCoordinator.handleInputLayer('mode', {
        inputManager,
        gamepad,
        viewWidth: this.logicalWidth,
        viewHeight: this.logicalHeight
      });
    }
    return this.s09ClassSelectionCoordinator.handleConfirmationInput({ inputManager, gamepad });
  }

  /** 保留旧 update 调用点，只更新 hover；点击和键位统一由 SceneInputFlow 处理。 */
  _updateClassConfirmation() {
    this._updateClassConfirmationHover();
  }

  async _confirmClassSelection(classId) {
    const result = await this._executeScenarioCommand('scenario.command', {
      operation: 'class.select',
      classId
    }, `class-select:${this.playerEntity?.id || 'unknown'}:${classId}`);
    if (!result?.ok) return false;
    this._classConfirm = null;
    this._presentClassSelectionCommitted(result.value?.classType || classId);
    return true;
  }

  _presentClassSelectionCommitted(classType) {
    this._syncPlayerClassAppearance(classType);
    this._s09AudioDirector?.playFeedback?.('classSelected');
    const className = ClassNames[classType] || classType;
    this.notificationSystem?.addNotification?.(`你选择了${className}，初始能力和装备已发放`, 'success');
    this.gameLoader?.triggerSystem?.fire('classSelected', { class: classType, className });
    console.log('%c[DDScene] S09 职业检查点已提交:', 'color:#4CAF50', className);
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
   * 三国运行时配置钩子：世界/流式投影已由父类提交，历史配置消费者仅在此装配。
   */
  configureWorldRuntimeFromLoad(_result) {
    // 所有 runtime consumer 先在 shadow 中解析；全部成功后一次替换。
    const weatherView = this.gameLoader?.getConfigConsumer?.('runtime.weather');
    const weatherConfig = weatherView?.get('system.weather');
    if (!weatherConfig) throw new Error('runtime weather consumer missing');
    const nextWeatherSystem = new WeatherSystem(weatherConfig);
    const nextTimeSystem = new TimeSystem(this.gameLoader?.runtimeConfigSnapshot?.system?.time || {});

    const sceneData = this._worldLoadSession?.getSceneData?.(this.currentSceneId);
    const sceneConsumption = sceneData
      ? this.gameLoader?.configConsumptionRegistry?.buildSources?.({ scene: sceneData }, {
        revision: this.gameLoader?.runtimeConfigSnapshot?.definitionRevision || 0,
        requirements: sceneData?.gameplay?.campfire
          ? { paths: [{ pathPattern: 'scene.gameplay.campfire.**', required: true }] }
          : null
      })
      : null;
    const campfireView = sceneConsumption?.getConsumer?.('scene.gameplay');
    const campfireConfig = campfireView?.get('scene.gameplay.campfire');
    if (campfireConfig) {
      const validationService = new SceneCampfireService({ configView: campfireConfig });
      validationService.dispose();
    }

    this.weatherSystem = nextWeatherSystem;
    this.timeSystem = nextTimeSystem;
    this._sceneConsumptionSnapshot = sceneConsumption;
    if (campfireConfig) this._campfireService.configure(campfireConfig);
  }

  /** 三国内战与剧情界面的最高层表现；领域状态仅以只读快照绘制。 */
  renderPostPipeline(ctx) {
    this.context.services.diagnostics?.renderCollisionShapes(ctx, {
      enabled: this.debugShowCollisionPolygons,
      camera: this.camera,
      terrains: this._terrains,
      label: 'DDScene'
    });
    this._renderTeleportFade(ctx);
    // 战中 HUD 与救援 HUD 只绘制领域系统的不可变快照。
    this.s03s14BattleCoordinator.renderLayer('hud', ctx, this.logicalWidth, this.logicalHeight);
    this.rescueObjectiveView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
    // 职业确认窗口（最上层，半透明遮罩 + 面板）
    this._renderClassConfirmation(ctx);
    // 战役模式确认优先于其他场景弹窗，且不直接修改领域状态。
    this.s03s14BattleCoordinator.renderLayer('mode', ctx, this.logicalWidth, this.logicalHeight);
    // 路线选择只发命令；互斥、幂等和 checkpoint 由场景领域事务拥有。
    this.irreversibleChoiceView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
    // 战果面板最后绘制并吞掉全部世界输入，关闭只影响 UI 可见性。
    this.s03s14BattleCoordinator.renderLayer('result', ctx, this.logicalWidth, this.logicalHeight);
    // 货舱面板只发转移命令，实际库存与货舱事务由 VehicleLogisticsSystem 提交。
    this.cargoTransferView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
    // 终局演出是最高层只读表现，仅通过命令请求宿主动作。
    this.endingPresentationView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
  }

}

export default DataDrivenPrologueScene;
