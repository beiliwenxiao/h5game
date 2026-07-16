/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-16
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * WorldStreamingManager - 九宫格流式加载管理器
 *
 * 管理一个大区（region）内的 chunk 无缝流式加载/卸载。
 * 玩家移动时自动加载周围 3×3 格，离开 >2 格的 chunk 卸载并保存状态。
 *
 * 与 SceneManager 的关系：
 * - SceneManager 管大区/幕之间切换（黑屏过渡）
 * - WorldStreamingManager 管一个大区内 chunk 无缝流式
 *
 * 坐标系（§11 铁律：世界坐标唯一）：
 * - 世界坐标 (worldX, worldY) — 所有实体/相机/碰撞统一使用
 * - chunk(col, row) 原点 = (col * chunkWidth, row * chunkHeight)
 * - chunk 局部坐标 = worldXY - chunkOrigin
 */
export class WorldStreamingManager {
  /**
   * @param {Object} options
   * @param {number} options.chunkWidth - 每个 chunk 的宽度（像素）
   * @param {number} options.chunkHeight - 每个 chunk 的高度（像素）
   * @param {number} options.cols - 世界网格列数
   * @param {number} options.rows - 世界网格行数
   * @param {Array<Array<string|null>>} options.grid - grid[row][col] = sceneId | null
   * @param {Function} [options.onChunkLoad] - chunk 加载时的回调 (col, row, sceneId) => LoadedChunk
   * @param {Function} [options.onChunkUnload] - chunk 卸载时的回调 (col, row, chunk) => void
   */
  constructor(options = {}) {
    this.chunkWidth = options.chunkWidth || 1280;
    this.chunkHeight = options.chunkHeight || 720;
    this.cols = options.cols || 4;
    this.rows = options.rows || 3;
    this.grid = options.grid || [];

    // 已加载的 chunk：Map<"col,row", LoadedChunk>
    this.loaded = new Map();

    // 已卸载 chunk 的保存状态：Map<"col,row", serializedState>
    this.savedStates = new Map();

    // 回调
    this.onChunkLoad = options.onChunkLoad || null;
    this.onChunkUnload = options.onChunkUnload || null;

    // 当前玩家所在 chunk
    this._currentCol = -1;
    this._currentRow = -1;
  }

  /**
   * 从 GameProject worldMap region 初始化
   * @param {Object} region - { chunkWidth, chunkHeight, cols, rows, grid }
   */
  initFromRegion(region) {
    if (!region) return;
    this.chunkWidth = region.chunkWidth || this.chunkWidth;
    this.chunkHeight = region.chunkHeight || this.chunkHeight;
    this.cols = region.cols || this.cols;
    this.rows = region.rows || this.rows;
    this.grid = region.grid || [];
  }

  /**
   * 世界坐标 → chunk 坐标
   * @param {number} worldX
   * @param {number} worldY
   * @returns {{col: number, row: number}}
   */
  worldToChunk(worldX, worldY) {
    return {
      col: Math.floor(worldX / this.chunkWidth),
      row: Math.floor(worldY / this.chunkHeight)
    };
  }

  /**
   * chunk 坐标 → chunk 原点（世界坐标）
   * @param {number} col
   * @param {number} row
   * @returns {{x: number, y: number}}
   */
  chunkOrigin(col, row) {
    return {
      x: col * this.chunkWidth,
      y: row * this.chunkHeight
    };
  }

  /**
   * 获取 chunk 的 sceneId
   * @param {number} col
   * @param {number} row
   * @returns {string|null}
   */
  getSceneId(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    const rowData = this.grid[row];
    if (!rowData) return null;
    return rowData[col] || null;
  }

