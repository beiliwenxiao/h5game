/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/**
 * SceneFramePipeline - 游戏场景帧更新编排（框架级）
 *
 * 完整保留 BaseGameScene.update 的既有执行顺序、输入消费时机及转场提前返回。
 * 同时在准确的旧调用位置调度 GameSceneRuntime 阶段；运行时未注册系统前
 * 不会改变原有系统链或输入清帧时机。
 */
export class SceneFramePipeline {
  /** @param {{scene:Object, context?:Object, hooks?:Object}|Object} config */
  constructor(config) {
    this.scene = config?.scene || config;
    this.context = config?.context || this.scene?.context || null;
    this.hooks = config?.hooks || {};
    this._onThrownWeaponHit = (enemy, isFinalTarget) => this._handleThrownWeaponHit(enemy, isFinalTarget);
  }

  /**
   * 执行一个场景更新帧。
   * @param {number} deltaTime
   */
  run(deltaTime) {
    const scene = this.scene;
    const context = this.context || scene.context || null;
    const services = context?.services || {};
    const systems = context?.systems || {};
    const presentation = context?.presentation || {};
    const entities = context?.entities?.all || [];
    const player = context?.player?.entity || null;
    const inputManager = context?.input?.manager || null;
    const camera = context?.camera?.instance || null;
    const abilitySystem = systems.ability;
    const combatSystem = systems.combat;
    const movementSystem = systems.movement;
    const equipmentSystem = systems.equipment;
    const aiSystem = systems.ai;
    const collisionSystem = systems.collision;
    const pickupSystem = systems.pickup;
    const gatheringSystem = systems.gathering;
    const gatheringPuppetSystem = systems.gatheringPuppet;
    const meditationSystem = systems.meditation;
    const zoneEffectSystem = systems.zoneEffect;
    const meleeAttackSystem = systems.meleeAttack;
    const flightSystem = systems.flight;
    const jumpSystem = systems.jump;
    const locomotionSystem = systems.locomotion;
    const combatEffects = presentation.combatEffects;
    const skillEffects = presentation.skillEffects;
    const weaponRenderer = presentation.weaponRenderer;
    const enemyWeaponRenderer = presentation.enemyWeaponRenderer;
    const particleSystem = presentation.particleSystem;
    const floatingTextManager = presentation.floatingTextManager;
    const effectZoneRenderer = presentation.effectZoneRenderer;
    const inputFlow = services.input;
    const hudUpdater = services.hud;
    if (!scene.isActive || scene.isPaused) return;

    // 运行时输入前阶段：仅调度显式阶段钩子，不采集/清空输入。
    scene._runRuntimePhase?.('beforeInput', deltaTime);

    // 顶层输入流程保证手柄帧首 poll、弹窗优先于战斗，并统一路由输入。
    // DataDriven 子场景若已在 super.update 前开始本帧，内部守卫会跳过重复编排。
    inputFlow?.beforeFrame(deltaTime);
    const playerActionLocked = scene.isPlayerActionLocked?.() === true;

    // 技能轮盘只冻结世界模拟，不能使用 isPaused，否则下一帧无法读取 LB 松开沿。
    if (scene.isSkillWheelWorldPaused) {
      if (inputFlow) inputFlow.flush();
      else if (scene.sceneRuntime) scene.sceneRuntime.flushInput();
      else inputManager?.update?.();
      return;
    }

    // jump/攀爬由 SceneInputFlow → InputActionRouter 的 SKILL 优先级统一消费。

    // 运行时优先输入阶段保留旧扩展 hook 的准确位置。
    scene._runRuntimePhase?.('priorityInput', deltaTime);

    // 性能监控：关闭时不读取高精度时钟。
    const monitorEnabled = scene.performanceMonitor?.enabled === true;
    const updateStartTime = monitorEnabled ? performance.now() : 0;

    // 调试：输出update调用
    if (scene._debugNextUpdate) {
      console.log('【更新】update方法被调用, deltaTime=', deltaTime);
      scene._debugNextUpdate = false;
    }

    // 更新场景过渡
    if (scene.isTransitioning) {
      scene.updateTransition(deltaTime);
      // 过渡期间不更新其他逻辑
      if (scene.transitionPhase === 'show_text' || scene.transitionPhase === 'switch_scene') {
        inputFlow?.releaseFrame?.();
        return;
      }
    }

    // 更新性能优化器
    scene.performanceOptimizer.update();

    // 更新空间分区网格
    scene.performanceOptimizer.updateSpatialGrid(entities);

    // 更新武器渲染器的鼠标角度（保留用于攻击范围计算）
    if (weaponRenderer && player && inputManager) {
      const mouseWorldPos = inputManager.getMouseWorldPosition(camera);
      const transform = player.getComponent('transform');
      if (transform) {
        const currentTime = performance.now() / 1000;
        const sprite = player.getComponent('sprite');
        const spriteHeight = sprite?.height || 64;
        const playerCenter = {
          x: transform.position.x,
          y: transform.position.y - spriteHeight / 2
        };
        weaponRenderer.updateMouseAngle(mouseWorldPos, playerCenter, currentTime);

        // PC：按下 Ctrl 进入轻功瞄准、Shift 进入投掷瞄准（随后左键确认）
        if (!playerActionLocked && !scene.isMobileLayout) {
          if (inputManager.isKeyPressed('ctrl')) {
            scene.enterPCAimMode('flight');
          } else if (inputManager.isKeyPressed('shift')) {
            scene.enterPCAimMode('throw');
          }
        }

        // PC 瞄准模式：采集中取消既有瞄准并禁止攻击，其余世界系统继续更新。
        if (playerActionLocked) {
          scene.cancelPCAimMode?.();
        } else {
          if (services.skills) services.skills.updatePCAimMode();
          else scene.updatePCAimMode();

          // 拾取已由 SceneInputFlow/InputActionRouter 在攻击优先级之前统一分发。
          meleeAttackSystem?.setPlayerEntity?.(player);
          meleeAttackSystem?.setEntities?.(entities);
          meleeAttackSystem?.update?.(mouseWorldPos, playerCenter, currentTime);
        }
      }
    }

    // 更新所有实体
    // 运行时系统阶段：迁移期默认只执行阶段钩子，旧 ECS 更新顺序保持在下方。
    scene._runRuntimePhase?.('systems', deltaTime);
    abilitySystem?.update?.(deltaTime, entities);
    gatheringSystem?.update?.(deltaTime);
    gatheringPuppetSystem?.update?.(deltaTime);
    for (const entity of entities) {
      entity.update(deltaTime);
    }

    // UI 点击处理
    if (services.worldInteraction) services.worldInteraction.handleUIClick();
    else scene.handleUIClick();

    // 右键点击调试：显示光圈 + 输出坐标日志
    if (inputManager.isMouseClicked() &&
        inputManager.getMouseButton() === 2 &&
        !inputManager.isMouseClickHandled()) {
      if (services.worldInteraction) services.worldInteraction.debugRightClick();
      else scene._debugRightClick();
    }

    // 旧的 Ctrl+左键瞬移已改为：按 Ctrl 进入轻功瞄准、左键确认（见 updatePCAimMode）
    // scene.handleTeleport();

    // HUD 冷却集中由 SceneHudUpdater 读取显式 UI/System 依赖。
    hudUpdater?.updateCooldowns();

    // 更新攀爬等统一位移执行器；Jump/Flight 保持各自既有更新顺序。
    locomotionSystem?.update?.(deltaTime);

    // 更新跳跃系统（先于普通移动；MovementSystem 会跳过正在跳跃的实体）
    if (jumpSystem && player) {
      jumpSystem.update(deltaTime);
    }

    // 更新轻功飞行系统
    if (flightSystem && player) {
      flightSystem.update(deltaTime, player);
    }

    // 更新移动系统：打坐或采集只锁玩家，AI/其他实体继续移动。
    if ((meditationSystem.isActive() || playerActionLocked) && player) {
      // 锁定期间复用非玩家实体列表；实体数组或玩家变化时才重建，避免每帧 filter 分配。
      if (scene._meditationEntitySource !== entities ||
          scene._meditationEntityCount !== entities.length ||
          scene._meditationPlayer !== player) {
        scene._meditationEntitySource = entities;
        scene._meditationEntityCount = entities.length;
        scene._meditationPlayer = player;
        scene._meditationMovableEntities = entities.filter(entity => entity !== player);
      }
      movementSystem.update(deltaTime, scene._meditationMovableEntities);

      // 移动中断检测由 meditationSystem.update 处理
    } else {
      // 正常更新所有实体
      movementSystem.update(deltaTime, entities);
    }

    // 检查实体之间的碰撞
    collisionSystem.update(entities);

    // 检查地形碰撞（编辑器场景有 terrain 时生效）
    scene.checkTerrainCollision();

    // 玩家与实体位置已完成本帧移动和碰撞修正后再更新相机，
    // 避免相机长期落后一帧并放大不均匀 deltaTime 造成的画面跳动。
    camera.update(deltaTime);

    // 相机后处理钩子（子类可覆盖，如限制相机在大地图边缘）
    scene.postCameraUpdate();

    // 处理敌人选中
    scene.handleEnemySelection();

    // 更新AI系统（使用节流）
    if (scene.performanceOptimizer.shouldUpdate('ai')) {
      aiSystem.update(deltaTime, entities, combatSystem);
    }

    // 更新战斗系统
    combatSystem.update(deltaTime, entities);

    // 更新战斗状态（通过 CombatSystem）
    combatSystem.updateCombatState(deltaTime, entities);

    // 更新打坐状态（通过冥想系统）
    meditationSystem.update(deltaTime, player);

    // 更新区域效果（Buff 多边形）
    if (zoneEffectSystem) {
      // 延迟收集 buffZone（terrain 异步加载完成后）
      if (!scene._buffZonesCollected) {
        scene._collectBuffZones();
      }
      zoneEffectSystem.update(deltaTime, entities);
    }

    // 更新装备系统
    equipmentSystem.update(deltaTime, entities);

    // 更新序章系统
    scene.tutorialSystem.update(deltaTime, scene.getGameState());
    scene.dialogueSystem.update(deltaTime);
    scene.questSystem.update(deltaTime);
    // 数据驱动触发器（timer 类）——仅当场景调用过 initGameLoader 才存在
    if (scene.gameLoader) scene.gameLoader.update(deltaTime);

    // 更新特效（使用节流）
    if (scene.performanceOptimizer.shouldUpdate('effects')) {
      combatEffects.update(deltaTime);
      skillEffects.update(deltaTime);
    }
    floatingTextManager.update(deltaTime);
    if (scene.notificationSystem) scene.notificationSystem.update(deltaTime);
    particleSystem.update(deltaTime);
    // 特效区域粒子生成
    if (effectZoneRenderer) effectZoneRenderer.update(deltaTime);

    // 更新武器渲染器
    if (weaponRenderer) {
      const currentTime = performance.now() / 1000; // 转换为秒
      weaponRenderer.update(deltaTime, currentTime);
    }

    // 更新敌人武器渲染器
    if (enemyWeaponRenderer) {
      enemyWeaponRenderer.update(deltaTime);

      // 检查武器飞行路径上的碰撞
      if (weaponRenderer?.thrownWeapon.flying) {
        weaponRenderer.checkThrowPathCollision(entities, this._onThrownWeaponHit);
      }

      // 检查武器拾取
      if (weaponRenderer?.isWeaponThrown() && !weaponRenderer.thrownWeapon.flying) {
        pickupSystem.checkWeaponPickup(player);
      }
    }

    // 对话输入在系统更新后消费，保持打字机和选项节点原有顺序。
    if (inputFlow) inputFlow.afterSystems();
    else if (services.dialogue) services.dialogue.checkContinue();
    else scene.checkDialogueContinue();

    // HUD 面板和对话框状态集中更新；小地图仍在实体清理后刷新。
    hudUpdater?.updatePanels(deltaTime);
    hudUpdater?.updateDialogue(deltaTime);

    // 普通拾取已由 SceneInputFlow 的 PICKUP 处理者完成；这里不再轮询 E，
    // 避免同一输入在路由和旧系统路径中重复结算。

    // 移除死亡实体
    scene.removeDeadEntities();

    // 更新小地图数据（玩家、敌人、相机和多 terrain 缓存）。
    hudUpdater?.updateMinimap(deltaTime);

    // 输入清帧必须保持在原有的正常帧末尾；转场提前返回路径只 releaseFrame。
    scene._runRuntimePhase?.('afterScene', deltaTime);
    if (inputFlow) inputFlow.flush();
    else if (scene.sceneRuntime) scene.sceneRuntime.flushInput();
    else inputManager.update();

    // 性能监控关闭时不做计时、可见实体裁剪、纹理遍历和对象池快照。
    if (monitorEnabled) {
      const updateTime = performance.now() - updateStartTime;
      scene.performanceMonitor.update(deltaTime, {
        entityCount: entities.length,
        visibleEntityCount: scene.isometricRenderer ? scene.isometricRenderer.cullEntities(entities).length : 0,
        particleCount: particleSystem.getActiveCount(),
        poolStats: scene.performanceOptimizer.getPoolStats(),
        updateTime,
        drawCallsPerFrame: scene._drawCallCount || 0,
        textureMemory: scene._estimateTextureMemory()
      });
    }
  }

