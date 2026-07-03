/**
 * Scene1Terrain - 第一幕盆地地形系统
 * 
 * 提供：
 * - 草地底层平铺（盆地内）
 * - 水池、溪水
 * - 高地/悬崖图层（围成盆地，南侧留入口）
 * - 树木、灌木、石头等装饰物（参与 Y 排序）
 * - 悬崖/水池的不可通行区域碰撞检测
 * 
 * 资源：
 * - assets/images/scene1/terrain_grass_water.png  256x256 (4x4 个 64px 小块)
 * - assets/images/scene1/cliff_grass.png          384x288 LPC 悬崖图集
 * - assets/images/scene1/tree_willow.png          128x128
 * - assets/images/scene1/tree_oak.png             128x128
 * - assets/images/scene1/tree_pine.png            128x128
 * - assets/images/scene1/tree_dead.png            128x97
 * - assets/images/scene1/bush_1.png               64x64
 * - assets/images/scene1/bush_2.png               64x64
 * - assets/images/scene1/grass_tuft.png           64x64
 */

export class Scene1Terrain {
  /**
   * @param {Object} config
   * @param {number} config.centerX - 盆地中心 X（与火堆同 X，350）
   * @param {number} config.centerY - 盆地中心 Y（与火堆同 Y，250）
   * @param {number} config.width   - 盆地宽度（约一屏，1280）
   * @param {number} config.height  - 盆地高度（约一屏，720）
   */
  constructor(config = {}) {
    // 盆地中心 = 火堆位置
    this.centerX = config.centerX ?? 350;
    this.centerY = config.centerY ?? 250;

    // 盆地（草地区域）尺寸：约一屏
    this.basinWidth = config.width ?? 1280;
    this.basinHeight = config.height ?? 720;

    // 盆地世界坐标边界（草地内圈，用于渲染草地铺面的范围）
    this.basinLeft   = this.centerX - this.basinWidth  / 2;
    this.basinRight  = this.centerX + this.basinWidth  / 2;
    this.basinTop    = this.centerY - this.basinHeight / 2;
    this.basinBottom = this.centerY + this.basinHeight / 2;

    // === 椭圆盆地（2.5D 视角压扁）===
    this.basinRadius = config.radius ?? 640;          // 基础半径（X 方向）
    this.basinAspectY = config.aspectY ?? 0.65;       // Y 压缩比
    this.basinRadiusX = this.basinRadius;
    this.basinRadiusY = this.basinRadius * this.basinAspectY;
    // 入口角度区间：南向（+Y 方向）±9° 留缺口（窄入口）
    this.entranceAngleHalfWidth = Math.PI * 9 / 180;
    // 内圈（玩家可走范围比树圈略小）
    this.basinInnerScale = 0.94;
    this.basinInnerRadiusX = this.basinRadiusX * this.basinInnerScale;
    this.basinInnerRadiusY = this.basinRadiusY * this.basinInnerScale;

    // 兼容字段
    this.basinInnerRadius = this.basinInnerRadiusX;
    this.cliffThickness = 0;
    this.entranceWidth = 0;
    this.entranceCenterX = this.centerX;

    // === 资源 ===
    this.assetBase = 'assets/images/scene1/';
    this.images = {
      mountain: null,  // 草地+树木+灌木：mountain_landscape.png 512x512
      terrain: null,   // 备用：水/沙图块
      oga: null,       // OGAtilesetsremixed.png 960x960，备用
      cliff: null      // 备用：cliff_grass.png
    };
    this.loaded = {
      mountain: false, terrain: false, oga: false, cliff: false
    };

    // === Tileset 切片配置 ===
    // 草地：从 mountain_landscape.png (448,128) 取 64×64
    this.grassTile = { sx: 448, sy: 128, sw: 64, sh: 64 };
    this.terrainTile = 64;

    // 水/沙仍从 terrain_grass_water.png 取（32×32 网格）
    this.tileWater = { sx: 0, sy: 0,  sw: 32, sh: 32 };
    this.tileSand  = { sx: 0, sy: 64, sw: 32, sh: 32 };

    // 树木 / 灌木丛 / 草地切片（全部从 mountain_landscape.png 取，1:1 不缩放）
    // collide: true  → 实体不能穿过（树）
    // collide: false → 装饰物不阻挡（灌木、草丛、草地）
    this.decoSprites = {
      tree1:  { sx: 128, sy: 384, sw: 96, sh: 128, scale: 1.0, collide: true,  colliderRadius: 22 },
      tree2:  { sx: 224, sy: 416, sw: 64, sh: 96,  scale: 1.0, collide: true,  colliderRadius: 14 },
      tree3:  { sx: 288, sy: 384, sw: 64, sh: 128, scale: 1.0, collide: true,  colliderRadius: 16 },
      // 草地装饰（之前叫 bush1，改为 grass1）
      grass1: { sx: 128, sy: 288, sw: 96, sh: 96,  scale: 1.0, collide: false },
      bush2:  { sx: 224, sy: 288, sw: 32, sh: 32,  scale: 1.0, collide: false },
      bush3:  { sx: 224, sy: 320, sw: 32, sh: 32,  scale: 1.0, collide: false }, // 草莓
      bush4:  { sx: 256, sy: 320, sw: 32, sh: 32,  scale: 1.0, collide: false }
    };
    // 树木分类
    this.outerTreeKeys = ['tree1', 'tree2', 'tree3'];   // 外围森林（含 tree1）
    this.innerTreeKeys = ['tree2', 'tree3'];            // 盆地内（不含 tree1）
    // 灌木丛（盆地内随机分布）
    this.bushKeys = ['bush2', 'bush3', 'bush4'];
    // 草地装饰（用在树圈内外缘）
    this.grassKeys = ['grass1'];

    // OGAtilesetsremixed.png 960x960，32px 网格 30x30
    // 用作悬崖图集（这个是顶视角悬崖/岩石的混合素材）
    // 颜色 [75,105,47] = 深绿草地，[224,174,84] = 沙土路
    // 我们直接用 9-slice 拼装，但实际素材风格不一定整齐，按经验取
    this.cliffTile = 32;
    // 悬崖的"石头墙体"片段 —— 用 OGA 内深棕岩石纹（如果存在）；
    // 否则退化为色块。这里先用一个保守方案：
    //   topMid/midMid/bottomMid 等都用同一个深棕岩石格
    //   左右上下角用对应方向的格子
    // 由于不能保证 OGA 准确布局，最终用程序绘制岩石纹路（fallback 升级版）
    this.cliffSlice = {
      topLeft:     { sx: 0,       sy: 0,         sw: 32, sh: 32 },
      topMid:      { sx: 32,      sy: 0,         sw: 32, sh: 32 },
      topRight:    { sx: 32 * 2,  sy: 0,         sw: 32, sh: 32 },
      midLeft:     { sx: 0,       sy: 32,        sw: 32, sh: 32 },
      midMid:      { sx: 32,      sy: 32,        sw: 32, sh: 32 },
      midRight:    { sx: 32 * 2,  sy: 32,        sw: 32, sh: 32 },
      bottomLeft:  { sx: 0,       sy: 32 * 2,    sw: 32, sh: 32 },
      bottomMid:   { sx: 32,      sy: 32 * 2,    sw: 32, sh: 32 },
      bottomRight: { sx: 32 * 2,  sy: 32 * 2,    sw: 32, sh: 32 }
    };

    // === 装饰物列表（每项一个对象，参与 Y-sort） ===
    this.decorations = [];
    // 水体（水池/溪水），用于碰撞与底层渲染
    this.waterPatches = [];

    // 离屏 canvas（草地铺面缓存，避免每帧重绘）
    this._grassCanvas = null;
    // 离屏 canvas（悬崖+装饰组成的高地遮罩，仅缓存悬崖底纹本身）
    this._cliffCanvas = null;

    this._loadImages();
    this._buildWaterPatches();
    this._buildDecorations();
    // 尝试应用游戏编辑器保存的场景数据（localStorage），实现编辑器与游戏联动
    this._applyEditorOverrides(config);
  }

