import { ItemSpriteRenderer } from './ItemSpriteRenderer.js';

/**
 * 可复用的 Canvas 2D 实体渲染器。
 *
 * 坐标由调用方处理相机变换；实体位置使用底部中心锚点。资源和 NPC 样式
 * 均通过构造函数注入，避免耦合具体游戏或 Demo。
 */
export class EntityRenderer2D {
  /**
   * @param {object} assetManager 提供 getAsset(key) 的资源管理器
   * @param {(styleKey: string) => Function | null} getRenderStyle 返回代码绘制样式的函数
   */
  constructor(assetManager, getRenderStyle = () => null) {
    this.assetManager = assetManager;
    this.getRenderStyle = typeof getRenderStyle === 'function' ? getRenderStyle : () => null;
    this._readyImageCache = new Map();
    this._renderStyleCache = new Map();
    this._nameMeasureCache = new WeakMap();
    this._promptMeasureCache = new WeakMap();
  }

  /**
   * 渲染实体及其世界空间标签。
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} entity ECS 实体
   */
  render(ctx, entity) {
    const transform = entity?.getComponent?.('transform');
    if (!transform?.position) return;

    const sprite = entity.getComponent?.('sprite');
    const stats = entity.getComponent?.('stats');
    const npc = entity.getComponent?.('npc');
    const position = transform.position;
    const x = position.x;
    const elevation = position.elevation || 0;
    const y = position.y - elevation;
    const width = sprite?.width || 32;
    const height = sprite?.height || 32;

    if (!sprite || sprite.visible !== false) {
      ctx.save();
      if (sprite?.alpha !== undefined) ctx.globalAlpha *= sprite.alpha;
      this._renderSprite(ctx, entity, sprite, npc, x, y, width, height);
      ctx.restore();
    }

    this._renderName(ctx, entity, npc, x, y, height);
    this._renderInteractionPrompt(ctx, npc, x, y);
    this._renderHealthBar(ctx, stats, npc, x, y, height);
  }

  /** 兼容以 renderEntity 命名的场景渲染管线。 */
  renderEntity(ctx, entity) {
    this.render(ctx, entity);
  }

  _renderSprite(ctx, entity, sprite, npc, x, y, width, height) {
    let rendered = false;
    const image = sprite?.spriteSheet ? this._getReadyImage(sprite.spriteSheet) : null;

    if (sprite?.isStatic && image) {
      ctx.drawImage(image, x - width / 2, y - height, width, height);
      rendered = true;
    }

    if (!rendered && sprite?.useAnimatedSprite && image) {
      const columns = Math.max(1, sprite.spriteColumns || 4);
      const rows = Math.max(1, sprite.spriteRows || 9);
      const frame = sprite.getAnimatedFrame?.() || sprite.getCurrentFrame?.() || { row: 0, col: 0 };
      const cellWidth = this._imageWidth(image) / columns;
      const cellHeight = this._imageHeight(image) / rows;
      const row = Math.max(0, Math.min(rows - 1, frame.row || 0));
      const col = Math.max(0, Math.min(columns - 1, frame.col || 0));
      ctx.drawImage(image, col * cellWidth, row * cellHeight, cellWidth, cellHeight,
        x - width / 2, y - height, width, height);
      rendered = true;
    }

    if (!rendered && sprite?.useDirectionalSprite && image) {
      const frameIndex = Number(sprite.getCurrentFrame?.()) || 0;
      const cellWidth = this._imageWidth(image) / 3;
      const cellHeight = this._imageHeight(image) / 3;
      const row = Math.floor(frameIndex / 3);
      const col = frameIndex % 3;
      ctx.drawImage(image, col * cellWidth, row * cellHeight, cellWidth, cellHeight,
        x - width / 2, y - height, width, height);
      rendered = true;
    }

    if (!rendered && this._hasSequenceAnimation(sprite) && image) {
      const frameWidth = width;
      const frameHeight = height;
      const columns = Math.max(1, Math.floor(this._imageWidth(image) / frameWidth));
      const frameIndex = Number(sprite.getCurrentFrame?.()) || 0;
      const scale = sprite.scale || 1;
      const destWidth = frameWidth * scale;
      const destHeight = frameHeight * scale;
      ctx.drawImage(image, (frameIndex % columns) * frameWidth,
        Math.floor(frameIndex / columns) * frameHeight, frameWidth, frameHeight,
        x - destWidth / 2, y - destHeight, destWidth, destHeight);
      rendered = true;
    }

    if (!rendered) {
      const styleKey = npc?.renderStyle || entity.renderStyle;
      const drawStyle = styleKey ? this._getRenderStyle(styleKey) : null;
      if (typeof drawStyle === 'function') {
        drawStyle(ctx, x, y, sprite?.scale || 1);
        rendered = true;
      }
    }

    if (!rendered && entity.type === 'loot') {
      this._renderLootFallback(ctx, entity, x, y);
      rendered = true;
    }

    if (!rendered && sprite) {
      ctx.fillStyle = sprite.color || '#00ff00';
      ctx.fillRect(x - width / 2, y - height, width, height);
      ctx.strokeStyle = entity.type === 'player' ? '#4CAF50' : '#ff4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - width / 2, y - height, width, height);
    }
  }

