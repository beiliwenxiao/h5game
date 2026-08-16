/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { LoadedChunk } from '../core/LoadedChunk.js';

/**
 * 旧 systems 路径的无状态兼容适配器。
 * 所有 loaded/savedStates/并发事务均由注入的 core authority 唯一拥有。
 */
export class WorldStreamingManager {
  constructor(authority) {
    if (!authority || typeof authority.update !== 'function' || typeof authority.getLoadedChunks !== 'function') {
      throw new TypeError('systems/WorldStreamingManager requires a core WorldStreamingManager authority');
    }
    this.authority = authority;
  }

  init(worldIndex, project, deps = {}) {
    const scenes = Array.isArray(project?.scenes) ? project.scenes : [];
    return this.authority.configureRegion(worldIndex, {
      regionRef: deps.regionRef,
      sceneResolver: deps.sceneResolver || (sceneId => scenes.find(scene => scene?.id === sceneId) || null),
      placementAdapter: deps.placementAdapter || null,
      onChunkLoad: deps.onChunkLoad || null,
      onChunkUnload: deps.onChunkUnload || null
    });
  }

  update(playerWorldPos, options = {}) {
    if (!playerWorldPos) return Promise.resolve({ ok: false, errors: [{ code: 'missingPlayerPosition' }] });
    return this.authority.update(playerWorldPos.x, playerWorldPos.y, options);
  }

  getVisibleEntities(bounds) {
    return this.authority.getVisibleEntities(bounds);
  }

  /** legacy 调用方仍获得数组，而 core authority 保持 Map 语义。 */
  getLoadedChunks() {
    return [...this.authority.getLoadedChunks().values()];
  }

  worldToChunk(worldX, worldY) {
    return this.authority.worldToChunk(worldX, worldY);
  }

  chunkOrigin(col, row) {
    return this.authority.chunkOrigin(col, row);
  }

  getChunkAt(worldX, worldY) {
    return this.authority.getChunkAt(worldX, worldY);
  }

  unloadAll(options) {
    return this.authority.unloadAll(options);
  }

  serialize() {
    return this.authority.serialize();
  }

  validateSerialized(data) {
    return this.authority.validateSerialized(data);
  }

  deserialize(data) {
    return this.authority.deserialize(data);
  }

  registerStateProvider(id, provider) {
    return this.authority.registerStateProvider(id, provider);
  }

  get regionId() { return this.authority.regionId; }
  get chunkWidth() { return this.authority.chunkWidth; }
  get chunkHeight() { return this.authority.chunkHeight; }
  get cols() { return this.authority.cols; }
  get rows() { return this.authority.rows; }
  get grid() { return this.authority.grid; }
  get loaded() { return this.authority.getLoadedChunks(); }
  get savedStates() { return this.authority.savedStates; }
}

export { LoadedChunk };
export default WorldStreamingManager;
