import { describe, expect, it } from 'vitest';
import { createContentExtensionGate } from '../src/dev/ContentExtensionGate.js';
import { createColdRestartReplayHarness } from './support/ColdRestartReplayHarness.js';
import { InMemoryCacheAdapter, InMemoryDiskAdapter, SeedGenerator, createFakeClocks } from './support/ModelTesting.js';

const clone = value => structuredClone(value);
const contentRoot = 'example/sanguo_zhangjiao/';
const EXPRESSIBLE_CAPABILITIES = Object.freeze([
  ['stackable', 'placeable'], ['stackable', 'durable', 'placeable'], ['stackable', 'tool', 'placeable']
]);
const ACTION_DESCRIPTOR_ID = 'spawnPlacements';

function capture(gate, files) {
  return gate.captureJavaScriptSnapshot({
    paths: Object.keys(files),
    readFile: file => files[file]
  });
}

function createCanonicalRuntime({ disk }) {
  const canonical = disk.read('canonical');
  const extension = canonical.extension || {};
  const items = extension.items || (extension.item ? [extension.item] : []);
  const drops = extension.drops || [];
  const placements = canonical.placements || extension.placements || [];
  const runtime = {
    canonicalSnapshot: { project: clone(canonical) },
    definitionRevision: canonical.definitionRevision,
    stableIds: clone(canonical.stableIds),
    serviceState: {
      definitionIds: items.map(item => item.definitionId),
      instanceIds: drops.map(drop => drop.instanceId),
      placementIds: placements.map(placement => placement.id),
      placements: clone(placements),
      uses: 0
    },
    committedEvents: [], applicationEvents: [], disposed: false
  };
  runtime.projectionStore = { snapshot: () => clone(runtime.serviceState) };
  return runtime;
}

async function execute(runtime, command) {
  runtime.serviceState.uses += 1;
  const event = { eventSequence: runtime.serviceState.uses, type: command.type, payload: clone(command) };
  runtime.committedEvents.push(event);
  runtime.applicationEvents.push({ ...event, eventSequence: event.eventSequence + 1 });
}

function createCapabilityExpressibleExtension(seed) {
  const random = new SeedGenerator(seed);
  const suffix = random.string(8);
  const definitionId = `resource.content-gate-${suffix}`;
  const item = {
    id: definitionId,
    definitionId,
    capabilities: random.pick(EXPRESSIBLE_CAPABILITIES),
    quantity: random.int(1, 9),
    imageId: `s01.resource.content-gate-${suffix}`
  };
  const count = random.int(1, 4);
  const drops = Array.from({ length: count }, (_, index) => ({
    id: `drop.content-gate-${suffix}-${index}`,
    definitionId,
    instanceId: `instance.content-gate-${suffix}-${index}`,
    quantity: random.int(1, item.quantity)
  }));
  const placements = drops.map((drop, index) => ({
    id: `placement.content-gate-${suffix}-${index}`,
    definitionId,
    instanceId: drop.instanceId,
    dropId: drop.id,
    x: random.int(0, 12) * 128,
    y: random.int(0, 7) * 72
  }));
  const scenarioId = `scenario.content-gate-${suffix}`;
  const triggerId = `trigger.content-gate-${suffix}`;
  const scenario = { id: scenarioId, triggerId, actionDescriptorId: ACTION_DESCRIPTOR_ID };
  const trigger = { id: triggerId, actionDescriptorId: ACTION_DESCRIPTOR_ID, placementIds: placements.map(placement => placement.id) };
  const stableIds = [definitionId, ...drops.map(drop => drop.instanceId), ...placements.map(placement => placement.id)];
  const resource = `${contentRoot}assets/images/s01/content-gate-${suffix}.svg`;
  return {
    canonical: {
      definitionRevision: `content-extension-r${random.int(1, 9999)}`,
      stableIds,
      placements,
      extension: { items: [item], drops, placements, scenario, trigger }
    },
    changedPaths: [
      `${contentRoot}game.project.json`, `${contentRoot}assets/scenes/S01.json`,
      `${contentRoot}assets/manifests/assets.json`, resource
    ],
    registeredResourcePaths: [resource],
    commands: placements.map(placement => ({ type: 'placement.activate', placementId: placement.id })),
    identities: {
      definitionIds: [definitionId],
      instanceIds: drops.map(drop => drop.instanceId),
      placementIds: placements.map(placement => placement.id),
      stableIds
    }
  };
}

