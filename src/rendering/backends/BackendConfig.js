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
 * BackendConfig.js
 * 渲染后端配置与 URL 参数解析
 */

import { PlatformProfile } from '../../core/PlatformProfile.js';

/**
 * 默认后端配置
 */
export const DEFAULT_BACKEND_CONFIG = Object.freeze({
  mode: 'auto',           // '2d' | '3d' | 'auto'
  debug: false,
  hud: 'auto',            // 'main' | 'overlay' | 'auto'
  three: {
    camera: 'ortho',      // 'ortho' | 'perspective'
    pitchDeg: 30,
    yawDeg: 45,
    shadows: false
  },
  layers: {
    order: ['ground', 'decal', 'entity', 'aerial', 'effect'],
    crossFloorAlpha: 0.2
  }
});

const VALID_MODES = ['2d', '3d', 'auto'];
const VALID_HUD = ['main', 'overlay', 'auto'];
const VALID_CAMERA = ['ortho', 'perspective'];

/**
 * 按运行宿主的后端默认值。
 *
 * 决策依据：three.js 只在 PC 端作为发布特性，其余端默认走 Canvas2D。
 *   electron   PC 自带 Chromium，允许 auto 选到 3D
 *   web        保持 auto，便于浏览器调试两种后端
 *   capacitor  Android WebView 虽有 WebGL，但中低端机性能不确定，默认 2D
 *   weapp      微信小游戏包体敏感且无 DOM，固定 2D
 *
 * 这里只改变默认值，显式传入的 userConfig 与 URL 参数仍可覆盖；
 * 小游戏构建会把 ThreeBackend 替换为桩，即使被显式指定也会安全回退。
 */
export const HOST_BACKEND_DEFAULTS = Object.freeze({
  electron: { mode: 'auto' },
  web: { mode: 'auto' },
  capacitor: { mode: '2d' },
  weapp: { mode: '2d' }
});

/**
 * 获取指定宿主的后端默认配置
 * @param {string} [host] - 'web' | 'electron' | 'capacitor' | 'weapp'
 * @returns {Object} 默认配置片段
 */
export function getHostBackendDefaults(host) {
  if (!host) return {};
  return HOST_BACKEND_DEFAULTS[host] ? { ...HOST_BACKEND_DEFAULTS[host] } : {};
}

/**
 * 深拷贝配置对象
 * @param {Object} obj
 */
function cloneConfig(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cloneConfig);
  const out = {};
  for (const key of Object.keys(obj)) {
    out[key] = cloneConfig(obj[key]);
  }
  return out;
}

/**
 * 深度合并（右覆盖左）
 * @param {Object} base
 * @param {Object} override
 */
function deepMerge(base, override) {
  if (!override) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (ov === undefined) continue;
    if (
      bv &&
      typeof bv === 'object' &&
      !Array.isArray(bv) &&
      ov &&
      typeof ov === 'object' &&
      !Array.isArray(ov)
    ) {
      out[key] = deepMerge(bv, ov);
    } else {
      out[key] = ov;
    }
  }
  return out;
}

/**
 * 从 URL 查询字符串解析部分配置
 * @param {string|URLSearchParams} [search]
 * @returns {Partial<typeof DEFAULT_BACKEND_CONFIG>}
 */
