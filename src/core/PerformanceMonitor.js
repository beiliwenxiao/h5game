/**
 * PerformanceMonitor - 性能监控器
 * 监控和显示游戏性能指标，包括FPS、实体数量、绘制调用数等
 */
export class PerformanceMonitor {
  /**
   * @param {Object} [options] - 配置选项
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.position = options.position || { x: 10, y: 10 };
    this.updateInterval = options.updateInterval || 0.5; // 更新间隔（秒）
    
    // 性能数据
    this.metrics = {
      fps: 0,
      frameTime: 0,
      updateTime: 0,
      renderTime: 0,
      entityCount: 0,
      visibleEntityCount: 0,
      drawCalls: 0,
      memoryUsage: 0,
      particleCount: 0,
      poolStats: {}
    };
    
    // FPS 计算
    this.frameCount = 0;
    this.lastUpdateTime = 0;
    this.frameTimes = [];
    this.maxFrameTimeSamples = 60;
    
    // 时间测量
    this.timers = new Map();
    
    // 历史数据（用于图表）
    this.history = {
      fps: [],
      frameTime: [],
      maxHistoryLength: 100
    };
    
    // 显示选项
    this.showGraph = options.showGraph !== undefined ? options.showGraph : false;
    this.graphHeight = 60;
    this.graphWidth = 200;
  }

  /**
   * 启用/禁用性能监控
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * 切换性能监控显示
   */
  toggle() {
    this.enabled = !this.enabled;
  }

  /**
   * 开始计时
   * @param {string} name - 计时器名称
   */
  startTimer(name) {
    if (!this.enabled) return;
    this.timers.set(name, performance.now());
  }

  /**
   * 结束计时并返回耗时
   * @param {string} name - 计时器名称
   * @returns {number} 耗时（毫秒）
   */
  endTimer(name) {
    if (!this.enabled) return 0;
    
    const startTime = this.timers.get(name);
    if (startTime === undefined) return 0;
    
    const elapsed = performance.now() - startTime;
    this.timers.delete(name);
    
    return elapsed;
  }

  /**
   * 更新性能指标
   * @param {number} deltaTime - 帧间隔时间（秒）
   * @param {Object} gameState - 游戏状态
   */
  update(deltaTime, gameState = {}) {
    if (!this.enabled) return;
    
    // 记录帧时间
    this.frameCount++;
    this.frameTimes.push(deltaTime * 1000);
    if (this.frameTimes.length > this.maxFrameTimeSamples) {
      this.frameTimes.shift();
    }
    
    // 更新累计时间
    this.lastUpdateTime += deltaTime;
    
    // 定期更新显示的指标
    if (this.lastUpdateTime >= this.updateInterval) {
      // 计算 FPS
      this.metrics.fps = Math.round(this.frameCount / this.lastUpdateTime);
      
      // 计算平均帧时间
      const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.metrics.frameTime = avgFrameTime;
      
      // 更新历史数据
      this.history.fps.push(this.metrics.fps);
      this.history.frameTime.push(avgFrameTime);
      
      if (this.history.fps.length > this.history.maxHistoryLength) {
        this.history.fps.shift();
        this.history.frameTime.shift();
      }
      
      // 重置计数器
      this.frameCount = 0;
      this.lastUpdateTime = 0;
    }
    
    // 更新游戏状态指标
    if (gameState.entityCount !== undefined) {
      this.metrics.entityCount = gameState.entityCount;
    }
    if (gameState.visibleEntityCount !== undefined) {
      this.metrics.visibleEntityCount = gameState.visibleEntityCount;
    }
    if (gameState.drawCalls !== undefined) {
      this.metrics.drawCalls = gameState.drawCalls;
    }
    if (gameState.particleCount !== undefined) {
      this.metrics.particleCount = gameState.particleCount;
    }
    if (gameState.poolStats !== undefined) {
      this.metrics.poolStats = gameState.poolStats;
    }
    
    // 更新内存使用（如果可用）
    if (performance.memory) {
      this.metrics.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1048576); // MB
    }
    