function createRestartHarness(canonical) {
  const disk = new InMemoryDiskAdapter({ canonical });
  const cache = new InMemoryCacheAdapter({ stale: { sceneId: 'S00' } });
  const localStorage = { canonicalCache: 'stale' };
  const editor = { disposed: false };
  const liveRuntimes = new Set();
  const harness = createColdRestartReplayHarness({
    disk, cache,
    createRuntime: async options => { const runtime = createCanonicalRuntime(options); liveRuntimes.add(runtime); return runtime; },
    destroyRuntime: async runtime => { runtime.disposed = true; liveRuntimes.delete(runtime); },
    assertRuntimeDestroyed: runtime => expect(runtime.disposed).toBe(true),
    destroyEditor: () => { editor.disposed = true; },
    assertEditorDestroyed: () => expect(editor.disposed).toBe(true),
    clearMemory: () => liveRuntimes.clear(),
    clearLocalStorage: () => { delete localStorage.canonicalCache; },
    execute,
    inspectServiceState: runtime => runtime.serviceState,
    inspectStableIds: runtime => runtime.stableIds,
    inspectDefinitionRevision: runtime => runtime.definitionRevision,
    inspectCommittedEvents: runtime => runtime.committedEvents,
    inspectApplicationEvents: runtime => runtime.applicationEvents,
    inspectEndingResult: () => null
  });
  return { harness, localStorage };
}

const canonicalExtension = Object.freeze({
  item: {
    id: 'resource.content-gate-wood', definitionId: 'resource.content-gate-wood',
    capabilities: ['stackable', 'placeable'], quantity: 1, imageId: 's01.resource.dryWoodNode'
  },
  placement: { id: 'placement.content-gate-wood', definitionId: 'resource.content-gate-wood', x: 128, y: 256 },
  scenario: { id: 'scenario.content-gate', triggerId: 'trigger.content-gate', actionDescriptorId: ACTION_DESCRIPTOR_ID },
  trigger: { id: 'trigger.content-gate', actionDescriptorId: ACTION_DESCRIPTOR_ID, placementId: 'placement.content-gate-wood' }
});

