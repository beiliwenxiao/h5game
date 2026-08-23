const SPECIAL_FAINT_LABELS = Object.freeze({
  passerby: '路人救援', patrol: '小股官兵救援', temporaryCamp: '临时扎营'
});

const CHASE_WOLF_PREFIX = 'S01-chase-wolf-';

/** P1.1/P1.3 S01 生存流程协调器；领域写入统一提交 canonical command。 */
export class S01S02Coordinator {
  constructor(scene) {
    if (!scene) throw new TypeError('S01S02Coordinator requires scene');
    this.scene = scene;
    this.sequence = 0;
    this.refuelCampfireInFlight = null;
    this.pendingAxeDiscovery = false;
    this.initialToolRevealPending = false;
    this.initialToolRevealRetryElapsed = 0;
    this.pendingWolfDiscovery = false;
    this.pendingClimb = false;
    this.pendingPlacementReveals = new Map();
    this.pendingRevealRetryElapsed = 0;
    this.pendingRevealRetryInFlight = false;
    this.s01WeatherPhaseInitialized = false;
  }

  _story() {
    return this.scene.gameLoader?.blackboard?.get?.('storyState') || {};
  }

  _submit(definitionId, payload = {}, operationId = null) {
    const gateway = this.scene.sceneRuntime?.commandGateway;
    const actorRef = this.scene.playerEntity?.id;
    if (!gateway || !actorRef) return Promise.resolve({ ok: false, code: 'commandGatewayUnavailable' });
    return gateway.execute({
      intentType: 'state.transaction', actorRef,
      operationId: operationId || `story:${definitionId}:${++this.sequence}`,
      payload: { definitionId, ...payload }
    });
  }

  _spawnGroup(group) {
    return this.scene.context.services.placements?.spawn?.({ group });
  }

  async _revealInitialToolKit() {
    const survival = this._story().s01Survival || {};
    const axe = survival.axeFound === true
      ? { ok: true, created: false }
      : await this._ensureSpawnedPlacement('S01-worn-axe', 'S01-pickup-worn-axe');
    if (!axe.ok) return false;
    const knife = survival.skinningKnifeFound === true
      ? { ok: true, created: false }
      : await this._ensureSpawnedPlacement('S01-skinning-knife', 'S01-pickup-skinning-knife');
    if (!knife.ok) return false;
    this.initialToolRevealPending = false;
    this.initialToolRevealRetryElapsed = 0;
    return this._presentS01PickupTutorial();
  }

  _presentS01PickupTutorial() {
    const tutorialFlow = this.scene._tutorialFlow;
    if (!tutorialFlow) {
      this.scene._showScreenTip('你发现了一些物品，{pickup}拾取。', { title: '发现物品' });
      return true;
    }
    if (tutorialFlow.isCompleted?.('s01.pickup') || tutorialFlow.isCurrent?.('s01.pickup')) return true;
    tutorialFlow.showNext?.();
    return tutorialFlow.isCurrent?.('s01.pickup') === true;
  }

  _applyS01WeatherPhase(survival = this._story().s01Survival || {}, { force = false } = {}) {
    if (this.scene.currentSceneId !== 'S01' || (this.s01WeatherPhaseInitialized && !force)) return false;
    const overnightCompleted = survival.overnightCompleted === true;
    this.scene.timeSystem?.setTimePeriod?.(overnightCompleted ? 'morning' : 'night');
    this.scene.weatherSystem?.setWeather?.(overnightCompleted ? 'clear' : 'heavyFog', { immediate: true });
    this.s01WeatherPhaseInitialized = true;
    return true;
  }

  _activateFirstWolf(wolf = this.scene.entityStore?.getById?.('S01-first-wolf-1')) {
    const player = this.scene.playerEntity;
    if (!wolf || !player || wolf.isDead || wolf.isDying) return false;
    const combat = wolf.getComponent?.('combat');
    if (!combat || this.scene.aiSystem?.activateAI?.(wolf, 'aggressive') !== true) return false;
    if (!combat.hasTarget?.() || combat.target !== player) combat.setTarget?.(player);
    return true;
  }

  _createFirstWolfContinuation() {
    return {
      mode: 'spawnContinuation',
      group: 'S01-first-wolf',
      placementId: 'S01-first-wolf-1',
      attempts: 0,
      onRecovered: wolf => {
        if (!this._activateFirstWolf(wolf)) return false;
        return this._presentFirstWolfAttackTutorial();
      }
    };
  }

  _presentFirstWolfAttackTutorial() {
    this.scene._tutorialFlow?.complete?.('s01.chopWood');
    this.scene._showScreenTip('第三份木材投入火堆后，火光引来一只饥饿野狼！{attack}反击。', {
      title: '野狼来袭', persist: true
    });
    return true;
  }

