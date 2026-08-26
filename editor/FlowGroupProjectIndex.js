import { resolveFlowGroupId } from '../src/migration/SceneEventToFlowGroupMigrator.js';

const asList = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/**
 * FlowGroup、Trigger、Tutorial 与场景 binding 的只读编辑器投影。
 * membership 始终由子定义的 flowGroupId（回退 sceneEventId）反向建立，不拥有第二份流程状态。
 *
 * 兼容：本类是旧 SceneEventProjectIndex 的继任者；通过 alias 包装保留原类名 1 个大版本。
 */
export class FlowGroupProjectIndex {
  constructor(project = {}, { sceneDocuments = [] } = {}) {
    this.project = project || {};
    // 双读：优先 flowGroups，回退 sceneEvents
    this.flowGroups = asList(this.project.flowGroups).length > 0
      ? asList(this.project.flowGroups)
      : asList(this.project.sceneEvents);
    this.triggers = asList(this.project.triggers);
    this.tutorials = asList(this.project.tutorials);
    this.sceneDocuments = Array.isArray(sceneDocuments)
      ? sceneDocuments
      : Object.values(sceneDocuments || {});

    this._flowGroupById = new Map();
    this._triggerById = new Map();
    this._tutorialById = new Map();
    this._flowGroupIndexes = new Map();
    this._triggerIndexes = new Map();
    this._tutorialIndexes = new Map();
    this._bindingsByTrigger = new Map();

    this.flowGroups.forEach((definition, index) => {
      const id = text(definition?.id);
      if (!id || this._flowGroupById.has(id)) return;
      this._flowGroupById.set(id, definition);
      this._flowGroupIndexes.set(id, index);
    });
    this.triggers.forEach((definition, index) => {
      const id = text(definition?.id);
      if (!id || this._triggerById.has(id)) return;
      this._triggerById.set(id, definition);
      this._triggerIndexes.set(id, index);
    });
    this.tutorials.forEach((definition, index) => {
      const id = text(definition?.id);
      if (!id || this._tutorialById.has(id)) return;
      this._tutorialById.set(id, definition);
      this._tutorialIndexes.set(id, index);
    });
    this._indexBindings();
  }

  // ========= 兼容别名 (sceneEvent → flowGroup) =========
  getSceneEvent(id) { return this.getFlowGroup(id); }
  getSceneEvents(sceneId) { return this.getFlowGroups(sceneId); }
  getTriggersForEvent(sceneEventId) { return this.getTriggersForFlowGroup(sceneEventId); }
  getTutorialsForEvent(sceneEventId) { return this.getTutorialsForFlowGroup(sceneEventId); }

  getFlowGroup(id) { return this._flowGroupById.get(text(id)) || null; }
  getTrigger(id) { return this._triggerById.get(text(id)) || null; }
  getTutorial(id) { return this._tutorialById.get(text(id)) || null; }

  compareFlowGroups(left, right) {
    return number(left?.order, Number.MAX_SAFE_INTEGER) - number(right?.order, Number.MAX_SAFE_INTEGER)
      || (this._flowGroupIndexes.get(left?.id) ?? Number.MAX_SAFE_INTEGER)
        - (this._flowGroupIndexes.get(right?.id) ?? Number.MAX_SAFE_INTEGER)
      || text(left?.id).localeCompare(text(right?.id));
  }
  compareSceneEvents(left, right) { return this.compareFlowGroups(left, right); }

  compareTutorials(left, right) {
    const leftEvent = this.getFlowGroup(left?.flowGroupId ?? left?.sceneEventId);
    const rightEvent = this.getFlowGroup(right?.flowGroupId ?? right?.sceneEventId);
    if (leftEvent && rightEvent && leftEvent !== rightEvent) {
      const eventOrder = this.compareFlowGroups(leftEvent, rightEvent);
      if (eventOrder !== 0) return eventOrder;
    } else if (leftEvent !== rightEvent) {
      return leftEvent ? -1 : 1;
    }
    if (!leftEvent && !rightEvent) {
      const legacyOrder = number(left?.order) - number(right?.order);
      if (legacyOrder !== 0) return legacyOrder;
    }
    return number(right?.priority) - number(left?.priority)
      || (this._tutorialIndexes.get(left?.id) ?? Number.MAX_SAFE_INTEGER)
        - (this._tutorialIndexes.get(right?.id) ?? Number.MAX_SAFE_INTEGER)
      || text(left?.id).localeCompare(text(right?.id));
  }

