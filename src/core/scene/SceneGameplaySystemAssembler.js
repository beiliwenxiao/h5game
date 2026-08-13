/**
 * SceneGameplaySystemAssembler - 通用游戏场景系统装配器。
 *
 * 只负责创建、接线和释放框架系统；场景内容通过宿主回调注入。
 * 为兼容现有帧管线，系统实例仍投影到 scene 同名字段。
 */
import { CombatSystem } from '../../systems/CombatSystem.js';
import { MovementSystem } from '../../systems/MovementSystem.js';
import { EquipmentSystem } from '../../systems/EquipmentSystem.js';
import { AISystem } from '../../systems/AISystem.js';
import { CollisionSystem } from '../../systems/CollisionSystem.js';
import { PickupSystem } from '../../systems/PickupSystem.js';
import { InventoryTransactionService } from '../../systems/InventoryTransactionService.js';
import { GatheringSystem } from '../../systems/GatheringSystem.js';
import { GatheringPuppetSystem } from '../../systems/GatheringPuppetSystem.js';
import { AbilitySystem } from '../../systems/ability/AbilitySystem.js';
import { PlayerDefeatService } from '../../systems/PlayerDefeatService.js';
import { MeditationSystem } from '../../systems/MeditationSystem.js';
import { MeleeAttackSystem } from '../../systems/MeleeAttackSystem.js';
import { ZoneEffectSystem } from '../../systems/ZoneEffectSystem.js';
import { FlightSystem } from '../../systems/FlightSystem.js';
import { JumpSystem } from '../../systems/JumpSystem.js';
import { LocomotionSystem } from '../../systems/LocomotionSystem.js';
import { CombatEffects } from '../../rendering/CombatEffects.js';
import { SkillEffects } from '../../rendering/SkillEffects.js';
import { WeaponRenderer } from '../../rendering/WeaponRenderer.js';
import { EnemyWeaponRenderer } from '../../rendering/EnemyWeaponRenderer.js';

export class SceneGameplaySystemAssembler {
  constructor(scene) {
    this.scene = scene;
    this.initialized = false;
  }

