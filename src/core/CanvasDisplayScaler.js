/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/** 保持逻辑坐标稳定，同时按 CSS 尺寸与 DPR 提升 Canvas backing 清晰度。 */
export class CanvasDisplayScaler {
  constructor(canvas, {
    logicalWidth = 1280, logicalHeight = 720, scaleMode = 'fit', maxDpr = 2, maxBackingScale = 2
  } = {}) {
    if (!canvas) throw new TypeError('CanvasDisplayScaler requires a canvas');
    this.canvas = canvas;
    this.logicalWidth = logicalWidth;
    this.logicalHeight = logicalHeight;
    this.scaleMode = scaleMode === 'stretch' ? 'stretch' : 'fit';
    this.maxDpr = Math.max(1, Number(maxDpr) || 1);
    this.maxBackingScale = Math.max(1, Number(maxBackingScale) || 1);
  }

  resize(width, height) {
    const host = this.canvas.parentElement;
    const availableWidth = Math.max(1, Math.floor(width || host?.clientWidth || window.innerWidth || this.logicalWidth));
    const availableHeight = Math.max(1, Math.floor(height || host?.clientHeight || window.innerHeight || this.logicalHeight));
    let cssWidth = availableWidth;
    let cssHeight = availableHeight;
    if (this.scaleMode === 'fit') {
      const scale = Math.min(availableWidth / this.logicalWidth, availableHeight / this.logicalHeight);
      cssWidth = Math.max(1, Math.floor(this.logicalWidth * scale));
      cssHeight = Math.max(1, Math.floor(this.logicalHeight * scale));
    }
    const dpr = Math.min(this.maxDpr, Math.max(1, Number(window.devicePixelRatio) || 1));
    const maxBackingWidth = Math.round(this.logicalWidth * this.maxBackingScale);
    const maxBackingHeight = Math.round(this.logicalHeight * this.maxBackingScale);
    const backingWidth = Math.max(this.logicalWidth, Math.min(maxBackingWidth, Math.round(cssWidth * dpr)));
    const backingHeight = Math.max(this.logicalHeight, Math.min(maxBackingHeight, Math.round(cssHeight * dpr)));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
    this.canvas.logicalWidth = this.logicalWidth;
    this.canvas.logicalHeight = this.logicalHeight;
    return { cssWidth, cssHeight, backingWidth, backingHeight, dpr };
  }

  beginFrame(ctx, clearColor = null) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (clearColor) { ctx.fillStyle = clearColor; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    else ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.canvas.width / this.logicalWidth, 0, 0, this.canvas.height / this.logicalHeight, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  }
}

export default CanvasDisplayScaler;