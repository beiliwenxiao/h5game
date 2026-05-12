/**
 * ParticleRenderer2D.js
 * Canvas 2D 后端的粒子渲染器
 */

import { IParticleRenderer } from './IParticleRenderer.js';

export class ParticleRenderer2D extends IParticleRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  constructor(ctx) {
    super();
    this.ctx = ctx;
  }

  setContext(ctx) {
    this.ctx = ctx;
  }

  /**
   * 委托 ParticleSystem 自行渲染（保持现有行为）
   * @param {*} particleSystem
   * @param {import('./ICameraAdapter.js').ICameraAdapter} cameraAdapter
   */
  render(particleSystem, cameraAdapter) {
    if (!particleSystem || !this.ctx) return;
    // ParticleSystem.render 期望收到 ctx 和 camera（内部使用 camera.position）
    const nativeCamera = cameraAdapter?.native ?? cameraAdapter;
    try {
      particleSystem.render(this.ctx, nativeCamera);
    } catch (err) {
      // 粒子系统异常不阻塞主渲染
      console.warn('ParticleRenderer2D: particleSystem.render threw', err);
    }
  }
}

export default ParticleRenderer2D;