  /**
   * 生成 3×3 九宫格需要加载的 chunk 坐标
   * @param {number} centerCol
   * @param {number} centerRow
   * @returns {Array<{col: number, row: number}>}
   */
  _getNeededChunks(centerCol, centerRow) {
    const needed = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = centerCol + dc;
        const r = centerRow + dr;
        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
          const sceneId = this.getSceneId(c, r);
          if (sceneId) {
            needed.push({ col: c, row: r });
          }
        }
      }
    }
    return needed;
  }

  /**
   * 计算 chunk 到玩家所在 chunk 的曼哈顿距离
   */
  _manhattan(col, row, centerCol, centerRow) {
    return Math.abs(col - centerCol) + Math.abs(row - centerRow);
  }

  /**
   * 每帧更新（由场景 update 调用）
   * 根据玩家世界坐标决定加载/卸载 chunk
   * @param {number} playerWorldX
   * @param {number} playerWorldY
   */
  update(playerWorldX, playerWorldY) {
    const { col, row } = this.worldToChunk(playerWorldX, playerWorldY);

    // 玩家 chunk 没变，不需要更新
    if (col === this._currentCol && row === this._currentRow) return;
    this._currentCol = col;
    this._currentRow = row;

    // 计算需要加载的 chunk
    const needed = this._getNeededChunks(col, row);
    const neededKeys = new Set(needed.map(n => `${n.col},${n.row}`));

    // 加载新 chunk
    for (const n of needed) {
      const key = `${n.col},${n.row}`;
      if (!this.loaded.has(key)) {
        this._loadChunk(n.col, n.row);
      }
    }

    // 卸载远离的 chunk（曼哈顿距离 > 2）
    for (const [key, chunk] of this.loaded) {
      const [c, r] = key.split(',').map(Number);
      if (this._manhattan(c, r, col, row) > 2) {
        this._unloadChunk(c, r, chunk);
      }
    }
  }

  /**
   * 加载一个 chunk
   * @private
   */
  _loadChunk(col, row) {
    const key = `${col},${row}`;
    const sceneId = this.getSceneId(col, row);
    if (!sceneId) return;

    const origin = this.chunkOrigin(col, row);
    const savedState = this.savedStates.get(key) || null;

    let chunk = null;
    if (this.onChunkLoad) {
      chunk = this.onChunkLoad(col, row, sceneId, origin, savedState);
    }

    if (!chunk) {
      // 默认创建简单 chunk 对象
      chunk = { col, row, sceneId, origin, entities: [], state: savedState };
    }

    this.loaded.set(key, chunk);
  }

  /**
   * 卸载一个 chunk
   * @private
   */
  _unloadChunk(col, row, chunk) {
    const key = `${col},${row}`;

    // 保存状态
    if (chunk && chunk.serialize) {
      this.savedStates.set(key, chunk.serialize());
    } else if (chunk && chunk.state) {
      this.savedStates.set(key, chunk.state);
    }

    // 回调通知
    if (this.onChunkUnload) {
      this.onChunkUnload(col, row, chunk);
    }

    // 清理
    if (chunk && chunk.destroy) {
      chunk.destroy();
    }

    this.loaded.delete(key);
  }

  /**
   * 获取所有已加载的 chunk
   * @returns {Map<string, Object>}
   */
  getLoadedChunks() {
    return this.loaded;
  }

  /**
   * 获取指定坐标处的已加载 chunk
   * @param {number} worldX
   * @param {number} worldY
   * @returns {Object|null}
   */
  getChunkAt(worldX, worldY) {
    const { col, row } = this.worldToChunk(worldX, worldY);
    return this.loaded.get(`${col},${row}`) || null;
  }

  /**
   * 强制卸载所有 chunk（大区切换时调用）
   */
  unloadAll() {
    for (const [key, chunk] of this.loaded) {
      const [c, r] = key.split(',').map(Number);
      this._unloadChunk(c, r, chunk);
    }
    this.loaded.clear();
    this._currentCol = -1;
    this._currentRow = -1;
  }

  /**
   * 序列化（存档用）
   */
  serialize() {
    const states = {};
    // 保存已加载 chunk 的当前状态
    for (const [key, chunk] of this.loaded) {
      if (chunk && chunk.serialize) {
        states[key] = chunk.serialize();
      }
    }
    // 合并之前卸载的已保存状态
    for (const [key, state] of this.savedStates) {
      if (!states[key]) {
        states[key] = state;
      }
    }
    return {
      currentCol: this._currentCol,
      currentRow: this._currentRow,
      savedStates: states
    };
  }

  /**
   * 反序列化（读档用）
   */
  deserialize(data) {
    if (!data) return;
    this._currentCol = data.currentCol ?? -1;
    this._currentRow = data.currentRow ?? -1;
    this.savedStates.clear();
    if (data.savedStates) {
      for (const [key, state] of Object.entries(data.savedStates)) {
        this.savedStates.set(key, state);
      }
    }
  }
}

export default WorldStreamingManager;
