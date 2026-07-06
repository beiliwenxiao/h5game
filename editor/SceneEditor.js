/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 */

/**
 * SceneEditor - 场景编辑器主入口
 * 
 * 功能模块：
 * - SceneEditorUI       — UI 面板初始化与属性面板更新
 * - SceneEditorCanvas   — Canvas 渲染
 * - SceneEditorInteraction — 鼠标/键盘事件处理
 * - SceneEditorLayers   — 图层管理
 * - SceneEditorAssets   — 资源管理（图集、切片、拖放）
 * - SceneEditorHistory  — 撤销/重做/导入导出
 * 
 * 所有默认值从 config/editor-defaults.json 加载
 */

import { SceneEditorUI } from './SceneEditorUI.js';
import { SceneEditorCanvas } from './SceneEditorCanvas.js';
import { SceneEditorInteraction } from './SceneEditorInteraction.js';
import { SceneEditorLayers } from './SceneEditorLayers.js';
import { SceneEditorAssets } from './SceneEditorAssets.js';
import { SceneEditorHistory } from './SceneEditorHistory.js';

// 编辑器默认配置（运行时从 JSON 加载覆盖）
let _editorDefaults = null;

/**
 * 加载编辑器默认配置
 * @returns {Promise<Object>}
 */
async function loadEditorDefaults() {
  if (_editorDefaults) return _editorDefaults;
  try {
    const resp = await fetch('./config/editor-defaults.json');
    _editorDefaults = await resp.json();
  } catch (e) {
    console.warn('加载编辑器默认配置失败，使用内置默认值:', e);
    _editorDefaults = {
      editor: { width: 1280, height: 720, gridSize: 32, showGrid: true, showBackground: true },
      scene: {
        defaultName: '新场景',
        width: 1280,
        height: 720,
        backgroundColor: '#2a3a1a',
        layers: [
          { id: 'layer_bg', name: '背景层', visible: true, locked: false },
          { id: 'layer_fill', name: '背景填充层', visible: true, locked: false },
          { id: 'layer_deco', name: '装饰层', visible: true, locked: false },
          { id: 'layer_entity', name: '实体层', visible: true, locked: false }
        ]
      },
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      history: { maxSize: 50 }
    };
  }
  return _editorDefaults;
}

export { loadEditorDefaults };

export class SceneEditor {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    // 默认配置从 JSON 加载（同步回退）
    const defaults = _editorDefaults || {};
    const editorCfg = defaults.editor || {};
    const sceneCfg = defaults.scene || {};
    const viewportCfg = defaults.viewport || {};
    const historyCfg = defaults.history || {};

    this.options = {
      width: options.width || editorCfg.width || 1280,
      height: options.height || editorCfg.height || 720,
      gridSize: options.gridSize || editorCfg.gridSize || 32,
      showGrid: options.showGrid !== undefined ? options.showGrid : (editorCfg.showGrid !== false),
      showBackground: options.showBackground !== undefined ? options.showBackground : (editorCfg.showBackground !== false),
      ...options
    };

    // 场景数据
    const defaultLayers = (sceneCfg.layers || [
      { id: 'layer_bg', name: '背景层', visible: true, locked: false },
      { id: 'layer_fill', name: '背景填充层', visible: true, locked: false },
      { id: 'layer_deco', name: '装饰层', visible: true, locked: false },
      { id: 'layer_entity', name: '实体层', visible: true, locked: false }
    ]).map(l => ({ ...l, objects: [] }));

    this.sceneData = {
      id: null,
      name: sceneCfg.defaultName || '新场景',
      width: this.options.width,
      height: this.options.height,
      backgroundColor: sceneCfg.backgroundColor || '#2a3a1a',
      layers: defaultLayers,
      decorations: [],
      colliders: []
    };

    // 状态
    this.activeLayerIndex = 0;
    this.selectedObjects = [];
    this.loadedImages = new Map();
    this.selectedSlice = null;
    this.draggingSlice = null;

