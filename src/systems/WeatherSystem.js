/**
 * WeatherSystem - 天气系统
 *
 * 天气类型：clear, breeze, wind, lightRain, heavyRain, lightFog, heavyFog, storm
 * 每种天气有粒子效果（雨滴/风线/雷闪）和雾叠加参数。
 * 支持全局天气和区域天气。可通过触发器 setWeather 动态切换。
 */
export class WeatherSystem {
  constructor(config = {}) {
    this.currentWeather = config.default || 'clear';
    this.targetWeather = this.currentWeather;
    this.transitionProgress = 1; // 1=已完成过渡
    this.transitionSpeed = config.transitionSpeed || 0.5; // 每秒过渡量

    // 各天气的渲染参数
    this.weatherDefs = {
      clear:     { fogAdd: 0, particles: null, windX: 0, windY: 0 },
      breeze:    { fogAdd: 0, particles: 'wind', windX: 30, windY: 5, count: 15, color: 'rgba(200,200,200,0.3)', len: 20 },
      wind:      { fogAdd: 0.05, particles: 'wind', windX: 80, windY: 10, count: 30, color: 'rgba(180,180,180,0.4)', len: 40 },
      lightRain: { fogAdd: 0.1, particles: 'rain', windX: 10, windY: 300, count: 60, color: 'rgba(150,180,255,0.5)', len: 12 },
      heavyRain: { fogAdd: 0.2, particles: 'rain', windX: 30, windY: 500, count: 150, color: 'rgba(120,150,255,0.6)', len: 18 },
      lightFog:  { fogAdd: 0.25, particles: null, windX: 0, windY: 0 },
      heavyFog:  { fogAdd: 0.5, particles: null, windX: 0, windY: 0 },
      storm:     { fogAdd: 0.3, particles: 'rain', windX: 60, windY: 450, count: 120, color: 'rgba(100,130,255,0.7)', len: 20, lightning: true }
    };

    // 用户可通过 config.particles 覆盖默认参数
    if (config.particles) {
      for (const [key, val] of Object.entries(config.particles)) {
        if (this.weatherDefs[key]) Object.assign(this.weatherDefs[key], val);
      }
    }

    // 粒子池
    this._particles = [];
    this._lightningTimer = 0;
    this._lightningFlash = 0;

    // 区域天气（可选）
    this.regions = []; // [{x, y, width, height, weather}]
  }

  /** 设置全局天气 */
  setWeather(type, options = {}) {
    if (!this.weatherDefs[type]) return;
    this.targetWeather = type;
    this.transitionProgress = 0;
    if (options.immediate) {
      this.currentWeather = type;
      this.transitionProgress = 1;
    }
  }

  /** 设置区域天气 */
  setRegionWeather(regionId, weather) {
    const r = this.regions.find(r => r.id === regionId);
    if (r) r.weather = weather;
    else this.regions.push({ id: regionId, weather });
  }

  /** 获取当前天气附加雾浓度 */
  getFogAdd() {
    const cur = this.weatherDefs[this.currentWeather] || {};
    const tar = this.weatherDefs[this.targetWeather] || {};
    const t = this.transitionProgress;
    return (cur.fogAdd || 0) * (1 - t) + (tar.fogAdd || 0) * t;
  }

  update(deltaTime) {
    // 过渡
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + this.transitionSpeed * deltaTime);
      if (this.transitionProgress >= 1) {
        this.currentWeather = this.targetWeather;
      }
    }

    // 粒子更新
    const def = this.weatherDefs[this.targetWeather];
    if (def && def.particles) {
      this._updateParticles(deltaTime, def);
    } else {
      this._particles.length = 0;
    }

    // 闪电
    if (def && def.lightning) {
      this._lightningTimer -= deltaTime;
      if (this._lightningTimer <= 0) {
        this._lightningFlash = 0.8;
        this._lightningTimer = 3 + Math.random() * 5;
      }
    }
    if (this._lightningFlash > 0) {
      this._lightningFlash -= deltaTime * 4;
      if (this._lightningFlash < 0) this._lightningFlash = 0;
    }
  }

  _updateParticles(deltaTime, def) {
    const target = def.count || 50;
    // 生成
    while (this._particles.length < target) {
      this._particles.push(this._spawnParticle(def));
    }
    // 更新
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += (def.windX || 0) * deltaTime;
      p.y += (def.windY || 0) * deltaTime;
      p.life -= deltaTime;
      if (p.life <= 0 || p.y > p.maxY || p.x > p.maxX) {
        this._particles[i] = this._spawnParticle(def);
      }
    }
  }

  _spawnParticle(def) {
    return {
      x: Math.random() * 1400 - 100,
      y: -20 - Math.random() * 200,
      life: 2 + Math.random() * 2,
      maxY: 800,
      maxX: 1400
    };
  }

  /** 渲染天气效果（屏幕坐标系，在 renderFogLayer 中调用） */
  render(ctx, width, height) {
    const def = this.weatherDefs[this.targetWeather];
    if (!def || !def.particles) {
      // 闪电白屏
      if (this._lightningFlash > 0) {
        ctx.save();
        ctx.globalAlpha = this._lightningFlash;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
      return;
    }

    ctx.save();
    const alpha = Math.min(1, this.transitionProgress);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = def.color || 'rgba(200,200,255,0.5)';
    ctx.lineWidth = def.particles === 'rain' ? 1.5 : 1;

    for (const p of this._particles) {
      const len = def.len || 12;
      const angle = Math.atan2(def.windY || 1, def.windX || 0);
      const ex = p.x + Math.cos(angle) * len;
      const ey = p.y + Math.sin(angle) * len;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();

    // 闪电
    if (this._lightningFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this._lightningFlash;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}

export default WeatherSystem;
