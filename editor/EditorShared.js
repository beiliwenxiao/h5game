/**
 * EditorShared - 编辑器多页面共享模块
 * 负责：URL 参数解析、游戏/场景状态恢复、canonical 服务初始化、页面跳转
 */

import { EditorDataManager } from './EditorDataManager.js';
import { CanonicalDocumentService } from './CanonicalDocumentService.js';
import { CanonicalEditorSession } from './CanonicalEditorSession.js';
import { EditorSceneCommandService } from './EditorSceneCommandService.js';
import { LocalStorageSceneCacheAdapter } from '../src/core/scene/CanonicalSceneAdapters.js';

// 页面注册表：页面 ID → HTML 文件名
export const EDITOR_PAGES = Object.freeze({
  'game-list': 'index.html',
  'scene-workflow': 'scene-workflow.html',
  'ui-editor': 'ui-editor.html',
  'library-editor': 'library-editor.html',
  'dialogue-editor': 'dialogue-editor.html',
  'world-map-editor': 'world-map-editor.html',
  'panel-editor': 'panel-editor.html',
  'system-editor': 'system-editor.html'
});

// 导航项定义（顺序即显示顺序）
const NAV_ITEMS = Object.freeze([
  { id: 'game-list', label: '🎮 游戏列表', file: 'index.html' },
  { id: 'scene-workflow', label: '🗺️ 场景工作流', file: 'scene-workflow.html' },
  { id: 'ui-editor', label: '🎨 UI编辑器', file: 'ui-editor.html' },
  { id: 'library-editor', label: '📚 内容库', file: 'library-editor.html' },
  { id: 'dialogue-editor', label: '💬 对话', file: 'dialogue-editor.html' },
  { id: 'world-map-editor', label: '🌍 大地图', file: 'world-map-editor.html' },
  { id: 'panel-editor', label: '🧩 面板', file: 'panel-editor.html' },
  { id: 'system-editor', label: '⚙️ 系统', file: 'system-editor.html' }
]);

/**
 * 渲染统一导航栏到指定容器
 * @param {string} currentPageId - 当前页面 ID（用于高亮）
 * @param {string} containerId - 容器元素 ID（默认 'editor-nav'）
 */
export function renderEditorNav(currentPageId, containerId = 'editor-nav') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // 注入共享样式（只注入一次）
  if (!document.getElementById('editor-shared-nav-styles')) {
    const style = document.createElement('style');
    style.id = 'editor-shared-nav-styles';
    style.textContent = `
      .editor-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: #16213e; border-bottom: 1px solid #2a3a5e; flex-shrink: 0; }
      .editor-header h1 { font-size: 18px; color: #4CAF50; margin: 0; }
      .editor-nav { display: flex; gap: 8px; }
      .editor-nav button { padding: 6px 12px; background: #3a4a7e; border: none; border-radius: 4px; color: #fff; cursor: pointer; font-size: 13px; }
      .editor-nav button:hover { background: #4a5a9e; }
      .editor-nav button.active { background: #4CAF50; color: #000; }
      .game-selector { padding: 6px 12px; background: #2a3a5e; border: 1px solid #4CAF50; border-radius: 4px; color: #fff; font-size: 13px; margin-left: 12px; }
    `;
    document.head.appendChild(style);
  }

  const gameId = new URLSearchParams(window.location.search).get('gameId') || '';
  const query = gameId ? `?gameId=${encodeURIComponent(gameId)}` : '';

  container.innerHTML = `
    <div class="editor-header">
      <h1>🎮 游戏编辑器</h1>
      <nav class="editor-nav">
        ${NAV_ITEMS.map(item => `
          <button class="${item.id === currentPageId ? 'active' : ''}"
                  onclick="window.location.href='${item.file}${query}'">
            ${item.label}
          </button>
        `).join('')}
      </nav>
      ${gameId ? `<select id="game-selector" class="game-selector"></select>` : ''}
    </div>
  `;
}

/** 从当前 URL 读取查询参数 */
export function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    gameId: params.get('gameId') || null,
    sceneId: params.get('sceneId') || null,
    page: params.get('page') || null
  };
}

