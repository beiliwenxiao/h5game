/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { IntentType } from '../input/GamepadCombatController.js';

const DIAGONAL_UNIT = Math.SQRT1_2;
const DIRECTION_VECTORS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
  'up-left': Object.freeze({ x: -DIAGONAL_UNIT, y: -DIAGONAL_UNIT }),
  'up-right': Object.freeze({ x: DIAGONAL_UNIT, y: -DIAGONAL_UNIT }),
  'down-left': Object.freeze({ x: -DIAGONAL_UNIT, y: DIAGONAL_UNIT }),
  'down-right': Object.freeze({ x: DIAGONAL_UNIT, y: DIAGONAL_UNIT })
});

function directionToVector(direction) {
  return DIRECTION_VECTORS[direction] || DIRECTION_VECTORS.right;
}

/**
 * SceneCombatActions - 场景层战斗交互动作（框架级）
 *
 * 将输入装置产生的动作转换成现有 CombatSystem、MeleeAttackSystem、
 * FlightSystem、WeaponRenderer 与 PickupSystem 的调用。它不拥有任何
 * 游戏状态；构造时注入场景，仅统一跨输入方式共享的操作语义。
 */
export class SceneCombatActions {
  /** @param {Object} scene - 提供系统、实体和 UI 服务的游戏场景 */
  constructor(scene) {
    this.scene = scene;
  }

  attackByFacing() {
    const scene = this.scene;
    if (!scene.playerEntity || !scene.meleeAttackSystem || !scene.combatSystem?.isInCombat?.()) return;
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const spriteHeight = scene.playerEntity.getComponent('sprite')?.height || 64;
    const direction = scene.getPlayerFacingVector();
    const melee = scene.meleeAttackSystem;
    melee.setPlayerEntity(scene.playerEntity);
    melee.setEntities(scene.entities);
    melee.sectorDirection = Math.atan2(direction.y, direction.x);
    melee.sectorIsRanged = melee.checkIsRangedWeapon();
    melee.performSectorAttack(
      { x: transform.position.x, y: transform.position.y - spriteHeight / 2 },
      performance.now() / 1000
    );
  }

  attackByDirection(dirX, dirY, distRatio) {
    const scene = this.scene;
    if (!scene.playerEntity || !scene.meleeAttackSystem || !scene.combatSystem?.isInCombat?.()) return;
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const melee = scene.meleeAttackSystem;
    const spriteHeight = scene.playerEntity.getComponent('sprite')?.height || 64;
    const magnitude = Math.hypot(dirX, dirY);
    melee.setPlayerEntity(scene.playerEntity);
    melee.setEntities(scene.entities);
    melee.sectorDirection = magnitude > 0 ? Math.atan2(dirY, dirX) : 0;
    melee.sectorDirectionLocked = true;
    melee.sectorIsRanged = melee.checkIsRangedWeapon();

    let weaponDistance = melee.sliceAttackRange;
    const mainhand = scene.playerEntity.getComponent('equipment')?.getEquipment('mainhand');
    if (mainhand?.attackDistance != null) weaponDistance = mainhand.attackDistance;
    const ratio = distRatio !== undefined && distRatio > 0 ? Math.min(distRatio, 1) : 1;
    melee.performSectorAttack(
      { x: transform.position.x, y: transform.position.y - spriteHeight / 2 },
      performance.now() / 1000,
      Math.round(weaponDistance * ratio)
    );
  }

  jumpByInput() {
    const scene = this.scene;
    const axis = scene.inputManager?.getMoveAxis?.() || { x: 0, y: 0, magnitude: 0 };
    return this.jumpByDirection(axis.x || 0, axis.y || 0);
  }

  jumpByDirection(dirX = 0, dirY = 0) {
    const scene = this.scene;
    if (scene.dialogueSystem?.isDialogueActive?.() || scene.itemGainedPopup?.visible ||
        scene.backpackPanel?.visible || scene.isTransitioning) return false;
    if (!scene.jumpSystem || !scene.playerEntity || scene.playerEntity.isDead || scene.playerEntity.pinnedByWeapon) return false;
    if (scene.meditationSystem?.isActive?.() || scene.jumpSystem.isJumping(scene.playerEntity)) return false;
    if (scene.flightSystem?.isPlayerFlying?.()) return false;
    return scene.jumpSystem.startJump(scene.playerEntity, { x: dirX, y: dirY });
  }

  flightByFacing() {
    const scene = this.scene;
    if (!scene.flightSystem || !scene.playerEntity || scene.flightSystem.isPlayerFlying?.()) return;
    if (scene.jumpSystem?.isJumping?.(scene.playerEntity)) return;
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const direction = scene.getPlayerFacingVector();
    const distance = scene.flightSystem.config?.maxDistance || 400;
    scene.flightSystem.startFlight(
      scene.playerEntity,
      transform.position.x + direction.x * distance,
      transform.position.y + direction.y * distance
    );
  }

