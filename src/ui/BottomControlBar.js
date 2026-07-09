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
 * BottomControlBar.js
 * 底部控制栏 - 显示血量、蓝量和技能槽
 */

import { UIElement } from './UIElement.js';
import { ItemIconRenderer } from './ItemIconRenderer.js';

/**
 * 底部控制栏
 */
export class BottomControlBar extends UIElement {
  /**
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super({
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || 800,
      height: options.height || 100,
      visible: options.visible !== false,
      zIndex: options.zIndex || 200
    });

    this.entity = null;

    // 显示配置（移动端可隐藏血球/蓝球和数字快捷键）
    this.showOrbs = options.showOrbs !== false;
    this.showHotkeyNumbers = options.showHotkeyNumbers !== false;
    
    // 技能槽配置（5个技能 + 2个药水快捷槽）
    const slotSize = 40;
    const slotGap = 6;
    const totalSlots = 7;
    const totalWidth = totalSlots * slotSize + (totalSlots - 1) * slotGap;
    const startX = this.width / 2 - totalWidth / 2 + slotSize / 2;
    
    // 血球配置（紧贴技能槽左侧）
    const orbRadius = 35;
    const orbGap = 10; // 球与技能槽的间距
    const slotsLeftEdge = this.width / 2 - totalWidth / 2;
    const slotsRightEdge = this.width / 2 + totalWidth / 2;
    
    this.hpOrb = {
      x: slotsLeftEdge - orbGap - orbRadius,
      y: 50,
      radius: orbRadius,
      color: '#ff0000',
      glowColor: '#ff6666'
    };
    
    // 蓝球配置（紧贴技能槽右侧）
    this.mpOrb = {
      x: slotsRightEdge + orbGap + orbRadius,
      y: 50,
      radius: orbRadius,
      color: '#0066ff',
      glowColor: '#6699ff'
    };
    
    this.skillSlots = [];
    for (let i = 0; i < totalSlots; i++) {
      this.skillSlots.push({
        x: startX + i * (slotSize + slotGap),
        y: 50,
        size: slotSize,
        hotkey: `${i + 1}`,
        skillIndex: i < 2 ? -1 : i - 2, // 前2个是药水，后5个是技能(0-4)
        isPotion: i < 2 // 1、2号槽是药水槽
      });
    }
    
    // 悬停状态
    this.hoveredSlot = -1;
    this.mouseX = 0;
    this.mouseY = 0;
    
    // 事件回调
    this.onSkillClick = options.onSkillClick || null;
    this.onPotionUse = options.onPotionUse || null;

    // 是否使用 UI 编辑器的子控件独立布局（true 时不画整体背景条）
    this._hasSubLayout = false;
  }

  /**
   * 应用 UI 编辑器的子控件独立布局
   * 各控件坐标改为绝对坐标（面板自身 x/y 归零），支持独立拖放/缩放
   * @param {Object} rects - 各子控件矩形 { hpOrb, mpOrb, potion1, potion2, skill1..skill5 }
   *   每项格式 { x, y, width, height }（左上角锚点）| null
   */
  applySubLayout(rects) {
    this._hasSubLayout = true;

    // 计算所有子控件的整体包围盒（用于 containsPoint 命中判断）
    const all = [
      rects.hpOrb, rects.mpOrb,
      rects.potion1, rects.potion2,
      rects.skill1, rects.skill2, rects.skill3, rects.skill4, rects.skill5
    ].filter(Boolean);
    if (all.length === 0) return;

    const minX = Math.min(...all.map(r => r.x));
    const minY = Math.min(...all.map(r => r.y));
    const maxX = Math.max(...all.map(r => r.x + r.width));
    const maxY = Math.max(...all.map(r => r.y + r.height));
    // 面板包围盒设为覆盖所有子控件；子控件坐标相对包围盒左上角
    this.x = minX;
    this.y = minY;
    this.width = maxX - minX;
    this.height = maxY - minY;

    const setOrb = (orb, r) => {
      if (!orb || !r) return;
      orb.x = (r.x + r.width / 2) - minX;   // 相对包围盒（渲染时 this.x+orb.x 还原为绝对）
      orb.y = (r.y + r.height / 2) - minY;
      orb.radius = Math.min(r.width, r.height) / 2;
    };
    setOrb(this.hpOrb, rects.hpOrb);
    setOrb(this.mpOrb, rects.mpOrb);

    const setSlot = (slot, r) => {
      if (!slot || !r) return;
      slot.x = (r.x + r.width / 2) - minX;
      slot.y = (r.y + r.height / 2) - minY;
      slot.size = Math.min(r.width, r.height);
    };
    // skillSlots: [0,1]=药水，[2..6]=技能1..5
    setSlot(this.skillSlots[0], rects.potion1);
    setSlot(this.skillSlots[1], rects.potion2);
    setSlot(this.skillSlots[2], rects.skill1);
    setSlot(this.skillSlots[3], rects.skill2);
    setSlot(this.skillSlots[4], rects.skill3);
    setSlot(this.skillSlots[5], rects.skill4);
    setSlot(this.skillSlots[6], rects.skill5);
  }

