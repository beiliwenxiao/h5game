import { Component } from '../Component.js';

function normalizeStack(stack = {}, index = 0) {
  const quantity = Math.max(0, Math.floor(Number(stack.quantity) || 0));
  const item = stack.item && typeof stack.item === 'object' ? { ...stack.item } : null;
  if (!item?.id || quantity <= 0) return null;
  return { id: stack.id || `${item.id}-${index}`, item, quantity };
}

/** 普通死亡产生的多物品容器；结算逻辑由 PickupSystem 处理。 */
export class DeathDropComponent extends Component {
  constructor(config = {}) {
    super('deathDrop');
    this.schemaVersion = 1;
    this.deathId = config.deathId || '';
    this.stacks = (config.stacks || []).map(normalizeStack).filter(Boolean);
  }

  take(stackId, quantity) {
    const stack = this.stacks.find(entry => entry.id === stackId);
    if (!stack) return 0;
    const accepted = Math.min(stack.quantity, Math.max(0, Math.floor(Number(quantity) || 0)));
    stack.quantity -= accepted;
    if (stack.quantity <= 0) this.stacks.splice(this.stacks.indexOf(stack), 1);
    return accepted;
  }

  isEmpty() {
    return this.stacks.length === 0;
  }

  serialize() {
    return {
      schemaVersion: this.schemaVersion,
      deathId: this.deathId,
      stacks: this.stacks.map(stack => ({ id: stack.id, item: { ...stack.item }, quantity: stack.quantity }))
    };
  }
}

export default DeathDropComponent;