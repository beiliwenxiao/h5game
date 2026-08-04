/**
 * SceneDiagnostics - 场景调试面板与性能观测生命周期。
 *
 * 性能采样状态继续投影到 scene，保持现有帧/渲染管线契约；具体实现集中在此。
 */
import { DebugPanel } from '../../ui/DebugPanel.js';
import { PerformanceOptimizer } from '../../systems/PerformanceOptimizer.js';
import { PerformanceMonitor } from '../PerformanceMonitor.js';

const DRAW_METHODS = Object.freeze([
  'drawImage', 'fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText'
]);

export class SceneDiagnostics {
  constructor(scene, options = {}) {
    this.scene = scene;
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
  }

  togglePerformance() {
    const monitor = this.scene.performanceMonitor;
    monitor.toggle();
    console.log('性能监控:', monitor.enabled ? '开启' : '关闭');
    return monitor.enabled;
  }

  toggleDebugPanel() {
    const scene = this.scene;
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

    if (!scene.debugPanel) {
      scene.debugPanel = new DebugPanel({
        getScene: () => scene,
        getSceneManager: () => {
          const engine = typeof window !== 'undefined' ? window.gameEngine : null;
          return engine?.sceneManager || scene.sceneManager || null;
        }
      });
      console.log('[BaseGameScene][DebugPanel] 已创建 DebugPanel 实例');
    }

    scene.debugPanel.toggle();
    console.log('[BaseGameScene][DebugPanel] 切换调用结束', {
      visibleAfter: scene.debugPanel.visible,
      elementConnectedAfter: scene.debugPanel._el?.isConnected || false,
      domElement: typeof document !== 'undefined'
        ? document.getElementById('debug-panel') : null
    });
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