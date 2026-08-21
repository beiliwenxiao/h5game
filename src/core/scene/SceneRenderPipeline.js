/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const WORLD_PHASE_NAMES = Object.freeze([
  'renderBackground', 'renderPickups', 'renderWorldObjects', 'renderWorldEffects'
]);

/**
 * SceneRenderPipeline - Canvas 2D 场景渲染编排（框架级）
 *
 * 场景持有内容与 UI 实例，本类固定世界、屏幕 UI 与最高层弹窗的绘制顺序。
 * 子场景仍可覆盖 renderBackground、renderWorldObjects、renderFogLayer 等内容钩子。
 */
export class SceneRenderPipeline {
  /** @param {{scene:Object, context?:Object, worldLayers?:Function[], screenLayers?:Function[], modalLayers?:Function[]}|Object} config */
  constructor(config) {
    this.scene = config?.scene || config;
    this.context = config?.context || this.scene?.context || null;
    this.worldLayers = config?.worldLayers || [
      (scene, ctx) => scene.renderBackground(ctx),
      (scene, ctx) => scene.renderPickupItems(ctx),
      (scene, ctx) => scene.renderWorldObjects(ctx),
      (_scene, ctx) => this._renderWorldEffects(ctx)
    ];
    this.screenLayers = config?.screenLayers || [
      (scene, ctx) => {
        const campfire = this.context?.services?.campfire;
        if (!campfire) return scene.renderFogLayer(ctx);
        const runtime = this._atmosphereRuntime;
        runtime.timeSystem = scene.timeSystem;
        runtime.weatherSystem = scene.weatherSystem;
        runtime.playerEntity = this.context?.player?.entity || null;
        runtime.camera = this.context?.camera?.instance || null;
        runtime.viewBounds = this._viewBounds || null;
        runtime.width = scene.logicalWidth;
        runtime.height = scene.logicalHeight;
        return campfire.renderAtmosphere(ctx, runtime);
      },
      (scene, ctx) => this.context?.presentation?.skillEffects
        ?.render?.(ctx, this.context?.camera?.instance || null),
      (_scene) => this.context?.presentation?.combatEffects?.render?.(),
      (_scene, ctx) => this.context?.presentation?.floatingTextManager
        ?.render?.(ctx, this.context?.camera?.instance || null),
      (scene, ctx) => scene.tutorialSystem?.render(ctx),
      (_scene, ctx) => this.context?.ui?.dialogueBox?.render?.(ctx),
      (_scene, ctx) => this.context?.systems?.combat?.render?.(ctx),
      (_scene, ctx) => this.context?.ui?.bottomControlBar?.render?.(ctx),
      (scene, ctx) => scene.blockButton?.render(ctx),
      (scene, ctx) => scene.jumpButton?.render(ctx),
      (scene, ctx) => scene.flightButton?.render(ctx),
      (scene, ctx) => scene.throwButton?.render(ctx),
      (scene, ctx) => scene.bagButton?.render(ctx),
      (scene, ctx) => scene.settingsButton?.render(ctx),
      (_scene, ctx) => this.context?.ui?.playerStatusHUD?.render?.(ctx),
      (scene, ctx) => scene.minimap?.render(ctx),
      (scene, ctx) => scene.renderCombatStateUI(ctx),
      (scene, ctx) => { if (scene.isTransitioning) scene.renderTransition(ctx); },
      (scene, ctx) => { if (scene.performanceMonitor?.enabled) scene.performanceMonitor.render(ctx); }
    ];
    this.screenLayerNames = config?.screenLayerNames || Object.freeze([
      'renderAtmosphere',
      'renderSkillEffects',
      'renderCombatEffects',
      'renderFloatingText',
      'renderTutorial',
      'renderDialogue',
      'renderCombatUi',
      'renderBottomControlBar',
      'renderBlockButton',
      'renderJumpButton',
      'renderFlightButton',
      'renderThrowButton',
      'renderBagButton',
      'renderSettingsButton',
      'renderPlayerHud',
      'renderMinimap',
      'renderCombatState',
      'renderTransition',
      'renderPerformanceMonitor'
    ]);
    this.modalLayers = config?.modalLayers || [
      (_scene, ctx) => this.context?.ui?.backpack?.render?.(ctx),
      // 统一成长面板属于模态 UI，只从显式 SceneContext 读取。
      (_scene, ctx) => this.context?.ui?.progression?.render?.(ctx),
      (scene, ctx) => scene.notificationSystem?.render(ctx),
      (scene, ctx) => scene.itemGainedPopup?.render(ctx),
      (scene, ctx) => scene.gamepadPanel?.render(ctx),
      (scene, ctx) => scene.skillWheelOverlay?.render(ctx)
    ];
    /** 每帧复用的世界 Y-sort 队列与实体包装项，容量只增不减。 */
    this._worldQueue = [];
    this._entityQueueItems = [];
    this._entitySortBuffer = [];
    this._terrainBuffer = [];
    this._atmosphereRuntime = {
      timeSystem: null, weatherSystem: null, playerEntity: null,
      camera: null, viewBounds: null, width: 0, height: 0
    };
    this._campfireRenderRuntime = { particleSystem: null, width: 0, height: 0 };
  }

