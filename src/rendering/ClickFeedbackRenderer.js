/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 ************************************************************/

/**
 * ClickFeedbackRenderer - 点击反馈光圈（框架级）
 *
 * 右键移动指令的视觉确认：落点处冒出 2.5D 绿色椭圆光圈，先快速放大再缓慢缩小淡出。
 *
 * 两套渲染分开调用，因为坐标系不同：
 *   renderWorldRings   世界坐标系（相机变换生效时）—— 落点光圈，正式功能，始终显示
 *   renderScreenMarkers 屏幕坐标系（相机变换之后）—— 鼠标十字，仅 debugMode
 *
 * 光圈数据由调用方持有（一个数组），本类只负责推进生命周期与绘制，
 * 便于场景自行决定何时清空（如切场景）。
 */

/** 光圈存活时长（毫秒） */
const RING_DURATION = 800;
/** 放大阶段占比：前 30% 放大，后 70% 缩小 */
const GROW_PHASE = 0.3;
/** 光圈基准半径 */
const BASE_RADIUS = 25;

export class ClickFeedbackRenderer {
  /**
   * 构造一条光圈记录。
   * @param {Object} params
   * @param {number} params.worldX - 落点世界 X
   * @param {number} params.worldY - 落点世界 Y
   * @param {number} params.screenX - 鼠标屏幕 X（debug 十字用）
   * @param {number} params.screenY - 鼠标屏幕 Y
   * @param {number} [params.playerX] - 玩家世界 X（debug 标记用）
   * @param {number} [params.playerY] - 玩家世界 Y
   * @returns {Object} 光圈记录
   */
  static createRing({ worldX, worldY, screenX, screenY, playerX = 0, playerY = 0 }) {
    return {
      x: worldX,
      y: worldY,
      screenX,
      screenY,
      playerX,
      playerY,
      startTime: performance.now(),
      duration: RING_DURATION
    };
  }

  /**
   * 剔除已过期的光圈。
   * @param {Array} rings
   * @returns {Array} 仍存活的光圈（新数组）
   */
  static prune(rings) {
    if (!rings || rings.length === 0) return rings || [];
    const now = performance.now();
    return rings.filter(r => now - r.startTime < r.duration);
  }

  /**
   * 在世界坐标系渲染光圈（正式功能，不受 debugMode 影响）。
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} rings
   * @param {boolean} [debugMode=false] - true 时附加坐标标签与玩家位置方块
   */
  static renderWorldRings(ctx, rings, debugMode = false) {
    if (!rings || rings.length === 0) return;
    const now = performance.now();

    for (const ring of rings) {
      const progress = (now - ring.startTime) / ring.duration;
      if (progress >= 1) continue;

      // 后半段淡出
      const alpha = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;

      // 前段 easeOut 放大，后段线性缩小
      let sizeFactor;
      if (progress < GROW_PHASE) {
        const t = progress / GROW_PHASE;
        sizeFactor = 1 - Math.pow(1 - t, 3);
      } else {
        const t = (progress - GROW_PHASE) / (1 - GROW_PHASE);
        sizeFactor = 1 - t * 0.7;
      }

      const radiusX = BASE_RADIUS * sizeFactor;
      const radiusY = radiusX * 0.5; // 2.5D 压扁
      if (radiusX < 2) continue;

      ctx.save();
      // 外圈
      ctx.strokeStyle = `rgba(0, 255, 128, ${alpha * 0.9})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 内圈
      const innerRX = radiusX * 0.5;
      if (innerRX > 2) {
        ctx.strokeStyle = `rgba(200, 255, 200, ${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(ring.x, ring.y, innerRX, innerRX * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      if (debugMode) this._renderWorldDebug(ctx, ring, alpha);
    }
  }

  /** @private debug：落点坐标标签 + 玩家位置方块 */
  static _renderWorldDebug(ctx, ring, alpha) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 255, 128, ${alpha})`;
    ctx.font = '12px Arial';
    ctx.fillText(`目标(${ring.x.toFixed(0)},${ring.y.toFixed(0)})`, ring.x + 15, ring.y - 5);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = `rgba(50, 150, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(ring.playerX - 8, ring.playerY - 8, 16, 16);
    ctx.fillStyle = `rgba(50, 150, 255, ${alpha})`;
    ctx.font = '12px Arial';
    ctx.fillText(
      `玩家(${ring.playerX.toFixed(0)},${ring.playerY.toFixed(0)})`,
      ring.playerX + 15, ring.playerY - 10
    );
    ctx.restore();
  }

  /**
   * 在屏幕坐标系渲染鼠标十字标记（仅 debug 用）。
   * 与世界光圈分开，是因为它要显示的是「鼠标实际点在屏幕哪」，
   * 用于排查坐标变换（页面旋转/缩放）是否正确。
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} rings
   */
  static renderScreenMarkers(ctx, rings) {
    if (!rings || rings.length === 0) return;
    const now = performance.now();

    for (const ring of rings) {
      const progress = (now - ring.startTime) / ring.duration;
      if (progress >= 1) continue;
      const alpha = 1 - progress;
      const sx = ring.screenX;
      const sy = ring.screenY;

      ctx.save();
      ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx - 15, sy);
      ctx.lineTo(sx + 15, sy);
      ctx.moveTo(sx, sy - 15);
      ctx.lineTo(sx, sy + 15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
      ctx.font = 'bold 12px Arial';
      ctx.fillText(`鼠标(${sx.toFixed(0)},${sy.toFixed(0)})`, sx + 15, sy - 10);
      ctx.restore();
    }
  }
}

export default ClickFeedbackRenderer;