  getFlowGroups(sceneId = '') {
    const target = text(sceneId);
    return this.flowGroups
      .filter(definition => !target || asList(definition?.scope?.sceneIds).includes(target))
      .slice()
      .sort((left, right) => this.compareFlowGroups(left, right));
  }

  getTriggersForFlowGroup(flowGroupId) {
    const id = text(flowGroupId);
    return this.triggers.filter(definition => resolveFlowGroupId(definition) === id);
  }

  getTutorialsForFlowGroup(flowGroupId) {
    const id = text(flowGroupId);
    return this.tutorials
      .filter(definition => resolveFlowGroupId(definition) === id)
      .slice()
      .sort((left, right) => this.compareTutorials(left, right));
  }

  getBindingsForTrigger(triggerId, sceneId = '') {
    const id = text(triggerId);
    const targetSceneId = text(sceneId);
    return asList(this._bindingsByTrigger.get(id))
      .filter(record => !targetSceneId || record.sceneId === targetSceneId);
  }

  getSceneProjection(sceneId, bindingRecords = []) {
    const targetSceneId = text(sceneId);
    const records = asList(bindingRecords);
    const groups = this.getFlowGroups(targetSceneId).map(flowGroup => ({
      id: flowGroup.id,
      flowGroup,
      sceneEvent: flowGroup, // 兼容：旧代码仍可能读取 sceneEvent 字段
      triggers: this.getTriggersForFlowGroup(flowGroup.id),
      tutorials: this.getTutorialsForFlowGroup(flowGroup.id),
      bindings: []
    }));
    const byId = new Map(groups.map(group => [group.id, group]));
    const unassigned = [];

    for (const record of records) {
      const trigger = record.definition || this.getTrigger(record.binding?.triggerId);
      const bindingFgId = resolveFlowGroupId(record.binding);
      const triggerFgId = resolveFlowGroupId(trigger);
      const eventId = bindingFgId || triggerFgId;
      const group = byId.get(eventId);
      record.flowGroupId = eventId;
      record.sceneEventId = eventId; // 兼容旧代码读 sceneEventId
      record.sceneEventMismatch = Boolean(bindingFgId && triggerFgId && bindingFgId !== triggerFgId);
      if (group) group.bindings.push(record);
      else unassigned.push(record);
    }

    for (const group of groups) {
      const triggerOrder = new Map(group.triggers.map((trigger, index) => [trigger.id, index]));
      group.bindings.sort((left, right) => (
        (triggerOrder.get(left.binding?.triggerId) ?? Number.MAX_SAFE_INTEGER)
          - (triggerOrder.get(right.binding?.triggerId) ?? Number.MAX_SAFE_INTEGER)
        || left.layerIndex - right.layerIndex
        || left.objectIndex - right.objectIndex
      ));
    }
    return { groups, unassigned };
  }

  _indexBindings() {
    for (const scene of this.sceneDocuments) {
      const sceneId = text(scene?.id);
      for (const layer of asList(scene?.layers)) {
        for (const binding of asList(layer?.objects)) {
          const triggerId = binding?.type === 'trigger' ? text(binding.triggerId) : '';
          if (!triggerId) continue;
          const entries = this._bindingsByTrigger.get(triggerId) || [];
          entries.push({ sceneId, binding });
          this._bindingsByTrigger.set(triggerId, entries);
        }
      }
    }
  }
}

/**
 * @deprecated 请使用 FlowGroupProjectIndex。本别名保留一个大版本后删除。
 */
export const SceneEventProjectIndex = FlowGroupProjectIndex;

export default FlowGroupProjectIndex;
