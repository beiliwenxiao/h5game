/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * ThreeBackend.js
 * three.js 渲染后端（M5 骨架）
 *
 * 职责：
 *  - WebGLRenderer 初始化
 *  - 一个 Scene + OrthographicCamera（默认等距）
 *  - 地面、基础灯光
 *  - 实体 billboard 精灵渲染
 *  - 粒子（Points）
 *  - overlay canvas 提供 HUD 2D 上下文
 */

import * as THREE from 'three';
import { IRenderBackend } from './IRenderBackend.js';
import { Camera3DAdapter } from './Camera3DAdapter.js';
import { Picker3D } from './Picker3D.js';
import { ParticleRenderer3D } from './ParticleRenderer3D.js';
import { createEntityView, updateEntityView } from './EntityView3D.js';
import { DEFAULT_BACKEND_CONFIG } from './BackendConfig.js';

export class ThreeBackend extends IRenderBackend {
  constructor() {
    super();
    this.mode = '3d';
    /** 暴露 THREE 引用，方便外部创建 3D 对象 */
    this.THREE = THREE;
    /** @type {THREE.WebGLRenderer|null} */
    this.renderer = null;
    /** @type {THREE.Scene|null} */
    this.scene = null;
    /** @type {Map<string, THREE.Object3D>} */
    this.entityViews = new Map();
    /** @type {HTMLCanvasElement|null} */
    this.hudCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this.hudCtx = null;
    /** @type {Map<string, THREE.Group>} */
    this.floorGroups = new Map();
    this.currentFloorId = 'ground';
    this.config = { ...DEFAULT_BACKEND_CONFIG };
    this.gameWidth = 1280;
    this.gameHeight = 720;
    this.assetManager = null;
    this._disposed = false;
  }

  async init(canvas, config = {}) {
    if (!canvas) throw new Error('ThreeBackend.init: canvas is required');
    this.canvas = canvas;
    this.config = { ...DEFAULT_BACKEND_CONFIG, ...config };
    this.gameWidth = config.gameWidth ?? this.gameWidth;
    this.gameHeight = config.gameHeight ?? this.gameHeight;
    this.assetManager = config.assetManager ?? null;

    // WebGL 能力检测
    const probe = ThreeBackend.probeWebGL();
    if (!probe.supported) {
      throw new Error(`ThreeBackend.init: WebGL not supported (${probe.reason})`);
    }
    if (probe.softwareOnly && config.allowSoftwareWebGL !== true) {
      throw new Error(
        'ThreeBackend.init: WebGL is software-only (no hardware acceleration). ' +
        'Pass { allowSoftwareWebGL: true } to force, or fall back to 2D backend.'
      );
    }
    this._webglProbe = probe;

    // renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(this.gameWidth, this.gameHeight, false);
    this.renderer.setClearColor(0x1a1a2e, 1);

    // scene
    this.scene = new THREE.Scene();
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(1, 2, 1).multiplyScalar(100);
    this.scene.add(dir);

    // 默认 ground 群组
    const groundGroup = new THREE.Group();
    groundGroup.name = 'floor:ground';
    this.scene.add(groundGroup);
    this.floorGroups.set('ground', groundGroup);

    // 相机
    this.camera = new Camera3DAdapter({
      width: this.gameWidth,
      height: this.gameHeight,
      camera: this.config.three?.camera ?? 'ortho',
      pitchDeg: this.config.three?.pitchDeg ?? 30,
      yawDeg: this.config.three?.yawDeg ?? 45
    });

    // 粒子渲染器
    this.particleRenderer = new ParticleRenderer3D(this.scene);

    // Picker
    this.picker = new Picker3D(this.camera, {
      getEntityView3D: (e) => this.entityViews.get(e.id) ?? null
    });

    // HUD overlay
    this._ensureHudOverlay();
    
    // 默认创建一个大尺寸地面（无 mapData 时也能看见地面）
    this._ensureDefaultGround();
  }
  
