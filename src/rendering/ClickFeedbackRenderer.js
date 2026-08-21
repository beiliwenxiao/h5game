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
   * @returns {Object} 光圈记录
   */
  static createRing({ worldX, worldY }) {
    return {
      x: worldX,
      y: worldY,
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
   * 在世界坐标系渲染正式反馈光圈。
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} rings
   */
  static renderWorldRings(ctx, rings) {
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
    }
  }
}

export default ClickFeedbackRenderer;
