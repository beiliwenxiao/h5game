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
import { Scene1Terrain } from './Scene1Terrain.js';
import { SceneStreamingRuntime } from '../../../src/core/scene/SceneStreamingRuntime.js';
import { RegionCoordinator } from '../../../src/core/scene/RegionCoordinator.js';
import { WorldReadyGate } from '../../../src/core/scene/WorldReadyGate.js';
import { ChunkNavigator } from '../../../src/core/scene/ChunkNavigator.js';
import { SceneNavigationProjection } from '../../../src/core/scene/SceneNavigationProjection.js';
import { SceneWorldQuery } from '../../../src/core/scene/SceneWorldQuery.js';
import { ScenePickedObjectObserver } from '../../../src/core/scene/ScenePickedObjectObserver.js';
import { ScenePlacementRuntime } from '../../../src/core/scene/ScenePlacementRuntime.js';
import { SceneVehicleRuntime } from '../../../src/core/scene/SceneVehicleRuntime.js';
import { SceneCityWarStateBridge } from '../../../src/core/scene/SceneCityWarStateBridge.js';
import { ScenarioCommandService, SCENARIO_COMMANDS } from '../../../src/systems/ScenarioCommandService.js';
import { DomainCommandService } from '../../../src/systems/DomainCommandService.js';
import { CanonicalStateTransactionService } from '../../../src/systems/CanonicalStateTransactionService.js';
import { SanguoDomainCommandFacade } from '../systems/SanguoDomainCommandFacade.js';
import { WeatherSystem } from '../../../src/systems/WeatherSystem.js';
import { TimeSystem } from '../../../src/systems/TimeSystem.js';
import { CargoTransferView } from '../../../src/ui/CargoTransferView.js';
import { SanguoProgressionPresentationCoordinator } from '../systems/SanguoProgressionPresentationCoordinator.js';
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
import { S09RefugeeCoordinator } from '../systems/S09RefugeeFlow.js';
import { S09ClassSelectionCoordinator } from '../systems/S09ClassSelectionFlow.js';
import { S10ConstructionCoordinator } from '../systems/S10ConstructionFlow.js';
import { S10StoryCoordinator } from '../systems/S10StoryFlow.js';
import { S11S14SceneCoordinator } from '../systems/S11S14SceneFlow.js';
import { SanguoSceneNavigationCoordinator } from '../systems/SanguoSceneNavigationFlow.js';
import { SanguoSceneCommandCoordinator } from '../systems/SanguoSceneCommandFlow.js';
import { S03S14BattleCoordinator } from '../systems/S03S14BattleCoordinator.js';
import { SanguoSceneStateFlow } from '../systems/SanguoSceneStateFlow.js';
import { SanguoWorldRuntimeCoordinator } from '../systems/SanguoWorldRuntimeCoordinator.js';
import { SanguoGameLoaderCoordinator } from '../systems/SanguoGameLoaderCoordinator.js';

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
    this.sanguoProgressionPresentationCoordinator = new SanguoProgressionPresentationCoordinator(this);
    this.sanguoGameLoaderCoordinator = new SanguoGameLoaderCoordinator(this);
    Object.assign(this.context.services, {
      sanguoSceneState: this.sanguoSceneStateFlow,
      sanguoSceneLifecycle: this.sanguoSceneLifecycleCoordinator,
      sanguoProgressionPresentation: this.sanguoProgressionPresentationCoordinator,
      sanguoGameLoader: this.sanguoGameLoaderCoordinator
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

  /** 世界入口校验由 Demo 世界协调器拥有；WorldReadyGate 时机仍由 Scene 管理。 */
  _validateWorldLoadResult(result) {
    return this.sanguoWorldRuntimeCoordinator.validateWorldLoadResult(result);
  }

  /** canonical 磁盘会话由 Demo 世界协调器创建；保留 Scene 兼容入口。 */
  _createWorldLoadSession(scope = this.resourceScope) {
    return this.sanguoWorldRuntimeCoordinator.createWorldLoadSession(scope);
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

    this.resourceScope?.track(() => this.sanguoSceneLifecycleCoordinator.disposeEnteredRuntime());

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
    if (this.isPaused) {
      this.discardPausedInput?.();
      return;
    }

    // 顶层输入流程必须在本场景读取 E/N/反引号之前启动；同帧 super.update 会被守卫跳过。
    this._beginInputFrame(deltaTime);

    // 必须在任何提前返回或 inputManager.update() 之前读取，否则本帧按下状态会被清空。
    const debugPanelKeyPressed = !!this.inputManager?.isKeyPressed?.('`');
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

    // 轮盘已在帧首处理 LB 输入；冻结剧情与环境更新，但保留调试面板和后续帧的手柄轮询。
    if (this.isSkillWheelWorldPaused) {
      this._inputFlow?.flush?.();
      return;
    }

    // 传送淡黑效果更新
    this._updateTeleportFade(deltaTime);

    if (this.isTransitioning &&
        (this.transitionPhase === 'show_text' || this.transitionPhase === 'switch_scene')) {
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

    // 通用可玩管线（移动/战斗/相机含 postCameraUpdate/渲染系统/粒子等）
    // 注：基类 super.update 内部已驱动 this.gameLoader.update（timer 触发器），此处无需重复调
    super.update(deltaTime);

    // 基类完成通用帧后，再由 Demo coordinator 驱动营建、载具、救援、结局和领域观察。
    this.sanguoSceneLifecycleCoordinator.updateAfterBase(deltaTime);
  }

  /** 波次事件由放置点 coordinator 扫描分组，Scene 仅注入 trigger 与死亡谓词。 */
  _checkWaveEvents() {
    return this.sanguoSceneLifecycleCoordinator.observeWaveEvents();
  }

  /** S14 gunner 指针意图和 S01 教学许可均由 Demo coordinator 投影。 */
  canPerformBasicAttack() {
    return this.sanguoSceneCommandCoordinator.canPerformBasicAttack();
  }

  /** 采集的场景政策与结局隐藏输入均由 Demo 命令协调器组合。 */
  prepareGatheringSettlement(context = {}) {
    return this.sanguoSceneCommandCoordinator.prepareGatheringSettlement(context);
  }

  /** 当前 canonical 区块的采集政策由 Demo 命令协调器路由；保留兼容入口。 */
  _prepareSceneGatheringSettlement(context = {}) {
    return this.sanguoSceneCommandCoordinator.prepareSceneGatheringSettlement(context);
  }

  _grantGatheringProficiency(data = {}) {
    return this.sanguoSceneCommandCoordinator.grantGatheringProficiency(data);
  }

  /** 框架采集回调入口；S01–S14 领域反馈由命令 coordinator 路由。 */
  onGatheringEvent(event, data = {}) {
    if (!this.sanguoSceneCommandCoordinator.shouldForwardGatheringEvent(event, data)) return;
    super.onGatheringEvent(event, data);
    this.sanguoSceneCommandCoordinator.handleGatheringEvent(event, data);
  }

  /**
   * ① 渐进提示事件源：
   *   - playerMoved：玩家离开出生点一定距离 → fire('playerMoved')（一次）
   *   - panelOpen：背包/属性面板打开 → fire('panelOpen', {panel:'inventory'|'stats'})
   * @private
   */
  _checkTutorialEventSources() {
    return this.sanguoSceneLifecycleCoordinator.observeTutorialEventSources();
  }

  /** 已提交导航后的内容通知由 Demo 世界协调器拥有。 */
  async _forwardCommittedSceneEnter(sceneId) {
    return this.sanguoWorldRuntimeCoordinator.forwardCommittedSceneEnter(sceneId);
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

  /** 跨 Region 存档预准备由世界协调器拥有；保留 BaseGameScene 调用的兼容入口。 */
  _findRegionIndexForScene(sceneId) {
    return this.sanguoWorldRuntimeCoordinator.findRegionIndexForScene(sceneId);
  }

  async prepareRestoreRegion(saveState = {}) {
    return this.sanguoWorldRuntimeCoordinator.prepareRestoreRegion(saveState);
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
    return this.sanguoWorldRuntimeCoordinator.getDeathDropPresentation();
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
    return this.sanguoSceneLifecycleCoordinator.presentNpcIdleText(npc, text);
  }

  /** 框架装备回调入口；已提交的内容 trigger 映射由 Demo 状态协调器拥有。 */
  onEquipmentChanged(messages, info = null) {
    super.onEquipmentChanged(messages, info);
    return this.sanguoSceneStateFlow.handleEquipmentChanged(info);
  }

  /** GameProject 装配由 Demo coordinator 拥有；保留场景兼容入口。 */
  _initGameLoader() {
    return this.sanguoGameLoaderCoordinator.initializeGameLoader();
  }

  /** Demo 共享玩法注入由 GameLoader coordinator 拥有；保留兼容入口。 */
  _configureSharedClassEffects(gameLoader) {
    return this.sanguoGameLoaderCoordinator.configureSharedClassEffects(gameLoader);
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
    return this.sanguoSceneLifecycleCoordinator.updateClimbPrompt();
  }

  resolveClimbTarget({ entity } = {}) {
    return this._worldQuery.resolveClimbTarget({ entity });
  }

  /** SceneVehicleRuntime 的 Demo 世界编排归属 SanguoWorldRuntimeCoordinator；保留兼容入口。 */
  _getSceneVehicleDefinitions(sceneId = this.currentSceneId) {
    return this.sanguoWorldRuntimeCoordinator.getSceneVehicleDefinitions(sceneId);
  }

  _ensureSceneVehicleEntities(sceneId = this.currentSceneId) {
    return this.sanguoWorldRuntimeCoordinator.ensureSceneVehicleEntities(sceneId);
  }

  _disposeSceneVehicles(sceneId, definitionId = null) {
    return this.sanguoWorldRuntimeCoordinator.disposeSceneVehicles(sceneId, definitionId);
  }

  _disposeAllSceneVehicles() {
    return this.sanguoWorldRuntimeCoordinator.disposeAllSceneVehicles();
  }

  _resolveVehicleInventoryOwnerId(inventory) {
    return this.sanguoWorldRuntimeCoordinator.resolveVehicleInventoryOwnerId(inventory);
  }

  _captureSceneVehicleStates(sceneId = this.currentSceneId) {
    return this.sanguoWorldRuntimeCoordinator.captureSceneVehicleStates(sceneId);
  }

  _validateSceneVehicleStates(sceneId, states, logisticsState = null) {
    return this.sanguoWorldRuntimeCoordinator.validateSceneVehicleStates(sceneId, states, logisticsState);
  }

  _restoreSceneVehicleStates(sceneId, states = [], logisticsState = null) {
    return this.sanguoWorldRuntimeCoordinator.restoreSceneVehicleStates(sceneId, states, logisticsState);
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
    return this.s09ClassSelectionCoordinator.ensureClassSystem();
  }

  /** 职业技能投影由 S09 coordinator 拥有；保留其他 Demo 调用方的兼容入口。 */
  _syncUnlockedClassSkills() {
    return this.s09ClassSelectionCoordinator.syncUnlockedClassSkills();
  }

  /** AbilitySystem 的 Demo 出口；职业专属行为由 S09 coordinator 处理。 */
  executeAbility(context = {}) {
    return this.s09ClassSelectionCoordinator.executeAbility(context);
  }

  _findResourceNodeNear(position, radius = 72) {
    return this.s09ClassSelectionCoordinator.findResourceNodeNear(position, radius);
  }

  _findGuardNear(position, radius = 180) {
    return this.s09ClassSelectionCoordinator.findGuardNear(position, radius);
  }

  onGatheringPuppetEvent(event, data = {}) {
    return this.s09ClassSelectionCoordinator.handleGatheringPuppetEvent(event, data);
  }

  onAbilityEvent(_event, _data = {}) {}

  /** 安装统一成长面板；UI 只经 ViewModel 调用成长领域命令。 */
  _installProgressionUI(gameLoader) {
    return this.sanguoProgressionPresentationCoordinator.installProgressionUI(gameLoader);
  }

  /** S09 城市摘要属于饥民/CityState 表现投影；保留 Scene 兼容入口。 */
  _installCityStateSummaryUI(gameLoader) {
    return this.s09RefugeeCoordinator.installCitySummaryUI(gameLoader);
  }

  _updateCityStateSummary() {
    return this.s09RefugeeCoordinator.updateCitySummary();
  }

  /** 新档只在成长账本首次建立前发放四类独立起始点；读档永不发放。 */
  _grantStarterProgressionPoints(progressionSystem, characterId) {
    return this.sanguoProgressionPresentationCoordinator.grantStarterProgressionPoints(
      progressionSystem,
      characterId
    );
  }

  /** 通用空间 action 注册由 GameLoader coordinator 拥有；保留兼容入口。 */
  _registerGameLoaderActions(triggerSystem) {
    return this.sanguoGameLoaderCoordinator.registerGameLoaderActions(triggerSystem);
  }

  /** 职业事实到玩家基础动画外观挂点的唯一投影入口。 */
  _syncPlayerClassAppearance(classId = null) {
    return this.s09ClassSelectionCoordinator.syncPlayerClassAppearance(classId);
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

  /** 框架 MODAL_UI 钩子；Demo UI 的优先级分发由生命周期协调器拥有并吞掉世界输入。 */
  handleModalInput(context = {}) {
    return this.sanguoSceneLifecycleCoordinator.handleModalInput(context);
  }

  _updateClassConfirmation() {
    return this.s09ClassSelectionCoordinator.updateConfirmation();
  }

  async _confirmClassSelection(classId) {
    return this.s09ClassSelectionCoordinator.confirmSelection(classId);
  }

  _presentClassSelectionCommitted(classType) {
    return this.s09ClassSelectionCoordinator.presentSelectionCommitted(classType);
  }

  _renderClassConfirmation(ctx) {
    return this.s09ClassSelectionCoordinator.renderConfirmation(ctx);
  }

  /** 父类世界加载稳定钩子；三国配置消费者由 Demo 世界协调器拥有。 */
  configureWorldRuntimeFromLoad(_result) {
    return this.sanguoWorldRuntimeCoordinator.configureWorldRuntimeFromLoad();
  }

  /** 框架渲染稳定钩子；三国 UI 层的排序由 Demo 生命周期协调器拥有。 */
  renderPostPipeline(ctx) {
    return this.sanguoSceneLifecycleCoordinator.renderPostPipeline(ctx);
  }

}

export default DataDrivenPrologueScene;
