/**
 * SceneDataLoader - 场景数据加载器
 * 
 * 负责从现有场景文件中提取数据，转换为编辑器可用的格式
 */

export class SceneDataLoader {
  constructor() {
    this.assetBase = '../example/sanguo_zhangjiao/assets/images/scene1/';
  }
  
  /**
   * 获取场景1的地形数据
   */
  async loadScene1Terrain() {
    const config = {
      id: 'scene_Prologue',
      name: '序章 - 盆地营地',
      width: 1280,
      height: 720,
      backgroundColor: '#1a2a1a',
      
      // 场景中心点
      centerX: 350,
      centerY: 250,
      
      // 椭圆盆地参数
      basinRadius: 640,
      basinAspectY: 0.65,
      
      // 资源路径
      assetBase: this.assetBase,
      
      // 图层
      layers: [
        {
          id: 'layer_bg',
          name: '背景层',
          visible: true,
          locked: false,
          objects: []
        },
        {
          id: 'layer_deco',
          name: '装饰层',
          visible: true,
          locked: false,
          objects: []
        },
        {
          id: 'layer_entity',
          name: '实体层',
          visible: true,
          locked: false,
          objects: []
        }
      ],
      
      // 地形配置
      terrain: {
        type: 'basin',
        grassTile: { sx: 448, sy: 128, sw: 64, sh: 64 },
        tileSize: 64,
        image: this.assetBase + 'mountain_landscape.png'
      },
      
      // 装饰物精灵配置
      decoSprites: {
        tree1: { sx: 128, sy: 384, sw: 96, sh: 128, scale: 1.0, collide: true },
        tree2: { sx: 224, sy: 416, sw: 64, sh: 96, scale: 1.0, collide: true },
        tree3: { sx: 288, sy: 384, sw: 64, sh: 128, scale: 1.0, collide: true },
        grass1: { sx: 128, sy: 288, sw: 96, sh: 96, scale: 1.0, collide: false },
        bush2: { sx: 224, sy: 288, sw: 32, sh: 32, scale: 1.0, collide: false },
        bush3: { sx: 224, sy: 320, sw: 32, sh: 32, scale: 1.0, collide: false },
        bush4: { sx: 256, sy: 320, sw: 32, sh: 32, scale: 1.0, collide: false }
      },
      
      // 装饰物列表（从Scene1Terrain提取）
      decorations: [],
      
      // 碰撞区域
      colliders: []
    };
    
    // 生成装饰物列表
    config.decorations = this._generateDecorations(config);
    
    return config;
  }
  
