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
 * ParticleRenderer3D.js
 * three.js 粒子渲染器（M5 骨架：最小可用实现）
 *
 * 使用 THREE.Points + BufferGeometry 批量绘制。
 */

import * as THREE from 'three';
import { IParticleRenderer } from './IParticleRenderer.js';

export class ParticleRenderer3D extends IParticleRenderer {
  /**
   * @param {THREE.Scene} scene
   * @param {number} [capacity=2000]
   */
  constructor(scene, capacity = 2000) {
    super();
    this.scene = scene;
    this.capacity = capacity;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
    );
    geometry.setDrawRange(0, 0);

    const material = new THREE.PointsMaterial({
      size: 4,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  _parseColor(c) {
    if (!c) return [1, 1, 1];
    if (typeof c !== 'string') return [1, 1, 1];
    if (c.startsWith('#') && c.length === 7) {
      const r = parseInt(c.slice(1, 3), 16) / 255;
      const g = parseInt(c.slice(3, 5), 16) / 255;
      const b = parseInt(c.slice(5, 7), 16) / 255;
      return [r, g, b];
    }
    return [1, 1, 1];
  }

  render(particleSystem /*, camera */) {
    if (!particleSystem) return;
    const list = particleSystem.particles || [];
    const geom = this.points.geometry;
    const posAttr = geom.getAttribute('position');
    const colAttr = geom.getAttribute('color');

    let n = 0;
    const max = this.capacity;
    for (const p of list) {
      if (!p || p.active === false) continue;
      if (n >= max) break;
      // 坐标映射：2D 粒子系统使用 {x, y} 其中 y 向下为正
      // 3D 世界：x=水平, y=高度(向上为正), z=深度
      const x = p.position?.x ?? 0;
      // 初始 y 作为地面深度（z），当前 y 与初始 y 的差值取反作为高度（y）
      const initY = p.initialPosition?.y ?? p.position?.y ?? 0;
      const z = initY; // 粒子生成点在地面上的深度位置
      const yOffset = initY - (p.position?.y ?? 0); // 2D 中 y 减小 = 向上 → 正高度
      const y = yOffset;
      posAttr.array[n * 3 + 0] = x;
      posAttr.array[n * 3 + 1] = y;
      posAttr.array[n * 3 + 2] = z;
      const [r, g, b] = this._parseColor(p.color);
      colAttr.array[n * 3 + 0] = r;
      colAttr.array[n * 3 + 1] = g;
      colAttr.array[n * 3 + 2] = b;
      n++;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geom.setDrawRange(0, n);
  }

  dispose() {
    if (this.points && this.scene) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.points = null;
    }
  }
}

export default ParticleRenderer3D;
