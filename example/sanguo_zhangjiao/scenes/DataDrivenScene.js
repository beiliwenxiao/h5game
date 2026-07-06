/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * DataDrivenScene - 数据驱动场景（P4-3，叠加式，不替换现有 Act 场景）
 *
 * 读 GameProject.scenes[sceneId] 的图层与逻辑对象，用统一 ShapeRenderer 渲染背景，
 * 用 EntityFactory + 内容库 registries 实例化 spawn/npc/building/vehicle，
 * 用 GameLoader 装配触发器/黑板/对话/任务，用 VehicleSystem 管驾乘。
 *
 * 目标：验证“一份数据 → 直接跑一个场景”的链路（§9/§10 P4-3）。
 * 后续 Act1~6 逐幕对照迁移到本类（P4-5，高风险，逐幕验收）。
 *
 * 坐标：本类先用场景局部坐标（单 chunk）；P5 接 WorldStreamingManager 后转世界坐标。
 */

import { Scene } from '../../../src/core/Scene.js';
import { ShapeRenderer } from '../../../src/rendering/ShapeRenderer.js';
import { EntityFactory } from '../../../src/ecs/EntityFactory.js';
import { GameLoader } from '../../../src/core/GameLoader.js';
import { VehicleSystem } from '../../../src/systems/VehicleSystem.js';
import { RNG } from '../../../src/core/RNG.js';

export class DataDrivenScene extends Scene {
  /**
   * @param {string} name
   * @param {Object} deps - {
   *   dialogueSystem, questSystem, sceneManager, audioManager, floatingText, tutorial,
   *   camera, assetBaseUrl, rngSeed
   * }
   */
  constructor(name = 'DataDrivenScene', deps = {}) {
    super(name);
    this.deps = deps;
    this.project = null;
    this.sceneId = null;
    this.sceneData = null;

    // 运行时
    this.gameLoader = deps.gameLoader || new GameLoader();
    this.entityFactory = deps.entityFactory || new EntityFactory();
    this.rng = new RNG(deps.rngSeed != null ? deps.rngSeed : 12345);
    this.worldEntities = [];               // 实例化的实体
    this.logicObjects = { regions: [], spawns: [], portals: [], npcs: [] };
    this.vehicleSystem = new VehicleSystem({
      resolveEntity: (id) => this.worldEntities.find(e => e.id === id) || null,
      onEvent: (evt, data) => this._emitVehicleEvent(evt, data)
    });

    // 资源
    this._images = new Map();              // src -> HTMLImageElement
    this.assetBaseUrl = deps.assetBaseUrl || 'assets/';
    this.camera = deps.camera || null;

    // ShapeRenderer 资源解析器
    this._shapeResolver = {
      getImage: (keyOrSrc) => this._getImage(keyOrSrc),
      getSliceSource: (shape) => this._getSliceSource(shape)
    };
  }

  /**
   * 用已解析的工程对象 + 场景 id 装配场景（不 fetch）
   * @param {Object} project - GameProject
   * @param {string} sceneId
   */
  loadFromProject(project, sceneId) {
    this.project = project;
    this.sceneId = sceneId;
    this.sceneData = (project.scenes || []).find(s => s.id === sceneId) || null;
    if (!this.sceneData) {
      console.warn('DataDrivenScene: 未找到场景', sceneId);
    }
    // 装配触发器/黑板/库
    this.gameLoader.assemble(project, {
      dialogueSystem: this.deps.dialogueSystem,
      questSystem: this.deps.questSystem,
      sceneManager: this.deps.sceneManager,
      audioManager: this.deps.audioManager,
      floatingText: this.deps.floatingText,
      tutorial: this.deps.tutorial,
      world: null,
      player: this.deps.player || null
    });
    this._collectLogicObjects();
    this._preloadImages();
    return this;
  }

  /**
   * 从工程 URL 加载并装配
   * @param {string} url
   * @param {string} sceneId
   */
  async loadFromUrl(url, sceneId) {
    const project = await this.gameLoader.load(url, {
      dialogueSystem: this.deps.dialogueSystem,
      questSystem: this.deps.questSystem,
      sceneManager: this.deps.sceneManager,
      audioManager: this.deps.audioManager,
      floatingText: this.deps.floatingText,
      tutorial: this.deps.tutorial
    });
    this.project = project;
    this.sceneId = sceneId;
    this.sceneData = (project.scenes || []).find(s => s.id === sceneId) || null;
    this._collectLogicObjects();
    this._preloadImages();
    return this;
  }

  // ---- 生命周期 ----

