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
  /** @param {Object} scene */
  constructor(scene) {
    this.scene = scene;
    /** 每帧复用的世界 Y-sort 队列与实体包装项，容量只增不减。 */
    this._worldQueue = [];
    this._entityQueueItems = [];
    this._entitySortBuffer = [];
  }

  render(ctx) {
    const scene = this.scene;
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

    scene.renderBackground(ctx);
    scene.renderPickupItems(ctx);
    scene.renderWorldObjects(ctx);
    this._renderWorldEffects(ctx);
    ctx.restore();

    scene.renderFogLayer(ctx);
    scene._renderClickScreenMarkers(ctx);
    scene.skillEffects.render(ctx, scene.camera);
    scene.combatEffects.render();
    scene.floatingTextManager.render(ctx, scene.camera);
    scene.tutorialSystem?.render(ctx);
    scene.dialogueBox?.render(ctx);
    scene.combatSystem?.render(ctx);
    scene.bottomControlBar?.render(ctx);
    scene.blockButton?.render(ctx);
    scene.flightButton?.render(ctx);
    scene.throwButton?.render(ctx);
    scene.bagButton?.render(ctx);
    scene.playerStatusHUD?.render(ctx);
    scene.minimap?.render(ctx);
    scene.renderCombatStateUI(ctx);
    if (scene.isTransitioning) scene.renderTransition(ctx);
    if (scene.performanceMonitor?.enabled) scene.performanceMonitor.render(ctx);

    // 组合背包必须盖住常规 HUD；通知、物品弹窗、手柄面板和技能轮盘更高。
    scene.backpackPanel?.render(ctx);
    scene.notificationSystem?.render(ctx);
    scene.itemGainedPopup?.render(ctx);
    if (scene.gamepadPanel) {
      scene.gamepadPanel.update(16);
      scene.gamepadPanel.render(ctx);
    }
    scene.skillWheelOverlay?.render(ctx);
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

  renderFlightShadow(ctx) {
    const scene = this.scene;
    if (!scene.flightSystem?.isFlying || !scene.playerEntity) return;
    const position = scene.playerEntity.getComponent('transform')?.position;
    const elevation = position?.elevation || 0;
    if (!position || elevation <= 2) return;
    const ratio = Math.min(1, elevation / 120);
    const scale = 1 - ratio * 0.4;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(position.x, position.y, 20 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * (1 - ratio * 0.5)})`;
    ctx.fill();
    ctx.restore();
  }

  renderBlockShield(ctx) {
    const scene = this.scene;
    if (!scene.combatSystem?.isBlocking() || !scene.playerEntity) return;
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const height = scene.playerEntity.getComponent('sprite')?.height || 64;
    const cx = transform.position.x;
    const cy = transform.position.y - height / 2;
    const now = performance.now();
    const activeBlock = scene.combatSystem._activeBlock;
    const progress = Math.min(1, (now - activeBlock.startTime) / activeBlock.duration);
    const alpha = progress > 0.7 ? (1 - (progress - 0.7) / 0.3) * 0.6 : 0.6;
    const radius = 36 * (1 + Math.sin(now / 120) * 0.05);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * 0.8})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(100, 200, 255, ${alpha * 0.15})`);
    gradient.addColorStop(0.6, `rgba(60, 160, 240, ${alpha * 0.3})`);
    gradient.addColorStop(1, `rgba(30, 120, 220, ${alpha * 0.5})`);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 230, 255, ${alpha})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    const innerRadius = radius * 0.55;
    for (let index = 0; index < 6; index++) {
      const angle = Math.PI * 2 / 6 * index - Math.PI / 2;
      const x = cx + Math.cos(angle) * innerRadius;
      const y = cy + Math.sin(angle) * innerRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(150, 220, 255, ${alpha * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
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
    this.renderFlightShadow(ctx);
    this.renderBlockShield(ctx);
    scene.particleSystem.render(ctx, scene.camera);
    if (scene._debugParticleFrames > 0) {
      console.log('【渲染】粒子系统活跃粒子数:', scene.particleSystem.getActiveCount());
      scene._debugParticleFrames--;
    }
    scene.combatSystem?.renderSkillRangeIndicators(ctx);
    scene._renderClickRings(ctx);
    scene.renderSkillAimPreview(ctx);
  }
}

export default SceneRenderPipeline;
