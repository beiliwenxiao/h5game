import { SceneFlowCoordinator } from '../../../src/core/scene/SceneFlowCoordinator.js';
import { S09AudioDirector } from './S09AudioDirector.js';

/**
 * 《三国张角传》的场景生命周期领域编排。
 * 不拥有输入帧、WorldReadyGate 的创建/等待或通用渲染管线；只协调 Demo 系统的
 * 初始化、释放、帧通知和 UI 层调度。
 */
export class SanguoSceneLifecycleCoordinator extends SceneFlowCoordinator {
  constructor(scene) {
    super(scene, {
      initializeEnteredRuntime,
      updateBeforeBase,
      updateAfterBase,
      observeWaveEvents,
      presentNpcIdleText,
      updateClimbPrompt,
      observeTutorialEventSources,
      handleModalInput,
      renderPostPipeline,
      disposeEnteredRuntime
    }, { name: 'SanguoSceneLifecycleCoordinator' });
  }
}

function initializeEnteredRuntime() {
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
  const audioDirector = new S09AudioDirector({ audioManager: this.audioManager });
  this._s09AudioDirector = audioDirector;
  audioDirector.syncScene(this.currentSceneId);
  this.resourceScope?.track(() => {
    audioDirector.dispose();
    if (this._s09AudioDirector === audioDirector) this._s09AudioDirector = null;
  });
}

function updateBeforeBase(deltaTime) {
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

  if (this.weatherSystem) this.weatherSystem.update(deltaTime);
  if (this.timeSystem) {
    const previousDay = this.timeSystem.getCurrentDay();
    this.timeSystem.update(deltaTime);
    const currentDay = this.timeSystem.getCurrentDay();
    if (currentDay !== previousDay) this.s09RefugeeCoordinator._onGameDayChanged(currentDay);
  }
  this.s09RefugeeCoordinator._processDueStoryEvents();
  this._updateCityStateSummary();
  this._updateClassConfirmation();
  this.context.services.npcInteraction?.updatePresence?.();
  this._sceneTriggerBindings?.update();
  this.updateClimbPrompt();
}

function updateAfterBase(deltaTime) {
  this.s10ConstructionCoordinator._updateConstructionRuntime(deltaTime);
  this.s10ConstructionCoordinator._ensureS10StructureEntities();
  this.sceneRuntime?.runFramePhase?.('postScene', deltaTime, {
    scene: this.$scene,
    frameToken: this.sceneRuntime.currentFrameToken,
    updateSystems: true
  });
  this.s11s14SceneCoordinator._updateS11HorseTravel();
  this.s03s08Coordinator._updateS04BocaiRescue(deltaTime);
  this.s05SceneCoordinator._updateS05ZhangManchengRescue(deltaTime);
  this.s11s14SceneCoordinator._updateS11S12Runtime();
  this.endingPresentationView?.update?.(deltaTime * 1000);
  this._checkItemPickupEvents();
  this.observeWaveEvents();
  this.observeTutorialEventSources();
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

function observeWaveEvents() {
  if (!this.gameLoader) return 0;
  this._clearedGroups ||= new Set();
  return this._placementCoordinator.checkWaveEvents({
    clearedGroups: this._clearedGroups,
    isEntityDead: entity => this._isEntityDead(entity),
    triggerSystem: this.gameLoader.triggerSystem
  });
}

function presentNpcIdleText(npc, text) {
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

function updateClimbPrompt() {
  if (this._sceneTriggerBindings?.hasActivePrompt?.()) return false;
  const player = this.playerEntity;
  const canClimb = !!player && this.abilitySystem?.isUnlocked?.(player, 'climb') === true;
  const target = canClimb ? this.resolveClimbTarget({ entity: player }) : null;
  if (target?.promptTemplate) this.showHint(target.promptTemplate, '攀爬');
  else this.hideHint();
  return !!target;
}

function observeTutorialEventSources() {
  if (!this.gameLoader) return false;
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
  return true;
}

function handleModalInput({ inputManager, gamepad } = {}) {
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

function disposeEnteredRuntime() {
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
}

function renderPostPipeline(ctx) {
  this.context.services.diagnostics?.renderCollisionShapes(ctx, {
    enabled: this.debugShowCollisionPolygons,
    camera: this.camera,
    terrains: this._terrains,
    label: 'DDScene'
  });
  this._renderTeleportFade(ctx);
  this.s03s14BattleCoordinator.renderLayer('hud', ctx, this.logicalWidth, this.logicalHeight);
  this.rescueObjectiveView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
  this.s09ClassSelectionCoordinator.renderConfirmation(ctx);
  this.s03s14BattleCoordinator.renderLayer('mode', ctx, this.logicalWidth, this.logicalHeight);
  this.irreversibleChoiceView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
  this.s03s14BattleCoordinator.renderLayer('result', ctx, this.logicalWidth, this.logicalHeight);
  this.cargoTransferView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
  this.endingPresentationView?.render?.(ctx, this.logicalWidth, this.logicalHeight);
}

export default SanguoSceneLifecycleCoordinator;