  flightByDirection(dirX, dirY, distRatio) {
    const scene = this.scene;
    if (!scene.flightSystem || !scene.playerEntity || scene.flightSystem.isPlayerFlying?.()) return;
    if (scene.jumpSystem?.isJumping?.(scene.playerEntity)) return;
    const transform = scene.playerEntity.getComponent('transform');
    const magnitude = Math.hypot(dirX, dirY);
    if (!transform) return;
    if (magnitude < 1) return this.flightByFacing();
    const distance = (scene.flightSystem.config?.maxDistance || 400) * Math.min(distRatio, 1);
    scene.flightSystem.startFlight(
      scene.playerEntity,
      transform.position.x + (dirX / magnitude) * distance,
      transform.position.y + (dirY / magnitude) * distance
    );
  }

  throwByFacing() {
    const scene = this.scene;
    if (!scene.weaponRenderer || !scene.playerEntity || scene.weaponRenderer.isWeaponThrown?.()) return;
    const equipment = scene.playerEntity.getComponent('equipment');
    const transform = scene.playerEntity.getComponent('transform');
    if (!equipment?.slots?.mainhand) return this._showNoWeapon(transform);
    if (!transform) return;
    const direction = scene.getPlayerFacingVector();
    const range = scene.weaponRenderer.getThrowRange?.(scene.playerEntity) || 480;
    scene.weaponRenderer.throwWeapon(
      scene.playerEntity, null, transform.position,
      { x: transform.position.x + direction.x * range, y: transform.position.y + direction.y * range },
      performance.now() / 1000
    );
  }

  throwByDirection(dirX, dirY, distRatio) {
    const scene = this.scene;
    if (!scene.weaponRenderer || !scene.playerEntity || scene.weaponRenderer.isWeaponThrown?.()) return;
    const equipment = scene.playerEntity.getComponent('equipment');
    const transform = scene.playerEntity.getComponent('transform');
    if (!equipment?.slots?.mainhand) return this._showNoWeapon(transform);
    if (!transform) return;
    const magnitude = Math.hypot(dirX, dirY);
    if (magnitude < 1) return this.throwByFacing();
    const range = (scene.weaponRenderer.getThrowRange?.(scene.playerEntity) || 480) * Math.min(distRatio, 1);
    scene.weaponRenderer.throwWeapon(
      scene.playerEntity, null, transform.position,
      { x: transform.position.x + (dirX / magnitude) * range, y: transform.position.y + (dirY / magnitude) * range },
      performance.now() / 1000
    );
  }

  activateBlock() {
    const scene = this.scene;
    return !!(scene.combatSystem && scene.playerEntity && scene.combatSystem.activateBlock());
  }

  usePotionFromHotbar(potionType) {
    const scene = this.scene;
    if (!scene.playerEntity) return;
    const inventory = scene.playerEntity.getComponent('inventory');
    const stats = scene.playerEntity.getComponent('stats');
    if (!inventory || !stats) return;
    const effectType = potionType === 'health' ? 'heal' : 'restore_mana';
    const entry = inventory.getAllItems().find(({ slot }) => (
      slot.item?.type === 'consumable' && slot.item.usable && slot.item.effect?.type === effectType
    ));
    if (entry) {
      scene.backpackPanel?.useItem(entry.index);
      return;
    }
    const transform = scene.playerEntity.getComponent('transform');
    if (transform && scene.floatingTextManager) {
      const potionName = potionType === 'health' ? '生命药水' : '魔法药水';
      scene.floatingTextManager.addText(
        transform.position.x, transform.position.y - 50, `没有${potionName}`, '#ff6666'
      );
    }
  }

  handleWeaponThrow() {
    const scene = this.scene;
    if (!scene.weaponRenderer || !scene.playerEntity || scene.weaponRenderer.isWeaponThrown?.()) return;
    if (!scene.playerEntity.getComponent('equipment')?.slots?.mainhand) return;
    const mouseWorld = scene.inputManager.getMouseWorldPosition(scene.camera);
    const enemy = scene.combatSystem.findEnemyAtPosition(mouseWorld, scene.entities);
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const targetTransform = enemy?.getComponent('transform');
    const success = scene.weaponRenderer.throwWeapon(
      scene.playerEntity, enemy, transform.position, targetTransform?.position || mouseWorld, performance.now() / 1000
    );
    if (success) {
      console.log('BaseGameScene: 武器投掷成功', enemy ? '目标敌人' : '自由投掷');
      scene.inputManager.markMouseClickHandled();
    }
  }

