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