  /**
   * 应用游戏编辑器保存的场景覆盖数据
   *
   * 编辑器把场景数据存到 localStorage：
   *   key  = 'h5game_editor_data_scenes_<gameId>'
   *   value= JSON 数组，每个元素是一个场景对象
   * 序章场景的 id 为 'scene_Prologue'。
   *
   * 当检测到已保存的序章数据时：
   *   - 用保存的 decoSprites 覆盖切片配置
   *   - 用保存的 decorations + 装饰层中的 slice 对象重建装饰物列表
   * @param {Object} config 构造参数（可指定 editorGameId / editorSceneId）
   * @private
   */
  _applyEditorOverrides(config = {}) {
    if (typeof localStorage === 'undefined' && typeof fetch === 'undefined') return;

    const gameId = config.editorGameId || 'sanguo_zhangjiao';
    const sceneId = config.editorSceneId || 'scene_Prologue';

    // 优先从 localStorage 读取（浏览器编辑器联动）
    let scene = null;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('h5game_editor_data_scenes_' + gameId);
        if (raw) {
          const scenes = JSON.parse(raw);
          scene = Array.isArray(scenes) ? scenes.find(s => s && s.id === sceneId) : null;
        }
      }
    } catch (e) {
      console.warn('Scene1Terrain: 读取 localStorage 场景数据失败', e);
    }
    
    // localStorage 没有时，从文件加载编辑器导出的 JSON（安卓打包后 fallback）
    if (!scene) {
      const jsonFile = '序章 - 盆地营地_1780211984127.json';
      const jsonPath = this.assetBase + encodeURIComponent(jsonFile).replace(/%2F/g, '/');
      fetch(jsonPath)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) return;
          const scenes = Array.isArray(data) ? data : [data];
          const s = scenes.find(s => s && s.id === sceneId);
          if (s) {
            this._applySceneData(s);
            // 重建缓存
            this._grassCanvas = null;
          }
        })
        .catch(e => console.warn('Scene1Terrain: 加载编辑器 JSON fallback 失败', e));
      return;
    }
    
    this._applySceneData(scene);
  }

  /**
   * 应用场景数据（从 localStorage 或文件加载后调用）
   * @param {Object} scene - 场景对象
   * @private
   */
  _applySceneData(scene) {
    if (!scene) return;

    // 1. 覆盖切片配置（用户可能在编辑器里调整过切片位置/尺寸/碰撞）
    if (scene.decoSprites && typeof scene.decoSprites === 'object') {
      for (const [key, sp] of Object.entries(scene.decoSprites)) {
        this.decoSprites[key] = { ...this.decoSprites[key], ...sp };
      }
    }

    // 2. 从图层中收集装饰物
    const decorations = [];

    // layer_deco 中的对象：
    //   - type:'deco'：新版统一装饰物 {decoKey, x, y, width, height}（左上角锚点）
    //   - type:'slice' + decoKey：切片型装饰物 {decoKey, x, y, width, height}（左上角锚点）
    if (Array.isArray(scene.layers)) {
      for (const layer of scene.layers) {
        if (!layer || !Array.isArray(layer.objects)) continue;
        for (const obj of layer.objects) {
          if (!obj) continue;
          
          let key = null;
          if (obj.type === 'deco') {
            key = obj.decoKey || obj.name;
          } else if (obj.type === 'slice') {
            key = obj.decoKey || obj.sliceKey;
          } else {
            continue;
          }
          
          if (!key || !this.decoSprites[key]) continue;
          const sprite = this.decoSprites[key];
          const w = obj.width || sprite.sw;
          const h = obj.height || sprite.sh;
          // 左上角 -> 底部中心锚点
          decorations.push({
            x: Math.round(obj.x + w / 2),
            y: Math.round(obj.y + h),
            key,
            scale: w / sprite.sw
          });
        }
      }
    }

    // 只有当编辑器确实保存了装饰物时才覆盖，避免空数据清空整个场景
    if (decorations.length > 0) {
      this.decorations = decorations;
      this._treeColliders = null; // 重置碰撞缓存，下次按新装饰物重建
      // 标记：使用编辑器保存的顺序（深度），不再 Y-sort
      this._useEditorOrder = true;
      console.log('Scene1Terrain: 已应用编辑器场景数据，装饰物数量 =', decorations.length);
    }
    
    // 3. 读取图层中的背景图片对象（type:'image' / type:'fill'）
    this._editorBackgroundImages = [];
    if (Array.isArray(scene.layers)) {
      for (const layer of scene.layers) {
        if (!layer || !Array.isArray(layer.objects)) continue;
        for (const obj of layer.objects) {
          if (!obj) continue;
          if (obj.type === 'image' && obj.imageId) {
            // 从 imageAssets 获取图片 src
            const asset = scene.imageAssets && scene.imageAssets[obj.imageId];
            if (asset && asset.src) {
              // 修正路径：编辑器保存的路径是相对于编辑器页面的
              // 游戏运行时需要转为相对于游戏页面的路径
              let src = asset.src;
              // 去掉编辑器相对前缀（如 "../example/sanguo_zhangjiao/"）
              const assetsIdx = src.indexOf('assets/');
              if (assetsIdx !== -1) {
                src = src.substring(assetsIdx);
              }
              this._editorBackgroundImages.push({
                src: src,
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height,
                layerId: layer.id,
                _img: null,
                _loaded: false
              });
            }
          } else if (obj.type === 'fill' && obj.fillMode === 'image' && obj.imageSrc) {
            this._editorBackgroundImages.push({
              src: obj.imageSrc,
              x: obj.x || 0,
              y: obj.y || 0,
              width: obj.width || this.basinWidth,
              height: obj.height || this.basinHeight,
              imageMode: obj.imageMode || 'stretch',
              opacity: obj.opacity,
              layerId: layer.id,
              _img: null,
              _loaded: false
            });
          }
        }
      }
      // 加载背景图片
      for (const bgImg of this._editorBackgroundImages) {
        const img = new Image();
        img.onload = () => { bgImg._img = img; bgImg._loaded = true; };
        img.src = bgImg.src;
      }
    }
  }

  /**
   * 加载所有图片
   * @private
   */
  _loadImages() {
    const list = [
      ['mountain',   'mountain_landscape.png'],
      ['terrain',    'terrain_grass_water.png'],
      ['oga',        'OGAtilesetsremixed.png'],
      ['cliff',      'cliff_grass.png']
    ];
    for (const [key, file] of list) {
      const img = new Image();
      img.onload = () => {
        this.loaded[key] = true;
        if (key === 'mountain') this._grassCanvas = null;
      };
      img.onerror = () => console.warn('Scene1Terrain: 图片加载失败', file);
      img.src = this.assetBase + file;
      this.images[key] = img;
    }
  }

  /**
   * 构建装饰物清单（随机分布）
   * 在盆地内部稀疏放置树/灌木，在高地（悬崖外圈）密集放置树木
   * 每个装饰物：{ x, y, key, scale }
   *   - x,y 是底部锚点（脚下中心点，用于 Y-sort）
   *   - key 指向 decoSprites 里的切片（如 'tree1', 'bush2'）
   *   - scale 整体缩放
   * @private
   */
  _buildDecorations() {
    const cx = this.centerX;
    const cy = this.centerY;
    const w  = this.basinWidth;
    const h  = this.basinHeight;
    const fireRadius = 90; // 火堆周围保留空地

    // 简单确定性伪随机（场景每次表现一致）
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    // 外围树木选择：tree1 概率 25%，其余在 tree2/tree3 平分
    const pickOuterTree = () => {
      const r = rand();
      if (r < 0.25) return 'tree1';
      return r < 0.625 ? 'tree2' : 'tree3';
    };

    // 椭圆参数化：根据角度返回椭圆上点的 (x, y)，并按 radiusJitter 抖动半径
    // factor: 半径缩放因子（1.0 = 树圈本身，<1.0 = 内缘，>1.0 = 外缘）
    // radiusJitter: 半径抖动幅度（像素）
    const ellipsePoint = (angle, factor, radiusJitter) => {
      const jitter = (rand() - 0.5) * radiusJitter * 2;
      const rx = this.basinRadiusX * factor + jitter;
      const ry = this.basinRadiusY * factor + jitter * this.basinAspectY;
      return {
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry
      };
    };

    // ---- 1. 主树圈：3 排密集分布的树围满椭圆边缘（南向留入口）----
    const ringConfigs = [
      { count: 64, factor: 1.02, jitter: 18 },  // 中圈：紧贴椭圆轮廓
      { count: 56, factor: 0.94, jitter: 14 },  // 内圈：往里一点
      { count: 56, factor: 1.10, jitter: 16 },  // 外圈：往外一点
    ];
    for (const cfg of ringConfigs) {
      for (let i = 0; i < cfg.count; i++) {
        const baseAngle = (i / cfg.count) * Math.PI * 2 - Math.PI / 2
                        + (rand() - 0.5) * Math.PI * 6 / 180;
        const angDistFromSouth = Math.abs(this._normalizeAngle(baseAngle - Math.PI / 2));
        if (angDistFromSouth < this.entranceAngleHalfWidth) continue;
        const pt = ellipsePoint(baseAngle, cfg.factor, cfg.jitter);
        this.decorations.push({
          x: Math.round(pt.x),
          y: Math.round(pt.y),
          key: pickOuterTree(),
          scale: 1.0
        });
      }
    }

    // ---- 1b. 草地下方空地补充树（椭圆下半圆外侧）----
    // 草地视觉上移 32 后，下边缘外露出空地，铺一排树盖住
    const bottomFillCount = 36;
    for (let i = 0; i < bottomFillCount; i++) {
      // 角度集中在下半圆（0..π），即东 → 南 → 西
      const baseAngle = (i / bottomFillCount) * Math.PI;
      const angDistFromSouth = Math.abs(this._normalizeAngle(baseAngle - Math.PI / 2));
      if (angDistFromSouth < this.entranceAngleHalfWidth) continue;
      const angle = baseAngle + (rand() - 0.5) * Math.PI * 4 / 180;
      // factor 1.14~1.24：在树圈外侧再延伸一段
      const factor = 1.14 + rand() * 0.10;
      const pt = ellipsePoint(angle, factor, 12);
      this.decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key: pickOuterTree(),
        scale: 1.0
      });
    }

    // ---- 1c. 入口处草丛和灌木遮挡（视觉遮挡，不参与碰撞）----
    // 在南向入口扇形内放草丛/灌木，覆盖入口缺口的草地下边缘弧线
    // 这些都是 collide:false，不会挡住玩家进出
    // belowEntities=true: 渲染在所有实体下层，不会遮挡玩家
    const entranceDecoCount = 18;
    for (let i = 0; i < entranceDecoCount; i++) {
      const t01 = i / entranceDecoCount;
      const angle = Math.PI / 2 + (t01 - 0.5) * 2 * this.entranceAngleHalfWidth
                  + (rand() - 0.5) * Math.PI * 2 / 180;
      const factor = 1.0 + rand() * 0.18;
      const pt = ellipsePoint(angle, factor, 8);
      const r = rand();
      let key;
      if (r < 0.5)       key = 'grass1';
      else if (r < 0.75) key = 'bush2';
      else if (r < 0.9)  key = 'bush3';
      else               key = 'bush4';
      this.decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key,
        scale: 1.0,
        belowEntities: true
      });
    }

    // ---- 4. 树圈附近少量草地（grass1）----
    const innerGrassCount = 10;
    for (let i = 0; i < innerGrassCount; i++) {
      const angle = rand() * Math.PI * 2;
      const factor = 0.84 + rand() * 0.08;
      const pt = ellipsePoint(angle, factor, 8);
      this.decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key: 'grass1',
        scale: 1.0
      });
    }

    // ---- 4b. 树圈内缘点缀草丛 + 灌木 ----
    const edgeDecoCount = 10;
    for (let i = 0; i < edgeDecoCount; i++) {
      const baseAngle = (i / edgeDecoCount) * Math.PI * 2;
      const angDistFromSouth = Math.abs(this._normalizeAngle(baseAngle - Math.PI / 2));
      if (angDistFromSouth < this.entranceAngleHalfWidth - Math.PI * 2 / 180) continue;
      const angle = baseAngle + (rand() - 0.5) * Math.PI * 8 / 180;
      const factor = 0.86 + rand() * 0.16;
      const pt = ellipsePoint(angle, factor, 4);
      const r = rand();
      let key;
      if (r < 0.45)      key = 'grass1';
      else if (r < 0.7)  key = 'bush2';
      else if (r < 0.85) key = 'bush3';
      else               key = 'bush4';
      this.decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key,
        scale: 1.0
      });
    }

    // ---- 4c. 椭圆上下边缘遮挡带：完整一整圈密集 grass1 ----
    // 底部锚点在椭圆外侧 1.04~1.10，96px 高的草丛向上延伸正好覆盖椭圆边缘
    // 上半圆和下半圆都覆盖，形成完整的森林底部带
    const edgeShieldCount = 56;
    for (let i = 0; i < edgeShieldCount; i++) {
      const baseAngle = (i / edgeShieldCount) * Math.PI * 2 - Math.PI / 2;
      const angDistFromSouth = Math.abs(this._normalizeAngle(baseAngle - Math.PI / 2));
      if (angDistFromSouth < this.entranceAngleHalfWidth + Math.PI * 2 / 180) continue;
      const angle = baseAngle + (rand() - 0.5) * Math.PI * 4 / 180;
      const factor = 1.02 + rand() * 0.08;
      const pt = ellipsePoint(angle, factor, 5);
      this.decorations.push({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        key: 'grass1',
        scale: 1.0
      });
    }

    // ---- 5. 盆地内部：随机分布的树木（只用 tree2/tree3，3-5 棵）----
    const innerTrees = 3 + Math.floor(rand() * 3); // 3..5
    const innerTreePositions = [];
    for (let i = 0; i < innerTrees; i++) {
      let x, y, tries = 0, ok = false;
      do {
        // 椭圆内均匀采样
        const ang = rand() * Math.PI * 2;
        const u = Math.sqrt(rand());      // 抗中心聚集
        x = cx + Math.cos(ang) * u * (this.basinInnerRadiusX - 60);
        y = cy + Math.sin(ang) * u * (this.basinInnerRadiusY - 40);
        tries++;
        ok = !(
          Math.hypot(x - cx, y - cy) < fireRadius + 30 ||
          this._inEntranceCorridor(x, y) ||
          this._inAnyWaterPatch(x, y, 24) ||
          innerTreePositions.some(t => Math.hypot(x - t.x, y - t.y) < 56)
        );
      } while (!ok && tries < 16);
      if (!ok) continue;
      innerTreePositions.push({ x, y });
      this.decorations.push({
        x: Math.round(x),
        y: Math.round(y),
        key: pick(this.innerTreeKeys),
        scale: 1.0
      });
    }

    // ---- 6. 盆地内部：随机分布的灌木丛（小图块，不挡路）----
    const innerBushes = 26;
    for (let i = 0; i < innerBushes; i++) {
      let x, y, tries = 0;
      do {
        const ang = rand() * Math.PI * 2;
        const u = Math.sqrt(rand());
        x = cx + Math.cos(ang) * u * (this.basinInnerRadiusX - 30);
        y = cy + Math.sin(ang) * u * (this.basinInnerRadiusY - 20);
        tries++;
      } while (
        (Math.hypot(x - cx, y - cy) < fireRadius ||
         this._inEntranceCorridor(x, y) ||
         this._inAnyWaterPatch(x, y, 8))
        && tries < 8
      );
      this.decorations.push({
        x: Math.round(x),
        y: Math.round(y),
        key: pick(this.bushKeys),
        scale: 1.0
      });
    }
  }

  /**
   * 把任意角度规范化到 [-π, π]
   * @private
   */
  _normalizeAngle(a) {
    while (a >  Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  /**
   * 判断点是否在入口通道（基于椭圆距离 + 南向角度扇形）
   * @private
   */
  _inEntranceCorridor(x, y) {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    // 椭圆归一化距离
    const ed = Math.hypot(dx / this.basinRadiusX, dy / this.basinRadiusY);
    if (ed < 0.7) return false;
    if (ed > 1.25) return false;
    const ang = Math.atan2(dy, dx);
    const angDistFromSouth = Math.abs(this._normalizeAngle(ang - Math.PI / 2));
    return angDistFromSouth < this.entranceAngleHalfWidth + Math.PI * 4 / 180;
  }

  /**
   * 判断点是否在任意水池内（含外扩 margin）
   * @private
   */
  _inAnyWaterPatch(x, y, margin = 0) {
    for (const p of this.waterPatches) {
      const rx = p.rx + margin;
      const ry = p.ry + margin;
      const dx = (x - p.x) / rx;
      const dy = (y - p.y) / ry;
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  /**
   * 构建水体（圆形/椭圆形水池）
   * 当前已禁用 —— 不再生成湖泊
   * @private
   */
  _buildWaterPatches() {
    // 不生成任何水体
  }

  /**
   * 检查指定点是否处于不可通行区域（椭圆树圈外）
   * 椭圆盆地：超出椭圆就阻塞，南向入口扇形允许通过
   * @param {number} x
   * @param {number} y
   * @returns {boolean} true 表示阻塞，不能走
   */
  isBlocked(x, y) {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    // 椭圆归一化距离：< 1 在椭圆内
    const ed = Math.hypot(dx / this.basinInnerRadiusX, dy / this.basinInnerRadiusY);
    if (ed <= 1) return false;
    // 检查是否在入口扇形内
    const ang = Math.atan2(dy, dx);
    const angDistFromSouth = Math.abs(this._normalizeAngle(ang - Math.PI / 2));
    if (angDistFromSouth < this.entranceAngleHalfWidth) {
      // 入口外延伸一段允许通过：基于完整椭圆 1.18 倍
      const edOuter = Math.hypot(dx / this.basinRadiusX, dy / this.basinRadiusY);
      return edOuter > 1.18;
    }
    return true;
  }

  /**
   * 获取所有树木的碰撞圆（仅盆地内的，外圈树不参与碰撞因为本来就在悬崖外）
   * @returns {Array<{x:number, y:number, r:number}>}
   */
  getTreeColliders() {
    if (!this._treeColliders) {
      this._treeColliders = [];
      for (const deco of this.decorations) {
        const sprite = this.decoSprites[deco.key];
        if (!sprite || !sprite.collide) continue;
        // 只对盆地内的树启用碰撞（外圈悬崖区域玩家本来就走不到）
        if (
          deco.x < this.basinLeft  || deco.x > this.basinRight ||
          deco.y < this.basinTop   || deco.y > this.basinBottom
        ) continue;
        this._treeColliders.push({
          x: deco.x,
          y: deco.y - 4, // 树根中心略上一点
          r: sprite.colliderRadius || 16
        });
      }
    }
    return this._treeColliders;
  }

  /**
   * 收集装饰物到渲染队列（参与 Y-sort）
   * 标记 belowEntities 的装饰物不参与排序，由 renderBelowDecorations 单独绘制
   * @param {Array} renderQueue - 渲染队列，每项 { type, y, render }
   * @param {CanvasRenderingContext2D} ctx
   */
  collectDecorations(renderQueue, ctx) {
    // 混合策略：
    // - 非碰撞装饰物（草、灌木）预渲染到离屏缓存，作为整体一次性绘制
    // - 碰撞装饰物（树）参与 Y-sort，互相之间和实体之间正确遮挡
    
    // 渲染草地装饰缓存（一次性绘制所有非碰撞装饰物）
    if (this._groundDecoCache) {
      renderQueue.push({
        type: 'scene1_deco',
        y: -10000,
        render: () => {
          ctx.drawImage(this._groundDecoCache, this._groundDecoCacheX, this._groundDecoCacheY);
        }
      });
    }
    
    // 树类：用 Y 坐标排序，参与实体间遮挡
    for (const deco of this.decorations) {
      if (deco.belowEntities) continue;
      const sprite = this.decoSprites[deco.key];
      if (!sprite || !sprite.collide) continue;
      
      renderQueue.push({
        type: 'scene1_deco',
        y: deco.y,
        render: () => this._renderDecoration(ctx, deco)
      });
    }
  }
  
  /**
   * 构建草地装饰物离屏缓存（非碰撞装饰物：草、灌木）
   * 只在图片加载完成且缓存不存在时构建一次
   * @private
   */
  _buildGroundDecoCache() {
    if (this._groundDecoCache || !this.loaded.mountain) return;
    
    // 收集所有非碰撞装饰物
    const groundDecos = this.decorations.filter(d => {
      if (d.belowEntities) return false;
      const sprite = this.decoSprites[d.key];
      return sprite && !sprite.collide;
    });
    
    if (groundDecos.length === 0) return;
    
    // 计算包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const deco of groundDecos) {
      const sprite = this.decoSprites[deco.key];
      const scale = deco.scale * (sprite.scale ?? 1);
      const w = sprite.sw * scale;
      const h = sprite.sh * scale;
      const dx = deco.x - w / 2;
      const dy = deco.y - h;
      minX = Math.min(minX, dx);
      minY = Math.min(minY, dy);
      maxX = Math.max(maxX, dx + w);
      maxY = Math.max(maxY, dy + h);
    }
    
    const cacheW = Math.ceil(maxX - minX) + 4;
    const cacheH = Math.ceil(maxY - minY) + 4;
    
    // 限制缓存大小避免内存爆炸
    if (cacheW > 4096 || cacheH > 4096) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = cacheW;
    canvas.height = cacheH;
    const gctx = canvas.getContext('2d');
    
    // 偏移到缓存坐标系
    const offsetX = minX - 2;
    const offsetY = minY - 2;
    
    for (const deco of groundDecos) {
      const sprite = this.decoSprites[deco.key];
      const scale = deco.scale * (sprite.scale ?? 1);
      const w = sprite.sw * scale;
      const h = sprite.sh * scale;
      const dx = deco.x - w / 2 - offsetX;
      const dy = deco.y - h - offsetY;
      gctx.drawImage(
        this.images.mountain,
        sprite.sx, sprite.sy, sprite.sw, sprite.sh,
        dx, dy, w, h
      );
    }
    
    this._groundDecoCache = canvas;
    this._groundDecoCacheX = offsetX;
    this._groundDecoCacheY = offsetY;
  }

  /**
   * 渲染所有标记为 belowEntities 的装饰物（在所有实体之下）
   * @param {CanvasRenderingContext2D} ctx 已应用相机变换
   */
  renderBelowDecorations(ctx) {
    for (const deco of this.decorations) {
      if (!deco.belowEntities) continue;
      this._renderDecoration(ctx, deco);
    }
  }

  /**
   * 渲染单个装饰物（从 mountain_landscape.png 切片绘制）
   * @private
   */
  _renderDecoration(ctx, deco) {
    if (!this.loaded.mountain) return;
    const sprite = this.decoSprites[deco.key];
    if (!sprite) return;
    const totalScale = deco.scale * (sprite.scale ?? 1);
    const w = sprite.sw * totalScale;
    const h = sprite.sh * totalScale;
    // 锚点：底部中央
    const dx = deco.x - w / 2;
    const dy = deco.y - h;
    ctx.drawImage(
      this.images.mountain,
      sprite.sx, sprite.sy, sprite.sw, sprite.sh,
      dx, dy, w, h
    );
  }

  /**
   * 渲染地形底层（椭圆草地 + 外圈森林深绿环带）
   * 注：草地视觉中心 Y 上移 32 像素（视觉调整，不影响碰撞和实体位置）
   * @param {CanvasRenderingContext2D} ctx 已应用相机变换
   */
  renderGround(ctx) {
    const groundCenterX = this.centerX;
    const groundCenterY = this.centerY - 32;

    // 使用合并的地面缓存（草地 + 背景图 + 森林环带，一张图搞定）
    if (this._combinedGroundCache) {
      ctx.drawImage(this._combinedGroundCache, this._combinedGroundCacheX, this._combinedGroundCacheY);
      return;
    }
    
    // 1. 先画一圈森林深绿环带（椭圆外扩），避免边缘露黑
    this._renderForestRing(ctx, groundCenterX, groundCenterY);
    // 2. 再画椭圆盆地草地
    if (!this.loaded.mountain) {
      ctx.fillStyle = '#5a8a3a';
      ctx.beginPath();
      ctx.ellipse(groundCenterX, groundCenterY, this.basinRadiusX, this.basinRadiusY, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      this._renderGrassFill(ctx, groundCenterX, groundCenterY);
      // 素材加载完成后尝试构建草地装饰缓存
      this._buildGroundDecoCache();
      // 尝试构建合并地面缓存
      this._buildCombinedGroundCache();
    }
    this._renderWaterPatches(ctx);
    
    // 3. 渲染编辑器中保存的背景图片（使用离屏缓存）
    this._renderEditorBackgroundImages(ctx);
  }
  
  /**
   * 构建合并地面缓存：草地铺面 + 森林环带 + 背景图片 + 水池
   * 所有不会变化的底层内容合并到一张离屏 Canvas，每帧只需一次 drawImage
   * @private
   */
  _buildCombinedGroundCache() {
    if (this._combinedGroundCache) return;
    if (!this.loaded.mountain) return;
    // 等背景图片加载完再合并
    if (this._editorBackgroundImages && this._editorBackgroundImages.length > 0) {
      if (!this._editorBackgroundImages.every(bg => bg._loaded)) return;
    }
    
    const rx = this.basinRadiusX + 120;
    const ry = this.basinRadiusY / this.basinAspectY + 120; // 反压缩得到实际像素高度
    const cx = this.centerX;
    const cy = this.centerY - 32;
    
    const cacheW = Math.ceil(rx * 2 + 40);
    const cacheH = Math.ceil(ry * 2 + 40);
    if (cacheW > 4096 || cacheH > 4096) return;
    
    const offsetX = cx - cacheW / 2;
    const offsetY = cy - cacheH / 2;
    
    const canvas = document.createElement('canvas');
    canvas.width = cacheW;
    canvas.height = cacheH;
    const gctx = canvas.getContext('2d');
    
    // 偏移到缓存坐标系
    gctx.translate(-offsetX, -offsetY);
    
    // 画森林环带
    this._renderForestRing(gctx, cx, cy);
    // 画草地
    this._renderGrassFill(gctx, cx, cy);
    // 画水池
    this._renderWaterPatches(gctx);
    // 画背景图片
    if (this._editorBackgroundImages) {
      for (const bgImg of this._editorBackgroundImages) {
        if (!bgImg._loaded || !bgImg._img) continue;
        gctx.save();
        if (bgImg.opacity !== undefined) gctx.globalAlpha = bgImg.opacity;
        gctx.drawImage(bgImg._img, bgImg.x, bgImg.y, bgImg.width, bgImg.height);
        gctx.restore();
      }
    }
    
    this._combinedGroundCache = canvas;
    this._combinedGroundCacheX = offsetX;
    this._combinedGroundCacheY = offsetY;
    console.log(`Scene1Terrain: 合并地面缓存已构建 (${cacheW}x${cacheH})`);
  }
  
  /**
   * 渲染编辑器中的背景图片（带离屏缓存）
   * @private
   */
  _renderEditorBackgroundImages(ctx) {
    if (!this._editorBackgroundImages || this._editorBackgroundImages.length === 0) return;
    
    // 检查所有图片是否加载完成
    const allLoaded = this._editorBackgroundImages.every(bg => bg._loaded);
    if (!allLoaded) {
      // 还有图片没加载完，逐个画已加载的
      for (const bgImg of this._editorBackgroundImages) {
        if (!bgImg._loaded || !bgImg._img) continue;
        ctx.save();
        if (bgImg.opacity !== undefined) ctx.globalAlpha = bgImg.opacity;
        ctx.drawImage(bgImg._img, bgImg.x, bgImg.y, bgImg.width, bgImg.height);
        ctx.restore();
      }
      return;
    }
    
    // 全部加载完成后，构建离屏缓存
    if (!this._bgImageCache) {
      // 计算包围盒
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const bg of this._editorBackgroundImages) {
        minX = Math.min(minX, bg.x);
        minY = Math.min(minY, bg.y);
        maxX = Math.max(maxX, bg.x + bg.width);
        maxY = Math.max(maxY, bg.y + bg.height);
      }
      const cacheW = Math.ceil(maxX - minX) + 2;
      const cacheH = Math.ceil(maxY - minY) + 2;
      
      if (cacheW <= 4096 && cacheH <= 4096) {
        const canvas = document.createElement('canvas');
        canvas.width = cacheW;
        canvas.height = cacheH;
        const gctx = canvas.getContext('2d');
        const offsetX = minX - 1;
        const offsetY = minY - 1;
        
        for (const bgImg of this._editorBackgroundImages) {
          gctx.save();
          if (bgImg.opacity !== undefined) gctx.globalAlpha = bgImg.opacity;
          gctx.drawImage(bgImg._img, bgImg.x - offsetX, bgImg.y - offsetY, bgImg.width, bgImg.height);
          gctx.restore();
        }
        
        this._bgImageCache = canvas;
        this._bgImageCacheX = offsetX;
        this._bgImageCacheY = offsetY;
      }
    }
    
    // 使用缓存绘制
    if (this._bgImageCache) {
      ctx.drawImage(this._bgImageCache, this._bgImageCacheX, this._bgImageCacheY);
    }
  }

  /**
   * 椭圆外的森林深绿环带（带羽化边缘）
   * @private
   */
  _renderForestRing(ctx, centerX, centerY) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(1, this.basinAspectY);
    const grad = ctx.createRadialGradient(
      0, 0, this.basinRadiusX - 10,
      0, 0, this.basinRadiusX + 110
    );
    grad.addColorStop(0,    'rgba(35, 58, 25, 1)');
    grad.addColorStop(0.55, 'rgba(28, 46, 20, 0.92)');
    grad.addColorStop(1,    'rgba(20, 30, 15, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, this.basinRadiusX + 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 椭圆草地铺面（使用离屏缓存）
   * @param {number} centerX 草地椭圆中心 X（视觉位置）
   * @param {number} centerY 草地椭圆中心 Y（视觉位置）
   * @private
   */
  _renderGrassFill(ctx, centerX, centerY) {
    if (!this._grassCanvas) {
      const rx = this.basinRadiusX + 20;
      const ry = this.basinRadiusY + 20;
      const w = rx * 2, h = ry * 2;
      this._grassCanvas = document.createElement('canvas');
      this._grassCanvas.width = w;
      this._grassCanvas.height = h;
      const gctx = this._grassCanvas.getContext('2d');
      // 椭圆 clip
      gctx.save();
      gctx.beginPath();
      gctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
      gctx.clip();
      const tile = this.terrainTile;
      const slice = this.grassTile;
      for (let y = 0; y < h; y += tile) {
        for (let x = 0; x < w; x += tile) {
          gctx.drawImage(
            this.images.mountain,
            slice.sx, slice.sy, slice.sw, slice.sh,
            x, y, tile, tile
          );
        }
      }
      // 椭圆 vignette（外圈渐暗）
      const vignette = gctx.createRadialGradient(
        rx, ry, Math.min(rx, ry) * 0.55,
        rx, ry, Math.max(rx, ry)
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
      gctx.fillStyle = vignette;
      gctx.fillRect(0, 0, w, h);
      gctx.restore();
    }
    const rx = this.basinRadiusX + 20;
    const ry = this.basinRadiusY + 20;
    ctx.drawImage(
      this._grassCanvas,
      centerX - rx,
      centerY - ry
    );
  }

  /**
   * 渲染水池
   * @private
   */
  _renderWaterPatches(ctx) {
    ctx.save();
    for (const p of this.waterPatches) {
      // 水底深色阴影
      ctx.fillStyle = 'rgba(20, 60, 90, 0.85)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // 水面高光（如果有水图块就用图块平铺）
      if (this.loaded.terrain) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx - 4, p.ry - 3, 0, 0, Math.PI * 2);
        ctx.clip();
        const t = this.tileWater;
        const tw = 32, th = 32;
        const x0 = Math.floor((p.x - p.rx) / tw) * tw;
        const y0 = Math.floor((p.y - p.ry) / th) * th;
        for (let yy = y0; yy < p.y + p.ry; yy += th) {
          for (let xx = x0; xx < p.x + p.rx; xx += tw) {
            ctx.drawImage(
              this.images.terrain,
              t.sx, t.sy, t.sw, t.sh,
              xx, yy, tw, th
            );
          }
        }
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(70, 130, 180, 0.85)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx - 4, p.ry - 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // 水面高光描边
      ctx.strokeStyle = 'rgba(180, 220, 240, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 已废弃：之前的矩形悬崖渲染
   * 现在用圆形树圈代替，本方法保留空实现以保持调用兼容
   * @param {CanvasRenderingContext2D} ctx 已应用相机变换
   */
  renderCliffs(ctx) {
    // 不再绘制矩形悬崖
  }
}

