/**
 * SceneEditor - 场景编辑器
 * 
 * 功能：
 * - 创建和编辑游戏场景
 * - 拖拽、旋转、缩放图片元素
 * - 多图层管理
 * - 保存和导出场景配置
 * - 支持导入背景贴图
 * - 所有默认值从 config/editor-defaults.json 加载
 */

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
          { id: 'layer_mask', name: '遮罩层', visible: true, locked: false },
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
    
    // 场景数据 - 默认层从 JSON 配置构建
    const defaultLayers = (sceneCfg.layers || [
      { id: 'layer_bg', name: '背景层', visible: true, locked: false },
      { id: 'layer_fill', name: '背景填充层', visible: true, locked: false },
      { id: 'layer_mask', name: '遮罩层', visible: true, locked: false },
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
    
    // 当前选中的图层
    this.activeLayerIndex = 0;
    
    // 选中的对象
    this.selectedObjects = [];
    
    // 加载的图片资源
    this.loadedImages = new Map();
    
    // 视口控制
    this.viewport = {
      scale: viewportCfg.scale || 1,
      offsetX: viewportCfg.offsetX || 0,
      offsetY: viewportCfg.offsetY || 0
    };
    
    // 交互状态
    this.interaction = {
      mode: 'select', // select, pan, place
      isDragging: false,
      isResizing: false,
      isRotating: false,
      dragStart: { x: 0, y: 0 },
      objectStart: { x: 0, y: 0 }
    };
    
    // 当前拖拽的切片数据
    this.draggingSlice = null;
    
    // 撤销/重做栈
    this.history = {
      undoStack: [],
      redoStack: [],
      maxSize: historyCfg.maxSize || 50
    };
    
    // 回调
    this.onSceneChange = null;
    this.onObjectSelect = null;
    this.onOpenSlicer = null;
    
    // 初始化标志
    this.initialized = false;
    
    // 初始化
    this._initUI();
    this._bindEvents();
    
    // 监听resize事件
    window.addEventListener('resize', () => {
      if (this.initialized) {
        this._fitToContainer();
        this.render();
      }
    });
  }
  
  /**
   * 初始化UI
   * @private
   */
  _initUI() {
    this.container.innerHTML = `
      <div class="scene-editor">
        <div class="editor-toolbar">
          <div class="toolbar-group">
            <button id="editor-undo" title="撤销 (Ctrl+Z)">↶</button>
            <button id="editor-redo" title="重做 (Ctrl+Y)">↷</button>
          </div>
          <div class="toolbar-group">
            <button id="editor-select" class="active" title="选择工具 (V)">◇</button>
            <button id="editor-pan" title="平移工具 (H)">✥</button>
            <button id="editor-place" title="放置工具 (P)">+</button>
          </div>
          <div class="toolbar-group">
            <label>场景名称:</label>
            <input type="text" id="editor-scene-name" value="${this.sceneData.name}">
          </div>
          <div class="toolbar-group">
            <label>背景色:</label>
            <input type="color" id="editor-bg-color" value="${this.sceneData.backgroundColor}">
          </div>
          <div class="toolbar-group">
            <label>网格:</label>
            <input type="checkbox" id="editor-show-grid" ${this.options.showGrid ? 'checked' : ''}>
          </div>
          <div class="toolbar-group">
            <label>辅助方框:</label>
            <input type="checkbox" id="editor-show-background" ${this.options.showBackground ? 'checked' : ''}>
          </div>
          <div class="toolbar-group">
            <button id="editor-save">保存场景</button>
            <button id="editor-export">导出JSON</button>
            <button id="editor-import">导入JSON</button>
          </div>
        </div>
        
        <div class="editor-main">
          <div class="editor-sidebar left">
            <div class="sidebar-section">
              <h3>资源库</h3>
              <div class="asset-library">
                <div class="asset-tabs">
                  <button class="asset-tab active" data-tab="sprites">精灵</button>
                  <button class="asset-tab" data-tab="atlases">图集</button>
                </div>
                <div class="asset-actions">
                  <button id="editor-add-image">添加图片</button>
                  <button id="editor-use-slicer">编辑切片</button>
                </div>
                <div id="asset-sprites" class="asset-panel">
                  <div class="asset-list" id="editor-asset-list"></div>
                </div>
                <div id="asset-atlases" class="asset-panel" style="display:none;">
                  <div class="atlas-list" id="editor-atlas-list"></div>
                </div>
              </div>
            </div>
            <div class="sidebar-section">
              <h3>选中切片</h3>
              <div id="slice-properties">
                <div class="no-selection">未选中切片</div>
              </div>
            </div>
          </div>
          
          <div class="editor-canvas-area">
            <div class="canvas-container" id="editor-canvas-container">
              <canvas id="editor-canvas"></canvas>
              <canvas id="editor-overlay"></canvas>
            </div>
            <div class="zoom-controls">
              <button id="editor-zoom-out">-</button>
              <span id="editor-zoom-level">100%</span>
              <button id="editor-zoom-in">+</button>
              <button id="editor-zoom-fit">适应</button>
            </div>
          </div>
          
          <div class="editor-sidebar right">
            <div class="sidebar-section">
              <h3>图层</h3>
              <div class="layer-list" id="editor-layer-list"></div>
              <div class="layer-actions">
                <button id="editor-add-layer">+ 添加图层</button>
              </div>
            </div>
            
            <div class="sidebar-section">
              <h3>选中对象</h3>
              <div id="editor-object-properties">
                <div class="no-selection">未选中任何对象</div>
              </div>
            </div>
            
            <div class="sidebar-section">
              <h3>场景信息</h3>
              <div class="scene-info">
                <div class="info-row">
                  <label>尺寸:</label>
                  <input type="number" id="editor-scene-width" value="${this.sceneData.width}" min="100">
                  <span>×</span>
                  <input type="number" id="editor-scene-height" value="${this.sceneData.height}" min="100">
                </div>
                <div class="info-row">
                  <label>对象数:</label>
                  <span id="editor-object-count">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <input type="file" id="editor-image-input" accept="image/*" style="display:none">
        <input type="file" id="editor-json-input" accept=".json" style="display:none">
      </div>
    `;
    
    this._addStyles();
    this._initCanvas();
    this._updateLayerList();
    this._initAssetTabs();
  }
  
  /**
   * 初始化资源标签页
   * @private
   */
  _initAssetTabs() {
    const tabs = this.container.querySelectorAll('.asset-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const tabName = tab.dataset.tab;
        this.container.querySelector('#asset-sprites').style.display = tabName === 'sprites' ? 'block' : 'none';
        this.container.querySelector('#asset-atlases').style.display = tabName === 'atlases' ? 'block' : 'none';
      });
    });
  }
  
  /**
   * 添加样式
   * @private
   */
  _addStyles() {
    if (document.getElementById('scene-editor-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'scene-editor-styles';
    style.textContent = `
      .scene-editor { display: flex; flex-direction: column; height: 100%; width: 100%; background: #1a1a2e; color: #fff; font-family: 'Microsoft YaHei', sans-serif; box-sizing: border-box; }
      .editor-toolbar { display: flex; flex-wrap: wrap; gap: 10px; padding: 8px 12px; background: #16213e; border-bottom: 1px solid #2a3a5e; flex-shrink: 0; }
      .toolbar-group { display: flex; align-items: center; gap: 5px; }
      .toolbar-group button { padding: 6px 12px; background: #3a4a7e; border: none; border-radius: 4px; color: #fff; cursor: pointer; font-size: 12px; }
      .toolbar-group button:hover { background: #4a5a9e; }
      .toolbar-group button.active { background: #4CAF50; }
      .toolbar-group label { font-size: 12px; color: #aaa; }
      .toolbar-group input[type="text"] { width: 120px; padding: 4px 8px; background: #2a3a5e; border: 1px solid #3a4a7e; border-radius: 4px; color: #fff; font-size: 12px; }
      .toolbar-group input[type="color"] { width: 40px; height: 24px; padding: 0; border: none; border-radius: 4px; cursor: pointer; }
      .editor-main { display: flex; flex: 1; overflow: hidden; min-height: 0; }
      .editor-sidebar { width: 200px; min-width: 200px; background: #16213e; padding: 10px; overflow-y: auto; }
      .editor-sidebar.left { border-right: 1px solid #2a3a5e; }
      .editor-sidebar.right { border-left: 1px solid #2a3a5e; }
      .sidebar-section { margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #2a3a5e; }
      .sidebar-section h3 { font-size: 14px; margin: 0 0 10px 0; color: #4CAF50; }
      .asset-library { display: flex; flex-direction: column; gap: 10px; }
      .asset-tabs { display: flex; gap: 2px; margin-bottom: 5px; }
      .asset-tab { flex: 1; padding: 6px; background: #2a3a5e; border: none; border-radius: 4px 4px 0 0; color: #aaa; cursor: pointer; font-size: 11px; }
      .asset-tab:hover { background: #3a4a7e; }
      .asset-tab.active { background: #4a5a8e; color: #fff; }
      .asset-panel { background: #1a2a3e; border-radius: 4px; padding: 5px; max-height: 250px; overflow-y: auto; }
      .asset-actions { display: flex; gap: 5px; }
      .asset-actions button { flex: 1; padding: 6px; background: #3a4a7e; border: none; border-radius: 4px; color: #fff; cursor: pointer; font-size: 11px; }
      .asset-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; max-height: 200px; overflow-y: auto; }
      .asset-item { display: flex; flex-direction: column; align-items: center; padding: 5px; background: #2a3a5e; border-radius: 4px; cursor: grab; font-size: 10px; }
      .asset-item:hover { background: #3a4a7e; }
      .asset-item.dragging { opacity: 0.5; }
      .asset-preview { width: 48px; height: 48px; background: #4a5a8e; margin-bottom: 4px; border-radius: 4px; overflow: hidden; }
      .asset-preview img { width: 100%; height: 100%; object-fit: contain; }
      .asset-preview.rect { border-radius: 0; }
      .asset-preview.circle { border-radius: 50%; }
      .editor-canvas-area { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; min-height: 0; }
      .canvas-container { flex: 1; position: relative; overflow: hidden; background: #0a0a1e; min-height: 0; }
      .canvas-container canvas { position: absolute; top: 0; left: 0; }
      #editor-canvas { z-index: 1; }
      #editor-overlay { z-index: 2; pointer-events: none; }
      .zoom-controls { position: absolute; bottom: 10px; right: 10px; display: flex; align-items: center; gap: 5px; background: rgba(22, 33, 62, 0.9); padding: 5px 10px; border-radius: 4px; }
      .zoom-controls button { width: 24px; height: 24px; background: #3a4a7e; border: none; border-radius: 4px; color: #fff; cursor: pointer; }
      .zoom-controls span { font-size: 12px; min-width: 50px; text-align: center; }
      .layer-list { max-height: 150px; overflow-y: auto; }
      .layer-item { display: flex; align-items: center; padding: 6px 8px; margin-bottom: 3px; background: #2a3a5e; border-radius: 4px; cursor: pointer; font-size: 12px; }
      .layer-item:hover { background: #3a4a7e; }
      .layer-item.active { background: #4CAF50; color: #000; }
      .layer-item .layer-visibility { margin-right: 8px; cursor: pointer; }
      .layer-item .layer-name { flex: 1; }
      .layer-actions { margin-top: 5px; }
      .layer-actions button { width: 100%; padding: 6px; background: #3a4a7e; border: none; border-radius: 4px; color: #fff; cursor: pointer; font-size: 11px; }
      #editor-object-properties { font-size: 12px; }
      .no-selection { color: #666; font-style: italic; }
      .property-row { display: flex; align-items: center; margin-bottom: 5px; }
      .property-row label { width: 60px; color: #aaa; }
      .property-row input { flex: 1; padding: 4px 8px; background: #2a3a5e; border: 1px solid #3a4a7e; border-radius: 4px; color: #fff; font-size: 11px; }
      .scene-info .info-row { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; font-size: 12px; }
      .scene-info .info-row label { width: 50px; color: #aaa; }
      .scene-info .info-row input { width: 60px; padding: 4px; background: #2a3a5e; border: 1px solid #3a4a7e; border-radius: 4px; color: #fff; font-size: 11px; }
      .atlas-list { display: flex; flex-direction: column; gap: 5px; }
      .atlas-item { background: #2a3a5e; border-radius: 4px; overflow: hidden; }
      .atlas-header { display: flex; align-items: center; justify-content: space-between; padding: 8px; cursor: pointer; font-size: 12px; }
      .atlas-header:hover { background: #3a4a7e; }
      .atlas-preview { width: 100%; max-height: 100px; background: #1a1a2e; overflow: hidden; display: none; }
      .atlas-preview img { width: 100%; height: auto; }
      .slice-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; padding: 8px; background: #1a1a2e; }
      .slice-item { display: flex; flex-direction: column; align-items: center; padding: 5px; background: #2a3a5e; border-radius: 4px; cursor: grab; font-size: 10px; border: 2px solid transparent; user-select: none; }
      .slice-item:hover { background: #3a4a7e; }
      .slice-item.selected { border-color: #4CAF50; background: #3a4a6e; }
      .slice-item.dragging { opacity: 0.5; }
      .slice-preview { width: 40px; height: 40px; background: #4a5a8e; margin-bottom: 4px; border-radius: 2px; overflow: hidden; pointer-events: none; }
      .slice-preview img { width: 100%; height: 100%; object-fit: contain; }
      #slice-properties { font-size: 11px; }
      .slice-prop-row { display: flex; align-items: center; margin-bottom: 5px; gap: 5px; }
      .slice-prop-row label { width: 60px; color: #aaa; }
      .slice-prop-row input { flex: 1; padding: 3px 6px; background: #2a3a5e; border: 1px solid #3a4a7e; border-radius: 3px; color: #fff; font-size: 11px; }
    `;
    
    document.head.appendChild(style);
  }
  
  /**
   * 初始化画布
   * @private
   */
  _initCanvas() {
    const canvas = document.getElementById('editor-canvas');
    const overlay = document.getElementById('editor-overlay');
    const container = document.getElementById('editor-canvas-container');
    
    if (!canvas || !overlay || !container) {
      setTimeout(() => this._initCanvas(), 100);
      return;
    }
    
    // 检查容器是否可见
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      // 容器尚未显示，延迟初始化
      setTimeout(() => this._initCanvas(), 100);
      return;
    }
    
    // canvas 尺寸设置为容器尺寸，场景通过 viewport 变换居中绘制
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    overlay.width = container.clientWidth;
    overlay.height = container.clientHeight;
    
    this._fitToContainer();
    this.render();
    this.initialized = true;
  }
  
  /**
   * 适应容器
   * @private
   */
  _fitToContainer() {
    const container = document.getElementById('editor-canvas-container');
    const canvas = document.getElementById('editor-canvas');
    const overlay = document.getElementById('editor-overlay');
    
    // 检查容器尺寸
    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight || 600;
    
    // canvas 尺寸跟随容器
    if (canvas) {
      canvas.width = containerWidth;
      canvas.height = containerHeight;
    }
    if (overlay) {
      overlay.width = containerWidth;
      overlay.height = containerHeight;
    }
    
    const scaleX = containerWidth / this.sceneData.width;
    const scaleY = containerHeight / this.sceneData.height;
    this.viewport.scale = Math.min(scaleX, scaleY, 2) * 0.9;
    
    // 将场景居中于画布（以地形中心为基准）
    const centerX = this.sceneData.centerX || this.sceneData.width / 2;
    const centerY = this.sceneData.centerY || this.sceneData.height / 2;
    // 场景矩形左上角在场景坐标系中的位置
    const sceneX = centerX - this.sceneData.width / 2;
    const sceneY = centerY - this.sceneData.height / 2;
    
    // 让场景矩形中心（即地形中心）对准画布中心
    this.viewport.offsetX = containerWidth / 2 - centerX * this.viewport.scale;
    this.viewport.offsetY = containerHeight / 2 - centerY * this.viewport.scale;
    
    this._updateZoomDisplay();
  }
  
  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    const container = document.getElementById('editor-canvas-container');
    
    // 工具按钮
    document.getElementById('editor-undo').addEventListener('click', () => this.undo());
    document.getElementById('editor-redo').addEventListener('click', () => this.redo());
    document.getElementById('editor-select').addEventListener('click', () => this.setMode('select'));
    document.getElementById('editor-pan').addEventListener('click', () => this.setMode('pan'));
    document.getElementById('editor-place').addEventListener('click', () => this.setMode('place'));
    
    // 场景设置
    document.getElementById('editor-scene-name').addEventListener('input', (e) => {
      this.sceneData.name = e.target.value;
    });
    
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
      this._initCanvas();
    });
    
    document.getElementById('editor-scene-height').addEventListener('change', (e) => {
      this.sceneData.height = parseInt(e.target.value) || 720;
      this._initCanvas();
    });
    
    // 保存和导入导出
    document.getElementById('editor-save').addEventListener('click', () => this.save());
    document.getElementById('editor-export').addEventListener('click', () => this.exportJSON());
    document.getElementById('editor-import').addEventListener('click', () => {
      document.getElementById('editor-json-input').click();
    });
    
    document.getElementById('editor-json-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.importJSON(file);
    });
    
    // 图片资源
    document.getElementById('editor-add-image').addEventListener('click', () => {
      document.getElementById('editor-image-input').click();
    });
    
    document.getElementById('editor-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.addImageAsset(file);
    });
    
    document.getElementById('editor-use-slicer').addEventListener('click', () => {
      if (this.onOpenSlicer) this.onOpenSlicer();
    });
    
    // 图层
    document.getElementById('editor-add-layer').addEventListener('click', () => this.addLayer());
    
    // 缩放
    document.getElementById('editor-zoom-in').addEventListener('click', () => this.zoom(1.2));
    document.getElementById('editor-zoom-out').addEventListener('click', () => this.zoom(0.8));
    document.getElementById('editor-zoom-fit').addEventListener('click', () => {
      this._fitToContainer();
      this.render();
    });
    
    // Canvas交互
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom(delta, e.offsetX, e.offsetY);
    });
    
    container.addEventListener('mousedown', (e) => this._handleMouseDown(e));
    container.addEventListener('mousemove', (e) => this._handleMouseMove(e));
    container.addEventListener('mouseup', (e) => this._handleMouseUp(e));
    container.addEventListener('contextmenu', (e) => this._handleContextMenu(e));
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => this._handleKeyDown(e));
    
    // 资源拖放
    this._setupAssetDragDrop();
  }
  
  /**
   * 设置资源拖放
   * @private
   */
  _setupAssetDragDrop() {
    const assetList = document.getElementById('editor-asset-list');
    const container = document.getElementById('editor-canvas-container');
    
    // 精灵列表拖拽
    if (assetList) {
      assetList.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.asset-item');
        if (item) {
          e.dataTransfer.setData('text/plain', item.dataset.id || item.dataset.type);
          item.classList.add('dragging');
        }
      });
      
      assetList.addEventListener('dragend', (e) => {
        const item = e.target.closest('.asset-item');
        if (item) item.classList.remove('dragging');
      });
    }
    
    if (!container) return;
    
    // 允许拖放
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      console.log('Drop event, id:', id, 'draggingSlice:', this.draggingSlice);
      const pos = this._screenToScene(e.offsetX, e.offsetY);
      console.log('Drop position:', pos);
      
      // 处理切片拖拽 - 优先使用临时变量
      if (this.draggingSlice) {
        const { atlasId, sliceKey } = this.draggingSlice;
        console.log('Adding slice from draggingSlice:', atlasId, sliceKey);
        this._addSliceToScene(atlasId, sliceKey, pos.x, pos.y);
        this.draggingSlice = null;
        return;
      }
      
      // 备用方案：从 dataTransfer 获取
      if (id && id.startsWith('slice:')) {
        const parts = id.split(':');
        const atlasId = parts[1];
        const sliceKey = parts[2];
        console.log('Adding slice from dataTransfer:', atlasId, sliceKey);
        this._addSliceToScene(atlasId, sliceKey, pos.x, pos.y);
        return;
      }
      
      if (id === 'rect') {
        this.addObject({ type: 'rect', x: pos.x - 32, y: pos.y - 32, width: 64, height: 64, fill: '#4a5a8e' });
      } else if (id === 'circle') {
        this.addObject({ type: 'circle', x: pos.x, y: pos.y, radius: 32, fill: '#4a8e5a' });
      } else if (id === 'fill') {
        // 添加背景填充对象到背景填充层
        const fillLayer = this.sceneData.layers.find(l => l.id === 'layer_fill');
        const fillObj = {
          id: 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          type: 'fill',
          x: 0,
          y: 0,
          width: this.sceneData.width,
          height: this.sceneData.height,
          fillMode: 'color',
          fillColor: '#333333',
          opacity: 1,
          name: '背景填充'
        };
        if (fillLayer) {
          fillLayer.objects.push(fillObj);
          this.activeLayerIndex = this.sceneData.layers.indexOf(fillLayer);
        } else {
          this.addObject(fillObj);
        }
        this.selectedObjects = [fillObj];
        this._saveHistory();
        this._updateObjectCount();
        this._updateObjectProperties();
        this.render();
      } else if (this.loadedImages.has(id)) {
        const img = this.loadedImages.get(id);
        this.addObject({
          type: 'image',
          imageId: id,
          x: pos.x - img.width / 4,
          y: pos.y - img.height / 4,
          width: img.width / 2,
          height: img.height / 2,
          rotation: 0
        });
      }
    });
  }
  
  /**
   * 将切片添加到场景
   * @private
   */
  _addSliceToScene(atlasId, sliceKey, x, y) {
    const atlas = this.sceneData.atlases?.find(a => a.id === atlasId);
    if (!atlas) return;
    
    const slice = atlas.slices?.[sliceKey];
    if (!slice) return;
    
    // 添加到装饰层
    const decoLayer = this.sceneData.layers.find(l => l.id === 'layer_deco');
    if (!decoLayer) return;
    
    const obj = {
      id: 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: 'slice',
      atlasId,
      sliceKey,
      x: Math.round(x - slice.sw / 2),
      y: Math.round(y - slice.sh / 2),
      width: slice.sw,
      height: slice.sh,
      name: slice.name || sliceKey
    };
    
    decoLayer.objects.push(obj);
    // 切换激活图层到装饰层，便于后续选中/拖动
    this.activeLayerIndex = this.sceneData.layers.indexOf(decoLayer);
    this._saveHistory();
    this._updateObjectCount();
    this.render();
    
    // 选中新添加的对象
    this.selectedObjects = [obj];
    this._updateObjectProperties();
  }
  
  /**
   * 处理鼠标按下
   * @private
   */
  _handleMouseDown(e) {
    const pos = this._screenToScene(e.offsetX, e.offsetY);
    
    if (this.interaction.mode === 'pan' || e.button === 1) {
      this.interaction.isDragging = true;
      this.interaction.dragStart = {
        x: e.offsetX - this.viewport.offsetX,
        y: e.offsetY - this.viewport.offsetY
      };
      return;
    }
    
    if (this.interaction.mode === 'select') {
      // 检查是否点击了选中对象的右下角缩放手柄
      if (this.selectedObjects.length > 0) {
        const resizeTarget = this._getResizeHandleAt(pos.x, pos.y);
        if (resizeTarget) {
          this.interaction.isResizing = true;
          this.interaction.isDragging = true;
          this.interaction.dragStart = { x: pos.x, y: pos.y };
          this.interaction.resizeTarget = resizeTarget;
          this.interaction.resizeStart = {
            width: resizeTarget.width || 64,
            height: resizeTarget.height || 64
          };
          return;
        }
      }
      
      const clicked = this._getObjectAt(pos.x, pos.y);
      
      if (clicked) {
        if (e.shiftKey) {
          const index = this.selectedObjects.indexOf(clicked);
          if (index === -1) this.selectedObjects.push(clicked);
          else this.selectedObjects.splice(index, 1);
        } else {
          if (!this.selectedObjects.includes(clicked)) this.selectedObjects = [clicked];
        }
        
        this.interaction.isDragging = true;
        this.interaction.dragStart = { x: pos.x, y: pos.y };
        this.interaction.objectStart = { x: clicked.x, y: clicked.y };
      } else {
        this.selectedObjects = [];
      }
      
      this._updateObjectProperties();
      this.render();
    }
  }
  
  /**
   * 处理鼠标移动
   * @private
   */
  _handleMouseMove(e) {
    // 更新光标样式（根据是否悬停在缩放手柄上）
    if (!this.interaction.isDragging && this.interaction.mode === 'select' && this.selectedObjects.length > 0) {
      const pos = this._screenToScene(e.offsetX, e.offsetY);
      const onHandle = this._getResizeHandleAt(pos.x, pos.y);
      const canvas = document.getElementById('editor-overlay') || document.getElementById('editor-canvas');
      if (canvas) {
        canvas.style.cursor = onHandle ? 'nwse-resize' : '';
      }
    }
    
    if (!this.interaction.isDragging) return;
    
    if (this.interaction.mode === 'pan') {
      this.viewport.offsetX = e.offsetX - this.interaction.dragStart.x;
      this.viewport.offsetY = e.offsetY - this.interaction.dragStart.y;
      this.render();
    } else if (this.interaction.isResizing) {
      // 缩放模式
      const pos = this._screenToScene(e.offsetX, e.offsetY);
      const dx = pos.x - this.interaction.dragStart.x;
      const dy = pos.y - this.interaction.dragStart.y;
      const obj = this.interaction.resizeTarget;
      
      // 计算新尺寸（最小 8px）
      const newWidth = Math.max(8, this.interaction.resizeStart.width + dx);
      const newHeight = Math.max(8, this.interaction.resizeStart.height + dy);
      
      obj.width = Math.round(newWidth);
      obj.height = Math.round(newHeight);
      
      // 如果是装饰物，同步更新 scale
      if (obj.type === 'decoration' && obj._decoRef) {
        const origWidth = obj._origWidth || this.interaction.resizeStart.width;
        obj._decoRef.scale = obj.width / origWidth;
        obj.scale = obj._decoRef.scale;
      }
      
      this._updateObjectProperties();
      this.render();
    } else if (this.interaction.mode === 'select' && this.selectedObjects.length > 0) {
      const pos = this._screenToScene(e.offsetX, e.offsetY);
      const dx = pos.x - this.interaction.dragStart.x;
      const dy = pos.y - this.interaction.dragStart.y;
      
      for (const obj of this.selectedObjects) {
        obj.x = this.interaction.objectStart.x + dx;
        obj.y = this.interaction.objectStart.y + dy;
        
        // 如果是装饰物，同步更新原始引用
        if (obj.type === 'decoration' && obj._decoRef) {
          obj._decoRef.x = obj.x;
          obj._decoRef.y = obj.y;
        }
      }
      
      this._updateObjectProperties();
      this.render();
    }
  }
  
  /**
   * 处理鼠标松开
   * @private
   */
  _handleMouseUp(e) {
    if (this.interaction.isDragging && (this.selectedObjects.length > 0 || this.interaction.isResizing)) {
      this._saveHistory();
    }
    this.interaction.isDragging = false;
    this.interaction.isResizing = false;
    this.interaction.resizeTarget = null;
    this.interaction.resizeStart = null;
  }
  
  /**
   * 处理右键菜单
   * @private
   */
  _handleContextMenu(e) {
    e.preventDefault();
    
    const pos = this._screenToScene(e.offsetX, e.offsetY);
    const clicked = this._getObjectAt(pos.x, pos.y);
    
    // 移除已有菜单
    this._removeContextMenu();
    
    if (!clicked) return;
    
    // 选中右键点击的对象
    this.selectedObjects = [clicked];
    this._updateObjectProperties();
    this.render();
    
    const isDecoration = clicked.type === 'decoration';
    
    // 找到图层对象所在图层索引（装饰物没有所属图层）
    let layerIndex = -1;
    if (!isDecoration) {
      for (let i = 0; i < this.sceneData.layers.length; i++) {
        if (this.sceneData.layers[i].objects.includes(clicked)) {
          layerIndex = i;
          break;
        }
      }
    }
    
    const menu = document.createElement('div');
    menu.id = 'editor-context-menu';
    menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#16213e;border:1px solid #3a4a7e;border-radius:4px;padding:4px 0;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.4);font-size:13px;min-width:140px;`;
    
    const items = [];
    
    if (isDecoration) {
      // 装饰物按 Y 坐标排序渲染（Y 越大越靠前/上层）
      // 调整层次 = 调整与相邻装饰物的 Y 关系
      items.push({
        label: '上移一层',
        action: () => this._moveDecorationOrder(clicked, 'up')
      });
      items.push({
        label: '下移一层',
        action: () => this._moveDecorationOrder(clicked, 'down')
      });
      items.push({ separator: true });
      items.push({
        label: '置于顶层',
        action: () => this._moveDecorationOrder(clicked, 'top')
      });
      items.push({
        label: '置于底层',
        action: () => this._moveDecorationOrder(clicked, 'bottom')
      });
      items.push({ separator: true });
    } else if (layerIndex !== -1) {
      // 图层对象按数组顺序渲染，调整数组位置即可改变同层内的上下关系
      const curLayer = this.sceneData.layers[layerIndex];
      items.push({
        label: '上移一层',
        action: () => this._moveObjectInLayer(clicked, curLayer, 'up')
      });
      items.push({
        label: '下移一层',
        action: () => this._moveObjectInLayer(clicked, curLayer, 'down')
      });
      items.push({ separator: true });
      items.push({
        label: '置于顶层',
        action: () => this._moveObjectInLayer(clicked, curLayer, 'top')
      });
      items.push({
        label: '置于底层',
        action: () => this._moveObjectInLayer(clicked, curLayer, 'bottom')
      });
      items.push({ separator: true });
    }
    
    items.push({
      label: '删除对象',
      action: () => this.deleteSelectedObjects()
    });
    
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#3a4a7e;margin:4px 0;';
        menu.appendChild(sep);
        continue;
      }
      const el = document.createElement('div');
      el.textContent = item.label;
      const disabled = item.disabled;
      el.style.cssText = `padding:6px 16px;cursor:${disabled ? 'default' : 'pointer'};color:${disabled ? '#666' : '#fff'};white-space:nowrap;`;
      if (!disabled) {
        el.addEventListener('mouseenter', () => el.style.background = '#3a4a7e');
        el.addEventListener('mouseleave', () => el.style.background = 'transparent');
        el.addEventListener('click', () => {
          item.action();
          this._removeContextMenu();
        });
      }
      menu.appendChild(el);
    }
    
    document.body.appendChild(menu);
    
    // 点击别处关闭菜单
    this._contextMenuCloser = (ev) => {
      if (!menu.contains(ev.target)) this._removeContextMenu();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', this._contextMenuCloser);
    }, 0);
  }
  
  /**
   * 移除右键菜单
   * @private
   */
  _removeContextMenu() {
    const existing = document.getElementById('editor-context-menu');
    if (existing) existing.remove();
    if (this._contextMenuCloser) {
      document.removeEventListener('mousedown', this._contextMenuCloser);
      this._contextMenuCloser = null;
    }
  }
  
  /**
   * 调整装饰物（decorations 数组项）的层次
   *
   * 装饰物按 Y 坐标排序渲染（Y 越大越靠前/上层）。
   * 通过微调 Y 坐标与相邻装饰物交换前后关系：
   *   - up   ：移到比当前更靠前的下一个装饰物之上
   *   - down ：移到比当前更靠后的上一个装饰物之下
   *   - top  ：Y 设为最大（最靠前）
   *   - bottom：Y 设为最小（最靠后）
   * @param {Object} deco 由 _getObjectAt 返回的装饰物（含 _decoRef）
   * @param {string} position up | down | top | bottom
   * @private
   */
  _moveDecorationOrder(deco, position) {
    const ref = deco._decoRef;
    if (!ref || !Array.isArray(this.sceneData.decorations)) return;
    
    // 按 Y 升序排列（Y 小在底层，Y 大在上层）
    const sorted = [...this.sceneData.decorations].sort((a, b) => a.y - b.y);
    const idx = sorted.indexOf(ref);
    if (idx === -1) return;
    
    if (position === 'up') {
      // 与上层相邻装饰物交换 Y
      if (idx < sorted.length - 1) {
        const next = sorted[idx + 1];
        const t = ref.y; ref.y = next.y; next.y = t;
        // 保证严格大小，避免相等导致顺序不稳定
        if (ref.y === next.y) ref.y += 1;
      }
    } else if (position === 'down') {
      if (idx > 0) {
        const prev = sorted[idx - 1];
        const t = ref.y; ref.y = prev.y; prev.y = t;
        if (ref.y === prev.y) ref.y -= 1;
      }
    } else if (position === 'top') {
      const maxY = Math.max(...this.sceneData.decorations.map(d => d.y));
      ref.y = maxY + 1;
    } else if (position === 'bottom') {
      const minY = Math.min(...this.sceneData.decorations.map(d => d.y));
      ref.y = minY - 1;
    }
    
    // 同步更新选中对象的显示坐标
    if (deco.y !== undefined) deco.y = ref.y;
    
    this._saveHistory();
    this.render();
  }
  
  /**
   * 在图层内调整对象的绘制顺序
   * 图层 objects 按数组顺序渲染：数组靠后 = 绘制在上层
   * @param {Object} obj 对象
   * @param {Object} layer 所在图层
   * @param {string} position up | down | top | bottom
   * @private
   */
  _moveObjectInLayer(obj, layer, position) {
    const idx = layer.objects.indexOf(obj);
    if (idx === -1) return;
    
    layer.objects.splice(idx, 1);
    
    if (position === 'up') {
      // 上移一层：在数组中后移一位
      const insertAt = Math.min(idx + 1, layer.objects.length);
      layer.objects.splice(insertAt, 0, obj);
    } else if (position === 'down') {
      // 下移一层：在数组中前移一位
      const insertAt = Math.max(idx - 1, 0);
      layer.objects.splice(insertAt, 0, obj);
    } else if (position === 'top') {
      layer.objects.push(obj);
    } else if (position === 'bottom') {
      layer.objects.unshift(obj);
    }
    
    this._saveHistory();
    this.render();
  }
  
  /**
   * 处理键盘事件
   * @private
   */
  _handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); this.undo(); }
      else if (e.key === 'y') { e.preventDefault(); this.redo(); }
    }
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedObjects.length > 0) this.deleteSelectedObjects();
    }
    
    if (e.key === 'v' || e.key === 'V') this.setMode('select');
    else if (e.key === 'h' || e.key === 'H') this.setMode('pan');
    else if (e.key === 'p' || e.key === 'P') this.setMode('place');
  }
  
  /**
   * 屏幕坐标转场景坐标
   * @private
   */
  _screenToScene(screenX, screenY) {
    return {
      x: (screenX - this.viewport.offsetX) / this.viewport.scale,
      y: (screenY - this.viewport.offsetY) / this.viewport.scale
    };
  }
  
  /**
   * 获取指定位置的对象
   * @private
   */
  _getObjectAt(x, y) {
    // 从上到下遍历所有图层（后面的图层在上层，优先检测）
    for (let li = this.sceneData.layers.length - 1; li >= 0; li--) {
      const layer = this.sceneData.layers[li];
      if (!layer || layer.locked || !layer.visible) continue;
      
      for (let i = layer.objects.length - 1; i >= 0; i--) {
        const obj = layer.objects[i];
        
        if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill') {
          if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
            // 命中后切换激活图层，便于拖动/删除
            this.activeLayerIndex = li;
            return obj;
          }
        } else if (obj.type === 'circle') {
          if (Math.hypot(x - obj.x, y - obj.y) <= obj.radius) {
            this.activeLayerIndex = li;
            return obj;
          }
        }
      }
    }
    
    // 检查装饰物（原始地形装饰，存在 decorations 数组中）
    const decoLayer = this.sceneData.layers.find(l => l.name === '装饰层');
    if (decoLayer && decoLayer.visible && !decoLayer.locked && this.sceneData.decorations) {
      // 按Y从大到小排序（后面的先检测）
      const sortedDecos = [...this.sceneData.decorations].sort((a, b) => b.y - a.y);
      
      for (const deco of sortedDecos) {
        const sprite = this.sceneData.decoSprites?.[deco.key];
        if (sprite) {
          const w = sprite.sw * (deco.scale || 1) * (sprite.scale || 1);
          const h = sprite.sh * (deco.scale || 1) * (sprite.scale || 1);
          const decoX = deco.x - w / 2;
          const decoY = deco.y - h;
          
          if (x >= decoX && x <= decoX + w && y >= decoY && y <= decoY + h) {
            // 返回一个包含原始引用的对象
            return { 
              ...deco, 
              type: 'decoration', 
              width: w, 
              height: h,
              _decoRef: deco  // 保存原始引用
            };
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * 检查指定位置是否在选中对象的右下角缩放手柄上
   * @private
   * @param {number} x - 场景坐标X
   * @param {number} y - 场景坐标Y
   * @returns {Object|null} 命中的对象，或 null
   */
  _getResizeHandleAt(x, y) {
    const handleSize = 12 / this.viewport.scale; // 手柄点击区域稍大于绘制区域
    
    for (const obj of this.selectedObjects) {
      let hx, hy;
      
      if (obj.type === 'decoration') {
        const w = obj.width || 64;
        const h = obj.height || 64;
        hx = obj.x + w / 2 + 2;
        hy = obj.y + 2;
      } else if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill') {
        hx = obj.x + obj.width + 2;
        hy = obj.y + obj.height + 2;
      } else {
        continue;
      }
      
      if (Math.abs(x - hx) <= handleSize && Math.abs(y - hy) <= handleSize) {
        return obj;
      }
    }
    
    return null;
  }
  
  /**
   * 设置交互模式
   */
  setMode(mode) {
    this.interaction.mode = mode;
    document.querySelectorAll('.toolbar-group button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`editor-${mode}`).classList.add('active');
    document.getElementById('editor-canvas-container').style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  }
  
  /**
   * 缩放视图
   */
  zoom(factor, pivotX, pivotY) {
    const oldScale = this.viewport.scale;
    this.viewport.scale = Math.max(0.1, Math.min(5, this.viewport.scale * factor));
    
    if (pivotX !== undefined && pivotY !== undefined) {
      const ratio = this.viewport.scale / oldScale;
      this.viewport.offsetX = pivotX - (pivotX - this.viewport.offsetX) * ratio;
      this.viewport.offsetY = pivotY - (pivotY - this.viewport.offsetY) * ratio;
    }
    
    this._updateZoomDisplay();
    this.render();
  }
  
  /**
   * 更新缩放显示
   * @private
   */
  _updateZoomDisplay() {
    document.getElementById('editor-zoom-level').textContent = Math.round(this.viewport.scale * 100) + '%';
  }
  
  /**
   * 添加图层
   */
  addLayer(name) {
    const layer = {
      id: 'layer_' + Date.now(),
      name: name || `图层 ${this.sceneData.layers.length + 1}`,
      visible: true,
      locked: false,
      objects: []
    };
    
    this.sceneData.layers.push(layer);
    this._updateLayerList();
    this._saveHistory();
    return layer;
  }
  
  /**
   * 更新图层列表
   * @private
   */
  _updateLayerList() {
    const list = document.getElementById('editor-layer-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    // 从后往前显示（最上面的图层在列表顶部）
    for (let displayIndex = this.sceneData.layers.length - 1; displayIndex >= 0; displayIndex--) {
      const actualIndex = displayIndex; // 实际索引
      const layer = this.sceneData.layers[actualIndex];
      const item = document.createElement('div');
      item.className = 'layer-item' + (actualIndex === this.activeLayerIndex ? ' active' : '');
      item.dataset.index = actualIndex;
      item.innerHTML = `
        <span class="layer-visibility" data-action="visibility">${layer.visible ? '👁' : '👁‍🗨'}</span>
        <span class="layer-name">${layer.name}</span>
      `;
      
      item.addEventListener('click', (e) => {
        const idx = parseInt(item.dataset.index);
        
        if (e.target.dataset.action === 'visibility') {
          // 切换可见性
          this.sceneData.layers[idx].visible = !this.sceneData.layers[idx].visible;
          this.render();
        } else {
          // 切换活动图层
          this.activeLayerIndex = idx;
        }
        this._updateLayerList();
      });
      
      list.appendChild(item);
    }
  }
  
  /**
   * 添加图片资源
   */
  addImageAsset(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const id = 'img_' + Date.now();
        this.loadedImages.set(id, img);
        
        const assetList = document.getElementById('editor-asset-list');
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.draggable = true;
        item.dataset.id = id;
        item.innerHTML = `
          <div class="asset-preview"><img src="${img.src}" alt="${file.name}"></div>
          <span>${file.name.substring(0, 8)}</span>
        `;
        assetList.appendChild(item);
        resolve(id);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  
  /**
   * 添加对象到当前图层
   */
  addObject(objData) {
    const layer = this.sceneData.layers[this.activeLayerIndex];
    if (!layer || layer.locked) return null;
    
    const obj = { id: 'obj_' + Date.now(), ...objData };
    layer.objects.push(obj);
    this._updateObjectCount();
    this._saveHistory();
    this.render();
    return obj;
  }
  
  /**
   * 删除选中对象
   */
  deleteSelectedObjects() {
    for (const obj of this.selectedObjects) {
      if (obj.type === 'decoration' && obj._decoRef) {
        // 删除装饰物
        const index = this.sceneData.decorations.indexOf(obj._decoRef);
        if (index !== -1) {
          this.sceneData.decorations.splice(index, 1);
        }
      } else {
        // 在所有图层中查找并删除对象
        for (const layer of this.sceneData.layers) {
          const index = layer.objects.indexOf(obj);
          if (index !== -1) {
            layer.objects.splice(index, 1);
            break;
          }
        }
      }
    }
    
    this.selectedObjects = [];
    this._updateObjectProperties();
    this._updateObjectCount();
    this._saveHistory();
    this.render();
  }
  
  /**
   * 更新对象数量显示
   * @private
   */
  _updateObjectCount() {
    let count = 0;
    for (const layer of this.sceneData.layers) {
      count += layer.objects.length;
    }
    // 加上装饰物数量
    if (this.sceneData.decorations) {
      count += this.sceneData.decorations.length;
    }
    document.getElementById('editor-object-count').textContent = count;
  }
  
  /**
   * 更新选中对象属性面板
   * @private
   */
  _updateObjectProperties() {
    const panel = document.getElementById('editor-object-properties');
    if (!panel) return;
    
    if (this.selectedObjects.length === 0) {
      panel.innerHTML = '<div class="no-selection">未选中任何对象</div>';
      return;
    }
    
    if (this.selectedObjects.length > 1) {
      panel.innerHTML = `<div>已选中 ${this.selectedObjects.length} 个对象</div>`;
      return;
    }
    
    const obj = this.selectedObjects[0];
    let html = '';
    
    // 装饰物类型
    if (obj.type === 'decoration') {
      html = `<div class="property-row"><label>类型:</label><input value="装饰物" disabled></div>`;
      html += `<div class="property-row"><label>名称:</label><input value="${obj.key || '未知'}" disabled></div>`;
      html += `<div class="property-row"><label>X:</label><input type="number" value="${Math.round(obj.x)}" data-prop="x"></div>`;
      html += `<div class="property-row"><label>Y:</label><input type="number" value="${Math.round(obj.y)}" data-prop="y"></div>`;
      html += `<div class="property-row"><label>缩放:</label><input type="number" value="${obj.scale || 1}" step="0.1" data-prop="scale"></div>`;
    } else {
      // 其他类型对象
      html = `<div class="property-row"><label>ID:</label><input value="${obj.id || '未知'}" disabled></div>`;
      html += `<div class="property-row"><label>X:</label><input type="number" value="${Math.round(obj.x)}" data-prop="x"></div>`;
      html += `<div class="property-row"><label>Y:</label><input type="number" value="${Math.round(obj.y)}" data-prop="y"></div>`;
      
      if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill') {
        html += `<div class="property-row"><label>宽度:</label><input type="number" value="${Math.round(obj.width)}" data-prop="width"></div>`;
        html += `<div class="property-row"><label>高度:</label><input type="number" value="${Math.round(obj.height)}" data-prop="height"></div>`;
      } else if (obj.type === 'circle') {
        html += `<div class="property-row"><label>半径:</label><input type="number" value="${Math.round(obj.radius)}" data-prop="radius"></div>`;
      }
      
      if (obj.type === 'image' && obj.rotation !== undefined) {
        html += `<div class="property-row"><label>旋转:</label><input type="number" value="${Math.round(obj.rotation)}" data-prop="rotation"></div>`;
      }
      
      if (obj.type === 'fill') {
        // 背景填充对象专属属性
        html += `<div class="property-row"><label>透明度:</label><input type="number" value="${obj.opacity !== undefined ? obj.opacity : 1}" step="0.1" min="0" max="1" data-prop="opacity"></div>`;
        html += `<div class="property-row"><label>填充模式:</label><select id="fill-mode-select" data-prop="fillMode">
          <option value="color" ${obj.fillMode === 'color' || !obj.fillMode ? 'selected' : ''}>纯色</option>
          <option value="gradient" ${obj.fillMode === 'gradient' ? 'selected' : ''}>渐变</option>
          <option value="image" ${obj.fillMode === 'image' ? 'selected' : ''}>图片</option>
          <option value="pattern" ${obj.fillMode === 'pattern' ? 'selected' : ''}>图案材质</option>
        </select></div>`;
        
        if (obj.fillMode === 'color' || !obj.fillMode) {
          html += `<div class="property-row"><label>颜色:</label><input type="color" value="${obj.fillColor || '#333333'}" data-prop="fillColor"></div>`;
        } else if (obj.fillMode === 'gradient') {
          html += `<div class="property-row"><label>渐变类型:</label><select data-prop="gradientType">
            <option value="linear" ${obj.gradientType !== 'radial' ? 'selected' : ''}>线性</option>
            <option value="radial" ${obj.gradientType === 'radial' ? 'selected' : ''}>径向</option>
          </select></div>`;
          html += `<div class="property-row"><label>角度:</label><input type="number" value="${obj.gradientAngle || 0}" data-prop="gradientAngle"></div>`;
          html += `<div class="property-row"><label>起始色:</label><input type="color" value="${(obj.gradientStops && obj.gradientStops[0]?.color) || '#000000'}" data-prop="gradientColor0"></div>`;
          html += `<div class="property-row"><label>结束色:</label><input type="color" value="${(obj.gradientStops && obj.gradientStops[1]?.color) || '#333333'}" data-prop="gradientColor1"></div>`;
        } else if (obj.fillMode === 'image') {
          html += `<div class="property-row"><label>图片路径:</label><input type="text" value="${obj.imageSrc || ''}" data-prop="imageSrc" placeholder="输入图片URL"></div>`;
          html += `<div class="property-row"><label>显示模式:</label><select data-prop="imageMode">
            <option value="stretch" ${obj.imageMode === 'stretch' || !obj.imageMode ? 'selected' : ''}>拉伸</option>
            <option value="cover" ${obj.imageMode === 'cover' ? 'selected' : ''}>覆盖</option>
            <option value="contain" ${obj.imageMode === 'contain' ? 'selected' : ''}>包含</option>
            <option value="tile" ${obj.imageMode === 'tile' ? 'selected' : ''}>平铺</option>
          </select></div>`;
          html += `<div class="property-row"><button id="editor-load-fill-image">加载图片</button></div>`;
        } else if (obj.fillMode === 'pattern') {
          html += `<div class="property-row"><label>图案类型:</label><select data-prop="patternType">
            <option value="grid" ${obj.patternType === 'grid' || !obj.patternType ? 'selected' : ''}>网格</option>
            <option value="dots" ${obj.patternType === 'dots' ? 'selected' : ''}>圆点</option>
            <option value="diagonal" ${obj.patternType === 'diagonal' ? 'selected' : ''}>斜线</option>
            <option value="crosshatch" ${obj.patternType === 'crosshatch' ? 'selected' : ''}>交叉线</option>
          </select></div>`;
          html += `<div class="property-row"><label>图案颜色:</label><input type="color" value="${obj.patternColor || '#444444'}" data-prop="patternColor"></div>`;
          html += `<div class="property-row"><label>底色:</label><input type="color" value="${obj.patternBg || '#222222'}" data-prop="patternBg"></div>`;
          html += `<div class="property-row"><label>图案大小:</label><input type="number" value="${obj.patternSize || 32}" data-prop="patternSize"></div>`;
        }
      } else if (obj.fill) {
        html += `<div class="property-row"><label>颜色:</label><input type="color" value="${obj.fill}" data-prop="fill"></div>`;
      }
    }
    
    html += `<div class="property-row"><button id="editor-delete-obj">删除对象</button></div>`;
    panel.innerHTML = html;
    
    panel.querySelectorAll('input[data-prop], select[data-prop]').forEach(input => {
      input.addEventListener('change', (e) => {
        const prop = e.target.dataset.prop;
        let value;
        
        if (e.target.type === 'number') {
          value = parseFloat(e.target.value);
        } else if (e.target.type === 'color' || e.target.tagName === 'SELECT' || e.target.type === 'text') {
          value = e.target.value;
        } else {
          value = e.target.value;
        }
        
        // 处理渐变颜色的特殊属性
        if (prop === 'gradientColor0' || prop === 'gradientColor1') {
          if (!obj.gradientStops) {
            obj.gradientStops = [{ offset: 0, color: '#000000' }, { offset: 1, color: '#333333' }];
          }
          const idx = prop === 'gradientColor0' ? 0 : 1;
          obj.gradientStops[idx].color = value;
        } else if (prop === 'fillMode') {
          obj.fillMode = value;
          // 切换模式后刷新属性面板
          this._updateObjectProperties();
        } else {
          obj[prop] = value;
        }
        
        // 如果是装饰物，还需要更新原始数据
        if (obj.type === 'decoration' && obj._decoRef) {
          obj._decoRef[prop] = value;
        }
        
        this.render();
      });
    });
    
    // 加载图片按钮
    const loadImgBtn = document.getElementById('editor-load-fill-image');
    if (loadImgBtn) {
      loadImgBtn.addEventListener('click', () => {
        const src = obj.imageSrc;
        if (!src) return;
        const img = new Image();
        img.onload = () => {
          this.loadedImages.set(src, img);
          this.render();
        };
        img.onerror = () => {
          this._showToast('图片加载失败: ' + src, 'error');
        };
        img.src = src;
      });
    }
    
    document.getElementById('editor-delete-obj').addEventListener('click', () => this.deleteSelectedObjects());
  }
  
  /**
   * 更新资源库显示
   */
  updateAssetLibrary() {
    this._updateSpriteList();
    this._updateAtlasList();
  }
  
  /**
   * 更新精灵列表（只显示基础形状）
   * @private
   */
  _updateSpriteList() {
    const list = document.getElementById('editor-asset-list');
    if (!list) return;
    
    // 只添加基础形状占位符
    list.innerHTML = `
      <div class="asset-item placeholder" draggable="true" data-type="rect">
        <div class="asset-preview rect"></div>
        <span>矩形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="circle">
        <div class="asset-preview circle"></div>
        <span>圆形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="fill">
        <div class="asset-preview fill" style="background:linear-gradient(135deg,#333,#666);border:1px dashed #888;"></div>
        <span>背景填充</span>
      </div>
    `;
    
    // 图片资源请使用"图集"标签页
  }
  
  /**
   * 更新图集列表
   * @private
   */
  _updateAtlasList() {
    const list = document.getElementById('editor-atlas-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (!this.sceneData.atlases || this.sceneData.atlases.length === 0) {
      list.innerHTML = '<div style="padding:10px;color:#666;text-align:center;font-size:11px;">暂无图集</div>';
      return;
    }
    
    for (const atlas of this.sceneData.atlases) {
      const item = document.createElement('div');
      item.className = 'atlas-item';
      
      let slicesHtml = '';
      if (atlas.slices) {
        for (const [sliceKey, slice] of Object.entries(atlas.slices)) {
          slicesHtml += `
            <div class="slice-item" draggable="true" data-atlas="${atlas.id}" data-slice="${sliceKey}">
              <div class="slice-preview" style="background:${sliceKey.includes('tree') ? '#2a5a2a' : '#4a6a3a'}">
              </div>
              <span>${slice.name || sliceKey}</span>
            </div>
          `;
        }
      }
      
      item.innerHTML = `
        <div class="atlas-header">
          <span>${atlas.name}</span>
          <span style="font-size:10px;color:#666;">${atlas.width}×${atlas.height}</span>
        </div>
        <div class="slice-grid">
          ${slicesHtml}
        </div>
      `;
      
      list.appendChild(item);
    }
    
    // 直接为每个切片项绑定事件
    list.querySelectorAll('.slice-item').forEach(sliceItem => {
      // 点击选中
      sliceItem.addEventListener('click', (e) => {
        e.stopPropagation();
        const atlasId = sliceItem.dataset.atlas;
        const sliceKey = sliceItem.dataset.slice;
        this._selectSlice(atlasId, sliceKey);
      });
      
      // 拖拽事件
      sliceItem.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        const atlasId = sliceItem.dataset.atlas;
        const sliceKey = sliceItem.dataset.slice;
        console.log('Drag start:', atlasId, sliceKey);
        
        // 设置拖拽数据
        this.draggingSlice = { atlasId, sliceKey };
        
        // 设置 dataTransfer
        e.dataTransfer.setData('text/plain', `slice:${atlasId}:${sliceKey}`);
        e.dataTransfer.effectAllowed = 'copy';
        sliceItem.classList.add('dragging');
      });
      
      sliceItem.addEventListener('dragend', (e) => {
        sliceItem.classList.remove('dragging');
      });
    });
  }
  
  /**
   * 选中切片
   */
  _selectSlice(atlasId, sliceKey) {
    console.log('_selectSlice called:', atlasId, sliceKey);
    
    const atlas = this.sceneData.atlases?.find(a => a.id === atlasId);
    if (!atlas) {
      console.log('Atlas not found:', atlasId);
      return;
    }
    
    const slice = atlas.slices?.[sliceKey];
    if (!slice) {
      console.log('Slice not found:', sliceKey);
      return;
    }
    
    // 更新选中状态
    this.container.querySelectorAll('.slice-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    const selectedEl = this.container.querySelector(`.slice-item[data-atlas="${atlasId}"][data-slice="${sliceKey}"]`);
    if (selectedEl) {
      selectedEl.classList.add('selected');
    }
    
    // 显示切片属性
    const propsPanel = document.getElementById('slice-properties');
    if (propsPanel) {
      propsPanel.innerHTML = `
        <div class="slice-prop-row">
          <label>名称:</label>
          <input type="text" id="slice-name" value="${slice.name || sliceKey}">
        </div>
        <div class="slice-prop-row">
          <label>X:</label>
          <input type="number" id="slice-sx" value="${slice.sx}">
        </div>
        <div class="slice-prop-row">
          <label>Y:</label>
          <input type="number" id="slice-sy" value="${slice.sy}">
        </div>
        <div class="slice-prop-row">
          <label>宽度:</label>
          <input type="number" id="slice-sw" value="${slice.sw}">
        </div>
        <div class="slice-prop-row">
          <label>高度:</label>
          <input type="number" id="slice-sh" value="${slice.sh}">
        </div>
        <div class="slice-prop-row">
          <label>碰撞:</label>
          <input type="checkbox" id="slice-collide" ${slice.collide ? 'checked' : ''}>
        </div>
        <div class="slice-prop-row">
          <label>碰撞半径:</label>
          <input type="number" id="slice-radius" value="${slice.colliderRadius || 16}">
        </div>
      `;
      
      // 绑定属性修改事件
      ['name', 'sx', 'sy', 'sw', 'sh', 'collide', 'radius'].forEach(prop => {
        const el = document.getElementById(`slice-${prop}`);
        if (el) {
          el.addEventListener('change', () => {
            let value;
            if (el.type === 'checkbox') {
              value = el.checked;
            } else if (el.type === 'number') {
              value = parseFloat(el.value);
            } else {
              value = el.value;
            }
            
            const actualProp = prop === 'radius' ? 'colliderRadius' : prop;
            slice[actualProp] = value;
            
            // 同步更新decoSprites
            if (this.sceneData.decoSprites && this.sceneData.decoSprites[sliceKey]) {
              this.sceneData.decoSprites[sliceKey][actualProp] = value;
            }
            
            this.render();
          });
        }
      });
    }
    
    this.selectedSlice = { atlasId, sliceKey, slice };
  }
  
  /**
   * 保存历史状态
   * @private
   */
  _saveHistory() {
    this.history.undoStack.push(JSON.stringify(this.sceneData));
    if (this.history.undoStack.length > this.history.maxSize) this.history.undoStack.shift();
    this.history.redoStack = [];
  }
  
  /**
   * 撤销
   */
  undo() {
    if (this.history.undoStack.length === 0) return;
    this.history.redoStack.push(JSON.stringify(this.sceneData));
    this.sceneData = JSON.parse(this.history.undoStack.pop());
    this.selectedObjects = [];
    this._updateLayerList();
    this._updateObjectProperties();
    this._updateObjectCount();
    this.render();
  }
  
  /**
   * 重做
   */
  redo() {
    if (this.history.redoStack.length === 0) return;
    this.history.undoStack.push(JSON.stringify(this.sceneData));
    this.sceneData = JSON.parse(this.history.redoStack.pop());
    this.selectedObjects = [];
    this._updateLayerList();
    this._updateObjectProperties();
    this._updateObjectCount();
    this.render();
  }
  
  /**
   * 渲染场景
   */
  render() {
    const canvas = document.getElementById('editor-canvas');
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
    ctx.scale(this.viewport.scale, this.viewport.scale);
    
    // 计算场景可见区域（以地形中心为基准居中）
    const centerX = this.sceneData.centerX || this.sceneData.width / 2;
    const centerY = this.sceneData.centerY || this.sceneData.height / 2;
    const sceneW = this.sceneData.width;
    const sceneH = this.sceneData.height;
    // 场景矩形以地形中心为中心
    const sceneX = centerX - sceneW / 2;
    const sceneY = centerY - sceneH / 2;
    
    // 绘制背景（辅助用的长方形纯色背景，以地形中心为中心）
    if (this.options.showBackground) {
      ctx.fillStyle = this.sceneData.backgroundColor || '#1a2a1a';
      ctx.fillRect(sceneX, sceneY, sceneW, sceneH);
    }
    
    // 绘制场景边框（辅助线）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1 / this.viewport.scale;
    ctx.strokeRect(sceneX, sceneY, sceneW, sceneH);
    
    // 检查是否是地形场景（舞台）
    if (this.sceneData.terrain) {
      this._renderTerrainScene(ctx);
    }
    
    // 绘制网格（以地形中心为基准对齐）
    if (this.options.showGrid) this._renderGrid(ctx, sceneX, sceneY, sceneW, sceneH);
    
    // 绘制图层
    for (const layer of this.sceneData.layers) {
      if (!layer.visible) continue;
      for (const obj of layer.objects) this._renderObject(ctx, obj);
    }
    
    ctx.restore();
    this._renderSelection();
  }
  
  /**
   * 渲染网格
   * @private
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} startX - 网格起始X
   * @param {number} startY - 网格起始Y
   * @param {number} width - 网格区域宽度
   * @param {number} height - 网格区域高度
   */
  _renderGrid(ctx, startX, startY, width, height) {
    const gridSize = this.options.gridSize;
    // 使用传入区域，没有则回退到旧逻辑
    const sx = startX !== undefined ? startX : 0;
    const sy = startY !== undefined ? startY : 0;
    const w = width !== undefined ? width : this.sceneData.width;
    const h = height !== undefined ? height : this.sceneData.height;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1 / this.viewport.scale;
    
    // 从起始位置开始按 gridSize 步进绘制网格
    const gridStartX = Math.ceil(sx / gridSize) * gridSize;
    const gridStartY = Math.ceil(sy / gridSize) * gridSize;
    
    for (let x = gridStartX; x <= sx + w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x, sy + h);
      ctx.stroke();
    }
    
    for (let y = gridStartY; y <= sy + h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + w, y);
      ctx.stroke();
    }
  }
  
  /**
   * 渲染对象
   * @private
   */
  _renderObject(ctx, obj) {
    if (obj.type === 'fill') {
      // 背景填充对象 — 支持纯色、图片、渐变、图案材质
      this._renderFillObject(ctx, obj);
    } else if (obj.type === 'rect') {
      ctx.fillStyle = obj.fill || '#4a5a8e';
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
    } else if (obj.type === 'circle') {
      ctx.fillStyle = obj.fill || '#4a8e5a';
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (obj.type === 'image') {
      const img = this.loadedImages.get(obj.imageId);
      if (img) {
        ctx.save();
        ctx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2);
        if (obj.rotation) ctx.rotate(obj.rotation * Math.PI / 180);
        ctx.drawImage(img, -obj.width / 2, -obj.height / 2, obj.width, obj.height);
        ctx.restore();
      }
    } else if (obj.type === 'slice') {
      // 渲染切片
      let img, sx, sy, sw, sh;
      
      if (obj.decoKey) {
        // 来自装饰物（decoSprites）的切片，使用地形底图
        const sprite = this.sceneData.decoSprites?.[obj.decoKey];
        img = this.loadedImages.get('terrain_atlas');
        if (!img && this.sceneData.atlases) {
          for (const atlas of this.sceneData.atlases) {
            const a = this.loadedImages.get(atlas.id);
            if (a) { img = a; break; }
          }
        }
        if (sprite) { sx = sprite.sx; sy = sprite.sy; sw = sprite.sw; sh = sprite.sh; }
      } else {
        // 来自图集（atlases）的切片
        const atlas = this.sceneData.atlases?.find(a => a.id === obj.atlasId);
        const slice = atlas?.slices?.[obj.sliceKey];
        img = this.loadedImages.get(obj.atlasId);
        if (slice) { sx = slice.sx; sy = slice.sy; sw = slice.sw; sh = slice.sh; }
      }
      
      if (img && sw != null) {
        ctx.drawImage(
          img,
          sx, sy, sw, sh,
          obj.x, obj.y, obj.width, obj.height
        );
      } else {
        // 如果图片未加载，显示占位符
        ctx.fillStyle = '#3a5a3a';
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
        ctx.strokeStyle = '#5a8a5a';
        ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
      }
    }
  }
  
  /**
   * 渲染背景填充对象
   * 支持: color(纯色), image(图片), gradient(渐变), pattern(图案平铺)
   * @private
   */
  _renderFillObject(ctx, obj) {
    const x = obj.x || 0;
    const y = obj.y || 0;
    const w = obj.width || this.sceneData.width;
    const h = obj.height || this.sceneData.height;
    
    ctx.save();
    
    // 透明度
    if (obj.opacity !== undefined) {
      ctx.globalAlpha = obj.opacity;
    }
    
    const fillMode = obj.fillMode || 'color';
    
    if (fillMode === 'color') {
      // 纯色填充
      ctx.fillStyle = obj.fillColor || '#333333';
      ctx.fillRect(x, y, w, h);
      
    } else if (fillMode === 'gradient') {
      // 渐变填充
      let grad;
      if (obj.gradientType === 'radial') {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = Math.max(w, h) / 2;
        grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      } else {
        // 默认线性渐变
        const angle = (obj.gradientAngle || 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        grad = ctx.createLinearGradient(
          x + w / 2 - cos * w / 2, y + h / 2 - sin * h / 2,
          x + w / 2 + cos * w / 2, y + h / 2 + sin * h / 2
        );
      }
      const stops = obj.gradientStops || [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#333333' }
      ];
      for (const stop of stops) {
        grad.addColorStop(stop.offset, stop.color);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      
    } else if (fillMode === 'image') {
      // 图片填充
      const img = this.loadedImages.get(obj.imageId || obj.imageSrc);
      if (img) {
        const drawMode = obj.imageMode || 'stretch';
        if (drawMode === 'stretch') {
          ctx.drawImage(img, x, y, w, h);
        } else if (drawMode === 'cover') {
          // 等比缩放覆盖
          const imgRatio = img.width / img.height;
          const boxRatio = w / h;
          let sw, sh, sx, sy;
          if (imgRatio > boxRatio) {
            sh = img.height;
            sw = sh * boxRatio;
            sx = (img.width - sw) / 2;
            sy = 0;
          } else {
            sw = img.width;
            sh = sw / boxRatio;
            sx = 0;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
        } else if (drawMode === 'contain') {
          // 等比缩放包含
          const imgRatio = img.width / img.height;
          const boxRatio = w / h;
          let dw, dh, dx, dy;
          if (imgRatio > boxRatio) {
            dw = w;
            dh = w / imgRatio;
            dx = x;
            dy = y + (h - dh) / 2;
          } else {
            dh = h;
            dw = h * imgRatio;
            dx = x + (w - dw) / 2;
            dy = y;
          }
          ctx.drawImage(img, dx, dy, dw, dh);
        } else if (drawMode === 'tile') {
          // 平铺
          const tileW = obj.tileWidth || img.width;
          const tileH = obj.tileHeight || img.height;
          const pattern = ctx.createPattern(img, 'repeat');
          ctx.fillStyle = pattern;
          ctx.translate(x, y);
          ctx.fillRect(0, 0, w, h);
          ctx.translate(-x, -y);
        }
      } else {
        // 图片未加载 - 显示占位符
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#5a5a5a';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        ctx.setLineDash([]);
        ctx.fillStyle = '#888';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🖼️ ' + (obj.imageSrc || '未设置图片'), x + w / 2, y + h / 2);
      }
      
    } else if (fillMode === 'pattern') {
      // 图案材质填充（纯几何图案，不需要外部图片）
      const patternType = obj.patternType || 'grid';
      const patternColor = obj.patternColor || '#444444';
      const patternBg = obj.patternBg || '#222222';
      const patternSize = obj.patternSize || 32;
      
      // 先画底色
      ctx.fillStyle = patternBg;
      ctx.fillRect(x, y, w, h);
      
      ctx.strokeStyle = patternColor;
      ctx.fillStyle = patternColor;
      ctx.lineWidth = 1;
      
      if (patternType === 'grid') {
        for (let px = x; px < x + w; px += patternSize) {
          ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
        }
        for (let py = y; py < y + h; py += patternSize) {
          ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke();
        }
      } else if (patternType === 'dots') {
        for (let px = x + patternSize / 2; px < x + w; px += patternSize) {
          for (let py = y + patternSize / 2; py < y + h; py += patternSize) {
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (patternType === 'diagonal') {
        ctx.beginPath();
        for (let d = -h; d < w + h; d += patternSize) {
          ctx.moveTo(x + d, y);
          ctx.lineTo(x + d + h, y + h);
        }
        ctx.stroke();
      } else if (patternType === 'crosshatch') {
        ctx.beginPath();
        for (let d = -h; d < w + h; d += patternSize) {
          ctx.moveTo(x + d, y);
          ctx.lineTo(x + d + h, y + h);
          ctx.moveTo(x + d + h, y);
          ctx.lineTo(x + d, y + h);
        }
        ctx.stroke();
      }
    }
    
    ctx.restore();
  }
  
  /**
   * 渲染地形场景（椭圆盆地 + 装饰物）
   * @private
   */
  _renderTerrainScene(ctx) {
    const data = this.sceneData;
    if (!data.terrain) return;
    
    // 获取图层可见性
    const getLayerVisible = (layerName) => {
      const layer = this.sceneData.layers.find(l => l.name === layerName);
      return layer ? layer.visible : true;
    };
    
    const terrainType = data.terrain.type || 'basin';
    
    // 根据场景类型渲染不同背景
    if (terrainType === 'indoor') {
      // 室内场景
      this._renderIndoorScene(ctx, getLayerVisible);
    } else {
      // 室外场景（盆地、军营、战场等）
      this._renderOutdoorScene(ctx, getLayerVisible);
    }
    
    // 绘制装饰层
    if (getLayerVisible('装饰层') && data.decorations) {
      const sortedDecos = [...data.decorations].sort((a, b) => a.y - b.y);
      for (const deco of sortedDecos) {
        this._renderDecoration(ctx, deco, data.decoSprites);
      }
    }
  }
  
  /**
   * 渲染室内场景
   */
  _renderIndoorScene(ctx, getLayerVisible) {
    const data = this.sceneData;
    
    if (!getLayerVisible('背景层')) return;
    
    // 室内地面
    ctx.fillStyle = data.backgroundColor || '#2a2020';
    ctx.fillRect(0, 0, data.width, data.height);
    
    // 地板纹理
    const tileSize = data.terrain?.tileSize || 48;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < data.width; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, data.height);
      ctx.stroke();
    }
    for (let y = 0; y < data.height; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(data.width, y);
      ctx.stroke();
    }
    
    // 墙壁
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, data.width, 60);
    ctx.fillRect(0, 0, 40, data.height);
    ctx.fillRect(data.width - 40, 0, 40, data.height);
    ctx.fillRect(0, data.height - 40, data.width, 40);
  }
  
  /**
   * 渲染室外场景
   * 背景层：草地椭圆填充（最底层）
   * 遮罩层：森林环带椭圆（大椭圆渐变，覆盖在背景层之上）
   */
  _renderOutdoorScene(ctx, getLayerVisible) {
    const data = this.sceneData;
    
    const centerX = data.centerX || data.width / 2;
    const centerY = (data.centerY || data.height / 2) - 32;
    const radiusX = data.basinRadius || 640;
    const radiusY = radiusX * (data.basinAspectY || 0.65);
    const terrainType = data.terrain?.type || 'basin';
    
    // 根据场景类型选择颜色
    let grassColor = '#3a5a2a';
    let forestColor = 'rgba(35, 58, 25, 1)';
    
    if (terrainType === 'battlefield') {
      grassColor = '#4a3030';
      forestColor = 'rgba(50, 30, 25, 1)';
    } else if (terrainType === 'mountain') {
      grassColor = '#404a30';
      forestColor = 'rgba(40, 45, 30, 1)';
    } else if (terrainType === 'camp') {
      grassColor = '#3a4a3a';
      forestColor = 'rgba(30, 50, 35, 1)';
    }
    
    // 背景层：草地椭圆（最底层，先画）
    if (getLayerVisible('背景层')) {
      ctx.fillStyle = grassColor;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX + 20, radiusY + 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 遮罩层：森林环带（大椭圆渐变，画在背景层之上）
    if (getLayerVisible('遮罩层')) {
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(1, data.basinAspectY || 0.65);
      const grad = ctx.createRadialGradient(0, 0, radiusX - 10, 0, 0, radiusX + 110);
      grad.addColorStop(0, forestColor);
      grad.addColorStop(0.55, forestColor.replace('1)', '0.92)'));
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, radiusX + 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  
  /**
   * 渲染单个装饰物
   * @private
   */
  _renderDecoration(ctx, deco, decoSprites) {
    if (!decoSprites || !decoSprites[deco.key]) {
      // 没有精灵配置时绘制占位符
      ctx.fillStyle = deco.key.includes('tree') ? '#2a4a2a' : '#4a6a4a';
      const size = deco.key.includes('tree') ? 32 : 16;
      ctx.beginPath();
      ctx.arc(deco.x, deco.y, size, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    
    const sprite = decoSprites[deco.key];
    const scale = deco.scale * (sprite.scale || 1);
    const w = sprite.sw * scale;
    const h = sprite.sh * scale;
    
    // 检查是否已加载图集
    // 优先用地形底图 terrain_atlas，找不到时回退到场景图集（如 mountain_landscape）
    let img = this.loadedImages.get('terrain_atlas');
    if (!img && this.sceneData.atlases) {
      for (const atlas of this.sceneData.atlases) {
        const a = this.loadedImages.get(atlas.id);
        if (a) { img = a; break; }
      }
    }
    
    if (img) {
      // 从图集绘制
      ctx.drawImage(
        img,
        sprite.sx, sprite.sy, sprite.sw, sprite.sh,
        deco.x - w / 2, deco.y - h, w, h
      );
    } else {
      // 绘制占位符
      ctx.fillStyle = deco.key.includes('tree') ? '#2a5a2a' : '#5a8a4a';
      ctx.fillRect(deco.x - w / 2, deco.y - h, w, h);
      
      // 标记类型
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(deco.key.substring(0, 3), deco.x, deco.y - h / 2);
    }
  }
  
  /**
   * 渲染选中框
   * @private
   */
  _renderSelection() {
    const overlay = document.getElementById('editor-overlay');
    if (!overlay) return;
    
    const ctx = overlay.getContext('2d');
    
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (this.selectedObjects.length === 0) return;
    
    ctx.save();
    ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
    ctx.scale(this.viewport.scale, this.viewport.scale);
    
    // 白色虚线框
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / this.viewport.scale;
    ctx.setLineDash([6 / this.viewport.scale, 4 / this.viewport.scale]);
    
    const handleSize = 8 / this.viewport.scale;
    
    for (const obj of this.selectedObjects) {
      let x, y, w, h;
      
      if (obj.type === 'decoration') {
        // 装饰物选中框
        w = obj.width || 64;
        h = obj.height || 64;
        x = obj.x - w / 2 - 2;
        y = obj.y - h - 2;
        w += 4;
        h += 4;
        ctx.strokeRect(x, y, w, h);
      } else if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill') {
        x = obj.x - 2;
        y = obj.y - 2;
        w = obj.width + 4;
        h = obj.height + 4;
        ctx.strokeRect(x, y, w, h);
      } else if (obj.type === 'circle') {
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
        continue; // 圆形不画缩放手柄
      } else {
        continue;
      }
      
      // 绘制右下角缩放手柄
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = 1.5 / this.viewport.scale;
      const hx = x + w - handleSize / 2;
      const hy = y + h - handleSize / 2;
      ctx.fillRect(hx, hy, handleSize, handleSize);
      ctx.strokeRect(hx, hy, handleSize, handleSize);
      
      // 恢复虚线样式供下一个对象
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / this.viewport.scale;
      ctx.setLineDash([6 / this.viewport.scale, 4 / this.viewport.scale]);
    }
    
    ctx.restore();
  }
  
  /**
   * 规范化图层结构
   * - 确保标准四层齐全（背景层/遮罩层/装饰层/实体层）
   * - 确保每个图层都有 objects 数组、visible/locked 字段
   * - 保留已存在图层的对象，并保持标准图层的顺序
   * @param {Array} layers 传入的图层数组（可能不完整或为旧结构）
   * @returns {Array} 规范化后的图层数组
   * @private
   */
  _normalizeLayers(layers) {
    const standard = [
      { id: 'layer_bg', name: '背景层' },
      { id: 'layer_fill', name: '背景填充层' },
      { id: 'layer_mask', name: '遮罩层' },
      { id: 'layer_deco', name: '装饰层' },
      { id: 'layer_entity', name: '实体层' }
    ];
    
    const input = Array.isArray(layers) ? layers : [];
    const byId = new Map();
    for (const l of input) {
      if (l && l.id) byId.set(l.id, l);
    }
    
    const result = [];
    
    // 1. 按标准顺序生成四个标准图层（复用已存在的对象）
    for (const std of standard) {
      const existing = byId.get(std.id);
      result.push({
        id: std.id,
        name: existing?.name || std.name,
        visible: existing?.visible !== false,
        locked: existing?.locked === true,
        objects: Array.isArray(existing?.objects) ? existing.objects : []
      });
      byId.delete(std.id);
    }
    
    // 2. 追加非标准的自定义图层（保持其原有数据）
    for (const l of input) {
      if (l && l.id && byId.has(l.id)) {
        result.push({
          id: l.id,
          name: l.name || l.id,
          visible: l.visible !== false,
          locked: l.locked === true,
          objects: Array.isArray(l.objects) ? l.objects : []
        });
        byId.delete(l.id);
      }
    }
    
    return result;
  }
  
  /**
   * 加载场景数据
   */
  loadScene(sceneData) {
    // 使用全新的基础结构，避免上一个场景的字段（atlases/terrain/decorations 等）残留串台
    // 从 JSON 配置获取默认层
    const defaults = _editorDefaults || {};
    const sceneCfg = defaults.scene || {};
    const defaultLayers = (sceneCfg.layers || [
      { id: 'layer_bg', name: '背景层', visible: true, locked: false },
      { id: 'layer_fill', name: '背景填充层', visible: true, locked: false },
      { id: 'layer_mask', name: '遮罩层', visible: true, locked: false },
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
    
    // 深拷贝传入数据，避免直接引用 localStorage/预设对象导致互相污染
    const incoming = sceneData ? JSON.parse(JSON.stringify(sceneData)) : {};
    this.sceneData = { ...base, ...incoming };
    
    // 规范化图层：确保标准图层齐全、每个图层都有 objects 数组
    this.sceneData.layers = this._normalizeLayers(this.sceneData.layers);
    
    // 清空已加载的图集图片缓存（新场景可能有不同图集）
    this.loadedImages = new Map();
    this.selectedObjects = [];
    this.selectedSlice = null;
    this.activeLayerIndex = 0;
    this.history = { undoStack: [], redoStack: [], maxSize: 50 };
    
    // 更新UI
    const nameInput = document.getElementById('editor-scene-name');
    const bgInput = document.getElementById('editor-bg-color');
    const widthInput = document.getElementById('editor-scene-width');
    const heightInput = document.getElementById('editor-scene-height');
    
    if (nameInput) nameInput.value = this.sceneData.name;
    if (bgInput) bgInput.value = this.sceneData.backgroundColor;
    if (widthInput) widthInput.value = this.sceneData.width;
    if (heightInput) heightInput.value = this.sceneData.height;
    
    // 更新画布尺寸（跟随容器，场景通过 viewport 居中）
    const canvas = document.getElementById('editor-canvas');
    const overlay = document.getElementById('editor-overlay');
    const container = document.getElementById('editor-canvas-container');
    
    if (canvas && overlay && container) {
      const cw = container.clientWidth || 800;
      const ch = container.clientHeight || 600;
      canvas.width = cw;
      canvas.height = ch;
      overlay.width = cw;
      overlay.height = ch;
    }
    
    // 加载图集图片
    this._loadAtlasImages();
    
    this._fitToContainer();
    this._updateLayerList();
    this._updateObjectCount();
    this.updateAssetLibrary();
    this.render();
  }
  
  /**
   * 加载图集图片
   * @private
   */
  _loadAtlasImages() {
    // 1. 加载地形底图（用于渲染原有装饰物 decorations）
    //    地形装饰物切片坐标基于该底图，统一以 'terrain_atlas' 为 id 缓存
    const terrainImage = this.sceneData.terrain?.image;
    if (terrainImage && !this.loadedImages.has('terrain_atlas')) {
      const timg = new Image();
      timg.onload = () => {
        this.loadedImages.set('terrain_atlas', timg);
        this.render();
      };
      timg.onerror = () => {
        console.error('Failed to load terrain image:', terrainImage);
      };
      timg.src = terrainImage;
    }
    
    // 2. 加载图集（用于切片预览和拖入的 slice 对象）
    if (!this.sceneData.atlases) {
      return;
    }
    
    for (const atlas of this.sceneData.atlases) {
      const img = new Image();
      img.onload = () => {
        this.loadedImages.set(atlas.id, img);
        this.render();
        this._updateSlicePreviews();
      };
      img.onerror = () => {
        console.error('Failed to load atlas:', atlas.id, 'path:', atlas.path);
      };
      img.src = atlas.path;
    }
  }
  
  /**
   * 更新切片预览图
   * @private
   */
  _updateSlicePreviews() {
    if (!this.sceneData.atlases) return;
    
    console.log('Updating slice previews, atlases:', this.sceneData.atlases.length);
    
    for (const atlas of this.sceneData.atlases) {
      const img = this.loadedImages.get(atlas.id);
      if (!img) {
        console.log('Image not loaded for atlas:', atlas.id);
        continue;
      }
      
      console.log('Processing slices for atlas:', atlas.id);
      
      for (const [sliceKey, slice] of Object.entries(atlas.slices || {})) {
        const previewEl = this.container.querySelector(
          `.slice-item[data-atlas="${atlas.id}"][data-slice="${sliceKey}"] .slice-preview`
        );
        
        if (previewEl) {
          // 创建临时canvas来裁剪图片
          const canvas = document.createElement('canvas');
          canvas.width = slice.sw;
          canvas.height = slice.sh;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, slice.sx, slice.sy, slice.sw, slice.sh, 0, 0, slice.sw, slice.sh);
          
          previewEl.innerHTML = `<img src="${canvas.toDataURL()}" alt="${slice.name || sliceKey}">`;
          console.log('Updated preview for slice:', sliceKey);
        } else {
          console.log('Preview element not found for slice:', sliceKey);
        }
      }
    }
  }
  
  /**
   * 保存场景
   */
  save() {
    if (this.onSceneChange) this.onSceneChange(this.sceneData);
    this._showToast('场景已保存');
    return this.sceneData;
  }
  
  /**
   * 显示提示消息
   * @private
   */
  _showToast(message, type = 'success') {
    let toast = document.getElementById('editor-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'editor-toast';
      toast.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);padding:10px 24px;border-radius:6px;color:#fff;font-size:14px;z-index:99999;transition:opacity 0.3s;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      document.body.appendChild(toast);
    }
    toast.style.background = type === 'success' ? '#4CAF50' : '#e53935';
    toast.textContent = message;
    toast.style.opacity = '1';
    
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 1800);
  }
  
  /**
   * 导出JSON
   */
  exportJSON() {
    const json = JSON.stringify(this.sceneData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.sceneData.name || 'scene'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return json;
  }
  
  /**
   * 导入JSON
   */
  importJSON(source) {
    const loadJSON = (json) => {
      try {
        this.loadScene(JSON.parse(json));
        return true;
      } catch (e) {
        console.error('导入失败:', e);
        return false;
      }
    };
    
    if (source instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => loadJSON(e.target.result);
      reader.readAsText(source);
    } else if (typeof source === 'string') {
      return loadJSON(source);
    }
    return false;
  }
  
  /**
   * 获取场景数据
   */
  getSceneData() {
    return this.sceneData;
  }
}
