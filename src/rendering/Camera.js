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
 * Camera.js
 * 相机类 - 管理游戏视野和坐标转换
 */

/**
 * 相机类
 * 控制游戏世界的可视区域
 */
export class Camera {
  /**
   * @param {number} x - 相机X坐标
   * @param {number} y - 相机Y坐标
   * @param {number} width - 视野宽度
   * @param {number} height - 视野高度
   */
  constructor(x = 0, y = 0, width = 1280, height = 720) {
    this.position = { x, y };
    this.width = width;
    this.height = height;
    
    // 相机边界（地图边界）
    this.bounds = {
      minX: 0,
      minY: 0,
      maxX: Infinity,
      maxY: Infinity
    };
    
    // 跟随目标
    this.target = null;
    this.followSpeed = 0.15; // 平滑跟随速度 (0-1)，提高到0.15减少延迟
    this.deadzone = { x: 50, y: 50 }; // 死区大小，减小到50减少抖动
    
    // 外部控制标志（用于飞行等特殊情况）
    this.externalControl = false;

    // 平滑追赶跟随（如轻功落地后，带缓冲地移动到玩家）
    this.smoothFollow = false;
    this.smoothFollowSpeed = 0.12; // 每帧趋近比例（0~1，越大越快）
  }

  /**
   * 开启一次平滑追赶跟随：相机带缓冲地移动到目标，接近后自动恢复即时跟随
   * @param {number} [speed] - 可选的趋近速度（0~1）
   */
  beginSmoothFollow(speed) {
    this.smoothFollow = true;
    if (typeof speed === 'number') this.smoothFollowSpeed = speed;
  }

  /**
   * 设置相机位置
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   */
  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
    // 不再限制相机边界，允许自由移动
    // this.clampToBounds();
  }

  /**
   * 移动相机
   * @param {number} dx - X轴偏移
   * @param {number} dy - Y轴偏移
   */
  move(dx, dy) {
    this.position.x += dx;
    this.position.y += dy;
    // 不再限制相机边界，允许自由移动
    // this.clampToBounds();
  }

  /**
   * 设置相机边界
   * @param {number} minX - 最小X坐标
   * @param {number} minY - 最小Y坐标
   * @param {number} maxX - 最大X坐标
   * @param {number} maxY - 最大Y坐标
   */
  setBounds(minX, minY, maxX, maxY) {
    this.bounds = { minX, minY, maxX, maxY };
    this.clampToBounds();
  }

  /**
   * 限制相机在边界内
   */
  clampToBounds() {
    // 确保相机不超出地图边界
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    
    if (this.position.x - halfWidth < this.bounds.minX) {
      this.position.x = this.bounds.minX + halfWidth;
    }
    if (this.position.x + halfWidth > this.bounds.maxX) {
      this.position.x = this.bounds.maxX - halfWidth;
    }
    if (this.position.y - halfHeight < this.bounds.minY) {
      this.position.y = this.bounds.minY + halfHeight;
    }
    if (this.position.y + halfHeight > this.bounds.maxY) {
      this.position.y = this.bounds.maxY - halfHeight;
    }
  }

  /**
   * 设置跟随目标
   * @param {Object} target - 目标对象（需要有position属性）
   */
  setTarget(target) {
    this.target = target;
  }

  /**
   * 更新相机（跟随目标）
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    if (!this.target) return;
    
    // 如果相机被外部控制（如飞行系统），跳过自动跟随
    if (this.externalControl) return;
    
    // 获取目标位置
    const targetPos = this.target.position || this.target;

    if (this.smoothFollow) {
      // 平滑追赶：带缓冲地趋近目标（用于轻功落地后）
      const dx = targetPos.x - this.position.x;
      const dy = targetPos.y - this.position.y;
      this.position.x += dx * this.smoothFollowSpeed;
      this.position.y += dy * this.smoothFollowSpeed;
      // 足够接近时结束平滑，恢复即时跟随
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
        this.position.x = targetPos.x;
        this.position.y = targetPos.y;
        this.smoothFollow = false;
      }
      return;
    }

    // 直接让相机跟随目标（不取整，保持亚像素精度实现平滑移动）
    this.position.x = targetPos.x;
    this.position.y = targetPos.y;
  }

  /**
   * 世界坐标转屏幕坐标
   * @param {number} worldX - 世界X坐标
   * @param {number} worldY - 世界Y坐标
   * @returns {{x: number, y: number}}
   */
  worldToScreen(worldX, worldY) {
    return {
      x: worldX - this.position.x + this.width / 2,
      y: worldY - this.position.y + this.height / 2
    };
  }

  /**
   * 屏幕坐标转世界坐标
   * @param {number} screenX - 屏幕X坐标
   * @param {number} screenY - 屏幕Y坐标
   * @returns {{x: number, y: number}}
   */
  screenToWorld(screenX, screenY) {
    return {
      x: screenX + this.position.x - this.width / 2,
      y: screenY + this.position.y - this.height / 2
    };
  }

  /**
   * 检查点是否在视野内
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} margin - 边距（用于提前加载）
   * @returns {boolean}
   */
  isPointVisible(x, y, margin = 0) {
    const halfWidth = this.width / 2 + margin;
    const halfHeight = this.height / 2 + margin;
    
    return (
      x >= this.position.x - halfWidth &&
      x <= this.position.x + halfWidth &&
      y >= this.position.y - halfHeight &&
      y <= this.position.y + halfHeight
    );
  }

  /**
   * 检查矩形是否在视野内（视锥剔除）
   * @param {number} x - 矩形中心X坐标
   * @param {number} y - 矩形中心Y坐标
   * @param {number} width - 矩形宽度
   * @param {number} height - 矩形高度
   * @returns {boolean}
   */
  isRectVisible(x, y, width, height) {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const halfRectWidth = width / 2;
    const halfRectHeight = height / 2;
    
    return !(
      x + halfRectWidth < this.position.x - halfWidth ||
      x - halfRectWidth > this.position.x + halfWidth ||
      y + halfRectHeight < this.position.y - halfHeight ||
      y - halfRectHeight > this.position.y + halfHeight
    );
  }

  /**
   * 获取视野边界
   * @returns {{left: number, right: number, top: number, bottom: number}}
   */
  getViewBounds() {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    
    return {
      left: this.position.x - halfWidth,
      right: this.position.x + halfWidth,
      top: this.position.y - halfHeight,
      bottom: this.position.y + halfHeight
    };
  }
}
