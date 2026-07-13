/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * WorldStreamingManager - 无缝大地图九宫格流式加载（P5-2）
 *
 * authority: 'client'  // 纯客户端表现层（加载/卸载/渲染）；联网时服务器只管实体状态
 *
 * 职责：
 *   - 根据玩家世界坐标，维护 3×3 九宫格的已加载 chunk
 *   - 玩家移动时加载新 chunk、卸载远处 chunk（manhattan > 2）
 *   - 每个 chunk 对应 GameProject.scenes 中的一个 scene（通过 grid 映射）
 *   - chunk 加载时实例化场景内的逻辑对象（NPC/敌人/建筑等）
 *   - chunk 卸载时序列化动态状态（拾取/死亡/开关），恢复时还原
 *
 * 坐标系铁律（§11）：
 *   世界坐标 (worldX, worldY) —— 所有实体/相机/碰撞用它
 *   chunk(col, row) 原点 = (col * chunkWidth, row * chunkHeight)
 *   chunk 局部坐标 = worldXY - chunkOrigin
 *
 * 使用方式：
 *   const wsm = new WorldStreamingManager();
 *   wsm.init(regionConfig, project, { entityFactory, triggerSystem });
 *   // 每帧：
 *   wsm.update(playerWorldPos);
 *   // 渲染：
 *   wsm.getVisibleEntities(cameraBounds);
 */
export class WorldStreamingManager {
  constructor() {
    /** @type {Map<string, LoadedChunk>} key='col,row' */
    this.loaded = new Map();
    /** @type {Map<string, Object>} 已卸载 chunk 的序列化状态 */
    this.savedStates = new Map();

    // region 配置
    this.regionId = '';
    this.chunkWidth = 1280;
    this.chunkHeight = 720;
    this.cols = 1;
    this.rows = 1;
    this.grid = [];       // grid[row][col] = sceneId | null

    // 外部依赖
    this.project = null;
    this.deps = {};       // { entityFactory, triggerSystem, registries, ... }

    // 当前玩家所在 chunk
    this._playerChunk = null; // {col, row}
  }

  /**
   * 初始化（由 GameLoader 或场景调用）
   * @param {Object} regionConfig - worldMap.regions[0]
   *   { id, chunkWidth, chunkHeight, cols, rows, grid[][] }
   * @param {Object} project - 完整 GameProject（含 scenes[]）
   * @param {Object} deps - { entityFactory, triggerSystem, registries }
   */
  init(regionConfig, project, deps = {}) {
    if (!regionConfig) return;
    this.regionId = regionConfig.id || 'default';
    this.chunkWidth = regionConfig.chunkWidth || 1280;
    this.chunkHeight = regionConfig.chunkHeight || 720;
    this.cols = regionConfig.cols || 1;
    this.rows = regionConfig.rows || 1;
    this.grid = regionConfig.grid || [];
    this.project = project;
    this.deps = deps;

    this.loaded.clear();
    this.savedStates.clear();
    this._playerChunk = null;

    console.log(`[WorldStreaming] init: region=${this.regionId}, ${this.cols}x${this.rows}, chunk=${this.chunkWidth}x${this.chunkHeight}`);
  }

