﻿/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
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

import { PrologueScene } from './PrologueScene.js';
import { EntityFactory } from '../../../src/ecs/EntityFactory.js';
import { InputManager } from '../../../src/core/InputManager.js';
import UIClickHandler from '../../../src/core/UIClickHandler.js';
import { CombatSystem } from '../../../src/systems/CombatSystem.js';
import { MovementSystem } from '../../../src/systems/MovementSystem.js';
import { EquipmentSystem } from '../../../src/systems/EquipmentSystem.js';
import { AISystem } from '../../../src/systems/AISystem.js';
import { TutorialSystem } from '../../../src/systems/TutorialSystem.js';
import { DialogueSystem } from '../../../src/systems/DialogueSystem.js';
import { QuestSystem } from '../../../src/systems/QuestSystem.js';
import { IsometricRenderer } from '../../../src/rendering/IsometricRenderer.js';
import { CombatEffects } from '../../../src/rendering/CombatEffects.js';
import { SkillEffects } from '../../../src/rendering/SkillEffects.js';
import { InventoryPanel } from '../../../src/ui/InventoryPanel.js';
import { PlayerInfoPanel } from '../../../src/ui/PlayerInfoPanel.js';
import { BottomControlBar } from '../../../src/ui/BottomControlBar.js';
import { PlayerStatusHUD } from '../../../src/ui/PlayerStatusHUD.js';
import { IconButton } from '../../../src/ui/IconButton.js';
import { createUIStrategy } from '../../../src/ui/strategies/index.js';
import { UILayoutLoader } from '../../../src/ui/UILayoutLoader.js';
import { PanelLayoutLoader } from '../../../src/ui/PanelLayoutLoader.js';
import { DialogueBox } from '../../../src/ui/DialogueBox.js';
import { FloatingTextManager } from '../../../src/ui/FloatingText.js';
import { Scene1Terrain } from './Scene1Terrain.js';
import { ParticleSystem } from '../../../src/rendering/ParticleSystem.js';
import { WeaponRenderer } from '../../../src/rendering/WeaponRenderer.js';
import { EnemyWeaponRenderer } from '../../../src/rendering/EnemyWeaponRenderer.js';
import { FlightSystem } from '../../../src/systems/FlightSystem.js';
import { CollisionSystem } from '../../../src/systems/CollisionSystem.js';
import { PickupSystem } from '../../../src/systems/PickupSystem.js';
import { MeditationSystem } from '../../../src/systems/MeditationSystem.js';
import { MeleeAttackSystem } from '../../../src/systems/MeleeAttackSystem.js';
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
import { GameLoader } from '../../../src/core/GameLoader.js';

export class BaseGameScene extends PrologueScene {
  constructor(actNumber, sceneData = {}) {
    super(actNumber, sceneData);
    
    // ECS 核心
    this.entityFactory = new EntityFactory();
    this.entities = [];
    
    // 逻辑尺寸（用于渲染计算，不受 devicePixelRatio 影响）
    this.logicalWidth = 800;
    this.logicalHeight = 600;
    
    // 调试模式（开启后显示坐标标记和日志）
    this.debugMode = false;

    // 编辑器场景渲染器（通用，所有幕共享 Scene1Terrain 加载和渲染能力）
    // actNumber → editorSceneId 映射，子类可覆盖 this.editorSceneId
    this.terrain = null;
    this.editorSceneId = sceneData.editorSceneId || this._getDefaultEditorSceneId(actNumber);
    
    // 核心系统
    this.inputManager = null;
    this.camera = null;
    this.combatSystem = null;
    this.movementSystem = null;
    this.equipmentSystem = null;
    this.aiSystem = null;
    this.isometricRenderer = null;  // 统一渲染器
    this.combatEffects = null;
    this.skillEffects = null;
    this.weaponRenderer = null;
    this.enemyWeaponRenderer = null;
    this.flightSystem = null;
    this.collisionSystem = null;
    this.pickupSystem = null;
    this.meditationSystem = null;
    
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
    this.inventoryPanel = null;
    this.playerInfoPanel = null;
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
    
    // 幕数据（从 ActXData.json 加载）
    this.actData = null;
    
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

    // PC 瞄准模式：技能3/4/5、轻功、投掷按下后先进入瞄准（鼠标变瞄准圈），
    // 再次左键在射程内则触发，超出射程则取消。{ kind:'skill'|'flight'|'throw', index } 或 null
    this._pcAimState = null;
    
    // 场景过渡状态
    this.isTransitioning = false;
    this.transitionAlpha = 0;
    this.transitionPhase = 'none'; // 'none', 'fade_out', 'show_text', 'switch_scene'
    this.transitionTimer = 0;
    this.transitionDuration = 2.0;
    this.textDisplayDuration = 3.0;
    this.transitionText = { main: '', sub: '' };
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
    
    // 初始化战斗特效
    this.combatEffects = new CombatEffects(this.particleSystem);
    
    // 初始化技能特效
    this.skillEffects = new SkillEffects(this.particleSystem);
    
    // 初始化武器渲染器
    this.weaponRenderer = new WeaponRenderer();
    
    // 初始化敌人武器渲染器
    this.enemyWeaponRenderer = new EnemyWeaponRenderer();
    
    // 初始化轻功飞行系统
    this.flightSystem = new FlightSystem({
      particleSystem: this.particleSystem,
      floatingTextManager: this.floatingTextManager,
      camera: this.camera
    });
    
    // 初始化游戏系统
    this.combatSystem = new CombatSystem({
      inputManager: this.inputManager,
      camera: this.camera,
      skillEffects: this.skillEffects,
      weaponRenderer: this.weaponRenderer,
      enemyWeaponRenderer: this.enemyWeaponRenderer,
      floatingTextManager: this.floatingTextManager
    });
    
    // 设置打坐技能回调
    this.combatSystem.onMeditationSkill = (skill) => {
      this.onSkillClicked(skill);
    };

    // PC 瞄准模式：CombatSystem 按键触发方向类技能时，委托给场景进入瞄准
    this.combatSystem.onSkillAimRequest = (index) => {
      this.enterPCAimMode('skill', index);
    };
    
    // 设置进入战斗回调（中断打坐）
    this.combatSystem.setOnEnterCombat(() => {
      if (this.meditationSystem.isActive()) {
        this.meditationSystem.stop();
      }
    });
    
    // 战斗脱离延迟由 CombatSystem 默认配置决定（combatState.combatExitDelay）
    
    // 设置药水快捷键回调
    this.combatSystem.onPotionUse = (potionType) => {
      this.usePotionFromHotbar(potionType);
    };
    
    // 设置掉落回调
    this.combatSystem.setLootDropCallback((position, lootItems) => {
      const lootEntities = this.pickupSystem.spawnLootItems(position, lootItems);
      for (const entity of lootEntities) {
        this.entities.push(entity);
        this.equipmentItems.push(entity);
      }
    });
    
    this.movementSystem = new MovementSystem({
      inputManager: this.inputManager,
      camera: this.camera
    });
    // 不设置地图边界，允许玩家自由移动
    
    this.equipmentSystem = new EquipmentSystem();
    
    // 初始化AI系统
    this.aiSystem = new AISystem();
    
    // 初始化碰撞系统
    this.collisionSystem = new CollisionSystem();
    
    // 初始化拾取系统
    this.pickupSystem = new PickupSystem();
    this.pickupSystem.init({
      inputManager: this.inputManager,
      floatingTextManager: this.floatingTextManager,
      weaponRenderer: this.weaponRenderer
    });
    
    // 初始化冥想系统
    this.meditationSystem = new MeditationSystem();
    this.meditationSystem.init({
      inputManager: this.inputManager,
      floatingTextManager: this.floatingTextManager,
      skillEffects: this.skillEffects,
      combatSystem: this.combatSystem
    });
    
    // 初始化近战攻击系统
    this.meleeAttackSystem = new MeleeAttackSystem({
      disableAutoAttack: this.isMobileLayout,
      hideSectorWhenIdle: this.isMobileLayout
    });
    this.meleeAttackSystem.init({
      inputManager: this.inputManager,
      combatSystem: this.combatSystem,
      floatingTextManager: this.floatingTextManager
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
    
    // 异步加载幕数据（从 ActXData.json）
    this.loadActData();
    
    // 注册快捷键
    this.registerHotkeys();
  }

  /**
   * 注册通用快捷键
   */
  registerHotkeys() {
    // 人物信息面板切换 (C)
    this.inputManager.registerHotkey('toggle_playerinfo', ['c', 'C'], () => {
      this.playerInfoPanel.toggle();
    }, { cooldown: 300 });
    
    // 背包面板切换 (B)
    this.inputManager.registerHotkey('toggle_inventory', ['b', 'B'], () => {
      this.inventoryPanel.toggle();
    }, { cooldown: 300 });

    // 装备面板切换 (V) —— PC 端属性/装备分离后的独立装备面板
    this.inputManager.registerHotkey('toggle_equipment', ['v', 'V'], () => {
      if (this.equipmentPanel) this.equipmentPanel.toggle();
    }, { cooldown: 300 });
    
    // 性能监控切换 (P)
    this.inputManager.registerHotkey('toggle_performance', ['p', 'P'], () => {
      this.performanceMonitor.toggle();
      console.log('性能监控:', this.performanceMonitor.enabled ? '开启' : '关闭');
    }, { cooldown: 300 });
  }

  /**
   * 异步加载幕数据
   * 从 ActXData.json 加载当前幕的配置数据
   */
  loadActData() {
    const actNumber = this.actNumber;
    const url = `data/Act${actNumber}Data.json`;
    
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        this.actData = data;
        console.log(`BaseGameScene: 加载幕数据成功 Act${actNumber}`, data);
      })
      .catch(error => {
        console.warn(`BaseGameScene: 加载幕数据失败 Act${actNumber}`, error);
        this.actData = null;
      });
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
   * 初始化 UI 面板
   */
  /**
   * 处理装备槽点击（卸下装备）——属性面板/装备面板共用
   * @param {string} slotType - 装备槽类型
   * @param {string} button - 鼠标按钮
   */
  _handleEquipmentSlotClick(slotType, button) {
    // 右键点击或移动端左键点击卸下装备
    if ((button === 'right' || this.isMobileLayout) && this.playerEntity) {
      const equipment = this.playerEntity.getComponent('equipment');
      if (equipment && equipment.slots[slotType]) {
        const itemName = equipment.slots[slotType].name;
        this.equipmentSystem.unequip(this.playerEntity, slotType);
        const transform = this.playerEntity.getComponent('transform');
        if (transform) {
          this.floatingTextManager.addText(
            transform.position.x,
            transform.position.y - 30,
            `卸下 ${itemName}`,
            '#ffff00'
          );
        }
      }
    }
  }

  initializeUIPanels() {
    // 角色信息面板（包含装备）
    const piOpts = (this.uiStrategy && this.uiStrategy.getPlayerInfoOptions)
      ? this.uiStrategy.getPlayerInfoOptions() : null;
    this.playerInfoPanel = new PlayerInfoPanel({
      x: 10,
      y: this.logicalHeight - 100 - (piOpts?.height || 580),
      width: piOpts?.width || 320,
      height: piOpts?.height || 580,
      horizontalLayout: piOpts?.horizontalLayout || false,
      // PC 端属性/装备分离：属性面板不显示装备区（装备用独立 EquipmentPanel）
      // 移动端保持属性+装备一体（装备栏 = PlayerInfoPanel）
      showEquipmentSection: this.isMobileLayout,
      visible: false,
      onAttributeAllocate: (player) => {
        console.log('BaseGameScene: 属性加点按钮被点击');
      },
      onEquipmentClick: (slotType, button) => this._handleEquipmentSlotClick(slotType, button)
    });
    // 平台相关布局（移动端装备框底部对齐）
    if (this.uiStrategy.layoutPlayerInfoPanel) {
      this.uiStrategy.layoutPlayerInfoPanel(this.playerInfoPanel, this.logicalWidth, this.logicalHeight);
    }
    
    // 背包面板 - 右下角，底部控制栏上方
    const invOpts = this.uiStrategy.getInventoryOptions ? this.uiStrategy.getInventoryOptions() : null;
    this.inventoryPanel = new InventoryPanel({
      x: this.logicalWidth - (invOpts?.width || 370) - 10,
      y: this.logicalHeight - 100 - (invOpts?.height || 350),
      width: invOpts?.width || 370,
      height: invOpts?.height || 350,
      slotSize: invOpts?.slotSize,
      slotPadding: invOpts?.slotPadding,
      slotsPerRow: invOpts?.slotsPerRow,
      maxVisibleRows: invOpts?.maxVisibleRows,
      filterButtonWidth: invOpts?.filterButtonWidth,
      filterButtonGap: invOpts?.filterButtonGap,
      filterButtonStartX: invOpts?.filterButtonStartX,
      showTooltip: invOpts?.showTooltip,
      visible: false,
      onItemUse: (item, healAmount, manaAmount) => {
        this.onItemUsed(item, healAmount, manaAmount);
      },
      onEquipmentChange: (messages) => {
        this.onEquipmentChanged(messages);
      }
    });
    // 平台相关布局（移动端居中、底部对齐）
    if (this.uiStrategy.layoutInventoryPanel) {
      this.uiStrategy.layoutInventoryPanel(this.inventoryPanel, this.logicalWidth, this.logicalHeight);
    }
    
    // 底部控制栏
    const barOptions = this.uiStrategy.getBottomControlBarOptions();
    this.bottomControlBar = new BottomControlBar({
      x: 0,
      y: this.logicalHeight - 100,
      width: this.logicalWidth,
      height: 100,
      visible: this.uiStrategy.isBottomControlBarVisible(),
      // 平台差异由 UI 策略决定（移动端隐藏血球/蓝球和数字快捷键）
      showOrbs: barOptions.showOrbs,
      showHotkeyNumbers: barOptions.showHotkeyNumbers,
      onSkillClick: (skill) => {
        this.onSkillClicked(skill);
      },
      onPotionUse: (potionType) => {
        this.usePotionFromHotbar(potionType);
      }
    });
    
    // 玩家状态 HUD（左上角：头像 + 昵称 + 血条 + 蓝条）—— 由 UI 策略决定是否显示
    const selectedChar = SelectedCharacterStore.get();
    let avatarSrc = null;
    if (selectedChar && (selectedChar.previewImage || selectedChar.assetImage)) {
      const rel = selectedChar.previewImage ||
        (selectedChar.assetImage && selectedChar.assetImage.path);
      if (rel) {
        avatarSrc = this.assetManager && this.assetManager.resolveAssetPath
          ? this.assetManager.resolveAssetPath(rel.replace(/^assets\//, ''))
          : rel;
      }
    }
    this.playerStatusHUD = new PlayerStatusHUD({
      x: 10,
      y: 10,
      width: 230,
      height: 78,
      visible: this.uiStrategy.isPlayerStatusHUDVisible(),
      avatarSrc: avatarSrc
    });
    
    // 对话框 - 居中显示（移动端缩小宽度）
    const dialogueBoxWidth = this.isMobileLayout ? 500 : 700;
    const dialogueBoxHeight = this.isMobileLayout ? 170 : 230;
    this.dialogueBox = new DialogueBox({
      x: (this.logicalWidth - dialogueBoxWidth) / 2,
      y: this.isMobileLayout 
        ? (this.logicalHeight - dialogueBoxHeight - 60)
        : (this.logicalHeight - dialogueBoxHeight) / 2,
      width: dialogueBoxWidth,
      height: dialogueBoxHeight,
      visible: false,
      zIndex: 200,
      dialogueSystem: this.dialogueSystem,
      portraits: PortraitsConfig,
      onDialogueEnd: () => {
        console.log('BaseGameScene: 对话结束');
      }
    });
    
    // PC 端独立装备面板（属性/装备分离；复用 PlayerInfoPanel 只显示装备区，
    // 保证装备槽命名与属性面板一致；移动端装备仍在 PlayerInfoPanel 内）
    if (!this.isMobileLayout) {
      this.equipmentPanel = new PlayerInfoPanel({
        x: 340,
        y: this.logicalHeight - 100 - 460,
        width: 320,
        height: 460,
        showAttributeSection: false,
        showEquipmentSection: true,
        visible: false,
        onEquipmentClick: (slotType, button) => this._handleEquipmentSlotClick(slotType, button)
      });
    }

    // PC 端功能按钮：属性、装备、背包（移动端用 DOM 按钮，故仅桌面创建）
    if (!this.isMobileLayout) {
      this.charButton = new IconButton({
        x: 834, y: 640, width: 50, height: 50,
        icon: '👤', label: '属性', hotkey: 'C',
        onClick: () => { if (this.playerInfoPanel) this.playerInfoPanel.toggle(); }
      });
      this.equipButton = new IconButton({
        x: 890, y: 640, width: 50, height: 50,
        icon: '🛡️', label: '装备', hotkey: 'V',
        onClick: () => { if (this.equipmentPanel) this.equipmentPanel.toggle(); }
      });
      this.bagButton = new IconButton({
        x: 946, y: 640, width: 50, height: 50,
        icon: '🎒', label: '背包', hotkey: 'B',
        onClick: () => { if (this.inventoryPanel) this.inventoryPanel.toggle(); }
      });
      // 轻功（按下进入瞄准，左键在射程内确认瞬移）
      this.flightButton = new IconButton({
        x: 722, y: 640, width: 50, height: 50,
        icon: '💨', label: '轻功', hotkey: 'Ctrl',
        onClick: () => { this.enterPCAimMode('flight'); }
      });
      // 投掷（按下进入瞄准，左键在射程内确认投掷）
      this.throwButton = new IconButton({
        x: 778, y: 640, width: 50, height: 50,
        icon: '🎯', label: '投掷', hotkey: 'Shift',
        onClick: () => { this.enterPCAimMode('throw'); }
      });
      // 格挡（按下激活格挡防护）
      this.blockButton = new IconButton({
        x: 666, y: 640, width: 50, height: 50,
        icon: '🛡', label: '格挡', hotkey: 'Q',
        onClick: () => { this.activateBlock(); }
      });
    }

    // 注册 UI 元素到 UIClickHandler
    this.uiClickHandler.registerElement(this.inventoryPanel);
    this.uiClickHandler.registerElement(this.playerInfoPanel);
    this.uiClickHandler.registerElement(this.bottomControlBar);
    this.uiClickHandler.registerElement(this.dialogueBox);
    if (this.equipmentPanel) this.uiClickHandler.registerElement(this.equipmentPanel);
    if (this.charButton) this.uiClickHandler.registerElement(this.charButton);
    if (this.equipButton) this.uiClickHandler.registerElement(this.equipButton);
    if (this.bagButton) this.uiClickHandler.registerElement(this.bagButton);
    if (this.flightButton) this.uiClickHandler.registerElement(this.flightButton);
    if (this.throwButton) this.uiClickHandler.registerElement(this.throwButton);
    if (this.blockButton) this.uiClickHandler.registerElement(this.blockButton);
    
    // 注册面板到 UISystem（统一管理悬停等）
    this.uiSystem.registerPanel('inventory', this.inventoryPanel);
    this.uiSystem.registerPanel('playerInfo', this.playerInfoPanel);
    this.uiSystem.registerPanel('bottomControl', this.bottomControlBar);
    this.uiSystem.registerPanel('dialogue', this.dialogueBox);
    
    // PC 功能按钮初始居中（随屏幕宽度自动对齐）
    this.layoutPCFunctionButtons(this.logicalWidth, this.logicalHeight);

    // 应用 UI 编辑器保存的布局（百分比 → 逻辑坐标），覆盖默认位置/大小
    this._applyUILayout();
  }

  /**
   * 加载并应用 UI 编辑器布局（Canvas 面板部分）
   * 异步加载 config/UILayout.{platform}.json，按百分比换算为逻辑坐标。
   * 失败则保持默认布局。
   */
  async _applyUILayout() {
    try {
      this.uiLayoutLoader = new UILayoutLoader({ basePath: 'config/' });
      const ok = await this.uiLayoutLoader.load();
      if (!ok) return;
      const lw = this.logicalWidth;
      const lh = this.logicalHeight;
      const loader = this.uiLayoutLoader;
      // 面板 id 与 UILayout 组件 id 对应
      const map = {
        playerInfoPanel: this.playerInfoPanel,
        inventoryPanel: this.inventoryPanel,
        equipmentPanel: this.equipmentPanel
      };
      for (const [id, panel] of Object.entries(map)) {
        if (panel) loader.applyToCanvasPanel(id, panel, lw, lh);
      }

      // PC 功能按钮：优先用 UI 编辑器保存的布局；编辑器未配置时才自动居中
      const pcFnMap = {
        'pc-block': this.blockButton,
        'pc-flight': this.flightButton,
        'pc-throw': this.throwButton,
        'pc-char': this.charButton,
        'pc-equip': this.equipButton,
        'pc-bag': this.bagButton
      };
      this._pcFnFromEditor = Object.keys(pcFnMap).some(id => loader.getPct(id));
      if (this._pcFnFromEditor) {
        for (const [id, btn] of Object.entries(pcFnMap)) {
          if (btn) loader.applyToCanvasPanel(id, btn, lw, lh);
        }
      }

      // 底部控制栏：优先使用拆分后的独立子控件布局，否则回退整体面板布局
      if (this.bottomControlBar) {
        const barSub = {
          hpOrb: loader.getRect('pc-hp-orb', lw, lh),
          mpOrb: loader.getRect('pc-mp-orb', lw, lh),
          potion1: loader.getRect('pc-potion1', lw, lh),
          potion2: loader.getRect('pc-potion2', lw, lh),
          skill1: loader.getRect('pc-skill1', lw, lh),
          skill2: loader.getRect('pc-skill2', lw, lh),
          skill3: loader.getRect('pc-skill3', lw, lh),
          skill4: loader.getRect('pc-skill4', lw, lh),
          skill5: loader.getRect('pc-skill5', lw, lh)
        };
        const hasBarSub = Object.values(barSub).some(Boolean);
        if (hasBarSub) {
          this.bottomControlBar.applySubLayout(barSub);
        } else {
          loader.applyToCanvasPanel('bottomControlBar', this.bottomControlBar, lw, lh);
        }
      }
      // PlayerStatusHUD 子组件独立布局
      if (this.playerStatusHUD) {
        const avatarRect = loader.getRect('hud-avatar', lw, lh);
        const nameRect = loader.getRect('hud-name', lw, lh);
        const hpRect = loader.getRect('hud-hp', lw, lh);
        const mpRect = loader.getRect('hud-mp', lw, lh);
        if (avatarRect || nameRect || hpRect || mpRect) {
          this.playerStatusHUD.applySubLayout({ avatarRect, nameRect, hpRect, mpRect });
        }
      }
      // 背包面板尺寸变化后需重算筛选按钮/滚动条等内部布局
      if (this.inventoryPanel && this.inventoryPanel.layout) {
        this.inventoryPanel.layout();
      }

      // PC 功能按钮：编辑器未配置时自动居中（编辑器已配置则用上面应用的布局，保持与编辑器一致）
      if (!this._pcFnFromEditor) {
        this.layoutPCFunctionButtons(lw, lh);
      }

      // 加载面板编辑器布局（PanelLayout.json），用数据驱动渲染替代硬编码
      this._applyPanelLayout();
    } catch (e) {
      console.warn('BaseGameScene: 应用 UI 布局失败', e);
    }
  }

  /**
   * 加载面板编辑器的布局配置并应用到各面板
   */
  async _applyPanelLayout() {
    try {
      const panelLoader = new PanelLayoutLoader({ basePath: 'config/' });
      const ok = await panelLoader.load();
      // 应用到属性面板
      if (this.playerInfoPanel && this.playerInfoPanel.applyPanelLayout) {
        const def = ok ? panelLoader.getPanel('playerInfoPanel') : null;
        if (def) this.playerInfoPanel.applyPanelLayout(def);
      }
      // 应用到装备面板
      if (this.equipmentPanel && this.equipmentPanel.applyPanelLayout) {
        const def = ok ? panelLoader.getPanel('equipmentPanel') : null;
        if (def) this.equipmentPanel.applyPanelLayout(def);
      }
      // 应用到背包面板
      if (this.inventoryPanel && this.inventoryPanel.applyPanelLayout) {
        const def = ok ? panelLoader.getPanel('inventoryPanel') : null;
        if (def) this.inventoryPanel.applyPanelLayout(def);
      }
    } catch (e) {
      console.warn('BaseGameScene: 面板布局加载失败，使用默认', e);
    }
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
  }

  /**
   * 装备变化回调
   * @param {Array} messages - 消息数组
   */
  onEquipmentChanged(messages) {
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

  /**
   * 检查技能是否可用（蓝量/冷却），不足则飘字提示
   * @param {Object} skill - 技能对象
   * @returns {boolean} true=可用
   */
  checkSkillUsable(skill) {
    if (!this.playerEntity) return false;
    const stats = this.playerEntity.getComponent('stats');
    const combat = this.playerEntity.getComponent('combat');
    if (!stats || !combat) return false;
    
    const currentTime = performance.now();
    
    // 冷却检查
    if (!combat.canUseSkill(skill.id, currentTime)) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform && this.floatingTextManager) {
        this.floatingTextManager.addText(
          transform.position.x, transform.position.y - 50,
          '技能冷却中', '#888888'
        );
      }
      return false;
    }
    
    // 蓝量检查
    if (skill.manaCost && stats.mp < skill.manaCost) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform && this.floatingTextManager) {
        this.floatingTextManager.addText(
          transform.position.x, transform.position.y - 50,
          `蓝量不足(需${skill.manaCost})`, '#6666ff'
        );
      }
      return false;
    }
    
    return true;
  }

