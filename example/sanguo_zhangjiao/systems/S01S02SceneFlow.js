/************************************************************
 * 三国张角传 - P1：S01–S02 生存教学与主线事务编排
 ************************************************************/

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
    const tutorialFlow = this.context?.services?.tutorialFlow;
    const incomplete = S01_TUTORIAL_IDS.find(id => !tutorialFlow?.isCompleted(id));
    if (incomplete) {
      tutorialFlow?.showNext();
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
    const travel = await s01s02Methods.travelToS09.call(this);
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

/** S01/S02 固定剧情事务协调器；不修改 Scene prototype。 */
export class S01S02Coordinator {
  constructor(scene) {
    if (!scene) throw new TypeError('S01S02Coordinator requires scene');
    this.scene = scene;
  }

  resolve() {
    return s01s02Methods.resolvePlayerDefeatResolution.call(this.scene);
  }

  handleResolved(result = {}) {
    return s01s02Methods._handleSpecialFaintResolved.call(this.scene, result);
  }

  completeS01AndTravel(params = {}) {
    return s01s02Methods.completeS01AndTravel.call(this.scene, params);
  }

  prepareSpecialFaint(params = {}) {
    return s01s02Methods.setPendingSpecialFaint.call(this.scene, params);
  }

  clearSpecialFaint() {
    return s01s02Methods.clearPendingSpecialFaint.call(this.scene);
  }

  acceptS02Summons(params = {}) {
    return s01s02Methods.acceptS02Summons.call(this.scene, params);
  }

  travelToS09() {
    return s01s02Methods.travelToS09.call(this.scene);
  }
}

export default S01S02Coordinator;