  async _spawnFirstWolfAfterThirdRefuel() {
    if (this.pendingWolfDiscovery) return true;
    this.pendingWolfDiscovery = true;
    try {
      const survival = this._story().s01Survival || {};
      if (survival.firstWolfSpotted !== true) {
        if (survival.campfireLit !== true || Number(survival.campfireRefuelCount) < 3) return false;
        const result = await this._submit('story.s01.firstWolfSpotted', {}, 'story:s01:first-wolf-spotted:v2');
        if (result.ok !== true) return false;
      }

      const continuation = this._createFirstWolfContinuation();
      const placement = await this._ensureSpawnedPlacement(continuation.group, continuation.placementId);
      if (!placement.ok) {
        this._rememberPendingReveal(continuation);
        console.warn('[S01S02Coordinator] 第三次添柴后野狼放置进入退避补偿', placement);
        return true;
      }
      if (!this._activateFirstWolf(placement.target)) {
        this._rememberPendingReveal(continuation);
        console.warn('[S01S02Coordinator] 首狼已生成但主动攻击未能激活，进入退避补偿');
        return true;
      }
      this.pendingPlacementReveals.delete(continuation.placementId);
      return this._presentFirstWolfAttackTutorial();
    } finally {
      this.pendingWolfDiscovery = false;
    }
  }

  async _ensureSpawnedPlacement(group, placementId) {
    let result;
    try {
      result = await this._spawnGroup(group);
    } catch (error) {
      return { ok: false, code: 'placementSpawnFailed', error, result: null };
    }
    const spawnedTarget = (result?.entities || []).find(
      entity => entity?.placementId === placementId || entity?.id === placementId
    ) || null;
    const existingTarget = this.scene.entityStore?.getById?.(placementId) || null;
    const target = spawnedTarget || existingTarget;
    if (result?.ok !== true || (result.errors || []).length > 0 || !target) {
      return { ok: false, code: 'placementNotReady', result, target: null };
    }
    return {
      ok: true,
      created: Number(result?.counts?.total) > 0 && Boolean(spawnedTarget),
      result,
      target
    };
  }

  _presentS01GatherTutorial() {
    if (this._story().s01Survival?.initialToolsPicked !== true) return false;
    const tutorialFlow = this.scene._tutorialFlow;
    if (!tutorialFlow) {
      this.scene._showScreenTip('火光驱散寒意，你却听见肚子咕咕作响。靠近野果丛，{harvest}徒手采集野果。', {
        title: '寻找食物'
      });
      return true;
    }
    if (tutorialFlow.isCompleted?.('s01.gather') || tutorialFlow.isCurrent?.('s01.gather')) return true;
    tutorialFlow.showNext?.();
    return tutorialFlow.isCurrent?.('s01.gather') === true;
  }

  _presentS01WoodGatherTutorial() {
    if (this._story().s01Survival?.berriesGathered !== true) return false;
    const tutorialFlow = this.scene._tutorialFlow;
    if (!tutorialFlow) {
      this.scene._showScreenTip('靠近枯木，{harvest}用破旧斧头砍柴，为篝火添燃料。', {
        title: '收集燃料'
      });
      return true;
    }
    if (tutorialFlow.isCompleted?.('s01.chopWood') || tutorialFlow.isCurrent?.('s01.chopWood')) return true;
    if (!tutorialFlow.isCompleted?.('s01.gather')) return false;
    tutorialFlow.showNext?.();
    return tutorialFlow.isCurrent?.('s01.chopWood') === true;
  }

  _presentS01WoodGatherMotivation() {
    return this.scene._showScreenTip(
      '篝火燃料不多了。先砍些枯木，再回火堆添柴。',
      {
        title: '燃料即将耗尽',
        onHidden: () => this._presentS01WoodGatherTutorial()
      }
    );
  }

  _createWoodGatherContinuation() {
    return {
      mode: 'spawnContinuation',
      group: 'S01-wood',
      placementId: 'S01-node-wood-1',
      attempts: 0,
      onRecovered: () => this._presentS01WoodGatherTutorial()
    };
  }

  deferS01WoodGatherTutorialRecovery() {
    const tutorialFlow = this.scene._tutorialFlow;
    const survival = this._story().s01Survival || {};
    const needsRecovery = this.scene.currentSceneId === 'S01'
      && tutorialFlow
      && survival.berriesGathered === true
      && survival.woodGathered !== true
      && tutorialFlow.isCompleted?.('s01.gather') === true
      && tutorialFlow.isCompleted?.('s01.chopWood') !== true
      && tutorialFlow.isCurrent?.('s01.chopWood') !== true;
    if (!needsRecovery) return false;
    if (!this.pendingPlacementReveals.has('S01-node-wood-1')) {
      this._rememberPendingReveal(this._createWoodGatherContinuation());
    }
    return true;
  }

  _createCampfireContinuation() {
    return {
      mode: 'spawnContinuation',
      group: 'S01-berries',
      placementId: 'S01-node-berry-1',
      attempts: 0,
      onRecovered: () => this._presentS01GatherTutorial()
    };
  }

  _rememberPendingReveal(request) {
    const previous = this.pendingPlacementReveals.get(request.placementId);
    this.pendingPlacementReveals.set(request.placementId, {
      ...request,
      attempts: previous?.attempts || request.attempts || 0
    });
  }

