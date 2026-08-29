/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const asList = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';

/**
 * TriggerProjectIndex - 纯 Trigger 视角的只读编辑器投影。
 *
 * 全 Trigger 化后，FlowGroup/SceneEvent 已从流程编排中移除；本索引不再按"组"归并，
 * 只提供两件事：
 *   1. Trigger / Tutorial 按 id 查找；
 *   2. 场景 → Trigger 空间的绑定投影（平铺，不再有 group 容器）。
 *
 * 替代原 FlowGroupProjectIndex / SceneEventProjectIndex（二者已删除）。
 */
export class TriggerProjectIndex {
  constructor(project = {}, { sceneDocuments = [] } = {}) {
    this.project = project || {};
    this.triggers = asList(this.project.triggers);
    this.tutorials = asList(this.project.tutorials);
    this.sceneDocuments = Array.isArray(sceneDocuments)
      ? sceneDocuments
      : Object.values(sceneDocuments || {});

    this._triggerById = new Map();
    this._tutorialById = new Map();
    this._triggerIndexes = new Map();
    this._tutorialIndexes = new Map();
    this._bindingsByTrigger = new Map();

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

  getTrigger(id) { return this._triggerById.get(text(id)) || null; }
  getTutorial(id) { return this._tutorialById.get(text(id)) || null; }

  /** 依赖本索引的编辑器布局大多按定义顺序展示，同一场景内保持该顺序。 */
  compareTriggers(left, right) {
    return (this._triggerIndexes.get(left?.id) ?? Number.MAX_SAFE_INTEGER)
      - (this._triggerIndexes.get(right?.id) ?? Number.MAX_SAFE_INTEGER)
      || text(left?.id).localeCompare(text(right?.id));
  }

  getBindingsForTrigger(triggerId, sceneId = '') {
    const id = text(triggerId);
    const targetSceneId = text(sceneId);
    return asList(this._bindingsByTrigger.get(id))
      .filter(record => !targetSceneId || record.sceneId === targetSceneId);
  }

  /**
   * 平铺绑定投影：把某个场景内全部 trigger 空间绑定，解析为其对应的 Trigger 定义。
   * records 形如 [{ id, binding, definition, layerIndex, objectIndex }]。
   * 返回 { bindings, triggers, tutorials }：
   *   - bindings：入参记录 + 解析出的 .trigger
   *   - triggers：该场景绑定实际引用（去重、按定义序）的 Trigger 定义
   *   - tutorials：该场景 editorScope 涵盖的教程定义（用于侧栏布局）
   */
  getSceneProjection(sceneId, records = []) {
    const targetSceneId = text(sceneId);
    const bindings = asList(records).map(record => {
      const trigger = record.definition || this.getTrigger(record?.binding?.triggerId);
      return { ...record, trigger };
    });
    const triggerIds = new Set();
    const triggers = [];
    for (const record of bindings) {
      const trigger = record.trigger;
      if (!trigger?.id || triggerIds.has(trigger.id)) continue;
      triggerIds.add(trigger.id);
      triggers.push(trigger);
    }
    triggers.sort((left, right) => this.compareTriggers(left, right));
    const tutorials = this.tutorials
      .filter(tutorial => !targetSceneId
        || asList(tutorial?.scope?.sceneIds).includes(targetSceneId))
      .slice()
      .sort((left, right) => (this._tutorialIndexes.get(left?.id) ?? Number.MAX_SAFE_INTEGER)
        - (this._tutorialIndexes.get(right?.id) ?? Number.MAX_SAFE_INTEGER));
    return { bindings, triggers, tutorials };
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

export default TriggerProjectIndex;