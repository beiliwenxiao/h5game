/**
 * fetch 适配
 *
 * 引擎中 fetch 分两种用途：
 *   1. 加载本地 JSON（game.project.json、场景文件等）→ 用 wx.getFileSystemManager 读本地文件
 *   2. 网络请求（CDN 资源、远程配置）→ 用 wx.request
 *
 * 判断规则：以 http:// 或 https:// 开头走网络，否则走本地文件系统。
 * 本地路径相对于小游戏根目录（即 weapp/ 下）。
 */

const fs = wx.getFileSystemManager();

/**
 * 简化版 Response 模拟（只覆盖引擎实际用到的 .ok / .json() / .text()）
 */
class WxResponse {
  constructor(data, ok = true, status = 200) {
    this._data = data;
    this.ok = ok;
    this.status = status;
    this.statusText = ok ? 'OK' : 'Not Found';
  }
  json() {
    if (typeof this._data === 'object') return Promise.resolve(this._data);
    try { return Promise.resolve(JSON.parse(this._data)); }
    catch (e) { return Promise.reject(new Error('JSON 解析失败: ' + e.message)); }
  }
  text() {
    if (typeof this._data === 'string') return Promise.resolve(this._data);
    return Promise.resolve(JSON.stringify(this._data));
  }
  arrayBuffer() {
    return Promise.resolve(this._data);
  }
}

/**
 * 本地文件加载
 */
function fetchLocal(path) {
  return new Promise((resolve) => {
    try {
      // 读文件（UTF-8 字符串）
      const data = fs.readFileSync(path, 'utf-8');
      resolve(new WxResponse(data, true, 200));
    } catch (e) {
      // 文件不存在或读取失败
      resolve(new WxResponse(null, false, 404));
    }
  });
}

/**
 * 网络请求
 */
function fetchNetwork(url, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: (options.method || 'GET').toUpperCase(),
      data: options.body || undefined,
      header: options.headers || {},
      responseType: 'text',
      success(res) {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        resolve(new WxResponse(res.data, ok, res.statusCode));
      },
      fail(err) {
        reject(new Error(`网络请求失败: ${url} - ${err.errMsg || err}`));
      }
    });
  });
}

/**
 * 判断是否为网络 URL
 */
function isNetworkUrl(url) {
  return /^https?:\/\//i.test(url);
}

/**
 * 全局 fetch shim
 */
function wxFetch(url, options) {
  if (isNetworkUrl(url)) {
    return fetchNetwork(url, options);
  }
  return fetchLocal(url);
}

export function shimFetch(_global) {
  if (!_global.fetch) {
    _global.fetch = wxFetch;
  }
  // XMLHttpRequest 极简 shim（部分第三方库可能用到）
  if (!_global.XMLHttpRequest) {
    _global.XMLHttpRequest = class XMLHttpRequest {
      open() {}
      send() {}
      setRequestHeader() {}
      addEventListener() {}
    };
  }
}
