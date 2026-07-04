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
 * ICameraAdapter.js
 * 相机适配器接口
 *
 * 统一 2D / 3D 后端对外的相机 API，业务层只调用该接口。
 */

/**
 * @typedef {Object} Vec2
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Vec3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

export class ICameraAdapter {
  constructor() {
    /** 真实相机实现（现有 Camera 或 THREE.Camera） */
    this.native = null;
  }

  /**
   * 设置跟随目标
   * @param {*} target - 带 position 字段或 TransformComponent
   */
  // eslint-disable-next-line no-unused-vars
  setTarget(target) {}

  /**
   * 每帧更新
   * @param {number} deltaTime
   */
  // eslint-disable-next-line no-unused-vars
  update(deltaTime) {}

  /**
   * 设置视野边界（XZ 平面）
   * @param {number} minX
   * @param {number} minZ
   * @param {number} maxX
   * @param {number} maxZ
   */
  // eslint-disable-next-line no-unused-vars
  setBounds(minX, minZ, maxX, maxZ) {}

  /**
   * 世界坐标转屏幕坐标
   * @param {Vec3} worldPos
   * @returns {Vec2}
   */
  // eslint-disable-next-line no-unused-vars
  worldToScreen(worldPos) {
    return { x: 0, y: 0 };
  }

  /**
   * 屏幕坐标转世界坐标（默认打在地面 y=groundY 平面上）
   * @param {number} screenX
   * @param {number} screenY
   * @param {number} [groundY=0]
   * @returns {Vec3}
   */
  // eslint-disable-next-line no-unused-vars
  screenToWorld(screenX, screenY, groundY = 0) {
    return { x: 0, y: groundY, z: 0 };
  }

  /**
   * 世界点是否在视野内
   * @param {Vec3} worldPos
   * @param {number} [radius=0]
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  isVisible(worldPos, radius = 0) {
    return true;
  }

  /**
   * 仅 3D 后端有效：设置俯仰角/偏航角
   * @param {number} pitchDeg
   * @param {number} yawDeg
   */
  // eslint-disable-next-line no-unused-vars
  setAngle(pitchDeg, yawDeg) {}
}

export default ICameraAdapter;
