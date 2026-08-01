/**
 * Audio 适配
 *
 * 小游戏用 wx.createInnerAudioContext() 替代 new Audio()。
 * 提供 play/pause/src/loop 等基本属性兼容。
 */

class WxAudio {
  constructor(src) {
    this._ctx = wx.createInnerAudioContext();
    this._ctx.autoplay = false;
    if (src) this._ctx.src = src;

    // 回调桩
    this.onended = null;
    this.onerror = null;
    this.oncanplay = null;

    this._ctx.onEnded(() => { if (this.onended) this.onended(); });
    this._ctx.onError((err) => { if (this.onerror) this.onerror(err); });
    this._ctx.onCanplay(() => { if (this.oncanplay) this.oncanplay(); });
  }

  get src() { return this._ctx.src; }
  set src(v) { this._ctx.src = v; }

  get loop() { return this._ctx.loop; }
  set loop(v) { this._ctx.loop = v; }

  get volume() { return this._ctx.volume; }
  set volume(v) { this._ctx.volume = Math.max(0, Math.min(1, v)); }

  get currentTime() { return this._ctx.currentTime; }
  set currentTime(v) { this._ctx.seek(v); }

  get paused() { return this._ctx.paused; }
  get duration() { return this._ctx.duration; }

  play() { this._ctx.play(); return Promise.resolve(); }
  pause() { this._ctx.pause(); }
  stop() { this._ctx.stop(); }

  addEventListener(evt, fn) {
    if (evt === 'ended') this.onended = fn;
    else if (evt === 'error') this.onerror = fn;
    else if (evt === 'canplay' || evt === 'canplaythrough') this.oncanplay = fn;
  }
  removeEventListener() { /* 简化处理 */ }

  // 释放资源
  destroy() { this._ctx.destroy(); }
}

export function shimAudio(_global) {
  if (!_global.Audio) {
    _global.Audio = WxAudio;
  }
  if (!_global.HTMLAudioElement) {
    _global.HTMLAudioElement = WxAudio;
  }
}