  /**
   * 每帧更新：根据玩家世界坐标加载/卸载 chunk
   * @param {{x:number, y:number}} playerWorldPos
   */
  update(playerWorldPos) {
    if (!playerWorldPos || this.cols === 0) return;

    const col = Math.floor(playerWorldPos.x / this.chunkWidth);
    const row = Math.floor(playerWorldPos.y / this.chunkHeight);

    // 玩家没换格子则跳过
    if (this._playerChunk && this._playerChunk.col === col && this._playerChunk.row === row) return;
    this._playerChunk = { col, row };

    // 计算需要加载的 3×3 九宫格
    const need = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc, r = row + dr;
        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
          need.add(`${c},${r}`);
        }
      }
    }

    // 加载新 chunk
    for (const key of need) {
      if (!this.loaded.has(key)) {
        const [c, r] = key.split(',').map(Number);
        this._loadChunk(c, r, key);
      }
    }

    // 卸载远处 chunk（manhattan > 2）
    for (const [key, chunk] of this.loaded) {
      const [c, r] = key.split(',').map(Number);
      if (Math.abs(c - col) + Math.abs(r - row) > 2) {
        this._unloadChunk(key, chunk);
      }
    }
  }

  /**
   * 获取所有已加载 chunk 的实体（供渲染/碰撞用）
   * @param {Object} [bounds] - 相机视口 {left,right,top,bottom}，传入可做粗裁剪
   * @returns {Array} 实体数组（世界坐标）
   */
  getVisibleEntities(bounds) {
    const result = [];
    for (const chunk of this.loaded.values()) {
      if (bounds && !this._chunkIntersects(chunk, bounds)) continue;
      for (const e of chunk.entities) {
        result.push(e);
      }
    }
    return result;
  }

  /**
   * 获取所有已加载 chunk 的地形渲染数据（供 WorldTerrainRenderer）
   * @returns {Array<LoadedChunk>}
   */
  getLoadedChunks() {
    return [...this.loaded.values()];
  }

  /** 世界坐标 → chunk col,row */
  worldToChunk(wx, wy) {
    return {
      col: Math.floor(wx / this.chunkWidth),
      row: Math.floor(wy / this.chunkHeight)
    };
  }

  /** chunk col,row → 世界坐标原点 */
  chunkOrigin(col, row) {
    return {
      x: col * this.chunkWidth,
      y: row * this.chunkHeight
    };
  }

  // ================ 内部方法 ================

  /** @private 加载一个 chunk */
  _loadChunk(col, row, key) {
    const sceneId = this._sceneIdAt(col, row);
    if (!sceneId) return; // grid 该位置为空

    const scene = this._findScene(sceneId);
    const origin = this.chunkOrigin(col, row);

    const chunk = new LoadedChunk(key, col, row, origin, scene);

    // 实例化逻辑对象（NPC/敌人/建筑/物品），局部坐标+origin 转世界坐标
    chunk.instantiate(this.deps);

    // 恢复之前卸载的状态
    if (this.savedStates.has(key)) {
      chunk.restoreState(this.savedStates.get(key));
      this.savedStates.delete(key);
    }

    this.loaded.set(key, chunk);

    // 通知触发器系统
    if (this.deps.triggerSystem) {
      this.deps.triggerSystem.fire('chunkEnter', { key, col, row, sceneId });
    }

    console.log(`[WorldStreaming] load chunk (${col},${row}) scene=${sceneId}, entities=${chunk.entities.length}`);
  }

  /** @private 卸载一个 chunk */
  _unloadChunk(key, chunk) {
    // 序列化动态状态
    this.savedStates.set(key, chunk.serialize());
    // 销毁
    chunk.destroy();
    this.loaded.delete(key);
    console.log(`[WorldStreaming] unload chunk ${key}`);
  }

  /** @private grid[row][col] → sceneId */
  _sceneIdAt(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    const gridRow = this.grid[row];
    if (!gridRow) return null;
    return gridRow[col] || null;
  }

  /** @private 从 project.scenes 找 scene 数据 */
  _findScene(sceneId) {
    if (!this.project || !Array.isArray(this.project.scenes)) return null;
    return this.project.scenes.find(s => s && s.id === sceneId) || null;
  }

  /** @private 判断 chunk 是否与视口相交（粗裁剪） */
  _chunkIntersects(chunk, bounds) {
    const ox = chunk.origin.x, oy = chunk.origin.y;
    const right = ox + this.chunkWidth, bottom = oy + this.chunkHeight;
    return !(right < bounds.left || ox > bounds.right || bottom < bounds.top || oy > bounds.bottom);
  }

  /** 序列化所有已加载 chunk 状态（存档用） */
  serialize() {
    const states = {};
    for (const [key, chunk] of this.loaded) {
      states[key] = chunk.serialize();
    }
    for (const [key, state] of this.savedStates) {
      states[key] = state;
    }
    return { regionId: this.regionId, playerChunk: this._playerChunk, states };
  }

  /** 反序列化（读档用） */
  deserialize(data) {
    if (!data) return;
    this._playerChunk = data.playerChunk || null;
    if (data.states) {
      for (const [key, state] of Object.entries(data.states)) {
        this.savedStates.set(key, state);
      }
    }
  }
}


/**
 * LoadedChunk - 一个已加载的地图块
 *
 * 持有该 chunk 对应的场景数据、实例化的实体、动态状态。
 * 坐标规则：场景数据中对象用局部坐标，实例化后转为世界坐标（+origin）。
 */