  enter(data = null) {
    super.enter(data);
    this._instantiateLogicObjects();
    // 通知触发器：进入场景
    this.gameLoader.triggerSystem.fire('sceneEnter', { sceneId: this.sceneId });
  }

  exit() {
    super.exit();
    // 卸载实体
    for (const e of this.worldEntities) { try { e.destroy?.(); } catch (err) { /* ignore */ } }
    this.worldEntities = [];
  }

  update(deltaTime) {
    // 触发器（timer 等）
    this.gameLoader.update(deltaTime);
    // 驾乘同步
    this.vehicleSystem.update(deltaTime);
    // 实体更新
    for (const e of this.worldEntities) {
      if (e.active !== false && typeof e.update === 'function') e.update(deltaTime);
    }
  }

  render2D(ctx) {
    if (!this.sceneData) return;
    ctx.save();
    if (this.camera && typeof this.camera.applyTransform === 'function') {
      this.camera.applyTransform(ctx);
    }
    this._renderLayers(ctx);
    this._renderEntities(ctx);
    ctx.restore();
  }

  // ---- 逻辑对象收集 / 实例化 ----

  /**
   * 从场景数据收集逻辑对象（兼容两种存法）：
   *   1) scene.objects.{regions,spawns,portals,npcs}（§1 蓝图）
   *   2) scene.layers[].objects 里 type 为 region/spawn/portal/npc（编辑器 layer_logic）
   * @private
   */
  _collectLogicObjects() {
    const buckets = { regions: [], spawns: [], portals: [], npcs: [] };
    if (!this.sceneData) { this.logicObjects = buckets; return; }

    const obj = this.sceneData.objects;
    if (obj) {
      if (Array.isArray(obj.regions)) buckets.regions.push(...obj.regions);
      if (Array.isArray(obj.spawns)) buckets.spawns.push(...obj.spawns);
      if (Array.isArray(obj.portals)) buckets.portals.push(...obj.portals);
      if (Array.isArray(obj.npcs)) buckets.npcs.push(...obj.npcs);
    }

    for (const layer of this.sceneData.layers || []) {
      if (!layer || !Array.isArray(layer.objects)) continue;
      if (layer.visible === false) continue;
      for (const o of layer.objects) {
        if (o.type === 'region') buckets.regions.push(o);
        else if (o.type === 'spawn') buckets.spawns.push(o);
        else if (o.type === 'portal') buckets.portals.push(o);
        else if (o.type === 'npc') buckets.npcs.push(o);
      }
    }
    this.logicObjects = buckets;
  }

  /**
   * 按逻辑对象 + 内容库实例化实体（spawn→敌人、npc、building/vehicle 引用库）
   * @private
   */
  _instantiateLogicObjects() {
    this.worldEntities = [];
    const reg = this.gameLoader.registries;

    // NPC
    for (const n of this.logicObjects.npcs) {
      const def = n.npcRef ? reg.npcs.get(n.npcRef) : null;
      const npc = this.entityFactory.createNPC({
        ...(def || {}),
        id: n.id,
        name: (def && def.name) || n.name,
        position: { x: n.x, y: n.y }
      });
      this.worldEntities.push(npc);
    }

    // 刷怪点 → 敌人
    for (const sp of this.logicObjects.spawns) {
      const def = sp.enemyRef ? reg.enemies.get(sp.enemyRef) : null;
      const count = Math.max(1, sp.count || 1);
      for (let i = 0; i < count; i++) {
        const off = this._spreadOffset(sp.radius || 0);
        const enemy = this.entityFactory.createEnemy({
          ...(def || {}),
          templateId: (def && def.templateId) || sp.enemyRef || 'bandit',
          name: (def && def.name) || '敌人',
          level: (def && def.level) || 1,
          stats: (def && def.stats) || {},
          lootTable: (def && def.lootTable) || [],
          position: { x: sp.x + off.x, y: sp.y + off.y }
        });
        this.worldEntities.push(enemy);
      }
    }

    // 建筑（从库 buildings 或场景内联）
    for (const b of (this.sceneData.buildings || [])) {
      const def = b.ref ? reg.buildings.get(b.ref) : null;
      const ent = this.entityFactory.createBuilding({ ...(def || {}), ...b, position: b.position || { x: b.x, y: b.y } });
      this.worldEntities.push(ent);
    }

    // 载具（从库 vehicles 或场景内联）
    for (const v of (this.sceneData.vehicles || [])) {
      const def = v.ref ? reg.vehicles.get(v.ref) : null;
      const ent = this.entityFactory.createVehicle({ ...(def || {}), ...v, position: v.position || { x: v.x, y: v.y } });
      this.worldEntities.push(ent);
      this.vehicleSystem.registerVehicle(ent);
    }
  }

