/**
 * 单调、可暂停的场景模拟时钟。
 * RAF 与调试 UI 可继续运行，但 now() 在暂停期间保持不变。
 */
export class PausableClock {
  constructor({ now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
    this.sourceNow = now;
    this.totalPausedMs = 0;
    this.pausedAt = null;
  }

  now() {
    const sourceTime = this.pausedAt ?? Number(this.sourceNow());
    return Math.max(0, sourceTime - this.totalPausedMs);
  }

  nowSeconds() {
    return this.now() / 1000;
  }

  pause() {
    if (this.pausedAt !== null) return false;
    this.pausedAt = Number(this.sourceNow());
    return true;
  }

  resume() {
    if (this.pausedAt === null) return false;
    const resumedAt = Number(this.sourceNow());
    this.totalPausedMs += Math.max(0, resumedAt - this.pausedAt);
    this.pausedAt = null;
    return true;
  }

  get isPaused() {
    return this.pausedAt !== null;
  }
}

export default PausableClock;