  _showNoWeapon(transform) {
    const scene = this.scene;
    if (transform && scene.floatingTextManager) {
      scene.floatingTextManager.addText(
        transform.position.x, transform.position.y - 50, '没有可投掷的武器', '#ff6666'
      );
    }
  }

  /** 生成手柄轮盘的可选动作：普通技能外加轻功与投掷。 */
  getGamepadSkillOptions(combat) {
    const combatSkills = Array.isArray(combat?.skills) ? combat.skills : [];
    const scene = this.scene;
    return [
      ...combatSkills.map((skill, combatSkillIndex) => ({
        ...skill,
        gamepadType: 'combatSkill',
        combatSkillIndex
      })),
      {
        id: '__gamepad_flight',
        name: '轻功',
        icon: '💨',
        effectType: 'flight',
        gamepadType: 'flight',
        range: scene.flightSystem?.config?.maxDistance || 400
      },
      {
        id: '__gamepad_throw',
        name: '投掷',
        icon: '🎯',
        effectType: 'throw',
        gamepadType: 'throw',
        range: scene.weaponRenderer?.getThrowRange?.(scene.playerEntity) || 480
      }
    ];
  }

  updateGamepadCombat() {
    const scene = this.scene;
    if (!scene.gamepadCombat || !scene.inputManager?.gamepad?.isConnected()) {
      // 手柄断开时必须同时清除控制器状态与独立暂停，避免重连后世界永久冻结。
      if (scene.gamepadCombat) scene.gamepadCombat.cancelSkillWheel();
      scene.isSkillWheelWorldPaused = false;
      scene.skillWheelOverlay?.close?.();
      return;
    }

    const controller = scene.gamepadCombat;
    const gamepad = scene.inputManager.gamepad;
    const combat = scene.playerEntity?.getComponent('combat');
    const gamepadSkills = this.getGamepadSkillOptions(combat);
    controller.skillCount = Math.max(1, gamepadSkills.length);
    if (controller.currentSkillIndex >= controller.skillCount) controller.currentSkillIndex = 0;
    controller.update(gamepad);

    // 此状态不能使用 scene.isPaused：后者会在帧首阻断 poll，导致 LB 松开沿永远无法被读取。
    scene.isSkillWheelWorldPaused = controller.isWheelOpen;
    this._syncSkillWheel(controller, gamepadSkills);
    if (scene.isSkillWheelWorldPaused) {
      // 轮盘停住世界期间仍消费当前帧意图，禁止把攻击/技能/格挡延后到恢复帧执行。
      controller.consumeIntents();
      return;
    }

    this._syncGamepadAimPreview(controller, gamepadSkills);
    const attack = controller.getIntent(IntentType.ATTACK);
    if (attack && scene.playerEntity && scene.combatSystem) this._performGamepadAttack(attack);

    const skillIntent = controller.getIntent(IntentType.SKILL_RELEASE);
    if (skillIntent) this._releaseGamepadSkill(gamepadSkills[skillIntent.skillIndex], skillIntent);

    if (controller.hasIntent(IntentType.BLOCK_START)) scene.activateBlock?.();
    if (controller.hasIntent(IntentType.BLOCK_END)) scene.deactivateBlock?.();
    controller.consumeIntents();
  }

  _releaseGamepadSkill(option, intent) {
    const scene = this.scene;
    if (!option || !scene.playerEntity) return;
    const hasAimDirection = Math.hypot(intent.direction?.x || 0, intent.direction?.y || 0) > 0.2;
    const direction = hasAimDirection
      ? intent.direction
      : (scene.getPlayerFacingVector?.() || directionToVector(scene.playerEntity.getComponent('sprite')?.direction));
    const magnitude = hasAimDirection ? Math.min(intent.magnitude || 1, 1) : 1;

    if (option.gamepadType === 'flight') {
      this._performGamepadFlight({ direction, magnitude });
      return;
    }
    if (option.gamepadType === 'throw') {
      this._performGamepadThrow({ direction, magnitude });
      return;
    }
    scene._ensureSkillActions?.().useSkillByDirection(
      option.combatSkillIndex, direction.x, direction.y, magnitude
    );
  }

