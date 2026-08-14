/************************************************************
 * 三国张角传 - P1：S01–S02 生存教学与主线事务编排
 ************************************************************/

const cloneData = value => value == null ? value : JSON.parse(JSON.stringify(value));

export const S01_TUTORIAL_KEYS = Object.freeze([
  'move', 'attack', 'pickup', 'jump', 'gather', 'durability', 'capacity'
]);
export const S01_TUTORIAL_IDS = Object.freeze(
  S01_TUTORIAL_KEYS.map(key => `s01.${key}`)
);

const SPECIAL_FAINT_RESCUE_TYPES = Object.freeze(['passerby', 'patrol', 'temporaryCamp']);
const SPECIAL_FAINT_LABELS = Object.freeze({
  passerby: '路人救援',
  patrol: '小股官兵救援',
  temporaryCamp: '临时扎营'
});

const s01s02Methods = {
  _configureS01Tutorial(project = null) {
    const fallbackTutorials = [
      { id: 's01.move', title: '移动', steps: [{ text: '使用 {move} 移动，离开火堆附近。' }] },
      { id: 's01.attack', title: '攻击', steps: [{ text: '使用 {attack} 进行一次攻击。' }] },
      { id: 's01.pickup', title: '拾取', steps: [{ text: '靠近物资后使用 {pickup} 拾取。' }] },
      { id: 's01.jump', title: '跳跃', steps: [{ text: '使用 {jump} 越过障碍。' }] },
      { id: 's01.gather', title: '采集', steps: [{ text: '靠近资源节点后使用 {harvest} 开始采集，再按一次可取消。' }] },
      { id: 's01.durability', title: '工具耐久', steps: [{ text: '再使用斧头完成一次采集。采集成功才消耗耐久，归零后本次产物仍会保留。' }] },
      { id: 's01.capacity', title: '背包容量', steps: [{ text: '再完成一次采集。系统只结算背包可容纳的数量，溢出资源会留在节点中。' }] }
    ];
    const configured = project?.extensions?.sanguoZhangjiao?.s01Tutorials;
    const configuredById = new Map((Array.isArray(configured) ? configured : [])
      .filter(definition => S01_TUTORIAL_IDS.includes(definition?.id))
      .map(definition => [definition.id, definition]));
    const definitions = fallbackTutorials.map(fallback => {
      const override = configuredById.get(fallback.id);
      return override && Array.isArray(override.steps)
        ? { ...fallback, ...cloneData(override) }
        : fallback;
    });
    for (const definition of definitions) {
      this.tutorialSystem.registerTutorial(definition.id, {
        ...cloneData(definition),
        category: definition.category || 's01-survival',
        canSkip: definition.canSkip === true,
        autoTrigger: definition.autoTrigger === true
      });
    }
    if (project || this._s01TutorialCallbacksBound) return;
    this._s01TutorialCallbacksBound = true;
    this.tutorialSystem.onShow(data => {
      this._showScreenTip(data?.step?.text || '', {
        title: data?.tutorialTitle || '教学', persist: true, owner: 'tutorial'
      });
    });
    this.tutorialSystem.onHide(() => this._hideScreenTip('tutorial'));
    this.tutorialSystem.onComplete(() => {
      this.resourceScope?.setTimeout(() => this._showNextS01Tutorial(), 0);
    });
  },

  _showNextS01Tutorial() {
    if (this.currentSceneId !== 'S01' || this.tutorialSystem.isShowingTutorial()) return false;
    const next = S01_TUTORIAL_IDS.find(id => !this.tutorialSystem.isTutorialCompleted(id));
    return next ? this.tutorialSystem.showTutorial(next) : false;
  },

  _completeS01TutorialStep(key) {
    const id = `s01.${key}`;
    if (this.currentSceneId !== 'S01' || this.tutorialSystem.isTutorialCompleted(id)) return false;
    this.tutorialSystem.completeTutorial(id);
    if (!this.tutorialSystem.isShowingTutorial()) this._showNextS01Tutorial();
    return true;
  },

  onPlayerTutorialAction(action) {
    if (action === 'attack' || action === 'jump') this._completeS01TutorialStep(action);
  },

  _isS01AttackTutorialAvailable() {
    if (this.currentSceneId !== 'S01') return false;
    const nextTutorial = S01_TUTORIAL_IDS.find(id => !this.tutorialSystem.isTutorialCompleted(id));
    return nextTutorial === 's01.attack';
  },

  _handleS01GatheringTutorial(event, data = {}) {
    if (event !== 'completed' || this.currentSceneId !== 'S01') return false;
    if (!this.tutorialSystem.isTutorialCompleted('s01.gather')) {
      return this._completeS01TutorialStep('gather');
    }
    if (!this.tutorialSystem.isTutorialCompleted('s01.durability')) {
      return data.toolInstanceId ? this._completeS01TutorialStep('durability') : false;
    }
    return this._completeS01TutorialStep('capacity');
  },

  _updateS01MovementTutorial(triggerSystem = this.gameLoader?.triggerSystem) {
    const transform = this.playerEntity?.getComponent?.('transform');
    if (!transform) return false;
    if (!this._startPos) {
      this._startPos = { x: transform.position.x, y: transform.position.y };
    }
    if (this.currentSceneId !== 'S01'
      || this.tutorialSystem.isTutorialCompleted('s01.move')) return false;
    const distance = Math.hypot(
      transform.position.x - this._startPos.x,
      transform.position.y - this._startPos.y
    );
    if (distance <= 60) return false;
    this._completeS01TutorialStep('move');
    triggerSystem?.fire?.('playerMoved', {});
    return true;
  },

  resolvePlayerDefeatResolution() {
    const storyState = this.gameLoader?.blackboard?.get?.('storyState') || {};
    if (storyState.pendingDefeatResolution !== 'specialFaint') return { type: 'normalDeath' };
    return {
      type: 'specialFaint',
      rescueType: SPECIAL_FAINT_RESCUE_TYPES.includes(storyState.specialFaintRescueType)
        ? storyState.specialFaintRescueType
        : 'passerby'
    };
  },

  _handleSpecialFaintResolved(result = {}) {
    if (result.type !== 'specialFaint') return false;
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (storyState) {
      blackboard.set('storyState', {
        ...storyState,
        pendingDefeatResolution: null,
        lastSpecialFaintRescueType: result.rescueType
      });
    }
    const location = result.respawnPosition?.label || '安全处';
    const label = SPECIAL_FAINT_LABELS[result.rescueType] || '路人救援';
    this._showScreenTip(`${label}：你在${location}醒来，未扣除资源，也未生成遗失物资`);
    return true;
  },
  /**
   * 校验教学、目标和奖励后提交 S01 完成事实；传送失败恢复库存与 StoryState。
   */
  async completeS01AndTravel(params = {}) {
    if (this.currentSceneId !== 'S01') return false;
    const incomplete = S01_TUTORIAL_IDS.find(id => !this.tutorialSystem.isTutorialCompleted(id));
    if (incomplete) {
      this._showNextS01Tutorial();
      if (!this.tutorialSystem.isShowingTutorial()) {
        this._showScreenTip('请先完成当前生存教学', { title: '尚未完成' });
      }
      return false;
    }

    try {
      await this._worldLoadPromise;
    } catch (error) {
      this._showScreenTip(`无法前往 S02：${error.message || error}`, { title: '场景加载失败' });
      return false;
    }
    const targetSceneId = params.scene || params.sceneId || 'S02';
    const spawnRef = params.spawnRef || 'player';
    const targetChunk = this._worldLoadSession?.getChunk?.(targetSceneId);
    const targetSpawn = this._worldLoadSession?.findSpawn?.(targetSceneId, spawnRef);
    if (!targetChunk || !targetSpawn) {
      this._showScreenTip(`无法前往 ${targetSceneId}：目标区块或出生点不存在`, { title: '场景配置错误' });
      return false;
    }

    const blackboard = this.gameLoader?.blackboard;
    const previousStoryState = blackboard?.get?.('storyState') || {};
    const alreadyCompleted = previousStoryState.s01Completed === true;
    const inventory = this.playerEntity?.getComponent?.('inventory');
    let inventoryBefore = null;
    if (!alreadyCompleted) {
      if (!inventory || !blackboard) return false;
      const rewardSpecs = Array.isArray(params.rewards) && params.rewards.length
        ? params.rewards
        : [{ itemId: 'resource.wood', quantity: 3 }, { itemId: 'resource.herb', quantity: 2 }];
      const itemRegistry = this.gameLoader?.getRegistry?.('items');
      const rewardEntries = rewardSpecs.map(spec => ({
        item: itemRegistry?.get?.(spec.itemId),
        quantity: Math.max(0, Math.floor(Number(spec.quantity) || 0))
      }));
      if (rewardEntries.some(entry => !entry.item?.id || entry.quantity <= 0)) {
        this._showScreenTip('S01 完成奖励配置无效', { title: '内容配置错误' });
        return false;
      }
      const preview = this.inventoryTransactions.previewBatchAdd(inventory, rewardEntries);
      if (preview.remainder > 0) {
        this._showScreenTip('背包空间不足，整理后再前往废弃营地', { title: '无法领取奖励' });
        return false;
      }
      inventoryBefore = inventory.exportItems();
      const rewardResult = this.inventoryTransactions.commit({
        type: 'batchAdd', inventory, entries: rewardEntries, allowPartial: false
      });
      if (!rewardResult.ok) {
        this._showScreenTip('完成奖励结算失败，库存未改变', { title: '结算失败' });
        return false;
      }
      blackboard.set('storyState', {
        ...previousStoryState,
        s01Completed: true,
        currentSceneId: targetSceneId,
        pendingDefeatResolution: null,
        specialFaintRescueType: null,
        unlockedScenes: [...new Set([...(previousStoryState.unlockedScenes || []), targetSceneId])]
      });
    }

    const result = await this.teleportToChunk({
      scene: targetSceneId,
      spawnRef,
      transition: params.transition || 'fadeBlack'
    });
    if (result === false || result == null || result?.cancelled) {
      if (!alreadyCompleted && inventoryBefore) {
        inventory.loadItems(inventoryBefore);
        blackboard.set('storyState', previousStoryState);
      }
      return false;
    }
    if (blackboard) {
      const committedStoryState = blackboard.get('storyState') || previousStoryState;
      blackboard.set('storyState', {
        ...committedStoryState,
        currentSceneId: targetSceneId,
        pendingDefeatResolution: null,
        specialFaintRescueType: null
      });
    }
    if (!alreadyCompleted) this._showScreenTip('完成 S01：获得木材 ×3、草药 ×2，已开放 S02');
    return true;
  },

  setPendingSpecialFaint(params = {}) {
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (!blackboard || !storyState || this.currentSceneId !== 'S01') return false;
    const rescueType = SPECIAL_FAINT_RESCUE_TYPES.includes(params.rescueType)
      ? params.rescueType
      : 'passerby';
    blackboard.set('storyState', {
      ...storyState,
      pendingDefeatResolution: 'specialFaint',
      specialFaintRescueType: rescueType
    });
    this._showScreenTip('你选择不逃跑：若在这场抵抗中倒下，将进入特殊救援昏迷');
    return true;
  },

  clearPendingSpecialFaint() {
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (!blackboard || !storyState || storyState.pendingDefeatResolution !== 'specialFaint') return false;
    blackboard.set('storyState', {
      ...storyState,
      pendingDefeatResolution: null,
      specialFaintRescueType: null
    });
    return true;
  },

  /** S02 召见事实与自动检查点共同提交；跨区失败保留已持久化召见事实。 */
  async acceptS02Summons() {
    if (this.currentSceneId !== 'S02') return false;
    const blackboard = this.gameLoader?.blackboard;
    const previousStoryState = blackboard?.get?.('storyState');
    if (!blackboard || !previousStoryState) return false;
    if (previousStoryState.s02SummonsAccepted === true) {
      this._showScreenTip('召见已接受，前往粥棚营地的路线正在准备中');
      return true;
    }
    blackboard.set('storyState', {
      ...previousStoryState,
      s02SummonsAccepted: true,
      lastCheckpointId: 'checkpoint.S02.summonsAccepted'
    });
    try {
      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S02.summonsAccepted', sceneId: 'S02'
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '自动存档未提交');
    } catch (error) {
      blackboard.set('storyState', previousStoryState);
      this.dialogueSystem?.clearCompleted?.('dialogue.s02.zhangjiaoSummons');
      this.gameLoader?.triggerSystem?.clearFiredOnce?.('trg_s02_zhangjiao_summons');
      this.gameLoader?.triggerSystem?.clearFiredOnce?.('trg_s02_accept_summons');
      this._sceneTriggerBindings?.resetBinding?.('S02-binding-zhangjiao-summons');
      this._showScreenTip('召见检查点保存失败，剧情状态未提交，可重新与信使交谈', { title: '保存失败' });
      return false;
    }
    this._showScreenTip('已接受张角召见并创建检查点，正在前往粥棚营地');
    const travel = await this.travelToS09();
    if (!travel?.ok) {
      this._showScreenTip('召见检查点已保留；可从东北出口重试前往粥棚营地', { title: '路线暂不可用' });
      return false;
    }
    return true;
  },

  async travelToS09() {
    if (this.currentSceneId !== 'S02') {
      return {
        ok: false,
        errors: [{ code: 'wrongScene', path: 'currentSceneId', message: '只能从 S02 前往 S09' }]
      };
    }
    const storyState = this.gameLoader?.blackboard?.get?.('storyState');
    if (storyState?.s02SummonsAccepted !== true) {
      this._showScreenTip('先与黄巾信使交谈并接受召见', { title: '尚未获得路线' });
      return {
        ok: false,
        errors: [{ code: 'summonsRequired', path: 'storyState.s02SummonsAccepted', message: '尚未接受张角召见' }]
      };
    }
    const regionIndex = this._findRegionIndexForScene('S09');
    if (regionIndex < 0) {
      return {
        ok: false,
        errors: [{ code: 'missingTargetScene', path: 'worldMap', message: '世界地图未登记 S09' }]
      };
    }
    return this.travelToRegion({ regionIndex, sceneId: 'S09', spawnRef: 'player' });
  }
};

export function installS01S02SceneFlow(SceneClass) {
  if (typeof SceneClass !== 'function') throw new TypeError('SceneClass must be a constructor');
  const descriptors = Object.entries(Object.getOwnPropertyDescriptors(s01s02Methods))
    .filter(([name]) => name !== '__proto__');
  const conflict = descriptors.find(([name]) => (
    Object.prototype.hasOwnProperty.call(SceneClass.prototype, name)
  ));
  if (conflict) throw new Error(`S01S02SceneFlow method conflict: ${conflict[0]}`);
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(SceneClass.prototype, name, descriptor);
  }
  return SceneClass;
}

export default installS01S02SceneFlow;