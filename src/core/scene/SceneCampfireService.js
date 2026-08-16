/************************************************************
 * 场景火堆、局部迷雾、粒子、深度绘制与碰撞服务。
 * 只消费调用方传入的世界坐标，不读取或应用 worldOffset。
 ************************************************************/

import { InputHints } from '../input/InputHints.js';
import { cloneCanonicalValue, deepFreeze } from '../CanonicalSnapshot.js';

function requirePositive(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${path} must be a positive number`);
  return number;
}

const campfireFeatureMethods = {
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
    this.fog.opacity = this.initialFogOpacity;
    this.fog.targetOpacity = this.initialFogOpacity;
    this.fog.active = true;
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
    for (const preset of this.particlePresets) {
      mk(preset.rate, preset.vy, preset.life, preset.size, preset.color, preset.alpha);
    }

    this.logger?.debug?.('SceneCampfireService: campfire particle emitters created');
    this.fog.targetOpacity = 0;
    if (emitEvent) this.onIgnited?.();
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
    const time = this.now() / 1000;
    this.campfire.emitters.forEach((emitter, index) => {
      if (!emitter) return;
      const swayAmount = index < 2
        ? (this.random() - 0.5) * 10
        : Math.sin(time * 2 + index * 0.5) * 4 + (this.random() - 0.5) * 2;
      emitter.position.x = this.campfire.x + swayAmount;
      emitter.position.y = this.campfire.y - 13;
      emitter.particleConfig.velocity.x = (this.random() - 0.5) * 10;
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
        if (!this._fogCanvas) this._fogCanvas = this.createCanvas();
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
          const campLightRadius = this.presentation.lightRadius;
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
      const time = this.now() / 1000;
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
      ctx.fillText(this.labels.unlit, x, y - 55);
      ctx.fillText(this.formatHint(this.labels.ignite), x, y - 40);
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
    const fireWidth = this.presentation.fireWidth;
    const fireHeight = this.presentation.fireHeight;
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
    const collisionWidth = this.presentation.collisionWidth;
    const collisionHeight = this.presentation.collisionHeight;
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

export class SceneCampfireService {
  constructor(config = {}) {
    this.initialFogOpacity = 0;
    this.campfire = {
      x: Number(config.position?.x) || 0,
      y: Number(config.position?.y) || 0,
      lit: false,
      emitters: [],
      emitterSmoke: null,
      fireImage: null,
      imageLoaded: false,
      frameWidth: 1,
      frameHeight: 1,
      frameCols: 1,
      frameRows: 1,
      frameCount: 1,
      currentFrame: 0,
      frameTime: 0,
      frameDuration: 1
    };
    this.fog = { opacity: 0, targetOpacity: 0, fadeSpeed: 0, color: '', active: false };
    this.particlePresets = Object.freeze([]);
    this.labels = Object.freeze({});
    this.presentation = Object.freeze({ lightRadius: 1, fireWidth: 1, fireHeight: 1, collisionWidth: 1, collisionHeight: 1 });
    this.configView = null;
    this.formatHint = config.formatHint || (text => InputHints.format(text));
    this.createCanvas = config.createCanvas || (() => {
      if (typeof document !== 'undefined') return document.createElement('canvas');
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1);
      throw new Error('SceneCampfireService requires createCanvas outside browser hosts');
    });
    this.now = config.now || (() => performance.now());
    this.random = config.random || Math.random;
    this.onIgnited = config.onIgnited || null;
    this.logger = config.logger || console;
    this._fogCanvas = null;
    if (config.configView) this.configure(config.configView);
  }

  configure(configView) {
    const source = configView?.get && typeof configView.get === 'function'
      ? configView.get('scene.gameplay.campfire', configView.get('gameplay.campfire'))
      : configView;
    if (!source || typeof source !== 'object') throw new TypeError('campfire config view is required');
    const sprite = source.sprite;
    const fog = source.fog;
    const presentation = source.presentation;
    if (!sprite || !fog || !presentation || !Array.isArray(source.particlePresets) || source.particlePresets.length === 0) {
      throw new TypeError('campfire config view is incomplete');
    }
    const next = deepFreeze(cloneCanonicalValue(source));
    this.initialFogOpacity = Number(next.initialFogOpacity);
    if (!Number.isFinite(this.initialFogOpacity) || this.initialFogOpacity < 0 || this.initialFogOpacity > 1) {
      throw new TypeError('campfire.initialFogOpacity must be between 0 and 1');
    }
    Object.assign(this.campfire, {
      frameWidth: requirePositive(sprite.frameWidth, 'campfire.sprite.frameWidth'),
      frameHeight: requirePositive(sprite.frameHeight, 'campfire.sprite.frameHeight'),
      frameCols: Math.floor(requirePositive(sprite.frameCols, 'campfire.sprite.frameCols')),
      frameRows: Math.floor(requirePositive(sprite.frameRows, 'campfire.sprite.frameRows')),
      frameCount: Math.floor(requirePositive(sprite.frameCount, 'campfire.sprite.frameCount')),
      frameDuration: requirePositive(sprite.frameDuration, 'campfire.sprite.frameDuration')
    });
    this.fog = {
      opacity: this.campfire.lit ? 0 : this.initialFogOpacity,
      targetOpacity: this.campfire.lit ? 0 : this.initialFogOpacity,
      fadeSpeed: requirePositive(fog.fadeSpeed, 'campfire.fog.fadeSpeed'),
      color: String(fog.color),
      active: fog.active !== false
    };
    this.particlePresets = next.particlePresets;
    this.labels = next.labels;
    this.presentation = deepFreeze({
      lightRadius: requirePositive(presentation.lightRadius, 'campfire.presentation.lightRadius'),
      fireWidth: requirePositive(presentation.fireWidth, 'campfire.presentation.fireWidth'),
      fireHeight: requirePositive(presentation.fireHeight, 'campfire.presentation.fireHeight'),
      collisionWidth: requirePositive(presentation.collisionWidth, 'campfire.presentation.collisionWidth'),
      collisionHeight: requirePositive(presentation.collisionHeight, 'campfire.presentation.collisionHeight')
    });
    this.configView = next;
    this._fogCanvas = null;
    return this.configView;
  }

  isConfigured() { return this.configView !== null; }

  _bindRuntime(runtime = {}) {
    this.particleSystem = runtime.particleSystem || this.particleSystem || null;
    this.timeSystem = runtime.timeSystem || null;
    this.weatherSystem = runtime.weatherSystem || null;
    this.playerEntity = runtime.playerEntity || null;
    this.camera = runtime.camera || null;
    this.flightSystem = runtime.flightSystem || null;
    this.logicalWidth = Number(runtime.width) || this.logicalWidth || 1280;
    this.logicalHeight = Number(runtime.height) || this.logicalHeight || 720;
  }

  setPosition(position = {}) {
    if (Number.isFinite(position.x)) this.campfire.x = position.x;
    if (Number.isFinite(position.y)) this.campfire.y = position.y;
    return this.getPosition();
  }

  getPosition() {
    return { x: this.campfire.x, y: this.campfire.y };
  }

  setFireImage(image) {
    this.campfire.fireImage = image || null;
    this.campfire.imageLoaded = !!image;
  }

  isLit() {
    return this.campfire.lit === true;
  }

  snapshot() {
    return { lit: this.isLit() };
  }

  restore({ lit = false } = {}, runtime = {}) {
    this._bindRuntime(runtime);
    return campfireFeatureMethods._restoreCampfireState.call(this, lit === true);
  }

  ignite({ emitEvent = true, runtime = {} } = {}) {
    if (!this.isConfigured()) return false;
    this._bindRuntime(runtime);
    campfireFeatureMethods.lightCampfire.call(this, { emitEvent });
    return true;
  }

  lightCampfire(options = {}) {
    return this.ignite(options);
  }

  update(deltaTime, runtime = {}) {
    if (!this.isConfigured()) return;
    this._bindRuntime(runtime);
    campfireFeatureMethods.updateCampfireAnimation.call(this, deltaTime);
    campfireFeatureMethods.updateFog.call(this, deltaTime);
  }

  renderAtmosphere(ctx, runtime = {}) {
    if (!this.isConfigured()) return;
    this._bindRuntime(runtime);
    return campfireFeatureMethods.renderFogLayer.call(this, ctx);
  }

  appendRenderItems(queue, ctx, runtime = {}) {
    if (!this.isConfigured() || !Array.isArray(queue)) return false;
    this._bindRuntime(runtime);
    queue.push({
      type: 'campfire_bottom', y: this.campfire.y, sortPriority: 0,
      render: () => campfireFeatureMethods.renderCampfireBottom.call(this, ctx)
    });
    queue.push({
      type: 'campfire_top', y: this.campfire.y - 1, sortPriority: 0,
      render: () => campfireFeatureMethods.renderCampfireTop.call(this, ctx)
    });
    return true;
  }

  resolvePlayerCollision(runtime = {}) {
    if (!this.isConfigured()) return;
    this._bindRuntime(runtime);
    return campfireFeatureMethods.checkCampfireCollision.call(this);
  }

  dispose() {
    for (const emitter of this.campfire.emitters || []) emitter.active = false;
    this.campfire.emitters.length = 0;
    if (this.campfire.emitterSmoke) this.campfire.emitterSmoke.active = false;
    this.campfire.emitterSmoke = null;
    this._fogCanvas = null;
  }
}

export default SceneCampfireService;