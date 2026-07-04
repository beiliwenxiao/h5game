/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * DungeonPanel.js
 * 副本面板UI组件 - 显示副本列表和进入界面
 */

import { UIElement } from './UIElement.js';
import { DungeonDifficulty, DungeonState } from '../systems/DungeonSystem.js';

/**
 * 副本面板类
 */
export class DungeonPanel extends UIElement {
  /**
   * @param {Object} config
   */
  constructor(config) {
    super(config);
    
    this.dungeonSystem = config.dungeonSystem;
    this.character = config.character;
    
    this.selectedDungeon = null;
    this.selectedDifficulty = DungeonDifficulty.NORMAL;
    this.hoveredDungeon = null;
    
    this.isVisible = false;
    this.scrollOffset = 0;
    
    this.colors = {
      background: 'rgba(20, 20, 35, 0.95)',
      border: '#5a4a6a',
      dungeonLocked: '#444',
      dungeonAvailable: '#4CAF50',
      dungeonSelected: '#FF9800',
      dungeonHovered: '#87CEEB',
      text: '#FFF',
      textDisabled: '#888',
      difficultyEasy: '#4CAF50',
      difficultyNormal: '#2196F3',
      difficultyHard: '#FF9800',
      difficultyNightmare: '#F44336'
    };
    
    this.onEnterDungeon = null;
  }

  show() {
    this.isVisible = true;
    this.selectedDungeon = null;
  }

