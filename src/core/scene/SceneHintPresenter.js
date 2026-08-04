/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/** 统一拥有场景屏幕提示与回调提示。 */
export class SceneHintPresenter {
  constructor({
    resourceScope,
    InputHints,
    formatHtml,
    window: windowObject = globalThis.window,
    document: documentObject = globalThis.document
  } = {}) {
    if (!resourceScope) throw new TypeError('SceneHintPresenter requires resourceScope');
    const formatter = formatHtml || InputHints?.formatHtml?.bind(InputHints);
    if (typeof formatter !== 'function') {
      throw new TypeError('SceneHintPresenter requires InputHints or formatHtml');
    }
    this.resourceScope = resourceScope;
    this.formatHtml = formatter;
    this.window = windowObject;
    this.document = documentObject;
    this._screenTimer = null;
    this._showCallback = null;
    this._hideCallback = null;
    this._currentHintText = null;
    this._disposed = false;
  }

  showScreen(text, opts = {}) {
    if (this._disposed) return false;
    const resolved = this.formatHtml(text);
    const title = opts.title || '提示';
    this._clearScreenTimer();

    if (typeof this.window?.__ddShowTips === 'function') {
      this.window.__ddShowTips(title, resolved);
      if (!opts.persist) this._scheduleScreenHide(3500);
      return true;
    }

    const element = this._getFallback(true);
    if (!element) return false;
    element.textContent = resolved;
    element.style.opacity = '1';
    if (!opts.persist) this._scheduleScreenHide(2500);
    return true;
  }

  hideScreen() {
    this._clearScreenTimer();
    if (typeof this.window?.__ddHideTips === 'function') this.window.__ddHideTips();
    const element = this._getFallback(false);
    if (element) element.style.opacity = '0';
  }

  setCallbacks(showCallback, hideCallback) {
    this._showCallback = showCallback;
    this._hideCallback = hideCallback;
    return this;
  }

  showHint(text, title = '提示') {
    if (this._disposed) return false;
    const resolved = this.formatHtml(text);
    if (this._currentHintText === resolved) return false;
    this._currentHintText = resolved;
    this._showCallback?.(resolved, title);
    return true;
  }

  hideHint() {
    if (this._currentHintText === null) return false;
    this._currentHintText = null;
    this._hideCallback?.();
    return true;
  }

  dispose() {
    if (this._disposed) return false;
    this.hideScreen();
    this._disposed = true;
    this._showCallback = null;
    this._hideCallback = null;
    this._currentHintText = null;
    return true;
  }

  _scheduleScreenHide(delay) {
    this._screenTimer = this.resourceScope.setTimeout(() => {
      this._screenTimer = null;
      this.hideScreen();
    }, delay);
  }

  _clearScreenTimer() {
    if (this._screenTimer !== null) {
      this.resourceScope.clearTimeout(this._screenTimer);
      this._screenTimer = null;
    }
  }

  _getFallback(create) {
    if (!this.document) return null;
    let element = this.document.getElementById('dd-trigger-tip');
    if (!element && create && this.document.body) {
      element = this.document.createElement('div');
      element.id = 'dd-trigger-tip';
      element.style.cssText = 'position:fixed;top:22%;left:50%;transform:translateX(-50%);' +
        'background:rgba(0,0,0,0.82);color:#fff;padding:14px 28px;border-radius:8px;' +
        'font-size:18px;z-index:99999;pointer-events:none;transition:opacity 0.3s;';
      this.document.body.appendChild(element);
    }
    return element;
  }
}

export default SceneHintPresenter;