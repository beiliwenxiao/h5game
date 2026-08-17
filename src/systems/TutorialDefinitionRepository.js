/**
 * Tutorial definitions 的不可变只读索引。
 * TutorialSystem 只借用该索引并保存运行进度，不拥有可变 definition Map。
 */
const cloneValue = value => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => typeof child !== 'function')
      .map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
};

const deepFreeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

function normalizeDefinition(input) {
  if (!input?.id || typeof input.id !== 'string') {
    throw new TypeError(`Invalid TutorialDefinition: ${String(input?.id)}`);
  }
  return deepFreeze({
    ...cloneValue(input),
    id: input.id,
    title: input.title || '教程',
    description: input.description || '',
    steps: Array.isArray(input.steps) ? cloneValue(input.steps) : [],
    pauseGame: input.pauseGame === true,
    canSkip: input.canSkip !== false,
    priority: Number.isFinite(input.priority) ? input.priority : 0,
    category: input.category || 'general',
    scope: input.scope ? cloneValue(input.scope) : null,
    order: Number.isFinite(input.order) ? input.order : 0,
    signalRules: Array.isArray(input.signalRules) ? cloneValue(input.signalRules) : [],
    movementRule: input.movementRule ? cloneValue(input.movementRule) : null,
    completionPolicy: input.completionPolicy || 'allSteps',
    autoTrigger: input.autoTrigger === true
  });
}

export class TutorialDefinitionRepository {
  constructor(definitions = []) {
    this._definitions = new Map();
    for (const input of definitions) {
      const definition = normalizeDefinition(input);
      if (this._definitions.has(definition.id)) {
        throw new TypeError(`Invalid or duplicate TutorialDefinition: ${definition.id}`);
      }
      this._definitions.set(definition.id, definition);
    }
    Object.freeze(this);
  }

  static from(definitions = []) {
    return definitions instanceof TutorialDefinitionRepository
      ? definitions
      : new TutorialDefinitionRepository(definitions);
  }

  get size() { return this._definitions.size; }
  get(id) { return this._definitions.get(id) || null; }
  has(id) { return this._definitions.has(id); }
  values() { return this._definitions.values(); }
  all() { return Object.freeze([...this._definitions.values()]); }

  withDefinition(id, input) {
    if (!id || !input) throw new TypeError('Invalid TutorialDefinition');
    const definitions = [...this._definitions.values(), { ...input, id }]
      .filter((definition, index, all) => all.findLastIndex(item => item.id === definition.id) === index);
    return new TutorialDefinitionRepository(definitions);
  }
}

export default TutorialDefinitionRepository;