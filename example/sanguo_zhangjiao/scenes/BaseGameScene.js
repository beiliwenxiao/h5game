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
const ZONE_STAT_SHORT = Object.freeze({ hp: 'HP', mp: 'MP', attack: 'ATK', defense: 'DEF', speed: 'SPD' });

export class BaseGameScene extends Scene {
  constructor(sceneData = {}) {
    super(sceneData.name || 'DataDrivenPrologueScene');
    this.isPaused = false;
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
    this._inputBindings = null;
    this._hintPresenter = null;
    
    // 逻辑尺寸（用于渲染计算，不受 devicePixelRatio 影响）
    this.logicalWidth = 800;
    this.logicalHeight = 600;
    
    // 调试模式（开启后显示坐标标记和日志）
    this.debugMode = false;

    // 编辑器场景渲染器（通用，默认使用数据驱动序章区块）
    this.terrain = null;
    this.editorSceneId = sceneData.editorSceneId || 's0-1';
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
  }

  setSceneManager(sceneManager) {
    this.sceneManager = sceneManager;
  }

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

    // 用实际 canvas 尺寸覆盖默认逻辑尺寸
    if (canvas.width > 0 && canvas.height > 0) {
      this.logicalWidth = canvas.width;
      this.logicalHeight = canvas.height;
    }
    this.context.runtime.width = this.logicalWidth;
    this.context.runtime.height = this.logicalHeight;

    // 初始化统一渲染器（包含 Camera）
    this.isometricRenderer = new IsometricRenderer(ctx, {
      tileWidth: 64,
      tileHeight: 32,
      width: this.logicalWidth,
      height: this.logicalHeight,
      assetManager: this.assetManager || null,
      debug: false,
      showGrid: false,  // 关闭网格线
      gridSize: this.mapWidth
    });
    this.context.presentation.renderer = this.isometricRenderer;

    // 从渲染器获取相机
    this.camera = this.isometricRenderer.getCamera();
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
    this.context.lifecycle.coordinator = this.playerLifecycle;
    this.playerEntity = this.playerLifecycle.createOrInherit(data || {}, {
      onInherited: (player) => console.log('BaseGameScene: 继承玩家实体', player),
      onCreated: () => console.log('BaseGameScene: 创建新玩家实体')
    });

    console.log(`BaseGameScene: 进入场景 ${this.name}`);

    this.playerLifecycle.configureCleanup();

