import { EditorDataManager, loadBuiltinGamesConfig, loadScenePresetsConfig, loadSceneTemplatesConfig } from './EditorDataManager.js';
        import { SceneEditor, loadEditorDefaults } from './SceneEditor.js';
        import { ImageSlicer } from './ImageSlicer.js';
        import { SceneDataLoader } from './SceneDataLoader.js';
        import { UIEditor } from './UIEditor.js';
        import { TriggerEditor } from './TriggerEditor.js';
        import { LibraryEditor } from './LibraryEditor.js';
        import { DialogueGraphEditor } from './DialogueGraphEditor.js';
        import { WorldMapEditor } from './WorldMapEditor.js';
        import { PanelEditor } from './PanelEditor.js';
        import { SystemEditor } from './SystemEditor.js';
        import { CanonicalDocumentService } from './CanonicalDocumentService.js';
        import { CanonicalEditorSession } from './CanonicalEditorSession.js';
        import { EditorSceneCommandService } from './EditorSceneCommandService.js';
        import { LocalStorageSceneCacheAdapter } from '../src/core/scene/CanonicalSceneAdapters.js';
        
        
import { EditorInteractionBase } from './EditorInteractionBase.js';

export class EditorInteractionScene extends EditorInteractionBase {            // 编辑游戏
            async editGame(gameId) {
                this.currentGameId = gameId;
                this.currentSceneId = null;
                const game = this.dataManager.setCurrentGame(gameId);
                
                // 暴露当前游戏信息给资源模块使用
                window._editorCurrentGame = game;
                
                if (!game) return;
                
                // 首次使用时从 _scene_order.json 初始化场景列表
                await this.dataManager.initScenesFromFile(gameId);
                try {
                    await this._ensureCanonicalProject(game);
                    const bindCanonical = editor => {
                        if (!editor) return;
                        editor.gameId = game.id;
                        editor.projectPath = this._canonicalProjectPath(game);
                        editor.canonicalSession = this._canonicalEditorSession('project');
                        editor.schemaFields = editor.canonicalSession.fields;
                    };
                    [this.triggerEditor, this.libraryEditor, this.dialogueEditor, this.systemEditor].forEach(bindCanonical);
                } catch (error) {
                    console.error('[Editor] 打开 canonical 项目失败:', error);
                    alert(`无法打开 canonical 项目: ${error.message}`);
                    return;
                }
                await this._refreshProjectTriggers();
                
                // 更新游戏选择器
                this._updateGameIndicator(gameId);
                
                document.getElementById('current-game-name').textContent = game.name;
                this.renderSceneList(gameId);
                this.showPage('scene-editor');
                
                // 初始化场景编辑器
                if (!this.sceneEditor) {
                    this.sceneEditor = new SceneEditor(
                        document.getElementById('scene-editor-container'),
                        this._sceneEditorOptions()
                    );
                    this.sceneEditor.onOpenSlicer = () => this.openSlicer();
                    this.sceneEditor.onSceneChange = (data) => this.saveScene(data);
                    this.sceneEditor.onClearCache = () => this.clearSceneCache();
                    this.sceneEditor.onSceneMetaChange = (meta) => this._handleSceneMetaChange(meta);
                }
                
                // 触发resize以正确显示编辑器
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                }, 100);
            }
            
            // 运行游戏
            playGame(gameId) {
                const game = this.dataManager.getAllGames().find(g => g.id === gameId);
                if (game && game.path) {
                    window.open(game.path + 'index.html', '_blank');
                }
            }
            
            // 删除游戏
            deleteGame(gameId) {
                if (confirm('确定要删除这个游戏吗？此操作不可撤销。')) {
                    this.dataManager.deleteGame(gameId);
                    this.renderCustomGames();
                }
            }
            
            // 创建游戏
            createGame() {
                const name = document.getElementById('game-name').value.trim();
                if (!name) {
                    alert('请输入游戏名称');
                    return;
                }
                
                const description = document.getElementById('game-description').value.trim();
                const thumbnailFile = document.getElementById('game-thumbnail').files[0];
                
                const game = this.dataManager.createGame({ name, description });
                
                if (thumbnailFile) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        game.thumbnail = e.target.result;
                        this.dataManager.updateGame(game.id, { thumbnail: game.thumbnail });
                        this.renderCustomGames();
                    };
                    reader.readAsDataURL(thumbnailFile);
                } else {
                    this.renderCustomGames();
                }
                
                this.hideModal('new-game-modal');
                document.getElementById('new-game-form').reset();
            }
            
            // 渲染场景列表
            renderSceneList(gameId) {
                let scenes = this.dataManager.getGameScenes(gameId);
                const list = document.getElementById('scene-list');
                
                // 筛选逻辑
                const filterType = document.getElementById('scene-filter-type')?.value || 'all';
                const filterWorldMap = document.getElementById('scene-filter-worldmap')?.value || '';
                // 「场景模板」筛选：列表只显示模板项
                if (filterType === 'template') {
                    list.innerHTML = this._buildTemplateSectionHtml();
                    this._bindTemplateItems(list);
                    this._refreshSceneConsumers();
                    return;
                }
                if (filterType === 'worldChunk') {
                    scenes = scenes.filter(s => s.sceneType === 'worldChunk');
                    if (filterWorldMap) scenes = scenes.filter(s => s.worldMap === filterWorldMap);
                } else if (filterType === 'standalone') {
                    scenes = scenes.filter(s => s.sceneType === 'standalone' || (!s.sceneType && !s.worldMap));
                }
                
                if (scenes.length === 0) {
                    list.innerHTML = '<div style="padding:15px;color:#666;text-align:center;">暂无场景，请创建新场景</div>';
                    this._refreshSceneConsumers();
                    return;
                }

                // 按已保存的排序顺序排列（无保存时按名称排序）
                const orderKey = `yijian18-engine_scene_order_${gameId}`;
                let savedOrder = null;
                try { savedOrder = JSON.parse(localStorage.getItem(orderKey)); } catch(e) {}
                // localStorage 无数据时，从 JSON 文件异步加载（首次渲染先用名称排序）
                if (!Array.isArray(savedOrder) || savedOrder.length === 0) {
                    const game = this.dataManager.getCurrentGame();
                    const gamePath = game ? game.path : '../example/sanguo_zhangjiao/';
                    const filePath = `${gamePath}assets/scenes/_scene_order.json`.replace(/^\.\.\//, '');
                    fetch(filePath).then(r => r.ok ? r.json() : null).then(data => {
                        if (data && Array.isArray(data.order) && data.order.length > 0) {
                            localStorage.setItem(orderKey, JSON.stringify(data.order));
                            this.renderSceneList(gameId); // 重新渲染
                        }
                    }).catch(() => {});
                }
                if (Array.isArray(savedOrder) && savedOrder.length > 0) {
                    const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
                    scenes.sort((a, b) => {
                        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
                        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
                        return ia - ib;
                    });
                } else {
                    scenes.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'));
                }
                
                list.innerHTML = scenes.map(scene => `
                    <div class="scene-item ${scene.id === this.currentSceneId ? 'active' : ''}" data-id="${scene.id}" draggable="true">
                        <span class="scene-drag-handle">⋮⋮</span>
                        <span class="scene-name">${scene.name}</span>
                        <div class="scene-actions">
                            <button data-action="edit">编辑</button>
                            <button data-action="delete">×</button>
                        </div>
                    </div>
                `).join('');
                
                // 绑定场景点击事件
                list.querySelectorAll('.scene-item:not(.template-item)').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const action = e.target.dataset.action;
                        const sceneId = item.dataset.id;
                        
                        if (action === 'edit') {
                            this.editScene(sceneId);
                        } else if (action === 'delete') {
                            this.deleteScene(sceneId);
                        } else {
                            this.editScene(sceneId);
                        }
                    });
                });

                // 拖拽排序（仅普通场景项参与，排除模板项）
                let dragItem = null;
                list.querySelectorAll('.scene-item:not(.template-item)').forEach(item => {
                    item.addEventListener('dragstart', (e) => {
                        dragItem = item;
                        item.style.opacity = '0.4';
                        e.dataTransfer.effectAllowed = 'move';
                    });
                    item.addEventListener('dragend', async () => {
                        item.style.opacity = '1';
                        dragItem = null;
                        list.querySelectorAll('.scene-item:not(.template-item)').forEach(el => el.classList.remove('drag-over'));
                        // 磁盘提交成功后才更新 localStorage 排序 cache。
                        const newOrder = [...list.querySelectorAll('.scene-item:not(.template-item)')].map(el => el.dataset.id);
                        try {
                            await this._saveSceneOrder(gameId, newOrder);
                            localStorage.setItem(orderKey, JSON.stringify(newOrder));
                        } catch (error) {
                            console.warn('保存 canonical 场景排序失败:', error);
                            this.sceneEditor?.ui?.showToast?.(`排序保存失败: ${error.message}`, 'error');
                            this.renderSceneList(gameId);
                        }
                    });
                    item.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (item !== dragItem) item.classList.add('drag-over');
                    });
                    item.addEventListener('dragleave', () => {
                        item.classList.remove('drag-over');
                    });
                    item.addEventListener('drop', (e) => {
                        e.preventDefault();
                        item.classList.remove('drag-over');
                        if (dragItem && dragItem !== item) {
                            // 在 DOM 中重新排列
                            const items = [...list.querySelectorAll('.scene-item:not(.template-item)')];
                            const fromIdx = items.indexOf(dragItem);
                            const toIdx = items.indexOf(item);
                            if (fromIdx < toIdx) {
                                item.after(dragItem);
                            } else {
                                item.before(dragItem);
                            }
                        }
                    });
                });
                this._refreshSceneConsumers();
            }

            /** 场景列表变化后同步已打开的事件/触发器控件。 */
            _refreshSceneConsumers() {
                this.sceneEditor?.ui?.updateObjectProperties?.();
                this.triggerEditor?.refreshSceneList?.();
            }

            // 填充世界地图筛选下拉（从 game.project.json 读 regions）
            async _populateWorldMapFilter() {
                const select = document.getElementById('scene-filter-worldmap');
                if (!select) return;
                select.innerHTML = '<option value="">所有地图</option>';
                const game = this.dataManager.getCurrentGame();
                const gamePath = game ? game.path : '../example/sanguo_zhangjiao/';
                const projectPath = `${gamePath}game.project.json`.replace(/^\.\.\//, '');
                try {
                    const res = await fetch('/api/read-file?path=' + encodeURIComponent(projectPath));
                    if (!res.ok) return;
                    const data = await res.json();
                    const project = (data && data.ok && data.content) ? JSON.parse(data.content) : null;
                    if (!project || !project.worldMap || !project.worldMap.regions) return;
                    for (const region of project.worldMap.regions) {
                        const opt = document.createElement('option');
                        opt.value = region.id;
                        opt.textContent = region.name || region.id;
                        select.appendChild(opt);
                    }
                } catch (e) { /* ignore */ }
            }
            
            // 编辑场景
            async editScene(sceneId) {
                this.currentSceneId = sceneId;
                // 退出模板编辑态（编辑的是普通游戏场景）
                this._editingTemplateId = null;
                
                // 确保场景编辑器已初始化
                if (!this.sceneEditor) {
                    this.sceneEditor = new SceneEditor(
                        document.getElementById('scene-editor-container'),
                        this._sceneEditorOptions()
                    );
                    this.sceneEditor.onOpenSlicer = () => this.openSlicer();
                    this.sceneEditor.onSceneChange = (data) => this.saveScene(data);
                    this.sceneEditor.onClearCache = () => this.clearSceneCache();
                    this.sceneEditor.onSceneMetaChange = (meta) => this._handleSceneMetaChange(meta);
                }
                
                // 先尝试加载预设场景作为基底（提供 terrain / atlases / decoSprites 等完整字段）
                let presetScene = null;
                try {
                    presetScene = await this.sceneLoader.loadScene(sceneId);
                } catch (e) {
                    console.warn('加载预设场景失败:', e);
                }
                
                // 磁盘 JSON 是唯一事实源；失败时只使用本次打开项目的最近 committed memory，不读无 provenance 的旧编辑器缓存。
                const fileScene = await this._loadSceneFromFile(sceneId, presetScene);
                let saved = fileScene;
                if (!saved) {
                    try {
                        saved = this.documentService.requireProject(this._canonicalProjectPath()).getCommittedSnapshot().scenes[sceneId] || null;
                    } catch (error) { saved = null; }
                }
                if (fileScene) {
                    // 用磁盘事实刷新只用于编辑器列表/显示的 legacy cache；它不具备 canonical fallback 资格。
                    this.dataManager.updateScene(this.currentGameId, sceneId, fileScene);
                    this.dataManager.setCurrentScene(sceneId);
                }
                
                let sceneToLoad;
                if (presetScene && saved) {
                    // 合并：预设提供完整字段，保存数据覆盖用户编辑过的内容
                    sceneToLoad = {
                        ...presetScene,
                        ...saved,
                        // 关键地形字段缺失时回退到预设，避免空白
                        terrain: saved.terrain || presetScene.terrain,
                        atlases: (saved.atlases && saved.atlases.length) ? saved.atlases : presetScene.atlases,
                        decoSprites: saved.decoSprites || presetScene.decoSprites,
                        // decorations 为空时回退到预设的程序化装饰物
                        decorations: (saved.decorations && saved.decorations.length) ? saved.decorations : presetScene.decorations,
                        centerX: saved.centerX ?? presetScene.centerX,
                        centerY: saved.centerY ?? presetScene.centerY,
                        basinRadius: saved.basinRadius ?? presetScene.basinRadius,
                        basinAspectY: saved.basinAspectY ?? presetScene.basinAspectY
                    };
                } else if (saved) {
                    sceneToLoad = saved;
                } else if (presetScene) {
                    sceneToLoad = presetScene;
                } else {
                    sceneToLoad = {
                        id: sceneId,
                        name: sceneId.replace('scene_', '').replace('_', ' '),
                        width: 1280,
                        height: 720,
                        backgroundColor: '#2a3a1a'
                    };
                }
                
                this.sceneEditor.loadScene(sceneToLoad);
                this.sceneEditor.refreshTriggerReferences?.();
                
                // 加载地形图集
                if (sceneToLoad.terrain && sceneToLoad.terrain.image) {
                    this.loadTerrainAtlas(sceneToLoad.terrain.image);
                }

                // 计算相邻场景数据（大地图多场景编辑参考）
                this._setupNeighborScenes(sceneId);
                
                this.renderSceneList(this.currentGameId);
                
                // 触发resize以正确显示编辑器
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                }, 50);
            }
            
            // 计算相邻场景数据，供多场景编辑参考
            async _setupNeighborScenes(currentSceneId) {
                if (!this.sceneEditor) return;
                this.sceneEditor.neighborScenes = [];

                // 从 game.project.json 的 worldMap 读取 grid
                const gameId = this.currentGameId || 'sanguo_zhangjiao';
                let worldMap = null;
                try {
                    const res = await fetch(`../example/${gameId}/game.project.json`);
                    const proj = await res.json();
                    worldMap = proj && proj.worldMap;
                } catch (e) { return; }
                if (!worldMap || !worldMap.regions || !worldMap.regions[0]) return;

                const region = worldMap.regions[0];
                const { chunkWidth, chunkHeight, cols, rows, grid } = region;
                if (!grid) return;

                // 找到当前场景在 grid 中的位置
                let myCol = -1, myRow = -1;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (grid[r] && grid[r][c] === currentSceneId) {
                            myCol = c; myRow = r;
                        }
                    }
                }
                if (myCol === -1) return;

                // 收集九宫格内的相邻场景
                const neighbors = [];
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const r = myRow + dr, c = myCol + dc;
                        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
                        const nId = grid[r] && grid[r][c];
                        if (!nId) continue;

                        // 加载邻居场景数据
                        let nScene = null;
                        const saved = this.dataManager.loadScenesData(gameId) || [];
                        nScene = saved.find(s => s.id === nId);
                        if (!nScene) {
                            try {
                                nScene = await this.sceneLoader.loadScene(nId);
                            } catch (e) {}
                        }
                        if (nScene) {
                            neighbors.push({
                                sceneData: nScene,
                                offsetX: dc * chunkWidth,
                                offsetY: dr * chunkHeight
                            });
                        }
                    }
                }

                this.sceneEditor.neighborScenes = neighbors;
                if (this.sceneEditor.showNeighbors) this.sceneEditor.render();
            }

            // localStorage 无数据时，从导出的场景 JSON 文件加载（选项2：清缓存不丢数据）
            async _loadSceneFromFile(sceneId, presetScene) {
                const gameId = this.currentGameId || 'sanguo_zhangjiao';
                const name = (presetScene && presetScene.name) || sceneId;
                
                // 优先用 sceneId 作为文件名，再用 name（处理 id 和文件名不一致的情况）
                const candidates = [sceneId];
                if (name !== sceneId) candidates.push(name);
                
                for (const filename of candidates) {
                    const path = `example/${gameId}/assets/scenes/${filename}.json`;
                    try {
                        const res = await fetch('/api/read-file?path=' + encodeURIComponent(path));
                        const data = await res.json();
                        if (data && data.ok && data.content) {
                            const parsed = JSON.parse(data.content);
                            const scenes = Array.isArray(parsed) ? parsed : [parsed];
                            const s = scenes.find(x => x && x.id === sceneId) || scenes[0];
                            if (s && s.layers) {
                                console.log('[Editor] 从文件恢复场景:', path);
                                return s;
                            }
                        }
                    } catch (e) {
                        // 继续尝试下一个候选文件名
                    }
                }
                console.warn('[Editor] 场景文件兜底加载失败，所有候选文件均无法匹配:', candidates);
                return null;
            }

            // 加载地形图集
            loadTerrainAtlas(imageUrl) {
                if (!this.sceneEditor) return;
                
                const img = new Image();
                img.onload = () => {
                    this.sceneEditor.loadedImages.set('terrain_atlas', img);
                    this.sceneEditor.render();
                };
                img.src = imageUrl;
            }
            
            // 填充"场景模板"下拉（打开新建场景弹窗时调用）
            populateSceneTemplates() {
                const sel = document.getElementById('scene-template');
                if (!sel) return;
                const { defaultTemplateId, templates } = this.dataManager.getSceneTemplates();
                sel.innerHTML = templates.map(t =>
                    `<option value="${t.id}">${t.name}</option>`
                ).join('');
                sel.value = defaultTemplateId;
                this.onSceneTemplateChange();
            }

            // 模板切换：显示描述，并把模板的宽高/背景色回填到表单（用户仍可再改）
            onSceneTemplateChange() {
                const sel = document.getElementById('scene-template');
                if (!sel) return;
                const tpl = this.dataManager.getSceneTemplate(sel.value);
                const descEl = document.getElementById('scene-template-desc');
                if (descEl) descEl.textContent = tpl ? (tpl.description || '') : '';
                if (tpl && tpl.scene) {
                    const s = tpl.scene;
                    if (s.width) document.getElementById('scene-width').value = s.width;
                    if (s.height) document.getElementById('scene-height').value = s.height;
                    if (s.backgroundColor) document.getElementById('scene-bg-color').value = s.backgroundColor;
                }
            }

            // 编辑模板：用场景编辑器打开模板的 scene 数据，保存时写回 scene-templates.json
            editSceneTemplate(templateId) {
                const tpl = this.dataManager.getSceneTemplate(templateId);
                if (!tpl) return;
                // 确保编辑器已初始化
                if (!this.sceneEditor) {
                    this.sceneEditor = new SceneEditor(
                        document.getElementById('scene-editor-container'),
                        this._sceneEditorOptions()
                    );
                    this.sceneEditor.onOpenSlicer = () => this.openSlicer();
                    this.sceneEditor.onSceneChange = (data) => this.saveScene(data);
                    this.sceneEditor.onClearCache = () => this.clearSceneCache();
                    this.sceneEditor.onSceneMetaChange = (meta) => this._handleSceneMetaChange(meta);
                }
                // 进入模板编辑态
                this._editingTemplateId = templateId;
                this.currentSceneId = null;
                // 模板 canonical 数据原样加载；资源选择和模板元信息不得注入场景文档。
                const sceneToLoad = structuredClone(tpl.scene || {});
                this.sceneEditor.loadScene(sceneToLoad);
                if (this.sceneEditor.ui && this.sceneEditor.ui.showToast) {
                    this.sceneEditor.ui.showToast('正在编辑模板「' + tpl.name + '」，保存将写回模板');
                }
                // 刷新左侧列表以高亮当前编辑的模板
                if (this.currentGameId) this.renderSceneList(this.currentGameId);
                window.dispatchEvent(new Event('resize'));
            }

            // 新建模板（克隆默认模板），随后进入编辑
            createNewTemplate() {
                const name = prompt('输入新模板名称：', '新模板');
                if (!name) return;
                const { template } = this.dataManager.createSceneTemplate({ name });
                this._saveTemplatesToFile();
                this.editSceneTemplate(template.id);
            }

            // 删除模板
            deleteTemplate(templateId) {
                const tpl = this.dataManager.getSceneTemplate(templateId);
                if (!tpl) return;
                if (!confirm('确定删除模板「' + tpl.name + '」？')) return;
                if (this._editingTemplateId === templateId) this._editingTemplateId = null;
                this.dataManager.deleteSceneTemplate(templateId);
                this._saveTemplatesToFile();
                // 刷新左侧列表
                if (this.currentGameId) this.renderSceneList(this.currentGameId);
            }

            // 把模板配置写回 editor/config/scene-templates.json
            _saveTemplatesToFile() {
                const cfg = this.dataManager.getSceneTemplatesConfig();
                const json = JSON.stringify(cfg, null, 2);
                fetch('/api/save-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'editor/config/scene-templates.json', content: json })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.ok) console.log('场景模板已保存到文件:', data.path);
                    else console.warn('保存模板文件失败:', data.error);
                })
                .catch(err => console.warn('保存模板文件请求失败:', err));
            }

            // 聚合当前游戏所有场景的图片资源（imageAssets）为一个合集，
            // 使模板编辑时的资源库图片与其他场景一致（含在某个场景新加、但尚未写入全局 images.json 的图片）。
            _collectAllSceneImages(base = {}) {
                const merged = { ...(base || {}) };
                try {
                    const scenes = this.dataManager.loadScenesData(this.currentGameId) || [];
                    for (const s of scenes) {
                        if (s && s.imageAssets) {
                            for (const [id, data] of Object.entries(s.imageAssets)) {
                                if (!merged[id]) merged[id] = JSON.parse(JSON.stringify(data));
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[模板] 聚合场景图片失败:', e);
                }
                return merged;
            }

            // 构建左侧列表底部的「场景模板」分组 HTML
            _buildTemplateSectionHtml() {
                const { templates } = this.dataManager.getSceneTemplates();
                const items = templates.map(t => `
                    <div class="scene-item template-item ${this._editingTemplateId === t.id ? 'active' : ''}" data-tpl-id="${t.id}" title="${t.description || ''}">
                        <span class="scene-name">📐 ${t.name}</span>
                        <div class="scene-actions">
                            <button data-tpl-action="edit">编辑</button>
                            <button data-tpl-action="delete">×</button>
                        </div>
                    </div>
                `).join('');
                return `
                    <div class="scene-template-section" style="margin-top:10px;border-top:1px solid #3a3a3a;padding-top:6px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;color:#8bc34a;font-size:12px;font-weight:bold;">
                            <span>场景模板</span>
                            <button id="inline-add-template" title="新建模板" style="padding:0 6px;">＋</button>
                        </div>
                        ${items || '<div style="padding:8px;color:#666;font-size:12px;text-align:center;">暂无模板</div>'}
                    </div>`;
            }

            // 绑定模板项的点击（编辑/删除）与新建模板按钮
            _bindTemplateItems(list) {
                list.querySelectorAll('.template-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const id = item.dataset.tplId;
                        const action = e.target.dataset.tplAction;
                        if (action === 'delete') this.deleteTemplate(id);
                        else this.editSceneTemplate(id);
                    });
                });
                const addBtn = list.querySelector('#inline-add-template');
                if (addBtn) addBtn.addEventListener('click', (e) => { e.stopPropagation(); this.createNewTemplate(); });
            }

            // 创建场景
            async createScene() {
                const name = document.getElementById('scene-name').value.trim();
                if (!name) {
                    alert('请输入场景名称');
                    return;
                }
                const scene = this.dataManager.createSceneDraft({
                    name,
                    templateId: document.getElementById('scene-template').value,
                    width: parseInt(document.getElementById('scene-width').value) || 1280,
                    height: parseInt(document.getElementById('scene-height').value) || 720,
                    backgroundColor: document.getElementById('scene-bg-color').value
                });
                try {
                    const { service, projectPath } = this._sceneCommands();
                    const result = await service.create(projectPath, { scene });
                    if (!result.ok) throw Object.assign(new Error(result.errors?.[0]?.reason || '创建场景失败'), { result });
                    this.dataManager.updateScene(this.currentGameId, scene.id, result.value.scenes[scene.id]);
                    this.hideModal('new-scene-modal');
                    document.getElementById('new-scene-form').reset();
                    this.renderSceneList(this.currentGameId);
                    await this.editScene(scene.id);
                    if (result.degraded) this.sceneEditor?.ui?.showToast?.('场景已提交到磁盘，但缓存/通知同步降级', 'warn');
                } catch (error) {
                    console.warn('创建 canonical 场景失败:', error);
                    alert(`创建场景失败: ${error.message}`);
                }
            }
            
            // 删除场景
            async deleteScene(sceneId) {
                if (!confirm('确定要删除这个场景吗？')) return;
                try {
                    const { service, projectPath } = this._sceneCommands();
                    const result = await service.delete(projectPath, { sceneId });
                    if (!result.ok) throw Object.assign(new Error(result.errors?.[0]?.reason || '删除场景失败'), { result });
                    this.dataManager.deleteScene(this.currentGameId, sceneId);
                    if (this.currentSceneId === sceneId) this.currentSceneId = null;
                    this.renderSceneList(this.currentGameId);
                    if (result.degraded) alert('场景已从磁盘删除，但缓存/通知同步降级；请重新加载项目。');
                } catch (error) {
                    console.warn('删除 canonical 场景失败:', error);
                    alert(`删除场景失败: ${error.message}`);
                }
            }
            
            // 保存场景
            async saveScene(sceneData) {
                // 模板编辑态：写回 scene-templates.json，而非游戏场景
                if (this._editingTemplateId) {
                    this.dataManager.upsertSceneTemplate(this._editingTemplateId, sceneData);
                    this._saveTemplatesToFile();
                    return;
                }
                if (!this.currentGameId || !this.currentSceneId) return;
                try {
                    const { service, projectPath } = this._sceneCommands();
                    const result = await service.save(projectPath, {
                        sceneId: this.currentSceneId,
                        sourceUri: `${projectPath.slice(0, -'/game.project.json'.length)}/assets/scenes/${this.currentSceneId}.json`,
                        scene: sceneData
                    });
                    if (!result.ok) throw Object.assign(new Error(result.errors?.[0]?.reason || '保存场景失败'), { result });
                    const editorCacheUpdated = this.dataManager.updateScene(this.currentGameId, this.currentSceneId, result.value.scenes[this.currentSceneId]);
                    if (result.degraded || !editorCacheUpdated) {
                        this.sceneEditor?.ui?.showToast?.('磁盘已提交，但缓存/通知同步失败；已禁用 canonical fallback', 'warn');
                        return { ...result, degraded: true, status: 'committed-with-degradation', code: 'committedWithDegradation' };
                    }
                    return result;
                } catch (error) {
                    console.warn('保存 canonical 场景失败:', error);
                    this.sceneEditor?.ui?.showToast?.(`保存失败: ${error.message}`, 'error');
                    throw error;
                }
            }

            // 处理场景元数据变更（名称/ID）
            async _handleSceneMetaChange(meta) {
                // 模板编辑态：只更新模板名称（模板 id 不允许改），写回 scene-templates.json
                if (this._editingTemplateId) {
                    if (meta.name !== undefined) {
                        this.dataManager.updateSceneTemplateMeta(this._editingTemplateId, { name: meta.name });
                        this._saveTemplatesToFile();
                        if (this.currentGameId) this.renderSceneList(this.currentGameId);
                    }
                    return;
                }
                if (!this.currentGameId || !this.currentSceneId) return;
                try {
                    const { service, projectPath } = this._sceneCommands();
                    if (meta.id && meta.oldId) {
                        const result = await service.rename(projectPath, { oldId: meta.oldId, newId: meta.id });
                        if (!result.ok) throw Object.assign(new Error(result.errors?.[0]?.reason || '重命名失败'), { result });
                        const cacheUpdated = this.dataManager.renameSceneId(this.currentGameId, meta.oldId, meta.id);
                        this.currentSceneId = meta.id;
                        if (this.sceneEditor?.sceneData) this.sceneEditor.sceneData.id = meta.id;
                        this.renderSceneList(this.currentGameId);
                        if (result.degraded || !cacheUpdated) {
                            this.sceneEditor?.ui?.showToast?.('重命名已提交到磁盘，但缓存同步降级；请重新打开项目', 'warn');
                        }
                    } else if (meta.name !== undefined) {
                        const model = this.documentService.requireProject(projectPath);
                        const scene = model.getCandidate().scenes[this.currentSceneId];
                        const result = await service.update(projectPath, {
                            sceneId: this.currentSceneId,
                            scene: { ...scene, name: meta.name },
                            orderEntry: { name: meta.name }
                        });
                        if (!result.ok) throw Object.assign(new Error(result.errors?.[0]?.reason || '更新名称失败'), { result });
                        this.dataManager.updateScene(this.currentGameId, this.currentSceneId, result.value.scenes[this.currentSceneId]);
                        this.renderSceneList(this.currentGameId);
                        if (result.degraded) this.sceneEditor?.ui?.showToast?.('名称已提交，但缓存/通知同步降级', 'warn');
                    }
                } catch (error) {
                    console.warn('场景元数据 canonical 提交失败:', error);
                    this.sceneEditor?.ui?.showToast?.(`修改失败: ${error.message}`, 'error');
                }
            }

}

export default EditorInteractionScene;
