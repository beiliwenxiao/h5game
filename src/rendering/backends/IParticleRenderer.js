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
 * IParticleRenderer.js
 * 粒子渲染器接口
 *
 * ParticleSystem 负责数据（生命周期、物理）；
 * 具体绘制由 IParticleRenderer 的实现完成。
 */

export class IParticleRenderer {
  /**
   * 渲染所有活跃粒子
   * @param {*} particleSystem - ParticleSystem 实例
   * @param {import('./ICameraAdapter.js').ICameraAdapter} camera
   */
  // eslint-disable-next-line no-unused-vars
  render(particleSystem, camera) {}

  /**
   * （可选）批量上传粒子数据（3D 实现使用）
   * @param {*} particleSystem
   */
  // eslint-disable-next-line no-unused-vars
  upload(particleSystem) {}

  dispose() {}
}

export default IParticleRenderer;
