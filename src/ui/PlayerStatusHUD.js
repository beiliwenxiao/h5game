import { UIElement } from './UIElement.js';
import { HealthBar } from './HealthBar.js';
import { ManaBar } from './ManaBar.js';

/**
 * PlayerStatusHUD - 玩家状态 HUD（左上角）
 *
 * 显示玩家头像、昵称、血条、蓝条。
 * 复用框架已有的 HealthBar / ManaBar 组件。
 * 适用于移动端，替代屏幕下方的血球/蓝球。
 */
export class PlayerStatusHUD extends UIElement {
  /**
   * @param {Object} options
   * @param {number} [options.x=10]
   * @param {number} [options.y=10]
   * @param {number} [options.width=230]
   * @param {number} [options.height=78]
   * @param {string} [options.avatarSrc] - 头像图片地址（相对/绝对 URL）
   * @param {Entity} [options.player] - 玩家实体
   */
  constructor(options = {}) {
    super({
      x: options.x !== undefined ? options.x : 10,
      y: options.y !== undefined ? options.y : 10,
      width: options.width || 230,
      height: options.height || 78,
      visible: options.visible !== false,
      zIndex: options.zIndex || 210
    });

    this.player = options.player || null;
    this.padding = 8;
    this.avatarSize = 56;

    // 头像图片（自加载，加载完成前画占位圆）
    this.avatarImage = null;
    this.avatarLoaded = false;
    if (options.avatarSrc) {
      this.setAvatar(options.avatarSrc);
    }

    // 血条/蓝条尺寸
    const barX = this.x + this.padding + this.avatarSize + 8;
    const barWidth = this.width - this.padding * 2 - this.avatarSize - 8;
    const barHeight = 14;

    this.healthBar = new HealthBar({
      x: barX,
      y: this.y + 30,
      width: barWidth,
      height: barHeight,
      currentValue: 100,
      maxValue: 100,
      showText: true,
      showPercentage: false,
      borderColor: '#000000',
      backgroundColor: '#3a0000'
    });

    this.manaBar = new ManaBar({
      x: barX,
      y: this.y + 30 + barHeight + 6,
      width: barWidth,
      height: barHeight,
      currentValue: 100,
      maxValue: 100,
      showText: true,
      showPercentage: false,
      barColor: '#2288ff',
      borderColor: '#000000',
      backgroundColor: '#00163a'
    });
  }

  /**
   * 设置头像图片
   * @param {string} src
   */
  setAvatar(src) {
    this.avatarLoaded = false;
    const img = new Image();
    img.onload = () => {
      this.avatarImage = img;
      this.avatarLoaded = true;
    };
    img.onerror = () => {
      this.avatarImage = null;
      this.avatarLoaded = false;
    };
    img.src = src;
  }

  /**
   * 设置玩家实体
   * @param {Entity} entity
   */
  setPlayer(entity) {
    this.player = entity;
  }

  /**
   * 重新计算子元素位置（窗口尺寸变化时调用）
   */
  layout() {
    const barX = this.x + this.padding + this.avatarSize + 8;
    const barWidth = this.width - this.padding * 2 - this.avatarSize - 8;
    this.healthBar.x = barX;
    this.healthBar.y = this.y + 30;
    this.healthBar.width = barWidth;
    this.manaBar.x = barX;
    this.manaBar.y = this.y + 30 + this.healthBar.height + 6;
    this.manaBar.width = barWidth;
  }

  /**
   * 更新（同步玩家数值 + 平滑动画）
   * @param {number} deltaTime
   */
  update(deltaTime) {
    if (!this.visible || !this.player) return;
    const stats = this.player.getComponent('stats');
    if (stats) {
      this.healthBar.setMaxValue(stats.maxHp);
      this.healthBar.setValue(stats.hp);
      this.manaBar.setMaxValue(stats.maxMp);
      this.manaBar.setValue(stats.mp);
    }
    this.healthBar.update(deltaTime);
    this.manaBar.update(deltaTime);
  }

  /**
   * 渲染
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible || !this.player) return;

    ctx.save();

    // 背景面板（半透明圆角）
    this._roundRect(ctx, this.x, this.y, this.width, this.height, 8);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 头像
    const ax = this.x + this.padding;
    const ay = this.y + (this.height - this.avatarSize) / 2;
    const r = this.avatarSize / 2;
    const cx = ax + r;
    const cy = ay + r;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (this.avatarLoaded && this.avatarImage) {
      ctx.drawImage(this.avatarImage, ax, ay, this.avatarSize, this.avatarSize);
    } else {
      ctx.fillStyle = '#444';
      ctx.fillRect(ax, ay, this.avatarSize, this.avatarSize);
    }
    ctx.restore();

    // 头像边框
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 昵称
    const name = this.player.name || '玩家';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(name, this.x + this.padding + this.avatarSize + 8, this.y + 16);
    ctx.shadowBlur = 0;

    // 血条 / 蓝条（复用组件）
    this.healthBar.render(ctx);
    this.manaBar.render(ctx);

    ctx.restore();
  }

  /**
   * 圆角矩形路径
   */
  _roundRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }
}

export default PlayerStatusHUD;
