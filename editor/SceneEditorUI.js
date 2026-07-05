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
 * SceneEditorUI - 场景编辑器 UI 模块
 * 负责 UI 面板初始化、属性面板更新、基础工具操作
 */
export class SceneEditorUI {
  /**
   * @param {import('./SceneEditor.js').SceneEditor} editor - 主编辑器实例
   */
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * 初始化 UI（生成 HTML 结构）
   */
  initUI() {
    const editor = this.editor;
    editor.container.innerHTML = `
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
            <button id="editor-add-ellipse" title="添加椭圆">⬭</button>
          </div>
          <div class="toolbar-group">
            <label>场景名称:</label>
            <input type="text" id="editor-scene-name" value="${editor.sceneData.name}">
          </div>
          <div class="toolbar-group">
            <label>背景色:</label>
            <input type="color" id="editor-bg-color" value="${editor.sceneData.backgroundColor}">
          </div>
          <div class="toolbar-group">
            <label>网格:</label>
            <input type="checkbox" id="editor-show-grid" ${editor.options.showGrid ? 'checked' : ''}>
          </div>
          <div class="toolbar-group">
            <label>辅助方框:</label>
            <input type="checkbox" id="editor-show-background" ${editor.options.showBackground ? 'checked' : ''}>
          </div>
          <div class="toolbar-group">
            <button id="editor-save">保存场景</button>
            <button id="editor-export">导出JSON</button>
            <button id="editor-import">导入JSON</button>
          </div>
        </div>
        
        <div class="editor-main">
          <div class="editor-sidebar left" id="editor-sidebar-left">
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
          
          <div class="editor-resizer" id="editor-resizer-left"></div>
          
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
          
          <div class="editor-resizer" id="editor-resizer-right"></div>
          
          <div class="editor-sidebar right" id="editor-sidebar-right">
            <div class="sidebar-section">
              <h3>图层</h3>
              <div class="layer-list" id="editor-layer-list"></div>
              <div class="layer-actions">
                <button id="editor-add-layer" title="新增图层">+ 新增</button>
                <button id="editor-delete-layer" title="删除选中图层">🗑 删除</button>
                <button id="editor-layer-up" title="图层上移（提高遮挡优先级）">⬆</button>
                <button id="editor-layer-down" title="图层下移（降低遮挡优先级）">⬇</button>
              </div>
              <div class="layer-actions" style="margin-top:4px;">
                <button id="editor-move-obj-layer" title="将选中对象移动到当前激活图层">📦 移入当前层</button>
                <button id="editor-batch-depth" title="按名称筛选对象并批量设置深度">🔧 批量设深度</button>
                <button id="editor-dedup-objects" title="去掉同一位置的重复对象">🧹 去重</button>
                <button id="editor-batch-offset" title="批量偏移当前图层所有对象">↕ 批量偏移</button>
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
                  <input type="number" id="editor-scene-width" value="${editor.sceneData.width}" min="100">
                  <span>×</span>
                  <input type="number" id="editor-scene-height" value="${editor.sceneData.height}" min="100">
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
    editor.layers.updateLayerList();
    this._initAssetTabs();
    this._initResizers();
  }

  /**
   * 添加样式（引用外部 CSS）
   * @private
   */
  _addStyles() {
    if (document.getElementById('scene-editor-styles')) return;
    const link = document.createElement('link');
    link.id = 'scene-editor-styles';
    link.rel = 'stylesheet';
    link.href = './styles/scene-editor.css';
    document.head.appendChild(link);
  }

  /**
   * 初始化资源标签页
   * @private
   */
  _initAssetTabs() {
    const editor = this.editor;
    const tabs = editor.container.querySelectorAll('.asset-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        editor.container.querySelector('#asset-sprites').style.display = tabName === 'sprites' ? 'block' : 'none';
        editor.container.querySelector('#asset-atlases').style.display = tabName === 'atlases' ? 'block' : 'none';
      });
    });
  }

  /**
   * 初始化拖拽分隔条
   * @private
   */
  _initResizers() {
    const editor = this.editor;
    const leftSidebar = document.getElementById('editor-sidebar-left');
    const rightSidebar = document.getElementById('editor-sidebar-right');
    const resizerLeft = document.getElementById('editor-resizer-left');
    const resizerRight = document.getElementById('editor-resizer-right');

    if (!resizerLeft || !resizerRight) return;

    this._setupResizer(resizerLeft, leftSidebar, 'left');
    this._setupResizer(resizerRight, rightSidebar, 'right');
  }

  /**
   * 设置单个分隔条的拖拽逻辑
   * @private
   */
  _setupResizer(resizer, sidebar, side) {
    const editor = this.editor;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      let newWidth;
      if (side === 'left') {
        newWidth = startWidth + dx;
      } else {
        newWidth = startWidth - dx;
      }
      // 限制最小/最大宽度
      newWidth = Math.max(120, Math.min(500, newWidth));
      sidebar.style.width = newWidth + 'px';
      sidebar.style.minWidth = newWidth + 'px';

      // 触发画布重绘以适应新尺寸
      if (editor.initialized) {
        this.fitToContainer();
        editor.render();
      }
    };

    const onMouseUp = () => {
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    resizer.addEventListener('mousedown', onMouseDown);
  }

  /**
   * 初始化画布
   * @private
   */
  _initCanvas() {
    const editor = this.editor;
    const canvas = document.getElementById('editor-canvas');
    const overlay = document.getElementById('editor-overlay');
    const container = document.getElementById('editor-canvas-container');

    if (!canvas || !overlay || !container) {
      setTimeout(() => this._initCanvas(), 100);
      return;
    }

    if (container.clientWidth === 0 || container.clientHeight === 0) {
      setTimeout(() => this._initCanvas(), 100);
      return;
    }

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    overlay.width = container.clientWidth;
    overlay.height = container.clientHeight;

    this.fitToContainer();
    editor.render();
    editor.initialized = true;
  }

  /**
   * 适应容器
   */
  fitToContainer() {
    const editor = this.editor;
    const container = document.getElementById('editor-canvas-container');
    const canvas = document.getElementById('editor-canvas');
    const overlay = document.getElementById('editor-overlay');

    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight || 600;

    if (canvas) { canvas.width = containerWidth; canvas.height = containerHeight; }
    if (overlay) { overlay.width = containerWidth; overlay.height = containerHeight; }

    const scaleX = containerWidth / editor.sceneData.width;
    const scaleY = containerHeight / editor.sceneData.height;
    editor.viewport.scale = Math.min(scaleX, scaleY, 2) * 0.9;

    const centerX = editor.sceneData.centerX || editor.sceneData.width / 2;
    const centerY = editor.sceneData.centerY || editor.sceneData.height / 2;

    editor.viewport.offsetX = containerWidth / 2 - centerX * editor.viewport.scale;
    editor.viewport.offsetY = containerHeight / 2 - centerY * editor.viewport.scale;

    this._updateZoomDisplay();
  }

  /**
   * 设置交互模式
   */
  setMode(mode) {
    const editor = this.editor;
    editor.interaction.mode = mode;
    document.querySelectorAll('.toolbar-group button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`editor-${mode}`).classList.add('active');
    document.getElementById('editor-canvas-container').style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  }

  /**
   * 缩放视图
   */
  zoom(factor, pivotX, pivotY) {
    const editor = this.editor;
    const oldScale = editor.viewport.scale;
    editor.viewport.scale = Math.max(0.1, Math.min(5, editor.viewport.scale * factor));

    if (pivotX !== undefined && pivotY !== undefined) {
      const ratio = editor.viewport.scale / oldScale;
      editor.viewport.offsetX = pivotX - (pivotX - editor.viewport.offsetX) * ratio;
      editor.viewport.offsetY = pivotY - (pivotY - editor.viewport.offsetY) * ratio;
    }

    this._updateZoomDisplay();
    editor.render();
  }

  /**
   * 更新缩放显示
   * @private
   */
  _updateZoomDisplay() {
    const el = document.getElementById('editor-zoom-level');
    if (el) el.textContent = Math.round(this.editor.viewport.scale * 100) + '%';
  }

  /**
   * 添加对象到当前图层
   */
  addObject(objData) {
    const editor = this.editor;
    const layer = editor.sceneData.layers[editor.activeLayerIndex];
    if (!layer || layer.locked) return null;

    const obj = { id: 'obj_' + Date.now(), ...objData };
    layer.objects.push(obj);
    this.updateObjectCount();
    editor.history.saveHistory();
    editor.render();
    return obj;
  }

  /**
   * 删除选中对象
   */
  deleteSelectedObjects() {
    const editor = this.editor;
    for (const obj of editor.selectedObjects) {
      if (obj.type === 'decoration' && obj._decoRef) {
        const index = editor.sceneData.decorations.indexOf(obj._decoRef);
        if (index !== -1) editor.sceneData.decorations.splice(index, 1);
      } else {
        for (const layer of editor.sceneData.layers) {
          const index = layer.objects.indexOf(obj);
          if (index !== -1) { layer.objects.splice(index, 1); break; }
        }
      }
    }

    editor.selectedObjects = [];
    this.updateObjectProperties();
    this.updateObjectCount();
    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 更新对象数量显示
   */
  updateObjectCount() {
    const editor = this.editor;
    let count = 0;
    for (const layer of editor.sceneData.layers) {
      count += layer.objects.length;
    }
    const el = document.getElementById('editor-object-count');
    if (el) el.textContent = count;
  }

  /**
   * 更新选中对象属性面板
   */
  updateObjectProperties() {
    const editor = this.editor;
    const panel = document.getElementById('editor-object-properties');
    if (!panel) return;

    if (editor.selectedObjects.length === 0) {
      panel.innerHTML = '<div class="no-selection">未选中任何对象</div>';
      return;
    }

    if (editor.selectedObjects.length > 1) {
      panel.innerHTML = `<div>已选中 ${editor.selectedObjects.length} 个对象</div>`;
      return;
    }

    const obj = editor.selectedObjects[0];
    let html = '';

    if (obj.type === 'decoration') {
      html = `<div class="property-row"><label>类型:</label><input value="装饰物" disabled></div>`;
      html += `<div class="property-row"><label>名称:</label><input value="${obj.key || '未知'}" disabled></div>`;
      html += `<div class="property-row"><label>X:</label><input type="number" value="${Math.round(obj.x)}" data-prop="x"></div>`;
      html += `<div class="property-row"><label>Y:</label><input type="number" value="${Math.round(obj.y)}" data-prop="y"></div>`;
      html += `<div class="property-row"><label>缩放:</label><input type="number" value="${obj.scale || 1}" step="0.1" data-prop="scale"></div>`;
    } else {
      let objLayerName = '未知';
      for (const layer of editor.sceneData.layers) {
        if (layer.objects.includes(obj)) { objLayerName = layer.name; break; }
      }
      html = `<div class="property-row"><label>ID:</label><input value="${obj.id || '未知'}" disabled></div>`;
      html += `<div class="property-row"><label>所在图层:</label><input value="${objLayerName}" disabled style="color:#FFD700;"></div>`;

      let depth = -1;
      for (const layer of editor.sceneData.layers) {
        const idx = layer.objects.indexOf(obj);
        if (idx !== -1) { depth = idx; break; }
      }
      html += `<div class="property-row"><label>深度:</label><input value="${depth}" disabled style="color:#88ccff;"></div>`;
      html += `<div class="property-row"><label>X:</label><input type="number" value="${Math.round(obj.x)}" data-prop="x"></div>`;
      html += `<div class="property-row"><label>Y:</label><input type="number" value="${Math.round(obj.y)}" data-prop="y"></div>`;

      if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill' || obj.type === 'deco' || obj.type === 'ellipse') {
        html += `<div class="property-row"><label>宽度:</label><input type="number" value="${Math.round(obj.width)}" data-prop="width"></div>`;
        html += `<div class="property-row"><label>高度:</label><input type="number" value="${Math.round(obj.height)}" data-prop="height"></div>`;
      } else if (obj.type === 'circle') {
        html += `<div class="property-row"><label>半径:</label><input type="number" value="${Math.round(obj.radius)}" data-prop="radius"></div>`;
      }

      if (obj.type === 'image' && obj.rotation !== undefined) {
        html += `<div class="property-row"><label>旋转:</label><input type="number" value="${Math.round(obj.rotation)}" data-prop="rotation"></div>`;
      }

      if (obj.type === 'fill') {
        html += this._buildFillProperties(obj);
      } else if (obj.type === 'ellipse') {
        html += this._buildEllipseProperties(obj);
      } else if (obj.fill) {
        html += `<div class="property-row"><label>颜色:</label><input type="color" value="${obj.fill}" data-prop="fill"></div>`;
      }
    }

    html += `<div class="property-row"><button id="editor-delete-obj">删除对象</button></div>`;
    panel.innerHTML = html;

    // 绑定属性修改事件
    panel.querySelectorAll('input[data-prop], select[data-prop]').forEach(input => {
      input.addEventListener('change', (e) => {
        const prop = e.target.dataset.prop;
        let value;
        if (e.target.type === 'number') value = parseFloat(e.target.value);
        else value = e.target.value;

        if (prop === 'gradientColor0' || prop === 'gradientColor1') {
          if (!obj.gradientStops) {
            obj.gradientStops = [{ offset: 0, color: '#000000' }, { offset: 1, color: '#333333' }];
          }
          obj.gradientStops[prop === 'gradientColor0' ? 0 : 1].color = value;
        } else if (prop === 'fillMode') {
          obj.fillMode = value;
          this.updateObjectProperties();
        } else {
          obj[prop] = value;
        }

        if (obj.type === 'decoration' && obj._decoRef) {
          obj._decoRef[prop] = value;
        }

        editor.render();
      });
    });

    // 加载图片按钮
    const loadImgBtn = document.getElementById('editor-load-fill-image');
    if (loadImgBtn) {
      loadImgBtn.addEventListener('click', () => {
        const src = obj.imageSrc;
        if (!src) return;
        const img = new Image();
        img.onload = () => { editor.loadedImages.set(src, img); editor.render(); };
        img.onerror = () => this.showToast('图片加载失败: ' + src, 'error');
        img.src = src;
      });
    }

    // 椭圆：用选中切片填充
    const applySliceBtn = document.getElementById('editor-ellipse-apply-slice');
    if (applySliceBtn) {
      applySliceBtn.addEventListener('click', () => {
        if (!editor.selectedSlice) {
          this.showToast('请先在左侧资源库选中一个切片', 'error');
          return;
        }
        obj.atlasId = editor.selectedSlice.atlasId;
        obj.sliceKey = editor.selectedSlice.sliceKey;
        obj.decoKey = null;
        editor.render();
        this.updateObjectProperties();
        this.showToast('已应用切片: ' + obj.sliceKey);
      });
    }

    document.getElementById('editor-delete-obj').addEventListener('click', () => this.deleteSelectedObjects());
  }

  /**
   * 构建椭圆对象的属性 HTML
   * @private
   */
  _buildEllipseProperties(obj) {
    const mode = obj.fillMode || 'color';
    let html = '';
    html += `<div class="property-row"><label>名称:</label><input type="text" value="${obj.name || ''}" data-prop="name" placeholder="椭圆名称"></div>`;
    html += `<div class="property-row"><label>填充模式:</label><select data-prop="fillMode">
      <option value="color" ${mode === 'color' ? 'selected' : ''}>纯色</option>
      <option value="image" ${mode === 'image' ? 'selected' : ''}>图片</option>
      <option value="slice" ${mode === 'slice' ? 'selected' : ''}>切片</option>
    </select></div>`;

    if (mode === 'color') {
      html += `<div class="property-row"><label>填充色:</label><input type="color" value="${obj.fill || '#3a5a2a'}" data-prop="fill"></div>`;
    } else if (mode === 'image') {
      html += `<div class="property-row"><label>图片路径:</label><input type="text" value="${obj.imageSrc || ''}" data-prop="imageSrc" placeholder="输入图片URL"></div>`;
      html += `<div class="property-row"><label>显示模式:</label><select data-prop="imageMode">
        <option value="cover" ${obj.imageMode === 'cover' || !obj.imageMode ? 'selected' : ''}>覆盖</option>
        <option value="stretch" ${obj.imageMode === 'stretch' ? 'selected' : ''}>拉伸</option>
        <option value="contain" ${obj.imageMode === 'contain' ? 'selected' : ''}>包含</option>
        <option value="tile" ${obj.imageMode === 'tile' ? 'selected' : ''}>平铺</option>
      </select></div>`;
      html += `<div class="property-row"><button id="editor-load-fill-image">加载图片</button></div>`;
    } else if (mode === 'slice') {
      const label = obj.decoKey ? obj.decoKey : (obj.sliceKey ? `${obj.atlasId || ''} / ${obj.sliceKey}` : '未设置');
      html += `<div class="property-row"><label>当前切片:</label><input value="${label}" disabled style="color:#FFD700;"></div>`;
      html += `<div class="property-row"><label>平铺模式:</label><select data-prop="sliceMode">
        <option value="tile" ${obj.sliceMode === 'tile' || !obj.sliceMode ? 'selected' : ''}>平铺</option>
        <option value="stretch" ${obj.sliceMode === 'stretch' ? 'selected' : ''}>拉伸</option>
      </select></div>`;
      html += `<div class="property-row"><button id="editor-ellipse-apply-slice" title="先在左侧资源库选中一个切片，再点此填充">用选中切片填充</button></div>`;
    }

    html += `<div class="property-row"><label>透明度:</label><input type="number" value="${obj.opacity !== undefined ? obj.opacity : 1}" step="0.1" min="0" max="1" data-prop="opacity"></div>`;
    // 边缘淡化特效
    html += `<div class="property-row"><label>边缘淡化:</label><input type="number" value="${obj.edgeFade || 0}" step="0.05" min="0" max="1" data-prop="edgeFade" title="0=无，1=从中心开始淡化"></div>`;
    html += `<div class="property-row"><label>边框色:</label><input type="color" value="${obj.stroke || '#5a8a4a'}" data-prop="stroke"></div>`;
    html += `<div class="property-row"><label>边框宽:</label><input type="number" value="${obj.strokeWidth || 0}" min="0" step="1" data-prop="strokeWidth"></div>`;
    html += `<div class="property-row"><label>半径X:</label><input value="${Math.round(obj.width / 2)}" disabled title="宽度/2"></div>`;
    html += `<div class="property-row"><label>半径Y:</label><input value="${Math.round(obj.height / 2)}" disabled title="高度/2"></div>`;
    return html;
  }

  /**
   * 构建背景填充对象的属性 HTML
   * @private
   */
  _buildFillProperties(obj) {
    let html = '';
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

    return html;
  }

  /**
   * 显示提示消息
   */
  showToast(message, type = 'success') {
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
    this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
  }
}
