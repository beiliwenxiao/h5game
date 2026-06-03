/**
 * EditorDataManager - 游戏编辑器数据管理器
 * 
 * 负责：
 * - 管理游戏列表（从example目录读取）
 * - 管理场景数据（保存/加载场景配置）
 * - 导入/导出背景数据
 * - 使用 localStorage 保存编辑器状态
 */

export class EditorDataManager {
  constructor() {
    this.storageKey = 'h5game_editor_data';
    this.gamesListKey = 'h5game_editor_games';
    
    // 内置游戏列表（example目录下的游戏）
    this.builtinGames = [
      {
        id: 'sanguo_zhangjiao',
        name: '三国张角传',
        description: '东汉末年，太平道首领张角的传奇故事',
        thumbnail: '../example/sanguo_zhangjiao/assets/images/002.png',
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
    
    // 场景名称映射
    const sceneNames = {
      'PrologueScene': '序章 - 盆地营地',
      'Act1Scene': '第一幕 - 起义军营',
      'Act2Scene': '第二幕 - 战场',
      'Act3Scene': '第三幕 - 城池',
      'Act4Scene': '第四幕 - 山寨',
      'Act5Scene': '第五幕 - 决战',
      'Act6Scene': '第六幕 - 结局',
      'BaseGameScene': '游戏主场景'
    };
    
    // 预设场景列表（始终展示）
    const presets = (game.scenes || []).map(name => ({
      id: 'scene_' + name.replace('Scene', ''),
      name: sceneNames[name] || name.replace('Scene', ''),
      type: 'terrain'
    }));
    
    // 已保存的场景数据（来自 localStorage）
    const saved = this.loadScenesData(gameId) || [];
    const savedById = new Map(saved.map(s => [s.id, s]));
    
    // 预设场景的名称集合（用于识别历史脏数据：id 非规范但与预设同名）
    const presetNames = new Set(presets.map(p => p.name));
    
    // 用保存的数据覆盖对应的预设场景（保留预设名称作为后备）
    const result = presets.map(p => {
      const s = savedById.get(p.id);
      if (s) {
        savedById.delete(p.id);
        return { id: p.id, name: s.name || p.name, type: s.type || p.type };
      }
      return p;
    });
    
    // 追加不在预设列表中的自定义场景
    // 跳过与预设场景重名的记录（历史 bug 产生的重复脏数据）
    for (const s of savedById.values()) {
      if (presetNames.has(s.name)) continue;
      result.push({ id: s.id, name: s.name || s.id, type: s.type || 'terrain' });
    }
    
    return result;
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
   * 此方法把同名记录合并到规范 id（如 scene_Prologue）上：
   *   - 同名记录里，优先保留 id 规范的；若规范 id 不存在，则把最新的脏数据改用规范 id
   *   - 内容以"装饰物/对象更多"的为准，避免丢失已编辑内容
   * @param {string} gameId - 游戏ID
   * @returns {boolean} 是否发生了清理
   */
  cleanupDuplicateScenes(gameId) {
    const scenes = this.loadScenesData(gameId);
    if (!scenes || scenes.length === 0) return false;
    
    const game = this.getAllGames().find(g => g.id === gameId);
    const presetIdByName = {};
    if (game && game.scenes) {
      const sceneNames = {
        'PrologueScene': '序章 - 盆地营地',
        'Act1Scene': '第一幕 - 起义军营',
        'Act2Scene': '第二幕 - 战场',
        'Act3Scene': '第三幕 - 城池',
        'Act4Scene': '第四幕 - 山寨',
        'Act5Scene': '第五幕 - 决战',
        'Act6Scene': '第六幕 - 结局',
        'BaseGameScene': '游戏主场景'
      };
      for (const name of game.scenes) {
        const id = 'scene_' + name.replace('Scene', '');
        presetIdByName[sceneNames[name] || name.replace('Scene', '')] = id;
      }
    }
    
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
      const best = list[0];
      // 若该名称对应一个预设规范 id，强制使用规范 id
      const presetId = presetIdByName[name];
      if (presetId) best.id = presetId;
      cleaned.push(best);
    }
    
    if (changed) {
      this.saveScenesData(gameId, cleaned);
    }
    return changed;
  }
  
  /**
   * 创建新场景
   * @param {string} gameId - 游戏ID
   * @param {Object} sceneData - 场景数据
   */
  createScene(gameId, sceneData) {
    const scenes = this.loadScenesData(gameId) || [];
    const scene = {
      id: 'scene_' + Date.now(),
      name: sceneData.name || '新场景',
      width: sceneData.width || 1280,
      height: sceneData.height || 720,
      backgroundColor: sceneData.backgroundColor || '#2a3a1a',
      layers: [],
      decorations: [],
      colliders: [],
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
    
    // 1. 优先按 id 精确匹配
    let scene = scenes.find(s => s.id === sceneId) || null;
    
    // 2. 找不到时，按预设名称回退查找同名记录（兼容历史 timestamp id 的脏数据）
    if (!scene) {
      const presetName = this._getPresetSceneName(this.currentGame.id, sceneId);
      if (presetName) {
        const matches = scenes.filter(s => s.name === presetName);
        if (matches.length > 0) {
          // 选内容最丰富的一条（装饰物 + 图层对象最多）
          const richness = (s) => {
            let n = Array.isArray(s.decorations) ? s.decorations.length : 0;
            if (Array.isArray(s.layers)) for (const l of s.layers) n += (l.objects?.length || 0);
            return n;
          };
          matches.sort((a, b) => richness(b) - richness(a));
          scene = matches[0];
        }
      }
    }
    
    this.currentScene = scene;
    return this.currentScene;
  }
  
  /**
   * 根据规范场景 id 获取预设场景名称
   * @private
   */
  _getPresetSceneName(gameId, sceneId) {
    const game = this.getAllGames().find(g => g.id === gameId);
    if (!game || !game.scenes) return null;
    const sceneNames = {
      'PrologueScene': '序章 - 盆地营地',
      'Act1Scene': '第一幕 - 起义军营',
      'Act2Scene': '第二幕 - 战场',
      'Act3Scene': '第三幕 - 城池',
      'Act4Scene': '第四幕 - 山寨',
      'Act5Scene': '第五幕 - 决战',
      'Act6Scene': '第六幕 - 结局',
      'BaseGameScene': '游戏主场景'
    };
    for (const name of game.scenes) {
      if ('scene_' + name.replace('Scene', '') === sceneId) {
        return sceneNames[name] || name.replace('Scene', '');
      }
    }
    return null;
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
    
    // 转换为Scene1Terrain兼容格式
    const config = {
      centerX: scene.centerX || 640,
      centerY: scene.centerY || 360,
      width: scene.width || 1280,
      height: scene.height || 720,
      basinRadius: scene.basinRadius || 640,
      basinAspectY: scene.basinAspectY || 0.65,
      grassTile: scene.grassTile || { sx: 448, sy: 128, sw: 64, sh: 64 },
      decoSprites: scene.decoSprites || {},
      decorations: scene.decorations || [],
      waterPatches: scene.waterPatches || []
    };
    
    return JSON.stringify(config, null, 2);
  }
}

// 导出单例
export const editorDataManager = new EditorDataManager();
