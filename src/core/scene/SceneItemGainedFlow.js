/**
 * SceneItemGainedFlow - 拾取/奖励后的物品提示与 FIFO 决策流。
 *
 * 物品必须已由调用方加入背包。本类只协调通知、弹窗和后续装备/使用，
 * 不直接依赖任何 Demo 类型；场景通过约定提供 UI 与装备服务。
 */
import { SceneEquipmentFlow } from './SceneEquipmentFlow.js';

export class SceneItemGainedFlow {
  /**
   * @param {Object} scene 提供 popup、notificationSystem、backpackPanel 等场景服务
   * @param {Object} [options]
   * @param {() => SceneEquipmentFlow} [options.getEquipmentFlow]
   * @param {(Array<string>, Object) => void} [options.onEquipmentChanged]
   * @param {(Object) => void} [options.onQueueDrained]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.getEquipmentFlow = options.getEquipmentFlow || (() => null);
    this.onEquipmentChanged = options.onEquipmentChanged || (() => {});
    this.executeIntent = typeof options.executeIntent === 'function' ? options.executeIntent : null;
    this.onQueueDrained = options.onQueueDrained || (() => {});
    this.queue = [];
  }

  /** 将一件已入背包的食物或装备加入待处理队列。 */
  onItemGained(item, player = null) {
    if (!item || (item.type !== 'equipment' && item.type !== 'consumable')) return;

    const scene = this.scene;
    const quantity = item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : '';
    scene.notificationSystem?.addNotification(
      `获得 ${item.name || '物品'}${quantity}`,
      item.type === 'equipment' ? 'info' : 'success'
    );

    if (!scene.itemGainedPopup) return;
    this.queue.push({ item, player: player || scene.playerEntity });
    if (!scene.itemGainedPopup.visible) this.showNext();
  }

  /** 显示队首物品；队列处理完毕时派发完成回调。 */
  showNext() {
    const scene = this.scene;
    const popup = scene.itemGainedPopup;
    if (this.queue.length === 0) {
      popup?.hide();
      this.onQueueDrained();
      return;
    }

    const { item, player } = this.queue.shift();
    const isEquipment = item.type === 'equipment';
    const primaryLabel = isEquipment ? '装备'
      : (item.type === 'consumable' && item.usable ? '使用' : null);
    const comparison = isEquipment
      ? SceneEquipmentFlow.computeComparison(item, player)
      : [];

    popup.show({
      item,
      comparison,
      primaryLabel: primaryLabel || '放入背包',
      remaining: this.queue.length,
      onPrimary: primaryLabel
        ? () => { this.handlePrimary(item, player); this.showNext(); }
        : () => this.showNext(),
      onStore: () => this.showNext()
    });
  }

  /** 保留给场景兼容入口的装备预览计算。 */
  computeEquipComparison(item, player) {
    return SceneEquipmentFlow.computeComparison(item, player);
  }

  /** 处理弹窗主操作：装备或使用。 */
  handlePrimary(item, player) {
    if (!player) {
      this.scene.itemGainedPopup?.hide();
      return;
    }
    if (item.type === 'equipment') this._equip(item, player);
    else if (item.type === 'consumable' && item.usable) this._useConsumable(item, player);
  }

  _equip(item, player) {
    const scene = this.scene;
    if (!this.executeIntent) return Promise.resolve({ ok: false, code: 'unavailable' });
    return Promise.resolve(this.executeIntent('item.equip', {
      itemId: item.id,
      instanceId: item.instanceId || null
    })).then(result => {
      if (!result?.ok) {
        if (result?.code === 'invalidEquipmentSlot') {
          scene.notificationSystem?.addWarning(`${item.name} 无法装备到该槽位`);
        }
        return result;
      }
      scene.notificationSystem?.addNotification(`装备了 ${item.name}`, 'success');
      scene._refreshEquipmentPanels?.(player);
      return result;
    });
  }

  _useConsumable(item) {
    if (!this.executeIntent) return Promise.resolve({ ok: false, code: 'unavailable' });
    return Promise.resolve(this.executeIntent('item.use', {
      itemId: item.id,
      instanceId: item.instanceId || null,
      quantity: 1
    })).then(result => {
      if (result?.ok) this.scene.notificationSystem?.addNotification(`使用了 ${item.name}`, 'success');
      return result;
    });
  }
}

export default SceneItemGainedFlow;