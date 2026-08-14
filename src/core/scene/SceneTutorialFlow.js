/**
 * 配置化的有序教程流程。场景只发送语义信号，不实现步骤推进逻辑。
 */
export class SceneTutorialFlow {
  constructor(config = {}) {
    if (!config.tutorialSystem) {
      throw new TypeError('SceneTutorialFlow requires tutorialSystem');
    }
    this.tutorialSystem = config.tutorialSystem;
    this.activeWhen = config.activeWhen || (() => true);
    this.presenter = config.presenter || null;
    this.scheduler = config.scheduler || (callback => setTimeout(callback, 0));
    this.order = [];
    this.rules = [];
    this.movementOrigin = null;
    this._presentationBound = false;
  }

  configure(config = {}) {
    const definitions = Array.isArray(config.definitions) ? config.definitions : [];
    const overrides = new Map((Array.isArray(config.overrides) ? config.overrides : [])
      .filter(definition => definition?.id)
      .map(definition => [definition.id, definition]));
    this.order = Array.isArray(config.order) && config.order.length
      ? [...config.order]
      : definitions.map(definition => definition.id);
    this.rules = (Array.isArray(config.rules) ? config.rules : [])
      .filter(rule => rule?.signal && rule?.stepId)
      .map(rule => ({ ...rule }));
    this.movementRule = config.movementRule ? { ...config.movementRule } : null;

    for (const definition of definitions) {
      const override = overrides.get(definition.id);
      const merged = override && Array.isArray(override.steps)
        ? { ...definition, ...structuredCloneSafe(override) }
        : structuredCloneSafe(definition);
      this.tutorialSystem.registerTutorial(merged.id, {
        ...merged,
        category: merged.category || config.category || 'scene',
        canSkip: merged.canSkip === true,
        autoTrigger: merged.autoTrigger === true
      });
    }
    return this;
  }

  bindPresentation() {
    const presenter = this.presenter;
    if (!presenter) return false;
    this.tutorialSystem.onShow(data => presenter.show?.(data));
    this.tutorialSystem.onHide(() => presenter.hide?.());
    this.tutorialSystem.onComplete(() => {
      this.scheduler(() => this.showNext());
    });
    this._presentationBound = true;
    return true;
  }
  showNext() {
    if (!this.activeWhen() || this.tutorialSystem.isShowingTutorial()) return false;
    const next = this.order.find(id => !this.tutorialSystem.isTutorialCompleted(id));
    return next ? this.tutorialSystem.showTutorial(next) : false;
  }

  complete(stepId, payload = {}) {
    if (!stepId || !this.activeWhen() || this.tutorialSystem.isTutorialCompleted(stepId)) {
      return false;
    }
    this.tutorialSystem.completeTutorial(stepId, payload);
    if (!this.tutorialSystem.isShowingTutorial()) this.showNext();
    return true;
  }

  notify(signal, payload = {}) {
    if (!this.activeWhen()) return false;
    const candidates = this.rules.filter(rule => rule.signal === signal);
    for (const rule of candidates) {
      if (this.tutorialSystem.isTutorialCompleted(rule.stepId)) continue;
      if (typeof rule.when === 'function' && rule.when(payload) !== true) return false;
      return this.complete(rule.stepId, payload);
    }
    return false;
  }

  isCurrent(stepId) {
    if (!this.activeWhen()) return false;
    const next = this.order.find(id => !this.tutorialSystem.isTutorialCompleted(id));
    return next === stepId;
  }

  isCompleted(stepId) {
    return this.tutorialSystem.isTutorialCompleted(stepId);
  }

  resetMovementOrigin(position = null) {
    this.movementOrigin = hasPosition(position)
      ? { x: position.x, y: position.y }
      : null;
  }

  updateMovement(position, options = {}) {
    const rule = { ...(this.movementRule || {}), ...options };
    if (!hasPosition(position)) return false;
    if (!this.movementOrigin) {
      this.movementOrigin = { x: position.x, y: position.y };
      return false;
    }
    if (!this.activeWhen() || !rule.stepId || this.isCompleted(rule.stepId)) return false;
    const threshold = Math.max(0, Number(rule.threshold) || 0);
    const distance = Math.hypot(
      position.x - this.movementOrigin.x,
      position.y - this.movementOrigin.y
    );
    if (distance <= threshold || !this.complete(rule.stepId, { position, distance })) return false;
    rule.onComplete?.({ position, distance });
    return true;
  }

  dispose() {
    if (this._presentationBound) {
      this.tutorialSystem.onShow(null);
      this.tutorialSystem.onHide(null);
      this.tutorialSystem.onComplete(null);
    }
    this._presentationBound = false;
    this.movementOrigin = null;
  }
}

function hasPosition(position) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.y);
}

function structuredCloneSafe(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export default SceneTutorialFlow;