const asList = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/**
 * SceneEvent、Trigger、Tutorial 与场景 binding 的只读编辑器投影。
 * membership 始终由子定义的 sceneEventId 反向建立，不拥有第二份流程状态。
 */
export class SceneEventProjectIndex {
  constructor(project = {}, { sceneDocuments = [] } = {}) {
    this.project = project || {};
    this.sceneEvents = asList(this.project.sceneEvents);
    this.triggers = asList(this.project.triggers);
    this.tutorials = asList(this.project.tutorials);
    this.sceneDocuments = Array.isArray(sceneDocuments)
      ? sceneDocuments
      : Object.values(sceneDocuments || {});

    this._sceneEventById = new Map();
    this._triggerById = new Map();
    this._tutorialById = new Map();
    this._sceneEventIndexes = new Map();
    this._triggerIndexes = new Map();
    this._tutorialIndexes = new Map();
    this._bindingsByTrigger = new Map();

    this.sceneEvents.forEach((definition, index) => {
      const id = text(definition?.id);
      if (!id || this._sceneEventById.has(id)) return;
      this._sceneEventById.set(id, definition);
      this._sceneEventIndexes.set(id, index);
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

  getSceneEvent(id) { return this._sceneEventById.get(text(id)) || null; }
  getTrigger(id) { return this._triggerById.get(text(id)) || null; }
  getTutorial(id) { return this._tutorialById.get(text(id)) || null; }

  compareSceneEvents(left, right) {
    return number(left?.order, Number.MAX_SAFE_INTEGER) - number(right?.order, Number.MAX_SAFE_INTEGER)
      || (this._sceneEventIndexes.get(left?.id) ?? Number.MAX_SAFE_INTEGER)
        - (this._sceneEventIndexes.get(right?.id) ?? Number.MAX_SAFE_INTEGER)
      || text(left?.id).localeCompare(text(right?.id));
  }

  compareTutorials(left, right) {
    const leftEvent = this.getSceneEvent(left?.sceneEventId);
    const rightEvent = this.getSceneEvent(right?.sceneEventId);
    if (leftEvent && rightEvent && leftEvent !== rightEvent) {
      const eventOrder = this.compareSceneEvents(leftEvent, rightEvent);
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

  getSceneEvents(sceneId = '') {
    const target = text(sceneId);
    return this.sceneEvents
      .filter(definition => !target || asList(definition?.scope?.sceneIds).includes(target))
      .slice()
      .sort((left, right) => this.compareSceneEvents(left, right));
  }

  getTriggersForEvent(sceneEventId) {
    const id = text(sceneEventId);
    return this.triggers.filter(definition => text(definition?.sceneEventId) === id);
  }

  getTutorialsForEvent(sceneEventId) {
    const id = text(sceneEventId);
    return this.tutorials
      .filter(definition => text(definition?.sceneEventId) === id)
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
    const groups = this.getSceneEvents(targetSceneId).map(sceneEvent => ({
      id: sceneEvent.id,
      sceneEvent,
      triggers: this.getTriggersForEvent(sceneEvent.id),
      tutorials: this.getTutorialsForEvent(sceneEvent.id),
      bindings: []
    }));
    const byId = new Map(groups.map(group => [group.id, group]));
    const unassigned = [];

    for (const record of records) {
      const trigger = record.definition || this.getTrigger(record.binding?.triggerId);
      const bindingEventId = text(record.binding?.sceneEventId);
      const triggerEventId = text(trigger?.sceneEventId);
      const eventId = bindingEventId || triggerEventId;
      const group = byId.get(eventId);
      record.sceneEventId = eventId;
      record.sceneEventMismatch = Boolean(bindingEventId && triggerEventId && bindingEventId !== triggerEventId);
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

export default SceneEventProjectIndex;
