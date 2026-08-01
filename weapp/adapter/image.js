/**
 * Image 适配
 *
 * 小游戏用 wx.createImage() 替代 new Image()。
 * 支持 onload/onerror 回调和 src 赋值加载。
 */

export function shimImage(_global) {
  if (!_global.Image) {
    _global.Image = function WxImage() {
      return wx.createImage();
    };
  }

  // 部分引擎代码用 HTMLImageElement
  if (!_global.HTMLImageElement) {
    _global.HTMLImageElement = _global.Image;
  }
}
