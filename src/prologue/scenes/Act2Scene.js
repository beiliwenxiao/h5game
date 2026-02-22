/**
 * Act2Scene - 第二幕：符水救灾
 * 
 * 继承自 BaseGameScene，包含第二幕特有功能：
 * - 张角NPC和对话
 * - 符水剧情
 * - 装备升级
 * 
 * 需求：8, 9, 10, 11, 12
 */

import { BaseGameScene } from './BaseGameScene.js';
import { AttributeSystem } from '../../systems/AttributeSystem.js';
import { SkillTreeSystem } from '../../systems/SkillTreeSystem.js';

export class Act2Scene extends BaseGameScene {
  constructor() {
    super(2, {
      title: '第二幕：符水救灾',
      description: '你在张角的粥棚中醒来，了解符水的真相'
    });

    // 第二幕特有：对话阶段
    this.dialoguePhase = 'awakening';
    
    // 第二幕特有：对话完成标志
    this.awakeningDialogueCompleted = false;
    this.talismanWaterDialogueCompleted = false;
    this.equipmentUpgradeDialogueCompleted = false;
    
    // 第二幕特有：物品获得标志
    this.hasReceivedEquipment = false;
    
    // 第二幕特有：符水流程状态
    this.talismanWaterGiven = false;
    this.waitingForTalismanUse = false;
    this.talismanWaterUsed = false;
    
    // 第二幕特有：张角NPC
    this.zhangjiaoNPC = null;
    
    // 第二幕特有：场景完成标志
    this.isSceneComplete = false;
    
    // 第二幕特有：通知回调
    this.onNotification = null;
  }

  /**
   * 场景进入
   */
  enter(data = null) {
    // 调用父类的 enter，初始化所有基础系统
    // 父类会自动处理玩家实体的继承
    super.enter(data);
    
    console.log('Act2Scene: 进入第二幕场景', data);
    
    // 重置玩家位置
    if (this.playerEntity) {
      const transform = this.playerEntity.getComponent('transform');
      if (transform) {
        transform.position.x = 200;
        transform.position.y = 300;
      }
      
      // 设置玩家濒死状态（第二幕开始时生命值1点，魔法值1点）
      const stats = this.playerEntity.getComponent('stats');
      if (stats) {
        stats.hp = 1;
        stats.mp = 1;
        console.log('Act2Scene: 玩家处于濒死状态 - HP: 1, MP: 1');
      }
    }
    
    // 清除第一幕的敌人和物品
    this.enemyEntities = [];
    this.pickupItems = [];
    this.equipmentItems = [];
    
    // 重置第一幕的状态
    this.tutorialPhase = 'awakening';
    this.playerDied = false;
    this.isTransitioning = false;
    this.combatWave = 0;
    
    // 隐藏第一幕的火堆
    if (this.campfire) {
      this.campfire.lit = false;
      this.campfire.emitters = [];
    }
    
    // 初始化第二幕特有系统
    this.initializeAct2Systems();
    
    // 创建张角NPC
    this.createZhangjiaoNPC();
    
    // 开始觉醒对话
    this.startAwakeningDialogue();
  }

  /**
   * 初始化第二幕特有系统
   */
  initializeAct2Systems() {
    this.attributeSystem = new AttributeSystem();
    this.skillTreeSystem = new SkillTreeSystem();
    this.registerAct2Dialogues();
    this.registerAct2Tutorials();
    console.log('Act2Scene: 第二幕系统初始化完成');
  }

