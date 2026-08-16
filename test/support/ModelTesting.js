const DEFAULT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function cloneValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function normalizeSeed(seed) {
  if (Number.isFinite(seed)) return Number(seed) >>> 0;
  const source = String(seed ?? '0');
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixSeed(seed, label) {
  let mixed = normalizeSeed(seed) ^ normalizeSeed(label);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

export class SeedGenerator {
  constructor(seed) {
    this.seed = normalizeSeed(seed);
    this.state = this.seed;
    this.counter = 0;
  }

  nextUint32() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.counter++;
    return (value ^ (value >>> 14)) >>> 0;
  }

  next() {
    return this.nextUint32() / 4294967296;
  }

  int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`invalid integer range: ${min}..${max}`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  bool(probability = 0.5) {
    if (probability < 0 || probability > 1) throw new RangeError('probability must be between 0 and 1');
    return this.next() < probability;
  }

  pick(values) {
    if (!Array.isArray(values) || values.length === 0) throw new RangeError('pick requires a non-empty array');
    return values[this.int(0, values.length - 1)];
  }

  string(length, alphabet = DEFAULT_ALPHABET) {
    if (!Number.isInteger(length) || length < 0 || alphabet.length === 0) throw new RangeError('invalid string request');
    let output = '';
    for (let index = 0; index < length; index++) output += alphabet[this.int(0, alphabet.length - 1)];
    return output;
  }

  fork(label) {
    return new SeedGenerator(mixSeed(this.seed, label));
  }

  snapshot() {
    return { seed: this.seed, state: this.state, counter: this.counter };
  }

  restore(snapshot) {
    if (normalizeSeed(snapshot?.seed) !== this.seed) throw new Error('seed snapshot does not belong to this generator');
    this.state = normalizeSeed(snapshot.state);
    this.counter = Number(snapshot.counter) || 0;
    return this;
  }
}

export const ARCHITECTURE_OPERATION_KINDS = Object.freeze([
  'SCENE_LIFECYCLE', 'CONFIG_RELOAD', 'PROJECT_WORLD', 'SCENE_REFRESH',
  'EDITOR_MUTATION', 'WORLD_GRID_SAVE', 'SCHEMA_EDIT', 'CANONICAL_LOAD_FAILURE',
  'ROUND_TRIP', 'CANDIDATE_SUBMIT', 'JAVASCRIPT_AUDIT', 'CONTENT_EXTENSION',
  'QUEST_RUNTIME', 'COMMAND_EXECUTION'
]);

function architecturePayload(kind, random) {
  const id = prefix => `${prefix}-${random.string(6)}`;
  switch (kind) {
    case 'SCENE_LIFECYCLE':
      return { aliases: random.int(1, 4), frames: random.int(1, 8), repeatedDispose: random.bool() };
    case 'CONFIG_RELOAD':
      return { path: random.pick(['gameplay.followDistance', 'weather.type', 'battle.month']), value: random.pick([null, 0, false, random.int(1, 20)]) };
    case 'PROJECT_WORLD':
      return { rows: random.int(1, 30), cols: random.int(1, 30), chunkWidth: random.int(1, 20) * 64, chunkHeight: random.int(1, 20) * 36, entrySceneId: id('scene') };
    case 'SCENE_REFRESH':
      return { diskIds: [id('disk')], cacheIds: [id('cache')], revision: random.int(1, 1000) };
    case 'EDITOR_MUTATION':
      return { command: random.pick(['create', 'update', 'rename', 'delete', 'import', 'save']), sceneId: id('scene') };
    case 'WORLD_GRID_SAVE':
      return { canonicalIds: [id('canonical')], candidateId: id('candidate'), reserved: random.bool() };
    case 'SCHEMA_EDIT':
      return { path: `definitions.${id('definition')}.value`, value: random.pick([null, '', 0, false, [id('item')]]) };
    case 'CANONICAL_LOAD_FAILURE':
      return { category: random.pick(['missing', 'unreadable', 'parseFailed', 'schemaFailed']), source: `${id('source')}.json` };
    case 'ROUND_TRIP':
      return { documentId: id('document'), unknownLegal: { retained: random.bool() }, values: [random.int(-10, 10), random.int(-10, 10)] };
    case 'CANDIDATE_SUBMIT':
      return { candidateId: id('candidate'), faultPhase: random.pick(['validate', 'canonicalize', 'disk', 'memory', 'cache', 'notify']) };
    case 'JAVASCRIPT_AUDIT':
      return { scope: random.pick(['src', 'editor', 'example/sanguo_zhangjiao']), lineLimit: 1000 };
    case 'CONTENT_EXTENSION':
      return { definitionId: id('content'), capabilityId: random.pick(['stackable', 'consumable', 'equippable', 'placeable']) };
    case 'QUEST_RUNTIME':
      return { questId: id('quest'), command: random.pick(['accept', 'advance', 'abandon', 'turnIn', 'track']), expectedStateRevision: random.int(0, 20) };
    case 'COMMAND_EXECUTION':
      return { requestId: id('request'), operationId: id('operation'), expectedStateRevision: random.int(0, 20) };
    default:
      throw new Error(`unknown architecture operation kind: ${kind}`);
  }
}

export function generateArchitectureOperations(seed, { perKind = 1 } = {}) {
  if (!Number.isInteger(perKind) || perKind < 1) throw new RangeError('perKind must be a positive integer');
  const root = new SeedGenerator(seed);
  return ARCHITECTURE_OPERATION_KINDS.flatMap(kind => Array.from({ length: perKind }, (_, index) => {
    const random = root.fork(`${kind}:${index}`);
    return {
      kind,
      seed: random.seed,
      operationId: `${kind.toLowerCase()}:${random.string(8)}`,
      payload: architecturePayload(kind, random)
    };
  }));
}

export class AuthorityRng {
  constructor({ seed, stream = 'authority', substream = 'default' }) {
    this.seed = normalizeSeed(seed);
    this.stream = String(stream);
    this.substream = String(substream);
    this.generator = new SeedGenerator(mixSeed(this.seed, `${this.stream}:${this.substream}`));
  }

  next() {
    return this.generator.next();
  }

  int(min, max) {
    return this.generator.int(min, max);
  }

  snapshot() {
    return {
      seed: this.seed,
      stream: this.stream,
      substream: this.substream,
      counter: this.generator.counter,
      generator: this.generator.snapshot()
    };
  }

  restore(snapshot) {
    if (normalizeSeed(snapshot?.seed) !== this.seed || snapshot.stream !== this.stream || snapshot.substream !== this.substream) {
      throw new Error('authority RNG snapshot identity mismatch');
    }
    this.generator.restore(snapshot.generator);
    return this;
  }

  fork(substream) {
    return new AuthorityRng({ seed: this.seed, stream: this.stream, substream });
  }
}

export class SpyTrace {
  constructor() {
    this.records = [];
  }

  record(type, details = {}) {
    const entry = { sequence: this.records.length + 1, type, details: cloneValue(details) };
    this.records.push(entry);
    return entry;
  }

  phase(phase, action, details = {}) {
    return this.record('phase', { phase, action, ...cloneValue(details) });
  }

  snapshot() {
    return cloneValue(this.records);
  }

  clear() {
    this.records.length = 0;
  }
}

export class InjectedPhaseFault extends Error {
  constructor(phase, occurrence) {
    super(`injected fault at ${phase}#${occurrence}`);
    this.name = 'InjectedPhaseFault';
    this.code = 'injectedPhaseFault';
    this.phase = phase;
    this.occurrence = occurrence;
  }
}

export class PhaseFaultInjector {
  constructor(failures = [], trace = null) {
    this.failures = failures.map(failure => ({ at: 1, ...failure }));
    this.counts = new Map();
    this.trace = trace;
  }

  static at(phase, at = 1) {
    return new PhaseFaultInjector([{ phase, at }]);
  }

  check(phase) {
    const occurrence = (this.counts.get(phase) || 0) + 1;
    this.counts.set(phase, occurrence);
    this.trace?.phase(phase, 'fault-check', { occurrence });
    const failure = this.failures.find(item => item.phase === phase && item.at === occurrence);
    if (!failure) return;
    throw failure.errorFactory?.({ phase, occurrence }) || new InjectedPhaseFault(phase, occurrence);
  }

  reset() {
    this.counts.clear();
  }
}

export function createFakeClocks({ logical = 0, monotonic = 0, wall = 0 } = {}) {
  let logicalValue = logical;
  let monotonicValue = monotonic;
  let wallValue = wall;
  const ensureDelta = delta => {
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError('clock delta must be non-negative');
  };
  return {
    logical: {
      now: () => logicalValue,
      tick(step = 1) { ensureDelta(step); logicalValue += step; return logicalValue; }
    },
    monotonic: {
      now: () => monotonicValue,
      advance(delta) { ensureDelta(delta); monotonicValue += delta; return monotonicValue; }
    },
    wall: {
      now: () => wallValue,
      advance(delta) { ensureDelta(delta); wallValue += delta; return wallValue; },
      set(value) { if (!Number.isFinite(value)) throw new RangeError('wall clock must be finite'); wallValue = value; return wallValue; }
    },
    snapshot: () => ({ logical: logicalValue, monotonic: monotonicValue, wall: wallValue })
  };
}

class InMemoryStoreAdapter {
  constructor(initial = {}, { name = 'store', trace = null, faults = null } = {}) {
    this.name = name;
    this.trace = trace;
    this.faults = faults;
    this.values = new Map(Object.entries(cloneValue(initial)));
  }

  _phase(action, details = {}) {
    const phase = `${this.name}.${action}`;
    this.trace?.phase(phase, action, details);
    this.faults?.check(phase);
  }

  has(key) {
    return this.values.has(key);
  }

  read(key) {
    this._phase('read', { key });
    return cloneValue(this.values.get(key));
  }

  write(key, value) {
    this._phase('write', { key });
    this.values.set(key, cloneValue(value));
    return this;
  }

  delete(key) {
    this._phase('delete', { key });
    return this.values.delete(key);
  }

  rename(from, to) {
    this._phase('rename', { from, to });
    if (!this.values.has(from)) throw new Error(`${this.name} key not found: ${from}`);
    if (this.values.has(to)) throw new Error(`${this.name} key already exists: ${to}`);
    this.values.set(to, this.values.get(from));
    this.values.delete(from);
    return this;
  }

  keys() {
    return [...this.values.keys()];
  }

  snapshot() {
    return Object.fromEntries([...this.values.entries()].map(([key, value]) => [key, cloneValue(value)]));
  }

  restore(snapshot) {
    this.values = new Map(Object.entries(cloneValue(snapshot)));
    return this;
  }
}

export class InMemoryDiskAdapter extends InMemoryStoreAdapter {
  constructor(initial = {}, options = {}) {
    super(initial, { name: 'disk', ...options });
  }
}

export class InMemoryCacheAdapter extends InMemoryStoreAdapter {
  constructor(initial = {}, options = {}) {
    super({}, { name: 'cache', ...options });
    this.metadata = new Map();
    for (const [key, value] of Object.entries(initial)) this.write(key, value);
  }

  write(key, value, metadata = {}) {
    super.write(key, value);
    this.metadata.set(key, cloneValue({ eligible: true, ...metadata }));
    return this;
  }

  delete(key) {
    const deleted = super.delete(key);
    this.metadata.delete(key);
    return deleted;
  }

  invalidateFallback(key, reason = 'invalidated') {
    if (!this.values.has(key)) return false;
    this.metadata.set(key, { ...(this.metadata.get(key) || {}), eligible: false, reason });
    this.trace?.phase('cache.invalidate', 'invalidate-fallback', { key, reason });
    return true;
  }

  isEligible(key) {
    return this.values.has(key) && this.metadata.get(key)?.eligible === true;
  }

  metadataSnapshot() {
    return Object.fromEntries([...this.metadata.entries()].map(([key, value]) => [key, cloneValue(value)]));
  }

  restore(snapshot, metadata = {}) {
    super.restore(snapshot);
    this.metadata = new Map(Object.entries(cloneValue(metadata)));
    return this;
  }
}

export class InMemoryTransactionAdapter {
  constructor(store = new InMemoryDiskAdapter(), { trace = null, faults = null } = {}) {
    this.store = store;
    this.trace = trace;
    this.faults = faults;
    this.sequence = 0;
  }

  begin(label = `transaction-${++this.sequence}`) {
    const draft = new InMemoryDiskAdapter(this.store.snapshot());
    const trace = this.trace;
    const faults = this.faults;
    let state = 'active';
    const requireActive = () => {
      if (state !== 'active') throw new Error(`${label} is ${state}`);
    };
    trace?.phase('transaction.begin', 'begin', { label });
    return {
      label,
      get state() { return state; },
      read(key) { requireActive(); return draft.read(key); },
      write(key, value) { requireActive(); draft.write(key, value); return this; },
      delete(key) { requireActive(); draft.delete(key); return this; },
      rename(from, to) { requireActive(); draft.rename(from, to); return this; },
      snapshot() { return draft.snapshot(); },
      commit: () => {
        requireActive();
        trace?.phase('transaction.prepare', 'prepare', { label });
        faults?.check('transaction.prepare');
        trace?.phase('transaction.commit', 'commit', { label });
        faults?.check('transaction.commit');
        this.store.restore(draft.snapshot());
        state = 'committed';
        return this.store.snapshot();
      },
      rollback: () => {
        if (state !== 'active') return false;
        state = 'rolledBack';
        trace?.phase('transaction.rollback', 'rollback', { label });
        return true;
      }
    };
  }

  async transact(callback, label) {
    const transaction = this.begin(label);
    try {
      const value = await callback(transaction);
      transaction.commit();
      return { ok: true, value, snapshot: this.store.snapshot() };
    } catch (error) {
      transaction.rollback();
      return { ok: false, error, snapshot: this.store.snapshot() };
    }
  }
}

export class LoopbackFakeTransport {
  constructor(handler, { trace = null, faults = null, serialize = JSON.stringify, deserialize = JSON.parse } = {}) {
    if (typeof handler !== 'function') throw new TypeError('loopback handler is required');
    this.handler = handler;
    this.trace = trace;
    this.faults = faults;
    this.serialize = serialize;
    this.deserialize = deserialize;
  }

  _crossBoundary(value) {
    return this.deserialize(this.serialize(value));
  }

  async request(message) {
    const request = this._crossBoundary(message);
    this.trace?.phase('transport.request', 'request', { message: request });
    this.faults?.check('transport.request');
    const handled = await this.handler(request);
    this.faults?.check('transport.response');
    const response = this._crossBoundary(handled);
    this.trace?.phase('transport.response', 'response', { message: response });
    return response;
  }

  execute(message) {
    return this.request(message);
  }
}

function defaultFailureKey(error) {
  return `${error?.name || 'Error'}:${error?.code || ''}:${error?.phase || ''}`;
}

function getAtPath(root, path) {
  return path.reduce((value, key) => value instanceof Map ? value.get(key) : value?.[key], root);
}

function visitValues(value, path, visitor) {
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitValues(item, [...path, index], visitor));
  } else if (value instanceof Map) {
    for (const [key, item] of value) visitValues(item, [...path, key], visitor);
  } else if (value && typeof value === 'object' && !(value instanceof Set)) {
    for (const [key, item] of Object.entries(value)) visitValues(item, [...path, key], visitor);
  }
}

