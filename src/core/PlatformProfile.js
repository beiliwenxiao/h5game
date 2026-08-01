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
 * 两个互相独立的维度：
 *
 *   platform  交互形态：desktop / mobile
 *             决定 UI 策略、文案、按键提示
 *
 *   host      运行宿主：web / electron / capacitor / weapp
 *             决定可用的平台 API 与渲染后端默认值
 *
 * 例如 Android 的 Capacitor 包是 `platform=mobile, host=capacitor`，
 * 桌面浏览器调试移动端布局是 `platform=mobile, host=web`。
 *
 * 支持通过 URL 查询参数覆盖，便于桌面浏览器调试移动端：
 *   index.html?platform=mobile  或  ?platform=desktop
 */

/** 运行宿主 */
export const RuntimeHost = {
  WEB: 'web',              // 普通浏览器
  ELECTRON: 'electron',    // PC 桌面套壳
  CAPACITOR: 'capacitor',  // Android / iOS 套壳
  WEAPP: 'weapp'           // 微信小游戏
};

/**
 * 检测运行宿主。
 *
 * 判定顺序有讲究：微信小游戏没有 window，必须先判；
 * Capacitor 与 Electron 都有 window，需靠各自注入的全局对象区分。
 */
function detectHost() {
  // 微信小游戏：有 wx 且提供 createCanvas，但没有 DOM
  if (typeof wx !== 'undefined' && typeof wx.createCanvas === 'function') {
    return RuntimeHost.WEAPP;
  }

  if (typeof window === 'undefined') return RuntimeHost.WEB;

  // Electron：主进程注入 process.versions.electron，UA 中也含 Electron
  const hasElectronProcess = typeof window.process !== 'undefined'
    && window.process.versions
    && !!window.process.versions.electron;
  const uaHasElectron = typeof navigator !== 'undefined'
    && typeof navigator.userAgent === 'string'
    && navigator.userAgent.includes('Electron');
  if (hasElectronProcess || uaHasElectron) return RuntimeHost.ELECTRON;

  // Capacitor：运行时注入 window.Capacitor
  if (window.Capacitor) return RuntimeHost.CAPACITOR;

  return RuntimeHost.WEB;
}

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
let _host = detectHost();

export const PlatformProfile = {
  /** 当前交互形态：'desktop' | 'mobile' */
  get platform() {
    return _platform;
  },

  get isMobile() {
    return _platform === 'mobile';
  },

  get isDesktop() {
    return _platform === 'desktop';
  },

  /** 当前运行宿主：'web' | 'electron' | 'capacitor' | 'weapp' */
  get host() {
    return _host;
  },

  get isWeb() {
    return _host === RuntimeHost.WEB;
  },

  get isElectron() {
    return _host === RuntimeHost.ELECTRON;
  },

  get isCapacitor() {
    return _host === RuntimeHost.CAPACITOR;
  },

  get isWeapp() {
    return _host === RuntimeHost.WEAPP;
  },

  /** 是否具备 DOM（微信小游戏没有） */
  get hasDOM() {
    return _host !== RuntimeHost.WEAPP && typeof document !== 'undefined';
  },

  /**
   * 手动设置交互形态（测试 / 强制指定）
   * @param {'desktop'|'mobile'} platform
   */
  set(platform) {
    if (platform === 'mobile' || platform === 'desktop') {
      _platform = platform;
    }
  },

  /**
   * 手动设置运行宿主（测试 / 构建时指定）
   * @param {'web'|'electron'|'capacitor'|'weapp'} host
   */
  setHost(host) {
    if (Object.values(RuntimeHost).includes(host)) {
      _host = host;
    }
  },

  /** 重新检测（环境变化后调用） */
  redetect() {
    _platform = detectPlatform();
    _host = detectHost();
    return { platform: _platform, host: _host };
  }
};

export default PlatformProfile;
