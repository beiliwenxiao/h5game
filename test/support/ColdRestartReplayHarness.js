import { cloneValue, InMemoryCacheAdapter, InMemoryDiskAdapter, SpyTrace } from './ModelTesting.js';

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function requiredFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`ColdRestartReplayHarness requires ${name}`);
  return value;
}

function defaultProjection(runtime) {
  return runtime?.projectionStore?.snapshot?.() || runtime?.projectionStore?.serialize?.() || null;
}

function defaultCanonical(runtime) {
  return runtime?.canonicalSnapshot?.project || runtime?.project || null;
}

/**
 * 从 canonical 磁盘创建、销毁并重建 runtime 的确定性回放工具。
 * 它只比较 service-owned state 和提交后通知；UI/ECS/localStorage 不能作为事实源。
 */
export class ColdRestartReplayHarness {
  constructor({ disk, cache, createRuntime, destroyRuntime, destroyEditor = null, execute, inspectServiceState,
    inspectStableIds, inspectDefinitionRevision, inspectCommittedEvents, inspectApplicationEvents,
    inspectEndingResult, inspectProjection = defaultProjection, inspectCanonical = defaultCanonical,
    clearMemory = null, clearLocalStorage = null, assertRuntimeDestroyed = null, assertEditorDestroyed = null,
    trace = null } = {}) {
    if (!disk?.snapshot || !disk?.restore) throw new TypeError('ColdRestartReplayHarness requires disk snapshot/restore adapter');
    this.disk = disk;
    this.cache = cache || new InMemoryCacheAdapter();
    this.createRuntime = requiredFunction(createRuntime, 'createRuntime');
    this.destroyRuntime = requiredFunction(destroyRuntime, 'destroyRuntime');
    this.destroyEditor = destroyEditor || (() => {});
    this.execute = requiredFunction(execute, 'execute');
    this.inspectServiceState = requiredFunction(inspectServiceState, 'inspectServiceState');
    this.inspectStableIds = requiredFunction(inspectStableIds, 'inspectStableIds');
    this.inspectDefinitionRevision = requiredFunction(inspectDefinitionRevision, 'inspectDefinitionRevision');
    this.inspectCommittedEvents = requiredFunction(inspectCommittedEvents, 'inspectCommittedEvents');
    this.inspectApplicationEvents = requiredFunction(inspectApplicationEvents, 'inspectApplicationEvents');
    this.inspectEndingResult = requiredFunction(inspectEndingResult, 'inspectEndingResult');
    this.inspectProjection = requiredFunction(inspectProjection, 'inspectProjection');
    this.inspectCanonical = requiredFunction(inspectCanonical, 'inspectCanonical');
    this.clearMemory = clearMemory || (() => {});
    this.clearLocalStorage = clearLocalStorage || (() => {});
    this.assertRuntimeDestroyed = assertRuntimeDestroyed || (() => {});
    this.assertEditorDestroyed = assertEditorDestroyed || (() => {});
    this.trace = trace || new SpyTrace();
  }

  _snapshot(runtime) {
    return cloneValue({
      canonical: this.inspectCanonical(runtime),
      serviceState: this.inspectServiceState(runtime),
      stableIds: this.inspectStableIds(runtime),
      definitionRevision: this.inspectDefinitionRevision(runtime),
      committedEvents: this.inspectCommittedEvents(runtime),
      applicationEvents: this.inspectApplicationEvents(runtime),
      endingResult: this.inspectEndingResult(runtime),
      projection: this.inspectProjection(runtime)
    });
  }

  async _run({ canonical, snapshot, seed, clocks, commands, label }) {
    const runtime = await this.createRuntime({
      disk: this.disk, cache: this.cache, canonical: cloneValue(canonical),
      snapshot: cloneValue(snapshot), seed, clocks, trace: this.trace, label
    });
    try {
      for (const [index, command] of commands.entries()) {
        this.trace.phase('replay.command', 'execute', { label, index, command });
        await this.execute(runtime, cloneValue(command), { seed, clocks, index, label });
      }
      return this._snapshot(runtime);
    } finally {
      await this.destroyRuntime(runtime, { label, trace: this.trace });
      await this.assertRuntimeDestroyed(runtime, { label, trace: this.trace });
    }
  }

  async replay({ canonical = null, snapshot = null, seed, clocks, commands = [] } = {}) {
    if (!Array.isArray(commands)) throw new TypeError('ColdRestartReplayHarness commands must be an array');
    const diskBefore = this.disk.snapshot();
    const cacheBefore = this.cache.snapshot?.() || {};
    const cacheMetadataBefore = this.cache.metadataSnapshot?.() || {};
    const first = await this._run({ canonical, snapshot, seed, clocks, commands, label: 'first' });

    // 正式 runtime/editor、内存和 localStorage cache 在冷重启前必须全部丢弃；第二次只能从 committed canonical 磁盘读取。
    this.trace.phase('replay.restart', 'destroyed', { diskKeys: Object.keys(diskBefore) });
    await this.destroyEditor({ trace: this.trace });
    await this.assertEditorDestroyed({ trace: this.trace });
    await this.clearMemory({ trace: this.trace });
    await this.clearLocalStorage({ trace: this.trace });
    this.cache.restore?.({}, {});
    this.disk.restore(diskBefore);
    const replay = await this._run({ canonical: null, snapshot, seed, clocks, commands, label: 'replay' });

    const comparison = { first, replay, equal: equal(first, replay) };
    if (!comparison.equal) {
      const error = new Error(`cold restart replay diverged\n${JSON.stringify(comparison, null, 2)}`);
      error.code = 'coldRestartReplayMismatch';
      error.comparison = comparison;
      throw error;
    }
    // Harness 不将 cache 作为事实源；仅恢复调用方传入的测试夹具，以免影响后续用例。
    this.cache.restore?.(cacheBefore, cacheMetadataBefore);
    return comparison;
  }
}

export function createColdRestartReplayHarness(config = {}) {
  return new ColdRestartReplayHarness({
    disk: config.disk || new InMemoryDiskAdapter(config.canonicalDisk || {}),
    cache: config.cache || new InMemoryCacheAdapter(),
    ...config
  });
}

export default ColdRestartReplayHarness;