  _getReadyImage(key) {
    const cached = this._readyImageCache.get(key);
    if (cached) return cached;
    const image = this.assetManager?.getAsset?.(key);
    if (!image) return null;
    const isCanvas = typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement;
    if (!isCanvas && (!image.complete || this._imageWidth(image) <= 0)) return null;
    this._readyImageCache.set(key, image);
    return image;
  }

  _getRenderStyle(key) {
    const cached = this._renderStyleCache.get(key);
    if (cached) return cached;
    const style = this.getRenderStyle(key);
    // 未注册样式不缓存，允许内容库稍后完成注册。
    if (typeof style === 'function') this._renderStyleCache.set(key, style);
    return style;
  }

  /** 资源热重载或内容库重装后由宿主显式清理缓存。 */
  clearCaches() {
    this._readyImageCache.clear();
    this._renderStyleCache.clear();
    this._nameMeasureCache = new WeakMap();
    this._promptMeasureCache = new WeakMap();
  }

  _imageWidth(image) {
    return image.naturalWidth || image.width || 0;
  }

  _imageHeight(image) {
    return image.naturalHeight || image.height || 0;
  }

  _hasSequenceAnimation(sprite) {
    return Boolean(sprite?.spriteSheet && !sprite.isStatic && !sprite.useAnimatedSprite
      && !sprite.useDirectionalSprite && (sprite.animations?.size > 0 || sprite.animations?.length > 0));
  }

  _renderLootFallback(ctx, entity, x, y) {
    const item = entity.itemData || {};
    const itemId = item.id || item.type || entity.itemId || entity.id;
    if (itemId && ItemSpriteRenderer.draw(ctx, itemId, x, y)) return;

    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.arc(x, y - 5, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  _renderName(ctx, entity, npc, x, y, height) {
    const name = entity.getComponent?.('name');
    if (!name?.visible || !name.name) return;

    const nameY = y - height + (name.offsetY || -10);
    ctx.save();
    const font = `bold ${name.fontSize || 14}px Arial`;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const padding = 4;
    let measured = this._nameMeasureCache.get(name);
    if (!measured || measured.text !== name.name || measured.font !== font) {
      measured = { text: name.name, font, width: ctx.measureText(name.name).width };
      this._nameMeasureCache.set(name, measured);
    }
    const textWidth = measured.width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - textWidth / 2 - padding, nameY - 16, textWidth + padding * 2, 18);
    ctx.fillStyle = name.color || '#ffffff';
    ctx.fillText(name.name, x, nameY);

    if (npc?.title) {
      ctx.font = '11px Arial';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(npc.title, x, nameY - 18);
    }
    ctx.restore();
  }

  _renderInteractionPrompt(ctx, npc, x, y) {
    const canInteract = typeof npc?.hasInteraction !== 'function' || npc.hasInteraction();
    if (!npc?.inRange || npc.interactionTrigger !== 'interact' || !canInteract || !npc.interactionPrompt) return;

    ctx.save();
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    let measured = this._promptMeasureCache.get(npc);
    if (!measured || measured.text !== npc.interactionPrompt) {
      measured = { text: npc.interactionPrompt, width: ctx.measureText(npc.interactionPrompt).width + 8 };
      this._promptMeasureCache.set(npc, measured);
    }
    const width = measured.width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - width / 2, y + 4, width, 18);
    ctx.fillStyle = '#ffff88';
    ctx.fillText(npc.interactionPrompt, x, y + 17);
    ctx.restore();
  }

  _renderHealthBar(ctx, stats, npc, x, y, height) {
    // 与场景原逻辑保持一致：明确非敌对的 NPC 不显示血条。
    if (!stats || stats.maxHp <= 0 || (npc && npc.faction !== 'hostile')) return;

    const barWidth = 40;
    const barHeight = 4;
    const barX = x - barWidth / 2;
    const barY = y - height - 8;
    const hpRatio = Math.max(0, Math.min(1, stats.hp / stats.maxHp));

    ctx.fillStyle = '#333333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = hpRatio > 0.5 ? '#00ff00' : hpRatio > 0.2 ? '#ffaa00' : '#ff0000';
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
  }
}

export default EntityRenderer2D;
