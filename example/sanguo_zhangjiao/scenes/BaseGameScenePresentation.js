import { applySceneRuntimeConfig, toggleSceneDebugPanel } from '../../../src/core/scene/RuntimeDebugWiring.js';
import { EntityRenderer2D } from '../../../src/rendering/EntityRenderer2D.js';
import { getNpcRenderStyle } from '../../../src/rendering/NpcRenderStyles.js';
import { BaseGameSceneGameplayHooks } from './BaseGameSceneGameplayHooks.js';

/** 场景表现与兼容转发层；不拥有领域状态或生命周期 owner。 */
export class BaseGameScenePresentation extends BaseGameSceneGameplayHooks {
  startTransition(mainText = '场景切换中...', subText = '') {
    console.log('BaseGameScene: 开始场景过渡');
    this._transition.start(mainText, subText);
  }

  get isTransitioning() {
    return this._transition.active;
  }

  get transitionPhase() {
    return this._transition.active ? this._transition.phase : 'none';
  }

  resetTransition() {
    this._transition.reset();
  }

  updateTransition(deltaTime) {
    this._transition.update(deltaTime);
  }

  renderTransition(ctx) {
    this._transition.render(ctx, this.logicalWidth, this.logicalHeight);
  }

  handleUIClick() {
    return this._ensureWorldInteraction().handleUIClick();
  }

  handleTeleport() {
    return this._ensureWorldInteraction().handleTeleport();
  }

  _debugRightClick() {
    return this._ensureWorldInteraction().debugRightClick();
  }

  _renderClickRings(ctx) {
    return this._ensureWorldInteraction().renderClickRings(ctx);
  }

  _renderClickScreenMarkers(ctx) {
    return this._ensureWorldInteraction().renderClickScreenMarkers(ctx);
  }

  handleWeaponThrow() {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().handleWeaponThrow();
  }

  handleEnemySelection() {
    return this._ensureWorldInteraction().handleEnemySelection();
  }

