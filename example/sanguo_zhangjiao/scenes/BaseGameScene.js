/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 */

/**
 * BaseGameScene - 游戏场景基类
 * 
 * 包含所有场景通用的基础功能：
 * - ECS 实体系统
 * - 输入管理
 * - 相机系统
 * - 移动系统
 * - 战斗系统
 * - UI 面板（背包、装备、人物信息）
 * - 粒子系统和特效
 * 
 * 第一幕和第二幕都继承此类
 */

import { Scene } from '../../../src/core/Scene.js';
import { normalizePresentationProfile } from '../../../src/core/PresentationProfile.js';
import presentationProfileData from '../config/presentation.json';
import { EntityFactory } from '../../../src/ecs/EntityFactory.js';
import { InputManager } from '../../../src/core/InputManager.js';
import UIClickHandler from '../../../src/core/UIClickHandler.js';
import { TutorialSystem } from '../../../src/systems/TutorialSystem.js';
import { DialogueSystem } from '../../../src/systems/DialogueSystem.js';
import { QuestSystem } from '../../../src/systems/QuestSystem.js';
import { IsometricRenderer } from '../../../src/rendering/IsometricRenderer.js';
import { BackpackPanel } from '../../../src/ui/BackpackPanel.js';
import { BottomControlBar } from '../../../src/ui/BottomControlBar.js';
import { PlayerStatusHUD } from '../../../src/ui/PlayerStatusHUD.js';
import { IconButton } from '../../../src/ui/IconButton.js';
import { createUIStrategy } from '../../../src/ui/strategies/index.js';
import { DialogueBox } from '../../../src/ui/DialogueBox.js';
import { Minimap } from '../../../src/ui/Minimap.js';
import { FloatingTextManager } from '../../../src/ui/FloatingText.js';
import { NotificationSystem } from '../../../src/ui/NotificationSystem.js';
import { ItemGainedPopup } from '../../../src/ui/ItemGainedPopup.js';
import { GamepadPanel } from '../../../src/ui/GamepadPanel.js';
import { PadButton } from '../../../src/core/input/Xbox360Profile.js';
import { GamepadCombatController } from '../../../src/core/input/GamepadCombatController.js';
import { InputHints } from '../../../src/core/input/InputHints.js';
import { SkillWheelOverlay } from '../../../src/ui/SkillWheelOverlay.js';
import { SceneTerrainBinding } from '../../../src/core/scene/SceneTerrainBinding.js';
import { SceneTerrainCollision } from '../../../src/core/scene/SceneTerrainCollision.js';
import { SceneEquipmentFlow } from '../../../src/core/scene/SceneEquipmentFlow.js';
import { SceneTransitionFlow } from '../../../src/core/scene/SceneTransitionFlow.js';
import { SceneCombatActions } from '../../../src/core/scene/SceneCombatActions.js';
import { SceneDialogueFlow } from '../../../src/core/scene/SceneDialogueFlow.js';
import { SceneWorldInteraction } from '../../../src/core/scene/SceneWorldInteraction.js';
import { SceneSkillActions } from '../../../src/core/scene/SceneSkillActions.js';
import { SceneWorldPresentation } from '../../../src/core/scene/SceneWorldPresentation.js';
import { ScenePanelLayout } from '../../../src/core/scene/ScenePanelLayout.js';
import { SceneRenderPipeline } from '../../../src/core/scene/SceneRenderPipeline.js';
import { SceneFramePipeline } from '../../../src/core/scene/SceneFramePipeline.js';
import { GameSceneRuntime } from '../../../src/core/scene/GameSceneRuntime.js';
import { SceneItemGainedFlow } from '../../../src/core/scene/SceneItemGainedFlow.js';
import { SceneAimPresentation } from '../../../src/core/scene/SceneAimPresentation.js';
import { SceneGameplaySystemAssembler } from '../../../src/core/scene/SceneGameplaySystemAssembler.js';
import { SceneDiagnostics } from '../../../src/core/scene/SceneDiagnostics.js';
import { GameSceneContext } from '../../../src/core/scene/GameSceneContext.js';
import { SceneResourceScope } from '../../../src/core/scene/SceneResourceScope.js';
import { SceneEntityStore } from '../../../src/core/scene/SceneEntityStore.js';
import { ScenePlayerLifecycle } from '../../../src/core/scene/ScenePlayerLifecycle.js';
import { SceneInputBindings } from '../../../src/core/scene/SceneInputBindings.js';
import { SceneHintPresenter } from '../../../src/core/scene/SceneHintPresenter.js';
import { SceneLifecycleCoordinator } from '../../../src/core/scene/SceneLifecycleCoordinator.js';
import { SceneInventoryFlow } from '../../../src/core/scene/SceneInventoryFlow.js';
import { SceneHudUpdater } from '../../../src/core/scene/SceneHudUpdater.js';
import { SceneTriggerBindingSystem } from '../../../src/core/scene/SceneTriggerBindingSystem.js';
import { SceneInputFlow } from '../../../src/core/input/SceneInputFlow.js';
import { Scene1Terrain } from './Scene1Terrain.js';
import { ParticleSystem } from '../../../src/rendering/ParticleSystem.js';
import { EffectZoneRenderer } from '../../../src/rendering/EffectZoneRenderer.js';
import { EntityLifecycleSystem } from '../../../src/systems/EntityLifecycleSystem.js';
import { UISystem } from '../../../src/ui/UISystem.js';
import { PortraitsConfig } from '../data/PortraitsConfig.js';
import { SelectedCharacterStore } from '../data/SelectedCharacterStore.js';
import { DemoPlayerFactory } from '../entities/DemoPlayerFactory.js';
import { hasSceneData, loadSceneFromFile } from '../../../src/core/SceneDataReader.js';
import { getNpcRenderStyle } from '../../../src/rendering/NpcRenderStyles.js';
import { EntityRenderer2D } from '../../../src/rendering/EntityRenderer2D.js';

const ZONE_STAT_NAMES = Object.freeze({ hp: '生命', mp: '法力', attack: '攻击', defense: '防御', speed: '速度' });

export const CAMPAIGN_ID = 'sanguo-zhangjiao-s01-s14';
export const SAVE_SCHEMA_VERSION = 1;
const CANONICAL_SCENE_ID = /^S(?:0[1-9]|1[0-4])(?:-C\d{2})?$/;
const LEGACY_SCENE_ID = /^(?:s\d+-\d+|scene_Prologue)$/;

function findLegacySavePath(value, path = '') {
  if (value === 'mage' || (typeof value === 'string' && LEGACY_SCENE_ID.test(value))) return path;
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key === 'act' || key === 'currentAct' || /^act\d/i.test(key)) return childPath;
    const legacyPath = findLegacySavePath(child, childPath);
    if (legacyPath) return legacyPath;
  }
  return null;
}
const ZONE_STAT_SHORT = Object.freeze({ hp: 'HP', mp: 'MP', attack: 'ATK', defense: 'DEF', speed: 'SPD' });

