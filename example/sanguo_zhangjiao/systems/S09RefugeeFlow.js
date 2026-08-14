/************************************************************
 * 三国张角传 - P2.2 S09 饥民争斗与跨日延迟后果编排
 ************************************************************/

const S09_CITY_ID = 'city.s09_guangzong_camp';
export const S09_REFUGEE_DIALOGUE_ID = 'dialogue.s09.refugeeConflict';
const S09_REFUGEE_GROUP = 'S09-refugee-conflict';
export const S09_SILENCE_EVENT_TYPE = 's09.silenceFoodCollapse';
const S09_HARDLINE_ESCAPE_EVENT_TYPE = 's09.hardlineEscape';
const S09_HARDLINE_ESCAPE_CHANCE = 0.35;

const cloneData = value => value == null ? value : JSON.parse(JSON.stringify(value));

/** 同一剧情操作和逻辑日始终得到同一结果，checkpoint 失败重试不会重新掷骰。 */
const stableStoryRoll = (...parts) => {
  const text = parts.map(part => String(part ?? '')).join('|');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
};

const s09RefugeeMethods = {
  _getS09CityContext() {
    const blackboard = this.gameLoader?.blackboard;
    const cityStates = blackboard?.get?.('cityStates');
    const cityIndex = Array.isArray(cityStates)
      ? cityStates.findIndex(city => city?.id === S09_CITY_ID)
      : -1;
    if (!blackboard || cityIndex < 0) return null;
    return {
      blackboard,
      cityStates,
      cityIndex,
      city: cityStates[cityIndex],
      storyState: blackboard.get('storyState') || {}
    };
  },

  _validateS09City(city, cityIndex) {
    const result = this.gameLoader?.contentValidator?.validate?.(
      city, 'city', `variables.cityStates[${cityIndex}]`
    );
    return !result || result.ok === true;
  },

  _setS09City(context, city) {
    context.blackboard.set('cityStates', context.cityStates.map((entry, index) => (
      index === context.cityIndex ? city : entry
    )));
  },

  _setRefugeeDialogueNode(nodeId) {
    if (this.dialogueSystem?.getCurrentDialogue?.()?.id !== S09_REFUGEE_DIALOGUE_ID) return false;
    return this.dialogueSystem.goToNode(nodeId, { player: this.playerEntity, scene: this });
  },

  _refugeeBranchResultNode(conflict = {}) {
    if (conflict.branch === 'hardline') return 'hardlineResult';
    if (conflict.branch === 'appease') {
      return conflict.result === 'foodRestored' ? 'appeaseSuccessResult' : 'appeaseScoutResult';
    }
    if (conflict.branch === 'silence') return 'silenceResult';
    return 'branchChoice';
  },

  /** 城损与粮仓损毁达标后建立一次性剧情事实，并按 StoryState 恢复现场。 */
  _getS09RefugeeConfig() {
    const configured = this.gameLoader?.project?.extensions?.sanguoZhangjiao?.s09RefugeeConflict || {};
    const positiveInteger = (value, fallback) => {
      const number = Math.floor(Number(value));
      return Number.isFinite(number) && number > 0 ? number : fallback;
    };
    const ratio = Number(configured.minimumCityDamageRatio);
    const chance = Number(configured.hardlineEscapeChance);
    return {
      minimumCityDamageRatio: Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 0.4,
      donationFood: positiveInteger(configured.donationFood, 20),
      donationMorale: positiveInteger(configured.donationMorale, 5),
      damagePauseDays: positiveInteger(configured.damagePauseDays, 1),
      hardlineMorale: positiveInteger(configured.hardlineMorale, 10),
      hardlineEscapeChance: Number.isFinite(chance) && chance >= 0 && chance <= 1
        ? chance : S09_HARDLINE_ESCAPE_CHANCE,
      appeaseFood: positiveInteger(configured.appeaseFood, 30),
      consequenceDelayDays: positiveInteger(configured.consequenceDelayDays, 1)
    };
  },

  async prepareS09RefugeeConflict() {
    if (this.currentSceneId !== 'S09') return false;
    const rules = this._getS09RefugeeConfig();
    const context = this._getS09CityContext();
    if (!context || Number(context.city.damageRatio) < rules.minimumCityDamageRatio
      || Number(context.city.buildingDamage?.['granary.s09']) <= 0) return false;

    const currentDay = Math.max(1, Math.floor(Number(context.storyState.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    let conflict = context.storyState.s09RefugeeConflict;
    const firstTrigger = !conflict;
    if (!conflict) {
      conflict = {
        status: 'available',
        triggeredDay: currentDay,
        donationCommitted: false,
        branch: null,
        result: null,
        presentationActive: true
      };
      context.blackboard.set('storyState', {
        ...context.storyState,
        currentDay,
        delayedConsequences: Array.isArray(context.storyState.delayedConsequences)
          ? context.storyState.delayedConsequences : [],
        storyTags: Array.isArray(context.storyState.storyTags) ? context.storyState.storyTags : [],
        hiddenClues: Array.isArray(context.storyState.hiddenClues) ? context.storyState.hiddenClues : [],
        s09RefugeeConflict: conflict
      });
    }

    await this._spawnPlacements({ group: S09_REFUGEE_GROUP });
    if (firstTrigger) {
      this._s09AudioDirector?.playFeedback?.('conflict');
      this._showScreenTip('粮仓损毁引发饥民争斗。难民区出现伤兵、妇孺与死者，请查看现场。', {
        title: '饥民争斗'
      });
    }
    return true;
  },


  /** 由 S09 磁盘场景中的可视化交互 binding 启动或恢复剧情。 */
  async startS09RefugeeConflict() {
    if (this.currentSceneId !== 'S09' || this.dialogueSystem?.isDialogueActive?.()) return false;
    await this.prepareS09RefugeeConflict();
    const context = this._getS09CityContext();
    const conflict = context?.blackboard?.get?.('storyState')?.s09RefugeeConflict;
    if (!context || !conflict) return false;
    const oneArmed = (this._npcEntities || []).find(entity => entity?.id === 'S09-refugee-one-armed');
    const playerPosition = this.playerEntity?.getComponent?.('transform')?.position;
    const refugeePosition = oneArmed?.getComponent?.('transform')?.position;
    if (!playerPosition || !refugeePosition
      || Math.hypot(playerPosition.x - refugeePosition.x, playerPosition.y - refugeePosition.y) > 110) {
      return false;
    }
    if (conflict.status === 'resolved') {
      this._showScreenTip('饥民争斗已经作出选择，现场只留下选择后的沉默。');
      return false;
    }

    const resumeStatus = conflict.status;
    if (!this.dialogueSystem.startDialogue(S09_REFUGEE_DIALOGUE_ID, {
      player: this.playerEntity, scene: this
    })) return false;
    if (conflict.donationCommitted) this._setRefugeeDialogueNode('branchChoice');
    else if (resumeStatus === 'started') this._setRefugeeDialogueNode('donationOffer');

    if (resumeStatus === 'available') {
      const storyState = context.blackboard.get('storyState') || {};
      context.blackboard.set('storyState', {
        ...storyState,
        s09RefugeeConflict: { ...conflict, status: 'started' }
      });
    }
    return true;
  },

  async handleS09RefugeeChoice(choiceId) {
    if (this._s09RefugeeChoiceBusy || this.currentSceneId !== 'S09') return false;
    if (choiceId === 'defer') return true;
    this._s09RefugeeChoiceBusy = true;
    try {
      if (choiceId === 'donate_food' || choiceId === 'retry_donation') {
        const result = await this._commitS09RefugeeDonation();
        const conflict = this._getS09CityContext()?.blackboard?.get?.('storyState')?.s09RefugeeConflict;
        this._setRefugeeDialogueNode(conflict?.donationCommitted ? 'branchChoice' : 'donationFailed');
        return result;
      }
      if (['hardline', 'appease', 'silence'].includes(choiceId)) {
        const result = await this._commitS09RefugeeBranch(choiceId);
        const conflict = this._getS09CityContext()?.blackboard?.get?.('storyState')?.s09RefugeeConflict;
        this._setRefugeeDialogueNode(conflict?.branch
          ? this._refugeeBranchResultNode(conflict)
          : 'branchChoice');
        return result;
      }
      return false;
    } finally {
      this._s09RefugeeChoiceBusy = false;
    }
  },

  /** 扣粮、士气和暂停损毁作为一个可回滚检查点事务。 */
  async _commitS09RefugeeDonation() {
    const rules = this._getS09RefugeeConfig();
    const context = this._getS09CityContext();
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const conflict = context?.storyState?.s09RefugeeConflict;
    if (!context || !inventory || !conflict) return false;
    if (conflict.donationCommitted) {
      this._setRefugeeDialogueNode('branchChoice');
      return true;
    }

    const quantity = rules.donationFood;
    if (this.inventoryTransactions.previewRemove(inventory, 'resource.food', quantity).remainder > 0) {
      this._setRefugeeDialogueNode('donationFailed');
      this._showScreenTip(`需要粮食 ×${quantity} 才能稳定现场；库存未改变。`, { title: '粮食不足' });
      return false;
    }
    const currentDay = Math.max(1, Math.floor(Number(context.storyState.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    const cityDraft = JSON.parse(JSON.stringify(context.city));
    cityDraft.morale = Math.max(0,
      Math.floor(Number(cityDraft.morale) || 0) + rules.donationMorale);
    cityDraft.damagePausedUntilDay = Math.max(
      Math.floor(Number(cityDraft.damagePausedUntilDay) || 0), currentDay + rules.damagePauseDays
    );
    if (!this._validateS09City(cityDraft, context.cityIndex)) {
      this._setRefugeeDialogueNode('donationFailed');
      return false;
    }

    const inventoryBefore = JSON.parse(JSON.stringify(inventory.exportItems()));
    const blackboardBefore = JSON.parse(JSON.stringify(context.blackboard.serialize()));
    const operationId = 'story:S09:refugee-donation';
    const removed = this.inventoryTransactions.commit({
      type: 'batchRemove', inventory,
      entries: [{ itemId: 'resource.food', quantity }],
      operationId
    });
    if (!removed.ok) {
      this._setRefugeeDialogueNode('donationFailed');
      return false;
    }

    this._setS09City(context, cityDraft);
    const storyState = context.blackboard.get('storyState') || {};
    context.blackboard.set('storyState', {
      ...storyState,
      s09RefugeeConflict: {
        ...conflict,
        status: 'donated',
        donationCommitted: true,
        donationOperationId: operationId,
        donationDay: currentDay
      }
    });

    try {
      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: 'checkpoint.S09.refugeeDonation', sceneId: 'S09'
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '捐粮检查点未提交');
    } catch (error) {
      inventory.loadItems(inventoryBefore);
      this.inventoryTransactions.forgetOperation?.(operationId);
      context.blackboard.deserialize(blackboardBefore);
      this._setRefugeeDialogueNode('donationFailed');
      this._showScreenTip('捐粮检查点保存失败，粮食、士气和损毁暂停均已回滚。', { title: '保存失败' });
      return false;
    }

    this._s09AudioDirector?.playFeedback?.('donation');
    this._setRefugeeDialogueNode('branchChoice');
    this._showScreenTip(
      `捐出粮食 ×${quantity}：城市士气 +${rules.donationMorale}，损毁暂停 ${rules.damagePauseDays} 个游戏日。`
    );
    return true;
  },

  _findValidInventoryTool(inventory, toolType) {
    return (inventory?.slots || [])
      .map(stack => stack?.item)
      .find(item => item?.toolType === toolType && Number(item.durability) > 0) || null;
  },


  async _commitS09RefugeeBranch(branch) {
    const rules = this._getS09RefugeeConfig();
    const context = this._getS09CityContext();
    const inventory = this.playerEntity?.getComponent?.('inventory');
    const conflict = context?.storyState?.s09RefugeeConflict;
    if (!context || !inventory || !conflict?.donationCommitted) {
      this._setRefugeeDialogueNode('donationFailed');
      return false;
    }
    if (!['hardline', 'appease', 'silence'].includes(branch)) return false;
    if (conflict.branch) {
      this._setRefugeeDialogueNode(this._refugeeBranchResultNode(conflict));
      return conflict.branch === branch;
    }

    const currentDay = Math.max(1, Math.floor(Number(context.storyState.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    const blackboardBefore = JSON.parse(JSON.stringify(context.blackboard.serialize()));
    const cityDraft = JSON.parse(JSON.stringify(context.city));
    const tags = new Set(context.storyState.storyTags || []);
    const delayedConsequences = [...(context.storyState.delayedConsequences || [])];
    let result = 'committed';
    let resultNode = 'hardlineResult';
    let scoutTriggered = false;
    let delayedEventId = null;

    if (branch === 'hardline') {
      delayedEventId = 'story:S09:hardline-escape';
      cityDraft.morale = Math.min(100, Math.max(0,
        Math.floor(Number(cityDraft.morale) || 0) + rules.hardlineMorale));
      tags.add('s09.refugees.hardline');
      tags.add('s09.refugees.strictCommander');
      if (!delayedConsequences.some(event => event?.id === delayedEventId)) {
        const playerId = this.playerEntity?.id || 'player';
        const classId = context.storyState.selectedClass || this.selectedClass || 'unselected';
        delayedConsequences.push({
          id: delayedEventId,
          type: S09_HARDLINE_ESCAPE_EVENT_TYPE,
          dueDay: currentDay + rules.consequenceDelayDays,
          status: 'pending',
          sourceSceneId: 'S09',
          payload: {
            chance: rules.hardlineEscapeChance,
            willEscape: stableStoryRoll(delayedEventId, currentDay, playerId, classId)
              < rules.hardlineEscapeChance
          }
        });
      }
      result = 'hardlineEscapeScheduled';
    } else if (branch === 'appease') {
      const axe = this._findValidInventoryTool(inventory, 'axe');
      if (axe) {
        cityDraft.resources = {
          ...cityDraft.resources,
          food: Math.max(0, Math.floor(Number(cityDraft.resources?.food) || 0) + rules.appeaseFood)
        };
        result = 'foodRestored';
        resultNode = 'appeaseSuccessResult';
        tags.add('s09.refugees.appeasedWithGathering');
      } else {
        result = 'scoutTriggered';
        resultNode = 'appeaseScoutResult';
        scoutTriggered = true;
        tags.add('s09.refugees.scoutTriggered');
      }
    } else if (branch === 'silence') {
      delayedEventId = 'story:S09:silence-food-collapse';
      if (!delayedConsequences.some(event => event?.id === delayedEventId)) {
        delayedConsequences.push({
          id: delayedEventId,
          type: S09_SILENCE_EVENT_TYPE,
          dueDay: currentDay + rules.consequenceDelayDays,
          status: 'pending',
          sourceSceneId: 'S09'
        });
      }
      result = 'delayedFoodCollapse';
      resultNode = 'silenceResult';
      tags.add('s09.refugees.silence');
    }

    if (!this._validateS09City(cityDraft, context.cityIndex)) return false;
    this._setS09City(context, cityDraft);
    context.blackboard.set('storyState', {
      ...context.storyState,
      storyTags: [...tags],
      delayedConsequences,
      s09RefugeeConflict: {
        ...conflict,
        status: 'resolved',
        branch,
        result,
        scoutTriggered,
        delayedEventId,
        branchOperationId: `story:S09:refugee-branch:${branch}`,
        resolvedDay: currentDay
      }
    });

    try {
      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: `checkpoint.S09.refugeeBranch.${branch}`, sceneId: 'S09'
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '分支检查点未提交');
    } catch (error) {
      context.blackboard.deserialize(blackboardBefore);
      this._setRefugeeDialogueNode('branchChoice');
      this._showScreenTip('剧情分支保存失败，城市、标签与延迟事件均已回滚，可重新选择。', { title: '保存失败' });
      return false;
    }

    this._s09AudioDirector?.playFeedback?.(branch);
    this._setRefugeeDialogueNode(resultNode);
    if (scoutTriggered) await this._spawnPlacements({ group: 'S09-refugee-scout' });
    const messages = {
      hardline: '残兵控制住人群：城市士气 +10，获得“严苛统领”标签；下一游戏日将结算逃亡风险。',
      appease: result === 'foodRestored' ? '有效斧头帮助收集燃料与散粮，城市粮食 +30。' : '没有有效斧头，安抚失败并引来了官军斥候。',
      silence: '你选择沉默；下一游戏日将结算粮食耗尽的延迟后果。'
    };
    this._showScreenTip(messages[branch] || '剧情分支已提交。');
    return true;
  },

  _onGameDayChanged(currentDay) {
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    if (!blackboard || !storyState) return false;
    blackboard.set('storyState', { ...storyState, currentDay });
    this._processDueStoryEvents();
    return true;
  },

  advanceGameDay(days = 1) {
    const currentDay = this.timeSystem?.advanceDays?.(Math.max(1, Math.floor(Number(days) || 1)));
    if (!currentDay) return false;
    this._onGameDayChanged(currentDay);
    return currentDay;
  },


  /** 到期后果按 StoryState event id 幂等提交；保存失败恢复草稿并等待重试。 */
  async _processDueStoryEvents() {
    if (this._processingDelayedStoryEvents || !this.gameLoader) return false;
    const context = this._getS09CityContext();
    const storyState = context?.storyState;
    const currentDay = Math.max(1, Math.floor(Number(storyState?.currentDay)
      || this.timeSystem?.getCurrentDay?.() || 1));
    const supportedTypes = new Set([S09_SILENCE_EVENT_TYPE, S09_HARDLINE_ESCAPE_EVENT_TYPE]);
    const dueEvent = (storyState?.delayedConsequences || []).find(event => (
      event?.status === 'pending'
      && Number(event.dueDay) <= currentDay
      && supportedTypes.has(event.type)
    ));
    if (!context || !dueEvent) return false;

    this._processingDelayedStoryEvents = true;
    const blackboardBefore = JSON.parse(JSON.stringify(context.blackboard.serialize()));
    try {
      let storyDraft = { ...storyState };
      let eventOutcome = 'completed';
      let tipTitle = '延迟后果';
      let tipMessage = '';

      if (dueEvent.type === S09_SILENCE_EVENT_TYPE) {
        const cityDraft = JSON.parse(JSON.stringify(context.city));
        cityDraft.resources = { ...cityDraft.resources, food: 0 };
        if (!this._validateS09City(cityDraft, context.cityIndex)) {
          throw new Error('延迟后果生成了非法 CityState');
        }
        this._setS09City(context, cityDraft);
        const hiddenClues = new Set(storyState.hiddenClues || []);
        hiddenClues.add('s09.refugees.breadArmClue');
        storyDraft = { ...storyDraft, hiddenClues: [...hiddenClues] };
        eventOutcome = 'foodCollapsed';
        tipMessage = '新的一日到来：营地粮食耗尽，断臂饥民手中的饼留下了一条隐藏线索。';
      } else if (dueEvent.type === S09_HARDLINE_ESCAPE_EVENT_TYPE) {
        const willEscape = dueEvent.payload?.willEscape === true;
        const tags = new Set(storyState.storyTags || []);
        if (willEscape) tags.add('s09.refugees.escapeOccurred');
        storyDraft = {
          ...storyDraft,
          storyTags: [...tags],
          s09RefugeeConflict: {
            ...(storyState.s09RefugeeConflict || {}),
            hardlineEscapeOccurred: willEscape,
            hardlineEscapeDay: currentDay
          }
        };
        eventOutcome = willEscape ? 'escapeOccurred' : 'noEscape';
        tipTitle = willEscape ? '夜间逃亡' : '营地守夜';
        tipMessage = willEscape
          ? '新的一日到来：几顶帐篷已经空了，泥地上的脚印一路通向营外。'
          : '新的一日到来：残兵守住了营地，这一夜无人逃亡。';
      }

      storyDraft.delayedConsequences = storyState.delayedConsequences.map(event => (
        event?.id === dueEvent.id
          ? { ...event, status: 'completed', completedDay: currentDay, outcome: eventOutcome }
          : event
      ));
      context.blackboard.set('storyState', storyDraft);

      const saveResult = await this.requestAutoSave({
        reason: 'checkpoint', checkpointId: `checkpoint.${dueEvent.id}`, sceneId: this.currentSceneId
      });
      if (!saveResult?.ok) throw new Error(saveResult?.errors?.[0]?.message || '延迟后果检查点未提交');
      this._showScreenTip(tipMessage, { title: tipTitle });
      return true;
    } catch (error) {
      context.blackboard.deserialize(blackboardBefore);
      console.warn('[DDScene] 延迟剧情结算失败，已回滚并等待重试', error);
      return false;
    } finally {
      this._processingDelayedStoryEvents = false;
    }
  }
};

/** 先检查全部冲突，再安装方法，避免部分写入原型。 */
export function installS09RefugeeFlow(SceneClass) {
  if (typeof SceneClass !== 'function') throw new TypeError('SceneClass must be a constructor');
  const descriptors = Object.entries(Object.getOwnPropertyDescriptors(s09RefugeeMethods))
    .filter(([name]) => name !== '__proto__');
  const conflict = descriptors.find(([name]) => (
    Object.prototype.hasOwnProperty.call(SceneClass.prototype, name)
  ));
  if (conflict) throw new Error(`S09RefugeeFlow method conflict: ${conflict[0]}`);
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(SceneClass.prototype, name, descriptor);
  }
  return SceneClass;
}

export default installS09RefugeeFlow;