function fieldPaths(commands, protectedFields) {
  const paths = [];
  commands.forEach((command, commandIndex) => {
    const visit = (value, path) => {
      if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Set || value instanceof Map) return;
      for (const [key, item] of Object.entries(value)) {
        const itemPath = [...path, key];
        if (!protectedFields.has(key)) paths.push([commandIndex, ...itemPath]);
        visit(item, itemPath);
      }
    };
    visit(command, []);
  });
  return paths;
}

function collectionPaths(commands) {
  const paths = [];
  commands.forEach((command, commandIndex) => {
    visitValues(command, [], (value, path) => {
      if (Array.isArray(value) || value instanceof Set || value instanceof Map) paths.push([commandIndex, ...path]);
    });
  });
  return paths;
}

function numberPaths(commands) {
  const paths = [];
  commands.forEach((command, commandIndex) => {
    visitValues(command, [], (value, path) => {
      if (typeof value === 'number' && Number.isFinite(value) && value !== 0) paths.push([commandIndex, ...path]);
    });
  });
  return paths;
}

function deleteField(commands, fullPath) {
  const candidate = cloneValue(commands);
  const [commandIndex, ...path] = fullPath;
  const parent = getAtPath(candidate[commandIndex], path.slice(0, -1));
  const key = path.at(-1);
  if (parent instanceof Map) parent.delete(key);
  else delete parent[key];
  return candidate;
}

