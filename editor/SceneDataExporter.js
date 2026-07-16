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
 * SceneDataExporter - 场景数据导出工具
 * 
 * 将代码定义的场景转换为编辑器可编辑的JSON数据格式
 * 默认值从 config/ 目录下 JSON 文件加载
 */

// 运行时配置缓存
let _exporterConfig = null;

/**
 * 加载导出器配置
 */
async function loadExporterConfig() {
  if (_exporterConfig) return _exporterConfig;
  try {
    const [presetsResp, decoResp] = await Promise.all([
      fetch('./config/scene-presets.json'),
      fetch('./config/deco-sprites.json')
    ]);
    const presets = await presetsResp.json();
    const decoSprites = await decoResp.json();
    _exporterConfig = { presets, decoSprites };
  } catch (e) {
    console.warn('加载导出器配置失败，使用内置默认值:', e);
    _exporterConfig = { presets: null, decoSprites: null };
  }
  return _exporterConfig;
}

export { loadExporterConfig };

export class SceneDataExporter {
  constructor() {
    const presets = _exporterConfig && _exporterConfig.presets;
    this.assetBase = (presets && presets.assetBase) || '../example/sanguo_zhangjiao/assets/images/scene1/';
  }
  
  /**
   * 从Scene1Terrain代码中提取完整数据
   */
  exportPrologueScene() {
    // 从 JSON 配置获取序章场景预设
    const presets = _exporterConfig && _exporterConfig.presets;
    const prologuePreset = (presets && presets.scenes && presets.scenes['scene_Prologue']) || {};
    const decoSpritesConfig = _exporterConfig && _exporterConfig.decoSprites;
    
    // 完整复制Scene1Terrain的配置，优先使用 JSON 配置值
    const config = {
      id: prologuePreset.id || 'scene_Prologue',
      name: prologuePreset.name || '序章 - 盆地营地',
      width: prologuePreset.width || 1280,
      height: prologuePreset.height || 720,
      backgroundColor: prologuePreset.backgroundColor || '#1a2a1a',
      
      // 场景元数据
      metadata: prologuePreset.metadata || {
        description: '东汉末年，太平道首领张角的起义军营地',
        act: 0,
        type: 'outdoor'
      },
      
      // 场景中心点
      centerX: prologuePreset.centerX || 350,
      centerY: prologuePreset.centerY || 250,
      
      // 椭圆盆地参数
      basinRadius: prologuePreset.basinRadius || 640,
      basinAspectY: prologuePreset.basinAspectY || 0.65,
      basinInnerScale: prologuePreset.basinInnerScale || 0.94,
      entranceAngleHalfWidth: prologuePreset.entranceAngleHalfWidth || (Math.PI * 9 / 180),
      
      // 资源路径
      assetBase: this.assetBase,
      
      // 图层（标准格式）
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
      terrain: prologuePreset.terrain ? {
        ...prologuePreset.terrain,
        image: (prologuePreset.terrain.image || this.assetBase + 'mountain_landscape.png')
      } : {
        type: 'basin',
        grassTile: { sx: 448, sy: 128, sw: 64, sh: 64 },
        tileSize: 64,
        image: this.assetBase + 'mountain_landscape.png'
      },
      
      // 装饰物精灵配置（优先使用 JSON 配置）
      decoSprites: (decoSpritesConfig && decoSpritesConfig.outdoor) ? (() => {
        // 只取序章需要的 sprites
        const outdoor = decoSpritesConfig.outdoor;
        const needed = {};
        const keys = ['tree1', 'tree2', 'tree3', 'grass1', 'bush2', 'bush3', 'bush4'];
        for (const k of keys) {
          if (outdoor[k]) needed[k] = outdoor[k];
        }
        return needed;
      })() : {
        tree1: { sx: 128, sy: 384, sw: 96, sh: 128, scale: 1.0, collide: true, colliderRadius: 22 },
        tree2: { sx: 224, sy: 416, sw: 64, sh: 96, scale: 1.0, collide: true, colliderRadius: 14 },
        tree3: { sx: 288, sy: 384, sw: 64, sh: 128, scale: 1.0, collide: true, colliderRadius: 16 },
        grass1: { sx: 128, sy: 288, sw: 96, sh: 96, scale: 1.0, collide: false },
        bush2: { sx: 224, sy: 288, sw: 32, sh: 32, scale: 1.0, collide: false },
        bush3: { sx: 224, sy: 320, sw: 32, sh: 32, scale: 1.0, collide: false },
        bush4: { sx: 256, sy: 320, sw: 32, sh: 32, scale: 1.0, collide: false }
      },
      
      // 装饰物列表（从Scene1Terrain._buildDecorations提取）
      decorations: [],
      
      // 碰撞区域
      colliders: [],
      
      // 水体
      waterPatches: []
    };
    
    // 生成装饰物（复制Scene1Terrain的逻辑）
    config.decorations = this._generatePrologueDecorations(config);
    
    return config;
  }
  