  /**
   * 设置实体
   * @param {Entity} entity - 实体对象
   */
  setEntity(entity) {
    this.entity = entity;
  }

  /**
   * 更新控制栏
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    if (!this.visible || !this.entity) return;
  }

  /**
   * 渲染控制栏
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  render(ctx) {
    if (!this.visible) return;
    
    if (!this.entity) return;

    ctx.save();

    // 渲染背景（使用子控件独立布局时不画整体背景条）
    if (!this._hasSubLayout) {
      this.renderBackground(ctx);
    }
    
    // 渲染血球
    if (this.showOrbs) {
      this.renderHpOrb(ctx);
      
      // 渲染蓝球
      this.renderMpOrb(ctx);
    }
    
    // 渲染技能槽
    this.renderSkillSlots(ctx);

    ctx.restore();
  }

  /**
   * 渲染背景
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderBackground(ctx) {
    // 半透明黑色背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    // 顶部边框
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + this.width, this.y);
    ctx.stroke();
  }

  /**
   * 渲染血球
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderHpOrb(ctx) {
    if (!this.entity) return;
    
    const stats = this.entity.getComponent('stats');
    if (!stats) return;
    
    const hpRatio = stats.maxHp > 0 ? stats.hp / stats.maxHp : 0;
    const orbX = this.x + this.hpOrb.x;
    const orbY = this.y + this.hpOrb.y;
    const radius = this.hpOrb.radius;
    
    // 外发光效果
    const gradient = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, radius + 10);
    gradient.addColorStop(0, this.hpOrb.glowColor);
    gradient.addColorStop(0.7, this.hpOrb.color);
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(orbX, orbY, radius + 10, 0, Math.PI * 2);
    ctx.fill();
    
    // 球体背景（暗色）
    ctx.fillStyle = '#330000';
    ctx.beginPath();
    ctx.arc(orbX, orbY, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 血量填充（从下往上）
    if (hpRatio > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(orbX, orbY, radius, 0, Math.PI * 2);
      ctx.clip();
      
      const fillHeight = radius * 2 * hpRatio;
      const fillY = orbY + radius - fillHeight;
      
      const hpGradient = ctx.createLinearGradient(orbX, fillY, orbX, orbY + radius);
      hpGradient.addColorStop(0, '#ff6666');
      hpGradient.addColorStop(1, '#cc0000');
      
      ctx.fillStyle = hpGradient;
      ctx.fillRect(orbX - radius, fillY, radius * 2, fillHeight);
      
      ctx.restore();
    }
    
    // 球体边框
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(orbX, orbY, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // 高光效果
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(orbX - 10, orbY - 10, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // 血量文字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.floor(stats.hp)}/${stats.maxHp}`, orbX, orbY);
  }

  /**
   * 渲染蓝球
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderMpOrb(ctx) {
    if (!this.entity) return;
    
    const stats = this.entity.getComponent('stats');
    if (!stats) return;
    
    const mpRatio = stats.maxMp > 0 ? stats.mp / stats.maxMp : 0;
    const orbX = this.x + this.mpOrb.x;
    const orbY = this.y + this.mpOrb.y;
    const radius = this.mpOrb.radius;
    
    // 外发光效果
    const gradient = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, radius + 10);
    gradient.addColorStop(0, this.mpOrb.glowColor);
    gradient.addColorStop(0.7, this.mpOrb.color);
    gradient.addColorStop(1, 'rgba(0, 102, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(orbX, orbY, radius + 10, 0, Math.PI * 2);
    ctx.fill();
    
    // 球体背景（暗色）
    ctx.fillStyle = '#000033';
    ctx.beginPath();
    ctx.arc(orbX, orbY, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 蓝量填充（从下往上）
    if (mpRatio > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(orbX, orbY, radius, 0, Math.PI * 2);
      ctx.clip();
      
      const fillHeight = radius * 2 * mpRatio;
      const fillY = orbY + radius - fillHeight;
      
      const mpGradient = ctx.createLinearGradient(orbX, fillY, orbX, orbY + radius);
      mpGradient.addColorStop(0, '#6699ff');
      mpGradient.addColorStop(1, '#0044cc');
      
      ctx.fillStyle = mpGradient;
      ctx.fillRect(orbX - radius, fillY, radius * 2, fillHeight);
      
      ctx.restore();
    }
    
    // 球体边框
    ctx.strokeStyle = '#0066ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(orbX, orbY, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // 高光效果
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(orbX - 10, orbY - 10, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // 蓝量文字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.floor(stats.mp)}/${stats.maxMp}`, orbX, orbY);
  }

  /**
   * 渲染技能槽
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderSkillSlots(ctx) {
    if (!this.entity) return;
    
    const combat = this.entity.getComponent('combat');
    const inventory = this.entity.getComponent('inventory');
    
    for (let i = 0; i < this.skillSlots.length; i++) {
      const slot = this.skillSlots[i];
      const slotX = this.x + slot.x;
      const slotY = this.y + slot.y;
      const halfSize = slot.size / 2;
      
      const isHovered = this.hoveredSlot === i;
      
      // 槽位背景
      ctx.fillStyle = isHovered ? 'rgba(100, 100, 100, 0.8)' : 'rgba(50, 50, 50, 0.8)';
      ctx.fillRect(slotX - halfSize, slotY - halfSize, slot.size, slot.size);
      
      // 槽位边框（药水槽用不同颜色）
      if (slot.isPotion) {
        const potionColor = i === 0 ? '#cc3333' : '#3366cc';
        ctx.strokeStyle = isHovered ? '#ffffff' : potionColor;
      } else {
        ctx.strokeStyle = isHovered ? '#ffffff' : '#666';
      }
      ctx.lineWidth = 1.5;
      ctx.strokeRect(slotX - halfSize, slotY - halfSize, slot.size, slot.size);
      
      // 渲染内容
      if (slot.isPotion) {
        this.renderPotionSlot(ctx, slotX, slotY, slot.size, i, inventory);
      } else if (combat && combat.skills) {
        const skill = combat.skills[slot.skillIndex];
        if (skill) {
          this.renderSkill(ctx, skill, slotX, slotY, slot.size, combat);
        }
      }
      
      // 快捷键提示（槽下方）
      if (this.showHotkeyNumbers) {
        ctx.fillStyle = '#ffd479';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(slot.hotkey, slotX, slotY + halfSize + 13);
      }

      // 名称显示（槽上方）
      let slotName = '';
      if (slot.isPotion) {
        slotName = i === 0 ? '红瓶' : '蓝瓶';
      } else if (combat && combat.skills) {
        const skill = combat.skills[slot.skillIndex];
        if (skill) slotName = skill.name || '';
      }
      if (slotName) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(slotName, slotX, slotY - halfSize - 3);
      }
    }
  }

  /**
   * 渲染药水快捷槽
   */
  renderPotionSlot(ctx, x, y, size, slotIndex, inventory) {
    const isHealth = slotIndex === 0;
    const effectType = isHealth ? 'heal' : 'restore_mana';
    
    // 查找背包中对应效果的消耗品（第一个匹配的物品 + 总数量）
    let potionCount = 0;
    let potionItem = null;
    if (inventory) {
      const items = inventory.getAllItems();
      for (const { slot } of items) {
        if (slot.item && slot.item.type === 'consumable' && slot.item.usable &&
            slot.item.effect && slot.item.effect.type === effectType) {
          if (!potionItem) potionItem = slot.item;
          potionCount += slot.quantity;
        }
      }
    }
    
    ctx.save();
    
    if (potionCount > 0 && potionItem) {
      // 使用 ItemIconRenderer 绘制实际物品图标
      ItemIconRenderer.drawIcon(ctx, potionItem, x, y, size * 0.8);
      
      // 数量
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      const countText = `${potionCount}`;
      const countX = x + size / 2 - 3;
      const countY = y + size / 2 - 4;
      ctx.strokeText(countText, countX, countY);
      ctx.fillText(countText, countX, countY);
    } else {
      // 空槽 - 半透明占位图标
      ctx.globalAlpha = 0.3;
      const placeholderItem = {
        id: isHealth ? 'health_potion' : 'mana_potion',
        type: 'consumable',
        effect: { type: effectType }
      };
      ItemIconRenderer.drawIcon(ctx, placeholderItem, x, y, size * 0.8);
      ctx.globalAlpha = 1.0;
    }
    
    ctx.restore();
  }

