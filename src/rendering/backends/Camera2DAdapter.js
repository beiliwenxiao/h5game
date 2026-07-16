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
 * Camera2DAdapter.js
 * 2D 后端的相机适配器
 *
 * 约定：
 *   - 世界坐标为 (x, y=elevation, z=groundDepth)
 *   - 内部沿用现有 Camera（其 position 只有 x/y，语义上的 y 即 z）
 *   - worldToScreen 把 elevation 投影为屏幕上移
 */

import { ICameraAdapter } from './ICameraAdapter.js';
import { Camera } from '../Camera.js';

export class Camera2DAdapter extends ICameraAdapter {
  /**
   * @param {Camera|null} [camera] - 可选，已存在的 Camera；不传则自建
   * @param {Object} [config]
   * @param {number} [config.width=1280]
   * @param {number} [config.height=720]
   * @param {number} [config.kIso=1] - elevation → 屏幕 Y 的系数
   */
  constructor(camera = null, config = {}) {
    super();
    const width = config.width ?? 1280;
    const height = config.height ?? 720;
    this.native = camera || new Camera(0, 0, width, height);
    this.kIso = config.kIso ?? 1;
  }

  // ---- 尺寸 ----
  setSize(width, height) {
    this.native.width = width;
    this.native.height = height;
  }

  get width() { return this.native.width; }
  get height() { return this.native.height; }

  // ---- 跟随 ----
  setTarget(target) {
    if (!target) { this.native.setTarget(null); return; }
    const pos = target.position ?? target;
    // Adapter：提供一个按 (x, z) 维度投影的 target
    // 旧 Camera 使用 position.y 作为纵轴，这里把 z 映射到 y
    const adapter = {
      get position() {
        return {
          x: pos.x ?? 0,
          // 兼容：新 Transform 的 z 若存在优先使用；否则退化为旧 y
          y: (pos.z ?? pos.y ?? 0)
        };
      }
    };
    this.native.setTarget(adapter);
  }

  update(deltaTime) {
    this.native.update(deltaTime);
  }

  setBounds(minX, minZ, maxX, maxZ) {
    this.native.setBounds(minX, minZ, maxX, maxZ);
  }

  // ---- 坐标转换 ----
  worldToScreen(worldPos) {
    const wp = worldPos || { x: 0, y: 0, z: 0 };
    const x = wp.x ?? 0;
    const z = wp.z ?? wp.y ?? 0;  // 兼容旧 {x,y}
    const elevation = wp.z !== undefined ? (wp.y ?? 0) : 0;
    const screen = this.native.worldToScreen(x, z);
    return {
      x: screen.x,
      y: screen.y - elevation * this.kIso
    };
  }

  screenToWorld(screenX, screenY, groundY = 0) {
    const world = this.native.screenToWorld(screenX, screenY);
    return { x: world.x, y: groundY, z: world.y };
  }

  isVisible(worldPos, radius = 0) {
    const wp = worldPos || { x: 0, y: 0, z: 0 };
    const x = wp.x ?? 0;
    const z = wp.z ?? wp.y ?? 0;
    return this.native.isPointVisible(x, z, radius);
  }

  setAngle(/* pitch, yaw */) {
    // 2D 后端无倾角
  }

  // 视图边界（供 RenderSystem 使用）
  getViewBounds() {
    return this.native.getViewBounds();
  }

  get position() {
    return this.native.position;
  }
}

export default Camera2DAdapter;
