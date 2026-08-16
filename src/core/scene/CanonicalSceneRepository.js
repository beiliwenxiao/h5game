import { ContentErrorCategory, ContentPhase, normalizeContentError } from '../validation/ContentOperationResult.js';
import { CanonicalSceneValidator } from './CanonicalSceneValidation.js';

const FALLBACK_MODES = new Set(['runtime', 'thumbnail']);
const FALLBACK_CATEGORIES = new Set([
  ContentErrorCategory.UNREADABLE,
  ContentErrorCategory.PARSE_FAILED
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function diskFailure(read, fallbackSource) {
  const source = read?.source || fallbackSource;
  const category = read?.category || ContentErrorCategory.UNREADABLE;
  const phase = category === ContentErrorCategory.PARSE_FAILED ? ContentPhase.PARSE : ContentPhase.READ;
  return normalizeContentError({
    code: category,
    path: '',
    message: read?.error?.message || `${source} ${category}`
  }, { phase, source, category });
}

function normalizeRead(read, source) {
  if (read && typeof read === 'object' && Object.prototype.hasOwnProperty.call(read, 'ok')) return read;
  return { ok: true, source, content: read, revision: null };
}

export class CanonicalSceneRepositorySnapshot {
  #records;

  constructor({ revision, diskRevision, refreshedAt, project, sceneOrder, ids, records, listProvenance }) {
    this.revision = revision;
    this.diskRevision = diskRevision;
    this.refreshedAt = refreshedAt;
    this.project = deepFreeze(clone(project));
    this.sceneOrder = deepFreeze(clone(sceneOrder));
    this.ids = Object.freeze(ids.slice());
    this.listProvenance = deepFreeze(clone(listProvenance));
    this.#records = new Map(records.map(record => [record.sceneId, deepFreeze(record)]));
    Object.freeze(this);
  }

  has(sceneId) { return this.#records.has(sceneId); }
  getScene(sceneId) { return this.#records.get(sceneId)?.data || null; }
  getRecord(sceneId) { return this.#records.get(sceneId) || null; }
  getProvenance(sceneId) {
    const record = this.#records.get(sceneId);
    if (!record) return null;
    const { data, ...provenance } = record;
    return provenance;
  }
}

/** 磁盘列表决定 ID closure、磁盘同 ID 内容优先且只允许受限 fallback 的场景仓库。 */
export class CanonicalSceneRepository {
  constructor({ diskAdapter, cacheAdapter = null, validator = null, mode = 'runtime', now = () => Date.now() } = {}) {
    if (!diskAdapter) throw new TypeError('CanonicalSceneRepository requires diskAdapter');
    this.diskAdapter = diskAdapter;
    this.cacheAdapter = cacheAdapter;
    this.validator = validator || new CanonicalSceneValidator();
    this.mode = mode;
    this.now = now;
    this._snapshot = null;
    this._revision = 0;
    this._generation = 0;
  }

  get snapshot() { return this._snapshot; }

  async refresh({ mode = this.mode } = {}) {
    const generation = ++this._generation;
    const refreshedAt = this.now();
    const allowFallback = FALLBACK_MODES.has(mode);
    const projectRead = normalizeRead(await this.diskAdapter.readProject(), '<project>');
    const projectResult = this._validateRead(projectRead, 'validateProject');
    if (!projectResult.ok) return this._failed(projectResult.errors);
    const project = projectResult.value;

    const orderRead = normalizeRead(await this.diskAdapter.readSceneOrder(), '<scene-order>');
    let orderResult = this._validateRead(orderRead, 'validateSceneOrder', { project });
    let sceneOrder;
    let ids;
    let listProvenance;
    if (orderResult.ok) {
      sceneOrder = orderResult.value;
      ids = this._orderedIds(sceneOrder);
      listProvenance = {
        source: orderRead.source, fallback: false, reason: null, diskRevision: orderRead.revision || null
      };
    } else if (allowFallback && this._snapshot && this._canFallback(orderResult.category)) {
      sceneOrder = this._snapshot.sceneOrder;
      ids = this._snapshot.ids.slice();
      listProvenance = {
        source: this._snapshot.listProvenance.source,
        fallback: true,
        reason: orderResult.category,
        diskRevision: this._snapshot.listProvenance.diskRevision
      };
    } else {
      return this._failed(orderResult.errors);
    }
    const closureErrors = this._validateClosure(project, ids, orderRead.source || '<scene-order>');
    if (closureErrors.length > 0) return this._failed(closureErrors);

    const stagedCache = new Map();
    const warnings = [];
    const outcomes = await Promise.all(ids.map(sceneId => this._loadScene({
      sceneId, project, refreshedAt, allowFallback, stagedCache
    })));
    const errors = outcomes.flatMap(outcome => outcome.ok ? [] : outcome.errors);
    if (errors.length > 0) return this._failed(errors);
    const records = outcomes.map(outcome => outcome.record);
    for (const outcome of outcomes) warnings.push(...outcome.warnings);

    if (generation !== this._generation) {
      return this._failed([normalizeContentError({
        code: 'refreshSuperseded', path: '', message: '场景仓库 refresh 已被更新 generation 取代'
      }, { phase: ContentPhase.READ, source: '<repository>', category: 'superseded' })]);
    }

    const diskRevision = [
      projectRead.revision || 'project-unversioned',
      listProvenance.diskRevision || 'list-unversioned',
      ...records.map(record => `${record.sceneId}:${record.diskRevision || 'unversioned'}`)
    ].join('|');
    const snapshot = new CanonicalSceneRepositorySnapshot({
      revision: ++this._revision,
      diskRevision,
      refreshedAt,
      project,
      sceneOrder,
      ids,
      records,
      listProvenance
    });
    this._snapshot = snapshot;
    const cacheErrors = this._synchronizeCache(ids, stagedCache);
    return {
      ok: true,
      snapshot,
      errors: [],
      warnings,
      cacheErrors,
      degraded: cacheErrors.length > 0 || warnings.length > 0
    };
  }

  _validateRead(read, method, context = {}) {
    if (!read.ok) {
      const error = diskFailure(read, read.source);
      return { ok: false, value: null, errors: [error], category: error.category };
    }
    const result = this.validator[method](read.content, { source: read.source, ...context });
    return { ...result, category: result.category || result.errors?.[0]?.category || null };
  }

  _orderedIds(sceneOrder) {
    const listed = Object.keys(sceneOrder.scenes || {});
    const listedSet = new Set(listed);
    return [
      ...(sceneOrder.order || []).filter(sceneId => listedSet.has(sceneId)),
      ...listed.filter(sceneId => !(sceneOrder.order || []).includes(sceneId))
    ];
  }

  _validateClosure(project, ids, source) {
    const projectIds = new Set((project.scenes || []).map(scene => scene?.id).filter(Boolean));
    return ids.filter(sceneId => !projectIds.has(sceneId)).map(sceneId => normalizeContentError({
      code: 'sceneOutsideProjectClosure',
      path: `scenes.${sceneId}`,
      message: `磁盘场景列表 ID 未在项目元数据登记: ${sceneId}`
    }, { phase: ContentPhase.REFERENCE, source, category: ContentErrorCategory.REFERENCE_FAILED }));
  }

  async _loadScene({ sceneId, project, refreshedAt, allowFallback, stagedCache }) {
    const read = normalizeRead(await this.diskAdapter.readScene(sceneId), `<scene:${sceneId}>`);
    const result = this._validateRead(read, 'validateScene', { sceneId, project });
    if (result.ok) {
      const data = deepFreeze(clone(result.value));
      const schemaVersion = data.schemaVersion ?? project.schemaVersion;
      const entry = {
        sceneId,
        source: read.source,
        canonicalData: data,
        diskRevision: read.revision || null,
        schemaVersion,
        validatorFingerprint: this.validator.fingerprint,
        refreshedAt,
        eligible: true
      };
      stagedCache.set(sceneId, entry);
      return {
        ok: true,
        record: deepFreeze({
          sceneId, data, source: read.source, canonicalSource: read.source,
          fallback: false, reason: null, diskRevision: read.revision || null,
          schemaVersion, validatorFingerprint: this.validator.fingerprint, refreshedAt
        }),
        warnings: []
      };
    }
    if (!allowFallback || !this._canFallback(result.category) || !this.cacheAdapter) {
      return { ok: false, errors: result.errors, warnings: [] };
    }
    const cacheEntry = this.cacheAdapter.get(sceneId);
    const expectedSchemaVersion = project.schemaVersion;
    const sameSource = cacheEntry?.sceneId === sceneId && cacheEntry?.source === read.source;
    const eligible = cacheEntry?.eligible === true
      && cacheEntry?.validatorFingerprint === this.validator.fingerprint
      && cacheEntry?.schemaVersion === expectedSchemaVersion;
    if (!sameSource || !eligible) return { ok: false, errors: result.errors, warnings: [] };

    const cachedResult = this.validator.validateScene(cacheEntry.canonicalData, {
      source: cacheEntry.source,
      sceneId,
      project
    });
    if (!cachedResult.ok) return { ok: false, errors: result.errors, warnings: [] };
    const data = deepFreeze(clone(cachedResult.value));
    const warning = normalizeContentError({
      code: 'canonicalSceneCacheFallback',
      path: '',
      message: `场景 ${sceneId} 因 ${result.category} 使用最近成功磁盘缓存`
    }, {
      phase: result.phase,
      source: cacheEntry.source,
      category: result.category,
      fallback: true
    });
    return {
      ok: true,
      record: deepFreeze({
        sceneId,
        data,
        source: 'cache',
        canonicalSource: cacheEntry.source,
        fallback: true,
        reason: result.category,
        diskRevision: cacheEntry.diskRevision,
        schemaVersion: cacheEntry.schemaVersion,
        validatorFingerprint: cacheEntry.validatorFingerprint,
        refreshedAt: cacheEntry.refreshedAt
      }),
      warnings: [warning]
    };
  }

  _canFallback(category) { return FALLBACK_CATEGORIES.has(category); }

  _synchronizeCache(ids, stagedCache) {
    if (!this.cacheAdapter) return [];
    const errors = [];
    const closure = new Set(ids);
    try {
      for (const cachedId of this.cacheAdapter.keys()) {
        if (!closure.has(cachedId)) this.cacheAdapter.delete(cachedId);
      }
    } catch (error) {
      errors.push({ code: 'cachePruneFailed', message: error.message });
    }
    for (const [sceneId, entry] of stagedCache) {
      try {
        this.cacheAdapter.set(sceneId, entry);
      } catch (error) {
        try { this.cacheAdapter.markIneligible?.(sceneId, 'refresh-write-failed'); } catch (ignored) { /* best effort */ }
        errors.push({ code: 'cacheWriteFailed', sceneId, message: error.message });
      }
    }
    return errors;
  }

  _failed(errors) {
    const normalized = (errors || []).map(error => error?.phase
      ? error
      : normalizeContentError(error, {
        phase: ContentPhase.READ,
        source: '<repository>',
        category: ContentErrorCategory.UNREADABLE
      }));
    return {
      ok: false,
      snapshot: this._snapshot,
      errors: normalized,
      warnings: [],
      cacheErrors: [],
      degraded: false,
      category: normalized[0]?.category || null
    };
  }
}

export default CanonicalSceneRepository;
