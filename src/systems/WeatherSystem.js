/**
 * WeatherSystem - 天气系统
 *
 * 天气类型及视觉效果：
 * - clear: 偶尔的阳光光束扫过
 * - breeze: 长弧形风线，带圈
 * - wind: 更大更密的风线，呼啸感（抖动+密集）
 * - lightRain: 细雨（线条更细更短）
 * - heavyRain: 大雨（粗线、密集）
 * - lightFog: 飘动的云雾团
 * - heavyFog: 地面飘动的浓雾团
 * - storm: 大雨 + 闪电
 */
export class WeatherSystem {
  constructor(config = {}) {
    this.currentWeather = config.default || 'clear';
    this.targetWeather = this.currentWeather;
    this.transitionProgress = 1;
    this.transitionSpeed = config.transitionSpeed || 0.5;

    this.weatherDefs = {
      clear:     { fogAdd: 0 },
      breeze:    { fogAdd: 0, count: 12, windX: 40, windY: 3 },
      wind:      { fogAdd: 0.05, count: 35, windX: 120, windY: 8 },
      lightRain: { fogAdd: 0.1, count: 80, windX: 8, windY: 350 },
      heavyRain: { fogAdd: 0.2, count: 180, windX: 30, windY: 520 },
      lightFog:  { fogAdd: 0.25, count: 8 },
      heavyFog:  { fogAdd: 0.5, count: 14 },
      storm:     { fogAdd: 0.3, count: 140, windX: 55, windY: 480, lightning: true }
    };

    if (config.particles) {
      for (const [key, val] of Object.entries(config.particles)) {
        if (this.weatherDefs[key]) Object.assign(this.weatherDefs[key], val);
      }
    }

    this._particles = [];
    this._fogClouds = [];
    this._lightningTimer = 0;
    this._lightningFlash = 0;
    this._sunbeamTimer = 0;
    this._sunbeams = [];
    this._time = 0;

    this.regions = [];
  }

  setWeather(type, options = {}) {
    if (!this.weatherDefs[type]) return;
    this.targetWeather = type;
    this.transitionProgress = 0;
    this._particles.length = 0;
    this._fogClouds.length = 0;
    if (options.immediate) {
      this.currentWeather = type;
      this.transitionProgress = 1;
    }
  }

  setRegionWeather(regionId, weather) {
    const r = this.regions.find(r => r.id === regionId);
    if (r) r.weather = weather;
    else this.regions.push({ id: regionId, weather });
  }

  getFogAdd() {
    const cur = this.weatherDefs[this.currentWeather] || {};
    const tar = this.weatherDefs[this.targetWeather] || {};
    const t = this.transitionProgress;
    return (cur.fogAdd || 0) * (1 - t) + (tar.fogAdd || 0) * t;
  }

