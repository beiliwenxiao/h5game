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
    this._currentHintTitle = '提示';
    this._screenRequest = null;
    this._screenQueue = [];
    this._screenVisible = false;
    this._screenSequence = 0;
    this._disposed = false;
  }

  showScreen(text, opts = {}) {
    if (this._disposed) return false;
    const request = this._createScreenRequest(text, opts);
    const current = this._screenRequest;
    if (!current) return this._presentScreen(request);
    if (current.owner === request.owner && request.owner !== null) {
      return this._presentScreen(request);
    }
    if (request.priority > current.priority) {
      this._enqueueScreen(current);
      return this._presentScreen(request);
    }
    this._enqueueScreen(request);
    return true;
  }

  hideScreen(owner = null) {
    const current = this._screenRequest;
    if (!current) return false;
    if (owner === null ? current.owner !== null : current.owner !== owner) return false;
    this._clearScreenTimer();
    this._screenRequest = null;
    this._screenVisible = false;
    this._notifyScreenHidden(current);
    if (!this._screenRequest && !this._presentNextScreen()) this._restoreHintOrHide();
    return true;
  }

  setCallbacks(showCallback, hideCallback) {
    this._showCallback = showCallback;
    this._hideCallback = hideCallback;
    return this;
  }

  showHint(text, title = '提示') {
    if (this._disposed) return false;
    const resolved = this.formatHtml(text);
    if (this._currentHintText === resolved && this._currentHintTitle === title) return false;
    this._currentHintText = resolved;
    this._currentHintTitle = title;
    if (!this._screenVisible) this._showCallback?.(resolved, title);
    return true;
  }

  hideHint() {
    if (this._currentHintText === null) return false;
    this._currentHintText = null;
    this._currentHintTitle = '提示';
    if (!this._screenVisible) this._hideCallback?.();
    return true;
  }

  dispose() {
    if (this._disposed) return false;
    this._clearScreenTimer();
    this._screenRequest = null;
    this._screenQueue.length = 0;
    this._screenVisible = false;
    this._currentHintText = null;
    this._currentHintTitle = '提示';
    this._hideRenderedScreen();
    this._disposed = true;
    this._showCallback = null;
    this._hideCallback = null;
    return true;
  }

  _createScreenRequest(text, opts) {
    const owner = opts.owner ?? null;
    return {
      text: this.formatHtml(text),
      title: opts.title || '提示',
      owner,
      persist: opts.persist === true,
      priority: owner === 'tutorial' ? 1 : 0,
      onHidden: typeof opts.onHidden === 'function' ? opts.onHidden : null,
      sequence: ++this._screenSequence
    };
  }

  _presentScreen(request) {
    this._clearScreenTimer();
    this._screenRequest = request;
    this._screenVisible = true;
    if (typeof this.window?.__ddShowTips === 'function') {
      this.window.__ddShowTips(request.title, request.text);
      if (!request.persist) this._scheduleScreenHide(3500, request.owner);
      return true;
    }
    const element = this._getFallback(true);
    if (!element) {
      this._screenRequest = null;
      this._screenVisible = false;
      return false;
    }
    element.textContent = request.text;
    element.style.opacity = '1';
    if (!request.persist) this._scheduleScreenHide(2500, request.owner);
    return true;
  }

  _enqueueScreen(request) {
    const existingIndex = this._screenQueue.findIndex(entry =>
      entry.owner === request.owner && entry.title === request.title && entry.text === request.text
    );
    if (existingIndex >= 0) return;
    const sameOwnerIndex = request.owner === null ? -1 : this._screenQueue
      .findIndex(entry => entry.owner === request.owner);
    if (sameOwnerIndex >= 0) {
      request.sequence = this._screenQueue[sameOwnerIndex].sequence;
      this._screenQueue[sameOwnerIndex] = request;
      return;
    }
    if (this._screenQueue.length >= 24) {
      const discardIndex = this._screenQueue.findIndex(entry => entry.priority === 0);
      this._screenQueue.splice(discardIndex >= 0 ? discardIndex : 0, 1);
    }
    this._screenQueue.push(request);
  }

  _presentNextScreen() {
    if (this._screenQueue.length === 0) return false;
    this._screenQueue.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
    const next = this._screenQueue.shift();
    return this._presentScreen(next);
  }

  _restoreHintOrHide() {
    if (this._currentHintText !== null && this._showCallback) {
      this._showCallback(this._currentHintText, this._currentHintTitle);
    } else {
      this._hideRenderedScreen();
    }
  }

  _hideRenderedScreen() {
    const element = this._getFallback(false);
    if (element) element.style.opacity = '0';
    if (typeof this.window?.__ddHideTips === 'function') this.window.__ddHideTips();
    else this._hideCallback?.();
  }

  _notifyScreenHidden(request) {
    if (this._disposed || typeof request?.onHidden !== 'function') return;
    try {
      request.onHidden({
        owner: request.owner,
        title: request.title,
        text: request.text,
        sequence: request.sequence
      });
    } catch (error) {
      console.warn('[SceneHintPresenter] screen onHidden callback failed', error);
    }
  }

  _scheduleScreenHide(delay, owner) {
    this._screenTimer = this.resourceScope.setTimeout(() => {
      this._screenTimer = null;
      this.hideScreen(owner);
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