export class LoadedChunk {
  /**
   * @param {string} key - 'col,row'
   * @param {number} col
   * @param {number} row
   * @param {{x:number,y:number}} origin - 世界坐标原点
   * @param {Object|null} sceneData - GameProject.scenes 中的一项
   */
  constructor(key, col, row, origin, sceneData) {
    this.key = key;
    this.col = col;
    this.row = row;
    this.origin = origin;
    this.sceneData = sceneData;

    /** @type {Array} 已实例化的实体（世界坐标） */
    this.entities = [];

    /** @type {Array} 地形渲染图层数据（世界坐标偏移后的 shape 等） */
    this.layers = [];

    /** @type {Set<string>} 已拾取的物品 id */
    this.pickedItems = new Set();
    /** @type {Set<string>} 已死亡的实体 id */
    this.deadEntities = new Set();
  }

  /**
   * 实例化场景内的逻辑对象
   * 读 sceneData.layers 中 type='ref' 的放置点 + sceneData.objects，用 EntityFactory 创建
   * @param {Object} deps - { entityFactory, registries }
   */
  instantiate(deps) {
    if (!this.sceneData) return;
    const { entityFactory, registries } = deps || {};

    // 收集场景图层数据（用于渲染）
    if (Array.isArray(this.sceneData.layers)) {
      this.layers = this.sceneData.layers;
    }

    // 收集放置点（type:'ref'）
    const placements = [];
    if (Array.isArray(this.sceneData.layers)) {
      for (const layer of this.sceneData.layers) {
        for (const obj of (layer.objects || [])) {
          if (obj.type === 'ref') placements.push(obj);
        }
      }
    }

    // 也收集 objects（如果有）
    if (this.sceneData.objects) {
      const objs = this.sceneData.objects;
      for (const list of [objs.npcs, objs.spawns, objs.portals, objs.regions]) {
        if (Array.isArray(list)) {
          for (const obj of list) placements.push(obj);
        }
      }
    }

    // 实例化
    for (const pl of placements) {
      if (!entityFactory || !registries) continue;
      const worldX = (pl.x || 0) + this.origin.x;
      const worldY = (pl.y || 0) + this.origin.y;

      const kind = pl.kind || pl.type;
      const ref = pl.ref || pl.id;
      const regKey = this._regKey(kind);
      const def = regKey && registries[regKey] ? registries[regKey].get(ref) : null;

      if (kind === 'enemy' && def) {
        const enemy = entityFactory.createEnemy({
          ...def,
          position: { x: worldX, y: worldY }
        });
        enemy._chunkKey = this.key;
        this.entities.push(enemy);
      } else if (kind === 'npc' && def) {
        const npc = entityFactory.createNPC ? entityFactory.createNPC({ ...def, position: { x: worldX, y: worldY } }) : null;
        if (npc) { npc._chunkKey = this.key; this.entities.push(npc); }
      }
      // building/vehicle 等类似扩展...
    }
  }

  /**
   * 序列化动态状态（卸载/存档时调用）
   * @returns {Object}
   */
  serialize() {
    return {
      pickedItems: [...this.pickedItems],
      deadEntities: [...this.deadEntities],
      // 可扩展：NPC 位置、开关状态等
    };
  }

  /**
   * 恢复状态（重新加载时调用）
   * @param {Object} state
   */
  restoreState(state) {
    if (!state) return;
    if (state.pickedItems) this.pickedItems = new Set(state.pickedItems);
    if (state.deadEntities) {
      this.deadEntities = new Set(state.deadEntities);
      // 移除已死亡的实体
      this.entities = this.entities.filter(e => !this.deadEntities.has(e.id));
    }
  }

  /**
   * 标记实体死亡（供外部调用，如 CombatSystem 击杀后）
   * @param {string} entityId
   */
  markDead(entityId) {
    this.deadEntities.add(entityId);
  }

  /**
   * 标记物品已拾取
   * @param {string} itemId
   */
  markPicked(itemId) {
    this.pickedItems.add(itemId);
  }

  /**
   * 销毁（卸载时调用，清理引用）
   */
  destroy() {
    this.entities = [];
    this.layers = [];
  }

  /** @private kind → registries 键名 */
  _regKey(kind) {
    return ({ item: 'items', equipment: 'equipment', npc: 'npcs', enemy: 'enemies', shop: 'shops', vehicle: 'vehicles', building: 'buildings' })[kind] || null;
  }
}

export default WorldStreamingManager;
