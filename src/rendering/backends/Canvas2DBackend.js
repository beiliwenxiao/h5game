/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * Canvas2DBackend.js
 * Canvas 2D 渲染后端
 *
 * 职责：
 *  - 初始化主 canvas 的 2D 上下文（含 DPR）
 *  - 包装现有 RenderSystem / SpriteRenderer / ParticleSystem / SkillEffects 的绘制
 *  - 提供 camera / picker / HUD context 的统一访问
 *
 * 阶段 A：视觉表现与改造前完全一致（零回归目标）。
 */

import { IRenderBackend } from './IRenderBackend.js';
import { Camera2DAdapter } from './Camera2DAdapter.js';
import { Picker2D } from './Picker2D.js';
import { ParticleRenderer2D } from './ParticleRenderer2D.js';
import { RenderSystem } from '../RenderSystem.js';
import { DEFAULT_BACKEND_CONFIG } from './BackendConfig.js';

export class Canvas2DBackend extends IRenderBackend {
  constructor() {
    super();
    this.mode = '2d';
    /** @type {CanvasRenderingContext2D|null} */
    this.ctx = null;
    /** @type {RenderSystem|null} */
    this.renderSystem = null;
    /** @type {ParticleRenderer2D|null} */
    this.particleRenderer = null;
    /** @type {number} */
    this.dpr = 1;
    /** @type {number} */
    this.gameWidth = 1280;
    /** @type {number} */
    this.gameHeight = 720;
    this.config = { ...DEFAULT_BACKEND_CONFIG };
    this._disposed = false;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./BackendConfig.js').DEFAULT_BACKEND_CONFIG} config
   */
  async init(canvas, config = {}) {
    if (!canvas) throw new Error('Canvas2DBackend.init: canvas is required');
    this.canvas = canvas;
    this.config = { ...DEFAULT_BACKEND_CONFIG, ...config };
    this.gameWidth = config.gameWidth ?? this.gameWidth;
    this.gameHeight = config.gameHeight ?? this.gameHeight;

    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas2DBackend.init: failed to get 2d context');

    // 相机（默认游戏尺寸）
    this.camera = new Camera2DAdapter(null, {
      width: this.gameWidth,
      height: this.gameHeight
    });

    // 渲染系统（接入游戏尺寸）
    this.renderSystem = new RenderSystem(
      this.ctx,
      config.assetManager ?? null,
      this.gameWidth,
      this.gameHeight
    );
    // 复用适配器中的 native Camera
    this.renderSystem.camera = this.camera.native;

    // 拾取
    this.picker = new Picker2D(this.camera);

    // 粒子渲染
    this.particleRenderer = new ParticleRenderer2D(this.ctx);
  }

  /**
   * 调整尺寸（处理 DPR）
   */
  resize(windowWidth, windowHeight) {
    if (!this.canvas || !this.ctx) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.dpr = dpr;

    const scaleX = windowWidth / this.gameWidth;
    const scaleY = windowHeight / this.gameHeight;
    const scale = Math.min(scaleX, scaleY);

    // CSS 尺寸
    this.canvas.style.width = `${this.gameWidth * scale}px`;
    this.canvas.style.height = `${this.gameHeight * scale}px`;

    // 实际像素
    this.canvas.width = this.gameWidth * dpr;
    this.canvas.height = this.gameHeight * dpr;

    // 重置变换后再缩放
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.ctx.textRendering = 'optimizeLegibility';

    // 相机尺寸保持游戏逻辑尺寸
    if (this.camera) this.camera.setSize(this.gameWidth, this.gameHeight);
  }

  dispose() {
    this._disposed = true;
    this.ctx = null;
    this.renderSystem = null;
    this.particleRenderer = null;
  }

  beginFrame() {
    if (!this.ctx) return;
    // 清屏（RenderSystem.render 也会清，但 UI 场景不一定调 renderSystem）
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  endFrame() {
    // Canvas 2D 无需 flush
  }

  /**
   * 渲染实体
   * @param {Array} entities
   */
  renderEntities(entities, _camera) {
    if (!this.renderSystem || !entities) return;
    // RenderSystem 内部自带相机与分层渲染
    this.renderSystem.render(entities);
  }

  renderParticles(particleSystem, camera) {
    if (!this.particleRenderer) return;
    this.particleRenderer.render(particleSystem, camera ?? this.camera);
  }

  renderEffects(effects, camera) {
    if (!effects || !this.ctx) return;
    // 期望 effects 是具备 render(ctx, camera) 的对象
    try {
      const nativeCamera = (camera && camera.native) || (this.camera && this.camera.native) || camera;
      if (typeof effects.render === 'function') {
        effects.render(this.ctx, nativeCamera);
      }
    } catch (err) {
      console.warn('Canvas2DBackend.renderEffects threw', err);
    }
  }

  /** HUD 直接用主 canvas 2D context */
  getHUDContext() {
    return this.ctx;
  }

  /**
   * 直接暴露原始 2D context（旧代码过渡期使用）
   */
  get2DContext() {
    return this.ctx;
  }
}

export default Canvas2DBackend;
