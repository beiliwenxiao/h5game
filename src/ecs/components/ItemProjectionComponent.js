import { Component } from '../Component.js';
import {
  getItemRuntimeQuantity,
  isItemInstanceState,
  serializeItemRuntimeState
} from '../../systems/items/ItemRuntimeState.js';

/** 可从 ItemDefinition + ItemRuntimeState 重建的 ECS 高频投影，不拥有定义或业务事务。 */
export class ItemProjectionComponent extends Component {
  constructor({ projectionKind = 'groundDrop', runtimeState, capabilityState = {}, pickupState = 'available' } = {}) {
    super('itemProjection');
    const state = serializeItemRuntimeState(runtimeState);
    this.projectionKind = projectionKind;
    this.definitionId = state.definitionId;
    this.instanceId = isItemInstanceState(state) ? state.instanceId : null;
    this.quantity = getItemRuntimeQuantity(state);
    this.mutable = isItemInstanceState(state) ? { ...state.mutable } : null;
    this.capabilityState = { ...capabilityState };
    this.pickupState = pickupState;
  }

  serialize() {
    const runtimeState = this.instanceId
      ? { definitionId: this.definitionId, instanceId: this.instanceId, mutable: { ...(this.mutable || {}) } }
      : { definitionId: this.definitionId, quantity: this.quantity };
    return {
      projectionKind: this.projectionKind,
      runtimeState,
      pickupState: this.pickupState
    };
  }
}

export default ItemProjectionComponent;
