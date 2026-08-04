/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/** 统一拥有玩家创建/继承、绑定和 EntityLifecycleSystem 接线。 */
export class ScenePlayerLifecycle {
  constructor({ scene, context, playerFactory, panelLayout, lifecycleSystem } = {}) {
    if (!scene) throw new TypeError('ScenePlayerLifecycle requires scene');
    if (!context?.entities) throw new TypeError('ScenePlayerLifecycle requires context');
    const createPlayer = typeof playerFactory === 'function' ? playerFactory : playerFactory?.create;
    if (typeof createPlayer !== 'function') throw new TypeError('playerFactory must provide create');
    if (!panelLayout) throw new TypeError('ScenePlayerLifecycle requires panelLayout');
    if (!lifecycleSystem) throw new TypeError('ScenePlayerLifecycle requires lifecycleSystem');

    this.scene = scene;
    this.context = context;
    this.playerFactory = playerFactory;
    this.panelLayout = panelLayout;
    this.lifecycleSystem = lifecycleSystem;
    this._createPlayer = createPlayer.bind(playerFactory);
    this._protectedPlayer = null;
    this._trackedEnemies = false;
    this._previousBeforeRemove = null;
    this._ownsBeforeRemove = false;
    this._cleanupConfigured = false;
  }

  createOrInherit(data = {}, options = {}) {
    const inherited = data?.playerEntity || null;
    const player = inherited || this._createPlayer(this.scene, data || {});
    if (!player) throw new Error('playerFactory did not return an entity');

    this.context.entities.add(player);
    this.context.entities.player = player;
    this.context.player.entity = player;
    this.context.player.inherited = Boolean(inherited);
    this.scene.playerEntity = player;

    if (inherited) options.onInherited?.(player);
    this._bindPlayer(player, Boolean(inherited));
    if (!inherited) options.onCreated?.(player);
    return player;
  }

  _bindPlayer(player, inherited) {
    this.panelLayout.bindPlayer(player, {
      syncCameraPosition: inherited,
      log: inherited
    });
  }

  /** 在场景完成进入日志后配置玩家保护与敌人清理接线。 */
  configureCleanup(player = this.context.player.entity) {
    if (this._cleanupConfigured || !player) return false;
    this.lifecycleSystem.protect?.(player);
    this._protectedPlayer = player;
    this.lifecycleSystem.trackList?.(this.context.entities.enemies);
    this._trackedEnemies = true;
    this._previousBeforeRemove = this.lifecycleSystem.onBeforeRemove || null;
    const callback = (entity) => {
      this._previousBeforeRemove?.(entity);
      if (entity?.pinnedByWeapon && this.scene.weaponRenderer) {
        entity.pinnedByWeapon = false;
        if (this.scene.weaponRenderer.thrownWeapon?.targetEntity === entity) {
          this.scene.weaponRenderer.thrownWeapon.targetEntity = null;
        }
      }
    };
    this._beforeRemove = callback;
    this.lifecycleSystem.setOnBeforeRemove?.(callback);
    this._ownsBeforeRemove = true;
    this._cleanupConfigured = true;
    return true;
  }

  dispose() {
    if (this._protectedPlayer) {
      this.lifecycleSystem.unprotect?.(this._protectedPlayer);
      this._protectedPlayer = null;
    }
    if (this._trackedEnemies) {
      this.lifecycleSystem.untrackList?.(this.context.entities.enemies);
      this._trackedEnemies = false;
    }
    if (this._ownsBeforeRemove && this.lifecycleSystem.onBeforeRemove === this._beforeRemove) {
      this.lifecycleSystem.setOnBeforeRemove?.(this._previousBeforeRemove);
    }
    this._previousBeforeRemove = null;
    this._beforeRemove = null;
    this._ownsBeforeRemove = false;
    this._cleanupConfigured = false;
    this.panelLayout.bindPlayer?.(null, { syncCameraPosition: false, log: false });
    this.context.player.entity = null;
    this.context.player.inherited = false;
  }
}

export default ScenePlayerLifecycle;