  handleAutoAttack(currentTime) {
    const scene = this.scene;
    const weapon = scene.weaponRenderer;
    if (!scene.combatSystem || !scene.playerEntity || !weapon || weapon.isWeaponThrown?.()) return;
    if (weapon.disabled?.active) {
      if (performance.now() < weapon.disabled.endTime) return;
      weapon.disabled.active = false;
    }
    const attackTypeName = weapon.getAttackTypeName();
    const speedKmh = weapon.mouseMovement.speedKmh;
    if (speedKmh < 3) return this._clearMouseAttackState(currentTime);

    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const enemies = weapon.getEnemiesInRange(transform.position, scene.entities, weapon.getAttackRange(scene.playerEntity));
    if (enemies.length === 0) return this._clearMouseAttackState(currentTime);

    const weaponReady = weapon.weaponCooldown.isReady;
    weapon.recordAttack(currentTime);
    const multiplier = weapon.getSwipeDamageMultiplier(weaponReady);
    const angle = weapon.currentMouseAngle;
    const knockback = { x: Math.cos(angle), y: Math.sin(angle) };
    const stats = scene.playerEntity.getComponent('stats');
    if (!stats) return;

    for (const enemy of enemies) {
      const damage = weaponReady
        ? Math.floor((stats.attack || 15) * multiplier)
        : Math.floor(multiplier);
      const damageType = weaponReady
        ? `${attackTypeName}${Math.floor(multiplier * 100)}%`
        : `${attackTypeName}[冷却]`;
      scene.combatSystem.applyDamage(enemy, damage, knockback, damageType);
      const enemyTransform = enemy.getComponent('transform');
      if (scene.skillEffects && enemyTransform) {
        scene.skillEffects.createSkillEffect('basic_attack', transform.position, enemyTransform.position);
      }
    }

    if (scene.floatingTextManager) {
      const text = weaponReady
        ? `${attackTypeName} ${speedKmh.toFixed(1)}km/h ${Math.floor(multiplier * 100)}% 命中${enemies.length}个`
        : `${attackTypeName} [冷却] 命中${enemies.length}个敌人`;
      scene.floatingTextManager.addText(
        transform.position.x, transform.position.y - 80, text,
        weaponReady ? (attackTypeName === '刺击' ? '#ff9900' : '#00ffff') : '#888888'
      );
    }
  }

  _syncGamepadAimPreview(controller, gamepadSkills) {
    const scene = this.scene;
    if (controller._skillHolding) {
      const selected = gamepadSkills[controller.currentSkillIndex];
      const magnitude = controller.aimMagnitude;
      const direction = magnitude > 0 ? controller.aimDirection : { x: 0, y: 0.01 };
      if (selected?.gamepadType === 'flight') {
        scene.setSkillAimPreview(-3, direction.x, direction.y, magnitude || 0.5);
      } else if (selected?.gamepadType === 'throw') {
        scene.setSkillAimPreview(-2, direction.x, direction.y, magnitude || 0.5);
      } else if (selected?.range > 0) {
        scene.setSkillAimPreview(
          selected.combatSkillIndex,
          direction.x,
          direction.y,
          magnitude
        );
      }
      return;
    }
    if (scene.skillAimPreview && !scene._skillActions?.isAiming) scene.clearSkillAimPreview?.();
  }

  _performGamepadAttack(intent) {
    const scene = this.scene;
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const direction = intent.isQuickTap || !intent.direction
      ? directionToVector(scene.playerEntity.getComponent('sprite')?.direction)
      : intent.direction;
    const distance = intent.isQuickTap || !intent.direction ? 100 : 150;
    scene.inputManager.mouse.worldX = transform.position.x + direction.x * distance;
    scene.inputManager.mouse.worldY = transform.position.y + direction.y * distance;
    scene.inputManager.mouse.clicked = true;
    scene.inputManager.mouse.button = 0;
    scene.inputManager._padMouseButtons.add(0);
  }

  _syncSkillWheel(controller, gamepadSkills) {
    const scene = this.scene;
    const wheel = scene.skillWheelOverlay;
    if (!wheel) return;
    if (controller.hasIntent(IntentType.SKILL_WHEEL_OPEN)) {
      wheel.setSkills(gamepadSkills);
      wheel.open(controller.currentSkillIndex);
    }
    if (controller.hasIntent(IntentType.SKILL_WHEEL_CLOSE)) wheel.close();
    if (controller.isWheelOpen) wheel.setSelectedIndex(controller.wheelSelectedIndex);
  }

  _performGamepadFlight(intent) {
    const scene = this.scene;
    if (!intent?.direction || intent.magnitude <= 0) {
      scene.flightByFacing?.();
      return;
    }
    scene.flightByDirection?.(intent.direction.x, intent.direction.y, intent.magnitude);
  }

  _performGamepadThrow(intent) {
    const scene = this.scene;
    if (!intent?.direction || intent.magnitude <= 0) {
      scene.throwByFacing?.();
      return;
    }
    scene.throwByDirection?.(intent.direction.x, intent.direction.y, intent.magnitude);
  }

  _clearMouseAttackState(currentTime) {
    const movement = this.scene.weaponRenderer.mouseMovement;
    movement.movements = [];
    movement.thrustMovements = 0;
    movement.sweepMovements = 0;
    movement.totalDistance = 0;
    movement.movementsPerSecond = 0;
    movement.lastAttackTime = currentTime;
  }
}

export default SceneCombatActions;
