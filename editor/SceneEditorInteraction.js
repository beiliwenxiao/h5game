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
        }
      }
    }
    return null;
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
        editor.interaction.objectStart = { x: clicked.x, y: clicked.y };
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
    if (editor.interaction.isDragging && (editor.selectedObjects.length > 0 || editor.interaction.isResizing)) {
      editor.history.saveHistory();
    }
    editor.interaction.isDragging = false;
    editor.interaction.isResizing = false;
    editor.interaction.resizeTarget = null;
    editor.interaction.resizeStart = null;
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
      items.push({ label: '上移一层', action: () => this._moveObjectInLayer(clicked, curLayer, 'up') });
      items.push({ label: '下移一层', action: () => this._moveObjectInLayer(clicked, curLayer, 'down') });
      items.push({ separator: true });
      items.push({ label: '置于顶层', action: () => this._moveObjectInLayer(clicked, curLayer, 'top') });
      items.push({ label: '置于底层', action: () => this._moveObjectInLayer(clicked, curLayer, 'bottom') });
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
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (editor.selectedObjects.length > 0) editor.ui.deleteSelectedObjects();
    }

    if (e.key === 'v' || e.key === 'V') editor.ui.setMode('select');
    else if (e.key === 'h' || e.key === 'H') editor.ui.setMode('pan');
    else if (e.key === 'p' || e.key === 'P') editor.ui.setMode('place');
  }
}
