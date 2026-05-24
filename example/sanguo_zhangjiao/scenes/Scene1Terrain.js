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
    for (const deco of this.decorations) {
      if (deco.belowEntities) continue; // 由 renderBelowDecorations 单独画
      renderQueue.push({
        type: 'scene1_deco',
        y: deco.y,
        render: () => this._renderDecoration(ctx, deco)
      });
    }
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
    }
    this._renderWaterPatches(ctx);
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