export class BaseGameScene extends Scene {
  constructor(sceneData = {}) {
    super(sceneData.name || 'DataDrivenPrologueScene');
    this.isPaused = false;
    // 独立于系统菜单暂停；技能轮盘仍需在暂停期间持续轮询 LB 松开沿。
    this.isSkillWheelWorldPaused = false;
    this.sceneManager = null;
    
    // ECS 核心：SceneEntityStore 是所有场景集合的唯一所有者，平铺字段仅作稳定投影。
    this.entityFactory = new EntityFactory();
    this._playerFactory = new DemoPlayerFactory();
    this.entityStore = new SceneEntityStore();
    this.entities = this.entityStore.all;
    this.enemyEntities = this.entityStore.enemies;
    this.pickupItems = this.entityStore.pickups;
    this.equipmentItems = this.entityStore.equipmentItems;
    this.context = new GameSceneContext({ entities: this.entityStore });
    this.resourceScope = null;
    this.playerLifecycle = null;
    this._lifecycleCoordinator = null;
    this._inputBindings = null;
    this._inputFlow = null;
    this._sceneTriggerBindings = null;
    this._inventoryFlow = null;
    this._hudUpdater = null;
    this._hintPresenter = null;
    
    // 游戏级表现规格是相机、渲染、角色尺寸和编辑器预览的唯一事实源。
    this.presentationProfile = normalizePresentationProfile(sceneData.presentationProfile || presentationProfileData);
    this.logicalWidth = this.presentationProfile.logicalResolution.width;
    this.logicalHeight = this.presentationProfile.logicalResolution.height;
    
    // 调试模式（开启后显示坐标标记和日志）
    this.debugMode = false;

    // 编辑器场景渲染器（通用，默认使用《三国张角传》S01 区块）
    this.terrain = null;
    this.editorSceneId = sceneData.editorSceneId || 'S01';
    // Demo 保留场景标识和世界偏移配置；核心 binding 不认识任何 Demo 内容。
    this._terrainConfig = {
      gameId: 'sanguo_zhangjiao',
      sceneId: this.editorSceneId,
      worldOffset: sceneData.worldOffset || { x: 0, y: 0 }
    };
    this._terrainBinding = new SceneTerrainBinding({
      scene: this,
      TerrainClass: Scene1Terrain,
      hasSceneData,
      loadSceneFromFile,
      EffectZoneRenderer,
      SceneTerrainCollision
    });

    // 调试面板、性能采样和 Canvas 观测由框架诊断服务统一管理。
    this._diagnostics = new SceneDiagnostics(this);
    
    // 核心系统
    this.inputManager = null;
    this.camera = null;
    this.combatSystem = null;
    this.movementSystem = null;
    this.equipmentSystem = null;
    this.aiSystem = null;
    this.isometricRenderer = null;  // 统一渲染器
    this.entityRenderer2D = null;
    this.combatEffects = null;
    this.skillEffects = null;
    this.weaponRenderer = null;
    this.enemyWeaponRenderer = null;
    this.flightSystem = null;
    this.jumpSystem = null;
    this.collisionSystem = null;
    this.pickupSystem = null;
    this.meditationSystem = null;
    this.zoneEffectSystem = null;
    
    // 扇形攻击系统（由 MeleeAttackSystem 管理）
    this.meleeAttackSystem = null;
    
    // 实体生命周期系统
    this.entityLifecycleSystem = new EntityLifecycleSystem();
    
    this.uiClickHandler = new UIClickHandler();
    
    // UI 系统（面板生命周期管理）
    this.uiSystem = new UISystem();
    
    // 序章系统
    this.tutorialSystem = new TutorialSystem();
    this.dialogueSystem = new DialogueSystem();
    this.questSystem = new QuestSystem();
    
    // UI 面板
    this.backpackPanel = null;
    // 兼容旧场景/系统对三个面板字段的访问；它们都指向唯一组合背包。
    this.inventoryPanel = null;
    this.playerInfoPanel = null;
    this.equipmentPanel = null;
    this.bottomControlBar = null;
    this.playerStatusHUD = null;
    this.dialogueBox = null;
    
    // UI 装配策略（按平台分桌面/移动两套），收敛平台差异
    this.uiStrategy = createUIStrategy();
    // 兼容字段：是否移动端布局（部分旧逻辑仍引用）
    this.isMobileLayout = this.uiStrategy.platform === 'mobile';
    
    // 飘动文字管理器
    this.floatingTextManager = new FloatingTextManager();
    
    // 粒子系统
    this.particleSystem = new ParticleSystem(500);
    
    // 特效区域粒子渲染器（加载场景后由 terrain._applySceneData 或 _initEffectZones 填充）
    this.effectZoneRenderer = null;
    
    // 等距渲染器
    this.isometricRenderer = null;
    
    // 等距地图数据
    this.mapData = null;
    this.mapWidth = 30;  // 地图宽度（格子数）
    this.mapHeight = 30; // 地图高度（格子数）
    
    // 玩家实体
    this.playerEntity = null;

    // 教程状态
    this.tutorialPhase = 'init';
    
    // 对话控制标志
    this.lastSpacePressed = false;
    
    // 技能瞄准预览（手机拖拽技能时显示落点虚线框）
    this.skillAimPreview = null; // { skill, targetX, targetY, startX, startY, inRange, color } 或 null
    // 平滑过渡用的显示位置（lerp）
    this._aimDisplayX = 0;
    this._aimDisplayY = 0;
    // 瞄准参数缓存（每帧刷新用）
    this._aimDirX = 0;
    this._aimDirY = 0;
    this._aimDistRatio = 0;

    // PC 瞄准模式由框架的 SceneAimController 管理（懒创建于 _ensureAimController）
    this._aimController = null;
    
    // 世界与 HUD 渲染顺序交由核心渲染管线协调
    this._renderPipeline = null;

    // 每帧更新顺序交由核心帧管线协调
    this._framePipeline = null;
    // 生命周期、阶段钩子与 disposer 由通用运行时管理；旧系统链仍由帧管线保持原顺序。
    this.sceneRuntime = null;
    this._itemGainedFlow = null;
    this._aimPresentation = null;

    // 场景 UI 布局协调器按需创建，集中处理配置加载、缩放与 Canvas/DOM 层级联动
    this._panelLayout = null;

    // 场景战斗动作服务按需创建，只承接攻击、轻功、投掷、格挡和药水动作。
    this._combatActions = null;
    // 输入与交互职责由独立服务拥有；Base 仅保留兼容转发入口。
    this._dialogueFlow = null;
    this._worldInteraction = null;
    this._skillActions = null;
    this._worldPresentation = null;

    // 通用玩法系统由框架装配器集中创建、接线和释放。
    this._gameplaySystemAssembler = new SceneGameplaySystemAssembler(this);

    // 场景过渡：状态机与绘制由框架的 SceneTransitionFlow 承担
    this._transition = new SceneTransitionFlow({
      fadeDuration: 2.0,
      textDuration: 3.0,
      onSwitch: () => this.switchToNextScene()
    });

    // 宿主页面注入系统菜单和自动存档入口；场景层不依赖具体 DOM。
    this._systemMenuCallback = null;
    this._autoSaveCallback = null;
  }

  setSceneManager(sceneManager) {
    this.sceneManager = sceneManager;
  }

  setSystemMenuCallback(callback) {
    this._systemMenuCallback = typeof callback === 'function' ? callback : null;
  }

  openSystemMenu() {
    if (this._systemMenuCallback) return this._systemMenuCallback(this);
    return globalThis.__openSystemMenu?.(this);
  }

  /** 宿主注入自动存档入口；剧情/地图切换只请求，不直接依赖存储实现。 */
  setAutoSaveCallback(callback) {
    this._autoSaveCallback = typeof callback === 'function' ? callback : null;
  }

  requestAutoSave(context = {}) {
    return this._autoSaveCallback?.({ scene: this, ...context }) || Promise.resolve(null);
  }

  /** 采集可序列化的通用游戏状态，供 SnapshotManager 原子存档。 */
  captureSaveState() {
    const player = this.playerEntity;
    const transform = player?.getComponent?.('transform');
    const stats = player?.getComponent?.('stats');
    const inventory = player?.getComponent?.('inventory');
    const equipment = player?.getComponent?.('equipment');
    const name = player?.getComponent?.('name');
    const statsFields = [
      'baseMaxHp', 'baseMaxMp', 'baseMaxStamina', 'baseStaminaRegen', 'baseAttack', 'baseDefense', 'baseSpeed',
      'maxHp', 'hp', 'maxMp', 'mp', 'maxStamina', 'stamina', 'staminaRegen', 'attack', 'defense', 'speed', 'level', 'exp',
      'mainElement', 'elementAttack', 'elementDefense', 'unitType', 'gold', 'attributeEffects',
      'class', 'skillPoints'
    ];
    const statsData = {};
    for (const key of statsFields) {
      if (stats && stats[key] !== undefined) statsData[key] = stats[key];
    }

    const snapshot = JSON.parse(JSON.stringify({
      campaignId: CAMPAIGN_ID,
      schemaVersion: SAVE_SCHEMA_VERSION,
      currentSceneId: this.currentSceneId || this.editorSceneId || 'S01',
      player: {
        id: player?.id || null,
        name: name ? { name: name.name, visible: name.visible, color: name.color } : null,
        transform: transform ? {
          x: transform.position.x,
          y: transform.position.y,
          elevation: transform.position.elevation || 0,
          rotation: transform.rotation || 0,
          scale: { ...transform.scale },
          floorId: transform.floorId || 'ground'
        } : null,
        stats: statsData,
        inventory: inventory?.exportItems?.() || [],
        equipment: equipment?.exportEquipment?.() || {}
      },
      tutorial: this.tutorialSystem?.saveProgress?.() || null,
      dialogue: this.dialogueSystem?.saveState?.() || null,
      quests: this.questSystem?.serialize?.() || null,
      content: this.gameLoader?.serialize?.(player?.id || null) || null,
      scene: this.captureSceneSaveState()
    }));
    const validation = this.validateSaveState(snapshot);
    if (!validation.ok) {
      const error = new Error('拒绝生成包含旧剧情或非法 canonical 状态的新存档');
      error.name = 'InvalidSaveStateError';
      error.errors = validation.errors;
      throw error;
    }
    return snapshot;
  }

