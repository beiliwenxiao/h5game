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
 * TransformComponent.js
 * 变换组件 - 管理实体的位置、旋转和缩放
 *
 * 三维化（阶段 A / 兼容期）：
 *   - position.x : 水平方向（与旧语义一致）
 *   - position.y : 地面深度（与旧语义一致，等价于 position.z）
 *   - position.z : 地面深度（新增别名；值与 y 同步）
 *   - position.elevation : 离地高度（新增，默认 0，替代"视觉 offsetY"）
 *
 * 设计要点：
 *   - 读写 position.y 或 position.z 任一字段都会同步另一字段
 *   - 旧代码调用 setPosition(x, y) 行为不变
 *   - 新代码可用 setPosition(x, y, elevation) 或直接修改 position.elevation
 *   - 额外提供 floorId 字段支持多楼层（默认 'ground'）
 */

import { Component } from '../Component.js';

/**
 * 创建带 getter/setter 的 position 对象
 * 允许旧代码继续写 transform.position.x = v 或 transform.position.y = v
 * @param {TransformComponent} owner
 */
function createPositionProxy(owner) {
  const proxy = {};
  Object.defineProperty(proxy, 'x', {
    enumerable: true,
    configurable: false,
    get() { return owner._x; },
    set(v) { owner._x = v; }
  });
  Object.defineProperty(proxy, 'y', {
    enumerable: true,
    configurable: false,
    get() { return owner._y; },
    set(v) { owner._y = v; }
  });
  Object.defineProperty(proxy, 'z', {
    enumerable: true,
    configurable: false,
    get() { return owner._y; },          // 阶段 A：z 与 y 同值
    set(v) { owner._y = v; }
  });
  Object.defineProperty(proxy, 'elevation', {
    enumerable: true,
    configurable: false,
    get() { return owner._elevation; },
    set(v) { owner._elevation = v; }
  });
  return proxy;
}

/**
 * 变换组件
 * 存储实体的空间变换信息
 */
export class TransformComponent extends Component {
  /**
   * @param {number|Object} x - X坐标或配置对象 {x, y, z, elevation, rotation, scaleX, scaleY, floorId}
   * @param {number} y - Y坐标（地面深度）
   * @param {number} rotation - 旋转角度（弧度）
   * @param {number} scaleX - X轴缩放
   * @param {number} scaleY - Y轴缩放
   */
  constructor(x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) {
    super('transform');

    // 支持对象参数
    if (typeof x === 'object' && x !== null) {
      const config = x;
      this._x = config.x ?? 0;
      this._y = (config.z !== undefined) ? config.z : (config.y ?? 0);
      this._elevation = config.elevation ?? 0;
      this.rotation = config.rotation ?? 0;
      this.scale = {
        x: config.scaleX ?? config.scale?.x ?? 1,
        y: config.scaleY ?? config.scale?.y ?? 1
      };
      this.floorId = config.floorId ?? 'ground';
    } else {
      // 传统的独立参数
      this._x = x;
      this._y = y;
      this._elevation = 0;
      this.rotation = rotation;
      this.scale = { x: scaleX, y: scaleY };
      this.floorId = 'ground';
    }

    // position 代理（带 getter/setter）
    this.position = createPositionProxy(this);
  }

  /**
   * 设置位置
   * @param {number} x
   * @param {number} y - 地面深度（旧语义；等价于新 z）
   * @param {number} [elevation] - 高度；未传时保持原值
   */
  setPosition(x, y, elevation) {
    this._x = x;
    this._y = y;
    if (elevation !== undefined) this._elevation = elevation;
  }

  /**
   * 设置三维位置（语义清晰版）
   * @param {number} x
   * @param {number} elevation - 高度（对应 three.js y）
   * @param {number} z - 地面深度（对应 three.js z）
   */
  setWorldPosition3D(x, elevation, z) {
    this._x = x;
    this._elevation = elevation;
    this._y = z;
  }

  /**
   * 移动位置（XZ 平面）
   * @param {number} dx
   * @param {number} dy - 地面深度增量
   */
  translate(dx, dy) {
    this._x += dx;
    this._y += dy;
  }

  /**
   * 设置离地高度
   * @param {number} h
   */
  setElevation(h) {
    this._elevation = h;
  }

  /**
   * 设置所属楼层
   * @param {string} id
   */
  setFloor(id) {
    this.floorId = id;
  }

  /**
   * 设置旋转
   */
  setRotation(rotation) {
    this.rotation = rotation;
  }

  rotate(angle) {
    this.rotation += angle;
  }

  /**
   * 设置缩放
   */
  setScale(scaleX, scaleY = scaleX) {
    this.scale.x = scaleX;
    this.scale.y = scaleY;
  }

  /**
   * 获取世界坐标（2D 兼容语义：{x, y}）
   */
  getWorldPosition() {
    return { x: this._x, y: this._y };
  }

  /**
   * 获取三维世界坐标（three.js 语义：{x, y=elevation, z=groundDepth}）
   */
  getWorldPosition3D() {
    return { x: this._x, y: this._elevation, z: this._y };
  }
}
