/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { getWorldMapCellSceneId } from '../WorldMapCell.js';

function findChunkInRegion(region, sceneId) {
  if (!region || !Array.isArray(region.grid)) return null;
  for (let row = 0; row < region.grid.length; row++) {
    const cells = region.grid[row] || [];
    for (let col = 0; col < cells.length; col++) {
      const cell = cells[col];
      const id = getWorldMapCellSceneId(cell);
      if (id === sceneId) {
        const width = Number(region.chunkWidth) || 1280;
        const height = Number(region.chunkHeight) || 720;
        return { sceneId, row, col, offset: { x: col * width, y: row * height } };
      }
    }
  }
  return null;
}

function setPlayerPosition(player, x, y) {
  if (!player) return false;
  if (typeof player.setPosition === 'function') {
    player.setPosition(x, y);
    return true;
  }
  const transform = typeof player.getComponent === 'function' ? player.getComponent('transform') : null;
  const position = transform?.position || player.position;
  if (!position) return false;
  position.x = x;
  position.y = y;
  return true;
}

function setCameraPosition(camera, x, y) {
  if (!camera) return false;
  if (typeof camera.centerOn === 'function') camera.centerOn(x, y);
  else if (typeof camera.setPosition === 'function') camera.setPosition(x, y);
  else if (camera.position) Object.assign(camera.position, { x, y });
  else return false;
  return true;
}

/** 大地图区块传送器；所有状态访问和副作用均由构造参数注入。 */
export class ChunkNavigator {
  constructor({
    getRegion = () => null,
    getChunk = () => null,
    findSpawn = () => null,
    getPlayer = () => null,
    getCamera = () => null,
    onSceneEnter = null,
    onFallback = null,
    transition = null
  } = {}) {
    this.getRegion = getRegion;
    this.getChunk = getChunk;
    this.findSpawn = findSpawn;
    this.getPlayer = getPlayer;
    this.getCamera = getCamera;
    this.onSceneEnter = onSceneEnter;
    this.onFallback = onFallback;
    this.transition = transition;
  }

  async teleport({ sceneId, spawnRef = null, x = null, y = null, transition = 'none' } = {}) {
    if (!sceneId) return this._fallback({ reason: 'missingSceneId', sceneId, spawnRef });

    let region;
    let chunk;
    try {
      region = this.getRegion?.() || null;
      chunk = this.getChunk?.(sceneId) || findChunkInRegion(region, sceneId);
    } catch (error) {
      return this._fallback({ reason: 'lookupFailed', sceneId, spawnRef, error });
    }
    if (!chunk) return this._fallback({ reason: 'chunkNotFound', sceneId, spawnRef });

    const chunkWidth = Number(region?.chunkWidth) || 1280;
    const chunkHeight = Number(region?.chunkHeight) || 720;
    const offset = chunk.offset || chunk.origin || {
      x: (Number(chunk.col) || 0) * chunkWidth,
      y: (Number(chunk.row) || 0) * chunkHeight
    };
    let spawn = null;
    if (spawnRef != null) {
      try {
        spawn = this.findSpawn?.(sceneId, spawnRef) || null;
      } catch (error) {
        return this._fallback({ reason: 'spawnLookupFailed', sceneId, spawnRef, error });
      }
    }

    let worldX;
    let worldY;
    if (spawn) {
      const projected = spawn._worldOffsetApplied === true;
      worldX = (Number(spawn.x) || 0) + (projected ? 0 : offset.x);
      worldY = (Number(spawn.y) || 0) + (projected ? 0 : offset.y);
    } else {
      const localX = x == null ? chunkWidth / 2 : Number(x) || 0;
      const localY = y == null ? chunkHeight / 2 : Number(y) || 0;
      worldX = offset.x + localX;
      worldY = offset.y + localY;
    }

    const commit = async () => {
      const player = this.getPlayer?.() || null;
      const camera = this.getCamera?.() || null;
      const playerMoved = setPlayerPosition(player, worldX, worldY);
      const cameraMoved = setCameraPosition(camera, worldX, worldY);
      const result = {
        sceneId,
        spawnRef,
        spawn,
        chunk,
        x: worldX,
        y: worldY,
        playerMoved,
        cameraMoved
      };
      if (typeof this.onSceneEnter === 'function') await this.onSceneEnter(result);
      return result;
    };

    if (transition === 'none' || !this.transition) return commit();
    if (typeof this.transition === 'function') return this.transition(transition, commit);
    if (typeof this.transition.start === 'function') {
      const outcome = await this.transition.start(commit);
      return outcome?.cancelled ? outcome : (outcome?.value ?? outcome);
    }
    return commit();
  }

  _fallback(context) {
    if (typeof this.onFallback !== 'function') return Promise.resolve(null);
    try {
      return Promise.resolve(this.onFallback(context));
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

export default ChunkNavigator;