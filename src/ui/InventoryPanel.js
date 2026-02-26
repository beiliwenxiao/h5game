/**
 * InventoryPanel.js
 * 背包UI组件 - 显示和管理物品
 */

import { UIElement } from './UIElement.js';
import { ItemRarity } from '../data/ItemData.js';
import { ItemIconRenderer } from './ItemIconRenderer.js';

/**
 * 背包面板
 */
export class InventoryPanel extends UIElement {
  /**
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super({
      x: options.x || 400,
      y: options.y || 50,
      width: options.width || 370,  // 调整宽度: 20 + 6*(50+5) - 5 + 20 = 370
      height: options.height || 380,  // 调整高度: 80 + 4*(50+5) - 5 + 20 = 315，留余量 + 金币行
      visible: options.visible || false,
      zIndex: options.zIndex || 100
    });

    this.title = '背包';
    this.entity = null;
    this.slotSize = 50;
    this.slotPadding = 5;
    this.slotsPerRow = 6;  // 改为6列
    this.maxVisibleRows = 4;  // 改为4行
    
    // 计算槽位布局
    this.slotStartX = 20;
    this.slotStartY = 80;
    
    // 过滤器按钮
    this.filterButtons = [
      { name: 'all', label: '全部', x: 20, y: 45, width: 60, height: 25 },
      { name: 'equipment', label: '装备', x: 90, y: 45, width: 60, height: 25 },
      { name: 'consumable', label: '消耗品', x: 160, y: 45, width: 60, height: 25 },
      { name: 'material', label: '材料', x: 230, y: 45, width: 60, height: 25 },
      { name: 'quest', label: '任务', x: 300, y: 45, width: 60, height: 25 }
    ];
    
    // 交互状态
    this.hoveredSlot = -1;
    this.selectedSlot = -1;
    this.draggedItem = null;
    this.dragOffset = { x: 0, y: 0 };
    this.mouseX = 0;
    this.mouseY = 0;
    
    // 右键菜单
    this.contextMenu = {
      visible: false,
      x: 0,
      y: 0,
      slotIndex: -1,
      options: []
    };
    
    // 事件回调
    this.onItemUse = options.onItemUse || null;
    this.onItemDrop = options.onItemDrop || null;
    this.onFilterChange = options.onFilterChange || null;
    this.onEquipmentChange = options.onEquipmentChange || null; // 装备变化回调
    this.canUseItem = options.canUseItem || null; // 检查物品是否可以使用的回调
  }

  /**
   * 设置显示的实体
   * @param {Entity} entity - 实体对象
   */
  setEntity(entity) {
    this.entity = entity;
  }

