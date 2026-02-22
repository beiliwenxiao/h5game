/**
 * Act3Scene - 第三幕：铜钱法器
 * 
 * 继承自 BaseGameScene，包含第三幕特有功能：
 * - 铜钱法器剧情
 * - 负属性展示
 * - 货币系统
 * - 商店系统
 * - 装备强化系统
 * 
 * 需求：13, 14, 15, 16, 17, 18
 */

import { BaseGameScene } from './BaseGameScene.js';
import { ShopSystem } from '../../systems/ShopSystem.js';
import { EnhancementSystem } from '../../systems/EnhancementSystem.js';

export class Act3Scene extends BaseGameScene {
  constructor() {
    super(3, {
      title: '第三幕：铜钱法器',
      description: '张角传授铜钱法器，学习货币和交易系统'
    });

    // 第三幕特有：对话阶段
    this.dialoguePhase = 'coin_artifact';
    
    // 第三幕特有：对话完成标志
    this.coinArtifactDialogueCompleted = false;
    this.shopIntroDialogueCompleted = false;
    this.enhancementIntroDialogueCompleted = false;
    this.readyDialogueCompleted = false;
    
    // 第三幕特有：物品获得标志
    this.hasReceivedCoinSword = false;
    this.hasReceivedGold = false;
    
    // 第三幕特有：系统初始化标志
    this.shopSystemInitialized = false;
    this.enhancementSystemInitialized = false;
    
    // 第三幕特有：张角NPC
    this.zhangjiaoNPC = null;
    
    // 第三幕特有：商人NPC
    this.merchantNPC = null;

    
    // 第三幕特有：场景完成标志
    this.isSceneComplete = false;
    
    // 第三幕特有：商店和强化系统
    this.shopSystem = null;
    this.enhancementSystem = null;
    
    // 第三幕特有：通知回调
    this.onNotification = null;
  }