  /**
   * 生成序章场景的装饰物（完整复制Scene1Terrain._buildDecorations逻辑）
   */
  _generatePrologueDecorations(config) {
    const decorations = [];
    const cx = config.centerX;
    const cy = config.centerY;
    const basinRadiusX = config.basinRadius;
    const basinRadiusY = config.basinRadius * config.basinAspectY;
    const entranceAngleHalfWidth = config.entranceAngleHalfWidth;
    
    // 简单确定性伪随机（与Scene1Terrain相同）
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    
    const outerTreeKeys = ['tree1', 'tree2', 'tree3'];
    const innerTreeKeys = ['tree2', 'tree3'];
    const bushKeys = ['bush2', 'bush3', 'bush4'];
    const grassKeys = ['grass1'];
    
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
    
    // 火堆周围保留空地
    const fireRadius = 90;
    
    // 检查是否在入口通道
    const inEntranceCorridor = (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const ed = Math.hypot(dx / basinRadiusX, dy / basinRadiusY);
      if (ed < 0.7 || ed > 1.25) return false;
      const ang = Math.atan2(dy, dx);
      const angDistFromSouth = Math.abs(normalizeAngle(ang - Math.PI / 2));
      return angDistFromSouth < entranceAngleHalfWidth + Math.PI * 4 / 180;
    };
    
    // 检查是否在水池内
    const inWaterPatch = (x, y, margin = 0) => false; // 当前没有水池
    
    // ---- 1. 主树圈：3排密集分布的树围满椭圆边缘 ----
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
    
    // ---- 1b. 草地下方空地补充树 ----
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
    
    // ---- 1c. 入口处草丛和灌木遮挡 ----
    for (let i = 0; i < 18; i++) {
      const t01 = i / 18;
      const angle = Math.PI / 2 + (t01 - 0.5) * 2 * entranceAngleHalfWidth + (rand() - 0.5) * Math.PI * 2 / 180;
      const factor = 1.0 + rand() * 0.18;
      const pt = ellipsePoint(angle, factor, 8);
      
      const r = rand();
      let key;
      if (r < 0.5) key = 'grass1';
      else if (r < 0.75) key = 'bush2';
      else if (r < 0.9) key = 'bush3';
      else key = 'bush4';
      
      decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key,
        scale: 1.0,
        belowEntities: true
      });
    }
    
    // ---- 4. 树圈附近少量草地 ----
    for (let i = 0; i < 10; i++) {
      const angle = rand() * Math.PI * 2;
      const factor = 0.84 + rand() * 0.08;
      const pt = ellipsePoint(angle, factor, 8);
      decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key: 'grass1',
        scale: 1.0
      });
    }
    
    // ---- 4b. 树圈内缘点缀草丛 + 灌木 ----
    for (let i = 0; i < 10; i++) {
      const baseAngle = (i / 10) * Math.PI * 2;
      const angDistFromSouth = Math.abs(normalizeAngle(baseAngle - Math.PI / 2));
      if (angDistFromSouth < entranceAngleHalfWidth - Math.PI * 2 / 180) continue;
      
      const angle = baseAngle + (rand() - 0.5) * Math.PI * 8 / 180;
      const factor = 0.86 + rand() * 0.16;
      const pt = ellipsePoint(angle, factor, 4);
      
      const r = rand();
      let key;
      if (r < 0.45) key = 'grass1';
      else if (r < 0.7) key = 'bush2';
      else if (r < 0.85) key = 'bush3';
      else key = 'bush4';
      
      decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key,
        scale: 1.0
      });
    }
    
    // ---- 4c. 椭圆上下边缘遮挡带 ----
    for (let i = 0; i < 56; i++) {
      const baseAngle = (i / 56) * Math.PI * 2 - Math.PI / 2;
      const angDistFromSouth = Math.abs(normalizeAngle(baseAngle - Math.PI / 2));
      if (angDistFromSouth < entranceAngleHalfWidth + Math.PI * 2 / 180) continue;
      
      const angle = baseAngle + (rand() - 0.5) * Math.PI * 4 / 180;
      const factor = 1.02 + rand() * 0.08;
      const pt = ellipsePoint(angle, factor, 5);
      decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key: 'grass1',
        scale: 1.0
      });
    }
    
    // ---- 5. 盆地内部：随机分布的树木 ----
    const innerTreePositions = [];
    const innerTrees = 3 + Math.floor(rand() * 3);
    
    for (let i = 0; i < innerTrees; i++) {
      let x, y, tries = 0, ok = false;
      do {
        const ang = rand() * Math.PI * 2;
        const u = Math.sqrt(rand());
        x = cx + Math.cos(ang) * u * (basinRadiusX * config.basinInnerScale - 60);
        y = cy + Math.sin(ang) * u * (basinRadiusY * config.basinInnerScale - 40);
        tries++;
        ok = !(
          Math.hypot(x - cx, y - cy) < fireRadius + 30 ||
          inEntranceCorridor(x, y) ||
          inWaterPatch(x, y, 24) ||
          innerTreePositions.some(t => Math.hypot(x - t.x, y - t.y) < 56)
        );
      } while (!ok && tries < 16);
      
      if (ok) {
        innerTreePositions.push({ x, y });
        decorations.push({
          x: Math.round(x),
          y: Math.round(y),
          key: pick(innerTreeKeys),
          scale: 1.0
        });
      }
    }
    
    // ---- 6. 盆地内部：随机分布的灌木丛 ----
    for (let i = 0; i < 26; i++) {
      let x, y, tries = 0;
      do {
        const ang = rand() * Math.PI * 2;
        const u = Math.sqrt(rand());
        x = cx + Math.cos(ang) * u * (basinRadiusX * config.basinInnerScale - 30);
        y = cy + Math.sin(ang) * u * (basinRadiusY * config.basinInnerScale - 20);
        tries++;
      } while (
        (Math.hypot(x - cx, y - cy) < fireRadius || inEntranceCorridor(x, y) || inWaterPatch(x, y, 8))
        && tries < 8
      );
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
   * 导出场景为JSON文件
   */
  exportToJSON(sceneConfig) {
    return JSON.stringify(sceneConfig, null, 2);
  }
  
  /**
   * 下载场景JSON文件
   */
  downloadScene(sceneConfig, filename) {
    const json = this.exportToJSON(sceneConfig);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${sceneConfig.name || 'scene'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const sceneDataExporter = new SceneDataExporter();
