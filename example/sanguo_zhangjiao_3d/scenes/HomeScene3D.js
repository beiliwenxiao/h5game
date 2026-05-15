/**
 * HomeScene3D - 3D 首页场景
 *
 * 用于验证 ThreeBackend 是否正常工作的简单场景：
 * - 旋转的 3D 立方体
 * - 一片地面
 * - "进入游戏" 按钮
 *
 * 不使用 BaseGameScene 那一套 ECS / 战斗系统，纯演示 3D 渲染管线。
 */

import { Scene } from '../../../src/core/Scene.js';
import * as THREE from 'three';

export class HomeScene3D extends Scene {
  constructor() {
    super('HomeScene3D');
    this.__dualBackendAware = true; // 让 SceneManager 传完整 backend
    this.renderBackend = null;
    this._cube = null;
    this._sceneManager = null;
    this._buttonEl = null;
  }

  setSceneManager(sm) {
    this._sceneManager = sm;
  }

  async enter() {
    super.enter?.();
    this._setupOverlayButton();
  }

  exit() {
    super.exit?.();
    this._removeOverlayButton();
    if (this._cube) {
      // 从 3D 场景中移除立方体
      this._cube.parent?.remove(this._cube);
      this._cube.geometry?.dispose?.();
      this._cube.material?.dispose?.();
      this._cube = null;
    }
  }

  /**
   * 在 HUD 层叠加 "进入游戏" 按钮（用 DOM）
   */
  _setupOverlayButton() {
    if (this._buttonEl) return;
    const btn = document.createElement('button');
    btn.textContent = '进入第一幕';
    btn.style.cssText = `
      position: absolute;
      left: 50%;
      bottom: 80px;
      transform: translateX(-50%);
      padding: 14px 40px;
      font-size: 18px;
      font-weight: bold;
      color: #fff;
      background: linear-gradient(90deg, #2196F3, #03A9F4);
      border: none;
      border-radius: 30px;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(33,150,243,0.5);
      z-index: 1000;
    `;
    btn.onmouseenter = () => { btn.style.transform = 'translateX(-50%) scale(1.05)'; };
    btn.onmouseleave = () => { btn.style.transform = 'translateX(-50%) scale(1)'; };
    btn.onclick = () => {
      if (this._sceneManager) {
        this._sceneManager.switchTo('Act1Scene');
      }
    };
    document.body.appendChild(btn);
    this._buttonEl = btn;

    // 标题
    const title = document.createElement('div');
    title.textContent = '三国张角序章 · 3D 模式';
    title.style.cssText = `
      position: absolute;
      left: 50%;
      top: 60px;
      transform: translateX(-50%);
      font-size: 36px;
      font-weight: bold;
      color: #fff;
      text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
      z-index: 1000;
      pointer-events: none;
    `;
    document.body.appendChild(title);
    this._titleEl = title;
  }

  _removeOverlayButton() {
    if (this._buttonEl) {
      this._buttonEl.remove();
      this._buttonEl = null;
    }
    if (this._titleEl) {
      this._titleEl.remove();
      this._titleEl = null;
    }
  }

  /**
   * 在 3D 场景里加一个旋转的立方体
   */
  _ensureCube(backend) {
    if (this._cube || !backend?.scene) return;
    const geom = new THREE.BoxGeometry(80, 80, 80);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff9800 });
    const cube = new THREE.Mesh(geom, mat);
    cube.position.set(0, 60, 0);
    backend.scene.add(cube);
    this._cube = cube;

    // 让相机看向原点
    if (backend.camera?.setTarget) {
      backend.camera.setTarget({ position: { x: 0, y: 0, z: 0 } });
      backend.camera.update?.();
    }
  }

  update(deltaTime) {
    if (this._cube) {
      this._cube.rotation.x += deltaTime * 0.8;
      this._cube.rotation.y += deltaTime * 1.2;
    }
  }

  /**
   * SceneManager 双后端感知入口
   */
  renderCommon(backend) {
    if (!backend) return;
    this._ensureCube(backend);
    // 世界渲染由 backend.beginFrame/endFrame 在 index.html 中处理
    // 这里不需要做额外渲染（立方体已加到 backend.scene）
  }

  /**
   * 兼容旧路径：传入 ctx（2D ctx 或 hudCtx）
   */
  render(ctxOrBackend) {
    if (ctxOrBackend && ctxOrBackend.mode === '3d') {
      this.renderCommon(ctxOrBackend);
    }
    // 没有 2D 内容需要绘制
  }
}

export default HomeScene3D;
