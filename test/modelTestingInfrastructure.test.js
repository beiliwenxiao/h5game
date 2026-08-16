import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_OPERATION_KINDS,
  AuthorityRng,
  InMemoryCacheAdapter,
  InMemoryDiskAdapter,
  InMemoryTransactionAdapter,
  InjectedPhaseFault,
  LoopbackFakeTransport,
  ModelCommandRunner,
  ModelRunFailure,
  PhaseFaultInjector,
  SeedGenerator,
  SpyTrace,
  createFakeClocks,
  generateArchitectureOperations
} from './support/ModelTesting.js';

describe('replayable model testing infrastructure', () => {
  it('replays deterministic generators across every ArchitectureOperation domain', () => {
    const seed = 0x5eedc0de;
    const first = generateArchitectureOperations(seed, { perKind: 2 });
    const second = generateArchitectureOperations(seed, { perKind: 2 });
    const different = generateArchitectureOperations(seed + 1, { perKind: 2 });

    expect(second).toEqual(first);
    expect(different).not.toEqual(first);
    expect(new Set(first.map(operation => operation.kind)))
      .toEqual(new Set(ARCHITECTURE_OPERATION_KINDS));
    expect(first).toHaveLength(ARCHITECTURE_OPERATION_KINDS.length * 2);

    const generator = new SeedGenerator('replay-seed');
    const values = [generator.next(), generator.int(-4, 4), generator.bool(), generator.string(5)];
    const replay = new SeedGenerator('replay-seed');
    expect([replay.next(), replay.int(-4, 4), replay.bool(), replay.string(5)]).toEqual(values);
  });

  it('restores authority RNG streams and advances fake clocks independently', () => {
    const rng = new AuthorityRng({ seed: 42, stream: 'loot', substream: 'drop' });
    rng.next();
    const snapshot = rng.snapshot();
    const afterSnapshot = [rng.next(), rng.int(1, 12), rng.next()];
    rng.restore(snapshot);
    expect([rng.next(), rng.int(1, 12), rng.next()]).toEqual(afterSnapshot);
    expect(rng.fork('other').snapshot()).not.toEqual(rng.snapshot());

    const clocks = createFakeClocks({ logical: 7, monotonic: 100, wall: 1700000000000 });
    expect(clocks.logical.tick()).toBe(8);
    expect(clocks.monotonic.advance(25)).toBe(125);
    expect(clocks.wall.advance(500)).toBe(1700000000500);
    expect(clocks.snapshot()).toEqual({ logical: 8, monotonic: 125, wall: 1700000000500 });
    expect(() => clocks.monotonic.advance(-1)).toThrow(RangeError);
  });

  it('records ordered spy phases and injects a selected phase occurrence', () => {
    const trace = new SpyTrace();
    const faults = new PhaseFaultInjector([{ phase: 'disk.commit', at: 2 }], trace);
    faults.check('disk.commit');
    expect(() => faults.check('disk.commit')).toThrow(InjectedPhaseFault);
    expect(trace.snapshot().map(entry => entry.details)).toEqual([
      { phase: 'disk.commit', action: 'fault-check', occurrence: 1 },
      { phase: 'disk.commit', action: 'fault-check', occurrence: 2 }
    ]);
  });

  it('keeps disk transactions atomic and tracks cache fallback eligibility', async () => {
    const disk = new InMemoryDiskAdapter({ scene: { revision: 1 } });
    const failing = new InMemoryTransactionAdapter(disk, {
      faults: PhaseFaultInjector.at('transaction.commit')
    });
    const failed = await failing.transact(transaction => {
      transaction.write('scene', { revision: 2 });
      transaction.write('new-scene', { revision: 1 });
    }, 'failing-commit');

    expect(failed.ok).toBe(false);
    expect(failed.error).toBeInstanceOf(InjectedPhaseFault);
    expect(disk.snapshot()).toEqual({ scene: { revision: 1 } });

    const committed = await new InMemoryTransactionAdapter(disk).transact(transaction => {
      transaction.rename('scene', 'renamed-scene');
      transaction.write('index', ['renamed-scene']);
      return 'committed';
    }, 'successful-commit');
    expect(committed).toMatchObject({ ok: true, value: 'committed' });
    expect(disk.snapshot()).toEqual({
      'renamed-scene': { revision: 1 },
      index: ['renamed-scene']
    });

    const cache = new InMemoryCacheAdapter();
    cache.write('renamed-scene', { revision: 1 }, { provenance: 'disk:r1' });
    expect(cache.isEligible('renamed-scene')).toBe(true);
    cache.invalidateFallback('renamed-scene', 'post-commit-sync-failed');
    expect(cache.isEligible('renamed-scene')).toBe(false);
    expect(cache.metadataSnapshot()['renamed-scene']).toMatchObject({
      eligible: false,
      reason: 'post-commit-sync-failed',
      provenance: 'disk:r1'
    });
  });


  it('crosses a serialized loopback transport boundary without sharing references', async () => {
    const trace = new SpyTrace();
    const transport = new LoopbackFakeTransport(request => {
      request.payload.quantity++;
      return { requestId: request.requestId, result: request.payload };
    }, { trace });
    const message = { requestId: 'request-1', payload: { quantity: 2 } };

    await expect(transport.execute(message)).resolves.toEqual({
      requestId: 'request-1',
      result: { quantity: 3 }
    });
    expect(message.payload.quantity).toBe(2);
    expect(trace.snapshot().map(entry => entry.details.phase))
      .toEqual(['transport.request', 'transport.response']);
  });

  it('runs model commands against a trace oracle for successful replays', async () => {
    const runner = new ModelCommandRunner({
      createModel: () => ({ total: 0 }),
      createSystem: () => ({ total: 0 }),
      applyModel: ({ model, command }) => (model.total += command.amount),
      executeSystem: ({ system, command }) => (system.total += command.amount),
      oracle: ({ model, system, expected, actual }) => {
        expect(actual).toBe(expected);
        expect(system.total).toBe(model.total);
      }
    });
    const commands = [{ type: 'add', amount: 2 }, { type: 'add', amount: 5 }];
    const first = await runner.run(commands, { seed: 0x10203040 });
    const replay = await runner.run(commands, { seed: 0x10203040 });

    expect(first.model).toEqual({ total: 7 });
    expect(first.system).toEqual({ total: 7 });
    expect(replay.trace).toEqual(first.trace);
    expect(first.trace.filter(entry => entry.details.action === 'complete')).toHaveLength(2);
  });

  it('reports the seed and shrinks commands before fields, collections, and numbers', async () => {
    const runner = new ModelCommandRunner({
      protectedFields: ['type', 'amount', 'values'],
      createModel: () => ({ total: 0 }),
      createSystem: () => ({ total: 0 }),
      applyModel: ({ model, command }) => {
        if (command.type === 'add') model.total += command.amount ?? 0;
        return model.total;
      },
      executeSystem: ({ system, command }) => {
        if (command.type === 'add') {
          const amount = command.amount ?? 0;
          system.total += amount + (amount >= 2 ? 1 : 0);
        }
        return system.total;
      },
      oracle: ({ expected, actual }) => {
        if (actual === expected) return;
        const error = new Error(`state mismatch: expected ${expected}, received ${actual}`);
        error.code = 'stateMismatch';
        throw error;
      }
    });
    const seed = 0x12345678;
    const commands = [
      { type: 'noop', payload: { unused: true }, values: [7] },
      { type: 'add', amount: 9, payload: { unused: 'remove-me' }, values: [9, 4, 2] }
    ];

    let failure;
    try {
      await runner.run(commands, { seed });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ModelRunFailure);
    expect(failure.message).toContain(`seed=${seed}`);
    expect(failure.minimalCommands).toEqual([{ type: 'add', amount: 2, values: [] }]);
    const stages = failure.shrinkSteps.map(step => step.stage);
    expect(stages).toContain('commands');
    expect(stages).toContain('fields');
    expect(stages).toContain('collections');
    expect(stages).toContain('numbers');
    expect(stages).toEqual([...stages].sort((left, right) =>
      ['commands', 'fields', 'collections', 'numbers'].indexOf(left)
      - ['commands', 'fields', 'collections', 'numbers'].indexOf(right)));
    expect(failure.actualTrace.at(-1)).toMatchObject({
      type: 'phase',
      details: { phase: 'model-oracle', action: 'failure', code: 'stateMismatch' }
    });
  });
});