    // 将交互服务登记到显式 Context；帧/渲染管线可直接调度，Base 方法仅兼容旧调用方。
    Object.assign(this.context.services, {
      dialogue: this._ensureDialogueFlow(),
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
    // 仅右键点击（PC）或移动端左键点击才卸下装备
    if (button !== 'right' && !this.isMobileLayout) return;
    if (!this.playerEntity) return;

    // 卸下执行（含背包满则撤销）交给框架的 SceneEquipmentFlow
    const result = this._ensureEquipmentFlow().unequip(this.playerEntity, slotType);
    if (!result.ok) {
      if (result.reason === 'inventoryFull' && this.notificationSystem) {
        this.notificationSystem.addWarning('背包已满，无法卸下装备');
      }
      return;
    }

    const removed = result.oldItem;
    const transform = this.playerEntity.getComponent('transform');
    if (transform) {
      this.floatingTextManager.addText(
        transform.position.x,
        transform.position.y - 30,
        `卸下 ${removed.name}`,
        '#ffff00'
      );
    }

    this._refreshEquipmentPanels(this.playerEntity);
    // 走统一出口，让 equipItem 事件源也能感知卸下（触发器可据此判断"武器已卸下"）
    this.onEquipmentChanged([`卸下了 ${removed.name}`], {
      slot: slotType, item: null, oldItem: removed, action: 'unequip'
    });
  }

  /**
   * 初始化 UI 面板（兼容入口，委托给场景 HUD 组合器）
   */
  initializeUIPanels() {
    return this._ensurePanelLayout().composeHud();
  }

  /** 加载并应用 UI 编辑器布局（Canvas 面板部分）。 */
  async _applyUILayout() {
    return this._ensurePanelLayout().applyUILayout();
  }

  /**
   * 物品使用回调
   */
  onItemUsed(item, healAmount, manaAmount) {
    if (this.playerEntity) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform) {
        if (healAmount > 0) {
          this.floatingTextManager.addHeal(transform.position.x, transform.position.y - 30, healAmount);
        }
        if (manaAmount > 0) {
          this.floatingTextManager.addManaRestore(transform.position.x, transform.position.y - 50, manaAmount);
        }
      }
    }
    // 数据驱动事件源：物品被使用 → fire('itemUsed',{id}) 供触发器响应（如铜钱剑推进剧情）
    if (this.gameLoader && this.gameLoader.triggerSystem && item) {
      this.gameLoader.triggerSystem.fire('itemUsed', { id: item.id, item });
    }
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
    return this._ensureItemGainedFlow().onItemGained(item, player);
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
    return this._ensureSkillActions().onSkillClicked(skill);
  }

  /** @private 懒创建场景渲染编排器。 */
  _ensureRenderPipeline() {
    if (!this._renderPipeline) this._renderPipeline = new SceneRenderPipeline(this);
    return this._renderPipeline;
  }

  /** @private 懒创建场景帧更新管线。 */
  _ensureFramePipeline() {
    if (!this._framePipeline) this._framePipeline = new SceneFramePipeline(this);
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
    return this._ensureSkillActions().useSkillByIndex(index);
  }

  /** 按指定方向和距离比例释放技能（触屏摇杆瞄准后释放） */
  useSkillByDirection(index, dirX, dirY, distRatio, targetWorldPos) {
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
    return this._ensureCombatActions().attackByFacing();
  }

  /** 触屏：按指定方向发起扇形攻击。 */
  attackByDirection(dirX, dirY, distRatio) {
    return this._ensureCombatActions().attackByDirection(dirX, dirY, distRatio);
  }

  /** 触屏：按角色朝向施展轻功。 */
  flightByFacing() {
    return this._ensureCombatActions().flightByFacing();
  }

  /** 触屏：按指定方向施展轻功。 */
  flightByDirection(dirX, dirY, distRatio) {
    return this._ensureCombatActions().flightByDirection(dirX, dirY, distRatio);
  }

  /** 触屏：按角色朝向投掷武器。 */
  throwByFacing() {
    return this._ensureCombatActions().throwByFacing();
  }

  /** 触屏：按指定方向投掷武器。 */
  throwByDirection(dirX, dirY, distRatio) {
    return this._ensureCombatActions().throwByDirection(dirX, dirY, distRatio);
  }

  /** 触屏：激活主动格挡（挡住攻击1秒，冷却8秒）。 */
  activateBlock() {
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

  /** 窗口大小变化时更新逻辑尺寸和相关系统。 */
  onResize(width, height) {
    return this._ensurePanelLayout().onResize(width, height);
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
    return this._ensureCombatActions().handleWeaponThrow();
  }


  handleEnemySelection() {
    return this._ensureWorldInteraction().handleEnemySelection();
  }

  /** 处理自动攻击（鼠标移动时）。 */
  handleAutoAttack(currentTime) {
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

  /** 隐藏提示面板 */
  _hideScreenTip() {
    return this._hintPresenter?.hideScreen();
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
    return this._terrainBinding.initEffectZones({ sceneId, worldOffset });
  }

  /** 检查单 terrain 场景的地形碰撞；子类可覆写以扩展。 */
  checkTerrainCollision() {
    return this._terrainBinding.checkTerrainCollision();
  }

  /** 处理 PC 左键点击地上物品的拾取。 */
  handlePickupClick() {
    return this._ensureWorldInteraction().handlePickupClick();
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
    this._inputBindings = null;
    this._hintPresenter = null;
    this.resourceScope = null;
    this.playerEntity = null;

    console.log(`BaseGameScene: 退出场景 ${this.name}`);
  }
}

export default BaseGameScene;
