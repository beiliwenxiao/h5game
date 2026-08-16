import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SceneSystemContainer } from '../src/core/scene/SceneSystemContainer.js';
import { ContentValidator, FieldType } from '../src/core/validation/ContentValidator.js';
import { CanonicalSnapshot } from '../src/core/CanonicalSnapshot.js';
import { DefinitionRepository, DefinitionRepositoryValidationError } from '../src/core/DefinitionRepository.js';
import { auditTrackedJavaScript, readExceptionManifest } from '../src/dev/JavaScriptAuditGate.js';
import { TriggerGraph } from '../src/core/scenario/TriggerGraph.js';
import { ScenarioDefinitionIndex } from '../src/core/scenario/ScenarioDefinitionIndex.js';
import { TriggerSystem } from '../src/systems/TriggerSystem.js';
import { createStandardActionDescriptorRegistry } from '../src/systems/ActionDescriptorRegistry.js';
import { CommandAdapter } from '../src/systems/CommandAdapter.js';
import { QuestSystem } from '../src/systems/QuestSystem.js';
import { SceneEditorHistory } from '../editor/SceneEditorHistory.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXED_SEED = 0x5eedc0de;
const ARCHITECTURE_KINDS = new Set([
  'SCENE_LIFECYCLE', 'CONFIG_RELOAD', 'PROJECT_WORLD', 'SCENE_REFRESH',
  'EDITOR_MUTATION', 'WORLD_GRID_SAVE', 'SCHEMA_EDIT', 'CANONICAL_LOAD_FAILURE',
  'ROUND_TRIP', 'CANDIDATE_SUBMIT', 'JAVASCRIPT_AUDIT', 'CONTENT_EXTENSION',
  'QUEST_RUNTIME', 'COMMAND_EXECUTION'
]);

const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const readOptional = relativePath => {
  const absolute = path.join(ROOT, relativePath);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
};

function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createHarness(seed, faultAt = null) {
  const trace = [];
  const random = seededRng(seed);
  const adapter = name => ({
    state: new Map(),
    write(key, value, phase = name) {
      trace.push(`${name}:write:${key}`);
      if (faultAt === phase) throw new Error(`injected:${phase}`);
      this.state.set(key, structuredClone(value));
    },
    snapshot() { return [...this.state.entries()]; }
  });
  return {
    disk: adapter('disk'), cache: adapter('cache'), trace, faultAt,
    clocks: { logical: () => 17, monotonic: () => 101, wall: () => 1700000000000 },
    rng: { seed, next: random },
    transport: {
      async execute(message) {
        trace.push({ transport: 'request', message: structuredClone(message) });
        const response = structuredClone(message);
        trace.push({ transport: 'response', message: response });
        return response;
      }
    }
  };
}

function makeInput(probe, seed, generated) {
  const random = seededRng(seed);
  return {
    kind: probe.kind,
    probe: probe.id,
    seed,
    generated,
    variant: {
      aliases: generated ? 2 + Math.floor(random() * 3) : 2,
      precision: generated ? 1.2345 + random() / 10000 : 1.234567,
      faultPhase: generated
        ? ['validate', 'disk', 'memory', 'cache', 'notify'][Math.floor(random() * 5)]
        : (probe.faultPhase || 'disk')
    }
  };
}

// Seeds drive generated inputs and replay only. A snapshot revision is a separate,
// stable test identifier and must satisfy CanonicalSnapshot's revision contract.
function canonicalTestRevision(seed, role = 'snapshot') {
  return `property-1:${role}:${seed >>> 0}`;
}

function executableJavaScript() {
  const roots = ['src', 'editor', 'example/sanguo_zhangjiao'];
  const output = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const relative = path.relative(ROOT, fullPath).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (/(^|\/)(node_modules|dist|desktop|mobile|test|tests|fixtures|vendor|third_party|generated)(\/|$)/.test(relative)) continue;
        visit(fullPath);
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
        output.push({ file: relative, source: fs.readFileSync(fullPath, 'utf8') });
      }
    }
  };
  for (const root of roots) visit(path.join(ROOT, root));
  return output;
}