describe('ContentExtensionGate', () => {
  it('允许既有 capability/ActionDescriptor 可表达的 canonical JSON 与已登记资源扩展，且完整冷重启保持等价', async () => {
    const gate = createContentExtensionGate({ root: process.cwd(), contentRoot });
    const executable = { 'src/systems/DefinitionDispatch.js': 'export const lookup = (repository, id) => repository.get("items", id);\n' };
    const baseline = capture(gate, executable);
    const after = capture(gate, executable);
    const resource = `${contentRoot}assets/images/s01/content-gate-wood.svg`;
    const inspection = gate.inspect({
      baseline, after,
      changedPaths: [
        `${contentRoot}game.project.json`, `${contentRoot}assets/scenes/S01.json`,
        `${contentRoot}assets/manifests/assets.json`, resource
      ],
      registeredResourcePaths: [resource]
    });
    expect(inspection).toMatchObject({ ok: true, javascript: { changeCount: 0 } });

    const { harness, localStorage } = createRestartHarness({
      definitionRevision: 'content-extension-r1', stableIds: [canonicalExtension.item.id, canonicalExtension.placement.id],
      placements: [canonicalExtension.placement], extension: canonicalExtension
    });
    const restart = await gate.verifyRestart(harness, {
      seed: 33, clocks: createFakeClocks({ logical: 5 }), commands: [{ type: 'placement.activate', placementId: canonicalExtension.placement.id }]
    });
    expect(restart.ok).toBe(true);
    expect(restart.replay.first.canonical).toEqual(restart.replay.replay.canonical);
    expect(restart.replay.first.committedEvents).toEqual(restart.replay.replay.committedEvents);
    expect(localStorage.canonicalCache).toBeUndefined();
  });

  /**
   * Property 12: Capability-Expressible Content Has Zero Executable JavaScript Diff.
   * Validates: Requirements 2.12, 3.9, 3.10
   */
  it('对种子化的 capability 可表达内容扩展保持零 JS hash diff 与完全重启确定性', async () => {
    const gate = createContentExtensionGate({ root: process.cwd(), contentRoot });
    const executable = { 'src/systems/DefinitionDispatch.js': 'export const lookup = (repository, id) => repository.get("items", id);\n' };
    for (const seed of [0x12, 0x34, 0x56, 0x78, 0x9abc, 0xdef0, 0x5eedc0de, 0xc0ffee]) {
      const extension = createCapabilityExpressibleExtension(seed);
      const baseline = capture(gate, executable);
      const after = capture(gate, executable);
      const inspection = gate.inspect({ baseline, after, ...extension });
      expect(after.hashes, `seed=${seed}`).toEqual(baseline.hashes);
      expect(inspection, `seed=${seed}`).toMatchObject({ ok: true, javascript: { changeCount: 0, equal: true } });

      const { harness, localStorage } = createRestartHarness(extension.canonical);
      const restart = await gate.verifyRestart(harness, {
        seed,
        clocks: createFakeClocks({ logical: 5 }),
        commands: extension.commands
      });
      const { first, replay } = restart.replay;
      expect(restart.ok, `seed=${seed}`).toBe(true);
      expect(first.stableIds, `seed=${seed}`).toEqual(extension.identities.stableIds);
      expect(first.serviceState.definitionIds, `seed=${seed}`).toEqual(extension.identities.definitionIds);
      expect(first.serviceState.instanceIds, `seed=${seed}`).toEqual(extension.identities.instanceIds);
      expect(first.serviceState.placementIds, `seed=${seed}`).toEqual(extension.identities.placementIds);
      expect(replay.stableIds, `seed=${seed}`).toEqual(first.stableIds);
      expect(replay.serviceState, `seed=${seed}`).toEqual(first.serviceState);
      expect(replay.committedEvents, `seed=${seed}`).toEqual(first.committedEvents);
      expect(replay.applicationEvents, `seed=${seed}`).toEqual(first.applicationEvents);
      expect(first.committedEvents.map(event => event.eventSequence), `seed=${seed}`).toEqual(extension.commands.map((_, index) => index + 1));
      expect(localStorage.canonicalCache, `seed=${seed}`).toBeUndefined();
    }
  });

  it.each([
    ['scene/content/field branch', 'if (sceneId === "S11") return contentId;'],
    ['SXX handler', 'function S11RescueHandler() {}'],
    ['content subclass', 'class HealingPotion extends Item {}'],
    ['scene timer', 'setTimeout(() => {}, 10);'],
    ['scene callback', 'const sceneCallback = () => {};'],
    ['item ID strategy', 'if (itemId === "potion.red") return 10;']
  ])('拒绝 %s', (_name, source) => {
    const gate = createContentExtensionGate({ root: process.cwd(), contentRoot });
    const baseline = capture(gate, { 'src/systems/GenericDispatch.js': 'export const resolve = id => id;\n' });
    const after = capture(gate, { 'src/systems/GenericDispatch.js': `${source}\n` });
    const result = gate.inspect({
      baseline, after,
      changedPaths: ['src/systems/GenericDispatch.js'],
      executableSources: [{ file: 'src/systems/GenericDispatch.js', source }]
    });
    expect(result.ok).toBe(false);
    expect(result.javascript.changeCount).toBe(1);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'executable-javascript-changed' })
    ]));
    expect(result.violations.some(violation => violation.code !== 'executable-javascript-changed')).toBe(true);
  });

  it('拒绝未登记资源与 non-canonical 内容路径', () => {
    const gate = createContentExtensionGate({ root: process.cwd(), contentRoot });
    const snapshot = capture(gate, { 'src/systems/DefinitionDispatch.js': 'export const id = 1;\n' });
    const result = gate.inspect({
      baseline: snapshot, after: snapshot,
      changedPaths: [`${contentRoot}assets/images/s01/unregistered.svg`, 'example/other-game/config.json']
    });
    expect(result).toMatchObject({ ok: false, javascript: { changeCount: 0 } });
    expect(result.violations.map(violation => violation.code)).toEqual(['noncanonical-content-change', 'noncanonical-content-change']);
  });
});