  /**
   * 渲染技能
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {Object} skill - 技能对象
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} size - 尺寸
   * @param {Object} combatComponent - 战斗组件
   */
  renderSkill(ctx, skill, x, y, size, combatComponent) {
    const halfSize = size / 2;
    
    // 技能图标（简化为图形）
    this.renderSkillIcon(ctx, skill, x, y, size);
    
    // 冷却遮罩
    const currentTime = performance.now();
    const cooldownMs = combatComponent.getSkillCooldownRemaining(skill.id, currentTime);
    const cooldown = cooldownMs / 1000; // 转换为秒
    
    if (cooldown > 0) {
      const cooldownRatio = cooldown / skill.cooldown;
      
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#000000';
      
      // 方形遮罩 + 旋转扫描：裁剪到方形槽位，再用大半径扇形扫过，填满方形四角
      ctx.beginPath();
      ctx.rect(x - halfSize, y - halfSize, size, size);
      ctx.clip();
      // 半径取 size（> 方形对角线一半 halfSize*√2），保证扫描覆盖四角
      const sweepRadius = size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, sweepRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cooldownRatio);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
      
      // 冷却时间文字
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cooldown.toFixed(1), x, y);
    }
    
    // 魔法消耗
    if (skill.manaCost > 0) {
      ctx.fillStyle = '#00ccff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(skill.manaCost, x + halfSize - 3, y - halfSize + 12);
    }
  }

  /**
   * 渲染技能图标
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {Object} skill - 技能对象
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} size - 尺寸
   */
  renderSkillIcon(ctx, skill, x, y, size) {
    const halfSize = size / 2;
    
    ctx.save();
    ctx.translate(x, y);
    
    // 优先使用技能自带的 icon 属性
    if (skill.icon) {
      ctx.font = `${size * 0.55}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(skill.icon, 0, 0);
      
      // 技能名称（小字）
      if (skill.name) {
        ctx.font = `${Math.max(10, size * 0.18)}px Arial`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(skill.name, 0, halfSize - 6);
      }
      
      ctx.restore();
      return;
    }
    
    // 默认图标映射表
    const iconMap = {
      'flame_palm': '🔥',
      'fireball': '🔥',
      'ice_finger': '❄',
      'ice_lance': '❄',
      'inferno_palm': '💥',
      'flame_burst': '💥',
      'heal': '💚',
      'meditation': '🧘'
    };
    
    const emoji = iconMap[skill.effectType] || '⚡';
    
    ctx.font = `${size * 0.55}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0);
    
    ctx.restore();
  }

  /**
   * 处理鼠标移动
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   */
  handleMouseMove(x, y) {
    if (!this.visible) return;

    this.mouseX = x;
    this.mouseY = y;
    this.hoveredSlot = -1;

    // 检查是否悬停在技能槽上
    for (let i = 0; i < this.skillSlots.length; i++) {
      const slot = this.skillSlots[i];
      const slotX = this.x + slot.x;
      const slotY = this.y + slot.y;
      const halfSize = slot.size / 2;

      if (x >= slotX - halfSize && x <= slotX + halfSize &&
          y >= slotY - halfSize && y <= slotY + halfSize) {
        this.hoveredSlot = i;
        break;
      }
    }
  }

  /**
   * 处理鼠标点击
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   * @returns {boolean} 是否处理了点击
   */
  handleMouseClick(x, y) {
    if (!this.visible || !this.containsPoint(x, y)) return false;

    // 检查技能槽点击
    for (let i = 0; i < this.skillSlots.length; i++) {
      const slot = this.skillSlots[i];
      const slotX = this.x + slot.x;
      const slotY = this.y + slot.y;
      const halfSize = slot.size / 2;

      if (x >= slotX - halfSize && x <= slotX + halfSize &&
          y >= slotY - halfSize && y <= slotY + halfSize) {
        
        // 药水槽
        if (slot.isPotion) {
          if (this.onPotionUse) {
            const potionType = i === 0 ? 'health' : 'mana';
            this.onPotionUse(potionType);
          }
          return true;
        }
        
        // 技能槽
        if (this.onSkillClick && this.entity) {
          const combat = this.entity.getComponent('combat');
          if (combat && combat.skills) {
            const skill = combat.skills[slot.skillIndex];
            if (skill) {
              this.onSkillClick(skill);
            }
          }
        }
        
        return true;
      }
    }

    return true; // 阻止事件传播
  }

  /**
   * 切换显示状态
   */
  toggle() {
    this.visible = !this.visible;
  }

  /**
   * 显示控制栏
   */
  show() {
    this.visible = true;
  }

  /**
   * 隐藏控制栏
   */
  hide() {
    this.visible = false;
  }
}
