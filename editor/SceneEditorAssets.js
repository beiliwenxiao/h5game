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

      if (id === 'rect') {
        editor.ui.addObject({ type: 'rect', x: pos.x - 32, y: pos.y - 32, width: 64, height: 64, fill: '#4a5a8e' });
      } else if (id === 'circle') {
        editor.ui.addObject({ type: 'circle', x: pos.x, y: pos.y, radius: 32, fill: '#4a8e5a' });
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
      <div class="asset-item placeholder" draggable="true" data-type="fill">
        <div class="asset-preview fill" style="background:linear-gradient(135deg,#333,#666);border:1px dashed #888;"></div>
        <span>背景填充</span>
      </div>
    `;
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

      let slicesHtml = '';
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
        <div class="atlas-header">
          <span>${atlas.name}</span>
          <span style="font-size:10px;color:#666;">${atlas.width}×${atlas.height}</span>
        </div>
        <div class="slice-grid">${slicesHtml}</div>
      `;

      list.appendChild(item);
    }

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
