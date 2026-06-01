/**
 * SceneDataLoader - 场景数据加载器
 * 
 * 负责从现有场景文件中提取数据，转换为编辑器可用的格式
 */

import { SceneDataExporter } from './SceneDataExporter.js';

export class SceneDataLoader {
  constructor() {
    this.assetBase = '../example/sanguo_zhangjiao/assets/images/scene1/';
    this.exporter = new SceneDataExporter();
  }
  
  /**
   * 获取场景1的地形数据（使用导出器生成完整数据）
   */
  async loadScene1Terrain() {
    const config = this.exporter.exportPrologueScene();
    
    // 添加图片资源列表
    config.atlases = this._getScene1Atlases();
    
    return config;
  }
  
  /**
   * 获取场景1使用的图集资源
   */
  _getScene1Atlases() {
    return [
      {
        id: 'mountain_landscape',
        name: '山地景观图集',
        path: this.assetBase + 'mountain_landscape.png',
        width: 512,
        height: 512,
        slices: {
          grassTile: { name: '草地', sx: 448, sy: 128, sw: 64, sh: 64 },
          tree1: { name: '大树', sx: 128, sy: 384, sw: 96, sh: 128, collide: true, colliderRadius: 22 },
          tree2: { name: '中树', sx: 224, sy: 416, sw: 64, sh: 96, collide: true, colliderRadius: 14 },
          tree3: { name: '小树', sx: 288, sy: 384, sw: 64, sh: 128, collide: true, colliderRadius: 16 },
          grass1: { name: '草地装饰', sx: 128, sy: 288, sw: 96, sh: 96, collide: false },
          bush2: { name: '灌木1', sx: 224, sy: 288, sw: 32, sh: 32, collide: false },
          bush3: { name: '草莓', sx: 224, sy: 320, sw: 32, sh: 32, collide: false },
          bush4: { name: '灌木2', sx: 256, sy: 320, sw: 32, sh: 32, collide: false }
        }
      }
    ];
  }
  
  /**
   * 获取所有预设场景
   */
  getPresetScenes() {
    return [
      { id: 'scene_Prologue', name: '序章 - 盆地营地', type: 'terrain' },
      { id: 'scene_Act1', name: '第一幕 - 起义军营', type: 'terrain' },
      { id: 'scene_Act2', name: '第二幕 - 符水救灾', type: 'indoor' },
      { id: 'scene_Act3', name: '第三幕 - 铜钱法器', type: 'indoor' },
      { id: 'scene_Act4', name: '第四幕 - 山寨', type: 'terrain' },
      { id: 'scene_Act5', name: '第五幕 - 决战', type: 'terrain' },
      { id: 'scene_Act6', name: '第六幕 - 结局', type: 'indoor' }
    ];
  }
  
  /**
   * 加载指定场景
   */
  async loadScene(sceneId) {
    switch (sceneId) {
      case 'scene_Prologue':
        return await this.loadScene1Terrain();
      case 'scene_Act1':
        return await this.loadAct1Scene();
      case 'scene_Act2':
        return await this.loadAct2Scene();
      case 'scene_Act3':
        return await this.loadAct3Scene();
      case 'scene_Act4':
        return await this.loadAct4Scene();
      case 'scene_Act5':
        return await this.loadAct5Scene();
      case 'scene_Act6':
        return await this.loadAct6Scene();
      default:
        return this.createEmptyScene(sceneId);
    }
  }
  
  /**
   * 创建空场景
   */
  createEmptyScene(sceneId, name, bgColor = '#2a3a1a') {
    return {
      id: sceneId,
      name: name || sceneId.replace('scene_', ''),
      width: 1280,
      height: 720,
      backgroundColor: bgColor,
      layers: [
        { id: 'layer_bg', name: '背景层', visible: true, locked: false, objects: [] },
        { id: 'layer_deco', name: '装饰层', visible: true, locked: false, objects: [] },
        { id: 'layer_entity', name: '实体层', visible: true, locked: false, objects: [] }
      ],
      decorations: [],
      colliders: []
    };
  }
  