export function parseUrlParams(search) {
  let params;
  if (search instanceof URLSearchParams) {
    params = search;
  } else if (typeof search === 'string') {
    // 兼容 "?mode=3d" 或 "mode=3d"
    const q = search.startsWith('?') ? search.slice(1) : search;
    params = new URLSearchParams(q);
  } else if (typeof window !== 'undefined' && window.location) {
    params = new URLSearchParams(window.location.search);
  } else {
    return {};
  }

  const out = {};

  const mode = params.get('mode');
  if (mode && VALID_MODES.includes(mode)) {
    out.mode = mode;
  }

  const debug = params.get('debug');
  if (debug !== null) {
    out.debug = debug === '1' || debug === 'true';
  }

  const hud = params.get('hud');
  if (hud && VALID_HUD.includes(hud)) {
    out.hud = hud;
  }

  const camera = params.get('camera');
  if (camera && VALID_CAMERA.includes(camera)) {
    out.three = { ...(out.three || {}), camera };
  }

  const pitch = params.get('pitch');
  if (pitch !== null && !Number.isNaN(Number(pitch))) {
    out.three = { ...(out.three || {}), pitchDeg: Number(pitch) };
  }

  const yaw = params.get('yaw');
  if (yaw !== null && !Number.isNaN(Number(yaw))) {
    out.three = { ...(out.three || {}), yawDeg: Number(yaw) };
  }

  return out;
}

/**
 * 合并默认配置 + 宿主默认值 + 代码配置 + URL 参数 → 最终 BackendConfig
 *
 * 优先级（从低到高）：
 *   DEFAULT_BACKEND_CONFIG < 宿主默认值 < userConfig < URL 参数
 *
 * 宿主默认值放在 userConfig 之下，因此项目仍可显式指定 mode；
 * URL 参数最高，保证浏览器调试不受限制。
 *
 * @param {Object} [userConfig]
 * @param {string|URLSearchParams} [urlSearch]
 * @param {Object} [options]
 * @param {string} [options.host] - 运行宿主；不传时自动检测
 * @returns {typeof DEFAULT_BACKEND_CONFIG}
 */
export function parseBackendConfig(userConfig = {}, urlSearch, options = {}) {
  const base = cloneConfig(DEFAULT_BACKEND_CONFIG);

  const host = options.host !== undefined ? options.host : PlatformProfile.host;
  const withHost = deepMerge(base, sanitize(getHostBackendDefaults(host)));

  const sanitizedUser = sanitize(userConfig);
  const withUser = deepMerge(withHost, sanitizedUser);

  const urlOverride = parseUrlParams(urlSearch);
  return {
    ...deepMerge(withUser, urlOverride),
    // 固定本次解析所使用的宿主，后端选择不得再次读取可能变化的全局 PlatformProfile。
    host
  };
}

/**
 * 非法值兜底：只保留合法字段
 * @param {Object} cfg
 */
function sanitize(cfg) {
  if (!cfg || typeof cfg !== 'object') return {};
  const out = {};
  if (VALID_MODES.includes(cfg.mode)) out.mode = cfg.mode;
  if (typeof cfg.debug === 'boolean') out.debug = cfg.debug;
  if (VALID_HUD.includes(cfg.hud)) out.hud = cfg.hud;
  if (cfg.three && typeof cfg.three === 'object') {
    const three = {};
    if (VALID_CAMERA.includes(cfg.three.camera)) three.camera = cfg.three.camera;
    if (typeof cfg.three.pitchDeg === 'number') three.pitchDeg = cfg.three.pitchDeg;
    if (typeof cfg.three.yawDeg === 'number') three.yawDeg = cfg.three.yawDeg;
    if (typeof cfg.three.shadows === 'boolean') three.shadows = cfg.three.shadows;
    if (Object.keys(three).length) out.three = three;
  }
  if (cfg.layers && typeof cfg.layers === 'object') {
    const layers = {};
    if (Array.isArray(cfg.layers.order) && cfg.layers.order.length) {
      layers.order = cfg.layers.order.slice();
    }
    if (typeof cfg.layers.crossFloorAlpha === 'number') {
      layers.crossFloorAlpha = cfg.layers.crossFloorAlpha;
    }
    if (Object.keys(layers).length) out.layers = layers;
  }
  return out;
}

export default {
  DEFAULT_BACKEND_CONFIG,
  HOST_BACKEND_DEFAULTS,
  parseBackendConfig,
  parseUrlParams,
  getHostBackendDefaults
};