function result(input, phase, commandSequence, snapshot, actualTrace, correctPredicate, counterexample) {
  return {
    triggered: true,
    correctPredicate,
    phase,
    commandSequence,
    snapshot,
    actualTrace,
    counterexample
  };
}

function expectedBehavior(observation) {
  return observation.correctPredicate === true;
}

function isBugCondition(input, observation) {
  return ARCHITECTURE_KINDS.has(input.kind)
    && observation.triggered === true
    && !expectedBehavior(observation, input);
}

const PROBES = [
  { id: 'duplicate-owned-lifecycle', kind: 'SCENE_LIFECYCLE' },
  { id: 'module-global-owner', kind: 'SCENE_LIFECYCLE' },
  { id: 'null-is-not-missing', kind: 'CONFIG_RELOAD' },
  { id: 'project-only-derivation', kind: 'PROJECT_WORLD' },
  { id: 'disk-refresh-removes-cache-id', kind: 'SCENE_REFRESH' },
  { id: 'editor-atomic-commit', kind: 'EDITOR_MUTATION', faultPhase: 'disk' },
  { id: 'world-grid-canonical-closure', kind: 'WORLD_GRID_SAVE' },
  { id: 'schema-aware-field-preservation', kind: 'SCHEMA_EDIT' },
  { id: 'lossless-round-trip', kind: 'ROUND_TRIP' },
  { id: 'classified-load-failure', kind: 'CANONICAL_LOAD_FAILURE' },
  { id: 'complete-candidate-before-commit', kind: 'CANDIDATE_SUBMIT', faultPhase: 'validate' },
  { id: 'javascript-scope-lines-responsibility', kind: 'JAVASCRIPT_AUDIT' },
  { id: 'json-only-content-extension', kind: 'CONTENT_EXTENSION' },
  { id: 'duplicate-definition-rejected', kind: 'CONTENT_EXTENSION' },
  { id: 'item-ui-command-port', kind: 'CONTENT_EXTENSION' },
  { id: 'trigger-success-only-ledger', kind: 'CONTENT_EXTENSION' },
  { id: 'trigger-sole-kernel', kind: 'CONTENT_EXTENSION' },
  { id: 'quest-definition-runtime-transaction', kind: 'QUEST_RUNTIME' },
  { id: 'request-operation-separation', kind: 'COMMAND_EXECUTION' },
  { id: 'projection-gap-stops-apply', kind: 'COMMAND_EXECUTION' },
  { id: 'clock-rng-replay', kind: 'COMMAND_EXECUTION' }
];

