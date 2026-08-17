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
import { WorldMapLoadSession } from '../../../src/core/scene/WorldMapLoadSession.js';
import { CanonicalSceneRepository } from '../../../src/core/scene/CanonicalSceneRepository.js';
import { FetchDiskSceneAdapter, LocalStorageSceneCacheAdapter } from '../../../src/core/scene/CanonicalSceneAdapters.js';
import { WorldStreamingManager } from '../../../src/core/WorldStreamingManager.js';
import { RegionCoordinator } from '../../../src/core/scene/RegionCoordinator.js';
import { WorldReadyGate } from '../../../src/core/scene/WorldReadyGate.js';
import { ChunkNavigator } from '../../../src/core/scene/ChunkNavigator.js';
import { ScenePlacementRuntime } from '../../../src/core/scene/ScenePlacementRuntime.js';
import { SceneVehicleRuntime } from '../../../src/core/scene/SceneVehicleRuntime.js';
import { FadeOverlayTransition } from '../../../src/core/scene/FadeOverlayTransition.js';
import { SceneGameLoaderBridge } from '../../../src/core/scene/SceneGameLoaderBridge.js';
import { SceneCityWarStateBridge } from '../../../src/core/scene/SceneCityWarStateBridge.js';
import { SANGUO_ZHANGJIAO_CONTENT_POLICY } from '../config/SanguoZhangjiaoContentPolicy.js';
import { registerSceneTriggerActions } from '../../../src/core/scene/SceneTriggerActionProvider.js';
import { ScenarioCommandService, SCENARIO_COMMANDS } from '../../../src/systems/ScenarioCommandService.js';
import { DomainCommandService } from '../../../src/systems/DomainCommandService.js';
import { CanonicalStateTransactionService } from '../../../src/systems/CanonicalStateTransactionService.js';
import { SanguoDomainCommandFacade } from '../systems/SanguoDomainCommandFacade.js';
import { EffectZoneRenderer } from '../../../src/rendering/EffectZoneRenderer.js';
import { WeatherSystem } from '../../../src/systems/WeatherSystem.js';
import { TimeSystem } from '../../../src/systems/TimeSystem.js';
import { ClassType, ClassNames } from '../../../src/systems/ClassSystem.js';
import { PadButton } from '../../../src/core/input/Xbox360Profile.js';
import { ProgressionViewModel } from '../../../src/ui/progression/ProgressionViewModel.js';
import { ProgressionPanel } from '../../../src/ui/progression/ProgressionPanel.js';
import { CityStateSummaryPanel } from '../../../src/ui/CityStateSummaryPanel.js';
import { CargoTransferView } from '../../../src/ui/CargoTransferView.js';
import { S09AudioDirector } from '../systems/S09AudioDirector.js';
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
  S09RefugeeCoordinator, S09_REFUGEE_DIALOGUE_ID, S09_SILENCE_EVENT_TYPE
} from '../systems/S09RefugeeFlow.js';
import { S09ClassSelectionCoordinator } from '../systems/S09ClassSelectionFlow.js';
import { S10ConstructionCoordinator } from '../systems/S10ConstructionFlow.js';
import { S10StoryCoordinator } from '../systems/S10StoryFlow.js';
import { S11S14SceneCoordinator } from '../systems/S11S14SceneFlow.js';
import { S03S14BattleCoordinator } from '../systems/S03S14BattleCoordinator.js';

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

    this.terrain = null;
    this.worldStreamingManager = null;
    this._detachWorldStreaming = null;
    this._pendingChunkDomainStates = new Map();
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
    this.s03s14BattleCoordinator = new S03S14BattleCoordinator(this);
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

  _createStreamingStateProvider() {
    return {
      capture: context => this._captureStreamedChunkState(context.chunk),
      validate: (data, context = {}) => {
        const errors = [];
        if (!data || data.schemaVersion !== 2) {
          errors.push({ code: 'invalidDemoChunkState', path: 'schemaVersion', message: 'Demo chunk 动态状态版本无效' });
          return { ok: false, errors };
        }
        if (data.sceneNamespace !== context.sceneNamespace) {
          errors.push({ code: 'demoChunkNamespaceMismatch', path: 'sceneNamespace', message: 'Demo chunk 业务命名空间不一致' });
        }
        for (const field of ['resourceNodes', 'placementStates', 'deathDrops', 's10StructureStates', 'vehicleStates']) {
          if (!Array.isArray(data[field])) {
            errors.push({ code: 'invalidDemoChunkField', path: field, message: `${field} 必须是数组` });
          }
        }
        for (const [index, entry] of (data.resourceNodes || []).entries()) {
          if (!entry?.id || !entry.state || typeof entry.state !== 'object') {
            errors.push({ code: 'invalidResourceNodeState', path: `resourceNodes[${index}]`, message: '资源节点状态无效' });
          }
        }
        for (const [index, entry] of (data.placementStates || []).entries()) {
          if (!entry?.id || !entry.state || typeof entry.state !== 'object') {
            errors.push({ code: 'invalidPlacementState', path: `placementStates[${index}]`, message: '放置点状态无效' });
          }
        }
        const deathDropCheck = this._deathDrops.validate(data.deathDrops || []);
        if (!deathDropCheck.ok) errors.push(...deathDropCheck.errors);
        if (context.sceneNamespace !== 'S10' && (data.s10StructureStates || []).length > 0) {
          errors.push({ code: 's10StructureNamespaceMismatch', path: 's10StructureStates', message: 'S10 工事状态不能属于其他场景' });
        } else {
          const s10Check = this.s10ConstructionCoordinator._validateS10StructureStates(data.s10StructureStates || []);
          if (!s10Check.ok) errors.push({
            code: s10Check.code,
            path: Number.isInteger(s10Check.index) ? `s10StructureStates[${s10Check.index}]` : 's10StructureStates',
            message: 'S10 工事状态无效'
          });
        }
        const vehicleCheck = this._validateSceneVehicleStates(
          context.sceneNamespace,
          data.vehicleStates || []
        );
        if (!vehicleCheck.ok) errors.push({
          code: vehicleCheck.code,
          path: 'vehicleStates',
          message: `${context.sceneNamespace} 载具状态无效`
        });
        return { ok: errors.length === 0, errors };
      },
      prepareRestore: data => {
        const pending = this.context.services.placements?.getPendingStateSnapshot?.()
          || { resourceNodes: [], placementStates: [] };
        return {
          ok: true,
          draft: JSON.parse(JSON.stringify(data)),
          rollback: {
            ...pending,
            domainStates: [...this._pendingChunkDomainStates.entries()]
          }
        };
      },
      commitRestore: (draft, context = {}) => {
        const placements = this.context.services.placements;
        for (const entry of draft.resourceNodes || []) placements?.addPendingResourceNodeState?.(entry.id, entry.state);
        for (const entry of draft.placementStates || []) placements?.addPendingPlacementState?.(entry.id, entry.state);
        const domainKey = context.key || `${draft.sceneNamespace}:domain`;
        this._pendingChunkDomainStates.set(domainKey, {
          sceneNamespace: draft.sceneNamespace,
          deathDrops: draft.deathDrops || [],
          s10StructureStates: draft.s10StructureStates || [],
          vehicleStates: draft.vehicleStates || []
        });
        return { ok: true };
      },
      rollbackRestore: rollback => {
        if (!rollback) return { ok: true };
        this.context.services.placements?.restorePendingStateSnapshot?.(rollback);
        this._pendingChunkDomainStates = new Map(rollback.domainStates || []);
        return { ok: true };
      }
    };
  }

  _captureStreamedChunkState(chunk) {
    const placementById = new Map((chunk?.placements || [])
      .filter(placement => placement?.id)
      .map(placement => [placement.id, placement]));
    const resourceNodes = [];
    const placementStates = [];
    const values = new Set([
      ...(this.entities || []),
      ...(this.pickupItems || []),
      ...(this.equipmentItems || [])
    ]);
    for (const value of values) {
      if (value === this.playerEntity) continue;
      const id = value?.placementId || value?.id;
      const placement = placementById.get(id);
      if (!placement) continue;
      const node = value?.getComponent?.('resourceNode');
      if (node?.serialize) resourceNodes.push({ id, state: node.serialize() });
      const transform = value?.getComponent?.('transform');
      const stats = value?.getComponent?.('stats');
      const position = transform?.position || (Number.isFinite(value?.x) ? { x: value.x, y: value.y } : null);
      placementStates.push({
        id,
        state: {
          kind: placement.kind || 'entity',
          removed: value.picked === true || this._isEntityDead(value),
          ...(Number.isFinite(value?.quantity) ? { quantity: Math.max(0, Math.floor(value.quantity)) } : {}),
          ...(Number.isFinite(stats?.hp) ? { hp: Math.max(0, Number(stats.hp)) } : {}),
          ...(position ? { position: { x: Number(position.x) || 0, y: Number(position.y) || 0 } } : {}),
          ...(placement.kind === 'enemy' ? { ai: this.aiSystem?.getRuntimeState?.(value) || null } : {})
        }
      });
    }
    const pendingPlacementState = this.context.services.placements?.getPendingStateSnapshot?.()
      || { resourceNodes: [], placementStates: [] };
    for (const [id, state] of pendingPlacementState.resourceNodes) {
      if (placementById.has(id) && !resourceNodes.some(entry => entry.id === id)) resourceNodes.push({ id, state });
    }
    for (const [id, state] of pendingPlacementState.placementStates) {
      if (placementById.has(id) && !placementStates.some(entry => entry.id === id)) placementStates.push({ id, state });
    }
    const pendingDomain = this._pendingChunkDomainStates?.get(chunk.key)
      || this._pendingChunkDomainStates?.get(chunk.sceneNamespace)
      || null;
    const left = chunk.origin.x;
    const top = chunk.origin.y;
    const right = left + this.worldStreamingManager.chunkWidth;
    const bottom = top + this.worldStreamingManager.chunkHeight;
    const deathDropById = new Map((pendingDomain?.deathDrops || [])
      .filter(entry => entry?.id)
      .map(entry => [entry.id, cloneData(entry)]));
    for (const entry of this._deathDrops.capture(entity => {
      const position = entity.getComponent?.('transform')?.position;
      return !!position && position.x >= left && position.x <= right
        && position.y >= top && position.y <= bottom;
    })) {
      deathDropById.set(entry.id, entry);
    }
    const capturedS10Structures = chunk.sceneNamespace === 'S10'
      ? this.s10ConstructionCoordinator._captureS10StructureStates()
      : [];
    const capturedVehicles = this._captureSceneVehicleStates(chunk.sceneNamespace);
    return {
      schemaVersion: 2,
      sceneNamespace: chunk.sceneNamespace,
      resourceNodes,
      placementStates,
      deathDrops: [...deathDropById.values()],
      s10StructureStates: capturedS10Structures.length > 0
        ? capturedS10Structures
        : cloneData(pendingDomain?.s10StructureStates || []),
      vehicleStates: capturedVehicles.length > 0
        ? capturedVehicles
        : cloneData(pendingDomain?.vehicleStates || [])
    };
  }

  _releaseStreamedChunkRuntime(chunk) {
    const placementIds = new Set((chunk?.placements || []).map(placement => placement?.id).filter(Boolean));
    const left = chunk?.origin?.x || 0;
    const top = chunk?.origin?.y || 0;
    const right = left + this.worldStreamingManager.chunkWidth;
    const bottom = top + this.worldStreamingManager.chunkHeight;
    const values = new Set([
      ...(this.entities || []),
      ...(this.pickupItems || []),
      ...(this.equipmentItems || [])
    ]);
    const removed = [...values].filter(value => {
      if (!value || value === this.playerEntity) return false;
      const id = value.placementId || value.id;
      if (placementIds.has(id)) return true;
      const position = value.getComponent?.('deathDrop') && value.getComponent?.('transform')?.position;
      return !!position && position.x >= left && position.x <= right && position.y >= top && position.y <= bottom;
    });
    for (const value of removed) this.aiSystem?.unregisterAI?.(value);
    this.entityStore?.removeMany?.(removed);
    for (const value of removed) {
      try { value?.destroy?.(); } catch (error) { /* best-effort chunk release */ }
    }
    this.context.services.placements?.forgetPlacements?.(placementIds);
    this._placementCoordinator.removeValues(removed);
    const namespaceStillLoaded = [...(this.worldStreamingManager?.getLoadedChunks?.().values?.() || [])]
      .some(loadedChunk => loadedChunk !== chunk && loadedChunk?.sceneNamespace === chunk?.sceneNamespace);
    if (!namespaceStillLoaded && chunk?.sceneNamespace === 'S10') {
      this.s10ConstructionCoordinator._disposeS10Structures();
    }
    if (!namespaceStillLoaded) this._disposeSceneVehicles(chunk?.sceneNamespace);
  }

  _restoreStreamedDomainState(sceneId) {
    const pendingEntries = [...this._pendingChunkDomainStates.entries()]
      .filter(([key, value]) => value?.sceneNamespace === sceneId || key === sceneId);
    if (pendingEntries.length === 0) return { ok: true };
    const mergeBy = (field, idField) => {
      const merged = new Map();
      for (const [, value] of pendingEntries) {
        for (const entry of value?.[field] || []) {
          const id = entry?.[idField];
          if (id) merged.set(id, entry);
        }
      }
      return [...merged.values()];
    };
    const state = {
      deathDrops: mergeBy('deathDrops', 'id'),
      s10StructureStates: mergeBy('s10StructureStates', 'siteId'),
      vehicleStates: mergeBy('vehicleStates', 'definitionId')
    };
    if (sceneId === 'S10' && state.s10StructureStates.length) {
      const result = this.s10ConstructionCoordinator._restoreS10StructureStates(state.s10StructureStates);
      if (result?.ok === false) return result;
    }
    if (state.vehicleStates.length) {
      const result = this._restoreSceneVehicleStates(sceneId, state.vehicleStates);
      if (result?.ok === false) return result;
    }
    const chunks = [...(this.worldStreamingManager?.getLoadedChunks?.().values?.() || [])]
      .filter(chunk => chunk?.sceneNamespace === sceneId);
    const currentDrops = new Set((this.equipmentItems || [])
      .filter(entity => entity?.getComponent?.('deathDrop'))
      .filter(entity => {
        const position = entity.getComponent?.('transform')?.position;
        return position && chunks.some(chunk => {
          const left = Number(chunk.origin?.x) || 0;
          const top = Number(chunk.origin?.y) || 0;
          const width = this.worldStreamingManager.chunkWidth;
          const height = this.worldStreamingManager.chunkHeight;
          return position.x >= left && position.x <= left + width
            && position.y >= top && position.y <= top + height;
        });
      }));
    const dropRestore = this._deathDrops.restore(state.deathDrops, {
      selectCurrent: entity => currentDrops.has(entity)
    });
    if (!dropRestore.ok) {
      const error = dropRestore.errors?.[0] || {};
      return { ok: false, code: error.code || 'deathDropRestoreFailed', path: error.path };
    }
    for (const [key] of pendingEntries) this._pendingChunkDomainStates.delete(key);
    return { ok: true };
  }

  async _prepareWorldStreamingManager(result, targetSceneId = this.currentSceneId, session = this._worldLoadSession) {
    const worldIndex = result?.worldIndex;
    const region = result?.region;
    if (!worldIndex || !region) throw new Error('无法初始化流式加载：ProjectWorldIndex 或 Region 不存在');

    const manager = new WorldStreamingManager();
    const configured = manager.configureRegion(worldIndex, {
      regionRef: region.id,
      sceneResolver: sceneId => session?.loadSceneData?.(sceneId)
        || session?.getSceneData?.(sceneId)
        || null,
      onChunkUnload: null
    });
    if (!configured.ok) throw new Error(configured.errors?.[0]?.message || '流式 Region 配置失败');
    manager.registerStateProvider('demoDynamic', this._createStreamingStateProvider());

    const initialChunk = result.chunks?.find(chunk => chunk.sceneId === targetSceneId);
    if (!initialChunk) throw new Error('流式 Region 中没有可加载 chunk');
    const centerX = initialChunk.offset.x + region.chunkWidth / 2;
    const centerY = initialChunk.offset.y + region.chunkHeight / 2;
    const loaded = await manager.update(centerX, centerY);
    if (!loaded.ok) {
      manager.unloadAll({ preserveState: false });
      throw new Error(loaded.errors?.[0]?.message || '初始九宫格加载失败');
    }
    return manager;
  }

  async _initializeWorldStreaming(result, targetSceneId = this.currentSceneId, options = {}) {
    const manager = options.preparedManager
      || await this._prepareWorldStreamingManager(result, targetSceneId, options.session || this._worldLoadSession);
    this._detachWorldStreaming?.();
    this.worldStreamingManager?.unloadAll?.({ preserveState: false });
    manager.onChunkUnload = (_col, _row, chunk) => this._releaseStreamedChunkRuntime(chunk);
    this.worldStreamingManager = manager;
    this._streamingTerrains = new Map();
    this._syncWorldStreamingProjection();

    this._detachWorldStreaming = this.sceneRuntime?.attachWorldStreaming?.(manager, {
      getPosition: () => this.playerEntity?.getComponent?.('transform')?.position || null,
      onTransition: async transition => {
        if (transition.unchanged) return;
        this._syncWorldStreamingProjection();
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
          await this._enterStreamedScene(sceneId);
        } else if (sceneId) {
          const restored = this._restoreStreamedDomainState(sceneId);
          if (restored?.ok === false) {
            this._showScreenTip(`地图块动态状态恢复失败：${restored.code || 'unknown'}`, { title: '恢复失败' });
          }
        }
      },
      onError: failure => {
        const message = failure?.errors?.[0]?.message || '相邻地图块加载失败';
        this._showScreenTip(message, { title: '地图加载失败' });
      }
    }) || null;
    return manager;
  }

  _syncWorldStreamingProjection() {
    const manager = this.worldStreamingManager;
    if (!manager) return false;
    const chunks = [...manager.getLoadedChunks().values()];
    const activeKeys = new Set(chunks.map(chunk => chunk.key));
    this._streamingTerrains = this._streamingTerrains || new Map();
    for (const key of [...this._streamingTerrains.keys()]) {
      if (!activeKeys.has(key)) this._streamingTerrains.delete(key);
    }
    const chunkWidth = manager.chunkWidth;
    const chunkHeight = manager.chunkHeight;
    for (const chunk of chunks) {
      if (this._streamingTerrains.has(chunk.key)) continue;
      this._streamingTerrains.set(chunk.key, new Scene1Terrain({
        centerX: chunkWidth / 2,
        centerY: chunkHeight / 2,
        width: chunkWidth,
        height: chunkHeight,
        editorSceneId: chunk.sceneId,
        worldOffset: chunk.origin,
        skipEditorLoad: true,
        sceneData: chunk.sceneData && Array.isArray(chunk.sceneData.layers)
          ? JSON.parse(JSON.stringify(chunk.sceneData))
          : null
      }));
    }
    this._terrains = chunks.map(chunk => this._streamingTerrains.get(chunk.key)).filter(Boolean);
    const currentChunk = chunks.find(chunk => chunk.sceneId === this.currentSceneId);
    this.terrain = currentChunk ? this._streamingTerrains.get(currentChunk.key) : (this._terrains[0] || null);
    this.terrainAct1 = this._terrains.length > 1 ? this._terrains[0] : null;
    this.context.world.terrain = this.terrain;
    this.context.world.terrains = this._terrains;
    this.context.services.placements?.setProjection(
      chunks.flatMap(chunk => chunk.placements || [])
    );
    const sceneObjects = chunks.flatMap(chunk => chunk.sceneObjects || []);
    const triggerBindings = chunks.flatMap(chunk => chunk.triggerBindings || []);
    const effectZones = chunks.flatMap(chunk => chunk.effectZones || []);
    this._sceneTriggerBindings?.setBindings(triggerBindings, sceneObjects);
    this._initMultiChunkEffectZones(effectZones);
    return true;
  }

  async _enterStreamedScene(sceneId) {
    if (!sceneId || sceneId === this.currentSceneId) return true;
    this.currentSceneId = sceneId;
    this._s09AudioDirector?.syncScene?.(sceneId);
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (storyState) blackboard.set('storyState', { ...storyState, currentSceneId: sceneId });
    this.gameLoader?.triggerSystem?.fire?.('sceneEnter', { sceneId });
    const placementResult = await this.context.services.placements?.spawnLoadedChunks();
    if (placementResult?.ok === false) {
      this._showScreenTip(placementResult.errors?.[0]?.message || '地图块放置点生成失败', { title: '地图加载失败' });
      return false;
    }
    const restored = await this._restoreStreamedDomainState(sceneId);
    if (restored?.ok === false) {
      this._showScreenTip(`地图块动态状态恢复失败：${restored.code || 'unknown'}`, { title: '恢复失败' });
      return false;
    }
    return true;
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
    this._tutorialFlow.bindPresentation();
    this.resourceScope?.track(() => this._tutorialFlow.dispose());

    this._s09AudioDirector?.dispose?.();
    const s09AudioDirector = new S09AudioDirector({ audioManager: this.audioManager });
    this._s09AudioDirector = s09AudioDirector;
    s09AudioDirector.syncScene(this.currentSceneId);
    this.resourceScope?.track(() => {
      s09AudioDirector.dispose();
      if (this._s09AudioDirector === s09AudioDirector) this._s09AudioDirector = null;
    });

    this.resourceScope?.track(() => {
      this._campfireService.dispose();
      this.effectZoneRenderer?.clear?.();
      this._terrains.length = 0;
      this.terrain = null;
      this.terrainAct1 = null;
      this._worldRegion = null;
      this._worldIndex = null;
      this.context.world.terrain = null;
      this.context.world.terrains = null;
      this.context.world.region = null;
      this.context.world.worldIndex = null;
      this.context.services.placements?.reset?.({ clearProjection: true, clearPending: true, clearSpawned: true });
      this._regionDynamicStates?.clear?.();
      this._pendingChunkDomainStates?.clear?.();
      this._detachWorldStreaming?.();
      this._detachWorldStreaming = null;
      this.worldStreamingManager?.unloadAll?.({ preserveState: false });
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
    this._pendingChunkDomainStates = new Map();
    this._regionDynamicStates = new Map();
    this._currentRegionIndex = -1;
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
        currentSceneId: this.currentSceneId,
        storyState: cloneData(this.gameLoader?.blackboard?.get?.('storyState')),
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
        this.currentSceneId = snapshot.currentSceneId;
        if (snapshot.storyState && this.gameLoader?.blackboard) {
          this.gameLoader.blackboard.set('storyState', snapshot.storyState);
        }
      },
      onSceneEnter: async ({ sceneId, x, y }) => {
        this.currentSceneId = sceneId;
        this._s09AudioDirector?.syncScene?.(sceneId);
        const blackboard = this.gameLoader?.blackboard;
        const storyState = blackboard?.get?.('storyState');
        if (storyState) blackboard.set('storyState', { ...storyState, currentSceneId: sceneId });
        const placementResult = await this.context.services.placements?.spawnLoadedChunks();
        if (placementResult?.ok === false) {
          throw new Error(placementResult.errors?.[0]?.message || '地图块放置点生成失败');
        }
        if (sceneId === 'S05') await this.s05SceneCoordinator._syncS05MineWorldState();
        if (sceneId === 'S07') this.s07s08Coordinator._syncS07DelayWorldState();
        if (sceneId === 'S12') this.s11s14SceneCoordinator._ensureS12GateEntity();
        else this.s11s14SceneCoordinator._removeS12GateEntity();
        this._ensureSceneVehicleEntities(sceneId);
        const domainRestore = await this._restoreStreamedDomainState(sceneId);
        if (domainRestore?.ok === false) {
          throw new Error(domainRestore.errors?.[0]?.message || domainRestore.code || '区块领域状态恢复失败');
        }
        // 只有目标区块和领域投影全部提交后，才转发 sceneEnter application notification。
        this.gameLoader?.triggerSystem?.fire?.('sceneEnter', { sceneId });
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

    this._campfireService.update(deltaTime, {
      particleSystem: this.particleSystem,
      timeSystem: this.timeSystem,
      weatherSystem: this.weatherSystem,
      playerEntity: this.playerEntity,
      camera: this.camera,
      flightSystem: this.flightSystem,
      width: this.logicalWidth,
      height: this.logicalHeight
    });

    // 天气和时间系统更新；跨日后只投影一次 StoryState 并处理到期事件。
    if (this.weatherSystem) this.weatherSystem.update(deltaTime);
    if (this.timeSystem) {
      const previousDay = this.timeSystem.getCurrentDay();
      this.timeSystem.update(deltaTime);
      const currentDay = this.timeSystem.getCurrentDay();
      if (currentDay !== previousDay) this.s09RefugeeCoordinator._onGameDayChanged(currentDay);
    }
    this.s09RefugeeCoordinator._processDueStoryEvents();
    this._updateCityStateSummary();

    // 提示切幕已由 SceneInputFlow 在帧首统一处理，确保手柄/键鼠只消费一次。

    // 职业确认窗口检测（第四幕，确认窗口打开时优先处理点击，阻止穿透到 NPC 交互）
    this._updateClassConfirmation();

    // NPC 自动靠近交互由通用 flow 更新；显式交互已在帧首经 SceneInputFlow 路由。
    this.context.services.npcInteraction?.updatePresence?.();

    // approach/enter/leave 统一由框架空间绑定系统处理。
    this._sceneTriggerBindings?.update();
    this._updateClimbPrompt();

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
    this.s10ConstructionCoordinator._updateConstructionRuntime(deltaTime);
    this.s10ConstructionCoordinator._ensureS10StructureEntities();
    this.sceneRuntime?.runFramePhase?.('postScene', deltaTime, {
      scene: this,
      frameToken: this.sceneRuntime.currentFrameToken,
      updateSystems: true
    });
    this.s11s14SceneCoordinator._updateS11HorseTravel();

    // 救援计时与护送跟随复用同一帧的实体状态；deadline 仅由 RescueSystem 判定。
    this.s03s08Coordinator._updateS04BocaiRescue(deltaTime);
    this.s05SceneCoordinator._updateS05ZhangManchengRescue(deltaTime);
    this.s11s14SceneCoordinator._updateS11S12Runtime();
    this.endingPresentationView?.update?.(deltaTime * 1000);

    // 事件源：物品被拾取 → fire('itemPickup', {item:id})（供"拾取X后掉落Y"类触发器）
    this._checkItemPickupEvents();

    // 事件源：敌人死亡 fire('kill')、某组敌人全灭 fire('waveCleared', {group})
    this._checkWaveEvents();

    // 事件源：① 渐进提示条件 —— playerMoved（移动一段距离）/ panelOpen（背包/属性面板打开）
    this._checkTutorialEventSources();

    // 地形碰撞（火堆 + 水池/树/编辑器碰撞多边形）
    this._campfireService.resolvePlayerCollision({
      playerEntity: this.playerEntity,
      flightSystem: this.flightSystem
    });
    this.context.services.diagnostics?.observeTerrainCollision({
      terrains: this._terrains || [],
      terrain: this.terrain,
      playerEntity: this.playerEntity,
      label: 'DDScene'
    });
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

  /** S14 gunner 指针意图和 S01 教学许可均由对应 Demo coordinator 投影。 */
  canPerformBasicAttack() {
    if (this.s11s14SceneCoordinator.handlePointerBasicAttack()) return false;
    if (super.canPerformBasicAttack()) return true;
    return this._s01s02Coordinator.allowsTutorialBasicAttack();
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
    const { node } = context;
    if (this.currentSceneId === 'S05' && node?.resourceType === 'iron') {
      return this.s05SceneCoordinator._prepareS05MineGatheringSettlement(context);
    }
    if (this.currentSceneId === 'S09' && node?.resourceType === 'food') {
      return this.s09RefugeeCoordinator.prepareUnauthorizedHarvestSettlement(context);
    }
    return null;
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
    const trig = this.gameLoader.triggerSystem;

    // playerMoved：完成事实只存 TutorialSystem.completedTutorials。
    const position = this.playerEntity?.getComponent?.('transform')?.position;
    this._tutorialFlow.updateMovement(position, {
      onComplete: () => trig.fire('playerMoved', {})
    });

    // panelOpen（上升沿：false→true 时触发）
    const invVis = !!(this.inventoryPanel && this.inventoryPanel.visible);
    if (invVis && !this._invWasOpen) trig.fire('panelOpen', { panel: 'inventory' });
    this._invWasOpen = invVis;

    const statsVis = !!(this.playerInfoPanel && this.playerInfoPanel.visible);
    if (statsVis && !this._statsWasOpen) trig.fire('panelOpen', { panel: 'stats' });
    this._statsWasOpen = statsVis;
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

  async travelToRegion({ regionIndex, sceneId, spawnRef = 'player' } = {}) {
    const result = await this._regionCoordinator?.switchTo?.({
      projectUrl: 'game.project.json', regionIndex, sceneId, spawnRef
    });
    if (!result?.ok) {
      const message = result?.errors?.[0]?.message || `无法进入 ${sceneId || '目标区域'}`;
      this._showScreenTip(message, { title: '大区切换失败' });
      return result || { ok: false, errors: [{ code: 'regionCoordinatorUnavailable', path: 'region', message }] };
    }
    // Scene 只投影已提交 Region 的表现；checkpoint 必须由独立 checkpoint.request 命令发起。
    this._s09AudioDirector?.syncScene?.(sceneId);
    return result;
  }

  async _validateRegionTarget({ request, result, shadowSession }) {
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
    if (errors.length > 0) return { ok: false, errors };

    try {
      const preparedStreamingManager = await this._prepareWorldStreamingManager(
        result,
        request.sceneId,
        shadowSession
      );
      return { ok: true, errors: [], preparedStreamingManager };
    } catch (error) {
      return {
        ok: false,
        errors: [{
          code: 'regionStreamingPrepareFailed',
          path: `scenes.${request.sceneId}`,
          message: error?.message || String(error)
        }]
      };
    }
  }

  _extractRegionDynamicState(sceneState = {}) {
    const keys = [
      'worldStreamingState',
      'campfireLit', 'firedPickups', 'clearedGroups',
      'gatheringState', 'puppetState', 'gatheringPolicyOperations'
    ];
    const state = {};
    for (const key of keys) {
      if (sceneState[key] !== undefined) state[key] = JSON.parse(JSON.stringify(sceneState[key]));
    }
    return state;
  }

  _clearRegionRuntime(result = this._worldLoadResult) {
    this.gatheringPuppetSystem?.cancelActive?.('regionUnload', { silent: true });
    this.s10ConstructionCoordinator._disposeS10Structures();
    this._disposeAllSceneVehicles();
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
    this.context.services.placements?.forgetPlacements?.(placementIds);
    this._placementCoordinator.removeValues(values);
    this._groupEnemies = {};
    this._npcEntities = [];
  }

  async _commitRegionTarget({ request, result, shadowSession, draft, validation }) {
    const preparedStreamingManager = validation?.preparedStreamingManager;
    if (!preparedStreamingManager) {
      return { ok: false, errors: [{
        code: 'missingPreparedStreamingManager',
        path: 'region.streaming',
        message: '目标大区缺少已校验的流式加载草稿'
      }] };
    }
    const oldRegionId = this._worldLoadResult?.region?.id;
    const oldSceneState = draft?.saveState?.scene;
    if (oldRegionId && oldSceneState) {
      this._regionDynamicStates.set(oldRegionId, this._extractRegionDynamicState(oldSceneState));
    }
    this._clearRegionRuntime(this._worldLoadResult);
    this.context.services.placements?.setPendingStates?.();
    this._campfireService.restore({ lit: false }, { particleSystem: this.particleSystem });
    this._worldLoadSession = shadowSession;
    this._worldLoadResult = result;
    this._worldIndex = result.worldIndex;
    this._currentRegionIndex = request.regionIndex;
    await this._initializeWorldStreaming(result, request.sceneId, {
      preparedManager: preparedStreamingManager,
      session: shadowSession
    });
    this._worldLoadPromise = Promise.resolve(result);
    this._loadWorldTerrains();
    void this.context.services.placements?.loadProjection({
      sceneId: request.sceneId,
      consumePlayerSpawn: false
    });
    await this._worldLoadPromise;
    await Promise.resolve();

    const targetChunkLoaded = [...(this.worldStreamingManager?.getLoadedChunks?.().values?.() || [])]
      .some(chunk => chunk?.sceneId === request.sceneId);
    if (this._worldRegion !== result.region || !targetChunkLoaded) {
      return { ok: false, errors: [{ code: 'regionProjectionFailed', path: 'region', message: '目标大区九宫格投影未完成' }] };
    }
    this.currentSceneId = request.sceneId;
    if (!this.getBattleFlowByScene(request.sceneId)) {
      this.s03s14BattleCoordinator.leaveBattleScene({ preserveSnapshot: true });
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
    const placementResult = await this.context.services.placements?.spawnLoadedChunks();
    if (placementResult?.ok === false) return placementResult;
    if (request.sceneId === 'S12') this.s11s14SceneCoordinator._ensureS12GateEntity();
    else this.s11s14SceneCoordinator._removeS12GateEntity();
    this._ensureSceneVehicleEntities(request.sceneId);

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
    await this._initializeWorldStreaming(draft.worldResult, draft.saveState?.currentSceneId);
    this._worldLoadPromise = Promise.resolve(draft.worldResult);
    this._loadWorldTerrains();
    void this.context.services.placements?.loadProjection({
      sceneId: draft.saveState?.currentSceneId,
      consumePlayerSpawn: false
    });
    await this._worldLoadPromise;
    await Promise.resolve();
    return this.restoreSaveState(draft.saveState);
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
    if (this.currentSceneId === 'S01' && this._campfireService.isLit()) {
      const campfire = this._campfireService.getPosition();
      return { x: campfire.x + 48, y: campfire.y + 64, label: '已点燃的火堆旁' };
    }
    const spawn = this.context.services.placements?.getSpawnPoint?.(this.currentSceneId, 'player');
    return spawn ? { x: spawn.x, y: spawn.y, label: `${this.currentSceneId}入口` } : null;
  }

  /** Demo 专属运行状态；玩家/任务/黑板由 BaseGameScene 统一保存。 */
  captureSceneSaveState() {
    const pendingPlacementState = this.context.services.placements?.getPendingStateSnapshot?.()
      || { resourceNodes: [], placementStates: [] };
    const resourceNodeStates = new Map(pendingPlacementState.resourceNodes);
    for (const entity of this.entities || []) {
      const node = entity?.getComponent?.('resourceNode');
      if (node) resourceNodeStates.set(entity.id, node.serialize());
    }
    const deathDrops = this._deathDrops.capture();
    const placementStates = new Map(pendingPlacementState.placementStates);
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
    const hasWorldStreaming = !!this.worldStreamingManager;
    const s11s14State = this.s11s14SceneCoordinator._captureS11S14SceneState();
    if (hasWorldStreaming) {
      // 载具运行态由 demoDynamic provider 按 scene namespace 保存；全局物流 ledger 只保存一次。
      s11s14State.vehicleStates = [];
    }
    return {
      worldStreamingState: this.worldStreamingManager?.serialize?.() || null,
      regionStates: [...(this._regionDynamicStates || new Map()).entries()].map(([regionId, state]) => ({
        regionId,
        state: JSON.parse(JSON.stringify(state))
      })),
      campfireLit: this._campfireService.snapshot().lit,
      firedPickups: [...(this._firedPickups || [])],
      clearedGroups: [...(this._clearedGroups || [])],
      ...(hasWorldStreaming ? {} : {
        resourceNodes: [...resourceNodeStates.entries()].map(([id, state]) => ({ id, state })),
        placementStates: [...placementStates.entries()].map(([id, state]) => ({ id, state })),
        deathDrops,
        s10StructureStates: this.s10ConstructionCoordinator._captureS10StructureStates()
      }),
      ...this._gameplaySnapshots.capture(),
      ...this.s03s14BattleCoordinator.capture(),
      rescueState: this.rescueSystem?.serialize?.() || null,
      ...s11s14State,
      gatheringPolicyOperations: this.s09RefugeeCoordinator.captureUnauthorizedHarvestOperations(),
      timeState: this.timeSystem?.serialize?.() || null
    };
  }

  restoreSceneSaveState(data = {}) {
    const battleValidation = this.s03s14BattleCoordinator.validateSnapshot(data);
    if (!battleValidation.ok) {
      return { ok: false, errors: [{
        code: battleValidation.code,
        path: battleValidation.path || 'battleState',
        message: `战役运行状态校验失败: ${battleValidation.code}`
      }] };
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
      if (rescueId && !this.s03s14BattleCoordinator.hasRescueDefinition(rescueId)) {
        return { ok: false, errors: [{
          code: 'unknownRescueId', path: 'rescueState.definition.id', message: `未知救援配置: ${rescueId}`
        }] };
      }
    }
    if (data.worldStreamingState) {
      if (!this.worldStreamingManager) {
        return { ok: false, errors: [{ code: 'worldStreamingUnavailable', path: 'worldStreamingState', message: '世界流式运行时尚未就绪' }] };
      }
      const check = this.worldStreamingManager.validateSerialized(data.worldStreamingState);
      if (!check.ok) {
        return { ok: false, errors: check.errors.map(error => ({
          ...error,
          path: error.path ? `worldStreamingState.${error.path}` : 'worldStreamingState'
        })) };
      }
    }
    const deathDropValidation = this._deathDrops.validate(data.deathDrops);
    if (!deathDropValidation.ok) return deathDropValidation;
    const s11s14Check = this.s11s14SceneCoordinator._validateS11S14SceneState(data);
    if (!s11s14Check.ok) return s11s14Check;
    const gameplayValidation = this._gameplaySnapshots.validate(data);
    if (!gameplayValidation.ok) return gameplayValidation;
    const s10StructureCheck = this.s10ConstructionCoordinator._validateS10StructureStates(data.s10StructureStates);
    if (!s10StructureCheck.ok) {
      return { ok: false, errors: [{
        code: s10StructureCheck.code,
        path: Number.isInteger(s10StructureCheck.index)
          ? `s10StructureStates[${s10StructureCheck.index}]`
          : 's10StructureStates',
        message: 'S10 工事动态状态校验失败'
      }] };
    }
    if (data.worldStreamingState) {
      const worldRestore = this.worldStreamingManager.deserialize(data.worldStreamingState);
      if (!worldRestore.ok) {
        return { ok: false, errors: worldRestore.errors.map(error => ({
          ...error,
          path: error.path ? `worldStreamingState.${error.path}` : 'worldStreamingState'
        })) };
      }
    }
    this._regionDynamicStates = new Map((data.regionStates || [])
      .filter(entry => typeof entry?.regionId === 'string' && entry.state && typeof entry.state === 'object')
      .map(entry => [entry.regionId, JSON.parse(JSON.stringify(entry.state))]));
    this._firedPickups = new Set(data.firedPickups || []);
    this._clearedGroups = new Set(data.clearedGroups || []);
    this.s09RefugeeCoordinator.restoreUnauthorizedHarvestOperations(data.gatheringPolicyOperations);
    const restoredStoryDay = Math.max(1, Math.floor(Number(
      this.gameLoader?.blackboard?.get?.('storyState')?.currentDay
    ) || 1));
    if (data.timeState) this.timeSystem?.deserialize?.(data.timeState);
    this.timeSystem?.setCurrentDay?.(restoredStoryDay);
    if (!data.worldStreamingState) {
      this.context.services.placements?.setPendingStates?.({
        resourceNodes: data.resourceNodes || [],
        placementStates: data.placementStates || []
      });
    }

    const placementRuntime = this.context.services.placements;
    const rebuild = placementRuntime?.rebuild?.(this.currentSceneId)
      || { ok: false, errors: [{ code: 'placementRuntimeUnavailable', path: 'placementStates', message: '场景放置运行时尚未就绪' }] };
    if (!rebuild.ok) return rebuild;
    placementRuntime.applyPendingToExisting([
      ...(this.entities || []),
      ...(this.pickupItems || []),
      ...(this.equipmentItems || [])
    ]);
    this.cityWarStateBridge.syncResourceNodes(
      this.gameLoader?.blackboard?.get?.('warResourceNodeStates') || []
    );

    const gameplayFoundations = this._gameplaySnapshots.restoreFoundations(data);
    if (!gameplayFoundations.ok) return gameplayFoundations;
    if (!data.worldStreamingState) {
      const s10StructureRestore = this.s10ConstructionCoordinator._restoreS10StructureStates(
        data.s10StructureStates || []
      );
      if (!s10StructureRestore.ok) {
        return { ok: false, errors: [{
          code: s10StructureRestore.code,
          path: 's10StructureStates',
          message: `S10 工事动态状态恢复失败: ${s10StructureRestore.siteId || s10StructureRestore.riderId || 'unknown'}`
        }] };
      }
    }
    if (data.battleState || data.battlefieldRuntimeState || data.cityWarState) {
      const restored = this.s03s14BattleCoordinator.restore(data);
      if (!restored.ok) {
        return { ok: false, errors: [{
          code: restored.code,
          path: restored.path || 'battleState',
          message: `战役运行状态恢复失败: ${restored.code}`
        }] };
      }
    }
    if (data.rescueState) {
      const restored = this.rescueSystem.deserialize(data.rescueState);
      if (!restored.ok) return { ok: false, errors: [{ code: restored.code, path: 'rescueState', message: '救援状态恢复失败' }] };
      if (restored.state?.definitionId) {
        this.s03s14BattleCoordinator.setRescueObjectiveTitle(restored.state.definitionId);
      }
      this.rescueObjectiveView?.setSnapshot?.(restored.state);
    }
    const s11s14Restore = this.s11s14SceneCoordinator._restoreS11S14SceneState(data);
    if (!s11s14Restore.ok) return s11s14Restore;
    if (data.worldStreamingState) {
      const domainRestore = this._restoreStreamedDomainState(this.currentSceneId);
      if (domainRestore?.ok === false) {
        return { ok: false, errors: [{
          code: domainRestore.code || 'streamedDomainRestoreFailed',
          path: 'worldStreamingState',
          message: `当前地图块领域状态恢复失败: ${domainRestore.definitionId || domainRestore.siteId || 'unknown'}`
        }] };
      }
    } else {
      const dropRestore = this._deathDrops.restore(data.deathDrops || []);
      if (!dropRestore.ok) return dropRestore;
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
    const gameplayActors = this._gameplaySnapshots.restoreActors(data);
    if (!gameplayActors.ok) return gameplayActors;
    const refugeeConflict = restoredStory.s09RefugeeConflict;
    if (refugeeConflict && this.dialogueSystem?.getCurrentDialogue?.()?.id === S09_REFUGEE_DIALOGUE_ID) {
      if (refugeeConflict.branch) {
        this.s09RefugeeCoordinator._setRefugeeDialogueNode(
          this.s09RefugeeCoordinator._refugeeBranchResultNode(refugeeConflict)
        );
      } else if (refugeeConflict.donationCommitted) {
        this.s09RefugeeCoordinator._setRefugeeDialogueNode('branchChoice');
      } else if (refugeeConflict.status === 'started') {
        this.s09RefugeeCoordinator._setRefugeeDialogueNode('donationOffer');
      }
    }
    this._classConfirm = null;
    this._classSelectionBusy = false;
    this._campfireService.restore(
      { lit: data.campfireLit === true },
      { particleSystem: this.particleSystem }
    );
    this._tutorialFlow.resetMovementOrigin(
      this.playerEntity?.getComponent?.('transform')?.position || null
    );
    this._s09AudioDirector?.syncScene?.(this.currentSceneId);
    if (this.currentSceneId === 'S05') void this.s05SceneCoordinator._syncS05MineWorldState();
    if (this.currentSceneId === 'S07') this.s07s08Coordinator._syncS07DelayWorldState();
    this.resourceScope?.setTimeout(() => this._tutorialFlow.showNext(), 0);
    return { ok: true, errors: [] };
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
    const location = this._worldIndex?.findScene?.(sceneId);
    return location?.loadable ? { col: location.col, row: location.row } : null;
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
      this.context.services.placements?.addPendingPlacementState?.(
        item.placementId,
        { kind: 'item', removed: true, quantity: 0 }
      );
    }
    if (!uid || this._firedPickups.has(uid)) return false;
    this._firedPickups.add(uid);
    const itemId = item.itemId || item.id;
    this._tutorialFlow.notify('itemPicked', { item });
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
    const transform = entity?.getComponent?.('transform');
    if (!transform || !this.currentSceneId) return null;
    const chunk = this._worldLoadSession?.getChunk?.(this.currentSceneId);
    const offset = chunk?.offset || { x: 0, y: 0 };
    const projected = (this._worldLoadResult?.sceneObjects || [])
      .filter(object => object?.sceneId === this.currentSceneId && object?.semanticRole === 'climbSurface');
    const sources = projected.length > 0
      ? projected
      : (chunk?.sceneData?.layers || []).flatMap(layer => (layer.objects || [])
        .filter(object => object?.semanticRole === 'climbSurface')
        .map(object => ({ ...object, x: Number(object.x) + offset.x, y: Number(object.y) + offset.y })));
    let best = null;
    for (const surface of sources) {
      const centerX = Number(surface.x) + (Number(surface.width) || 0) / 2;
      const centerY = Number(surface.y) + (Number(surface.height) || 0) / 2;
      const distance = Math.hypot(transform.position.x - centerX, transform.position.y - centerY);
      const radius = Math.max(32, Number(surface.radius) || 96);
      if (distance > radius || (best && best.distance <= distance)) continue;
      const target = surface.climbTarget || {};
      const targetIsWorld = surface.climbTargetWorld === true;
      const targetX = Number(target.x);
      const targetY = Number(target.y);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) continue;
      best = {
        id: surface.id,
        distance,
        promptTemplate: surface.prompt || '{climb}攀爬',
        targetPosition: {
          x: targetX + (targetIsWorld ? 0 : offset.x),
          y: targetY + (targetIsWorld ? 0 : offset.y)
        }
      };
    }
    return best;
  }

  _findProjectedSceneObject(sceneId, objectId) {
    return this._worldLoadSession?.findSceneObject?.(sceneId, objectId) || null;
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
    if (this.currentSceneId === 'S06') return this.s06SceneCoordinator._handleS06DefenseChoiceCommand(command);
    if (this.currentSceneId === 'S08') return this.s07s08Coordinator._handleS08RetreatChoiceCommand(command);
    if (this.currentSceneId === 'S14') return this.s11s14SceneCoordinator._handleS14FinalDoctrineCommand(command);
    return this.s03s08Coordinator._handleS04RouteChoiceCommand(command);
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
      this._worldIndex = result.worldIndex;
      this.context.world.region = region;
      this.context.world.worldIndex = result.worldIndex;
      this.minimap?.setWorldIndex?.(result.worldIndex, region.id);
      this._syncWorldStreamingProjection();

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

      // effectZones 已由流式 manager 按当前九宫格投影并同步。
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
    this._terrainBinding.setEffectZoneRenderer(renderer, { clearPrevious: true });
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
    this._campfireService.appendRenderItems(renderQueue, ctx, {
      particleSystem: this.particleSystem,
      width: this.logicalWidth,
      height: this.logicalHeight
    });

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
    const bounds = this._worldIndex?.getBounds?.(this._worldRegion?.id);
    if (!bounds) return;
    const worldWidth = bounds.width;
    const worldHeight = bounds.height;

    const halfW = this.camera.width / 2;
    const halfH = this.camera.height / 2;

    this.camera.position.x = Math.max(halfW, Math.min(worldWidth - halfW, this.camera.position.x));
    this.camera.position.y = Math.max(halfH, Math.min(worldHeight - halfH, this.camera.position.y));
  }

  /** 地形碰撞（水面 + 树木 + 编辑器碰撞多边形） */
  checkTerrainCollision() {
    return this.context.services.diagnostics?.checkTerrainCollision({
      terrainBinding: this._terrainBinding,
      terrains: this._terrains,
      terrain: this.terrain,
      secondaryTerrain: this.terrainAct1,
      playerEntity: this.playerEntity,
      label: 'DDScene'
    }) === true;
  }
}

export default DataDrivenPrologueScene;
