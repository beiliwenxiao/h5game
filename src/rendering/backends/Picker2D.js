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
 * Picker2D.js
 * Canvas 2D 后端的拾取器
 */

import { IPicker } from './IPicker.js';

export class Picker2D extends IPicker {
  /**
   * @param {import('./Camera2DAdapter.js').Camera2DAdapter} cameraAdapter
   * @param {Object} [opts]
   * @param {number} [opts.entityClickRadius=30]
   */
  constructor(cameraAdapter, opts = {}) {
    super();
    this.camera = cameraAdapter;
    this.entityClickRadius = opts.entityClickRadius ?? 30;
  }

  /**
   * 屏幕点转地面世界坐标（y=0 平面）
   * @param {number} screenX
   * @param {number} screenY
   * @returns {{x:number, y:number, z:number}|null}
   */
  pickGround(screenX, screenY) {
    if (!this.camera) return null;
    return this.camera.screenToWorld(screenX, screenY, 0);
  }

  /**
   * 屏幕点命中的实体（半径判定 + z 值近者优先）
   * @param {number} screenX
   * @param {number} screenY
   * @param {Array} entities
   * @returns {*|null}
   */
  pickEntity(screenX, screenY, entities) {
    if (!entities || entities.length === 0) return null;
    const groundPos = this.pickGround(screenX, screenY);
    if (!groundPos) return null;

    let best = null;
    let bestZ = -Infinity;
    for (const entity of entities) {
      if (!entity || entity.active === false || entity.isDead) continue;
      const t = entity.getComponent ? entity.getComponent('transform') : null;
      if (!t) continue;
      const ex = t.position.x ?? 0;
      const ez = (t.position.z !== undefined ? t.position.z : t.position.y) ?? 0;
      const dx = ex - groundPos.x;
      const dz = ez - groundPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= this.entityClickRadius * this.entityClickRadius) {
        // z 较大者视觉上更靠前，优先命中
        if (ez > bestZ) {
          best = entity;
          bestZ = ez;
        }
      }
    }
    return best;
  }
}

export default Picker2D;
