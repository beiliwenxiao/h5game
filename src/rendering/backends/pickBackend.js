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
 * pickBackend.js
 * 根据 BackendConfig 选择并构造具体渲染后端实例
 *
 * 阶段 A：ThreeBackend 尚未实现，'3d' / 'auto' 统一落到 Canvas2DBackend。
 * M5 之后会动态 import three 并使用 ThreeBackend。
 */

import { Canvas2DBackend } from './Canvas2DBackend.js';

/**
 * 是否具备 WebGL
 */
export function hasWebGL() {
  try {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * 选择后端实例
 * @param {import('./BackendConfig.js').DEFAULT_BACKEND_CONFIG} config
 * @returns {import('./IRenderBackend.js').IRenderBackend}
 */
export async function pickBackend(config) {
  const mode = config?.mode ?? 'auto';
  if (mode === '2d') return new Canvas2DBackend();
  if (mode === '3d') {
    const ThreeBackendCtor = await tryLoadThreeBackend();
    if (ThreeBackendCtor) return new ThreeBackendCtor();
    console.warn('[pickBackend] ThreeBackend unavailable, fallback to Canvas2D');
    return new Canvas2DBackend();
  }
  // auto
  if (hasWebGL()) {
    const ThreeBackendCtor = await tryLoadThreeBackend();
    if (ThreeBackendCtor) return new ThreeBackendCtor();
  }
  return new Canvas2DBackend();
}

async function tryLoadThreeBackend() {
  try {
    const mod = await import('./ThreeBackend.js');
    return mod.ThreeBackend ?? mod.default ?? null;
  } catch (err) {
    // 阶段 A 预期失败（尚未实现）
    return null;
  }
}

export default pickBackend;
