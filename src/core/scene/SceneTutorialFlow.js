/**
 * TutorialSystem 的场景薄适配器：只转发语义信号与表现生命周期，
 * 不复制 definition、规则、阈值或完成状态。
 */
export class SceneTutorialFlow {
  constructor(config = {}) {
    if (!config.tutorialSystem) throw new TypeError('SceneTutorialFlow requires tutorialSystem');
    this.tutorialSystem = config.tutorialSystem;
    this.activeWhen = config.activeWhen || (() => true);
    this.presenter = config.presenter || null;
    this.scheduler = config.scheduler || (callback => setTimeout(callback, 0));
    this.category = config.category || null;
    this._presentationBound = false;
  }

  configure(config = {}) {
    this.category = config.category || this.category;
    return this;
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
    if (!this.activeWhen()) return false;
    return this.tutorialSystem.showNext(this.category);
  }

  complete(tutorialId) {
    if (!tutorialId || !this.activeWhen() || this.isCompleted(tutorialId)) return false;
    this.tutorialSystem.completeTutorial(tutorialId);
    if (!this.tutorialSystem.isShowingTutorial()) this.showNext();
    return true;
  }

  notify(signal, payload = {}) {
    if (!this.activeWhen()) return false;
    return this.tutorialSystem.notify(signal, payload);
  }

  isCurrent(tutorialId) {
    if (!this.activeWhen()) return false;
    return this.tutorialSystem.getCurrentTutorial()?.id === tutorialId;
  }

  isCompleted(tutorialId) {
    return this.tutorialSystem.isTutorialCompleted(tutorialId);
  }

  resetMovementOrigin(position = null) {
    const definition = this.tutorialSystem.getAllTutorials()
      .find(value => (!this.category || value.category === this.category)
        && value.movementRule && !this.isCompleted(value.id));
    this.tutorialSystem.resetMovementOrigin(definition?.id || null, position);
  }

  updateMovement(position, options = {}) {
    if (!this.activeWhen()) return false;
    const completed = this.tutorialSystem.updateMovement(position, this.category);
    if (completed) options.onComplete?.({ position });
    return completed;
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