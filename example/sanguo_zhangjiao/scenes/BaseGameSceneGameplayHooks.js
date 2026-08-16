import { BaseGameSceneBehaviors } from './BaseGameSceneBehaviors.js';

/**
 * 通用场景玩法兼容钩子。
 * 保持旧 Scene API，但将采集、死亡与世界交互从组合根分离。
 */
export class BaseGameSceneGameplayHooks extends BaseGameSceneBehaviors {
  /** 移除死亡实体（委托给 EntityLifecycleSystem）。 */
  removeDeadEntities() {
    const removed = this.entityLifecycleSystem.collectDeadEntities(this.entities);
    this.entityStore.removeMany(removed);
    return removed;
  }

  /** 处理 PC 左键点击地上物品的拾取。 */
  handlePickupClick() {
    return this._ensureWorldInteraction().handlePickupClick();
  }

  /** 移动端、手柄适配器和脚本统一交互入口。 */
  enqueueInteract(device = 'virtual') {
    return this.sceneRuntime?.inputRouter?.enqueueInteract?.(device) || null;
  }

  /** 子场景可覆盖死亡结算策略。 */
  resolvePlayerDefeatResolution() {
    return { type: 'normalDeath' };
  }

  /** 子场景可覆盖复活位置。 */
  resolvePlayerRespawnPosition() {
    return null;
  }

  onPlayerDefeatResolved(result = {}) {
    const position = result.respawnPosition;
    const location = position?.label || (Number.isFinite(position?.x) && Number.isFinite(position?.y)
      ? `安全点（${Math.round(position.x)}, ${Math.round(position.y)}）`
      : '安全点');
    if (result.type === 'specialFaint') {
      this._showScreenTip(`你被救回并在${location}醒来，没有遗失物资`);
      return;
    }
    const lost = (result.stacks || []).reduce((sum, stack) => sum + stack.quantity, 0);
    this._showScreenTip(lost > 0
      ? `死亡后遗失 ${lost} 份资源，已在${location}复苏，可返回原地拾取`
      : `你在${location}重新醒来，没有遗失资源`);
  }

  isPlayerActionLocked() {
    return this.gatheringSystem?.isActiveFor?.(this.playerEntity) === true;
  }

  /** 基础攻击默认只在战斗状态开放；具体场景可覆盖以支持训练或可破坏物。 */
  canPerformBasicAttack() {
    return this.combatSystem?.isInCombat?.() === true;
  }

  harvestByFacing({ silent = false } = {}) {
    if (!this.playerEntity || !this.gatheringSystem) return false;
    const playerPosition = this.playerEntity.getComponent('transform')?.position;
    if (!playerPosition) return false;
    const candidates = (this.entities || [])
      .filter(entity => entity?.getComponent?.('resourceNode'))
      .map(entity => {
        const position = entity.getComponent('transform')?.position;
        return { entity, distance: position ? Math.hypot(position.x - playerPosition.x, position.y - playerPosition.y) : Infinity };
      })
      .sort((left, right) => left.distance - right.distance);
    const result = this.gatheringSystem.start({ player: this.playerEntity, nodeEntity: candidates[0]?.entity });
    if (!result.ok && !silent) {
      const messages = {
        gatheringBusy: '正在采集中', nodeDepleted: '资源节点已经耗尽',
        outOfRange: '附近没有可采集资源', toolRequired: '需要可用的采集工具', invalidTarget: '附近没有可采集资源'
      };
      this._showScreenTip(messages[result.code] || '暂时无法采集');
    }
    return result.ok;
  }

  onGatheringEvent(event, data = {}) {
    if (event === 'started' || event === 'progress') {
      const percent = Math.max(0, Math.min(100, Math.floor((Number(data.progress) || 0) * 100)));
      if (event === 'progress' && this._lastGatheringProgressPercent === percent) return;
      this._lastGatheringProgressPercent = percent;
      const capacity = Number.isFinite(data.capacity) ? data.capacity : 0;
      const expected = Number.isFinite(data.expectedYield) ? data.expectedYield : 0;
      const tool = data.toolDurability == null
        ? '无需工具'
        : `工具 ${data.toolDurability}/${data.toolMaxDurability}`;
      this._hintPresenter?.showScreen?.(
        `采集中 ${percent}% · 预计获得 ${expected} · 背包可收 ${capacity} · ${tool} · {interact}取消`,
        { title: '采集', persist: true, owner: 'gathering' }
      );
      return;
    }

    this._lastGatheringProgressPercent = null;
    this._hintPresenter?.hideScreen?.('gathering');
    if (event === 'riskTriggered') {
      this._showScreenTip(data.message || '采集产生了意外动静', { title: '采集风险' });
      return;
    }
    if (event === 'completed') {
      this._showScreenTip(data.toolBroken ? `获得资源 ×${data.accepted}，工具已损毁` : `获得资源 ×${data.accepted}`);
      return;
    }
    if (event !== 'interrupted') return;
    const messages = {
      moved: '位置变化导致采集中断',
      damaged: data.accepted > 0 ? `受伤中断，获得资源 ×${data.accepted}` : '受伤导致采集中断',
      cancelled: '已取消采集',
      inventoryFull: '背包已满，采集未结算',
      insufficientCapacity: '背包容量不足，采集未结算'
    };
    this._showScreenTip(messages[data.code || data.reason] || '采集已中断');
  }

  /** 左键点击地上物品的拾取检测。 */
  tryClickPickup(worldX, worldY) {
    return this._ensureWorldInteraction().tryClickPickup(worldX, worldY);
  }
}

export default BaseGameSceneGameplayHooks;