  /**
   * 按技能索引释放技能（用于触屏/虚拟按钮，无鼠标指向时按角色朝向放）
   * @param {number} index - 技能槽索引（对应 combat.skills）
   */
  useSkillByIndex(index) {
    if (!this.playerEntity || !this.combatSystem) return;
    const combat = this.playerEntity.getComponent('combat');
    if (!combat || !combat.skills) return;
    const skill = combat.skills[index];
    if (!skill) return;

    // 前置检查：蓝量和冷却
    if (!this.checkSkillUsable(skill)) return;

    // 自身类技能（治疗/打坐）直接复用通用逻辑
    if (skill.id === 'heal' || skill.id === 'meditation') {
      this.onSkillClicked(skill);
      return;
    }

    // PC：方向类技能按下先进入瞄准模式（鼠标变瞄准圈），左键确认或取消
    if (!this.isMobileLayout) {
      this.enterPCAimMode('skill', index);
      return;
    }

    // 其他技能：以角色当前朝向的前方作为目标点
    const transform = this.playerEntity.getComponent('transform');
    const sprite = this.playerEntity.getComponent('sprite');
    if (!transform) return;

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
    const d = dirMap[sprite?.direction] || { x: 1, y: 0 };
    const range = skill.range || 300;
    const target = {
      x: transform.position.x + d.x * range,
      y: transform.position.y + d.y * range
    };

    const currentTime = performance.now();
    this.combatSystem.tryUseSkillAtPosition(
      this.playerEntity,
      skill,
      target,
      currentTime,
      this.entities
    );
  }

  /**
   * 按指定方向和距离比例释放技能（触屏摇杆瞄准后释放）
   * @param {number} index - 技能索引
   * @param {number} dirX - 方向 X（归一化前）
   * @param {number} dirY - 方向 Y（归一化前）
   * @param {number} [distRatio=1] - 距离比例(0~1)，1=最大射程
   */
  useSkillByDirection(index, dirX, dirY, distRatio, targetWorldPos) {
    if (!this.playerEntity || !this.combatSystem) return;
    const combat = this.playerEntity.getComponent('combat');
    if (!combat || !combat.skills) return;
    const skill = combat.skills[index];
    if (!skill) return;

    // 前置检查：蓝量和冷却
    if (!this.checkSkillUsable(skill)) return;

    // 自身类技能（治疗/打坐）不需要方向
    if (skill.id === 'heal' || skill.id === 'meditation') {
      this.onSkillClicked(skill);
      return;
    }

    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;

    let target;
    if (targetWorldPos) {
      // 使用传入的世界坐标（预览圈位置，不受玩家移动影响）
      target = { x: targetWorldPos.x, y: targetWorldPos.y };
    } else {
      const mag = Math.sqrt(dirX * dirX + dirY * dirY);
      const dx = mag > 0 ? dirX / mag : 1;
      const dy = mag > 0 ? dirY / mag : 0;
      const range = skill.range || 300;
      // 距离比例与预览一致（distRatio 0~1 映射到 0~range）
      const ratio = (distRatio !== undefined) ? Math.min(distRatio, 1.0) : 1.0;
      const actualDist = ratio * range;
      target = {
        x: transform.position.x + dx * actualDist,
        y: transform.position.y + dy * actualDist
      };
    }

    const currentTime = performance.now();
    this.combatSystem.tryUseSkillAtPosition(
      this.playerEntity,
      skill,
      target,
      currentTime,
      this.entities
    );
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
    if (!this.playerEntity) { this.skillAimPreview = null; return; }
    
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) { this.skillAimPreview = null; return; }
    
    let skill, range;
    if (index === -1) {
      // 攻击按钮：区分近战/远程
      const isRanged = this.meleeAttackSystem ? this.meleeAttackSystem.checkIsRangedWeapon() : false;
      if (!isRanged) {
        // 近战攻击不显示瞄准预览
        this.skillAimPreview = null;
        return;
      }
      // 远程攻击：使用武器攻击距离作为射程
      const attackRange = this.meleeAttackSystem ? this.meleeAttackSystem.sliceAttackRange : 100;
      const equipComp = this.playerEntity.getComponent('equipment');
      let weaponAttackDistance = attackRange;
      if (equipComp) {
        const mainhand = equipComp.getEquipment('mainhand');
        if (mainhand && mainhand.attackDistance != null) {
          weaponAttackDistance = mainhand.attackDistance;
        }
      }
      skill = { id: 'ranged_attack', name: '远程攻击', range: weaponAttackDistance, aoeRadius: 20 };
      range = weaponAttackDistance;
    } else if (index === -2) {
      // 投掷按钮
      const throwRange = (this.weaponRenderer && this.weaponRenderer.getThrowRange)
        ? this.weaponRenderer.getThrowRange(this.playerEntity)
        : 480;
      skill = { id: 'throw', name: '投掷', range: throwRange, aoeRadius: 16 };
      range = throwRange;
    } else if (index === -3) {
      // 轻功按钮
      const flightDist = (this.flightSystem && this.flightSystem.config && this.flightSystem.config.maxDistance) || 400;
      skill = { id: 'flight', name: '轻功', range: flightDist, aoeRadius: 24 };
      range = flightDist;
    } else {
      const combat = this.playerEntity.getComponent('combat');
      if (!combat || !combat.skills || !combat.skills[index]) { this.skillAimPreview = null; return; }
      skill = combat.skills[index];
      if (skill.id === 'heal' || skill.id === 'meditation') { this.skillAimPreview = null; return; }
      range = skill.range || 300;
    }
    
