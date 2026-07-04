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
 * FloatingText.js
 * 飘动文字系统 - 显示伤害、治疗等飘动提示
 */

/**
 * 飘动文字类
 */
export class FloatingText {
  /**
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.text = options.text || '';
    this.color = options.color || '#ffffff';
    this.fontSize = options.fontSize || 20;
    this.duration = options.duration || 1.5; // 持续时间（秒）
    this.velocity = options.velocity || { x: 0, y: -50 }; // 移动速度
    this.fadeStart = options.fadeStart || 0.5; // 开始淡出的时间比例
    
    this.age = 0; // 已存在时间
    this.alpha = 1.0; // 透明度
    this.isAlive = true;
  }

  /**
   * 更新飘动文字
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    if (!this.isAlive) return;
    
    this.age += deltaTime;
    
    // 移动
    this.x += this.velocity.x * deltaTime;
    this.y += this.velocity.y * deltaTime;
    
    // 计算透明度
    const progress = this.age / this.duration;
    if (progress >= this.fadeStart) {
      const fadeProgress = (progress - this.fadeStart) / (1 - this.fadeStart);
      this.alpha = 1 - fadeProgress;
    }
    
    // 检查是否结束
    if (this.age >= this.duration) {
      this.isAlive = false;
    }
  }

  /**
   * 渲染飘动文字
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {Camera} camera - 相机对象（可选，用于世界坐标转换）
   */
  render(ctx, camera = null) {
    if (!this.isAlive) return;
    
    ctx.save();
    
    // 如果有相机，转换为屏幕坐标
    let screenX = this.x;
    let screenY = this.y;
    if (camera) {
      const screenPos = camera.worldToScreen(this.x, this.y);
      screenX = screenPos.x;
      screenY = screenPos.y;
    }
    
    // 设置透明度
    ctx.globalAlpha = this.alpha;
    
    // 绘制文字阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.font = `bold ${this.fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(this.text, screenX + 2, screenY + 2);
    
    // 绘制文字
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, screenX, screenY);
    
    ctx.restore();
  }
}

/**
 * 飘动文字管理器
 */
export class FloatingTextManager {
  constructor() {
    this.texts = [];
  }

  /**
   * 添加飘动文字
   * @param {Object} options - 配置选项
   * @returns {FloatingText} 创建的飘动文字对象
   */
  add(options) {
    const text = new FloatingText(options);
    this.texts.push(text);
    return text;
  }

  /**
   * 添加治疗文字
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} amount - 治疗量
   */
  addHeal(x, y, amount) {
    return this.add({
      x,
      y,
      text: `+${amount}`,
      color: '#00ff00',
      fontSize: 24,
      duration: 1.5,
      velocity: { x: 0, y: -60 },
      fadeStart: 0.6
    });
  }

  /**
   * 添加伤害文字
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} amount - 伤害量
   */
  addDamage(x, y, amount) {
    return this.add({
      x,
      y,
      text: `-${amount}`,
      color: '#ff4444',
      fontSize: 24,
      duration: 1.5,
      velocity: { x: 0, y: -60 },
      fadeStart: 0.6
    });
  }

  /**
   * 添加魔法恢复文字
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} amount - 恢复量
   */
  addManaRestore(x, y, amount) {
    return this.add({
      x,
      y,
      text: `+${amount} MP`,
      color: '#4444ff',
      fontSize: 20,
      duration: 1.5,
      velocity: { x: 0, y: -60 },
      fadeStart: 0.6
    });
  }

  /**
   * 添加自定义文字
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {string} text - 文字内容
   * @param {string} color - 颜色
   */
  addText(x, y, text, color = '#ffffff') {
    return this.add({
      x,
      y,
      text,
      color,
      fontSize: 20,
      duration: 1.5,
      velocity: { x: 0, y: -50 },
      fadeStart: 0.6
    });
  }

  /**
   * 更新所有飘动文字
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    // 更新所有文字
    for (const text of this.texts) {
      text.update(deltaTime);
    }
    
    // 移除已结束的文字
    this.texts = this.texts.filter(text => text.isAlive);
  }

  /**
   * 渲染所有飘动文字
   * @param {CanvasRenderingContext2D} ctx - 渲染上下文
   * @param {Camera} camera - 相机对象（可选）
   */
  render(ctx, camera = null) {
    for (const text of this.texts) {
      text.render(ctx, camera);
    }
  }

  /**
   * 清除所有飘动文字
   */
  clear() {
    this.texts = [];
  }

  /**
   * 获取当前飘动文字数量
   * @returns {number}
   */
  getCount() {
    return this.texts.length;
  }
}