function removeCollectionItem(commands, fullPath, itemKey) {
  const candidate = cloneValue(commands);
  const [commandIndex, ...path] = fullPath;
  const collection = getAtPath(candidate[commandIndex], path);
  if (Array.isArray(collection)) collection.splice(itemKey, 1);
  else if (collection instanceof Set) collection.delete(itemKey);
  else if (collection instanceof Map) collection.delete(itemKey);
  return candidate;
}

function replaceNumber(commands, fullPath, replacement) {
  const candidate = cloneValue(commands);
  const [commandIndex, ...path] = fullPath;
  const parent = getAtPath(candidate[commandIndex], path.slice(0, -1));
  const key = path.at(-1);
  if (parent instanceof Map) parent.set(key, replacement);
  else parent[key] = replacement;
  return candidate;
}

function numberCandidates(value) {
  const sign = Math.sign(value);
  return [...new Set([0, sign, Math.trunc(value / 2), value - sign])]
    .filter(candidate => candidate !== value && Math.abs(candidate) < Math.abs(value));
}

export class ModelRunFailure extends Error {
  constructor({ seed, originalCommands, minimalCommands, trace, phase, shrinkSteps, cause }) {
    const report = {
      seed,
      phase,
      originalCommands,
      minimalCommands,
      shrinkSteps,
      actualTrace: trace,
      cause: { name: cause?.name, code: cause?.code, message: cause?.message }
    };
    super(`Model run failed (seed=${seed})\n${JSON.stringify(report, null, 2)}`);
    this.name = 'ModelRunFailure';
    this.code = 'modelRunFailed';
    this.seed = seed;
    this.phase = phase;
    this.originalCommands = cloneValue(originalCommands);
    this.minimalCommands = cloneValue(minimalCommands);
    this.actualTrace = cloneValue(trace);
    this.shrinkSteps = cloneValue(shrinkSteps);
    this.cause = cause;
  }
}