  handleAutoAttack(currentTime) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().handleAutoAttack(currentTime);
  }

  checkDialogueContinue() {
    return this._ensureDialogueFlow().checkContinue();
  }

  _syncTouchControlsForBackpack() {
    return this._ensurePanelLayout().syncTouchControlsForBackpack();
  }

  updatePanelHover() {
    return this._ensurePanelLayout().updatePanelHover();
  }

  applyRuntimeConfig(runtimeConfig = null) {
    return applySceneRuntimeConfig(this, runtimeConfig);
  }

  _toggleDebugPanel() {
    return toggleSceneDebugPanel(this);
  }

  _showScreenTip(text, opts = {}) {
    return this._hintPresenter?.showScreen(text, opts);
  }

  _hideScreenTip(owner = null) {
    return this._hintPresenter?.hideScreen(owner);
  }

  getGameState() {
    const state = this._gameStateView || (this._gameStateView = {});
    state.tutorialPhase = this.tutorialPhase;
    state.pickupItems = this.pickupItems;
    return state;
  }

  renderWorldObjects(ctx) {
    return this._ensureRenderPipeline().renderWorldObjects(ctx);
  }

  renderCombatStateUI(ctx) {
    return this._ensureRenderPipeline().renderCombatStateUI(ctx);
  }

  renderFogLayer(_ctx) {}

  renderSpeechBubbles(_ctx) {}

  renderBackground(ctx) {
    return this._ensureWorldPresentation().renderBackground(ctx);
  }

  _collectBuffZones() {
    return this._terrainBinding.collectBuffZones();
  }

  _renderBuffZones(ctx) {
    return this._terrainBinding.renderBuffZones(ctx);
  }

  _initEditorTerrain() {
    this._terrainConfig.sceneId = this.editorSceneId;
    return this._terrainBinding.initEditorTerrain({
      ...this._terrainConfig,
      centerX: this.logicalWidth / 2,
      centerY: this.logicalHeight / 2,
      width: this.logicalWidth,
      height: this.logicalHeight
    });
  }

  _initEffectZones(sceneId, worldOffset = this._terrainConfig.worldOffset) {
    return this._terrainBinding.initEffectZones({ sceneId, worldOffset, resourceScope: this.resourceScope });
  }

  checkTerrainCollision() {
    return this._terrainBinding.checkTerrainCollision();
  }

  renderPickupItems(ctx) {
    return this._ensureWorldPresentation().renderPickupItems(ctx);
  }

  /** 构建仅用于等距背景的视觉地图投影。 */
  generateIsometricMap() {
    this.mapData = [];
    for (let y = 0; y < this.mapHeight; y++) {
      const row = [];
      for (let x = 0; x < this.mapWidth; x++) {
        let tileType = 1;
        if (x === 0 || y === 0 || x === this.mapWidth - 1 || y === this.mapHeight - 1) {
          tileType = 3;
        } else if (Math.random() < 0.1) {
          tileType = 2;
        } else if (Math.random() < 0.05) {
          tileType = 5;
        }
        row.push(tileType);
      }
      this.mapData.push(row);
    }
    this.isometricRenderer?.setMapData(this.mapData, null);
    console.log('BaseGameScene: 生成等距地图', this.mapWidth, 'x', this.mapHeight);
  }

  _ensureEntityRenderer() {
    if (!this.entityRenderer2D) {
      this.entityRenderer2D = new EntityRenderer2D(this.assetManager, getNpcRenderStyle);
    }
    return this.entityRenderer2D;
  }

  renderEntity(ctx, entity) {
    this._ensureEntityRenderer().render(ctx, entity);
  }

  setHintCallbacks(showCallback, hideCallback) {
    return this._hintPresenter?.setCallbacks(showCallback, hideCallback);
  }

  showHint(text, title = '提示') {
    return this._hintPresenter?.showHint(text, title);
  }

  hideHint() {
    return this._hintPresenter?.hideHint();
  }

  _setupDrawCallCounter(ctx) {
    return this._diagnostics.setupDrawCallCounter(ctx);
  }

  _teardownDrawCallCounter() {
    return this._diagnostics.teardownDrawCallCounter();
  }

  _estimateTextureMemory() {
    return this._diagnostics.estimateTextureMemory();
  }

  /** 唯一同步场景资源释放事务；重复调用 no-op。 */
  _disposeSceneResources() {
    if (this._sceneResourcesDisposed) return false;
    this._sceneResourcesDisposed = true;
    const runtime = this.sceneRuntime;
    runtime?.invalidate();
    this.context.lifecycle.state = 'exiting';

    this._panelLayout?.clearTouchControlsForBackpack?.();
    this._touchControlsDimmed = false;
    this._diagnostics.dispose();

    this._inputFlow?.dispose();
    this._inputFlow = null;
    this._sceneTriggerBindings?.dispose();
    this._sceneTriggerBindings = null;

    this.playerLifecycle?.dispose();
    runtime?.dispose();
    this.sceneRuntime = null;

    this.tutorialSystem.cleanup();
    this.dialogueSystem?.reset?.();
    this.questSystem?.cleanup?.();
    this._terrainBinding.clearEffectZoneRenderer();
    this.particleSystem.clear?.();
    this.minimap?.dispose?.();

    this._skillActions?.reset();
    this._worldInteraction?.reset();
    this.entityStore.destroyAll();
    this.context.resetTransient();
    this.playerLifecycle = null;
    this._lifecycleCoordinator = null;
    this._inputBindings = null;
    this._inventoryFlow = null;
    this._hudUpdater = null;
    this._equipmentFlow = null;
    this._itemGainedFlow = null;
    this._aimPresentation = null;
    this._combatActions = null;
    this._dialogueFlow = null;
    this._worldInteraction = null;
    this._skillActions = null;
    this._worldPresentation = null;
    this._panelLayout = null;
    this._hintPresenter = null;
    this.resourceScope = null;
    this.inputManager = null;
    this.playerEntity = null;

    console.log(`BaseGameScene: 退出场景 ${this.name}`);
    return true;
  }
}

export default BaseGameScenePresentation;
