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

import { ShapeRenderer } from '../src/rendering/ShapeRenderer.js';

/**
 * SceneEditorInteraction - 场景编辑器交互模块
 * 负责鼠标/键盘事件处理、右键菜单、对象拾取
 */
export class SceneEditorInteraction {
  /**
   * @param {import('./SceneEditor.js').SceneEditor} editor - 主编辑器实例
   */
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * 屏幕坐标转场景坐标
   */
  screenToScene(screenX, screenY) {
    const editor = this.editor;
    return {
      x: (screenX - editor.viewport.offsetX) / editor.viewport.scale,
      y: (screenY - editor.viewport.offsetY) / editor.viewport.scale
    };
  }

  /**
   * 获取指定位置的对象（遍历所有可见未锁定图层）
   */
  getObjectAt(x, y) {
    const editor = this.editor;
    for (let li = editor.sceneData.layers.length - 1; li >= 0; li--) {
      const layer = editor.sceneData.layers[li];
      if (!layer || layer.locked || !layer.visible) continue;

      for (let i = layer.objects.length - 1; i >= 0; i--) {
        const obj = layer.objects[i];

        if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill' || obj.type === 'deco') {
          if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
            editor.activeLayerIndex = li;
            return obj;
          }
        } else if (obj.type === 'ellipse') {
          // 椭圆点击检测：判断点是否在椭圆内
          const cx = obj.x + obj.width / 2;
          const cy = obj.y + obj.height / 2;
          const rx = obj.width / 2;
          const ry = obj.height / 2;
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1) {
            editor.activeLayerIndex = li;
            return obj;
          }
        } else if (obj.type === 'circle') {
          if (Math.hypot(x - obj.x, y - obj.y) <= obj.radius) {
            editor.activeLayerIndex = li;
            return obj;
          }
        } else if (obj.type === 'shape') {
          if (this._pointInShape(obj, x, y)) {
            editor.activeLayerIndex = li;
            return obj;
          }
        } else if (obj.type === 'region') {
          // 区域：矩形命中
          if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
            editor.activeLayerIndex = li;
            return obj;
          }
        } else if (obj.type === 'spawn' || obj.type === 'portal' || obj.type === 'npc' || obj.type === 'ref') {
          // 点状逻辑对象/放置引用：18px 半径命中
          if (Math.hypot(x - obj.x, y - obj.y) <= 18) {
            editor.activeLayerIndex = li;
            return obj;
          }
        }
      }
    }
    return null;
  }

  /**
   * 判断点是否落在 shape 内（按 shapeType）
   * @private
   */
  _pointInShape(shape, x, y) {
    const bb = ShapeRenderer.getBBox(shape);
    switch (shape.shapeType) {
      case 'rect':
        return x >= bb.x && x <= bb.x + bb.w && y >= bb.y && y <= bb.y + bb.h;
      case 'circle': {
        const r = Math.min(bb.w, bb.h) / 2;
        return Math.hypot(x - bb.cx, y - bb.cy) <= r;
      }
      case 'polygon':
        return this._pointInPolygon(shape.points || [], x, y);
      case 'path':
        return x >= bb.x && x <= bb.x + bb.w && y >= bb.y && y <= bb.y + bb.h;
      case 'ellipse':
      default: {
        const dx = (x - bb.cx) / (bb.w / 2 || 1);
        const dy = (y - bb.cy) / (bb.h / 2 || 1);
        return dx * dx + dy * dy <= 1;
      }
    }
  }

  /**
   * 射线法判断点在多边形内
   * @private
   */
  _pointInPolygon(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /**
   * 检测点是否命中 polygon/path 的某个顶点，返回顶点索引或 -1
   * @private
   */
  getVertexAt(shape, x, y) {
    if (!shape.points) return -1;
    const r = 8 / this.editor.viewport.scale;
    for (let i = 0; i < shape.points.length; i++) {
      const p = shape.points[i];
      if (Math.hypot(x - p[0], y - p[1]) <= r) return i;
    }
    return -1;
  }

  /**
   * 检查指定位置是否在选中对象的右下角缩放手柄上
   */
  getResizeHandleAt(x, y) {
    const editor = this.editor;
    const handleSize = 12 / editor.viewport.scale;

    for (const obj of editor.selectedObjects) {
      let hx, hy;
      if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'slice' || obj.type === 'fill' || obj.type === 'deco' || obj.type === 'ellipse') {
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
   * 处理鼠标按下
   */
  handleMouseDown(e) {
    const editor = this.editor;
    const pos = this.screenToScene(e.offsetX, e.offsetY);

    if (editor.interaction.mode === 'pan' || e.button === 1) {
      editor.interaction.isDragging = true;
      editor.interaction.dragStart = {
        x: e.offsetX - editor.viewport.offsetX,
        y: e.offsetY - editor.viewport.offsetY
      };
      return;
    }

    if (editor.interaction.mode === 'select') {
      // 选中单个多边形/路径时，优先检测顶点拖拽
      if (editor.selectedObjects.length === 1) {
        const sel = editor.selectedObjects[0];
        if (sel.type === 'shape' && (sel.shapeType === 'polygon' || sel.shapeType === 'path')) {
          const vi = this.getVertexAt(sel, pos.x, pos.y);
          if (vi !== -1) {
            editor.interaction.isDragging = true;
            editor.interaction.draggingVertex = { obj: sel, index: vi };
            editor.interaction.dragStart = { x: pos.x, y: pos.y };
            return;
          }
        }
      }

      // 检查是否点击了缩放手柄
      if (editor.selectedObjects.length > 0) {
        const resizeTarget = this.getResizeHandleAt(pos.x, pos.y);
        if (resizeTarget) {
          editor.interaction.isResizing = true;
          editor.interaction.isDragging = true;
          editor.interaction.dragStart = { x: pos.x, y: pos.y };
          editor.interaction.resizeTarget = resizeTarget;
          editor.interaction.resizeStart = {
            width: resizeTarget.width || 64,
            height: resizeTarget.height || 64
          };
          return;
        }
      }

      const clicked = this.getObjectAt(pos.x, pos.y);

      if (clicked) {
        if (e.shiftKey) {
          const index = editor.selectedObjects.indexOf(clicked);
          if (index === -1) editor.selectedObjects.push(clicked);
          else editor.selectedObjects.splice(index, 1);
        } else {
          if (!editor.selectedObjects.includes(clicked)) editor.selectedObjects = [clicked];
        }

        editor.interaction.isDragging = true;
        editor.interaction.dragStart = { x: pos.x, y: pos.y };
        editor.interaction.objectStart = { x: clicked.x || 0, y: clicked.y || 0 };
        // 多边形/路径移动：记录顶点起始快照
        if (clicked.type === 'shape' && Array.isArray(clicked.points)) {
          editor.interaction.pointsStart = clicked.points.map(p => [p[0], p[1]]);
        } else {
          editor.interaction.pointsStart = null;
        }
      } else {
        editor.selectedObjects = [];
      }

      editor.ui.updateObjectProperties();
      editor.render();
    }
  }

  /**
   * 处理鼠标移动
   */
  handleMouseMove(e) {
    const editor = this.editor;

    // 更新光标样式
    if (!editor.interaction.isDragging && editor.interaction.mode === 'select' && editor.selectedObjects.length > 0) {
      const pos = this.screenToScene(e.offsetX, e.offsetY);
      const onHandle = this.getResizeHandleAt(pos.x, pos.y);
      const canvas = document.getElementById('editor-overlay') || document.getElementById('editor-canvas');
      if (canvas) {
        canvas.style.cursor = onHandle ? 'nwse-resize' : '';
      }
    }

    if (!editor.interaction.isDragging) return;

    // 顶点拖拽（多边形/路径）
    if (editor.interaction.draggingVertex) {
      const pos = this.screenToScene(e.offsetX, e.offsetY);
      const { obj, index } = editor.interaction.draggingVertex;
      if (obj.points && obj.points[index]) {
        obj.points[index] = [Math.round(pos.x), Math.round(pos.y)];
        editor.ui.updateObjectProperties();
        editor.render();
      }
      return;
    }

    if (editor.interaction.mode === 'pan') {
      editor.viewport.offsetX = e.offsetX - editor.interaction.dragStart.x;
      editor.viewport.offsetY = e.offsetY - editor.interaction.dragStart.y;
      editor.render();
    } else if (editor.interaction.isResizing) {
      const pos = this.screenToScene(e.offsetX, e.offsetY);
      const dx = pos.x - editor.interaction.dragStart.x;
      const dy = pos.y - editor.interaction.dragStart.y;
      const obj = editor.interaction.resizeTarget;

      const newWidth = Math.max(8, editor.interaction.resizeStart.width + dx);
      const newHeight = Math.max(8, editor.interaction.resizeStart.height + dy);

      obj.width = Math.round(newWidth);
      obj.height = Math.round(newHeight);

      if (obj.type === 'decoration' && obj._decoRef) {
        const origWidth = obj._origWidth || editor.interaction.resizeStart.width;
        obj._decoRef.scale = obj.width / origWidth;
        obj.scale = obj._decoRef.scale;
      }

      editor.ui.updateObjectProperties();
      editor.render();
    } else if (editor.interaction.mode === 'select' && editor.selectedObjects.length > 0) {
      const pos = this.screenToScene(e.offsetX, e.offsetY);
      const dx = pos.x - editor.interaction.dragStart.x;
      const dy = pos.y - editor.interaction.dragStart.y;

      for (const obj of editor.selectedObjects) {
        // 多边形/路径：整体偏移所有顶点
        if (obj.type === 'shape' && Array.isArray(obj.points) && editor.interaction.pointsStart) {
          obj.points = editor.interaction.pointsStart.map(p => [Math.round(p[0] + dx), Math.round(p[1] + dy)]);
          continue;
        }
        obj.x = editor.interaction.objectStart.x + dx;
        obj.y = editor.interaction.objectStart.y + dy;

        if (obj.type === 'decoration' && obj._decoRef) {
          obj._decoRef.x = obj.x;
          obj._decoRef.y = obj.y;
        }
      }

      editor.ui.updateObjectProperties();
      editor.render();
    }
  }

  /**
   * 处理鼠标松开
   */
  handleMouseUp(e) {
    const editor = this.editor;
    if (editor.interaction.isDragging &&
        (editor.selectedObjects.length > 0 || editor.interaction.isResizing || editor.interaction.draggingVertex)) {
      editor.history.saveHistory();
    }
    editor.interaction.isDragging = false;
    editor.interaction.isResizing = false;
    editor.interaction.resizeTarget = null;
    editor.interaction.resizeStart = null;
    editor.interaction.draggingVertex = null;
    editor.interaction.pointsStart = null;
  }

  /**
   * 处理右键菜单
   */
  handleContextMenu(e) {
    e.preventDefault();
    const editor = this.editor;
    const pos = this.screenToScene(e.offsetX, e.offsetY);
    const clicked = this.getObjectAt(pos.x, pos.y);

    this.removeContextMenu();
    if (!clicked) return;

    editor.selectedObjects = [clicked];
    editor.ui.updateObjectProperties();
    editor.render();

    const isDecoration = clicked.type === 'decoration';

    let layerIndex = -1;
    if (!isDecoration) {
      for (let i = 0; i < editor.sceneData.layers.length; i++) {
        if (editor.sceneData.layers[i].objects.includes(clicked)) {
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
      items.push({ label: '上移一层', action: () => this._moveDecorationOrder(clicked, 'up') });
      items.push({ label: '下移一层', action: () => this._moveDecorationOrder(clicked, 'down') });
      items.push({ separator: true });
      items.push({ label: '置于顶层', action: () => this._moveDecorationOrder(clicked, 'top') });
      items.push({ label: '置于底层', action: () => this._moveDecorationOrder(clicked, 'bottom') });
      items.push({ separator: true });
    } else if (layerIndex !== -1) {
      const curLayer = editor.sceneData.layers[layerIndex];
      // 跨图层移动
      items.push({ label: '⬆ 移到上一图层', action: () => this._moveObjectToAdjacentLayer(clicked, 1) });
      items.push({ label: '⬇ 移到下一图层', action: () => this._moveObjectToAdjacentLayer(clicked, -1) });
      items.push({ separator: true });
      // 层内深度调整
      items.push({ label: '层内上移', action: () => this._moveObjectInLayer(clicked, curLayer, 'up') });
      items.push({ label: '层内下移', action: () => this._moveObjectInLayer(clicked, curLayer, 'down') });
      items.push({ label: '层内置顶', action: () => this._moveObjectInLayer(clicked, curLayer, 'top') });
      items.push({ label: '层内置底', action: () => this._moveObjectInLayer(clicked, curLayer, 'bottom') });
      items.push({ separator: true });
    }

    items.push({ label: '删除对象', action: () => editor.ui.deleteSelectedObjects() });

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
        el.addEventListener('click', () => { item.action(); this.removeContextMenu(); });
      }
      menu.appendChild(el);
    }

    document.body.appendChild(menu);

    this._contextMenuCloser = (ev) => {
      if (!menu.contains(ev.target)) this.removeContextMenu();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', this._contextMenuCloser);
    }, 0);
  }

  /**
   * 移除右键菜单
   */
  removeContextMenu() {
    const existing = document.getElementById('editor-context-menu');
    if (existing) existing.remove();
    if (this._contextMenuCloser) {
      document.removeEventListener('mousedown', this._contextMenuCloser);
      this._contextMenuCloser = null;
    }
  }

  /**
   * 调整装饰物层次
   * @private
   */
  _moveDecorationOrder(deco, position) {
    const editor = this.editor;
    const ref = deco._decoRef;
    if (!ref || !Array.isArray(editor.sceneData.decorations)) return;

    const sorted = [...editor.sceneData.decorations].sort((a, b) => a.y - b.y);
    const idx = sorted.indexOf(ref);
    if (idx === -1) return;

    if (position === 'up') {
      if (idx < sorted.length - 1) {
        const next = sorted[idx + 1];
        const t = ref.y; ref.y = next.y; next.y = t;
        if (ref.y === next.y) ref.y += 1;
      }
    } else if (position === 'down') {
      if (idx > 0) {
        const prev = sorted[idx - 1];
        const t = ref.y; ref.y = prev.y; prev.y = t;
        if (ref.y === prev.y) ref.y -= 1;
      }
    } else if (position === 'top') {
      const maxY = Math.max(...editor.sceneData.decorations.map(d => d.y));
      ref.y = maxY + 1;
    } else if (position === 'bottom') {
      const minY = Math.min(...editor.sceneData.decorations.map(d => d.y));
      ref.y = minY - 1;
    }

    if (deco.y !== undefined) deco.y = ref.y;
    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 把对象移到相邻图层（跨图层移动）
   * @param {Object} obj - 要移动的对象
   * @param {number} delta - +1 上一图层（更上层），-1 下一图层（更底层）
   * @private
   */
  _moveObjectToAdjacentLayer(obj, delta) {
    const editor = this.editor;
    const layers = editor.sceneData.layers;
    let curLi = -1;
    for (let i = 0; i < layers.length; i++) {
      if (layers[i].objects && layers[i].objects.includes(obj)) { curLi = i; break; }
    }
    if (curLi === -1) return;

    const targetLi = curLi + delta;
    if (targetLi < 0 || targetLi >= layers.length) {
      editor.ui.showToast(delta > 0 ? '已在最上图层' : '已在最下图层', 'error');
      return;
    }
    if (layers[targetLi].locked) {
      editor.ui.showToast(`目标图层「${layers[targetLi].name}」已锁定`, 'error');
      return;
    }

    // 从当前层移除，加入目标层
    const idx = layers[curLi].objects.indexOf(obj);
    layers[curLi].objects.splice(idx, 1);
    layers[targetLi].objects.push(obj);
    editor.activeLayerIndex = targetLi;

    editor.history.saveHistory();
    editor.layers.updateLayerList();
    editor.ui.updateObjectCount();
    editor.ui.updateObjectProperties();
    editor.render();
    editor.ui.showToast(`已移到图层：${layers[targetLi].name}`);
  }

  /**
   * 在图层内调整对象的绘制顺序
   * @private
   */
  _moveObjectInLayer(obj, layer, position) {
    const editor = this.editor;
    const idx = layer.objects.indexOf(obj);
    if (idx === -1) return;

    layer.objects.splice(idx, 1);

    if (position === 'up') {
      const insertAt = Math.min(idx + 1, layer.objects.length);
      layer.objects.splice(insertAt, 0, obj);
    } else if (position === 'down') {
      const insertAt = Math.max(idx - 1, 0);
      layer.objects.splice(insertAt, 0, obj);
    } else if (position === 'top') {
      layer.objects.push(obj);
    } else if (position === 'bottom') {
      layer.objects.unshift(obj);
    }

    editor.history.saveHistory();
    editor.render();
  }

  /**
   * 处理键盘事件
   */
  handleKeyDown(e) {
    const editor = this.editor;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); editor.history.undo(); }
      else if (e.key === 'y') { e.preventDefault(); editor.history.redo(); }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (editor.selectedObjects.length > 0) editor.ui.deleteSelectedObjects();
    }

    if (e.key === 'v' || e.key === 'V') editor.ui.setMode('select');
    else if (e.key === 'h' || e.key === 'H') editor.ui.setMode('pan');
    else if (e.key === 'p' || e.key === 'P') editor.ui.setMode('place');
  }

  /**
   * 全选当前激活图层的所有对象
   */
  _selectAll() {
    const editor = this.editor;
    const layers = editor.sceneData.layers;
    if (!layers || layers.length === 0) return;
    const layer = layers[editor.activeLayerIndex];
    if (!layer || !layer.objects || layer.locked || !layer.visible) return;
    editor.selectedObjects = [...layer.objects];
    editor.canvas.render();
    editor.ui.updateObjectProperties();
  }

  /**
   * 复制选中的对象到剪贴板
   */
  _copySelection() {
    const editor = this.editor;
    if (editor.selectedObjects.length === 0) return;
    // 深拷贝选中对象
    this._clipboard = JSON.parse(JSON.stringify(editor.selectedObjects));
    // 记录复制时的场景ID，用于跨场景粘贴时判断是否需要偏移
    this._clipboardSceneId = editor.sceneData.id || editor.sceneData.name;
    editor.ui.showToast(`已复制 ${this._clipboard.length} 个对象`);
  }

  /**
   * 粘贴剪贴板中的对象
   * 同场景粘贴偏移 20px 避免重叠，跨场景粘贴保持原始坐标
   */
  _pasteSelection() {
    const editor = this.editor;
    if (!this._clipboard || this._clipboard.length === 0) return;
    const layers = editor.sceneData.layers;
    if (!layers || layers.length === 0) return;
    const layer = layers[editor.activeLayerIndex];
    if (!layer || layer.locked) {
      editor.ui.showToast('当前图层已锁定，无法粘贴', true);
      return;
    }
    if (!layer.objects) layer.objects = [];

    // 跨场景粘贴保持原始坐标，同场景粘贴偏移 20px 避免重叠
    const currentSceneId = editor.sceneData.id || editor.sceneData.name;
    const isSameScene = this._clipboardSceneId === currentSceneId;
    const offset = isSameScene ? 20 : 0;

    const pasted = [];
    for (const src of this._clipboard) {
      const obj = JSON.parse(JSON.stringify(src));
      if (offset > 0) {
        if (obj.x !== undefined) obj.x += offset;
        if (obj.y !== undefined) obj.y += offset;
        if (obj.points) {
          obj.points = obj.points.map(p => [p[0] + offset, p[1] + offset]);
        }
      }
      layer.objects.push(obj);
      pasted.push(obj);
    }

    editor.selectedObjects = pasted;
    editor.history.saveHistory();
    editor.canvas.render();
    editor.ui.updateObjectProperties();
    editor.ui.showToast(`已粘贴 ${pasted.length} 个对象`);
  }
}
