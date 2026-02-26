import { UIElement } from './UIElement.js';
import { ItemIconRenderer } from './ItemIconRenderer.js';

/**
 * 玩家信息面板
 * 显示玩家的姓名、职业、等级、装备和属性
 */
export class PlayerInfoPanel extends UIElement {
  /**
   * @param {Object} options - 配置选项
   * @param {Entity} options.player - 玩家实体
   * @param {string} [options.backgroundColor='rgba(0, 0, 0, 0.7)'] - 背景颜色
   * @param {string} [options.borderColor='#4a9eff'] - 边框颜色
   * @param {string} [options.textColor='#ffffff'] - 文字颜色
   * @param {Function} [options.onAttributeAllocate] - 属性加点按钮点击回调
   * @param {Function} [options.onEquipmentClick] - 装备点击回调
   */
  constructor(options = {}) {
    super({
      x: options.x || 10,
      y: options.y || 10,
      width: options.width || 320,
      height: options.height || 580,
      visible: options.visible !== undefined ? options.visible : true,
      zIndex: options.zIndex || 100
    });
    
    this.player = options.player || null;
    this.backgroundColor = options.backgroundColor || 'rgba(0, 0, 0, 0.85)';
    this.borderColor = options.borderColor || '#4a9eff';
    this.textColor = options.textColor || '#ffffff';
    this.labelColor = options.labelColor || '#aaaaaa';
    
    this.borderWidth = 2;
    this.padding = 15;
    this.lineHeight = 20;
    
    // 装备槽尺寸
    this.equipSlotSize = 50;
    this.equipSlotPadding = 8;
    
    // 属性加点按钮回调
    this.onAttributeAllocate = options.onAttributeAllocate || null;
    
    // 装备点击回调
    this.onEquipmentClick = options.onEquipmentClick || null;
    
    // 属性加点按钮状态
    this.attributeButtonHovered = false;
    this.attributeButtonRect = null;
    
    // 装备槽悬停状态
    this.hoveredEquipSlot = null;
    this.equipSlots = {};
    
    // 职业颜色映射
    this.classColors = {
      'warrior': '#ff6b6b',
      'mage': '#4a9eff',
      'archer': '#51cf66',
      'refugee': '#888888'
    };
    
    // 职业中文名映射
    this.classNames = {
      'warrior': '战士',
      'mage': '法师',
      'archer': '弓箭手',
      'refugee': '灾民'
    };
    
    // 装备槽位置定义（3列4行布局）
    this.equipSlotPositions = {
      'accessory': { row: 0, col: 0, label: '饰品' },
      'helmet': { row: 0, col: 1, label: '头盔' },
      'necklace': { row: 0, col: 2, label: '项链' },
      'mainhand': { row: 1, col: 0, label: '主手武器' },
      'armor': { row: 1, col: 1, label: '胸甲' },
      'offhand': { row: 1, col: 2, label: '副手武器' },
      'ring1': { row: 2, col: 0, label: '戒指' },
      'belt': { row: 2, col: 1, label: '腰带' },
      'ring2': { row: 2, col: 2, label: '戒指' },
      'instrument': { row: 3, col: 0, label: '器械' },
      'boots': { row: 3, col: 1, label: '鞋子' },
      'mount': { row: 3, col: 2, label: '坐骑' }
    };
  }

  /**
   * 设置玩家实体
   * @param {Entity} player - 玩家实体
   */
  setPlayer(player) {
    this.player = player;
  }
  
  /**
   * 设置属性加点回调
   * @param {Function} callback - 回调函数
   */
  setOnAttributeAllocate(callback) {
    this.onAttributeAllocate = callback;
  }
  
  /**
   * 设置装备点击回调
   * @param {Function} callback - 回调函数
   */
  setOnEquipmentClick(callback) {
    this.onEquipmentClick = callback;
  }

  /**
   * 更新面板
   * @param {number} deltaTime - 帧间隔时间（毫秒）
   */
  update(deltaTime) {
    // 面板内容实时从玩家实体读取，无需更新
  }

