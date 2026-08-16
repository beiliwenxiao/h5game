import { UIElement } from './UIElement.js';
import { PlayerInfoPanel } from './PlayerInfoPanel.js';
import { InventoryPanel } from './InventoryPanel.js';

/**
 * 单一背包面板：组合角色属性、已装备物品和背包物品。
 * 外层位置与尺寸由 UIEditor 的 backpackPanel 配置控制；内部部件由
 * PanelEditor 的 backpackPanel.parts 通过 section 分区控制。
 */
export class BackpackPanel extends UIElement {
  constructor(options = {}) {
    super({
      x: options.x || 20,
      y: options.y || 20,
      width: options.width || 900,
      height: options.height || 520,
      visible: options.visible || false,
      // 弹窗层：高于底部技能栏/功能按钮/HUD/小地图（200 档），
      // 低于"获得物品"弹窗(260) 和手柄面板(900)
      zIndex: options.zIndex || 250
    });

    this.backgroundColor = options.backgroundColor || 'rgba(0, 0, 0, 0.88)';
    this.borderColor = options.borderColor || '#4a9eff';
    this.borderWidth = options.borderWidth || 2;
    this._characterBounds = { x: 0, y: 0, width: 300, height: this.height };
    this._inventoryBounds = { x: 310, y: 0, width: this.width - 310, height: this.height };

    // PanelEditor 的部件坐标以设计基准尺寸为参照；外框由 UIEditor 百分比缩放。
    // 两者尺寸不一致时按基准等比缩放并居中，避免内容溢出或留白。
    this._panelLayout = null;
    this._contentScale = 1;
    this._contentOffsetX = 0;
    this._contentOffsetY = 0;
    this._contentWidth = this.width;
    this._contentHeight = this.height;
    this._lastFrameWidth = this.width;
    this._lastFrameHeight = this.height;

    this.playerInfoContent = new PlayerInfoPanel({
      x: this.x,
      y: this.y,
      width: this._characterBounds.width,
      height: this.height,
      visible: true,
      showAttributeSection: true,
      showEquipmentSection: true,
      onAttributeAllocate: options.onAttributeAllocate,
      onEquipmentClick: options.onEquipmentClick,
      getProjection: options.getProjection
    });
    this.inventoryContent = new InventoryPanel({
      x: this.x + this._inventoryBounds.x,
      y: this.y,
      width: this._inventoryBounds.width,
      height: this.height,
      visible: true,
      ...options.inventoryOptions,
      onItemUse: options.onItemUse,
      onItemDrop: options.onItemDrop,
      onFilterChange: options.onFilterChange,
      onEquipmentChange: options.onEquipmentChange,
      canUseItem: options.canUseItem,
      onIntent: options.onIntent,
      getProjection: options.getProjection
    });

    this._setContentFrameTransparent();
    this._syncContentLayout();
  }

  get scrollbarDragging() {
    return this.inventoryContent.scrollbarDragging;
  }

  setEntity(entity) {
    this.inventoryContent.setEntity(entity);
    this.playerInfoContent.setPlayer(entity);
  }

  setPlayer(player) {
    this.setEntity(player);
  }

  updatePlayer(player) {
    this.setEntity(player);
  }

  updateInventory(player) {
    this.inventoryContent.setEntity(player);
  }

  setInputManager(inputManager) {
    this.inventoryContent.setInputManager(inputManager);
  }

  useItem(slotIndex) {
    this.inventoryContent.useItem(slotIndex);
  }

  endScrollbarDrag() {
    this.inventoryContent.endScrollbarDrag();
  }

  layout() {
    this._applyScaledLayout();
  }

  applyPanelLayout(panelDef) {
    if (!panelDef) return;
    this._panelLayout = panelDef;
    // 外框的几何信息由 UIEditor 的 backpackPanel 管理；PanelEditor 只管理内部部件与样式。
    this.backgroundColor = panelDef.backgroundColor ?? this.backgroundColor;
    this.borderColor = panelDef.borderColor ?? this.borderColor;
    this.borderWidth = panelDef.borderWidth ?? this.borderWidth;
    this._applyScaledLayout();
  }

  update(deltaTime) {
    if (!this.visible) return;
    this._ensureScaledLayout();
    this.inventoryContent.update(deltaTime);
    this.playerInfoContent.update(deltaTime);
  }

  render(ctx) {
    if (!this.visible) return;
    this._ensureScaledLayout();

    // 外框背景/边框画在内容区（等比缩放后居中的实际区域），
    // 不画整个可用空间，否则边框与内容不贴合。
    const fx = this.x + this._contentOffsetX;
    const fy = this.y + this._contentOffsetY;
    const fw = this._contentWidth;
    const fh = this._contentHeight;

    ctx.save();
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = this.borderWidth;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.restore();

    this.playerInfoContent.render(ctx);
    this.inventoryContent.render(ctx);
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    this.playerInfoContent.handleMouseMove(x, y);
    this.inventoryContent.handleMouseMove(x, y);
  }

  handleMouseClick(x, y, button = 'left') {
    if (!this.visible) return false;
    // 判定用内容区（等比缩放后的实际区域），不是整个可用空间
    const fx = this.x + this._contentOffsetX;
    const fy = this.y + this._contentOffsetY;
    if (x < fx || x > fx + this._contentWidth || y < fy || y > fy + this._contentHeight) return false;

    if (this.inventoryContent.contextMenu.visible || this._isInBounds(x, y, this._inventoryBounds)) {
      return this.inventoryContent.handleMouseClick(x, y, button);
    }
    if (this._isInBounds(x, y, this._characterBounds)) {
      return this.playerInfoContent.handleMouseClick(x, y, button);
    }
    return true;
  }

