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
 * SceneEditorAssets - 场景编辑器资源管理模块
 * 负责图集、切片、精灵拖放等资源相关功能
 */
export class SceneEditorAssets {
  /**
   * @param {import('./SceneEditor.js').SceneEditor} editor - 主编辑器实例
   */
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * 设置资源拖放
   */
  setupAssetDragDrop() {
    const editor = this.editor;
    const assetList = document.getElementById('editor-asset-list');
    const container = document.getElementById('editor-canvas-container');

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

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const pos = editor.interactionModule.screenToScene(e.offsetX, e.offsetY);

      // 处理切片拖拽 - 优先使用临时变量
      if (editor.draggingSlice) {
        const { atlasId, sliceKey } = editor.draggingSlice;
        this._addSliceToScene(atlasId, sliceKey, pos.x, pos.y);
        editor.draggingSlice = null;
        return;
      }

      // 备用方案：从 dataTransfer 获取
      if (id && id.startsWith('slice:')) {
        const parts = id.split(':');
        this._addSliceToScene(parts[1], parts[2], pos.x, pos.y);
        return;
      }

      // 内容库定义拖入 → 放置引用实例
      if (id && id.startsWith('content:')) {
        const parts = id.split(':');
        this._addContentPlacement(parts[1], parts[2], pos.x, pos.y);
        return;
      }

      if (id === 'rect') {
        editor.ui.addObject({ type: 'rect', x: pos.x - 32, y: pos.y - 32, width: 64, height: 64, fill: '#4a5a8e' });
      } else if (id === 'circle') {
        editor.ui.addObject({ type: 'circle', x: pos.x, y: pos.y, radius: 32, fill: '#4a8e5a' });
      } else if (id === 'ellipse') {
        // 拖入地形椭圆：放入背景填充层并解锁
        const fillLayer = editor.sceneData.layers.find(l => l.id === 'layer_fill');
        const rx = 200, ry = 130;
        const ellipseObj = {
          id: 'ellipse_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          type: 'ellipse',
          name: '地形椭圆',
          x: Math.round(pos.x - rx),
          y: Math.round(pos.y - ry),
          width: rx * 2,
          height: ry * 2,
          fillMode: 'color',
          fill: '#3a5a2a',
          opacity: 1,
          stroke: '',
          strokeWidth: 0,
          edgeFade: 0
        };
        if (fillLayer) {
          fillLayer.locked = false;
          fillLayer.objects.push(ellipseObj);
          editor.activeLayerIndex = editor.sceneData.layers.indexOf(fillLayer);
        } else {
          editor.ui.addObject(ellipseObj);
        }
        editor.selectedObjects = [ellipseObj];
        editor.history.saveHistory();
        editor.ui.updateObjectCount();
        editor.ui.updateObjectProperties();
        editor.render();
      } else if (id === 'polygon') {
        // 拖入多边形 shape（默认正五边形，以落点为中心；顶点可拖拽编辑）
        const r = 120;
        const cx = pos.x, cy = pos.y;
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
          pts.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
        }
        const obj = editor.ui.addObject({
          type: 'shape',
          shapeType: 'polygon',
          name: '多边形',
          points: pts,
          fillMode: 'color',
          fill: '#3a5a2a',
          opacity: 1,
          edgeFade: 0,
          stroke: '#5a8a4a',
          strokeWidth: 2,
          collide: false
        });
        if (obj) {
          editor.selectedObjects = [obj];
          editor.ui.updateObjectProperties();
        }
      } else if (id === 'region' || id === 'spawn' || id === 'portal' || id === 'npc' || id === 'trigger' || id === 'buffZone') {
        // 逻辑对象（P2-1）：region/spawn/portal/npc/trigger/buffZone，放入逻辑层
        this._addLogicObject(id, pos.x, pos.y);
      } else if (id === 'fill') {
        const fillLayer = editor.sceneData.layers.find(l => l.id === 'layer_fill');
        const fillObj = {
          id: 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          type: 'fill',
          x: 0, y: 0,
          width: editor.sceneData.width,
          height: editor.sceneData.height,
          fillMode: 'color',
          fillColor: '#333333',
          opacity: 1,
          name: '背景填充'
        };
        if (fillLayer) {
          fillLayer.objects.push(fillObj);
          editor.activeLayerIndex = editor.sceneData.layers.indexOf(fillLayer);
        } else {
          editor.ui.addObject(fillObj);
        }
        editor.selectedObjects = [fillObj];
        editor.history.saveHistory();
        editor.ui.updateObjectCount();
        editor.ui.updateObjectProperties();
        editor.render();
      } else if (editor.loadedImages.has(id)) {
        const img = editor.loadedImages.get(id);
        editor.ui.addObject({
          type: 'image', imageId: id,
          x: pos.x - img.width / 2, y: pos.y - img.height / 2,
          width: img.width, height: img.height, rotation: 0
        });
      }
    });
  }

  /**
   * 添加逻辑对象（region/spawn/portal/npc）到逻辑层（P2-1）
   * 数据结构对应 §1 scenes[].objects.{regions,npcs,spawns,portals}，
   * 编辑器中统一以 type 存于图层对象，导出时可归类。
   * @param {string} kind - region|spawn|portal|npc
   * @param {number} x
   * @param {number} y
   * @private
   */
  _addLogicObject(kind, x, y) {
    const editor = this.editor;
    const rnd = Date.now() + '_' + Math.floor(Math.random() * 1000);
    let obj;
    if (kind === 'region') {
      const w = 200, h = 140;
      obj = {
        id: 'region_' + rnd, type: 'region', name: '区域',
        regionId: 'region_' + Math.floor(Math.random() * 10000),
        x: Math.round(x - w / 2), y: Math.round(y - h / 2), width: w, height: h
      };
    } else if (kind === 'spawn') {
      obj = {
        id: 'spawn_' + rnd, type: 'spawn', name: '刷怪点',
        spawnId: 'spawn_' + Math.floor(Math.random() * 10000),
        x: Math.round(x), y: Math.round(y),
        enemyRef: '', count: 1, wave: 0, radius: 0
      };
    } else if (kind === 'portal') {
      obj = {
        id: 'portal_' + rnd, type: 'portal', name: '传送门',
        portalId: 'portal_' + Math.floor(Math.random() * 10000),
        x: Math.round(x), y: Math.round(y),
        targetScene: '', targetSpawn: ''
      };
    } else if (kind === 'npc') {
      obj = {
        id: 'npc_' + rnd, type: 'npc', name: 'NPC',
        npcRef: '', x: Math.round(x), y: Math.round(y)
      };
    } else if (kind === 'trigger') {
      const w = 36, h = 36;
      obj = {
        id: 'trigger_' + rnd, type: 'trigger', name: '触发器',
        triggerId: 'trg_' + Math.floor(Math.random() * 10000),
        x: Math.round(x - w / 2), y: Math.round(y - h / 2), width: w, height: h,
        event: 'approach',
        target: '',
        radius: 60,
        conditions: '',
        actions: ''
      };
    } else if (kind === 'buffZone') {
      // Buff 多边形：默认 5 顶点正五边形
      const r = 100; // 半径
      const cx = Math.round(x), cy = Math.round(y);
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / 5;
        pts.push([Math.round(cx + r * Math.cos(angle)), Math.round(cy + r * Math.sin(angle))]);
      }
      // 计算包围盒
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
      obj = {
        id: 'buffZone_' + rnd, type: 'buffZone', name: 'Buff区域',
        shapeType: 'polygon',
        points: pts,
        x: minX, y: minY, width: maxX - minX, height: maxY - minY,
        fillColor: 'rgba(100, 0, 200, 0.2)',
        borderColor: 'rgba(100, 0, 200, 0.5)',
        visible: true,
        effect: {
          effectType: 'periodic',
          stat: 'hp',
          value: -5,
          interval: 2,
          onLeave: 'remove',
          leaveDuration: 5,
          target: 'player'
        }
      };
    }
    if (!obj) return;

    // 确保存在逻辑层
    let logicLayer = editor.sceneData.layers.find(l => l.id === 'layer_logic');
    if (!logicLayer) {
      logicLayer = { id: 'layer_logic', name: '逻辑对象', visible: true, locked: false, objects: [] };
      editor.sceneData.layers.push(logicLayer);
    }
    logicLayer.visible = true;
    logicLayer.locked = false;
    if (!Array.isArray(logicLayer.objects)) logicLayer.objects = [];
    logicLayer.objects.push(obj);
    editor.activeLayerIndex = editor.sceneData.layers.indexOf(logicLayer);

    editor.selectedObjects = [obj];
    editor.history.saveHistory();
    editor.ui.updateObjectCount();
    editor.ui.updateObjectProperties();
    editor.render();
  }

  /**
   * 放置一个内容库引用实例（type:'ref'）到放置层。
   * 只存 { kind, ref:库id, x, y, group }，明细在内容库定义里（库与实例分离）。
   * @param {string} kind - item|equipment|npc|enemy|shop|vehicle|building
   * @param {string} ref - 内容库定义 id
   */
  _addContentPlacement(kind, ref, x, y) {
    const editor = this.editor;
    // 查定义名字（用于显示）
    let name = ref;
    if (this._contentLib) {
      for (const c of this._contentCategories()) {
        const def = (this._contentLib[c.key] || []).find(d => d.id === ref);
        if (def) { name = def.name || ref; break; }
      }
    }
    const obj = {
      id: 'ref_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: 'ref',
      kind,
      ref,
      name,
      x: Math.round(x),
      y: Math.round(y),
      group: ''
    };
    let layer = editor.sceneData.layers.find(l => l.id === 'layer_placement');
    if (!layer) {
      layer = { id: 'layer_placement', name: '放置层', visible: true, locked: false, objects: [] };
      editor.sceneData.layers.push(layer);
    }
    layer.visible = true;
    layer.locked = false;
    if (!Array.isArray(layer.objects)) layer.objects = [];
    layer.objects.push(obj);
    editor.activeLayerIndex = editor.sceneData.layers.indexOf(layer);
    editor.selectedObjects = [obj];
    editor.history.saveHistory();
    editor.ui.updateObjectCount();
    editor.ui.updateObjectProperties();
    editor.render();
  }

  /**
   * 将切片添加到场景
   * @private
   */
  _addSliceToScene(atlasId, sliceKey, x, y) {
    const editor = this.editor;
    const atlas = editor.sceneData.atlases?.find(a => a.id === atlasId);
    if (!atlas) return;

    const slice = atlas.slices?.[sliceKey];
    if (!slice) return;

    const decoLayer = editor.sceneData.layers.find(l => l.id === 'layer_deco');
    if (!decoLayer) return;

    const obj = {
      id: 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: 'slice',
      atlasId, sliceKey,
      x: Math.round(x - slice.sw / 2),
      y: Math.round(y - slice.sh / 2),
      width: slice.sw,
      height: slice.sh,
      name: slice.name || sliceKey
    };

    decoLayer.objects.push(obj);
    editor.activeLayerIndex = editor.sceneData.layers.indexOf(decoLayer);
    editor.history.saveHistory();
    editor.ui.updateObjectCount();
    editor.render();

    editor.selectedObjects = [obj];
    editor.ui.updateObjectProperties();
  }

  /**
   * 添加图片资源
   */
  addImageAsset(file) {
    const editor = this.editor;
    return new Promise((resolve, reject) => {
      // 用户需先将图片放到项目 assets/images/ 目录下（含子文件夹）
      // 让用户输入图片在 assets/images/ 下的相对路径
      const defaultPath = file.webkitRelativePath || file.name;
      const subPath = prompt(
        `请输入图片在 assets/images/ 下的路径：\n（如 scene1/bg.png 或直接 bg.png）`,
        defaultPath
      );
      if (!subPath || !subPath.trim()) { reject(new Error('取消')); return; }
      
      const game = window._editorCurrentGame;
      const gamePath = (game && game.path) ? game.path : '../example/sanguo_zhangjiao/';
      const relativeSrc = gamePath + 'assets/images/' + subPath.trim();
      
      const img = new Image();
      img.onload = () => {
        const id = 'img_' + Date.now();
        editor.loadedImages.set(id, img);
        
        if (!editor.sceneData.imageAssets) editor.sceneData.imageAssets = {};
        editor.sceneData.imageAssets[id] = { src: relativeSrc, name: file.name };

        const assetList = document.getElementById('editor-asset-list');
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.draggable = true;
        item.dataset.id = id;
        item.innerHTML = `
          <div class="asset-preview"><img src="${relativeSrc}" alt="${file.name}"></div>
          <span>${file.name.substring(0, 8)}</span>
        `;
        assetList.appendChild(item);
        resolve(id);
      };
      img.onerror = () => {
        alert(`图片加载失败！请确保文件已放入：\n${relativeSrc}\n\n支持子文件夹，如 assets/images/scene1/bg.png`);
        reject(new Error('图片不在项目目录中'));
      };
      img.src = relativeSrc;
    });
  }

  /**
   * 更新资源库显示
   */
  updateAssetLibrary() {
    this._updateSpriteList();
    this._updateAtlasList();
  }

  /**
   * 更新精灵列表
   * @private
   */
  _updateSpriteList() {
    const list = document.getElementById('editor-asset-list');
    if (!list) return;

    list.innerHTML = `
      <div class="asset-item placeholder" draggable="true" data-type="rect">
        <div class="asset-preview rect"></div>
        <span>矩形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="circle">
        <div class="asset-preview circle"></div>
        <span>圆形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="ellipse">
        <div class="asset-preview" style="width:40px;height:26px;border-radius:50%;background:#3a5a2a;border:1px solid #5a8a4a;"></div>
        <span>地形椭圆</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="polygon">
        <div class="asset-preview" style="width:34px;height:30px;background:#3a5a2a;border:1px solid #5a8a4a;clip-path:polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%);"></div>
        <span>多边形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="fill">
        <div class="asset-preview fill" style="background:linear-gradient(135deg,#333,#666);border:1px dashed #888;"></div>
        <span>背景填充</span>
      </div>
    `;
  }

  /**
   * 更新「逻辑」列表（区域/刷怪点/传送门），从「图形」拆出单列
   */
  updateLogicList() {
    const list = document.getElementById('editor-logic-list');
    if (!list) return;
    list.innerHTML = `
      <div class="asset-item placeholder" draggable="true" data-type="region">
        <div class="asset-preview" style="width:38px;height:26px;background:rgba(80,140,255,0.18);border:1px dashed #5a8adf;"></div>
        <span>区域</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="spawn">
        <div class="asset-preview" style="width:30px;height:30px;border-radius:50%;background:rgba(220,80,80,0.25);border:2px dashed #d05050;"></div>
        <span>刷怪点</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="portal">
        <div class="asset-preview" style="width:28px;height:30px;border-radius:50%;background:rgba(180,80,220,0.25);border:2px solid #b450dc;"></div>
        <span>传送门</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="trigger">
        <div class="asset-preview" style="width:38px;height:26px;background:rgba(255,200,50,0.15);border:2px dashed #e0a020;"></div>
        <span>触发器</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="buffZone">
        <div class="asset-preview" style="width:38px;height:26px;background:rgba(100,0,200,0.2);border:2px dashed #8040c0;"></div>
        <span>Buff多边形</span>
      </div>
    `;
    this._bindAssetDrag(list);
  }

  /** 给一个资源列表绑定拖拽（dragstart 写入 data-id，供 drop 解析） */
  _bindAssetDrag(list) {
    if (!list || list._dragBound) return;
    list._dragBound = true;
    list.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.asset-item');
      if (item) {
        e.dataTransfer.setData('text/plain', item.dataset.id || item.dataset.type);
        item.classList.add('dragging');
      }
    });
    list.addEventListener('dragend', (e) => {
      const item = e.target.closest('.asset-item');
      if (item) item.classList.remove('dragging');
    });
  }

  // ==================== 内容库（资源库·定义 + 放置） ====================

  /** 当前游戏 id */
  _contentGameId() {
    const e = this.editor;
    return e.currentGameId || e.gameId || (e.options && e.options.gameId) || 'sanguo_zhangjiao';
  }

  /** 可放置内容分类（对应 GameProject.library 键；职业/技能/天赋等在内容库导航里，不在此） */
  _contentCategories() {
    return [
      { key: 'items', label: '物品', kind: 'item' },
      { key: 'equipment', label: '装备', kind: 'equipment' },
      { key: 'npcs', label: 'NPC', kind: 'npc' },
      { key: 'enemies', label: '敌人', kind: 'enemy' },
      { key: 'shops', label: '商店', kind: 'shop' },
      { key: 'vehicles', label: '载具', kind: 'vehicle' },
      { key: 'buildings', label: '建筑', kind: 'building' }
    ];
  }

  /** 加载内容库定义（从 game.project.json 的 library），填充分类下拉并渲染列表 */
  async updateContentLibrary() {
    if (!this._contentLib) {
      const path = `example/${this._contentGameId()}/game.project.json`;
      this._contentProjectPath = path;
      try {
        const res = await fetch('/api/read-file?path=' + encodeURIComponent(path));
        const data = await res.json();
        this._contentProject = (data && data.ok && data.content) ? JSON.parse(data.content) : { library: {} };
      } catch (e) {
        console.warn('内容库加载失败', e);
        this._contentProject = { library: {} };
      }
      if (!this._contentProject.library) this._contentProject.library = {};
      for (const c of this._contentCategories()) {
        if (!Array.isArray(this._contentProject.library[c.key])) this._contentProject.library[c.key] = [];
      }
      this._contentLib = this._contentProject.library;
      // 填充分类下拉
      const filter = document.getElementById('editor-content-filter');
      if (filter && !filter.dataset.filled) {
        filter.innerHTML = this._contentCategories()
          .map(c => `<option value="${c.key}">${c.label}</option>`).join('');
        filter.dataset.filled = '1';
      }
    }
    this.updateContentList();
  }

  /** 渲染当前分类的内容列表（可拖入场景放置） */
  updateContentList() {
    const list = document.getElementById('editor-content-list');
    if (!list || !this._contentLib) return;
    const filter = document.getElementById('editor-content-filter');
    const catKey = (filter && filter.value) || 'items';
    const cat = this._contentCategories().find(c => c.key === catKey);
    const entries = this._contentLib[catKey] || [];
    if (entries.length === 0) {
      list.innerHTML = '<div style="padding:10px;color:#666;text-align:center;font-size:11px;">该分类暂无定义<br>点「+ 新增定义」</div>';
      return;
    }
    list.innerHTML = entries.map(def => `
      <div class="asset-item content-item" draggable="true"
           data-id="content:${cat.kind}:${def.id}" data-cat="${catKey}" data-ref="${def.id}"
           title="拖入场景放置；点击编辑定义">
        <div class="asset-preview" style="width:30px;height:30px;background:rgba(80,200,140,0.2);border:1px solid #50c88c;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#8fe;">${cat.label.slice(0,1)}</div>
        <span>${def.name || def.id}</span>
      </div>
    `).join('');
    this._bindAssetDrag(list);
    // 点击条目 → 在右侧属性面板编辑该定义
    list.querySelectorAll('.content-item').forEach(el => {
      el.addEventListener('click', () => {
        const ref = el.dataset.ref;
        const def = (this._contentLib[catKey] || []).find(d => d.id === ref);
        if (def) this.editor.ui.showContentDefinitionEditor?.(catKey, def);
      });
    });
  }

  /** 在当前分类新增一条定义（默认模板） */
  addContentDefinition() {
    if (!this._contentLib) return;
    const filter = document.getElementById('editor-content-filter');
    const catKey = (filter && filter.value) || 'items';
    const id = catKey.replace(/s$/, '') + '_' + Date.now().toString(36);
    const tpl = { id, name: '新' + (this._contentCategories().find(c => c.key === catKey) || {}).label };
    this._contentLib[catKey].push(tpl);
    this.updateContentList();
    this.editor.ui.showContentDefinitionEditor?.(catKey, tpl);
  }

  /** 保存内容库定义回 game.project.json（保留其它字段） */
  async saveContentLibrary() {
    if (!this._contentProject) return;
    this._contentProject.library = this._contentLib;
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this._contentProjectPath, content: JSON.stringify(this._contentProject, null, 2) })
      });
      const data = await res.json();
      this.editor.ui.showToast?.(data && data.ok ? '内容库已保存' : ('保存失败: ' + (data.error || '未知')), data && data.ok ? 'success' : 'error');
    } catch (e) {
      this.editor.ui.showToast?.('保存失败: ' + e.message, 'error');
    }
  }

  /**
   * 更新图集列表
   * @private
   */
  _updateAtlasList() {
    const editor = this.editor;
    const list = document.getElementById('editor-atlas-list');
    if (!list) return;

    list.innerHTML = '';

    if (!editor.sceneData.atlases || editor.sceneData.atlases.length === 0) {
      list.innerHTML = '<div style="padding:10px;color:#666;text-align:center;font-size:11px;">暂无图集</div>';
      return;
    }

    for (const atlas of editor.sceneData.atlases) {
      const item = document.createElement('div');
      item.className = 'atlas-item';
      if (editor.selectedAtlasId === atlas.id) item.classList.add('selected');

      let slicesHtml = '';
      const sliceCount = atlas.slices ? Object.keys(atlas.slices).length : 0;
      if (atlas.slices) {
        for (const [sliceKey, slice] of Object.entries(atlas.slices)) {
          slicesHtml += `
            <div class="slice-item" draggable="true" data-atlas="${atlas.id}" data-slice="${sliceKey}">
              <div class="slice-preview" style="background:${sliceKey.includes('tree') ? '#2a5a2a' : '#4a6a3a'}"></div>
              <span>${slice.name || sliceKey}</span>
            </div>
          `;
        }
      }

      // 选中图集时展开属性编辑区
      let propsHtml = '';
      if (editor.selectedAtlasId === atlas.id) {
        propsHtml = `
          <div class="atlas-props" data-atlas="${atlas.id}">
            <div class="atlas-prop-row"><label>ID:</label><input value="${atlas.id}" disabled style="color:#FFD700;"></div>
            <div class="atlas-prop-row"><label>名称:</label><input type="text" class="atlas-prop" data-prop="name" value="${atlas.name || ''}"></div>
            <div class="atlas-prop-row"><label>路径:</label><input type="text" class="atlas-prop" data-prop="path" value="${atlas.path || ''}" title="图集图片的相对路径或 URL"></div>
            <div class="atlas-prop-row"><label>宽度:</label><input type="number" class="atlas-prop" data-prop="width" value="${atlas.width || 0}"></div>
            <div class="atlas-prop-row"><label>高度:</label><input type="number" class="atlas-prop" data-prop="height" value="${atlas.height || 0}"></div>
            <div class="atlas-prop-row"><label>切片数:</label><input value="${sliceCount}" disabled style="color:#88ccff;"></div>
          </div>
        `;
      }

      item.innerHTML = `
        <div class="atlas-header" data-atlas="${atlas.id}">
          <span>${atlas.name}</span>
          <span style="font-size:10px;color:#666;">${atlas.width}×${atlas.height} · ${sliceCount}片</span>
        </div>
        ${propsHtml}
        <div class="slice-grid">${slicesHtml}</div>
      `;

      list.appendChild(item);
    }

    // 绑定图集头部点击 → 选中图集
    list.querySelectorAll('.atlas-header').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectAtlas(header.dataset.atlas);
      });
    });

    // 绑定图集属性编辑
    list.querySelectorAll('.atlas-props').forEach(propsEl => {
      const atlasId = propsEl.dataset.atlas;
      propsEl.querySelectorAll('.atlas-prop').forEach(input => {
        input.addEventListener('change', () => {
          const atlas = editor.sceneData.atlases?.find(a => a.id === atlasId);
          if (!atlas) return;
          const prop = input.dataset.prop;
          const value = input.type === 'number' ? parseFloat(input.value) : input.value;
          atlas[prop] = value;
          if (prop === 'path') {
            // 路径变化，重新加载图集图片以刷新预览
            editor.loadedImages.delete(atlas.id);
            this.loadAtlasImages();
          }
          this._updateAtlasList();
          editor.render();
        });
      });
    });

    // 绑定切片事件
    list.querySelectorAll('.slice-item').forEach(sliceItem => {
      sliceItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectSlice(sliceItem.dataset.atlas, sliceItem.dataset.slice);
      });

      sliceItem.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        const atlasId = sliceItem.dataset.atlas;
        const sliceKey = sliceItem.dataset.slice;
        editor.draggingSlice = { atlasId, sliceKey };
        e.dataTransfer.setData('text/plain', `slice:${atlasId}:${sliceKey}`);
        e.dataTransfer.effectAllowed = 'copy';
        sliceItem.classList.add('dragging');
      });

      sliceItem.addEventListener('dragend', () => {
        sliceItem.classList.remove('dragging');
      });
    });
  }

  /**
   * 选中图集（展开属性编辑区）
   * @private
   */
  _selectAtlas(atlasId) {
    const editor = this.editor;
    // 再次点击已选中的图集则取消选中
    editor.selectedAtlasId = (editor.selectedAtlasId === atlasId) ? null : atlasId;
    this._updateAtlasList();
    this._updateSlicePreviews();
  }

  /**
   * 新增图集
   */
  addAtlas() {
    const editor = this.editor;
    if (!editor.sceneData.atlases) editor.sceneData.atlases = [];
    const id = 'atlas_' + Date.now().toString(36);
    const atlas = {
      id,
      name: '新图集',
      path: '',
      width: 512,
      height: 512,
      slices: {}
    };
    editor.sceneData.atlases.push(atlas);
    editor.selectedAtlasId = id;
    this._updateAtlasList();
    editor.ui.showToast?.('已新增图集，请设置图片路径');
  }

  /**
   * 删除选中的图集
   */
  deleteAtlas() {
    const editor = this.editor;
    const atlasId = editor.selectedAtlasId;
    if (!atlasId) { editor.ui.showToast?.('请先选中一个图集', 'error'); return; }
    const atlas = editor.sceneData.atlases?.find(a => a.id === atlasId);
    if (!atlas) return;
    if (!confirm(`确定删除图集「${atlas.name}」吗？`)) return;
    editor.sceneData.atlases = editor.sceneData.atlases.filter(a => a.id !== atlasId);
    editor.loadedImages.delete(atlasId);
    editor.selectedAtlasId = null;
    if (editor.selectedSlice && editor.selectedSlice.atlasId === atlasId) editor.selectedSlice = null;
    this._updateAtlasList();
    editor.render();
    editor.ui.showToast?.('已删除图集');
  }

  /**
   * 保存所有图集到全局配置 config/atlases.json
   * 同时把切片属性一并写回。
   */
  async saveAtlases() {
    const editor = this.editor;
    const atlases = editor.sceneData.atlases || [];
    const content = JSON.stringify({ atlases }, null, 2);
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'editor/config/atlases.json', content })
      });
      const data = await res.json();
      editor.ui.showToast?.(
        data && data.ok ? '图集已保存到 config/atlases.json' : ('保存失败: ' + (data.error || '未知')),
        data && data.ok ? 'success' : 'error'
      );
    } catch (e) {
      editor.ui.showToast?.('保存失败: ' + e.message, 'error');
    }
  }

  /**
   * 选中切片
   * @private
   */
  _selectSlice(atlasId, sliceKey) {
    const editor = this.editor;
    const atlas = editor.sceneData.atlases?.find(a => a.id === atlasId);
    if (!atlas) return;

    const slice = atlas.slices?.[sliceKey];
    if (!slice) return;

    // 更新选中状态
    editor.container.querySelectorAll('.slice-item').forEach(item => {
      item.classList.remove('selected');
    });

    const selectedEl = editor.container.querySelector(`.slice-item[data-atlas="${atlasId}"][data-slice="${sliceKey}"]`);
    if (selectedEl) selectedEl.classList.add('selected');

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
            if (el.type === 'checkbox') value = el.checked;
            else if (el.type === 'number') value = parseFloat(el.value);
            else value = el.value;

            const actualProp = prop === 'radius' ? 'colliderRadius' : prop;
            slice[actualProp] = value;

            if (editor.sceneData.decoSprites && editor.sceneData.decoSprites[sliceKey]) {
              editor.sceneData.decoSprites[sliceKey][actualProp] = value;
            }

            editor.render();
          });
        }
      });
    }

    editor.selectedSlice = { atlasId, sliceKey, slice };
  }

  /**
   * 恢复保存的图片资源
   */
  loadImageAssets() {
    const editor = this.editor;
    const assets = editor.sceneData.imageAssets;
    if (!assets) return;

    for (const [id, data] of Object.entries(assets)) {
      if (editor.loadedImages.has(id)) continue;
      const img = new Image();
      img.onload = () => {
        editor.loadedImages.set(id, img);
        editor.render();
      };
      // src 可能是相对路径或旧的 dataURL，都能直接作为 img.src
      img.src = data.src;
    }
  }

  /**
   * 加载图集图片
   */
  loadAtlasImages() {
    const editor = this.editor;

    // 1. 加载地形底图
    const terrainImage = editor.sceneData.terrain?.image;
    if (terrainImage && !editor.loadedImages.has('terrain_atlas')) {
      const timg = new Image();
      timg.onload = () => {
        editor.loadedImages.set('terrain_atlas', timg);
        editor.render();
      };
      timg.onerror = () => console.error('Failed to load terrain image:', terrainImage);
      timg.src = terrainImage;
    }

    // 2. 加载图集
    if (!editor.sceneData.atlases) return;

    for (const atlas of editor.sceneData.atlases) {
      const img = new Image();
      img.onload = () => {
        editor.loadedImages.set(atlas.id, img);
        editor.render();
        this._updateSlicePreviews();
      };
      img.onerror = () => console.error('Failed to load atlas:', atlas.id, 'path:', atlas.path);
      img.src = atlas.path;
    }
  }

  /**
   * 更新切片预览图
   * @private
   */
  _updateSlicePreviews() {
    const editor = this.editor;
    if (!editor.sceneData.atlases) return;

    for (const atlas of editor.sceneData.atlases) {
      const img = editor.loadedImages.get(atlas.id);
      if (!img) continue;

      for (const [sliceKey, slice] of Object.entries(atlas.slices || {})) {
        const previewEl = editor.container.querySelector(
          `.slice-item[data-atlas="${atlas.id}"][data-slice="${sliceKey}"] .slice-preview`
        );

        if (previewEl) {
          const canvas = document.createElement('canvas');
          canvas.width = slice.sw;
          canvas.height = slice.sh;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, slice.sx, slice.sy, slice.sw, slice.sh, 0, 0, slice.sw, slice.sh);
          previewEl.innerHTML = `<img src="${canvas.toDataURL()}" alt="${slice.name || sliceKey}">`;
        }
      }
    }
  }
}