  /**
   * 更新背包面板
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    if (!this.visible || !this.entity) return;
  }

  /**
   * 渲染背包面板
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  render(ctx) {
    if (!this.visible) return;

    ctx.save();

    // 绘制面板背景
    this.renderBackground(ctx);
    
    // 绘制标题
    this.renderTitle(ctx);
    
    // 绘制过滤器按钮
    this.renderFilterButtons(ctx);
    
    // 绘制物品槽位
    this.renderItemSlots(ctx);
    
    // 绘制金币
    this.renderGold(ctx);
    
    // 绘制右键菜单
    this.renderContextMenu(ctx);
    
    // 绘制物品提示框
    this.renderItemTooltip(ctx);
    
    // 绘制拖拽物品
    this.renderDraggedItem(ctx);

    ctx.restore();
  }

  /**
   * 渲染金币显示
   * @param {CanvasRenderingContext2D} ctx
   */
  renderGold(ctx) {
    if (!this.entity) return;
    const stats = this.entity.getComponent('stats');
    const gold = stats ? (stats.gold || 0) : 0;
    
    const goldY = this.y + this.height - 22;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.x + 10, goldY - 14, 120, 20);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`💰 ${gold} 金币`, this.x + 16, goldY);
  }

  /**
   * 渲染背景
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderBackground(ctx) {
    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    // 边框
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  }

  /**
   * 渲染标题
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderTitle(ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(this.title, this.x + 20, this.y + 25);
    
    // 显示背包使用情况
    if (this.entity) {
      const inventoryComponent = this.entity.getComponent('inventory');
      if (inventoryComponent) {
        const used = inventoryComponent.getUsedSlotCount();
        const total = inventoryComponent.maxSlots;
        ctx.fillStyle = '#cccccc';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`${used}/${total}`, this.x + this.width - 20, this.y + 25);
      }
    }
  }

  /**
   * 渲染过滤器按钮
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderFilterButtons(ctx) {
    if (!this.entity) return;
    
    const inventoryComponent = this.entity.getComponent('inventory');
    if (!inventoryComponent) return;

    for (const button of this.filterButtons) {
      const buttonX = this.x + button.x;
      const buttonY = this.y + button.y;
      const isActive = inventoryComponent.currentFilter === button.name;
      
      // 按钮背景
      ctx.fillStyle = isActive ? 'rgba(100, 150, 255, 0.8)' : 'rgba(100, 100, 100, 0.5)';
      ctx.fillRect(buttonX, buttonY, button.width, button.height);
      
      // 按钮边框
      ctx.strokeStyle = isActive ? '#6496ff' : '#888';
      ctx.lineWidth = 1;
      ctx.strokeRect(buttonX, buttonY, button.width, button.height);
      
      // 按钮文字
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(button.label, buttonX + button.width / 2, buttonY + button.height / 2 + 4);
    }
  }

  /**
   * 渲染物品槽位
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderItemSlots(ctx) {
    if (!this.entity) return;
    
    const inventoryComponent = this.entity.getComponent('inventory');
    if (!inventoryComponent) return;

    const currentFilter = inventoryComponent.currentFilter;
    
    if (currentFilter === 'all') {
      // 显示全部：渲染所有槽位（包括空槽位）
      const totalSlots = inventoryComponent.maxSlots;
      
      for (let i = 0; i < totalSlots; i++) {
        const row = Math.floor(i / this.slotsPerRow);
        const col = i % this.slotsPerRow;
        
        if (row >= this.maxVisibleRows) break;
        
        const slotX = this.x + this.slotStartX + col * (this.slotSize + this.slotPadding);
        const slotY = this.y + this.slotStartY + row * (this.slotSize + this.slotPadding);
        
        const slot = inventoryComponent.getSlot(i);
        
        if (slot) {
          // 渲染有物品的槽位
          this.renderSlot(ctx, i, slotX, slotY, inventoryComponent);
        } else {
          // 渲染空槽位
          this.renderEmptySlot(ctx, slotX, slotY, i);
        }
      }
    } else {
      // 分类显示：只显示符合条件的物品，紧密排列
      const filteredItems = this.getFilteredItems(inventoryComponent);
      
      for (let i = 0; i < filteredItems.length; i++) {
        const row = Math.floor(i / this.slotsPerRow);
        const col = i % this.slotsPerRow;
        
        if (row >= this.maxVisibleRows) break;
        
        const slotX = this.x + this.slotStartX + col * (this.slotSize + this.slotPadding);
        const slotY = this.y + this.slotStartY + row * (this.slotSize + this.slotPadding);
        
        const filteredItem = filteredItems[i];
        this.renderFilteredSlot(ctx, filteredItem, slotX, slotY, i);
      }
    }
  }

  /**
   * 获取筛选后的物品
   * @param {InventoryComponent} inventoryComponent - 背包组件
   * @returns {Array} 筛选后的物品列表
   */
  getFilteredItems(inventoryComponent) {
    const allItems = inventoryComponent.getAllItems();
    const currentFilter = inventoryComponent.currentFilter;
    
    if (currentFilter === 'all') {
      return allItems;
    }
    
    const filter = inventoryComponent.filters[currentFilter];
    if (!filter) {
      return allItems;
    }
    
    return allItems.filter(({ slot }) => filter(slot.item));
  }

  /**
   * 渲染筛选后的槽位
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {Object} filteredItem - 筛选后的物品
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} displayIndex - 显示索引
   */
  renderFilteredSlot(ctx, filteredItem, x, y, displayIndex) {
    const { slot, index: originalIndex } = filteredItem;
    const isHovered = this.hoveredSlot === originalIndex;
    const isSelected = this.selectedSlot === originalIndex;
    
    // 槽位背景
    ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.2)' : 'rgba(100, 100, 100, 0.3)';
    ctx.fillRect(x, y, this.slotSize, this.slotSize);
    
    // 槽位边框
    ctx.strokeStyle = isSelected ? '#ffff00' : (isHovered ? '#ffffff' : '#666');
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, this.slotSize, this.slotSize);
    
    // 渲染物品
    if (slot) {
      this.renderItem(ctx, slot, x, y);
    }
  }

  /**
   * 渲染空槽位
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} slotIndex - 槽位索引
   */
  renderEmptySlot(ctx, x, y, slotIndex) {
    const isHovered = this.hoveredSlot === slotIndex;
    const isSelected = this.selectedSlot === slotIndex;
    
    // 槽位背景
    ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.2)' : 'rgba(100, 100, 100, 0.3)';
    ctx.fillRect(x, y, this.slotSize, this.slotSize);
    
    // 槽位边框
    ctx.strokeStyle = isSelected ? '#ffff00' : (isHovered ? '#ffffff' : '#666');
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, this.slotSize, this.slotSize);
  }

  /**
   * 渲染单个槽位
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {number} slotIndex - 槽位索引
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {InventoryComponent} inventoryComponent - 背包组件
   */
  renderSlot(ctx, slotIndex, x, y, inventoryComponent) {
    const slot = inventoryComponent.getSlot(slotIndex);
    const isHovered = this.hoveredSlot === slotIndex;
    const isSelected = this.selectedSlot === slotIndex;
    
    // 槽位背景
    ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.2)' : 'rgba(100, 100, 100, 0.3)';
    ctx.fillRect(x, y, this.slotSize, this.slotSize);
    
    // 槽位边框
    ctx.strokeStyle = isSelected ? '#ffff00' : (isHovered ? '#ffffff' : '#666');
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, this.slotSize, this.slotSize);
    
    // 渲染物品
    if (slot) {
      this.renderItem(ctx, slot, x, y);
    }
  }

  /**
   * 渲染物品
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {ItemStack} itemStack - 物品堆叠
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   */
  renderItem(ctx, itemStack, x, y) {
    const item = itemStack.item;
    
    // 物品背景（根据稀有度）
    const rarityColors = ['#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000'];
    ctx.fillStyle = rarityColors[item.rarity] || '#ffffff';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x + 2, y + 2, this.slotSize - 4, this.slotSize - 4);
    ctx.globalAlpha = 1.0;
    
    // 物品图标
    const iconDrawn = this.drawItemIcon(ctx, item, x, y, this.slotSize);
    
    if (!iconDrawn) {
      // 没有专用图标，使用文字
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      const iconText = item.name.substring(0, 2);
      ctx.fillText(iconText, x + this.slotSize / 2, y + this.slotSize / 2 + 4);
    }
    
    // 数量显示
    if (itemStack.quantity > 1) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(itemStack.quantity.toString(), x + this.slotSize - 2, y + this.slotSize - 2);
    }
  }

  /**
   * 绘制物品图标
   * @returns {boolean} 是否成功绘制了图标
   */
  drawItemIcon(ctx, item, x, y, size) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    return ItemIconRenderer.drawIcon(ctx, item, cx, cy, size);
  }

  /**
   * 渲染物品提示框
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderItemTooltip(ctx) {
    if (this.hoveredSlot === -1 || !this.entity) return;
    
    const inventoryComponent = this.entity.getComponent('inventory');
    if (!inventoryComponent) return;
    
    const slot = inventoryComponent.getSlot(this.hoveredSlot);
    if (!slot) return;
    
    const item = slot.item;
    const tooltipWidth = 280;
    const tooltipHeight = 200;
    
    // 获取canvas尺寸
    const canvas = document.getElementById('gameCanvas');
    const canvasWidth = canvas ? canvas.width : 800;
    const canvasHeight = canvas ? canvas.height : 600;
    
    // 默认显示在鼠标右侧
    let tooltipX = this.mouseX + 15;
    let tooltipY = this.mouseY - 20;
    
    // 如果超出右边界，显示在鼠标左侧
    if (tooltipX + tooltipWidth > canvasWidth) {
      tooltipX = this.mouseX - tooltipWidth - 15;
    }
    
    // 如果左侧也超出，显示在背包右侧
    if (tooltipX < 0) {
      tooltipX = this.x + this.width + 10;
      // 如果背包右侧也超出，显示在背包左侧
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
    
    // 提示框背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    
    // 提示框边框
    const rarityColors = ['#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000'];
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
    ctx.fillStyle = '#cccccc';
    ctx.font = '11px Arial';
    const rarityNames = ['普通', '不凡', '稀有', '史诗', '传说'];
    const typeNames = {
      'consumable': '消耗品',
      'material': '材料',
      'equipment': '装备',
      'quest': '任务物品'
    };
    const typeName = typeNames[item.type] || item.type;
    const rarityName = rarityNames[item.rarity] || '未知';
    ctx.fillText(`${typeName} | ${rarityName}`, tooltipX + 10, tooltipY + yOffset);
    yOffset += 15;
    
    // 数量
    if (slot.quantity > 1) {
      ctx.fillStyle = '#ffff00';
      ctx.fillText(`数量: ${slot.quantity}`, tooltipX + 10, tooltipY + yOffset);
      yOffset += 15;
    }
    
    // 物品描述
    if (item.description) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '10px Arial';
      yOffset += 5;
      this.wrapText(ctx, item.description, tooltipX + 10, tooltipY + yOffset, tooltipWidth - 20, 12);
      yOffset += 30;
    }
    
    // 物品效果（消耗品）
    if (item.effect && item.usable) {
      ctx.fillStyle = '#00ff00';
      ctx.font = '11px Arial';
      ctx.fillText('使用效果:', tooltipX + 10, tooltipY + yOffset);
      yOffset += 15;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      let effectText = '';
      
      switch (item.effect.type) {
        case 'heal':
          effectText = `恢复 ${item.effect.value} 点生命值`;
          break;
        case 'restore_mana':
          effectText = `恢复 ${item.effect.value} 点魔法值`;
          break;
        case 'buff':
          effectText = `提升 ${item.effect.stat} ${Math.round(item.effect.value * 100)}%，持续 ${item.effect.duration} 秒`;
          break;
        default:
          effectText = '特殊效果';
      }
      
      ctx.fillText(effectText, tooltipX + 15, tooltipY + yOffset);
      yOffset += 15;
    }
    
    // 装备属性（如果是装备）
    if (item.type === 'equipment' && item.stats) {
      ctx.fillStyle = '#ffff00';
      ctx.font = '11px Arial';
      ctx.fillText('装备属性:', tooltipX + 10, tooltipY + yOffset);
      yOffset += 15;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      
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
      ctx.font = '10px Arial';
      ctx.fillText(`穿刺: ${item.pierce}`, tooltipX + 15, tooltipY + yOffset);
      yOffset += 12;
    }
    if (item.multishot) {
      ctx.fillStyle = '#ff8800';
      ctx.font = '10px Arial';
      ctx.fillText(`多重箭: ${item.multishot}`, tooltipX + 15, tooltipY + yOffset);
      yOffset += 12;
    }
    
    // 攻击间隔（武器特有属性）
    if (item.attackSpeed != null) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = '10px Arial';
      ctx.fillText(`攻击间隔: ${item.attackSpeed}秒`, tooltipX + 15, tooltipY + yOffset);
      yOffset += 12;
    } else if (item.subType === 'mainhand' || item.subType === 'offhand' || item.subType === 'weapon') {
      ctx.fillStyle = '#ffaa00';
      ctx.font = '10px Arial';
      ctx.fillText(`攻击间隔: 3秒`, tooltipX + 15, tooltipY + yOffset);
      yOffset += 12;
    }
    
    // 物品价值
    if (item.value) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = '10px Arial';
      ctx.fillText(`价值: ${item.value} 金币`, tooltipX + 10, tooltipY + tooltipHeight - 15);
    }
  }

  /**
   * 文字换行
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
   * 渲染右键菜单
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderContextMenu(ctx) {
    if (!this.contextMenu.visible) return;
    
    const menuWidth = 100;
    const menuHeight = this.contextMenu.options.length * 25;
    
    // 菜单背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(this.contextMenu.x, this.contextMenu.y, menuWidth, menuHeight);
    
    // 菜单边框
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.contextMenu.x, this.contextMenu.y, menuWidth, menuHeight);
    
    // 菜单选项
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    
    for (let i = 0; i < this.contextMenu.options.length; i++) {
      const option = this.contextMenu.options[i];
      const optionY = this.contextMenu.y + (i + 1) * 20;
      ctx.fillText(option.label, this.contextMenu.x + 10, optionY);
    }
  }

  /**
   * 渲染拖拽中的物品
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   */
  renderDraggedItem(ctx) {
    if (!this.draggedItem) return;
    
    // 这里可以渲染正在拖拽的物品
    // 暂时省略实现
  }

  /**
   * 处理鼠标移动事件
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   */
  handleMouseMove(x, y) {
    if (!this.visible) return;

    // 保存鼠标位置
    this.mouseX = x;
    this.mouseY = y;

    this.hoveredSlot = -1;

    // 检查是否悬停在物品槽上
    if (this.entity) {
      const inventoryComponent = this.entity.getComponent('inventory');
      if (inventoryComponent) {
        const slotIndex = this.getSlotAtPosition(x, y);
        if (slotIndex >= 0 && slotIndex < inventoryComponent.maxSlots) {
          this.hoveredSlot = slotIndex;
        }
      }
    }
  }

  /**
   * 处理鼠标点击事件
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   * @param {string} button - 鼠标按钮 ('left' | 'right')
   * @returns {boolean} 是否处理了点击事件
   */
  handleMouseClick(x, y, button = 'left') {
    if (!this.visible || !this.containsPoint(x, y)) return false;

    // 检查右键菜单点击
    if (this.contextMenu.visible) {
      if (this.handleContextMenuClick(x, y)) {
        return true;
      }
      // 点击菜单外部，隐藏菜单
      this.contextMenu.visible = false;
    }

    // 检查过滤器按钮点击
    for (const filterButton of this.filterButtons) {
      const buttonX = this.x + filterButton.x;
      const buttonY = this.y + filterButton.y;
      
      if (x >= buttonX && x <= buttonX + filterButton.width &&
          y >= buttonY && y <= buttonY + filterButton.height) {
        this.setFilter(filterButton.name);
        return true;
      }
    }

    // 检查物品槽点击
    const slotIndex = this.getSlotAtPosition(x, y);
    if (slotIndex >= 0) {
      if (button === 'left') {
        this.handleSlotLeftClick(slotIndex);
      } else if (button === 'right') {
        this.handleSlotRightClick(slotIndex, x, y);
      }
      return true;
    }

    return true;
  }

  /**
   * 处理右键菜单点击
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   * @returns {boolean} 是否处理了点击
   */
  handleContextMenuClick(x, y) {
    if (!this.contextMenu.visible) return false;
    
    const menuWidth = 100;
    const menuHeight = this.contextMenu.options.length * 25;
    
    // 检查是否点击在菜单内
    if (x < this.contextMenu.x || x > this.contextMenu.x + menuWidth ||
        y < this.contextMenu.y || y > this.contextMenu.y + menuHeight) {
      return false;
    }
    
    // 计算点击的选项索引
    const relativeY = y - this.contextMenu.y;
    const optionIndex = Math.floor(relativeY / 25);
    
    if (optionIndex >= 0 && optionIndex < this.contextMenu.options.length) {
      const option = this.contextMenu.options[optionIndex];
      const slotIndex = this.contextMenu.slotIndex;
      
      console.log(`点击菜单选项: ${option.label}, 槽位: ${slotIndex}`);
      
      // 执行对应操作
      switch (option.action) {
        case 'use':
          this.useItem(slotIndex);
          break;
          
        case 'drop':
          this.dropItem(slotIndex);
          break;
      }
      
      // 隐藏菜单
      this.contextMenu.visible = false;
      return true;
    }
    
    return false;
  }

  /**
   * 丢弃物品
   * @param {number} slotIndex - 槽位索引
   */
  dropItem(slotIndex) {
    if (!this.entity) return;
    
    const inventoryComponent = this.entity.getComponent('inventory');
    if (!inventoryComponent) return;
    
    const slot = inventoryComponent.getSlot(slotIndex);
    if (!slot || !slot.item) return;
    
    const item = slot.item;
    console.log(`丢弃物品: ${item.name}`);
    
    // 从背包移除物品
    inventoryComponent.removeItem(item.id, 1);
    
    // 触发丢弃回调
    if (this.onItemDrop) {
      this.onItemDrop(item);
    }
  }

  /**
   * 获取指定位置的槽位索引
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @returns {number} 槽位索引，-1表示无效
   */
  getSlotAtPosition(x, y) {
    const relativeX = x - this.x - this.slotStartX;
    const relativeY = y - this.y - this.slotStartY;
    
    if (relativeX < 0 || relativeY < 0) return -1;
    
    const col = Math.floor(relativeX / (this.slotSize + this.slotPadding));
    const row = Math.floor(relativeY / (this.slotSize + this.slotPadding));
    
    if (col >= this.slotsPerRow || row >= this.maxVisibleRows) return -1;
    
    const slotX = col * (this.slotSize + this.slotPadding);
    const slotY = row * (this.slotSize + this.slotPadding);
    
    // 检查是否在槽位内部
    if (relativeX >= slotX && relativeX <= slotX + this.slotSize &&
        relativeY >= slotY && relativeY <= slotY + this.slotSize) {
      
      const displayIndex = row * this.slotsPerRow + col;
      
      if (this.entity) {
        const inventoryComponent = this.entity.getComponent('inventory');
        if (inventoryComponent) {
          const currentFilter = inventoryComponent.currentFilter;
          
          if (currentFilter === 'all') {
            // 显示全部时，直接返回槽位索引
            return displayIndex < inventoryComponent.maxSlots ? displayIndex : -1;
          } else {
            // 分类模式时，返回筛选后物品的原始索引
            const filteredItems = this.getFilteredItems(inventoryComponent);
            if (displayIndex < filteredItems.length) {
              return filteredItems[displayIndex].index;
            }
          }
        }
      }
    }
    
    return -1;
  }

  /**
   * 处理槽位左键点击
   * @param {number} slotIndex - 槽位索引
   */
  handleSlotLeftClick(slotIndex) {
    this.selectedSlot = slotIndex;
    console.log(`选中槽位: ${slotIndex}`);
    
    if (!this.entity) return;
    
    const inventoryComponent = this.entity.getComponent('inventory');
    const equipmentComponent = this.entity.getComponent('equipment');
    const statsComponent = this.entity.getComponent('stats');
    
    if (!inventoryComponent) return;
    
    const slot = inventoryComponent.getSlot(slotIndex);
    if (!slot || !slot.item) return;
    
    const item = slot.item;
    
    // 如果是装备，尝试装备
    if (item.type === 'equipment' && equipmentComponent) {
      const subType = item.subType; // 'weapon', 'armor', 'accessory' 等
      
      console.log(`尝试装备物品: ${item.name}, subType: ${subType}`);
      
      // 保存装备前的属性
      const oldStats = statsComponent ? {
        attack: statsComponent.attack,
        defense: statsComponent.defense,
        maxHp: statsComponent.maxHp,
        maxMp: statsComponent.maxMp,
        speed: statsComponent.speed
      } : null;
      
      // 从背包移除物品（箭矢等有数量的装备移除整组）
      const stackQuantity = slot.quantity; // ItemStack 的实际堆叠数量
      const removeCount = (item.subType === 'ammo') ? stackQuantity : 1;
      inventoryComponent.removeItem(item.id, removeCount);
      
      // 箭矢等弹药类装备，保持 item.quantity 不变（只有攻击消耗才减少）
      
      // 装备到对应槽位（兼容 subType 别名）
      const slotMap = { weapon: 'mainhand', shield: 'offhand', ammo: 'offhand' };
      const targetSlot = slotMap[subType] || subType;
      const oldItem = equipmentComponent.equip(targetSlot, item);
      
      // 如果有旧装备，放回背包
      if (oldItem) {
        inventoryComponent.addItem(oldItem, oldItem.quantity || 1);
        console.log(`旧装备 ${oldItem.name} 已放回背包`);
      }
      
      // 切换主手武器时，如果新武器不是远程武器，自动卸下副手的箭矢
      if (targetSlot === 'mainhand' && !item.ranged) {
        const offhandItem = equipmentComponent.getEquipment('offhand');
        if (offhandItem && offhandItem.subType === 'ammo') {
          const removedAmmo = equipmentComponent.unequip('offhand');
          if (removedAmmo) {
            inventoryComponent.addItem(removedAmmo, removedAmmo.quantity || 1);
            console.log(`副手箭矢 ${removedAmmo.name} 已自动卸下到背包`);
          }
        }
      }
      
      // 更新玩家属性（应用装备加成）
      if (statsComponent) {
        this.updateEntityStats(equipmentComponent, statsComponent);
        
        // 计算属性变化并显示提示
        const statChanges = this.calculateStatChanges(oldStats, statsComponent);
        this.showEquipmentNotification(item.name, oldItem?.name, statChanges, true);
      }
      
      console.log(`成功装备物品: ${item.name} 到 ${subType} 槽位`);
    }
    // 如果是可使用的消耗品，直接使用
    else if (item.type === 'consumable' && item.usable) {
      this.useItem(slotIndex);
    }
  }

  /**
   * 使用物品
   * @param {number} slotIndex - 槽位索引
   */
  useItem(slotIndex) {
    if (!this.entity) return;
    
    const inventoryComponent = this.entity.getComponent('inventory');
    const statsComponent = this.entity.getComponent('stats');
    
    if (!inventoryComponent || !statsComponent) return;
    
    const slot = inventoryComponent.getSlot(slotIndex);
    if (!slot || !slot.item || !slot.item.usable) return;
    
    const item = slot.item;
    
    // 检查物品是否可以使用
    if (this.canUseItem && !this.canUseItem(item)) {
      console.log(`物品 ${item.name} 暂时无法使用`);
      return;
    }
    
    console.log(`使用物品: ${item.name}`);
    
    let healAmount = 0;
    let manaAmount = 0;
    
    // 应用物品效果
    if (item.effect) {
      switch (item.effect.type) {
        case 'heal':
          // 恢复生命值
          healAmount = item.effect.value;
          const oldHp = statsComponent.hp;
          statsComponent.hp = Math.min(statsComponent.hp + healAmount, statsComponent.maxHp);
          const actualHeal = statsComponent.hp - oldHp;
          console.log(`恢复了 ${actualHeal} 点生命值，当前生命值: ${statsComponent.hp}/${statsComponent.maxHp}`);
          healAmount = actualHeal; // 使用实际恢复量
          break;
          
        case 'restore_mana':
          // 恢复魔法值
          manaAmount = item.effect.value;
          const oldMp = statsComponent.mp;
          statsComponent.mp = Math.min(statsComponent.mp + manaAmount, statsComponent.maxMp);
          const actualMana = statsComponent.mp - oldMp;
          console.log(`恢复了 ${actualMana} 点魔法值，当前魔法值: ${statsComponent.mp}/${statsComponent.maxMp}`);
          manaAmount = actualMana; // 使用实际恢复量
          break;
          
        case 'buff':
          // 应用增益效果（需要状态效果系统支持）
          console.log(`应用增益效果: ${item.effect.stat} +${item.effect.value * 100}%`);
          break;
          
        case 'currency':
          // 货币类物品，通过回调让场景处理
          console.log(`使用货币物品: ${item.name}，获得 ${item.effect.value} 铜钱`);
          break;
          
        default:
          console.log(`未知的物品效果类型: ${item.effect.type}`);
      }
    }
    
    // 从背包移除物品
    inventoryComponent.removeItem(item.id, 1);
    console.log(`已使用物品: ${item.name}`);
    
    // 触发使用回调
    if (this.onItemUse) {
      this.onItemUse(item, healAmount, manaAmount);
    }
  }

  /**
   * 处理槽位右键点击
   * @param {number} slotIndex - 槽位索引
   * @param {number} x - 鼠标X坐标
   * @param {number} y - 鼠标Y坐标
   */
  handleSlotRightClick(slotIndex, x, y) {
    if (!this.entity) return;
    
    const inventoryComponent = this.entity.getComponent('inventory');
    if (!inventoryComponent) return;
    
    const slot = inventoryComponent.getSlot(slotIndex);
    if (!slot) return;
    
    // 显示右键菜单
    this.contextMenu = {
      visible: true,
      x: x,
      y: y,
      slotIndex: slotIndex,
      options: []
    };
    
    // 添加菜单选项
    if (slot.item.usable) {
      this.contextMenu.options.push({
        label: '使用',
        action: 'use'
      });
    }
    
    this.contextMenu.options.push({
      label: '丢弃',
      action: 'drop'
    });
  }

  /**
   * 设置过滤器
   * @param {string} filterName - 过滤器名称
   */
  setFilter(filterName) {
    if (!this.entity) return;
    
    const inventoryComponent = this.entity.getComponent('inventory');
    if (inventoryComponent) {
      inventoryComponent.setFilter(filterName);
      
      if (this.onFilterChange) {
        this.onFilterChange(filterName);
      }
    }
  }

  /**
   * 切换面板显示状态
   */
  toggle() {
    this.visible = !this.visible;
  }

  /**
   * 显示面板
   */
  show() {
    this.visible = true;
  }

  /**
   * 隐藏面板
   */
  hide() {
    this.visible = false;
    this.contextMenu.visible = false;
  }

  /**
   * 更新实体属性（应用装备加成）
   * @param {Object} equipmentComponent - 装备组件
   * @param {Object} statsComponent - 属性组件
   */
  updateEntityStats(equipmentComponent, statsComponent) {
    if (!equipmentComponent || !statsComponent) return;

    // 先重置到基础属性
    statsComponent.resetToBaseStats();

    // 获取装备属性加成
    const bonusStats = equipmentComponent.getBonusStats();
    
    // 保存当前HP/MP比例
    const hpRatio = statsComponent.maxHp > 0 ? statsComponent.hp / statsComponent.maxHp : 1;
    const mpRatio = statsComponent.maxMp > 0 ? statsComponent.mp / statsComponent.maxMp : 1;
    
    // 应用装备加成
    if (bonusStats.attack) {
      statsComponent.attack += bonusStats.attack;
    }
    if (bonusStats.defense) {
      statsComponent.defense += bonusStats.defense;
    }
    if (bonusStats.maxHp) {
      statsComponent.maxHp += bonusStats.maxHp;
      statsComponent.hp = Math.floor(statsComponent.maxHp * hpRatio);
    }
    if (bonusStats.maxMp) {
      statsComponent.maxMp += bonusStats.maxMp;
      statsComponent.mp = Math.floor(statsComponent.maxMp * mpRatio);
    }
    if (bonusStats.speed) {
      statsComponent.speed += bonusStats.speed;
    }
    
    console.log('InventoryPanel: 更新实体属性', {
      attack: statsComponent.attack,
      defense: statsComponent.defense,
      maxHp: statsComponent.maxHp,
      speed: statsComponent.speed
    });
  }

  /**
   * 计算属性变化
   * @param {Object} oldStats - 旧属性
   * @param {Object} newStats - 新属性组件
   * @returns {Object} 属性变化对象
   */
  calculateStatChanges(oldStats, newStats) {
    if (!oldStats || !newStats) return {};
    
    const changes = {};
    const statNames = {
      attack: '攻击',
      defense: '防御',
      maxHp: '生命',
      maxMp: '魔法',
      speed: '速度'
    };
    
    for (const stat in statNames) {
      const diff = newStats[stat] - oldStats[stat];
      if (diff !== 0) {
        changes[stat] = {
          name: statNames[stat],
          value: diff
        };
      }
    }
    
    return changes;
  }

  /**
   * 显示装备通知
   * @param {string} equipName - 装备的物品名称
   * @param {string} unequipName - 卸下的物品名称
   * @param {Object} statChanges - 属性变化
   * @param {boolean} isEquip - 是否是装备操作
   */
  showEquipmentNotification(equipName, unequipName, statChanges, isEquip) {
    // 构建通知消息
    let messages = [];
    
    if (isEquip) {
      messages.push(`装备了 ${equipName}`);
      if (unequipName) {
        messages.push(`卸下了 ${unequipName}`);
      }
    } else {
      messages.push(`卸下了 ${unequipName || equipName}`);
    }
    
    // 添加属性变化
    const changeTexts = [];
    for (const stat in statChanges) {
      const change = statChanges[stat];
      if (change.value > 0) {
        changeTexts.push(`${change.name} +${change.value}`);
      } else {
        changeTexts.push(`${change.name} ${change.value}`);
      }
    }
    
    if (changeTexts.length > 0) {
      messages.push(changeTexts.join(' '));
    }
    
    // 输出到控制台
    console.log('装备变化:', messages.join(' | '));
    
    // 触发通知回调
    if (this.onEquipmentChange) {
      this.onEquipmentChange(messages);
    }
  }
}