  /** 在半径内取随机偏移（用注入 RNG，可复现） */
  _spreadOffset(radius) {
    if (!radius || radius <= 0) return { x: 0, y: 0 };
    const a = this.rng.float(0, Math.PI * 2);
    const r = this.rng.float(0, radius);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  _emitVehicleEvent(evt, data) {
    // 表现层可在此挂飘字/音效；先留空钩子（§13 约定1：演出订阅事件）
  }

  // ---- 渲染 ----

  /** @private 渲染场景图层（shape/ellipse/fill/image/slice 走 ShapeRenderer） */
  _renderLayers(ctx) {
    for (const layer of this.sceneData.layers || []) {
      if (!layer || layer.visible === false || !Array.isArray(layer.objects)) continue;
      for (const o of layer.objects) {
        if (o.type === 'shape') {
          ShapeRenderer.render(ctx, o, this._shapeResolver);
        } else if (o.type === 'ellipse') {
          ShapeRenderer.render(ctx, { ...o, shapeType: 'ellipse' }, this._shapeResolver);
        } else if (o.type === 'fill') {
          ShapeRenderer.render(ctx, { ...o, shapeType: 'rect' }, this._shapeResolver);
        } else if (o.type === 'image') {
          const img = this._getImage(o.imageId || o.imageSrc);
          if (img) ctx.drawImage(img, o.x, o.y, o.width, o.height);
        }
        // deco/slice 交给专门渲染（此处从简，逻辑对象不画）
      }
    }
  }

  /** @private 渲染实体（简版：有 transform 就画一个占位方块 + 名称；接入现有 RenderSystem 后可替换） */
  _renderEntities(ctx) {
    // Y-sort
    const list = this.worldEntities
      .filter(e => e.active !== false && e.getComponent && e.getComponent('transform'))
      .sort((a, b) => a.getComponent('transform').position.y - b.getComponent('transform').position.y);

    for (const e of list) {
      const t = e.getComponent('transform');
      const p = t.position;
      let color = '#8888aa';
      if (e.type === 'enemy') color = '#c04040';
      else if (e.type === 'npc') color = '#40b070';
      else if (e.type === 'building') color = '#a0885a';
      else if (e.type === 'vehicle') color = '#5a78c0';
      ctx.fillStyle = color;
      ctx.fillRect(p.x - 12, p.y - 24, 24, 24);
      if (e.name) {
        ctx.fillStyle = '#fff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(e.name, p.x, p.y - 28);
      }
    }
  }

  // ---- 资源 ----

  _preloadImages() {
    if (!this.sceneData) return;
    const srcs = new Set();
    for (const layer of this.sceneData.layers || []) {
      for (const o of (layer.objects || [])) {
        if (o.type === 'image') {
          const src = this._resolveImagePath(o.imageId || o.imageSrc);
          if (src) srcs.add(src);
        } else if (o.fillMode === 'image' && o.imageSrc) {
          srcs.add(this._resolveImagePath(o.imageSrc));
        }
      }
    }
    for (const src of srcs) this._loadImage(src);
  }

  /** 把编辑器路径（可能含 ../example/.../assets/）修正为游戏运行路径 */
  _resolveImagePath(idOrSrc) {
    if (!idOrSrc) return null;
    let src = idOrSrc;
    // imageAssets 映射
    const ia = this.sceneData && this.sceneData.imageAssets;
    if (ia && ia[idOrSrc] && ia[idOrSrc].src) src = ia[idOrSrc].src;
    const idx = src.indexOf('assets/');
    if (idx >= 0) src = src.slice(idx);
    return src;
  }

  _loadImage(src) {
    if (!src || this._images.has(src)) return this._images.get(src);
    const img = new Image();
    img.src = src;
    this._images.set(src, img);
    return img;
  }

  _getImage(idOrSrc) {
    const src = this._resolveImagePath(idOrSrc);
    if (!src) return null;
    return this._images.get(src) || this._loadImage(src);
  }

  /** slice 资源解析（从 scene.atlases 找图集切片） */
  _getSliceSource(shape) {
    if (!this.sceneData) return null;
    const atlases = this.sceneData.atlases || [];
    const atlas = atlases.find(a => a.id === shape.atlasId);
    const slice = atlas && atlas.slices ? atlas.slices[shape.sliceKey] : null;
    if (!atlas || !slice) return null;
    const img = this._getImage(atlas.path || atlas.id);
    if (!img) return null;
    return { img, sx: slice.sx, sy: slice.sy, sw: slice.sw, sh: slice.sh };
  }
}

export default DataDrivenScene;
