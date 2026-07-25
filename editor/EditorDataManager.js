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
 * EditorDataManager - 游戏编辑器数据管理器
 * 
 * 负责：
 * - 管理游戏列表（从example目录读取）
 * - 管理场景数据（保存/加载场景配置）
 * - 导入/导出背景数据
 * - 使用 localStorage 保存编辑器状态
 * - 所有默认值从 config/ 目录下的 JSON 文件加载
 */

// 运行时配置缓存
let _builtinGamesConfig = null;
let _scenePresetsConfig = null;
let _sceneTemplatesConfig = null;

/**
 * 加载内置游戏配置
 */
async function loadBuiltinGamesConfig() {
  if (_builtinGamesConfig) return _builtinGamesConfig;
  try {
    const resp = await fetch('./config/builtin-games.json');
    _builtinGamesConfig = await resp.json();
  } catch (e) {
    console.warn('加载内置游戏配置失败，使用内置默认值:', e);
    _builtinGamesConfig = { games: [] };
  }
  return _builtinGamesConfig;
}

/**
 * 加载场景预设配置
 */
async function loadScenePresetsConfig() {
  if (_scenePresetsConfig) return _scenePresetsConfig;
  try {
    const resp = await fetch('./config/scene-presets.json');
    _scenePresetsConfig = await resp.json();
  } catch (e) {
    console.warn('加载场景预设配置失败，使用内置默认值:', e);
    _scenePresetsConfig = { sceneNames: {}, scenes: {} };
  }
  return _scenePresetsConfig;
}

/**
 * 加载场景模板配置（多套可复用的新建场景模板）
 */
async function loadSceneTemplatesConfig() {
  if (_sceneTemplatesConfig) return _sceneTemplatesConfig;
  try {
    const resp = await fetch('./config/scene-templates.json');
    _sceneTemplatesConfig = await resp.json();
  } catch (e) {
    console.warn('加载场景模板配置失败，使用内置默认值:', e);
    _sceneTemplatesConfig = {
      defaultTemplateId: 'tpl_blank',
      templates: [{
        id: 'tpl_blank',
        name: '空白场景',
        description: '最基础的空场景',
        category: 'basic',
        scene: {
          width: 1280, height: 720, backgroundColor: '#2a3a1a', type: 'terrain',
          layers: [
            { id: 'layer_bg', name: '背景层', visible: true, locked: false, objects: [] },
            { id: 'layer_fill', name: '背景填充层', visible: true, locked: false, objects: [] },
            { id: 'layer_deco', name: '装饰层', visible: true, locked: false, objects: [] },
            { id: 'layer_entity', name: '实体层', visible: true, locked: false, objects: [] },
            { id: 'layer_placement', name: '放置层', visible: true, locked: false, objects: [] },
            { id: 'layer_logic', name: '逻辑对象', visible: true, locked: false, objects: [] }
          ]
        }
      }]
    };
  }
  return _sceneTemplatesConfig;
}

export { loadBuiltinGamesConfig, loadScenePresetsConfig, loadSceneTemplatesConfig };

export class EditorDataManager {
  constructor() {
    this.storageKey = 'yijian18-engine_editor_data';
    this.gamesListKey = 'yijian18-engine_editor_games';
    
    // 内置游戏列表（从 JSON 配置加载，初始使用硬编码后备）
    this.builtinGames = (_builtinGamesConfig && _builtinGamesConfig.games) || [
      {
        id: 'sanguo_zhangjiao',
        name: '三国张角传',
        description: '东汉末年，太平道首领张角的传奇故事',
        thumbnail: '../example/sanguo_zhangjiao/assets/images/003.png',
        path: '../example/sanguo_zhangjiao/',
        scenes: ['PrologueScene', 'Act1Scene', 'Act2Scene', 'Act3Scene', 'Act4Scene', 'Act5Scene', 'Act6Scene']
      },
      {
        id: 'sanguo_zhangjiao_3d',
        name: '三国张角传 3D',
        description: '3D版本的张角传',
        thumbnail: '../example/sanguo_zhangjiao_3d/assets/images/002.png',
        path: '../example/sanguo_zhangjiao_3d/',
        scenes: ['PrologueScene', 'BaseGameScene']
      }
    ];
    
    // 用户创建的游戏
    this.customGames = this.loadCustomGames();
    
    // 当前编辑的游戏
    this.currentGame = null;
    
    // 当前编辑的场景
    this.currentScene = null;
    
    // 场景名称映射（从 JSON 配置加载）
    this._sceneNames = (_scenePresetsConfig && _scenePresetsConfig.sceneNames) || {
      'PrologueScene': '序章 - 盆地营地',
      'Act1Scene': '第一幕 - 起义军营',
      'Act2Scene': '第二幕 - 战场',
      'Act3Scene': '第三幕 - 城池',
      'Act4Scene': '第四幕 - 山寨',
      'Act5Scene': '第五幕 - 决战',
      'Act6Scene': '第六幕 - 结局',
      'BaseGameScene': '游戏主场景'
    };
  }
  
