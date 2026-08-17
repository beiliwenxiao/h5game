/**
 * TutorialSystem 的场景薄适配器：只转发语义信号与表现生命周期，
 * 不复制 definition、规则、阈值或完成状态。
 */
export class SceneTutorialFlow {
  constructor(config = {}) {
    if (!config.tutorialSystem) throw new TypeError('SceneTutorialFlow requires tutorialSystem');
    this.tutorialSystem = config.tutorialSystem;
    this.getScope = config.getScope || (() => null);
    this.presenter = config.presenter || null;
    this.scheduler = config.scheduler || (callback => setTimeout(callback, 0));
    this._presentationBound = false;
  }

  bindPresentation() {
    const presenter = this.presenter;
    if (!presenter) return false;
    this.tutorialSystem.onShow(data => presenter.show?.(data));
    this.tutorialSystem.onHide(() => presenter.hide?.());
    this.tutorialSystem.onComplete(() => this.scheduler(() => this.showNext()));
    this._presentationBound = true;
    return true;
  }

  showNext() {
    return this.tutorialSystem.showNext(null, this.getScope());
  }

  complete(tutorialId) {
    if (!tutorialId || this.isCompleted(tutorialId)) return false;
    this.tutorialSystem.completeTutorial(tutorialId);
    if (!this.tutorialSystem.isShowingTutorial()) this.showNext();
    return true;
  }

  notify(signal, payload = {}) {
    return this.tutorialSystem.notify(signal, payload, this.getScope());
  }

  isCurrent(tutorialId) {
    const current = this.tutorialSystem.getCurrentTutorial();
    return current?.id === tutorialId;
  }

  isCompleted(tutorialId) {
    return this.tutorialSystem.isTutorialCompleted(tutorialId);
  }

  resetMovementOrigin(position = null) {
    const scope = this.getScope();
    const definition = this.tutorialSystem.getAllTutorials()
      .find(value => this._matchesScope(value, scope)
        && value.movementRule && !this.isCompleted(value.id));
    this.tutorialSystem.resetMovementOrigin(definition?.id || null, position);
  }

  updateMovement(position, options = {}) {
    const completed = this.tutorialSystem.updateMovement(position, null, this.getScope());
    if (completed) options.onComplete?.({ position });
    return completed;
  }

  _matchesScope(definition, scope) {
    const sceneId = typeof scope === 'string' ? scope : scope?.sceneId;
    const sceneIds = definition?.scope?.sceneIds;
    return !Array.isArray(sceneIds) || sceneIds.length === 0 || !sceneId || sceneIds.includes(sceneId);
  }

  dispose() {
    if (this._presentationBound) {
      this.tutorialSystem.onShow(null);
      this.tutorialSystem.onHide(null);
      this.tutorialSystem.onComplete(null);
    }
    this._presentationBound = false;
  }
}

export default SceneTutorialFlow;