  hide() {
    super.hide();
    this.inventoryContent.contextMenu.visible = false;
    this.inventoryContent.itemDetailSlot = -1;
    this.inventoryContent.itemDetailButtons = [];
  }

  _createContentLayout(parts) {
    return {
      width: this._contentWidth,
      height: this._contentHeight,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgba(0, 0, 0, 0)',
      borderWidth: 0,
      parts
    };
  }

  /**
   * 外框尺寸变化时重新按设计基准换算内部布局。
   */
  _ensureScaledLayout() {
    if (this._lastFrameWidth !== this.width || this._lastFrameHeight !== this.height) {
      this._applyScaledLayout();
      return;
    }
    this._syncContentLayout();
  }

  /**
   * 以 PanelLayout 的设计基准为参照等比缩放内部部件，并在外框内居中。
   * 等比缩放保证与编辑器预览的比例一致，不会因外框宽高比不同而变形。
   */
  _applyScaledLayout() {
    this._lastFrameWidth = this.width;
    this._lastFrameHeight = this.height;

    const panelDef = this._panelLayout;
    if (!panelDef) {
      this._contentScale = 1;
      this._contentOffsetX = 0;
      this._contentOffsetY = 0;
      this._contentWidth = this.width;
      this._contentHeight = this.height;
      this._syncContentLayout();
      return;
    }

    const designWidth = panelDef.width || this.width;
    const designHeight = panelDef.height || this.height;
    // 内外框比例由 PanelEditor 维护；UILayout 给出的矩形只作为可用空间。
    // 在该空间内取最大的等比矩形并保持中心。
    // 不修改 this.x/y/width/height（那是 UILayout 管的可用空间，onResize 会重写），
    // 只记录内容区偏移与尺寸，渲染时用 _content* 绘制。
    const scale = Math.min(this.width / designWidth, this.height / designHeight) || 1;
    const frameWidth = Math.round(designWidth * scale);
    const frameHeight = Math.round(designHeight * scale);
    this._contentScale = scale;
    this._contentWidth = frameWidth;
    this._contentHeight = frameHeight;
    this._contentOffsetX = Math.round((this.width - frameWidth) / 2);
    this._contentOffsetY = Math.round((this.height - frameHeight) / 2);

    const scaledParts = (panelDef.parts || []).map(part => this._scalePart(part, scale));
    const characterParts = scaledParts.filter(part => part.section === 'character');
    const inventoryParts = scaledParts.filter(part => part.section === 'inventory');
    this._characterBounds = this._getPartsBounds(characterParts, this._characterBounds);
    this._inventoryBounds = this._getPartsBounds(inventoryParts, this._inventoryBounds);

    this.playerInfoContent.applyPanelLayout(this._createContentLayout(characterParts));
    this.inventoryContent.applyPanelLayout(this._createContentLayout(inventoryParts));
    this._setContentFrameTransparent();
    this._syncContentLayout();
  }

  /**
   * 缩放单个部件的几何与字号字段，其余样式字段原样保留。
   */
  _scalePart(part, scale) {
    const scaled = { ...part };
    const scaleValue = (value) => (typeof value === 'number' ? value * scale : value);
    scaled.x = scaleValue(part.x ?? 0);
    scaled.y = scaleValue(part.y ?? 0);
    scaled.width = scaleValue(part.width ?? 0);
    scaled.height = scaleValue(part.height ?? 0);
    if (typeof part.slotSize === 'number') scaled.slotSize = part.slotSize * scale;
    if (typeof part.slotPadding === 'number') scaled.slotPadding = part.slotPadding * scale;
    if (typeof part.fontSize === 'number') {
      scaled.fontSize = Math.max(8, Math.round(part.fontSize * scale));
    }
    if (part.type === 'attr-row') {
      scaled.valueOffsetX = (part.valueOffsetX ?? 60) * scale;
    }
    return scaled;
  }

  _setContentFrameTransparent() {
    this.playerInfoContent.backgroundColor = 'rgba(0, 0, 0, 0)';
    this.playerInfoContent.borderColor = 'rgba(0, 0, 0, 0)';
    this.playerInfoContent.borderWidth = 0;
    this.inventoryContent.backgroundColor = 'rgba(0, 0, 0, 0)';
    this.inventoryContent.borderColor = 'rgba(0, 0, 0, 0)';
    this.inventoryContent.borderWidth = 0;
  }

  _syncContentLayout() {
    const sync = (panel) => {
      panel.x = this.x + this._contentOffsetX;
      panel.y = this.y + this._contentOffsetY;
      panel.width = this._contentWidth;
      panel.height = this._contentHeight;
      panel.visible = true;
    };
    sync(this.playerInfoContent);
    sync(this.inventoryContent);
  }

  _getPartsBounds(parts, fallback) {
    if (!parts || parts.length === 0) return { ...fallback };
    const left = Math.min(...parts.map(part => part.x || 0));
    const top = Math.min(...parts.map(part => part.y || 0));
    const right = Math.max(...parts.map(part => (part.x || 0) + (part.width || 0)));
    const bottom = Math.max(...parts.map(part => (part.y || 0) + (part.height || 0)));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  _isInBounds(x, y, bounds) {
    const left = this.x + this._contentOffsetX + bounds.x;
    const top = this.y + this._contentOffsetY + bounds.y;
    return x >= left && x <= left + bounds.width &&
      y >= top && y <= top + bounds.height;
  }
}

export default BackpackPanel;