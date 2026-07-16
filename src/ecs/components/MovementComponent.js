/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * MovementComponent.js
 * 移动组件 - 管理实体的移动相关数据
 */

import { Component } from '../Component.js';

/**
 * 移动组件
 * 存储移动速度、路径和移动状态
 */
export class MovementComponent extends Component {
  /**
   * @param {Object} config - 配置
   * @param {number} config.speed - 移动速度（像素/秒）
   */
  constructor(config = {}) {
    super('movement');
    
    // 速度
    this.speed = config.speed || 100;
    this.velocity = { x: 0, y: 0 };
    
    // 路径
    this.path = [];
    this.currentPathIndex = 0;
    this.targetPosition = null;
    
    // 移动状态
    this.isMoving = false;
    this.movementType = 'none'; // 'none', 'keyboard', 'path'
    
    // 移动方向（用于动画）
    this.direction = { x: 0, y: 0 };
    this.facing = 'down'; // 'up', 'down', 'left', 'right'
  }

  /**
   * 设置速度
   * @param {number} speed - 移动速度
   */
  setSpeed(speed) {
    this.speed = speed;
  }

  /**
   * 设置速度向量
   * @param {number} vx - X轴速度
   * @param {number} vy - Y轴速度
   */
  setVelocity(vx, vy) {
    this.velocity.x = vx;
    this.velocity.y = vy;
    this.updateDirection();
  }

  /**
   * 设置移动路径
   * @param {Array<{x: number, y: number}>} path - 路径点数组
   */
  setPath(path) {
    if (path && path.length > 0) {
      this.path = [...path];
      this.currentPathIndex = 0;
      this.targetPosition = this.path[0];
      this.isMoving = true;
      this.movementType = 'path';
    }
  }

  /**
   * 清除路径
   */
  clearPath() {
    this.path = [];
    this.currentPathIndex = 0;
    this.targetPosition = null;
    this.isMoving = false;
    this.movementType = 'none';
    this.velocity.x = 0;
    this.velocity.y = 0;
  }

  /**
   * 移动到下一个路径点
   * @returns {boolean} 是否还有更多路径点
   */
  moveToNextPathPoint() {
    this.currentPathIndex++;
    if (this.currentPathIndex < this.path.length) {
      this.targetPosition = this.path[this.currentPathIndex];
      return true;
    } else {
      this.clearPath();
      return false;
    }
  }

  /**
   * 检查是否到达目标点
   * @param {{x: number, y: number}} position - 当前位置
   * @param {number} threshold - 距离阈值
   * @returns {boolean}
   */
  hasReachedTarget(position, threshold = 5) {
    if (!this.targetPosition) return true;
    
    const dx = this.targetPosition.x - position.x;
    const dy = this.targetPosition.y - position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance <= threshold;
  }

  /**
   * 计算朝向目标的速度
   * @param {{x: number, y: number}} position - 当前位置
   * @param {number} [modifiedSpeed] - 修改后的速度（可选，用于状态效果）
   */
  calculateVelocityToTarget(position, modifiedSpeed = null) {
    if (!this.targetPosition) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      return;
    }
    
    const dx = this.targetPosition.x - position.x;
    const dy = this.targetPosition.y - position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      const speed = modifiedSpeed !== null ? modifiedSpeed : this.speed;
      this.velocity.x = (dx / distance) * speed;
      this.velocity.y = (dy / distance) * speed;
      this.updateDirection();
    }
  }

  /**
   * 更新移动方向
   */
  updateDirection() {
    // 归一化方向向量
    const magnitude = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
    if (magnitude > 0) {
      this.direction.x = this.velocity.x / magnitude;
      this.direction.y = this.velocity.y / magnitude;
      
      // 更新朝向
      this.updateFacing();
    }
  }

  /**
   * 更新朝向
   */
  updateFacing() {
    // 根据速度向量确定朝向
    const absX = Math.abs(this.velocity.x);
    const absY = Math.abs(this.velocity.y);
    
    if (absX > absY) {
      this.facing = this.velocity.x > 0 ? 'right' : 'left';
    } else if (absY > 0) {
      this.facing = this.velocity.y > 0 ? 'down' : 'up';
    }
  }

  /**
   * 开始键盘移动
   * @param {number} vx - X轴速度
   * @param {number} vy - Y轴速度
   */
  startKeyboardMovement(vx, vy) {
    this.clearPath();
    this.setVelocity(vx, vy);
    this.isMoving = true;
    this.movementType = 'keyboard';
  }

  /**
   * 停止移动
   */
  stop() {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.isMoving = false;
    this.movementType = 'none';
  }

  /**
   * 检查是否在移动
   * @returns {boolean}
   */
  isCurrentlyMoving() {
    // 对于路径移动，只要有目标位置就认为在移动
    if (this.movementType === 'path' && this.targetPosition) {
      return true;
    }
    // 对于键盘移动，检查速度或 isMoving 标志
    return this.isMoving || (this.velocity.x !== 0 || this.velocity.y !== 0);
  }

  /**
   * 获取移动速度大小
   * @returns {number}
   */
  getSpeed() {
    return Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
  }
}
