import { SceneFlowCoordinator } from '../../../src/core/scene/SceneFlowCoordinator.js';

const commandMethods = {
  prepareGatheringSettlement(context = {}) {
    const { node } = context;
    if (this.currentSceneId === 'S05' && node?.resourceType === 'iron') {
      return this.s05SceneCoordinator._prepareS05MineGatheringSettlement(context);
    }
    if (this.currentSceneId === 'S09' && node?.resourceType === 'food') {
      return this.s09RefugeeCoordinator.prepareUnauthorizedHarvestSettlement(context);
    }
    return null;
  },

  shouldForwardGatheringEvent(event, data = {}) {
    if (event !== 'completed' || data.idempotent !== true) return true;
    this._showScreenTip('该次采集已经结算，不会重复获得资源或扣除声望。');
    return false;
  },

  grantGatheringProficiency(data = {}) {
    if (Number(data.accepted) <= 0 || !data.operationId) return false;
    const definition = this.proficiencySystem?.getDefinition?.('gathering');
    const amount = Math.max(1, Math.floor(Number(data.accepted) * (definition?.experiencePerUnit || 1)));
    const result = this.proficiencySystem?.gainExperience?.({
      characterId: this.playerEntity?.id,
      type: 'gathering',
      amount,
      operationId: `gathering:${data.operationId}`
    });
    if (result?.ok === false) console.warn('[SanguoSceneCommandCoordinator] 采集熟练度提交失败:', result.code);
    return result?.ok !== false;
  },

  handleGatheringEvent(event, data = {}) {
    if ((event === 'completed' || event === 'interrupted')
      && data.toolBroken === true
      && this._s05MinePendingSettlements.has(data.operationId)) {
      void this.s05SceneCoordinator._finalizeS05MineCollapse(data);
      return true;
    }
    if (event === 'completed' && this.s09RefugeeCoordinator.hasUnauthorizedHarvest(data.operationId)) {
      this._showScreenTip('未获许可取走粮食：声望 -5，粮仓哨兵已被惊动。');
    }
    if (event === 'completed') this.grantGatheringProficiency(data);
    if (event === 'riskTriggered') {
      this.gameLoader?.triggerSystem?.fire?.('gatheringRisk', {
        riskId: data.id,
        riskType: data.type,
        nodeId: data.nodeId
      });
      return true;
    }
    if (event === 'completed') this._tutorialFlow.notify('gatheringCompleted', data);
    return true;
  },

  canPerformBasicAttack() {
    if (this.s11s14SceneCoordinator.handlePointerBasicAttack()) return false;
    return this.canPerformDefaultBasicAttack() || this._s01s02Coordinator.allowsTutorialBasicAttack();
  },

  handleIrreversibleChoice(command = {}) {
    if (this.currentSceneId === 'S06') return this.s06SceneCoordinator._handleS06DefenseChoiceCommand(command);
    if (this.currentSceneId === 'S08') return this.s07s08Coordinator._handleS08RetreatChoiceCommand(command);
    if (this.currentSceneId === 'S14') return this.s11s14SceneCoordinator._handleS14FinalDoctrineCommand(command);
    return this.s03s08Coordinator._handleS04RouteChoiceCommand(command);
  }
};

/** Routes historical scene commands without giving the Scene ownership of their rules. */
export class SanguoSceneCommandCoordinator extends SceneFlowCoordinator {
  constructor(scene) {
    super(scene, commandMethods, { name: 'SanguoSceneCommandCoordinator' });
  }
}
