/**
 * Camera3DAdapter.js
 * three.js 的相机适配器
 *
 * 默认使用正交相机（pitch 30°, yaw 45°），观感接近等距投影。
 */

import * as THREE from 'three';
import { ICameraAdapter } from './ICameraAdapter.js';

const DEG = Math.PI / 180;

export class Camera3DAdapter extends ICameraAdapter {
  /**
   * @param {Object} [config]
   * @param {number} [config.width=1280]
   * @param {number} [config.height=720]
   * @param {'ortho'|'perspective'} [config.camera='ortho']
   * @param {number} [config.pitchDeg=30]
   * @param {number} [config.yawDeg=45]
   * @param {number} [config.zoom=8]  // 每像素世界单位
   */
  constructor(config = {}) {
    super();
    this.width = config.width ?? 1280;
    this.height = config.height ?? 720;
    this.mode3d = config.camera ?? 'ortho';
    this.pitchDeg = config.pitchDeg ?? 30;
    this.yawDeg = config.yawDeg ?? 45;
    this.distance = config.distance ?? 1500; // 相机到目标的距离

    this._target = null;
    this._focus = new THREE.Vector3(0, 0, 0);
    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0

    this._makeCamera();
  }

  _makeCamera() {
    if (this.mode3d === 'perspective') {
      this.native = new THREE.PerspectiveCamera(60, this.width / this.height, 1, 10000);
    } else {
      const halfW = this.width / 2;
      const halfH = this.height / 2;
      this.native = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 10000);
    }
    this._applyPose();
  }

  _applyPose() {
    const cam = this.native;
    const yaw = this.yawDeg * DEG;
    const pitch = this.pitchDeg * DEG;
    const d = this.distance;

    const dx = Math.sin(yaw) * Math.cos(pitch) * d;
    const dy = Math.sin(pitch) * d;
    const dz = Math.cos(yaw) * Math.cos(pitch) * d;

    cam.position.set(this._focus.x + dx, this._focus.y + dy, this._focus.z + dz);
    cam.lookAt(this._focus);
    cam.updateMatrixWorld();
  }

  // ---- 尺寸 ----
  setSize(width, height) {
    this.width = width;
    this.height = height;
    if (this.native.isOrthographicCamera) {
      this.native.left = -width / 2;
      this.native.right = width / 2;
      this.native.top = height / 2;
      this.native.bottom = -height / 2;
      this.native.updateProjectionMatrix();
    } else if (this.native.isPerspectiveCamera) {
      this.native.aspect = width / height;
      this.native.updateProjectionMatrix();
    }
  }

  // ---- 跟随 ----
  setTarget(target) {
    this._target = target;
  }

  update(/* deltaTime */) {
    if (!this._target) return;
    const pos = this._target.position ?? this._target;
    // 取 three.js 语义 y=elevation, z=地面深度
    const x = pos.x ?? 0;
    const y = (pos.elevation ?? pos.y ?? 0);
    const z = (pos.z !== undefined ? pos.z : (pos.y ?? 0));
    this._focus.set(x, y, z);
    this._applyPose();
  }

  setBounds(/* minX, minZ, maxX, maxZ */) {
    // M5 骨架暂不实现；后续可 clamp focus
  }

  // ---- 坐标转换 ----
  worldToScreen(worldPos) {
    const wp = worldPos || { x: 0, y: 0, z: 0 };
    const x = wp.x ?? 0;
    const y = wp.y ?? 0;   // elevation
    const z = wp.z ?? 0;   // 地面深度
    const v = new THREE.Vector3(x, y, z);
    v.project(this.native);
    return {
      x: (v.x + 1) * 0.5 * this.width,
      y: (1 - v.y) * 0.5 * this.height
    };
  }

  screenToWorld(screenX, screenY, _groundY = 0) {
    const ndc = new THREE.Vector2(
      (screenX / this.width) * 2 - 1,
      -((screenY / this.height) * 2 - 1)
    );
    this._raycaster.setFromCamera(ndc, this.native);
    const hit = new THREE.Vector3();
    this._raycaster.ray.intersectPlane(this._groundPlane, hit);
    if (!hit) return { x: 0, y: _groundY, z: 0 };
    return { x: hit.x, y: _groundY, z: hit.z };
  }

  isVisible(/* worldPos, radius */) {
    // 简化：默认 true；视锥剔除交由 three 内置
    return true;
  }

  setAngle(pitchDeg, yawDeg) {
    if (typeof pitchDeg === 'number') this.pitchDeg = pitchDeg;
    if (typeof yawDeg === 'number') this.yawDeg = yawDeg;
    this._applyPose();
  }

  /**
   * 视野边界（近似 2D 行为：返回 XZ 平面上屏幕四角对应的地面包围盒）
   */
  getViewBounds() {
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.width, this.height);
    return {
      left: Math.min(tl.x, br.x),
      right: Math.max(tl.x, br.x),
      top: Math.min(tl.z, br.z),
      bottom: Math.max(tl.z, br.z)
    };
  }

  /**
   * 为 InputManager 提供的"相机 2D 位置"（使用 focus 的 x/z）
   */
  get position() {
    return { x: this._focus.x, y: this._focus.z };
  }
}

export default Camera3DAdapter;
