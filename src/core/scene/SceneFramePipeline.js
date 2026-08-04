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
  /** @param {Object} scene */
  constructor(scene) {
    this.scene = scene;
    this._onThrownWeaponHit = (enemy, isFinalTarget) => this._handleThrownWeaponHit(enemy, isFinalTarget);
  }

  /**
   * 执行一个场景更新帧。
   * @param {number} deltaTime
   */
  run(deltaTime) {
    const scene = this.scene;
    const services = scene.context?.services || {};
    if (!scene.isActive || scene.isPaused) return;

    // 运行时输入前阶段：仅调度显式阶段钩子，不采集/清空输入。
    scene._runRuntimePhase?.('beforeInput', deltaTime);

    // 手柄轮询：demo 用自建主循环（不走 GameEngine），故在场景 update 帧首轮询。
    // 有帧守卫保护，重复调用（子类已 poll / GameEngine 已 poll）会被跳过。
    if (scene.inputManager && scene.inputManager.pollGamepads) scene.inputManager.pollGamepads();
    // 获得物品弹窗优先消费 A 键，防止同帧继续按攻击处理。
    scene._handleGainedPopupGamepad();

    // 手柄战斗控制器：产出本帧意图（攻击/技能/轮盘/轻功/投掷/格挡）
    scene._updateGamepadCombat();

    // 通用：按 N 切幕检测（必须在 inputManager.update 之前，否则按键被清除）
    scene._updatePromptSwitch();

    // 运行时优先输入阶段位于手柄弹窗、战斗意图和切幕检测之后，
    // 因而不会抢占旧行为；后续注册路由时可在此处精确接管。
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
        return;
      }
    }

    // 更新性能优化器
    scene.performanceOptimizer.update();

    // 更新空间分区网格
    scene.performanceOptimizer.updateSpatialGrid(scene.entities);

    // 更新相机
    scene.camera.update(deltaTime);

    // 相机后处理钩子（子类可覆盖，如限制相机在盆地范围内）
    scene.postCameraUpdate();

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
        if (!scene.isMobileLayout) {
          if (scene.inputManager.isKeyPressed('ctrl')) {
            scene.enterPCAimMode('flight');
          } else if (scene.inputManager.isKeyPressed('shift')) {
            scene.enterPCAimMode('throw');
          }
        }

        // PC 瞄准模式：技能3/4/5、轻功、投掷按下后进入瞄准，左键确认/取消
        // （须在拾取/攻击判定之前，命中时消费本次点击，避免误触发攻击/拾取）
        if (services.skills) services.skills.updatePCAimMode();
        else scene.updatePCAimMode();

        // PC 左键点击地上物品：优先拾取（须在攻击判定之前，避免误触发攻击）
        if (services.worldInteraction) services.worldInteraction.handlePickupClick();
        else scene.handlePickupClick();

        // 水果忍者式滑动攻击检测（通过 MeleeAttackSystem）
        scene.meleeAttackSystem.setPlayerEntity(scene.playerEntity);
        scene.meleeAttackSystem.setEntities(scene.entities);
        scene.meleeAttackSystem.update(mouseWorldPos, playerCenter, currentTime);
      }
    }

    // 更新所有实体
    // 运行时系统阶段：迁移期默认只执行阶段钩子，旧 ECS 更新顺序保持在下方。
    scene._runRuntimePhase?.('systems', deltaTime);
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

    // 更新 PC 轻功/投掷按钮的冷却显示
    if (scene.flightButton && scene.flightSystem && scene.flightSystem.getCooldownRemaining) {
      scene.flightButton.setCooldown(scene.flightSystem.getCooldownRemaining(), scene.flightSystem.getCooldownTotal());
    }
    if (scene.throwButton && scene.weaponRenderer && scene.weaponRenderer.getThrowCooldownRemaining) {
      scene.throwButton.setCooldown(scene.weaponRenderer.getThrowCooldownRemaining(), scene.weaponRenderer.getThrowCooldownTotal());
    }
    if (scene.blockButton && scene.combatSystem && scene.combatSystem.getBlockCooldownRemaining) {
      scene.blockButton.setCooldown(scene.combatSystem.getBlockCooldownRemaining(), scene.combatSystem.getBlockCooldownTotal());
    }

    // 更新轻功飞行系统
    if (scene.flightSystem && scene.playerEntity) {
      const transform = scene.playerEntity.getComponent('transform');
      if (transform) {
        scene.flightSystem.update(deltaTime, transform);
      }
    }

    // 更新移动系统（打坐时禁止玩家移动）
    if (scene.meditationSystem.isActive() && scene.playerEntity) {
      // 打坐期间复用非玩家实体列表；实体数组或玩家变化时才重建，避免每帧 filter 分配。
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

    // 检查空格键继续对话
    if (services.dialogue) services.dialogue.checkContinue();
    else scene.checkDialogueContinue();

    // 更新面板（使用节流）
    if (scene.performanceOptimizer.shouldUpdate('ui')) {
      if (scene.backpackPanel) scene.backpackPanel.update(deltaTime);
      scene.bottomControlBar.update(deltaTime);
      if (scene.playerStatusHUD) {
        scene.playerStatusHUD.update(deltaTime);
      }
    }

    // 更新对话框 - 根据对话系统状态显示/隐藏
    if (scene.dialogueBox && scene.dialogueSystem) {
      const isDialogueActive = scene.dialogueSystem.isDialogueActive();
      if (isDialogueActive && !scene.dialogueBox.visible) {
        scene.dialogueBox.show();
      } else if (!isDialogueActive && scene.dialogueBox.visible) {
        scene.dialogueBox.hide();
      }
      scene.dialogueBox.update(deltaTime);
    }

    // 更新鼠标悬停状态
    scene.updatePanelHover();

    // 检查拾取（使用拾取系统）
    const pickupResult = scene.pickupSystem.update(
      scene.playerEntity, scene.pickupItems, scene.equipmentItems, scene.entities
    );
    // 移除已拾取的掉落物实体——批量移除避免反复 filter 整个数组
    if (pickupResult.removedEntities.length > 0) {
      if (scene.entityStore) {
        scene.entityStore.removeMany(pickupResult.removedEntities);
      } else {
        const removedSet = new Set(pickupResult.removedEntities);
        for (let index = scene.entities.length - 1; index >= 0; index--) {
          if (removedSet.has(scene.entities[index])) scene.entities.splice(index, 1);
        }
      }
    }

    // 移除死亡实体
    scene.removeDeadEntities();

    // 更新小地图数据（玩家位置、敌人位置、相机视野）
    if (scene.minimap) {
      // terrain 的延迟绑定与缩略图缓存失效由场景注入的 binding 管理。
      if (scene._terrainBinding) scene._terrainBinding.updateMinimap(scene.minimap);
      // 延迟绑定 worldRegion（异步加载完成后注入）
      if (!scene.minimap._worldRegion && scene._worldRegion) {
        scene.minimap.setWorldRegion(scene._worldRegion);
      }
      // 玩家位置
      if (scene.playerEntity) {
        const pt = scene.playerEntity.getComponent('transform');
        if (pt) scene.minimap.setPlayerPosition(pt.position);
      }
      // 敌人位置：小地图视觉以约 10Hz 刷新，避免每帧扫描全部实体并分配数组。
      if (!scene._minimapEnemyPositions || scene.performanceOptimizer.shouldUpdate('minimap')) {
        const enemyPositions = [];
        for (const entity of scene.entities) {
          if (entity.type === 'enemy' && !entity.isDead && !entity.isDying) {
            const transform = entity.getComponent('transform');
            if (transform) enemyPositions.push(transform.position);
          }
        }
        scene._minimapEnemyPositions = enemyPositions;
      }
      scene.minimap.setEnemyPositions(scene._minimapEnemyPositions);
      // 相机视野
      if (scene.camera) {
        scene.minimap.setViewBounds(scene.camera.getViewBounds());
      }
      // 节流更新缩略图缓存
      scene.minimap.update(deltaTime);
    }

    // 输入清帧必须保持在原有的正常帧末尾；转场提前返回路径不清帧。
    scene._runRuntimePhase?.('afterScene', deltaTime);
    if (scene.sceneRuntime) scene.sceneRuntime.flushInput();
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