    // 视口控制
    this.viewport = {
      scale: viewportCfg.scale || 1,
      offsetX: viewportCfg.offsetX || 0,
      offsetY: viewportCfg.offsetY || 0
    };

    // 交互状态
    this.interaction = {
      mode: 'select',
      isDragging: false,
      isResizing: false,
      isRotating: false,
      dragStart: { x: 0, y: 0 },
      objectStart: { x: 0, y: 0 }
    };

    // 回调
    this.onSceneChange = null;
    this.onObjectSelect = null;
    this.onOpenSlicer = null;

    // 初始化标志
    this.initialized = false;

    // === 初始化子模块 ===
    this.layers = new SceneEditorLayers(this);
    this.history = new SceneEditorHistory(this);
    this.history.setMaxSize(historyCfg.maxSize || 50);
    this.ui = new SceneEditorUI(this);
    this.canvas = new SceneEditorCanvas(this);
    this.interactionModule = new SceneEditorInteraction(this);
    this.assets = new SceneEditorAssets(this);

    // 初始化 UI 和事件
    this.ui.initUI();
    this._bindEvents();

    // 监听 resize
    window.addEventListener('resize', () => {
      if (this.initialized) {
        this.ui.fitToContainer();
        this.render();
      }
    });
  }

  /**
   * 渲染（委托给 canvas 模块）
   */
  render() {
    this.canvas.render();
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    const container = document.getElementById('editor-canvas-container');

    // 工具按钮
    document.getElementById('editor-undo').addEventListener('click', () => this.history.undo());
    document.getElementById('editor-redo').addEventListener('click', () => this.history.redo());
    document.getElementById('editor-select').addEventListener('click', () => this.ui.setMode('select'));
    document.getElementById('editor-pan').addEventListener('click', () => this.ui.setMode('pan'));
    document.getElementById('editor-place').addEventListener('click', () => this.ui.setMode('place'));

    // 添加椭圆
    document.getElementById('editor-add-ellipse').addEventListener('click', () => {
      const data = this.sceneData;
      const cx = data.centerX || data.width / 2;
      const cy = data.centerY || data.height / 2;
      const rx = 200;
      const ry = 130;
      const obj = this.ui.addObject({
        type: 'shape',
        shapeType: 'ellipse',
        name: '椭圆_' + Date.now().toString(36),
        x: cx - rx,
        y: cy - ry,
        width: rx * 2,
        height: ry * 2,
        fillMode: 'color',
        fill: '#3a5a2a',
        opacity: 1,
        edgeFade: 0,
        stroke: '',
        strokeWidth: 0,
        collide: false
      });
      if (obj) {
        this.selectedObjects = [obj];
        this.ui.updateObjectProperties();
        this.ui.showToast('已添加椭圆');
      }
    });

    // 场景设置
    document.getElementById('editor-scene-name').addEventListener('input', (e) => {
      this.sceneData.name = e.target.value;
    });
    const sceneIdInput = document.getElementById('editor-scene-id');
    if (sceneIdInput) {
      sceneIdInput.addEventListener('input', (e) => {
        this.sceneData.id = e.target.value.trim();
      });
    }
    document.getElementById('editor-bg-color').addEventListener('input', (e) => {
      this.sceneData.backgroundColor = e.target.value;
      this.render();
    });
    document.getElementById('editor-show-grid').addEventListener('change', (e) => {
      this.options.showGrid = e.target.checked;
      this.render();
    });
    document.getElementById('editor-show-background').addEventListener('change', (e) => {
      this.options.showBackground = e.target.checked;
      this.render();
    });
    document.getElementById('editor-scene-width').addEventListener('change', (e) => {
      this.sceneData.width = parseInt(e.target.value) || 1280;
      this.ui._initCanvas();
    });
    document.getElementById('editor-scene-height').addEventListener('change', (e) => {
      this.sceneData.height = parseInt(e.target.value) || 720;
      this.ui._initCanvas();
    });

    // 保存和导入导出
    document.getElementById('editor-save').addEventListener('click', () => this.history.save());
    document.getElementById('editor-export').addEventListener('click', () => this.history.exportJSON());
    document.getElementById('editor-import').addEventListener('click', () => {
      document.getElementById('editor-json-input').click();
    });
    document.getElementById('editor-json-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.history.importJSON(file);
    });

    // 图片资源
    document.getElementById('editor-add-image').addEventListener('click', () => {
      document.getElementById('editor-image-input').click();
    });
    document.getElementById('editor-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.assets.addImageAsset(file);
    });
    document.getElementById('editor-use-slicer').addEventListener('click', () => {
      if (this.onOpenSlicer) this.onOpenSlicer();
    });

    // 图层
    document.getElementById('editor-add-layer').addEventListener('click', () => this.layers.addLayer());
    document.getElementById('editor-delete-layer').addEventListener('click', () => this.layers.deleteLayer());
    document.getElementById('editor-layer-up').addEventListener('click', () => this.layers.moveLayerUp());
    document.getElementById('editor-layer-down').addEventListener('click', () => this.layers.moveLayerDown());
    document.getElementById('editor-move-obj-layer').addEventListener('click', () => this.layers.moveSelectedObjectToActiveLayer());
    document.getElementById('editor-batch-depth').addEventListener('click', () => this.layers.batchSetDepth());
    document.getElementById('editor-dedup-objects').addEventListener('click', () => this.layers.deduplicateObjects());
    document.getElementById('editor-batch-offset').addEventListener('click', () => this.layers.batchOffset());

    // 缩放
    document.getElementById('editor-zoom-in').addEventListener('click', () => this.ui.zoom(1.2));
    document.getElementById('editor-zoom-out').addEventListener('click', () => this.ui.zoom(0.8));
    document.getElementById('editor-zoom-fit').addEventListener('click', () => {
      this.ui.fitToContainer();
      this.render();
    });

    // Canvas 交互
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.ui.zoom(delta, e.offsetX, e.offsetY);
    });
    container.addEventListener('mousedown', (e) => this.interactionModule.handleMouseDown(e));
    container.addEventListener('mousemove', (e) => this.interactionModule.handleMouseMove(e));
    container.addEventListener('mouseup', (e) => this.interactionModule.handleMouseUp(e));
    container.addEventListener('contextmenu', (e) => this.interactionModule.handleContextMenu(e));

    // 键盘快捷键
    document.addEventListener('keydown', (e) => this.interactionModule.handleKeyDown(e));

    // 资源拖放
    this.assets.setupAssetDragDrop();
  }

  /**
   * 加载场景数据
   */
  loadScene(sceneData) {
    const defaults = _editorDefaults || {};
    const sceneCfg = defaults.scene || {};
    const defaultLayers = (sceneCfg.layers || [
      { id: 'layer_bg', name: '背景层', visible: true, locked: false },
      { id: 'layer_fill', name: '背景填充层', visible: true, locked: false },
      { id: 'layer_deco', name: '装饰层', visible: true, locked: false },
      { id: 'layer_entity', name: '实体层', visible: true, locked: false }
    ]).map(l => ({ ...l, objects: [] }));

    const base = {
      id: null,
      name: sceneCfg.defaultName || '新场景',
      width: this.options.width,
      height: this.options.height,
      backgroundColor: sceneCfg.backgroundColor || '#2a3a1a',
      layers: defaultLayers,
      decorations: [],
      colliders: []
    };

    const incoming = sceneData ? JSON.parse(JSON.stringify(sceneData)) : {};
    this.sceneData = { ...base, ...incoming };

    // 规范化图层
    this.sceneData.layers = this.layers.normalizeLayers(this.sceneData.layers);

    // 遮罩层已废弃：清理空的遗留遮罩层（非空的保留，避免丢对象，用户可手动处理）
    this.sceneData.layers = this.sceneData.layers.filter(
      l => !(l.id === 'layer_mask' && (!l.objects || l.objects.length === 0))
    );

    // 旧对象迁移为统一 shape（rect/circle/fill/ellipse → type:'shape'）
    this._migrateShapes();

    // 将 decorations 转换合并到装饰层
    this.layers.mergeDecorationsToLayer();

    // 清空缓存
    this.loadedImages = new Map();
    this.selectedObjects = [];
    this.selectedSlice = null;
    this.activeLayerIndex = 0;
    this.history.reset();

    // 更新 UI
    const nameInput = document.getElementById('editor-scene-name');
    const idInput = document.getElementById('editor-scene-id');
    const bgInput = document.getElementById('editor-bg-color');
    const widthInput = document.getElementById('editor-scene-width');
    const heightInput = document.getElementById('editor-scene-height');

    if (nameInput) nameInput.value = this.sceneData.name;
    if (idInput) idInput.value = this.sceneData.id || '';
    if (bgInput) bgInput.value = this.sceneData.backgroundColor;
    if (widthInput) widthInput.value = this.sceneData.width;
    if (heightInput) heightInput.value = this.sceneData.height;

    // 更新画布尺寸
    const canvas = document.getElementById('editor-canvas');
    const overlay = document.getElementById('editor-overlay');
    const containerEl = document.getElementById('editor-canvas-container');

    if (canvas && overlay && containerEl) {
      const cw = containerEl.clientWidth || 800;
      const ch = containerEl.clientHeight || 600;
      canvas.width = cw;
      canvas.height = ch;
      overlay.width = cw;
      overlay.height = ch;
    }

    // 加载图集和图片
    this.assets.loadAtlasImages();
    this.assets.loadImageAssets();

    this.ui.fitToContainer();
    this.layers.updateLayerList();
    this.ui.updateObjectCount();
    this.assets.updateAssetLibrary();
    this.render();
  }

  /**
   * 把旧对象类型迁移为统一 shape：
   *   rect   → shape(rect)
   *   circle → shape(circle)（x,y 中心 → 包围盒）
   *   fill   → shape(rect)（fillColor 归一到 fill）
   *   ellipse→ shape(ellipse)
   * 已是 shape 的保持不变。
   * @private
   */
  _migrateShapes() {
    for (const layer of this.sceneData.layers) {
      if (!Array.isArray(layer.objects)) continue;
      for (const obj of layer.objects) {
        if (!obj || obj.type === 'shape') continue;
        if (obj.type === 'rect') {
          obj.type = 'shape'; obj.shapeType = 'rect';
        } else if (obj.type === 'ellipse') {
          obj.type = 'shape'; obj.shapeType = 'ellipse';
        } else if (obj.type === 'fill') {
          obj.type = 'shape'; obj.shapeType = 'rect';
          if (obj.fillColor && !obj.fill) obj.fill = obj.fillColor;
          // fill 默认铺满场景
          if (obj.width === undefined) obj.width = this.sceneData.width;
          if (obj.height === undefined) obj.height = this.sceneData.height;
        } else if (obj.type === 'circle') {
          obj.type = 'shape'; obj.shapeType = 'circle';
          const r = obj.radius || 32;
          obj.x = (obj.x || 0) - r; obj.y = (obj.y || 0) - r;
          obj.width = r * 2; obj.height = r * 2;
        }
      }
    }
  }

  /**
   * 保存场景（兼容旧 API）
   */
  save() {
    return this.history.save();
  }

  /**
   * 导出 JSON（兼容旧 API）
   */
  exportJSON() {
    return this.history.exportJSON();
  }

  /**
   * 导入 JSON（兼容旧 API）
   */
  importJSON(source) {
    return this.history.importJSON(source);
  }

  /**
   * 获取场景数据（兼容旧 API）
   */
  getSceneData() {
    return this.sceneData;
  }

  /**
   * 更新资源库（兼容旧 API）
   */
  updateAssetLibrary() {
    this.assets.updateAssetLibrary();
  }
}
