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
    const services = this.context?.services || {};
    const inputFlow = services.input || scene._ensureInputFlow?.();
    const hudUpdater = services.hud || scene._ensureHudUpdater?.();
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
      else scene.inputManager?.update?.();
      return;
    }

    // 空格或可重绑手柄 jump 动作按下时起跳；对话/模态状态由统一动作出口拦截。
    if (!playerActionLocked && (
      scene.inputManager?.isKeyPressed?.('space') || scene.inputManager?.isKeyPressed?.('jump')
    )) {
      scene.jumpByInput?.();
    }

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
    scene.performanceOptimizer.updateSpatialGrid(scene.entities);

    // 更新武器渲染器的鼠标角度（保留用于攻击范围计算）
    if (scene.weaponRenderer && scene.playerEntity && scene.inputManager) {
      const mouseWorldPos = scene.inputManager.getMouseWorldPosition(scene.camera);
      const transform = scene.playerEntity.getComponent('transform');
      if (transform) {
        const currentTime = performance.now() / 1000;
        const sprite = scene.playerEntity.getComponent('sprite');
        const spriteHeight = sprite?.height || 64;
        const playerCenter = {
          x: transform.position.x,
          y: transform.position.y - spriteHeight / 2
        };
        scene.weaponRenderer.updateMouseAngle(mouseWorldPos, playerCenter, currentTime);

        // PC：按下 Ctrl 进入轻功瞄准、Shift 进入投掷瞄准（随后左键确认）
        if (!playerActionLocked && !scene.isMobileLayout) {
          if (scene.inputManager.isKeyPressed('ctrl')) {
            scene.enterPCAimMode('flight');
          } else if (scene.inputManager.isKeyPressed('shift')) {
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
          scene.meleeAttackSystem.setPlayerEntity(scene.playerEntity);
          scene.meleeAttackSystem.setEntities(scene.entities);
          scene.meleeAttackSystem.update(mouseWorldPos, playerCenter, currentTime);
        }
      }
    }

    // 更新所有实体
    // 运行时系统阶段：迁移期默认只执行阶段钩子，旧 ECS 更新顺序保持在下方。
    scene._runRuntimePhase?.('systems', deltaTime);
    scene.abilitySystem?.update?.(deltaTime, scene.entities);
    scene.gatheringSystem?.update?.(deltaTime);
    scene.gatheringPuppetSystem?.update?.(deltaTime);
    for (const entity of scene.entities) {
      entity.update(deltaTime);
    }

    // UI 点击处理
    if (services.worldInteraction) services.worldInteraction.handleUIClick();
    else scene.handleUIClick();

    // 右键点击调试：显示光圈 + 输出坐标日志
    if (scene.inputManager.isMouseClicked() &&
        scene.inputManager.getMouseButton() === 2 &&
        !scene.inputManager.isMouseClickHandled()) {
      if (services.worldInteraction) services.worldInteraction.debugRightClick();
      else scene._debugRightClick();
    }

    // 旧的 Ctrl+左键瞬移已改为：按 Ctrl 进入轻功瞄准、左键确认（见 updatePCAimMode）
    // scene.handleTeleport();

    // HUD 冷却集中由 SceneHudUpdater 读取显式 UI/System 依赖。
    hudUpdater?.updateCooldowns();

    // 更新跳跃系统（先于普通移动；MovementSystem 会跳过正在跳跃的实体）
    if (scene.jumpSystem && scene.playerEntity) {
      scene.jumpSystem.update(deltaTime);
    }

    // 更新轻功飞行系统
    if (scene.flightSystem && scene.playerEntity) {
      scene.flightSystem.update(deltaTime, scene.playerEntity);
    }

    // 更新移动系统：打坐或采集只锁玩家，AI/其他实体继续移动。
    if ((scene.meditationSystem.isActive() || playerActionLocked) && scene.playerEntity) {
      // 锁定期间复用非玩家实体列表；实体数组或玩家变化时才重建，避免每帧 filter 分配。
      if (scene._meditationEntitySource !== scene.entities ||
          scene._meditationEntityCount !== scene.entities.length ||
          scene._meditationPlayer !== scene.playerEntity) {
        scene._meditationEntitySource = scene.entities;
        scene._meditationEntityCount = scene.entities.length;
        scene._meditationPlayer = scene.playerEntity;
        scene._meditationMovableEntities = scene.entities.filter(entity => entity !== scene.playerEntity);
      }
      scene.movementSystem.update(deltaTime, scene._meditationMovableEntities);

      // 移动中断检测由 meditationSystem.update 处理
    } else {
      // 正常更新所有实体
      scene.movementSystem.update(deltaTime, scene.entities);
    }

    // 检查实体之间的碰撞
    scene.collisionSystem.update(scene.entities);

    // 检查地形碰撞（编辑器场景有 terrain 时生效）
    scene.checkTerrainCollision();

    // 玩家与实体位置已完成本帧移动和碰撞修正后再更新相机，
    // 避免相机长期落后一帧并放大不均匀 deltaTime 造成的画面跳动。
    scene.camera.update(deltaTime);

    // 相机后处理钩子（子类可覆盖，如限制相机在大地图边缘）
    scene.postCameraUpdate();

    // 处理敌人选中
    scene.handleEnemySelection();

    // 更新AI系统（使用节流）
    if (scene.performanceOptimizer.shouldUpdate('ai')) {
      scene.aiSystem.update(deltaTime, scene.entities, scene.combatSystem);
    }

    // 更新战斗系统
    scene.combatSystem.update(deltaTime, scene.entities);

    // 更新战斗状态（通过 CombatSystem）
    scene.combatSystem.updateCombatState(deltaTime, scene.entities);

    // 更新打坐状态（通过冥想系统）
    scene.meditationSystem.update(deltaTime, scene.playerEntity);

    // 更新区域效果（Buff 多边形）
    if (scene.zoneEffectSystem) {
      // 延迟收集 buffZone（terrain 异步加载完成后）
      if (!scene._buffZonesCollected) {
        scene._collectBuffZones();
      }
      scene.zoneEffectSystem.update(deltaTime, scene.entities);
    }

    // 更新装备系统
    scene.equipmentSystem.update(deltaTime, scene.entities);

    // 更新序章系统
    scene.tutorialSystem.update(deltaTime, scene.getGameState());
    scene.dialogueSystem.update(deltaTime);
    scene.questSystem.update(deltaTime);
    // 数据驱动触发器（timer 类）——仅当场景调用过 initGameLoader 才存在
    if (scene.gameLoader) scene.gameLoader.update(deltaTime);

    // 更新特效（使用节流）
    if (scene.performanceOptimizer.shouldUpdate('effects')) {
      scene.combatEffects.update(deltaTime);
      scene.skillEffects.update(deltaTime);
    }
    scene.floatingTextManager.update(deltaTime);
    if (scene.notificationSystem) scene.notificationSystem.update(deltaTime);
    scene.particleSystem.update(deltaTime);
    // 特效区域粒子生成
    if (scene.effectZoneRenderer) scene.effectZoneRenderer.update(deltaTime);

    // 更新武器渲染器
    if (scene.weaponRenderer) {
      const currentTime = performance.now() / 1000; // 转换为秒
      scene.weaponRenderer.update(deltaTime, currentTime);
    }

    // 更新敌人武器渲染器
    if (scene.enemyWeaponRenderer) {
      scene.enemyWeaponRenderer.update(deltaTime);

      // 检查武器飞行路径上的碰撞
      if (scene.weaponRenderer.thrownWeapon.flying) {
        scene.weaponRenderer.checkThrowPathCollision(scene.entities, this._onThrownWeaponHit);
      }

      // 检查武器拾取
      if (scene.weaponRenderer.isWeaponThrown() && !scene.weaponRenderer.thrownWeapon.flying) {
        scene.pickupSystem.checkWeaponPickup(scene.playerEntity);
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
    else scene.inputManager.update();

    // 性能监控关闭时不做计时、可见实体裁剪、纹理遍历和对象池快照。
    if (monitorEnabled) {
      const updateTime = performance.now() - updateStartTime;
      scene.performanceMonitor.update(deltaTime, {
        entityCount: scene.entities.length,
        visibleEntityCount: scene.isometricRenderer ? scene.isometricRenderer.cullEntities(scene.entities).length : 0,
        particleCount: scene.particleSystem.getActiveCount(),
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
    const stats = scene.playerEntity?.getComponent('stats');
    const playerTransform = scene.playerEntity?.getComponent('transform');
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

    scene.combatSystem.applyDamage(enemy, finalDamage, knockbackDirection);
    scene.floatingTextManager.addText(
      enemyTransform.position.x,
      enemyTransform.position.y - 60,
      isFinalTarget ? '投掷伤害 300%' : '投掷伤害 30%',
      isFinalTarget ? '#ff0000' : '#ffaa00'
    );
  }
}

export default SceneFramePipeline;