  update(deltaTime) {
    this._time += deltaTime;

    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + this.transitionSpeed * deltaTime);
      if (this.transitionProgress >= 1) this.currentWeather = this.targetWeather;
    }

    const weather = this.targetWeather;
    const def = this.weatherDefs[weather];

    // 晴天光束
    if (weather === 'clear') {
      this._updateSunbeams(deltaTime);
    } else {
      this._sunbeams.length = 0;
    }

    // 风/雨粒子
    if (weather === 'breeze' || weather === 'wind' || weather === 'lightRain' || weather === 'heavyRain' || weather === 'storm') {
      this._updateParticles(deltaTime, def, weather);
    } else {
      this._particles.length = 0;
    }

    // 雾团
    if (weather === 'lightFog' || weather === 'heavyFog') {
      this._updateFogClouds(deltaTime, def, weather);
    } else {
      this._fogClouds.length = 0;
    }

    // 闪电
    if (def && def.lightning) {
      this._lightningTimer -= deltaTime;
      if (this._lightningTimer <= 0) {
        this._lightningFlash = 0.9;
        this._lightningTimer = 2 + Math.random() * 4;
      }
    }
    if (this._lightningFlash > 0) {
      this._lightningFlash -= deltaTime * 5;
      if (this._lightningFlash < 0) this._lightningFlash = 0;
    }
  }

  // ─── 晴天光束 ───
  _updateSunbeams(deltaTime) {
    this._sunbeamTimer -= deltaTime;
    if (this._sunbeamTimer <= 0) {
      this._sunbeamTimer = 4 + Math.random() * 6;
      this._sunbeams.push({
        x: Math.random() * 1400,
        width: 60 + Math.random() * 80,
        life: 2 + Math.random() * 1.5,
        maxLife: 2 + Math.random() * 1.5,
        speed: 30 + Math.random() * 20
      });
    }
    for (let i = this._sunbeams.length - 1; i >= 0; i--) {
      const b = this._sunbeams[i];
      b.x += b.speed * deltaTime;
      b.life -= deltaTime;
      if (b.life <= 0) this._sunbeams.splice(i, 1);
    }
  }

  // ─── 风/雨粒子 ───
  _updateParticles(deltaTime, def, weather) {
    const target = def.count || 50;
    while (this._particles.length < target) {
      this._particles.push(this._spawnParticle(def, weather, true));
    }
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += (def.windX || 0) * deltaTime;
      p.y += (def.windY || 0) * deltaTime;
      // 风粒子加正弦波动
      if (weather === 'breeze' || weather === 'wind') {
        p.phase += deltaTime * p.freq;
        p.offsetY = Math.sin(p.phase) * p.amp;
      }
      if (p.y > 820 || p.x > 1500 || p.x < -150) {
        this._particles[i] = this._spawnParticle(def, weather, false);
      }
    }
    while (this._particles.length > target) this._particles.pop();
  }

  _spawnParticle(def, weather, randomY) {
    const p = {
      x: Math.random() * 1500 - 100,
      y: randomY ? Math.random() * 820 : (-10 - Math.random() * 80),
      phase: Math.random() * Math.PI * 2,
      freq: 2 + Math.random() * 3,
      amp: weather === 'wind' ? (8 + Math.random() * 6) : (3 + Math.random() * 3),
      offsetY: 0
    };
    return p;
  }

  // ─── 雾团 ───
  _updateFogClouds(deltaTime, def, weather) {
    const target = def.count || 8;
    while (this._fogClouds.length < target) {
      this._fogClouds.push(this._spawnFogCloud(weather, true));
    }
    for (let i = this._fogClouds.length - 1; i >= 0; i--) {
      const c = this._fogClouds[i];
      c.x += c.speedX * deltaTime;
      c.y += c.speedY * deltaTime;
      c.phase += deltaTime * 0.5;
      if (c.x > 1500 || c.x < -300) {
        this._fogClouds[i] = this._spawnFogCloud(weather, false);
      }
    }
    while (this._fogClouds.length > target) this._fogClouds.pop();
  }

  _spawnFogCloud(weather, randomX) {
    const isHeavy = weather === 'heavyFog';
    return {
      x: randomX ? Math.random() * 1400 : (-200 - Math.random() * 100),
      y: isHeavy ? (500 + Math.random() * 250) : (200 + Math.random() * 500),
      width: (isHeavy ? 250 : 180) + Math.random() * 150,
      height: (isHeavy ? 80 : 60) + Math.random() * 40,
      opacity: isHeavy ? (0.3 + Math.random() * 0.25) : (0.15 + Math.random() * 0.15),
      speedX: 10 + Math.random() * 15,
      speedY: (Math.random() - 0.5) * 3,
      phase: Math.random() * Math.PI * 2
    };
  }

  // ─── 渲染 ───
  render(ctx, width, height) {
    const weather = this.targetWeather;
    const alpha = Math.min(1, this.transitionProgress);

    // 晴天光束
    if (weather === 'clear' && this._sunbeams.length > 0) {
      ctx.save();
      for (const b of this._sunbeams) {
        const lifeRatio = b.life / b.maxLife;
        const beamAlpha = Math.sin(lifeRatio * Math.PI) * 0.15;
        const grad = ctx.createLinearGradient(b.x, 0, b.x + b.width, height);
        grad.addColorStop(0, `rgba(255,240,180,${beamAlpha})`);
        grad.addColorStop(0.5, `rgba(255,255,200,${beamAlpha * 0.6})`);
        grad.addColorStop(1, `rgba(255,240,180,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(b.x, 0);
        ctx.lineTo(b.x + b.width * 0.3, 0);
        ctx.lineTo(b.x + b.width, height);
        ctx.lineTo(b.x + b.width * 0.7, height);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 雾团
    if ((weather === 'lightFog' || weather === 'heavyFog') && this._fogClouds.length > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      for (const c of this._fogClouds) {
        const pulse = 1 + Math.sin(c.phase) * 0.1;
        const w = c.width * pulse;
        const h = c.height * pulse;
        const grad = ctx.createRadialGradient(c.x + w / 2, c.y + h / 2, 0, c.x + w / 2, c.y + h / 2, w / 2);
        grad.addColorStop(0, `rgba(200,210,220,${c.opacity})`);
        grad.addColorStop(0.6, `rgba(180,190,200,${c.opacity * 0.5})`);
        grad.addColorStop(1, 'rgba(180,190,200,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(c.x + w / 2, c.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 风线
    if ((weather === 'breeze' || weather === 'wind') && this._particles.length > 0) {
      const def = this.weatherDefs[weather];
      ctx.save();
      ctx.globalAlpha = alpha;
      const isStrong = weather === 'wind';
      ctx.strokeStyle = isStrong ? 'rgba(180,180,180,0.5)' : 'rgba(200,200,200,0.3)';
      ctx.lineWidth = isStrong ? 1.5 : 1;

      for (const p of this._particles) {
        const len = isStrong ? 50 + Math.random() * 20 : 30 + Math.random() * 10;
        const baseY = p.y + p.offsetY;
        ctx.beginPath();
        ctx.moveTo(p.x, baseY);
        // 弧形风线：用二次贝塞尔曲线
        const cpx = p.x + len * 0.5;
        const cpy = baseY + (isStrong ? 12 : 6) * Math.sin(p.phase);
        ctx.quadraticCurveTo(cpx, cpy, p.x + len, baseY + (isStrong ? 4 : 2));
        ctx.stroke();
        // 微风带圈
        if (!isStrong && Math.random() < 0.3) {
          ctx.beginPath();
          ctx.arc(p.x + len, baseY + 2, 3, 0, Math.PI * 1.5);
          ctx.stroke();
        }
        // 大风呼啸：额外短划线（抖动感）
        if (isStrong) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.beginPath();
          ctx.moveTo(p.x + len * 0.3, baseY + 3);
          ctx.lineTo(p.x + len * 0.6, baseY - 2);
          ctx.stroke();
          ctx.globalAlpha = alpha;
        }
      }
      ctx.restore();
    }

    // 雨
    if ((weather === 'lightRain' || weather === 'heavyRain' || weather === 'storm') && this._particles.length > 0) {
      const def = this.weatherDefs[weather];
      const isLight = weather === 'lightRain';
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = isLight ? 'rgba(170,190,255,0.4)' : 'rgba(120,150,255,0.6)';
      ctx.lineWidth = isLight ? 0.8 : 1.8;

      const angle = Math.atan2(def.windY || 1, def.windX || 0);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const len = isLight ? 8 : 16;

      for (const p of this._particles) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + cosA * len, p.y + sinA * len);
        ctx.stroke();
      }
      ctx.restore();
    }

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
