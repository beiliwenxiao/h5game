/**
 * SceneEditor - 场景编辑器
 * 
 * 功能：
 * - 创建和编辑游戏场景
 * - 拖拽、旋转、缩放图片元素
 * - 多图层管理
 * - 保存和导出场景配置
 * - 支持导入背景贴图
 */

export class SceneEditor {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    
    this.options = {
      width: options.width || 1280,
      height: options.height || 720,
      gridSize: options.gridSize || 32,
      showGrid: options.showGrid !== false,
      ...options
    };
    
    // 场景数据
    this.sceneData = {
      id: null,
      name: '新场景',
      width: this.options.width,
      height: this.options.height,
      backgroundColor: '#2a3a1a',
      layers: [
        { id: 'layer_bg', name: '背景层', visible: true, locked: false, objects: [] },
        { id: 'layer_deco', name: '装饰层', visible: true, locked: false, objects: [] },
        { id: 'layer_entity', name: '实体层', visible: true, locked: false, objects: [] }
      ],
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
      scale: 1,
      offsetX: 0,
      offsetY: 0
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
    
    // 撤销/重做栈
    this.history = {
      undoStack: [],
      redoStack: [],
      maxSize: 50
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
                <div class="asset-actions">
                  <button id="editor-add-image">添加图片</button>
                  <button id="editor-use-slicer">图片分割</button>
                </div>
                <div class="asset-list" id="editor-asset-list">
                  <div class="asset-item placeholder" data-type="rect">
                    <div class="asset-preview rect"></div>
                    <span>矩形</span>
                  </div>
                  <div class="asset-item placeholder" data-type="circle">
                    <div class="asset-preview circle"></div>
                    <span>圆形</span>
                  </div>
                </div>
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
    
    canvas.width = this.sceneData.width;
    canvas.height = this.sceneData.height;
    overlay.width = this.sceneData.width;
    overlay.height = this.sceneData.height;
    
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
    
    // 检查容器尺寸
    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight || 600;
    
    const scaleX = containerWidth / this.sceneData.width;
    const scaleY = containerHeight / this.sceneData.height;
    this.viewport.scale = Math.min(scaleX, scaleY, 2) * 0.9;
    
    this.viewport.offsetX = (containerWidth - this.sceneData.width * this.viewport.scale) / 2;
    this.viewport.offsetY = (containerHeight - this.sceneData.height * this.viewport.scale) / 2;
    
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
    container.addEventListener('contextmenu', (e) => e.preventDefault());
    
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
    
    container.addEventListener('dragover', (e) => e.preventDefault());
    
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const pos = this._screenToScene(e.offsetX, e.offsetY);
      
      if (id === 'rect') {
        this.addObject({ type: 'rect', x: pos.x - 32, y: pos.y - 32, width: 64, height: 64, fill: '#4a5a8e' });
      } else if (id === 'circle') {
        this.addObject({ type: 'circle', x: pos.x, y: pos.y, radius: 32, fill: '#4a8e5a' });
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
    if (!this.interaction.isDragging) return;
    
    if (this.interaction.mode === 'pan') {
      this.viewport.offsetX = e.offsetX - this.interaction.dragStart.x;
      this.viewport.offsetY = e.offsetY - this.interaction.dragStart.y;
      this.render();
    } else if (this.interaction.mode === 'select' && this.selectedObjects.length > 0) {
      const pos = this._screenToScene(e.offsetX, e.offsetY);
      const dx = pos.x - this.interaction.dragStart.x;
      const dy = pos.y - this.interaction.dragStart.y;
      
      for (const obj of this.selectedObjects) {
        obj.x = this.interaction.objectStart.x + dx;
        obj.y = this.interaction.objectStart.y + dy;
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
    if (this.interaction.isDragging && this.selectedObjects.length > 0) {
      this._saveHistory();
    }
    this.interaction.isDragging = false;
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
    const layer = this.sceneData.layers[this.activeLayerIndex];
    if (!layer || layer.locked) return null;
    
    for (let i = layer.objects.length - 1; i >= 0; i--) {
      const obj = layer.objects[i];
      
      if (obj.type === 'rect' || obj.type === 'image') {
        if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) return obj;
      } else if (obj.type === 'circle') {
        if (Math.hypot(x - obj.x, y - obj.y) <= obj.radius) return obj;
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
    list.innerHTML = '';
    
    for (let i = this.sceneData.layers.length - 1; i >= 0; i--) {
      const layer = this.sceneData.layers[i];
      const item = document.createElement('div');
      item.className = 'layer-item' + (i === this.activeLayerIndex ? ' active' : '');
      item.innerHTML = `
        <span class="layer-visibility">${layer.visible ? '👁' : '👁‍🗨'}</span>
        <span class="layer-name">${layer.name}</span>
      `;
      
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('layer-visibility')) {
          layer.visible = !layer.visible;
          this.render();
        } else {
          this.activeLayerIndex = i;
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
    const layer = this.sceneData.layers[this.activeLayerIndex];
    if (!layer) return;
    
    for (const obj of this.selectedObjects) {
      const index = layer.objects.indexOf(obj);
      if (index !== -1) layer.objects.splice(index, 1);
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
    for (const layer of this.sceneData.layers) count += layer.objects.length;
    document.getElementById('editor-object-count').textContent = count;
  }
  
  /**
   * 更新选中对象属性面板
   * @private
   */
  _updateObjectProperties() {
    const panel = document.getElementById('editor-object-properties');
    
    if (this.selectedObjects.length === 0) {
      panel.innerHTML = '<div class="no-selection">未选中任何对象</div>';
      return;
    }
    
    if (this.selectedObjects.length > 1) {
      panel.innerHTML = `<div>已选中 ${this.selectedObjects.length} 个对象</div>`;
      return;
    }
    
    const obj = this.selectedObjects[0];
    let html = `<div class="property-row"><label>ID:</label><input value="${obj.id}" disabled></div>`;
    html += `<div class="property-row"><label>X:</label><input type="number" value="${Math.round(obj.x)}" data-prop="x"></div>`;
    html += `<div class="property-row"><label>Y:</label><input type="number" value="${Math.round(obj.y)}" data-prop="y"></div>`;
    
    if (obj.type === 'rect' || obj.type === 'image') {
      html += `<div class="property-row"><label>宽度:</label><input type="number" value="${Math.round(obj.width)}" data-prop="width"></div>`;
      html += `<div class="property-row"><label>高度:</label><input type="number" value="${Math.round(obj.height)}" data-prop="height"></div>`;
    } else if (obj.type === 'circle') {
      html += `<div class="property-row"><label>半径:</label><input type="number" value="${Math.round(obj.radius)}" data-prop="radius"></div>`;
    }
    
    if (obj.type === 'image' && obj.rotation !== undefined) {
      html += `<div class="property-row"><label>旋转:</label><input type="number" value="${Math.round(obj.rotation)}" data-prop="rotation"></div>`;
    }
    
    if (obj.fill) {
      html += `<div class="property-row"><label>颜色:</label><input type="color" value="${obj.fill}" data-prop="fill"></div>`;
    }
    
    html += `<div class="property-row"><button id="editor-delete-obj">删除对象</button></div>`;
    panel.innerHTML = html;
    
    panel.querySelectorAll('input[data-prop]').forEach(input => {
      input.addEventListener('change', (e) => {
        obj[e.target.dataset.prop] = parseFloat(e.target.value);
        this.render();
      });
    });
    
    document.getElementById('editor-delete-obj').addEventListener('click', () => this.deleteSelectedObjects());
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
    
    // 绘制背景
    ctx.fillStyle = this.sceneData.backgroundColor || '#1a2a1a';
    ctx.fillRect(0, 0, this.sceneData.width, this.sceneData.height);
    
    // 检查是否是地形场景
    if (this.sceneData.terrain) {
      this._renderTerrainScene(ctx);
    }
    
    // 绘制网格
    if (this.options.showGrid) this._renderGrid(ctx);
    
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
   */
  _renderGrid(ctx) {
    const gridSize = this.options.gridSize;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1 / this.viewport.scale;
    
    for (let x = 0; x <= this.sceneData.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.sceneData.height);
      ctx.stroke();
    }
    
    for (let y = 0; y <= this.sceneData.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.sceneData.width, y);
      ctx.stroke();
    }
  }
  
  /**
   * 渲染对象
   * @private
   */
  _renderObject(ctx, obj) {
    if (obj.type === 'rect') {
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
    }
  }
  
  /**
   * 渲染地形场景（椭圆盆地 + 装饰物）
   * @private
   */
  _renderTerrainScene(ctx) {
    const data = this.sceneData;
    if (!data.terrain || !data.decorations) return;
    
    const centerX = data.centerX || data.width / 2;
    const centerY = (data.centerY || data.height / 2) - 32; // 视觉上移
    const radiusX = data.basinRadius || 640;
    const radiusY = radiusX * (data.basinAspectY || 0.65);
    
    // 1. 绘制森林深绿环带
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(1, data.basinAspectY || 0.65);
    const grad = ctx.createRadialGradient(0, 0, radiusX - 10, 0, 0, radiusX + 110);
    grad.addColorStop(0, 'rgba(35, 58, 25, 1)');
    grad.addColorStop(0.55, 'rgba(28, 46, 20, 0.92)');
    grad.addColorStop(1, 'rgba(20, 30, 15, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radiusX + 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // 2. 绘制椭圆草地
    ctx.fillStyle = '#3a5a2a';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX + 20, radiusY + 20, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制草地纹理（简化版）
    const tileSize = data.terrain?.tileSize || 64;
    ctx.fillStyle = '#4a6a3a';
    for (let y = 0; y < data.height; y += tileSize) {
      for (let x = 0; x < data.width; x += tileSize) {
        // 检查是否在椭圆内
        const dx = (x + tileSize/2 - centerX) / (radiusX + 20);
        const dy = (y + tileSize/2 - centerY) / (radiusY + 20);
        if (dx * dx + dy * dy < 1) {
          ctx.fillRect(x, y, tileSize - 1, tileSize - 1);
        }
      }
    }
    
    // 3. 绘制装饰物（按Y排序）
    const sortedDecos = [...data.decorations].sort((a, b) => a.y - b.y);
    
    for (const deco of sortedDecos) {
      this._renderDecoration(ctx, deco, data.decoSprites);
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
    const atlasId = 'terrain_atlas';
    const img = this.loadedImages.get(atlasId);
    
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
    const ctx = overlay.getContext('2d');
    
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (this.selectedObjects.length === 0) return;
    
    ctx.save();
    ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
    ctx.scale(this.viewport.scale, this.viewport.scale);
    
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2 / this.viewport.scale;
    ctx.setLineDash([4 / this.viewport.scale, 4 / this.viewport.scale]);
    
    for (const obj of this.selectedObjects) {
      if (obj.type === 'rect' || obj.type === 'image') {
        ctx.strokeRect(obj.x - 2, obj.y - 2, obj.width + 4, obj.height + 4);
      } else if (obj.type === 'circle') {
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    
    ctx.restore();
  }
  
  /**
   * 加载场景数据
   */
  loadScene(sceneData) {
    this.sceneData = { ...this.sceneData, ...sceneData };
    this.selectedObjects = [];
    
    // 更新UI
    const nameInput = document.getElementById('editor-scene-name');
    const bgInput = document.getElementById('editor-bg-color');
    const widthInput = document.getElementById('editor-scene-width');
    const heightInput = document.getElementById('editor-scene-height');
    
    if (nameInput) nameInput.value = this.sceneData.name;
    if (bgInput) bgInput.value = this.sceneData.backgroundColor;
    if (widthInput) widthInput.value = this.sceneData.width;
    if (heightInput) heightInput.value = this.sceneData.height;
    
    // 更新画布尺寸
    const canvas = document.getElementById('editor-canvas');
    const overlay = document.getElementById('editor-overlay');
    
    if (canvas && overlay) {
      canvas.width = this.sceneData.width;
      canvas.height = this.sceneData.height;
      overlay.width = this.sceneData.width;
      overlay.height = this.sceneData.height;
    }
    
    this._fitToContainer();
    this._updateLayerList();
    this._updateObjectCount();
    this.render();
  }
  
  /**
   * 保存场景
   */
  save() {
    if (this.onSceneChange) this.onSceneChange(this.sceneData);
    return this.sceneData;
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
