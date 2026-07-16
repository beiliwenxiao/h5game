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
 * PlatformProfile - 平台判定中心（框架级）
 *
 * 统一判定当前运行平台（desktop / mobile），收敛散落各处的
 * `ontouchstart` / `maxTouchPoints` 触屏判断。
 *
 * UI 策略、文案选择等所有"按平台分两套"的逻辑都应以此为唯一依据。
 *
 * 支持通过 URL 查询参数覆盖，便于桌面浏览器调试移动端：
 *   index.html?platform=mobile  或  ?platform=desktop
 */

function detectPlatform() {
  if (typeof window === 'undefined') return 'desktop';

  // URL 覆盖（调试用）
  try {
    const p = new URLSearchParams(window.location.search).get('platform');
    if (p === 'mobile' || p === 'desktop') return p;
  } catch (e) {
    // 忽略
  }

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  return isTouch ? 'mobile' : 'desktop';
}

let _platform = detectPlatform();

export const PlatformProfile = {
  /** 当前平台：'desktop' | 'mobile' */
  get platform() {
    return _platform;
  },

  get isMobile() {
    return _platform === 'mobile';
  },

  get isDesktop() {
    return _platform === 'desktop';
  },

  /**
   * 手动设置平台（测试 / 强制指定）
   * @param {'desktop'|'mobile'} platform
   */
  set(platform) {
    if (platform === 'mobile' || platform === 'desktop') {
      _platform = platform;
    }
  },

  /** 重新检测（环境变化后调用） */
  redetect() {
    _platform = detectPlatform();
    return _platform;
  }
};

export default PlatformProfile;