/** 构建带参数的页面 URL */
export function buildPageUrl(pageId, { gameId = null, sceneId = null } = {}) {
  const file = EDITOR_PAGES[pageId];
  if (!file) throw new Error(`Unknown editor page: ${pageId}`);
  const params = new URLSearchParams();
  if (gameId) params.set('gameId', gameId);
  if (sceneId) params.set('sceneId', sceneId);
  const query = params.toString();
  return query ? `${file}?${query}` : file;
}

/** 跳转到指定编辑器页面 */
export function navigateTo(pageId, context = {}) {
  window.location.href = buildPageUrl(pageId, context);
}

/**
 * 编辑器页面基础上下文：初始化数据管理器 + canonical 服务，恢复游戏/场景状态
 * 每个独立编辑器页面的入口 JS 都应通过此函数获取上下文
 */
export class EditorPageContext {
  constructor() {
    this.dataManager = new EditorDataManager();
    this.documentService = new CanonicalDocumentService();
    this._sceneCommandServices = new Map();
    this.currentGameId = null;
    this.currentSceneId = null;
    this._projectDefinitions = { triggers: [], tutorials: [] };
    this._projectTriggers = [];
    this._projectBattles = [];
    this._presentationProfile = null;
  }

  /** 初始化并恢复 URL 参数中的游戏/场景状态 */
  async init() {
    const { loadBuiltinGamesConfig, loadScenePresetsConfig, loadSceneTemplatesConfig } =
      await import('./EditorDataManager.js');
    const { loadEditorDefaults } = await import('./SceneEditor.js');

    await Promise.all([
      loadEditorDefaults(),
      loadBuiltinGamesConfig(),
      loadScenePresetsConfig(),
      loadSceneTemplatesConfig()
    ]);
    await this.dataManager.init();

    // 从 URL 恢复当前游戏/场景
    const { gameId, sceneId } = getQueryParams();
    if (gameId) {
      await this.setCurrentGame(gameId, sceneId);
    }
    return this;
  }

  async setCurrentGame(gameId, sceneId = null) {
    this.currentGameId = gameId;
    this.currentSceneId = sceneId;
    const game = this.dataManager.setCurrentGame(gameId);
    window._editorCurrentGame = game;
    if (!game) return null;

    await this.dataManager.initScenesFromFile(gameId);
    await this._ensureCanonicalProject(game);
    await this._refreshProjectTriggers();
    return game;
  }

  _canonicalProjectPath(game = this.dataManager.getCurrentGame()) {
    return `${game?.path || '../example/sanguo_zhangjiao/'}game.project.json`
      .replace(/\\/g, '/')
      .replace(/^(?:\.\.\/)+/, '');
  }

