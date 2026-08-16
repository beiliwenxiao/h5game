import { describe, expect, it } from 'vitest';
import { ContentErrorCategory } from '../validation/ContentOperationResult.js';
import { MemorySceneCacheAdapter } from './CanonicalSceneAdapters.js';
import { CanonicalSceneRepository } from './CanonicalSceneRepository.js';
import { WorldMapLoadSession } from './WorldMapLoadSession.js';

const json = value => JSON.stringify(value);
const scene = (id, marker = id) => ({ id, layers: [{ id: 'objects', objects: [] }], marker });
const project = ids => ({
  schemaVersion: 1,
  meta: { id: 'game', version: 3, schema: 3 },
  scenes: ids.map(id => ({ id }))
});
const order = ids => ({
  gameId: 'game', order: ids.slice(),
  scenes: Object.fromEntries(ids.map(id => [id, { name: id }]))
});

class MemoryDisk {
  constructor(ids = ['S01']) {
    this.project = project(ids);
    this.order = order(ids);
    this.scenes = Object.fromEntries(ids.map(id => [id, scene(id)]));
    this.failures = {};
    this.revisions = Object.fromEntries(ids.map(id => [id, 1]));
    this.sceneReads = new Map();
  }

  readProject() { return this._read('project', this.project, 'disk://game.project.json', 1); }
  readSceneOrder() { return this._read('order', this.order, 'disk://_scene_order.json', 1); }
  readScene(sceneId) {
    this.sceneReads.set(sceneId, (this.sceneReads.get(sceneId) || 0) + 1);
    return this._read(sceneId, this.scenes[sceneId], `disk://${sceneId}.json`, this.revisions[sceneId]);
  }

  _read(key, value, source, revision) {
    const failure = this.failures[key];
    if (failure?.raw !== undefined) return { ok: true, content: failure.raw, source, revision };
    if (failure) return { ok: false, category: failure.category, source, error: new Error(failure.category) };
    if (value === undefined) return { ok: false, category: ContentErrorCategory.MISSING, source };
    return { ok: true, content: json(value), source, revision: `r${revision}` };
  }
}

function createRepository(disk, cache = new MemorySceneCacheAdapter(), mode = 'runtime') {
  let time = 100;
  return {
    cache,
    repository: new CanonicalSceneRepository({ diskAdapter: disk, cacheAdapter: cache, mode, now: () => ++time })
  };
}

