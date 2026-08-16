/************************************************************
 * 三国张角传 canonical trigger 到既有领域 coordinator 的迁移适配器。
 * TriggerSystem 仍是唯一 action-chain 内核；本模块不保存流程或业务状态。
 ************************************************************/

import { registerSceneTriggerActions } from '../../../src/core/scene/SceneTriggerActionProvider.js';

export function registerSanguoScenarioActionBindings(triggerSystem, scene) {
  if (!triggerSystem?.registerAction || !scene) {
    throw new TypeError('registerSanguoScenarioActionBindings requires TriggerSystem and scene');
  }
  registerSceneTriggerActions(triggerSystem, {
    spawnPlacements: selector => scene.context.services.placements?.spawn(selector),
    weatherSystem: scene.weatherSystem,
    timeSystem: scene.timeSystem,
    logger: console
  });

  const bindings = [
    ['lightCampfire', () => scene._campfireService.ignite({ runtime: { particleSystem: scene.particleSystem } })],
    ['prepareSpecialFaint', params => scene._s01s02Coordinator.prepareSpecialFaint(params)],
    ['clearSpecialFaint', () => scene._s01s02Coordinator.clearSpecialFaint()],
    ['completeS01AndTravel', params => scene._s01s02Coordinator.completeS01AndTravel(params)],
    ['acceptS02Summons', params => scene._s01s02Coordinator.acceptS02Summons(params)],
    ['travelToS09', () => scene._s01s02Coordinator.travelToS09()],
    ['acceptS09Enlistment', () => scene.acceptS09Enlistment()],
    ['prepareS09RefugeeConflict', () => scene.s09RefugeeCoordinator.prepareS09RefugeeConflict()],
    ['startS09RefugeeConflict', () => scene.s09RefugeeCoordinator.startS09RefugeeConflict()],
    ['handleS09RefugeeChoice', (_params, _ctx, event) => (
      scene.s09RefugeeCoordinator.handleS09RefugeeChoice(event?.params?.choiceId)
    )],
    ['confirmClass', params => scene._showClassConfirmation(params)],
    ['travelToS03', () => scene.s03s08Coordinator.travelToS03()],
    ['openS03BattleMode', () => scene.s03s14BattleCoordinator.open('S03')],
    ['checkS03Exit', () => scene.s03s08Coordinator.checkS03Exit()],
    ['openS04BattleMode', () => scene.s03s14BattleCoordinator.open('S04')],
    ['startS04BocaiRescue', () => scene.s03s08Coordinator.startS04BocaiRescue()],
    ['completeS04BocaiEvacuation', () => scene.s03s08Coordinator.completeS04BocaiEvacuation()],
    ['openS04RouteChoice', () => scene.s03s08Coordinator.openS04RouteChoice()],
    ['openS05BattleMode', () => scene.s03s14BattleCoordinator.open('S05')],
    ['prepareS05Mine', () => scene.s05SceneCoordinator.prepareS05Mine()],
    ['showS05MineStatus', () => scene.s05SceneCoordinator.showS05MineStatus()],
    ['completeS05MineRetreat', () => scene.s05SceneCoordinator.completeS05MineRetreat()],
    ['startS05ZhangManchengRescue', () => scene.s05SceneCoordinator.startS05ZhangManchengRescue()],
    ['checkS05Exit', () => scene.s05SceneCoordinator.checkS05Exit()],
    ['openS06DefenseChoice', () => scene.s06SceneCoordinator.openS06DefenseChoice()],
    ['startS06FieldConstruction', () => scene.s06SceneCoordinator.startS06FieldConstruction()],
    ['completeS06Recall', () => scene.s06SceneCoordinator.completeS06Recall()],
    ['openS07BattleMode', () => scene.s03s14BattleCoordinator.open('S07')],
    ['commitS07DelayPoint', params => scene.s07s08Coordinator.commitS07DelayPoint(params)],
    ['checkS07Exit', params => scene.s07s08Coordinator.checkS07Exit(params)],
    ['openS08RetreatChoice', () => scene.s07s08Coordinator.openS08RetreatChoice()],
    ['completeS08Recall', () => scene.s07s08Coordinator.completeS08Recall()],
    ['commitS10ZhangJiaoDeath', () => scene.s10StoryCoordinator.commitS10ZhangJiaoDeath()],
    ['acknowledgeS10TemporaryCamp', () => scene.s10StoryCoordinator.acknowledgeS10TemporaryCamp()],
    ['completeS10CampRelocation', () => scene.s10StoryCoordinator.completeS10CampRelocation()],
    ['startS10Construction', params => scene.s10ConstructionCoordinator.startS10Construction(params)],
    ['checkS10Exit', () => scene.s10ConstructionCoordinator.checkS10Exit()],
    ['openS11BattleMode', () => scene.s03s14BattleCoordinator.open('S11')],
    ['startS11Rescue', () => scene.s11s14SceneCoordinator.startS11Rescue()],
    ['completeS11Beacon', () => scene.s11s14SceneCoordinator.completeS11Beacon()],
    ['completeS11GuardRally', () => scene.s11s14SceneCoordinator.completeS11GuardRally()],
    ['reportS11AssassinWaveDefeated', params => scene.s11s14SceneCoordinator.reportS11AssassinWaveDefeated(params.waveNumber)],
    ['completeS11WestGateBreakout', () => scene.s11s14SceneCoordinator.completeS11WestGateBreakout()],
    ['interactS11Horse', () => scene.s11s14SceneCoordinator.interactS11Horse()],
    ['checkS11Exit', () => scene.s11s14SceneCoordinator.checkS11Exit()],
    ['openS12BattleMode', () => scene.s03s14BattleCoordinator.open('S12')],
    ['startS12Rescue', () => scene.s11s14SceneCoordinator.startS12Rescue()],
    ['completeS12SecretPassage', () => scene.s11s14SceneCoordinator.completeS12SecretPassage()],
    ['completeS12Evacuation', () => scene.s11s14SceneCoordinator.completeS12Evacuation()],
    ['useS12LadderEntry', () => scene.s11s14SceneCoordinator.useS12LadderEntry()],
    ['burnS12Ladder', params => scene.s11s14SceneCoordinator.burnS12Ladder(params)],
    ['checkS12Exit', () => scene.s11s14SceneCoordinator.checkS12Exit()],
    ['openS13BattleMode', () => scene.s03s14BattleCoordinator.open('S13')],
    ['checkS13Exit', () => scene.s11s14SceneCoordinator.checkS13Exit()],
    ['openS14CargoTransfer', () => scene.s11s14SceneCoordinator.openS14CargoTransfer()],
    ['resolveS14LastCart', () => scene.s11s14SceneCoordinator.resolveS14LastCart()],
    ['resolveS14Catapult', () => scene.s11s14SceneCoordinator.resolveS14Catapult()],
    ['operateS14Catapult', () => scene.s11s14SceneCoordinator.operateS14Catapult()],
    ['leaveS14Catapult', () => scene.s11s14SceneCoordinator.leaveS14Catapult()],
    ['commitS14Ending', params => scene.s11s14SceneCoordinator.commitS14Ending(params)]
  ];
  for (const [actionId, handler] of bindings) triggerSystem.registerAction(actionId, handler);
  return bindings.map(([actionId]) => actionId);
}

export default registerSanguoScenarioActionBindings;