export class ModelCommandRunner {
  constructor({
    createModel,
    createSystem,
    applyModel,
    executeSystem,
    oracle,
    finalOracle = null,
    failureKey = defaultFailureKey,
    protectedFields = ['type', 'kind', 'commandType']
  }) {
    for (const [name, value] of Object.entries({ createModel, createSystem, applyModel, executeSystem, oracle })) {
      if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
    }
    this.createModel = createModel;
    this.createSystem = createSystem;
    this.applyModel = applyModel;
    this.executeSystem = executeSystem;
    this.oracle = oracle;
    this.finalOracle = finalOracle;
    this.failureKey = failureKey;
    this.protectedFields = new Set(protectedFields);
  }

  _context(seed, trace) {
    const root = new SeedGenerator(seed);
    const replaySeed = mixSeed(root.seed, 'model-command-runner');
    return {
      seed: root.seed,
      trace,
      generator: new SeedGenerator(replaySeed),
      modelGenerator: new SeedGenerator(replaySeed),
      systemGenerator: new SeedGenerator(replaySeed),
      authorityRng: new AuthorityRng({ seed: root.seed }),
      clocks: createFakeClocks()
    };
  }

  async _evaluate(commands, seed) {
    const trace = new SpyTrace();
    const context = this._context(seed, trace);
    let model;
    let system;
    try {
      model = await this.createModel(context);
      system = await this.createSystem(context);
      for (let index = 0; index < commands.length; index++) {
        const command = cloneValue(commands[index]);
        trace.phase('command', 'start', { index, command });
        const expected = await this.applyModel({ model, command: cloneValue(command), index, context });
        const actual = await this.executeSystem({ system, command: cloneValue(command), index, context });
        await this.oracle({ model, system, command, expected, actual, index, context });
        trace.phase('command', 'complete', { index, expected, actual });
      }
      if (this.finalOracle) await this.finalOracle({ model, system, commands: cloneValue(commands), context });
      return { failed: false, seed: context.seed, model, system, commands: cloneValue(commands), trace: trace.snapshot() };
    } catch (error) {
      if (!error.phase) error.phase = 'model-oracle';
      trace.phase(error.phase, 'failure', { name: error.name, code: error.code, message: error.message });
      return { failed: true, seed: context.seed, model, system, commands: cloneValue(commands), trace: trace.snapshot(), error };
    }
  }