describe('CanonicalSceneRepository disk canonical refresh', () => {
  it('磁盘同 ID 内容独占优先，原子发布 immutable snapshot 并写入完整 provenance', async () => {
    const disk = new MemoryDisk(['S01']);
    const cache = new MemorySceneCacheAdapter({
      S01: { sceneId: 'S01', source: 'disk://S01.json', canonicalData: scene('S01', 'stale'), eligible: true }
    });
    const { repository } = createRepository(disk, cache);

    const result = await repository.refresh();

    expect(result.ok).toBe(true);
    expect(result.snapshot.getScene('S01').marker).toBe('S01');
    expect(result.snapshot.getProvenance('S01')).toMatchObject({
      source: 'disk://S01.json', fallback: false, reason: null, diskRevision: 'r1'
    });
    expect(cache.get('S01')).toMatchObject({
      sceneId: 'S01', source: 'disk://S01.json', diskRevision: 'r1', schemaVersion: 1,
      validatorFingerprint: expect.any(String), refreshedAt: 101, eligible: true
    });
    expect(() => { result.snapshot.getScene('S01').marker = 'mutated'; }).toThrow();
  });

  it('可读磁盘列表独占决定 closure，delete/rename 删除旧缓存且不与 cache 求并集', async () => {
    const disk = new MemoryDisk(['S01', 'S02']);
    const cache = new MemorySceneCacheAdapter({ CACHE_ONLY: { sceneId: 'CACHE_ONLY', eligible: true } });
    const { repository } = createRepository(disk, cache);
    expect((await repository.refresh()).snapshot.ids).toEqual(['S01', 'S02']);

    disk.project = project(['S02', 'S03']);
    disk.order = order(['S02', 'S03']);
    delete disk.scenes.S01;
    disk.scenes.S02 = scene('S02', 'updated');
    disk.scenes.S03 = scene('S03', 'renamed-new-id');
    disk.revisions.S02 = 2;
    disk.revisions.S03 = 1;
    const result = await repository.refresh();

    expect(result.snapshot.ids).toEqual(['S02', 'S03']);
    expect(result.snapshot.has('S01')).toBe(false);
    expect(result.snapshot.getScene('S02').marker).toBe('updated');
    expect(result.snapshot.getScene('S03').marker).toBe('renamed-new-id');
    expect(cache.keys().sort()).toEqual(['S02', 'S03']);
  });

  it('只对 unreadable/parseFailed 使用最近成功的同 ID 当前有效缓存并显式标记', async () => {
    const disk = new MemoryDisk(['S01']);
    const { repository } = createRepository(disk);
    const first = await repository.refresh();
    expect(first.ok).toBe(true);

    disk.failures.S01 = { category: ContentErrorCategory.UNREADABLE };
    const unreadable = await repository.refresh();
    expect(unreadable.ok).toBe(true);
    expect(unreadable.snapshot.getProvenance('S01')).toMatchObject({
      source: 'cache', canonicalSource: 'disk://S01.json', fallback: true,
      reason: ContentErrorCategory.UNREADABLE, diskRevision: 'r1'
    });
    expect(unreadable.warnings[0]).toMatchObject({ fallback: true, category: ContentErrorCategory.UNREADABLE });

    disk.failures.S01 = { raw: '{ invalid json' };
    const parseFailed = await repository.refresh();
    expect(parseFailed.ok).toBe(true);
    expect(parseFailed.snapshot.getProvenance('S01').reason).toBe(ContentErrorCategory.PARSE_FAILED);
  });

  it.each([
    ['missing', { category: ContentErrorCategory.MISSING }],
    ['schema', { raw: json({ id: 'S01' }) }],
    ['reference', { raw: json(scene('S99')) }]
  ])('%s failure 禁止 fallback 且保留旧 snapshot', async (_name, failure) => {
    const disk = new MemoryDisk(['S01']);
    const { repository } = createRepository(disk);
    const first = await repository.refresh();
    disk.failures.S01 = failure;

    const failed = await repository.refresh();

    expect(failed.ok).toBe(false);
    expect(failed.snapshot).toBe(first.snapshot);
    expect(repository.snapshot).toBe(first.snapshot);
  });

  it('拒绝错误来源/validator fingerprint 的缓存，audit/publish 固定不读缓存', async () => {
    const disk = new MemoryDisk(['S01']);
    const { repository, cache } = createRepository(disk);
    await repository.refresh();
    disk.failures.S01 = { category: ContentErrorCategory.UNREADABLE };

    cache.entries.S01.source = 'disk://S02.json';
    expect((await repository.refresh()).ok).toBe(false);
    cache.entries.S01.source = 'disk://S01.json';
    cache.entries.S01.validatorFingerprint = 'old-validator';
    expect((await repository.refresh()).ok).toBe(false);

    delete disk.failures.S01;
    await repository.refresh();
    disk.failures.S01 = { category: ContentErrorCategory.UNREADABLE };
    expect((await repository.refresh({ mode: 'audit' })).ok).toBe(false);
    expect((await repository.refresh({ mode: 'publish' })).ok).toBe(false);
  });

  it('列表不可读时仅复用最近成功磁盘 closure；列表 missing/schema failure 不回退', async () => {
    const disk = new MemoryDisk(['S01']);
    const { repository } = createRepository(disk);
    await repository.refresh();
    disk.failures.order = { category: ContentErrorCategory.UNREADABLE };
    disk.scenes.S01 = scene('S01', 'fresh-with-old-closure');

    const fallback = await repository.refresh();
    expect(fallback.ok).toBe(true);
    expect(fallback.snapshot.ids).toEqual(['S01']);
    expect(fallback.snapshot.listProvenance).toMatchObject({ fallback: true, reason: ContentErrorCategory.UNREADABLE });
    expect(fallback.snapshot.getScene('S01').marker).toBe('fresh-with-old-closure');

    disk.failures.order = { category: ContentErrorCategory.MISSING };
    expect((await repository.refresh()).ok).toBe(false);
    disk.failures.order = { raw: json({ gameId: 'game', order: [], scenes: [] }) };
    expect((await repository.refresh()).ok).toBe(false);
  });
});

describe('WorldMapLoadSession repository generation isolation', () => {
  it('每个 generation refresh 一次，generation 内所有场景读取复用同一 immutable snapshot', async () => {
    const disk = new MemoryDisk(['S01', 'S02']);
    disk.project.worldMap = {
      entrySceneId: 'S01',
      regions: [{
        id: 'region', rows: 1, cols: 2, chunkWidth: 100, chunkHeight: 50,
        grid: [['S01', 'S02']]
      }]
    };
    const { repository } = createRepository(disk);
    let refreshCount = 0;
    const originalRefresh = repository.refresh.bind(repository);
    repository.refresh = async options => { refreshCount++; return originalRefresh(options); };
    const session = new WorldMapLoadSession({ repository });

    const first = await session.load({ sceneIds: 'entry' });
    const firstSnapshot = first.repositorySnapshot;
    await session.loadSceneData('S02');
    await session.loadSceneData('S02');
    expect(refreshCount).toBe(1);
    expect(disk.sceneReads.get('S02')).toBe(1);
    expect(first.sceneProvenance.S01).toMatchObject({ fallback: false });

    disk.scenes.S01 = scene('S01', 'generation-2');
    disk.revisions.S01 = 2;
    const second = await session.load({ sceneIds: 'entry' });
    expect(refreshCount).toBe(2);
    expect(second.repositorySnapshot).not.toBe(firstSnapshot);
    expect(second.chunks[0].sceneData.marker).toBe('generation-2');
    expect(firstSnapshot.getScene('S01').marker).toBe('S01');
  });
});
