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

import { updateAtlasesCache, updateImagesCache, addGlobalImage } from './SceneDataLoader.js';
import { replaceCanonicalFile } from './CanonicalTransactionClient.js';

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
      } else if (id === 'effectZone') {
        // 特效区域多边形：粒子特效展示区（火焰/流水/湖面/冰面等）
        const r = 100;
        const cx = pos.x, cy = pos.y;
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
          pts.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
        }
        const minX = Math.min(...pts.map(p => p[0]));
        const minY = Math.min(...pts.map(p => p[1]));
        const maxX = Math.max(...pts.map(p => p[0]));
        const maxY = Math.max(...pts.map(p => p[1]));
        const obj = editor.ui.addObject({
          type: 'effectZone',
          name: '特效区域',
          effectType: 'fire',       // fire / water / lake / ice / smoke / sparkle
          points: pts,
          x: minX, y: minY, width: maxX - minX, height: maxY - minY,
          // 粒子参数（默认火焰）
          particleRate: 12,         // 每秒生成粒子数
          particleLife: 1.2,        // 粒子生命（秒）
          particleSize: 6,          // 粒子初始大小
          particleSpeed: 40,        // 粒子初始速度
          particleColor: '#ff6622', // 粒子主色
          particleAlpha: 0.8,       // 粒子初始透明度
          fillColor: 'rgba(255,120,30,0.15)', // 编辑器预览填充
          borderColor: 'rgba(255,140,40,0.7)'  // 编辑器预览边框
        });
        if (obj) {
          editor.selectedObjects = [obj];
          editor.ui.updateObjectProperties();
        }
      } else if (id === 'region' || id === 'spawn' || id === 'portal' || id === 'npc' || id === 'trigger' || id === 'buffZone' || id === 'buffRect' || id === 'buffEllipse' || id === 'playerSpawn' || id === 'campfire') {
        // 逻辑对象：放入逻辑层
        this._addLogicObject(id, pos.x, pos.y);
      } else if (id === 'terrain-rect') {
        // 地形四边形：放入背景填充层（矩形，非椭圆）
        const fillLayer = editor.sceneData.layers.find(l => l.id === 'layer_fill');
        const w = 300, h = 300;
        const obj = {
          id: 'fill_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          type: 'fill',
          name: '地形四边形',
          x: Math.round(pos.x - w / 2),
          y: Math.round(pos.y - h / 2),
          width: w,
          height: h,
          fillMode: 'color',
          fillColor: '#3a5a2a',
          opacity: 1,
          edgeFade: 0
        };
        if (fillLayer) {
          fillLayer.locked = false;
          fillLayer.objects.push(obj);
          editor.activeLayerIndex = editor.sceneData.layers.indexOf(fillLayer);
        } else {
          editor.ui.addObject(obj);
        }
        editor.selectedObjects = [obj];
        editor.history.saveHistory();
        editor.ui.updateObjectCount();
        editor.ui.updateObjectProperties();
        editor.render();
      } else if (id === 'terrain-polygon') {
        // 地形多边形：放入背景填充层（正五边形，顶点可拖拽）
        const fillLayer = editor.sceneData.layers.find(l => l.id === 'layer_fill');
        const r = 180;
        const cx = pos.x, cy = pos.y;
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
          pts.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
        }
        const obj = {
          id: 'shape_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          type: 'shape',
          shapeType: 'polygon',
          name: '地形多边形',
          points: pts,
          fillMode: 'color',
          fill: '#3a5a2a',
          opacity: 1,
          edgeFade: 0,
          stroke: '#5a8a4a',
          strokeWidth: 0,
          collide: false
        };
        if (fillLayer) {
          fillLayer.locked = false;
          fillLayer.objects.push(obj);
          editor.activeLayerIndex = editor.sceneData.layers.indexOf(fillLayer);
        } else {
          editor.ui.addObject(obj);
        }
        editor.selectedObjects = [obj];
        editor.history.saveHistory();
        editor.ui.updateObjectCount();
        editor.ui.updateObjectProperties();
        editor.render();
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
        const assetName = editor.sceneData.imageAssets?.[id]?.name;
        editor.ui.addObject({
          type: 'image', imageId: id,
          name: assetName || id,
          semanticRole: 'sceneImage',
          visualDescription: assetName ? `${assetName}；请按场景用途补充地貌、建筑或道具说明。` : '请补充该图片在场景中的具体用途。',
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
      const definition = (editor.getProjectTriggers?.() || [])
        .find(trigger => ['approach', 'interact', 'enter', 'leave'].includes(trigger?.when?.type)) || null;
      obj = {
        id: 'trigger_' + rnd, type: 'trigger', name: definition?.id || '触发器',
        triggerId: definition?.id || '',
        // 双写 flowGroupId+sceneEventId 同值，保证旧代码双读
        flowGroupId: (definition?.flowGroupId || definition?.sceneEventId || ''),
        sceneEventId: (definition?.flowGroupId || definition?.sceneEventId || ''),
        x: Math.round(x - w / 2), y: Math.round(y - h / 2), width: w, height: h,
        event: definition?.when?.type || 'interact',
        targetMode: 'id',
        target: '',
        radius: 60,
        prompt: ''
      };
    } else if (kind === 'playerSpawn') {
      obj = {
        id: 'spawn_' + rnd, type: 'spawn', name: '玩家出生点',
        spawnId: 'spawn_player_' + Math.floor(Math.random() * 10000),
        ref: 'player',
        x: Math.round(x), y: Math.round(y),
        enemyRef: '', count: 1, wave: 0, radius: 0
      };
    } else if (kind === 'campfire') {
      obj = {
        id: 'spawn_' + rnd, type: 'spawn', name: '火堆',
        spawnId: 'spawn_campfire_' + Math.floor(Math.random() * 10000),
        ref: 'campfire',
        x: Math.round(x), y: Math.round(y),
        enemyRef: '', count: 1, wave: 0, radius: 0
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
    } else if (kind === 'buffRect') {
      // Buff 四边形
      const w = 200, h = 140;
      obj = {
        id: 'buffZone_' + rnd, type: 'buffZone', name: 'Buff四边形',
        shapeType: 'rect',
        x: Math.round(x - w / 2), y: Math.round(y - h / 2), width: w, height: h,
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
    } else if (kind === 'buffEllipse') {
      // Buff 椭圆形
      const rx = 120, ry = 80;
      obj = {
        id: 'buffZone_' + rnd, type: 'buffZone', name: 'Buff椭圆形',
        shapeType: 'ellipse',
        x: Math.round(x - rx), y: Math.round(y - ry), width: rx * 2, height: ry * 2,
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
      const semanticPart = subPath.trim()
        .replace(/\.[^.]+$/, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'asset';
      const requestedId = prompt(
        '请输入稳定 imageId（后续替换图片文件时保持不变）：',
        `img.${semanticPart}`
      );
      if (!requestedId || !requestedId.trim()) { reject(new Error('取消')); return; }
      const id = requestedId.trim();
      if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(id)) {
        editor.ui.showToast?.('imageId 只能包含字母、数字、点、下划线和短横线，且必须以字母开头', 'error');
        reject(new Error('imageId 格式无效'));
        return;
      }
      if (editor.sceneData.imageAssets?.[id]) {
        editor.ui.showToast?.(`imageId 已存在: ${id}`, 'error');
        reject(new Error('imageId 重复'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        editor.loadedImages.set(id, img);
        
        if (!editor.sceneData.imageAssets) editor.sceneData.imageAssets = {};
        editor.sceneData.imageAssets[id] = { src: relativeSrc, name: file.name };
        // 登记到全局图片库缓存，使其成为库资源（切换场景/保存清理时不丢失）
        addGlobalImage(id, { src: relativeSrc, name: file.name });

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
        this._bindImageItemClick(item, id);
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
   * 审计当前游戏的 Manifest、磁盘图片、canonical 场景引用、音频文件和 3D fallback。
   * 只生成报告，不自动登记或修改资源状态。
   */
  async runAssetAudit() {
    const gameId = this._contentGameId();
    const gameRoot = `example/${gameId}`;
    const button = document.getElementById('editor-audit-assets');
    if (button) button.disabled = true;
    this.editor.ui.showToast?.('正在扫描磁盘资产与 canonical 场景引用…');

    try {
      const canonicalSceneFile = file => /\/S\d{2}(?:-C\d{2})?\.json$/i.test(file.replace(/\\/g, '/'));
      const [manifest, imageFiles, sceneFiles, audioConfig, audioFiles] = await Promise.all([
        this._fetchJson(`/${gameRoot}/assets/manifests/assets.json`),
        this._listFilesRecursive(`${gameRoot}/assets/images`, file => /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(file)),
        this._listFilesRecursive(`${gameRoot}/assets/scenes`, canonicalSceneFile),
        this._fetchJson(`/${gameRoot}/data/AudioConfig.json`),
        this._listFilesRecursive(`${gameRoot}/assets/audio`, file => /\.(mp3|ogg|wav|m4a|aac|flac|webm)$/i.test(file))
      ]);
      const scenes = await Promise.all(sceneFiles.map(file => this._fetchJson(`/${file}`)));
      const report = this._buildAssetAuditReport({
        gameRoot,
        manifest,
        imageFiles,
        scenes,
        audioConfig,
        audioFiles
      });
      this._showAssetAuditModal(report);
      this.editor.ui.showToast?.(report.blockingCount
        ? `资产审计完成：${report.blockingCount} 个阻断项`
        : '资产审计完成：未发现阻断项', report.blockingCount ? 'error' : 'success');
    } catch (error) {
      console.error('[AssetAudit] 审计失败:', error);
      this.editor.ui.showToast?.(`资产审计失败：${error.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async _fetchJson(url) {
    const safeUrl = url.split('/').map((part, index) => index === 0 ? part : encodeURIComponent(part)).join('/');
    const response = await fetch(safeUrl);
    if (!response.ok) throw new Error(`加载 ${url} 失败: HTTP ${response.status}`);
    return response.json();
  }

  async _listFilesRecursive(root, accept) {
    const result = [];
    const visit = async dir => {
      const response = await fetch(`/api/list-files?path=${encodeURIComponent(dir)}`);
      if (!response.ok) throw new Error(`列出 ${dir} 失败: HTTP ${response.status}`);
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.files)) throw new Error(data.error || `列出 ${dir} 失败`);
      await Promise.all(data.files.map(async entry => {
        const path = `${dir}/${entry.name}`.replace(/\\/g, '/');
        if (entry.isDir) await visit(path);
        else if (!accept || accept(path)) result.push(path);
      }));
    };
    await visit(root);
    return result.sort();
  }

  _buildAssetAuditReport({ gameRoot, manifest, imageFiles, scenes, audioConfig = {}, audioFiles = [] }) {
    const entries = Array.isArray(manifest?.assets) ? manifest.assets : [];
    const diskPaths = new Set(imageFiles.map(path => path.slice(gameRoot.length + 1)));
    const diskAudioPaths = new Set(audioFiles.map(path => path.slice(gameRoot.length + 1)));
    const manifestPaths = new Set();
    const assetIds = new Set();
    const imageIds = new Set();
    const duplicateIds = [];
    const invalidEntries = [];
    const placeholders = [];

    for (const entry of entries) {
      if (!entry?.assetId) invalidEntries.push('Manifest 条目缺少 assetId');
      else if (assetIds.has(entry.assetId)) duplicateIds.push(`assetId: ${entry.assetId}`);
      else assetIds.add(entry.assetId);
      if (entry?.imageId) {
        if (imageIds.has(entry.imageId)) duplicateIds.push(`imageId: ${entry.imageId}`);
        imageIds.add(entry.imageId);
      } else if (entry?.runtime2D?.mode === 'image') {
        invalidEntries.push(`${entry?.assetId || '<unknown>'}: 非 atlas/slice 图片缺少稳定 imageId`);
      }
      const sourcePaths = [entry?.sourceFile, entry?.runtime2D?.path]
        .map(path => this._normalizeGameAssetPath(path))
        .filter(Boolean);
      if (sourcePaths.length > 0) {
        for (const path of sourcePaths) manifestPaths.add(path);
      } else {
        invalidEntries.push(`${entry?.assetId || '<unknown>'}: 缺少 sourceFile/runtime2D.path`);
      }
      if (!(Number(entry?.bounds?.width) > 0) || !(Number(entry?.bounds?.height) > 0)) {
        invalidEntries.push(`${entry?.assetId || '<unknown>'}: bounds.width/height 必须大于 0`);
      }
      if (![entry?.pivot?.x, entry?.pivot?.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
        invalidEntries.push(`${entry?.assetId || '<unknown>'}: pivot.x/y 必须位于 [0,1]`);
      }
      if (entry?.runtime3D?.mode === 'model' && !entry?.runtime3D?.path) {
        invalidEntries.push(`${entry?.assetId || '<unknown>'}: model 模式缺少 path`);
      } else if (entry?.runtime3D?.mode !== 'model' && entry?.runtime3D?.sourceAssetId !== entry?.assetId) {
        invalidEntries.push(`${entry?.assetId || '<unknown>'}: 3D fallback 未引用自身稳定 assetId`);
      }
      if (entry?.status === 'placeholder') placeholders.push(entry?.assetId || '<unknown>');
    }

    const missingFiles = [...manifestPaths].filter(path => !diskPaths.has(path));
    const unregisteredFiles = [...diskPaths].filter(path => !manifestPaths.has(path));
    const missingReferences = [];
    const invalidSlices = [];
    const unusedSceneImages = [];
    for (const scene of scenes.filter(Boolean)) {
      const sceneId = scene.id || scene.name || '<unknown-scene>';
      const sceneImages = scene.imageAssets || {};
      const atlases = new Map((scene.atlases || []).map(atlas => [atlas.id, atlas]));
      const usedImageIds = new Set();
      for (const layer of scene.layers || []) {
        for (const object of layer?.objects || []) {
          if (object?.type === 'image') {
            if (!object.imageId || !sceneImages[object.imageId]) {
              missingReferences.push(`${sceneId}/${object?.id || '<object>'}: 图片对象缺少有效 imageId`);
            } else {
              usedImageIds.add(object.imageId);
            }
          }
          if (object?.sliceKey) {
            const atlas = atlases.get(object.atlasId);
            if (!atlas || !atlas.slices?.[object.sliceKey]) {
              invalidSlices.push(`${sceneId}/${object?.id || '<object>'}: ${object.atlasId || '<atlas>'}/${object.sliceKey}`);
            }
          }
        }
      }
      for (const [imageId, image] of Object.entries(sceneImages)) {
        if (!usedImageIds.has(imageId)) {
          unusedSceneImages.push(`${sceneId}: imageAssets.${imageId}`);
          continue;
        }
        if (!imageIds.has(imageId) && !assetIds.has(imageId)) missingReferences.push(`${sceneId}: imageId ${imageId} 未登记 Manifest`);
        const path = this._normalizeGameAssetPath(image?.src);
        if (path && !diskPaths.has(path)) missingReferences.push(`${sceneId}: ${imageId} 指向缺失文件 ${path}`);
      }
      for (const atlas of atlases.values()) {
        if (!assetIds.has(atlas.id)) missingReferences.push(`${sceneId}: atlasId ${atlas.id} 未登记 Manifest`);
        const path = this._normalizeGameAssetPath(atlas.path);
        if (path && !diskPaths.has(path)) missingReferences.push(`${sceneId}: atlasId ${atlas.id} 指向缺失文件 ${path}`);
      }
    }

    const audioCues = [];
    const missingAudioFiles = [];
    for (const group of ['music', 'sfx']) {
      const cues = audioConfig?.[group];
      if (!cues || typeof cues !== 'object' || Array.isArray(cues)) continue;
      for (const [cueId, cue] of Object.entries(cues)) {
        audioCues.push(`${group}.${cueId}`);
        const path = this._normalizeGameAssetPath(cue?.file);
        if (!path) missingAudioFiles.push(`${group}.${cueId}: 缺少文件路径`);
        else if (!diskAudioPaths.has(path)) missingAudioFiles.push(`${group}.${cueId}: 指向缺失文件 ${path}`);
      }
    }
    const missingAudioCoverage = audioCues.length === 0
      ? ['未登记任何正式 music/sfx cue；Release Candidate 音频内容尚未接入']
      : [];

    const blockingCount = duplicateIds.length + invalidEntries.length + missingFiles.length
      + missingReferences.length + invalidSlices.length + placeholders.length
      + missingAudioFiles.length + missingAudioCoverage.length;
    return {
      summary: {
        diskImages: diskPaths.size,
        diskAudio: diskAudioPaths.size,
        manifestEntries: entries.length,
        scenes: scenes.length,
        audioCues: audioCues.length,
        unregisteredFiles: unregisteredFiles.length,
        unusedSceneImages: unusedSceneImages.length,
        placeholders: placeholders.length
      },
      blockingCount,
      duplicateIds,
      invalidEntries,
      missingFiles,
      missingReferences,
      invalidSlices,
      missingAudioFiles,
      missingAudioCoverage,
      unregisteredFiles,
      unusedSceneImages,
      placeholders
    };
  }

  _normalizeGameAssetPath(path) {
    const value = String(path || '').replace(/\\/g, '/');
    const assetsIndex = value.indexOf('assets/');
    return assetsIndex >= 0 ? value.slice(assetsIndex) : value.replace(/^\.\//, '');
  }

  _showAssetAuditModal(report) {
    const escape = value => String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const section = (title, items, blocking = false) => {
      const values = items || [];
      return `<details ${blocking && values.length ? 'open' : ''} style="margin:8px 0;">
        <summary style="cursor:pointer;color:${blocking && values.length ? '#ff8a80' : '#d7c59a'};">${escape(title)} (${values.length})</summary>
        <div style="max-height:180px;overflow:auto;margin:6px 0 0 14px;font:12px/1.5 monospace;white-space:pre-wrap;">${values.length ? values.map(escape).join('\n') : '无'}</div>
      </details>`;
    };
    document.getElementById('asset-audit-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'asset-audit-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;';
    const summary = report.summary;
    modal.innerHTML = `<div style="width:min(820px,92vw);max-height:88vh;overflow:auto;background:#20242b;color:#eee;border:1px solid #596273;border-radius:8px;padding:18px;box-shadow:0 12px 40px #000;">
      <h3 style="margin:0 0 8px;">资产审计报告</h3>
      <div style="font-size:13px;color:#b9c2d0;">磁盘图片 ${summary.diskImages} · Manifest ${summary.manifestEntries} · canonical 场景 ${summary.scenes} · 音频 ${summary.audioCues}/${summary.diskAudio} · 阻断项 ${report.blockingCount}</div>
      ${section('重复稳定 ID', report.duplicateIds, true)}
      ${section('Manifest 结构 / 3D fallback', report.invalidEntries, true)}
      ${section('Manifest 指向缺失文件', report.missingFiles, true)}
      ${section('场景缺失引用', report.missingReferences, true)}
      ${section('无效 slice 引用', report.invalidSlices, true)}
      ${section('音频 cue 指向缺失文件', report.missingAudioFiles, true)}
      ${section('音频覆盖（Release Candidate 阻断）', report.missingAudioCoverage, true)}
      ${section('未登记图片（不得直接作为正式资产）', report.unregisteredFiles)}
      ${section('场景未使用 imageAssets（可保存清理）', report.unusedSceneImages)}
      ${section('占位资产（Release Candidate 阻断）', report.placeholders, true)}
      <div style="display:flex;justify-content:flex-end;margin-top:14px;"><button id="asset-audit-close" style="padding:7px 18px;">关闭</button></div>
    </div>`;
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.id === 'asset-audit-close') modal.remove();
    });
    document.body.appendChild(modal);
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
      <div class="asset-item placeholder" draggable="true" data-type="terrain-rect">
        <div class="asset-preview" style="width:36px;height:36px;background:#3a5a2a;border:1px solid #5a8a4a;border-radius:0;"></div>
        <span>地形四边形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="terrain-polygon">
        <div class="asset-preview" style="width:34px;height:30px;background:#3a5a2a;border:1px solid #5a8a4a;clip-path:polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%);"></div>
        <span>地形多边形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="polygon">
        <div class="asset-preview" style="width:34px;height:30px;background:#3a5a2a;border:1px solid #5a8a4a;clip-path:polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%);"></div>
        <span>多边形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="effectZone">
        <div class="asset-preview" style="width:34px;height:30px;background:rgba(255,120,30,0.35);border:2px dashed #ff8833;clip-path:polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%);"></div>
        <span>特效区域</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="fill">
        <div class="asset-preview fill" style="background:linear-gradient(135deg,#333,#666);border:1px dashed #888;"></div>
        <span>背景填充</span>
      </div>
    `;

    // 渲染已有的图片资源（来自 imageAssets）
    const editor = this.editor;
    const assets = editor.sceneData.imageAssets;
    if (assets) {
      for (const [id, data] of Object.entries(assets)) {
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.draggable = true;
        item.dataset.id = id;
        const displayName = (data.name || id).substring(0, 10);
        item.innerHTML = `
          <div class="asset-preview"><img src="${data.src}" alt="${displayName}" style="width:100%;height:100%;object-fit:contain;"></div>
          <span>${displayName}</span>
        `;
        list.appendChild(item);
        this._bindImageItemClick(item, id);
      }
    }
  }

  /**
   * 绑定图片资源项的点击事件 → 选中时下方面板显示图片属性
   * @private
   */
  _bindImageItemClick(item, imageId) {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      // 高亮选中
      const list = document.getElementById('editor-asset-list');
      if (list) list.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      this.editor.selectedSlice = null;
      this.editor.selectedAtlasId = null;
      this._showImageAssetProperties(imageId);
    });
  }

  /**
   * 在下方面板显示选中图片资源的属性 + 编辑/删除按钮
   * @private
   */
  _showImageAssetProperties(imageId) {
    const editor = this.editor;
    const asset = editor.sceneData.imageAssets?.[imageId];
    if (!asset) return;

    const title = document.getElementById('slice-panel-title');
    const propsPanel = document.getElementById('slice-properties');
    if (title) title.textContent = '选中图片';
    if (!propsPanel) return;

    const img = editor.loadedImages.get(imageId);
    const dim = img ? `${img.naturalWidth}×${img.naturalHeight}` : '未加载';

    propsPanel.innerHTML = `
      <div class="slice-prop-row"><label>ID:</label><input value="${imageId}" disabled style="color:#FFD700;" title="稳定 imageId，替换文件时保持不变"></div>
      <div class="slice-prop-row"><label>名称:</label><input type="text" id="img-asset-name" value="${asset.name || ''}"></div>
      <div class="slice-prop-row"><label>替换文件:</label><input type="text" id="img-asset-path" value="${asset.src || ''}" title="修改文件路径但保留当前 imageId 和全部场景引用"></div>
      <div class="slice-prop-row"><label>尺寸:</label><input value="${dim}" disabled style="color:#88ccff;"></div>
      <div class="slice-prop-row" style="margin-top:8px;">
        <button id="img-asset-edit-btn" style="flex:1;padding:5px;cursor:pointer;">编辑</button>
        <button id="img-asset-delete-btn" style="flex:1;padding:5px;cursor:pointer;color:#f88;">删除</button>
      </div>
    `;

    // 名称修改
    document.getElementById('img-asset-name').addEventListener('change', (e) => {
      asset.name = e.target.value;
      addGlobalImage(imageId, { ...asset });
    });
    // 替换文件：稳定 imageId 与所有对象引用保持不变。
    document.getElementById('img-asset-path').addEventListener('change', (e) => {
      asset.src = e.target.value.trim();
      addGlobalImage(imageId, { ...asset });
      editor.loadedImages.delete(imageId);
      this.loadImageAssets();
      this._updateSpriteList();
    });
    // 编辑按钮：弹窗
    document.getElementById('img-asset-edit-btn').addEventListener('click', () => {
      this._openImageAssetEditorModal(imageId);
    });
    // 删除按钮
    document.getElementById('img-asset-delete-btn').addEventListener('click', () => {
      if (!confirm(`确定删除图片资源「${asset.name || imageId}」吗？`)) return;
      delete editor.sceneData.imageAssets[imageId];
      editor.loadedImages.delete(imageId);
      // 同时删除场景中引用该图片的对象
      for (const layer of editor.sceneData.layers) {
        layer.objects = layer.objects.filter(obj => !(obj.type === 'image' && obj.imageId === imageId));
      }
      this._updateSpriteList();
      editor.render();
      editor.ui.updateObjectCount();
      // 重置面板
      if (title) title.textContent = '说明';
      propsPanel.innerHTML = '<div class="no-selection">用于基础的几何图形、背景图填充、碰撞多边形等。</div>';
      editor.ui.showToast?.('图片资源已删除');
    });
  }

  /**
   * 打开图片资源编辑弹窗（在资源库中选中时）
   * @private
   */
  _openImageAssetEditorModal(imageId) {
    const editor = this.editor;
    const asset = editor.sceneData.imageAssets?.[imageId];
    if (!asset) return;
    const img = editor.loadedImages.get(imageId);

    const overlay = document.createElement('div');
    overlay.id = 'slice-editor-overlay';
    overlay.innerHTML = `
      <div id="slice-editor-modal">
        <div class="slice-modal-header">
          <span>图片编辑 - ${asset.name || imageId}</span>
          <button id="slice-modal-close" title="关闭">✕</button>
        </div>
        <div class="slice-modal-body">
          <div class="slice-modal-canvas-wrap">
            <canvas id="img-asset-modal-canvas"></canvas>
            ${!img ? '<div style="padding:20px;color:#f88;font-size:12px;">图片未加载，请设置正确路径</div>' : ''}
          </div>
          <div class="slice-modal-params">
            <div class="smp-row"><label>名称:</label><input type="text" id="iam-name" value="${asset.name || ''}"></div>
            <div class="smp-row"><label>路径:</label><input type="text" id="iam-path" value="${asset.src || ''}" style="min-width:180px;"></div>
            <div class="smp-row"><label>宽度:</label><input type="number" id="iam-width" value="${img ? img.naturalWidth : 0}" disabled style="color:#88ccff;"></div>
            <div class="smp-row"><label>高度:</label><input type="number" id="iam-height" value="${img ? img.naturalHeight : 0}" disabled style="color:#88ccff;"></div>
            <div class="smp-row" style="margin-top:6px;">
              <button id="iam-reload" style="flex:1;">刷新图片</button>
            </div>
            <div class="smp-row" style="margin-top:12px;">
              <button id="iam-confirm" style="flex:1;">确定</button>
              <button id="iam-cancel" style="flex:1;">取消</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const canvas = document.getElementById('img-asset-modal-canvas');
    const drawImg = () => {
      const curImg = editor.loadedImages.get(imageId);
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
    document.getElementById('iam-cancel').addEventListener('click', close);

    // 刷新图片
    document.getElementById('iam-reload').addEventListener('click', () => {
      const newPath = document.getElementById('iam-path').value.trim();
      if (!newPath) return;
      const newImg = new Image();
      newImg.onload = () => {
        editor.loadedImages.set(imageId, newImg);
        document.getElementById('iam-width').value = newImg.naturalWidth;
        document.getElementById('iam-height').value = newImg.naturalHeight;
        drawImg();
      };
      newImg.onerror = () => editor.ui.showToast?.('图片加载失败: ' + newPath, 'error');
      newImg.src = newPath;
    });

    // 确定
    document.getElementById('iam-confirm').addEventListener('click', () => {
      asset.name = document.getElementById('iam-name').value.trim() || asset.name;
      const newPath = document.getElementById('iam-path').value.trim();
      if (newPath && newPath !== asset.src) {
        asset.src = newPath;
        editor.loadedImages.delete(imageId);
        this.loadImageAssets();
      }
      addGlobalImage(imageId, { ...asset });
      this._updateSpriteList();
      this._showImageAssetProperties(imageId);
      editor.render();
      close();
    });
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
      <div class="asset-item placeholder" draggable="true" data-type="playerSpawn">
        <div class="asset-preview" style="width:30px;height:30px;border-radius:50%;background:rgba(80,180,255,0.3);border:2px solid #50b4ff;display:flex;align-items:center;justify-content:center;font-size:14px;">🧑</div>
        <span>玩家出生点</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="campfire">
        <div class="asset-preview" style="width:30px;height:30px;border-radius:50%;background:rgba(255,160,50,0.3);border:2px solid #ffa030;display:flex;align-items:center;justify-content:center;font-size:14px;">🔥</div>
        <span>火堆</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="buffZone">
        <div class="asset-preview" style="width:30px;height:30px;background:rgba(100,0,200,0.2);border:2px dashed #8040c0;clip-path:polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%);"></div>
        <span>Buff多边形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="buffRect">
        <div class="asset-preview" style="width:38px;height:26px;background:rgba(100,0,200,0.2);border:2px dashed #8040c0;"></div>
        <span>Buff四边形</span>
      </div>
      <div class="asset-item placeholder" draggable="true" data-type="buffEllipse">
        <div class="asset-preview" style="width:38px;height:26px;border-radius:50%;background:rgba(100,0,200,0.2);border:2px dashed #8040c0;"></div>
        <span>Buff椭圆形</span>
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
      { key: 'resourceNodes', label: '资源节点', kind: 'resourceNode' },
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
      const data = await replaceCanonicalFile(this._contentProjectPath, JSON.stringify(this._contentProject, null, 2));
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

      item.innerHTML = `
        <div class="atlas-header" data-atlas="${atlas.id}">
          <span>${atlas.name}</span>
          <span style="font-size:10px;color:#666;">${atlas.width}×${atlas.height} · ${sliceCount}片</span>
        </div>
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
    editor.selectedSlice = null;
    this._updateAtlasList();
    this._updateSlicePreviews();
    this._showAtlasProperties();
  }

  /**
   * 在左侧"选中切片/图集"面板中展示选中图集的属性
   * @private
   */
  _showAtlasProperties() {
    const editor = this.editor;
    const propsPanel = document.getElementById('slice-properties');
    const title = document.getElementById('slice-panel-title');
    if (!propsPanel) return;

    if (!editor.selectedAtlasId) {
      if (title) title.textContent = '选中切片';
      propsPanel.innerHTML = '<div class="no-selection">未选中切片</div>';
      return;
    }

    const atlas = editor.sceneData.atlases?.find(a => a.id === editor.selectedAtlasId);
    if (!atlas) return;

    if (title) title.textContent = '选中图集';
    const sliceCount = atlas.slices ? Object.keys(atlas.slices).length : 0;

    propsPanel.innerHTML = `
      <div class="slice-prop-row"><label>ID:</label><input value="${atlas.id}" disabled style="color:#FFD700;"></div>
      <div class="slice-prop-row"><label>名称:</label><input type="text" id="atlas-prop-name" value="${atlas.name || ''}"></div>
      <div class="slice-prop-row"><label>图片路径:</label><input type="text" id="atlas-prop-path" value="${atlas.path || ''}" title="图集图片相对路径或 URL"></div>
      <div class="slice-prop-row"><label>宽度:</label><input type="number" id="atlas-prop-width" value="${atlas.width || 0}"></div>
      <div class="slice-prop-row"><label>高度:</label><input type="number" id="atlas-prop-height" value="${atlas.height || 0}"></div>
      <div class="slice-prop-row"><label>切片数:</label><input value="${sliceCount}" disabled style="color:#88ccff;"></div>
      <div class="slice-prop-row" style="margin-top:8px;">
        <button id="atlas-edit-btn" style="flex:1;padding:5px;cursor:pointer;">编辑</button>
        <button id="atlas-new-slice-btn" style="flex:1;padding:5px;cursor:pointer;">+ 新建切片</button>
      </div>
      <div class="slice-prop-row">
        <button id="atlas-save-btn" style="width:100%;padding:5px;cursor:pointer;">💾 保存图集</button>
      </div>
    `;

    // 绑定属性修改
    const nameInput = document.getElementById('atlas-prop-name');
    const pathInput = document.getElementById('atlas-prop-path');
    const widthInput = document.getElementById('atlas-prop-width');
    const heightInput = document.getElementById('atlas-prop-height');

    nameInput.addEventListener('change', () => { atlas.name = nameInput.value; this._updateAtlasList(); });
    pathInput.addEventListener('change', () => {
      atlas.path = pathInput.value;
      editor.loadedImages.delete(atlas.id);
      this.loadAtlasImages();
      this._updateAtlasList();
    });
    widthInput.addEventListener('change', () => { atlas.width = parseInt(widthInput.value) || 0; });
    heightInput.addEventListener('change', () => { atlas.height = parseInt(heightInput.value) || 0; });

    // 编辑按钮：弹窗展示图集图片，可更换路径
    document.getElementById('atlas-edit-btn').addEventListener('click', () => {
      this._openAtlasEditorModal(atlas);
    });

    // 新建切片按钮
    document.getElementById('atlas-new-slice-btn').addEventListener('click', () => {
      this._openNewSliceModal(atlas);
    });

    // 保存按钮
    document.getElementById('atlas-save-btn').addEventListener('click', () => {
      this.saveAtlases();
    });
  }

  /**
   * 打开图集编辑弹窗：展示图集图片预览，可更换图片路径
   * @private
   */
  _openAtlasEditorModal(atlas) {
    const editor = this.editor;
    const img = editor.loadedImages.get(atlas.id);

    const overlay = document.createElement('div');
    overlay.id = 'slice-editor-overlay';
    overlay.innerHTML = `
      <div id="slice-editor-modal">
        <div class="slice-modal-header">
          <span>图集编辑 - ${atlas.name || atlas.id}</span>
          <button id="slice-modal-close" title="关闭">✕</button>
        </div>
        <div class="slice-modal-body">
          <div class="slice-modal-canvas-wrap">
            <canvas id="atlas-modal-canvas"></canvas>
            ${!img ? '<div style="padding:20px;color:#f88;font-size:12px;">图片未加载，请设置正确路径</div>' : ''}
          </div>
          <div class="slice-modal-params">
            <div class="smp-row"><label>名称:</label><input type="text" id="amp-name" value="${atlas.name || ''}"></div>
            <div class="smp-row"><label>图片路径:</label><input type="text" id="amp-path" value="${atlas.path || ''}" style="min-width:180px;"></div>
            <div class="smp-row"><label>宽度:</label><input type="number" id="amp-width" value="${atlas.width || 0}"></div>
            <div class="smp-row"><label>高度:</label><input type="number" id="amp-height" value="${atlas.height || 0}"></div>
            <div class="smp-info">切片数: ${atlas.slices ? Object.keys(atlas.slices).length : 0}</div>
            <div class="smp-row" style="margin-top:6px;">
              <button id="amp-reload" style="flex:1;">刷新图片</button>
            </div>
            <div class="smp-row" style="margin-top:12px;">
              <button id="amp-confirm" style="flex:1;">确定</button>
              <button id="amp-cancel" style="flex:1;">取消</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 绘制图集预览
    const canvas = document.getElementById('atlas-modal-canvas');
    const drawAtlas = () => {
      const curImg = editor.loadedImages.get(atlas.id);
      if (!curImg || !canvas) return;
      const maxCW = Math.min(700, window.innerWidth - 320);
      const maxCH = Math.min(500, window.innerHeight - 160);
      const scale = Math.min(maxCW / curImg.naturalWidth, maxCH / curImg.naturalHeight, 2);
      canvas.width = Math.round(curImg.naturalWidth * scale);
      canvas.height = Math.round(curImg.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(curImg, 0, 0, canvas.width, canvas.height);
      // 画所有切片线框
      if (atlas.slices) {
        ctx.strokeStyle = 'rgba(76,175,80,0.7)';
        ctx.lineWidth = 1;
        for (const slice of Object.values(atlas.slices)) {
          ctx.strokeRect(slice.sx * scale, slice.sy * scale, slice.sw * scale, slice.sh * scale);
        }
      }
    };
    drawAtlas();

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('slice-modal-close').addEventListener('click', close);
    document.getElementById('amp-cancel').addEventListener('click', close);

    // 刷新图片
    document.getElementById('amp-reload').addEventListener('click', () => {
      const newPath = document.getElementById('amp-path').value.trim();
      if (!newPath) return;
      const newImg = new Image();
      newImg.onload = () => {
        editor.loadedImages.set(atlas.id, newImg);
        document.getElementById('amp-width').value = newImg.naturalWidth;
        document.getElementById('amp-height').value = newImg.naturalHeight;
        drawAtlas();
      };
      newImg.onerror = () => editor.ui.showToast?.('图片加载失败: ' + newPath, 'error');
      newImg.src = newPath;
    });

    // 确定
    document.getElementById('amp-confirm').addEventListener('click', () => {
      atlas.name = document.getElementById('amp-name').value.trim() || atlas.name;
      const newPath = document.getElementById('amp-path').value.trim();
      if (newPath && newPath !== atlas.path) {
        atlas.path = newPath;
        editor.loadedImages.delete(atlas.id);
        this.loadAtlasImages();
      }
      atlas.width = parseInt(document.getElementById('amp-width').value) || atlas.width;
      atlas.height = parseInt(document.getElementById('amp-height').value) || atlas.height;
      this._updateAtlasList();
      this._showAtlasProperties();
      editor.render();
      close();
    });
  }

  /**
   * 打开新建切片弹窗（与编辑切片弹窗类似，但初始选框为默认位置）
   * @private
   */
  _openNewSliceModal(atlas) {
    const editor = this.editor;
    const img = editor.loadedImages.get(atlas.id);
    if (!img) {
      editor.ui.showToast?.('图集图片未加载，请先设置路径', 'error');
      return;
    }

    // 默认切片参数
    const state = { sx: 0, sy: 0, sw: 64, sh: 64 };
    let sliceName = '新切片';
    let sliceKey = 'slice_' + Date.now().toString(36);

    const overlay = document.createElement('div');
    overlay.id = 'slice-editor-overlay';
    overlay.innerHTML = `
      <div id="slice-editor-modal">
        <div class="slice-modal-header">
          <span>新建切片 - 图集: ${atlas.name}</span>
          <button id="slice-modal-close" title="关闭">✕</button>
        </div>
        <div class="slice-modal-body">
          <div class="slice-modal-canvas-wrap">
            <canvas id="slice-modal-canvas"></canvas>
          </div>
          <div class="slice-modal-params">
            <div class="smp-row"><label>Key:</label><input type="text" id="smp-key" value="${sliceKey}"></div>
            <div class="smp-row"><label>名称:</label><input type="text" id="smp-name" value="${sliceName}"></div>
            <div class="smp-row"><label>X:</label><input type="number" id="smp-sx" value="${state.sx}"></div>
            <div class="smp-row"><label>Y:</label><input type="number" id="smp-sy" value="${state.sy}"></div>
            <div class="smp-row"><label>宽:</label><input type="number" id="smp-sw" value="${state.sw}"></div>
            <div class="smp-row"><label>高:</label><input type="number" id="smp-sh" value="${state.sh}"></div>
            <div class="smp-row"><label>碰撞:</label><input type="checkbox" id="smp-collide"></div>
            <div class="smp-row"><label>碰撞半径:</label><input type="number" id="smp-radius" value="16"></div>
            <div class="smp-info">拖动选框选择切片区域</div>
            <div class="smp-row" style="margin-top:12px;">
              <button id="smp-confirm" style="flex:1;">创建</button>
              <button id="smp-cancel" style="flex:1;">取消</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const canvas = document.getElementById('slice-modal-canvas');
    const ctx = canvas.getContext('2d');

    const maxCW = Math.min(800, window.innerWidth - 320);
    const maxCH = Math.min(600, window.innerHeight - 160);
    const scale = Math.min(maxCW / img.naturalWidth, maxCH / img.naturalHeight, 2);
    const cw = Math.round(img.naturalWidth * scale);
    const ch = Math.round(img.naturalHeight * scale);
    canvas.width = cw;
    canvas.height = ch;

    let dragging = null;
    let dragStart = {};

    const draw = () => {
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, cw, ch);
      const rx = state.sx * scale, ry = state.sy * scale;
      const rw = state.sw * scale, rh = state.sh * scale;
      ctx.drawImage(img, state.sx, state.sy, state.sw, state.sh, rx, ry, rw, rh);
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(rx + rw - 6, ry + rh - 6, 8, 8);
    };
    draw();

    const syncInputs = () => {
      document.getElementById('smp-sx').value = Math.round(state.sx);
      document.getElementById('smp-sy').value = Math.round(state.sy);
      document.getElementById('smp-sw').value = Math.round(state.sw);
      document.getElementById('smp-sh').value = Math.round(state.sh);
    };

    const getCanvasPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvas.addEventListener('mousedown', (e) => {
      const pos = getCanvasPos(e);
      const rx = state.sx * scale, ry = state.sy * scale;
      const rw = state.sw * scale, rh = state.sh * scale;
      if (Math.abs(pos.x - (rx + rw)) < 10 && Math.abs(pos.y - (ry + rh)) < 10) {
        dragging = 'resize-br';
      } else if (pos.x >= rx && pos.x <= rx + rw && pos.y >= ry && pos.y <= ry + rh) {
        dragging = 'move';
      } else {
        return;
      }
      dragStart = { mx: pos.x, my: pos.y, sx: state.sx, sy: state.sy, sw: state.sw, sh: state.sh };
      e.preventDefault();
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!dragging) {
        const pos = getCanvasPos(e);
        const rx = state.sx * scale, ry = state.sy * scale;
        const rw = state.sw * scale, rh = state.sh * scale;
        if (Math.abs(pos.x - (rx + rw)) < 10 && Math.abs(pos.y - (ry + rh)) < 10) {
          canvas.style.cursor = 'nwse-resize';
        } else if (pos.x >= rx && pos.x <= rx + rw && pos.y >= ry && pos.y <= ry + rh) {
          canvas.style.cursor = 'move';
        } else {
          canvas.style.cursor = 'crosshair';
        }
        return;
      }
      const pos = getCanvasPos(e);
      const dx = (pos.x - dragStart.mx) / scale;
      const dy = (pos.y - dragStart.my) / scale;
      if (dragging === 'move') {
        state.sx = Math.max(0, Math.min(img.naturalWidth - state.sw, Math.round(dragStart.sx + dx)));
        state.sy = Math.max(0, Math.min(img.naturalHeight - state.sh, Math.round(dragStart.sy + dy)));
      } else if (dragging === 'resize-br') {
        state.sw = Math.max(4, Math.min(img.naturalWidth - state.sx, Math.round(dragStart.sw + dx)));
        state.sh = Math.max(4, Math.min(img.naturalHeight - state.sy, Math.round(dragStart.sh + dy)));
      }
      syncInputs();
      draw();
    });

    const stopDrag = () => { dragging = null; };
    canvas.addEventListener('mouseup', stopDrag);
    canvas.addEventListener('mouseleave', stopDrag);

    ['smp-sx', 'smp-sy', 'smp-sw', 'smp-sh'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        const v = parseInt(el.value) || 0;
        if (id === 'smp-sx') state.sx = Math.max(0, v);
        else if (id === 'smp-sy') state.sy = Math.max(0, v);
        else if (id === 'smp-sw') state.sw = Math.max(1, v);
        else if (id === 'smp-sh') state.sh = Math.max(1, v);
        draw();
      });
    });

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('slice-modal-close').addEventListener('click', close);
    document.getElementById('smp-cancel').addEventListener('click', close);

    document.getElementById('smp-confirm').addEventListener('click', () => {
      const key = document.getElementById('smp-key').value.trim() || sliceKey;
      const name = document.getElementById('smp-name').value.trim() || '新切片';
      if (atlas.slices[key]) {
        editor.ui.showToast?.(`切片 Key "${key}" 已存在，请换一个`, 'error');
        return;
      }
      atlas.slices[key] = {
        name,
        sx: Math.round(state.sx),
        sy: Math.round(state.sy),
        sw: Math.round(state.sw),
        sh: Math.round(state.sh),
        collide: document.getElementById('smp-collide').checked,
        colliderRadius: parseInt(document.getElementById('smp-radius').value) || 16
      };
      this._updateAtlasList();
      this._updateSlicePreviews();
      this._showAtlasProperties();
      editor.render();
      editor.ui.showToast?.('切片已创建: ' + name);
      close();
    });
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
    const configObj = { atlases };
    const content = JSON.stringify(configObj, null, 2);
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'editor/config/atlases.json', content })
      });
      const data = await res.json();
      if (data && data.ok) {
        // 同步更新内存缓存，这样下次场景加载不会读到旧值
        updateAtlasesCache(configObj);
        // 同时触发当前场景保存
        editor.history.save();
        // 更新所有场景的 atlases（图集是全局共享的，修改应影响所有场景）
        this._syncAtlasesToAllScenes(atlases);
        editor.ui.showToast?.('图集已保存到 config/atlases.json');
      } else {
        editor.ui.showToast?.('保存失败: ' + (data.error || '未知'), 'error');
      }
    } catch (e) {
      editor.ui.showToast?.('保存失败: ' + e.message, 'error');
    }
  }

  /**
   * 将最新图集数据同步写入 localStorage 中当前游戏的所有场景
   * @private
   */
  _syncAtlasesToAllScenes(atlases) {
    // 获取当前游戏 ID
    const gameId = this._contentGameId();
    // localStorage key 格式与 EditorDataManager 一致
    const storageKey = `yijian18-engine_editor_data_scenes_${gameId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const scenes = JSON.parse(raw);
      if (!Array.isArray(scenes)) return;
      let changed = false;
      for (const scene of scenes) {
        if (scene.atlases) {
          // 以 id 为 key 替换/新增
          const idMap = new Map(scene.atlases.map((a, i) => [a.id, i]));
          for (const atlas of atlases) {
            const copy = JSON.parse(JSON.stringify(atlas));
            if (idMap.has(atlas.id)) {
              scene.atlases[idMap.get(atlas.id)] = copy;
            } else {
              scene.atlases.push(copy);
            }
          }
          changed = true;
        } else {
          scene.atlases = JSON.parse(JSON.stringify(atlases));
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(storageKey, JSON.stringify(scenes));
      }
    } catch (e) {
      console.warn('[saveAtlases] 同步所有场景 atlases 失败:', e);
    }
  }

  /**
   * 保存所有图片资源到全局配置 config/images.json
   * 同时同步到所有场景的 localStorage。
   */
  async saveImages() {
    const editor = this.editor;
    const images = editor.sceneData.imageAssets || {};
    const configObj = { images };
    const content = JSON.stringify(configObj, null, 2);
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'editor/config/images.json', content })
      });
      const data = await res.json();
      if (data && data.ok) {
        updateImagesCache(configObj);
        editor.history.save();
        this._syncImagesToAllScenes(images);
        editor.ui.showToast?.('图片资源已保存到 config/images.json');
      } else {
        editor.ui.showToast?.('保存失败: ' + (data.error || '未知'), 'error');
      }
    } catch (e) {
      editor.ui.showToast?.('保存失败: ' + e.message, 'error');
    }
  }

  /**
   * 将最新图片资源同步写入 localStorage 中当前游戏的所有场景
   * @private
   */
  _syncImagesToAllScenes(images) {
    const gameId = this._contentGameId();
    const storageKey = `yijian18-engine_editor_data_scenes_${gameId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const scenes = JSON.parse(raw);
      if (!Array.isArray(scenes)) return;
      let changed = false;
      for (const scene of scenes) {
        if (!scene.imageAssets) scene.imageAssets = {};
        // 以全局为准覆盖
        for (const [id, data] of Object.entries(images)) {
          scene.imageAssets[id] = JSON.parse(JSON.stringify(data));
        }
        changed = true;
      }
      if (changed) {
        localStorage.setItem(storageKey, JSON.stringify(scenes));
      }
    } catch (e) {
      console.warn('[saveImages] 同步所有场景 imageAssets 失败:', e);
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

    // 切片选中时取消图集选中（避免面板冲突）
    editor.selectedAtlasId = null;

    // 更新选中状态
    editor.container.querySelectorAll('.slice-item').forEach(item => {
      item.classList.remove('selected');
    });

    const selectedEl = editor.container.querySelector(`.slice-item[data-atlas="${atlasId}"][data-slice="${sliceKey}"]`);
    if (selectedEl) selectedEl.classList.add('selected');

    // 显示切片属性
    const propsPanel = document.getElementById('slice-properties');
    const title = document.getElementById('slice-panel-title');
    if (title) title.textContent = '选中切片';
    if (propsPanel) {
      propsPanel.innerHTML = `
        <div class="slice-prop-row">
          <label>图集:</label>
          <input value="${atlas.name || atlas.id}" disabled style="color:#FFD700;">
        </div>
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
        <div class="slice-prop-row" style="margin-top:8px;">
          <button id="slice-edit-btn" style="flex:1;padding:5px;cursor:pointer;">编辑</button>
          <button id="slice-delete-btn" style="flex:1;padding:5px;cursor:pointer;color:#f88;">删除</button>
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

      // 编辑按钮：弹出切片编辑弹窗
      const editBtn = document.getElementById('slice-edit-btn');
      editBtn.addEventListener('click', () => {
        this._openSliceEditorModal(atlas, sliceKey, slice);
      });

      // 删除按钮：从图集中移除该切片
      const deleteBtn = document.getElementById('slice-delete-btn');
      deleteBtn.addEventListener('click', () => {
        if (!confirm(`确定删除切片「${slice.name || sliceKey}」吗？`)) return;
        delete atlas.slices[sliceKey];
        // 同步 decoSprites
        if (editor.sceneData.decoSprites && editor.sceneData.decoSprites[sliceKey]) {
          delete editor.sceneData.decoSprites[sliceKey];
        }
        editor.selectedSlice = null;
        // 清空切片属性面板
        const propsPanel = document.getElementById('slice-properties');
        if (propsPanel) propsPanel.innerHTML = '<div class="no-selection">未选中切片</div>';
        this._updateAtlasList();
        this._updateSlicePreviews();
        editor.render();
        editor.ui.showToast?.('切片已删除');
      });
    }

    editor.selectedSlice = { atlasId, sliceKey, slice };
  }

  /**
   * 打开切片编辑弹窗：显示图集原图，可拖动/调整切片选框，实时参数反馈
   * @private
   */
  _openSliceEditorModal(atlas, sliceKey, slice) {
    const editor = this.editor;
    const img = editor.loadedImages.get(atlas.id);
    if (!img) {
      editor.ui.showToast?.('图集图片未加载，请先设置路径并保存', 'error');
      return;
    }

    // 创建遮罩 + 弹窗
    const overlay = document.createElement('div');
    overlay.id = 'slice-editor-overlay';
    overlay.innerHTML = `
      <div id="slice-editor-modal">
        <div class="slice-modal-header">
          <span>切片编辑 - ${slice.name || sliceKey}（图集: ${atlas.name}）</span>
          <button id="slice-modal-close" title="关闭">✕</button>
        </div>
        <div class="slice-modal-body">
          <div class="slice-modal-canvas-wrap">
            <canvas id="slice-modal-canvas"></canvas>
          </div>
          <div class="slice-modal-params">
            <div class="smp-row"><label>X:</label><input type="number" id="smp-sx" value="${slice.sx}"></div>
            <div class="smp-row"><label>Y:</label><input type="number" id="smp-sy" value="${slice.sy}"></div>
            <div class="smp-row"><label>宽:</label><input type="number" id="smp-sw" value="${slice.sw}"></div>
            <div class="smp-row"><label>高:</label><input type="number" id="smp-sh" value="${slice.sh}"></div>
            <div class="smp-row"><label>碰撞:</label><input type="checkbox" id="smp-collide" ${slice.collide ? 'checked' : ''}></div>
            <div class="smp-row"><label>碰撞半径:</label><input type="number" id="smp-radius" value="${slice.colliderRadius || 16}"></div>
            <div class="smp-info" id="smp-info">图集: ${img.naturalWidth}×${img.naturalHeight}</div>
            <div class="smp-row" style="margin-top:12px;">
              <button id="smp-confirm" style="flex:1;">确定</button>
              <button id="smp-cancel" style="flex:1;">取消</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 状态
    const orig = { sx: slice.sx, sy: slice.sy, sw: slice.sw, sh: slice.sh };
    const state = { sx: slice.sx, sy: slice.sy, sw: slice.sw, sh: slice.sh };
    let dragging = null; // null | 'move' | 'resize-br'
    let dragStart = { mx: 0, my: 0, sx: 0, sy: 0, sw: 0, sh: 0 };

    const canvas = document.getElementById('slice-modal-canvas');
    const ctx = canvas.getContext('2d');

    // 缩放：让图集图片适应弹窗画布区域（限800×600）
    const maxCW = Math.min(800, window.innerWidth - 320);
    const maxCH = Math.min(600, window.innerHeight - 160);
    const scale = Math.min(maxCW / img.naturalWidth, maxCH / img.naturalHeight, 2);
    const cw = Math.round(img.naturalWidth * scale);
    const ch = Math.round(img.naturalHeight * scale);
    canvas.width = cw;
    canvas.height = ch;

    const draw = () => {
      ctx.clearRect(0, 0, cw, ch);
      // 图集原图
      ctx.drawImage(img, 0, 0, cw, ch);
      // 半透明遮罩
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, cw, ch);
      // 高亮选区
      const rx = state.sx * scale, ry = state.sy * scale;
      const rw = state.sw * scale, rh = state.sh * scale;
      ctx.drawImage(img, state.sx, state.sy, state.sw, state.sh, rx, ry, rw, rh);
      // 边框
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
      // 右下角手柄
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(rx + rw - 6, ry + rh - 6, 8, 8);
    };
    draw();

    // 实时更新参数输入框
    const syncInputs = () => {
      document.getElementById('smp-sx').value = Math.round(state.sx);
      document.getElementById('smp-sy').value = Math.round(state.sy);
      document.getElementById('smp-sw').value = Math.round(state.sw);
      document.getElementById('smp-sh').value = Math.round(state.sh);
    };

    // Canvas 鼠标事件：拖动移动选框 / 右下角缩放
    const getCanvasPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvas.addEventListener('mousedown', (e) => {
      const pos = getCanvasPos(e);
      const rx = state.sx * scale, ry = state.sy * scale;
      const rw = state.sw * scale, rh = state.sh * scale;
      // 右下角手柄（10px范围）
      if (Math.abs(pos.x - (rx + rw)) < 10 && Math.abs(pos.y - (ry + rh)) < 10) {
        dragging = 'resize-br';
      } else if (pos.x >= rx && pos.x <= rx + rw && pos.y >= ry && pos.y <= ry + rh) {
        dragging = 'move';
      } else {
        return;
      }
      dragStart = { mx: pos.x, my: pos.y, sx: state.sx, sy: state.sy, sw: state.sw, sh: state.sh };
      e.preventDefault();
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!dragging) {
        // 光标样式
        const pos = getCanvasPos(e);
        const rx = state.sx * scale, ry = state.sy * scale;
        const rw = state.sw * scale, rh = state.sh * scale;
        if (Math.abs(pos.x - (rx + rw)) < 10 && Math.abs(pos.y - (ry + rh)) < 10) {
          canvas.style.cursor = 'nwse-resize';
        } else if (pos.x >= rx && pos.x <= rx + rw && pos.y >= ry && pos.y <= ry + rh) {
          canvas.style.cursor = 'move';
        } else {
          canvas.style.cursor = 'crosshair';
        }
        return;
      }
      const pos = getCanvasPos(e);
      const dx = (pos.x - dragStart.mx) / scale;
      const dy = (pos.y - dragStart.my) / scale;
      if (dragging === 'move') {
        state.sx = Math.max(0, Math.min(img.naturalWidth - state.sw, Math.round(dragStart.sx + dx)));
        state.sy = Math.max(0, Math.min(img.naturalHeight - state.sh, Math.round(dragStart.sy + dy)));
      } else if (dragging === 'resize-br') {
        state.sw = Math.max(4, Math.min(img.naturalWidth - state.sx, Math.round(dragStart.sw + dx)));
        state.sh = Math.max(4, Math.min(img.naturalHeight - state.sy, Math.round(dragStart.sh + dy)));
      }
      syncInputs();
      draw();
    });

    const stopDrag = () => { dragging = null; };
    canvas.addEventListener('mouseup', stopDrag);
    canvas.addEventListener('mouseleave', stopDrag);

    // 参数输入框变化 → 刷新画布
    ['smp-sx', 'smp-sy', 'smp-sw', 'smp-sh'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        const v = parseInt(el.value) || 0;
        if (id === 'smp-sx') state.sx = Math.max(0, v);
        else if (id === 'smp-sy') state.sy = Math.max(0, v);
        else if (id === 'smp-sw') state.sw = Math.max(1, v);
        else if (id === 'smp-sh') state.sh = Math.max(1, v);
        draw();
      });
    });

    // 关闭/确定/取消
    const close = () => { overlay.remove(); };
    document.getElementById('slice-modal-close').addEventListener('click', close);
    document.getElementById('smp-cancel').addEventListener('click', () => {
      // 恢复原始值
      state.sx = orig.sx; state.sy = orig.sy; state.sw = orig.sw; state.sh = orig.sh;
      close();
    });
    document.getElementById('smp-confirm').addEventListener('click', () => {
      // 写回 slice 数据
      slice.sx = Math.round(state.sx);
      slice.sy = Math.round(state.sy);
      slice.sw = Math.round(state.sw);
      slice.sh = Math.round(state.sh);
      const collideEl = document.getElementById('smp-collide');
      const radiusEl = document.getElementById('smp-radius');
      slice.collide = collideEl.checked;
      slice.colliderRadius = parseInt(radiusEl.value) || 16;
      // 同步 decoSprites
      if (editor.sceneData.decoSprites && editor.sceneData.decoSprites[sliceKey]) {
        Object.assign(editor.sceneData.decoSprites[sliceKey], {
          sx: slice.sx, sy: slice.sy, sw: slice.sw, sh: slice.sh,
          collide: slice.collide, colliderRadius: slice.colliderRadius
        });
      }
      // 刷新左侧切片属性面板和预览
      this._selectSlice(atlas.id, sliceKey);
      this._updateSlicePreviews();
      editor.render();
      close();
    });
    // 点遮罩空白区也关闭
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
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
