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
 * SceneEditorLayers - 场景编辑器图层管理模块
 * 负责图层的增删改查、排序、对象移动
 */
export class SceneEditorLayers {
  /**
   * @param {import('./SceneEditor.js').SceneEditor} editor - 主编辑器实例
   */
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * 添加图层
   */
  addLayer(name) {
    const editor = this.editor;
    const layer = {
      id: 'layer_' + Date.now(),
      name: name || `图层 ${editor.sceneData.layers.length + 1}`,
      visible: true,
      locked: false,
      objects: []
    };
    editor.sceneData.layers.push(layer);
    this.updateLayerList();
    editor.history.saveHistory();
    return layer;
  }

  /**
   * 删除当前激活图层
   */
  deleteLayer() {
    const editor = this.editor;
    if (editor.sceneData.layers.length <= 1) {
      editor.ui.showToast('至少保留一个图层', 'error');
      return;
    }

    const layer = editor.sceneData.layers[editor.activeLayerIndex];
    const objCount = layer.objects.length;

    if (objCount > 0) {
      if (!confirm(`图层"${layer.name}"中有 ${objCount} 个对象，删除后不可恢复。确认删除？`)) {
        return;
      }
    }

    editor.sceneData.layers.splice(editor.activeLayerIndex, 1);
    if (editor.activeLayerIndex >= editor.sceneData.layers.length) {
      editor.activeLayerIndex = editor.sceneData.layers.length - 1;
    }

    editor.selectedObjects = [];
    this.updateLayerList();
    editor.ui.updateObjectCount();
    editor.ui.updateObjectProperties();
    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 将当前激活图层上移一层（提高遮挡优先级）
   */
  moveLayerUp() {
    const editor = this.editor;
    const idx = editor.activeLayerIndex;
    if (idx >= editor.sceneData.layers.length - 1) return;

    const layers = editor.sceneData.layers;
    [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
    editor.activeLayerIndex = idx + 1;

    this.updateLayerList();
    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 将当前激活图层下移一层
   */
  moveLayerDown() {
    const editor = this.editor;
    const idx = editor.activeLayerIndex;
    if (idx <= 0) return;

    const layers = editor.sceneData.layers;
    [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]];
    editor.activeLayerIndex = idx - 1;

    this.updateLayerList();
    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 将当前选中对象移动到当前激活图层
   */
  moveSelectedObjectToActiveLayer() {
    const editor = this.editor;
    if (editor.selectedObjects.length === 0) {
      editor.ui.showToast('请先选中一个对象', 'error');
      return;
    }

    const targetLayer = editor.sceneData.layers[editor.activeLayerIndex];
    if (!targetLayer) return;

    let movedCount = 0;

    for (const obj of editor.selectedObjects) {
      if (obj.type === 'decoration') {
        editor.ui.showToast('装饰物暂不支持跨层移动', 'error');
        continue;
      }

      let removed = false;
      for (const layer of editor.sceneData.layers) {
        const index = layer.objects.indexOf(obj);
        if (index !== -1) {
          if (layer === targetLayer) break;
          layer.objects.splice(index, 1);
          removed = true;
          break;
        }
      }

      if (removed) {
        targetLayer.objects.push(obj);
        movedCount++;
      }
    }

    if (movedCount > 0) {
      editor.ui.showToast(`已将 ${movedCount} 个对象移入"${targetLayer.name}"`);
      this.updateLayerList();
      editor.ui.updateObjectCount();
      editor.history.saveHistory();
      editor.render();
    }
  }

  /**
   * 批量设置深度
   */
  batchSetDepth() {
    const editor = this.editor;
    const layer = editor.sceneData.layers[editor.activeLayerIndex];
    if (!layer) return;

    const keys = new Set();
    for (const obj of layer.objects) {
      if (obj.decoKey) keys.add(obj.decoKey);
      if (obj.sliceKey) keys.add(obj.sliceKey);
      if (obj.name) keys.add(obj.name);
      if (!obj.decoKey && !obj.sliceKey && !obj.name) keys.add(obj.type);
    }

    const keyList = [...keys].sort().join(', ');
    const filter = prompt(`当前图层"${layer.name}"中的对象标识:\n${keyList}\n\n输入要筛选的名称（如 grass1）：`);
    if (!filter || !filter.trim()) return;

    const depthStr = prompt(`将所有"${filter}"对象设置到深度（索引位置，0=最底）：`, '20');
    if (depthStr === null) return;
    const targetDepth = parseInt(depthStr);
    if (isNaN(targetDepth) || targetDepth < 0) {
      editor.ui.showToast('深度必须是非负整数', 'error');
      return;
    }

    const filterKey = filter.trim();
    const matchObj = (obj) => obj.decoKey === filterKey || obj.sliceKey === filterKey || obj.name === filterKey;

    const matched = [];
    const remaining = [];
    for (const obj of layer.objects) {
      if (matchObj(obj)) matched.push(obj);
      else remaining.push(obj);
    }

    if (matched.length === 0) {
      editor.ui.showToast(`未找到名称为"${filterKey}"的对象`, 'error');
      return;
    }

    const insertAt = Math.min(targetDepth, remaining.length);
    remaining.splice(insertAt, 0, ...matched);
    layer.objects = remaining;

    editor.ui.showToast(`已将 ${matched.length} 个"${filterKey}"对象设置到深度 ${insertAt}`);
    this.updateLayerList();
    editor.ui.updateObjectProperties();
    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 去重
   */
  deduplicateObjects() {
    const editor = this.editor;
    const layer = editor.sceneData.layers[editor.activeLayerIndex];
    if (!layer) return;

    const seen = new Set();
    const unique = [];
    let removed = 0;

    for (const obj of layer.objects) {
      const key = obj.decoKey || obj.sliceKey || obj.name || obj.type;
      const posKey = `${key}_${Math.round(obj.x)}_${Math.round(obj.y)}`;
      if (seen.has(posKey)) {
        removed++;
      } else {
        seen.add(posKey);
        unique.push(obj);
      }
    }

    if (removed === 0) {
      editor.ui.showToast(`图层"${layer.name}"中无重复对象`);
      return;
    }

    layer.objects = unique;
    editor.selectedObjects = [];
    editor.ui.showToast(`已去除 ${removed} 个重复对象`);
    this.updateLayerList();
    editor.ui.updateObjectCount();
    editor.ui.updateObjectProperties();
    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 批量偏移
   */
  batchOffset() {
    const editor = this.editor;
    const layer = editor.sceneData.layers[editor.activeLayerIndex];
    if (!layer) return;

    if (layer.objects.length === 0) {
      editor.ui.showToast(`图层"${layer.name}"中没有对象`, 'error');
      return;
    }

    const dx = parseInt(prompt('X 方向偏移（正=右，负=左）：', '0'));
    const dy = parseInt(prompt('Y 方向偏移（正=下，负=上）：', '50'));

    if (isNaN(dx) && isNaN(dy)) return;
    const offsetX = isNaN(dx) ? 0 : dx;
    const offsetY = isNaN(dy) ? 0 : dy;

    if (offsetX === 0 && offsetY === 0) return;

    for (const obj of layer.objects) {
      obj.x = Math.round(obj.x + offsetX);
      obj.y = Math.round(obj.y + offsetY);
    }

    editor.ui.showToast(`已偏移"${layer.name}"中 ${layer.objects.length} 个对象 (${offsetX}, ${offsetY})`);
    editor.ui.updateObjectProperties();
    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 更新图层列表UI
   */
  updateLayerList() {
    const editor = this.editor;
    const list = document.getElementById('editor-layer-list');
    if (!list) return;

    list.innerHTML = '';

    // 找出当前选中对象所在图层索引
    let selectedObjLayerIndex = -1;
    if (editor.selectedObjects.length === 1 && editor.selectedObjects[0].type !== 'decoration') {
      const obj = editor.selectedObjects[0];
      for (let i = 0; i < editor.sceneData.layers.length; i++) {
        if (editor.sceneData.layers[i].objects.includes(obj)) {
          selectedObjLayerIndex = i;
          break;
        }
      }
    }

    // 从后往前显示（最上面的图层在列表顶部）
    for (let displayIndex = editor.sceneData.layers.length - 1; displayIndex >= 0; displayIndex--) {
      const actualIndex = displayIndex;
      const layer = editor.sceneData.layers[actualIndex];
      const item = document.createElement('div');
      const isActive = actualIndex === editor.activeLayerIndex;
      const hasSelectedObj = actualIndex === selectedObjLayerIndex;
      item.className = 'layer-item' + (isActive ? ' active' : '') + (hasSelectedObj ? ' has-selected' : '');
      item.dataset.index = actualIndex;

      const objCount = layer.objects.length;
      const btnBase = 'display:inline-flex;align-items:center;justify-content:center;width:26px;height:22px;border-radius:3px;cursor:pointer;margin-right:3px;font-size:13px;border:1px solid;';
      const visStyle = layer.visible
        ? `${btnBase}background:#2a4a2a;border-color:#4a8a4a;`
        : `${btnBase}background:#3a3a3a;border-color:#666;opacity:0.7;`;
      const lockStyle = layer.locked
        ? `${btnBase}background:#5a2a2a;border-color:#c0504a;`
        : `${btnBase}background:#2a3a5e;border-color:#4a8a4a;`;
      item.innerHTML = `
        <span class="layer-btn layer-visibility" data-action="visibility" title="${layer.visible ? '点击隐藏' : '点击显示'}" style="${visStyle}">${layer.visible ? '👁' : '🚫'}</span>
        <span class="layer-btn layer-lock" data-action="lock" title="${layer.locked ? '已锁定，点击解锁' : '未锁定，点击锁定'}" style="${lockStyle}">${layer.locked ? '🔒' : '🔓'}</span>
        <span class="layer-name" data-action="select" style="flex:1;">${layer.name}</span>
        <span class="layer-count">${objCount}</span>
        ${hasSelectedObj ? '<span class="layer-obj-marker" title="选中对象在此层">◆</span>' : ''}
      `;

      // 双击可重命名
      const nameEl = item.querySelector('.layer-name');
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const idx = parseInt(item.dataset.index);
        const newName = prompt('图层名称:', editor.sceneData.layers[idx].name);
        if (newName && newName.trim()) {
          editor.sceneData.layers[idx].name = newName.trim();
          this.updateLayerList();
          editor.history.saveHistory();
        }
      });

      item.addEventListener('click', (e) => {
        const idx = parseInt(item.dataset.index);
        const action = e.target.dataset.action;
        if (action === 'visibility') {
          editor.sceneData.layers[idx].visible = !editor.sceneData.layers[idx].visible;
          editor.render();
        } else if (action === 'lock') {
          editor.sceneData.layers[idx].locked = !editor.sceneData.layers[idx].locked;
          editor.history.saveHistory();
        } else {
          editor.activeLayerIndex = idx;
        }
        this.updateLayerList();
      });

      list.appendChild(item);
    }
  }

  /**
   * 规范化图层结构
   */
  normalizeLayers(layers) {
    const standard = [
      { id: 'layer_bg', name: '背景层' },
      { id: 'layer_fill', name: '背景填充层' },
      { id: 'layer_deco', name: '装饰层' },
      { id: 'layer_entity', name: '实体层' }
    ];

    const input = Array.isArray(layers) ? layers : [];
    const byId = new Map();
    for (const l of input) {
      if (l && l.id) byId.set(l.id, l);
    }

    const result = [];

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
   * 将 decorations 数组转换合并到装饰层 objects 中
   */
  mergeDecorationsToLayer() {
    const editor = this.editor;
    const decorations = editor.sceneData.decorations;
    if (!decorations || decorations.length === 0) return;

    const decoLayer = editor.sceneData.layers.find(l => l.id === 'layer_deco');
    if (!decoLayer) return;

    if (decoLayer.objects.some(o => o.type === 'deco')) return;

    const decoSprites = editor.sceneData.decoSprites || {};

    for (const deco of decorations) {
      const sprite = decoSprites[deco.key];
      const scale = (deco.scale || 1) * (sprite ? (sprite.scale || 1) : 1);
      const sw = sprite ? sprite.sw : 64;
      const sh = sprite ? sprite.sh : 64;
      const w = sw * scale;
      const h = sh * scale;

      const objX = deco.x - w / 2;
      const objY = deco.y - h;

      const obj = {
        id: 'deco_' + Math.floor(Math.random() * 100000000),
        type: 'deco',
        decoKey: deco.key,
        x: Math.round(objX),
        y: Math.round(objY),
        width: Math.round(w),
        height: Math.round(h),
        scale: deco.scale || 1,
        name: deco.key
      };

      if (deco.belowEntities) obj.belowEntities = true;
      decoLayer.objects.push(obj);
    }

    editor.sceneData.decorations = [];
  }
}
