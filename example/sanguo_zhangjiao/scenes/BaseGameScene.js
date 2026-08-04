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
import { ItemSpriteRenderer } from '../../../src/rendering/ItemSpriteRenderer.js';
import { SceneTerrainBinding } from '../../../src/core/scene/SceneTerrainBinding.js';
import { SceneTerrainCollision } from '../../../src/core/scene/SceneTerrainCollision.js';
import { SceneAimController } from '../../../src/core/scene/SceneAimController.js';
import { ClickFeedbackRenderer } from '../../../src/rendering/ClickFeedbackRenderer.js';
import { SceneEquipmentFlow } from '../../../src/core/scene/SceneEquipmentFlow.js';
import { SceneTransitionFlow } from '../../../src/core/scene/SceneTransitionFlow.js';
import { SceneCombatActions } from '../../../src/core/scene/SceneCombatActions.js';
import { ScenePanelLayout } from '../../../src/core/scene/ScenePanelLayout.js';
import { SceneRenderPipeline } from '../../../src/core/scene/SceneRenderPipeline.js';
import { SceneFramePipeline } from '../../../src/core/scene/SceneFramePipeline.js';
import { GameSceneRuntime } from '../../../src/core/scene/GameSceneRuntime.js';
import { SceneItemGainedFlow } from '../../../src/core/scene/SceneItemGainedFlow.js';
import { SceneGameLoaderBridge } from '../../../src/core/scene/SceneGameLoaderBridge.js';
import { SceneAimPresentation } from '../../../src/core/scene/SceneAimPresentation.js';
import { SceneGameplaySystemAssembler } from '../../../src/core/scene/SceneGameplaySystemAssembler.js';
import { Scene1Terrain } from './Scene1Terrain.js';
import { DebugPanel } from '../../../src/ui/DebugPanel.js';
import { ParticleSystem } from '../../../src/rendering/ParticleSystem.js';
import { EffectZoneRenderer } from '../../../src/rendering/EffectZoneRenderer.js';
import { EntityLifecycleSystem } from '../../../src/systems/EntityLifecycleSystem.js';
import { Entity } from '../../../src/ecs/Entity.js';
import { TransformComponent } from '../../../src/ecs/components/TransformComponent.js';
import { SpriteComponent } from '../../../src/ecs/components/SpriteComponent.js';
import { NameComponent } from '../../../src/ecs/components/NameComponent.js';
import { PerformanceOptimizer } from '../../../src/systems/PerformanceOptimizer.js';
import { PerformanceMonitor } from '../../../src/core/PerformanceMonitor.js';
import { UISystem } from '../../../src/ui/UISystem.js';
import { PortraitsConfig } from '../data/PortraitsConfig.js';
import { SelectedCharacterStore } from '../data/SelectedCharacterStore.js';
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
    
    // ECS 核心
    this.entityFactory = new EntityFactory();
    this.entities = [];
    
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

    // 调试面板（触发器动作 toggleDebug 启用/停用）
    this.debugPanel = null;
    
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
    
    // 性能优化系统
    this.performanceOptimizer = new PerformanceOptimizer({
      cellSize: 128,
      spatialGrid: true,
      batching: true,
      pooling: true,
      lod: true
    });
    this.performanceMonitor = new PerformanceMonitor({
      enabled: false,  // 默认关闭，按P键开启
      showGraph: false
    });
    
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
    
    // 敌人实体
    this.enemyEntities = [];
    
    // 可拾取物品
    this.pickupItems = [];
    this.equipmentItems = [];
    
    // 教程状态
    this.tutorialPhase = 'init';
    
    // 面板切换冷却时间
    this.lastPlayerInfoToggleTime = 0;
    this.lastInventoryToggleTime = 0;
    this.lastPickupTime = 0;
    this.lastPerformanceToggleTime = 0;
    
    // 对话控制标志
    this.lastSpacePressed = false;
    
    // 技能瞄准预览（手机拖拽技能时显示落点虚线框）
    this.skillAimPreview = null; // { skill, targetX, targetY, startX, startY, inRange, color } 或 null
    // 平滑过渡用的显示位置（lerp）
    this._aimDisplayX = 0;
    this._aimDisplayY = 0;
    this._aimLerpSpeed = 0.15; // 每帧趋近比例（0~1，越大越快）
    // 瞄准参数缓存（每帧刷新用）
    this._aimDirX = 0;
    this._aimDirY = 0;
    this._aimDistRatio = 0;
    this._aimSkillIndex = -1;

    // PC 瞄准模式由框架的 SceneAimController 管理（懒创建于 _ensureAimController）
    this._aimController = null;
    
    // 世界与 HUD 渲染顺序交由核心渲染管线协调
    this._renderPipeline = null;

    // 每帧更新顺序交由核心帧管线协调
    this._framePipeline = null;
    // 生命周期、阶段钩子与 disposer 由通用运行时管理；旧系统链仍由帧管线保持原顺序。
    this.sceneRuntime = null;
    this._itemGainedFlow = null;
    this._gameLoaderBridge = null;
    this._aimPresentation = null;

    // 场景 UI 布局协调器按需创建，集中处理配置加载、缩放与 Canvas/DOM 层级联动
    this._panelLayout = null;

    // 场景战斗动作服务按需创建，统一承接多输入方案的战斗/拾取操作
    this._combatActions = null;

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
    
    // 获取 canvas
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('BaseGameScene: Canvas not found');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // 用实际 canvas 尺寸覆盖默认逻辑尺寸
    if (canvas.width > 0 && canvas.height > 0) {
      this.logicalWidth = canvas.width;
      this.logicalHeight = canvas.height;
    }
    
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
    
    // 从渲染器获取相机
    this.camera = this.isometricRenderer.getCamera();
    
    // 生成等距地图
    this.generateIsometricMap();

    // 初始化编辑器场景地形（所有幕通用，如果编辑器有该场景数据就加载渲染）
    this._initEditorTerrain();
    
    // 初始化输入管理器
    this.inputManager = new InputManager(canvas);
    // 操作提示按当前输入方案（键鼠 / 触屏 / 手柄）取文案，手柄接上会自动切换
    InputHints.setInputManager(this.inputManager);
    // 运行时先仅管理生命周期、阶段和 disposer；旧帧管线仍保留既有系统调用顺序。
    this._initializeSceneRuntime();
    
    // 通用玩法系统按原顺序创建，并继续投影到场景字段供帧管线使用。
    this._gameplaySystemAssembler.initialize({
      zoneCallbacks: this._createZoneEffectCallbacks()
    });
    
    // 初始化 UI 面板
    this.initializeUIPanels();
    
    // 创建或继承玩家实体
    // 如果data中有playerEntity，则使用传入的实体（场景切换时）
    // 否则创建新的玩家实体
    if (data && data.playerEntity) {
      this.playerEntity = data.playerEntity;
      this.entities.push(this.playerEntity);
      console.log(`BaseGameScene: 继承玩家实体`, this.playerEntity);
      
      // 重新绑定UI面板到继承的玩家实体
      this.bindUIPanelsToPlayer();
    } else {
      this.createPlayerEntity();
      console.log(`BaseGameScene: 创建新玩家实体`);
    }
    
    console.log(`BaseGameScene: 进入场景 ${this.name}`);
    
    // 配置实体生命周期系统
    this.entityLifecycleSystem.protect(this.playerEntity);
    this.entityLifecycleSystem.trackList(this.enemyEntities);
    this.entityLifecycleSystem.setOnBeforeRemove((entity) => {
      // 处理武器钉住状态
      if (entity.pinnedByWeapon && this.weaponRenderer) {
        entity.pinnedByWeapon = false;
        if (this.weaponRenderer.thrownWeapon.targetEntity === entity) {
          this.weaponRenderer.thrownWeapon.targetEntity = null;
        }
      }
    });
    
    // 注册快捷键
    this.registerHotkeys();
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
        setTimeout(() => this._hideScreenTip(), 2500);
      },
      onLeaveZone: (entity, zone) => {
        if (entity !== this.playerEntity) return;
        this._showScreenTip(`离开区域：${zone.name || 'Buff区域'}`);
        setTimeout(() => this._hideScreenTip(), 1500);
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
   * 注册通用快捷键
   */
  registerHotkeys() {
    // C / B / V 均兼容地开关唯一的组合背包。
    const toggleBackpack = () => this.backpackPanel?.toggle();
    this.inputManager.registerHotkey('toggle_playerinfo', ['c', 'C'], toggleBackpack, { cooldown: 300 });
    this.inputManager.registerHotkey('toggle_inventory', ['b', 'B'], toggleBackpack, { cooldown: 300 });
    this.inputManager.registerHotkey('toggle_equipment', ['v', 'V'], toggleBackpack, { cooldown: 300 });
    
    // 性能监控切换 (P)
    this.inputManager.registerHotkey('toggle_performance', ['p', 'P'], () => {
      this.performanceMonitor.toggle();
      console.log('性能监控:', this.performanceMonitor.enabled ? '开启' : '关闭');
    }, { cooldown: 300 });

    // 手柄映射面板不占用键盘热键，改由调试面板（反引号打开）的「🎮 Xbox 360 按键图」按钮切换。

    // 手柄连接时提示 + 轻微震动反馈；Guide(Xbox) 键切换手柄面板
    if (this.inputManager.gamepad) {
      const gp = this.inputManager.gamepad;
      gp.onConnect((info) => {
        if (this.notificationSystem) {
          this.notificationSystem.addNotification(
            `${info.isXbox ? 'Xbox 手柄' : '手柄'}已连接（调试面板可查看按键）`, 'success');
        }
        this.inputManager.vibrate(180, 0.5, 0.3);
      });
      gp.onDisconnect(() => {
        if (this.notificationSystem) this.notificationSystem.addNotification('手柄已断开', 'info');
      });
    }
  }

  /**
   * 加载编辑器保存的手柄绑定配置（config/gamepad.json）。
   * 文件不存在或加载失败时静默使用 Xbox360Profile 的默认绑定。
   * @private
   */
  _loadGamepadConfig() {
    if (!this.inputManager || !this.inputManager.gamepad) return;
    fetch('config/gamepad.json')
      .then(res => res.ok ? res.json() : null)
      .then(cfg => {
        if (cfg) {
          this.inputManager.gamepad.applyConfig(cfg);
          console.log('BaseGameScene: 已加载手柄绑定配置 config/gamepad.json');
        }
      })
      .catch(() => { /* 无配置文件，用默认绑定 */ });
  }

  /**
   * 加载火焰图片
   */
  loadFireImage() {
    if (!this.campfire) return;
    this.campfire.fireImage = new Image();
    this.campfire.fireImage.onload = () => {
      this.campfire.imageLoaded = true;
      console.log('BaseGameScene: 火焰图片加载成功');
    };
    this.campfire.fireImage.onerror = () => {
      console.warn('BaseGameScene: 火焰图片加载失败');
      this.campfire.imageLoaded = false;
    };
    this.campfire.fireImage.src = 'assets/images/fire.webp';
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

  /** 加载面板编辑器的布局配置并应用到各面板。 */
  async _applyPanelLayout() {
    return this._ensurePanelLayout().applyPanelLayout();
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

  /** @private 生成属性变化文本（涨用+、跌用-） */
  _statChangeText(oldStats, newStats) {
    return SceneEquipmentFlow.statChangeText(oldStats, newStats);
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
    console.log('BaseGameScene: 技能点击', skill);
    
    if (!this.playerEntity || !this.combatSystem) return;
    
    // 特殊处理：打坐技能
    if (skill.id === 'meditation') {
      // 检查是否在战斗中
      if (this.combatSystem.isInCombat()) {
        if (this.floatingTextManager) {
          const transform = this.playerEntity.getComponent('transform');
          if (transform) {
            this.floatingTextManager.addText(
              transform.position.x,
              transform.position.y - 50,
              '战斗中无法打坐',
              '#ff6666'
            );
          }
        }
        return;
      }
      
      // 切换打坐状态
      if (this.meditationSystem.isActive()) {
        this.meditationSystem.stop();
      } else {
        this.meditationSystem.start(this.playerEntity);
      }
      return;
    }
    
    // 特殊处理：治疗技能（自己释放）
    if (skill.id === 'heal') {
      const combat = this.playerEntity.getComponent('combat');
      const currentTime = performance.now();
      
      if (combat && combat.canUseSkill(skill.id, currentTime)) {
        this.combatSystem.tryUseSkillAtPosition(
          this.playerEntity,
          skill,
          this.playerEntity.getComponent('transform').position,
          currentTime,
          this.entities
        );
      }
      return;
    }
    
    // 其他技能（有方向/落点）：PC 上按下先进入瞄准模式（鼠标变瞄准圈），左键确认或取消
    if (!this.isMobileLayout) {
      const combat = this.playerEntity.getComponent('combat');
      if (combat && combat.skills) {
        // 用 findIndex 按 id 匹配，避免引用不等导致 indexOf 失败
        const idx = combat.skills.findIndex(s => s && s.id === skill.id);
        if (idx >= 0) {
          this.enterPCAimMode('skill', idx);
          return;
        }
      }
    }

    // 其它情况（如移动端）：使用鼠标位置作为目标立即释放
    const mouseWorldPos = this.inputManager.getMouseWorldPosition(this.camera);
    const currentTime = performance.now();
    
    this.combatSystem.tryUseSkillAtPosition(
      this.playerEntity,
      skill,
      mouseWorldPos,
      currentTime,
      this.entities
    );
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

  /** 返回当前场景运行时；enter 前调用时保持惰性且不自动改变帧行为。 */
  _ensureSceneRuntime() {
    if (!this.sceneRuntime) {
      this.sceneRuntime = new GameSceneRuntime({ inputManager: this.inputManager, camera: this.camera });
      this.sceneRuntime.provide({ scene: this });
      if (this.isActive) this.sceneRuntime.enter();
    }
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

  /** @private 懒创建数据驱动 GameLoader 场景桥接。 */
  _ensureGameLoaderBridge() {
    if (!this._gameLoaderBridge) this._gameLoaderBridge = new SceneGameLoaderBridge(this);
    return this._gameLoaderBridge;
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

  /** 检查技能是否可用（蓝量/冷却），不足则飘字提示 */
  checkSkillUsable(skill) {
    return this._ensureCombatActions().checkSkillUsable(skill);
  }

  /** 按技能索引释放技能（用于触屏/虚拟按钮，无鼠标指向时按角色朝向放） */
  useSkillByIndex(index) {
    return this._ensureCombatActions().useSkillByIndex(index);
  }

  /** 按指定方向和距离比例释放技能（触屏摇杆瞄准后释放） */
  useSkillByDirection(index, dirX, dirY, distRatio, targetWorldPos) {
    return this._ensureCombatActions().useSkillByDirection(index, dirX, dirY, distRatio, targetWorldPos);
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
    const presentation = this._ensureAimPresentation();
    this.skillAimPreview = presentation.set(index, dirX, dirY, distRatio, anchorPos);
    this._aimDirX = presentation.directionX;
    this._aimDirY = presentation.directionY;
    this._aimDistRatio = presentation.distanceRatio;
    if (this.skillAimPreview && this._aimDisplayX === 0 && this._aimDisplayY === 0) {
      this._aimDisplayX = this.skillAimPreview.targetX;
      this._aimDisplayY = this.skillAimPreview.targetY;
    }
    return this.skillAimPreview;
  }

  /**
   * 清除技能瞄准预览
   */
  clearSkillAimPreview() {
    this._aimPresentation?.clear();
    this.skillAimPreview = null;
    this._aimDisplayX = 0;
    this._aimDisplayY = 0;
    this._lastAimWorldX = 0;
    this._lastAimWorldY = 0;
    // 延迟解锁攻击方向,确保当前帧 performSectorAttack 的方向不被覆盖
    if (this.meleeAttackSystem) {
      setTimeout(() => {
        if (this.meleeAttackSystem) {
          this.meleeAttackSystem.sectorDirectionLocked = false;
        }
      }, 50);
    }
  }

  /**
   * 进入 PC 瞄准模式（技能3/4/5、轻功、投掷按下时调用，不直接触发）
   * @param {'skill'|'flight'|'throw'} kind
   * @param {number} [index] - 技能索引（kind==='skill' 时用）
   */
  enterPCAimMode(kind, index = -1) {
    if (this.isMobileLayout) return; // 仅 PC
    if (!this.playerEntity) return;
    // 技能：进入瞄准前先校验冷却/蓝量，不可用则不进入
    if (kind === 'skill') {
      const combat = this.playerEntity.getComponent('combat');
      const skill = combat && combat.skills ? combat.skills[index] : null;
      if (!skill) { console.log('[PCAim] 技能不存在, index=', index); return; }
      if (!this.checkSkillUsable(skill)) { console.log('[PCAim] 技能不可用(冷却/蓝量):', skill.id); return; }
    } else if (kind === 'flight') {
      if (this.flightSystem && this.flightSystem.isPlayerFlying && this.flightSystem.isPlayerFlying()) return;
    } else if (kind === 'throw') {
      if (this.weaponRenderer && this.weaponRenderer.isWeaponThrown && this.weaponRenderer.isWeaponThrown()) return;
    }
    this._ensureAimController().enter(kind, index);
    console.log(`[PCAim] 进入瞄准: kind=${kind}, index=${index}`);
  }

  /** 取消 PC 瞄准模式 */
  cancelPCAimMode() {
    if (this._aimController) this._aimController.cancel();
    this.clearSkillAimPreview();
  }

  /**
   * 懒创建瞄准控制器：射程与释放逻辑通过回调注入，控制器只管几何与状态。
   * @private
   */
  _ensureAimController() {
    if (this._aimController) return this._aimController;

    this._aimController = new SceneAimController({
      getPlayerPosition: () => {
        const t = this.playerEntity && this.playerEntity.getComponent('transform');
        return t ? t.position : null;
      },
      getRange: (kind, index) => {
        if (kind === 'flight') {
          return (this.flightSystem && this.flightSystem.config && this.flightSystem.config.maxDistance) || 400;
        }
        if (kind === 'throw') {
          return (this.weaponRenderer && this.weaponRenderer.getThrowRange)
            ? this.weaponRenderer.getThrowRange(this.playerEntity) : 480;
        }
        const combat = this.playerEntity && this.playerEntity.getComponent('combat');
        const skill = combat && combat.skills ? combat.skills[index] : null;
        return skill ? (skill.range || 300) : 0;
      },
      onConfirm: (kind, index, aim) => {
        // dirX/dirY 已归一化，乘 distRatio 交给各释放方法自行换算射程
        if (kind === 'flight') {
          this.flightByDirection(aim.dirX, aim.dirY, aim.distRatio);
        } else if (kind === 'throw') {
          this.throwByDirection(aim.dirX, aim.dirY, aim.distRatio);
        } else {
          this.useSkillByDirection(index, aim.dirX, aim.dirY, aim.distRatio, aim.worldTarget);
        }
      },
      onCancel: () => this.clearSkillAimPreview()
    });
    return this._aimController;
  }

  /**
   * 每帧更新 PC 瞄准模式：瞄准圈跟随鼠标；左键在射程内触发、超出取消；右键取消。
   * 必须在拾取/攻击判定之前调用，命中时消费本次点击。
   */
  updatePCAimMode() {
    const aim = this._aimController;
    if (!aim || !aim.isAiming || this.isMobileLayout || !this.inputManager) return;

    const mouseWorld = this.inputManager.getMouseWorldPosition(this.camera);
    const result = aim.aimAtWorldPoint(mouseWorld);
    if (!result) return;

    // 瞄准圈跟随鼠标（绿色=射程内，红色=超出）
    this.setSkillAimPreview(result.previewIndex, result.dirX, result.dirY, result.distRatio);

    if (!this.inputManager.isMouseClicked() || this.inputManager.isMouseClickHandled()) return;

    const btn = this.inputManager.getMouseButton();
    // 点击落在底部功能按钮区域时，不当作确认（交给 UI 处理，便于重新选择技能）
    const mouseScreen = this.inputManager.getMousePosition();
    if (btn === 0 && this._isMouseOverBottomUI(mouseScreen.x, mouseScreen.y)) return;

    this.inputManager.markMouseClickHandled();
    if (btn === 2) {
      this.cancelPCAimMode();
      return;
    }
    aim.confirm({ worldTarget: { x: mouseWorld.x, y: mouseWorld.y } });
    this.clearSkillAimPreview();
  }

  /**
   * 判断鼠标屏幕坐标是否落在底部功能按钮/技能栏区域
   * @param {number} sx
   * @param {number} sy
   * @returns {boolean}
   */
  _isMouseOverBottomUI(sx, sy) {
    const btns = [this.blockButton, this.flightButton, this.throwButton, this.bagButton];
    for (const b of btns) {
      if (b && b.visible !== false && b.containsPoint && b.containsPoint(sx, sy)) return true;
    }
    // 底部控制栏（技能槽/血蓝球）所在的底部条带
    if (this.bottomControlBar) {
      const barY = this.bottomControlBar.y != null ? this.bottomControlBar.y : (this.logicalHeight - 100);
      if (sy >= barY) return true;
    }
    return false;
  }

  /**
   * 渲染技能瞄准预览虚线框（在世界坐标系中,由 render 调用）
   * @param {CanvasRenderingContext2D} ctx
   */
  renderSkillAimPreview(ctx) {
    if (!this.skillAimPreview) return;
    const landing = this._ensureAimPresentation().render(ctx);
    if (landing) {
      this._lastAimWorldX = landing.x;
      this._lastAimWorldY = landing.y;
    }
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
  createPlayerEntity() {
    // 玩家初始位置在火堆附近（火堆位置是 350, 250）
    const startX = 420;  // 火堆x + 70
    const startY = 330;  // 火堆y + 80
    
    // 读取登录时选中的主角配置
    const selected = SelectedCharacterStore.get();
    
    // 如果选中角色需要一张静态图片资源，确保它已被加载
    if (selected && selected.assetImage && this.assetManager) {
      const { key, path } = selected.assetImage;
      if (this.assetManager.getImage && !this.assetManager.images.has(key)) {
        const fullPath = this.assetManager.resolveAssetPath
          ? this.assetManager.resolveAssetPath(path.replace(/^assets\//, ''))
          : path;
        // 复用框架的图片加载入口
        this.assetManager.loadImage(key, fullPath).catch(() => {
          console.warn(`createPlayerEntity: 无法加载主角图片 ${path}`);
        });
      }
    }
    
    this.playerEntity = this.entityFactory.createPlayer({
      name: selected?.name || '玩家',
      class: selected?.class || 'refugee',
      spriteSheet: selected?.spriteSheet,
      spriteConfig: selected?.spriteConfig || undefined,
      level: 1,
      position: { x: startX, y: startY },
      stats: {
        maxHp: 150,
        hp: 150,
        maxMp: 100,
        mp: 100,
        attack: 15,
        defense: 8,
        speed: 120
      },
      skills: [
        { 
          id: 'flame_palm', 
          name: '火焰掌', 
          type: 'magic', 
          damageMin: 30,
          damageMax: 100,
          splashDamageMin: 5,
          splashDamageMax: 20,
          splashCount: 8,
          manaCost: 15, 
          cooldown: 3.0, 
          range: 400, 
          effectType: 'flame_palm', 
          projectileSpeed: 450, 
          hotkey: '1' 
        },
        { 
          id: 'ice_finger', 
          name: '寒冰指', 
          type: 'magic', 
          damageMin: 20,
          damageMax: 50,
          finalDamageMin: 50,
          finalDamageMax: 120,
          manaCost: 12, 
          cooldown: 3.0, 
          range: 550, 
          effectType: 'ice_finger', 
          projectileSpeed: 600, 
          hotkey: '2' 
        },
        { 
          id: 'inferno_palm', 
          name: '烈焰掌', 
          type: 'magic', 
          damageMin: 50,
          damageMax: 200,
          projectileCount: 5,
          manaCost: 25, 
          cooldown: 10.0, 
          range: 450, 
          effectType: 'inferno_palm', 
          projectileSpeed: 400, 
          hotkey: '3' 
        },
        { 
          id: 'heal', 
          name: '治疗', 
          type: 'heal', 
          healAmount: 50,
          manaCost: 20, 
          cooldown: 20.0, 
          range: 0, 
          effectType: 'heal', 
          hotkey: '4' 
        },
        { 
          id: 'meditation', 
          name: '打坐', 
          type: 'channel', 
          healPerSecond: 0.1,
          manaPerSecond: 0.1,
          manaCost: 0, 
          cooldown: 5.0, 
          range: 0, 
          effectType: 'meditation', 
          hotkey: '5',
          requiresNonCombat: true
        }
      ],
      equipment: {},
      inventory: []
    });
    
    this.entities.push(this.playerEntity);
    
    // 调试：检查精灵组件
    const sprite = this.playerEntity.getComponent('sprite');
    console.log('BaseGameScene: 玩家精灵组件', {
      spriteSheet: sprite?.spriteSheet,
      useDirectionalSprite: sprite?.useDirectionalSprite,
      direction: sprite?.direction,
      width: sprite?.width,
      height: sprite?.height
    });
    
    // 设置相机跟随玩家
    const transform = this.playerEntity.getComponent('transform');
    if (transform) {
      this.camera.setTarget(transform);
    }
    
    // 设置各系统的玩家实体
    this.combatSystem.setPlayerEntity(this.playerEntity);
    this.movementSystem.setPlayerEntity(this.playerEntity);
    this.backpackPanel?.setEntity(this.playerEntity);
    this.backpackPanel?.setInputManager(this.inputManager);
    this.bottomControlBar.setEntity(this.playerEntity);
    if (this.playerStatusHUD) {
      this.playerStatusHUD.setPlayer(this.playerEntity);
    }
    
    console.log('BaseGameScene: 创建玩家实体', this.playerEntity);
  }

  /**
   * 绑定UI面板到玩家实体（兼容入口，委托给场景 HUD 组合器）
   */
  bindUIPanelsToPlayer() {
    return this._ensurePanelLayout().bindPlayer();
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
   * 将精灵朝向字符串转为归一化方向向量
   * @private
   */
  _directionToVector(direction) {
    const map = {
      'up': { x: 0, y: -1 }, 'down': { x: 0, y: 1 },
      'left': { x: -1, y: 0 }, 'right': { x: 1, y: 0 },
      'up-left': { x: -0.707, y: -0.707 }, 'up-right': { x: 0.707, y: -0.707 },
      'down-left': { x: -0.707, y: 0.707 }, 'down-right': { x: 0.707, y: 0.707 }
    };
    return map[direction] || { x: 0, y: 1 };
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
    if (this.inputManager.isMouseClicked() && !this.inputManager.isMouseClickHandled()) {
      const mousePos = this.inputManager.getMousePosition();
      const button = this.inputManager.getMouseButton() === 2 ? 'right' : 'left';
      
      // 小地图 +/- 按钮点击
      if (button === 'left' && this.minimap && this.minimap.visible && this.minimap.containsPoint(mousePos.x, mousePos.y)) {
        if (this.minimap.handleClick(mousePos.x, mousePos.y)) {
          this.inputManager.markMouseClickHandled();
          return;
        }
      }

      // 如果对话激活，优先处理对话框点击
      if (this.dialogueSystem && this.dialogueSystem.isDialogueActive()) {
        // 检查是否点击在对话框内
        if (this.dialogueBox && this.dialogueBox.visible) {
          const dialogueHandled = this.dialogueBox.handleMouseClick(mousePos.x, mousePos.y, button);
          if (dialogueHandled) {
            this.inputManager.markMouseClickHandled();
            return;
          }
        }
        // 对话激活时，即使点击在对话框外也阻止移动
        this.inputManager.markMouseClickHandled();
        return;
      }
      
      const uiHandled = this.uiClickHandler.handleClick(mousePos.x, mousePos.y, button);
      
      if (uiHandled) {
        this.inputManager.markMouseClickHandled();
      } else if (button === 'left') {
        // UI 没有处理点击（点在统一背包外部）
        if (this.backpackPanel?.visible) {
          this.backpackPanel.hide();
          this.inputManager.markMouseClickHandled();
          return;
        }
        // 旧的 Shift+左键投掷已改为：按 Shift 进入投掷瞄准、左键确认（见 updatePCAimMode）
        // 左键为攻击（由 MeleeAttackSystem 处理），右键移动由 MovementSystem 处理
      }
    }
  }

  /**
   * 处理Ctrl+鼠标左键轻功
   */
  handleTeleport() {
    if (!this.inputManager.isCtrlClick() || this.inputManager.isMouseClickHandled()) {
      return;
    }
    
    // 如果正在飞行中，不允许再次触发
    if (this.flightSystem && this.flightSystem.isPlayerFlying()) {
      this.inputManager.markMouseClickHandled();
      return;
    }
    
    if (!this.playerEntity || !this.camera) return;
    
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    
    try {
      console.log('=== 轻功开始 ===');
      
      // 获取鼠标屏幕坐标
      const mouseScreenPos = this.inputManager.getMousePosition();
      
      // 使用相机的screenToWorld方法转换坐标
      const mouseWorld = this.camera.screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
      
      // 使用飞行系统开始飞行
      if (this.flightSystem) {
        const success = this.flightSystem.startFlight(transform, mouseWorld.x, mouseWorld.y);
        if (success) {
          // 标记点击已处理
          this.inputManager.markMouseClickHandled();
        }
      }
      
    } catch (error) {
      console.error('轻功过程中发生错误:', error);
      console.error('错误堆栈:', error.stack);
      // 即使出错也要标记点击已处理，避免重复触发
      this.inputManager.markMouseClickHandled();
    }
  }
  
  /**
   * 右键点击处理：记录光圈动画，debug 模式下输出坐标日志
   */
  _debugRightClick() {
    const mouseScreen = this.inputManager.getMousePosition();
    const mouseWorld = this.inputManager.getMouseWorldPosition();
    const cameraWorldPos = this.camera ? this.camera.screenToWorld(mouseScreen.x, mouseScreen.y) : null;
    const playerTransform = this.playerEntity ? this.playerEntity.getComponent('transform') : null;
    const playerPos = playerTransform ? playerTransform.position : null;

    // debug 模式下输出详细坐标日志
    if (this.debugMode) {
      const viewBounds = this.camera ? this.camera.getViewBounds() : null;
      const rawMouse = this.inputManager.mouse;
      console.log('=== 右键点击调试 ===');
      console.log('屏幕坐标 (mouse.x/y):', mouseScreen.x.toFixed(1), mouseScreen.y.toFixed(1));
      console.log('InputManager worldX/Y:', mouseWorld.x.toFixed(1), mouseWorld.y.toFixed(1));
      console.log('Camera.screenToWorld:', cameraWorldPos ? `${cameraWorldPos.x.toFixed(1)}, ${cameraWorldPos.y.toFixed(1)}` : 'N/A');
      console.log('相机位置:', this.camera ? `${this.camera.position.x.toFixed(1)}, ${this.camera.position.y.toFixed(1)}` : 'N/A');
      console.log('相机尺寸:', this.camera ? `${this.camera.width} x ${this.camera.height}` : 'N/A');
      console.log('视野边界:', viewBounds ? `L=${viewBounds.left} T=${viewBounds.top} R=${viewBounds.right} B=${viewBounds.bottom}` : 'N/A');
      console.log('InputManager cameraX/Y:', this.inputManager.cameraX?.toFixed(1), this.inputManager.cameraY?.toFixed(1));
      console.log('玩家位置:', playerPos ? `${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}` : 'N/A');
      const _canvas = document.getElementById('gameCanvas');
      const _rect = _canvas?.getBoundingClientRect();
      console.log('Canvas尺寸:', this.logicalWidth, 'x', this.logicalHeight, '| canvas.width:', _canvas?.width, '| rect:', _rect ? `left=${_rect.left.toFixed(1)} top=${_rect.top.toFixed(1)} w=${_rect.width.toFixed(1)} h=${_rect.height.toFixed(1)}` : 'N/A');
      console.log('原始 clientX/Y:', rawMouse._rawClientX, rawMouse._rawClientY);
      console.log('==================');
    }

    // 记录光圈动画（始终记录，绿色光圈作为正式功能）
    const targetPos = cameraWorldPos || mouseWorld;
    if (!this._clickRings) this._clickRings = [];
    this._clickRings.push(ClickFeedbackRenderer.createRing({
      worldX: targetPos.x,
      worldY: targetPos.y,
      screenX: mouseScreen.x,
      screenY: mouseScreen.y,
      playerX: playerPos ? playerPos.x : 0,
      playerY: playerPos ? playerPos.y : 0
    }));
  }

  /**
   * 渲染右键点击光圈（在世界坐标系中调用）
   */
  _renderClickRings(ctx) {
    if (!this._clickRings || this._clickRings.length === 0) return;
    this._clickRings = ClickFeedbackRenderer.prune(this._clickRings);
    ClickFeedbackRenderer.renderWorldRings(ctx, this._clickRings, this.debugMode);
  }

  /**
   * 渲染鼠标点击屏幕标记（debug 模式，在屏幕坐标系中调用）
   */
  _renderClickScreenMarkers(ctx) {
    if (!this.debugMode) return;
    ClickFeedbackRenderer.renderScreenMarkers(ctx, this._clickRings);
  }

  /** 处理武器投掷。 */
  handleWeaponThrow() {
    return this._ensureCombatActions().handleWeaponThrow();
  }


  handleEnemySelection() {
    // 不再需要选中敌人，使用滑动攻击
  }

  /** 处理自动攻击（鼠标移动时）。 */
  handleAutoAttack(currentTime) {
    return this._ensureCombatActions().handleAutoAttack(currentTime);
  }

  /**
   * 检查空格键继续对话
   */
  checkDialogueContinue() {
    // 检查对话系统是否激活
    if (!this.dialogueSystem || !this.dialogueSystem.isDialogueActive()) {
      return;
    }
    
    // 继续信号：空格键、E 键（交互键）、手柄 X 键（绑定为 'e'），或点击/触摸
    const spacePressed = this.inputManager.isKeyPressed('space');
    const interactPressed = this.inputManager.isKeyPressed('e');
    const clicked = this.inputManager.isMouseClicked && this.inputManager.isMouseClicked();
    const continueSignal = spacePressed || interactPressed || clicked;
    if (!continueSignal) {
      return;
    }
    
    // isKeyPressed 是帧沿信号（按下瞬间为 true），天然不会连续触发，无需手动防连
    
    // 如果正在打字，跳过打字动画
    if (this.dialogueSystem.isTyping()) {
      this.dialogueSystem.skipTypewriter();
      // 消费点击，防止穿透到游戏世界
      if (clicked) this.inputManager.markMouseClickHandled();
      return;
    }
    
    // 否则继续对话
    const currentNode = this.dialogueSystem.getCurrentNode();
    if (currentNode) {
      // 如果有选项，不自动继续（需要玩家点击选项）
      if (currentNode.choices && currentNode.choices.length > 0) {
        return;
      }
      
      // 继续对话
      this.dialogueSystem.continue();
      if (clicked) this.inputManager.markMouseClickHandled();
      
      // 如果对话结束，隐藏对话框
      if (!this.dialogueSystem.isDialogueActive() && this.dialogueBox) {
        this.dialogueBox.hide();
      }
    }
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
    this.entityLifecycleSystem.removeDeadEntities(this.entities);
  }

  /**
   * 通用数据驱动装配（可选）：任意幕调用即可获得 GameProject 触发器/事件源能力。
   *
   * 装配 GameLoader 并桥接事件源（sceneEnter/kill/questComplete/dialogueEnd 等），
   * 之后该场景可用编辑器配置的触发器驱动剧情，无需写代码。
   * 叠加式：不调用则场景行为完全不变；基类 update 会自动驱动 timer 触发器。
   *
   * @param {string} projectUrl - GameProject.json 路径（相对场景 HTML）
   * @param {Object} opts
   *   - sceneId: 装配完成后 fire('sceneEnter',{sceneId}) 的场景 id
   *   - sceneFlag: 在黑板设一个布尔标记（如 'ddScene'），供触发器 if 判定仅本场景生效
   *   - deps: 额外依赖，合并进 GameLoader deps
   *   - onReady(gameLoader, triggerSystem): 装配完成回调，供子类注册场景专属动作/监听
   * @returns {Promise<GameLoader|null>}
   */
  async initGameLoader(projectUrl = 'game.project.json', opts = {}) {
    try {
      return await this._ensureGameLoaderBridge().initialize(projectUrl, opts);
    } catch (error) {
      console.warn('BaseGameScene.initGameLoader 失败:', error);
      return null;
    }
  }

  // ─── 通用切幕：按 N 切换到下一幕 ────────────────────────

  /**
   * 切换调试面板显示/隐藏（触发器动作 toggleDebug）
   */
  _toggleDebugPanel() {
    console.log('[BaseGameScene][DebugPanel] 收到切换请求', {
      scene: this.name,
      isActive: this.isActive,
      isPaused: this.isPaused,
      panelExists: !!this.debugPanel,
      visibleBefore: this.debugPanel?.visible ?? false,
      elementConnectedBefore: this.debugPanel?._el?.isConnected || false,
      existingDomCount: typeof document !== 'undefined'
        ? document.querySelectorAll('#debug-panel').length
        : 0
    });

    if (!this.debugPanel) {
      this.debugPanel = new DebugPanel({
        getScene: () => this,
        getSceneManager: () => {
          const eng = (typeof window !== 'undefined') ? window.gameEngine : null;
          return (eng && eng.sceneManager) || this.sceneManager || null;
        }
      });
      console.log('[BaseGameScene][DebugPanel] 已创建 DebugPanel 实例');
    }

    this.debugPanel.toggle();
    console.log('[BaseGameScene][DebugPanel] 切换调用结束', {
      visibleAfter: this.debugPanel.visible,
      elementConnectedAfter: this.debugPanel._el?.isConnected || false,
      domElement: typeof document !== 'undefined'
        ? document.getElementById('debug-panel')
        : null
    });
  }

  /**
   * 屏幕居中提示（触发器 showTip 动作用）：优先复用原版提示面板 window.__ddShowTips，
   * 约 3.5 秒后自动隐藏；不可用时回退简易黑框。
   * @param {string} text
   * @param {Object} [opts] - { persist:true 不自动隐藏（供倒计时/提示切幕每帧刷新用） }
   */
  _showScreenTip(text, opts = {}) {
    // 与 showHint 一致：显示时替换按键占位符，支持三套输入方案
    text = InputHints.formatHtml(text);
    if (typeof window !== 'undefined' && window.__ddShowTips) {
      window.__ddShowTips('提示', text);
      clearTimeout(this._tipTimer);
      if (!opts.persist) {
        this._tipTimer = setTimeout(() => { if (window.__ddHideTips) window.__ddHideTips(); }, 3500);
      }
      return;
    }
    // 回退：简易黑框
    let el = document.getElementById('dd-trigger-tip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dd-trigger-tip';
      el.style.cssText = 'position:fixed;top:22%;left:50%;transform:translateX(-50%);' +
        'background:rgba(0,0,0,0.82);color:#fff;padding:14px 28px;border-radius:8px;' +
        'font-size:18px;z-index:99999;pointer-events:none;transition:opacity 0.3s;';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(this._tipTimer);
    if (!opts.persist) this._tipTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
  }

  /** 隐藏提示面板 */
  _hideScreenTip() {
    if (typeof window !== 'undefined' && window.__ddHideTips) window.__ddHideTips();
    const el = document.getElementById('dd-trigger-tip');
    if (el) el.style.opacity = '0';
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

  /** 渲染轻功飞行时的地面阴影。 */
  _renderFlightShadow(ctx) {
    return this._ensureRenderPipeline().renderFlightShadow(ctx);
  }

  /** 渲染玩家格挡防护罩。 */
  _renderBlockShield(ctx) {
    return this._ensureRenderPipeline().renderBlockShield(ctx);
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
    // 优先使用编辑器场景地形渲染
    if (this.terrain) {
      // 盆地外整体淡黑色
      const vb = this.camera.getViewBounds();
      ctx.fillStyle = this.terrain.sceneBackgroundColor || '#1f1a14';
      ctx.fillRect(vb.left, vb.top, vb.right - vb.left, vb.bottom - vb.top);
      // 盆地草地+水池+shape
      this.terrain.renderGround(ctx);
      return;
    }
    // 渲染等距地图
    if (this.isometricRenderer) {
      // 先绘制无限延伸的网格
      const viewBounds = this.camera.getViewBounds();
      this.isometricRenderer.drawInfiniteGrid(viewBounds);
      
      // 再绘制等距地图（覆盖在网格上）
      if (this.mapData) {
        this.isometricRenderer.drawMap();
      }
    } else {
      // 备用：简单背景
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    }
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
    return this._ensureCombatActions().handlePickupClick();
  }

  /** 左键点击地上物品的拾取检测。 */
  tryClickPickup(worldX, worldY) {
    return this._ensureCombatActions().tryClickPickup(worldX, worldY);
  }

  /**
   * 渲染可拾取物品
   */
  renderPickupItems(ctx) {
    // 地面物品与装备的画法统一交给框架的 ItemSpriteRenderer 分发
    const drawList = (items) => {
      for (const item of items) {
        if (item.picked) continue;
        const x = item.x;
        const y = item.y;

        if (!ItemSpriteRenderer.draw(ctx, item.id, x, y)) {
          // 无专属画法：兜底圆点（底部对齐）
          ctx.fillStyle = '#ffaa00';
          ctx.beginPath();
          ctx.arc(x, y - 5, 10, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.name, x, y - 20);
      }
    };
    drawList(this.pickupItems);
    drawList(this.equipmentItems);
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
    this._onHintShow = showCallback;
    this._onHintHide = hideCallback;
  }

  /**
   * 显示场景提示（通过回调，支持HTML和.key样式）
   * @param {string} text - 提示文本（支持HTML，如 <span class="key">N</span>）
   * @param {string} title - 提示标题，默认'提示'
   */
  showHint(text, title = '提示') {
    // 在显示时机替换按键占位符：文案只写一份，中途插拔手柄也能跟着变
    const resolved = InputHints.formatHtml(text);
    // 如果提示内容没变，不重复显示
    if (this._currentHintText === resolved) return;
    this._currentHintText = resolved;
    
    if (this._onHintShow) {
      this._onHintShow(resolved, title);
    }
  }

  /**
   * 隐藏场景提示
   */
  hideHint() {
    if (this._currentHintText === null) return;
    this._currentHintText = null;
    
    if (this._onHintHide) {
      this._onHintHide();
    }
  }

  /**
   * 设置 draw call 计数器（代理 ctx 的绘制方法）
   * 仅在首次调用时执行，之后复用已代理的 ctx
   * @private
   */
  _setupDrawCallCounter(ctx) {
    if (this._drawCallProxied) return;
    const methods = ['drawImage', 'fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText'];
    this._drawCallOriginals = new Map();
    this._drawCallProxyContext = ctx;
    for (const method of methods) {
      const original = ctx[method];
      if (!original) continue;
      this._drawCallOriginals.set(method, original);
      ctx[method] = (...args) => {
        this._drawCallCount++;
        return original.apply(ctx, args);
      };
    }
    this._drawCallProxied = true;
  }

  /**
   * 关闭绘制计数时恢复 Canvas 原方法，避免非监控状态长期承担代理开销。
   * @private
   */
  _teardownDrawCallCounter() {
    const context = this._drawCallProxyContext;
    if (!this._drawCallProxied || !context) return;
    for (const [method, original] of this._drawCallOriginals || []) context[method] = original;
    this._drawCallOriginals = null;
    this._drawCallProxyContext = null;
    this._drawCallProxied = false;
  }

  /**
   * 估算纹理内存占用（所有已加载的 Image/Canvas 离屏缓存）
   * @returns {number} 字节数
   * @private
   */
  _estimateTextureMemory() {
    let bytes = 0;
    // terrain 离屏缓存
    const terrains = this._terrains || (this.terrain ? [this.terrain] : []);
    for (const t of terrains) {
      if (t._combinedGroundCache) {
        bytes += t._combinedGroundCache.width * t._combinedGroundCache.height * 4;
      }
      if (t._groundDecoCache) {
        bytes += t._groundDecoCache.width * t._groundDecoCache.height * 4;
      }
      if (t._bgImageCache) {
        bytes += t._bgImageCache.width * t._bgImageCache.height * 4;
      }
      // 图集图片
      for (const key of Object.keys(t.images || {})) {
        const img = t.images[key];
        if (img && img.naturalWidth) {
          bytes += img.naturalWidth * img.naturalHeight * 4;
        }
      }
    }
    // 小地图缓存
    if (this.minimap && this.minimap._mapCache) {
      bytes += this.minimap._mapCache.width * this.minimap._mapCache.height * 4;
    }
    return bytes;
  }

  /**
   * 场景退出
   */
  exit() {
    super.exit();

    // 清掉背包让位用的 body class，避免切场景后触屏控件仍是半透明不可点
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('backpack-open');
    }
    this._touchControlsDimmed = false;

    // DOM 调试面板不属于 Canvas，场景退出时必须主动销毁，避免遗留重复 ID 和旧场景刷新循环
    if (this.debugPanel) {
      console.log('[BaseGameScene][DebugPanel] 场景退出，清理调试面板', {
        visible: this.debugPanel.visible,
        elementConnected: this.debugPanel._el?.isConnected || false
      });
      this.debugPanel.hide();
      this.debugPanel = null;
    }
    
    // 运行时先撤销阶段钩子、输入路由和桥接监听，再销毁底层输入/系统实例。
    this._gameLoaderBridge?.dispose();
    this._gameLoaderBridge = null;
    this.sceneRuntime?.dispose();
    this.sceneRuntime = null;

    if (this.inputManager) {
      this.inputManager.destroy();
    }

    this._gameplaySystemAssembler.dispose();
    
    this.tutorialSystem.cleanup();
    this.dialogueSystem?.reset?.();
    this.questSystem?.cleanup?.();

    // 释放小地图缓存
    if (this.minimap) {
      this.minimap.dispose();
    }
    
    for (const entity of this.entities) {
      entity.destroy();
    }
    this.entities = [];
    
    console.log(`BaseGameScene: 退出场景 ${this.name}`);
  }
}

export default BaseGameScene;
