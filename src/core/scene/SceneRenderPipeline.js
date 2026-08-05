/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

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
      (scene, ctx) => scene.renderFogLayer(ctx),
      (scene, ctx) => (this.context?.services?.worldInteraction
        ? this.context.services.worldInteraction.renderClickScreenMarkers(ctx)
        : scene._renderClickScreenMarkers(ctx)),
      (scene, ctx) => scene.skillEffects.render(ctx, scene.camera),
      (scene) => scene.combatEffects.render(),
      (scene, ctx) => scene.floatingTextManager.render(ctx, scene.camera),
      (scene, ctx) => scene.tutorialSystem?.render(ctx),
      (scene, ctx) => scene.dialogueBox?.render(ctx),
      (scene, ctx) => scene.combatSystem?.render(ctx),
      (scene, ctx) => scene.bottomControlBar?.render(ctx),
      (scene, ctx) => scene.blockButton?.render(ctx),
      (scene, ctx) => scene.jumpButton?.render(ctx),
      (scene, ctx) => scene.flightButton?.render(ctx),
      (scene, ctx) => scene.throwButton?.render(ctx),
      (scene, ctx) => scene.bagButton?.render(ctx),
      (scene, ctx) => scene.playerStatusHUD?.render(ctx),
      (scene, ctx) => scene.minimap?.render(ctx),
      (scene, ctx) => scene.renderCombatStateUI(ctx),
      (scene, ctx) => { if (scene.isTransitioning) scene.renderTransition(ctx); },
      (scene, ctx) => { if (scene.performanceMonitor?.enabled) scene.performanceMonitor.render(ctx); }
    ];
    this.modalLayers = config?.modalLayers || [
      (scene, ctx) => scene.backpackPanel?.render(ctx),
      (scene, ctx) => scene.notificationSystem?.render(ctx),
      (scene, ctx) => scene.itemGainedPopup?.render(ctx),
      (scene, ctx) => scene.gamepadPanel?.render(ctx),
      (scene, ctx) => scene.skillWheelOverlay?.render(ctx)
    ];
    /** 每帧复用的世界 Y-sort 队列与实体包装项，容量只增不减。 */
    this._worldQueue = [];
    this._entityQueueItems = [];
    this._entitySortBuffer = [];
  }

  render(ctx) {
    const scene = this.scene;
    const services = this.context?.services || {};
    if (scene.performanceMonitor?.enabled) {
      scene._drawCallCount = 0;
      if (scene._drawCallProxied && scene._drawCallProxyContext !== ctx) {
        scene._teardownDrawCallCounter?.();
      }
      if (!scene._drawCallProxied) scene._setupDrawCallCounter(ctx);
    } else if (scene._drawCallProxied) {
      scene._teardownDrawCallCounter?.();
      scene._drawCallCount = 0;
    }
    if (scene._debugNextRender) {
      console.log('【渲染】render方法被调用, isActive=', scene.isActive, 'isPaused=', scene.isPaused);
    }

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, scene.logicalWidth, scene.logicalHeight);
    ctx.save();
    const viewBounds = scene.camera.getViewBounds();
    this._viewBounds = viewBounds;
    if (scene._debugNextRender) {
      console.log('【渲染】相机位置:', scene.camera.position.x, scene.camera.position.y, '视野边界:', viewBounds);
      console.log('【渲染】玩家位置:', scene.playerEntity ? scene.playerEntity.getComponent('transform')?.position : 'no player');
      scene._debugNextRender = false;
    }
    ctx.translate(-viewBounds.left, -viewBounds.top);

    for (const layer of this.worldLayers) layer(scene, ctx);
    ctx.restore();

    for (const layer of this.screenLayers) layer(scene, ctx);
    // 模态层固定高于常规 HUD，防止背包与获得物品弹窗被覆盖。
    for (const layer of this.modalLayers) layer(scene, ctx);
  }

  renderWorldObjects(ctx) {
    const scene = this.scene;
    if (scene.terrain) {
      // 复用 Y-sort 排序队列数组；terrain.collectDecorations 会 push 进去，
      // 调用方有义务传入空数组——此处在顶部重置 length 保证兼容。
      const queue = this._worldQueue;
      queue.length = 0;
      scene.terrain.renderBelowDecorations(ctx);
      scene.terrain.collectDecorations(queue, ctx, this._viewBounds);
      let entityItemCount = 0;
      for (let i = 0, len = scene.entities.length; i < len; i++) {
        const entity = scene.entities[i];
        if (!this._isEntityVisible(entity)) continue;
        const transform = entity.getComponent('transform');
        if (!transform) continue;
        let item = this._entityQueueItems[entityItemCount];
        if (!item) {
          item = { type: 'entity', y: 0, entity: null };
          this._entityQueueItems[entityItemCount] = item;
        }
        entityItemCount++;
        item.y = transform.position.y;
        item.entity = entity;
        queue.push(item);
      }
      queue.sort((a, b) => a.y - b.y);
      for (let i = 0, len = queue.length; i < len; i++) {
        const item = queue[i];
        if (item.type === 'entity') scene.renderEntity(ctx, item.entity);
        else item.render?.();
      }
      scene.terrain.renderCliffs(ctx);
      scene._renderBuffZones(ctx);
      scene.renderSpeechBubbles(ctx);
      return;
    }

    const entities = this._entitySortBuffer;
    entities.length = 0;
    for (let i = 0, len = scene.entities.length; i < len; i++) {
      const entity = scene.entities[i];
      if (this._isEntityVisible(entity)) entities.push(entity);
    }
    entities.sort((a, b) => {
      const positionA = a.getComponent('transform')?.position;
      const positionB = b.getComponent('transform')?.position;
      const depthA = positionA ? positionA.y - (positionA.z || 0) * 0.01 : 0;
      const depthB = positionB ? positionB.y - (positionB.z || 0) * 0.01 : 0;
      return depthA - depthB;
    });
    for (let i = 0, len = entities.length; i < len; i++) scene.renderEntity(ctx, entities[i]);
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
    if (!scene.combatSystem?.isInCombat()) return;
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
    const timer = Math.ceil(scene.combatSystem.getCombatExitTimer());
    ctx.fillStyle = timer > 0 ? '#ffff00' : '#ff6666';
    ctx.font = timer > 0 ? '10px Arial' : '9px Arial';
    ctx.fillText(timer > 0 ? `${timer}秒` : '敌人附近', x + 40, y + 26);
    ctx.restore();
  }

  _renderWorldEffects(ctx) {
    const scene = this.scene;
    if (scene.weaponRenderer?.thrownWeapon.active) scene.weaponRenderer.renderThrownWeapon(ctx, scene.camera);
    if (scene.combatSystem?.isInCombat() && scene.playerEntity) {
      scene.meleeAttackSystem.renderCombatAlertCircle(ctx, scene.camera);
    }
    if (scene.meleeAttackSystem.sliceTrail?.length > 1) scene.meleeAttackSystem.renderSliceTrail(ctx);
    scene.meleeAttackSystem.renderSectorSlashEffects(ctx);
    const worldPresentation = scene.context?.services?.worldPresentation;
    if (worldPresentation) {
      worldPresentation.renderFlightShadow(ctx);
      worldPresentation.renderBlockShield(ctx);
    }
    scene.particleSystem.render(ctx, scene.camera);
    if (scene._debugParticleFrames > 0) {
      console.log('【渲染】粒子系统活跃粒子数:', scene.particleSystem.getActiveCount());
      scene._debugParticleFrames--;
    }
    scene.combatSystem?.renderSkillRangeIndicators(ctx);
    const services = scene.context?.services || {};
    if (services.worldInteraction) services.worldInteraction.renderClickRings(ctx);
    else scene._renderClickRings(ctx);
    if (services.skills) services.skills.renderAimPreview(ctx);
    else scene.renderSkillAimPreview(ctx);
  }
}

export default SceneRenderPipeline;
