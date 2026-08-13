/************************************************************
 * 三国张角传 - S11-S14 场景流程适配
 * 历史人物和固定剧情留在 Demo；领域状态继续委托通用系统。
 ************************************************************/

import { EndingSystem } from '../../../src/systems/EndingSystem.js';
import { BattleMode, BattleState } from '../../../src/systems/BattleSystem.js';
import { RescueStatus } from '../../../src/systems/RescueSystem.js';
import { Entity } from '../../../src/ecs/Entity.js';
import { TransformComponent } from '../../../src/ecs/components/TransformComponent.js';
import { BuildingComponent, BuildingType } from '../../../src/ecs/components/BuildingComponent.js';
import { PadButton } from '../../../src/core/input/Xbox360Profile.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const S11_BATTLE_ID = 'battle.s11.guangzong';
const S12_BATTLE_ID = 'battle.s12.xiaquyang';
const S13_BATTLE_ID = 'battle.s13.jingshan';
const S11_RESCUE_ID = 'rescue.s11.zhangLiang';
const S12_RESCUE_ID = 'rescue.s12.zhangBao';
const S12_GATE_ID = 'S12-yamen-gate';
const RESOURCE_IDS = Object.freeze({ food: 'resource.food', herb: 'resource.herb', wood: 'resource.wood', iron: 'resource.iron' });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function getPath(source, path) {
  return String(path || '').split('.').reduce((value, key) => value == null ? undefined : value[key], source);
}

function inventoryQuantity(inventory, itemId) {
  return (inventory?.slots || []).reduce((total, stack) => (
    stack?.item?.id === itemId ? total + Math.max(0, Math.floor(Number(stack.quantity) || 0)) : total
  ), 0);
}

function entityAlive(scene, entityId) {
  const entity = (scene.entities || []).find(candidate => candidate?.id === entityId);
  return !!entity && !scene._isEntityDead(entity);
}

function formatFailure(result, fallback) {
  const messages = {
    modeNotAllowed: '只有介入战役后才能启动救援。',
    battleNotIntervened: '当前战役未处于可救援的介入状态。',
    guardsMissing: `集合区内存活卫兵不足：${result?.actual || 0}/${result?.required || 6}。`,
    stageNotActive: '当前救援阶段尚未开放。',
    secretPassageLocked: '府衙门尚未守满 60 秒，密道还未开放。',
    escortLocked: '先开启密道，再护送目标撤离。',
    rescueResourceMissing: `救援物资不足：${result?.itemId || '资源'} 缺少 ${result?.missing || 0}。`,
    coordinatorBusy: '救援结果正在保存，请稍候。'
  };
  return messages[result?.code] || result?.message || fallback;
}

async function activateGroup(scene, group, aiType = null) {
  await scene._spawnPlacements?.({ group, sceneId: scene.currentSceneId });
  const entities = scene._groupEnemies?.[group] || [];
  let active = 0;
  for (const entity of entities) {
    if (scene._isEntityDead(entity)) continue;
    if (scene.aiSystem?.activateAI?.(entity, aiType || entity.aiType || 'aggressive')) active += 1;
  }
  return { ok: entities.length > 0, count: entities.length, active };
}

async function travel(scene, sceneId, title) {
  const regionIndex = scene._findRegionIndexForScene?.(sceneId);
  if (regionIndex < 0) {
    scene._showScreenTip?.(`世界地图未登记 ${sceneId}。`, { title: '目标场景不可用' });
    return false;
  }
  let result;
  if (regionIndex !== scene._currentRegionIndex) {
    result = await scene.travelToRegion?.({ regionIndex, sceneId, spawnRef: 'player' });
    if (result?.ok === false) return false;
  } else {
    result = await scene.teleportToChunk?.({ scene: sceneId, spawnRef: 'player', transition: 'fadeBlack' });
    if (result === false || result?.cancelled) return false;
  }
  scene._showScreenTip?.(`已抵达 ${sceneId}。`, { title });
  return true;
}

function buildLowMoraleResult(scene, context = {}) {
  const definition = scene._s12BattleConfig;
  const create = definition?.createParams || {};
  const policy = definition?.realtimeResult?.byWinner?.han_government || {};
  const resources = clone(policy.capturedResources || {});
  return {
    schemaVersion: 2,
    resultId: `result-${S12_BATTLE_ID}-friendly-morale-zero`,
    responseId: `response-realtime-${S12_BATTLE_ID}-friendly-morale-zero`,
    battleId: context.battleId || S12_BATTLE_ID,
    winnerFactionId: context.winnerFactionId || 'han_government',
    casualties: {
      [create.attackerArmy?.id || 'army.s12.han']: 0,
      [create.defenderArmy?.id || 'army.s12.yellow_turban']: 0
    },
    capturedResources: resources,
    resourceTransfer: {
      fromCityId: create.resourceSourceCityId,
      toCityId: create.resourceDestinationCityId,
      resources: clone(resources)
    },
    affectedCityId: create.affectedCityId,
    cityDamage: clamp(policy.cityDamage, 0, 1),
    damagedResourceNodeIds: clone(policy.damagedResourceNodeIds || []),
    completedAt: Math.max(0, Math.floor(Number(create.logicalTime) || 0)),
    failureReason: context.failureReason || 'friendlyMoraleZero'
  };
}