    const mag = Math.sqrt(dirX * dirX + dirY * dirY);
    const dx = mag > 0 ? dirX / mag : 0;
    const dy = mag > 0 ? dirY / mag : 0;
    // 拖拽距离映射到实际射程(ratio 0~1 映射到 0~range)
    const actualDist = Math.min(distRatio, 1.5) * range;
    const inRange = distRatio <= 1.0;
    
    // 缓存方向和距离比例，renderSkillAimPreview 每帧用这些值重算位置
    this._aimDirX = dx;
    this._aimDirY = dy;
    this._aimDistRatio = Math.min(distRatio, 1.5);
    
    // 预览圈位置基于锚点（如有）或当前玩家位置
    const baseX = anchorPos ? anchorPos.x : transform.position.x;
    const baseY = anchorPos ? anchorPos.y : transform.position.y;
    
    this.skillAimPreview = {
      skill,
      targetX: baseX + dx * actualDist,
      targetY: baseY + dy * actualDist,
      startX: transform.position.x,
      startY: transform.position.y,
      inRange: inRange,
      color: inRange ? '#00ff00' : '#ff4444'
    };
    
    // 首次设置时初始化显示位置
    if (this._aimDisplayX === 0 && this._aimDisplayY === 0) {
      this._aimDisplayX = this.skillAimPreview.targetX;
      this._aimDisplayY = this.skillAimPreview.targetY;
    }
  }

  /**
   * 清除技能瞄准预览
   */
  clearSkillAimPreview() {
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
    this._pcAimState = { kind, index };
    console.log(`[PCAim] 进入瞄准: kind=${kind}, index=${index}`);
  }

  /** 取消 PC 瞄准模式 */
  cancelPCAimMode() {
    this._pcAimState = null;
    this.clearSkillAimPreview();
  }

  /**
   * 每帧更新 PC 瞄准模式：瞄准圈跟随鼠标；左键在射程内触发、超出取消；右键取消。
   * 必须在拾取/攻击判定之前调用，命中时消费本次点击。
   */
  updatePCAimMode() {
    if (!this._pcAimState || this.isMobileLayout || !this.inputManager) return;
    if (!this.playerEntity) { this.cancelPCAimMode(); return; }
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) { this.cancelPCAimMode(); return; }

    const { kind, index } = this._pcAimState;

    // 计算该动作的最大射程
    let range;
    if (kind === 'flight') {
      range = (this.flightSystem && this.flightSystem.config && this.flightSystem.config.maxDistance) || 400;
    } else if (kind === 'throw') {
      range = (this.weaponRenderer && this.weaponRenderer.getThrowRange)
        ? this.weaponRenderer.getThrowRange(this.playerEntity) : 480;
    } else {
      const combat = this.playerEntity.getComponent('combat');
      const skill = combat && combat.skills ? combat.skills[index] : null;
      if (!skill) { this.cancelPCAimMode(); return; }
      range = skill.range || 300;
    }

    // 鼠标世界坐标 → 相对玩家的方向与距离比例
    const mouseWorld = this.inputManager.getMouseWorldPosition(this.camera);
    const dx = mouseWorld.x - transform.position.x;
    const dy = mouseWorld.y - transform.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const distRatio = range > 0 ? dist / range : 0;

    // 瞄准圈跟随鼠标（绿色=射程内，红色=超出）
    const previewIndex = (kind === 'flight') ? -3 : (kind === 'throw') ? -2 : index;
    this.setSkillAimPreview(previewIndex, dx, dy, distRatio);

    // 左键确认 / 右键取消
    if (this.inputManager.isMouseClicked() && !this.inputManager.isMouseClickHandled()) {
      const btn = this.inputManager.getMouseButton();
      // 点击落在底部功能按钮区域时，不当作确认（交给 UI 处理，便于重新选择技能）
      const mouseScreen = this.inputManager.getMousePosition();
      if (btn === 0 && this._isMouseOverBottomUI(mouseScreen.x, mouseScreen.y)) {
        return;
      }
      this.inputManager.markMouseClickHandled();
      if (btn === 2) {
        // 右键：取消瞄准
        this.cancelPCAimMode();
        return;
      }
      // 左键：射程内触发，超出射程取消
      if (distRatio <= 1.0) {
        if (kind === 'flight') {
          this.flightByDirection(dx, dy, distRatio);
        } else if (kind === 'throw') {
          this.throwByDirection(dx, dy, distRatio);
        } else {
          this.useSkillByDirection(index, dx, dy, distRatio, { x: mouseWorld.x, y: mouseWorld.y });
        }
      }
      this.cancelPCAimMode();
    }
  }

  /**
   * 判断鼠标屏幕坐标是否落在底部功能按钮/技能栏区域
   * @param {number} sx
   * @param {number} sy
   * @returns {boolean}
   */
  _isMouseOverBottomUI(sx, sy) {
    const btns = [this.blockButton, this.flightButton, this.throwButton, this.charButton, this.equipButton, this.bagButton];
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
    const { skill, color } = this.skillAimPreview;
    
    // 每帧用当前玩家位置 + 缓存的方向/距离重算目标位置
    // 这样玩家移动时预览框跟着走（相对方向不变）
    let startX, startY, dispX, dispY;
    if (this.playerEntity) {
      const t = this.playerEntity.getComponent('transform');
      if (t) {
        startX = t.position.x;
        startY = t.position.y;
        const range = skill.range || 300;
        const actualDist = this._aimDistRatio * range;
        dispX = startX + this._aimDirX * actualDist;
        dispY = startY + this._aimDirY * actualDist;
        // 缓存最新世界坐标（释放时用这个作为技能落点）
        this._lastAimWorldX = dispX;
        this._lastAimWorldY = dispY;
      } else {
        return;
      }
    } else {
      return;
    }
    
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = color || '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    
    if (skill.id === 'ice_finger') {
      // 寒冰指：路径 + 终点圆
      const dx = dispX - startX;
      const dy = dispY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const nx = -dy / dist * 15;
        const ny = dx / dist * 15;
        ctx.beginPath();
        ctx.moveTo(startX + nx, startY + ny * 0.5);
        ctx.lineTo(dispX + nx, dispY + ny * 0.5);
        ctx.lineTo(dispX - nx, dispY - ny * 0.5);
        ctx.lineTo(startX - nx, startY - ny * 0.5);
        ctx.closePath();
        ctx.stroke();
      }
      // 终点圆
      ctx.beginPath();
      ctx.ellipse(dispX, dispY, 50, 25, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (skill.id === 'ranged_attack') {
      // 远程攻击：在中心箭矢落点处画小圆（指示目标位置）
      const radius = skill.aoeRadius || 20;
      ctx.beginPath();
      ctx.ellipse(dispX, dispY, radius, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // 圆形 AOE（火焰掌/烈焰掌等）
      const radius = skill.aoeRadius || 150;
      ctx.beginPath();
      ctx.ellipse(dispX, dispY, radius, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // 十字准心
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(dispX - 8, dispY);
    ctx.lineTo(dispX + 8, dispY);
    ctx.moveTo(dispX, dispY - 4);
    ctx.lineTo(dispX, dispY + 4);
    ctx.stroke();
    
    ctx.restore();
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

  /**
   * 触屏：按角色朝向发起一次扇形攻击（复用 MeleeAttackSystem）
   * 仅在战斗状态下挥砍，非战斗时不产生刀光（交互由按钮另行派发 e/n）
   */
  attackByFacing() {
    if (!this.playerEntity || !this.meleeAttackSystem) return;
    // 非战斗状态不挥砍，避免无意义的刀光特效
    if (!this.combatSystem || !this.combatSystem.isInCombat || !this.combatSystem.isInCombat()) {
      return;
    }
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    const sprite = this.playerEntity.getComponent('sprite');
    const spriteHeight = sprite?.height || 64;
    const playerCenter = {
      x: transform.position.x,
      y: transform.position.y - spriteHeight / 2
    };
    const d = this.getPlayerFacingVector();
    // 设定攻击方向并执行（复用系统内部的扇形攻击）
    this.meleeAttackSystem.setPlayerEntity(this.playerEntity);
    this.meleeAttackSystem.setEntities(this.entities);
    this.meleeAttackSystem.sectorDirection = Math.atan2(d.y, d.x);
    this.meleeAttackSystem.sectorIsRanged = this.meleeAttackSystem.checkIsRangedWeapon();
    this.meleeAttackSystem.performSectorAttack(playerCenter, performance.now() / 1000);
  }

  /**
   * 触屏：按指定方向发起扇形攻击（瞄准后释放）
   * @param {number} dirX - 方向 X
   * @param {number} dirY - 方向 Y
   * @param {number} [distRatio=1] - 距离比例(未用于攻击距离,但保持接口一致)
   */
  attackByDirection(dirX, dirY, distRatio) {
    if (!this.playerEntity || !this.meleeAttackSystem) return;
    if (!this.combatSystem || !this.combatSystem.isInCombat || !this.combatSystem.isInCombat()) {
      return;
    }
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    const sprite = this.playerEntity.getComponent('sprite');
    const spriteHeight = sprite?.height || 64;
    const playerCenter = {
      x: transform.position.x,
      y: transform.position.y - spriteHeight / 2
    };
    const mag = Math.sqrt(dirX * dirX + dirY * dirY);
    const angle = mag > 0 ? Math.atan2(dirY, dirX) : Math.atan2(0, 1);
    this.meleeAttackSystem.setPlayerEntity(this.playerEntity);
    this.meleeAttackSystem.setEntities(this.entities);
    // 锁定攻击方向为手指指定方向
    this.meleeAttackSystem.sectorDirection = angle;
    this.meleeAttackSystem.sectorDirectionLocked = true;
    this.meleeAttackSystem.sectorIsRanged = this.meleeAttackSystem.checkIsRangedWeapon();
    
    // 按 distRatio 缩放攻击距离(选定多远就打多远,而非总是满射程)
    const ratio = (distRatio !== undefined && distRatio > 0) ? Math.min(distRatio, 1.0) : 1.0;
    // 获取武器实际攻击距离
    let weaponDist = this.meleeAttackSystem.sliceAttackRange;
    const equipComp = this.playerEntity.getComponent('equipment');
    if (equipComp) {
      const mainhand = equipComp.getEquipment('mainhand');
      if (mainhand && mainhand.attackDistance != null) {
        weaponDist = mainhand.attackDistance;
      }
    }
    const overrideDist = Math.round(weaponDist * ratio);
    
    this.meleeAttackSystem.performSectorAttack(playerCenter, performance.now() / 1000, overrideDist);
  }

  /**
   * 触屏：按角色朝向施展轻功（复用 FlightSystem）
   */
  flightByFacing() {
    if (!this.flightSystem || !this.playerEntity) return;
    if (this.flightSystem.isPlayerFlying && this.flightSystem.isPlayerFlying()) return;
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    const d = this.getPlayerFacingVector();
    const distance = (this.flightSystem.config && this.flightSystem.config.maxDistance) || 400;
    const targetX = transform.position.x + d.x * distance;
    const targetY = transform.position.y + d.y * distance;
    this.flightSystem.startFlight(transform, targetX, targetY);
  }

  /**
   * 触屏：按指定方向施展轻功（瞄准模式）
   * @param {number} dirX - 拖拽方向 X
   * @param {number} dirY - 拖拽方向 Y
   * @param {number} distRatio - 距离比例 0~1（拖拽距离/瞄准圈半径）
   */
  flightByDirection(dirX, dirY, distRatio) {
    if (!this.flightSystem || !this.playerEntity) return;
    if (this.flightSystem.isPlayerFlying && this.flightSystem.isPlayerFlying()) return;
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    const mag = Math.sqrt(dirX * dirX + dirY * dirY);
    if (mag < 1) { this.flightByFacing(); return; }
    const nx = dirX / mag;
    const ny = dirY / mag;
    const maxDistance = (this.flightSystem.config && this.flightSystem.config.maxDistance) || 400;
    const ratio = Math.min(distRatio, 1.0);
    const distance = maxDistance * ratio;
    const targetX = transform.position.x + nx * distance;
    const targetY = transform.position.y + ny * distance;
    this.flightSystem.startFlight(transform, targetX, targetY);
  }

  /**
   * 触屏：按角色朝向投掷武器（复用 WeaponRenderer.throwWeapon）
   */
  throwByFacing() {
    if (!this.weaponRenderer || !this.playerEntity) return;
    if (this.weaponRenderer.isWeaponThrown && this.weaponRenderer.isWeaponThrown()) return;
    const equipment = this.playerEntity.getComponent('equipment');
    if (!equipment || !equipment.slots.mainhand) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform && this.floatingTextManager) {
        this.floatingTextManager.addText(
          transform.position.x, transform.position.y - 50, '没有可投掷的武器', '#ff6666'
        );
      }
      return;
    }
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    const d = this.getPlayerFacingVector();
    const range = this.weaponRenderer.getThrowRange
      ? this.weaponRenderer.getThrowRange(this.playerEntity)
      : 480;
    const targetPos = {
      x: transform.position.x + d.x * range,
      y: transform.position.y + d.y * range
    };
    this.weaponRenderer.throwWeapon(
      this.playerEntity,
      null,
      transform.position,
      targetPos,
      performance.now() / 1000
    );
  }

  /**
   * 触屏：按指定方向投掷武器（瞄准模式）
   * @param {number} dirX - 拖拽方向 X
   * @param {number} dirY - 拖拽方向 Y
   * @param {number} distRatio - 距离比例 0~1（拖拽距离/瞄准圈半径）
   */
  throwByDirection(dirX, dirY, distRatio) {
    if (!this.weaponRenderer || !this.playerEntity) return;
    if (this.weaponRenderer.isWeaponThrown && this.weaponRenderer.isWeaponThrown()) return;
    const equipment = this.playerEntity.getComponent('equipment');
    if (!equipment || !equipment.slots.mainhand) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform && this.floatingTextManager) {
        this.floatingTextManager.addText(
          transform.position.x, transform.position.y - 50, '没有可投掷的武器', '#ff6666'
        );
      }
      return;
    }
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    const mag = Math.sqrt(dirX * dirX + dirY * dirY);
    if (mag < 1) { this.throwByFacing(); return; }
    const nx = dirX / mag;
    const ny = dirY / mag;
    const maxRange = this.weaponRenderer.getThrowRange
      ? this.weaponRenderer.getThrowRange(this.playerEntity)
      : 480;
    const ratio = Math.min(distRatio, 1.0);
    const range = maxRange * ratio;
    const targetPos = {
      x: transform.position.x + nx * range,
      y: transform.position.y + ny * range
    };
    this.weaponRenderer.throwWeapon(
      this.playerEntity,
      null,
      transform.position,
      targetPos,
      performance.now() / 1000
    );
  }

  /**
   * 触屏：激活主动格挡（挡住攻击1秒，冷却8秒）
   * @returns {boolean} 是否成功激活
   */
  activateBlock() {
    if (!this.combatSystem || !this.playerEntity) return false;
    return this.combatSystem.activateBlock();
  }

  /**
   * 从快捷栏使用药水
   * @param {string} potionType - 'health' 或 'mana'
   */
  usePotionFromHotbar(potionType) {
    if (!this.playerEntity) return;
    
    const inventory = this.playerEntity.getComponent('inventory');
    const stats = this.playerEntity.getComponent('stats');
    if (!inventory || !stats) return;
    
    const effectType = potionType === 'health' ? 'heal' : 'restore_mana';
    
    // 在背包中查找对应效果的消耗品
    const items = inventory.getAllItems();
    let potionSlotIndex = -1;
    
    for (const { slot, index } of items) {
      if (slot.item && slot.item.type === 'consumable' && slot.item.usable &&
          slot.item.effect && slot.item.effect.type === effectType) {
        potionSlotIndex = index;
        break;
      }
    }
    
    if (potionSlotIndex === -1) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform && this.floatingTextManager) {
        const name = potionType === 'health' ? '生命药水' : '魔法药水';
        this.floatingTextManager.addText(
          transform.position.x,
          transform.position.y - 50,
          `没有${name}`,
          '#ff6666'
        );
      }
      return;
    }
    
    // 复用 InventoryPanel 的使用逻辑
    if (this.inventoryPanel) {
      this.inventoryPanel.useItem(potionSlotIndex);
    }
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

  /**
   * PC 功能按钮（轻功/投掷/属性/装备/背包）作为一组水平居中
   * 与底部技能栏一致：随屏幕宽度自动居中，保持相对顺序与间距
   * @param {number} width - 逻辑宽度
   * @param {number} height - 逻辑高度
   */
  layoutPCFunctionButtons(width, height) {
    const btns = [this.blockButton, this.flightButton, this.throwButton, this.charButton, this.equipButton, this.bagButton]
      .filter(Boolean);
    if (btns.length === 0) return;
    const bw = btns[0].width || 50;
    const gap = 6;
    const totalWidth = btns.length * bw + (btns.length - 1) * gap;
    let x = Math.round(width / 2 - totalWidth / 2);
    const y = Math.round(height - 80); // 距底部固定偏移（1280×720 设计下即 y=640）
    for (const b of btns) {
      b.x = x;
      b.y = y;
      x += bw + gap;
    }
  }

  /**
   * 窗口大小变化时更新逻辑尺寸和相关系统
   * @param {number} width - 新宽度
   * @param {number} height - 新高度
   */
  onResize(width, height) {
    this.logicalWidth = width;
    this.logicalHeight = height;
    
    if (this.isometricRenderer) {
      this.isometricRenderer.canvasWidth = width;
      this.isometricRenderer.canvasHeight = height;
    }
    if (this.camera) {
      this.camera.width = width;
      this.camera.height = height;
    }
    
    // 更新底部控制栏位置
    if (this.bottomControlBar) {
      this.bottomControlBar.width = width;
      this.bottomControlBar.x = 0;
      this.bottomControlBar.y = height - this.bottomControlBar.height;
      
      // 重新计算槽位居中
      const slotSize = this.bottomControlBar.skillSlots[0]?.size || 40;
      const slotGap = 6;
      const totalSlots = this.bottomControlBar.skillSlots.length;
      const totalWidth = totalSlots * slotSize + (totalSlots - 1) * slotGap;
      const startX = width / 2 - totalWidth / 2 + slotSize / 2;
      for (let i = 0; i < totalSlots; i++) {
        this.bottomControlBar.skillSlots[i].x = startX + i * (slotSize + slotGap);
      }
      
      // 重新计算红蓝球位置（紧贴技能槽两侧）
      const orbRadius = this.bottomControlBar.hpOrb.radius;
      const orbGap = 10;
      const slotsLeftEdge = width / 2 - totalWidth / 2;
      const slotsRightEdge = width / 2 + totalWidth / 2;
      this.bottomControlBar.hpOrb.x = slotsLeftEdge - orbGap - orbRadius;
      this.bottomControlBar.mpOrb.x = slotsRightEdge + orbGap + orbRadius;
    }

    // PC 功能按钮：编辑器已配置则按百分比重算（与编辑器一致），否则随屏幕宽度自动居中
    if (this._pcFnFromEditor && this.uiLayoutLoader) {
      const loader = this.uiLayoutLoader;
      const pcFnMap = {
        'pc-block': this.blockButton,
        'pc-flight': this.flightButton,
        'pc-throw': this.throwButton,
        'pc-char': this.charButton,
        'pc-equip': this.equipButton,
        'pc-bag': this.bagButton
      };
      for (const [id, btn] of Object.entries(pcFnMap)) {
        if (btn) loader.applyToCanvasPanel(id, btn, width, height);
      }
    } else {
      this.layoutPCFunctionButtons(width, height);
    }
    
    // 更新角色信息面板位置（左下角，底部控制栏上方）
    if (this.playerInfoPanel) {
      if (this.uiStrategy && this.uiStrategy.layoutPlayerInfoPanel &&
          this.uiStrategy.platform === 'mobile') {
        this.uiStrategy.layoutPlayerInfoPanel(this.playerInfoPanel, width, height);
      } else {
        this.playerInfoPanel.x = 10;
        this.playerInfoPanel.y = height - 100 - this.playerInfoPanel.height;
      }
    }
    
    // 更新背包面板位置
    if (this.inventoryPanel) {
      if (this.uiStrategy && this.uiStrategy.layoutInventoryPanel &&
          this.uiStrategy.platform === 'mobile') {
        // 移动端：居中、底部对齐
        this.uiStrategy.layoutInventoryPanel(this.inventoryPanel, width, height);
      } else {
        // 桌面：右下角，底部控制栏上方
        this.inventoryPanel.x = width - this.inventoryPanel.width - 10;
        this.inventoryPanel.y = height - 100 - this.inventoryPanel.height;
      }
    }
    
    // 玩家状态 HUD 由 UI 策略负责布局（移动端左上角）
    if (this.playerStatusHUD && this.uiStrategy) {
      this.uiStrategy.layoutPlayerStatusHUD(this.playerStatusHUD, width, height);
    }
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
    this.inventoryPanel.setEntity(this.playerEntity);
    this.inventoryPanel.setInputManager(this.inputManager);
    this.playerInfoPanel.setPlayer(this.playerEntity);
    if (this.equipmentPanel) this.equipmentPanel.setPlayer(this.playerEntity);
    this.bottomControlBar.setEntity(this.playerEntity);
    if (this.playerStatusHUD) {
      this.playerStatusHUD.setPlayer(this.playerEntity);
    }
    
    console.log('BaseGameScene: 创建玩家实体', this.playerEntity);
  }

  /**
   * 绑定UI面板到玩家实体
   */
  bindUIPanelsToPlayer() {
    if (!this.playerEntity) return;
    
    // 设置相机跟随玩家
    const transform = this.playerEntity.getComponent('transform');
    if (transform && this.camera) {
      this.camera.setTarget(transform);
      // 立即设置相机位置到玩家位置，避免初始时的视野偏移
      this.camera.setPosition(transform.position.x, transform.position.y);
    }
    
    // 设置各系统的玩家实体
    if (this.combatSystem) {
      this.combatSystem.setPlayerEntity(this.playerEntity);
    }
    if (this.movementSystem) {
      this.movementSystem.setPlayerEntity(this.playerEntity);
    }
    if (this.inventoryPanel) {
      this.inventoryPanel.setEntity(this.playerEntity);
      this.inventoryPanel.setInputManager(this.inputManager);
    }
    if (this.playerInfoPanel) {
      this.playerInfoPanel.setPlayer(this.playerEntity);
    }
    if (this.equipmentPanel) {
      this.equipmentPanel.setPlayer(this.playerEntity);
    }
    if (this.bottomControlBar) {
      this.bottomControlBar.setEntity(this.playerEntity);
    }
    if (this.playerStatusHUD) {
      this.playerStatusHUD.setPlayer(this.playerEntity);
    }
    
    console.log('BaseGameScene: UI面板已绑定到玩家实体');
  }


  /**
   * 更新场景
   */
  update(deltaTime) {
    if (!this.isActive || this.isPaused) return;
    
    // 通用：按 N 切幕检测（必须在 inputManager.update 之前，否则按键被清除）
    this._updatePromptSwitch();
    
    // 性能监控：开始计时
    const updateStartTime = performance.now();
    
    // 调试：输出update调用
    if (this._debugNextUpdate) {
      console.log('【更新】update方法被调用, deltaTime=', deltaTime);
      this._debugNextUpdate = false;
    }
    
    // 更新场景过渡
    if (this.isTransitioning) {
      this.updateTransition(deltaTime);
      // 过渡期间不更新其他逻辑
      if (this.transitionPhase === 'show_text' || this.transitionPhase === 'switch_scene') {
        return;
      }
    }
    
    // 更新性能优化器
    this.performanceOptimizer.update();
    
    // 更新空间分区网格
    this.performanceOptimizer.updateSpatialGrid(this.entities);
    
    // 更新相机
    this.camera.update(deltaTime);
    
    // 相机后处理钩子（子类可覆盖，如限制相机在盆地范围内）
    this.postCameraUpdate();
    
    // 更新武器渲染器的鼠标角度（保留用于攻击范围计算）
    if (this.weaponRenderer && this.playerEntity && this.inputManager) {
      const mouseWorldPos = this.inputManager.getMouseWorldPosition(this.camera);
      const transform = this.playerEntity.getComponent('transform');
      if (transform) {
        const currentTime = performance.now() / 1000;
        const sprite = this.playerEntity.getComponent('sprite');
        const spriteHeight = sprite?.height || 64;
        const playerCenter = {
          x: transform.position.x,
          y: transform.position.y - spriteHeight / 2
        };
        this.weaponRenderer.updateMouseAngle(mouseWorldPos, playerCenter, currentTime);

        // PC：按下 Ctrl 进入轻功瞄准、Shift 进入投掷瞄准（随后左键确认）
        if (!this.isMobileLayout) {
          if (this.inputManager.isKeyPressed('ctrl')) {
            this.enterPCAimMode('flight');
          } else if (this.inputManager.isKeyPressed('shift')) {
            this.enterPCAimMode('throw');
          }
        }

        // PC 瞄准模式：技能3/4/5、轻功、投掷按下后进入瞄准，左键确认/取消
        // （须在拾取/攻击判定之前，命中时消费本次点击，避免误触发攻击/拾取）
        this.updatePCAimMode();

        // PC 左键点击地上物品：优先拾取（须在攻击判定之前，避免误触发攻击）
        this.handlePickupClick();
        
        // 水果忍者式滑动攻击检测（通过 MeleeAttackSystem）
        this.meleeAttackSystem.setPlayerEntity(this.playerEntity);
        this.meleeAttackSystem.setEntities(this.entities);
        this.meleeAttackSystem.update(mouseWorldPos, playerCenter, currentTime);
      }
    }
    
    // 更新所有实体
    for (const entity of this.entities) {
      entity.update(deltaTime);
    }
    
    // UI 点击处理
    this.handleUIClick();
    
    // 右键点击调试：显示光圈 + 输出坐标日志
    if (this.inputManager.isMouseClicked() && 
        this.inputManager.getMouseButton() === 2 &&
        !this.inputManager.isMouseClickHandled()) {
      this._debugRightClick();
    }
    
    // 旧的 Ctrl+左键瞬移已改为：按 Ctrl 进入轻功瞄准、左键确认（见 updatePCAimMode）
    // this.handleTeleport();

    // 更新 PC 轻功/投掷按钮的冷却显示
    if (this.flightButton && this.flightSystem && this.flightSystem.getCooldownRemaining) {
      this.flightButton.setCooldown(this.flightSystem.getCooldownRemaining(), this.flightSystem.getCooldownTotal());
    }
    if (this.throwButton && this.weaponRenderer && this.weaponRenderer.getThrowCooldownRemaining) {
      this.throwButton.setCooldown(this.weaponRenderer.getThrowCooldownRemaining(), this.weaponRenderer.getThrowCooldownTotal());
    }
    if (this.blockButton && this.combatSystem && this.combatSystem.getBlockCooldownRemaining) {
      this.blockButton.setCooldown(this.combatSystem.getBlockCooldownRemaining(), this.combatSystem.getBlockCooldownTotal());
    }
    
    // 更新轻功飞行系统
    if (this.flightSystem && this.playerEntity) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform) {
        this.flightSystem.update(deltaTime, transform);
      }
    }
    
    // 更新移动系统（打坐时禁止玩家移动）
    if (this.meditationSystem.isActive() && this.playerEntity) {
      // 打坐时只更新非玩家实体
      const nonPlayerEntities = this.entities.filter(e => e !== this.playerEntity);
      this.movementSystem.update(deltaTime, nonPlayerEntities);
      
      // 移动中断检测由 meditationSystem.update 处理
    } else {
      // 正常更新所有实体
      this.movementSystem.update(deltaTime, this.entities);
    }
    
    // 检查实体之间的碰撞
    this.collisionSystem.update(this.entities);
    
    // 检查地形碰撞（编辑器场景有 terrain 时生效）
    this.checkTerrainCollision();
    
    // 处理敌人选中
    this.handleEnemySelection();
    
    // 更新AI系统（使用节流）
    if (this.performanceOptimizer.shouldUpdate('ai')) {
      this.aiSystem.update(deltaTime, this.entities, this.combatSystem);
    }
    
    // 更新战斗系统
    this.combatSystem.update(deltaTime, this.entities);
    
    // 更新战斗状态（通过 CombatSystem）
    this.combatSystem.updateCombatState(deltaTime, this.entities);
    
    // 更新打坐状态（通过冥想系统）
    this.meditationSystem.update(deltaTime, this.playerEntity);
    
    // 更新装备系统
    this.equipmentSystem.update(deltaTime, this.entities);
    
    // 更新序章系统
    this.tutorialSystem.update(deltaTime, this.getGameState());
    this.dialogueSystem.update(deltaTime);
    this.questSystem.update(deltaTime);
    // 数据驱动触发器（timer 类）——仅当场景调用过 initGameLoader 才存在
    if (this.gameLoader) this.gameLoader.update(deltaTime);
    
    // 更新特效（使用节流）
    if (this.performanceOptimizer.shouldUpdate('effects')) {
      this.combatEffects.update(deltaTime);
      this.skillEffects.update(deltaTime);
    }
    this.floatingTextManager.update(deltaTime);
    this.particleSystem.update(deltaTime);
    
    // 更新武器渲染器
    if (this.weaponRenderer) {
      const currentTime = performance.now() / 1000; // 转换为秒
      this.weaponRenderer.update(deltaTime, currentTime);
    }
    
    // 更新敌人武器渲染器
    if (this.enemyWeaponRenderer) {
      this.enemyWeaponRenderer.update(deltaTime);
      
      // 检查武器飞行路径上的碰撞
      if (this.weaponRenderer.thrownWeapon.flying) {
        this.weaponRenderer.checkThrowPathCollision(this.entities, (enemy, isFinalTarget) => {
          // 计算伤害
          const stats = this.playerEntity.getComponent('stats');
          if (!stats) return;
          
          const baseDamage = stats.attack || 15;
          let damageMultiplier = 0.3; // 路径上的敌人30%伤害
          let damageText = '投掷伤害 30%';
          let damageColor = '#ffaa00';
          
          if (isFinalTarget) {
            damageMultiplier = 3.0; // 最终目标300%伤害
            damageText = '投掷伤害 300%';
            damageColor = '#ff0000';
          }
          
          const finalDamage = Math.floor(baseDamage * damageMultiplier);
          
          // 计算击退方向
          const playerTransform = this.playerEntity.getComponent('transform');
          const enemyTransform = enemy.getComponent('transform');
          if (playerTransform && enemyTransform) {
            const dx = enemyTransform.position.x - playerTransform.position.x;
            const dy = enemyTransform.position.y - playerTransform.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const knockbackDir = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
            
            // 应用伤害
            this.combatSystem.applyDamage(enemy, finalDamage, knockbackDir);
            
            // 显示伤害提示
            this.floatingTextManager.addText(
              enemyTransform.position.x,
              enemyTransform.position.y - 60,
              damageText,
              damageColor
            );
          }
        });
      }
      
      // 检查武器拾取
      if (this.weaponRenderer.isWeaponThrown() && !this.weaponRenderer.thrownWeapon.flying) {
        this.pickupSystem.checkWeaponPickup(this.playerEntity);
      }
    }
    
    // 检查空格键继续对话
    this.checkDialogueContinue();
    
    // 更新面板（使用节流）
    if (this.performanceOptimizer.shouldUpdate('ui')) {
      this.inventoryPanel.update(deltaTime);
      this.playerInfoPanel.update(deltaTime);
      if (this.equipmentPanel) this.equipmentPanel.update(deltaTime);
      this.bottomControlBar.update(deltaTime);
      if (this.playerStatusHUD) {
        this.playerStatusHUD.update(deltaTime);
      }
    }
    
    // 更新对话框 - 根据对话系统状态显示/隐藏
    if (this.dialogueBox && this.dialogueSystem) {
      const isDialogueActive = this.dialogueSystem.isDialogueActive();
      if (isDialogueActive && !this.dialogueBox.visible) {
        this.dialogueBox.show();
      } else if (!isDialogueActive && this.dialogueBox.visible) {
        this.dialogueBox.hide();
      }
      this.dialogueBox.update(deltaTime);
    }
    
    // 更新鼠标悬停状态
    this.updatePanelHover();
    
    // 检查拾取（使用拾取系统）
    const pickupResult = this.pickupSystem.update(
      this.playerEntity, this.pickupItems, this.equipmentItems, this.entities
    );
    // 移除已拾取的掉落物实体
    for (const removed of pickupResult.removedEntities) {
      this.entities = this.entities.filter(e => e !== removed);
    }
    
    // 移除死亡实体
    this.removeDeadEntities();
    
    // 更新输入管理器
    this.inputManager.update();
    
    // 性能监控：结束计时并更新
    const updateEndTime = performance.now();
    const updateTime = updateEndTime - updateStartTime;
    
    // 更新性能监控器
    this.performanceMonitor.update(deltaTime, {
      entityCount: this.entities.length,
      visibleEntityCount: this.isometricRenderer ? this.isometricRenderer.cullEntities(this.entities).length : 0,
      particleCount: this.particleSystem.getActiveCount(),
      poolStats: this.performanceOptimizer.getPoolStats(),
      updateTime: updateTime
    });
  }

  /**
   * 开始场景过渡
   */
  startTransition(mainText = '场景切换中...', subText = '') {
    console.log('BaseGameScene: 开始场景过渡');
    this.isTransitioning = true;
    this.transitionPhase = 'fade_out';
    this.transitionTimer = 0;
    this.transitionAlpha = 0;
    this.transitionText = { main: mainText, sub: subText };
  }

  /**
   * 更新场景过渡
   */
  updateTransition(deltaTime) {
    this.transitionTimer += deltaTime;
    
    if (this.transitionPhase === 'fade_out') {
      this.transitionAlpha = Math.min(1, this.transitionTimer / this.transitionDuration);
      if (this.transitionAlpha >= 1) {
        this.transitionPhase = 'show_text';
        this.transitionTimer = 0;
      }
    } else if (this.transitionPhase === 'show_text') {
      if (this.transitionTimer >= this.textDisplayDuration) {
        this.transitionPhase = 'switch_scene';
        this.switchToNextScene();
      }
    }
  }

  /**
   * 渲染场景过渡
   */
  renderTransition(ctx) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${this.transitionAlpha})`;
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    
    if (this.transitionPhase === 'show_text') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.transitionText.main, this.logicalWidth / 2, this.logicalHeight / 2 - 30);
      
      if (this.transitionText.sub) {
        ctx.font = '24px Arial';
        ctx.fillText(this.transitionText.sub, this.logicalWidth / 2, this.logicalHeight / 2 + 30);
      }
    }
    
    ctx.restore();
  }

  /**
   * 处理 UI 点击
   */
  handleUIClick() {
    if (this.inputManager.isMouseClicked() && !this.inputManager.isMouseClickHandled()) {
      const mousePos = this.inputManager.getMousePosition();
      const button = this.inputManager.getMouseButton() === 2 ? 'right' : 'left';
      
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
        // UI 没有处理点击（点在面板外部）
        // 如果有面板打开,点击外部则关闭
        let closedPanel = false;
        if (this.inventoryPanel && this.inventoryPanel.visible) {
          this.inventoryPanel.hide();
          closedPanel = true;
        }
        if (this.playerInfoPanel && this.playerInfoPanel.visible) {
          this.playerInfoPanel.hide();
          closedPanel = true;
        }
        if (closedPanel) {
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
    this._clickRings.push({
      x: targetPos.x,
      y: targetPos.y,
      screenX: mouseScreen.x,
      screenY: mouseScreen.y,
      playerX: playerPos ? playerPos.x : 0,
      playerY: playerPos ? playerPos.y : 0,
      startTime: performance.now(),
      duration: 800
    });
  }

  /**
   * 渲染右键点击光圈（在世界坐标系中调用）
   */
  _renderClickRings(ctx) {
    if (!this._clickRings || this._clickRings.length === 0) return;
    const now = performance.now();
    
    this._clickRings = this._clickRings.filter(ring => now - ring.startTime < ring.duration);
    
    for (const ring of this._clickRings) {
      const elapsed = now - ring.startTime;
      const progress = elapsed / ring.duration;
      
      // === 绿色光圈：2.5D 椭圆形，先放大后缩小 ===
      const alpha = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2; // 后半段淡出
      
      // 尺寸：前半段放大，后半段缩小
      let sizeFactor;
      if (progress < 0.3) {
        // 快速放大（easeOut）
        const t = progress / 0.3;
        sizeFactor = 1 - Math.pow(1 - t, 3);
      } else {
        // 缓慢缩小
        const t = (progress - 0.3) / 0.7;
        sizeFactor = 1 - t * 0.7;
      }
      
      const radiusX = 25 * sizeFactor;
      const radiusY = radiusX * 0.5; // 2.5D 压扁
      
      if (radiusX < 2) continue;
      
      ctx.save();
      // 外圈
      ctx.strokeStyle = `rgba(0, 255, 128, ${alpha * 0.9})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
      
      // 内圈（跟随缩小但更小）
      const innerRX = radiusX * 0.5;
      const innerRY = innerRX * 0.5;
      if (innerRX > 2) {
        ctx.strokeStyle = `rgba(200, 255, 200, ${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(ring.x, ring.y, innerRX, innerRY, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      
      // === debug 模式：附加标签和玩家位置标记 ===
      if (this.debugMode) {
        ctx.save();
        ctx.fillStyle = `rgba(0, 255, 128, ${alpha})`;
        ctx.font = '12px Arial';
        ctx.fillText(`目标(${ring.x.toFixed(0)},${ring.y.toFixed(0)})`, ring.x + 15, ring.y - 5);
        ctx.restore();
        
        // 蓝色方块：玩家位置
        ctx.save();
        ctx.strokeStyle = `rgba(50, 150, 255, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(ring.playerX - 8, ring.playerY - 8, 16, 16);
        ctx.fillStyle = `rgba(50, 150, 255, ${alpha})`;
        ctx.font = '12px Arial';
        ctx.fillText(`玩家(${ring.playerX.toFixed(0)},${ring.playerY.toFixed(0)})`, ring.playerX + 15, ring.playerY - 10);
        ctx.restore();
      }
    }
  }

  /**
   * 渲染鼠标点击屏幕标记（debug 模式，在屏幕坐标系中调用）
   */
  _renderClickScreenMarkers(ctx) {
    if (!this.debugMode) return;
    if (!this._clickRings || this._clickRings.length === 0) return;
    const now = performance.now();
    
    for (const ring of this._clickRings) {
      const elapsed = now - ring.startTime;
      const progress = elapsed / ring.duration;
      const alpha = 1 - progress;
      
      // 红色十字：鼠标实际点击的屏幕位置
      const sx = ring.screenX;
      const sy = ring.screenY;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx - 15, sy);
      ctx.lineTo(sx + 15, sy);
      ctx.moveTo(sx, sy - 15);
      ctx.lineTo(sx, sy + 15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
      ctx.font = 'bold 12px Arial';
      ctx.fillText(`鼠标(${sx.toFixed(0)},${sy.toFixed(0)})`, sx + 15, sy - 10);
      ctx.restore();
    }
  }

  /**
   * 处理武器投掷
   */
  handleWeaponThrow() {
    if (!this.weaponRenderer || !this.playerEntity) return;
    
    // 检查是否已经投掷了武器
    if (this.weaponRenderer.isWeaponThrown()) {
      return;
    }
    
    // 检查是否有主手武器
    const equipment = this.playerEntity.getComponent('equipment');
    if (!equipment || !equipment.slots.mainhand) {
      return;
    }
    
    // 获取鼠标世界坐标
    const mouseWorldPos = this.inputManager.getMouseWorldPosition(this.camera);
    
    // 查找点击位置的敌人（作为最终目标）
    const clickedEnemy = this.combatSystem.findEnemyAtPosition(mouseWorldPos, this.entities);
    
    // 获取玩家位置
    const playerTransform = this.playerEntity.getComponent('transform');
    if (!playerTransform) return;
    
    // 确定投掷目标位置
    let targetPos = mouseWorldPos;
    if (clickedEnemy) {
      const targetTransform = clickedEnemy.getComponent('transform');
      if (targetTransform) {
        targetPos = targetTransform.position;
      }
    }
    
    // 投掷武器
    const success = this.weaponRenderer.throwWeapon(
      this.playerEntity,
      clickedEnemy, // 可能为null
      playerTransform.position,
      targetPos,
      performance.now() / 1000 // 当前时间（秒）
    );
    
    if (success) {
      console.log('BaseGameScene: 武器投掷成功', clickedEnemy ? '目标敌人' : '自由投掷');
      this.inputManager.markMouseClickHandled();
    }
  }


  handleEnemySelection() {
    // 不再需要选中敌人，使用滑动攻击
  }

  /**
   * 处理自动攻击（鼠标移动时）
   * @param {number} currentTime - 当前时间（秒）
   */
  handleAutoAttack(currentTime) {
    if (!this.combatSystem || !this.playerEntity || !this.weaponRenderer) return;
    
    // 如果武器被投掷出去，不能进行自动攻击
    if (this.weaponRenderer.isWeaponThrown()) {
      return;
    }
    
    // 如果武器被禁用（武器碰撞失败），不能进行自动攻击
    if (this.weaponRenderer.disabled && this.weaponRenderer.disabled.active) {
      const now = performance.now();
      if (now < this.weaponRenderer.disabled.endTime) {
        return;
      } else {
        this.weaponRenderer.disabled.active = false;
      }
    }
    
    // 获取攻击类型和速度
    const attackTypeName = this.weaponRenderer.getAttackTypeName();
    const speedKmh = this.weaponRenderer.mouseMovement.speedKmh;
    
    // 检查速度阈值
    // 扫击：速度小于3km/h不产生伤害
    // 刺击：速度小于3km/h不产生伤害
    const minSpeed = 3;
    
    if (speedKmh < minSpeed) {
      // 速度太慢，攻击无效
      // 清空移动记录，但不消耗武器冷却时间
      this.weaponRenderer.mouseMovement.movements = [];
      this.weaponRenderer.mouseMovement.thrustMovements = 0;
      this.weaponRenderer.mouseMovement.sweepMovements = 0;
      this.weaponRenderer.mouseMovement.totalDistance = 0;
      this.weaponRenderer.mouseMovement.movementsPerSecond = 0;
      this.weaponRenderer.mouseMovement.lastAttackTime = currentTime;
      return;
    }
    
    // 获取攻击范围
    const attackRange = this.weaponRenderer.getAttackRange(this.playerEntity);
    
    // 获取玩家位置
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    
    // 获取攻击范围内的所有敌人
    const enemiesInRange = this.weaponRenderer.getEnemiesInRange(
      transform.position, 
      this.entities, 
      attackRange
    );
    
    if (enemiesInRange.length === 0) {
      // 没有敌人，攻击无效
      // 清空移动记录，但不消耗武器冷却时间
      this.weaponRenderer.mouseMovement.movements = [];
      this.weaponRenderer.mouseMovement.thrustMovements = 0;
      this.weaponRenderer.mouseMovement.sweepMovements = 0;
      this.weaponRenderer.mouseMovement.totalDistance = 0;
      this.weaponRenderer.mouseMovement.movementsPerSecond = 0;
      this.weaponRenderer.mouseMovement.lastAttackTime = currentTime;
      return;
    }
    
    // 攻击有效，检查武器是否就绪
    const isWeaponReady = this.weaponRenderer.weaponCooldown.isReady;
    
    // 记录攻击并触发动画（会消耗武器冷却时间）
    this.weaponRenderer.recordAttack(currentTime);
    
    // 获取伤害倍率（基于武器就绪状态和移动速度）
    const damageMultiplier = this.weaponRenderer.getSwipeDamageMultiplier(isWeaponReady);
    
    // 计算击退方向（武器指向的方向）
    const weaponAngle = this.weaponRenderer.currentMouseAngle;
    const knockbackDir = {
      x: Math.cos(weaponAngle),
      y: Math.sin(weaponAngle)
    };
    
    // 对范围内的所有敌人造成伤害
    for (const enemy of enemiesInRange) {
      const stats = this.playerEntity.getComponent('stats');
      if (!stats) continue;
      
      let finalDamage;
      let damageType; // 伤害类型
      
      if (!isWeaponReady) {
        // 冷却中：damageMultiplier 是固定伤害值（0-5）
        finalDamage = Math.floor(damageMultiplier);
        damageType = `${attackTypeName}[冷却]`;
      } else {
        // 就绪：damageMultiplier 是倍率，需要乘以基础攻击力
        const baseDamage = stats.attack || 15;
        finalDamage = Math.floor(baseDamage * damageMultiplier);
        const multiplierPercent = Math.floor(damageMultiplier * 100);
        damageType = `${attackTypeName}${multiplierPercent}%`;
      }
      
      // 应用伤害和击退效果（传入伤害类型）
      this.combatSystem.applyDamage(enemy, finalDamage, knockbackDir, damageType);
      
      // 创建攻击特效
      if (this.skillEffects) {
        const enemyTransform = enemy.getComponent('transform');
        if (enemyTransform) {
          this.skillEffects.createSkillEffect('basic_attack', transform.position, enemyTransform.position);
        }
      }
    }
    
    // 在玩家头上显示攻击统计信息
    if (enemiesInRange.length > 0) {
      let summaryText;
      let summaryColor;
      
      if (!isWeaponReady) {
        summaryText = `${attackTypeName} [冷却] 命中${enemiesInRange.length}个敌人`;
        summaryColor = '#888888';
      } else {
        const multiplierPercent = Math.floor(damageMultiplier * 100);
        summaryText = `${attackTypeName} ${speedKmh.toFixed(1)}km/h ${multiplierPercent}% 命中${enemiesInRange.length}个`;
        summaryColor = attackTypeName === '刺击' ? '#ff9900' : '#00ffff';
      }
      
      this.floatingTextManager.addText(
        transform.position.x,
        transform.position.y - 80,
        summaryText,
        summaryColor
      );
    }
  }

  /**
   * 检查空格键继续对话
   */
  checkDialogueContinue() {
    // 检查对话系统是否激活
    if (!this.dialogueSystem || !this.dialogueSystem.isDialogueActive()) {
      return;
    }
    
    // 继续信号：空格键 或（移动端）点击/触摸屏幕
    const spacePressed = this.inputManager.isKeyDown('space');
    const clicked = this.inputManager.isMouseClicked && this.inputManager.isMouseClicked();
    const continueSignal = spacePressed || clicked;
    if (!continueSignal) {
      // 重置标志，允许下次触发
      this.lastSpacePressed = false;
      return;
    }
    
    // 防止连续触发（按住时只触发一次）
    if (this.lastSpacePressed) {
      return;
    }
    
    this.lastSpacePressed = true;
    
    // 如果正在打字，跳过打字动画
    if (this.dialogueSystem.isTyping()) {
      this.dialogueSystem.skipTypewriter();
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
      
      // 如果对话结束，隐藏对话框
      if (!this.dialogueSystem.isDialogueActive() && this.dialogueBox) {
        this.dialogueBox.hide();
      }
    }
  }

  /**
   * 更新面板悬停状态（委托给 UISystem）
   */
  updatePanelHover() {
    const mousePos = this.inputManager.getMousePosition();
    this.uiSystem.updateHover(mousePos.x, mousePos.y);

    // PC 功能按钮悬停
    if (this.charButton) this.charButton.handleMouseMove(mousePos.x, mousePos.y);
    if (this.equipButton) this.equipButton.handleMouseMove(mousePos.x, mousePos.y);
    if (this.bagButton) this.bagButton.handleMouseMove(mousePos.x, mousePos.y);
    if (this.flightButton) this.flightButton.handleMouseMove(mousePos.x, mousePos.y);
    if (this.throwButton) this.throwButton.handleMouseMove(mousePos.x, mousePos.y);
    if (this.blockButton) this.blockButton.handleMouseMove(mousePos.x, mousePos.y);
    // PC 装备面板悬停（装备槽 tooltip）
    if (this.equipmentPanel && this.equipmentPanel.visible) {
      this.equipmentPanel.handleMouseMove(mousePos.x, mousePos.y);
    }
    
    // 鼠标/手指抬起时，结束背包滚动条拖动
    const pressed = this.inputManager.isMouseButtonDown
      ? this.inputManager.isMouseButtonDown(0)
      : this.inputManager.mouse?.isDown;
    if (!pressed && this.inventoryPanel && this.inventoryPanel.scrollbarDragging) {
      this.inventoryPanel.endScrollbarDrag();
    }
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
      this.gameLoader = new GameLoader();
      const eng = (typeof window !== 'undefined') ? window.gameEngine : null;
      const deps = {
        dialogueSystem: this.dialogueSystem,
        questSystem: this.questSystem,
        combatSystem: this.combatSystem,
        sceneManager: eng ? eng.sceneManager : (this.sceneManager || null),
        audioManager: this.audioManager || (eng && eng.audioManager) || null,
        floatingText: this.floatingTextManager,
        tutorial: { showTip: (p) => this._showScreenTip((p && p.text) || '') },
        player: this.playerEntity || null,
        ...(opts.deps || {})
      };
      await this.gameLoader.load(projectUrl, deps);
      const trig = this.gameLoader.triggerSystem;
      // 对话结束事件源（各系统事件源在 GameLoader.bridgeEventSources 已接；dialogueEnd 需订阅 DialogueSystem）
      // 带对话 id → 触发器可用 when:dialogueEnd{id:'xxx'} 精确匹配某段对话结束
      if (this.dialogueSystem && this.dialogueSystem.onEnd) {
        this.dialogueSystem.onEnd((dialogue) => trig.fire('dialogueEnd', { id: dialogue && dialogue.id }));
      }
      // 场景标记（供触发器 if 判定仅本场景生效）
      if (opts.sceneFlag) this.gameLoader.blackboard.set(opts.sceneFlag, true);
      // 子类补充场景专属动作 / 监听
      if (typeof opts.onReady === 'function') opts.onReady(this.gameLoader, trig);
      // 通用动作：按 N 切换到下一幕（所有幕可用）
      trig.registerAction('promptSwitch', (p) => this._startPromptSwitch(p));
      // 玩家上下文
      if (this.playerEntity) this.gameLoader.updateContext({ player: this.playerEntity });
      // 进入场景事件
      if (opts.sceneId) trig.fire('sceneEnter', { sceneId: opts.sceneId });
      return this.gameLoader;
    } catch (e) {
      console.warn('BaseGameScene.initGameLoader 失败:', e);
      return null;
    }
  }

  // ─── 通用切幕：按 N 切换到下一幕 ────────────────────────

  /**
   * 启动"按 N 切幕"提示（触发器动作 promptSwitch）
   * @param {Object} p - { scene: 目标场景名, text: 提示文案 }
   */
  _startPromptSwitch(p = {}) {
    this._promptSwitchState = {
      scene: p.scene || 'Act2Scene',
      text: p.text || '按 N 进入下一幕'
    };
  }

  /**
   * 每帧检测 N 键切幕（在 super.update 之前调用，避免 inputManager.update 清掉按键）
   * @private
   */
  _updatePromptSwitch() {
    if (!this._promptSwitchState) return;
    this._showScreenTip(this._promptSwitchState.text, { persist: true });
    const im = this.inputManager;
    if (!im) return;
    const pressed = (k) => (im.isKeyPressed ? im.isKeyPressed(k) : im.isKeyDown(k));
    if (pressed('n') || pressed('N')) {
      const scene = this._promptSwitchState.scene;
      this._promptSwitchState = null;
      this._hideScreenTip();
      const sm = (window.gameEngine && window.gameEngine.sceneManager) || this.sceneManager;
      if (sm) {
        sm.switchTo(scene);
      }
    }
  }

  /**
   * 屏幕居中提示（触发器 showTip 动作用）：优先复用原版提示面板 window.__ddShowTips，
   * 约 3.5 秒后自动隐藏；不可用时回退简易黑框。
   * @param {string} text
   * @param {Object} [opts] - { persist:true 不自动隐藏（供倒计时/提示切幕每帧刷新用） }
   */
  _showScreenTip(text, opts = {}) {
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
    return {
      tutorialPhase: this.tutorialPhase,
      pickupItems: this.pickupItems
    };
  }


  /**
   * 渲染场景
   */
  render(ctx) {
    // 调试：输出渲染调用
    if (this._debugNextRender) {
      console.log('【渲染】render方法被调用, isActive=', this.isActive, 'isPaused=', this.isPaused);
    }
    
    // 清空Canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    
    // 保存上下文状态
    ctx.save();
    
    // 应用相机变换
    const viewBounds = this.camera.getViewBounds();
    
    // 调试：输出相机信息
    if (this._debugNextRender) {
      console.log('【渲染】相机位置:', this.camera.position.x, this.camera.position.y, '视野边界:', viewBounds);
      console.log('【渲染】玩家位置:', this.playerEntity ? this.playerEntity.getComponent('transform')?.position : 'no player');
      this._debugNextRender = false;
    }
    
    ctx.translate(-viewBounds.left, -viewBounds.top);
    
    // 渲染背景 - 子类覆盖
    this.renderBackground(ctx);
    
    // 渲染可拾取物品
    this.renderPickupItems(ctx);
    
    // 渲染世界对象 - 子类可覆盖以添加自定义渲染
    this.renderWorldObjects(ctx);
    
    // 武器渲染已禁用 - 使用水果忍者式滑动攻击
    // 但投掷武器时需要显示飞行中的武器
    if (this.weaponRenderer && this.weaponRenderer.thrownWeapon.active) {
      this.weaponRenderer.renderThrownWeapon(ctx, this.camera);
    }
    
    // 渲染战斗警示圆圈和滑动刀光轨迹
    if (this.combatSystem && this.combatSystem.isInCombat() && this.playerEntity) {
      this.meleeAttackSystem.renderCombatAlertCircle(ctx, this.camera);
    }
    if (this.meleeAttackSystem.sliceTrail && this.meleeAttackSystem.sliceTrail.length > 1) {
      this.meleeAttackSystem.renderSliceTrail(ctx);
    }
    // 渲染刀光/箭光特效
    this.meleeAttackSystem.renderSectorSlashEffects(ctx);
    
    // 渲染敌人武器（已禁用）
    // 敌人武器渲染已禁用
    /*
    if (this.enemyWeaponRenderer) {
      for (const entity of this.entities) {
        if (entity.type === 'enemy' && !entity.isDead && !entity.isDying) {
          this.enemyWeaponRenderer.render(ctx, entity, this.playerEntity);
        }
      }
    }
    */
    
    // 渲染玩家轻功飞行阴影（地面阴影）
    this._renderFlightShadow(ctx);
    
    // 渲染玩家格挡防护罩
    this._renderBlockShield(ctx);
    
    // 渲染粒子系统（在世界坐标系中，相机变换生效时）
    this.particleSystem.render(ctx, this.camera);
    
    // 调试：输出粒子系统状态（连续输出几帧）
    if (this._debugParticleFrames > 0) {
      console.log('【渲染】粒子系统活跃粒子数:', this.particleSystem.getActiveCount());
      this._debugParticleFrames--;
    }
    
    // 渲染技能范围指示器（在世界坐标系中）
    if (this.combatSystem) {
      this.combatSystem.renderSkillRangeIndicators(ctx);
    }
    
    // 渲染右键点击调试光圈（在世界坐标系中）
    this._renderClickRings(ctx);
    
    // 渲染技能瞄准预览虚线框（手机拖拽技能时显示落点）
    this.renderSkillAimPreview(ctx);
    
    // 恢复上下文状态
    ctx.restore();
    
    // 渲染鼠标点击的屏幕坐标红色标记（在屏幕坐标系中，不受相机变换影响）
    this._renderClickScreenMarkers(ctx);
    
    // 渲染技能特效
    this.skillEffects.render(ctx, this.camera);
    
    // 渲染战斗特效
    this.combatEffects.render();
    
    // 渲染飘动文字
    this.floatingTextManager.render(ctx, this.camera);
    
    // 渲染教程系统
    if (this.tutorialSystem) {
      this.tutorialSystem.render(ctx);
    }
    
    // 渲染对话系统（通过 DialogueBox UI 组件）
    if (this.dialogueBox) {
      this.dialogueBox.render(ctx);
    }
    
    // 渲染战斗系统
    if (this.combatSystem) {
      this.combatSystem.render(ctx);
    }
    
    // 渲染人物信息面板
    if (this.playerInfoPanel) {
      this.playerInfoPanel.render(ctx);
    }
    
    // 渲染背包面板
    if (this.inventoryPanel) {
      this.inventoryPanel.render(ctx);
    }
    
    // 渲染底部控制栏
    if (this.bottomControlBar) {
      this.bottomControlBar.render(ctx);
    }

    // 渲染 PC 独立装备面板
    if (this.equipmentPanel) this.equipmentPanel.render(ctx);

    // 渲染 PC 功能按钮（格挡/轻功/投掷/属性/装备/背包）
    if (this.blockButton) this.blockButton.render(ctx);
    if (this.flightButton) this.flightButton.render(ctx);
    if (this.throwButton) this.throwButton.render(ctx);
    if (this.charButton) this.charButton.render(ctx);
    if (this.equipButton) this.equipButton.render(ctx);
    if (this.bagButton) this.bagButton.render(ctx);
    
    // 渲染玩家状态 HUD（左上角，移动端）
    if (this.playerStatusHUD) {
      this.playerStatusHUD.render(ctx);
    }
    
    // 渲染战斗状态UI
    this.renderCombatStateUI(ctx);
    
    // 渲染场景过渡
    if (this.isTransitioning) {
      this.renderTransition(ctx);
    }
    
    // 渲染性能监控面板
    if (this.performanceMonitor && this.performanceMonitor.enabled) {
      this.performanceMonitor.render(ctx);
    }
  }

  /**
   * 渲染世界对象（实体等）- 子类可覆盖以添加自定义渲染顺序
   */
  renderWorldObjects(ctx) {
    // 如果有编辑器地形，使用 Y-sort 渲染队列（实体+装饰物混排）
    if (this.terrain) {
      const renderQueue = [];

      // 地表层装饰物（草，始终在最底层）
      this.terrain.renderBelowDecorations(ctx);

      // 把装饰物（树等碰撞物）加入 Y-sort 队列
      this.terrain.collectDecorations(renderQueue, ctx);

      // 把实体加入 Y-sort 队列
      for (const entity of this.entities) {
        const transform = entity.getComponent('transform');
        if (transform) {
          renderQueue.push({
            type: 'entity',
            y: transform.position.y,
            entity: entity
          });
        }
      }

      // 按 Y 排序
      renderQueue.sort((a, b) => a.y - b.y);

      // 渲染
      for (const item of renderQueue) {
        if (item.type === 'entity') {
          this.renderEntity(ctx, item.entity);
        } else if (item.render) {
          item.render();
        }
      }

      // 悬崖（在所有之上）
      this.terrain.renderCliffs(ctx);

      // 气泡对话
      this.renderSpeechBubbles(ctx);
      return;
    }

    // 无编辑器地形时，走原来的排序逻辑
    let sortedEntities;
    if (this.isometricRenderer) {
      sortedEntities = this.isometricRenderer.sortByDepth(this.entities);
    } else {
      sortedEntities = [...this.entities].sort((a, b) => {
        const transformA = a.getComponent('transform');
        const transformB = b.getComponent('transform');
        const yA = transformA ? transformA.position.y : 0;
        const yB = transformB ? transformB.position.y : 0;
        return yA - yB;
      });
    }
    
    for (const entity of sortedEntities) {
      this.renderEntity(ctx, entity);
    }
  }

  /**
   * 渲染轻功飞行时的地面阴影（玩家腾空时脚下保留一个阴影）
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderFlightShadow(ctx) {
    if (!this.flightSystem || !this.flightSystem.isFlying) return;
    if (!this.playerEntity) return;
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    const elevation = transform.position.elevation || 0;
    if (elevation <= 2) return; // 太低不画阴影
    
    const groundX = transform.position.x;
    const groundY = transform.position.y; // 原始地面位置（不减elevation）
    
    // 阴影大小随高度变小（越高阴影越小越淡）
    const maxElevation = 120;
    const ratio = Math.min(1, elevation / maxElevation);
    const shadowScale = 1 - ratio * 0.4; // 0.6~1
    const shadowAlpha = 0.3 * (1 - ratio * 0.5); // 0.15~0.3
    const radiusX = 20 * shadowScale;
    const radiusY = 8 * shadowScale;
    
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(groundX, groundY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.fill();
    ctx.restore();
  }

  /**
   * 渲染玩家格挡防护罩（半透明蓝色圆形盾牌，带脉冲动画）
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderBlockShield(ctx) {
    if (!this.combatSystem || !this.combatSystem.isBlocking()) return;
    if (!this.playerEntity) return;
    const transform = this.playerEntity.getComponent('transform');
    if (!transform) return;
    const sprite = this.playerEntity.getComponent('sprite');
    const spriteHeight = sprite?.height || 64;
    
    const cx = transform.position.x;
    const cy = transform.position.y - spriteHeight / 2;
    const now = performance.now();
    const elapsed = now - this.combatSystem._activeBlock.startTime;
    const duration = this.combatSystem._activeBlock.duration;
    const progress = Math.min(1, elapsed / duration); // 0→1 格挡进度
    
    // 渐隐：最后 0.3 秒开始淡出
    const fadeStart = 0.7;
    const alpha = progress > fadeStart ? (1 - (progress - fadeStart) / (1 - fadeStart)) * 0.6 : 0.6;
    
    // 呼吸脉冲
    const pulse = 1 + Math.sin(now / 120) * 0.05;
    const radius = 36 * pulse;
    
    ctx.save();
    
    // 外圈光环
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * 0.8})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 主盾牌圆（半透明蓝色）
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(100, 200, 255, ${alpha * 0.15})`);
    gradient.addColorStop(0.6, `rgba(60, 160, 240, ${alpha * 0.3})`);
    gradient.addColorStop(1, `rgba(30, 120, 220, ${alpha * 0.5})`);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // 盾牌边缘高光
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 230, 255, ${alpha})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    // 六边形花纹（增加科技感/魔法感）
    ctx.beginPath();
    const sides = 6;
    const innerR = radius * 0.55;
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 / sides) * i - Math.PI / 2;
      const x = cx + Math.cos(angle) * innerR;
      const y = cy + Math.sin(angle) * innerR;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(150, 220, 255, ${alpha * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.restore();
  }

  /**
   * 渲染战斗状态UI
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderCombatStateUI(ctx) {
    if (!this.combatSystem.isInCombat()) return;
    
    // 战斗状态面板位置（屏幕右上角，移动端左移避让小地图和右侧按钮）
    const combatPanelOffset = (this.uiStrategy && this.uiStrategy.platform === 'mobile') ? 100 : 0;
    const panelX = this.logicalWidth - 90 - combatPanelOffset;
    const panelY = 10;
    const panelWidth = 80;
    const panelHeight = 30;
    
    ctx.save();
    
    // 绘制背景
    ctx.fillStyle = 'rgba(139, 0, 0, 0.7)'; // 深红色背景
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    
    // 绘制边框
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    
    // 绘制"战斗中"文字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('战斗中', panelX + panelWidth / 2, panelY + 14);
    
    // 绘制脱离战斗倒计时
    const timer = Math.ceil(this.combatSystem.getCombatExitTimer());
    if (timer > 0) {
      ctx.fillStyle = '#ffff00';
      ctx.font = '10px Arial';
      ctx.fillText(`${timer}秒`, panelX + panelWidth / 2, panelY + 26);
    } else {
      ctx.fillStyle = '#ff6666';
      ctx.font = '9px Arial';
      ctx.fillText('敌人附近', panelX + panelWidth / 2, panelY + 26);
    }
    
    ctx.restore();
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

  // ─── 编辑器场景地形（通用，所有幕共享） ────────────────────

  /**
   * actNumber → 编辑器场景 ID 的默认映射
   * 子类可覆盖 this.editorSceneId 来自定义
   */
  _getDefaultEditorSceneId(actNumber) {
    const map = {
      1: 'scene_Prologue',
      2: 'scene_Act2',
      3: 'scene_Act3',
      4: 'scene_Act4',
      5: 'scene_Act5',
      6: 'scene_Act6'
    };
    return map[actNumber] || `scene_Act${actNumber}`;
  }

  /**
   * 初始化编辑器场景地形
   * 如果编辑器中有对应场景数据（localStorage 或 JSON），创建 Scene1Terrain 渲染
   * 子类已自行创建 this.terrain 时跳过
   */
  _initEditorTerrain() {
    // 子类（如 Act1SceneECS / DataDrivenPrologueScene）已自行创建 terrain 时不覆盖
    if (this.terrain) return;

    // 检查编辑器中是否有该场景的数据
    const gameId = 'sanguo_zhangjiao';
    const sceneId = this.editorSceneId;
    let hasData = false;

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('h5game_editor_data_scenes_' + gameId);
        if (raw) {
          const scenes = JSON.parse(raw);
          if (Array.isArray(scenes) && scenes.find(s => s && s.id === sceneId)) {
            hasData = true;
          }
        }
      }
    } catch (e) { /* ignore */ }

    if (!hasData) return; // 编辑器没有这个场景的数据，走旧逻辑

    // 创建通用地形实例，加载编辑器场景数据
    const cx = this.logicalWidth / 2;
    const cy = this.logicalHeight / 2;
    this.terrain = new Scene1Terrain({
      centerX: cx,
      centerY: cy,
      width: this.logicalWidth,
      height: this.logicalHeight,
      editorGameId: gameId,
      editorSceneId: sceneId
    });
  }

  /**
   * 检查地形碰撞（通用：椭圆盆地边界 + 水池 + 树 + collide shape）
   * 有 terrain 时自动生效；子类覆盖可扩展
   */
  checkTerrainCollision() {
    if (!this.terrain) return;

    const t = this.terrain;
    const cx = t.centerX;
    const cy = t.centerY;
    const irx = t.basinInnerRadiusX;
    const iry = t.basinInnerRadiusY;
    const halfAng = t.entranceAngleHalfWidth;

    for (const entity of this.entities) {
      if (entity.isDead || entity.isDying) continue;
      const transform = entity.getComponent('transform');
      if (!transform) continue;
      const p = transform.position;

      // 1. 椭圆盆地边界（南向留入口扇形）
      if (irx && iry) {
        let dx = p.x - cx;
        let dy = p.y - cy;
        const ed = Math.hypot(dx / irx, dy / iry);
        if (ed < 0.85) entity._leftBasin = false;
        if (!entity._leftBasin && ed > 1) {
          const ang = Math.atan2(dy, dx);
          const angDist = Math.abs(((ang - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          const inEntranceFan = angDist < halfAng;
          if (inEntranceFan) {
            entity._leftBasin = true;
          } else if (ed > 0.001) {
            const k = 0.99 / ed;
            p.x = cx + dx * k;
            p.y = cy + dy * k;
          }
        }
      }

      // 2. 水池碰撞
      for (const pond of t.waterPatches) {
        const pdx = p.x - pond.x;
        const pdy = p.y - pond.y;
        const nx = pdx / pond.rx;
        const ny = pdy / pond.ry;
        const d2 = nx * nx + ny * ny;
        if (d2 < 1 && d2 > 0) {
          const k = 1 / Math.sqrt(d2);
          p.x = pond.x + pdx * k * 1.02;
          p.y = pond.y + pdy * k * 1.02;
        } else if (d2 === 0) {
          p.y = pond.y - pond.ry - 1;
        }
      }

      // 3. 树木碰撞
      const entityRadius = 12;
      const trees = t.getTreeColliders();
      for (const tree of trees) {
        const tdx = p.x - tree.x;
        const tdy = p.y - tree.y;
        const minDist = tree.r + entityRadius;
        const d2 = tdx * tdx + tdy * tdy;
        if (d2 < minDist * minDist) {
          const td = Math.sqrt(d2);
          if (td > 0.001) {
            const k = minDist / td;
            p.x = tree.x + tdx * k;
            p.y = tree.y + tdy * k;
          } else {
            p.y = tree.y + minDist;
          }
        }
      }

      // 4. collide shape 碰撞
      if (t._collisionShapes && t._collisionShapes.length) {
        for (const s of t._collisionShapes) {
          this._resolveShapeCollision(p, s, entityRadius);
        }
      }
    }
  }

  /**
   * 将实体推出 collide shape
   * @private
   */
  _resolveShapeCollision(p, s, radius) {
    const t = this.terrain;
    if (!t || !t._pointInCollisionShape || !t._pointInCollisionShape(s, p.x, p.y)) return;
    const EPS = 0.5;
    const st = s.shapeType;
    if (st === 'circle' || st === 'ellipse') {
      const scx = (s.x || 0) + (s.width || 0) / 2;
      const scy = (s.y || 0) + (s.height || 0) / 2;
      const dirx = p.x - scx, diry = p.y - scy;
      const dl = Math.hypot(dirx, diry) || 1;
      const rx = (st === 'circle' ? Math.min(s.width, s.height) : s.width) / 2 || 1;
      const ry = (st === 'circle' ? Math.min(s.width, s.height) : s.height) / 2 || 1;
      const ux = dirx / rx, uy = diry / ry;
      const d = Math.hypot(ux, uy) || 1;
      p.x = scx + dirx / d + dirx / dl * EPS;
      p.y = scy + diry / d + diry / dl * EPS;
    } else if (st === 'polygon' || st === 'path') {
      // 多边形推出：找最近边，推到外侧
      if (t._pushOutOfPolygon) t._pushOutOfPolygon(p, s);
    } else {
      // rect: 推出到最近边
      const left = s.x || 0, top = s.y || 0;
      const right = left + (s.width || 0), bottom = top + (s.height || 0);
      const dL = p.x - left, dR = right - p.x, dT = p.y - top, dB = bottom - p.y;
      const minD = Math.min(dL, dR, dT, dB);
      if (minD === dL) p.x = left - EPS;
      else if (minD === dR) p.x = right + EPS;
      else if (minD === dT) p.y = top - EPS;
      else p.y = bottom + EPS;
    }
  }

  /**
   * 处理 PC 左键点击地上物品的拾取
   * 需在攻击判定之前调用：命中物品时标记点击已处理，从而阻止本次左键攻击。
   */
  handlePickupClick() {
    if (!this.inputManager) return;
    // 仅处理左键点击、且本帧尚未被其它逻辑消费
    if (!this.inputManager.isMouseClicked() || this.inputManager.isMouseClickHandled()) return;
    if (this.inputManager.getMouseButton() === 2) return; // 右键（移动）不拾取

    // 对话激活时不拾取
    if (this.dialogueSystem && this.dialogueSystem.isDialogueActive()) return;
    // 面板打开时不拾取（点击交给 UI 处理，如关闭面板）
    if ((this.inventoryPanel && this.inventoryPanel.visible) ||
        (this.playerInfoPanel && this.playerInfoPanel.visible)) return;

    const mouseScreen = this.inputManager.getMousePosition();
    const mouseWorld = this.camera
      ? this.camera.screenToWorld(mouseScreen.x, mouseScreen.y)
      : this.inputManager.getMouseWorldPosition();

    if (this.tryClickPickup(mouseWorld.x, mouseWorld.y)) {
      // 命中物品：消费本次点击，阻止攻击/投掷
      this.inputManager.markMouseClickHandled();
    }
  }

  /**
   * 左键点击地上物品的拾取检测
   * 点击命中可拾取物品图标范围时，触发一次范围拾取（等价 E 键 / 交互按钮 / 触屏）
   * @param {number} worldX - 点击的世界坐标 X
   * @param {number} worldY - 点击的世界坐标 Y
   * @returns {boolean} 是否命中了可拾取物品（命中则消费本次点击，避免触发攻击）
   */
  tryClickPickup(worldX, worldY) {
    if (!this.playerEntity || !this.pickupSystem) return false;

    const hitRadius = 30; // 物品图标点击命中半径

    // 检测是否点中了某个可拾取物品
    let hit = false;
    for (const item of this.pickupItems) {
      if (item.picked) continue;
      if (Math.hypot(item.x - worldX, item.y - worldY) <= hitRadius) { hit = true; break; }
    }
    if (!hit) {
      for (const item of this.equipmentItems) {
        if (item.picked) continue;
        const t = item.getComponent ? item.getComponent('transform') : null;
        const ix = t ? t.position.x : item.x;
        const iy = t ? t.position.y : item.y;
        if (Math.hypot(ix - worldX, iy - worldY) <= hitRadius) { hit = true; break; }
      }
    }

    if (!hit) return false;

    // 命中物品：触发一次范围拾取（等价 E 键，需玩家在拾取范围内）
    const result = this.pickupSystem.triggerPickup(
      this.playerEntity, this.pickupItems, this.equipmentItems
    );
    // 移除已拾取的掉落物实体
    for (const removed of result.removedEntities) {
      this.entities = this.entities.filter(e => e !== removed);
    }

    // 只要点中了物品图标就消费本次点击（避免误触发攻击）
    return true;
  }

  /**
   * 渲染可拾取物品
   */
  renderPickupItems(ctx) {
    for (const item of this.pickupItems) {
      if (item.picked) continue;
      
      // 物品位置（世界坐标）
      const x = item.x;
      const y = item.y;
      
      // 根据物品类型绘制不同图标
      if (item.id === 'leftover_food') {
        this.renderLeftoverFoodSprite(ctx, x, y);
      } else if (item.id === 'ragged_clothes') {
        this.renderRaggedClothesSprite(ctx, x, y);
      } else if (item.id === 'wooden_sword') {
        this.renderWoodenSwordSprite(ctx, x, y);
      } else if (item.id === 'wooden_bow') {
        this.renderWoodenBowSprite(ctx, x, y);
      } else if (item.id === 'wooden_arrow') {
        this.renderWoodenArrowSprite(ctx, x, y);
      } else {
        // 默认：绘制物品圆形（底部对齐）
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.arc(x, y - 5, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // 绘制物品名称
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(item.name, x, y - 20);
    }
    
    for (const item of this.equipmentItems) {
      if (item.picked) continue;
      
      const x = item.x;
      const y = item.y;
      
      // 根据装备类型绘制不同图标
      if (item.id === 'ragged_clothes') {
        this.renderRaggedClothesSprite(ctx, x, y);
      } else if (item.id === 'wooden_sword') {
        this.renderWoodenSwordSprite(ctx, x, y);
      } else if (item.id === 'wooden_bow') {
        this.renderWoodenBowSprite(ctx, x, y);
      } else if (item.id === 'wooden_arrow') {
        this.renderWoodenArrowSprite(ctx, x, y);
      } else {
        // 绘制装备物品圆形（底部对齐）
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.arc(x, y - 5, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // 绘制物品名称
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(item.name, x, y - 20);
    }
  }

  /**
   * 渲染残羹精灵（场景地图上的破碗图标）
   */
  renderLeftoverFoodSprite(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y - 8);

      // 中国碗 - 口大底小，碗壁外展
      // 碗身（用贝塞尔曲线画出口大底小的形状）
      ctx.fillStyle = '#8B7355';
      ctx.beginPath();
      ctx.moveTo(-13, -5);  // 左碗口
      ctx.bezierCurveTo(-12, 0, -6, 6, -4, 8);  // 左壁向内收
      ctx.lineTo(4, 8);     // 碗底（小）
      ctx.bezierCurveTo(6, 6, 12, 0, 13, -5);   // 右壁向内收
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5a4a3a';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 碗底座（小圆底）
      ctx.fillStyle = '#7a6345';
      ctx.beginPath();
      ctx.ellipse(0, 8, 4, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5a4a3a';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // 碗口（大椭圆）
      ctx.fillStyle = '#a08060';
      ctx.beginPath();
      ctx.ellipse(0, -5, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5a4a3a';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 碗内部（深色）
      ctx.fillStyle = '#6b5a48';
      ctx.beginPath();
      ctx.ellipse(0, -5, 11, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 裂缝（破碗效果）
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(7, -8);
      ctx.lineTo(9, -3);
      ctx.lineTo(10, 2);
      ctx.stroke();

      // 碗口缺口
      ctx.fillStyle = '#6b5a48';
      ctx.beginPath();
      ctx.arc(-9, -7, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // 碗内米粒
      ctx.fillStyle = '#f5f0e0';
      const grains = [[-3, -5], [1, -6], [4, -5], [-1, -4], [2, -4]];
      for (const [gx, gy] of grains) {
        ctx.beginPath();
        ctx.ellipse(gx, gy, 1.5, 0.8, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 碗外散落米粒
      ctx.fillStyle = '#e8e0c8';
      ctx.beginPath();
      ctx.ellipse(-8, 2, 1.2, 0.7, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(10, 3, 1, 0.6, -0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

  /**
   * 渲染破旧衣服精灵（场景地图上的破衣服图标）
   */
  renderRaggedClothesSprite(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y - 8);

      // 衣服主体（褐色破旧布料）
      ctx.fillStyle = '#8B6914';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(-6, -10);
      ctx.lineTo(-12, -4);
      ctx.lineTo(-10, -2);
      ctx.lineTo(-7, -6);
      ctx.lineTo(-8, 10);
      ctx.lineTo(8, 10);
      ctx.lineTo(7, -6);
      ctx.lineTo(10, -2);
      ctx.lineTo(12, -4);
      ctx.lineTo(6, -10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5a4a0a';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 领口
      ctx.fillStyle = '#6b5210';
      ctx.beginPath();
      ctx.ellipse(0, -11, 4, 2, 0, 0, Math.PI);
      ctx.fill();

      // 补丁
      ctx.fillStyle = '#6b5a10';
      ctx.fillRect(-5, 0, 4, 4);
      ctx.strokeStyle = '#4a3a08';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([1, 1]);
      ctx.strokeRect(-5, 0, 4, 4);
      ctx.setLineDash([]);

      // 破洞
      ctx.fillStyle = '#2a1a00';
      ctx.beginPath();
      ctx.ellipse(4, 3, 2, 1.5, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // 撕裂痕迹（下摆）
      ctx.strokeStyle = '#5a4a0a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-6, 10);
      ctx.lineTo(-5, 12);
      ctx.moveTo(-2, 10);
      ctx.lineTo(-1, 11);
      ctx.moveTo(3, 10);
      ctx.lineTo(4, 12);
      ctx.stroke();

      ctx.restore();
  }

  /**
   * 渲染木剑精灵（场景地图上的木剑图标）
   */
  renderWoodenSwordSprite(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y - 10);
      ctx.rotate(-Math.PI / 4); // 斜放45度

      // 剑身
      ctx.fillStyle = '#a08030';
      ctx.beginPath();
      ctx.moveTo(0, -16);   // 剑尖
      ctx.lineTo(3.5, -12);
      ctx.lineTo(3.5, 3);
      ctx.lineTo(-3.5, 3);
      ctx.lineTo(-3.5, -12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6b5210';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // 剑身高光
      ctx.fillStyle = '#c0a050';
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(1.5, -12);
      ctx.lineTo(1.5, 2);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();

      // 护手
      ctx.fillStyle = '#5a4a0a';
      ctx.fillRect(-6, 3, 12, 3);

      // 剑柄
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(-2, 6, 4, 9);

      // 剑柄底部
      ctx.fillStyle = '#5a4a0a';
      ctx.beginPath();
      ctx.arc(0, 16, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
  }

  /**
   * 渲染木弓精灵（场景地图上的木弓图标）
   */
  renderWoodenBowSprite(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 10);

    // 弓身（弧形木杆）
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(4, 0, 14, Math.PI * 0.7, Math.PI * 1.3, false);
    ctx.stroke();

    // 弓身高光
    ctx.strokeStyle = '#a08030';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(4, 0, 13, Math.PI * 0.8, Math.PI * 1.2, false);
    ctx.stroke();

    // 弓弦
    ctx.strokeStyle = '#d4c4a0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4 + 14 * Math.cos(Math.PI * 0.7), 14 * Math.sin(Math.PI * 0.7));
    ctx.lineTo(4 + 14 * Math.cos(Math.PI * 1.3), 14 * Math.sin(Math.PI * 1.3));
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 渲染木箭精灵（场景地图上的木箭图标，一捆箭）
   */
  renderWoodenArrowSprite(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 8);

    // 画3支箭组成一捆
    for (let i = -1; i <= 1; i++) {
      const ox = i * 3;
      const rot = i * 0.15;
      ctx.save();
      ctx.translate(ox, 0);
      ctx.rotate(rot);

      // 箭杆
      ctx.strokeStyle = '#8B6914';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, -8);
      ctx.stroke();

      // 箭头（三角形）
      ctx.fillStyle = '#888888';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(-2.5, -7);
      ctx.lineTo(2.5, -7);
      ctx.closePath();
      ctx.fill();

      // 箭羽
      ctx.fillStyle = '#cc4444';
      ctx.beginPath();
      ctx.moveTo(-2, 8);
      ctx.lineTo(0, 5);
      ctx.lineTo(2, 8);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }


  /**
   * 渲染单个实体
   */
  renderEntity(ctx, entity) {
    const transform = entity.getComponent('transform');
    const sprite = entity.getComponent('sprite');
    const stats = entity.getComponent('stats');
    
    if (!transform) return;
    
    const x = transform.position.x;
    // elevation 向上偏移渲染位置（腾空效果）
    const elevation = transform.position.elevation || 0;
    const y = transform.position.y - elevation;
    const size = sprite?.width || 32;
    const height = sprite?.height || 32;
    
    // 检查是否被选中 - 已禁用（不再需要选中敌人）
    // const isSelected = this.combatSystem && this.combatSystem.selectedTarget === entity;
    
    // 渲染精灵（使用底部中心锚点）
    if (sprite && sprite.visible) {
      
      // 应用精灵透明度
      const prevAlpha = ctx.globalAlpha;
      if (sprite.alpha !== undefined && sprite.alpha < 1.0) {
        ctx.globalAlpha = sprite.alpha;
      }
      
      let rendered = false;
      
      // 静态单图精灵渲染（整图作为角色立绘，底部中心锚点）
      if (!rendered && sprite.isStatic && this.assetManager) {
        const image = this.assetManager.getAsset(sprite.spriteSheet);
        const isImageReady = image && (
          (image instanceof HTMLCanvasElement) ||
          (image.complete && image.naturalWidth > 0)
        );
        if (isImageReady) {
          const destWidth = size;
          const destHeight = height;
          ctx.drawImage(
            image,
            x - destWidth / 2, y - destHeight, destWidth, destHeight
          );
          rendered = true;
        }
      }
      
      // 4x9格式精灵渲染
      if (sprite.useAnimatedSprite && this.assetManager) {
        const image = this.assetManager.getAsset(sprite.spriteSheet);
        // Image对象需要complete且naturalWidth>0才算加载完成
        const isImageReady = image && (
          (image instanceof HTMLCanvasElement) ||
          (image.complete && image.naturalWidth > 0)
        );
        if (isImageReady) {
          // 调试：首次输出图片信息
          if (!this._debugSpriteLogged) {
            const cellW = image.width / sprite.spriteColumns;
            const cellH = image.height / sprite.spriteRows;
            console.log(`【精灵调试】图片尺寸: ${image.width}x${image.height}, 列数: ${sprite.spriteColumns}, 行数: ${sprite.spriteRows}, 单元格: ${cellW}x${cellH}`);
            this._debugSpriteLogged = true;
          }
          // 获取当前帧的行和列
          const frameInfo = sprite.getAnimatedFrame();
          const row = frameInfo.row;
          const col = frameInfo.col;
          
          // 计算每个格子的尺寸
          const cellWidth = image.width / sprite.spriteColumns;
          const cellHeight = image.height / sprite.spriteRows;
          
          // 源矩形
          const sx = col * cellWidth;
          const sy = row * cellHeight;
          
          // 目标尺寸
          const destWidth = size;
          const destHeight = height;
          
          // 绘制精灵（底部中心锚点）
          ctx.drawImage(
            image,
            sx, sy, cellWidth, cellHeight,
            x - destWidth/2, y - destHeight, destWidth, destHeight
          );
          rendered = true;
        }
      }
      // 旧格式九宫格精灵渲染
      else if (sprite.useDirectionalSprite && this.assetManager) {
        const image = this.assetManager.getAsset(sprite.spriteSheet);
        // canvas 元素没有 complete 属性，但可以直接使用
        const isImageReady = image && (image.complete !== false || image instanceof HTMLCanvasElement);
        if (isImageReady) {
          // 获取当前方向对应的帧索引
          const frameIndex = sprite.getCurrentFrame();
          const framesPerRow = 3; // 九宫格是3x3
          const row = Math.floor(frameIndex / framesPerRow);
          const col = frameIndex % framesPerRow;
          
          // 计算每个格子的尺寸（图片尺寸 / 3）
          const cellWidth = image.width / 3;
          const cellHeight = image.height / 3;
          
          // 源矩形（从九宫格精灵图中裁剪）
          const sx = col * cellWidth;
          const sy = row * cellHeight;
          
          // 目标尺寸（可以根据需要缩放）
          const destWidth = size;
          const destHeight = height;
          
          // 绘制精灵（底部中心锚点：x居中，y在底部）
          ctx.drawImage(
            image,
            sx, sy, cellWidth, cellHeight,  // 源矩形
            x - destWidth/2, y - destHeight, destWidth, destHeight  // 目标矩形（底部对齐）
          );
          rendered = true;
        }
      }
      
      // 如果没有成功渲染精灵图，使用占位符（底部对齐）
      if (!rendered) {
        if (entity.type === 'loot' && entity.itemData) {
          // 掉落物：绘制瓶子形状
          this.renderPotionSprite(ctx, x, y, entity.itemData.type);
        } else {
          ctx.fillStyle = sprite.color || '#00ff00';
          ctx.fillRect(x - size/2, y - height, size, height);
          
          ctx.strokeStyle = entity.type === 'player' ? '#4CAF50' : '#ff4444';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - size/2, y - height, size, height);
        }
      }
      
      // 恢复透明度
      ctx.globalAlpha = prevAlpha;
    }
    
    // 渲染名字（在实体上方）
    const nameComponent = entity.getComponent('name');
    if (nameComponent && nameComponent.visible) {
      const nameY = y - height + (nameComponent.offsetY || -10);
      
      ctx.save();
      ctx.font = `bold ${nameComponent.fontSize || 14}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      const textWidth = ctx.measureText(nameComponent.name).width;
      const padding = 4;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(x - textWidth / 2 - padding, nameY - 16, textWidth + padding * 2, 18);
      
      ctx.fillStyle = nameComponent.color || '#ffffff';
      ctx.fillText(nameComponent.name, x, nameY);
      ctx.restore();
    }
    
    // 渲染生命值条（在实体头顶上方）
    if (stats && stats.maxHp > 0) {
      const barWidth = 40;
      const barHeight = 4;
      const barX = x - barWidth / 2;
      const barY = y - height - 8;  // 在实体顶部上方8像素
      
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const hpRatio = stats.hp / stats.maxHp;
      ctx.fillStyle = hpRatio > 0.5 ? '#00ff00' : hpRatio > 0.2 ? '#ffaa00' : '#ff0000';
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
  }

  /**
   * 渲染药瓶精灵
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - 底部中心X
   * @param {number} y - 底部Y
   * @param {string} potionType - 'health_potion' 或 'mana_potion'
   */
  renderPotionSprite(ctx, x, y, potionType) {
    const isHealth = potionType === 'health_potion';
    const bodyColor = isHealth ? '#ff3333' : '#3366ff';
    const liquidColor = isHealth ? '#cc0000' : '#0033cc';
    const highlightColor = isHealth ? '#ff8888' : '#88aaff';

    ctx.save();
    ctx.translate(x, y);

    // 瓶身（圆角矩形）
    const bw = 12, bh = 16;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-bw/2, -4);
    ctx.quadraticCurveTo(-bw/2, -bh - 2, -3, -bh - 2);
    ctx.lineTo(3, -bh - 2);
    ctx.quadraticCurveTo(bw/2, -bh - 2, bw/2, -4);
    ctx.quadraticCurveTo(bw/2, 0, 0, 0);
    ctx.quadraticCurveTo(-bw/2, 0, -bw/2, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 液体（下半部分）
    ctx.fillStyle = liquidColor;
    ctx.fillRect(-bw/2 + 1, -bh/2, bw - 2, bh/2 - 1);

    // 高光
    ctx.fillStyle = highlightColor;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-bw/2 + 2, -bh, 3, bh - 4);
    ctx.globalAlpha = 1.0;

    // 瓶口
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-3, -bh - 6, 6, 5);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(-3, -bh - 6, 6, 5);

    // 瓶盖
    ctx.fillStyle = '#654321';
    ctx.fillRect(-4, -bh - 8, 8, 3);

    ctx.restore();
  }

  /**
   * 切换到下一幕
   */
  switchToNextScene() {
    const stats = this.playerEntity.getComponent('stats');
    const inventory = this.playerEntity.getComponent('inventory');
    const equipment = this.playerEntity.getComponent('equipment');
    
    const sceneData = {
      player: {
        id: this.playerEntity.id,
        name: this.playerEntity.name || '玩家',
        class: this.playerEntity.class || 'refugee',
        level: stats?.level || 1,
        hp: stats?.hp || 100,
        maxHp: stats?.maxHp || 100,
        mp: stats?.mp || 100,
        maxMp: stats?.maxMp || 100,
        attack: stats?.attack || 10,
        defense: stats?.defense || 5,
        speed: stats?.speed || 100,
        inventory: inventory?.getAllItems() || [],
        equipment: equipment?.slots || {}
      },
      playerEntity: this.playerEntity,
      previousAct: this.actNumber
    };
    
    console.log(`BaseGameScene: 切换到下一幕，传递数据`, sceneData);
    this.goToNextScene(sceneData);
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
    // 如果提示内容没变，不重复显示
    if (this._currentHintText === text) return;
    this._currentHintText = text;
    
    if (this._onHintShow) {
      this._onHintShow(text, title);
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
   * 场景退出
   */
  exit() {
    super.exit();
    
    if (this.inputManager) {
      this.inputManager.destroy();
    }
    
    if (this.flightSystem) {
      this.flightSystem.cleanup();
    }
    
    if (this.meleeAttackSystem) {
      this.meleeAttackSystem.cleanup();
    }
    
    if (this.enemyWeaponRenderer) {
      this.enemyWeaponRenderer.cleanup();
    }
    
    this.tutorialSystem.cleanup();
    
    for (const entity of this.entities) {
      entity.destroy();
    }
    this.entities = [];
    
    console.log(`BaseGameScene: 退出场景 ${this.name}`);
  }
}

export default BaseGameScene;
