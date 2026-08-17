/**
 * SceneStreamingRuntime owns the generic lifecycle around one WorldStreamingManager.
 * Host scenes inject terrain construction and projection hooks; content state remains outside core.
 */
import { WorldStreamingManager } from '../WorldStreamingManager.js';

const cloneSceneData = sceneData => (
  sceneData && Array.isArray(sceneData.layers)
    ? JSON.parse(JSON.stringify(sceneData))
    : null
);

export class SceneStreamingRuntime {
  constructor({
    WorldStreamingManagerClass = WorldStreamingManager,
    createTerrain = null,
    getPosition = null,
    getCurrentSceneId = null,
    getRuntime = null,
    onProjection = null,
    onChunkUnload = null,
    onTransition = null,
    onError = null
  } = {}) {
    this.WorldStreamingManagerClass = WorldStreamingManagerClass;
    this.createTerrain = createTerrain;
    this.getPosition = getPosition;
    this.getCurrentSceneId = getCurrentSceneId;
    this.getRuntime = getRuntime;
    this.onProjection = onProjection;
    this.onChunkUnload = onChunkUnload;
    this.onTransition = onTransition;
    this.onError = onError;
    this.manager = null;
    this.terrainsByChunk = new Map();
    this.detach = null;
  }

  async prepare({ worldResult, targetSceneId = null, session = null, stateProviders = [] } = {}) {
    const worldIndex = worldResult?.worldIndex;
    const region = worldResult?.region;
    if (!worldIndex || !region) {
      throw new Error('无法初始化流式加载：ProjectWorldIndex 或 Region 不存在');
    }

    const manager = new this.WorldStreamingManagerClass();
    const configured = manager.configureRegion(worldIndex, {
      regionRef: region.id,
      sceneResolver: sceneId => session?.loadSceneData?.(sceneId)
        || session?.getSceneData?.(sceneId)
        || null,
      onChunkUnload: null
    });
    if (!configured.ok) {
      throw new Error(configured.errors?.[0]?.message || '流式 Region 配置失败');
    }

    for (const { id, provider } of stateProviders) {
      manager.registerStateProvider(id, provider);
    }

    const initialChunk = worldResult.chunks?.find(chunk => chunk.sceneId === targetSceneId);
    if (!initialChunk) throw new Error('流式 Region 中没有可加载 chunk');
    const centerX = initialChunk.offset.x + region.chunkWidth / 2;
    const centerY = initialChunk.offset.y + region.chunkHeight / 2;
    const loaded = await manager.update(centerX, centerY);
    if (!loaded.ok) {
      manager.unloadAll({ preserveState: false });
      throw new Error(loaded.errors?.[0]?.message || '初始九宫格加载失败');
    }
    return manager;
  }

  async initialize({ worldResult, targetSceneId = null, session = null, preparedManager = null, stateProviders = [] } = {}) {
    const manager = preparedManager || await this.prepare({
      worldResult, targetSceneId, session, stateProviders
    });
    this.dispose();
    manager.onChunkUnload = (col, row, chunk) => this.onChunkUnload?.({ col, row, chunk, manager });
    this.manager = manager;
    this.terrainsByChunk.clear();
    this.syncProjection();

    const runtime = this.getRuntime?.();
    this.detach = runtime?.attachWorldStreaming?.(manager, {
      getPosition: () => this.getPosition?.() || null,
      onTransition: async transition => {
        if (transition?.unchanged) return;
        this.syncProjection();
        await this.onTransition?.({ transition, manager });
      },
      onError: failure => this.onError?.(failure)
    }) || null;
    return manager;
  }

  syncProjection(currentSceneId = this.getCurrentSceneId?.()) {
    const manager = this.manager;
    if (!manager) return null;
    const chunks = [...manager.getLoadedChunks().values()];
    const activeKeys = new Set(chunks.map(chunk => chunk.key));
    for (const key of this.terrainsByChunk.keys()) {
      if (!activeKeys.has(key)) this.terrainsByChunk.delete(key);
    }

    for (const chunk of chunks) {
      if (this.terrainsByChunk.has(chunk.key)) continue;
      const terrain = this.createTerrain?.({
        chunk,
        manager,
        chunkWidth: manager.chunkWidth,
        chunkHeight: manager.chunkHeight,
        sceneData: cloneSceneData(chunk.sceneData)
      });
      if (terrain) this.terrainsByChunk.set(chunk.key, terrain);
    }

    const terrains = chunks.map(chunk => this.terrainsByChunk.get(chunk.key)).filter(Boolean);
    const currentChunk = chunks.find(chunk => chunk.sceneId === currentSceneId);
    const terrain = currentChunk
      ? this.terrainsByChunk.get(currentChunk.key)
      : (terrains[0] || null);
    this.onProjection?.({ manager, chunks, terrains, terrain, currentSceneId });
    return { manager, chunks, terrains, terrain };
  }

  dispose() {
    this.detach?.();
    this.detach = null;
    this.manager?.unloadAll?.({ preserveState: false });
    this.manager = null;
    this.terrainsByChunk.clear();
  }
}

export default SceneStreamingRuntime;
