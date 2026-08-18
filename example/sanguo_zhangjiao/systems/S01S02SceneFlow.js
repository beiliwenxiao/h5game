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
    this.pendingAxeDiscovery = false;
    this.pendingWolfDiscovery = false;
    this.pendingClimb = false;
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
    const survival = this._story().s01Survival || {};
    if (event === 'progress' && data.resourceType === 'berry'
      && Number(data.progress) >= 0.45 && !survival.axeFound && !this.pendingAxeDiscovery) {
      this.pendingAxeDiscovery = true;
      const result = await this._submit('story.s01.findAxe', {}, 'story:s01:find-axe');
      this.pendingAxeDiscovery = false;
      if (result.ok) {
        this.scene._showScreenTip('采集过程中，发现了树丛中有一把破斧头。', {
          title: '发现工具', persist: true
        });
      }
      return result.ok === true;
    }
    if (event === 'progress' && data.resourceType === 'wood'
      && Number(data.progress) >= 0.45 && !survival.firstWolfSpotted && !this.pendingWolfDiscovery) {
      this.pendingWolfDiscovery = true;
      const result = await this._submit('story.s01.firstWolfSpotted', {}, 'story:s01:first-wolf-spotted');
      this.pendingWolfDiscovery = false;
      if (result.ok) {
        await this._spawnGroup('S01-first-wolf');
        this.scene._showScreenTip('砍柴途中，灌木后突然窜出一只野狼！使用 {attack} 反击。', {
          title: '野狼来袭', persist: true
        });
      }
      return result.ok === true;
    }
    if (event !== 'completed') return false;
    if (data.resourceType === 'berry') {
      const result = await this._submit('story.s01.berriesGathered', {}, 'story:s01:berries-gathered');
      if (result.ok) this.scene._showScreenTip('野果已经采到。打开背包吃下野果，先填饱肚子。', { title: '饥饿' });
      return result.ok === true;
    }
    if (data.resourceType === 'wood') {
      const result = await this._submit('story.s01.woodGathered', {}, 'story:s01:wood-gathered');
      if (result.ok) {
        await this._spawnGroup('S01-skinning-knife');
        this.scene._showScreenTip('枯枝下露出一把还能使用的剥皮刀。靠近后使用 {pickup} 拾取，再对付野狼。', {
          title: '发现剥皮刀'
        });
      }
      return result.ok === true;
    }
    if (data.resourceType === 'hide') {
      const result = await this._submit('story.s01.wolfSkinned', {}, 'story:s01:wolf-skinned');
      if (result.ok) {
        this.scene._showScreenTip('你用剥皮刀取下狼皮。不同职业以后会用各自技能改善战斗、采集与求生；眼下先用狼皮和木材做一个六格小背包。', { title: '职业技能与制作' });
      }
      return result.ok === true;
    }
    return false;
  }

  async handleItemUsed(item = {}) {
    if (this.scene.currentSceneId !== 'S01') return false;
    if (item.id === 'resource.wild_berry') {
      const result = await this._submit('story.s01.berryEaten', {}, 'story:s01:berry-eaten');
      if (!result.ok) return false;
      this.scene._campfireService?.extinguish?.();
      await this._spawnGroup('S01-wood');
      this.scene._showScreenTip('野果暂时填饱了肚子，但寒风吹散余火，篝火熄灭了。用破斧头砍些枯木。', {
        title: '篝火熄灭'
      });
      return true;
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
      await this._spawnGroup('S01-first-wolf-remains');
      this.scene._showScreenTip('野狼倒下，狼肉已经掉落。拾取狼肉，再用剥皮刀处理狼尸取得狼皮。', {
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
    if (this.scene.currentSceneId !== 'S01' || event !== 'constructionCompleted'
      || data.structure?.siteId !== 'site.s01.small_shelter') return false;
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

  async handleAction(params = {}, eventData = {}) {
    const operation = params.operation || params.type;
    if (operation === 'campfireLit') {
      const result = await this._submit('story.s01.campfireLit', {}, 'story:s01:campfire-lit');
      if (result.ok) {
        await this._spawnGroup('S01-berries');
        this.scene._showScreenTip('火光驱散寒意，你却听见肚子咕咕作响。靠近野果丛，使用 {harvest} 徒手采集野果。', {
          title: '寻找食物'
        });
      }
      return result.ok === true;
    }
    if (operation === 'craftBackpack') {
      const result = await this._submit('story.s01.craftBackpack', {}, 'story:s01:craft-backpack');
      if (result.ok) this.scene._showScreenTip('你把狼皮与木条缝扎成一个六格小背包。接着在篝火旁烤制狼肉。', { title: '六格小背包' });
      return result.ok === true;
    }
    if (operation === 'cookMeat') {
      const result = await this._submit('story.s01.cookMeat', {}, 'story:s01:cook-meat');
      if (result.ok) {
        this.scene._campfireService?.ignite?.({ runtime: { particleSystem: this.scene.particleSystem } });
        this.scene._showScreenTip('你添柴重新点旺篝火，狼肉烤熟了。烤狼肉可以在受伤时恢复生命；现在用木材搭一座小庇护所。', { title: '烤狼肉' });
      }
      return result.ok === true;
    }
    if (operation === 'buildShelter') return this.startShelterConstruction(params);
    if (operation === 'shelterCompleted') return this.handleConstructionEvent('constructionCompleted', eventData);
    if (operation === 'overnight') {
      const result = await this._submit('story.s01.overnight', {}, 'story:s01:overnight');
      if (!result.ok) return false;
      this.scene.timeSystem?.setCurrentDay?.(2);
      this.scene.timeSystem?.setTimePeriod?.('morning');
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
    const started = this.scene.locomotionSystem?.climbSystem?.startClimb?.(
      this.scene.playerEntity,
      { x: 1135, y: 86 },
      { duration: 1.8, peakHeight: 38 }
    );
    if (!started) return false;
    this.pendingClimb = true;
    this.climbObservedActive = true;
    return true;
  }

  update(deltaTime) {
    if (this.scene.currentSceneId !== 'S01') return;
    if (this.scene.constructionSystem && !this.scene._constructionCheckpointBusy) {
      const pending = this.scene.constructionSystem.getPending('site.s01.small_shelter');
      const willComplete = pending?.status === 'active'
        && pending.elapsed + Math.max(0, Number(deltaTime) || 0) >= pending.duration;
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