const s11s12Methods = {
  _createS12LowMoraleResult(context = {}) {
    return buildLowMoraleResult(this, context);
  },

  async startS11Rescue() {
    if (this.currentSceneId !== 'S11' || !this.s11s12Coordinator) return false;
    this._setRescueObjectiveTitle?.(S11_RESCUE_ID);
    const targetId = this._s11RescueConfig?.targetEntityId;
    if (!entityAlive(this, targetId)) {
      this._showScreenTip('张梁尚未生成或已经阵亡。', { title: '救援不可用' });
      return false;
    }
    const result = await this.s11s12Coordinator.startS11Rescue({
      mode: this.battleSystem?.mode,
      operationId: `start:${S11_RESCUE_ID}`
    });
    if (!result?.ok) {
      this._showScreenTip(formatFailure(result, '张梁救援未能启动。'), { title: '救援不可用' });
      return false;
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    this._showScreenTip('120 秒计时开始。先点燃烽火召集六名卫兵。', { title: '张梁突围' });
    return true;
  },

  async completeS11Beacon() {
    if (this.currentSceneId !== 'S11') return false;
    const result = await this.s11s12Coordinator?.completeS11Beacon?.();
    if (!result?.ok) {
      this._showScreenTip(formatFailure(result, '烽火阶段尚未开放。'), { title: '无法点燃烽火' });
      return false;
    }
    await activateGroup(this, 'S11-rescue-guards', 'support');
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    this._showScreenTip('烽火已点燃。六名卫兵已经回应，在集合区与他们会合。', { title: '烽火传令' });
    return true;
  },

  async completeS11GuardRally() {
    if (this.currentSceneId !== 'S11') return false;
    const guards = (this._groupEnemies?.['S11-rescue-guards'] || [])
      .filter(entity => !this._isEntityDead(entity));
    const result = await this.s11s12Coordinator?.completeS11GuardRally?.({ guardCount: guards.length });
    if (!result?.ok) {
      this._showScreenTip(formatFailure(result, '卫兵尚未集结。'), { title: '集合未完成' });
      return false;
    }
    this._s11PendingWaveActivation = 1;
    const activated = await this._retryS11WaveActivation();
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    this._showScreenTip(
      activated ? '卫兵已集结。第一波刺客从东侧逼近。' : '卫兵已集结，刺客波次正在重新集结。',
      { title: '刺客来袭' }
    );
    return true;
  },

  async reportS11AssassinWaveDefeated(waveNumber) {
    if (this.currentSceneId !== 'S11') return false;
    const wave = Math.floor(Number(waveNumber));
    const result = await this.s11s12Coordinator?.reportS11AssassinWaveDefeated?.(wave);
    if (!result?.ok) {
      this._clearedGroups?.delete?.(`S11-assassin-wave-${wave}`);
      return false;
    }
    if (wave < 3) {
      const nextWave = wave + 1;
      this._s11PendingWaveActivation = nextWave;
      const activated = await this._retryS11WaveActivation();
      this._showScreenTip(
        activated
          ? `第 ${wave} 波刺客已击退，第 ${nextWave} 波正在逼近。`
          : `第 ${wave} 波刺客已击退，第 ${nextWave} 波正在重新集结。`,
        { title: '继续迎敌' }
      );
    } else {
      this._showScreenTip('三波刺客全部击退。护送张梁前往西门突围点。', { title: '西门已开放' });
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    return true;
  },

  async completeS11WestGateBreakout() {
    if (this.currentSceneId !== 'S11') return false;
    const target = (this.entities || []).find(entity => entity?.id === this._s11RescueConfig?.targetEntityId);
    const targetTransform = target?.getComponent?.('transform');
    const exit = this._worldLoadSession?.findSpawn?.('S11', this._s11RescueConfig?.evacuationRef);
    if (!targetTransform || !exit || Math.hypot(targetTransform.position.x - exit.x, targetTransform.position.y - exit.y) > 100) {
      this._showScreenTip('张梁尚未到达西门，请继续护送。', { title: '突围未完成' });
      return false;
    }
    const result = await this.s11s12Coordinator?.completeS11WestGateBreakout?.();
    if (!result?.ok) {
      this._showScreenTip(formatFailure(result, '西门突围阶段尚未开放。'), { title: '突围失败' });
      return false;
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    return true;
  },

  async checkS11Exit() {
    if (this.currentSceneId !== 'S11') return false;
    const story = this.gameLoader?.blackboard?.get?.('storyState') || {};
    if (story.s11BattleResolved !== true) {
      this._showScreenTip('先完成广宗战役结算。', { title: '尚不能前往下曲阳' });
      return false;
    }
    if (!story.rescueResults?.[S11_RESCUE_ID]) {
      this._showScreenTip('张梁救援尚未形成最终结果。介入时必须完成或失败，观战结果会在战役结算后冻结。', { title: '救援尚未结算' });
      return false;
    }
    return travel(this, 'S12', 'S12·下曲阳');
  },

  async startS12Rescue() {
    if (this.currentSceneId !== 'S12' || !this.s11s12Coordinator) return false;
    this._setRescueObjectiveTitle?.(S12_RESCUE_ID);
    if (!entityAlive(this, this._s12RescueConfig?.targetEntityId)) {
      this._showScreenTip('张宝尚未生成或已经阵亡。', { title: '救援不可用' });
      return false;
    }
    this._ensureS12GateEntity();
    const result = await this.s11s12Coordinator.startS12Rescue({
      mode: this.battleSystem?.mode,
      startedAt: this.rescueSystem?.now?.(),
      operationId: `start:${S12_RESCUE_ID}`,
      costOperationId: `cost:${S12_RESCUE_ID}`
    });
    if (!result?.ok) {
      this._showScreenTip(formatFailure(result, '张宝救援路线未能确认。'), { title: '救援不可用' });
      return false;
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    this._showScreenTip('粮食与草药已提交。守住府衙门 60 秒，提前破门则救援失败。', { title: '张宝救援' });
    return true;
  },

  async completeS12SecretPassage() {
    if (this.currentSceneId !== 'S12') return false;
    const result = await this.s11s12Coordinator?.completeS12SecretPassage?.({
      completedAt: this.rescueSystem?.now?.()
    });
    if (!result?.ok) {
      this._showScreenTip(formatFailure(result, '密道尚不能开启。'), { title: '密道未开放' });
      return false;
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    this._showScreenTip('密道已经开启。张宝会跟随你，带他前往东南撤离点。', { title: '护送开始' });
    return true;
  },

  async completeS12Evacuation() {
    if (this.currentSceneId !== 'S12') return false;
    const target = (this.entities || []).find(entity => entity?.id === this._s12RescueConfig?.targetEntityId);
    const targetTransform = target?.getComponent?.('transform');
    const exit = this._worldLoadSession?.findSpawn?.('S12', this._s12RescueConfig?.evacuationRef);
    if (!targetTransform || !exit || Math.hypot(targetTransform.position.x - exit.x, targetTransform.position.y - exit.y) > 100) {
      this._showScreenTip('张宝尚未进入撤离点，请继续护送。', { title: '撤离未完成' });
      return false;
    }
    const result = await this.s11s12Coordinator?.completeS12Evacuation?.({
      completedAt: this.rescueSystem?.now?.()
    });
    if (!result?.ok) {
      this._showScreenTip(formatFailure(result, '张宝撤离阶段尚未开放。'), { title: '撤离失败' });
      return false;
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    return true;
  },

  async checkS12Exit() {
    if (this.currentSceneId !== 'S12') return false;
    const story = this.gameLoader?.blackboard?.get?.('storyState') || {};
    if (story.s12BattleResolved !== true || story.s12Resolved !== true) {
      this._showScreenTip('必须先完成下曲阳战役，并冻结张宝救援结果。', { title: '终局路线尚未开放' });
      return false;
    }
    const route = this.s13s14Coordinator?.resolvePostS12Target?.();
    if (!route?.ok) {
      this._showScreenTip(`终局路线不可用：${route?.code || 'unknown'}`, { title: '无法离开下曲阳' });
      return false;
    }
    return travel(this, route.sceneId, route.s13Eligible ? 'S13·精山战场' : 'S14·结局之地');
  },

  async _retryS11WaveActivation() {
    if (this.currentSceneId !== 'S11') return false;
    if (this._s11WaveActivationPromise) return this._s11WaveActivationPromise;
    const rescue = this.rescueSystem?.getState?.();
    if (rescue?.status !== RescueStatus.ACTIVE || rescue.stageId !== 'repel-assassins') return false;
    const defeated = Math.max(0, Math.floor(Number(this.s11s12Coordinator?.state?.s11?.assassinWavesDefeated) || 0));
    const wave = this._s11PendingWaveActivation || Math.min(3, defeated + 1);
    const group = `S11-assassin-wave-${wave}`;
    if ((this._groupEnemies?.[group] || []).length > 0) {
      this._s11PendingWaveActivation = null;
      return true;
    }
    this._s11PendingWaveActivation = wave;
    this._s11WaveActivationPromise = activateGroup(this, group)
      .then(result => {
        if (result.ok) this._s11PendingWaveActivation = null;
        return result.ok;
      })
      .finally(() => { this._s11WaveActivationPromise = null; });
    return this._s11WaveActivationPromise;
  },

  _updateS11S12Runtime() {
    if (!['S11', 'S12'].includes(this.currentSceneId) || !this.s11s12Coordinator || !this.rescueSystem) return;
    const rescue = this.rescueSystem.getState?.();
    if (rescue?.status !== RescueStatus.ACTIVE) return;
    if (this.currentSceneId === 'S11' && rescue.stageId === 'repel-assassins') {
      void this._retryS11WaveActivation();
    }
    const targetId = this.currentSceneId === 'S11'
      ? this._s11RescueConfig?.targetEntityId
      : this._s12RescueConfig?.targetEntityId;
    const target = (this.entities || []).find(entity => entity?.id === targetId);
    const targetTransform = target?.getComponent?.('transform');
    const playerTransform = this.playerEntity?.getComponent?.('transform');
    const followStage = rescue.stageId === 'breakout-west-gate' || rescue.stageId === 'escort-zhang-bao';
    if (followStage && targetTransform && playerTransform) {
      const distance = Math.hypot(
        playerTransform.position.x - targetTransform.position.x,
        playerTransform.position.y - targetTransform.position.y
      );
      const movement = target.getComponent?.('movement');
      if (movement && distance > 62 && distance < 320) {
        movement.setPath([{ x: playerTransform.position.x - 28, y: playerTransform.position.y + 18 }]);
      } else if (movement && distance <= 62) movement.stop();
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem.getState());
    if (this._s11s12RuntimePromise) return;
    const timestamp = this.rescueSystem.now();
    const update = this.currentSceneId === 'S11'
      ? this.s11s12Coordinator.updateS11({ timestamp, targetAlive: entityAlive(this, targetId) })
      : this.s11s12Coordinator.updateS12({
          timestamp,
          gateIntegrity: this._ensureS12GateEntity()?.getComponent?.('building')?.hp ?? 0,
          targetAlive: entityAlive(this, targetId)
        });
    this._s11s12RuntimePromise = Promise.resolve(update)
      .then(result => {
        this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
        if (result?.ok === false && result.code !== 'coordinatorBusy') {
          this._showScreenTip(formatFailure(result, '救援状态更新失败。'), { title: '救援异常' });
        }
      })
      .finally(() => { this._s11s12RuntimePromise = null; });
  },

  _handleS11S12CoordinatorEvent(event, data = {}) {
    const messages = {
      s11RescueResolved: data.result?.survived ? '张梁成功从西门突围。' : `张梁救援失败：${data.result?.failureReason || '未能突围'}。`,
      s12SecretPassageOpened: '府衙门已守满 60 秒，密道入口开放。',
      s12EscortOpened: '张宝已经进入密道，开始护送撤离。',
      s12RescueResolved: data.result?.survived ? '张宝已经安全撤离。' : `张宝救援失败：${data.result?.failureReason || '未能撤离'}。`,
      s12LowMoraleDefeat: '下曲阳守军士气归零，战役直接判定失败。'
    };
    if (messages[event]) {
      this._showScreenTip(messages[event], {
        title: event.endsWith('Resolved') ? '救援结果已冻结' : '目标更新'
      });
    }
    this.rescueObjectiveView?.setSnapshot?.(this.rescueSystem?.getState?.());
    return true;
  },

  _ensureS12GateEntity() {
    if (this.currentSceneId !== 'S12') return null;
    if (this._s12GateEntity?.active !== false) return this._s12GateEntity;
    const source = (this._worldLoadResult?.sceneObjects || []).find(object => object?.id === S12_GATE_ID);
    if (!source) return null;
    const story = this.gameLoader?.blackboard?.get?.('storyState') || {};
    const multiplier = Math.max(1, Number(story.s12DefenseBoost?.gateMaxHpMultiplier) || 1);
    const maxHp = Math.max(1, Math.floor((Number(source.maxHp) || 1000) * multiplier));
    const x = Number(source.x) + (Number(source.width) || 0) / 2;
    const y = Number(source.y) + (Number(source.height) || 0);
    const entity = new Entity(S12_GATE_ID, 'building');
    entity.tags = ['battleParticipant', 'yellow_turban', 'destructibleGate'];
    entity.addComponent(new TransformComponent(x, y));
    entity.addComponent(new BuildingComponent({
      buildingType: BuildingType.GATE,
      maxHp,
      hp: maxHp,
      team: 'yellow_turban',
      footprint: { w: Number(source.width) || 180, h: Math.max(40, Number(source.height) || 110) }
    }));
    this.entityStore?.add?.(entity);
    this._s12GateEntity = entity;
    return entity;
  },

  _removeS12GateEntity() {
    const gate = this._s12GateEntity;
    if (!gate) return false;
    this.entityStore?.remove?.(gate);
    gate.destroy?.();
    this._s12GateEntity = null;
    return true;
  }
};

const s13s14Methods = {
  _prepareS13Settlement(mode) {
    if (!['observe', 'intervene'].includes(mode)) return { ok: false, code: 'invalidBattleMode' };
    if (this._s13PendingSettlement) {
      return this._s13PendingSettlement.mode === mode
        ? { ok: true, idempotent: true, pending: clone(this._s13PendingSettlement) }
        : { ok: false, code: 's13ChoiceLocked' };
    }
    const choice = this._worldLoadSession?.getSceneData?.('S13')?.gameplay?.choices
      ?.find(entry => entry?.id === mode);
    if (!choice) return { ok: false, code: 's13ChoiceMissing', mode };
    const inventory = this.playerEntity?.getComponent?.('inventory');
    if (!inventory || !this.inventoryTransactions) return { ok: false, code: 'inventoryUnavailable' };
    const entries = Object.entries(choice.resourceCost || {}).map(([key, quantity]) => ({
      itemId: RESOURCE_IDS[key] || key,
      quantity: Math.max(0, Math.floor(Number(quantity) || 0))
    })).filter(entry => entry.quantity > 0);
    for (const entry of entries) {
      const preview = this.inventoryTransactions.previewRemove(inventory, entry.itemId, entry.quantity);
      if (preview.remainder > 0) {
        return { ok: false, code: 'resourceMissing', message: `${entry.itemId} 缺少 ${preview.remainder}` };
      }
    }
    const operationId = `cost:${S13_BATTLE_ID}:${mode}`;
    this._s13PendingSettlement = {
      schemaVersion: 2,
      mode,
      choice: clone(choice),
      entries,
      operationId
    };
    return { ok: true, pending: clone(this._s13PendingSettlement) };
  },

  async _applyS13Settlement({ choice, operationId } = {}) {
    const pending = this._s13PendingSettlement;
    const battleResult = choice?.battleResult;
    if (!pending || pending.mode !== choice?.id) return { ok: false, code: 's13SettlementNotPrepared' };
    if (!battleResult?.resultId || battleResult.battleId !== S13_BATTLE_ID) {
      return { ok: false, code: 's13BattleResultMissing' };
    }
    const inventory = this.playerEntity?.getComponent?.('inventory');
    if (!inventory || !this.inventoryTransactions || !this.cityWarSystem) {
      return { ok: false, code: 's13SettlementRuntimeUnavailable' };
    }
    for (const entry of pending.entries) {
      const preview = this.inventoryTransactions.previewRemove(inventory, entry.itemId, entry.quantity);
      if (preview.remainder > 0) {
        return { ok: false, code: 'resourceMissing', itemId: entry.itemId, missing: preview.remainder };
      }
    }

    const inventoryBefore = clone(inventory.exportItems?.() || []);
    const cityWarBefore = clone(this._readCityWarState());
    const cityWarLedgerBefore = clone(this.cityWarSystem.serialize());
    const rollback = async () => {
      inventory.loadItems?.(clone(inventoryBefore));
      this.inventoryTransactions.forgetOperation?.(pending.operationId);
      this._restoreCityWarState(clone(cityWarBefore));
      this.cityWarSystem.deserialize(clone(cityWarLedgerBefore));
      return true;
    };
    if (pending.entries.length > 0) {
      const removed = this.inventoryTransactions.commit({
        type: 'batchRemove', inventory, entries: pending.entries, operationId: pending.operationId
      });
      if (!removed.ok) return removed;
    }
    const settled = await this.cityWarSystem.applyBattleResult({
      result: battleResult,
      operationId: `settle:${battleResult.resultId}`,
      context: { mode: pending.mode, deferCheckpoint: true, outerOperationId: operationId }
    });
    if (!settled?.ok) {
      await rollback();
      return { ok: false, code: settled?.code || 's13CityWarSettlementRejected', message: settled?.message };
    }
    return { ok: true, settled, rollback };
  },

  _rollbackS13PendingSettlement() {
    this._s13PendingSettlement = null;
    return true;
  },

  _buildS13Choice(mode, battleResult) {
    const pending = this._s13PendingSettlement;
    const configured = pending?.choice || this._worldLoadSession?.getSceneData?.('S13')?.gameplay?.choices
      ?.find(entry => entry?.id === mode) || {};
    return {
      id: mode,
      resourceCost: clone(configured.resourceCost || {}),
      battleResult: clone(battleResult),
      result: {
        battleMode: mode,
        battleResultId: battleResult?.resultId || null,
        winnerFactionId: battleResult?.winnerFactionId || null
      }
    };
  },

  async checkS13Exit() {
    if (this.currentSceneId !== 'S13') return false;
    const story = this.gameLoader?.blackboard?.get?.('storyState') || {};
    if (story.s13Resolved !== true) {
      this._showScreenTip('先完成精山战役并冻结最终资源选择。', { title: '尚不能进入结局之地' });
      return false;
    }
    return travel(this, 'S14', 'S14·结局之地');
  },

  async _applyS14ResourceDivergence({ kind, result, operationId } = {}) {
    this._ensureS14VehicleEntities?.();
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const cart = this._s14VehicleEntities?.get?.('vehicle.s14.lastCart');
    const catapult = this._s14VehicleEntities?.get?.('vehicle.s14.catapult');
    const target = kind === 'cart' ? cart : catapult;
    if (!inventory || !target || !this.vehicleLogisticsSystem) {
      return { ok: false, code: 's14VehicleRuntimeUnavailable' };
    }
    const gameplay = this._worldLoadSession?.getChunk?.('S14')?.sceneData?.gameplay || {};
    const definition = (gameplay.vehicles || []).find(entry => entry?.id === target.id) || {};
    const vehicle = target.getComponent?.('vehicle');
    const cargo = target.getComponent?.('cargo');
    const inventoryBefore = clone(inventory.exportItems?.() || []);
    const vehicleBefore = clone(vehicle?.serialize?.() || null);
    const cargoBefore = clone(cargo?.serialize?.() || null);
    const logisticsBefore = clone(this.vehicleLogisticsSystem.serialize());
    const vehicleWasRegistered = this.vehicleSystem?.vehicles?.has?.(target) === true;
    let createdDrop = null;

    const rollbackDomain = async () => {
      if (createdDrop) {
        this.entityStore?.removeMany?.([createdDrop]);
        try { createdDrop.destroy?.(); } catch (error) { /* best-effort rollback cleanup */ }
        createdDrop = null;
      }
      inventory.loadItems?.(clone(inventoryBefore));
      const vehicleRestored = vehicle?.deserialize?.(clone(vehicleBefore));
      const cargoRestored = cargoBefore && cargo ? cargo.deserialize(clone(cargoBefore)) : { ok: true };
      const logisticsRestored = this.vehicleLogisticsSystem.deserialize(clone(logisticsBefore));
      if (vehicleWasRegistered) this.vehicleSystem?.registerVehicle?.(target);
      else this.vehicleSystem?.unregisterVehicle?.(target);
      for (let index = 0; index < (gameplay.cartLoad || []).length; index += 1) {
        this.inventoryTransactions?.forgetOperation?.(`${operationId}:inventory:${index}`);
      }
      this.inventoryTransactions?.forgetOperation?.(`${operationId}:resources`);
      return vehicleRestored?.ok !== false && cargoRestored?.ok !== false && logisticsRestored?.ok !== false;
    };

    if (!vehicle || (kind === 'cart' && !cargo)) {
      return { ok: false, code: 's14VehicleComponentMissing' };
    }
    if (kind === 'cart' && result?.resultId === 'cart-lost'
      && Object.values(vehicleBefore?.seats || {}).some(seat => seat?.riderId)) {
      return { ok: false, code: 's14CartOccupied' };
    }

    let committed;
    if (kind === 'cart' && result?.resultId === 'cart-breakout') {
      committed = await this.vehicleLogisticsSystem.transferBatch({
        source: inventory,
        target: cargo,
        entries: gameplay.cartLoad || [],
        sourceOwnerId: `${this.playerEntity?.id || 'player'}:inventory`,
        targetOwnerId: `${target.id}:cargo`,
        operationId,
        context: { sceneId: 'S14', resultId: result.resultId },
        deferCheckpoint: true
      });
    } else if (kind === 'cart' && result?.resultId === 'cart-lost') {
      committed = await this.vehicleLogisticsSystem.destroyCargoVehicle({
        vehicle: target,
        operationId,
        context: { sceneId: 'S14', resultId: result.resultId },
        deferCheckpoint: true,
        deferEvent: true
      });
    } else if (kind === 'catapult' && result?.resultId === 'catapult-ready') {
      committed = await this.vehicleLogisticsSystem.assembleCatapult({
        vehicle: target,
        inventory,
        requirements: definition.assemblyRequirements || {},
        inventoryOwnerId: `${this.playerEntity?.id || 'player'}:inventory`,
        operationId,
        context: { sceneId: 'S14', resultId: result.resultId },
        deferCheckpoint: true
      });
    } else {
      committed = { ok: true, operationId, unchanged: true };
    }
    if (!committed?.ok) return committed;

    const isCartDestroyed = kind === 'cart' && result?.resultId === 'cart-lost';
    if (isCartDestroyed) {
      this.vehicleSystem?.unregisterVehicle?.(target);
      const dropId = `death-drop-${operationId}`;
      const existing = (this.entityStore?.all || []).find(entity => entity?.id === dropId)
        || (this.equipmentItems || []).find(entity => entity?.id === dropId);
      if (existing && !existing.getComponent?.('deathDrop')) {
        await rollbackDomain();
        return { ok: false, code: 's14CargoDropIdConflict', dropId };
      }
      if (!existing) {
        const transform = target.getComponent?.('transform');
        const presentation = this.getDeathDropPresentation?.({ source: 'cargoVehicle', vehicle: target }) || {};
        try {
          const drop = this.entityFactory?.createDeathDrop?.({
            ...presentation,
            id: dropId,
            deathId: operationId,
            stacks: clone(committed.drop || []),
            position: {
              x: Number(transform?.position?.x) || 0,
              y: Number(transform?.position?.y) || 0
            }
          });
          if (!drop) throw new Error('deathDropFactoryRejected');
          this.entityStore?.add?.(drop);
          this.entityStore?.addEquipmentItem?.(drop);
          if (!(this.entityStore?.all || []).includes(drop)) throw new Error('deathDropStoreRejected');
          createdDrop = drop;
        } catch (error) {
          await rollbackDomain();
          return { ok: false, code: 's14CargoDropCreationFailed', message: String(error?.message || error) };
        }
      }
    }

    return {
      ok: true,
      result: clone(committed),
      finalize: async () => {
        if (!isCartDestroyed || committed.idempotent) return true;
        this.vehicleLogisticsSystem.emitCargoVehicleDestroyed?.(committed);
        try { this.vehicleSystem?.onVehicleDestroyed?.(target); }
        catch (error) { console.warn('[S11S14SceneFlow] vehicle destruction presentation failed', error); }
        return true;
      },
      rollback: rollbackDomain
    };
  },

  _readS13S14State() {
    const blackboard = this.gameLoader?.blackboard;
    const storyState = clone(blackboard?.get?.('storyState') || {});
    const cityStates = clone(blackboard?.get?.('cityStates') || []);
    const warState = clone(blackboard?.get?.('warState') || { battles: {}, casualties: {} });
    const coreCityState = cityStates.find(city => city?.id === 'city.s09_guangzong_camp') || cityStates[0] || {
      id: 'city.s09_guangzong_camp', damageRatio: 0, resources: {}
    };
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const cumulativeGathering = clone(storyState.endingInputs?.cumulativeGathering || {
      wood: 0, iron: 0, food: 0, herb: 0
    });
    const completedStructures = Object.keys(storyState.s10Construction?.completedSites || {})
      .filter(key => storyState.s10Construction.completedSites[key] === true).length;
    const battleModes = storyState.battleModes || {};
    const eligibleBattleIds = clone(storyState.endingInputs?.eligibleBattleIds || Object.keys(battleModes));
    const modeValues = eligibleBattleIds.map(id => battleModes[id]).filter(mode => ['observe', 'intervene'].includes(mode));
    const s08Cart = storyState.s08RouteResult
      ? { available: storyState.s08RetreatDecision?.choiceId === 'preserve', destroyed: false }
      : null;
    const cartEntity = this._s14VehicleEntities?.get?.('vehicle.s14.lastCart');
    const cartVehicle = cartEntity?.getComponent?.('vehicle');
    const cartCargo = cartEntity?.getComponent?.('cargo');
    const persistedCart = storyState.retreatCart || s08Cart || { available: true, destroyed: false };
    const retreatCart = cartVehicle
      ? {
        available: true,
        destroyed: cartVehicle.destroyed === true,
        cargoLoaded: Math.max(0, Number(cartCargo?.getItemCountTotal?.()) || 0) > 0,
        dropGenerated: cartCargo?.dropGenerated === true
      }
      : clone(persistedCart);
    const cargoFood = inventoryQuantity(cartCargo, RESOURCE_IDS.food);
    const cargoHerb = inventoryQuantity(cartCargo, RESOURCE_IDS.herb);
    const resourceState = {
      wood: inventoryQuantity(inventory, RESOURCE_IDS.wood),
      iron: inventoryQuantity(inventory, RESOURCE_IDS.iron),
      food: inventoryQuantity(inventory, RESOURCE_IDS.food) + cargoFood,
      herb: inventoryQuantity(inventory, RESOURCE_IDS.herb) + cargoHerb,
      cart: retreatCart
    };
    const ready = storyState.retreatReadiness?.ready
      ?? (resourceState.food >= 20 && resourceState.herb >= 8 && retreatCart.available && !retreatCart.destroyed);
    return {
      storyState,
      cityStates,
      coreCityState,
      cityState: coreCityState,
      warState,
      battleModeStats: {
        eligibleBattleIds,
        observeCount: modeValues.filter(mode => mode === 'observe').length,
        interventionCount: modeValues.filter(mode => mode === 'intervene').length,
        allOptionalBattlesObserved: modeValues.length > 0 && modeValues.every(mode => mode === 'observe')
      },
      retreatReadiness: { ready: !!ready },
      hiddenInputs: {
        cumulativeGathering,
        cityMaintenanceLevel: Math.max(0, Number(storyState.endingInputs?.cityMaintenanceLevel) || completedStructures),
        allowedCityDestruction: storyState.endingInputs?.allowedCityDestruction === true,
        resourceConstructionScore: Math.max(0, Math.floor(Number(
          storyState.endingInputs?.resourceConstructionScore ?? completedStructures
        ) || 0))
      },
      retreatCart,
      resourceState
    };
  },

  _readEndingRuntimeState() {
    return this._readS13S14State();
  },

  _writeEndingRuntimeState(state = {}) {
    const blackboard = this.gameLoader?.blackboard;
    if (!blackboard || !state.storyState) return false;
    const story = clone(state.storyState);
    if (story.endingId) story.unlockedEndings = [...new Set([...(story.unlockedEndings || []), story.endingId])];
    blackboard.set('storyState', story);
    return true;
  },

  _projectEndingInput(state = {}) {
    const normalized = this.s13s14Coordinator?.normalizeEndingSnapshot?.() || {};
    const story = state.storyState || normalized.storyState || {};
    const modes = story.battleModes || {};
    const eligibleIds = state.battleModeStats?.eligibleBattleIds || normalized.battleModeStats?.eligibleBattleIds
      || Object.keys(modes);
    const selectedModes = eligibleIds.map(id => modes[id]).filter(mode => ['observe', 'intervene'].includes(mode));
    const observed = selectedModes.filter(mode => mode === 'observe').length;
    const intervened = selectedModes.filter(mode => mode === 'intervene').length;
    const cumulative = state.hiddenInputs?.cumulativeGathering || normalized.hiddenInputs?.cumulativeGathering || {};
    const totalGathered = Object.values(cumulative).reduce((total, value) => total + Math.max(0, Math.floor(Number(value) || 0)), 0);
    const damage = clamp(state.coreCityState?.damageRatio ?? state.cityState?.damageRatio
      ?? normalized.cityState?.coreDamageRatio, 0, 1);
    const constructionScore = Math.max(0, Math.floor(Number(
      state.hiddenInputs?.resourceConstructionScore ?? normalized.hiddenInputs?.resourceConstructionScore
    ) || 0));
    return {
      storyState: clone(story),
      cityState: { coreCityId: state.coreCityState?.id || normalized.cityState?.coreCityId || null, coreDamageRatio: damage },
      warState: clone(state.warState || normalized.warState || {}),
      heroStates: {
        primary: [
          { id: 'hero.zhang_liang', alive: story.zhangLiangSurvived === true },
          { id: 'hero.zhang_bao', alive: story.zhangBaoSurvived === true }
        ],
        support: [
          { id: 'hero.bocai', alive: story.bocaiSurvived === true },
          { id: 'hero.zhang_mancheng', alive: story.zhangManchengSurvived === true }
        ]
      },
      battleModeStats: { optionalBattles: selectedModes.length, observed, intervened },
      retreatReadiness: !!(state.retreatReadiness?.ready ?? normalized.retreatReadiness?.ready),
      hiddenInputs: {
        totalGathered,
        cityMaintenanceLevel: Math.max(0, Number(
          state.hiddenInputs?.cityMaintenanceLevel ?? normalized.hiddenInputs?.cityMaintenanceLevel
        ) || 0),
        resourceConstructionScore: constructionScore,
        allOptionalBattlesObserved: selectedModes.length > 0 && observed === selectedModes.length,
        cityDamageNeglected: state.hiddenInputs?.allowedCityDestruction === true || damage >= 0.6,
        scorchedEarthChosen: story.scorchedEarthChoice === true
      }
    };
  },

  async resolveS14LastCart() {
    if (this.currentSceneId !== 'S14') return false;
    this._ensureS14VehicleEntities?.();
    const result = await this.s13s14Coordinator?.commitResourceDivergence?.('cart', this._endingConfig);
    if (!result?.ok) {
      this._showScreenTip(`马车结果无法冻结：${result?.missingPaths?.join('、') || result?.code || 'unknown'}`, { title: '资源状态不完整' });
      return false;
    }
    this._showScreenTip(result.result.subtitle, { title: result.result.resultId === 'cart-breakout' ? '最后的马车可以突围' : '马车无法突围' });
    return true;
  },

  async resolveS14Catapult() {
    if (this.currentSceneId !== 'S14') return false;
    this._ensureS14VehicleEntities?.();
    const result = await this.s13s14Coordinator?.commitResourceDivergence?.('catapult', this._endingConfig);
    if (!result?.ok) {
      this._showScreenTip(`投石车结果无法冻结：${result?.missingPaths?.join('、') || result?.code || 'unknown'}`, { title: '资源状态不完整' });
      return false;
    }
    this._showScreenTip(result.result.subtitle, { title: result.result.resultId === 'catapult-ready' ? '投石车组装完成' : '投石车无法组装' });
    return true;
  },

  openS14FinalDoctrine() {
    if (this.currentSceneId !== 'S14' || !this.irreversibleChoiceView) return false;
    const story = this.gameLoader?.blackboard?.get?.('storyState') || {};
    if (story.s14FinalDoctrine?.committed === true) {
      const label = story.s14FinalDoctrine.choiceId === 'scorched' ? '焦土断后' : '保全残部';
      this._showScreenTip(`终局方略已锁定为“${label}”。`, { title: '方略已冻结' });
      return true;
    }
    this.irreversibleChoiceView.open({
      title: '结局之地·最后方略',
      description: '这项选择会进入结局快照。焦土断后只在城市已重损且营建投入足够时触发隐藏结局。',
      allowCancel: true,
      selectedId: 'preserve',
      choices: [
        { id: 'preserve', label: '保全残部', consequences: ['不再扩大城市损毁', '带现有资源与幸存者撤离'] },
        { id: 'scorched', label: '焦土断后', consequences: ['焚毁无法带走的粮仓', '记录焦土选择', '不可撤回'] }
      ]
    });
    return true;
  },

  async _handleS14FinalDoctrineCommand(command = {}) {
    if (command.type === 'cancel') {
      this.irreversibleChoiceView?.close?.();
      return true;
    }
    if (command.type !== 'selectChoice' || !['preserve', 'scorched'].includes(command.choiceId)) return false;
    const blackboard = this.gameLoader?.blackboard;
    const beforeStory = clone(blackboard?.get?.('storyState') || {});
    if (!blackboard) return false;
    if (beforeStory.s14FinalDoctrine?.committed === true) return this.openS14FinalDoctrine();
    const choiceId = command.choiceId;
    const endingInputs = clone(beforeStory.endingInputs || {});
    if (choiceId === 'scorched') endingInputs.allowedCityDestruction = true;
    const draft = {
      ...beforeStory,
      endingInputs,
      scorchedEarthChoice: choiceId === 'scorched',
      s14FinalDoctrine: {
        committed: true,
        choiceId,
        operationId: `story:S14:finalDoctrine:${choiceId}`
      },
      lastCheckpointId: 'checkpoint.S14.finalDoctrine'
    };
    this.irreversibleChoiceView?.setBusy?.(true);
    blackboard.set('storyState', draft);
    try {
      const saved = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: draft.lastCheckpointId, sceneId: 'S14'
      });
      if (!saved?.ok) throw new Error(saved?.message || 'checkpointRejected');
      this.irreversibleChoiceView?.close?.();
      this._showScreenTip(
        choiceId === 'scorched' ? '无法带走的粮仓已经点燃，焦土方略进入结局快照。' : '你下令停止焚毁，优先保全残部。',
        { title: choiceId === 'scorched' ? '焦土断后' : '保全残部' }
      );
      return true;
    } catch (error) {
      blackboard.set('storyState', beforeStory);
      this._showScreenTip(`终局方略保存失败：${error?.message || error}，选择已回滚。`, { title: '提交失败' });
      return false;
    } finally {
      this.irreversibleChoiceView?.setBusy?.(false);
    }
  },

  async commitS14Ending(options = {}) {
    if (this.currentSceneId !== 'S14' || !this.endingSystem || !this.endingPresentationView) return false;
    const story = this.gameLoader?.blackboard?.get?.('storyState') || {};
    if (story.s14FinalDoctrine?.committed !== true) {
      this.openS14FinalDoctrine();
      return false;
    }
    if (story.s14ResourceDivergence?.completed !== true) {
      this._showScreenTip('先分别检查最后的马车和投石车，冻结两项资源分歧。', { title: '终局状态尚未完整' });
      return false;
    }
    this.endingPresentationView.setBusy?.(true);
    const result = await this.endingSystem.resolveEnding({
      checkpointId: options.checkpointId || 'checkpoint.S14.preEnding'
    });
    this.endingPresentationView.setBusy?.(false);
    if (!result?.ok) {
      this._showScreenTip(`结局冻结失败：${result?.path ? `${result.path} ` : ''}${result?.code || 'unknown'}`, { title: '结局输入不完整' });
      return false;
    }
    const metadata = this._endingConfig?.endings?.find(ending => ending.id === result.endingId);
    if (!metadata) {
      this._showScreenTip(`结局元数据缺失：${result.endingId}`, { title: '演出不可用' });
      return false;
    }
    const input = result.snapshot?.input || {};
    const reviewLines = [
      `职业：${input.storyState?.classId || '未记录'}`,
      `豫州路线：${input.storyState?.yuzhouRoute?.routeId || input.storyState?.routeId || '未记录'}`,
      `张梁：${input.heroStates?.primary?.[0]?.alive ? '存活' : '死亡'}；张宝：${input.heroStates?.primary?.[1]?.alive ? '存活' : '死亡'}`,
      `波才：${input.heroStates?.support?.[0]?.alive ? '存活' : '死亡'}；张曼成：${input.heroStates?.support?.[1]?.alive ? '存活' : '死亡'}`,
      `观战 ${input.battleModeStats?.observed || 0} 场，介入 ${input.battleModeStats?.intervened || 0} 场`,
      `城市最终损毁：${Math.round((input.cityState?.coreDamageRatio || 0) * 100)}%`,
      `累计采集：${input.hiddenInputs?.totalGathered || 0}`
    ];
    this.endingPresentationView.open({ snapshot: result.snapshot, ending: metadata, reviewLines });
    return true;
  },

  async _handleEndingPresentationCommand(command = {}) {
    if (!this.endingPresentationView?.visible) return false;
    if (command.type === 'close') {
      this.endingPresentationView.close();
      return true;
    }
    if (command.type === 'returnTitle') {
      const manager = this.sceneManager || globalThis.window?.gameEngine?.sceneManager;
      if (!manager?.scenes?.has?.('Login')) {
        this._showScreenTip('标题场景尚未注册，当前结局演出保持打开。', { title: '无法返回标题' });
        return false;
      }
      this.endingPresentationView.close();
      manager.switchTo('Login');
      return true;
    }
    if (command.type === 'loadPreEndingSave') {
      this.endingPresentationView.setBusy?.(true);
      const loaded = await this.requestCheckpointLoad?.('checkpoint.S14.preEnding');
      this.endingPresentationView.setBusy?.(false);
      if (!loaded?.ok) {
        const message = loaded?.code === 'checkpointNotFound'
          ? '三个自动存档中已找不到结局前检查点。'
          : (loaded?.message || loaded?.errors?.[0]?.message || '宿主无法读取结局前检查点。');
        this._showScreenTip(message, { title: '读取失败' });
        return false;
      }
      this.endingPresentationView.close();
      this._showScreenTip('已恢复到结局演出开始前。', { title: '读取成功' });
      return true;
    }
    if (command.type === 'viewUnlockedEndings') {
      const unlocked = this.gameLoader?.blackboard?.get?.('storyState')?.unlockedEndings || [];
      this._showScreenTip(unlocked.length ? `已解锁：${unlocked.join('、')}` : '尚无已解锁结局。', { title: '结局图鉴' });
      return true;
    }
    return false;
  },

  _createEndingInputContext({ inputManager, gamepad } = {}) {
    const key = name => inputManager?.isKeyPressed?.(name) === true;
    const button = index => gamepad?.isButtonPressed?.(index) === true;
    return {
      inputManager,
      gamepad,
      viewWidth: this.logicalWidth,
      viewHeight: this.logicalHeight,
      isActionPressed: action => {
        const actions = {
          confirm: () => key('e') || key('enter') || button(PadButton.A) || button(PadButton.X),
          dialogueContinue: () => key('e') || key('enter') || button(PadButton.A) || button(PadButton.X),
          modalCancel: () => key('escape') || button(PadButton.B) || button(PadButton.RS),
          skip: () => key('space') || key('tab') || button(PadButton.Y),
          left: () => key('left') || button(PadButton.DPAD_LEFT),
          previous: () => key('left') || button(PadButton.DPAD_LEFT),
          right: () => key('right') || button(PadButton.DPAD_RIGHT),
          next: () => key('right') || button(PadButton.DPAD_RIGHT)
        };
        return actions[action]?.() === true;
      }
    };
  },

  _captureS11S14SceneState() {
    return {
      s11s12CoordinatorState: this.s11s12Coordinator?.serialize?.() || null,
      s12GateState: this._s12GateEntity?.getComponent?.('building')?.serialize?.() || null,
      endingSystemState: this.endingSystem?.serialize?.() || null,
      vehicleLogisticsState: this.vehicleLogisticsSystem?.serialize?.() || null,
      s14VehicleStates: this._captureS14VehicleStates?.() || [],
      s13PendingSettlement: clone(this._s13PendingSettlement)
    };
  },

  _validateS11S14SceneState(data = {}) {
    if (data.s11s12CoordinatorState) {
      const checked = this.s11s12Coordinator?.validateSerialized?.(data.s11s12CoordinatorState);
      if (!checked?.ok) return { ok: false, errors: [{ code: checked?.code || 'invalidSnapshot', path: 's11s12CoordinatorState' }] };
    }
    if (data.endingSystemState) {
      const probe = new EndingSystem();
      const checked = probe.deserialize(data.endingSystemState);
      if (!checked.ok) return { ok: false, errors: [{ code: checked.code, path: `endingSystemState.${checked.path || ''}`.replace(/\.$/, '') }] };
    }
    if (data.s12GateState) {
      const gate = data.s12GateState;
      if (!Number.isFinite(Number(gate.hp)) || !Number.isFinite(Number(gate.maxHp))
        || Number(gate.hp) < 0 || Number(gate.maxHp) <= 0 || Number(gate.hp) > Number(gate.maxHp)) {
        return { ok: false, errors: [{ code: 'invalidGateState', path: 's12GateState' }] };
      }
    }
    const vehicleCheck = this._validateS14VehicleStates?.(
      data.s14VehicleStates || [], data.vehicleLogisticsState || null
    );
    if (vehicleCheck?.ok === false) {
      return { ok: false, errors: [{ code: vehicleCheck.code, path: 's14VehicleStates' }] };
    }
    if (data.s13PendingSettlement && (data.s13PendingSettlement.schemaVersion !== 2
      || !['observe', 'intervene'].includes(data.s13PendingSettlement.mode)
      || !Array.isArray(data.s13PendingSettlement.entries)
      || typeof data.s13PendingSettlement.operationId !== 'string')) {
      return { ok: false, errors: [{ code: 'invalidS13PendingSettlement', path: 's13PendingSettlement' }] };
    }
    return { ok: true, errors: [] };
  },

  _restoreS11S14SceneState(data = {}) {
    const checked = this._validateS11S14SceneState(data);
    if (!checked.ok) return checked;
    if (data.s11s12CoordinatorState) {
      const restored = this.s11s12Coordinator.deserialize(data.s11s12CoordinatorState);
      if (!restored.ok) return { ok: false, errors: [{ code: restored.code, path: 's11s12CoordinatorState' }] };
    }
    if (data.endingSystemState) {
      const restored = this.endingSystem.deserialize(data.endingSystemState);
      if (!restored.ok) return { ok: false, errors: [{ code: restored.code, path: 'endingSystemState' }] };
    }
    this._s13PendingSettlement = clone(data.s13PendingSettlement);
    const vehicleRestore = this._restoreS14VehicleStates?.(
      data.s14VehicleStates || [], data.vehicleLogisticsState || null
    );
    if (vehicleRestore?.ok === false) {
      return { ok: false, errors: [{ code: vehicleRestore.code, path: 's14VehicleStates' }] };
    }
    if (data.s12GateState && this.currentSceneId === 'S12') {
      const gate = this._ensureS12GateEntity();
      if (!gate) return { ok: false, errors: [{ code: 'gateEntityUnavailable', path: 's12GateState' }] };
      gate.getComponent('building').deserialize(data.s12GateState);
    }
    return { ok: true, errors: [] };
  }
};

export function installS11S14SceneFlow(SceneClass) {
  if (typeof SceneClass !== 'function') throw new TypeError('SceneClass must be a constructor');
  for (const methods of [s11s12Methods, s13s14Methods]) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(methods))) {
      if (name === '__proto__') continue;
      if (Object.prototype.hasOwnProperty.call(SceneClass.prototype, name)) {
        throw new Error(`S11S14SceneFlow method conflict: ${name}`);
      }
      Object.defineProperty(SceneClass.prototype, name, descriptor);
    }
  }
  return SceneClass;
}

export default installS11S14SceneFlow;