    // 更新计时器指标
    if (gameState.updateTime !== undefined) {
      this.metrics.updateTime = gameState.updateTime;
    }
    if (gameState.renderTime !== undefined) {
      this.metrics.renderTime = gameState.renderTime;
    }
  }

  /**
   * 渲染性能监控面板 - 更新 HTML debug-panel 元素
   * @param {CanvasRenderingContext2D} ctx - Canvas 渲染上下文（保留参数兼容性）
   */
  render(ctx) {
    if (!this.enabled) return;
    
    // 更新 HTML 的 #fps 元素（复用已有的 debug-panel）
    const fpsEl = document.getElementById('fps');
    if (fpsEl) {
      fpsEl.textContent = this.metrics.fps;
      // 根据FPS着色
      if (this.metrics.fps >= 50) {
        fpsEl.style.color = '#4CAF50';
      } else if (this.metrics.fps >= 30) {
        fpsEl.style.color = '#FFC107';
      } else {
        fpsEl.style.color = '#F44336';
      }
    }
  }

  /**
   * 获取显示行
   * @returns {Array} 显示行数组
   */
  getDisplayLines() {
    const lines = [
      { label: 'FPS:', metric: 'fps', value: this.metrics.fps.toString() },
      { label: 'Frame Time:', metric: 'frameTime', value: this.metrics.frameTime.toFixed(2) + ' ms' },
      { label: 'Update Time:', metric: 'updateTime', value: this.metrics.updateTime.toFixed(2) + ' ms' },
      { label: 'Render Time:', metric: 'renderTime', value: this.metrics.renderTime.toFixed(2) + ' ms' },
      { label: 'Entities:', metric: 'entityCount', value: this.metrics.entityCount.toString() },
      { label: 'Visible:', metric: 'visibleEntityCount', value: this.metrics.visibleEntityCount.toString() },
      { label: 'Draw Calls:', metric: 'drawCalls', value: this.metrics.drawCalls.toString() },
      { label: 'Particles:', metric: 'particleCount', value: this.metrics.particleCount.toString() }
    ];
    
    // 添加内存使用（如果可用）
    if (this.metrics.memoryUsage > 0) {
      lines.push({ 
        label: 'Memory:', 
        metric: 'memoryUsage', 
        value: this.metrics.memoryUsage + ' MB' 
      });
    }
    
    return lines;
  }

  /**
   * 根据指标值获取颜色
   * @param {string} metric - 指标名称
   * @param {string} value - 指标值
   * @returns {string} 颜色
   */
  getColorForMetric(metric, value) {
    if (metric === 'fps') {
      const fps = parseInt(value);
      if (fps >= 55) return '#4CAF50'; // 绿色
      if (fps >= 30) return '#FFC107'; // 黄色
      return '#F44336'; // 红色
    }
    
    if (metric === 'frameTime') {
      const time = parseFloat(value);
      if (time <= 16.7) return '#4CAF50'; // 60 FPS
      if (time <= 33.3) return '#FFC107'; // 30 FPS
      return '#F44336';
    }
    
    return '#4CAF50';
  }

  /**
   * 渲染性能图表
   * @param {CanvasRenderingContext2D} ctx - Canvas 渲染上下文
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   */
  renderGraph(ctx, x, y) {
    const width = this.graphWidth;
    const height = this.graphHeight;
    
    // 绘制背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, width, height);
    
    // 绘制边框
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    
    // 绘制 FPS 图表
    if (this.history.fps.length > 1) {
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const maxFps = 60;
      const step = width / (this.history.maxHistoryLength - 1);
      
      for (let i = 0; i < this.history.fps.length; i++) {
        const fps = Math.min(this.history.fps[i], maxFps);
        const graphX = x + i * step;
        const graphY = y + height - (fps / maxFps) * height;
        
        if (i === 0) {
          ctx.moveTo(graphX, graphY);
        } else {
          ctx.lineTo(graphX, graphY);
        }
      }
      
      ctx.stroke();
    }
    
    // 绘制参考线（60 FPS 和 30 FPS）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    // 60 FPS 线
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    
    // 30 FPS 线
    ctx.beginPath();
    const midY = y + height / 2;
    ctx.moveTo(x, midY);
    ctx.lineTo(x + width, midY);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // 绘制标签
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('60', x - 5, y + 5);
    ctx.fillText('30', x - 5, midY + 5);
    ctx.fillText('0', x - 5, y + height);
  }

  /**
   * 切换图表显示
   */
  toggleGraph() {
    this.showGraph = !this.showGraph;
  }

  /**
   * 获取性能指标
   * @returns {Object} 性能指标
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * 重置性能监控
   */
  reset() {
    this.frameCount = 0;
    this.lastUpdateTime = 0;
    this.frameTimes = [];
    this.history.fps = [];
    this.history.frameTime = [];
    this.timers.clear();
  }

  /**
   * 导出性能数据
   * @returns {Object} 性能数据
   */
  exportData() {
    return {
      metrics: this.getMetrics(),
      history: {
        fps: [...this.history.fps],
        frameTime: [...this.history.frameTime]
      },
      timestamp: Date.now()
    };
  }

  /**
   * 记录性能数据到控制台
   */
  logToConsole() {
    console.group('Performance Metrics');
    console.log('FPS:', this.metrics.fps);
    console.log('Frame Time:', this.metrics.frameTime.toFixed(2), 'ms');
    console.log('Update Time:', this.metrics.updateTime.toFixed(2), 'ms');
    console.log('Render Time:', this.metrics.renderTime.toFixed(2), 'ms');
    console.log('Entities:', this.metrics.entityCount);
    console.log('Visible Entities:', this.metrics.visibleEntityCount);
    console.log('Draw Calls:', this.metrics.drawCalls);
    console.log('Particles:', this.metrics.particleCount);
    if (this.metrics.memoryUsage > 0) {
      console.log('Memory Usage:', this.metrics.memoryUsage, 'MB');
    }
    console.groupEnd();
  }
}
