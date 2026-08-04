/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { IntentType } from '../input/GamepadCombatController.js';

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

  checkSkillUsable(skill) {
    const scene = this.scene;
    if (!scene.playerEntity) return false;
    const stats = scene.playerEntity.getComponent('stats');
    const combat = scene.playerEntity.getComponent('combat');
    if (!stats || !combat) return false;

    const currentTime = performance.now();
    if (!combat.canUseSkill(skill.id, currentTime)) {
      const transform = scene.playerEntity.getComponent('transform');
      if (transform && scene.floatingTextManager) {
        scene.floatingTextManager.addText(
          transform.position.x, transform.position.y - 50, '技能冷却中', '#888888'
        );
      }
      return false;
    }

    if (skill.manaCost && stats.mp < skill.manaCost) {
      const transform = scene.playerEntity.getComponent('transform');
      if (transform && scene.floatingTextManager) {
        scene.floatingTextManager.addText(
          transform.position.x, transform.position.y - 50,
          `蓝量不足(需${skill.manaCost})`, '#6666ff'
        );
      }
      return false;
    }
    return true;
  }

  useSkillByIndex(index) {
    const scene = this.scene;
    if (!scene.playerEntity || !scene.combatSystem) return;
    const combat = scene.playerEntity.getComponent('combat');
    const skill = combat?.skills?.[index];
    if (!skill || !this.checkSkillUsable(skill)) return;

    if (skill.id === 'heal' || skill.id === 'meditation') {
      scene.onSkillClicked(skill);
      return;
    }
    if (!scene.isMobileLayout) {
      scene.enterPCAimMode('skill', index);
      return;
    }

    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const d = scene.getPlayerFacingVector();
    const range = skill.range || 300;
    scene.combatSystem.tryUseSkillAtPosition(
      scene.playerEntity,
      skill,
      { x: transform.position.x + d.x * range, y: transform.position.y + d.y * range },
      performance.now(),
      scene.entities
    );
  }

  useSkillByDirection(index, dirX, dirY, distRatio, targetWorldPos) {
    const scene = this.scene;
    if (!scene.playerEntity || !scene.combatSystem) return;
    const combat = scene.playerEntity.getComponent('combat');
    const skill = combat?.skills?.[index];
    if (!skill || !this.checkSkillUsable(skill)) return;

    if (skill.id === 'heal' || skill.id === 'meditation') {
      scene.onSkillClicked(skill);
      return;
    }
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;

    let target;
    if (targetWorldPos) {
      target = { x: targetWorldPos.x, y: targetWorldPos.y };
    } else {
      const magnitude = Math.hypot(dirX, dirY);
      const dx = magnitude > 0 ? dirX / magnitude : 1;
      const dy = magnitude > 0 ? dirY / magnitude : 0;
      const distance = Math.min(distRatio ?? 1, 1) * (skill.range || 300);
      target = { x: transform.position.x + dx * distance, y: transform.position.y + dy * distance };
    }
    scene.combatSystem.tryUseSkillAtPosition(
      scene.playerEntity, skill, target, performance.now(), scene.entities
    );
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

  flightByFacing() {
    const scene = this.scene;
    if (!scene.flightSystem || !scene.playerEntity || scene.flightSystem.isPlayerFlying?.()) return;
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const direction = scene.getPlayerFacingVector();
    const distance = scene.flightSystem.config?.maxDistance || 400;
    scene.flightSystem.startFlight(
      transform,
      transform.position.x + direction.x * distance,
      transform.position.y + direction.y * distance
    );
  }

  flightByDirection(dirX, dirY, distRatio) {
    const scene = this.scene;
    if (!scene.flightSystem || !scene.playerEntity || scene.flightSystem.isPlayerFlying?.()) return;
    const transform = scene.playerEntity.getComponent('transform');
    const magnitude = Math.hypot(dirX, dirY);
    if (!transform) return;
    if (magnitude < 1) return this.flightByFacing();
    const distance = (scene.flightSystem.config?.maxDistance || 400) * Math.min(distRatio, 1);
    scene.flightSystem.startFlight(
      transform,
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

  handlePickupClick() {
    const scene = this.scene;
    const input = scene.inputManager;
    if (!input || !input.isMouseClicked() || input.isMouseClickHandled() || input.getMouseButton() === 2) return;
    if (scene.dialogueSystem?.isDialogueActive() || scene.backpackPanel?.visible) return;
    const mouseScreen = input.getMousePosition();
    const mouseWorld = scene.camera
      ? scene.camera.screenToWorld(mouseScreen.x, mouseScreen.y)
      : input.getMouseWorldPosition();
    if (this.tryClickPickup(mouseWorld.x, mouseWorld.y)) input.markMouseClickHandled();
  }

  tryClickPickup(worldX, worldY) {
    const scene = this.scene;
    if (!scene.playerEntity || !scene.pickupSystem) return false;
    const isHit = (x, y) => Math.hypot(x - worldX, y - worldY) <= 30;
    let hit = scene.pickupItems.some(item => !item.picked && isHit(item.x, item.y));
    if (!hit) {
      hit = scene.equipmentItems.some(item => {
        if (item.picked) return false;
        const position = item.getComponent?.('transform')?.position;
        return isHit(position?.x ?? item.x, position?.y ?? item.y);
      });
    }
    if (!hit) return false;
    const result = scene.pickupSystem.triggerPickup(scene.playerEntity, scene.pickupItems, scene.equipmentItems);
    for (const removed of result.removedEntities) scene.entities = scene.entities.filter(entity => entity !== removed);
    return true;
  }

  _showNoWeapon(transform) {
    const scene = this.scene;
    if (transform && scene.floatingTextManager) {
      scene.floatingTextManager.addText(
        transform.position.x, transform.position.y - 50, '没有可投掷的武器', '#ff6666'
      );
    }
  }

  updateGamepadCombat() {
    const scene = this.scene;
    if (!scene.gamepadCombat || !scene.inputManager?.gamepad?.isConnected()) return;
    const controller = scene.gamepadCombat;
    const gamepad = scene.inputManager.gamepad;
    const combat = scene.playerEntity?.getComponent('combat');
    if (combat?.skills) controller.skillCount = combat.skills.length;
    controller.update(gamepad);
    this._syncGamepadAimPreview(controller, combat);

    const attack = controller.getIntent(IntentType.ATTACK);
    if (attack && scene.playerEntity && scene.combatSystem) this._performGamepadAttack(attack);

    const skillIntent = controller.getIntent(IntentType.SKILL_RELEASE);
    if (skillIntent && combat?.skills && scene.playerEntity && scene.combatSystem) {
      const skill = combat.skills[skillIntent.skillIndex];
      const transform = scene.playerEntity?.getComponent('transform');
      if (skill && transform) {
        const range = skill.range || 200;
        scene.combatSystem.tryUseSkillAtPosition(
          scene.playerEntity, skill,
          {
            x: transform.position.x + skillIntent.direction.x * range * skillIntent.magnitude,
            y: transform.position.y + skillIntent.direction.y * range * skillIntent.magnitude
          },
          performance.now(), scene.entities
        );
      }
    }

    this._syncSkillWheel(controller, combat);
    const flight = controller.getIntent(IntentType.FLIGHT);
    if (flight) this._performGamepadFlight(flight);
    const thrown = controller.getIntent(IntentType.THROW);
    if (thrown) this._performGamepadThrow(thrown);
    if (controller.hasIntent(IntentType.BLOCK_START)) scene.activateBlock?.();
    if (controller.hasIntent(IntentType.BLOCK_END)) scene.deactivateBlock?.();
    controller.consumeIntents();
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

  _syncGamepadAimPreview(controller, combat) {
    const scene = this.scene;
    if (controller._skillHolding && combat?.skills) {
      const skill = combat.skills[controller.currentSkillIndex];
      if (skill?.range > 0) {
        scene.setSkillAimPreview(
          controller.currentSkillIndex,
          controller.aimMagnitude > 0 ? controller.aimDirection.x : 0,
          controller.aimMagnitude > 0 ? controller.aimDirection.y : 0.01,
          controller.aimMagnitude
        );
      }
      return;
    }
    if (controller._flightHolding) {
      const direction = controller.flightMagnitude > 0 ? controller.flightDirection : { x: 0, y: 0.01 };
      scene.setSkillAimPreview(-3, direction.x, direction.y, controller.flightMagnitude || 0.5);
      return;
    }
    if (controller._throwHolding) {
      const direction = controller._throwMagnitude > 0 ? controller._throwDirection : { x: 0, y: 0.01 };
      scene.setSkillAimPreview(-2, direction.x, direction.y, controller._throwMagnitude || 0.5);
      return;
    }
    if (scene.skillAimPreview && !scene._aimController?.isAiming) scene.clearSkillAimPreview?.();
  }

  _performGamepadAttack(intent) {
    const scene = this.scene;
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;
    const direction = intent.isQuickTap || !intent.direction
      ? scene._directionToVector(scene.playerEntity.getComponent('sprite')?.direction)
      : intent.direction;
    const distance = intent.isQuickTap || !intent.direction ? 100 : 150;
    scene.inputManager.mouse.worldX = transform.position.x + direction.x * distance;
    scene.inputManager.mouse.worldY = transform.position.y + direction.y * distance;
    scene.inputManager.mouse.clicked = true;
    scene.inputManager.mouse.button = 0;
    scene.inputManager._padMouseButtons.add(0);
  }

  _syncSkillWheel(controller, combat) {
    const scene = this.scene;
    const wheel = scene.skillWheelOverlay;
    if (!wheel) return;
    if (controller.hasIntent(IntentType.SKILL_WHEEL_OPEN)) {
      if (combat?.skills) wheel.setSkills(combat.skills);
      wheel.open(controller.currentSkillIndex);
    }
    if (controller.hasIntent(IntentType.SKILL_WHEEL_CLOSE)) wheel.close();
    if (controller.isWheelOpen) wheel.setSelectedIndex(controller.wheelSelectedIndex);
  }

  _performGamepadFlight(intent) {
    const scene = this.scene;
    const transform = scene.playerEntity?.getComponent('transform');
    if (!transform || !scene.flightSystem) return;
    const direction = intent.direction || scene._directionToVector(scene.playerEntity.getComponent('sprite')?.direction);
    scene.flightSystem.startFlight(
      transform,
      transform.position.x + direction.x * 300 * intent.magnitude,
      transform.position.y + direction.y * 300 * intent.magnitude
    );
  }

  _performGamepadThrow(intent) {
    const scene = this.scene;
    const transform = scene.playerEntity?.getComponent('transform');
    if (!transform || !scene.weaponRenderer) return;
    if (!scene.playerEntity.getComponent('equipment')?.slots?.mainhand) {
      scene.notificationSystem?.addNotification('未装备武器，无法投掷', 'warning');
      return;
    }
    const direction = intent.direction || scene._directionToVector(scene.playerEntity.getComponent('sprite')?.direction);
    scene.weaponRenderer.throwWeapon(
      scene.playerEntity, null, transform.position,
      {
        x: transform.position.x + direction.x * 250 * intent.magnitude,
        y: transform.position.y + direction.y * 250 * intent.magnitude
      },
      performance.now()
    );
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