  render(ctx) {
    const scene = this.scene;
    const context = this.context || scene.context || null;
    const worldReadyGate = context?.services?.worldReadyGate || scene._worldReadyGate || null;
    const worldGateState = worldReadyGate?.status?.state;
    // 世界资源尚未收敛时不得进入相机投影，避免默认坐标与程序化地形闪现。
    if (worldGateState && worldGateState !== 'ready' && worldGateState !== 'timedOut') {
      if (typeof scene.renderLoadingBackground === 'function') scene.renderLoadingBackground(ctx);
      else {
        ctx.fillStyle = '#1f1a14';
        ctx.fillRect(0, 0, scene.logicalWidth || ctx.canvas?.width || 0, scene.logicalHeight || ctx.canvas?.height || 0);
      }
      return;
    }

    const camera = context?.camera?.instance || null;
    const frameProfile = scene.debugMode === true && scene._framePerformanceProfile?.current
      ? scene._framePerformanceProfile.current
      : null;
    const trackDrawCalls = scene.performanceMonitor?.shouldTrackDrawCalls?.() === true;
    if (trackDrawCalls) {
      scene._drawCallCount = 0;
      if (scene._drawCallProxied && scene._drawCallProxyContext !== ctx) {
        scene._teardownDrawCallCounter?.();
      }
      if (!scene._drawCallProxied) scene._setupDrawCallCounter(ctx);
    } else if (scene._drawCallProxied) {
      scene._teardownDrawCallCounter?.();
      scene._drawCallCount = 0;
    }

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, scene.logicalWidth, scene.logicalHeight);
    ctx.save();
    const viewBounds = camera.getViewBounds();
    this._viewBounds = viewBounds;
    ctx.translate(-viewBounds.left, -viewBounds.top);

    for (let index = 0; index < this.worldLayers.length; index++) {
      const startedAt = frameProfile ? performance.now() : 0;
      this.worldLayers[index](scene, ctx);
      if (frameProfile) {
        const name = WORLD_PHASE_NAMES[index] || `renderWorldLayer${index}`;
        frameProfile[name] = performance.now() - startedAt;
      }
    }
    ctx.restore();

    if (this.screenLayers.length > 0) {
      const atmosphereStartedAt = frameProfile ? performance.now() : 0;
      this.screenLayers[0](scene, ctx);
      if (frameProfile) {
        const name = this.screenLayerNames[0] || 'renderScreenLayer0';
        frameProfile[name] = performance.now() - atmosphereStartedAt;
      }
    }
    const screenUiStartedAt = frameProfile ? performance.now() : 0;
    for (let index = 1; index < this.screenLayers.length; index++) {
      const layerStartedAt = frameProfile ? performance.now() : 0;
      this.screenLayers[index](scene, ctx);
      if (frameProfile) {
        const name = this.screenLayerNames[index] || `renderScreenLayer${index}`;
        frameProfile[name] = performance.now() - layerStartedAt;
      }
    }
    if (frameProfile) frameProfile.renderScreenUi = performance.now() - screenUiStartedAt;