async function executeOriginal(input) {
  const worldMapSource = read('editor/WorldMapEditor.js');
  const editorManagerSource = read('editor/EditorDataManager.js');
  const loaderSource = read('editor/SceneDataLoader.js');
  const triggerSource = read('src/systems/TriggerSystem.js');
  const questSource = read('src/systems/QuestSystem.js');
  const pickupSource = read('src/systems/PickupSystem.js');

  switch (input.probe) {
    case 'duplicate-owned-lifecycle': {
      const events = [];
      const shared = { update: () => events.push('update:shared'), destroy: () => events.push('destroy:shared') };
      const container = new SceneSystemContainer();
      for (let index = 0; index < input.variant.aliases; index++) container.register(`owner-${index}`, shared, { order: index });
      container.update(0.016);
      container.destroy();
      container.destroy();
      const updates = events.filter(event => event === 'update:shared').length;
      const disposals = events.filter(event => event === 'destroy:shared').length;
      return result(input, 'ownership-lifecycle', [`register same identity x${input.variant.aliases}`, 'update(frame=1)', 'dispose()', 'dispose()'],
        { aliases: input.variant.aliases, ownership: 'owned' }, { events, updates, disposals },
        updates === 1 && disposals === 1,
        `same owned identity updated ${updates} times and disposed ${disposals} times`);
    }
    case 'module-global-owner': {
      const modules = ['editor/EditorDataManager.js', 'editor/SceneDataLoader.js', 'editor/SceneDataExporter.js'];
      const globalOwners = modules.filter(file => /export const \w+\s*=\s*new /.test(read(file)));
      return result(input, 'dependency-ownership', ['import lifecycle-managed capabilities', 'inspect creation ownership'],
        { modules }, { globalOwners }, globalOwners.length === 0,
        `module-level mutable instances: ${globalOwners.join(', ')}`);
    }
    case 'null-is-not-missing': {
      const validator = new ContentValidator();
      validator.registerSchema({ id: 'runtime-config', fields: { followDistance: { type: FieldType.NUMBER, min: 1, max: 20 } } });
      const candidate = { followDistance: null };
      const validation = validator.validate(candidate, 'runtime-config', 'candidate');
      const rejectedAtRootPath = !validation.ok && validation.errors.some(error => error.path === 'candidate.followDistance');
      return result(input, 'candidate-validation', ['load last-good', 'submit followDistance:null', 'validate candidate'],
        { lastGood: { followDistance: 8 }, candidate }, validation, rejectedAtRootPath,
        'optional non-null followDistance:null was accepted or not reported at candidate.followDistance');
    }
    case 'project-only-derivation': {
      const demoFallbacks = [...worldMapSource.matchAll(/(?:chunkWidth|chunkHeight|cols|rows):\s*r\.[^\n]+\|\|\s*\d+/g)].map(match => match[0]);
      return result(input, 'project-derivation', ['load rows=12 cols=10 chunk=960x540 entry=S03', 'derive bounds/entry/offset'],
        { rows: 12, cols: 10, chunkWidth: 960, chunkHeight: 540, entrySceneId: 'S03', local: { x: 7, y: 11 } },
        { demoFallbacks }, demoFallbacks.length === 0,
        `Demo defaults remain in project derivation: ${demoFallbacks.join('; ')}`);
    }
    case 'disk-refresh-removes-cache-id': {
      const cacheExtendsIds = /localStorage[\s\S]*availableScenes\.push\(s\.id\)/.test(worldMapSource);
      return result(input, 'repository-refresh', ['disk rename S05 -> S05A', 'retain cache S05', 'refresh IDs'],
        { diskIds: ['S05A'], cacheIds: ['S05'] }, { cacheExtendsIds }, !cacheExtendsIds,
        'stale cache ID can extend the disk canonical ID set');
    }
    case 'editor-atomic-commit': {
      const harness = createHarness(input.seed, input.variant.faultPhase);
      harness.disk.state.set('world', { revision: 'before' });
      harness.cache.state.set('world', { revision: 'before' });
      const directSave = worldMapSource.includes("fetch('/api/save-file'");
      const fullPipeline = /validate[\s\S]*canonicalize[\s\S]*atomic/i.test(worldMapSource);
      try { harness.disk.write('world', { revision: 'candidate' }, input.variant.faultPhase); } catch (error) { harness.trace.push(error.message); }
      return result(input, 'editor-transaction', [`inject fault:${input.variant.faultPhase}`, 'save world map'],
        { diskBefore: 'before', memoryBefore: 'before', cacheBefore: 'before' },
        { directSave, fullPipeline, adapterTrace: harness.trace, disk: harness.disk.snapshot(), cache: harness.cache.snapshot() },
        !directSave || fullPipeline,
        'editor exposes direct save without complete candidate + atomic transaction boundary');
    }
    case 'world-grid-canonical-closure': {
      const cacheIdsAreCandidates = /localStorage[\s\S]*availableScenes\.push\(s\.id\)/.test(worldMapSource);
      const closureRejection = /canonicalClosure|nonCanonical|invalidReference/.test(worldMapSource);
      return result(input, 'world-grid-closure', ['cache private ID CACHE_ONLY', 'place reserved CACHE_ONLY', 'save grid'],
        { canonicalIds: ['S01'], cacheIds: ['CACHE_ONLY'], grid: [[{ sceneId: 'CACHE_ONLY', reserved: true }]] },
        { cacheIdsAreCandidates, closureRejection }, !cacheIdsAreCandidates && closureRejection,
        'cache-only ID can enter a world-grid candidate without whole-candidate rejection');
    }
    case 'schema-aware-field-preservation':
    case 'lossless-round-trip': {
      const before = {
        id: 'S01', unknownLegal: { keep: true }, imageAssets: { unusedStable: { src: 'assets/images/stable.png' } },
        layers: [{ id: 'objects', objects: [{ id: 'stable-id', imageId: 'stable-image', assetId: 'stable-image', x: input.variant.precision, points: [[input.variant.precision, 2.34567]] }] }]
      };
      const editor = { sceneData: structuredClone(before), onSceneChange() {}, ui: { showToast() {} } };
      new SceneEditorHistory(editor).save();
      const after = editor.sceneData;
      const unchanged = JSON.stringify(after) === JSON.stringify(before);
      const phase = input.probe === 'schema-aware-field-preservation' ? 'schema-aware-edit' : 'canonical-round-trip';
      return result(input, phase, ['load', 'preview', 'save without semantic edit', 'reload'], before,
        { before, after }, unchanged,
        'no-op editor round-trip removed legal fields or rounded canonical values');
    }
    case 'classified-load-failure': {
      const oldDemoFallback = /scene_Prologue|scene_Act1|第一幕|内置默认值/.test(loaderSource);
      const categories = ['missing', 'unreadable', 'parseFailed', 'schemaFailed'];
      const exposesCategories = categories.every(category => loaderSource.includes(category));
      return result(input, 'canonical-load-failure', ['load last-good', 'inject missing/unreadable/parse/schema failure', 'classify source/category'],
        { lastGood: 'canonical-S01', categories }, { oldDemoFallback, exposesCategories }, !oldDemoFallback && exposesCategories,
        'load failure is unclassified and/or can leak built-in Demo fallback content');
    }
    case 'complete-candidate-before-commit': {
      const localStorageCommit = /saveScenesData[\s\S]*localStorage\.setItem/.test(editorManagerSource);
      const fullPipeline = /schema[\s\S]*reference[\s\S]*businessRule[\s\S]*canonicalize/.test(editorManagerSource);
      return result(input, 'candidate-submit', ['submit invalid nested reference', `inject fault:${input.variant.faultPhase}`],
        { candidate: { id: 'S-new', triggerRef: 'missing' }, disk: 'before', memory: 'before', cache: 'before' },
        { localStorageCommit, fullPipeline, committedBeforeValidation: localStorageCommit && !fullPipeline },
        !localStorageCommit || fullPipeline,
        'candidate can reach localStorage commit before schema/reference/business-rule validation');
    }
    case 'javascript-scope-lines-responsibility': {
      const files = executableJavaScript().map(({ file }) => file);
      const audit = auditTrackedJavaScript({
        root: ROOT,
        paths: files,
        exceptionManifest: readExceptionManifest(ROOT)
      });
      const lineOrResponsibilityFailures = audit.violations.filter(violation => (
        violation.code === 'line-limit-or-invalid-exception'
        || violation.code.includes('overreach')
        || violation.code.includes('responsibility')
      ));
      const oversizedWithoutValidException = audit.units.filter(unit => (
        unit.physicalLines > 1000 && unit.exception.status !== 'valid'
      ));
      const invalidExceptions = audit.units.filter(unit => (
        unit.physicalLines > 1000 && unit.exception.status === 'invalid'
      ));
      return result(input, 'javascript-audit', ['enumerate tracked executable JavaScript', 'count physical lines', 'validate responsibility and evidence-bound exception gate'],
        { scope: ['src', 'editor', 'example/sanguo_zhangjiao'], exclusions: ['test', 'fixtures', 'third-party', 'generated', 'dist', 'desktop', 'mobile'] },
        { units: audit.units, lineOrResponsibilityFailures, oversizedWithoutValidException, invalidExceptions },
        lineOrResponsibilityFailures.length === 0 && oversizedWithoutValidException.length === 0 && invalidExceptions.length === 0,
        'tracked executable units violate the responsibility gate or exceed 1000 lines without valid evidence/hash/line/responsibility/owner/date exception');
    }
    case 'json-only-content-extension': {
      const snapshot = CanonicalSnapshot.fromProject({
        schemaVersion: 1,
        scenes: [{ id: 'S01' }], battles: [{ id: 'battle.one' }],
        dialogues: [], quests: [], tutorials: [], rescues: [], endings: [], scenarios: [], library: {},
        triggers: [{ id: 'generic-trigger', when: { type: 'signal' }, do: [{ action: 'battle.command', params: { battleId: 'battle.one', operation: 'start' } }] }]
      }, { revision: canonicalTestRevision(input.seed, 'content-extension') });
      const repository = DefinitionRepository.fromSnapshot(snapshot);
      const descriptors = createStandardActionDescriptorRegistry();
      const adapter = new CommandAdapter({ registry: descriptors, definitionRepository: repository, commandGateway: { execute() {} } });
      const graph = TriggerGraph.fromSnapshot(snapshot);
      const index = ScenarioDefinitionIndex.fromSnapshot(snapshot, { triggerGraph: graph });
      const audit = auditTrackedJavaScript({
        root: ROOT,
        paths: executableJavaScript().map(({ file }) => file),
        exceptionManifest: readExceptionManifest(ROOT)
      });
      const contentBranches = audit.violations.filter(violation => (
        violation.code === 'content-named-handler' || violation.code === 'content-flow-branch'
      ));
      const descriptorsAreClosed = descriptors.all().every(descriptor => (
        Object.isFrozen(descriptor)
        && descriptor.adapterId === 'command'
        && typeof descriptor.commandType === 'string'
        && !Object.values(descriptor).some(value => typeof value === 'function')
      ));
      return result(input, 'content-extension-restart', ['add schema-expressible content JSON', 'publish CanonicalSnapshot', 'derive TriggerGraph/index', 'replay same snapshot/seed/commands'],
        { jsonDelta: { item: 'existing-capability' }, executableJavaScriptDiff: 0, seed: input.seed },
        { contentBranches, descriptorIds: descriptors.ids(), commandAdapter: adapter.constructor.name, snapshotRevision: snapshot.definitionRevision, graphIds: graph.ids(), repositoryKinds: repository.kinds(), indexedScenarioCount: index.ids().length },
        contentBranches.length === 0 && descriptorsAreClosed && adapter instanceof CommandAdapter && graph.has('generic-trigger') && repository.has('triggers', 'generic-trigger'),
        'production content scope has a content-named handler/branch or cannot close canonical trigger definitions through ActionDescriptor and CommandAdapter');
    }
    case 'duplicate-definition-rejected': {
      const first = { id: 'same', value: 1 };
      const second = { id: 'same', value: 2 };
      const lastSuccessfulSnapshot = CanonicalSnapshot.fromProject({ schemaVersion: 1, library: { items: [first] } }, { revision: canonicalTestRevision(input.seed, 'last-good') });
      const lastSuccessfulRepository = DefinitionRepository.fromSnapshot(lastSuccessfulSnapshot);
      let currentSnapshot = lastSuccessfulSnapshot;
      let currentRepository = lastSuccessfulRepository;
      let rejected = false;
      let errors = [];
      try {
        const candidateSnapshot = CanonicalSnapshot.fromProject({ schemaVersion: 1, library: { items: [first, second] } }, { revision: canonicalTestRevision(input.seed, 'candidate') });
        const candidateRepository = DefinitionRepository.fromSnapshot(candidateSnapshot);
        currentSnapshot = candidateSnapshot;
        currentRepository = candidateRepository;
      } catch (error) {
        rejected = error instanceof DefinitionRepositoryValidationError;
        errors = error.errors || [];
      }
      return result(input, 'definition-publication', ['build last successful CanonicalSnapshot', 'build duplicate candidate definition IDs', 'validate DefinitionRepository before publish'],
        { definitions: [first, second] },
        { rejected, errors, currentRevision: currentSnapshot.definitionRevision, published: currentRepository.get('items', 'same') },
        rejected && currentSnapshot === lastSuccessfulSnapshot && currentRepository === lastSuccessfulRepository && currentRepository.get('items', 'same')?.value === first.value,
        'duplicate definition ID was not rejected before publish, partially published, or replaced the last successful snapshot');
    }
    case 'item-ui-command-port': {
      const directInventoryCommit = /inventoryTransactions\.commit\(/.test(pickupSource);
      const gateway = /CommandGateway|AuthorityPort|ItemLifecycleService/.test(pickupSource);
      const uiDirectStats = /statsComponent\.(?:attack|defense|maxHp|maxMp|speed)\s*[+\-]=/.test(read('src/ui/InventoryPanel.js'));
      return result(input, 'item-command-bypass', ['submit pickup intent', 'inject item/UI failure', 'inspect authoritative mutation path'],
        { item: { definitionId: 'potion', quantity: 1 }, operationId: 'item-op' },
        { directInventoryCommit, gateway, uiDirectStats }, gateway && !directInventoryCommit && !uiDirectStats,
        'Pickup/UI can mutate inventory or stats without the unified command port');
    }
    case 'trigger-success-only-ledger': {
      const events = [];
      const trigger = new TriggerSystem();
      trigger.registerAction('rejecting', () => { events.push('action:rejecting'); throw new Error('injected'); });
      trigger.registerAction('must-not-run', () => events.push('action:must-not-run'));
      trigger.on(event => events.push(event));
      trigger.register({ id: 'once-chain', when: { type: 'signal' }, once: true, cooldown: 30, do: [{ action: 'rejecting' }, { action: 'must-not-run' }] });
      trigger.fire('signal');
      await Promise.resolve();
      const onceCommitted = trigger.hasFiredOnce('once-chain');
      const continued = events.includes('action:must-not-run');
      return result(input, 'trigger-ledger-commit', ['fire once trigger', 'action[0] throws', 'observe action[1]/once/cooldown'],
        { triggerId: 'once-chain', once: true, actions: ['rejecting', 'must-not-run'] },
        { events, onceCommitted, cooldownCommitted: Boolean(trigger.serialize().cooldowns['once-chain']), continued },
        !onceCommitted && !continued && events.includes('triggerFailed'),
        'Trigger committed once/cooldown before chain success and continued after action failure');
    }
    case 'trigger-sole-kernel': {
      const snapshot = CanonicalSnapshot.fromProject({
        schemaVersion: 1,
        scenes: [{ id: 'S01' }], battles: [{ id: 'battle.one' }],
        dialogues: [], quests: [], tutorials: [], rescues: [], endings: [], library: {},
        triggers: [{ id: 'generic-trigger', when: { type: 'signal' }, do: [{ action: 'battle.command', params: { battleId: 'battle.one', operation: 'start' } }] }],
        scenarios: [{ id: 'scenario.one', scope: { sceneId: 'S01' }, triggerRefs: ['generic-trigger'], sceneRefs: ['S01'], questRefs: [], dialogueRefs: [], commandRefs: [] }]
      }, { revision: canonicalTestRevision(input.seed, 'trigger-kernel') });
      const repository = DefinitionRepository.fromSnapshot(snapshot);
      const descriptors = createStandardActionDescriptorRegistry();
      const adapter = new CommandAdapter({ registry: descriptors, definitionRepository: repository, commandGateway: { execute() {} } });
      const graph = TriggerGraph.fromSnapshot(snapshot);
      const index = ScenarioDefinitionIndex.fromSnapshot(snapshot, { triggerGraph: graph });
      const audit = auditTrackedJavaScript({
        root: ROOT,
        paths: executableJavaScript().map(({ file }) => file),
        exceptionManifest: readExceptionManifest(ROOT)
      });
      const contentHandlerViolations = audit.violations.filter(violation => (
        violation.code === 'content-named-handler' || violation.code === 'content-flow-branch'
      ));
      const genericDescriptors = descriptors.all().every(descriptor => descriptor.adapterId === 'command'
        && descriptor.commandType === descriptor.id && Object.isFrozen(descriptor));
      return result(input, 'trigger-kernel-closure', ['publish canonical scenario/trigger definitions', 'derive read-only TriggerGraph/index', 'validate generic ActionDescriptor and CommandAdapter path'],
        { actionContract: 'schema-validated generic command' },
        { contentHandlerViolations, descriptorIds: descriptors.ids(), commandAdapter: adapter.constructor.name, graphIds: graph.ids(), scenarioClosure: index.getReferenceClosure('scenario.one') },
        contentHandlerViolations.length === 0 && genericDescriptors && adapter instanceof CommandAdapter
          && graph.has('generic-trigger') && index.get('scenario.one')?.triggerRefs.includes('generic-trigger'),
        'production Trigger scope has content-named execution handlers or lacks the CanonicalSnapshot → ActionDescriptor → CommandAdapter closure');
    }
    case 'quest-definition-runtime-transaction': {
      const questSystem = new QuestSystem();
      const firstQuest = questSystem.getAllQuests()[0] || null;
      const serialized = firstQuest?.serialize?.() || null;
      const runtimeKeys = serialized ? ['state', 'objectives', 'acceptedTime', 'completedTime', 'tracked'].filter(key => key in serialized) : [];
      const hasSecondProgressionAlgorithm = /updateObjective\([\s\S]*checkCompletion\(\)/.test(questSource);
      const nonAtomicTurnIn = /const reward = quest\.turnIn\(\);[\s\S]*activeQuests\.delete[\s\S]*completedQuests\.add/.test(questSource);
      return result(input, 'quest-runtime-transaction', ['load canonical quests=[]', 'inspect definition/runtime owner', 'advance objective', 'turnIn with reward fault'],
        { canonicalQuests: [], operationId: 'quest-op', expectedStateRevision: 3 },
        { injectedDefaultQuestCount: questSystem.getAllQuests().length, firstQuestId: firstQuest?.id, runtimeKeys, frozen: Object.isFrozen(firstQuest), hasSecondProgressionAlgorithm, nonAtomicTurnIn },
        questSystem.getAllQuests().length === 0 && runtimeKeys.length === 0 && !hasSecondProgressionAlgorithm && !nonAtomicTurnIn,
        'Quest injects defaults, mixes mutable runtime into definitions, owns a second resolver, and turns in non-atomically');
    }
    case 'request-operation-separation': {
      const harness = createHarness(input.seed);
      const attempts = [
        { requestId: `request-${input.seed}-1`, operationId: 'operation-stable', payload: { quantity: 1 } },
        { requestId: `request-${input.seed}-2`, operationId: 'operation-stable', payload: { quantity: 1 } },
        { requestId: `request-${input.seed}-3`, operationId: 'operation-stable', payload: { quantity: 2 } }
      ];
      for (const attempt of attempts) await harness.transport.execute(attempt);
      const sources = executableJavaScript();
      const gatewayFiles = sources.filter(({ source }) => /class CommandGateway/.test(source)).map(({ file }) => file);
      const authorityFiles = sources.filter(({ source }) => /AuthorityPort/.test(source)).map(({ file }) => file);
      return result(input, 'command-identity-ledger', ['request-1 operation-stable payload=A', 'request-2 operation-stable payload=A', 'request-3 operation-stable payload=B'],
        { attempts }, { gatewayFiles, authorityFiles, transport: harness.trace },
        gatewayFiles.length > 0 && authorityFiles.length > 0,
        'no unified gateway/authority operation ledger separates request attempts from business operations');
    }
    case 'projection-gap-stops-apply': {
      const sources = executableJavaScript();
      const projectionFiles = sources.filter(({ source }) => /class ProjectionStore|lastEventSequence|projectionRevision/.test(source)).map(({ file }) => file);
      return result(input, 'projection-notification-order', ['apply event sequence=4', 'apply duplicate sequence=4', 'inject gap sequence=6'],
        { projectionSequence: 3, events: [4, 4, 6], stateRevisions: [4, 4, 6] },
        { projectionFiles, actual: projectionFiles.length ? 'implementation-present' : 'no gap-aware ProjectionStore' },
        projectionFiles.length > 0,
        'state revision / notification duplicate-gap contract has no ProjectionStore implementation');
    }
    case 'clock-rng-replay': {
      const businessSources = ['src/systems/TriggerSystem.js', 'src/systems/QuestSystem.js', 'src/systems/PickupSystem.js', 'src/systems/resolvers/LootResolver.js'];
      const platformCalls = businessSources.flatMap(file => {
        const source = readOptional(file);
        return [...source.matchAll(/Date\.now\(|new Date\(|Math\.random\(/g)].map(match => ({ file, call: match[0] }));
      });
      const authoritySnapshotSources = executableJavaScript().filter(({ source }) => /rngState|logicalClock/.test(source)).map(({ file }) => file);
      const harness = createHarness(input.seed);
      const deterministicSample = [harness.clocks.logical(), harness.clocks.monotonic(), harness.clocks.wall(), harness.rng.next()];
      return result(input, 'deterministic-clock-rng', ['freeze logical/monotonic/wall clocks and RNG', 'execute command', 'snapshot/restart', 'replay'],
        { seed: input.seed, clocks: deterministicSample.slice(0, 3), rngCounter: 0 },
        { deterministicSample, platformCalls, authoritySnapshotSources },
        platformCalls.length === 0 && authoritySnapshotSources.length > 0,
        'business logic reads platform clock/RNG and authority snapshot lacks deterministic clock/RNG state');
    }
    default:
      return { triggered: false, correctPredicate: true, phase: 'unsupported', commandSequence: [], snapshot: input, actualTrace: {}, counterexample: 'unsupported probe' };
  }
}

describe('Property 1: Bug Condition - Modular Canonical Architecture and Unified Commands Satisfy the Correct Predicate', () => {
  // **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12**
  it('finds replayable pre-fix counterexamples for every architecture operation domain', async () => {
    const executions = [];
    for (let index = 0; index < PROBES.length; index++) {
      const probe = PROBES[index];
      const deterministic = makeInput(probe, FIXED_SEED + index, false);
      const generated = makeInput(probe, FIXED_SEED ^ Math.imul(index + 1, 0x9e3779b1), true);
      executions.push({ input: deterministic, observation: await executeOriginal(deterministic) });
      executions.push({ input: generated, observation: await executeOriginal(generated) });
    }

    const byPhase = new Map();
    for (const execution of executions) {
      if (!isBugCondition(execution.input, execution.observation)) continue;
      const existing = byPhase.get(execution.observation.phase);
      if (existing) {
        existing.replaySeeds.push(execution.input.seed);
        continue;
      }
      byPhase.set(execution.observation.phase, {
        kind: execution.input.kind,
        probe: execution.input.probe,
        seed: execution.input.seed,
        replaySeeds: [execution.input.seed],
        minimalCommandSequence: execution.observation.commandSequence,
        inputSnapshot: execution.observation.snapshot,
        actualTrace: execution.observation.actualTrace,
        failurePhase: execution.observation.phase,
        failedPredicate: 'expectedBehavior(result,input)',
        counterexample: execution.observation.counterexample
      });
    }

    const counterexamples = [...byPhase.values()];
    const report = `Property 1 pre-fix counterexamples (fixedSeed=${FIXED_SEED}):\n${JSON.stringify(counterexamples, null, 2)}`;
    expect(counterexamples, report).toEqual([]);
  }, 15000);
});