  initialize({ zoneCallbacks = {} } = {}) {
    if (this.initialized) this.dispose();
    const scene = this.scene;

    scene.combatEffects = new CombatEffects(scene.particleSystem);
    scene.skillEffects = new SkillEffects(scene.particleSystem);
    scene.weaponRenderer = new WeaponRenderer();
    scene.enemyWeaponRenderer = new EnemyWeaponRenderer();
    scene.flightSystem = new FlightSystem({
      particleSystem: scene.particleSystem,
      floatingTextManager: scene.floatingTextManager,
      camera: scene.camera
    });
    scene.jumpSystem = new JumpSystem();
    scene.locomotionSystem = new LocomotionSystem({
      jumpSystem: scene.jumpSystem,
      flightSystem: scene.flightSystem,
      resolveClimbTarget: request => scene.resolveClimbTarget?.(request) || null
    });

    scene.combatSystem = new CombatSystem({
      inputManager: scene.inputManager,
      camera: scene.camera,
      skillEffects: scene.skillEffects,
      weaponRenderer: scene.weaponRenderer,
      enemyWeaponRenderer: scene.enemyWeaponRenderer,
      floatingTextManager: scene.floatingTextManager
    });
    scene.combatSystem.onMeditationSkill = skill => scene.onSkillClicked(skill);
    scene.combatSystem.onSkillAimRequest = index => scene.enterPCAimMode('skill', index);
    scene.combatSystem.setOnEnterCombat(() => {
      if (scene.meditationSystem?.isActive()) scene.meditationSystem.stop();
    });
    scene.combatSystem.onPotionUse = potionType => scene.usePotionFromHotbar(potionType);
    scene.combatSystem.setLootDropCallback((position, lootItems) => {
      const lootEntities = scene.pickupSystem.spawnLootItems(position, lootItems);
      for (let i = 0; i < lootEntities.length; i++) {
        const entity = lootEntities[i];
        scene.entities.push(entity);
        scene.equipmentItems.push(entity);
      }
    });

    scene.movementSystem = new MovementSystem({
      inputManager: scene.inputManager,
      camera: scene.camera,
      jumpSystem: scene.jumpSystem,
      isMovementLocked: entity => scene.locomotionSystem?.isBusy?.(entity) === true
    });
    scene.equipmentSystem = new EquipmentSystem();
    scene.aiSystem = new AISystem();
    scene.collisionSystem = new CollisionSystem();

    scene.inventoryTransactions = scene.inventoryTransactions || new InventoryTransactionService();
    scene.pickupSystem = new PickupSystem({ inventoryTransactions: scene.inventoryTransactions });
    scene.pickupSystem.init({
      inputManager: scene.inputManager,
      floatingTextManager: scene.floatingTextManager,
      weaponRenderer: scene.weaponRenderer,
      inventoryTransactions: scene.inventoryTransactions
    });
    scene.pickupSystem.onPickup((item, player) => {
      scene.onItemGained(item, player);
      scene.onWorldItemPicked?.(item, player);
    });
    scene.gatheringSystem = new GatheringSystem({
      inventoryTransactions: scene.inventoryTransactions,
      itemResolver: (itemId, resourceType) => scene.gameLoader?.registries?.items?.get?.(itemId) || {
        id: itemId, name: itemId, type: 'material', subType: resourceType, maxStack: 99
      },
      settlementPolicy: context => scene.prepareGatheringSettlement?.(context) || null,
      onEvent: (event, data) => scene.onGatheringEvent?.(event, data)
    });
    scene.gatheringPuppetSystem = new GatheringPuppetSystem({
      gatheringSystem: scene.gatheringSystem,
      createPuppet: ({ id, position }) => {
        const puppet = scene.entityFactory?.createNPC?.({
          id,
          name: '采集傀儡',
          faction: 'ally',
          imageId: 's09.summon.gatheringPuppet',
          sprite: { width: 58, height: 72, isStatic: true },
          renderStyle: 'gathering_puppet',
          position,
          stats: { maxHp: 30, hp: 30, attack: 0, defense: 0, speed: 0 },
          interaction: { radius: 0 }
        });
        if (puppet) {
          puppet.type = 'summon';
          puppet.faction = 'ally';
          puppet.tags = ['summon', 'gatheringPuppet'];
          puppet.lootTable = [];
        }
        return puppet;
      },
      addEntity: entity => scene.entityStore?.add?.(entity),
      removeEntity: entity => scene.entityStore?.remove?.(entity),
      damageOwner: damage => {
        if (scene.playerEntity) scene.combatSystem?.applyDamage?.(scene.playerEntity, damage, null, '傀儡反噬');
      },
      onEvent: (event, data) => scene.onGatheringPuppetEvent?.(event, data)
    });
    scene.abilitySystem = null;
    scene.combatSystem.setPlayerInputLock?.(() => scene.isPlayerActionLocked?.() === true);
    scene.combatSystem.setOnDamageCallback?.(({ target, appliedDamage, isDead }) => {
      if (appliedDamage <= 0) return;
      if (scene.gatheringPuppetSystem?.handleDamage?.(target, { isDead })) return;
      if (target === scene.playerEntity && scene.gatheringSystem.isActiveFor(target)) {
        scene.gatheringSystem.interruptByDamage();
      }
    });
    scene.playerDefeatService = new PlayerDefeatService({
      inventoryTransactions: scene.inventoryTransactions,
      entityFactory: scene.entityFactory,
      entityStore: scene.entityStore,
      revivePlayer: player => scene.combatSystem.revivePlayer(player),
      respawnResolver: context => scene.resolvePlayerRespawnPosition?.(context) || null,
      getDeathDropPresentation: context => scene.getDeathDropPresentation?.(context) || {},
      onResolved: result => scene.onPlayerDefeatResolved?.(result)
    });
    scene.combatSystem.setOnPlayerDeathCallback?.(({ player }) => {
      const resolution = scene.resolvePlayerDefeatResolution?.({ player }) || { type: 'normalDeath' };
      return scene.playerDefeatService.resolve({ player, resolution });
    });

    scene.meditationSystem = new MeditationSystem();

    scene.meditationSystem.init({
      inputManager: scene.inputManager,
      floatingTextManager: scene.floatingTextManager,
      skillEffects: scene.skillEffects,
      combatSystem: scene.combatSystem
    });

    scene.zoneEffectSystem = new ZoneEffectSystem();
    scene.zoneEffectSystem.setCallbacks(zoneCallbacks);

    scene.meleeAttackSystem = new MeleeAttackSystem({
      disableAutoAttack: scene.isMobileLayout,
      hideSectorWhenIdle: scene.isMobileLayout
    });
    scene.meleeAttackSystem.init({
      inputManager: scene.inputManager,
      combatSystem: scene.combatSystem,
      floatingTextManager: scene.floatingTextManager,
      canAttack: () => scene.canPerformBasicAttack?.() ?? scene.combatSystem?.isInCombat?.() === true,
      onAttackPerformed: () => scene.onPlayerTutorialAction?.('attack')
    });

    this.initialized = true;
    return this;
  }

  /** GameLoader 就绪后注入共享技能注册表与效果解析器。 */
  configureAbilities({ skillRegistry = null, effectResolver = null } = {}) {
    const scene = this.scene;
    if (!skillRegistry) return false;
    scene.abilitySystem = new AbilitySystem({
      skillRegistry,
      effectResolver,
      executor: context => {
        const locomotionHandled = scene.locomotionSystem?.execute?.(context);
        if (locomotionHandled !== undefined && locomotionHandled !== null) return locomotionHandled;
        const handled = scene.executeAbility?.(context);
        if (handled !== undefined && handled !== null) return handled;
        return scene.combatSystem?.executeSkill?.(context) === true;
      },
      onEvent: (event, data) => scene.onAbilityEvent?.(event, data)
    });
    scene.gatheringPuppetSystem?.configure?.({ effectResolver, owner: scene.playerEntity });
    return true;
  }

  dispose() {
    const scene = this.scene;
    scene.gatheringPuppetSystem?.dispose?.();
    scene.abilitySystem = null;
    scene.locomotionSystem?.cleanup?.();
    scene.jumpSystem?.cleanup?.();
    scene.flightSystem?.cleanup?.();
    scene.meleeAttackSystem?.cleanup?.();
    scene.enemyWeaponRenderer?.cleanup?.();
    this.initialized = false;
  }
}

export default SceneGameplaySystemAssembler;