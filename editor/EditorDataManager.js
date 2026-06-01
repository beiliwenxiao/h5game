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
    for (const s of savedById.values()) {
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
    this.currentScene = scenes.find(s => s.id === sceneId) || null;
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
