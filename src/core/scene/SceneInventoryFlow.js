/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const NOOP = () => {};
const GET_NULL = () => null;

function notify(notification, method, message, type) {
  if (!notification) return;
  if (typeof notification[method] === 'function') notification[method](message);
  else notification.addNotification?.(message, type);
}

/** 背包、装备与获得物品反馈的显式依赖流程。 */
export class SceneInventoryFlow {
  constructor({
    equipmentFlow = null,
    itemGainedFlow = null,
    getPlayer = GET_NULL,
    getBackpack = GET_NULL,
    getFloatingText = GET_NULL,
    getNotification = GET_NULL,
    onEquipmentChanged = NOOP,
    onItemUsedEvent = NOOP
  } = {}) {
    this.equipmentFlow = equipmentFlow;
    this.itemGainedFlow = itemGainedFlow;
    this.getPlayer = typeof getPlayer === 'function' ? getPlayer : GET_NULL;
    this.getBackpack = typeof getBackpack === 'function' ? getBackpack : GET_NULL;
    this.getFloatingText = typeof getFloatingText === 'function' ? getFloatingText : GET_NULL;
    this.getNotification = typeof getNotification === 'function' ? getNotification : GET_NULL;
    this.onEquipmentChanged = typeof onEquipmentChanged === 'function' ? onEquipmentChanged : NOOP;
    this.onItemUsedEvent = typeof onItemUsedEvent === 'function' ? onItemUsedEvent : NOOP;
  }

  unequip(slot, button, { mobile = false } = {}) {
    if (button !== 'right' && !mobile) return { ok: false, reason: 'ignored' };
    const player = this.getPlayer();
    if (!player || !this.equipmentFlow?.unequip) return { ok: false, reason: 'unavailable' };

    const result = this.equipmentFlow.unequip(player, slot);
    if (!result?.ok) {
      if (result?.reason === 'inventoryFull') {
        notify(this.getNotification(), 'addWarning', '背包已满，无法卸下装备', 'warning');
      }
      return result || { ok: false, reason: 'failed' };
    }

    const removed = result.oldItem;
    const transform = player.getComponent?.('transform');
    const floatingText = this.getFloatingText();
    if (removed && transform && typeof floatingText?.addText === 'function') {
      floatingText.addText(
        transform.position.x,
        transform.position.y - 30,
        `卸下 ${removed.name || '装备'}`,
        '#ffff00'
      );
    }

    const backpack = this.getBackpack();
    if (typeof backpack?.setEntity === 'function') backpack.setEntity(player);
    else backpack?.refresh?.(player);

    const messages = [`卸下了 ${removed?.name || '装备'}`];
    this.onEquipmentChanged(messages, {
      slot,
      item: null,
      oldItem: removed,
      action: 'unequip'
    });
    return result;
  }

  itemUsed(item, heal = 0, mana = 0) {
    const player = this.getPlayer();
    const transform = player?.getComponent?.('transform');
    const floatingText = this.getFloatingText();
    if (transform && heal > 0) {
      if (typeof floatingText?.addHeal === 'function') {
        floatingText.addHeal(transform.position.x, transform.position.y - 30, heal);
      } else {
        floatingText?.addText?.(transform.position.x, transform.position.y - 30, `+${heal}`, '#00ff00');
      }
    }
    if (transform && mana > 0) {
      if (typeof floatingText?.addManaRestore === 'function') {
        floatingText.addManaRestore(transform.position.x, transform.position.y - 50, mana);
      } else {
        floatingText?.addText?.(transform.position.x, transform.position.y - 50, `+${mana}`, '#6699ff');
      }
    }
    if (item) this.onItemUsedEvent({ id: item.id, item, heal, mana, player });
    return item || null;
  }

  itemGained(item, player = null) {
    if (!item || !this.itemGainedFlow) return undefined;
    const target = player || this.getPlayer();
    if (typeof this.itemGainedFlow.onItemGained === 'function') {
      return this.itemGainedFlow.onItemGained(item, target);
    }
    return this.itemGainedFlow.itemGained?.(item, target);
  }

  confirmGainedPopup(item = null, player = null) {
    if (!this.itemGainedFlow) return false;
    const target = player || this.getPlayer();
    if (item && typeof this.itemGainedFlow.handlePrimary === 'function') {
      this.itemGainedFlow.handlePrimary(item, target);
      this.itemGainedFlow.showNext?.();
      return true;
    }
    for (const name of ['confirmGainedPopup', 'confirm']) {
      if (typeof this.itemGainedFlow[name] !== 'function') continue;
      const result = this.itemGainedFlow[name](item, target);
      return result !== false;
    }
    if (!item && typeof this.itemGainedFlow.showNext === 'function') {
      this.itemGainedFlow.showNext();
      return true;
    }
    return false;
  }
}

export default SceneInventoryFlow;
