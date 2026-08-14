/************************************************************
 * 三国张角传 - P1.4 S01 火堆与迷雾表现
 * 只消费宿主持有的世界坐标，不再次应用 worldOffset。
 ************************************************************/

import { InputHints } from '../../../src/core/input/InputHints.js';

export const S01_INITIAL_FOG_OPACITY = 1.0;

const s01CampfirePresentationMethods = {
  _restoreCampfireState(lit) {
    if (lit) {
      if (!this.campfire.lit) this.lightCampfire({ emitEvent: false });
      this.fog.opacity = 0;
      this.fog.targetOpacity = 0;
      return;
    }
    for (const emitter of this.campfire.emitters || []) emitter.active = false;
    this.campfire.emitters = [];
    if (this.campfire.emitterSmoke) this.campfire.emitterSmoke.active = false;
    this.campfire.emitterSmoke = null;
    this.campfire.lit = false;
    this.fog.opacity = S01_INITIAL_FOG_OPACITY;
    this.fog.targetOpacity = S01_INITIAL_FOG_OPACITY;
  },

  /** 点燃火堆并创建火焰粒子（7 组发射器）。 */
  lightCampfire({ emitEvent = true } = {}) {
    if (this.campfire.lit) return;
    this.campfire.lit = true;
    this.campfire.emitters = [];

    const fireBaseY = this.campfire.y - 15;
    const firePoint = { x: this.campfire.x, y: fireBaseY };
    const mk = (rate, vy, life, size, color, alpha) => this.campfire.emitters.push(
      this.particleSystem.createEmitter({
        position: { x: firePoint.x, y: firePoint.y },
        rate,
        duration: Infinity,
        particleConfig: {
          position: { x: firePoint.x, y: firePoint.y },
          velocity: { x: 0, y: vy },
          life, size, color, alpha, gravity: 0, friction: 0.95
        }
      })
    );
    mk(6, -50, 250, 8.5, '#ffaa22', 0.85);
    mk(8, -35, 200, 6, '#ff8833', 0.8);
    mk(4, -120, 400, 4.5, '#ffffee', 1.0);
    mk(10, -100, 350, 3.5, '#ffee44', 0.9);
    mk(8, -80, 300, 2.5, '#ff9933', 0.85);
    mk(6, -60, 250, 2, '#ff5522', 0.8);
    mk(12, -40, 200, 2, '#ff6633', 0.7);

    console.log('DataDrivenPrologueScene: 火焰粒子效果已创建（1个发射点，7种粒子）');
    this.fog.targetOpacity = 0;
    if (emitEvent && this.gameLoader) {
      this.gameLoader.triggerSystem.fire('campfireLit', { sceneId: 'S01' });
    }
  },

  updateFog(deltaTime) {
    if (!this.fog.active) return;
    if (Math.abs(this.fog.opacity - this.fog.targetOpacity) > 0.01) {
      if (this.fog.opacity > this.fog.targetOpacity) {
        this.fog.opacity -= this.fog.fadeSpeed * deltaTime;
        if (this.fog.opacity < this.fog.targetOpacity) this.fog.opacity = this.fog.targetOpacity;
      }
    } else if (this.fog.targetOpacity === 0) {
      this.fog.opacity = 0;
      this.fog.active = false;
    }
  },

  updateCampfireAnimation(deltaTime) {
    if (this.campfire.lit && this.campfire.imageLoaded) {
      this.campfire.frameTime += deltaTime;
      if (this.campfire.frameTime >= this.campfire.frameDuration) {
        this.campfire.frameTime = 0;
        this.campfire.currentFrame = (this.campfire.currentFrame + 1) % this.campfire.frameCount;
      }
    }
    if (!this.campfire.lit) return;
    const time = performance.now() / 1000;
    this.campfire.emitters.forEach((emitter, index) => {
      if (!emitter) return;
      const swayAmount = index < 2
        ? (Math.random() - 0.5) * 10
        : Math.sin(time * 2 + index * 0.5) * 4 + (Math.random() - 0.5) * 2;
      emitter.position.x = this.campfire.x + swayAmount;
      emitter.position.y = this.campfire.y - 13;
      emitter.particleConfig.velocity.x = (Math.random() - 0.5) * 10;
      this.particleSystem.updateEmitter(emitter, deltaTime);
    });
  },
  /** 时间色调 → 迷雾遮罩/透光 → 天气粒子的固定表现顺序。 */
  renderFogLayer(ctx) {
    const width = this.logicalWidth;
    const height = this.logicalHeight;
    this.timeSystem?.render?.(ctx, width, height);

    const timeFogAdd = this.timeSystem?.enabled ? this.timeSystem.getFogOpacity() : 0;
    const weatherFogAdd = this.weatherSystem ? this.weatherSystem.getFogAdd() : 0;
    const baseFogOpacity = this.fog.active ? this.fog.opacity : 0;
    const timeFogOpacity = Math.min(1, Math.max(0, timeFogAdd * 0.3));
    const weatherFogOpacity = Math.min(1, Math.max(0, weatherFogAdd));
    const totalFogOpacity = Math.min(1, 1
      - (1 - Math.min(1, Math.max(0, baseFogOpacity)))
      * (1 - timeFogOpacity)
      * (1 - weatherFogOpacity));

    if (totalFogOpacity > 0.01) {
      ctx.save();
      const playerTransform = this.playerEntity?.getComponent?.('transform');
      const viewBounds = this.camera.getViewBounds();
      if (playerTransform) {
        const playerScreenX = playerTransform.position.x - viewBounds.left;
        const playerScreenY = playerTransform.position.y - viewBounds.top;
        const lightRadius = 150;
        if (!this._fogCanvas) this._fogCanvas = document.createElement('canvas');
        if (this._fogCanvas.width !== width || this._fogCanvas.height !== height) {
          this._fogCanvas.width = width;
          this._fogCanvas.height = height;
        }
        const fogCtx = this._fogCanvas.getContext('2d');
        fogCtx.clearRect(0, 0, width, height);
        fogCtx.fillStyle = `${this.fog.color} ${totalFogOpacity})`;
        fogCtx.fillRect(0, 0, width, height);
        fogCtx.globalCompositeOperation = 'destination-out';

        const yScale = 0.6;
        fogCtx.save();
        fogCtx.translate(playerScreenX, playerScreenY);
        fogCtx.scale(1, yScale);
        const gradient = fogCtx.createRadialGradient(0, 0, 0, 0, 0, lightRadius);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.6)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        fogCtx.fillStyle = gradient;
        fogCtx.beginPath();
        fogCtx.arc(0, 0, lightRadius, 0, Math.PI * 2);
        fogCtx.fill();
        fogCtx.restore();
        if (this.campfire.lit) {
          const campScreenX = this.campfire.x - viewBounds.left;
          const campScreenY = this.campfire.y - viewBounds.top;
          const campLightRadius = 150;
          fogCtx.save();
          fogCtx.translate(campScreenX, campScreenY);
          fogCtx.scale(1, yScale);
          const campGradient = fogCtx.createRadialGradient(0, 0, 0, 0, 0, campLightRadius);
          campGradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
          campGradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.8)');
          campGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          fogCtx.fillStyle = campGradient;
          fogCtx.beginPath();
          fogCtx.arc(0, 0, campLightRadius, 0, Math.PI * 2);
          fogCtx.fill();
          fogCtx.restore();
        }

        fogCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this._fogCanvas, 0, 0);
      } else {
        ctx.fillStyle = `${this.fog.color} ${totalFogOpacity})`;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    }
    this.weatherSystem?.render?.(ctx, width, height);
  },

  renderCampfireBottom(ctx) {
    const x = this.campfire.x;
    const y = this.campfire.y;
    if (!this.campfire.lit) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 30, y - 15, 60, 15);
      ctx.clip();
      ctx.strokeStyle = '#5a4a3a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x - 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 18, y - 15); ctx.lineTo(x + 18, y - 15); ctx.stroke();
      ctx.strokeStyle = '#4a3a2a';
      ctx.beginPath(); ctx.moveTo(x - 15, y - 7); ctx.lineTo(x - 5, y - 27); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 15, y - 7); ctx.lineTo(x + 5, y - 27); ctx.stroke();
      ctx.restore();
      const time = performance.now() / 1000;
      const blinkAlpha = 0.7 + 0.3 * Math.abs(Math.sin(time * 2.5));
      const dotRadius = 4 + Math.sin(time * 3);
      ctx.save();
      ctx.globalAlpha = blinkAlpha;
      const outerGlow = ctx.createRadialGradient(x, y - 15, 0, x, y - 15, dotRadius + 6);
      outerGlow.addColorStop(0, 'rgba(255, 100, 50, 0.8)');
      outerGlow.addColorStop(0.5, 'rgba(255, 50, 20, 0.4)');
      outerGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath(); ctx.arc(x, y - 15, dotRadius + 6, 0, Math.PI * 2); ctx.fill();
      const dotGradient = ctx.createRadialGradient(x, y - 15, 0, x, y - 15, dotRadius);
      dotGradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
      dotGradient.addColorStop(0.4, 'rgba(255, 120, 60, 1)');
      dotGradient.addColorStop(1, 'rgba(255, 50, 20, 0)');
      ctx.fillStyle = dotGradient;
      ctx.beginPath(); ctx.arc(x, y - 15, dotRadius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 30, y - 15, 60, 15);
    ctx.clip();
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 20, y - 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x - 20, y - 25); ctx.stroke();
    ctx.restore();

    const gradient = ctx.createRadialGradient(x, y - 15, 0, x, y - 15, 60);
    gradient.addColorStop(0, 'rgba(255, 200, 0, 0.4)');
    gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(x, y - 15, 60, 0, Math.PI * 2); ctx.fill();

    const centerGlow = ctx.createRadialGradient(x, y - 15, 0, x, y - 15, 20);
    centerGlow.addColorStop(0, 'rgba(255, 255, 200, 0.6)');
    centerGlow.addColorStop(0.5, 'rgba(255, 150, 0, 0.3)');
    centerGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');
    ctx.fillStyle = centerGlow;
    ctx.beginPath(); ctx.arc(x, y - 15, 20, 0, Math.PI * 2); ctx.fill();
  },
  renderCampfireTop(ctx) {
    const x = this.campfire.x;
    const y = this.campfire.y;
    if (!this.campfire.lit) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 30, y - 45, 60, 30);
      ctx.clip();
      ctx.strokeStyle = '#5a4a3a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x - 20, y - 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 18, y - 15); ctx.lineTo(x + 18, y - 15); ctx.stroke();
      ctx.strokeStyle = '#4a3a2a';
      ctx.beginPath(); ctx.moveTo(x - 15, y - 7); ctx.lineTo(x - 5, y - 27); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 15, y - 7); ctx.lineTo(x + 5, y - 27); ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText('熄灭的火堆', x, y - 55);
      ctx.fillText(InputHints.format('{interact}点燃'), x, y - 40);
      ctx.shadowBlur = 0;
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 30, y - 45, 60, 30);
    ctx.clip();
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x + 20, y - 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x - 20, y - 25); ctx.stroke();
    ctx.restore();

    if (!this.campfire.imageLoaded || !this.campfire.fireImage) return;
    const col = this.campfire.currentFrame % this.campfire.frameCols;
    const row = Math.floor(this.campfire.currentFrame / this.campfire.frameCols);
    const frameX = col * this.campfire.frameWidth;
    const frameY = row * this.campfire.frameHeight;
    const fireWidth = 40;
    const fireHeight = 60;
    const fireX = x - fireWidth / 2;
    const fireY = y - fireHeight - 5;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(
      this.campfire.fireImage,
      frameX, frameY, this.campfire.frameWidth, this.campfire.frameHeight,
      fireX, fireY, fireWidth, fireHeight
    );
    ctx.globalAlpha = 1.0;
  },

  checkCampfireCollision() {
    if (this.flightSystem?.isPlayerFlying?.()) return;
    const transform = this.playerEntity?.getComponent?.('transform');
    if (!transform) return;

    const playerX = transform.position.x;
    const playerY = transform.position.y;
    const playerRadius = 20;
    const collisionWidth = 50 * 0.8;
    const collisionHeight = 30 * 0.75;
    const campfireLeft = this.campfire.x - collisionWidth / 2;
    const campfireRight = this.campfire.x + collisionWidth / 2;
    const campfireTop = this.campfire.y - 15;
    const campfireBottom = campfireTop + collisionHeight;
    const playerLeft = playerX - playerRadius;
    const playerRight = playerX + playerRadius;
    const playerTop = playerY - playerRadius;
    const playerBottom = playerY + playerRadius;

    if (playerRight <= campfireLeft || playerLeft >= campfireRight
      || playerBottom <= campfireTop || playerTop >= campfireBottom) return;
    const dx = playerX - this.campfire.x;
    const dy = playerY - this.campfire.y;
    const overlapX = dx > 0 ? campfireRight - playerLeft : campfireLeft - playerRight;
    const overlapY = dy > 0 ? campfireBottom - playerTop : campfireTop - playerBottom;
    if (Math.abs(overlapX) < Math.abs(overlapY)) transform.position.x += overlapX;
    else transform.position.y += overlapY;
  }
};

export function installS01CampfirePresentation(SceneClass) {
  if (typeof SceneClass !== 'function') throw new TypeError('SceneClass must be a constructor');
  const descriptors = Object.entries(Object.getOwnPropertyDescriptors(s01CampfirePresentationMethods))
    .filter(([name]) => name !== '__proto__');
  const conflict = descriptors.find(([name]) => (
    Object.prototype.hasOwnProperty.call(SceneClass.prototype, name)
  ));
  if (conflict) throw new Error(`S01CampfirePresentation method conflict: ${conflict[0]}`);
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(SceneClass.prototype, name, descriptor);
  }
  return SceneClass;
}

export default installS01CampfirePresentation;