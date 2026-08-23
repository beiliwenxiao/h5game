const nameOf = entity => entity?.name || entity?.getComponent?.('name')?.name || '';

export function describeDeathCause(event = {}) {
  const sourceName = nameOf(event.sourceEntity);
  const damageType = String(event.damageType || '');
  const text = `${sourceName} ${damageType}`.toLowerCase();
  if (/狼|wolf/.test(text)) return '被狼咬死';
  if (/冻|冰|frost|cold/.test(text)) return '被冻死';
  if (/饿|饥|hunger|starv/.test(text)) return '被饿死';
  if (/枪|戟|矛|刺|spear|lance/.test(text)) return '被枪戳死';
  if (sourceName) return `被${sourceName}击败`;
  return '因伤势过重倒下';
}

/** 管理普通死亡的倒计时表现；实际掉落、检查点与复活仍委托既有命令事务。 */
export class PlayerDeathCountdown {
  constructor({ durationSeconds = 10, show = () => {}, hide = () => {}, onComplete = () => ({ ok: false }) } = {}) {
    this.durationSeconds = Math.max(1, Math.floor(Number(durationSeconds) || 10));
    this.show = show;
    this.hide = hide;
    this.onComplete = onComplete;
    this.pending = null;
    this.disposed = false;
  }

  start({ player, deathId, resolution, deathEvent = null } = {}) {
    if (this.disposed || !player || !deathId || this.pending) return false;
    this.pending = {
      player, deathId, resolution, deathEvent,
      remaining: this.durationSeconds, displayedSeconds: null, resolving: false
    };
    this._present();
    return true;
  }

  update(deltaTime) {
    const pending = this.pending;
    if (!pending || pending.resolving || this.disposed) return false;
    pending.remaining = Math.max(0, pending.remaining - Math.max(0, Number(deltaTime) || 0));
    this._present();
    if (pending.remaining > 0) return true;
    pending.resolving = true;
    this.hide();
    Promise.resolve(this.onComplete(pending)).then(result => {
      if (this.disposed || this.pending !== pending) return;
      if (result?.ok) {
        this.pending = null;
        return;
      }
      pending.resolving = false;
      pending.remaining = 1;
      pending.displayedSeconds = null;
      this._present('复活失败，正在重试。');
    }).catch(() => {
      if (this.disposed || this.pending !== pending) return;
      pending.resolving = false;
      pending.remaining = 1;
      pending.displayedSeconds = null;
      this._present('复活失败，正在重试。');
    });
    return true;
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    this.pending = null;
    this.hide();
    return true;
  }

  _present(prefix = '') {
    const pending = this.pending;
    if (!pending) return;
    const seconds = Math.max(0, Math.ceil(pending.remaining));
    if (pending.displayedSeconds === seconds && !prefix) return;
    pending.displayedSeconds = seconds;
    const cause = describeDeathCause(pending.deathEvent || {});
    const retry = prefix ? `${prefix}\n` : '';
    this.show(`${retry}你已经${cause}，${seconds}秒后复活。`);
  }
}

export default PlayerDeathCountdown;
