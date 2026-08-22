import { CommandContractKind } from '../command/CommandContracts.js';

/** committed application event 的有序场景消费桥。 */
export class SceneApplicationEventBridge {
  constructor(config = {}) {
    if (!config.notificationBus?.subscribe) {
      throw new TypeError('SceneApplicationEventBridge requires notificationBus');
    }
    this.notificationBus = config.notificationBus;
    this.onContentEvent = config.onContentEvent || null;
    this.presenter = config.presenter || null;
    this.onAuxiliaryEvent = config.onAuxiliaryEvent || null;
    this.maxRememberedEvents = Math.max(32, Number(config.maxRememberedEvents) || 512);
    this.seenEventIds = new Set();
    this.eventOrder = [];
    this.unsubscribe = null;
  }

  bind() {
    if (this.unsubscribe) return this.unsubscribe;
    this.unsubscribe = this.notificationBus.subscribe(event => this._consume(event));
    return this.unsubscribe;
  }

  async _consume(event) {
    if (event?.kind !== CommandContractKind.APPLICATION_EVENT || !event.value?.eventId) return false;
    if (this.seenEventIds.has(event.value.eventId)) return false;
    this._remember(event.value.eventId);
    await this.onContentEvent?.(event.value);
    const silent = event.value.payload?.reason === 'restore'
      || event.value.payload?.announce === false;
    if (!silent) await this.presenter?.present?.(event.value);
    if (!silent) await this.onAuxiliaryEvent?.(event.value);
    return true;
  }

  _remember(eventId) {
    this.seenEventIds.add(eventId);
    this.eventOrder.push(eventId);
    while (this.eventOrder.length > this.maxRememberedEvents) {
      this.seenEventIds.delete(this.eventOrder.shift());
    }
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.seenEventIds.clear();
    this.eventOrder.length = 0;
  }
}

export default SceneApplicationEventBridge;