  /**
   * 渲染面板
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  render(ctx) {
    if (!this.visible || !this.player) return;

    // 绘制背景
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // 绘制边框
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = this.borderWidth;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // 获取玩家数据
    const stats = this.player.getComponent('stats');
    const equipment = this.player.getComponent('equipment');
    
    if (!stats) return;

    let currentY = this.y + this.padding;

    // 绘制标题
    ctx.fillStyle = this.borderColor;
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('角色信息', this.x + this.padding, currentY);
    currentY += this.lineHeight + 5;

    // 绘制分隔线
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x + this.padding, currentY);
    ctx.lineTo(this.x + this.width - this.padding, currentY);
    ctx.stroke();
    currentY += 10;

    // 绘制角色名称
    const className = this.classNames[this.player.class] || this.player.class;
    ctx.fillStyle = this.textColor;
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`${className}`, this.x + this.padding, currentY + 5);
    
    currentY += this.lineHeight + 5;

    // 绘制职业和等级
    const classColor = this.classColors[this.player.class] || '#ffffff';
    
    ctx.fillStyle = this.labelColor;
    ctx.font = '14px Arial';
    ctx.fillText('职业:', this.x + this.padding, currentY);
    
    ctx.fillStyle = classColor;
    ctx.font = 'bold 14px Arial';
    ctx.fillText(className, this.x + this.padding + 50, currentY);
    
    ctx.fillStyle = this.labelColor;
    ctx.fillText('等级:', this.x + this.padding + 150, currentY);
    
    ctx.fillStyle = this.textColor;
    ctx.fillText(`${stats.level}`, this.x + this.padding + 190, currentY);
    currentY += this.lineHeight + 10;

    // 绘制装备区域标题
    ctx.fillStyle = this.borderColor;
    ctx.font = 'bold 14px Arial';
    ctx.fillText('装备', this.x + this.padding, currentY);
    currentY += this.lineHeight + 5;

    // 绘制装备槽
    this.renderEquipmentSlots(ctx, currentY, equipment);
    currentY += (this.equipSlotSize + this.equipSlotPadding) * 4 + 10;

    // 绘制属性标题和加点按钮
    ctx.fillStyle = this.borderColor;
    ctx.font = 'bold 14px Arial';
    ctx.fillText('属性', this.x + this.padding, currentY);
    
    // 绘制属性加点按钮 [+]
    const buttonX = this.x + this.padding + 50;
    const buttonY = currentY - 12;
    const buttonWidth = 24;
    const buttonHeight = 16;
    
    // 保存按钮位置用于点击检测
    this.attributeButtonRect = {
      x: buttonX,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight
    };
    
    // 按钮背景
    ctx.fillStyle = this.attributeButtonHovered ? '#4a9eff' : '#2a5a8f';
    ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    
    // 按钮边框
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
    
    // 按钮文字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('+', buttonX + buttonWidth / 2, buttonY + 12);
    ctx.textAlign = 'left';
    
    currentY += this.lineHeight;

    // 绘制属性列表
    const attributes = [
      { label: 'HP', value: `${Math.round(stats.hp)}/${stats.maxHp}`, color: '#ff4444' },
      { label: 'MP', value: `${Math.round(stats.mp)}/${stats.maxMp}`, color: '#4444ff' },
      { label: '攻击', value: stats.attack, color: '#ffaa00' },
      { label: '防御', value: stats.defense, color: '#00aaff' },
      { label: '速度', value: stats.speed, color: '#00ff00' }
    ];

    ctx.font = '13px Arial';
    for (const attr of attributes) {
      // 标签
      ctx.fillStyle = this.labelColor;
      ctx.fillText(`${attr.label}:`, this.x + this.padding, currentY);
      
      // 值
      ctx.fillStyle = attr.color;
      ctx.fillText(attr.value.toString(), this.x + this.padding + 60, currentY);
      currentY += this.lineHeight;
    }
    
    // 绘制装备tooltip
    this.renderEquipmentTooltip(ctx, equipment);
  }

  /**
   * 渲染装备槽
   */
  renderEquipmentSlots(ctx, startY, equipment) {
    this.equipSlots = {};
    
    const slotsPerRow = 3; // 改为3列
    const slotWidth = this.equipSlotSize;
    const slotHeight = this.equipSlotSize;
    const totalWidth = slotsPerRow * slotWidth + (slotsPerRow - 1) * this.equipSlotPadding;
    const startX = this.x + (this.width - totalWidth) / 2;
    
    for (const [slotType, position] of Object.entries(this.equipSlotPositions)) {
      const slotX = startX + position.col * (slotWidth + this.equipSlotPadding);
      const slotY = startY + position.row * (slotHeight + this.equipSlotPadding);
      
      // 保存槽位置用于点击检测
      this.equipSlots[slotType] = {
        x: slotX,
        y: slotY,
        width: slotWidth,
        height: slotHeight
      };
      
      const isHovered = this.hoveredEquipSlot === slotType;
      const equippedItem = equipment?.slots[slotType] || null;
      
      // 绘制槽背景
      ctx.fillStyle = isHovered ? 'rgba(74, 158, 255, 0.3)' : 'rgba(50, 50, 50, 0.8)';
      ctx.fillRect(slotX, slotY, slotWidth, slotHeight);
      
      // 绘制槽边框
      ctx.strokeStyle = isHovered ? '#4a9eff' : '#666666';
      ctx.lineWidth = 2;
      ctx.strokeRect(slotX, slotY, slotWidth, slotHeight);
      
      if (equippedItem) {
        // 绘制装备图标（简化为颜色块）
        const rarityColors = {
          0: '#888888', // 普通
          1: '#00ff00', // 优秀
          2: '#0088ff', // 精良
          3: '#aa00ff', // 史诗
          4: '#ff8800'  // 传说
        };
        
        ctx.fillStyle = rarityColors[equippedItem.rarity] || '#888888';
        ctx.fillRect(slotX + 5, slotY + 5, slotWidth - 10, slotHeight - 10);
        
        // 尝试绘制装备图标
        const iconDrawn = this.drawEquipIcon(ctx, equippedItem, slotX, slotY, slotWidth, slotHeight);
        
        if (!iconDrawn) {
          // 没有专用图标，绘制装备名称首字
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(equippedItem.name.charAt(0), slotX + slotWidth / 2, slotY + slotHeight / 2);
        }
        
        // 数量显示（箭矢等可堆叠装备）
        if (equippedItem.quantity != null && equippedItem.quantity > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${equippedItem.quantity}`, slotX + slotWidth - 3, slotY + slotHeight - 3);
        }
      } else {
        // 绘制空槽提示
        ctx.fillStyle = '#666666';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(position.label, slotX + slotWidth / 2, slotY + slotHeight / 2);
      }
    }
  }

  /**
   * 绘制装备图标
   */
  drawEquipIcon(ctx, equipment, slotX, slotY, slotWidth, slotHeight) {
    const cx = slotX + slotWidth / 2;
    const cy = slotY + slotHeight / 2;
    return ItemIconRenderer.drawIcon(ctx, equipment, cx, cy, slotWidth);
  }

  /**
   * 处理鼠标移动事件
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   */
  handleMouseMove(x, y) {
    if (!this.visible) return;
    
    // 保存鼠标位置用于tooltip
    this.mouseX = x;
    this.mouseY = y;
    
    // 检查是否悬停在属性加点按钮上
    if (this.attributeButtonRect) {
      const btn = this.attributeButtonRect;
      this.attributeButtonHovered = (
        x >= btn.x && x <= btn.x + btn.width &&
        y >= btn.y && y <= btn.y + btn.height
      );
    }
    
    // 检查是否悬停在装备槽上
    this.hoveredEquipSlot = null;
    for (const [slotType, slot] of Object.entries(this.equipSlots)) {
      if (x >= slot.x && x <= slot.x + slot.width &&
          y >= slot.y && y <= slot.y + slot.height) {
        this.hoveredEquipSlot = slotType;
        break;
      }
    }
  }

  /**
   * 渲染装备tooltip
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {Object} equipment - 装备组件
   */
  renderEquipmentTooltip(ctx, equipment) {
    if (!this.hoveredEquipSlot || !equipment) return;
    
    const item = equipment.slots[this.hoveredEquipSlot];
    if (!item) return;
    
    const tooltipWidth = 280;
    const tooltipHeight = 200;
    
    // 获取canvas尺寸
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    
    // 默认显示在鼠标右侧
    let tooltipX = this.mouseX + 15;
    let tooltipY = this.mouseY - 20;
    
    // 如果超出右边界，显示在鼠标左侧
    if (tooltipX + tooltipWidth > canvasWidth) {
      tooltipX = this.mouseX - tooltipWidth - 15;
    }
    
    // 如果左侧也超出，显示在面板右侧
    if (tooltipX < 0) {
      tooltipX = this.x + this.width + 10;
      // 如果面板右侧也超出，显示在面板左侧
      if (tooltipX + tooltipWidth > canvasWidth) {
        tooltipX = this.x - tooltipWidth - 10;
      }
    }
    
    // 如果超出下边界，向上调整
    if (tooltipY + tooltipHeight > canvasHeight) {
      tooltipY = canvasHeight - tooltipHeight - 10;
    }
    
    // 如果超出上边界，向下调整
    if (tooltipY < 0) {
      tooltipY = 10;
    }
    
    // 稀有度颜色
    const rarityColors = {
      0: '#888888', // 普通
      1: '#00ff00', // 优秀
      2: '#0088ff', // 精良
      3: '#aa00ff', // 史诗
      4: '#ff8800'  // 传说
    };
    
    // 提示框背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    
    // 提示框边框
    ctx.strokeStyle = rarityColors[item.rarity] || '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

    let yOffset = 20;
    
    // 物品名称
    ctx.fillStyle = rarityColors[item.rarity] || '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(item.name, tooltipX + 10, tooltipY + yOffset);
    yOffset += 20;
    
    // 物品类型和稀有度
    const typeNames = {
      'weapon': '武器',
      'armor': '护甲',
      'accessory': '饰品',
      'consumable': '消耗品'
    };
    
    const rarityNames = {
      0: '普通',
      1: '优秀',
      2: '精良',
      3: '史诗',
      4: '传说'
    };
    
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '12px Arial';
    const typeName = typeNames[item.type] || item.type;
    const rarityName = rarityNames[item.rarity] || '未知';
    ctx.fillText(`${typeName} | ${rarityName}`, tooltipX + 10, tooltipY + yOffset);
    yOffset += 15;
    
    // 物品描述
    if (item.description) {
      ctx.fillStyle = '#cccccc';
      ctx.font = '10px Arial';
      yOffset += 5;
      this.wrapText(ctx, item.description, tooltipX + 10, tooltipY + yOffset, tooltipWidth - 20, 12);
      yOffset += 30;
    }
    
    // 装备属性
    if (item.stats) {
      ctx.fillStyle = '#ffff00';
      ctx.font = '11px Arial';
      ctx.fillText('装备属性:', tooltipX + 10, tooltipY + yOffset);
      yOffset += 15;
      
      ctx.fillStyle = '#00ff00';
      
      if (item.stats.attack) {
        ctx.fillText(`攻击力: +${item.stats.attack}`, tooltipX + 15, tooltipY + yOffset);
        yOffset += 12;
      }
      if (item.stats.defense) {
        ctx.fillText(`防御力: +${item.stats.defense}`, tooltipX + 15, tooltipY + yOffset);
        yOffset += 12;
      }
      if (item.stats.maxHp) {
        ctx.fillText(`生命值: +${item.stats.maxHp}`, tooltipX + 15, tooltipY + yOffset);
        yOffset += 12;
      }
      if (item.stats.maxMp) {
        ctx.fillText(`魔法值: +${item.stats.maxMp}`, tooltipX + 15, tooltipY + yOffset);
        yOffset += 12;
      }
      if (item.stats.speed) {
        ctx.fillText(`速度: +${item.stats.speed}`, tooltipX + 15, tooltipY + yOffset);
        yOffset += 12;
      }
    }
    
    // 特殊属性（穿刺、多重箭等）
    if (item.pierce) {
      ctx.fillStyle = '#ff8800';
      ctx.font = '11px Arial';
      ctx.fillText(`穿刺: ${item.pierce}`, tooltipX + 15, tooltipY + yOffset);
      yOffset += 12;
    }
    if (item.multishot) {
      ctx.fillStyle = '#ff8800';
      ctx.font = '11px Arial';
      ctx.fillText(`多重箭: ${item.multishot}`, tooltipX + 15, tooltipY + yOffset);
      yOffset += 12;
    }
    
    // 攻击间隔（武器特有属性）
    if (item.attackSpeed != null) {
      ctx.fillStyle = '#ffaa00';
      ctx.fillText(`攻击间隔: ${item.attackSpeed}秒`, tooltipX + 15, tooltipY + yOffset);
      yOffset += 12;
    } else if (item.subType === 'mainhand' || item.subType === 'offhand' || item.subType === 'weapon') {
      ctx.fillStyle = '#ffaa00';
      ctx.fillText(`攻击间隔: 3秒`, tooltipX + 15, tooltipY + yOffset);
      yOffset += 12;
    }
  }

  /**
   * 文本换行
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {string} text - 文本
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} maxWidth - 最大宽度
   * @param {number} lineHeight - 行高
   */
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split('');
    let line = '';
    let currentY = y;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && i > 0) {
        ctx.fillText(line, x, currentY);
        line = words[i];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  }

  /**
   * 处理鼠标点击事件
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   * @param {string} button - 鼠标按钮 ('left' | 'right')
   * @returns {boolean} 是否处理了点击事件
   */
  handleMouseClick(x, y, button = 'left') {
    // 如果不可见或点击不在面板内，返回 false
    if (!this.visible || !this.containsPoint(x, y)) {
      return false;
    }
    
    // 检查是否点击了属性加点按钮
    if (this.attributeButtonRect && button === 'left') {
      const btn = this.attributeButtonRect;
      if (x >= btn.x && x <= btn.x + btn.width &&
          y >= btn.y && y <= btn.y + btn.height) {
        console.log('PlayerInfoPanel: 点击属性加点按钮');
        if (this.onAttributeAllocate) {
          this.onAttributeAllocate(this.player);
        }
        return true;
      }
    }
    
    // 检查是否点击了装备槽
    for (const [slotType, slot] of Object.entries(this.equipSlots)) {
      if (x >= slot.x && x <= slot.x + slot.width &&
          y >= slot.y && y <= slot.y + slot.height) {
        console.log('PlayerInfoPanel: 点击装备槽', slotType);
        if (this.onEquipmentClick) {
          this.onEquipmentClick(slotType, button);
        }
        return true;
      }
    }
    
    // 点击在面板内任何位置都算处理了（阻止事件传播）
    return true;
  }
}