  /**
   * 第一幕 - 起义军营
   */
  async loadAct1Scene() {
    const config = this.createEmptyScene('scene_Act1', '第一幕 - 起义军营', '#1a2a2a');
    
    config.terrain = {
      type: 'camp',
      tileSize: 64,
      image: this.assetBase + 'mountain_landscape.png'
    };
    
    // 军营场景 - 更开阔的区域
    config.centerX = 640;
    config.centerY = 360;
    config.basinRadius = 500;
    config.basinAspectY = 0.7;
    
    // 生成军营装饰物
    config.decorations = this._generateCampDecorations(config);
    config.decoSprites = this._getDefaultDecoSprites();
    
    return config;
  }
  
  /**
   * 第二幕 - 符水救灾（室内粥棚）
   */
  async loadAct2Scene() {
    const config = this.createEmptyScene('scene_Act2', '第二幕 - 符水救灾', '#2a2020');
    
    // 室内场景 - 粥棚
    config.terrain = {
      type: 'indoor',
      tileSize: 48
    };
    
    // 室内装饰物
    config.decorations = this._generateIndoorDecorations(config, 'porridge');
    config.decoSprites = this._getIndoorDecoSprites();
    
    return config;
  }
  
  /**
   * 第三幕 - 铜钱法器（室内道场）
   */
  async loadAct3Scene() {
    const config = this.createEmptyScene('scene_Act3', '第三幕 - 铜钱法器', '#202030');
    
    config.terrain = {
      type: 'indoor',
      tileSize: 48
    };
    
    config.decorations = this._generateIndoorDecorations(config, 'dojo');
    config.decoSprites = this._getIndoorDecoSprites();
    
    return config;
  }
  
  /**
   * 第四幕 - 山寨
   */
  async loadAct4Scene() {
    const config = this.createEmptyScene('scene_Act4', '第四幕 - 山寨', '#252520');
    
    config.terrain = {
      type: 'mountain',
      tileSize: 64,
      image: this.assetBase + 'mountain_landscape.png'
    };
    
    config.centerX = 640;
    config.centerY = 350;
    config.basinRadius = 550;
    config.basinAspectY = 0.6;
    
    config.decorations = this._generateMountainDecorations(config);
    config.decoSprites = this._getDefaultDecoSprites();
    
    return config;
  }
  
  /**
   * 第五幕 - 决战
   */
  async loadAct5Scene() {
    const config = this.createEmptyScene('scene_Act5', '第五幕 - 决战', '#301515');
    
    config.terrain = {
      type: 'battlefield',
      tileSize: 64,
      image: this.assetBase + 'mountain_landscape.png'
    };
    
    config.centerX = 640;
    config.centerY = 360;
    config.basinRadius = 600;
    config.basinAspectY = 0.65;
    
    config.decorations = this._generateBattlefieldDecorations(config);
    config.decoSprites = this._getDefaultDecoSprites();
    
    return config;
  }
  
  /**
   * 第六幕 - 结局
   */
  async loadAct6Scene() {
    const config = this.createEmptyScene('scene_Act6', '第六幕 - 结局', '#1a1a2a');
    
    config.terrain = {
      type: 'indoor',
      tileSize: 48
    };
    
    config.decorations = this._generateIndoorDecorations(config, 'palace');
    config.decoSprites = this._getIndoorDecoSprites();
    
    return config;
  }
  
  /**
   * 生成军营装饰物
   */
  _generateCampDecorations(config) {
    const decorations = [];
    let seed = 54321;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    
    // 军营帐篷
    for (let i = 0; i < 8; i++) {
      decorations.push({
        x: 200 + rand() * 800,
        y: 150 + rand() * 400,
        key: 'tent',
        scale: 1.0
      });
    }
    
    // 旗帜
    for (let i = 0; i < 5; i++) {
      decorations.push({
        x: 100 + rand() * 1000,
        y: 100 + rand() * 500,
        key: 'flag',
        scale: 1.0
      });
    }
    
    return decorations;
  }
  
