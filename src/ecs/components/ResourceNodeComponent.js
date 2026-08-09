import { Component } from '../Component.js';

/** 资源节点纯数据组件；采集规则由 GatheringSystem 处理。 */
export class ResourceNodeComponent extends Component {
  constructor(config = {}) {
    super('resourceNode');
    this.schemaVersion = config.schemaVersion || 1;
    this.resourceType = config.resourceType || 'wood';
    this.itemId = config.itemId || this.resourceType;
    this.remaining = Math.max(0, Math.floor(Number(config.remaining) || 0));
    this.maxRemaining = Math.max(this.remaining, Math.floor(Number(config.maxRemaining) || this.remaining));
    this.yieldPerGather = Math.max(1, Math.floor(Number(config.yieldPerGather) || 1));
    this.gatherDuration = Math.max(0.1, Number(config.gatherDuration) || 1);
    this.interactionRadius = Math.max(1, Number(config.interactionRadius) || 72);
    this.requiredToolType = config.requiredToolType || null;
    this.refreshDays = Math.max(0, Math.floor(Number(config.refreshDays) || 0));
    this.refreshProgressDays = Math.max(0, Math.floor(Number(config.refreshProgressDays) || 0));
    this.guardUnitIds = Array.isArray(config.guardUnitIds) ? [...config.guardUnitIds] : [];
    this.riskEvents = Array.isArray(config.riskEvents)
      ? config.riskEvents
        .filter(event => event && typeof event.id === 'string' && event.id.trim())
        .map(event => ({
          id: event.id.trim(),
          type: typeof event.type === 'string' && event.type.trim() ? event.type.trim() : 'generic',
          chance: Math.min(1, Math.max(0, Number(event.chance) || 0)),
          message: typeof event.message === 'string' ? event.message : '',
          payload: event.payload && typeof event.payload === 'object' ? { ...event.payload } : {}
        }))
      : [];
    this.damageRatio = Math.min(1, Math.max(0, Number(config.damageRatio) || 0));
    this.depleted = this.remaining <= 0;
  }

  serialize() {
    return {
      schemaVersion: this.schemaVersion,
      resourceType: this.resourceType,
      itemId: this.itemId,
      remaining: this.remaining,
      maxRemaining: this.maxRemaining,
      yieldPerGather: this.yieldPerGather,
      gatherDuration: this.gatherDuration,
      requiredToolType: this.requiredToolType,
      refreshDays: this.refreshDays,
      refreshProgressDays: this.refreshProgressDays,
      guardUnitIds: [...this.guardUnitIds],
      riskEvents: this.riskEvents.map(event => ({ ...event, payload: { ...event.payload } })),
      damageRatio: this.damageRatio,
      depleted: this.depleted
    };
  }

  deserialize(data = {}) {
    if (Number.isInteger(data.remaining) && data.remaining >= 0) this.remaining = data.remaining;
    if (Number.isInteger(data.refreshProgressDays) && data.refreshProgressDays >= 0) this.refreshProgressDays = data.refreshProgressDays;
    if (Number.isFinite(data.damageRatio)) this.damageRatio = Math.min(1, Math.max(0, data.damageRatio));
    this.depleted = data.depleted === true || this.remaining <= 0;
  }
}

export default ResourceNodeComponent;