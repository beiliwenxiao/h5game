import { cloneCanonicalValue, deepFreeze } from '../CanonicalSnapshot.js';

const asList = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';

function normalizeDefinition(input, index) {
  const id = text(input?.id);
  if (!id) throw new TypeError(`SceneEventDefinition[${index}].id 必须是非空字符串`);
  const sceneIds = [...new Set(asList(input?.scope?.sceneIds).map(text).filter(Boolean))];
  if (sceneIds.length === 0) {
    throw new TypeError(`SceneEventDefinition ${id}.scope.sceneIds 必须包含场景`);
  }
  const order = Number(input?.order);
  if (!Number.isInteger(order) || order < 0) {
    throw new TypeError(`SceneEventDefinition ${id}.order 必须是非负整数`);
  }
  return deepFreeze({
    ...cloneCanonicalValue(input),
    id,
    name: text(input.name) || id,
    description: text(input.description),
    scope: { sceneIds },
    order,
    dependsOn: [...new Set(asList(input.dependsOn).map(text).filter(Boolean))]
  });
}

/**
 * SceneEvent 的不可变定义索引。
 * 只管理宏观流程身份、依赖和顺序，不拥有 StoryState 或完成运行态。
 */
export class SceneEventDefinitionRepository {
  constructor(definitions = []) {
    this._definitions = new Map();
    this._definitionIndexes = new Map();
    this._byScene = new Map();

    asList(definitions).forEach((input, index) => {
      const definition = normalizeDefinition(input, index);
      if (this._definitions.has(definition.id)) {
        throw new TypeError(`重复 SceneEventDefinition: ${definition.id}`);
      }
      this._definitions.set(definition.id, definition);
      this._definitionIndexes.set(definition.id, index);
      for (const sceneId of definition.scope.sceneIds) {
        const entries = this._byScene.get(sceneId) || [];
        if (entries.some(entry => entry.order === definition.order)) {
          throw new TypeError(`场景 ${sceneId} 存在重复 SceneEvent.order: ${definition.order}`);
        }
        entries.push(definition);
        this._byScene.set(sceneId, entries);
      }
    });

    for (const definition of this._definitions.values()) {
      for (const dependencyId of definition.dependsOn) {
        if (dependencyId === definition.id || !this._definitions.has(dependencyId)) {
          throw new TypeError(`SceneEventDefinition ${definition.id} 依赖不存在或依赖自身: ${dependencyId}`);
        }
      }
    }
    this._assertAcyclic();

    for (const [sceneId, entries] of this._byScene) {
      entries.sort((left, right) => this.compareIds(left.id, right.id));
      this._byScene.set(sceneId, Object.freeze([...entries]));
    }
    Object.freeze(this);
  }

  static from(value = []) {
    return value instanceof SceneEventDefinitionRepository
      ? value
      : new SceneEventDefinitionRepository(value);
  }

  static empty() {
    return new SceneEventDefinitionRepository();
  }

  get size() { return this._definitions.size; }
  has(id) { return this._definitions.has(id); }
  get(id) { return this._definitions.get(id) || null; }
  values() { return this._definitions.values(); }
  all() { return Object.freeze([...this._definitions.values()]); }
  getForScene(sceneId) { return this._byScene.get(text(sceneId)) || Object.freeze([]); }
  getOrder(id) { return this.get(id)?.order ?? null; }

  compareIds(leftId, rightId) {
    if (leftId === rightId) return 0;
    const left = this.get(leftId);
    const right = this.get(rightId);
    if (!left && !right) return String(leftId).localeCompare(String(rightId));
    if (!left) return 1;
    if (!right) return -1;
    return left.order - right.order
      || (this._definitionIndexes.get(left.id) ?? 0) - (this._definitionIndexes.get(right.id) ?? 0)
      || left.id.localeCompare(right.id);
  }

  _assertAcyclic() {
    const visiting = new Set();
    const visited = new Set();
    const visit = id => {
      if (visiting.has(id)) throw new TypeError(`SceneEventDefinition 依赖形成循环: ${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependencyId of this.get(id)?.dependsOn || []) visit(dependencyId);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of this._definitions.keys()) visit(id);
  }
}

export default SceneEventDefinitionRepository;