  /**
   * 场景进入
   */
  enter(data = null) {
    // 调用父类的 enter，初始化所有基础系统
    super.enter(data);
    
    console.log('Act3Scene: 进入第三幕场景', data);
    
    // 重置玩家位置
    if (this.playerEntity) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform) {
        transform.position.x = 300;
        transform.position.y = 350;
      }
    }
    
    // 清除前面幕次的敌人和物品
    this.enemyEntities = [];
    this.pickupItems = [];
    this.equipmentItems = [];
    
    // 初始化第三幕特有系统
    this.initializeAct3Systems();
    
    // 创建NPCs
    this.createZhangjiaoNPC();
    this.createMerchantNPC();
    
    // 开始铜钱法器对话
    this.startCoinArtifactDialogue();
  }


  /**
   * 初始化第三幕特有系统
   */
  initializeAct3Systems() {
    // 初始化商店系统
    this.shopSystem = new ShopSystem();
    this.shopSystemInitialized = true;
    
    // 初始化强化系统
    this.enhancementSystem = new EnhancementSystem();
    this.enhancementSystemInitialized = true;
    
    // 注册第三幕对话
    this.registerAct3Dialogues();
    
    // 注册第三幕教程
    this.registerAct3Tutorials();
    
    console.log('Act3Scene: 第三幕系统初始化完成');
  }

  /**
   * 注册第三幕对话
   */
  registerAct3Dialogues() {
    // 铜钱法器对话
    this.dialogueSystem.registerDialogue('coin_artifact', {
      title: '铜钱法器',
      startNode: 'start',
      nodes: {
        start: { 
          speaker: '张角', 
          portrait: 'zhangjiao', 
          text: '来，我给你一把铜钱剑。', 
          nextNode: 'player_question' 
        },
        player_question: { 
          speaker: '你', 
          portrait: 'player', 
          text: '铜钱剑？', 
          nextNode: 'zhangjiao_explain' 
        },
        zhangjiao_explain: { 
          speaker: '张角', 
          portrait: 'zhangjiao', 
          text: '官府不允许私人发钱，但铜钱剑就是法器，就合法了。', 
          nextNode: 'player_understand' 
        },
        player_understand: { 
          speaker: '你', 
          portrait: 'player', 
          text: '原来如此...又是一个巧妙的方法。', 
          nextNode: 'zhangjiao_gift' 
        },
        zhangjiao_gift: { 
          speaker: '张角', 
          portrait: 'zhangjiao', 
          text: '这把铜钱剑给你。虽然攻击力不错，但耐久度较低，要小心使用。', 
          nextNode: null 
        }
      }
    });

    // 商店介绍对话
    this.dialogueSystem.registerDialogue('shop_intro', {
      title: '商店介绍',
      startNode: 'start',
      nodes: {
        start: { 
          speaker: '张角', 
          portrait: 'zhangjiao', 
          text: '那边有个商人，你可以去买卖物品。', 
          nextNode: 'player_thanks' 
        },
        player_thanks: { 
          speaker: '你', 
          portrait: 'player', 
          text: '多谢指点。', 
          nextNode: 'zhangjiao_advice' 
        },
        zhangjiao_advice: { 
          speaker: '张角', 
          portrait: 'zhangjiao', 
          text: '记住，钱财乃身外之物，但在乱世中也是生存的必需品。', 
          nextNode: null 
        }
      }
    });

    // 强化介绍对话
    this.dialogueSystem.registerDialogue('enhancement_intro', {
      title: '装备强化',
      startNode: 'start',
      nodes: {
        start: { 
          speaker: '商人', 
          portrait: 'merchant', 
          text: '我这里可以强化装备，让它们变得更强。', 
          nextNode: 'player_interest' 
        },
        player_interest: { 
          speaker: '你', 
          portrait: 'player', 
          text: '如何强化？', 
          nextNode: 'merchant_explain' 
        },
        merchant_explain: { 
          speaker: '商人', 
          portrait: 'merchant', 
          text: '需要消耗金币和强化石。强化等级越高，成功率越低，但属性提升也越大。', 
          nextNode: 'merchant_warning' 
        },
        merchant_warning: { 
          speaker: '商人', 
          portrait: 'merchant', 
          text: '不过要小心，高等级强化失败可能会损坏装备。', 
          nextNode: null 
        }
      }
    });

    // 准备前往下一幕对话
    this.dialogueSystem.registerDialogue('ready_for_next', {
      title: '准备前往下一幕',
      startNode: 'start',
      nodes: {
        start: { 
          speaker: '张角', 
          portrait: 'zhangjiao', 
          text: '你已经掌握了货币和交易的基本知识。', 
          nextNode: 'zhangjiao_question' 
        },
        zhangjiao_question: { 
          speaker: '张角', 
          portrait: 'zhangjiao', 
          text: '接下来，我将带你了解更深层的修炼之道。你准备好了吗？', 
          nextNode: 'player_ready' 
        },
        player_ready: { 
          speaker: '你', 
          portrait: 'player', 
          text: '我准备好了！', 
          nextNode: 'zhangjiao_encourage' 
        },
        zhangjiao_encourage: { 
          speaker: '张角', 
          portrait: 'zhangjiao', 
          text: '很好！记住今天学到的一切，它们将在未来的旅途中帮助你。', 
          nextNode: null 
        }
      }
    });
  }

  /**
   * 注册第三幕教程
   */
  registerAct3Tutorials() {
    // 货币系统教程
    this.tutorialSystem.registerTutorial('currency_system', {
      id: 'currency_system',
      title: '货币系统',
      content: '你现在拥有金币了！可以用金币购买物品和强化装备。',
      triggerCondition: () => this.hasReceivedGold,
      completionCondition: () => true,
      pauseGame: false
    });

    // 商店系统教程
    this.tutorialSystem.registerTutorial('shop_system', {
      id: 'shop_system',
      title: '商店系统',
      content: '按 M 键打开商店，可以购买和出售物品。',
      triggerCondition: () => this.shopIntroDialogueCompleted,
      completionCondition: () => true,
      pauseGame: false
    });

    // 强化系统教程
    this.tutorialSystem.registerTutorial('enhancement_system', {
      id: 'enhancement_system',
      title: '装备强化',
      content: '按 H 键打开强化界面，可以提升装备属性。注意：高等级强化有失败风险！',
      triggerCondition: () => this.enhancementIntroDialogueCompleted,
      completionCondition: () => true,
      pauseGame: false
    });
  }


  /**
   * 创建张角NPC
   */
  createZhangjiaoNPC() {
    this.zhangjiaoNPC = {
      id: 'zhangjiao',
      name: '张角',
      title: '太平道创始人',
      position: { x: 400, y: 300 }
    };
  }

  /**
   * 创建商人NPC
   */
  createMerchantNPC() {
    this.merchantNPC = {
      id: 'merchant',
      name: '商人',
      title: '杂货商',
      position: { x: 600, y: 300 }
    };
  }

  /**
   * 开始铜钱法器对话
   */
  startCoinArtifactDialogue() {
    this.dialoguePhase = 'coin_artifact';
    this.dialogueSystem.startDialogue('coin_artifact');
  }

  /**
   * 开始商店介绍对话
   */
  startShopIntroDialogue() {
    this.dialoguePhase = 'shop_intro';
    this.dialogueSystem.startDialogue('shop_intro');
  }

  /**
   * 开始强化介绍对话
   */
  startEnhancementIntroDialogue() {
    this.dialoguePhase = 'enhancement_intro';
    this.dialogueSystem.startDialogue('enhancement_intro');
  }

  /**
   * 开始准备前往下一幕对话
   */
  startReadyForNextDialogue() {
    this.dialoguePhase = 'ready_for_next';
    this.dialogueSystem.startDialogue('ready_for_next');
  }

  /**
   * 给予铜钱剑（带负属性）
   */
  giveCoinSword() {
    const coinSword = {
      id: 'coin_sword',
      name: '铜钱剑',
      type: 'consumable',
      subType: 'currency_item',
      rarity: 1,
      maxStack: 1,
      usable: true,
      description: '用铜钱串成的剑，使用后可获得300铜钱',
      effect: {
        type: 'currency',
        value: 300
      }
    };

    if (this.playerEntity) {
      const inventory = this.playerEntity.getComponent('inventory');
      if (inventory) {
        inventory.addItem(coinSword, 1);
      }
    }

    this.hasReceivedCoinSword = true;
    this.notify('得到 铜钱剑x1（使用可获得300铜钱）', 'success');
  }


  /**
   * 给予金币
   */
  giveGold() {
    const goldAmount = 500;
    
    // 添加金币到商店系统
    if (this.shopSystem) {
      this.shopSystem.addCurrency('gold', goldAmount);
    }
    
    this.hasReceivedGold = true;
    this.notify(`得到 ${goldAmount} 金币`, 'success');
  }

  /**
   * 设置通知回调
   */
  setNotificationCallback(callback) {
    this.onNotification = callback;
  }

  /**
   * 发送通知
   */
  notify(message, type = 'info') {
    console.log(`Act3Scene 通知: ${message}`);
    if (this.onNotification) {
      this.onNotification(message, type);
    }
  }

  /**
   * 物品使用回调 - 覆盖父类方法，处理铜钱剑的货币效果
   */
  onItemUsed(item, healAmount, manaAmount) {
    super.onItemUsed(item, healAmount, manaAmount);
    
    // 处理货币类物品
    if (item && item.effect && item.effect.type === 'currency') {
      const amount = item.effect.value || 0;
      if (this.shopSystem && amount > 0) {
        this.shopSystem.addCurrency('gold', amount);
        this.notify(`使用 ${item.name}，获得 ${amount} 铜钱`, 'success');
      }
    }
  }

  /**
   * 更新场景 - 覆盖父类方法，添加第三幕特有逻辑
   */
  update(deltaTime) {
    // 第三幕特有：在父类update之前检查按键（避免keysPressed被清空）
    this.checkShopToggle();
    this.checkEnhancementToggle();
    this.checkReadyForNext();
    
    // 调用父类的 update
    super.update(deltaTime);
    
    // 更新商店系统
    if (this.shopSystem) {
      this.shopSystem.update(deltaTime);
    }
    
    // 第三幕特有：检查对话流程
    this.updateDialogueFlow();
  }

  /**
   * 检查商店切换（M键）
   */
  checkShopToggle() {
    // 对话进行中或场景已完成时，禁用商店切换
    if (this.dialogueSystem?.isDialogueActive() || this.isSceneComplete) {
      return;
    }
    
    // 使用原始键名 'm' 和 'M'
    const mPressed = this.inputManager.isKeyPressed('m') || this.inputManager.isKeyPressed('M');
    
    if (mPressed) {
      console.log('Act3Scene: M键被按下，shopIntroDialogueCompleted =', this.shopIntroDialogueCompleted);
      if (this.shopSystemInitialized && this.shopIntroDialogueCompleted) {
        this.toggleShop();
      }
    }
  }

  /**
   * 检查强化切换（H键）
   */
  checkEnhancementToggle() {
    // 对话进行中或场景已完成时，禁用强化切换
    if (this.dialogueSystem?.isDialogueActive() || this.isSceneComplete) {
      return;
    }
    
    // 使用原始键名 'h' 和 'H'
    const hPressed = this.inputManager.isKeyPressed('h') || this.inputManager.isKeyPressed('H');
    
    if (hPressed) {
      console.log('Act3Scene: H键被按下，enhancementIntroDialogueCompleted =', this.enhancementIntroDialogueCompleted);
      if (this.enhancementSystemInitialized && this.enhancementIntroDialogueCompleted) {
        this.toggleEnhancement();
      }
    }
  }

  /**
   * 检查准备前往下一幕（R键）
   */
  checkReadyForNext() {
    // 只有在强化介绍对话完成后，且没有对话进行中，且场景未完成时才能触发
    if (!this.enhancementIntroDialogueCompleted || 
        this.dialogueSystem?.isDialogueActive() || 
        this.readyDialogueCompleted ||
        this.isSceneComplete) {
      return;
    }
    
    // 使用原始键名 'r' 和 'R'
    const rPressed = this.inputManager.isKeyPressed('r') || this.inputManager.isKeyPressed('R');
    
    if (rPressed) {
      console.log('Act3Scene: R键被按下，开始准备对话');
      this.startReadyForNextDialogue();
    }
  }

  /**
   * 更新对话流程
   */
  updateDialogueFlow() {
    if (this.dialogueSystem && !this.dialogueSystem.isDialogueActive()) {
      // 铜钱法器对话结束 -> 给予铜钱剑和金币
      if (this.dialoguePhase === 'coin_artifact' && !this.coinArtifactDialogueCompleted) {
        console.log('Act3Scene: 铜钱法器对话完成');
        this.coinArtifactDialogueCompleted = true;
        this.giveCoinSword();
        setTimeout(() => this.startShopIntroDialogue(), 1500);
      }
      // 商店介绍对话结束 -> 触发商店教程
      else if (this.dialoguePhase === 'shop_intro' && !this.shopIntroDialogueCompleted) {
        console.log('Act3Scene: 商店介绍对话完成');
        this.shopIntroDialogueCompleted = true;
        setTimeout(() => this.startEnhancementIntroDialogue(), 1000);
      }
      // 强化介绍对话结束 -> 允许玩家体验系统
      else if (this.dialoguePhase === 'enhancement_intro' && !this.enhancementIntroDialogueCompleted) {
        console.log('Act3Scene: 强化介绍对话完成，等待玩家按R键');
        this.enhancementIntroDialogueCompleted = true;
        // 不再自动切换，等待玩家按R键触发准备对话
      }
      // 准备对话结束 -> 切换到第四幕
      else if (this.dialoguePhase === 'ready_for_next' && !this.readyDialogueCompleted) {
        console.log('Act3Scene: 准备对话完成，即将切换到第四幕');
        this.readyDialogueCompleted = true;
        this.isSceneComplete = true;
        // 延迟切换到第四幕
        setTimeout(() => {
          console.log('Act3Scene: 执行场景切换');
          this.switchToNextScene();
        }, 2000);
      }
    }
  }

  /**
   * 切换到下一幕（第四幕）
   */
  switchToNextScene() {
    console.log('Act3Scene: switchToNextScene 被调用');
    
    // 准备传递给第四幕的数据
    const stats = this.playerEntity?.getComponent('stats');
    const inventory = this.playerEntity?.getComponent('inventory');
    const equipment = this.playerEntity?.getComponent('equipment');
    
    const sceneData = {
      player: {
        name: this.playerEntity?.name || '玩家',
        class: this.playerEntity?.class || 'refugee',
        level: stats?.level || 3,
        hp: stats?.hp || 150,
        maxHp: stats?.maxHp || 150,
        mp: stats?.mp || 80,
        maxMp: stats?.maxMp || 80,
        attack: stats?.attack || 25,
        defense: stats?.defense || 15,
        inventory: inventory?.getAllItems() || [],
        equipment: equipment?.slots || {}
      },
      playerEntity: this.playerEntity,
      previousAct: 3,
      gold: this.shopSystem?.getCurrency('gold') || 0
    };
    
    console.log('Act3Scene: 准备切换到第四幕，数据：', sceneData);
    
    // 使用父类的场景切换方法
    this.goToNextScene(sceneData);
    
    console.log('Act3Scene: goToNextScene 已调用');
  }


  /**
   * 切换商店界面
   */
  toggleShop() {
    // 这里需要UI面板支持，暂时只输出日志
    console.log('Act3Scene: 切换商店界面');
    this.notify('商店功能开发中...', 'info');
  }

  /**
   * 切换强化界面
   */
  toggleEnhancement() {
    // 这里需要UI面板支持，暂时只输出日志
    console.log('Act3Scene: 切换强化界面');
    this.notify('强化功能开发中...', 'info');
  }

  /**
   * 渲染背景 - 覆盖父类方法，渲染第三幕背景
   */
  renderBackground(ctx) {
    // 调用父类渲染网格背景
    super.renderBackground(ctx);
  }


  /**
   * 渲染世界对象 - 覆盖父类方法，添加NPC渲染
   */
  renderWorldObjects(ctx) {
    // 调用父类的渲染（渲染实体）
    super.renderWorldObjects(ctx);
    
    // 渲染NPCs（在相机变换内）
    if (this.zhangjiaoNPC) {
      this.renderNPC(ctx, this.zhangjiaoNPC, '#4CAF50');
    }
    
    if (this.merchantNPC) {
      this.renderNPC(ctx, this.merchantNPC, '#FF9800');
    }
  }

  /**
   * 渲染场景 - 覆盖父类方法，添加第三幕特有渲染
   */
  render(ctx) {
    // 调用父类的 render
    super.render(ctx);
    
    // 渲染场景标题（UI层，在对话框之后）
    this.renderSceneTitle(ctx);
    
    // 渲染提示信息（UI层）
    this.renderHints(ctx);
    
    // 渲染货币显示（UI层）
    this.renderCurrency(ctx);
  }

  /**
   * 渲染场景标题
   */
  renderSceneTitle(ctx) {
    if (!this._titleStartTime) {
      this._titleStartTime = performance.now();
    }
    const elapsed = (performance.now() - this._titleStartTime) / 1000;
    if (elapsed > 5) return;
    
    let alpha = 1;
    if (elapsed > 4) alpha = 1 - (elapsed - 4);
    
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * alpha})`;
    ctx.fillRect(0, 0, this.logicalWidth, 80);
    ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('第三幕：铜钱法器', this.logicalWidth / 2, 50);
    ctx.restore();
  }

  /**
   * 渲染NPC
   */
  renderNPC(ctx, npc, color) {
    ctx.save();
    
    // 绘制NPC圆形
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(npc.position.x, npc.position.y, 30, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制NPC名称
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(npc.name, npc.position.x, npc.position.y - 40);
    
    // 绘制NPC称号
    ctx.font = '12px Arial';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(npc.title, npc.position.x, npc.position.y - 55);
    
    ctx.restore();
  }


  /**
   * 渲染提示信息
   */
  renderHints(ctx) {
    ctx.save();
    
    let hints = [];
    
    if (this.dialogueSystem && this.dialogueSystem.isDialogueActive()) {
      hints.push('按 空格键 继续对话');
    } else if (this.isSceneComplete) {
      hints.push('第三幕完成！即将进入第四幕...');
    } else if (this.enhancementIntroDialogueCompleted && !this.readyDialogueCompleted) {
      hints.push('按 M 键打开商店 | 按 H 键打开强化 | 按 R 键准备前往下一幕');
    } else if (this.shopSystemInitialized && this.enhancementSystemInitialized) {
      hints.push('按 M 键打开商店 | 按 H 键打开强化');
    }
    
    // 渲染提示
    if (hints.length > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const hintWidth = Math.max(400, ctx.measureText(hints[0]).width + 40);
      ctx.fillRect(this.logicalWidth / 2 - hintWidth / 2, this.logicalHeight - 60, hintWidth, 40);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(hints[0], this.logicalWidth / 2, this.logicalHeight - 35);
    }
    
    ctx.restore();
  }

  /**
   * 渲染货币显示
   */
  renderCurrency(ctx) {
    if (!this.hasReceivedGold || !this.shopSystem) return;
    
    ctx.save();
    
    // 货币背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(this.logicalWidth - 150, 90, 140, 40);
    
    // 货币图标和数量
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('💰', this.logicalWidth - 140, 115);
    
    const gold = this.shopSystem.getCurrency('gold');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${gold}`, this.logicalWidth - 110, 115);
    
    ctx.restore();
  }

  /**
   * 退出场景
   */
  exit() {
    // 清理第三幕特有资源
    this.shopSystem = null;
    this.enhancementSystem = null;
    
    // 调用父类的 exit
    super.exit();
  }
}

export default Act3Scene;