  /**
   * 创建默认地面（绿色平面），方便没有提供 mapData 的场景也有视觉参考
   */
  _ensureDefaultGround() {
    if (this._defaultGround) return;
    const size = 2000;
    // 地面平面
    const geom = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x2a4a2a,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -1;
    const ground = this.floorGroups.get('ground');
    if (ground) ground.add(mesh);
    this._defaultGround = mesh;
    
    // 网格线（每 80 单位一条线）
    const grid = new THREE.GridHelper(size, size / 80, 0x3a6a3a, 0x336633);
    grid.position.y = 0;
    grid.material.opacity = 0.4;
    grid.material.transparent = true;
    if (ground) ground.add(grid);
  }

  /**
   * 创建独立 overlay canvas 叠加在 WebGL canvas 上层
   * 保持 HUD / UI 行为与 2D 后端一致
   */
  _ensureHudOverlay() {
    if (this.hudCanvas) return;
    try {
      const parent = this.canvas.parentNode || (typeof document !== 'undefined' ? document.body : null);
      if (!parent) return;
      const hud = document.createElement('canvas');
      hud.width = this.canvas.width;
      hud.height = this.canvas.height;
      hud.style.position = 'absolute';
      const rect = this.canvas.getBoundingClientRect?.();
      if (rect) {
        hud.style.left = this.canvas.style.left || (this.canvas.offsetLeft + 'px');
        hud.style.top = this.canvas.style.top || (this.canvas.offsetTop + 'px');
        hud.style.width = this.canvas.style.width || rect.width + 'px';
        hud.style.height = this.canvas.style.height || rect.height + 'px';
      }
      hud.style.pointerEvents = 'none';
      hud.className = 'kiro-hud-overlay';
      parent.appendChild(hud);
      this.hudCanvas = hud;
      this.hudCtx = hud.getContext('2d');
    } catch (_) {
      // 非 DOM 环境（测试）：忽略
    }
  }

  resize(windowWidth, windowHeight) {
    if (!this.renderer || !this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const scaleX = windowWidth / this.gameWidth;
    const scaleY = windowHeight / this.gameHeight;
    const scale = Math.min(scaleX, scaleY);

    // CSS 显示尺寸
    this.canvas.style.width = `${this.gameWidth * scale}px`;
    this.canvas.style.height = `${this.gameHeight * scale}px`;

    // 渲染器像素尺寸（保留游戏逻辑尺寸）
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.gameWidth, this.gameHeight, false);

    if (this.camera) this.camera.setSize(this.gameWidth, this.gameHeight);

    if (this.hudCanvas) {
      this.hudCanvas.width = this.gameWidth * dpr;
      this.hudCanvas.height = this.gameHeight * dpr;
      this.hudCanvas.style.width = this.canvas.style.width;
      this.hudCanvas.style.height = this.canvas.style.height;
      this.hudCtx = this.hudCanvas.getContext('2d');
      this.hudCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.hudCtx.scale(dpr, dpr);
    }
  }

  dispose() {
    this._disposed = true;
    try {
      this.particleRenderer?.dispose?.();
      this.renderer?.dispose?.();
      if (this.hudCanvas && this.hudCanvas.parentNode) {
        this.hudCanvas.parentNode.removeChild(this.hudCanvas);
      }
    } catch (_) { /* noop */ }
    this.entityViews.clear();
    this.floorGroups.clear();
  }

  beginFrame() {
    if (this.hudCtx && this.hudCanvas) {
      // 清空 HUD 层（世界层由 renderer.render 覆盖）
      this.hudCtx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
    }
  }