  async _revealPlacement(group, placementId, payload = {}, operationId = null, options = {}) {
    const pending = this.pendingPlacementReveals.get(placementId);
    const request = {
      group,
      placementId,
      payload,
      operationId: operationId || `world-item:revealed:${placementId}`,
      target: pending?.target || null,
      onRecovered: pending?.onRecovered || options.onRecovered || null,
      revealed: pending?.revealed === true,
      attempts: pending?.attempts || 0
    };
    if (request.revealed) {
      this.pendingPlacementReveals.delete(placementId);
      return true;
    }
    let target = request.target;
    if (!target) {
      let result;
      try {
        result = await this._spawnGroup(group);
      } catch (error) {
        this._rememberPendingReveal(request);
        console.warn('[S01S02Coordinator] 物品放置执行失败', { group, placementId, error });
        return false;
      }
      target = result?.entities?.find?.(
        entity => entity?.placementId === placementId || entity?.id === placementId
      ) || null;
      if (result?.ok !== true || (result.errors || []).length > 0
        || Number(result?.counts?.total) <= 0 || !target) {
        this._rememberPendingReveal(request);
        console.warn('[S01S02Coordinator] 物品放置未完整成立', { group, placementId, result });
        return false;
      }
      request.target = target;
    }

    const position = target.getComponent?.('transform')?.position || target;
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
      this._rememberPendingReveal(request);
      console.warn('[S01S02Coordinator] 物品放置缺少世界坐标', { group, placementId });
      return false;
    }

