/**
 * 杂项全局对象适配
 *
 * 补齐引擎代码中零散引用的浏览器全局变量，保证不崩溃。
 */

export function shimMisc(_global) {
  // navigator
  if (!_global.navigator) {
    const sys = wx.getSystemInfoSync();
    _global.navigator = {
      userAgent: `WeChat/${sys.version} MiniGame/${sys.SDKVersion} ${sys.system}`,
      language: sys.language || 'zh-CN',
      platform: sys.platform || 'wechat',
      maxTouchPoints: 10,
      // Gamepad API 不存在（GamepadManager.isSupported() 据此降级）
      getGamepads: undefined
    };
  }

  // location（部分引擎代码读 URL 参数）
  if (!_global.location) {
    _global.location = {
      href: '',
      search: '',
      hash: '',
      protocol: 'https:',
      host: '',
      pathname: '/'
    };
  }

  // URL（部分第三方库用到）
  if (!_global.URL) {
    _global.URL = class URL {
      constructor(url) { this.href = url; this.searchParams = new Map(); }
    };
  }

  // requestAnimationFrame / cancelAnimationFrame
  // 小游戏全局已有（canvas.requestAnimationFrame），但全局变量可能不在 GameGlobal 上
  if (!_global.requestAnimationFrame) {
    _global.requestAnimationFrame = (cb) => {
      // 优先用 canvas 的 raf，否则 setTimeout 16ms 兜底
      if (typeof canvas !== 'undefined' && canvas.requestAnimationFrame) {
        return canvas.requestAnimationFrame(cb);
      }
      return setTimeout(cb, 16);
    };
  }
  if (!_global.cancelAnimationFrame) {
    _global.cancelAnimationFrame = (id) => {
      if (typeof canvas !== 'undefined' && canvas.cancelAnimationFrame) {
        return canvas.cancelAnimationFrame(id);
      }
      clearTimeout(id);
    };
  }

  // setTimeout / setInterval（小游戏全局已有，保险检查）
  if (!_global.setTimeout) _global.setTimeout = setTimeout;
  if (!_global.setInterval) _global.setInterval = setInterval;
  if (!_global.clearTimeout) _global.clearTimeout = clearTimeout;
  if (!_global.clearInterval) _global.clearInterval = clearInterval;

  // console（小游戏全局已有）
  if (!_global.console) _global.console = console;

  // Event 构造函数（window.dispatchEvent 用）
  if (!_global.Event) {
    _global.Event = class Event {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = !!options.bubbles;
        this.cancelable = !!options.cancelable;
      }
      preventDefault() {}
      stopPropagation() {}
    };
  }

  // self（部分第三方 polyfill 引用）
  if (!_global.self) _global.self = _global;

  // 全局错误捕获
  wx.onError((msg) => {
    console.error('[WeApp] 全局错误:', msg);
  });

  // 内存警告
  wx.onMemoryWarning((res) => {
    console.warn('[WeApp] 内存警告, level:', res.level);
  });
}
