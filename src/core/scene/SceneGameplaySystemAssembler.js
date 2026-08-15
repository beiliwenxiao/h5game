/**
 * SceneGameplaySystemAssembler - 通用游戏场景系统装配器。
 *
 * 只负责创建、接线和释放框架系统；场景内容通过宿主回调注入。
 * Context 是帧/渲染管线的正式读取边界；scene 同名字段只保留迁移期兼容投影。
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
import { ClassSystem } from '../../systems/ClassSystem.js';
import { ConstructionSystem } from '../../systems/ConstructionSystem.js';
import { VehicleSystem } from '../../systems/VehicleSystem.js';
import { VehicleLogisticsSystem } from '../../systems/VehicleLogisticsSystem.js';
import { MannedStructureAdapter } from '../../systems/MannedStructureAdapter.js';
import { ProficiencySystem } from '../../systems/progression/ProficiencySystem.js';
import { CombatEffects } from '../../rendering/CombatEffects.js';
import { SkillEffects } from '../../rendering/SkillEffects.js';
import { WeaponRenderer } from '../../rendering/WeaponRenderer.js';
import { EnemyWeaponRenderer } from '../../rendering/EnemyWeaponRenderer.js';

export class SceneGameplaySystemAssembler {
  constructor(scene) {
    this.scene = scene;
    this.initialized = false;
    this._systemProjection = Object.create(null);
    this._presentationProjection = Object.create(null);
    this._sharedSystems = null;
    this._sharedFacade = null;
    this._moveIntentRouter = null;
  }

  /** @private 将当前实例写入 Context；兼容 Scene 字段不再是管线事实源。 */
  _projectContext() {
    const scene = this.scene;
    const context = scene.context;
    if (!context) return;

    this._systemProjection = {
      container: this,
      ability: scene.abilitySystem,
      combat: scene.combatSystem,
      movement: scene.movementSystem,
      equipment: scene.equipmentSystem,
      ai: scene.aiSystem,
      collision: scene.collisionSystem,
      pickup: scene.pickupSystem,
      gathering: scene.gatheringSystem,
      gatheringPuppet: scene.gatheringPuppetSystem,
      meditation: scene.meditationSystem,
      zoneEffect: scene.zoneEffectSystem,
      meleeAttack: scene.meleeAttackSystem,
      flight: scene.flightSystem,
      jump: scene.jumpSystem,
      locomotion: scene.locomotionSystem,
      playerDefeat: scene.playerDefeatService,
      inventoryTransactions: scene.inventoryTransactions
    };
    this._presentationProjection = {
      combatEffects: scene.combatEffects,
      skillEffects: scene.skillEffects,
      weaponRenderer: scene.weaponRenderer,
      enemyWeaponRenderer: scene.enemyWeaponRenderer,
      particleSystem: scene.particleSystem,
      floatingTextManager: scene.floatingTextManager,
      effectZoneRenderer: scene.effectZoneRenderer
    };
    Object.assign(context.systems, this._systemProjection);
    Object.assign(context.presentation, this._presentationProjection);
  }

  /** @private 只清理由本装配器写入且仍指向原实例的 Context 引用。 */
  _clearContextProjection() {
    const context = this.scene.context;
    if (context) {
      for (const [key, value] of Object.entries(this._systemProjection)) {
        if (context.systems[key] === value) context.systems[key] = null;
      }
      for (const [key, value] of Object.entries(this._presentationProjection)) {
        if (context.presentation[key] === value) context.presentation[key] = null;
      }
    }
    this._systemProjection = Object.create(null);
    this._presentationProjection = Object.create(null);
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
        scene.entityStore.add(entity);
        scene.entityStore.addEquipmentItem(entity);
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
      onResolved: result => {
        const policy = scene.context?.services?.defeatPolicy;
        if (policy?.handleResolved?.(result) === true) return;
        scene.onPlayerDefeatResolved?.(result);
      }
    });
    scene.combatSystem.setOnPlayerDeathCallback?.(({ player }) => {
      const policy = scene.context?.services?.defeatPolicy;
      const resolution = policy?.resolve?.({ player })
        || scene.resolvePlayerDefeatResolution?.({ player })
        || { type: 'normalDeath' };
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
      onAttackPerformed: () => {
        const tutorialFlow = scene.context?.services?.tutorialFlow;
        if (tutorialFlow) tutorialFlow.notify('attackPerformed');
        else scene.onPlayerTutorialAction?.('attack');
      }
    });

    this._projectContext();
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
    if (scene.context) scene.context.systems.ability = scene.abilitySystem;
    this._systemProjection.ability = scene.abilitySystem;
    scene.gatheringPuppetSystem?.configure?.({ effectResolver, owner: scene.playerEntity });
    return true;
  }

  /**
   * GameLoader 就绪后统一创建职业、熟练度、营建与载具领域系统。
   * 历史条件、checkpoint 和事件命名全部由调用方以回调注入。
   */
  configureSharedSystems(config = {}) {
    const scene = this.scene;
    const effectResolver = config.effectResolver || null;
    if (!effectResolver) return null;

    this.disposeSharedSystems();
    const proficiencyConfig = config.proficiency || {};
    const proficiencySystem = new ProficiencySystem({
      ...(proficiencyConfig.config || {}),
      onEvent: proficiencyConfig.onEvent
    });
    const classSystem = new ClassSystem({ effectResolver });

    scene.gatheringSystem?.setEffectResolver?.(effectResolver);
    scene.gatheringSystem?.setSettlementPolicy?.(config.gathering?.settlementPolicy || null);
    scene.inventoryTransactions?.configureEffects?.({
      effectResolver,
      getEntityId: config.inventoryEffects?.getEntityId,
      baseResourceCapacity: config.inventoryEffects?.baseResourceCapacity
    });

    const constructionConfig = config.construction || {};
    const constructionSystem = new ConstructionSystem({
      inventoryTransactions: scene.inventoryTransactions,
      proficiencySystem,
      maxOperations: constructionConfig.maxOperations,
      itemResolver: constructionConfig.itemResolver,
      createCheckpoint: constructionConfig.createCheckpoint,
      validateSite: constructionConfig.validateSite,
      onEvent: constructionConfig.onEvent
    });
    const registered = constructionSystem.registerDefinitions(constructionConfig.definitions || []);
    const requiredProficiency = constructionConfig.requiredProficiencyType || null;
    if (!registered.ok || (requiredProficiency && !proficiencySystem.getDefinition?.(requiredProficiency))) {
      throw new Error(`Shared gameplay construction config invalid: ${registered.code || `missingProficiency:${requiredProficiency}`}`);
    }

    const vehicleConfig = config.vehicles || {};
    const vehicleSystem = new VehicleSystem({
      resolveEntity: vehicleConfig.resolveEntity,
      findSafeDismountPosition: vehicleConfig.findSafeDismountPosition
        || (request => this._findSafeDismountPosition(request)),
      onEvent: vehicleConfig.onVehicleEvent
    });
    const moveIntentRouter = (rider, intent) => (
      vehicleSystem.routeIntent(rider, intent) || { target: 'self', role: null, intent }
    );
    scene.movementSystem?.setMoveIntentRouter?.(moveIntentRouter);

    const vehicleLogisticsSystem = new VehicleLogisticsSystem({
      inventoryTransactions: scene.inventoryTransactions,
      getInventoryOwnerId: vehicleConfig.getInventoryOwnerId,
      createCheckpoint: vehicleConfig.createCheckpoint,
      onEvent: vehicleConfig.onLogisticsEvent,
      maxOperations: vehicleConfig.maxOperations
    });
    const mannedStructureAdapter = new MannedStructureAdapter({
      vehicleSystem,
      onEvent: vehicleConfig.onMannedStructureEvent
    });

    scene.classSystem = classSystem;
    scene.proficiencySystem = proficiencySystem;
    scene.constructionSystem = constructionSystem;
    scene.vehicleSystem = vehicleSystem;
    scene.vehicleLogisticsSystem = vehicleLogisticsSystem;
    scene.mannedStructureAdapter = mannedStructureAdapter;

    const sharedProjection = {
      classes: classSystem,
      proficiency: proficiencySystem,
      construction: constructionSystem,
      vehicle: vehicleSystem,
      vehicleLogistics: vehicleLogisticsSystem,
      mannedStructure: mannedStructureAdapter
    };
    Object.assign(scene.context?.systems || {}, sharedProjection);
    Object.assign(this._systemProjection, sharedProjection);

    this._moveIntentRouter = moveIntentRouter;
    this._sharedSystems = Object.freeze({
      classSystem,
      proficiencySystem,
      constructionSystem,
      vehicleSystem,
      vehicleLogisticsSystem,
      mannedStructureAdapter
    });
    const facade = Object.freeze({
      getSystems: () => this._sharedSystems,
      update: deltaTime => this.updateSharedSystems(deltaTime)
    });
    this._sharedFacade = facade;
    if (scene.context) scene.context.services.sharedGameplay = facade;

    this.configureAbilities({
      skillRegistry: config.skillRegistry,
      effectResolver
    });
    return this._sharedSystems;
  }

  /** 默认在载具四周寻找首个可通行下车点；具体导航策略仍可由调用方覆盖。 @private */
  _findSafeDismountPosition({ rider, vehicle, fallback } = {}) {
    const transform = vehicle?.getComponent?.('transform');
    const movementSystem = this.scene.context?.systems?.movement || this.scene.movementSystem;
    if (!transform || typeof movementSystem?.canMoveTo !== 'function') return fallback;
    const candidates = [
      [40, 0], [-40, 0], [0, 40], [0, -40],
      [56, 56], [-56, 56], [56, -56], [-56, -56]
    ];
    for (const [dx, dy] of candidates) {
      const x = transform.position.x + dx;
      const y = transform.position.y + dy;
      if (movementSystem.canMoveTo(x, y, rider)) return { x, y };
    }
    return fallback;
  }

  /** 保持旧顺序：人控工事先同步耐久，再同步载具乘员位置。 */
  updateSharedSystems(deltaTime) {
    if (!this._sharedSystems) return false;
    this._sharedSystems.mannedStructureAdapter.syncAll();
    this._sharedSystems.vehicleSystem.update(deltaTime);
    return true;
  }

  getSharedSystems() {
    return this._sharedSystems;
  }

  /** 幂等释放共享系统接线；实体本身仍由 SceneEntityStore/具体 runtime 先行释放。 */
  disposeSharedSystems() {
    const scene = this.scene;
    const owned = this._sharedSystems;
    if (!owned) return false;

    const movementSystem = scene.context?.systems?.movement || scene.movementSystem;
    if (movementSystem?.moveIntentRouter === this._moveIntentRouter) {
      movementSystem.setMoveIntentRouter(null);
    }
    owned.mannedStructureAdapter.structures?.clear?.();
    owned.vehicleSystem.vehicles?.clear?.();
    owned.vehicleSystem.resolveEntity = () => null;
    owned.vehicleSystem.onEvent = () => {};
    owned.vehicleLogisticsSystem.onEvent = () => {};
    owned.vehicleLogisticsSystem.getInventoryOwnerId = null;
    // 退出后迟到的未决事务必须被 checkpoint 拒绝并走自身回滚，不能静默提交到已释放场景。
    owned.vehicleLogisticsSystem.createCheckpoint = async () => false;
    scene.gatheringSystem?.setEffectResolver?.(null);
    scene.gatheringSystem?.setSettlementPolicy?.(null);
    scene.inventoryTransactions?.configureEffects?.({ effectResolver: null, getEntityId: null });

    const fields = {
      classes: 'classSystem',
      proficiency: 'proficiencySystem',
      construction: 'constructionSystem',
      vehicle: 'vehicleSystem',
      vehicleLogistics: 'vehicleLogisticsSystem',
      mannedStructure: 'mannedStructureAdapter'
    };
    for (const [contextKey, sceneKey] of Object.entries(fields)) {
      const instance = this._systemProjection[contextKey];
      if (scene.context?.systems?.[contextKey] === instance) scene.context.systems[contextKey] = null;
      if (scene[sceneKey] === instance) scene[sceneKey] = null;
      delete this._systemProjection[contextKey];
    }
    if (scene.context?.services?.sharedGameplay === this._sharedFacade) {
      delete scene.context.services.sharedGameplay;
    }
    this._sharedSystems = null;
    this._sharedFacade = null;
    this._moveIntentRouter = null;
    return true;
  }

  dispose() {
    const scene = this.scene;
    this.disposeSharedSystems();
    scene.gatheringPuppetSystem?.dispose?.();
    scene.locomotionSystem?.cleanup?.();
    scene.jumpSystem?.cleanup?.();
    scene.flightSystem?.cleanup?.();
    scene.meleeAttackSystem?.cleanup?.();
    scene.enemyWeaponRenderer?.cleanup?.();
    this._clearContextProjection();
    scene.abilitySystem = null;
    this.initialized = false;
  }
}

export default SceneGameplaySystemAssembler;