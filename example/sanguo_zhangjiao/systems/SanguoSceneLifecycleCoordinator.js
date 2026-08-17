import { SceneFlowCoordinator } from '../../../src/core/scene/SceneFlowCoordinator.js';
import { S09AudioDirector } from './S09AudioDirector.js';

/**
 * 《三国张角传》的场景生命周期领域编排。
 * 不拥有输入帧、WorldReadyGate 或通用渲染管线；只协调 Demo 系统的初始化和帧通知。
 */
export class SanguoSceneLifecycleCoordinator extends SceneFlowCoordinator {
  constructor(scene) {
    super(scene, {
      initializeEnteredRuntime,
      updateBeforeBase,
      updateAfterBase
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
  this._updateClimbPrompt();
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
  this._checkWaveEvents();
  this._checkTutorialEventSources();
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

export default SanguoSceneLifecycleCoordinator;