  async _accepted(candidate, seed, failureKey) {
    const evaluation = await this._evaluate(candidate, seed);
    return evaluation.failed && this.failureKey(evaluation.error) === failureKey ? evaluation : null;
  }

  async _shrink(originalCommands, seed, initial) {
    let commands = cloneValue(originalCommands);
    let evaluation = initial;
    const key = this.failureKey(initial.error);
    const steps = [];
    let changed = true;

    while (changed) {
      changed = false;
      for (let index = 0; index < commands.length; index++) {
        const candidate = commands.filter((_, candidateIndex) => candidateIndex !== index);
        const accepted = await this._accepted(candidate, seed, key);
        if (!accepted) continue;
        steps.push({ stage: 'commands', action: 'delete', index });
        commands = candidate;
        evaluation = accepted;
        changed = true;
        break;
      }
    }

    changed = true;
    while (changed) {
      changed = false;
      for (const path of fieldPaths(commands, this.protectedFields)) {
        const accepted = await this._accepted(deleteField(commands, path), seed, key);
        if (!accepted) continue;
        steps.push({ stage: 'fields', action: 'delete', path });
        commands = accepted.commands;
        evaluation = accepted;
        changed = true;
        break;
      }
    }

    changed = true;
    while (changed) {
      changed = false;
      collectionLoop: for (const path of collectionPaths(commands)) {
        const collection = getAtPath(commands[path[0]], path.slice(1));
        const keys = Array.isArray(collection) ? collection.map((_, index) => index).reverse()
          : collection instanceof Set ? [...collection]
            : [...collection.keys()];
        for (const itemKey of keys) {
          const accepted = await this._accepted(removeCollectionItem(commands, path, itemKey), seed, key);
          if (!accepted) continue;
          steps.push({ stage: 'collections', action: 'delete', path, itemKey });
          commands = accepted.commands;
          evaluation = accepted;
          changed = true;
          break collectionLoop;
        }
      }
    }

    changed = true;
    while (changed) {
      changed = false;
      numberLoop: for (const path of numberPaths(commands)) {
        const current = getAtPath(commands[path[0]], path.slice(1));
        for (const replacement of numberCandidates(current)) {
          const accepted = await this._accepted(replaceNumber(commands, path, replacement), seed, key);
          if (!accepted) continue;
          steps.push({ stage: 'numbers', action: 'replace', path, from: current, to: replacement });
          commands = accepted.commands;
          evaluation = accepted;
          changed = true;
          break numberLoop;
        }
      }
    }

    return { commands, evaluation, steps };
  }

  async run(commands, { seed } = {}) {
    if (!Array.isArray(commands)) throw new TypeError('commands must be an array');
    const normalizedSeed = normalizeSeed(seed);
    const initial = await this._evaluate(commands, normalizedSeed);
    if (!initial.failed) return initial;
    const shrunk = await this._shrink(commands, normalizedSeed, initial);
    throw new ModelRunFailure({
      seed: normalizedSeed,
      originalCommands: commands,
      minimalCommands: shrunk.commands,
      trace: shrunk.evaluation.trace,
      phase: shrunk.evaluation.error.phase,
      shrinkSteps: shrunk.steps,
      cause: shrunk.evaluation.error
    });
  }
}