  validateSaveState(data) {
    const errors = [];
    const incompatible = (path) => errors.push({
      code: 'incompatibleSave',
      path,
      message: '版本不兼容，请开始新游戏'
    });

    if (!data || typeof data !== 'object') {
      errors.push({ code: 'missingField', path: '', message: '游戏状态为空' });
      return { ok: false, errors };
    }
    if (data.campaignId !== CAMPAIGN_ID) incompatible('campaignId');
    if (data.schemaVersion !== SAVE_SCHEMA_VERSION) incompatible('schemaVersion');
    if (!CANONICAL_SCENE_ID.test(data.currentSceneId || '')) incompatible('currentSceneId');
    const legacyPath = findLegacySavePath(data);
    if (legacyPath) incompatible(legacyPath);

    if (!data.player || typeof data.player !== 'object') {
      errors.push({ code: 'missingField', path: 'player', message: '缺少玩家状态' });
    } else if (data.player.transform && (!Number.isFinite(data.player.transform.x) || !Number.isFinite(data.player.transform.y))) {
      errors.push({ code: 'invalidField', path: 'player.transform', message: '玩家坐标无效' });
    }
    return { ok: errors.length === 0, errors };
  }

  /** 恢复通用状态；调用前应等待世界与 GameLoader 初始化完成。 */
  restoreSaveState(data) {
    const check = this.validateSaveState(data);
    if (!check.ok) return check;
    const player = this.playerEntity;
    if (!player) return { ok: false, errors: [{ code: 'missingPlayer', path: 'player', message: '玩家尚未创建' }] };

    const transform = player.getComponent('transform');
    const stats = player.getComponent('stats');
    const inventory = player.getComponent('inventory');
    const equipment = player.getComponent('equipment');
    const name = player.getComponent('name');
    const savedPlayer = data.player;
    if (name && savedPlayer.name) {
      name.name = savedPlayer.name.name || name.name;
      name.visible = savedPlayer.name.visible !== false;
      name.color = savedPlayer.name.color || name.color;
    }
    if (transform && savedPlayer.transform) {
      transform.setPosition(savedPlayer.transform.x, savedPlayer.transform.y, savedPlayer.transform.elevation || 0);
      transform.rotation = savedPlayer.transform.rotation || 0;
      if (savedPlayer.transform.scale) transform.setScale(savedPlayer.transform.scale.x, savedPlayer.transform.scale.y);
      transform.floorId = savedPlayer.transform.floorId || 'ground';
      this.camera?.setPosition?.(savedPlayer.transform.x, savedPlayer.transform.y);
    }
    if (equipment && savedPlayer.equipment) {
      for (const slot of Object.keys(equipment.slots)) equipment.slots[slot] = null;
      equipment.loadEquipment(savedPlayer.equipment);
    }
    if (stats && savedPlayer.stats) {
      const hasSavedClass = Object.prototype.hasOwnProperty.call(savedPlayer.stats, 'class')
        && savedPlayer.stats.class != null;
      if (!hasSavedClass) {
        delete stats.class;
        delete player.class;
      }
      Object.assign(stats, JSON.parse(JSON.stringify(savedPlayer.stats)));
      if (hasSavedClass) player.class = savedPlayer.stats.class;
    }
    if (inventory && Array.isArray(savedPlayer.inventory)) inventory.loadItems(savedPlayer.inventory);

    this.tutorialSystem?.loadProgress?.(data.tutorial);
    this.questSystem?.reset?.();
    this.questSystem?.deserialize?.(data.quests || {});
    const contentResult = this.gameLoader?.deserialize?.(data.content, player.id);
    if (contentResult && contentResult.ok === false) {
      return {
        ok: false,
        errors: (contentResult.errors || []).map(error => ({
          ...error,
          path: `content.${error.path || ''}`.replace(/\.$/, '')
        }))
      };
    }
    this.dialogueSystem?.reset?.();
    this.dialogueSystem?.loadState?.(data.dialogue, { player, scene: this });
    this.currentSceneId = data.currentSceneId;
    const sceneResult = this.restoreSceneSaveState(data.scene || {});
    if (sceneResult && sceneResult.ok === false) {
      return {
        ok: false,
        errors: (sceneResult.errors || []).map(error => ({
          ...error,
          path: `scene.${error.path || ''}`.replace(/\.$/, '')
        }))
      };
    }
    this.bindUIPanelsToPlayer(player, { syncCameraPosition: false, log: false });
    return { ok: true, errors: [] };
  }

  /** 子场景覆盖以补充剧情/世界状态。 */
  captureSceneSaveState() { return {}; }

  /** 子场景覆盖以恢复剧情/世界状态。 */
  restoreSceneSaveState(_data) {}

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  /**
   * 场景进入 - 初始化所有基础系统
   */
  enter(data = null) {
    super.enter(data);

    this.resourceScope?.dispose();
    this.resourceScope = new SceneResourceScope();
    this._lifecycleCoordinator = new SceneLifecycleCoordinator({
      context: this.context,
      onError: (phase, name, error) => console.warn(`BaseGameScene lifecycle ${phase} [${name}]`, error)
    });
    this.context.lifecycle.coordinator = this._lifecycleCoordinator;
    this._hintPresenter = new SceneHintPresenter({
      resourceScope: this.resourceScope,
      InputHints,
      window: typeof window !== 'undefined' ? window : undefined,
      document: typeof document !== 'undefined' ? document : undefined
    });
    const hintPresenter = this._hintPresenter;
    this.resourceScope.track(() => hintPresenter.dispose());
    this.context.presentation.hints = hintPresenter;
    this.context.lifecycle.scope = this.resourceScope;
    this.context.lifecycle.state = 'entering';

    // 获取 canvas
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('BaseGameScene: Canvas not found');
      return;
    }

    const ctx = canvas.getContext('2d');
    this.context.setCanvasRuntime(canvas, ctx);

    // 逻辑视口与物理 backing 分离：宿主有 display scaler 时由它拥有逻辑尺寸（window 模式跟随窗口），
    // 场景不得把高清 backing 或窗口视口重置回参考分辨率。
    const logical = this.presentationProfile.logicalResolution;
    const displayManaged = Number(canvas.logicalWidth) > 0 && Number(canvas.logicalHeight) > 0;
    if (!displayManaged) {
      if (canvas.width !== logical.width) canvas.width = logical.width;
      if (canvas.height !== logical.height) canvas.height = logical.height;
      canvas.logicalWidth = logical.width;
      canvas.logicalHeight = logical.height;
    }
    this.logicalWidth = Number(canvas.logicalWidth) || logical.width;
    this.logicalHeight = Number(canvas.logicalHeight) || logical.height;
    this.context.runtime.width = this.logicalWidth;
    this.context.runtime.height = this.logicalHeight;

    const worldProfile = this.presentationProfile.world;
    // 初始化统一渲染器（包含 Camera）
    this.isometricRenderer = new IsometricRenderer(ctx, {
      tileWidth: worldProfile.tileWidth,
      tileHeight: worldProfile.tileHeight,
      width: this.logicalWidth,
      height: this.logicalHeight,
      assetManager: this.assetManager || null,
      debug: false,
      showGrid: false,  // 关闭网格线
      gridSize: this.mapWidth
    });
    this.context.presentation.renderer = this.isometricRenderer;

    // 从渲染器获取相机，并应用项目统一跟随规格。
    this.camera = this.isometricRenderer.getCamera();
    this.camera.followSpeed = Number(this.presentationProfile.camera.followSpeed);
    this.camera.deadzone = { ...this.presentationProfile.camera.deadzone };
    this.context.camera.instance = this.camera;
    this.context.camera.renderer = this.isometricRenderer;

    // 生成等距地图
    this.generateIsometricMap();

    // 初始化编辑器场景地形（所有幕通用，如果编辑器有该场景数据就加载渲染）
    this._initEditorTerrain();
    this.context.world.terrain = this.terrain;