  /**
   * 生成装饰物列表（模拟Scene1Terrain的逻辑）
   * @private
   */
  _generateDecorations(config) {
    const decorations = [];
    const cx = config.centerX;
    const cy = config.centerY;
    const basinRadiusX = config.basinRadius;
    const basinRadiusY = config.basinRadius * config.basinAspectY;
    
    // 简单确定性伪随机
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    
    const outerTreeKeys = ['tree1', 'tree2', 'tree3'];
    const innerTreeKeys = ['tree2', 'tree3'];
    const bushKeys = ['bush2', 'bush3', 'bush4'];
    
    // 入口角度
    const entranceAngleHalfWidth = Math.PI * 9 / 180;
    
    // 归一化角度
    const normalizeAngle = (a) => {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    };
    
    // 椭圆点
    const ellipsePoint = (angle, factor, radiusJitter) => {
      const jitter = (rand() - 0.5) * radiusJitter * 2;
      const rx = basinRadiusX * factor + jitter;
      const ry = basinRadiusY * factor + jitter;
      return {
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry
      };
    };
    
    // 外围树木选择
    const pickOuterTree = () => {
      const r = rand();
      if (r < 0.25) return 'tree1';
      return r < 0.625 ? 'tree2' : 'tree3';
    };
    
    // 生成主树圈
    const ringConfigs = [
      { count: 64, factor: 1.02, jitter: 18 },
      { count: 56, factor: 0.94, jitter: 14 },
      { count: 56, factor: 1.10, jitter: 16 }
    ];
    
    for (const cfg of ringConfigs) {
      for (let i = 0; i < cfg.count; i++) {
        const baseAngle = (i / cfg.count) * Math.PI * 2 - Math.PI / 2 + (rand() - 0.5) * Math.PI * 6 / 180;
        const angDistFromSouth = Math.abs(normalizeAngle(baseAngle - Math.PI / 2));
        if (angDistFromSouth < entranceAngleHalfWidth) continue;
        
        const pt = ellipsePoint(baseAngle, cfg.factor, cfg.jitter);
        decorations.push({
          x: Math.round(pt.x),
          y: Math.round(pt.y),
          key: pickOuterTree(),
          scale: 1.0
        });
      }
    }
    
    // 底部补充树
    for (let i = 0; i < 36; i++) {
      const baseAngle = (i / 36) * Math.PI;
      const angDistFromSouth = Math.abs(normalizeAngle(baseAngle - Math.PI / 2));
      if (angDistFromSouth < entranceAngleHalfWidth) continue;
      
      const angle = baseAngle + (rand() - 0.5) * Math.PI * 4 / 180;
      const factor = 1.14 + rand() * 0.10;
      const pt = ellipsePoint(angle, factor, 12);
      decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key: pickOuterTree(),
        scale: 1.0
      });
    }
    
    // 盆地内部树木（3-5棵）
    const innerTreeCount = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < innerTreeCount; i++) {
      const ang = rand() * Math.PI * 2;
      const u = Math.sqrt(rand());
      const x = cx + Math.cos(ang) * u * (basinRadiusX * 0.94 - 60);
      const y = cy + Math.sin(ang) * u * (basinRadiusY * 0.94 - 40);
      
      decorations.push({
        x: Math.round(x),
        y: Math.round(y),
        key: pick(innerTreeKeys),
        scale: 1.0
      });
    }
    
    // 盆地内部灌木（26个）
    for (let i = 0; i < 26; i++) {
      const ang = rand() * Math.PI * 2;
      const u = Math.sqrt(rand());
      const x = cx + Math.cos(ang) * u * (basinRadiusX * 0.94 - 30);
      const y = cy + Math.sin(ang) * u * (basinRadiusY * 0.94 - 20);
      
      decorations.push({
        x: Math.round(x),
        y: Math.round(y),
        key: pick(bushKeys),
        scale: 1.0
      });
    }
    
    return decorations;
  }
  
  /**
   * 获取所有预设场景
   */
  getPresetScenes() {
    return [
      { id: 'scene_prologue', name: '序章 - 盆地营地', type: 'terrain' },
      { id: 'scene_act1', name: '第一幕 - 起义军营', type: 'terrain' },
      { id: 'scene_act2', name: '第二幕 - 战场', type: 'terrain' },
      { id: 'scene_act3', name: '第三幕 - 城池', type: 'terrain' },
      { id: 'scene_act4', name: '第四幕 - 山寨', type: 'terrain' },
      { id: 'scene_act5', name: '第五幕 - 决战', type: 'terrain' },
      { id: 'scene_act6', name: '第六幕 - 结局', type: 'terrain' }
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
        return await this.loadScene1Terrain(); // 暂时使用相同地形
      case 'scene_Act2':
      case 'scene_Act3':
      case 'scene_Act4':
      case 'scene_Act5':
      case 'scene_Act6':
        // 其他场景暂时返回空场景
        return {
          id: sceneId,
          name: sceneId.replace('scene_', '').replace('_', ' '),
          width: 1280,
          height: 720,
          backgroundColor: '#2a3a1a',
          layers: [
            { id: 'layer_bg', name: '背景层', visible: true, locked: false, objects: [] },
            { id: 'layer_deco', name: '装饰层', visible: true, locked: false, objects: [] },
            { id: 'layer_entity', name: '实体层', visible: true, locked: false, objects: [] }
          ],
          decorations: [],
          colliders: []
        };
      default:
        // 返回默认空场景
        return {
          id: sceneId,
          name: sceneId.replace('scene_', '').replace('_', ' '),
          width: 1280,
          height: 720,
          backgroundColor: '#2a3a1a',
          layers: [
            { id: 'layer_bg', name: '背景层', visible: true, locked: false, objects: [] },
            { id: 'layer_deco', name: '装饰层', visible: true, locked: false, objects: [] },
            { id: 'layer_entity', name: '实体层', visible: true, locked: false, objects: [] }
          ],
          decorations: [],
          colliders: []
        };
    }
  }
}

export const sceneDataLoader = new SceneDataLoader();
