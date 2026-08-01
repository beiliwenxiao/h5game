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
 * three.js 通过动态 import 加载，因此只在真正选择 3D 时才拉取对应 chunk，
 * 主包不含 three。小游戏等不支持的宿主直接跳过加载，避免无谓的失败尝试。
 */

import { Canvas2DBackend } from './Canvas2DBackend.js';
import { PlatformProfile, RuntimeHost } from '../../core/PlatformProfile.js';

/** 不支持 three.js 的运行宿主 */
const HOSTS_WITHOUT_THREE = [RuntimeHost.WEAPP];

/**
 * 当前宿主是否允许加载 3D 后端
 * @param {string} [host]
 * @returns {boolean}
 */
export function supportsThreeBackend(host) {
  const target = host !== undefined ? host : PlatformProfile.host;
  return !HOSTS_WITHOUT_THREE.includes(target);
}

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

  // 宿主不支持 3D 时直接用 2D，不尝试加载 three chunk
  if (!supportsThreeBackend(config?.host)) {
    if (mode === '3d') {
      console.warn('[pickBackend] 当前宿主不支持 3D 后端，已回退 Canvas2D');
    }
    return new Canvas2DBackend();
  }

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