  /**
   * 生成室内装饰物
   */
  _generateIndoorDecorations(config, type) {
    const decorations = [];
    
    if (type === 'porridge') {
      // 粥棚 - 锅、桌子、草席
      decorations.push({ x: 400, y: 300, key: 'cauldron', scale: 1.0 });
      decorations.push({ x: 600, y: 400, key: 'table', scale: 1.0 });
      decorations.push({ x: 800, y: 350, key: 'mat', scale: 1.0 });
    } else if (type === 'dojo') {
      // 道场 - 香炉、蒲团、符咒
      decorations.push({ x: 500, y: 200, key: 'incense', scale: 1.0 });
      decorations.push({ x: 640, y: 400, key: 'cushion', scale: 1.0 });
      decorations.push({ x: 300, y: 300, key: 'talisman', scale: 1.0 });
    } else if (type === 'palace') {
      // 宫殿 - 宝座、屏风、蜡烛
      decorations.push({ x: 640, y: 200, key: 'throne', scale: 1.2 });
      decorations.push({ x: 400, y: 350, key: 'screen', scale: 1.0 });
      decorations.push({ x: 850, y: 250, key: 'candle', scale: 1.0 });
    }
    
    return decorations;
  }
  
  /**
   * 生成山寨装饰物
   */
  _generateMountainDecorations(config) {
    const decorations = [];
    let seed = 98765;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    
    // 山寨木栅栏
    for (let i = 0; i < 12; i++) {
      decorations.push({
        x: 150 + i * 90,
        y: 500 + rand() * 50,
        key: 'fence',
        scale: 1.0
      });
    }
    
    // 山石
    for (let i = 0; i < 6; i++) {
      decorations.push({
        x: 100 + rand() * 1000,
        y: 200 + rand() * 300,
        key: 'rock',
        scale: 0.8 + rand() * 0.4
      });
    }
    
    return decorations;
  }
  
  /**
   * 生成战场装饰物
   */
  _generateBattlefieldDecorations(config) {
    const decorations = [];
    let seed = 11111;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    
    // 破损旗帜
    for (let i = 0; i < 8; i++) {
      decorations.push({
        x: 100 + rand() * 1000,
        y: 150 + rand() * 400,
        key: 'broken_flag',
        scale: 0.8 + rand() * 0.4
      });
    }
    
    // 废墟
    for (let i = 0; i < 10; i++) {
      decorations.push({
        x: rand() * 1200,
        y: 200 + rand() * 400,
        key: 'ruins',
        scale: 0.6 + rand() * 0.8
      });
    }
    
    return decorations;
  }
  
  /**
   * 获取默认装饰物精灵配置
   */
  _getDefaultDecoSprites() {
    return {
      tree1: { sx: 128, sy: 384, sw: 96, sh: 128, scale: 1.0, collide: true },
      tree2: { sx: 224, sy: 416, sw: 64, sh: 96, scale: 1.0, collide: true },
      tree3: { sx: 288, sy: 384, sw: 64, sh: 128, scale: 1.0, collide: true },
      grass1: { sx: 128, sy: 288, sw: 96, sh: 96, scale: 1.0, collide: false },
      bush2: { sx: 224, sy: 288, sw: 32, sh: 32, scale: 1.0, collide: false },
      tent: { sx: 0, sy: 0, sw: 64, sh: 64, scale: 1.0, collide: true },
      flag: { sx: 0, sy: 0, sw: 32, sh: 64, scale: 1.0, collide: false }
    };
  }
  
  /**
   * 获取室内装饰物精灵配置
   */
  _getIndoorDecoSprites() {
    return {
      cauldron: { sx: 0, sy: 0, sw: 64, sh: 64, scale: 1.0, collide: true },
      table: { sx: 0, sy: 0, sw: 80, sh: 48, scale: 1.0, collide: true },
      mat: { sx: 0, sy: 0, sw: 64, sh: 32, scale: 1.0, collide: false },
      incense: { sx: 0, sy: 0, sw: 32, sh: 48, scale: 1.0, collide: false },
      cushion: { sx: 0, sy: 0, sw: 48, sh: 24, scale: 1.0, collide: false },
      talisman: { sx: 0, sy: 0, sw: 32, sh: 32, scale: 1.0, collide: false },
      throne: { sx: 0, sy: 0, sw: 96, sh: 96, scale: 1.0, collide: true },
      screen: { sx: 0, sy: 0, sw: 64, sh: 96, scale: 1.0, collide: true },
      candle: { sx: 0, sy: 0, sw: 24, sh: 32, scale: 1.0, collide: false }
    };
  }
}

export const sceneDataLoader = new SceneDataLoader();
