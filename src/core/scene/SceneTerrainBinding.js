/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/**
 * SceneTerrainBinding - 将游戏侧 terrain 实现绑定到通用场景生命周期。
 *
 * 不直接导入 Demo 类型；TerrainClass、场景数据读取、特效区渲染与碰撞解算
 * 均由宿主场景在构造时注入。
 */
export class SceneTerrainBinding {
  constructor({ scene, TerrainClass, hasSceneData, loadSceneFromFile, EffectZoneRenderer, SceneTerrainCollision } = {}) {
    this.scene = scene;
    this.TerrainClass = TerrainClass;
    this.hasSceneData = hasSceneData;
    this.loadSceneFromFile = loadSceneFromFile;
    this.EffectZoneRenderer = EffectZoneRenderer;
    this.SceneTerrainCollision = SceneTerrainCollision;
  }

  initEditorTerrain(config = {}) {
    const scene = this.scene;
    if (scene.terrain || scene._skipInitEditorTerrain || !this.TerrainClass) return null;
    const { gameId, sceneId, ...terrainConfig } = config;
    if (!sceneId || !this.hasSceneData || !this.hasSceneData(gameId, sceneId)) return null;

    scene.terrain = new this.TerrainClass({
      ...terrainConfig,
      editorGameId: gameId,
      editorSceneId: sceneId
    });
    scene._initEffectZones(sceneId, terrainConfig.worldOffset);
    return scene.terrain;
  }

  initEffectZones({ sceneId, worldOffset = { x: 0, y: 0 }, resourceScope = null } = {}) {
    const scene = this.scene;
    if (!scene.particleSystem || !sceneId || !this.EffectZoneRenderer || !this.loadSceneFromFile) return null;
    const renderer = new this.EffectZoneRenderer(scene.particleSystem);
    const scope = resourceScope || scene.resourceScope || null;
    scene.effectZoneRenderer = renderer;
    const applyData = data => {
      if (scope?.disposed || scene.effectZoneRenderer !== renderer) return;
      if (data && Array.isArray(data.layers)) renderer.loadFromSceneData(data, worldOffset);
    };
    const ignoreFailure = () => { /* 无场景文件或场景已退出，不加载特效区域 */ };
    this.loadSceneFromFile(sceneId)
      .then(scope?.guard?.(applyData) || applyData)
      .catch(scope?.guard?.(ignoreFailure) || ignoreFailure);
    return renderer;
  }

  collectBuffZones() {
    const scene = this.scene;
    const terrains = scene._terrains || (scene.terrain ? [scene.terrain] : []);
    if (terrains.length === 0 || !this.SceneTerrainCollision) return;

    const { zones, loadedCount, total } = this.SceneTerrainCollision.collectBuffZones(terrains);
    if (loadedCount > 0) {
      scene.zoneEffectSystem.setZones(zones);
      scene._buffZones = zones;
      if (loadedCount >= total) scene._buffZonesCollected = true;
      if (zones.length > 0 && !scene._buffZonesLogged) {
        console.log(`[SceneTerrainBinding] 收集到 ${zones.length} 个 Buff 多边形 (${loadedCount}/${total} terrains loaded)`);
        scene._buffZonesLogged = true;
      }
    }
  }

  renderBuffZones(ctx) {
    const scene = this.scene;
    const debugMode = scene.debugShowBuffZones === true;
    if (!scene._buffZones || scene._buffZones.length === 0) {
      if (debugMode && !scene._buffZonesCollected) this.collectBuffZones();
      if (!scene._buffZones || scene._buffZones.length === 0) return;
    }
    this.SceneTerrainCollision.renderBuffZones(ctx, scene._buffZones, debugMode);
  }

  checkTerrainCollision() {
    const scene = this.scene;
    const terrains = scene._terrains?.length ? scene._terrains : (scene.terrain ? [scene.terrain] : []);
    if (terrains.length === 0 || !this.SceneTerrainCollision) return;
    if (!scene._terrainCollision) scene._terrainCollision = new this.SceneTerrainCollision({ entityRadius: 12 });
    scene._terrainCollision.resolveTerrains(terrains, scene.entities, { primaryTerrain: scene.terrain || terrains[0] });
  }

  updateMinimap(minimap) {
    const scene = this.scene;
    if (!minimap) return;
    const minimapTerrains = Array.isArray(minimap._terrains) ? minimap._terrains : [];
    if (minimapTerrains.length === 0) {
      if (scene._terrains && scene._terrains.length > 0) minimap.setTerrains(scene._terrains);
      else if (scene.terrain) minimap.setTerrain(scene.terrain);
    }
    for (const terrain of (minimap._terrains || [])) {
      if (terrain._combinedGroundCache && !terrain._minimapCacheNotified) {
        terrain._minimapCacheNotified = true;
        minimap._invalidateCache();
      }
      if (terrain._groundDecoCache && !terrain._minimapDecoNotified) {
        terrain._minimapDecoNotified = true;
        minimap._invalidateCache();
      }
      if (terrain._bgImageCache && !terrain._minimapBgImgNotified) {
        terrain._minimapBgImgNotified = true;
        minimap._invalidateCache();
      }
    }
  }
}

export default SceneTerrainBinding;