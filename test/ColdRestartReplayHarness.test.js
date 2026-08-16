import { describe, expect, it } from 'vitest';
import { createColdRestartReplayHarness } from './support/ColdRestartReplayHarness.js';
import { InMemoryCacheAdapter, InMemoryDiskAdapter, createFakeClocks } from './support/ModelTesting.js';

const clone = value => structuredClone(value);

function createRuntime({ disk, seed, clocks }) {
  const canonical = disk.read('canonical');
  const runtime = {
    definitionRevision: canonical.definitionRevision,
    serviceState: { story: clone(canonical.story), ending: null, sequence: 0 },
    stableIds: clone(canonical.stableIds),
    committedEvents: [],
    applicationEvents: [],
    // Deliberately ephemeral projections: neither is accepted as business fact.
    ecs: { entities: [{ id: `ecs-${Math.random()}` }] },
    ui: { notificationLog: [`seed:${seed}`] },
    clocks
  };
  runtime.projectionStore = { snapshot: () => ({ story: clone(runtime.serviceState.story) }) };
  return runtime;
}

async function execute(runtime, command) {
  if (command.type === 'story.tag') runtime.serviceState.story.tags.push(command.tag);
  if (command.type === 'ending.resolve') runtime.serviceState.ending = command.ending;
  runtime.serviceState.sequence += 1;
  const event = { eventId: `event-${runtime.serviceState.sequence}`, type: command.type, payload: clone(command) };
  runtime.committedEvents.push(event);
  runtime.applicationEvents.push({ ...event, type: `${event.type}.application` });
}

describe('ColdRestartReplayHarness', () => {
  it('从磁盘 canonical 重建并比较 service state、稳定 ID、revision、事件、结局与投影', async () => {
    const disk = new InMemoryDiskAdapter({
      canonical: {
        definitionRevision: 'canonical-r7', stableIds: ['S01', 'S02', 'S09', 'S14'],
        story: { currentSceneId: 'S01', tags: [] }
      }
    });
    const cache = new InMemoryCacheAdapter({ stale: { sceneId: 'obsolete' } });
    let destroyed = 0;
    let cleared = 0;
    const harness = createColdRestartReplayHarness({
      disk, cache, createRuntime,
      destroyRuntime: async runtime => { runtime.destroyed = true; destroyed += 1; },
      execute,
      clearMemory: () => { cleared += 1; },
      inspectServiceState: runtime => runtime.serviceState,
      inspectStableIds: runtime => runtime.stableIds,
      inspectDefinitionRevision: runtime => runtime.definitionRevision,
      inspectCommittedEvents: runtime => runtime.committedEvents,
      inspectApplicationEvents: runtime => runtime.applicationEvents,
      inspectEndingResult: runtime => runtime.serviceState.ending
    });

    const comparison = await harness.replay({
      snapshot: { saveId: 'fixture' }, seed: 913, clocks: createFakeClocks({ logical: 10 }),
      commands: [{ type: 'story.tag', tag: 's09.refugees.hardline' }, { type: 'ending.resolve', ending: 'scorchedEarth' }]
    });

    expect(comparison.equal).toBe(true);
    expect(comparison.first).toMatchObject({
      definitionRevision: 'canonical-r7', stableIds: ['S01', 'S02', 'S09', 'S14'],
      endingResult: 'scorchedEarth', serviceState: { story: { tags: ['s09.refugees.hardline'] } }
    });
    expect(destroyed).toBe(2);
    expect(cleared).toBe(1);
    expect(cache.isEligible('stale')).toBe(true);
  });
});
