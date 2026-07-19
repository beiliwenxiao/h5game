/**
 * TimeSystem - 游戏时间系统
 *
 * 时间段：dawn(凌晨), earlyMorning(清晨), morning(上午), noon(中午),
 *         afternoon(下午), dusk(黄昏), night(夜晚), lateNight(深夜)
 * 每个时间段有 brightness、fogOpacity、tintColor。
 * 时间自动推进，段与段之间平滑过渡。
 * 可通过触发器 setTime 跳转到指定时间段。
 */
export class TimeSystem {
  static PERIODS = ['dawn', 'earlyMorning', 'morning', 'noon', 'afternoon', 'dusk', 'night', 'lateNight'];

  static PERIOD_NAMES = {
    dawn: '凌晨', earlyMorning: '清晨', morning: '上午', noon: '中午',
    afternoon: '下午', dusk: '黄昏', night: '夜晚', lateNight: '深夜'
  };

  static DEFAULTS = {
    dawn:         { duration: 60, brightness: 0.4,  fogOpacity: 0.6,  tintColor: 'rgba(80,60,120,0.2)' },
    earlyMorning: { duration: 60, brightness: 0.6,  fogOpacity: 0.3,  tintColor: 'rgba(255,200,100,0.1)' },
    morning:      { duration: 60, brightness: 0.9,  fogOpacity: 0.1,  tintColor: 'rgba(0,0,0,0)' },
    noon:         { duration: 60, brightness: 1.0,  fogOpacity: 0.0,  tintColor: 'rgba(0,0,0,0)' },
    afternoon:    { duration: 60, brightness: 0.85, fogOpacity: 0.1,  tintColor: 'rgba(255,180,50,0.05)' },
    dusk:         { duration: 60, brightness: 0.5,  fogOpacity: 0.4,  tintColor: 'rgba(255,100,50,0.15)' },
    night:        { duration: 60, brightness: 0.25, fogOpacity: 0.7,  tintColor: 'rgba(20,20,80,0.3)' },
    lateNight:    { duration: 60, brightness: 0.15, fogOpacity: 0.8,  tintColor: 'rgba(10,10,40,0.4)' }
  };

  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.paused = false;

    // 从配置加载各时间段参数
    this.periods = {};
    for (const p of TimeSystem.PERIODS) {
      this.periods[p] = { ...TimeSystem.DEFAULTS[p], ...(config.periods?.[p] || {}) };
    }

    // 计算总周期
    this.cycleDuration = 0;
    for (const p of TimeSystem.PERIODS) this.cycleDuration += this.periods[p].duration;

    // 当前时间（秒，0 ~ cycleDuration）
    this.elapsed = config.startTime || 0;

    // 过渡缓存
    this._currentBrightness = 1;
    this._currentFogOpacity = 0;
    this._currentTintColor = 'rgba(0,0,0,0)';
    this._update(0); // 初始化
  }

  /** 获取当前时间段名 */
  getCurrentPeriod() {
    return this._getPeriodAt(this.elapsed).name;
  }

  /** 获取当前时间段内进度 0~1 */
  getProgress() {
    const info = this._getPeriodAt(this.elapsed);
    return info.progress;
  }

  /** 获取当前明暗度 0~1 */
  getBrightness() { return this._currentBrightness; }

  /** 获取当前雾透明度 0~1 */
  getFogOpacity() { return this._currentFogOpacity; }

  /** 获取当前色调 */
  getTintColor() { return this._currentTintColor; }

  /** 手动跳转到某时间段开头 */
  setTimePeriod(period) {
    let offset = 0;
    for (const p of TimeSystem.PERIODS) {
      if (p === period) { this.elapsed = offset; this._update(0); return; }
      offset += this.periods[p].duration;
    }
  }

  /** 暂停/继续 */
  setPaused(v) { this.paused = v; }

  update(deltaTime) {
    if (!this.enabled || this.paused) return;
    this._update(deltaTime);
  }

  _update(deltaTime) {
    this.elapsed += deltaTime;
    if (this.elapsed >= this.cycleDuration) this.elapsed -= this.cycleDuration;
    if (this.elapsed < 0) this.elapsed += this.cycleDuration;

    // 当前时间段和下一个时间段的 lerp
    const info = this._getPeriodAt(this.elapsed);
    const curDef = this.periods[info.name];
    const nextIdx = (TimeSystem.PERIODS.indexOf(info.name) + 1) % TimeSystem.PERIODS.length;
    const nextDef = this.periods[TimeSystem.PERIODS[nextIdx]];

    // 在当前段后 80% 开始向下一段过渡（20% 过渡区）
    const transStart = 0.8;
    let t = 0;
    if (info.progress > transStart) {
      t = (info.progress - transStart) / (1 - transStart);
    }

    this._currentBrightness = this._lerp(curDef.brightness, nextDef.brightness, t);
    this._currentFogOpacity = this._lerp(curDef.fogOpacity, nextDef.fogOpacity, t);
    this._currentTintColor = this._lerpColor(curDef.tintColor, nextDef.tintColor, t);
  }

  _getPeriodAt(elapsed) {
    let offset = 0;
    for (const p of TimeSystem.PERIODS) {
      const dur = this.periods[p].duration;
      if (elapsed < offset + dur) {
        return { name: p, progress: (elapsed - offset) / dur };
      }
      offset += dur;
    }
    return { name: TimeSystem.PERIODS[0], progress: 0 };
  }

  _lerp(a, b, t) { return a + (b - a) * t; }

  _lerpColor(c1, c2, t) {
    const p1 = this._parseRgba(c1);
    const p2 = this._parseRgba(c2);
    const r = Math.round(this._lerp(p1[0], p2[0], t));
    const g = Math.round(this._lerp(p1[1], p2[1], t));
    const b = Math.round(this._lerp(p1[2], p2[2], t));
    const a = this._lerp(p1[3], p2[3], t).toFixed(3);
    return `rgba(${r},${g},${b},${a})`;
  }

  _parseRgba(str) {
    const m = (str || '').match(/[\d.]+/g);
    if (!m || m.length < 4) return [0, 0, 0, 0];
    return [parseFloat(m[0]), parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  }

  /** 渲染时间系统的明暗/色调层（屏幕坐标，renderFogLayer 中调用） */
  render(ctx, width, height) {
    if (!this.enabled) return;

    // 明暗：brightness < 1 时覆盖半透明黑色
    const darkness = 1 - this._currentBrightness;
    if (darkness > 0.01) {
      ctx.save();
      ctx.globalAlpha = darkness * 0.7; // 最暗时约 70% 黑
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // 色调叠加
    if (this._currentTintColor && this._currentTintColor !== 'rgba(0,0,0,0)') {
      ctx.save();
      ctx.fillStyle = this._currentTintColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}

export default TimeSystem;