    // 初始化输入管理器
    this.inputManager = new InputManager(canvas);
    this.context.input.manager = this.inputManager;
    this.context.input.gamepad = this.inputManager.gamepad || null;
    // 操作提示按当前输入方案（键鼠 / 触屏 / 手柄）取文案，手柄接上会自动切换
    InputHints.setInputManager(this.inputManager);
    // 运行时先仅管理生命周期、阶段和 disposer；旧帧管线仍保留既有系统调用顺序。
    this._initializeSceneRuntime();
    this.context.runtime.sceneRuntime = this.sceneRuntime;

    // 通用玩法系统按原顺序创建，并继续投影到场景字段供帧管线使用。
    this._gameplaySystemAssembler.initialize({
      zoneCallbacks: this._createZoneEffectCallbacks()
    });
    Object.assign(this.context.systems, {
      container: this._gameplaySystemAssembler,
      combat: this.combatSystem,
      movement: this.movementSystem,
      equipment: this.equipmentSystem,
      ai: this.aiSystem,
      collision: this.collisionSystem,
      pickup: this.pickupSystem,
      meditation: this.meditationSystem,
      zoneEffect: this.zoneEffectSystem,
      flight: this.flightSystem,
      jump: this.jumpSystem,
      meleeAttack: this.meleeAttackSystem
    });

    // 初始化 UI 面板
    this.initializeUIPanels();
    const panelLayout = this._ensurePanelLayout();
    Object.assign(this.context.ui, {
      layout: panelLayout,
      backpack: this.backpackPanel,
      bottomControlBar: this.bottomControlBar,
      playerStatusHUD: this.playerStatusHUD,
      dialogueBox: this.dialogueBox
    });

    // 创建或继承玩家实体；系统/UI/相机和 EntityLifecycleSystem 接线统一由协调器负责。
    this.playerLifecycle = new ScenePlayerLifecycle({
      scene: this,
      context: this.context,
      playerFactory: this._playerFactory,
      panelLayout,
      lifecycleSystem: this.entityLifecycleSystem
    });
    this.context.lifecycle.player = this.playerLifecycle;
    this.playerEntity = this.playerLifecycle.createOrInherit(data || {}, {
      onInherited: (player) => console.log('BaseGameScene: 继承玩家实体', player),
      onCreated: () => console.log('BaseGameScene: 创建新玩家实体')
    });
    this._sceneTriggerBindings?.dispose();
    this._sceneTriggerBindings = new SceneTriggerBindingSystem({
      getPlayer: () => this.playerEntity,
      logger: (reason, binding) => console.warn(`BaseGameScene: 场景触发器绑定 ${reason}`, binding?.id),
      onPromptChange: prompt => {
        if (prompt) this._hintPresenter?.showHint(prompt, '交互');
        else this._hintPresenter?.hideHint();
      }
    });

    console.log(`BaseGameScene: 进入场景 ${this.name}`);

    this.playerLifecycle.configureCleanup();

    // 将交互服务登记到显式 Context；帧/渲染管线可直接调度，Base 方法仅兼容旧调用方。
    Object.assign(this.context.services, {
      dialogue: this._ensureDialogueFlow(),
      triggerBindings: this._sceneTriggerBindings,
      worldInteraction: this._ensureWorldInteraction(),
      skills: this._ensureSkillActions(),
      worldPresentation: this._ensureWorldPresentation(),
      combatActions: this._ensureCombatActions()
    });

    // 玩家生命周期保护完成后再注册输入，并正式加载手柄配置。
    this._inputBindings = new SceneInputBindings({
      inputManager: this.inputManager,
      resourceScope: this.resourceScope,
      toggleBackpack: () => this.backpackPanel?.toggle(),
      toggleSettings: () => this.openSystemMenu(),
      togglePerformance: () => this._diagnostics.togglePerformance(),
      onGamepadConnected: (info) => {
        if (this.notificationSystem) {
          this.notificationSystem.addNotification(
            `${info.isXbox ? 'Xbox 手柄' : '手柄'}已连接（调试面板可查看按键）`, 'success');
        }
        this.inputManager.vibrate(180, 0.5, 0.3);
      },
      onGamepadDisconnected: () => {
        if (this.notificationSystem) this.notificationSystem.addNotification('手柄已断开', 'info');
      },
      logger: () => console.log('BaseGameScene: 已加载手柄绑定配置 config/gamepad.json')
    });
    this.context.input.bindings = this._inputBindings;
    this._inputBindings.register();