  hide() {
    this.isVisible = false;
    this.selectedDungeon = null;
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  handleClick(mouseX, mouseY) {
    if (!this.isVisible) return false;
    if (!this.containsPoint(mouseX, mouseY)) return false;

    if (this.isPointInCloseButton(mouseX, mouseY)) {
      this.hide();
      return true;
    }

    if (this.selectedDungeon && this.isPointInEnterButton(mouseX, mouseY)) {
      this.handleEnterDungeon();
      return true;
    }

    // 检查难度选择
    const difficulty = this.getDifficultyAtPosition(mouseX, mouseY);
    if (difficulty && this.selectedDungeon?.difficulties.includes(difficulty)) {
      this.selectedDifficulty = difficulty;
      return true;
    }

    // 检查副本选择
    const dungeon = this.getDungeonAtPosition(mouseX, mouseY);
    if (dungeon) {
      this.selectedDungeon = dungeon;
      if (dungeon.difficulties.length > 0) {
        this.selectedDifficulty = dungeon.difficulties[0];
      }
      return true;
    }

    return true;
  }

  handleMouseMove(mouseX, mouseY) {
    if (!this.isVisible) return;
    this.hoveredDungeon = this.getDungeonAtPosition(mouseX, mouseY);
  }

  getDungeonAtPosition(x, y) {
    const listX = this.x + 20;
    const listY = this.y + 70;
    const itemHeight = 60;
    const itemWidth = 250;
    
    const dungeons = this.dungeonSystem.getAllTemplates();
    
    for (let i = 0; i < dungeons.length; i++) {
      const itemY = listY + i * itemHeight - this.scrollOffset;
      if (itemY < listY - itemHeight || itemY > this.y + this.height - 100) continue;
      
      if (x >= listX && x <= listX + itemWidth &&
          y >= itemY && y <= itemY + itemHeight - 5) {
        return dungeons[i];
      }
    }
    
    return null;
  }

  getDifficultyAtPosition(x, y) {
    if (!this.selectedDungeon) return null;
    
    const diffX = this.x + 300;
    const diffY = this.y + 200;
    const btnWidth = 80;
    const btnHeight = 30;
    const spacing = 10;
    
    const difficulties = [
      DungeonDifficulty.EASY,
      DungeonDifficulty.NORMAL,
      DungeonDifficulty.HARD,
      DungeonDifficulty.NIGHTMARE
    ];
    
    for (let i = 0; i < difficulties.length; i++) {
      const btnX = diffX + i * (btnWidth + spacing);
      if (x >= btnX && x <= btnX + btnWidth &&
          y >= diffY && y <= diffY + btnHeight) {
        return difficulties[i];
      }
    }
    
    return null;
  }

  isPointInCloseButton(x, y) {
    return x >= this.x + this.width - 35 && x <= this.x + this.width - 10 &&
           y >= this.y + 10 && y <= this.y + 35;
  }

  isPointInEnterButton(x, y) {
    const btnX = this.x + this.width - 130;
    const btnY = this.y + this.height - 50;
    return x >= btnX && x <= btnX + 100 && y >= btnY && y <= btnY + 35;
  }

  handleEnterDungeon() {
    if (!this.selectedDungeon) return;
    
    const result = this.dungeonSystem.enterDungeon(
      this.selectedDungeon.id,
      this.character,
      this.selectedDifficulty
    );
    
    if (result.success) {
      this.onEnterDungeon && this.onEnterDungeon(result.instance);
      this.hide();
    } else {
      console.warn(result.message);
    }
  }

  render(ctx) {
    if (!this.isVisible) return;

    this.renderBackground(ctx);
    this.renderDungeonList(ctx);
    this.renderDungeonDetails(ctx);
    this.renderButtons(ctx);
    this.renderTitle(ctx);
  }

  renderBackground(ctx) {
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    ctx.strokeStyle = this.colors.border;
    ctx.lineWidth = 3;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  }

  renderDungeonList(ctx) {
    const listX = this.x + 20;
    const listY = this.y + 70;
    const itemHeight = 60;
    const itemWidth = 250;
    
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(listX - 5, listY - 5, itemWidth + 10, this.height - 130);
    
    const dungeons = this.dungeonSystem.getAllTemplates();
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(listX - 5, listY - 5, itemWidth + 10, this.height - 130);
    ctx.clip();
    
    for (let i = 0; i < dungeons.length; i++) {
      const dungeon = dungeons[i];
      const itemY = listY + i * itemHeight - this.scrollOffset;
      
      if (itemY < listY - itemHeight || itemY > this.y + this.height - 100) continue;
      
      // 背景
      let bgColor;
      if (this.selectedDungeon === dungeon) {
        bgColor = 'rgba(255, 152, 0, 0.3)';
      } else if (this.hoveredDungeon === dungeon) {
        bgColor = 'rgba(135, 206, 235, 0.2)';
      } else if (!dungeon.isUnlocked) {
        bgColor = 'rgba(68, 68, 68, 0.3)';
      } else {
        bgColor = 'rgba(76, 175, 80, 0.2)';
      }
      
      ctx.fillStyle = bgColor;
      ctx.fillRect(listX, itemY, itemWidth, itemHeight - 5);
      
      ctx.strokeStyle = dungeon.isUnlocked ? '#4CAF50' : '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(listX, itemY, itemWidth, itemHeight - 5);
      
      // 名称
      ctx.fillStyle = dungeon.isUnlocked ? this.colors.text : this.colors.textDisabled;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(dungeon.name, listX + 10, itemY + 20);
      
      // 等级要求
      ctx.fillStyle = this.character.level >= dungeon.minLevel ? '#4CAF50' : '#F44336';
      ctx.font = '11px Arial';
      ctx.fillText(`Lv.${dungeon.minLevel}+`, listX + 10, itemY + 38);
      
      // 每日次数
      if (dungeon.dailyLimit > 0) {
        const used = this.character.dungeonCounts?.[dungeon.id] || 0;
        ctx.fillStyle = used < dungeon.dailyLimit ? '#AAA' : '#F44336';
        ctx.fillText(`${used}/${dungeon.dailyLimit}次`, listX + 80, itemY + 38);
      }
      
      // 锁定图标
      if (!dungeon.isUnlocked) {
        ctx.fillStyle = '#FFF';
        ctx.font = '20px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('🔒', listX + itemWidth - 10, itemY + 30);
      }
    }
    
    ctx.restore();
  }

  renderDungeonDetails(ctx) {
    if (!this.selectedDungeon) {
      ctx.fillStyle = '#888';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('选择一个副本查看详情', this.x + 450, this.y + 200);
      return;
    }

    const detailX = this.x + 300;
    const detailY = this.y + 80;
    
    // 副本名称
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(this.selectedDungeon.name, detailX, detailY);
    
    // 描述
    ctx.fillStyle = '#AAA';
    ctx.font = '12px Arial';
    ctx.fillText(this.selectedDungeon.description, detailX, detailY + 25);
    
    // 基本信息
    let infoY = detailY + 55;
    ctx.fillStyle = '#FFF';
    ctx.font = '13px Arial';
    
    ctx.fillText(`等级要求: ${this.selectedDungeon.minLevel}`, detailX, infoY);
    infoY += 20;
    
    if (this.selectedDungeon.timeLimit > 0) {
      const minutes = Math.floor(this.selectedDungeon.timeLimit / 60);
      ctx.fillText(`时间限制: ${minutes}分钟`, detailX, infoY);
      infoY += 20;
    }
    
    if (this.selectedDungeon.entryCost > 0) {
      ctx.fillText(`入场费用: ${this.selectedDungeon.entryCost}金币`, detailX, infoY);
      infoY += 20;
    }
    
    // 难度选择
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('选择难度:', detailX, this.y + 185);
    
    this.renderDifficultyButtons(ctx, detailX, this.y + 200);
    
    // 奖励预览
    this.renderRewardPreview(ctx, detailX, this.y + 260);
  }

  renderDifficultyButtons(ctx, x, y) {
    const btnWidth = 80;
    const btnHeight = 30;
    const spacing = 10;
    
    const difficulties = [
      { id: DungeonDifficulty.EASY, name: '简单', color: this.colors.difficultyEasy },
      { id: DungeonDifficulty.NORMAL, name: '普通', color: this.colors.difficultyNormal },
      { id: DungeonDifficulty.HARD, name: '困难', color: this.colors.difficultyHard },
      { id: DungeonDifficulty.NIGHTMARE, name: '噩梦', color: this.colors.difficultyNightmare }
    ];
    
    for (let i = 0; i < difficulties.length; i++) {
      const diff = difficulties[i];
      const btnX = x + i * (btnWidth + spacing);
      const isAvailable = this.selectedDungeon?.difficulties.includes(diff.id);
      const isSelected = this.selectedDifficulty === diff.id;
      
      ctx.fillStyle = isAvailable ? (isSelected ? diff.color : 'rgba(255,255,255,0.1)') : '#333';
      ctx.fillRect(btnX, y, btnWidth, btnHeight);
      
      ctx.strokeStyle = isAvailable ? diff.color : '#555';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(btnX, y, btnWidth, btnHeight);
      
      ctx.fillStyle = isAvailable ? '#FFF' : '#666';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(diff.name, btnX + btnWidth / 2, y + btnHeight / 2);
    }
    
    ctx.textBaseline = 'alphabetic';
  }

  renderRewardPreview(ctx, x, y) {
    if (!this.selectedDungeon) return;
    
    const reward = this.selectedDungeon.getReward(this.selectedDifficulty);
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('奖励预览:', x, y);
    
    ctx.fillStyle = '#FFF';
    ctx.font = '12px Arial';
    
    let rewardY = y + 20;
    ctx.fillText(`经验值: ${reward.exp}`, x, rewardY);
    rewardY += 18;
    ctx.fillText(`金币: ${reward.gold}`, x, rewardY);
    rewardY += 18;
    
    if (reward.items.length > 0) {
      ctx.fillText('可能掉落:', x, rewardY);
      rewardY += 16;
      
      for (let i = 0; i < Math.min(reward.items.length, 3); i++) {
        const item = reward.items[i];
        ctx.fillStyle = '#AAA';
        ctx.fillText(`  • ${item.itemId} x${item.quantity} (${(item.dropRate * 100).toFixed(0)}%)`, x, rewardY);
        rewardY += 14;
      }
    }
    
    // 首次通关奖励
    if (reward.bonusExp > 0 || reward.bonusGold > 0) {
      ctx.fillStyle = '#FF9800';
      ctx.font = '11px Arial';
      ctx.fillText(`首次通关额外: +${reward.bonusExp}经验 +${reward.bonusGold}金币`, x, rewardY + 10);
    }
  }

  renderButtons(ctx) {
    // 进入按钮
    if (this.selectedDungeon) {
      const btnX = this.x + this.width - 130;
      const btnY = this.y + this.height - 50;
      
      const canEnter = this.selectedDungeon.canEnter(this.character, this.selectedDifficulty).canEnter;
      
      ctx.fillStyle = canEnter ? '#4CAF50' : '#555';
      ctx.fillRect(btnX, btnY, 100, 35);
      
      ctx.strokeStyle = canEnter ? '#66BB6A' : '#666';
      ctx.lineWidth = 2;
      ctx.strokeRect(btnX, btnY, 100, 35);
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('进入副本', btnX + 50, btnY + 17);
    }
    
    // 关闭按钮
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(this.x + this.width - 35, this.y + 10, 25, 25);
    
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', this.x + this.width - 22, this.y + 22);
    
    ctx.textBaseline = 'alphabetic';
  }

  renderTitle(ctx) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('⚔️ 副本系统', this.x + 20, this.y + 30);
    
    ctx.fillStyle = '#AAA';
    ctx.font = '12px Arial';
    ctx.fillText(`角色等级: ${this.character.level}`, this.x + 20, this.y + 50);
  }

  setOnEnterDungeon(callback) {
    this.onEnterDungeon = callback;
  }
}