  endFrame() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera.native);
    }
  }

  renderEntities(entities, _cameraAdapter) {
    if (!this.scene || !entities) return;

    // 相机跟随与更新
    if (this.camera) this.camera.update(0);

    const usedIds = new Set();
    for (const e of entities) {
      if (!e || e.active === false) continue;
      usedIds.add(e.id);

      let view = this.entityViews.get(e.id);
      
      // 如果 view 是占位（无贴图）但现在图片已加载，重建
      if (view && !view.userData.hasTexture && this.assetManager) {
        const sprite = e.getComponent?.('sprite');
        if (sprite) {
          const img = this.assetManager.getAsset?.(sprite.spriteSheet) 
                   || this.assetManager.getImage?.(sprite.spriteSheet);
          if (img && (img instanceof HTMLCanvasElement || (img.complete && img.naturalWidth > 0))) {
            // 图片已就绪，重建 view
            if (view.parent) view.parent.remove(view);
            view = null;
            this.entityViews.delete(e.id);
          }
        }
      }
      
      if (!view) {
        view = createEntityView(e, this.assetManager);
        this.entityViews.set(e.id, view);
        const floorId = e.getComponent?.('transform')?.floorId ?? 'ground';
        this._ensureFloorGroup(floorId).add(view);
      }
      updateEntityView(view, e, this.camera?.native);
    }

    // 清理已消失的实体 view
    for (const [id, view] of this.entityViews) {
      if (!usedIds.has(id)) {
        if (view.parent) view.parent.remove(view);
        this.entityViews.delete(id);
      }
    }
  }

  renderParticles(particleSystem /*, camera */) {
    this.particleRenderer?.render(particleSystem);
  }

  renderEffects(effects /*, camera */) {
    // M5 骨架：特效先走 HUD 2D 层绘制（保留观感）
    if (!effects || !this.hudCtx) return;
    try {
      if (typeof effects.render === 'function') {
        effects.render(this.hudCtx, this.camera?.native ?? this.camera);
      }
    } catch (_) { /* noop */ }
  }

  getHUDContext() {
    return this.hudCtx;
  }

  setMapData(mapData) {
    if (!mapData || !Array.isArray(mapData.floors)) return;
    for (const f of mapData.floors) {
      this._ensureFloorGroup(f.id, f.elevation ?? 0);
    }
    this.currentFloorId = mapData.defaultFloor ?? 'ground';
  }

  setCurrentFloor(floorId) {
    this.currentFloorId = floorId;
  }

  _ensureFloorGroup(id, elevation = 0) {
    let g = this.floorGroups.get(id);
    if (!g) {
      g = new THREE.Group();
      g.name = `floor:${id}`;
      g.position.y = elevation;
      this.scene.add(g);
      this.floorGroups.set(id, g);
    }
    return g;
  }

  /**
   * 检测 WebGL 是否可用以及是否使用硬件加速
   * @returns {{ supported: boolean, softwareOnly: boolean, reason: string, renderer?: string, vendor?: string }}
   */
  static probeWebGL() {
    if (typeof document === 'undefined') {
      return { supported: false, softwareOnly: false, reason: 'no-dom' };
    }
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl') || probe.getContext('experimental-webgl');
      if (!gl) {
        return { supported: false, softwareOnly: false, reason: 'webgl-unavailable' };
      }
      // 通过 WEBGL_debug_renderer_info 拿到底层 renderer 字符串
      let rendererStr = '';
      let vendorStr = '';
      try {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
          vendorStr = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '');
        }
      } catch (_) { /* noop */ }
      // 软件渲染特征匹配
      const softwarePatterns = /(SwiftShader|Software|llvmpipe|Microsoft Basic Render|ANGLE \(.+ Software)/i;
      const softwareOnly = softwarePatterns.test(rendererStr) || softwarePatterns.test(vendorStr);
      return {
        supported: true,
        softwareOnly,
        reason: softwareOnly ? 'software-only' : 'hardware-accelerated',
        renderer: rendererStr,
        vendor: vendorStr
      };
    } catch (e) {
      return { supported: false, softwareOnly: false, reason: 'probe-error: ' + e.message };
    }
  }
}

export default ThreeBackend;