  async _readCanonicalJson(filePath) {
    const response = await fetch('/api/read-file?path=' + encodeURIComponent(filePath));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || typeof payload.content !== 'string') {
      throw new Error(payload.error || `无法读取 canonical 文件: ${filePath}`);
    }
    return JSON.parse(payload.content);
  }

  async _loadCanonicalProjectAggregate(projectPath) {
    const project = await this._readCanonicalJson(projectPath);
    const root = projectPath.slice(0, -'/game.project.json'.length);
    const sceneRoot = `${root}/assets/scenes/`;
    const sceneOrder = await this._readCanonicalJson(`${sceneRoot}_scene_order.json`);
    const scenes = {};
    await Promise.all((project.scenes || []).map(async entry => {
      scenes[entry.id] = await this._readCanonicalJson(`${sceneRoot}${entry.id}.json`);
    }));
    return { project, sceneOrder, scenes };
  }

  async _ensureCanonicalProject(game) {
    const projectPath = this._canonicalProjectPath(game);
    if (!this.documentService.getProject(projectPath)) {
      const canonical = await this._loadCanonicalProjectAggregate(projectPath);
      this.documentService.openProject({ sourceUri: projectPath, canonical, snapshotRevision: 1 });
    }
    if (!this._sceneCommandServices.has(projectPath)) {
      this._sceneCommandServices.set(projectPath, new EditorSceneCommandService({
        documentService: this.documentService,
        cacheAdapter: new LocalStorageSceneCacheAdapter({ gameId: game.id }),
        readCommittedSnapshot: async () => ({
          canonical: await this._loadCanonicalProjectAggregate(projectPath),
          snapshotRevision: this.documentService.requireProject(projectPath).snapshotRevision + 1
        }),
        notifier: event => window.dispatchEvent(new CustomEvent('editor-canonical-committed', { detail: event }))
      }));
    }
    return this._sceneCommandServices.get(projectPath);
  }

  _sceneCommands() {
    const projectPath = this._canonicalProjectPath();
    const service = this._sceneCommandServices.get(projectPath);
    if (!service) throw new Error('canonical 项目尚未打开');
    return { service, projectPath };
  }

  _canonicalEditorSession(rootPath = 'project', schemaId = 'gameProject') {
    const { service, projectPath } = this._sceneCommands();
    return new CanonicalEditorSession({
      sourceUri: projectPath,
      documentService: this.documentService,
      commandService: service,
      schemaRegistry: service.validator.projectPipeline.contentValidator,
      consumptionRegistry: service.validator.configConsumptionRegistry,
      schemaId,
      rootPath
    });
  }

  async _refreshProjectTriggers(project = null) {
    try {
      const game = this.dataManager.getCurrentGame();
      const gamePath = game ? game.path : '../example/sanguo_zhangjiao/';
      if (!project) {
        const projectPath = `${gamePath}game.project.json`.replace(/^\.\.\//, '');
        const response = await fetch('/api/read-file?path=' + encodeURIComponent(projectPath));
        const data = response.ok ? await response.json() : null;
        project = data?.ok && data.content ? JSON.parse(data.content) : null;
      }
      this._projectDefinitions = {
        triggers: Array.isArray(project?.triggers) ? project.triggers : [],
        tutorials: Array.isArray(project?.tutorials) ? project.tutorials : []
      };
      this._projectTriggers = this._projectDefinitions.triggers;
      const battleEntries = Array.isArray(project?.battles) ? project.battles : [];
      this._projectBattles = (await Promise.all(battleEntries.map(async entry => {
        if (entry?.battleId) return entry;
        if (!entry?.$ref) return null;
        try {
          const battlePath = `${gamePath}${entry.$ref}`.replace(/^\.\.\//, '');
          const response = await fetch('/api/read-file?path=' + encodeURIComponent(battlePath));
          const data = response.ok ? await response.json() : null;
          return data?.ok && data.content ? JSON.parse(data.content) : null;
        } catch (error) {
          console.warn(`[Editor] 加载战役定义失败: ${entry.$ref}`, error);
          return null;
        }
      }))).filter(entry => entry?.battleId);
      this._presentationProfile = null;
      const profileRef = project?.presentation?.$ref;
      if (profileRef) {
        const profilePath = `${gamePath}${profileRef}`.replace(/^\.\.\//, '');
        const response = await fetch('/api/read-file?path=' + encodeURIComponent(profilePath));
        const data = response.ok ? await response.json() : null;
        this._presentationProfile = data?.ok && data.content ? JSON.parse(data.content) : null;
      }
    } catch (error) {
      console.warn('[Editor] 加载项目触发器/战役/表现规格失败', error);
      this._projectDefinitions = { triggers: [], tutorials: [] };
      this._projectTriggers = this._projectDefinitions.triggers;
      this._projectBattles = [];
      this._presentationProfile = null;
    }
    return this._projectTriggers;
  }

  /** 供 TriggerEditor 等使用的场景文档获取器 */
  getSceneDocuments() {
    let scenes = {};
    try {
      scenes = {
        ...this.documentService.requireProject(this._canonicalProjectPath()).getCommittedSnapshot().scenes
      };
    } catch (error) {
      console.warn('EditorPageContext: 获取 committed 场景快照失败', error);
    }
    return Object.values(scenes);
  }

  /** 供 TriggerEditor 等使用的放置点获取器 */
  getPlacementOptions(sceneEditor = null) {
    const sceneData = sceneEditor?.sceneData;
    const sceneId = this.currentSceneId || sceneData?.id || '';
    return (sceneData?.layers || []).flatMap(layer =>
      (layer?.objects || []).filter(object => object?.type === 'ref')
        .map(object => ({ ...object, sceneId: object.sceneId || sceneId }))
    );
  }
}

export default EditorPageContext;
