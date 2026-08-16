import { SceneFlowCoordinator } from '../../../src/core/scene/SceneFlowCoordinator.js';

export const S09_REFUGEE_DIALOGUE_ID = 'dialogue.s09.refugeeConflict';

/**
 * P2.2 presentation adapter. It forwards player intent to the shared command port and only
 * projects committed results into dialogue/placement/audio; it never owns Story/City/Inventory state.
 */
const methods = {
  _submit(definitionId, payload = {}) {
    const gateway = this.sceneRuntime?.commandGateway;
    const actorRef = this.playerEntity?.id;
    if (!gateway || !actorRef) return Promise.resolve({ ok: false, code: 'commandGatewayUnavailable' });
    this._s09CommandSequence = (this._s09CommandSequence || 0) + 1;
    return gateway.execute({
      intentType: 'state.transaction', actorRef,
      operationId: `story:${definitionId}:${this._s09CommandSequence}`,
      payload: { definitionId, ...payload }
    });
  },

  async acceptEnlistment() {
    const result = await methods._submit.call(this, 'story.s09.enlist');
    if (result.ok) this._showScreenTip('你已加入黄巾。前往战士、弓手或军师旗帜确认职业。');
    return result.ok === true;
  },

  async prepareS09RefugeeConflict() {
    const result = await methods._submit.call(this, 'story.s09.refugee.prepare');
    if (result.ok) {
      await this.context.services.placements?.spawn({ group: 'S09-refugee-conflict' });
      this._s09AudioDirector?.playFeedback?.('conflict');
    }
    return result.ok === true;
  },

  async startS09RefugeeConflict() {
    if (this.dialogueSystem?.isDialogueActive?.()) return false;
    const result = await methods._submit.call(this, 'story.s09.refugee.start');
    if (!result.ok) return false;
    return this.dialogueSystem?.startDialogue?.(S09_REFUGEE_DIALOGUE_ID, {
      player: this.playerEntity, scene: this.$scene
    }) === true;
  },

  _resultNode(conflict = {}) {
    if (conflict.branch === 'hardline') return 'hardlineResult';
    if (conflict.branch === 'appease') return conflict.result === 'foodRestored' ? 'appeaseSuccessResult' : 'appeaseScoutResult';
    if (conflict.branch === 'silence') return 'silenceResult';
    return conflict.donationCommitted ? 'branchChoice' : 'donationFailed';
  },

  async handleS09RefugeeChoice(choiceId) {
    if (choiceId === 'defer') return true;
    const result = await methods._submit.call(this, 'story.s09.refugee.branch', { event: { choiceId } });
    if (!result.ok) return false;
    const conflict = result.value?.state?.story?.s09RefugeeConflict || {};
    if (this.dialogueSystem?.getCurrentDialogue?.()?.id === S09_REFUGEE_DIALOGUE_ID) {
      this.dialogueSystem.goToNode?.(this._resultNode(conflict), { player: this.playerEntity, scene: this.$scene });
    }
    this._s09AudioDirector?.playFeedback?.(choiceId);
    if (conflict.scoutTriggered) await this.context.services.placements?.spawn({ group: 'S09-refugee-scout' });
    return true;
  },

  advanceGameDay(days = 1) {
    const currentDay = this.timeSystem?.advanceDays?.(Math.max(1, Math.floor(Number(days) || 1)));
    if (!currentDay) return false;
    void methods._submit.call(this, 'story.s09.day.advance', { day: currentDay })
      .then(result => result.ok && methods._submit.call(this, 'story.s09.delayed.resolve'));
    return currentDay;
  }
};

export class S09RefugeeCoordinator extends SceneFlowCoordinator {
  constructor(scene) { super(scene, methods, { name: 'S09RefugeeCoordinator' }); }
}

export default S09RefugeeCoordinator;
