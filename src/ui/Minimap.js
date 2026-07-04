/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-02-10
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

import { UIElement } from './UIElement.js';

/**
 * 小地图组件
 * 显示简化的地图视图和实体位置
 */
export class Minimap extends UIElement {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.mapData - 地图数据
   * @param {number} options.mapData.width - 地图宽度
   * @param {number} options.mapData.height - 地图高度
   * @param {string} [options.backgroundColor='rgba(0, 0, 0, 0.7)'] - 背景颜色
   * @param {string} [options.borderColor='#ffffff'] - 边框颜色
   * @param {string} [options.playerColor='#0088ff'] - 玩家标记颜色
   * @param {string} [options.enemyColor='#ff0000'] - 敌人标记颜色
   * @param {number} [options.markerSize=4] - 标记大小
   */
  constructor(options = {}) {
    super(options);
    
    this.mapData = options.mapData || { width: 800, height: 600 };
    this.backgroundColor = options.backgroundColor || 'rgba(0, 0, 0, 0.7)';
    this.borderColor = options.borderColor || '#ffffff';
    this.playerColor = options.playerColor || '#0088ff';
    this.enemyColor = options.enemyColor || '#ff0000';
    this.markerSize = options.markerSize || 4;
    
    this.borderWidth = 2;
    this.padding = 5;
    
    // 玩家和敌人位置
    this.playerPosition = null;
    this.enemyPositions = [];
    
    // 计算缩放比例
    this.updateScale();
  }

  /**
   * 更新缩放比例
   */
  updateScale() {
    const innerWidth = this.width - this.padding * 2;
    const innerHeight = this.height - this.padding * 2;
    
    this.scaleX = innerWidth / this.mapData.width;
    this.scaleY = innerHeight / this.mapData.height;
  }

  /**
   * 设置地图数据
   * @param {Object} mapData - 地图数据
   */
  setMapData(mapData) {
    this.mapData = mapData;
    this.updateScale();
  }

  /**
   * 设置玩家位置
   * @param {Object} position - 玩家位置 {x, y}
   */
  setPlayerPosition(position) {
    this.playerPosition = position;
  }

  /**
   * 设置敌人位置列表
   * @param {Array} positions - 敌人位置数组 [{x, y}, ...]
   */
  setEnemyPositions(positions) {
    this.enemyPositions = positions || [];
  }

  /**
   * 添加敌人位置
   * @param {Object} position - 敌人位置 {x, y}
   */
  addEnemyPosition(position) {
    this.enemyPositions.push(position);
  }

  /**
   * 清空敌人位置
   */
  clearEnemyPositions() {
    this.enemyPositions = [];
  }

  /**
   * 更新小地图
   * @param {number} deltaTime - 帧间隔时间（毫秒）
   */
  update(deltaTime) {
    // 小地图通常不需要动画更新
  }

  /**
   * 渲染小地图
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  render(ctx) {
    if (!this.visible) return;

    // 绘制背景
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // 绘制边框
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = this.borderWidth;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // 绘制地图网格（可选）
    this.renderMapGrid(ctx);

    // 绘制敌人标记
    this.renderEnemyMarkers(ctx);

    // 绘制玩家标记（最后绘制，确保在最上层）
    this.renderPlayerMarker(ctx);
  }

  /**
   * 渲染地图网格
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  renderMapGrid(ctx) {
    const innerX = this.x + this.padding;
    const innerY = this.y + this.padding;
    const innerWidth = this.width - this.padding * 2;
    const innerHeight = this.height - this.padding * 2;

    // 绘制简单的网格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    const gridSize = 20; // 网格大小（像素）
    const cols = Math.floor(innerWidth / gridSize);
    const rows = Math.floor(innerHeight / gridSize);

    // 绘制垂直线
    for (let i = 0; i <= cols; i++) {
      const x = innerX + i * gridSize;
      ctx.beginPath();
      ctx.moveTo(x, innerY);
      ctx.lineTo(x, innerY + innerHeight);
      ctx.stroke();
    }

    // 绘制水平线
    for (let i = 0; i <= rows; i++) {
      const y = innerY + i * gridSize;
      ctx.beginPath();
      ctx.moveTo(innerX, y);
      ctx.lineTo(innerX + innerWidth, y);
      ctx.stroke();
    }
  }

  /**
   * 渲染玩家标记
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  renderPlayerMarker(ctx) {
    if (!this.playerPosition) return;

    const screenPos = this.worldToScreen(this.playerPosition);
    
    // 绘制玩家标记（蓝色圆点）
    ctx.fillStyle = this.playerColor;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, this.markerSize, 0, Math.PI * 2);
    ctx.fill();

    // 绘制外圈
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, this.markerSize, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * 渲染敌人标记
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  renderEnemyMarkers(ctx) {
    for (const enemyPos of this.enemyPositions) {
      const screenPos = this.worldToScreen(enemyPos);
      
      // 绘制敌人标记（红色圆点）
      ctx.fillStyle = this.enemyColor;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, this.markerSize - 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 世界坐标转换为屏幕坐标
   * @param {Object} worldPos - 世界坐标 {x, y}
   * @returns {Object} 屏幕坐标 {x, y}
   */
  worldToScreen(worldPos) {
    return {
      x: this.x + this.padding + worldPos.x * this.scaleX,
      y: this.y + this.padding + worldPos.y * this.scaleY
    };
  }

  /**
   * 屏幕坐标转换为世界坐标
   * @param {Object} screenPos - 屏幕坐标 {x, y}
   * @returns {Object} 世界坐标 {x, y}
   */
  screenToWorld(screenPos) {
    return {
      x: (screenPos.x - this.x - this.padding) / this.scaleX,
      y: (screenPos.y - this.y - this.padding) / this.scaleY
    };
  }

  /**
   * 处理点击事件（可用于小地图导航）
   * @param {number} x - 点击X坐标
   * @param {number} y - 点击Y坐标
   * @returns {Object|null} 世界坐标或null
   */
  handleClick(x, y) {
    if (this.containsPoint(x, y)) {
      return this.screenToWorld({ x, y });
    }
    return null;
  }
}
