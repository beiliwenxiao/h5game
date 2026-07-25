/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
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
            <button id="editor-save" class="primary" title="保存场景到工程（localStorage + assets/scenes JSON 文件）">💾 保存到工程</button>
            <button id="editor-clear-cache" title="清理本地 localStorage 缓存（下次从工程 JSON 文件重新加载）">🧹 清理缓存</button>
            <button id="editor-select-all" title="全选当前图层所有对象">☐ 全选</button>
            <button id="editor-copy" title="复制选中对象">📋 复制</button>
            <button id="editor-paste" title="粘贴已复制的对象">📌 粘贴</button>
          </div>
          <div class="toolbar-group">
            <button id="editor-undo" title="撤销 (Ctrl+Z)">↶</button>
            <button id="editor-redo" title="重做 (Ctrl+Y)">↷</button>
          </div>
          <div class="toolbar-group">
            <button id="editor-select" class="active" title="选择工具 (V)">↖</button>
            <button id="editor-pan" title="平移工具 (H)">🖐️</button>
            <button id="editor-place" title="放置工具 (P)">+</button>
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
                  <button class="asset-tab active" data-tab="shapes">图形</button>
                  <button class="asset-tab" data-tab="atlases">图集</button>
                  <button class="asset-tab" data-tab="logic">逻辑</button>
                  <button class="asset-tab" data-tab="content">内容</button>
                </div>
                <div class="asset-actions" id="editor-image-actions" style="display:none;">
                  <button id="editor-add-image">添加图片</button>
                  <button id="editor-save-scene-btn">💾 保存</button>
                </div>
                <div id="asset-shapes" class="asset-panel">
                  <div class="asset-list" id="editor-asset-list"></div>
                </div>
                <div id="asset-atlases" class="asset-panel" style="display:none;">
                  <div class="asset-actions" style="margin-bottom:6px;">
                    <button id="editor-atlas-add" title="新增一个图集">+ 新增图集</button>
                    <button id="editor-atlas-delete" title="删除选中的图集">🗑 删除</button>
                    <button id="editor-atlas-save" title="保存所有图集到 config/atlases.json">💾 保存图集</button>
                  </div>
                  <div class="atlas-list" id="editor-atlas-list"></div>
                </div>
                <div id="asset-logic" class="asset-panel" style="display:none;">
                  <div class="asset-list" id="editor-logic-list"></div>
                </div>
                <div id="asset-content" class="asset-panel" style="display:none;">
                  <div class="content-filter" style="margin-bottom:6px;">
                    <select id="editor-content-filter" style="width:100%;padding:4px;background:#0a1020;color:#fff;border:1px solid #2a3a5e;border-radius:3px;font-size:11px;"></select>
                  </div>
                  <div class="asset-actions" style="margin-bottom:6px;">
                    <button id="editor-content-add" title="在内容库(定义)中新增一条">+ 新增定义</button>
                    <button id="editor-content-save" title="保存内容库定义到工程">💾 保存库</button>
                  </div>
                  <div class="asset-list" id="editor-content-list"></div>
                </div>
              </div>
            </div>
            <div class="sidebar-section">
              <h3 id="slice-panel-title">选中切片</h3>
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
              <button id="editor-toggle-neighbors" title="显示/隐藏相邻场景参考">🗺️</button>
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
                  <label title="场景唯一标识。触发器里的 sceneId 要填这个值，不是场景名称">场景ID:</label>
                  <input type="text" id="editor-scene-id" value="${editor.sceneData.id || ''}" placeholder="如 scene_Prologue" style="flex:1;">
                </div>
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
    const panels = {
      shapes: '#asset-shapes',
      atlases: '#asset-atlases',
      logic: '#asset-logic',
      content: '#asset-content'
    };
    // Tab 默认描述
    const tabDescriptions = {
      shapes: '用于基础的几何图形、背景图填充、碰撞多边形等。',
      atlases: '图片，以及图片的切片。用于构造装饰层，以及大部分地图上的视觉效果。',
      logic: '用于事件触发，以及刷怪、传送、Buff区域等等。',
      content: '物品、道具、玩家、NPC、商店、建筑、载具等等。'
    };
    const showTabDefault = (tabName) => {
      const title = document.getElementById('slice-panel-title');
      const propsPanel = document.getElementById('slice-properties');
      if (title) title.textContent = '说明';
      if (propsPanel) propsPanel.innerHTML = `<div class="no-selection" style="white-space:normal;">${tabDescriptions[tabName] || ''}</div>`;
      editor.selectedSlice = null;
      editor.selectedAtlasId = null;
    };
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        for (const [name, sel] of Object.entries(panels)) {
          const el = editor.container.querySelector(sel);
          if (el) el.style.display = (name === tabName) ? 'block' : 'none';
        }
        // 「添加图片」按钮仅在图形 Tab 显示
        const imgActions = editor.container.querySelector('#editor-image-actions');
        if (imgActions) imgActions.style.display = (tabName === 'shapes') ? 'flex' : 'none';
        // 切换 Tab 时重置下方面板为默认描述
        showTabDefault(tabName);
        // 内容 Tab 首次打开时加载内容库定义
        if (tabName === 'logic') editor.assets.updateLogicList?.();
        if (tabName === 'content') editor.assets.updateContentLibrary?.();
      });
    });
    // 初始显示默认描述（图形 Tab）
    showTabDefault('shapes');
    // 图形 Tab 默认激活，显示添加图片按钮
    const imgActionsInit = editor.container.querySelector('#editor-image-actions');
    if (imgActionsInit) imgActionsInit.style.display = 'flex';
    // 内容 Tab 的按钮
    const addBtn = editor.container.querySelector('#editor-content-add');
    if (addBtn) addBtn.addEventListener('click', () => editor.assets.addContentDefinition?.());
    const saveBtn = editor.container.querySelector('#editor-content-save');
    if (saveBtn) saveBtn.addEventListener('click', () => editor.assets.saveContentLibrary?.());
    const filter = editor.container.querySelector('#editor-content-filter');
    if (filter) filter.addEventListener('change', () => editor.assets.updateContentList?.());
    // 图集 Tab 的按钮
    const atlasAddBtn = editor.container.querySelector('#editor-atlas-add');
    if (atlasAddBtn) atlasAddBtn.addEventListener('click', () => editor.assets.addAtlas?.());
    const atlasDelBtn = editor.container.querySelector('#editor-atlas-delete');
    if (atlasDelBtn) atlasDelBtn.addEventListener('click', () => editor.assets.deleteAtlas?.());
    const atlasSaveBtn = editor.container.querySelector('#editor-atlas-save');
    if (atlasSaveBtn) atlasSaveBtn.addEventListener('click', () => editor.assets.saveAtlases?.());
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

    // 视口对准场景方框正中心（width/2, height/2）
    const sceneCenterX = editor.sceneData.width / 2;
    const sceneCenterY = editor.sceneData.height / 2;

    editor.viewport.offsetX = containerWidth / 2 - sceneCenterX * editor.viewport.scale;
    editor.viewport.offsetY = containerHeight / 2 - sceneCenterY * editor.viewport.scale;

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
      html = `<div class="property-row"><label>ID:</label><input value="${obj.id || ''}" data-prop="id" style="font-size:11px;"></div>`;
      html += `<div class="property-row"><label>所在图层:</label><input value="${objLayerName}" disabled style="color:#FFD700;"></div>`;

      let depth = -1;
      for (const layer of editor.sceneData.layers) {
        const idx = layer.objects.indexOf(obj);
        if (idx !== -1) { depth = idx; break; }
      }
      html += `<div class="property-row"><label>深度:</label><input value="${depth}" disabled style="color:#88ccff;"></div>`;

      // 顶点型 shape（多边形/路径）无 X/Y/宽高，用顶点拖拽编辑
      const isVertexShape = obj.type === 'shape' && (obj.shapeType === 'polygon' || obj.shapeType === 'path');
      if (isVertexShape) {
        html += `<div class="property-row"><label>形状:</label><input value="${obj.shapeType}" disabled></div>`;
        html += `<div class="property-row"><label>顶点数:</label><input type="number" value="${(obj.points || []).length}" min="3" max="100" data-prop="_vertexCount" title="3~100，修改后按正多边形重新生成顶点"></div>`;
      } else {
        html += `<div class="property-row"><label>X:</label><input type="number" value="${Math.round(obj.x)}" data-prop="x"></div>`;
        html += `<div class="property-row"><label>Y:</label><input type="number" value="${Math.round(obj.y)}" data-prop="y"></div>`;
        if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill' || obj.type === 'deco' || obj.type === 'ellipse' || obj.type === 'shape' || obj.type === 'region') {
          html += `<div class="property-row"><label>宽度:</label><input type="number" value="${Math.round(obj.width)}" data-prop="width"></div>`;
          html += `<div class="property-row"><label>高度:</label><input type="number" value="${Math.round(obj.height)}" data-prop="height"></div>`;
        } else if (obj.type === 'circle') {
          html += `<div class="property-row"><label>半径:</label><input type="number" value="${Math.round(obj.radius)}" data-prop="radius"></div>`;
        }
      }

      if (obj.type === 'image' && obj.rotation !== undefined) {
        html += `<div class="property-row"><label>旋转:</label><input type="number" value="${Math.round(obj.rotation)}" data-prop="rotation"></div>`;
      }

      if (obj.type === 'image') {
        html += this._buildImageProperties(obj);
      } else if (obj.type === 'fill') {
        html += this._buildFillProperties(obj);
      } else if (obj.type === 'ellipse') {
        html += this._buildEllipseProperties(obj);
      } else if (obj.type === 'shape') {
        html += this._buildShapeProperties(obj);
      } else if (obj.type === 'region' || obj.type === 'spawn' || obj.type === 'portal' || obj.type === 'npc' || obj.type === 'trigger') {
        html += this._buildLogicProperties(obj);
      } else if (obj.type === 'buffZone') {
        html += this._buildBuffZoneProperties(obj);
      } else if (obj.type === 'ref') {
        html += this._buildRefProperties(obj);
      } else if (obj.fill) {
        html += `<div class="property-row"><label>颜色:</label><input type="color" value="${obj.fill}" data-prop="fill"></div>`;
      }
    }

    html += `<div class="property-row"><button id="editor-delete-obj">删除对象</button></div>`;
    panel.innerHTML = html;

    // 绑定属性修改事件
    panel.querySelectorAll('input[data-prop], select[data-prop], textarea[data-prop]').forEach(input => {
      input.addEventListener('change', (e) => {
        const prop = e.target.dataset.prop;
        let value;
        if (e.target.type === 'checkbox') value = e.target.checked;
        else if (e.target.type === 'number') value = parseFloat(e.target.value);
        else value = e.target.value;

        if (prop === 'gradientColor0' || prop === 'gradientColor1') {
          if (!obj.gradientStops) {
            obj.gradientStops = [{ offset: 0, color: '#000000' }, { offset: 1, color: '#333333' }];
          }
          obj.gradientStops[prop === 'gradientColor0' ? 0 : 1].color = value;
        } else if (prop === 'fillMode') {
          obj.fillMode = value;
          this.updateObjectProperties();
        } else if (prop === '_vertexCount') {
          // 修改顶点数：加点=在随机边中点插入；减点=随机删除一个顶点（保持形状不变形）
          const n = Math.max(3, Math.min(100, Math.round(value)));
          if (!Array.isArray(obj.points) || obj.points.length < 3) return;
          const cur = obj.points.length;
          if (n === cur) { /* 不变 */ }
          else if (n > cur) {
            // 加点：每次在随机边的中点处插入新顶点
            while (obj.points.length < n) {
              const idx = Math.floor(Math.random() * obj.points.length);
              const next = (idx + 1) % obj.points.length;
              const mx = Math.round((obj.points[idx][0] + obj.points[next][0]) / 2);
              const my = Math.round((obj.points[idx][1] + obj.points[next][1]) / 2);
              obj.points.splice(next, 0, [mx, my]);
            }
          } else {
            // 减点：随机删除顶点直到目标数（最少保留3个）
            while (obj.points.length > n && obj.points.length > 3) {
              const idx = Math.floor(Math.random() * obj.points.length);
              obj.points.splice(idx, 1);
            }
          }
          // buffZone：同步包围盒
          if (obj.type === 'buffZone') {
            let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
            for (const p of obj.points) { if (p[0] < bMinX) bMinX = p[0]; if (p[0] > bMaxX) bMaxX = p[0]; if (p[1] < bMinY) bMinY = p[1]; if (p[1] > bMaxY) bMaxY = p[1]; }
            obj.x = bMinX; obj.y = bMinY; obj.width = bMaxX - bMinX; obj.height = bMaxY - bMinY;
          }
          this.updateObjectProperties();
        } else if (prop === 'id') {
          // ID 修改查重：遍历所有图层对象确保唯一
          const newId = (value || '').trim();
          if (!newId) {
            this.showToast('ID 不能为空', true);
            e.target.value = obj.id || '';
            return;
          }
          if (newId !== obj.id) {
            const layers = editor.sceneData.layers || [];
            let duplicate = false;
            for (const layer of layers) {
              for (const o of (layer.objects || [])) {
                if (o !== obj && o.id === newId) { duplicate = true; break; }
              }
              if (duplicate) break;
            }
            if (duplicate) {
              this.showToast(`ID "${newId}" 已存在，不允许重复`, true);
              e.target.value = obj.id || '';
              return;
            }
            obj.id = newId;
          }
        } else if (prop.startsWith('effect.')) {
          // Buff 多边形嵌套属性：effect.stat, effect.value, effect.interval, etc.
          if (!obj.effect) obj.effect = {};
          const subKey = prop.slice(7); // 去掉 'effect.'
          // 数值类型转换
          if (['value', 'interval', 'delay', 'leaveDuration'].includes(subKey)) {
            obj.effect[subKey] = parseFloat(value) || 0;
          } else {
            obj.effect[subKey] = value;
          }
        } else {
          obj[prop] = value;
        }

        if (obj.type === 'decoration' && obj._decoRef) {
          obj._decoRef[prop] = value;
        }

        editor.render();
      });
    });

    // 图片对象：路径编辑 + 文件大小查询
    const imageSrcInput = document.getElementById('editor-image-src');
    if (imageSrcInput && editor.selectedObjects.length === 1 && editor.selectedObjects[0].type === 'image') {
      const imgObj = editor.selectedObjects[0];
      // 初次显示时异步查询文件大小
      this._fetchImageFileSize(imageSrcInput.value);
      imageSrcInput.addEventListener('change', () => {
        const newSrc = imageSrcInput.value.trim();
        if (!editor.sceneData.imageAssets) editor.sceneData.imageAssets = {};
        if (!editor.sceneData.imageAssets[imgObj.imageId]) {
          editor.sceneData.imageAssets[imgObj.imageId] = { src: newSrc };
        } else {
          editor.sceneData.imageAssets[imgObj.imageId].src = newSrc;
        }
        // 重新加载图片刷新画布与尺寸显示
        const newImg = new Image();
        newImg.onload = () => {
          editor.loadedImages.set(imgObj.imageId, newImg);
          const dimEl = document.getElementById('editor-image-dim');
          if (dimEl) dimEl.value = `${newImg.naturalWidth}×${newImg.naturalHeight}`;
          editor.render();
        };
        newImg.onerror = () => this.showToast('图片加载失败: ' + newSrc, 'error');
        newImg.src = newSrc;
        this._fetchImageFileSize(newSrc);
      });

      // 编辑按钮：弹窗编辑图片属性
      const imgEditBtn = document.getElementById('editor-image-edit-btn');
      if (imgEditBtn) {
        imgEditBtn.addEventListener('click', () => this._openImageEditorModal(imgObj));
      }

      // 删除按钮：删除图片对象及其资源引用
      const imgDelBtn = document.getElementById('editor-image-delete-btn');
      if (imgDelBtn) {
        imgDelBtn.addEventListener('click', () => {
          if (!confirm('确定删除该图片对象吗？')) return;
          this.deleteSelectedObjects();
        });
      }
    }

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

    // 🎯 拾取目标按钮（触发器关联）
    const pickBtn = document.getElementById('editor-pick-target');
    if (pickBtn && editor.selectedObjects.length === 1 && editor.selectedObjects[0].type === 'trigger') {
      pickBtn.addEventListener('click', () => {
        editor.interactionModule.startPickTarget(editor.selectedObjects[0]);
      });
    }
  }

  /**
   * 构建内容库放置引用（type:'ref'）的属性 HTML。
   * 明细在内容库定义里；这里只编辑放置相关：组名 group（供 spawnGroup 触发器整批激活）。
  /**
   * Buff 多边形属性面板
   * @private
   */
  _buildBuffZoneProperties(obj) {
    const eff = obj.effect || {};
    let html = '<div class="property-row" style="border-top:1px solid #333;margin-top:6px;padding-top:6px;"><label style="color:#c080ff;font-weight:bold;">Buff 多边形</label></div>';
    html += `<div class="property-row"><label>名称:</label><input type="text" value="${obj.name || ''}" data-prop="name"></div>`;
    html += `<div class="property-row"><label>顶点数:</label><input type="number" value="${(obj.points || []).length}" min="3" max="100" data-prop="_vertexCount" title="修改后重新生成正多边形"></div>`;
    html += `<div class="property-row"><label>填充色:</label><input type="text" value="${obj.fillColor || 'rgba(100,0,200,0.2)'}" data-prop="fillColor" style="font-size:10px;"></div>`;
    html += `<div class="property-row"><label>边框色:</label><input type="text" value="${obj.borderColor || 'rgba(100,0,200,0.5)'}" data-prop="borderColor" style="font-size:10px;"></div>`;
    html += `<div class="property-row"><label>游戏中可见:</label><input type="checkbox" ${obj.visible !== false ? 'checked' : ''} data-prop="visible"></div>`;
    html += '<div class="property-row" style="border-top:1px solid #444;margin-top:4px;padding-top:4px;"><label style="color:#a060d0;">效果设置</label></div>';
    html += `<div class="property-row"><label>效果类型:</label><select data-prop="effect.effectType">
      <option value="instant" ${eff.effectType === 'instant' ? 'selected' : ''}>即时</option>
      <option value="periodic" ${eff.effectType === 'periodic' ? 'selected' : ''}>周期</option>
      <option value="delayed" ${eff.effectType === 'delayed' ? 'selected' : ''}>延迟</option>
    </select></div>`;
    html += `<div class="property-row"><label>目标属性:</label><select data-prop="effect.stat">
      <option value="hp" ${eff.stat === 'hp' ? 'selected' : ''}>生命 hp</option>
      <option value="mp" ${eff.stat === 'mp' ? 'selected' : ''}>法力 mp</option>
      <option value="attack" ${eff.stat === 'attack' ? 'selected' : ''}>攻击</option>
      <option value="defense" ${eff.stat === 'defense' ? 'selected' : ''}>防御</option>
      <option value="speed" ${eff.stat === 'speed' ? 'selected' : ''}>速度</option>
    </select></div>`;
    html += `<div class="property-row"><label>数值:</label><input type="number" value="${eff.value || 0}" data-prop="effect.value"></div>`;
    html += `<div class="property-row"><label>周期(秒):</label><input type="number" value="${eff.interval || 2}" step="0.5" min="0.1" data-prop="effect.interval"></div>`;
    html += `<div class="property-row"><label>延迟(秒):</label><input type="number" value="${eff.delay || 10}" step="1" min="1" data-prop="effect.delay"></div>`;
    html += `<div class="property-row"><label>离开行为:</label><select data-prop="effect.onLeave">
      <option value="remove" ${eff.onLeave === 'remove' ? 'selected' : ''}>立即消失</option>
      <option value="countdown" ${eff.onLeave === 'countdown' ? 'selected' : ''}>倒计时消失</option>
      <option value="continue" ${eff.onLeave === 'continue' ? 'selected' : ''}>永久保留</option>
    </select></div>`;
    html += `<div class="property-row"><label>离开倒计时:</label><input type="number" value="${eff.leaveDuration || 5}" step="1" min="0" data-prop="effect.leaveDuration"> 秒</div>`;
    html += `<div class="property-row"><label>作用目标:</label><select data-prop="effect.target">
      <option value="player" ${eff.target === 'player' ? 'selected' : ''}>玩家</option>
      <option value="enemy" ${eff.target === 'enemy' ? 'selected' : ''}>敌人</option>
      <option value="all" ${eff.target === 'all' ? 'selected' : ''}>所有</option>
    </select></div>`;
    return html;
  }

  /**
   * 放置引用对象属性面板
   * @private
   */
  _buildRefProperties(obj) {
    let html = '<div class="property-row" style="border-top:1px solid #333;margin-top:6px;padding-top:6px;"></div>';
    html += `<div class="property-row"><label>类型:</label><input value="${obj.kind || ''}" disabled></div>`;
    html += `<div class="property-row"><label>引用定义ID:</label><input value="${obj.ref || ''}" disabled title="明细在内容库中编辑"></div>`;
    html += `<div class="property-row"><label>名称:</label><input value="${obj.name || ''}" disabled></div>`;
    html += `<div class="property-row"><label title="供触发器 spawnGroup 整批激活；同组的放置点一起生成">组名 group:</label><input type="text" value="${obj.group || ''}" data-prop="group" placeholder="如 act1_pickups"></div>`;
    return html;
  }

  /**
   * 内容库定义编辑器（浮层）：编辑某条 library 定义的 name + 专属属性 JSON。
   * 应用后写回 assets._contentLib，用户再点「💾 保存库」持久化到 game.project.json。
   */
  showContentDefinitionEditor(catKey, def) {
    let modal = document.getElementById('content-def-editor');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'content-def-editor';
      modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'width:420px;max-height:70vh;overflow:auto;background:#0d1326;border:1px solid #2a3a5e;' +
        'border-radius:8px;padding:16px;z-index:100001;box-shadow:0 8px 32px rgba(0,0,0,0.6);color:#fff;';
      document.body.appendChild(modal);
    }
    const rest = {};
    for (const k of Object.keys(def)) { if (k !== 'id' && k !== 'name') rest[k] = def[k]; }
    modal.innerHTML = `
      <div style="font-weight:bold;margin-bottom:10px;color:#7cf;">编辑定义（${catKey}） · ${def.id}</div>
      <div style="margin-bottom:8px;"><label style="font-size:12px;color:#9ab;">名称</label>
        <input id="cde-name" type="text" value="${(def.name||'').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:#0a1020;color:#fff;border:1px solid #2a3a5e;border-radius:3px;padding:6px;"></div>
      <div style="margin-bottom:8px;"><label style="font-size:12px;color:#9ab;">专属属性(JSON)</label>
        <textarea id="cde-props" style="width:100%;box-sizing:border-box;min-height:180px;background:#0a1020;color:#fff;border:1px solid #2a3a5e;border-radius:3px;padding:6px;font-family:monospace;font-size:12px;">${JSON.stringify(rest, null, 2)}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="cde-cancel" style="padding:6px 14px;background:#3a4a7e;border:none;border-radius:4px;color:#fff;cursor:pointer;">取消</button>
        <button id="cde-apply" style="padding:6px 14px;background:#4CAF50;border:none;border-radius:4px;color:#000;font-weight:bold;cursor:pointer;">应用</button>
      </div>
      <div style="margin-top:6px;color:#89a;font-size:11px;">应用后点资源库「💾 保存库」持久化到工程</div>
    `;
    modal.style.display = 'block';
    modal.querySelector('#cde-cancel').onclick = () => { modal.style.display = 'none'; };
    modal.querySelector('#cde-apply').onclick = () => {
      def.name = modal.querySelector('#cde-name').value.trim() || def.name;
      let parsed = {};
      try { parsed = JSON.parse(modal.querySelector('#cde-props').value || '{}'); }
      catch (e) { this.showToast('JSON 格式错误: ' + e.message, 'error'); return; }
      for (const k of Object.keys(def)) { if (k !== 'id' && k !== 'name') delete def[k]; }
      Object.assign(def, parsed);
      modal.style.display = 'none';
      this.editor.assets.updateContentList?.();
      this.showToast('已应用（记得点"保存库"）', 'success');
    };
  }

  /**
   * 获取场景下拉选项 HTML（从 localStorage 场景列表读取）
   * @private
   */
  _getSceneOptions(currentValue) {
    let options = `<option value="" ${!currentValue ? 'selected' : ''}>(当前场景)</option>`;
    try {
      const raw = localStorage.getItem('yijian18-engine_editor_data_scenes_sanguo_zhangjiao');
      if (raw) {
        const scenes = JSON.parse(raw);
        if (Array.isArray(scenes)) {
          for (const s of scenes) {
            if (!s || !s.id) continue;
            const sel = s.id === currentValue ? 'selected' : '';
            options += `<option value="${s.id}" ${sel}>${s.name || s.id}</option>`;
          }
        }
      }
    } catch (e) { /* ignore */ }
    // 如果当前值不在列表中（自定义值），追加一项
    if (currentValue && !options.includes(`value="${currentValue}" selected`)) {
      options += `<option value="${currentValue}" selected>${currentValue}</option>`;
    }
    return options;
  }

  /**
   * 构建逻辑对象（region/spawn/portal/npc）的属性 HTML（P2-1）
   * 这些字段直接作为 obj 的属性，走通用 data-prop 绑定（obj[prop]=value）。
   * @private
   */
  _buildLogicProperties(obj) {
    let html = '<div class="property-row" style="border-top:1px solid #333;margin-top:6px;padding-top:6px;"></div>';
    html += `<div class="property-row"><label>名称:</label><input type="text" value="${obj.name || ''}" data-prop="name"></div>`;
    if (obj.type === 'region') {
      html += `<div class="property-row"><label>区域ID:</label><input type="text" value="${obj.regionId || ''}" data-prop="regionId" placeholder="供触发器 enterRegion 引用"></div>`;
    } else if (obj.type === 'spawn') {
      html += `<div class="property-row"><label>刷怪ID:</label><input type="text" value="${obj.spawnId || ''}" data-prop="spawnId"></div>`;
      html += `<div class="property-row"><label>敌人库ID:</label><input type="text" value="${obj.enemyRef || ''}" data-prop="enemyRef" placeholder="library.enemies 的 id"></div>`;
      html += `<div class="property-row"><label>数量:</label><input type="number" value="${obj.count != null ? obj.count : 1}" min="1" data-prop="count"></div>`;
      html += `<div class="property-row"><label>波次:</label><input type="number" value="${obj.wave != null ? obj.wave : 0}" min="0" data-prop="wave"></div>`;
      html += `<div class="property-row"><label>半径:</label><input type="number" value="${obj.radius != null ? obj.radius : 0}" min="0" data-prop="radius" title="0=单点，>0 在半径内随机散布"></div>`;
    } else if (obj.type === 'portal') {
      html += `<div class="property-row"><label>传送门ID:</label><input type="text" value="${obj.portalId || ''}" data-prop="portalId"></div>`;
      html += `<div class="property-row"><label>目标场景:</label><input type="text" value="${obj.targetScene || ''}" data-prop="targetScene" placeholder="目标 scene id"></div>`;
      html += `<div class="property-row"><label>目标出生点:</label><input type="text" value="${obj.targetSpawn || ''}" data-prop="targetSpawn" placeholder="目标 spawn id"></div>`;
    } else if (obj.type === 'npc') {
      html += `<div class="property-row"><label>NPC库ID:</label><input type="text" value="${obj.npcRef || ''}" data-prop="npcRef" placeholder="library.npcs 的 id"></div>`;
    } else if (obj.type === 'trigger') {
      html += `<div class="property-row"><label>触发器ID:</label><input type="text" value="${obj.triggerId || ''}" data-prop="triggerId"></div>`;
      // 所属场景下拉（从编辑器场景列表动态读取）
      const sceneOptions = this._getSceneOptions(obj.sceneId || '');
      html += `<div class="property-row"><label>所属场景:</label><select data-prop="sceneId">${sceneOptions}</select></div>`;
      html += `<div class="property-row"><label>触发时机:</label><select data-prop="event">
        <option value="sceneEnter" ${obj.event === 'sceneEnter' ? 'selected' : ''}>进入场景 sceneEnter</option>
        <option value="enterRegion" ${obj.event === 'enterRegion' ? 'selected' : ''}>进入区域 enterRegion</option>
        <option value="approach" ${obj.event === 'approach' ? 'selected' : ''}>靠近 approach</option>
        <option value="interact" ${obj.event === 'interact' ? 'selected' : ''}>交互 interact</option>
        <option value="itemPickup" ${obj.event === 'itemPickup' ? 'selected' : ''}>拾取物品 itemPickup</option>
        <option value="stand" ${obj.event === 'stand' ? 'selected' : ''}>站立 stand</option>
        <option value="climb" ${obj.event === 'climb' ? 'selected' : ''}>攀爬 climb</option>
        <option value="jump" ${obj.event === 'jump' ? 'selected' : ''}>跳跃 jump</option>
        <option value="enter" ${obj.event === 'enter' ? 'selected' : ''}>进入区域 enter</option>
        <option value="leave" ${obj.event === 'leave' ? 'selected' : ''}>离开区域 leave</option>
        <option value="kill" ${obj.event === 'kill' ? 'selected' : ''}>击杀敌人 kill</option>
        <option value="dialogueEnd" ${obj.event === 'dialogueEnd' ? 'selected' : ''}>对话结束 dialogueEnd</option>
        <option value="questComplete" ${obj.event === 'questComplete' ? 'selected' : ''}>任务完成 questComplete</option>
        <option value="questProgress" ${obj.event === 'questProgress' ? 'selected' : ''}>任务进度 questProgress</option>
        <option value="flagChange" ${obj.event === 'flagChange' ? 'selected' : ''}>变量变化 flagChange</option>
        <option value="timer" ${obj.event === 'timer' ? 'selected' : ''}>定时器 timer</option>
        <option value="chunkEnter" ${obj.event === 'chunkEnter' ? 'selected' : ''}>进入区块 chunkEnter</option>
        <option value="campfireLit" ${obj.event === 'campfireLit' ? 'selected' : ''}>火堆点燃 campfireLit</option>
        <option value="waveCleared" ${obj.event === 'waveCleared' ? 'selected' : ''}>波次清空 waveCleared</option>
        <option value="playerMoved" ${obj.event === 'playerMoved' ? 'selected' : ''}>玩家移动 playerMoved</option>
        <option value="panelOpen" ${obj.event === 'panelOpen' ? 'selected' : ''}>打开面板 panelOpen</option>
        <option value="equipItem" ${obj.event === 'equipItem' ? 'selected' : ''}>装备物品 equipItem</option>
        <option value="classSelected" ${obj.event === 'classSelected' ? 'selected' : ''}>选择职业 classSelected</option>
        <option value="itemTransform" ${obj.event === 'itemTransform' ? 'selected' : ''}>物品转化 itemTransform</option>
        <option value="custom" ${obj.event === 'custom' ? 'selected' : ''}>自定义 custom</option>
      </select></div>`;
      html += `<div class="property-row"><label>目标对象:</label><input type="text" value="${obj.target || ''}" data-prop="target" placeholder="关联的实体/物品 id" style="flex:1;"><button id="editor-pick-target" title="点击场景中的对象拾取" style="margin-left:4px;padding:2px 6px;cursor:pointer;">🎯</button></div>`;
      html += `<div class="property-row"><label>触发半径:</label><input type="number" value="${obj.radius != null ? obj.radius : 60}" min="0" data-prop="radius"></div>`;
      html += `<div class="property-row"><label>条件(JSON):</label><textarea data-prop="conditions" rows="2" style="width:100%;font-size:11px;">${obj.conditions || ''}</textarea></div>`;
      html += `<div class="property-row"><label>动作:</label><select data-prop="actionType">
        <option value="">-- 选择动作 --</option>
        <option value="setVar" ${obj.actionType === 'setVar' ? 'selected' : ''}>设置变量 setVar</option>
        <option value="addVar" ${obj.actionType === 'addVar' ? 'selected' : ''}>变量累加 addVar</option>
        <option value="setFlag" ${obj.actionType === 'setFlag' ? 'selected' : ''}>设置标记 setFlag</option>
        <option value="toggleFlag" ${obj.actionType === 'toggleFlag' ? 'selected' : ''}>切换标记 toggleFlag</option>
        <option value="startDialogue" ${obj.actionType === 'startDialogue' ? 'selected' : ''}>开始对话 startDialogue</option>
        <option value="switchScene" ${obj.actionType === 'switchScene' ? 'selected' : ''}>切换场景 switchScene</option>
        <option value="loadRegion" ${obj.actionType === 'loadRegion' ? 'selected' : ''}>加载区域 loadRegion</option>
        <option value="giveReward" ${obj.actionType === 'giveReward' ? 'selected' : ''}>给予奖励 giveReward</option>
        <option value="heal" ${obj.actionType === 'heal' ? 'selected' : ''}>治疗/恢复 heal</option>
        <option value="startQuest" ${obj.actionType === 'startQuest' ? 'selected' : ''}>开始任务 startQuest</option>
        <option value="completeQuest" ${obj.actionType === 'completeQuest' ? 'selected' : ''}>完成任务 completeQuest</option>
        <option value="showTip" ${obj.actionType === 'showTip' ? 'selected' : ''}>显示提示 showTip</option>
        <option value="playSound" ${obj.actionType === 'playSound' ? 'selected' : ''}>播放音效 playSound</option>
        <option value="playBgm" ${obj.actionType === 'playBgm' ? 'selected' : ''}>播放BGM playBgm</option>
        <option value="spawnEnemy" ${obj.actionType === 'spawnEnemy' ? 'selected' : ''}>生成敌人 spawnEnemy</option>
        <option value="spawnWave" ${obj.actionType === 'spawnWave' ? 'selected' : ''}>生成波次 spawnWave</option>
        <option value="spawnGroup" ${obj.actionType === 'spawnGroup' ? 'selected' : ''}>激活放置组 spawnGroup</option>
        <option value="lightCampfire" ${obj.actionType === 'lightCampfire' ? 'selected' : ''}>点燃火堆 lightCampfire</option>
        <option value="sceneCountdown" ${obj.actionType === 'sceneCountdown' ? 'selected' : ''}>倒计时切幕 sceneCountdown</option>
        <option value="promptSwitch" ${obj.actionType === 'promptSwitch' ? 'selected' : ''}>提示切幕 promptSwitch</option>
        <option value="teleportToChunk" ${obj.actionType === 'teleportToChunk' ? 'selected' : ''}>传送到区块 teleportToChunk</option>
        <option value="wait" ${obj.actionType === 'wait' ? 'selected' : ''}>等待 wait</option>
        <option value="mount" ${obj.actionType === 'mount' ? 'selected' : ''}>上载具/骑乘 mount</option>
        <option value="battleWin" ${obj.actionType === 'battleWin' ? 'selected' : ''}>战斗胜利 battleWin</option>
        <option value="battleLose" ${obj.actionType === 'battleLose' ? 'selected' : ''}>战斗失败 battleLose</option>
        <option value="parallel" ${obj.actionType === 'parallel' ? 'selected' : ''}>并行执行 parallel</option>
      </select></div>`;
      html += `<div class="property-row"><label>动作参数(JSON):</label><textarea data-prop="actionParams" rows="2" style="width:100%;font-size:11px;">${obj.actionParams || ''}</textarea></div>`;
      html += `<div class="property-row"><label>仅触发一次:</label><input type="checkbox" data-prop="once" ${obj.once ? 'checked' : ''}></div>`;
      html += `<div class="property-row"><label>冷却(秒):</label><input type="number" value="${obj.cooldown || 0}" min="0" step="0.5" data-prop="cooldown"></div>`;
    }
    return html;
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
   * 构建统一 shape 对象的属性 HTML（含填充模式/边缘淡化/碰撞）
   * @private
   */
  _buildShapeProperties(obj) {
    const mode = obj.fillMode || 'color';
    let html = '';
    html += `<div class="property-row"><label>名称:</label><input type="text" value="${obj.name || ''}" data-prop="name" placeholder="形状名称"></div>`;
    html += `<div class="property-row"><label>填充模式:</label><select data-prop="fillMode">
      <option value="color" ${mode === 'color' ? 'selected' : ''}>纯色</option>
      <option value="gradient" ${mode === 'gradient' ? 'selected' : ''}>渐变</option>
      <option value="image" ${mode === 'image' ? 'selected' : ''}>图片</option>
      <option value="slice" ${mode === 'slice' ? 'selected' : ''}>切片</option>
      <option value="pattern" ${mode === 'pattern' ? 'selected' : ''}>图案</option>
    </select></div>`;

    if (mode === 'color') {
      html += `<div class="property-row"><label>填充色:</label><input type="color" value="${obj.fill || '#3a5a2a'}" data-prop="fill"></div>`;
    } else if (mode === 'gradient') {
      html += `<div class="property-row"><label>渐变类型:</label><select data-prop="gradientType">
        <option value="linear" ${obj.gradientType !== 'radial' ? 'selected' : ''}>线性</option>
        <option value="radial" ${obj.gradientType === 'radial' ? 'selected' : ''}>径向</option>
      </select></div>`;
      html += `<div class="property-row"><label>角度:</label><input type="number" value="${obj.gradientAngle || 0}" data-prop="gradientAngle"></div>`;
      html += `<div class="property-row"><label>起始色:</label><input type="color" value="${(obj.gradientStops && obj.gradientStops[0]?.color) || '#000000'}" data-prop="gradientColor0"></div>`;
      html += `<div class="property-row"><label>结束色:</label><input type="color" value="${(obj.gradientStops && obj.gradientStops[1]?.color) || '#333333'}" data-prop="gradientColor1"></div>`;
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
      html += `<div class="property-row"><button id="editor-ellipse-apply-slice" title="先在左侧资源库选中切片，再点此填充">用选中切片填充</button></div>`;
    } else if (mode === 'pattern') {
      html += `<div class="property-row"><label>图案类型:</label><select data-prop="patternType">
        <option value="grid" ${obj.patternType === 'grid' || !obj.patternType ? 'selected' : ''}>网格</option>
        <option value="dots" ${obj.patternType === 'dots' ? 'selected' : ''}>圆点</option>
        <option value="diagonal" ${obj.patternType === 'diagonal' ? 'selected' : ''}>斜线</option>
        <option value="crosshatch" ${obj.patternType === 'crosshatch' ? 'selected' : ''}>交叉线</option>
      </select></div>`;
      html += `<div class="property-row"><label>图案色:</label><input type="color" value="${obj.patternColor || '#444444'}" data-prop="patternColor"></div>`;
      html += `<div class="property-row"><label>底色:</label><input type="color" value="${obj.patternBg || '#222222'}" data-prop="patternBg"></div>`;
      html += `<div class="property-row"><label>图案大小:</label><input type="number" value="${obj.patternSize || 32}" data-prop="patternSize"></div>`;
    }

    html += `<div class="property-row"><label>透明度:</label><input type="number" value="${obj.opacity !== undefined ? obj.opacity : 1}" step="0.1" min="0" max="1" data-prop="opacity"></div>`;
    html += `<div class="property-row"><label>边缘淡化:</label><input type="number" value="${obj.edgeFade || 0}" step="0.05" min="0" max="1" data-prop="edgeFade"></div>`;
    html += `<div class="property-row"><label>边框色:</label><input type="color" value="${obj.stroke || '#5a8a4a'}" data-prop="stroke"></div>`;
    html += `<div class="property-row"><label>边框宽:</label><input type="number" value="${obj.strokeWidth || 0}" min="0" step="1" data-prop="strokeWidth"></div>`;
    html += `<div class="property-row"><label>可碰撞:</label><input type="checkbox" ${obj.collide ? 'checked' : ''} data-prop="collide" title="作为不可通行区域"></div>`;
    return html;
  }

  /**
   * 构建图片对象（type:'image'）的属性 HTML：路径/URL、图片尺寸、文件大小
   * 图片路径存于 sceneData.imageAssets[imageId].src，不是 obj 上，故用独立 id 绑定。
   * @private
   */
  _buildImageProperties(obj) {
    const editor = this.editor;
    const asset = editor.sceneData.imageAssets?.[obj.imageId];
    const src = asset?.src || '';
    const img = editor.loadedImages.get(obj.imageId);
    const dim = img ? `${img.naturalWidth || img.width}×${img.naturalHeight || img.height}` : '未加载';
    let html = '';
    html += `<div class="property-row"><label title="图片相对路径或 URL">路径:</label><input type="text" id="editor-image-src" value="${src}" style="flex:1;"></div>`;
    html += `<div class="property-row"><label>图片尺寸:</label><input id="editor-image-dim" value="${dim}" disabled style="color:#88ccff;"></div>`;
    html += `<div class="property-row"><label>文件大小:</label><input id="editor-image-filesize" value="计算中…" disabled style="color:#88ccff;"></div>`;
    html += `<div class="property-row" style="margin-top:8px;"><button id="editor-image-edit-btn" style="flex:1;padding:5px;cursor:pointer;">编辑</button><button id="editor-image-delete-btn" style="flex:1;padding:5px;cursor:pointer;color:#f88;">删除</button></div>`;
    return html;
  }

  /**
   * 通过 dev server /api/file-size 查询图片文件大小并显示（人类可读）
   * @private
   */
  async _fetchImageFileSize(src) {
    const el = document.getElementById('editor-image-filesize');
    if (!el) return;
    if (!src) { el.value = '无路径'; return; }
    // 只有相对路径（本地文件）才能查；http(s)/data URL 直接标注
    if (/^(https?:|data:)/i.test(src)) { el.value = '外部资源'; return; }
    // 编辑器路径（如 ../example/xxx）转为相对仓库根路径
    const relPath = src.replace(/^(\.\.\/)+/, '');
    try {
      const res = await fetch('/api/file-size?path=' + encodeURIComponent(relPath));
      const data = await res.json();
      if (data && data.ok) {
        const bytes = data.size;
        el.value = bytes < 1024 ? `${bytes} B`
          : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
          : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
      } else {
        el.value = '未找到文件';
      }
    } catch (e) {
      el.value = '查询失败';
    }
  }

  /**
   * 打开图片编辑弹窗：展示图片预览，可更换路径、调整尺寸
   * @private
   */
  _openImageEditorModal(imgObj) {
    const editor = this.editor;
    const asset = editor.sceneData.imageAssets?.[imgObj.imageId];
    const src = asset?.src || '';
    const img = editor.loadedImages.get(imgObj.imageId);

    const overlay = document.createElement('div');
    overlay.id = 'slice-editor-overlay';
    overlay.innerHTML = `
      <div id="slice-editor-modal">
        <div class="slice-modal-header">
          <span>图片编辑 - ${imgObj.id || imgObj.imageId}</span>
          <button id="slice-modal-close" title="关闭">✕</button>
        </div>
        <div class="slice-modal-body">
          <div class="slice-modal-canvas-wrap">
            <canvas id="img-modal-canvas"></canvas>
            ${!img ? '<div style="padding:20px;color:#f88;font-size:12px;">图片未加载，请设置正确路径</div>' : ''}
          </div>
          <div class="slice-modal-params">
            <div class="smp-row"><label>图片路径:</label><input type="text" id="imp-path" value="${src}" style="min-width:180px;"></div>
            <div class="smp-row"><label>图片宽:</label><input type="number" id="imp-nat-w" value="${img ? img.naturalWidth : 0}" disabled style="color:#88ccff;"></div>
            <div class="smp-row"><label>图片高:</label><input type="number" id="imp-nat-h" value="${img ? img.naturalHeight : 0}" disabled style="color:#88ccff;"></div>
            <div class="smp-row"><label>对象宽:</label><input type="number" id="imp-width" value="${Math.round(imgObj.width)}"></div>
            <div class="smp-row"><label>对象高:</label><input type="number" id="imp-height" value="${Math.round(imgObj.height)}"></div>
            <div class="smp-row"><label>旋转:</label><input type="number" id="imp-rotation" value="${imgObj.rotation || 0}"></div>
            <div class="smp-row" style="margin-top:6px;">
              <button id="imp-reload" style="flex:1;">刷新图片</button>
              <button id="imp-fit" style="flex:1;">适应原始尺寸</button>
            </div>
            <div class="smp-row" style="margin-top:12px;">
              <button id="imp-confirm" style="flex:1;">确定</button>
              <button id="imp-cancel" style="flex:1;">取消</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 绘制图片预览
    const canvas = document.getElementById('img-modal-canvas');
    const drawImg = () => {
      const curImg = editor.loadedImages.get(imgObj.imageId);
      if (!curImg || !canvas) return;
      const maxCW = Math.min(600, window.innerWidth - 320);
      const maxCH = Math.min(450, window.innerHeight - 160);
      const scale = Math.min(maxCW / curImg.naturalWidth, maxCH / curImg.naturalHeight, 2);
      canvas.width = Math.round(curImg.naturalWidth * scale);
      canvas.height = Math.round(curImg.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(curImg, 0, 0, canvas.width, canvas.height);
    };
    drawImg();

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('slice-modal-close').addEventListener('click', close);
    document.getElementById('imp-cancel').addEventListener('click', close);

    // 刷新图片
    document.getElementById('imp-reload').addEventListener('click', () => {
      const newPath = document.getElementById('imp-path').value.trim();
      if (!newPath) return;
      const newImg = new Image();
      newImg.onload = () => {
        editor.loadedImages.set(imgObj.imageId, newImg);
        document.getElementById('imp-nat-w').value = newImg.naturalWidth;
        document.getElementById('imp-nat-h').value = newImg.naturalHeight;
        drawImg();
      };
      newImg.onerror = () => this.showToast('图片加载失败: ' + newPath, 'error');
      newImg.src = newPath;
    });

    // 适应原始尺寸
    document.getElementById('imp-fit').addEventListener('click', () => {
      const curImg = editor.loadedImages.get(imgObj.imageId);
      if (curImg) {
        document.getElementById('imp-width').value = curImg.naturalWidth;
        document.getElementById('imp-height').value = curImg.naturalHeight;
      }
    });

    // 确定
    document.getElementById('imp-confirm').addEventListener('click', () => {
      const newPath = document.getElementById('imp-path').value.trim();
      if (newPath && newPath !== src) {
        if (!editor.sceneData.imageAssets) editor.sceneData.imageAssets = {};
        if (!editor.sceneData.imageAssets[imgObj.imageId]) {
          editor.sceneData.imageAssets[imgObj.imageId] = { src: newPath };
        } else {
          editor.sceneData.imageAssets[imgObj.imageId].src = newPath;
        }
        // 重新加载
        const reImg = new Image();
        reImg.onload = () => { editor.loadedImages.set(imgObj.imageId, reImg); editor.render(); };
        reImg.src = newPath;
      }
      imgObj.width = parseInt(document.getElementById('imp-width').value) || imgObj.width;
      imgObj.height = parseInt(document.getElementById('imp-height').value) || imgObj.height;
      imgObj.rotation = parseInt(document.getElementById('imp-rotation').value) || 0;
      this.updateObjectProperties();
      editor.render();
      close();
    });
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