  /**
   * 注册第二幕对话
   */
  registerAct2Dialogues() {
    // 觉醒对话
    this.dialogueSystem.registerDialogue('awakening', {
      title: '觉醒',
      startNode: 'start',
      nodes: {
        start: { speaker: '张角', portrait: 'zhangjiao', text: '你醒了。你在荒野中昏倒了，我们把你救了回来。', nextNode: 'player_response' },
        player_response: { speaker: '你', portrait: 'player', text: '这里是...？', nextNode: 'zhangjiao_explain' },
        zhangjiao_explain: { speaker: '张角', portrait: 'zhangjiao', text: '这里是我们的粥棚。乱世之中，百姓流离失所，我们在这里施粥救济灾民。', nextNode: 'player_thanks' },
        player_thanks: { speaker: '你', portrait: 'player', text: '多谢救命之恩。', nextNode: 'zhangjiao_invite' },
        zhangjiao_invite: { speaker: '张角', portrait: 'zhangjiao', text: '不必客气。如果你愿意，可以留下来帮忙。这乱世，需要更多有志之士。', nextNode: null }
      }
    });

    // 符水对话
    this.dialogueSystem.registerDialogue('talisman_water', {
      title: '符水的真相',
      startNode: 'start',
      nodes: {
        start: { speaker: '张角', portrait: 'zhangjiao', text: '来，喝碗符水吧。', nextNode: 'player_question' },
        player_question: { speaker: '你', portrait: 'player', text: '符水？', nextNode: 'zhangjiao_explain' },
        zhangjiao_explain: { speaker: '张角', portrait: 'zhangjiao', text: '官府不允许私人施粥，但如果说这是"仙家符水"，就合法了。', nextNode: 'player_understand' },
        player_understand: { speaker: '你', portrait: 'player', text: '原来如此...这是智慧啊。', nextNode: 'zhangjiao_smile' },
        zhangjiao_smile: { speaker: '张角', portrait: 'zhangjiao', text: '乱世求生，需要智慧。来，喝吧，这符水能恢复你的体力。', nextNode: null }
      }
    });

    // 装备升级对话
    this.dialogueSystem.registerDialogue('equipment_upgrade', {
      title: '装备升级',
      startNode: 'start',
      nodes: {
        start: { speaker: '张角', portrait: 'zhangjiao', text: '你需要更好的装备来保护自己。这些给你。', nextNode: 'player_receive' },
        player_receive: { speaker: '你', portrait: 'player', text: '这些装备...太好了！', nextNode: 'zhangjiao_advice' },
        zhangjiao_advice: { speaker: '张角', portrait: 'zhangjiao', text: '装备只是外物，真正的力量来自于你自己。', nextNode: null }
      }
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
   * 开始觉醒对话
   */
  startAwakeningDialogue() {
    this.dialoguePhase = 'awakening';
    this.dialogueSystem.startDialogue('awakening');
  }

  /**
   * 开始符水对话
   */
  startTalismanWaterDialogue() {
    this.dialoguePhase = 'talisman_water';
    this.dialogueSystem.startDialogue('talisman_water');
  }

  /**
   * 开始装备升级对话
   */
  startEquipmentUpgradeDialogue() {
    this.dialoguePhase = 'upgrade';
    this.dialogueSystem.startDialogue('equipment_upgrade');
  }

  /**
   * 给予符水物品
   */
  giveTalismanWater() {
    const talismanWater = {
      id: 'talisman_water',
      name: '符水',
      type: 'consumable',
      usable: true,
      maxStack: 10,
      rarity: 1,
      description: '张角的符水，可以恢复50点生命值',
      effect: { type: 'heal', value: 50 }
    };

    if (this.playerEntity) {
      const inventory = this.playerEntity.getComponent('inventory');
      if (inventory) {
        inventory.addItem(talismanWater, 1);
      }
    }

    this.talismanWaterGiven = true;
    this.waitingForTalismanUse = true;
    this.notify('得到 符水x1', 'success');
  }

  /**
   * 给予新装备
   */
  giveNewEquipment() {
    const clothArmor = { id: 'cloth_armor', name: '布衣', type: 'equipment', subType: 'armor', rarity: 0, maxStack: 1, stats: { defense: 5, maxHp: 20 } };
    const woodenSword = { id: 'wooden_sword', name: '木剑', type: 'equipment', subType: 'weapon', rarity: 0, maxStack: 1, attackSpeed: 3, stats: { attack: 10 } };

    if (this.playerEntity) {
      const inventory = this.playerEntity.getComponent('inventory');
      if (inventory) {
        inventory.addItem(clothArmor, 1);
        inventory.addItem(woodenSword, 1);
      }
    }
    
    this.hasReceivedEquipment = true;
    this.notify('得到 布衣x1', 'success');
    setTimeout(() => this.notify('得到 木剑x1', 'success'), 500);
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
    console.log(`Act2Scene 通知: ${message}`);
    if (this.onNotification) {
      this.onNotification(message, type);
    }
  }


  /**
   * 更新场景 - 覆盖父类方法，添加第二幕特有逻辑
   */
  update(deltaTime) {
    // 调用父类的 update
    super.update(deltaTime);
    
    // 第二幕特有：检查对话流程
    this.updateDialogueFlow();
  }

  /**
   * 更新对话流程
   */
  updateDialogueFlow() {
    if (this.dialogueSystem && !this.dialogueSystem.isDialogueActive()) {
      // 觉醒对话结束 -> 符水对话
      if (this.dialoguePhase === 'awakening' && !this.awakeningDialogueCompleted) {
        this.awakeningDialogueCompleted = true;
        setTimeout(() => this.startTalismanWaterDialogue(), 1000);
      }
      // 符水对话结束 -> 给予符水
      else if (this.dialoguePhase === 'talisman_water' && !this.talismanWaterDialogueCompleted) {
        this.talismanWaterDialogueCompleted = true;
        this.giveTalismanWater();
      }
      // 符水已使用 -> 装备升级对话
      else if (this.talismanWaterUsed && !this.equipmentUpgradeDialogueCompleted) {
        this.equipmentUpgradeDialogueCompleted = true;
        setTimeout(() => this.startEquipmentUpgradeDialogue(), 1000);
      }
      // 装备升级对话结束 -> 给予装备，等待玩家装备
      else if (this.dialoguePhase === 'upgrade' && this.equipmentUpgradeDialogueCompleted && !this.hasReceivedEquipment) {
        this.giveNewEquipment();
        this.waitingForEquip = true;
      }
      // 玩家已装备两件物品 -> 切换到第三幕
      else if (this.waitingForEquip && !this.isSceneComplete && this.checkEquipmentDone()) {
        this.isSceneComplete = true;
        this.notify('装备完成！即将进入第三幕...', 'success');
        setTimeout(() => {
          this.transitionToAct3();
        }, 2000);
      }
    }
  }

  /**
   * 检查玩家是否已装备布衣和木剑
   * @returns {boolean}
   */
  checkEquipmentDone() {
    if (!this.playerEntity) return false;
    const equipment = this.playerEntity.getComponent('equipment');
    if (!equipment) return false;
    
    const hasWeapon = equipment.getEquipment('mainhand') !== null;
    const hasArmor = equipment.getEquipment('armor') !== null;
    return hasWeapon && hasArmor;
  }

  /**
   * 切换到第三幕
   */
  transitionToAct3() {
    console.log('Act2Scene: 切换到第三幕');
    
    // 通过 SceneManager 切换场景
    if (this.sceneManager) {
      // 直接传递玩家实体，让BaseGameScene继承
      this.sceneManager.switchTo('Act3Scene', {
        playerEntity: this.playerEntity,
        previousAct: 2
      });
    } else {
      console.error('Act2Scene: SceneManager 未设置，无法切换场景');
    }
  }

  /**
   * 物品使用回调 - 覆盖父类方法，检测符水使用
   */
  onItemUsed(item, healAmount, manaAmount) {
    super.onItemUsed(item, healAmount, manaAmount);
    
    // 检测符水使用
    if (item && item.id === 'talisman_water' && this.waitingForTalismanUse) {
      this.waitingForTalismanUse = false;
      this.talismanWaterUsed = true;
      this.notify(`恢复了 ${healAmount} 点生命值`, 'success');
    }
  }

  /**
   * 渲染背景 - 覆盖父类方法，渲染粥棚背景
   */
  renderBackground(ctx) {
    // 调用父类渲染网格背景
    super.renderBackground(ctx);
  }

  /**
   * 渲染场景 - 覆盖父类方法，添加第二幕特有渲染
   */
  render(ctx) {
    // 调用父类的 render
    super.render(ctx);
    
    // 渲染场景标题（UI层，在对话框之后）
    this.renderSceneTitle(ctx);
    
    // 渲染提示信息（UI层）
    this.renderHints(ctx);
  }

  /**
   * 渲染世界对象 - 覆盖父类方法，添加NPC渲染
   */
  renderWorldObjects(ctx) {
    // 调用父类的渲染（渲染实体）
    super.renderWorldObjects(ctx);
    
    // 渲染张角NPC（在相机变换内）
    if (this.zhangjiaoNPC) {
      this.renderNPC(ctx, this.zhangjiaoNPC);
    }
  }

  /**
   * 渲染场景标题
   */
  renderSceneTitle(ctx) {
    // 标题显示5秒后消失
    if (!this._titleStartTime) {
      this._titleStartTime = performance.now();
    }
    const elapsed = (performance.now() - this._titleStartTime) / 1000;
    if (elapsed > 5) return;
    
    // 最后1秒淡出
    let alpha = 1;
    if (elapsed > 4) {
      alpha = 1 - (elapsed - 4);
    }
    
    ctx.save();
    
    ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * alpha})`;
    ctx.fillRect(0, 0, this.logicalWidth, 80);
    
    ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('第二幕：符水救灾', this.logicalWidth / 2, 50);
    
    ctx.restore();
  }

  /**
   * 渲染NPC
   */
  renderNPC(ctx, npc) {
    ctx.save();
    
    // 绘制NPC圆形
    ctx.fillStyle = '#4CAF50';
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
    } else if (this.waitingForTalismanUse) {
      hints.push('按 B 键打开背包，使用符水');
    } else if (this.waitingForEquip && !this.isSceneComplete) {
      hints.push('按 B 键打开背包，装备布衣和木剑');
    } else if (this.isSceneComplete) {
      hints.push('第二幕完成！即将进入第三幕...');
    }
    
    // 渲染提示
    if (hints.length > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(this.logicalWidth / 2 - 150, this.logicalHeight - 60, 300, 40);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(hints[0], this.logicalWidth / 2, this.logicalHeight - 35);
    }
    
    ctx.restore();
  }

  /**
   * 注册第二幕教程（占位方法）
   */
  registerAct2Tutorials() {
    // 第二幕暂无特殊教程
    console.log('Act2Scene: 第二幕教程注册完成');
  }
}

export default Act2Scene;