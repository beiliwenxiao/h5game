const clone = value => JSON.parse(JSON.stringify(value));
const hasText = value => typeof value === 'string' && value.trim().length > 0;

/** 在 service commit 后分配 state revision；prepare 不修改状态。 */
export class StateRevisionStore {
  constructor(initial = {}) {
    this.revisions = new Map();
    this.reservations = new Map();
    this._tokenSequence = 0;
    this.restore(initial);
  }

  current(stateId) {
    if (!hasText(stateId)) throw new TypeError('stateId must be a non-empty string');
    return this.revisions.get(stateId) || 0;
  }

  prepare(stateId, expectedStateRevision) {
    const current = this.current(stateId);
    if (expectedStateRevision !== undefined && expectedStateRevision !== current) {
      return Object.freeze({ ok: false, code: 'stateRevisionConflict', stateId, current, expected: expectedStateRevision });
    }
    if (this.reservations.has(stateId)) {
      return Object.freeze({ ok: false, code: 'stateRevisionBusy', stateId, current });
    }
    const prepared = Object.freeze({
      ok: true,
      stateId,
      previous: current,
      next: current + 1,
      token: `revision:${stateId}:${++this._tokenSequence}`
    });
    this.reservations.set(stateId, prepared.token);
    return prepared;
  }

  release(prepared) {
    if (!prepared?.ok || !hasText(prepared.stateId) || !hasText(prepared.token)) return false;
    if (this.reservations.get(prepared.stateId) !== prepared.token) return false;
    this.reservations.delete(prepared.stateId);
    return true;
  }

  commit(prepared) {
    if (!prepared?.ok || !hasText(prepared.token)) throw new TypeError('invalid prepared state revision');
    if (this.reservations.get(prepared.stateId) !== prepared.token) {
      return Object.freeze({ ok: false, code: 'stateRevisionReservationLost' });
    }
    if (this.current(prepared.stateId) !== prepared.previous) {
      this.release(prepared);
      return Object.freeze({ ok: false, code: 'stateRevisionConflict' });
    }
    this.revisions.set(prepared.stateId, prepared.next);
    this.release(prepared);
    return Object.freeze({ ok: true, stateRevision: prepared.next });
  }

  snapshot() { return Object.fromEntries([...this.revisions].sort(([a], [b]) => a.localeCompare(b))); }
  validate(snapshot) {
    const ok = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      && Object.entries(snapshot).every(([id, revision]) => hasText(id) && Number.isInteger(revision) && revision >= 0);
    return { ok, errors: ok ? [] : [{ code: 'invalidStateRevisions', path: 'stateRevisions', message: 'state revisions 必须为非负整数映射' }] };
  }
  restore(snapshot = {}) {
    const validation = this.validate(snapshot);
    if (!validation.ok) throw new TypeError(validation.errors[0].message);
    this.revisions = new Map(Object.entries(clone(snapshot)));
    this.reservations.clear();
    return this;
  }
}
