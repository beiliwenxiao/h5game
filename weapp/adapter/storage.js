/**
 * localStorage 适配
 *
 * 小游戏用 wx.getStorageSync / wx.setStorageSync 替代 localStorage。
 * 小游戏存储上限 10MB（单个 key 上限 1MB），与浏览器 5~10MB 类似。
 */

const wxStorage = {
  getItem(key) {
    try { return wx.getStorageSync(key) || null; } catch (e) { return null; }
  },
  setItem(key, value) {
    try { wx.setStorageSync(key, value); } catch (e) { console.warn('[WeApp Storage] setItem 失败:', key, e); }
  },
  removeItem(key) {
    try { wx.removeStorageSync(key); } catch (e) { /* ignore */ }
  },
  clear() {
    try { wx.clearStorageSync(); } catch (e) { /* ignore */ }
  },
  get length() {
    try { const info = wx.getStorageInfoSync(); return info.keys.length; } catch (e) { return 0; }
  },
  key(index) {
    try { const info = wx.getStorageInfoSync(); return info.keys[index] || null; } catch (e) { return null; }
  }
};

export function shimStorage(_global) {
  if (!_global.localStorage) {
    _global.localStorage = wxStorage;
  }
}