  /** 稳定的投掷命中回调，避免飞行期间每帧创建闭包。 @private */
  _handleThrownWeaponHit(enemy, isFinalTarget) {
    const scene = this.scene;
    const context = this.context || scene.context || null;
    const player = context?.player?.entity || null;
    const combatSystem = context?.systems?.combat || null;
    const floatingTextManager = context?.presentation?.floatingTextManager || null;
    const stats = player?.getComponent('stats');
    const playerTransform = player?.getComponent('transform');
    const enemyTransform = enemy?.getComponent('transform');
    if (!stats || !playerTransform || !enemyTransform) return;

    const multiplier = isFinalTarget ? 3 : 0.3;
    const finalDamage = Math.floor((stats.attack || 15) * multiplier);
    const dx = enemyTransform.position.x - playerTransform.position.x;
    const dy = enemyTransform.position.y - playerTransform.position.y;
    const distance = Math.hypot(dx, dy);
    // CombatSystem 可能保留该对象用于本次结算，不能跨命中复用可变对象。
    const knockbackDirection = distance > 0
      ? { x: dx / distance, y: dy / distance }
      : { x: 1, y: 0 };

    combatSystem.applyDamage(enemy, finalDamage, knockbackDirection, '投掷武器', {
      sourceEntity: player,
      attackKind: 'throw'
    });
    floatingTextManager.addText(
      enemyTransform.position.x,
      enemyTransform.position.y - 60,
      isFinalTarget ? '投掷伤害 300%' : '投掷伤害 30%',
      isFinalTarget ? '#ff0000' : '#ffaa00'
    );
  }
}

export default SceneFramePipeline;
