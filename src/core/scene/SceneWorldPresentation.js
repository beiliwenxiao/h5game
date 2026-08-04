/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { ItemSpriteRenderer } from '../../rendering/ItemSpriteRenderer.js';

/** 通用世界背景、掉落物和战斗空间表现。 */
export class SceneWorldPresentation {
  constructor(scene, options = {}) {
    if (!scene) throw new TypeError('SceneWorldPresentation requires scene');
    this.scene = scene;
    this.itemRenderer = options.itemRenderer || ItemSpriteRenderer;
  }

  renderBackground(ctx) {
    const scene = this.scene;
    if (scene.terrain) {
      const bounds = scene.camera.getViewBounds();
      ctx.fillStyle = scene.terrain.sceneBackgroundColor || '#1f1a14';
      ctx.fillRect(
        bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      scene.terrain.renderGround(ctx);
      return;
    }
    if (scene.isometricRenderer) {
      scene.isometricRenderer.drawInfiniteGrid(scene.camera.getViewBounds());
      if (scene.mapData) scene.isometricRenderer.drawMap();
      return;
    }
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, scene.logicalWidth, scene.logicalHeight);
  }

  renderPickupItems(ctx) {
    this._renderPickupList(ctx, this.scene.pickupItems);
    this._renderPickupList(ctx, this.scene.equipmentItems);
  }

  _renderPickupList(ctx, items) {
    for (const item of items) {
      if (item.picked) continue;
      const x = item.x;
      const y = item.y;
      if (!this.itemRenderer.draw(ctx, item.id, x, y)) {
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.arc(x, y - 5, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(item.name, x, y - 20);
    }
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
}

export default SceneWorldPresentation;