    let published;
    try {
      published = await this.scene.publishApplicationEvent?.('worldItem.revealed', {
        placementId,
        entityId: target.entityId || target.id || null,
        groundId: target.entityId || target.id || placementId,
        definitionId: target.definitionId || target.itemId || target.id || null,
        name: target.name || payload.name || '物品',
        position: { x: position.x, y: position.y },
        reason: payload.reason || 'discovery',
        ...payload
      }, {
        operationId: request.operationId,
        sceneId: this.scene.currentSceneId
      });
    } catch (error) {
      this._rememberPendingReveal(request);
      console.warn('[S01S02Coordinator] 物品发现事件发布异常', placementId, error);
      return false;
    }
    if (published?.ok !== true) {
      this._rememberPendingReveal(request);
      console.warn('[S01S02Coordinator] 物品发现事件发布失败', placementId, published?.code);
      return false;
    }
    this.pendingPlacementReveals.delete(placementId);
    return true;
  }

  async _retryPendingPlacementReveal() {
    if (this.pendingRevealRetryInFlight || this.pendingPlacementReveals.size === 0) return false;
    const request = this.pendingPlacementReveals.values().next().value;
    request.attempts += 1;
    this.pendingPlacementReveals.set(request.placementId, request);
    this.pendingRevealRetryInFlight = true;
    try {
      if (request.mode === 'spawnContinuation') {
        const placement = await this._ensureSpawnedPlacement(request.group, request.placementId);
        if (!placement.ok) {
          this._rememberPendingReveal(request);
          return false;
        }
        if (request.onRecovered) {
          try {
            const recovered = await request.onRecovered(placement.target);
            if (recovered === false) {
              this._rememberPendingReveal(request);
              return false;
            }
          } catch (error) {
            this._rememberPendingReveal(request);
            console.warn('[S01S02Coordinator] 放置后续补偿异常', request.placementId, error);
            return false;
          }
        }
        this.pendingPlacementReveals.delete(request.placementId);
        return true;
      }
      if (request.revealed !== true) {
        const revealed = await this._revealPlacement(
          request.group,
          request.placementId,
          request.payload,
          request.operationId,
          { onRecovered: request.onRecovered }
        );
        if (!revealed) return false;
        request.revealed = true;
      }
      if (request.onRecovered) {
        try {
          const recovered = await request.onRecovered();
          if (recovered === false) {
            this._rememberPendingReveal(request);
            return false;
          }
        } catch (error) {
          this._rememberPendingReveal(request);
          console.warn('[S01S02Coordinator] 物品发现后续补偿异常', request.placementId, error);
          return false;
        }
      }
      this.pendingPlacementReveals.delete(request.placementId);
      return true;
    } finally {
      this.pendingRevealRetryInFlight = false;
    }
  }

  resolve() {
    const story = this._story();
    return story.pendingDefeatResolution === 'specialFaint'
      ? { type: 'specialFaint', rescueType: story.specialFaintRescueType || 'passerby' }
      : { type: 'normalDeath' };
  }

  handleResolved(result = {}) {
    if (result.type !== 'specialFaint') return false;
    const label = SPECIAL_FAINT_LABELS[result.rescueType] || SPECIAL_FAINT_LABELS.passerby;
    const location = result.respawnPosition?.label || '安全处';
    this.scene._showScreenTip(`${label}：你在${location}醒来，未扣除资源，也未生成遗失物资`);
    return true;
  }

  async handleGatheringEvent(event, data = {}) {
    if (this.scene.currentSceneId !== 'S01') return false;
    const isBerry = data.itemId === 'resource.wild_berry';
    const isWolfHide = data.itemId === 'resource.wolf_hide';
    if (event !== 'completed') return false;
    if (isBerry) {
      const gatheringOperationId = data.operationId || data.gatheringOperationId
        || `node:${data.nodeId || data.entityId || 'wild-berry'}:${++this.sequence}`;
      const counted = await this._submit(
        'story.s01.berryGathered',
        {},
        `story:s01:berry-gathered:${gatheringOperationId}`
      );
      if (counted.ok !== true) return false;

      const berryGatherCount = Math.max(0, Math.floor(Number(this._story().s01Survival?.berryGatherCount) || 0));
      const berryCount = Math.max(0, Number(data.accepted) || 0);
      this.scene._showScreenTip(`荒野酸果 ×${berryCount} 已放入背包。`, { title: '采集完成' });
      if (berryGatherCount < 2) return true;
      const completed = await this._submit('story.s01.berriesGathered', {}, 'story:s01:berries-gathered');
      if (completed.ok !== true) return false;
      await this.onBerriesGatheredCommitted();
      return true;
    }
    if (data.resourceType === 'wood') {
      const inventory = this.scene.playerEntity?.getComponent?.('inventory');
      const woodCount = Math.max(0, Number(inventory?.getItemCount?.('resource.wood')) || 0);
      if (woodCount < 3) return true;
      const result = await this._submit('story.s01.woodGathered', {}, 'story:s01:wood-gathered');
      if (result.ok) {
        this.scene._showScreenTip('木材已经够三根了。靠近火堆，{interact}可以添柴。', {
          title: '返回火堆'
        });
      }
      return result.ok === true;
    }
    if (isWolfHide) {
      const result = await this._submit('story.s01.wolfSkinned', {}, 'story:s01:wolf-skinned');
      if (result.ok) {
        this.scene._showScreenTip('狼皮已收好。带上木材，到制作点做一个六格小背包。', { title: '获得狼皮' });
      }
      return result.ok === true;
    }
    return false;
  }

  async onInitialToolsPickedCommitted() {
    if (this.scene.currentSceneId !== 'S01'
      || this._story().s01Survival?.initialToolsPicked !== true) return false;
    this.scene._tutorialFlow?.complete?.('s01.pickup');
    const fuelStarted = this.scene._campfireService?.startFuelCountdown?.() === true;
    const continuation = this._createCampfireContinuation();
    const placement = await this._ensureSpawnedPlacement(continuation.group, continuation.placementId);
    if (!placement.ok) {
      this._rememberPendingReveal(continuation);
      console.warn('[S01S02Coordinator] 双工具拾取后野果放置进入退避补偿', placement);
      return fuelStarted;
    }
    this.pendingPlacementReveals.delete(continuation.placementId);
    if (!this._presentS01GatherTutorial()) this._rememberPendingReveal(continuation);
    return true;
  }

  async onBerriesGatheredCommitted() {
    if (this.scene.currentSceneId !== 'S01'
      || this._story().s01Survival?.berriesGathered !== true) return false;
    this.scene._tutorialFlow?.complete?.('s01.gather');
    const fuelStarted = this.scene._campfireService?.startFuelCountdown?.() === true;
    const continuation = this._createWoodGatherContinuation();
    const placement = await this._ensureSpawnedPlacement(continuation.group, continuation.placementId);
    if (!placement.ok) {
      this._rememberPendingReveal(continuation);
      console.warn('[S01S02Coordinator] 野果采集完成后木材放置进入退避补偿', placement);
      return fuelStarted;
    }
    this.pendingPlacementReveals.delete(continuation.placementId);
    this._presentS01WoodGatherMotivation();
    return true;
  }

  async handleItemUsed(item = {}) {
    if (this.scene.currentSceneId !== 'S01') return false;
    if (item.id === 'resource.wild_berry') {
      const result = await this._submit('story.s01.berryEaten', {}, 'story:s01:berry-eaten');
      return result.ok === true;
    }
    if (item.id === 'food.roasted_wolf_meat') {
      this.scene._showScreenTip('烤狼肉恢复了生命。剩下的木材足够在篝火旁搭一座小庇护所。', {
        title: '恢复生命'
      });
      return true;
    }
    return false;
  }

  async handleEnemyKilled(entity) {
    if (this.scene.currentSceneId !== 'S01' || !entity?.id) return false;
    if (entity.id === 'S01-first-wolf-1') {
      const result = await this._submit('story.s01.firstWolfKilled', {}, 'story:s01:first-wolf-killed');
      if (!result.ok) return false;
      const corpse = this.context.services.corpses?.capture?.(entity);
      if (!corpse || !entity.getComponent?.('resourceNode')) return false;
      this.scene._showScreenTip('野狼倒下了。背包里有剥皮刀时，靠近尸体，{harvest}剥取狼皮。', {
        title: '猎狼与剥皮'
      });
      return true;
    }
    if (!entity.id.startsWith(CHASE_WOLF_PREFIX)) return false;
    const result = await this._submit('story.s01.chase.kill', { wolfId: entity.id }, `story:s01:chase-kill:${entity.id}`);
    if (result.ok) await this._reconcileWolfPursuit();
    return result.ok === true;
  }

  async _reconcileWolfPursuit() {
    const pursuit = this._story().s01Survival?.pursuit || {};
    const count = Math.min(20, Math.max(0, Math.floor(Number(pursuit.spawned) || 0)));
    if (count <= 0) return true;
    const placementIds = Array.from({ length: count }, (_, index) => `${CHASE_WOLF_PREFIX}${index + 1}`);
    await this.scene.context.services.placements?.spawn?.({ placementIds });
    return true;
  }

  async handleConstructionEvent(event, data = {}) {
    const siteId = data?.siteId || data?.structure?.siteId;
    if (this.scene.currentSceneId !== 'S01' || event !== 'constructionCompleted'
      || siteId !== 'site.s01.small_shelter') return false;
    const rollback = this.pendingConstructionRollback;
    const result = await this._submit('story.s01.shelterCompleted', {}, 'story:s01:shelter-completed');
    this.pendingConstructionRollback = null;
    if (!result.ok) {
      this.scene.s10ConstructionCoordinator?._restoreConstructionRollback?.(rollback);
      this.scene._showScreenTip('庇护所结算失败，材料和施工状态已经回滚。', { title: '施工回滚' });
      return false;
    }
    await this._spawnGroup('S01-small-shelter');
    this.scene._showScreenTip('小庇护所搭好了。烤肉、木墙和余火让你终于可以熬过这一夜。', {
      title: '庇护所完成'
    });
    return true;
  }

  async startShelterConstruction() {
    if (this.scene.currentSceneId !== 'S01' || !this.scene.constructionSystem) return false;
    const survival = this._story().s01Survival || {};
    if (!survival.backpackCrafted || !survival.meatCooked) {
      this.scene._showScreenTip('先制作六格小背包并烤好狼肉，再用木材搭建庇护所。', { title: '准备不足' });
      return false;
    }
    const siteId = 'site.s01.small_shelter';
    if (this.scene.constructionSystem.getStructure(siteId)) {
      this.scene._showScreenTip('小庇护所已经搭好，可以在这里过夜。');
      return true;
    }
    const pending = this.scene.constructionSystem.getPending(siteId);
    if (pending) {
      this.scene._showScreenTip(`庇护所施工进度 ${Math.floor(pending.progress * 100)}%。`, { title: '正在施工' });
      return true;
    }
    const inventory = this.scene.playerEntity?.getComponent?.('inventory');
    const operationId = 'construction:S01:smallShelter';
    const rollback = this.scene.s10ConstructionCoordinator?._captureConstructionRollback?.();
    const result = this.scene.constructionSystem.start({
      characterId: this.scene.playerEntity?.id,
      inventory,
      definitionId: 'construction.s01.small_shelter',
      siteId,
      operationId,
      context: { sceneId: 'S01' }
    });
    if (!result.ok) {
      const messages = {
        materialsRequired: `木材不足：还需要 ${result.quantity || 1} 份。`,
        invalidSite: '只能在篝火旁的平地搭建小庇护所。',
        constructionSiteLocked: '小庇护所施工点尚未开放。'
      };
      this.scene._showScreenTip(messages[result.code] || `无法施工：${result.code || 'unknown'}`, { title: '施工未开始' });
      return false;
    }
    const saved = await this.scene.requestAutoSave?.({
      reason: 'checkpoint', checkpointId: 'checkpoint.S01.shelterStarted', sceneId: 'S01'
    });
    if (saved?.ok === false) {
      this.scene.s10ConstructionCoordinator?._restoreConstructionRollback?.(
        rollback, [`${operationId}:materials`]
      );
      this.scene._showScreenTip('施工检查点保存失败，材料和施工状态已经回滚。', { title: '施工回滚' });
      return false;
    }
    this.scene._showScreenTip(`开始搭建小庇护所，预计 ${Math.ceil(result.duration)} 秒完成。`, {
      title: '搭建庇护所'
    });
    return true;
  }

  refuelCampfire() {
    if (this.refuelCampfireInFlight) return this.refuelCampfireInFlight;
    const pending = this._refuelCampfireOnce().finally(() => {
      if (this.refuelCampfireInFlight === pending) this.refuelCampfireInFlight = null;
    });
    this.refuelCampfireInFlight = pending;
    return pending;
  }

  async _refuelCampfireOnce() {
    if (this.scene.currentSceneId !== 'S01') return false;
    const survival = this._story().s01Survival || {};
    if (survival.firstWolfSpotted === true) return { ok: true, status: 'blocked' };
    if (Number(survival.campfireRefuelCount) >= 3) {
      const wolfSpawned = await this._spawnFirstWolfAfterThirdRefuel();
      if (wolfSpawned) return { ok: true, recovered: true };
      this.scene._showScreenTip('篝火已经添足木材，野狼暂时没有出现，请稍后重试。', {
        title: '野狼未出现'
      });
      return { ok: false, code: 'firstWolfSpawnFailed' };
    }
    const fuel = this.scene._campfireService;
    if (fuel?.canAddFuelUnits?.(1) !== true) {
      this.scene._showScreenTip('篝火燃料已满，暂时不需要再添木材。', { title: '无需添柴' });
      return { ok: true, status: 'blocked' };
    }
    const inventory = this.scene.playerEntity?.getComponent?.('inventory');
    if (!inventory?.getItemCount || inventory.getItemCount('resource.wood') < 1) {
      this.scene._showScreenTip('背包里没有可用木材，先用破旧斧头砍些枯木。', { title: '木材不足' });
      return { ok: true, status: 'blocked' };
    }
    const result = await this._submit('story.s01.refuelCampfire', {}, `story:s01:refuel:${++this.sequence}`);
    if (result.ok !== true) {
      this.scene._showScreenTip(`添柴结算失败：${result.code || 'unknown'}。木材没有被消耗。`, { title: '添柴失败' });
      return result;
    }
    // 容量已在提交前预检；失败不回滚已提交木材，而是保留明确诊断。
    if (fuel.addFuelUnits(1) !== true) {
      console.error('[S01S02Coordinator] 添柴事务已提交但燃料投影未写入');
      return { ok: true, warning: 'fuelProjectionFailed' };
    }
    this.scene._showScreenTip('你把一份枯木投入火堆，火焰又旺了一些。', { title: '添柴成功' });
    const updatedSurvival = this._story().s01Survival || {};
    if (Number(updatedSurvival.campfireRefuelCount) >= 3) {
      const wolfSpawned = await this._spawnFirstWolfAfterThirdRefuel();
      if (!wolfSpawned) {
        console.warn('[S01S02Coordinator] 三次添柴后未能生成并激活首狼');
      }
    }
    return { ok: true };
  }

  async handleAction(params = {}, eventData = {}) {
    const operation = params.operation || params.type;
    if (operation === 'presentEntry') {
      const survival = this._story().s01Survival || {};
      this._applyS01WeatherPhase(survival);
      if (survival.campfireLit === true) return true;
      const moved = this.scene._tutorialFlow?.isCompleted?.('s01.move') === true;
      const wakeDialogueId = 'dialogue.s01.wake';
      if (!moved && !this.scene.dialogueSystem?.hasCompleted?.(wakeDialogueId)) {
        if (this.scene.dialogueSystem?.isDialogueActive?.()) return true;
        if (this.scene.dialogueSystem?.startDialogue?.(wakeDialogueId, { sceneId: 'S01' })) return true;
      }
      this.scene._showScreenTip(moved
        ? '身体已经活动开了。四下看看，寻找能取暖的东西。'
        : '寒风吹过荒原，你被冻醒了。使用 {move} 起身活动。', {
        title: moved ? '寻找取暖处' : '寒风中醒来'
      });
      return true;
    }
    if (operation === 'beginTutorial') {
      this.scene._tutorialFlow?.showNext?.();
      return true;
    }
    if (operation === 'ensureMovedAfterWake') {
      if (this.scene._tutorialFlow?.isCompleted?.('s01.move') === true) return true;
      this.scene._showScreenTip('寒风让四肢僵硬。先使用 {move} 活动身体。', {
        title: '先活动身体'
      });
      return false;
    }
    if (operation === 'campfireLit') {
      const result = await this._submit('story.s01.campfireLit', {}, 'story:s01:campfire-lit');
      if (result.ok !== true) return false;
      try {
        this.scene._campfireService?.ignite?.({ runtime: { particleSystem: this.scene.particleSystem } });
      } catch (error) {
        console.warn('[S01S02Coordinator] 篝火表现启动失败，业务状态已提交', error);
      }

      const toolState = await this._submit('story.s01.findAxe', {}, 'story:s01:find-axe');
      if (toolState.ok !== true) return false;
      this.initialToolRevealPending = true;
      try {
        await this._revealInitialToolKit();
      } catch (error) {
        console.warn('[S01S02Coordinator] 篝火工具包放置进入退避补偿', error);
      }
      return true;
    }
    if (operation === 'refuelCampfire') return this.refuelCampfire();
    if (operation === 'craftBackpack') {
      const survival = this._story().s01Survival || {};
      if (survival.backpackCrafted === true) {
        this.scene._showScreenTip('六格小背包已经制作完成，不需要重复消耗材料。', { title: '制作已完成' });
        return { ok: true, status: 'blocked' };
      }
      if (survival.wolfSkinned !== true) {
        this.scene._showScreenTip('先击败野狼并用剥皮刀处理狼尸，取得狼皮后才能制作背包。', { title: '缺少狼皮' });
        return { ok: true, status: 'blocked' };
      }
      const inventory = this.scene.playerEntity?.getComponent?.('inventory');
      if (!inventory?.getItemCount) {
        this.scene._showScreenTip('背包系统尚未就绪，制作没有开始。', { title: '制作失败' });
        return { ok: false, code: 'inventoryUnavailable' };
      }
      const woodCount = inventory.getItemCount('resource.wood');
      const hideCount = inventory.getItemCount('resource.wolf_hide');
      const missing = [];
      if (woodCount < 2) missing.push(`木材还缺 ${2 - woodCount} 份（现有 ${woodCount}/2）`);
      if (hideCount < 1) missing.push(`狼皮还缺 ${1 - hideCount} 张（现有 ${hideCount}/1）`);
      if (missing.length > 0) {
        this.scene._showScreenTip(`制作六格小背包需要木材 2 份、狼皮 1 张；${missing.join('，')}。`, { title: '材料不足' });
        return { ok: true, status: 'blocked' };
      }
      const result = await this._submit('story.s01.craftBackpack', {}, 'story:s01:craft-backpack');
      if (!result.ok) {
        this.scene._showScreenTip(`制作结算失败：${result.code || 'unknown'}。材料和剧情状态未改变，请重试。`, { title: '制作失败' });
        return result;
      }
      this.scene._showScreenTip('你把狼皮与木条缝扎成一个六格小背包。接着在篝火旁烤制狼肉。', { title: '六格小背包' });
      return { ok: true };
    }
    if (operation === 'cookMeat') {
      const survival = this._story().s01Survival || {};
      if (survival.meatCooked === true) {
        this.scene._showScreenTip('狼肉已经烤熟，不需要重复消耗木材和生肉。', { title: '烹饪已完成' });
        return { ok: true, status: 'blocked' };
      }
      if (survival.backpackCrafted !== true) {
        this.scene._showScreenTip('先用狼皮和木材制作六格小背包，再回到篝火旁烤制狼肉。', { title: '先制作背包' });
        return { ok: true, status: 'blocked' };
      }
      const inventory = this.scene.playerEntity?.getComponent?.('inventory');
      if (!inventory?.getItemCount) {
        this.scene._showScreenTip('背包系统尚未就绪，烹饪没有开始。', { title: '烹饪失败' });
        return { ok: false, code: 'inventoryUnavailable' };
      }
      const meatCount = inventory.getItemCount('resource.raw_wolf_meat');
      const woodCount = inventory.getItemCount('resource.wood');
      const missing = [];
      if (meatCount < 1) missing.push(`生狼肉还缺 ${1 - meatCount} 份（现有 ${meatCount}/1）`);
      if (woodCount < 1) missing.push(`木材还缺 ${1 - woodCount} 份（现有 ${woodCount}/1）`);
      if (missing.length > 0) {
        this.scene._showScreenTip(`烤制狼肉需要生狼肉 1 份、木材 1 份；${missing.join('，')}。`, { title: '材料不足' });
        return { ok: true, status: 'blocked' };
      }
      const result = await this._submit('story.s01.cookMeat', {}, 'story:s01:cook-meat');
      if (!result.ok) {
        this.scene._showScreenTip(`烹饪结算失败：${result.code || 'unknown'}。材料和剧情状态未改变，请重试。`, { title: '烹饪失败' });
        return result;
      }
      this.scene._campfireService?.ignite?.({ runtime: { particleSystem: this.scene.particleSystem } });
      this.scene._showScreenTip('你添柴重新点旺篝火，狼肉烤熟了。烤狼肉可以在受伤时恢复生命；现在用木材搭一座小庇护所。', { title: '烤狼肉' });
      return { ok: true };
    }
    if (operation === 'buildShelter') return this.startShelterConstruction(params);
    if (operation === 'shelterCompleted') return this.handleConstructionEvent('constructionCompleted', eventData);
    if (operation === 'overnight') {
      const result = await this._submit('story.s01.overnight', {}, 'story:s01:overnight');
      if (!result.ok) return false;
      this.scene.timeSystem?.setCurrentDay?.(2);
      this._applyS01WeatherPhase(this._story().s01Survival || {}, { force: true });
      await this._reconcileWolfPursuit();
      this.scene._showScreenTip('漫长的一夜过去。你收好火种，三只闻到肉香的野狼追了过来——赶紧沿河道逃跑！杀死一只会引来两只，最多二十只。', {
        title: '第二天：狼群追逐', persist: true
      });
      return true;
    }
    if (operation === 'riverCrossed') {
      const result = await this._submit('story.s01.riverCrossed', {}, 'story:s01:river-crossed');
      if (result.ok) this.scene._showScreenTip('你踩着河中石块跳到对岸。顺着上坡道路跑向山崖。', { title: '越过河道' });
      return result.ok === true;
    }
    if (operation === 'cliffReached') {
      const result = await this._submit('story.s01.cliffReached', {}, 'story:s01:cliff-reached');
      if (result.ok) this.scene._showScreenTip('山崖挡住去路，岩壁垂着藤蔓。使用 {climb} 攀上藤蔓。', { title: '山崖藤蔓' });
      return result.ok === true;
    }
    if (operation === 'climbVine') return this._startVineClimb();
    if (operation === 'reconcilePursuit') return this._reconcileWolfPursuit();
    return false;
  }

  _startVineClimb() {
    if (this.pendingClimb || this._story().s01Survival?.cliffReached !== true) return false;
    const climbTarget = this.scene.resolveClimbTarget?.({ entity: this.scene.playerEntity });
    if (!climbTarget?.targetPosition) {
      this.scene._showScreenTip('没有找到当前山崖藤蔓的有效攀爬目标，请重新靠近藤蔓。', { title: '无法攀爬' });
      return false;
    }
    const started = this.scene.locomotionSystem?.climbSystem?.startClimb?.(
      this.scene.playerEntity,
      climbTarget.targetPosition,
      { duration: 1.8, peakHeight: 38 }
    );
    if (!started) return false;
    this.pendingClimb = true;
    this.climbObservedActive = true;
    return true;
  }

  update(deltaTime) {
    if (this.scene.currentSceneId !== 'S01') return;
    const dt = Math.max(0, Number(deltaTime) || 0);
    const tutorialFlow = this.scene._tutorialFlow;
    const survival = this._story().s01Survival || {};
    this._applyS01WeatherPhase(survival);
    const pickupNeedsRecovery = tutorialFlow
      && survival.campfireLit === true
      && survival.axeDropped === true
      && survival.initialToolsPicked !== true
      && tutorialFlow.isCompleted?.('s01.pickup') !== true
      && tutorialFlow.isCurrent?.('s01.pickup') !== true;
    if (pickupNeedsRecovery) this.initialToolRevealPending = true;
    if (survival.initialToolsPicked === true
      && tutorialFlow?.isCompleted?.('s01.pickup') !== true) {
      tutorialFlow?.complete?.('s01.pickup');
    }
    if (survival.berriesGathered === true
      && tutorialFlow?.isCompleted?.('s01.gather') !== true) {
      tutorialFlow?.complete?.('s01.gather');
    }
    if (this.initialToolRevealPending) {
      this.initialToolRevealRetryElapsed += dt;
      if (this.initialToolRevealRetryElapsed >= 0.75) {
        this.initialToolRevealRetryElapsed = 0;
        void this._revealInitialToolKit().catch(error => {
          console.warn('[S01S02Coordinator] 篝火工具包补偿失败', error);
        });
      }
    } else {
      this.initialToolRevealRetryElapsed = 0;
    }
    if (Number(survival.campfireRefuelCount) >= 3 && survival.firstWolfSpotted !== true
      && !this.pendingWolfDiscovery) {
      void this._spawnFirstWolfAfterThirdRefuel().catch(error => {
        console.warn('[S01S02Coordinator] 第三次添柴后的首狼补偿失败', error);
      });
    }
    if (survival.firstWolfSpotted === true && survival.firstWolfKilled !== true) {
      this._activateFirstWolf();
    }
    const gatherNeedsRecovery = tutorialFlow
      && survival.initialToolsPicked === true
      && survival.berriesGathered !== true
      && tutorialFlow.isCompleted?.('s01.gather') !== true
      && tutorialFlow.isCurrent?.('s01.gather') !== true;
    if (gatherNeedsRecovery && !this.pendingPlacementReveals.has('S01-node-berry-1')) {
      this._rememberPendingReveal(this._createCampfireContinuation());
    }
    const woodTutorialNeedsRecovery = tutorialFlow
      && survival.berriesGathered === true
      && survival.woodGathered !== true
      && tutorialFlow.isCompleted?.('s01.gather') === true
      && tutorialFlow.isCompleted?.('s01.chopWood') !== true
      && tutorialFlow.isCurrent?.('s01.chopWood') !== true;
    if (woodTutorialNeedsRecovery && !this.pendingPlacementReveals.has('S01-node-wood-1')) {
      this._rememberPendingReveal(this._createWoodGatherContinuation());
    }
    if (this.pendingPlacementReveals.size > 0 && !this.pendingRevealRetryInFlight) {
      const pending = this.pendingPlacementReveals.values().next().value;
      const retryInterval = Math.min(5, 0.75 * (2 ** Math.min(3, pending?.attempts || 0)));
      this.pendingRevealRetryElapsed += dt;
      if (this.pendingRevealRetryElapsed >= retryInterval) {
        this.pendingRevealRetryElapsed = 0;
        void this._retryPendingPlacementReveal().catch(error => {
          console.warn('[S01S02Coordinator] 待发布物品发现补偿失败', error);
        });
      }
    } else if (this.pendingPlacementReveals.size === 0) {
      this.pendingRevealRetryElapsed = 0;
    }
    if (this.scene.constructionSystem && !this.scene._constructionCheckpointBusy) {
      const pending = this.scene.constructionSystem.getPending('site.s01.small_shelter');
      const willComplete = pending?.status === 'active'
        && pending.elapsed + dt >= pending.duration;
      if (willComplete) {
        this.pendingConstructionRollback = this.scene.s10ConstructionCoordinator?._captureConstructionRollback?.();
      }
      this.scene.constructionSystem.update(deltaTime);
    }
    if (!this.pendingClimb) return;
    const climbing = this.scene.locomotionSystem?.climbSystem?.isClimbing?.(this.scene.playerEntity) === true;
    if (climbing) this.climbObservedActive = true;
    if (!climbing && this.climbObservedActive) {
      this.pendingClimb = false;
      this.climbObservedActive = false;
      void this.completeS01AndTravel();
    }
  }

  async prepareSpecialFaint(params = {}) {
    return (await this._submit('story.s01.specialFaint.prepare', params)).ok === true;
  }

  async clearSpecialFaint() {
    return (await this._submit('story.s01.specialFaint.clear', {}, 'story:s01:special-faint-clear')).ok === true;
  }

  async completeS01AndTravel() {
    return (await this._submit('story.s01.complete', {}, 'story:s01:complete')).ok === true;
  }

  async acceptS02Summons() {
    return (await this._submit('story.s02.summons.accept')).ok === true;
  }

  async travelToS09() {
    return this._submit('story.s02.travel');
  }

  resolveRespawnPosition() {
    if (this.scene.currentSceneId !== 'S01' || !this.scene._campfireService?.isLit?.()) return null;
    const campfire = this.scene._campfireService.getPosition();
    return { x: campfire.x + 48, y: campfire.y + 64, label: '已点燃的火堆旁' };
  }

  allowsTutorialBasicAttack() {
    if (this.scene.currentSceneId !== 'S01') return false;
    const survival = this._story().s01Survival || {};
    return this.scene._tutorialFlow?.isCurrent?.('s01.attack') === true
      || (survival.firstWolfSpotted === true && survival.firstWolfKilled !== true)
      || survival.pursuit?.active === true;
  }
}

export default S01S02Coordinator;