    // 模态层固定高于常规 HUD，防止背包与获得物品弹窗被覆盖。
    const modalStartedAt = frameProfile ? performance.now() : 0;
    for (const layer of this.modalLayers) layer(scene, ctx);
    if (frameProfile) frameProfile.renderModalUi = performance.now() - modalStartedAt;

    const postStartedAt = frameProfile ? performance.now() : 0;
    scene.renderPostPipeline?.(ctx);
    if (frameProfile) frameProfile.renderPostPipeline = performance.now() - postStartedAt;
  }

  renderWorldObjects(ctx) {
    const scene = this.scene;
    const context = this.context || scene.context || null;
    const entities = context?.entities?.all || [];
    const terrains = this._terrainBuffer;
    terrains.length = 0;
    const worldTerrains = context?.world?.terrains;
    if (Array.isArray(worldTerrains)) {
      for (let index = 0; index < worldTerrains.length; index++) {
        if (worldTerrains[index]) terrains.push(worldTerrains[index]);
      }
    }
    if (terrains.length === 0 && context?.world?.terrain) terrains.push(context.world.terrain);
    const camera = context?.camera?.instance || null;
    const particleSystem = context?.presentation?.particleSystem || null;
    const frameProfile = scene.debugMode === true && scene._framePerformanceProfile?.current
      ? scene._framePerformanceProfile.current
      : null;
    const queueBuildStartedAt = frameProfile ? performance.now() : 0;
    const queue = this._worldQueue;
    queue.length = 0;

    for (const terrain of terrains) terrain.renderBelowDecorations?.(ctx);
    const campfire = context?.services?.campfire || null;
    const campfireRuntime = this._campfireRenderRuntime;
    campfireRuntime.particleSystem = particleSystem;
    campfireRuntime.width = scene.logicalWidth;
    campfireRuntime.height = scene.logicalHeight;
    campfire?.appendRenderItems?.(queue, ctx, campfireRuntime);
    for (const terrain of terrains) terrain.collectDecorations?.(queue, ctx, this._viewBounds);
    particleSystem?.collectDepthSorted?.(queue, ctx, camera, this._viewBounds);

    let entityItemCount = 0;
    for (let i = 0, len = entities.length; i < len; i++) {
      const entity = entities[i];
      if (!this._isEntityVisible(entity)) continue;
      const position = entity.getComponent('transform')?.position;
      if (!position) continue;
      let item = this._entityQueueItems[entityItemCount];
      if (!item) {
        item = { type: 'entity', y: 0, sortPriority: 2, entity: null };
        this._entityQueueItems[entityItemCount] = item;
      }
      entityItemCount++;
      item.y = terrains.length > 0 ? position.y : position.y - (position.z || 0) * 0.01;
      item.sortPriority = 2;
      item.entity = entity;
      queue.push(item);
    }

    if (frameProfile) {
      let depthParticleCount = 0;
      for (let index = 0; index < queue.length; index++) {
        if (queue[index]?.type === 'particle') depthParticleCount++;
      }
      frameProfile.worldQueueBuild = performance.now() - queueBuildStartedAt;
      frameProfile.worldQueueLength = queue.length;
      frameProfile.visibleEntityCount = entityItemCount;
      frameProfile.worldDepthParticleCount = depthParticleCount;
    }
    const queueSortStartedAt = frameProfile ? performance.now() : 0;
    queue.sort((a, b) => (a.y - b.y) || ((a.sortPriority || 0) - (b.sortPriority || 0)));
    if (frameProfile) frameProfile.worldQueueSort = performance.now() - queueSortStartedAt;
    const queueDrawStartedAt = frameProfile ? performance.now() : 0;
    for (let i = 0, len = queue.length; i < len; i++) {
      const item = queue[i];
      if (item.type === 'entity') scene.renderEntity(ctx, item.entity);
      else item.render?.();
    }
    if (frameProfile) frameProfile.worldQueueDraw = performance.now() - queueDrawStartedAt;

    if (terrains.length === 0) return;
    for (const terrain of terrains) terrain.renderCliffs?.(ctx);
    scene._renderBuffZones?.(ctx);
    scene.renderSpeechBubbles?.(ctx);
  }

  /** 入队前的无分配视野检测；边距覆盖名称、血条和高精灵。 @private */
  _isEntityVisible(entity) {
    const bounds = this._viewBounds;
    if (!bounds) return true;
    const position = entity?.getComponent?.('transform')?.position;
    if (!position) return true;
    const sprite = entity.getComponent?.('sprite');
    const width = (sprite?.width || 32) * (sprite?.scale || 1);
    const height = (sprite?.height || 32) * (sprite?.scale || 1);
    const elevation = position.elevation || 0;
    const padding = 64;
    return position.x + width / 2 + padding >= bounds.left &&
      position.x - width / 2 - padding <= bounds.right &&
      position.y - elevation + padding >= bounds.top &&
      position.y - elevation - height - padding <= bounds.bottom;
  }

  renderCombatStateUI(ctx) {
    const scene = this.scene;
    const combatSystem = this.context?.systems?.combat || null;
    if (!combatSystem?.isInCombat()) return;
    const mobileOffset = scene.uiStrategy?.platform === 'mobile' ? 100 : 0;
    const x = scene.logicalWidth - 90 - mobileOffset;
    const y = 10;
    ctx.save();
    ctx.fillStyle = 'rgba(139, 0, 0, 0.7)';
    ctx.fillRect(x, y, 80, 30);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, 80, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('战斗中', x + 40, y + 14);
    const timer = Math.ceil(combatSystem.getCombatExitTimer());
    ctx.fillStyle = timer > 0 ? '#ffff00' : '#ff6666';
    ctx.font = timer > 0 ? '10px Arial' : '9px Arial';
    ctx.fillText(timer > 0 ? `${timer}秒` : '敌人附近', x + 40, y + 26);
    ctx.restore();
  }

  _renderWorldEffects(ctx) {
    const scene = this.scene;
    const context = this.context || scene.context || null;
    const services = context?.services || {};
    const systems = context?.systems || {};
    const presentation = context?.presentation || {};
    const camera = context?.camera?.instance || null;
    const player = context?.player?.entity || null;
    const combatSystem = systems.combat;
    const meleeAttackSystem = systems.meleeAttack;
    const weaponRenderer = presentation.weaponRenderer;
    const particleSystem = presentation.particleSystem;

    if (weaponRenderer?.thrownWeapon.active) weaponRenderer.renderThrownWeapon(ctx, camera);
    if (combatSystem?.isInCombat() && player) {
      meleeAttackSystem?.renderCombatAlertCircle?.(ctx, camera);
    }
    if (meleeAttackSystem?.sliceTrail?.length > 1) meleeAttackSystem.renderSliceTrail(ctx);
    meleeAttackSystem?.renderSectorSlashEffects?.(ctx);
    const worldPresentation = services.worldPresentation;
    if (worldPresentation) {
      worldPresentation.renderFlightShadow(ctx);
      worldPresentation.renderBlockShield(ctx);
    }
    particleSystem.render(ctx, camera);
    presentation.gatheringProgress?.render?.(ctx);
    if (scene._debugParticleFrames > 0) {
      console.log('【渲染】粒子系统活跃粒子数:', particleSystem.getActiveCount());
      scene._debugParticleFrames--;
    }
    combatSystem?.renderSkillRangeIndicators(ctx);
    if (services.worldInteraction) services.worldInteraction.renderClickRings(ctx);
    else scene._renderClickRings(ctx);
    if (services.skills) services.skills.renderAimPreview(ctx);
    else scene.renderSkillAimPreview(ctx);
  }
}

export default SceneRenderPipeline;
