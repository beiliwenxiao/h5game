/**
 * Picker3D.js
 * three.js Raycaster 实现的拾取
 */

import * as THREE from 'three';
import { IPicker } from './IPicker.js';

export class Picker3D extends IPicker {
  /**
   * @param {import('./Camera3DAdapter.js').Camera3DAdapter} cameraAdapter
   * @param {{ getEntityView3D?: (entity) => any, entityClickRadius?: number }} [opts]
   */
  constructor(cameraAdapter, opts = {}) {
    super();
    this.cameraAdapter = cameraAdapter;
    this.getEntityView3D = opts.getEntityView3D || null;
    this.entityClickRadius = opts.entityClickRadius ?? 30;
    this._raycaster = new THREE.Raycaster();
  }

  pickGround(screenX, screenY) {
    return this.cameraAdapter?.screenToWorld(screenX, screenY, 0) ?? null;
  }

  pickEntity(screenX, screenY, entities) {
    if (!entities || entities.length === 0) return null;
    const ground = this.pickGround(screenX, screenY);
    if (!ground) return null;

    // 简化：按地面距离最近选择（复用 2D 的判定方式，保证与 Picker2D 行为一致）
    let best = null;
    let bestZ = -Infinity;
    for (const entity of entities) {
      if (!entity || entity.active === false || entity.isDead) continue;
      const t = entity.getComponent?.('transform');
      if (!t) continue;
      const ex = t.position.x ?? 0;
      const ez = (t.position.z !== undefined ? t.position.z : t.position.y) ?? 0;
      const dx = ex - ground.x;
      const dz = ez - ground.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= this.entityClickRadius * this.entityClickRadius && ez > bestZ) {
        best = entity;
        bestZ = ez;
      }
    }
    return best;
  }
}

export default Picker3D;