    // 顶层 flow 只接收显式依赖；帧管线不再理解弹窗、HUD 和背包内部细节。
    this._ensureInventoryFlow();
    this._ensureHudUpdater();
    this._ensureInputFlow().registerDefaults();
    Object.assign(this.context.services, {
      input: this._inputFlow,
      inventory: this._inventoryFlow,
      hud: this._hudUpdater
    });
    this.context.lifecycle.state = 'active';
  }

  /** Demo 内容层的区域提示；系统创建与生命周期由框架装配器负责。 */
  _createZoneEffectCallbacks() {
    return {
      onEnterZone: (entity, zone) => {
        if (entity !== this.playerEntity) return;
        const effect = zone.effect || {};
        const statName = ZONE_STAT_NAMES[effect.stat] || effect.stat;
        const isGain = (effect.value || 0) > 0;
        const tipText = isGain
          ? `进入增益区域：${zone.name || 'Buff区域'}（${statName} +${effect.value}）`
          : `进入减益区域：${zone.name || 'Buff区域'}（${statName} ${effect.value}）`;
        this._showScreenTip(tipText);
        this.resourceScope?.setTimeout(() => this._hideScreenTip(), 2500);
      },
      onLeaveZone: (entity, zone) => {
        if (entity !== this.playerEntity) return;
        this._showScreenTip(`离开区域：${zone.name || 'Buff区域'}`);
        this.resourceScope?.setTimeout(() => this._hideScreenTip(), 1500);
      },
      onEffectApply: (entity, zone, stat, value) => {
        const transform = entity.getComponent?.('transform');
        if (!transform || !this.floatingTextManager) return;
        const position = transform.position;
        const color = value > 0 ? '#00ff88' : '#ff4444';
        const prefix = value > 0 ? '+' : '';
        const statShort = ZONE_STAT_SHORT[stat] || stat;
        this.floatingTextManager.addText(
          position.x, position.y - 40, `${prefix}${value} ${statShort}`, color);
      }
    };
  }

  /**
   * 加载火焰图片
   */
  loadFireImage() {
    if (!this.campfire) return;
    const image = new Image();
    this.campfire.fireImage = image;
    const onload = () => {
      this.campfire.imageLoaded = true;
      console.log('BaseGameScene: 火焰图片加载成功');
    };
    const onerror = () => {
      console.warn('BaseGameScene: 火焰图片加载失败');
      this.campfire.imageLoaded = false;
    };
    image.onload = this.resourceScope?.guard(onload) || onload;
    image.onerror = this.resourceScope?.guard(onerror) || onerror;
    this.resourceScope?.track(() => {
      image.onload = null;
      image.onerror = null;
    });
    image.src = 'assets/images/fire.webp';
  }


  /**
   * 处理装备槽点击（卸下装备）——属性面板/装备面板共用
   * @param {string} slotType - 装备槽类型
   * @param {string} button - 鼠标按钮
   */
  _handleEquipmentSlotClick(slotType, button) {
    return this._ensureInventoryFlow().unequip(slotType, button, { mobile: this.isMobileLayout });
  }

  /**
   * 初始化 UI 面板（兼容入口，委托给场景 HUD 组合器）
   */
  initializeUIPanels() {
    const panelLayout = this._ensurePanelLayout();
    // 物品图标优先使用内容定义的稳定 imageId；退出场景时解除注入。
    this.resourceScope?.track(panelLayout.installItemIconResolver());
    return panelLayout.composeHud();
  }

  /** 加载并应用 UI 编辑器布局（Canvas 面板部分）。 */
  async _applyUILayout() {
    return this._ensurePanelLayout().applyUILayout();
  }

  /**
   * 物品使用回调
   */
  onItemUsed(item, healAmount, manaAmount) {
    return this._ensureInventoryFlow().itemUsed(item, healAmount, manaAmount);
  }

  /**
   * 装备变化回调
   * @param {Array} messages - 消息数组
   */
  /**
   * 获得物品（拾取/奖励）→ 委托给通用 FIFO 弹窗流程。
   * 物品的入背包仍由 PickupSystem / TriggerActions 在调用前完成。
   */
  onItemGained(item, player) {
    return this._ensureInventoryFlow().itemGained(item, player);
  }

  /** @private 兼容旧场景/手柄弹窗回调：显示队列下一件。 */
  _showNextGained() {
    return this._ensureItemGainedFlow().showNext();
  }

  /** @private 装备预览比较继续复用框架通用实现。 */
  _computeEquipComparison(item, player) {
    return this._ensureItemGainedFlow().computeEquipComparison(item, player);
  }

  /** @private 兼容旧调用：执行当前物品弹窗的主操作。 */
  _onGainedPopupPrimary(item, player) {
    return this._ensureItemGainedFlow().handlePrimary(item, player);
  }

  /** @private 懒创建装备流程实例（注入 EquipmentSystem 以触发属性重算） */
  _ensureEquipmentFlow() {
    if (!this._equipmentFlow) {
      this._equipmentFlow = new SceneEquipmentFlow({ equipmentSystem: this.equipmentSystem });
    }
    return this._equipmentFlow;
  }

  /** @private 装备变化后刷新统一背包显示 */
  _refreshEquipmentPanels(player) {
    this.backpackPanel?.setEntity(player);
  }

  /**
   * 装备变化统一出口。所有装备/卸下路径都必须经过这里，子类可覆盖以派发事件源。
   * @param {string[]} messages - 展示用文案
   * @param {Object} [info] - 结构化信息 { slot, item, oldItem, action }，
   *   由知道细节的调用方传入；InventoryPanel 等旧路径不传，子类需自行兜底推断。
   */
  onEquipmentChanged(messages, info = null) {
    if (!messages || messages.length === 0) return;
    
    if (this.playerEntity) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform) {
        // 显示每条消息
        let yOffset = -30;
        for (const message of messages) {
          this.floatingTextManager.addText(
            transform.position.x, 
            transform.position.y + yOffset, 
            message,
            message.includes('+') ? '#00ff00' : (message.includes('-') ? '#ff6666' : '#ffff00')
          );
          yOffset -= 25;
        }
      }
    }
    
    console.log('BaseGameScene: 装备变化', messages);
  }

  /**
   * 技能点击回调
   * @param {Object} skill - 技能对象
   */
  onSkillClicked(skill) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureSkillActions().onSkillClicked(skill);
  }

  /** @private 懒创建场景渲染编排器。 */
  _ensureRenderPipeline() {
    if (!this._renderPipeline) {
      this._renderPipeline = new SceneRenderPipeline({ scene: this, context: this.context });
    }
    return this._renderPipeline;
  }

  /** @private 懒创建场景帧更新管线。 */
  _ensureFramePipeline() {
    if (!this._framePipeline) {
      this._framePipeline = new SceneFramePipeline({ scene: this, context: this.context });
    }
    return this._framePipeline;
  }

  /** 初始化运行时；场景重入时先释放旧 disposer，避免重复事件订阅。 */
  _initializeSceneRuntime() {
    this.sceneRuntime?.dispose();
    this.sceneRuntime = new GameSceneRuntime({
      inputManager: this.inputManager,
      camera: this.camera,
      onError: (phase, name, error) => console.warn(`BaseGameScene runtime ${phase} [${name}]`, error)
    });
    this.sceneRuntime.provide({ scene: this });
    this.sceneRuntime.enter();
    return this.sceneRuntime;
  }

  /** 由 SceneFramePipeline 在旧调用链中的准确位置调度运行时阶段。 */
  _runRuntimePhase(phase, deltaTime) {
    return this.sceneRuntime?.runFramePhase(phase, deltaTime, { scene: this }) || false;
  }

  /** @private 顶层输入编排：帧首采集、优先消费，正常帧末统一清帧。 */
  _ensureInputFlow() {
    if (!this._inputFlow) {
      this._inputFlow = new SceneInputFlow({
        inputManager: this.inputManager,
        runtime: this.sceneRuntime,
        router: this.sceneRuntime?.inputRouter,
        gamepadCombat: this.gamepadCombatController,
        onModalInput: context => this.handleModalInput(context),
        onPopupConfirm: () => this._handleGainedPopupGamepad(),
        onGamepadCombat: () => this._updateGamepadCombat(),
        onPromptSwitch: () => this._updatePromptSwitch(),
        dialogue: this._ensureDialogueFlow(),
        aiming: this._ensureSkillActions(),
        triggerBindings: this._sceneTriggerBindings,
        worldInteraction: this._ensureWorldInteraction()
      });
    }
    return this._inputFlow;
  }

  /** 子场景可覆盖的模态输入出口；返回 true 时本帧所有世界输入均被消费。 */
  handleModalInput(_context) {
    return false;
  }

  /** 子场景在 super.update 前读取输入时调用；同帧重复调用由 flow 守卫跳过。 */
  _beginInputFrame(deltaTime) {
    return this._ensureInputFlow().beforeFrame(deltaTime);
  }

  /** @private 背包、装备和获得物品统一流程。 */
  _ensureInventoryFlow() {
    if (!this._inventoryFlow) {
      this._inventoryFlow = new SceneInventoryFlow({
        equipmentFlow: this._ensureEquipmentFlow(),
        itemGainedFlow: this._ensureItemGainedFlow(),
        getPlayer: () => this.playerEntity,
        getBackpack: () => this.backpackPanel,
        getFloatingText: () => this.floatingTextManager,
        getNotification: () => this.notificationSystem,
        onEquipmentChanged: (messages, info) => this.onEquipmentChanged(messages, info),
        onItemUsedEvent: ({ id, item }) => this.gameLoader?.triggerSystem?.fire('itemUsed', { id, item })
      });
    }
    return this._inventoryFlow;
  }

  /** @private HUD 更新器只读取显式 UI/System/World 投影。 */
  _ensureHudUpdater() {
    if (!this._hudUpdater) {
      this._hudUpdater = new SceneHudUpdater({
        getUI: () => ({
          backpack: this.backpackPanel,
          bottomControlBar: this.bottomControlBar,
          playerStatusHUD: this.playerStatusHUD,
          gamepadPanel: this.gamepadPanel,
          dialogueBox: this.dialogueBox,
          minimap: this.minimap,
          flightButton: this.flightButton,
          throwButton: this.throwButton,
          blockButton: this.blockButton,
          updatePanelHover: () => this.updatePanelHover()
        }),
        getSystems: () => ({
          flight: this.flightSystem,
          weaponRenderer: this.weaponRenderer,
          combat: this.combatSystem,
          dialogue: this.dialogueSystem
        }),
        getWorld: () => ({
          terrainBinding: this._terrainBinding,
          region: this._worldRegion,
          camera: this.camera
        }),
        getPlayer: () => this.playerEntity,
        getEntities: () => this.entities,
        performanceOptimizer: this.performanceOptimizer
      });
    }
    return this._hudUpdater;
  }

  /** @private 懒创建物品获得队列服务。 */
  _ensureItemGainedFlow() {
    if (!this._itemGainedFlow) {
      this._itemGainedFlow = new SceneItemGainedFlow(this, {
        getEquipmentFlow: () => this._ensureEquipmentFlow(),
        onEquipmentChanged: (messages, info) => this.onEquipmentChanged(messages, info),
        onQueueDrained: () => this.gameLoader?.triggerSystem?.fire('gainedPopupClosed', {})
      });
    }
    return this._itemGainedFlow;
  }

  /** @private 懒创建统一瞄准预览状态。 */
  _ensureAimPresentation() {
    if (!this._aimPresentation) this._aimPresentation = new SceneAimPresentation(this);
    return this._aimPresentation;
  }

  /** @private 懒创建场景 HUD 组合与布局协调器。 */
  _ensurePanelLayout() {
    if (!this._panelLayout) {
      this._panelLayout = new ScenePanelLayout(this, {
        BackpackPanel,
        BottomControlBar,
        PlayerStatusHUD,
        IconButton,
        DialogueBox,
        NotificationSystem,
        ItemGainedPopup,
        GamepadPanel,
        GamepadCombatController,
        SkillWheelOverlay,
        Minimap,
        SelectedCharacterStore,
        PortraitsConfig
      });
    }
    return this._panelLayout;
  }

  /** @private 懒创建场景战斗动作服务。 */
  _ensureCombatActions() {
    if (!this._combatActions) this._combatActions = new SceneCombatActions(this);
    return this._combatActions;
  }

  /** @private 懒创建对话输入服务。 */
  _ensureDialogueFlow() {
    if (!this._dialogueFlow) this._dialogueFlow = new SceneDialogueFlow(this);
    return this._dialogueFlow;
  }

  /** @private 懒创建世界与 UI 点击交互服务。 */
  _ensureWorldInteraction() {
    if (!this._worldInteraction) this._worldInteraction = new SceneWorldInteraction(this);
    return this._worldInteraction;
  }

  /** @private 懒创建技能释放与瞄准服务。 */
  _ensureSkillActions() {
    if (!this._skillActions) this._skillActions = new SceneSkillActions(this);
    return this._skillActions;
  }

  /** @private 懒创建通用世界表现服务。 */
  _ensureWorldPresentation() {
    if (!this._worldPresentation) this._worldPresentation = new SceneWorldPresentation(this);
    return this._worldPresentation;
  }

  /** 检查技能是否可用（蓝量/冷却），不足则飘字提示 */
  checkSkillUsable(skill) {
    return this._ensureSkillActions().checkSkillUsable(skill);
  }

  /** 按技能索引释放技能（用于触屏/虚拟按钮，无鼠标指向时按角色朝向放） */
  useSkillByIndex(index) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureSkillActions().useSkillByIndex(index);
  }

  /** 按指定方向和距离比例释放技能（触屏摇杆瞄准后释放） */
  useSkillByDirection(index, dirX, dirY, distRatio, targetWorldPos) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureSkillActions().useSkillByDirection(
      index, dirX, dirY, distRatio, targetWorldPos);
  }

  /**
   * 设置技能瞄准预览（拖动期间每帧调用,更新落点位置）
   * @param {number} index - 技能索引
   * @param {number} dirX - 方向 X
   * @param {number} dirY - 方向 Y
   * @param {number} distRatio - 拖拽距离占瞄准圈的比例(0~1+),1=最大射程
   * @param {Object} [anchorPos] - 锚点位置(世界坐标),用于固定预览圈到世界中（玩家移动时预览圈不动）
   */
  setSkillAimPreview(index, dirX, dirY, distRatio, anchorPos) {
    return this._ensureSkillActions().setAimPreview(index, dirX, dirY, distRatio, anchorPos);
  }

  /**
   * 清除技能瞄准预览
   */
  clearSkillAimPreview() {
    return this._ensureSkillActions().clearAimPreview();
  }

  /**
   * 进入 PC 瞄准模式（技能3/4/5、轻功、投掷按下时调用，不直接触发）
   * @param {'skill'|'flight'|'throw'} kind
   * @param {number} [index] - 技能索引（kind==='skill' 时用）
   */
  enterPCAimMode(kind, index = -1) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureSkillActions().enterPCAimMode(kind, index);
  }

  /** 取消 PC 瞄准模式 */
  cancelPCAimMode() {
    return this._ensureSkillActions().cancelPCAimMode();
  }

  /** 兼容入口：瞄准控制器由 SceneSkillActions 拥有。 @private */
  _ensureAimController() {
    return this._ensureSkillActions().ensureController();
  }

  /** 每帧更新 PC 瞄准模式。 */
  updatePCAimMode() {
    return this._ensureSkillActions().updatePCAimMode();
  }

  /**
   * 判断鼠标屏幕坐标是否落在底部功能按钮/技能栏区域
   * @param {number} sx
   * @param {number} sy
   * @returns {boolean}
   */
  _isMouseOverBottomUI(sx, sy) {
    return this._ensureSkillActions().isMouseOverBottomUI(sx, sy);
  }

  /**
   * 渲染技能瞄准预览虚线框（在世界坐标系中,由 render 调用）
   * @param {CanvasRenderingContext2D} ctx
   */
  renderSkillAimPreview(ctx) {
    return this._ensureSkillActions().renderAimPreview(ctx);
  }

  /**
   * 获取玩家当前朝向单位向量（用于触屏按钮无指向时的目标方向）
   * @returns {{x:number, y:number}}
   */
  getPlayerFacingVector() {
    const sprite = this.playerEntity?.getComponent('sprite');
    const dirMap = {
      'up': { x: 0, y: -1 },
      'down': { x: 0, y: 1 },
      'left': { x: -1, y: 0 },
      'right': { x: 1, y: 0 },
      'up-left': { x: -0.707, y: -0.707 },
      'up-right': { x: 0.707, y: -0.707 },
      'down-left': { x: -0.707, y: 0.707 },
      'down-right': { x: 0.707, y: 0.707 },
    };
    return dirMap[sprite?.direction] || { x: 1, y: 0 };
  }

  /** 触屏：按角色朝向发起一次扇形攻击。 */
  attackByFacing() {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().attackByFacing() === true;
  }

  /** 触屏：按指定方向发起扇形攻击。 */
  attackByDirection(dirX, dirY, distRatio) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().attackByDirection(dirX, dirY, distRatio) === true;
  }

  /** PC/触屏/手柄：按当前移动输入跳跃；无方向时原地跳。 */
  jumpByInput() {
    if (this.isPlayerActionLocked()) return false;
    const started = this._ensureCombatActions().jumpByInput() === true;
    if (started) this.onPlayerTutorialAction?.('jump');
    return started;
  }

  /** 按指定方向短距离跳跃。 */
  jumpByDirection(dirX, dirY) {
    if (this.isPlayerActionLocked()) return false;
    const started = this._ensureCombatActions().jumpByDirection(dirX, dirY) === true;
    if (started) this.onPlayerTutorialAction?.('jump');
    return started;
  }

  /** 触屏：按角色朝向施展轻功。 */
  flightByFacing() {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().flightByFacing();
  }

  /** 触屏：按指定方向施展轻功。 */
  flightByDirection(dirX, dirY, distRatio) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().flightByDirection(dirX, dirY, distRatio);
  }

  /** 触屏：按角色朝向投掷武器。 */
  throwByFacing() {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().throwByFacing();
  }

  /** 触屏：按指定方向投掷武器。 */
  throwByDirection(dirX, dirY, distRatio) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().throwByDirection(dirX, dirY, distRatio);
  }

  /** 触屏：激活主动格挡（挡住攻击1秒，冷却8秒）。 */
  activateBlock() {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().activateBlock();
  }

  /** 从快捷栏使用药水。 */
  usePotionFromHotbar(potionType) {
    return this._ensureCombatActions().usePotionFromHotbar(potionType);
  }

  /**
   * 生成等距地图
   */
  /**
   * 相机更新后的后处理钩子（子类可覆盖，如限制相机范围）
   */
  postCameraUpdate() {
    // 默认空实现，子类覆盖
  }

  /** PC 功能按钮（轻功/投掷/格挡/背包）作为一组水平居中。 */
  layoutPCFunctionButtons(width, height) {
    return this._ensurePanelLayout().layoutPCFunctionButtons(width, height);
  }

  /** 窗口大小变化：采用宿主给出的运行时逻辑视口，缺省时回退参考分辨率。 */
  onResize(width, height) {
    const fallback = this.presentationProfile.logicalResolution;
    const nextWidth = Number(width) > 0 ? Math.floor(width) : fallback.width;
    const nextHeight = Number(height) > 0 ? Math.floor(height) : fallback.height;
    return this._ensurePanelLayout().onResize(nextWidth, nextHeight);
  }

  generateIsometricMap() {
    // 创建地图数据（2D数组）
    // 图块类型：0=空, 1=草地, 2=泥土, 3=石头, 4=水, 5=沙地
    this.mapData = [];
    
    for (let y = 0; y < this.mapHeight; y++) {
      const row = [];
      for (let x = 0; x < this.mapWidth; x++) {
        // 生成地形
        let tileType = 1; // 默认草地
        
        // 边缘用石头
        if (x === 0 || y === 0 || x === this.mapWidth - 1 || y === this.mapHeight - 1) {
          tileType = 3;
        }
        // 随机添加一些变化
        else if (Math.random() < 0.1) {
          tileType = 2; // 泥土
        }
        else if (Math.random() < 0.05) {
          tileType = 5; // 沙地
        }
        
        row.push(tileType);
      }
      this.mapData.push(row);
    }
    
    // 设置地图数据到等距渲染器
    if (this.isometricRenderer) {
      this.isometricRenderer.setMapData(this.mapData, null);
    }
    
    console.log('BaseGameScene: 生成等距地图', this.mapWidth, 'x', this.mapHeight);
  }

  /**
   * 创建玩家实体 - 子类可覆盖
   */
  createPlayerEntity(data = {}) {
    if (!this.playerLifecycle) {
      throw new Error('BaseGameScene: player lifecycle is not initialized');
    }
    this.playerEntity = this.playerLifecycle.createOrInherit(data);
    return this.playerEntity;
  }

  /**
   * 绑定UI面板到玩家实体（兼容入口，委托给场景 HUD 组合器）
   */
  bindUIPanelsToPlayer(player = this.playerEntity, options = {}) {
    return this._ensurePanelLayout().bindPlayer(player, options);
  }

  /**
   * 手柄 A 键确认获得物品弹窗的主操作（装备或使用）。
   * A 默认也映射为攻击，因此必须在攻击处理前消费同帧虚拟点击。
   * @returns {boolean} 是否已处理
   * @private
   */
  _handleGainedPopupGamepad() {
    const input = this.inputManager;
    const popup = this.itemGainedPopup;
    if (!input?.isGamepadConnected?.() || !popup?.visible ||
        !input.gamepad?.isButtonPressed(PadButton.A)) {
      return false;
    }

    if (typeof popup.onPrimary !== 'function') return false;
    popup.onPrimary();
    input.markMouseClickHandled();
    return true;
  }

  /** 手柄战斗控制器每帧驱动：产出意图并执行对应操作。 */
  _updateGamepadCombat() {
    return this._ensureCombatActions().updateGamepadCombat();
  }

  /**
   * 更新场景
   */
  update(deltaTime) {
    return this._ensureFramePipeline().run(deltaTime);
  }

  /**
   * 开始场景过渡
   */
  startTransition(mainText = '场景切换中...', subText = '') {
    console.log('BaseGameScene: 开始场景过渡');
    this._transition.start(mainText, subText);
  }

  /** 是否正在过渡（子类与旧代码按此字段判断，保持兼容） */
  get isTransitioning() {
    return this._transition.active;
  }

  /** 当前过渡阶段（子类调试日志会读取） */
  get transitionPhase() {
    return this._transition.active ? this._transition.phase : 'none';
  }

  /** 重置过渡状态（子类换幕重置时用） */
  resetTransition() {
    this._transition.reset();
  }

  /**
   * 更新场景过渡
   */
  updateTransition(deltaTime) {
    this._transition.update(deltaTime);
  }

  /**
   * 渲染场景过渡
   */
  renderTransition(ctx) {
    this._transition.render(ctx, this.logicalWidth, this.logicalHeight);
  }

  /**
   * 处理 UI 点击
   */
  handleUIClick() {
    return this._ensureWorldInteraction().handleUIClick();
  }

  /**
   * 处理Ctrl+鼠标左键轻功
   */
  handleTeleport() {
    return this._ensureWorldInteraction().handleTeleport();
  }
  
  /**
   * 右键点击处理：记录光圈动画，debug 模式下输出坐标日志
   */
  _debugRightClick() {
    return this._ensureWorldInteraction().debugRightClick();
  }

  /**
   * 渲染右键点击光圈（在世界坐标系中调用）
   */
  _renderClickRings(ctx) {
    return this._ensureWorldInteraction().renderClickRings(ctx);
  }

  /**
   * 渲染鼠标点击屏幕标记（debug 模式，在屏幕坐标系中调用）
   */
  _renderClickScreenMarkers(ctx) {
    return this._ensureWorldInteraction().renderClickScreenMarkers(ctx);
  }

  /** 处理武器投掷。 */
  handleWeaponThrow() {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().handleWeaponThrow();
  }


  handleEnemySelection() {
    return this._ensureWorldInteraction().handleEnemySelection();
  }

  /** 处理自动攻击（鼠标移动时）。 */
  handleAutoAttack(currentTime) {
    if (this.isPlayerActionLocked()) return false;
    return this._ensureCombatActions().handleAutoAttack(currentTime);
  }

  /**
   * 检查空格键继续对话
   */
  checkDialogueContinue() {
    return this._ensureDialogueFlow().checkContinue();
  }

  /** 背包打开时让 DOM 触屏控件让位。 */
  _syncTouchControlsForBackpack() {
    return this._ensurePanelLayout().syncTouchControlsForBackpack();
  }

  /** 更新面板悬停状态（委托给 UISystem）。 */
  updatePanelHover() {
    return this._ensurePanelLayout().updatePanelHover();
  }

  /**
   * 移除死亡实体
   */
  /**
   * 移除死亡实体（委托给 EntityLifecycleSystem）
   */
  removeDeadEntities() {
    const removed = this.entityLifecycleSystem.removeDeadEntities(this.entities);
    this.entityStore.removeMany(removed);
    return removed;
  }

  /** 切换调试面板显示/隐藏（触发器动作 toggleDebug）。 */
  _toggleDebugPanel() {
    return this._diagnostics.toggleDebugPanel();
  }

  /**
   * 屏幕居中提示（触发器 showTip 动作用）：优先复用原版提示面板 window.__ddShowTips，
   * 约 3.5 秒后自动隐藏；不可用时回退简易黑框。
   * @param {string} text
   * @param {Object} [opts] - { persist:true 不自动隐藏（供倒计时/提示切幕每帧刷新用） }
   */
  _showScreenTip(text, opts = {}) {
    return this._hintPresenter?.showScreen(text, opts);
  }

  /** 隐藏提示面板；指定 owner 时不会误删其他系统刚覆盖的提示。 */
  _hideScreenTip(owner = null) {
    return this._hintPresenter?.hideScreen(owner);
  }

  /**
   * 获取游戏状态
   */
  getGameState() {
    const state = this._gameStateView || (this._gameStateView = {});
    state.tutorialPhase = this.tutorialPhase;
    state.pickupItems = this.pickupItems;
    return state;
  }


  /** 渲染场景。 */
  render(ctx) {
    return this._ensureRenderPipeline().render(ctx);
  }

  /** 渲染世界对象（实体等）- 子类可覆盖以添加自定义渲染顺序。 */
  renderWorldObjects(ctx) {
    return this._ensureRenderPipeline().renderWorldObjects(ctx);
  }

  /** 渲染战斗状态 UI。 */
  renderCombatStateUI(ctx) {
    return this._ensureRenderPipeline().renderCombatStateUI(ctx);
  }

  /**
   * 迷雾/全屏效果层钩子（世界渲染之后、UI 面板之前）
   * 子类覆盖以插入迷雾、天气等全屏半透明效果
   */
  renderFogLayer(ctx) {
    // 默认空实现
  }

  /**
   * 气泡对话渲染（子类可覆盖）
   */
  renderSpeechBubbles(ctx) {
    // 默认空实现
  }

  /**
   * 渲染背景 - 子类覆盖
   */
  renderBackground(ctx) {
    return this._ensureWorldPresentation().renderBackground(ctx);
  }

  // ─── 编辑器场景地形 ───────────────────────────────────────

  /** 从已加载的 terrain 场景数据中收集 buffZone 对象。 */
  _collectBuffZones() {
    return this._terrainBinding.collectBuffZones();
  }

  /** 渲染可见的 Buff 多边形区域。 */
  _renderBuffZones(ctx) {
    return this._terrainBinding.renderBuffZones(ctx);
  }

  /** 初始化编辑器场景地形；子类可覆写为空以自行管理 terrain。 */
  _initEditorTerrain() {
    this._terrainConfig.sceneId = this.editorSceneId;
    return this._terrainBinding.initEditorTerrain({
      ...this._terrainConfig,
      centerX: this.logicalWidth / 2,
      centerY: this.logicalHeight / 2,
      width: this.logicalWidth,
      height: this.logicalHeight
    });
  }

  /** 从场景数据中加载特效区域，接入粒子系统。 */
  _initEffectZones(sceneId, worldOffset = this._terrainConfig.worldOffset) {
    return this._terrainBinding.initEffectZones({ sceneId, worldOffset, resourceScope: this.resourceScope });
  }

  /** 检查单 terrain 场景的地形碰撞；子类可覆写以扩展。 */
  checkTerrainCollision() {
    return this._terrainBinding.checkTerrainCollision();
  }

  /** 处理 PC 左键点击地上物品的拾取。 */
  handlePickupClick() {
    return this._ensureWorldInteraction().handlePickupClick();
  }

  /** 移动端、手柄适配器和脚本统一交互入口。 */
  enqueueInteract(device = 'virtual') {
    return this.sceneRuntime?.inputRouter?.enqueueInteract?.(device) || null;
  }

  /** 从玩家附近选择最近资源节点并开始一次采集会话。 */
  resolvePlayerDefeatResolution() {
    return { type: 'normalDeath' };
  }

  resolvePlayerRespawnPosition() {
    return null;
  }

  onPlayerDefeatResolved(result = {}) {
    const position = result.respawnPosition;
    const location = position?.label || (Number.isFinite(position?.x) && Number.isFinite(position?.y)
      ? `安全点（${Math.round(position.x)}, ${Math.round(position.y)}）`
      : '安全点');
    if (result.type === 'specialFaint') {
      this._showScreenTip(`你被救回并在${location}醒来，没有遗失物资`);
      return;
    }
    const lost = (result.stacks || []).reduce((sum, stack) => sum + stack.quantity, 0);
    this._showScreenTip(lost > 0
      ? `死亡后遗失 ${lost} 份资源，已在${location}复苏，可返回原地拾取`
      : `你在${location}重新醒来，没有遗失资源`);
  }

  isPlayerActionLocked() {
    return this.gatheringSystem?.isActiveFor?.(this.playerEntity) === true;
  }

  harvestByFacing({ silent = false } = {}) {
    if (!this.playerEntity || !this.gatheringSystem) return false;
    const playerPosition = this.playerEntity.getComponent('transform')?.position;
    if (!playerPosition) return false;
    const candidates = (this.entities || [])
      .filter(entity => entity?.getComponent?.('resourceNode'))
      .map(entity => {
        const position = entity.getComponent('transform')?.position;
        return { entity, distance: position ? Math.hypot(position.x - playerPosition.x, position.y - playerPosition.y) : Infinity };
      })
      .sort((left, right) => left.distance - right.distance);
    const result = this.gatheringSystem.start({ player: this.playerEntity, nodeEntity: candidates[0]?.entity });
    if (!result.ok && !silent) {
      const messages = {
        gatheringBusy: '正在采集中', nodeDepleted: '资源节点已经耗尽',
        outOfRange: '附近没有可采集资源', toolRequired: '需要可用的采集工具', invalidTarget: '附近没有可采集资源'
      };
      this._showScreenTip(messages[result.code] || '暂时无法采集');
    }
    return result.ok;
  }

  onGatheringEvent(event, data = {}) {
    if (event === 'started' || event === 'progress') {
      const percent = Math.max(0, Math.min(100, Math.floor((Number(data.progress) || 0) * 100)));
      if (event === 'progress' && this._lastGatheringProgressPercent === percent) return;
      this._lastGatheringProgressPercent = percent;
      const capacity = Number.isFinite(data.capacity) ? data.capacity : 0;
      const expected = Number.isFinite(data.expectedYield) ? data.expectedYield : 0;
      const tool = data.toolDurability == null
        ? '无需工具'
        : `工具 ${data.toolDurability}/${data.toolMaxDurability}`;
      this._hintPresenter?.showScreen?.(
        `采集中 ${percent}% · 预计获得 ${expected} · 背包可收 ${capacity} · ${tool} · {interact}取消`,
        { title: '采集', persist: true, owner: 'gathering' }
      );
      return;
    }

    this._lastGatheringProgressPercent = null;
    this._hintPresenter?.hideScreen?.('gathering');
    if (event === 'riskTriggered') {
      this._showScreenTip(data.message || '采集产生了意外动静', { title: '采集风险' });
      return;
    }
    if (event === 'completed') {
      this._showScreenTip(data.toolBroken ? `获得资源 ×${data.accepted}，工具已损毁` : `获得资源 ×${data.accepted}`);
      return;
    }
    if (event !== 'interrupted') return;
    const messages = {
      moved: '位置变化导致采集中断',
      damaged: data.accepted > 0 ? `受伤中断，获得资源 ×${data.accepted}` : '受伤导致采集中断',
      cancelled: '已取消采集',
      inventoryFull: '背包已满，采集未结算',
      insufficientCapacity: '背包容量不足，采集未结算'
    };
    this._showScreenTip(messages[data.code || data.reason] || '采集已中断');
  }

  /** 左键点击地上物品的拾取检测。 */
  tryClickPickup(worldX, worldY) {
    return this._ensureWorldInteraction().tryClickPickup(worldX, worldY);
  }

  /**
   * 渲染可拾取物品
   */
  renderPickupItems(ctx) {
    return this._ensureWorldPresentation().renderPickupItems(ctx);
  }

  _ensureEntityRenderer() {
    if (!this.entityRenderer2D) {
      this.entityRenderer2D = new EntityRenderer2D(this.assetManager, getNpcRenderStyle);
    }
    return this.entityRenderer2D;
  }

  /**
   * 渲染单个实体
   */
  renderEntity(ctx, entity) {
    this._ensureEntityRenderer().render(ctx, entity);
  }

  /**
   * 设置场景提示回调
   * @param {Function} showCallback - 显示提示回调 (text, title) => void
   * @param {Function} hideCallback - 隐藏提示回调 () => void
   */
  setHintCallbacks(showCallback, hideCallback) {
    return this._hintPresenter?.setCallbacks(showCallback, hideCallback);
  }

  /**
   * 显示场景提示（通过回调，支持HTML和.key样式）
   * @param {string} text - 提示文本（支持HTML，如 <span class="key">N</span>）
   * @param {string} title - 提示标题，默认'提示'
   */
  showHint(text, title = '提示') {
    return this._hintPresenter?.showHint(text, title);
  }

  /**
   * 隐藏场景提示
   */
  hideHint() {
    return this._hintPresenter?.hideHint();
  }

  /** 设置 draw-call 计数代理。 */
  _setupDrawCallCounter(ctx) {
    return this._diagnostics.setupDrawCallCounter(ctx);
  }

  /** 恢复 Canvas 原绘制方法。 */
  _teardownDrawCallCounter() {
    return this._diagnostics.teardownDrawCallCounter();
  }

  /** 估算已加载纹理和离屏缓存占用。 */
  _estimateTextureMemory() {
    return this._diagnostics.estimateTextureMemory();
  }

  /**
   * 场景退出
   */
  exit() {
    super.exit();
    const coordinator = this._lifecycleCoordinator;
    if (coordinator && coordinator.state === 'idle') {
      coordinator.track('scene-resources', this, () => this._disposeSceneResources(), 100);
      coordinator.exitSync();
      return;
    }
    this._disposeSceneResources();
  }

  /** @private 由 SceneLifecycleCoordinator 拥有的同步场景资源释放事务。 */
  _disposeSceneResources() {
    // 首先令所有 guard/token 失效，并清除场景计时器、监听和自定义 disposer。
    this.resourceScope?.dispose();
    this.context.lifecycle.state = 'exiting';

    // 清掉背包让位用的 body class，避免切场景后触屏控件仍是半透明不可点
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('backpack-open');
    }
    this._touchControlsDimmed = false;

    // 恢复 Canvas 代理并销毁 DOM 调试面板，保留原有诊断日志。
    this._diagnostics.dispose();

    // 运行时先撤销阶段钩子和输入路由，再销毁底层输入/系统实例。
    this._inputFlow?.dispose();
    this._inputFlow = null;
    this._sceneTriggerBindings?.dispose();
    this._sceneTriggerBindings = null;
    this.sceneRuntime?.dispose();
    this.sceneRuntime = null;

    if (this.inputManager) {
      this.inputManager.destroy();
    }

    // 先解除玩家与玩法系统/UI 的接线，再销毁 combat/movement 等底层系统。
    this.playerLifecycle?.dispose();
    this._gameplaySystemAssembler.dispose();

    this.tutorialSystem.cleanup();
    this.dialogueSystem?.reset?.();
    this.questSystem?.cleanup?.();
    this.particleSystem.clear?.();

    // 释放小地图缓存
    if (this.minimap) {
      this.minimap.dispose();
    }

    this._skillActions?.reset();
    this._worldInteraction?.reset();
    this.entityStore.destroyAll();
    this.context.resetTransient();
    this.playerLifecycle = null;
    this._lifecycleCoordinator = null;
    this._inputBindings = null;
    this._inventoryFlow = null;
    this._hudUpdater = null;
    this._equipmentFlow = null;
    this._itemGainedFlow = null;
    this._aimPresentation = null;
    this._combatActions = null;
    this._dialogueFlow = null;
    this._worldInteraction = null;
    this._skillActions = null;
    this._worldPresentation = null;
    this._panelLayout = null;
    this._hintPresenter = null;
    this.resourceScope = null;
    this.inputManager = null;
    this.playerEntity = null;

    console.log(`BaseGameScene: 退出场景 ${this.name}`);
  }
}

export default BaseGameScene;
