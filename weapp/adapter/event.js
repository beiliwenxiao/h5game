/**
 * 触摸事件适配
 *
 * 小游戏触摸事件是全局的（wx.onTouchStart 等），不绑定在 canvas 上。
 * 这里把 wx 触摸事件转发为标准 DOM TouchEvent 格式，挂到主画布的 addEventListener。
 *
 * 键盘事件在小游戏中不存在（无物理键盘），window.addEventListener('keydown') 只做空桩。
 */

const _listeners = {
  touchstart: [],
  touchmove: [],
  touchend: [],
  touchcancel: []
};

// window 级事件注册表（keydown/keyup/resize 等）
const _windowListeners = {};

/**
 * 把 wx touch 对象转为类 DOM Touch 格式
 */
function convertTouches(wxTouches, canvas) {
  return (wxTouches || []).map(t => ({
    identifier: t.identifier,
    clientX: t.clientX,
    clientY: t.clientY,
    pageX: t.clientX,
    pageY: t.clientY,
    // 小游戏坐标已经是 canvas 像素坐标（无需 getBoundingClientRect 换算）
    screenX: t.clientX,
    screenY: t.clientY
  }));
}

function makeTouchEvent(type, wxEvent, canvas) {
  const touches = convertTouches(wxEvent.touches, canvas);
  const changedTouches = convertTouches(wxEvent.changedTouches, canvas);
  return {
    type,
    touches,
    changedTouches,
    target: canvas,
    currentTarget: canvas,
    preventDefault() {},
    stopPropagation() {},
    timeStamp: wxEvent.timeStamp || Date.now()
  };
}

export function shimEvent(_global, mainCanvas) {
  // canvas.addEventListener / removeEventListener
  const canvasAddEventListener = mainCanvas.addEventListener;
  mainCanvas.addEventListener = function (type, fn, options) {
    if (_listeners[type]) {
      _listeners[type].push(fn);
    }
    // 保留原生绑定（某些小游戏基础库版本 canvas 自己支持 addEventListener）
    if (canvasAddEventListener) {
      try { canvasAddEventListener.call(mainCanvas, type, fn, options); } catch (e) { /* ignore */ }
    }
  };
  mainCanvas.removeEventListener = function (type, fn) {
    if (_listeners[type]) {
      const i = _listeners[type].indexOf(fn);
      if (i !== -1) _listeners[type].splice(i, 1);
    }
  };

  // canvas.getBoundingClientRect（小游戏坐标已经是像素坐标，左上角为 0,0）
  mainCanvas.getBoundingClientRect = function () {
    const info = wx.getSystemInfoSync();
    return {
      left: 0, top: 0, right: info.windowWidth, bottom: info.windowHeight,
      width: info.windowWidth, height: info.windowHeight, x: 0, y: 0
    };
  };

  // 全局触摸事件 → 转发到 canvas listeners
  wx.onTouchStart(e => {
    const evt = makeTouchEvent('touchstart', e, mainCanvas);
    for (const fn of _listeners.touchstart) { try { fn(evt); } catch (err) { console.error(err); } }
  });
  wx.onTouchMove(e => {
    const evt = makeTouchEvent('touchmove', e, mainCanvas);
    for (const fn of _listeners.touchmove) { try { fn(evt); } catch (err) { console.error(err); } }
  });
  wx.onTouchEnd(e => {
    const evt = makeTouchEvent('touchend', e, mainCanvas);
    for (const fn of _listeners.touchend) { try { fn(evt); } catch (err) { console.error(err); } }
  });
  wx.onTouchCancel(e => {
    const evt = makeTouchEvent('touchcancel', e, mainCanvas);
    for (const fn of _listeners.touchcancel) { try { fn(evt); } catch (err) { console.error(err); } }
  });

  // window shim
  if (!_global.window) _global.window = _global;

  _global.window.addEventListener = function (type, fn) {
    if (!_windowListeners[type]) _windowListeners[type] = [];
    _windowListeners[type].push(fn);
  };
  _global.window.removeEventListener = function (type, fn) {
    if (!_windowListeners[type]) return;
    const i = _windowListeners[type].indexOf(fn);
    if (i !== -1) _windowListeners[type].splice(i, 1);
  };
  _global.window.dispatchEvent = function (evt) {
    const type = evt && evt.type;
    if (!type || !_windowListeners[type]) return;
    for (const fn of _windowListeners[type]) { try { fn(evt); } catch (e) { console.error(e); } }
  };

  // contextmenu 阻止（小游戏无右键菜单）
  mainCanvas.addEventListener('contextmenu', (e) => e.preventDefault && e.preventDefault());

  // innerWidth/innerHeight
  const sysInfo = wx.getSystemInfoSync();
  _global.window.innerWidth = sysInfo.windowWidth;
  _global.window.innerHeight = sysInfo.windowHeight;
  _global.window.devicePixelRatio = sysInfo.pixelRatio || 1;

  // screen
  _global.screen = _global.screen || {
    width: sysInfo.screenWidth,
    height: sysInfo.screenHeight,
    availWidth: sysInfo.windowWidth,
    availHeight: sysInfo.windowHeight
  };
}