  /**
   * 异步初始化 - 从 JSON 配置文件加载默认值
   * 应在使用编辑器前调用
   */
  async init() {
    const [gamesConfig, presetsConfig] = await Promise.all([
      loadBuiltinGamesConfig(),
      loadScenePresetsConfig()
    ]);
    
    if (gamesConfig && gamesConfig.games && gamesConfig.games.length > 0) {
      this.builtinGames = gamesConfig.games;
    }
    if (presetsConfig && presetsConfig.sceneNames) {
      this._sceneNames = presetsConfig.sceneNames;
    }
    
    return this;
  }
  
  /**
   * 获取所有游戏（内置 + 用户创建）
   */
  getAllGames() {
    return [...this.builtinGames, ...this.customGames];
  }
  
  /**
   * 获取内置游戏列表
   */
  getBuiltinGames() {
    return this.builtinGames;
  }
  
  /**
   * 获取用户创建的游戏列表
   */
  getCustomGames() {
    return this.customGames;
  }
  
  /**
   * 加载用户创建的游戏
   */
  loadCustomGames() {
    try {
      const data = localStorage.getItem(this.gamesListKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('加载自定义游戏失败:', e);
      return [];
    }
  }
  
  /**
   * 保存用户创建的游戏列表
   */
  saveCustomGames() {
    try {
      localStorage.setItem(this.gamesListKey, JSON.stringify(this.customGames));
      return true;
    } catch (e) {
      console.error('保存自定义游戏失败:', e);
      return false;
    }
  }
  
  /**
   * 创建新游戏
   * @param {Object} gameData - 游戏数据
   */
  createGame(gameData) {
    const game = {
      id: 'game_' + Date.now(),
      name: gameData.name || '新游戏',
      description: gameData.description || '',
      thumbnail: gameData.thumbnail || '',
      path: gameData.path || '',
      scenes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.customGames.push(game);
    this.saveCustomGames();
    return game;
  }
  
  /**
   * 更新游戏
   * @param {string} gameId - 游戏ID
   * @param {Object} gameData - 更新数据
   */
  updateGame(gameId, gameData) {
    const index = this.customGames.findIndex(g => g.id === gameId);
    if (index === -1) {
      // 检查是否是内置游戏
      const builtin = this.builtinGames.find(g => g.id === gameId);
      if (builtin) {
        // 内置游戏不允许直接修改，创建副本
        const copy = {
          ...builtin,
          ...gameData,
          id: 'game_' + Date.now(),
          sourceId: gameId,
          updatedAt: new Date().toISOString()
        };
        this.customGames.push(copy);
        this.saveCustomGames();
        return copy;
      }
      return null;
    }
    
    this.customGames[index] = {
      ...this.customGames[index],
      ...gameData,
      updatedAt: new Date().toISOString()
    };
    this.saveCustomGames();
    return this.customGames[index];
  }
  
  /**
   * 删除游戏
   * @param {string} gameId - 游戏ID
   */
  deleteGame(gameId) {
    const index = this.customGames.findIndex(g => g.id === gameId);
    if (index !== -1) {
      this.customGames.splice(index, 1);
      this.saveCustomGames();
      return true;
    }
    return false;
  }
  
  /**
   * 设置当前编辑的游戏
   * @param {string} gameId - 游戏ID
   */
  setCurrentGame(gameId) {
    this.currentGame = this.getAllGames().find(g => g.id === gameId) || null;
    return this.currentGame;
  }
  
  /**
   * 获取当前游戏
   */
  getCurrentGame() {
    return this.currentGame;
  }
  
  /**
   * 获取游戏的所有场景
   * @param {string} gameId - 游戏ID
   */
  getGameScenes(gameId) {
    const game = this.getAllGames().find(g => g.id === gameId);
    if (!game) return [];
    
    // 从 localStorage 加载场景数据
    const saved = this.loadScenesData(gameId);
    
    // localStorage 无数据时返回空（等待异步初始化）
    if (!saved || saved.length === 0) {
      return [];
    }
    
    return saved.map(s => ({
      id: s.id,
      name: s.name || s.id,
      type: s.type || 'terrain',
      sceneType: s.sceneType || null,
      worldMap: s.worldMap || null
    }));
  }
  
  /**
   * 从 _scene_order.json 文件初始化场景列表（首次使用时调用）
   * @param {string} gameId - 游戏ID
   * @returns {Promise<boolean>} 是否成功初始化
   */
  async initScenesFromFile(gameId) {
    const existing = this.loadScenesData(gameId);
    
    const game = this.getAllGames().find(g => g.id === gameId);
    if (!game) return false;
    
    const gamePath = game.path || '../example/sanguo_zhangjiao/';
    // 使用 /api/read-file 读取（路径相对于项目根，避免相对路径 404）
    const apiPath = `${gamePath}assets/scenes/_scene_order.json`.replace(/^\.\.\//g, '');
    
    try {
      // 优先用 API 读取（Vite dev server 提供的绝对路径 API）
      let data = null;
      try {
        const apiResp = await fetch('/api/read-file?path=' + encodeURIComponent(apiPath));
        if (apiResp.ok) {
          const apiData = await apiResp.json();
          if (apiData && apiData.ok && apiData.content) {
            data = JSON.parse(apiData.content);
          }
        }
      } catch (e) { /* fallback to direct fetch */ }
      
      // API 不可用时回退到直接 fetch（静态文件）
      if (!data) {
        const directPath = `${gamePath}assets/scenes/_scene_order.json`;
        const resp = await fetch(directPath);
        if (resp.ok) {
          data = await resp.json();
        }
      }
      
      if (!data) throw new Error('无法加载 _scene_order.json');

      // 从 game.project.json 读 worldMap grid 推断 sceneType
      let worldChunkIds = new Set();
      let worldMapForScene = {};
      try {
        const projPath = `${gamePath}game.project.json`.replace(/^\.\.\//g, '');
        const projResp = await fetch('/api/read-file?path=' + encodeURIComponent(projPath));
        if (projResp.ok) {
          const projData = await projResp.json();
          const project = (projData && projData.ok && projData.content) ? JSON.parse(projData.content) : null;
          if (project && project.worldMap && project.worldMap.regions) {
            for (const region of project.worldMap.regions) {
              if (!region.grid) continue;
              for (const row of region.grid) {
                if (!row) continue;
                for (const sceneId of row) {
                  if (sceneId) {
                    worldChunkIds.add(sceneId);
                    worldMapForScene[sceneId] = region.id;
                  }
                }
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
      
      if (data && data.scenes && Array.isArray(data.order)) {
        // 从文件中的 scenes 字段构建场景列表，按 order 排序
        const fileScenes = data.order
          .filter(id => data.scenes[id])
          .map(id => {
            const info = data.scenes[id];
            // sceneType 优先从 _scene_order.json 读，否则从 worldMap 推断
            const sceneType = info.sceneType || (worldChunkIds.has(id) ? 'worldChunk' : 'standalone');
            const worldMap = info.worldMap || worldMapForScene[id] || null;
            return { id, name: info.name || id, type: info.type || 'terrain', sceneType, worldMap };
          });
        // 追加 order 中没有但 scenes 里有的
        for (const [id, info] of Object.entries(data.scenes)) {
          if (!data.order.includes(id)) {
            const sceneType = info.sceneType || (worldChunkIds.has(id) ? 'worldChunk' : 'standalone');
            const worldMap = info.worldMap || worldMapForScene[id] || null;
            fileScenes.push({ id, name: info.name || id, type: info.type || 'terrain', sceneType, worldMap });
          }
        }
        
        if (existing && existing.length > 0) {
          // 已有数据时：合并新增场景 + 同步 sceneType/worldMap 到已有场景
          const existingMap = new Map(existing.map(s => [s.id, s]));
          let changed = false;
          for (const fs of fileScenes) {
            if (existingMap.has(fs.id)) {
              // 已有场景：同步 sceneType 和 worldMap（如果原来没有或不一致）
              const ex = existingMap.get(fs.id);
              if (ex.sceneType !== fs.sceneType || ex.worldMap !== fs.worldMap) {
                ex.sceneType = fs.sceneType;
                ex.worldMap = fs.worldMap;
                changed = true;
              }
            } else {
              // 新场景
              existing.push(fs);
              changed = true;
            }
          }
          // 对于不在 fileScenes 中的已有场景，也根据 worldMap 推断 sceneType
          for (const ex of existing) {
            if (!ex.sceneType) {
              ex.sceneType = worldChunkIds.has(ex.id) ? 'worldChunk' : 'standalone';
              ex.worldMap = worldMapForScene[ex.id] || null;
              changed = true;
            }
          }
          if (changed) {
            this.saveScenesData(gameId, existing);
            return true;
          }
          return false;
        }
        
        // localStorage 无数据时：整体写入
        if (fileScenes.length > 0) {
          this.saveScenesData(gameId, fileScenes);
          return true;
        }
      }
      
      // 旧格式文件（只有 order 没有 scenes）：回退到 game.scenes 配置初始化
      if (data && Array.isArray(data.order) && data.order.length > 0) {
        return this._initScenesFromConfig(gameId);
      }
    } catch (e) {
      // 文件不存在或读取失败，回退到 game.scenes 配置初始化
      console.warn('[EditorDataManager] initScenesFromFile 失败:', e.message);
    }
    
    // 已有数据时不回退覆盖
    if (existing && existing.length > 0) return false;
    
    return this._initScenesFromConfig(gameId);
  }
  
  /**
   * 从 game.scenes 配置初始化场景列表（兜底）
   * @private
   */
  _initScenesFromConfig(gameId) {
    const game = this.getAllGames().find(g => g.id === gameId);
    if (!game || !game.scenes || game.scenes.length === 0) return false;
    
    const sceneNames = this._sceneNames;
    const scenes = game.scenes.map(name => ({
      id: 'scene_' + name.replace('Scene', ''),
      name: sceneNames[name] || name.replace('Scene', ''),
      type: 'terrain'
    }));
    this.saveScenesData(gameId, scenes);
    return true;
  }
  
  /**
   * 加载场景数据
   * @param {string} gameId - 游戏ID
   */
  loadScenesData(gameId) {
    try {
      const key = `${this.storageKey}_scenes_${gameId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('加载场景数据失败:', e);
      return null;
    }
  }
  
  /**
   * 保存场景数据
   * @param {string} gameId - 游戏ID
   * @param {Array} scenes - 场景列表
   */
  saveScenesData(gameId, scenes) {
    try {
      const key = `${this.storageKey}_scenes_${gameId}`;
      localStorage.setItem(key, JSON.stringify(scenes));
      return true;
    } catch (e) {
      console.error('保存场景数据失败:', e);
      return false;
    }
  }
  
  /**
   * 清理重复的场景脏数据
   *
   * 历史 bug 曾用 `scene_<timestamp>` 这种 id 重复保存了同名场景。
   * 此方法把同名记录合并：同名记录里选内容最丰富的保留。
   * @param {string} gameId - 游戏ID
   * @returns {boolean} 是否发生了清理
   */
  cleanupDuplicateScenes(gameId) {
    const scenes = this.loadScenesData(gameId);
    if (!scenes || scenes.length === 0) return false;
    
    // 衡量场景"内容丰富度"：装饰物 + 各图层对象总数
    const richness = (s) => {
      let n = Array.isArray(s.decorations) ? s.decorations.length : 0;
      if (Array.isArray(s.layers)) {
        for (const l of s.layers) n += (l.objects?.length || 0);
      }
      return n;
    };
    
    // 按 name 分组
    const byName = new Map();
    for (const s of scenes) {
      const list = byName.get(s.name) || [];
      list.push(s);
      byName.set(s.name, list);
    }
    
    const cleaned = [];
    let changed = false;
    
    for (const [name, list] of byName.entries()) {
      if (list.length === 1) {
        cleaned.push(list[0]);
        continue;
      }
      changed = true;
      // 多条同名：选内容最丰富的（并列时选最后更新的）
      list.sort((a, b) => {
        const r = richness(b) - richness(a);
        if (r !== 0) return r;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
      cleaned.push(list[0]);
    }
    
    if (changed) {
      this.saveScenesData(gameId, cleaned);
    }
    return changed;
  }
  
  /**
   * 获取所有场景模板（含默认模板 id）
   * @returns {{ defaultTemplateId:string, templates:Array }}
   */
  getSceneTemplates() {
    const cfg = _sceneTemplatesConfig || { defaultTemplateId: 'tpl_blank', templates: [] };
    return { defaultTemplateId: cfg.defaultTemplateId || 'tpl_blank', templates: cfg.templates || [] };
  }

  /**
   * 按 id 获取单个模板
   * @param {string} templateId
   * @returns {Object|null}
   */
  getSceneTemplate(templateId) {
    const { templates } = this.getSceneTemplates();
    return templates.find(t => t && t.id === templateId) || null;
  }

  /**
   * 获取完整模板配置对象（用于写回 scene-templates.json）
   * @returns {Object}
   */
  getSceneTemplatesConfig() {
    if (!_sceneTemplatesConfig) _sceneTemplatesConfig = { defaultTemplateId: 'tpl_blank', templates: [] };
    return _sceneTemplatesConfig;
  }

  /**
   * 更新（或新增）某模板的场景数据与元信息（写入内存配置，文件写入由调用方通过 API 完成）。
   * @param {string} templateId
   * @param {Object} sceneData - 编辑器保存的完整场景数据（作为模板 scene）
   * @param {Object} [meta] - { name, description, category }
   * @returns {Object} 更新后的完整模板配置
   */
  upsertSceneTemplate(templateId, sceneData, meta = {}) {
    const cfg = this.getSceneTemplatesConfig();
    cfg.templates = cfg.templates || [];
    let tpl = cfg.templates.find(t => t && t.id === templateId);
    if (!tpl) {
      tpl = { id: templateId, name: meta.name || templateId, description: meta.description || '', category: meta.category || 'custom', thumbnail: '' };
      cfg.templates.push(tpl);
    }
    if (meta.name !== undefined) tpl.name = meta.name;
    if (meta.description !== undefined) tpl.description = meta.description;
    if (meta.category !== undefined) tpl.category = meta.category;
    // 仅当传入了有效场景数据时才覆盖 scene（避免改名等只带 meta 的场景把 scene 清空）
    if (sceneData && typeof sceneData === 'object') {
      const scene = JSON.parse(JSON.stringify(sceneData));
      // 剥离与模板无关的实例字段（id/时间戳等运行实例信息）
      delete scene.id;
      delete scene.createdAt;
      delete scene.updatedAt;
      delete scene.templateId;
      tpl.scene = scene;
    }
    return cfg;
  }

  /**
   * 仅更新模板元信息（名称/描述/分类），不改动 scene。用于编辑器内改模板名称。
   * @param {string} templateId
   * @param {Object} meta - { name?, description?, category? }
   * @returns {Object} 更新后的完整模板配置
   */
  updateSceneTemplateMeta(templateId, meta = {}) {
    return this.upsertSceneTemplate(templateId, null, meta);
  }

  /**
   * 新建模板：以 baseTemplateId 的场景为初始内容克隆一份新模板。
   * @param {Object} opts - { name, description?, category?, baseTemplateId? }
   * @returns {{ template:Object, config:Object }}
   */
  createSceneTemplate(opts = {}) {
    const cfg = this.getSceneTemplatesConfig();
    cfg.templates = cfg.templates || [];
    const baseId = opts.baseTemplateId || cfg.defaultTemplateId || (cfg.templates[0] && cfg.templates[0].id);
    const baseTpl = this.getSceneTemplate(baseId);
    const scene = baseTpl && baseTpl.scene ? JSON.parse(JSON.stringify(baseTpl.scene))
      : { width: 1280, height: 720, backgroundColor: '#2a3a1a', type: 'terrain', layers: [] };
    const template = {
      id: 'tpl_' + Date.now(),
      name: opts.name || '新模板',
      description: opts.description || '',
      category: opts.category || 'custom',
      thumbnail: '',
      scene
    };
    cfg.templates.push(template);
    return { template, config: cfg };
  }

  /**
   * 删除模板（不允许删除到空；defaultTemplateId 被删时回退到第一个模板）。
   * @param {string} templateId
   * @returns {Object} 更新后的完整模板配置
   */
  deleteSceneTemplate(templateId) {
    const cfg = this.getSceneTemplatesConfig();
    cfg.templates = (cfg.templates || []).filter(t => t && t.id !== templateId);
    if (cfg.defaultTemplateId === templateId) {
      cfg.defaultTemplateId = (cfg.templates[0] && cfg.templates[0].id) || 'tpl_blank';
    }
    return cfg;
  }

  /**
   * 创建新场景。若指定 templateId，则以该模板的 scene 数据为初始内容（深拷贝），
   * 再用 sceneData 中用户填写的字段覆盖（name / 宽高 / 背景色）。
   * 无模板时回退到最小空场景（保持旧行为）。
   * @param {string} gameId - 游戏ID
   * @param {Object} sceneData - 场景数据 { name, width, height, backgroundColor, templateId }
   */
  createScene(gameId, sceneData = {}) {
    const scenes = this.loadScenesData(gameId) || [];
    const editorDefaults = { width: 1280, height: 720, backgroundColor: '#2a3a1a' };

    // 1. 取模板（未指定则用默认模板）
    const { defaultTemplateId } = this.getSceneTemplates();
    const templateId = sceneData.templateId || defaultTemplateId;
    const template = this.getSceneTemplate(templateId);
    // 深拷贝模板 scene 作为初始数据，避免污染模板本身
    const base = template && template.scene
      ? JSON.parse(JSON.stringify(template.scene))
      : {
          layers: [
            { id: 'layer_bg', name: '背景层', visible: true, locked: false, objects: [] },
            { id: 'layer_fill', name: '背景填充层', visible: true, locked: false, objects: [] },
            { id: 'layer_deco', name: '装饰层', visible: true, locked: false, objects: [] },
            { id: 'layer_entity', name: '实体层', visible: true, locked: false, objects: [] },
            { id: 'layer_placement', name: '放置层', visible: true, locked: false, objects: [] },
            { id: 'layer_logic', name: '逻辑对象', visible: true, locked: false, objects: [] }
          ]
        };

    // 2. 生成场景实例：模板数据 + 用户覆盖字段 + 新 id/时间戳
    const newId = 'scene_' + Date.now();
    const scene = {
      ...base,
      id: newId,
      name: sceneData.name || base.name || '新场景',
      width: sceneData.width || base.width || editorDefaults.width,
      height: sceneData.height || base.height || editorDefaults.height,
      backgroundColor: sceneData.backgroundColor || base.backgroundColor || editorDefaults.backgroundColor,
      templateId,
      decorations: base.decorations || [],
      colliders: base.colliders || [],
      createdAt: new Date().toISOString()
    };

    scenes.push(scene);
    this.saveScenesData(gameId, scenes);
    return scene;
  }
  
  /**
   * 更新场景
   * @param {string} gameId - 游戏ID
   * @param {string} sceneId - 场景ID
   * @param {Object} sceneData - 场景数据
   */
  updateScene(gameId, sceneId, sceneData) {
    const scenes = this.loadScenesData(gameId) || [];
    const index = scenes.findIndex(s => s.id === sceneId);
    
    if (index === -1) {
      // 首次保存预设场景：保留完整数据和原始ID
      const newScene = {
        ...sceneData,
        id: sceneId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      scenes.push(newScene);
      this.saveScenesData(gameId, scenes);
      return newScene;
    }
    
    scenes[index] = {
      ...scenes[index],
      ...sceneData,
      id: sceneId,
      updatedAt: new Date().toISOString()
    };
    
    this.saveScenesData(gameId, scenes);
    return scenes[index];
  }
  
  /**
   * 修改场景 ID
   * @param {string} gameId - 游戏ID
   * @param {string} oldId - 旧场景ID
   * @param {string} newId - 新场景ID
   * @returns {boolean} 是否成功
   */
  renameSceneId(gameId, oldId, newId) {
    const scenes = this.loadScenesData(gameId) || [];
    // 检查新 ID 是否已存在
    if (scenes.some(s => s.id === newId)) {
      console.warn('场景 ID 已存在:', newId);
      return false;
    }
    const index = scenes.findIndex(s => s.id === oldId);
    if (index === -1) return false;
    
    scenes[index].id = newId;
    scenes[index].updatedAt = new Date().toISOString();
    this.saveScenesData(gameId, scenes);
    return true;
  }
  
  /**
   * 更新场景元数据（名称等），不覆盖场景内容
   * @param {string} gameId - 游戏ID
   * @param {string} sceneId - 场景ID
   * @param {Object} meta - 要更新的字段 { name?, type? }
   */
  updateSceneMeta(gameId, sceneId, meta) {
    const scenes = this.loadScenesData(gameId) || [];
    const index = scenes.findIndex(s => s.id === sceneId);
    if (index === -1) return false;
    
    if (meta.name !== undefined) scenes[index].name = meta.name;
    if (meta.type !== undefined) scenes[index].type = meta.type;
    scenes[index].updatedAt = new Date().toISOString();
    this.saveScenesData(gameId, scenes);
    return true;
  }
  
  /**
   * 删除场景
   * @param {string} gameId - 游戏ID
   * @param {string} sceneId - 场景ID
   */
  deleteScene(gameId, sceneId) {
    const scenes = this.loadScenesData(gameId) || [];
    const index = scenes.findIndex(s => s.id === sceneId);
    
    if (index !== -1) {
      scenes.splice(index, 1);
      this.saveScenesData(gameId, scenes);
      return true;
    }
    return false;
  }
  
  /**
   * 设置当前编辑的场景
   * @param {string} sceneId - 场景ID
   */
  setCurrentScene(sceneId) {
    if (!this.currentGame) return null;
    
    const scenes = this.loadScenesData(this.currentGame.id) || [];
    
    // 按 id 精确匹配
    let scene = scenes.find(s => s.id === sceneId) || null;
    
    this.currentScene = scene;
    return this.currentScene;
  }
  
  /**
   * 获取当前场景
   */
  getCurrentScene() {
    return this.currentScene;
  }
  
  /**
   * 导出场景数据为JSON
   * @param {string} gameId - 游戏ID
   * @param {string} sceneId - 场景ID
   */
  exportSceneJSON(gameId, sceneId) {
    const scenes = this.loadScenesData(gameId) || [];
    const scene = scenes.find(s => s.id === sceneId);
    
    if (!scene) return null;
    
    return JSON.stringify(scene, null, 2);
  }
  
  /**
   * 导入场景数据
   * @param {string} gameId - 游戏ID
   * @param {string} jsonStr - JSON字符串
   */
  importSceneJSON(gameId, jsonStr) {
    try {
      const sceneData = JSON.parse(jsonStr);
      sceneData.id = 'scene_' + Date.now();
      sceneData.importedAt = new Date().toISOString();
      
      const scenes = this.loadScenesData(gameId) || [];
      scenes.push(sceneData);
      this.saveScenesData(gameId, scenes);
      
      return sceneData;
    } catch (e) {
      console.error('导入场景失败:', e);
      return null;
    }
  }
  
  /**
   * 导出背景贴图配置（兼容Scene1Terrain格式）
   * @param {string} gameId - 游戏ID
   * @param {string} sceneId - 场景ID
   */
  exportTerrainConfig(gameId, sceneId) {
    const scenes = this.loadScenesData(gameId) || [];
    const scene = scenes.find(s => s.id === sceneId);
    
    if (!scene) return null;
    
    // 从 JSON 配置获取默认导出参数
    const terrainDefaults = (_scenePresetsConfig && _scenePresetsConfig.scenes && _scenePresetsConfig.scenes[sceneId]) || {};
    
    // 转换为Scene1Terrain兼容格式
    const config = {
      centerX: scene.centerX || terrainDefaults.centerX || 640,
      centerY: scene.centerY || terrainDefaults.centerY || 360,
      width: scene.width || terrainDefaults.width || 1280,
      height: scene.height || terrainDefaults.height || 720,
      basinRadius: scene.basinRadius || terrainDefaults.basinRadius || 640,
      basinAspectY: scene.basinAspectY || terrainDefaults.basinAspectY || 0.65,
      grassTile: scene.grassTile || (terrainDefaults.terrain && terrainDefaults.terrain.grassTile) || { sx: 448, sy: 128, sw: 64, sh: 64 },
      decoSprites: scene.decoSprites || {},
      decorations: scene.decorations || [],
      waterPatches: scene.waterPatches || []
    };
    
    return JSON.stringify(config, null, 2);
  }
}

// 导出单例
export const editorDataManager = new EditorDataManager();
