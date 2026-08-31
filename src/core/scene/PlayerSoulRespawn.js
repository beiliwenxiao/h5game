/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/**
 * PlayerSoulRespawn - 死亡灵魂状态复活流程
 *
 * 普通死亡后的表现流程：
 * - 玩家进入半透明灵魂状态（isSoulState），保留移动、禁用其他一切操作；
 * - 走到最近的篝火附近（approachRadius 内）后，篝火上显示复活倒计时；
 * - 倒计时（默认 20 秒）结束即在篝火旁复活；
 * - 场景没有篝火时，倒计时在死亡位置照常流逝，结束时在出生点复活。
 *
 * 死亡结算（资源掉落/检查点）仍由 DEATH_DROP 命令事务在死亡瞬间完成
 * （deferRespawn: true），本流程只负责复活时机与位置。
 */
export class PlayerSoulRespawn {
  constructor({
    durationSeconds = 20,
    approachRadius = 150,
    reviveOffsetY = 46,
    getCampfirePosition = () => null,
    getSpawnPosition = () => null,
    showTip = () => {},
    hideTip = () => {},
    onCountdown = () => {},
    onSoulStateChange = () => {},
    onComplete = () => ({ ok: false })
  } = {}) {
    this.durationSeconds = Math.max(1, Number(durationSeconds) || 20);
    this.approachRadius = Math.max(0, Number(approachRadius) || 0);
    this.reviveOffsetY = Number(reviveOffsetY) || 0;
    this.getCampfirePosition = typeof getCampfirePosition === 'function' ? getCampfirePosition : () => null;
    this.getSpawnPosition = typeof getSpawnPosition === 'function' ? getSpawnPosition : () => null;
    this.showTip = showTip;
    this.hideTip = hideTip;
    this.onCountdown = onCountdown;
    this.onSoulStateChange = onSoulStateChange;
    this.onComplete = onComplete;
    this.pending = null;
    this.disposed = false;
  }

  /** 玩家死亡后进入灵魂状态；同一时间只允许一个 pending。 */
  start({ player, deathId, resolution, deathEvent = null } = {}) {
    if (this.disposed || !player || !deathId || this.pending) return false;
    const transform = player.getComponent?.('transform');
    if (!transform?.position) return false;
    this.pending = {
      player, deathId, resolution: resolution || { type: 'normalDeath' }, deathEvent,
      remaining: this.durationSeconds,
      displayedSeconds: null,
      countdownActive: false,
      completing: false
    };
    player.isSoulState = true;
    this.onSoulStateChange(true);
    const cause = describeDeathCause(deathEvent);
    this.showTip?.(`你已经${cause}。灵魂状态只能移动，请走到篝火附近等待复活。`, { title: '死亡', owner: 'playerSoul', persist: true });
    return true;
  }

  isPendingFor(deathId) {
    return this.pending?.deathId === deathId;
  }

  update(deltaTime) {
    const pending = this.pending;
    if (!pending || pending.completing || this.disposed) return false;
    const position = pending.player?.getComponent?.('transform')?.position;
    if (!position) return true;

    const campfire = this.getCampfirePosition();
    const hasCampfire = Number.isFinite(campfire?.x) && Number.isFinite(campfire?.y);
    const nearCampfire = hasCampfire
      && Math.hypot(campfire.x - position.x, campfire.y - position.y) <= this.approachRadius;
    // 无篝火场景：倒计时从死亡起持续流逝（不要求靠近）
    if (hasCampfire && !nearCampfire) {
      if (pending.countdownActive) this._presentCountdown(pending, null);
      pending.countdownActive = false;
      return true;
    }

    pending.countdownActive = true;
    pending.remaining = Math.max(0, pending.remaining - Math.max(0, Number(deltaTime) || 0));
    if (hasCampfire) this._presentCountdown(pending, Math.ceil(pending.remaining));
    else this._presentFallbackTip(pending);
    if (pending.remaining > 0) return true;

    pending.completing = true;
    this._presentCountdown(pending, null);
    const target = hasCampfire
      ? { x: campfire.x, y: campfire.y + this.reviveOffsetY, label: '篝火旁' }
      : (this.getSpawnPosition() || null);
    Promise.resolve(this.onComplete({
      player: pending.player, deathId: pending.deathId,
      resolution: pending.resolution, position: target
    })).then(result => {
      if (this.disposed || this.pending !== pending) return;
      if (result?.ok) {
        this._finish(pending, result);
        return;
      }
      // 复位失败：恢复等待，下帧继续尝试
      pending.completing = false;
      pending.remaining = Math.min(pending.remaining, 1);
      this.showTip?.('复活结算失败，稍后自动重试', { title: '复活' });
    }).catch(error => {
      if (!this.disposed && this.pending === pending) {
        pending.completing = false;
        pending.remaining = Math.min(pending.remaining, 1);
      }
      console.warn('PlayerSoulRespawn: 复活完成回调失败', error);
    });
    return true;
  }

  _finish(pending, result) {
    pending.player.isSoulState = false;
    this.onSoulStateChange(false);
    this._presentCountdown(pending, null);
    this.hideTip?.();
    const position = result.respawnPosition || null;
    const location = position?.label
      || (Number.isFinite(position?.x) && Number.isFinite(position?.y) ? `（${Math.round(position.x)}, ${Math.round(position.y)}）` : '篝火旁');
    this.showTip?.(`你已在${location}复活`, { title: '复活' });
    this.pending = null;
  }

  _presentCountdown(pending, seconds) {
    if (pending.displayedSeconds === seconds) return;
    pending.displayedSeconds = seconds;
    this.onCountdown(seconds, {
      durationSeconds: this.durationSeconds,
      approachRadius: this.approachRadius,
      remainingSeconds: pending.remaining
    });
  }

  /** 无篝火时的兜底提示（每秒刷新一次）。 */
  _presentFallbackTip(pending) {
    const seconds = Math.max(0, Math.ceil(pending.remaining));
    if (pending.displayedSeconds === seconds) return;
    pending.displayedSeconds = seconds;
    this.onCountdown(null);
    this.showTip?.(`附近没有篝火，${seconds}秒后将回到出生点复活`, { title: '死亡', owner: 'playerSoul', persist: true });
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    if (this.pending) {
      this.pending.player.isSoulState = false;
      this._presentCountdown(this.pending, null);
      this.pending = null;
    }
    this.hideTip?.();
    this.onSoulStateChange(false);
    return true;
  }
}

/** 与 PlayerDeathCountdown 一致的死因描述。 */
function describeDeathCause(event = {}) {
  const sourceName = event?.sourceEntity?.name || event?.sourceEntity?.getComponent?.('name')?.name || '';
  const damageType = String(event?.damageType || '');
  const text = `${sourceName} ${damageType}`.toLowerCase();
  if (/狼|wolf/.test(text)) return '被狼咬死';
  if (/冻|冰|frost|cold/.test(text)) return '被冻死';
  if (/饿|饥|hunger|starv/.test(text)) return '被饿死';
  if (/枪|戟|矛|刺|spear|lance/.test(text)) return '被枪戳死';
  if (sourceName) return `被${sourceName}击败`;
  return '因伤势过重倒下';
}

export default PlayerSoulRespawn;
