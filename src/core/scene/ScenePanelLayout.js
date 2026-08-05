/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { UILayoutLoader } from '../../ui/UILayoutLoader.js';
import { PanelLayoutLoader } from '../../ui/PanelLayoutLoader.js';
import { InputHints } from '../input/InputHints.js';

/**
 * ScenePanelLayout - 场景 Canvas UI 布局协调器（框架级）
 *
 * 负责编辑器配置的加载、窗口缩放重排、PC 功能按钮定位与背包打开时
 * DOM 触屏控件的让位。面板实例和具体 UI 回调仍由调用场景持有。
 */
export class ScenePanelLayout {
  /**
   * @param {Object} scene
   * @param {Object} [hudDependencies] HUD 组合所需的 UI 类和项目数据依赖。
   */
  constructor(scene, hudDependencies = {}) {
    this.scene = scene;
    this.hudDependencies = hudDependencies;
  }

  /**
   * 创建并注册场景 HUD。具体 UI 类型与项目配置均通过依赖注入提供，
   * 保持框架层不依赖任何示例项目。
   * @param {Object} [hudDependencies] 可选的本次组合依赖，会覆盖构造时传入的同名依赖。
   */
  composeHud(hudDependencies = {}) {
    const scene = this.scene;
    const {
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
    } = { ...this.hudDependencies, ...hudDependencies };

    // 统一背包面板：属性、装备槽和物品栏均由同一外框承载。
    // 内部操作继续复用原有 PlayerInfoPanel / InventoryPanel 的事件流。
    const invOpts = scene.uiStrategy.getInventoryOptions ? scene.uiStrategy.getInventoryOptions() : null;
    scene.backpackPanel = new BackpackPanel({
      x: Math.round((scene.logicalWidth - 900) / 2),
      y: Math.max(10, scene.logicalHeight - 100 - 520),
      width: 900,
      height: 520,
      visible: false,
      inventoryOptions: invOpts,
      onAttributeAllocate: () => {
        console.log('BaseGameScene: 属性加点按钮被点击');
      },
      onEquipmentClick: (slotType, button) => scene._handleEquipmentSlotClick(slotType, button),
      onItemUse: (item, healAmount, manaAmount) => scene.onItemUsed(item, healAmount, manaAmount),
      onEquipmentChange: (messages, info) => scene.onEquipmentChanged(messages, info)
    });
    // 保持旧场景和物品弹窗的调用兼容：三个入口均控制同一个组合面板。
    scene.inventoryPanel = scene.backpackPanel;
    scene.playerInfoPanel = scene.backpackPanel;
    scene.equipmentPanel = scene.backpackPanel;
    if (scene.uiStrategy.layoutBackpackPanel) {
      scene.uiStrategy.layoutBackpackPanel(scene.backpackPanel, scene.logicalWidth, scene.logicalHeight);
    }

    // 底部控制栏
    const barOptions = scene.uiStrategy.getBottomControlBarOptions();
    scene.bottomControlBar = new BottomControlBar({
      x: 0,
      y: scene.logicalHeight - 100,
      width: scene.logicalWidth,
      height: 100,
      visible: scene.uiStrategy.isBottomControlBarVisible(),
      // 平台差异由 UI 策略决定（移动端隐藏血球/蓝球和数字快捷键）
      showOrbs: barOptions.showOrbs,
      showHotkeyNumbers: barOptions.showHotkeyNumbers,
      onSkillClick: (skill) => {
        scene.onSkillClicked(skill);
      },
      onPotionUse: (potionType) => {
        scene.usePotionFromHotbar(potionType);
      }
    });

    // 玩家状态 HUD（左上角：头像 + 昵称 + 血条 + 蓝条）——由 UI 策略决定是否显示
    const selectedChar = SelectedCharacterStore.get();
    let avatarSrc = null;
    if (selectedChar && (selectedChar.previewImage || selectedChar.assetImage)) {
      const rel = selectedChar.previewImage ||
        (selectedChar.assetImage && selectedChar.assetImage.path);
      if (rel) {
        avatarSrc = scene.assetManager && scene.assetManager.resolveAssetPath
          ? scene.assetManager.resolveAssetPath(rel.replace(/^assets\//, ''))
          : rel;
      }
    }
    scene.playerStatusHUD = new PlayerStatusHUD({
      x: 10,
      y: 10,
      width: 230,
      height: 78,
      visible: scene.uiStrategy.isPlayerStatusHUDVisible(),
      avatarSrc
    });

    // 对话框 - 居中显示（移动端缩小宽度）
    const dialogueBoxWidth = scene.isMobileLayout ? 500 : 700;
    const dialogueBoxHeight = scene.isMobileLayout ? 170 : 230;
    scene.dialogueBox = new DialogueBox({
      x: (scene.logicalWidth - dialogueBoxWidth) / 2,
      y: scene.isMobileLayout
        ? (scene.logicalHeight - dialogueBoxHeight - 60)
        : (scene.logicalHeight - dialogueBoxHeight) / 2,
      width: dialogueBoxWidth,
      height: dialogueBoxHeight,
      visible: false,
      zIndex: 200,
      dialogueSystem: scene.dialogueSystem,
      portraits: PortraitsConfig,
      onDialogueEnd: () => {
        console.log('BaseGameScene: 对话结束');
      }
    });

    // PC 端只保留一个背包按钮；属性与装备已在背包内合并展示。
    if (!scene.isMobileLayout) {
      scene.bagButton = new IconButton({
        x: 946, y: 640, width: 50, height: 50,
        icon: '🎒', label: '背包', hintAction: 'bag',
        onClick: () => { if (scene.backpackPanel) scene.backpackPanel.toggle(); }
      });
      scene.settingsButton = new IconButton({
        x: 1002, y: 640, width: 50, height: 50,
        icon: '⚙️', label: '系统设置', hintAction: 'settings',
        onClick: () => scene.openSystemMenu?.()
      });
      // 跳跃：读取当前键盘/摇杆方向，未输入方向时原地起跳
      scene.jumpButton = new IconButton({
        x: 666, y: 640, width: 50, height: 50,
        icon: '⬆️', label: '跳跃', hintAction: 'jump',
        onClick: () => { scene.jumpByInput?.(); }
      });
      // 轻功（按下进入瞄准，左键在射程内确认瞬移）
      scene.flightButton = new IconButton({
        x: 722, y: 640, width: 50, height: 50,
        icon: '💨', label: '轻功', hintAction: 'flight',
        onClick: () => { scene.enterPCAimMode('flight'); }
      });
      // 投掷（按下进入瞄准，左键在射程内确认投掷）
      scene.throwButton = new IconButton({
        x: 778, y: 640, width: 50, height: 50,
        icon: '🎯', label: '投掷', hintAction: 'throw',
        onClick: () => { scene.enterPCAimMode('throw'); }
      });
      // 格挡（按下激活格挡防护）
      scene.blockButton = new IconButton({
        x: 666, y: 640, width: 50, height: 50,
        icon: '🛡', label: '格挡', hintAction: 'block',
        onClick: () => { scene.activateBlock(); }
      });
    }

    // 左侧系统文字提示（拾取/装备等）
    scene.notificationSystem = new NotificationSystem({
      x: 10,
      y: 96,
      width: 300,
      height: 200
    });

    // 获得物品弹窗（食物/装备：图标 + 属性对比 + 装备/放入背包）
    const popupW = 320;
    scene.itemGainedPopup = new ItemGainedPopup({
      x: (scene.logicalWidth - popupW) / 2,
      width: popupW,
      // 底边紧贴底部控制栏（栏顶 = logicalHeight - 100）上方
      anchorBottom: scene.logicalHeight - 100
    });

    // 手柄面板（Xbox 360）：HUD 常驻指示 + 完整映射图（调试面板的手柄按钮打开）
    scene.gamepadPanel = new GamepadPanel({
      inputManager: scene.inputManager,
      x: (scene.logicalWidth - 460) / 2,
      y: (scene.logicalHeight - 360) / 2,
      width: 460,
      height: 360,
      visible: false
    });

    // 手柄战斗控制器：处理 RT攻击/RB技能/LB轮盘/Y轻按跳跃与长按轻功/B投掷/LT格挡
    scene.gamepadCombat = new GamepadCombatController();
    // 环形技能轮盘（LB 按住弹出）
    scene.skillWheelOverlay = new SkillWheelOverlay({
      canvasWidth: scene.logicalWidth,
      canvasHeight: scene.logicalHeight
    });

    // 注册 UI 元素到 UIClickHandler
    scene.uiClickHandler.registerElement(scene.skillWheelOverlay);
    scene.uiClickHandler.registerElement(scene.itemGainedPopup);
    scene.uiClickHandler.registerElement(scene.gamepadPanel);
    scene.uiClickHandler.registerElement(scene.backpackPanel);
    scene.uiClickHandler.registerElement(scene.bottomControlBar);
    scene.uiClickHandler.registerElement(scene.dialogueBox);
    if (scene.bagButton) scene.uiClickHandler.registerElement(scene.bagButton);
    if (scene.settingsButton) scene.uiClickHandler.registerElement(scene.settingsButton);
    if (scene.jumpButton) scene.uiClickHandler.registerElement(scene.jumpButton);
    if (scene.flightButton) scene.uiClickHandler.registerElement(scene.flightButton);
    if (scene.throwButton) scene.uiClickHandler.registerElement(scene.throwButton);
    if (scene.blockButton) scene.uiClickHandler.registerElement(scene.blockButton);

    // 注册面板到 UISystem（统一管理悬停等）
    scene.uiSystem.registerPanel('backpack', scene.backpackPanel);
    scene.uiSystem.registerPanel('bottomControl', scene.bottomControlBar);
    scene.uiSystem.registerPanel('dialogue', scene.dialogueBox);

    // PC 功能按钮初始居中（随屏幕宽度自动对齐）
    this.layoutPCFunctionButtons(scene.logicalWidth, scene.logicalHeight);

    // 右侧小地图（以真实地图为基础，缩小到10%）
    const minimapSize = 150;
    scene.minimap = new Minimap({
      x: scene.logicalWidth - minimapSize - 10,
      y: 10,
      width: minimapSize,
      height: minimapSize,
      scale: 0.1,
      visible: true
    });
    // 记录右边锚点（resize 后重新定位用）
    scene.minimap._anchorRight = scene.logicalWidth - 10;
    // terrain 绑定与缩略图缓存失效由通用 binding 管理。
    scene._terrainBinding.updateMinimap(scene.minimap);
    // 绑定大地图 region 边界（有 _worldRegion 时小地图以整体边界为准）
    if (scene._worldRegion) {
      scene.minimap.setWorldRegion(scene._worldRegion);
    }

    // 应用 UI 编辑器保存的布局（百分比 → 逻辑坐标），覆盖默认位置/大小
    scene._applyUILayout();
  }

  /** 将相机、核心系统和 HUD 面板绑定到当前玩家实体。 */
  bindPlayer(player = this.scene.playerEntity, options = {}) {
    const scene = this.scene;
    const { syncCameraPosition = true, log = true } = options || {};
    scene.playerEntity = player || null;

    if (player) {
      const transform = player.getComponent?.('transform');
      if (transform && scene.camera) {
        scene.camera.setTarget?.(transform);
        if (syncCameraPosition) {
          const position = transform.position || transform;
          scene.camera.setPosition?.(position.x, position.y);
        }
      }
    } else {
      scene.camera?.setTarget?.(null);
    }

    scene.combatSystem?.setPlayerEntity?.(player || null);
    scene.movementSystem?.setPlayerEntity?.(player || null);
    scene.backpackPanel?.setEntity?.(player || null);
    scene.backpackPanel?.setInputManager?.(scene.inputManager || null);
    scene.bottomControlBar?.setEntity?.(player || null);
    scene.playerStatusHUD?.setPlayer?.(player || null);

    if (player && log) console.log('BaseGameScene: UI面板已绑定到玩家实体');
    return Boolean(player);
  }

  async applyUILayout() {
    const scene = this.scene;
    try {
      await InputHints.load('config/');
      scene.uiLayoutLoader = new UILayoutLoader({ basePath: 'config/' });
      if (!await scene.uiLayoutLoader.load()) return;
      const width = scene.logicalWidth;
      const height = scene.logicalHeight;
      const loader = scene.uiLayoutLoader;

      if (scene.backpackPanel) loader.applyToCanvasPanel('backpackPanel', scene.backpackPanel, width, height);

      const buttons = this._pcFunctionButtons();
      scene._pcFnFromEditor = Object.keys(buttons).some(id => loader.getPct(id));
      if (scene._pcFnFromEditor) {
        for (const [id, button] of Object.entries(buttons)) {
          if (button) loader.applyToCanvasPanel(id, button, width, height);
        }
      }

      this._applyBottomControlLayout(loader, width, height);
      this._applyHudLayout(loader, width, height);
      scene.backpackPanel?.layout();
      if (!scene._pcFnFromEditor) this.layoutPCFunctionButtons(width, height);
      await this.applyPanelLayout();
    } catch (error) {
      console.warn('BaseGameScene: 应用 UI 布局失败', error);
    }
  }

  async applyPanelLayout() {
    const scene = this.scene;
    try {
      const loader = new PanelLayoutLoader({ basePath: 'config/' });
      const loaded = await loader.load();
      const definition = loaded ? loader.getPanel('backpackPanel') : null;
      if (definition && scene.backpackPanel?.applyPanelLayout) {
        scene.backpackPanel.applyPanelLayout(definition);
      }
    } catch (error) {
      console.warn('BaseGameScene: 面板布局加载失败，使用默认', error);
    }
  }

  layoutPCFunctionButtons(width, height) {
    const buttons = Object.values(this._pcFunctionButtons()).filter(Boolean);
    if (buttons.length === 0) return;
    const buttonWidth = buttons[0].width || 50;
    const gap = 6;
    let x = Math.round((width - (buttons.length * buttonWidth + (buttons.length - 1) * gap)) / 2);
    const y = Math.round(height - 80);
    for (const button of buttons) {
      button.x = x;
      button.y = y;
      x += buttonWidth + gap;
    }
  }

  onResize(width, height) {
    const scene = this.scene;
    scene.logicalWidth = width;
    scene.logicalHeight = height;
    if (scene.isometricRenderer) {
      scene.isometricRenderer.canvasWidth = width;
      scene.isometricRenderer.canvasHeight = height;
    }
    if (scene.camera) {
      scene.camera.width = width;
      scene.camera.height = height;
    }
    this._resizeBottomControl(width, height);
    this._resizePCButtons(width, height);
    this._resizeBackpack(width, height);
    if (scene.playerStatusHUD && scene.uiStrategy?.layoutPlayerStatusHUD) {
      scene.uiStrategy.layoutPlayerStatusHUD(scene.playerStatusHUD, width, height);
    }
    if (scene.minimap) {
      scene.minimap._anchorRight = width - 10;
      scene.minimap.x = width - scene.minimap.width - 10;
      scene.minimap.y = 10;
    }
  }

  syncTouchControlsForBackpack() {
    const scene = this.scene;
    if (typeof document === 'undefined' || !document.body) return;
    const isOpen = !!scene.backpackPanel?.visible;
    if (scene._touchControlsDimmed === isOpen) return;
    scene._touchControlsDimmed = isOpen;
    document.body.classList.toggle('backpack-open', isOpen);
  }

  updatePanelHover() {
    const scene = this.scene;
    this.syncTouchControlsForBackpack();
    const mouse = scene.inputManager.getMousePosition();
    scene.uiSystem.updateHover(mouse.x, mouse.y);
    for (const button of Object.values(this._pcFunctionButtons())) {
      button?.handleMouseMove(mouse.x, mouse.y);
    }
    if (scene.backpackPanel?.visible) scene.backpackPanel.handleMouseMove(mouse.x, mouse.y);
    const isPressed = scene.inputManager.isMouseButtonDown
      ? scene.inputManager.isMouseButtonDown(0)
      : scene.inputManager.mouse?.isDown;
    if (!isPressed && scene.backpackPanel?.scrollbarDragging) scene.backpackPanel.endScrollbarDrag();
  }

  _pcFunctionButtons() {
    const scene = this.scene;
    return {
      'pc-block': scene.blockButton,
      'pc-jump': scene.jumpButton,
      'pc-flight': scene.flightButton,
      'pc-throw': scene.throwButton,
      'pc-bag': scene.bagButton,
      'pc-settings': scene.settingsButton
    };
  }

  _applyBottomControlLayout(loader, width, height) {
    const bar = this.scene.bottomControlBar;
    if (!bar) return;
    const definitions = {
      hpOrb: loader.getRect('pc-hp-orb', width, height),
      mpOrb: loader.getRect('pc-mp-orb', width, height),
      potion1: loader.getRect('pc-potion1', width, height),
      potion2: loader.getRect('pc-potion2', width, height),
      skill1: loader.getRect('pc-skill1', width, height),
      skill2: loader.getRect('pc-skill2', width, height),
      skill3: loader.getRect('pc-skill3', width, height),
      skill4: loader.getRect('pc-skill4', width, height),
      skill5: loader.getRect('pc-skill5', width, height)
    };
    if (Object.values(definitions).some(Boolean)) bar.applySubLayout(definitions);
    else loader.applyToCanvasPanel('bottomControlBar', bar, width, height);
  }

  _applyHudLayout(loader, width, height) {
    const hud = this.scene.playerStatusHUD;
    if (!hud) return;
    const definition = {
      avatarRect: loader.getRect('hud-avatar', width, height),
      nameRect: loader.getRect('hud-name', width, height),
      hpRect: loader.getRect('hud-hp', width, height),
      mpRect: loader.getRect('hud-mp', width, height)
    };
    if (Object.values(definition).some(Boolean)) hud.applySubLayout(definition);
  }

  _resizeBottomControl(width, height) {
    const bar = this.scene.bottomControlBar;
    if (!bar) return;
    bar.width = width;
    bar.x = 0;
    bar.y = height - bar.height;
    const slotSize = bar.skillSlots[0]?.size || 40;
    const gap = 6;
    const totalWidth = bar.skillSlots.length * slotSize + (bar.skillSlots.length - 1) * gap;
    const startX = width / 2 - totalWidth / 2 + slotSize / 2;
    bar.skillSlots.forEach((slot, index) => { slot.x = startX + index * (slotSize + gap); });
    const radius = bar.hpOrb.radius;
    bar.hpOrb.x = width / 2 - totalWidth / 2 - 10 - radius;
    bar.mpOrb.x = width / 2 + totalWidth / 2 + 10 + radius;
  }

  _resizePCButtons(width, height) {
    const scene = this.scene;
    if (!scene._pcFnFromEditor || !scene.uiLayoutLoader) return this.layoutPCFunctionButtons(width, height);
    for (const [id, button] of Object.entries(this._pcFunctionButtons())) {
      if (button) scene.uiLayoutLoader.applyToCanvasPanel(id, button, width, height);
    }
  }

  _resizeBackpack(width, height) {
    const scene = this.scene;
    const panel = scene.backpackPanel;
    if (!panel) return;
    const loader = scene.uiLayoutLoader;
    if (loader?.getPct?.('backpackPanel')) loader.applyToCanvasPanel('backpackPanel', panel, width, height);
    else {
      panel.x = Math.max(10, Math.round((width - panel.width) / 2));
      panel.y = Math.max(10, height - 100 - panel.height);
    }
    panel.layout();
  }
}

export default ScenePanelLayout;
