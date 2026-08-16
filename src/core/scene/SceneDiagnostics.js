/**
 * SceneDiagnostics - 场景调试面板与性能观测生命周期。
 *
 * 性能采样状态继续投影到 scene，保持现有帧/渲染管线契约；具体实现集中在此。
 */
import { DebugPanel } from '../../ui/DebugPanel.js';
import { normalizeRuntimeDebugMode } from '../CanonicalSnapshot.js';
import { PerformanceOptimizer } from '../../systems/PerformanceOptimizer.js';
import { PerformanceMonitor } from '../PerformanceMonitor.js';

const DRAW_METHODS = Object.freeze([
  'drawImage', 'fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText'
]);

export class SceneDiagnostics {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.runtimeConfig = options.runtimeConfig || null;
    this.records = [];
    scene.debugPanel = null;
    scene.performanceOptimizer = new PerformanceOptimizer({
      cellSize: options.cellSize || 128,
      spatialGrid: true,
      batching: true,
      pooling: true,
      lod: true
    });
    scene.performanceMonitor = new PerformanceMonitor({
      enabled: false,
      showGraph: false
    });
    scene._drawCallCount = 0;
    scene._drawCallProxied = false;
    scene._drawCallOriginals = null;
    scene._drawCallProxyContext = null;
    this._terrainCollisionSignature = null;
    this._collisionDebugRenderCount = 0;
    this._collisionEntered = false;
    this._noTerrainLogged = false;
    this._collisionInitLogged = false;
  }

  setRuntimeConfig(runtimeConfig = null) {
    this.runtimeConfig = runtimeConfig;
    const enabled = normalizeRuntimeDebugMode(runtimeConfig?.debug);
    this.scene.debugMode = enabled;
    if (!enabled) this.scene.debugPanel?.hide?.();
    return enabled;
  }

  isDebugEnabled() {
    return normalizeRuntimeDebugMode(this.runtimeConfig?.debug);
  }

  recordTriggerFailure(envelope, { openPanel = true } = {}) {
    if (!this.isDebugEnabled()) return false;
    this.records.push(envelope);
    const panel = this._ensureDebugPanel();
    panel.setDiagnosticRecords(this.records);
    panel.recordFailure(envelope);
    if (openPanel) panel.show();
    return true;
  }

  getRecords() {
    return this.records.slice();
  }

  _ensureDebugPanel() {
    const scene = this.scene;
    if (!scene.debugPanel) {
      scene.debugPanel = new DebugPanel({
        getScene: () => scene,
        getSceneManager: () => {
          const engine = typeof window !== 'undefined' ? window.gameEngine : null;
          return engine?.sceneManager || scene.sceneManager || null;
        },
        isDebugEnabled: () => this.isDebugEnabled()
      });
    }
    scene.debugPanel.setDiagnosticRecords(this.records);
    return scene.debugPanel;
  }

  togglePerformance() {
    const monitor = this.scene.performanceMonitor;
    monitor.toggle();
    console.log('性能监控:', monitor.enabled ? '开启' : '关闭');
    return monitor.enabled;
  }

  toggleDebugPanel() {
    const scene = this.scene;
    if (!this.isDebugEnabled()) {
      scene.debugPanel?.hide?.();
      return false;
    }
    console.log('[BaseGameScene][DebugPanel] 收到切换请求', {
      scene: scene.name,
      isActive: scene.isActive,
      isPaused: scene.isPaused,
      panelExists: !!scene.debugPanel,
      visibleBefore: scene.debugPanel?.visible ?? false,
      elementConnectedBefore: scene.debugPanel?._el?.isConnected || false,
      existingDomCount: typeof document !== 'undefined'
        ? document.querySelectorAll('#debug-panel').length : 0
    });

    const panel = this._ensureDebugPanel();
    if (!scene.debugPanel.visible) console.log('[BaseGameScene][DebugPanel] 已创建或复用 DebugPanel 实例');

    const visible = panel.toggle();
    console.log('[BaseGameScene][DebugPanel] 切换调用结束', {
      visibleAfter: scene.debugPanel.visible,
      elementConnectedAfter: scene.debugPanel._el?.isConnected || false,
      domElement: typeof document !== 'undefined'
        ? document.getElementById('debug-panel') : null
    });
    return visible;
  }

  setupDrawCallCounter(ctx) {
    const scene = this.scene;
    if (scene._drawCallProxied) return;
    scene._drawCallOriginals = new Map();
    scene._drawCallProxyContext = ctx;
    for (let i = 0; i < DRAW_METHODS.length; i++) {
      const method = DRAW_METHODS[i];
      const original = ctx[method];
      if (!original) continue;
      scene._drawCallOriginals.set(method, original);
      ctx[method] = (...args) => {
        scene._drawCallCount++;
        return original.apply(ctx, args);
      };
    }
    scene._drawCallProxied = true;
  }

  teardownDrawCallCounter() {
    const scene = this.scene;
    const context = scene._drawCallProxyContext;
    if (!scene._drawCallProxied || !context) return;
    for (const [method, original] of scene._drawCallOriginals || []) {
      context[method] = original;
    }
    scene._drawCallOriginals = null;
    scene._drawCallProxyContext = null;
    scene._drawCallProxied = false;
  }
  observeTerrainCollision({ terrains = [], terrain = null, playerEntity = null, label = 'Scene' } = {}) {
    const state = terrains.map((entry, index) => ({
      index,
      sceneId: entry?._editorSceneId || null,
      worldOffset: entry?.worldOffset || null,
      collisionShapeCount: entry?._collisionShapes?.length || 0
    }));
    const signature = JSON.stringify(state);
    if (signature === this._terrainCollisionSignature) return false;
    const transform = playerEntity?.getComponent?.('transform');
    console.log(`[${label}][Collision] 地形碰撞数据状态变化`, {
      terrains: state,
      mainTerrainSceneId: terrain?._editorSceneId || null,
      playerPosition: transform
        ? { x: transform.position.x, y: transform.position.y }
        : null
    });
    this._terrainCollisionSignature = signature;
    return true;
  }

  renderCollisionShapes(ctx, {
    enabled = false,
    camera = null,
    terrains = [],
    label = 'Scene'
  } = {}) {
    if (!enabled || !camera || !Array.isArray(terrains)) return false;

    this._collisionDebugRenderCount++;
    if (this._collisionDebugRenderCount % 120 === 1) {
      const shapeInfo = terrains.map((terrain, index) => {
        const first = terrain?._collisionShapes?.[0];
        return `[${index}] ${terrain?._editorSceneId}: ${terrain?._collisionShapes?.length || 0} shapes`
          + (first ? `, first.points[0..1]=${JSON.stringify(first.points?.slice(0, 2))}` : '');
      });
      const bounds = camera.getViewBounds();
      console.log(`[${label}][CollisionDebug]`, shapeInfo.join(' | '),
        `| view: L=${Math.round(bounds.left)} T=${Math.round(bounds.top)} R=${Math.round(bounds.right)} B=${Math.round(bounds.bottom)}`);
    }

    ctx.save();
    const viewBounds = camera.getViewBounds();
    ctx.translate(-viewBounds.left, -viewBounds.top);
    for (const terrain of terrains) {
      const shapes = terrain?._collisionShapes;
      if (!shapes || shapes.length === 0) continue;
      for (const shape of shapes) {
        if (shape.shapeType === 'polygon' && Array.isArray(shape.points) && shape.points.length > 2) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0][0], shape.points[0][1]);
          for (let index = 1; index < shape.points.length; index++) {
            ctx.lineTo(shape.points[index][0], shape.points[index][1]);
          }
          ctx.closePath();
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ff9800';
          ctx.fill();
          ctx.strokeStyle = '#ff3b30';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (shape.shapeType === 'rect' || (shape.x !== undefined && shape.width)) {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ff9800';
          ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
          ctx.strokeStyle = '#ff3b30';
          ctx.lineWidth = 2;
          ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        } else if (shape.shapeType === 'ellipse' || shape.shapeType === 'circle') {
          const cx = (shape.x || 0) + (shape.width || 0) / 2;
          const cy = (shape.y || 0) + (shape.height || 0) / 2;
          const rx = (shape.width || 0) / 2;
          const ry = (shape.height || 0) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ff9800';
          ctx.fill();
          ctx.strokeStyle = '#ff3b30';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return true;
  }

  checkTerrainCollision({
    terrainBinding = null,
    terrains = [],
    terrain = null,
    secondaryTerrain = null,
    playerEntity = null,
    label = 'Scene'
  } = {}) {
    if (!this._collisionEntered) {
      console.log(`%c[${label}] checkTerrainCollision 进入方法体`, 'color:lime;font-size:14px');
      this._collisionEntered = true;
    }
    if (terrains.length === 0) {
      if (!this._noTerrainLogged) {
        console.warn(`[${label}] checkTerrainCollision: 地形未加载`);
        this._noTerrainLogged = true;
      }
      return false;
    }
    const current = terrain || terrains[0];
    if (!this._collisionInitLogged) {
      console.log(`[${label}] checkTerrainCollision, collisionShapes:`, current?._collisionShapes?.length,
        'act1 shapes:', secondaryTerrain?._collisionShapes?.length);
      for (let index = 0; index < Math.min(3, current?._collisionShapes?.length || 0); index++) {
        const shape = current._collisionShapes[index];
        console.log(`[${label}] shape[${index}]: type=${shape.shapeType}, points前3个=`,
          shape.points ? shape.points.slice(0, 3) : 'NO POINTS');
      }
      const transform = playerEntity?.getComponent?.('transform');
      console.log(`[${label}] 玩家位置:`, transform
        ? `(${Math.round(transform.position.x)},${Math.round(transform.position.y)})`
        : 'null');
      this._collisionInitLogged = true;
    }
    terrainBinding?.checkTerrainCollision?.();
    return true;
  }


  estimateTextureMemory() {
    const scene = this.scene;
    let bytes = 0;
    const terrains = scene._terrains || (scene.terrain ? [scene.terrain] : []);
    for (let i = 0; i < terrains.length; i++) {
      const terrain = terrains[i];
      if (terrain._combinedGroundCache) {
        bytes += terrain._combinedGroundCache.width * terrain._combinedGroundCache.height * 4;
      }
      if (terrain._groundDecoCache) {
        bytes += terrain._groundDecoCache.width * terrain._groundDecoCache.height * 4;
      }
      if (terrain._bgImageCache) {
        bytes += terrain._bgImageCache.width * terrain._bgImageCache.height * 4;
      }
      const images = terrain.images || {};
      const keys = Object.keys(images);
      for (let j = 0; j < keys.length; j++) {
        const image = images[keys[j]];
        if (image?.naturalWidth) bytes += image.naturalWidth * image.naturalHeight * 4;
      }
    }
    const mapCache = scene.minimap?._mapCache;
    if (mapCache) bytes += mapCache.width * mapCache.height * 4;
    return bytes;
  }

  dispose() {
    this.teardownDrawCallCounter();
    const scene = this.scene;
    if (!scene.debugPanel) return;
    console.log('[BaseGameScene][DebugPanel] 场景退出，清理调试面板', {
      visible: scene.debugPanel.visible,
      elementConnected: scene.debugPanel._el?.isConnected || false
    });
    scene.debugPanel.hide();
    scene.debugPanel = null;
  }
}

export default SceneDiagnostics;