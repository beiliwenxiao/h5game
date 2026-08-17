import { SceneFlowCoordinator } from '../../../src/core/scene/SceneFlowCoordinator.js';

const navigationMethods = {
  async projectEntryRuntime(sceneId) {
    if (!sceneId) return { ok: false, code: 'missingSceneId' };
    if (sceneId === 'S05') await this.s05SceneCoordinator._syncS05MineWorldState();
    if (sceneId === 'S07') this.s07s08Coordinator._syncS07DelayWorldState();
    if (sceneId === 'S12') this.s11s14SceneCoordinator._ensureS12GateEntity();
    else this.s11s14SceneCoordinator._removeS12GateEntity();
    this._ensureSceneVehicleEntities(sceneId);
    return { ok: true };
  }
};

/**
 * Demo navigation projection adapter. It contains historical scene entry rules only;
 * ChunkNavigator and RegionCoordinator continue to own navigation transactions.
 */
export class SanguoSceneNavigationCoordinator extends SceneFlowCoordinator {
  constructor(scene) {
    super(scene, navigationMethods, { name: 'SanguoSceneNavigationCoordinator' });
  }
}
