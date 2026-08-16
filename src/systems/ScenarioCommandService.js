export const SCENARIO_COMMANDS = Object.freeze({
  WORLD_TELEPORT: 'world.teleport',
  CHECKPOINT_REQUEST: 'checkpoint.request',
  DIALOGUE: 'dialogue.command',
  TUTORIAL: 'tutorial.command'
});

const clone = value => value == null ? value : (typeof structuredClone === 'function'
  ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

function rejected(command, code, error = null) {
  return {
    ok: false, operationId: command.operationId, status: 'rejected', committed: false,
    code, stateId: null, stateRevision: null, eventFrom: null, eventTo: null,
    value: null, error: error || { message: code }
  };
}

/**
 * Scenario 标准命令的薄领域端口。它不拥有 Dialogue/Tutorial/World/Save 状态，
 * 只把 Authority 已验证的命令委托给各自唯一 owner。
 */
export class ScenarioCommandService {
  constructor(config = {}) {
    this.dialogueSystem = config.dialogueSystem || null;
    this.tutorialSystem = config.tutorialSystem || null;
    this.getChunkNavigator = config.getChunkNavigator || (() => null);
    this.getRegionCoordinator = config.getRegionCoordinator || (() => null);
    this.getWorldIndex = config.getWorldIndex || (() => null);
    this.getCurrentRegionIndex = config.getCurrentRegionIndex || (() => -1);
    this.getSaveGameService = config.getSaveGameService || (() => null);
    this.getSnapshotManager = config.getSnapshotManager || (() => null);
    this.stateType = 'scenarioCommand';
    this.stateId = command => {
      if (command.commandType === SCENARIO_COMMANDS.WORLD_TELEPORT) return 'world:navigation';
      if (command.commandType === SCENARIO_COMMANDS.CHECKPOINT_REQUEST) return 'snapshot:checkpoint';
      if (command.commandType === SCENARIO_COMMANDS.DIALOGUE) return `dialogue:${command.payload.dialogueId}`;
      return `tutorial:${command.payload.tutorialId}`;
    };
  }

  async execute(command, context) {
    let outcome;
    try {
      outcome = await this._dispatch(command);
    } catch (error) {
      return rejected(command, error.code || 'scenarioCommandFailed', { message: error.message });
    }
    if (outcome === false || outcome == null || outcome?.ok === false || outcome?.cancelled) {
      return rejected(command, outcome?.code || outcome?.reason || 'scenarioCommandRejected', {
        message: outcome?.errors?.[0]?.message || outcome?.message || 'scenario command rejected'
      });
    }
    const revision = context.commitStateRevision(context.preparedStateRevision);
    if (!revision.ok) return rejected(command, revision.code);
    const stateId = context.preparedStateRevision.stateId;
    const value = clone(outcome === true ? { ok: true } : outcome);
    const result = {
      ok: true, operationId: command.operationId, status: 'committed', committed: true,
      code: null, stateId, stateRevision: revision.stateRevision,
      eventFrom: null, eventTo: null, value, error: null
    };
    const eventBase = { stateId, stateType: this.stateType, stateRevision: revision.stateRevision };
    return {
      result,
      committedEvents: [{
        ...eventBase,
        type: `${command.commandType}.committed`,
        payload: { commandType: command.commandType, value }
      }],
      applicationEvents: [{
        ...eventBase,
        type: command.commandType,
        payload: { commandType: command.commandType, value }
      }]
    };
  }

  _dispatch(command) {
    if (command.commandType === SCENARIO_COMMANDS.WORLD_TELEPORT) return this._teleport(command.payload);
    if (command.commandType === SCENARIO_COMMANDS.CHECKPOINT_REQUEST) return this._checkpoint(command.payload);
    if (command.commandType === SCENARIO_COMMANDS.DIALOGUE) return this._dialogue(command.payload);
    if (command.commandType === SCENARIO_COMMANDS.TUTORIAL) return this._tutorial(command.payload);
    return { ok: false, code: 'unsupportedScenarioCommand' };
  }

  navigate(payload = {}) {
    return this._teleport(payload);
  }

  requestCheckpoint(payload = {}) {
    return this._checkpoint(payload);
  }

  _teleport(payload) {
    const sceneId = payload.sceneId;
    const target = this.getWorldIndex()?.findScene?.(sceneId);
    if (!target) return { ok: false, code: 'targetSceneMissing' };
    if (target.regionIndex !== this.getCurrentRegionIndex()) {
      const coordinator = this.getRegionCoordinator();
      if (!coordinator?.switchTo) return { ok: false, code: 'regionCoordinatorUnavailable' };
      return coordinator.switchTo({
        projectUrl: payload.projectUrl || 'game.project.json',
        regionIndex: target.regionIndex,
        sceneId,
        spawnRef: payload.spawnRef || 'player'
      });
    }
    const navigator = this.getChunkNavigator();
    if (!navigator?.teleport) return { ok: false, code: 'chunkNavigatorUnavailable' };
    return navigator.teleport({
      sceneId,
      spawnRef: payload.spawnRef || null,
      x: payload.x,
      y: payload.y,
      transition: payload.transition || 'none'
    });
  }

  _checkpoint(payload) {
    const meta = {
      reason: payload.reason || 'checkpoint',
      checkpointId: payload.checkpointId,
      sceneId: payload.sceneId || null
    };
    const saveGameService = this.getSaveGameService();
    if (saveGameService?.requestAutoSave) return saveGameService.requestAutoSave(meta);
    if (saveGameService?.saveAuto) return saveGameService.saveAuto(meta);
    const snapshotManager = this.getSnapshotManager();
    if (snapshotManager?.capture) return snapshotManager.capture(meta);
    return { ok: false, code: 'checkpointServiceUnavailable' };
  }

  _dialogue(payload) {
    const system = this.dialogueSystem;
    if (!system) return { ok: false, code: 'dialogueSystemUnavailable' };
    if (payload.operation === 'continue') return system.continue(payload.context || {});
    if (payload.operation === 'end') return system.endDialogue() ?? true;
    if (payload.operation && payload.operation !== 'start') return { ok: false, code: 'unsupportedDialogueOperation' };
    return system.startDialogue(payload.dialogueId, payload.context || {});
  }

  _tutorial(payload) {
    const system = this.tutorialSystem;
    if (!system) return { ok: false, code: 'tutorialSystemUnavailable' };
    if (payload.operation === 'complete') return system.completeTutorial(payload.tutorialId) ?? true;
    if (payload.operation === 'skip') return system.skipTutorial();
    if (payload.operation === 'notify') return system.notify(payload.signal, payload.value || {});
    if (payload.operation && payload.operation !== 'show') return { ok: false, code: 'unsupportedTutorialOperation' };
    return system.showTutorial(payload.tutorialId, payload.context || {});
  }
}

export default ScenarioCommandService;