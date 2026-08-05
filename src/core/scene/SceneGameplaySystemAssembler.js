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
import { MeditationSystem } from '../../systems/MeditationSystem.js';
import { MeleeAttackSystem } from '../../systems/MeleeAttackSystem.js';
import { ZoneEffectSystem } from '../../systems/ZoneEffectSystem.js';
import { FlightSystem } from '../../systems/FlightSystem.js';
import { JumpSystem } from '../../systems/JumpSystem.js';
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
      jumpSystem: scene.jumpSystem
    });
    scene.equipmentSystem = new EquipmentSystem();
    scene.aiSystem = new AISystem();
    scene.collisionSystem = new CollisionSystem();

    scene.pickupSystem = new PickupSystem();
    scene.pickupSystem.init({
      inputManager: scene.inputManager,
      floatingTextManager: scene.floatingTextManager,
      weaponRenderer: scene.weaponRenderer
    });
    scene.pickupSystem.onPickup((item, player) => scene.onItemGained(item, player));

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
      floatingTextManager: scene.floatingTextManager
    });

    this.initialized = true;
    return this;
  }

  dispose() {
    const scene = this.scene;
    scene.jumpSystem?.cleanup?.();
    scene.flightSystem?.cleanup?.();
    scene.meleeAttackSystem?.cleanup?.();
    scene.enemyWeaponRenderer?.cleanup?.();
    this.initialized = false;
  }
}

export default SceneGameplaySystemAssembler;