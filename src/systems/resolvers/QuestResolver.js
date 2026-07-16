/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * QuestResolver.js
 * 任务结算纯函数（§13 约定4/5）—— 任务进度/完成判定集中、数据化、可复现。
 *
 * authority: 'server'
 *
 * 纯函数：对“任务状态数据”（objectives 数组）做进度推进 + 完成判定，
 * 不改渲染/系统内部对象，返回新的进度快照 + events。调用方（QuestSystem）据此写回。
 *
 * objective 数据：{ id, type, targetId(null=通配), requiredCount, currentCount, optional? }
 */

export const QuestResolver = {
  /**
   * 推进匹配的目标进度（不修改传入对象，返回新的 objectives + 是否有变化 + 是否完成）
   * @param {Array<Object>} objectives - 任务目标数组（快照）
   * @param {Object} event - { type, targetId, amount=1 }
   * @returns {{ objectives:Array, changed:boolean, completed:boolean, events:Array }}
   */
  applyEvent(objectives, event) {
    const events = [];
    if (!Array.isArray(objectives) || !event) {
      return { objectives: objectives || [], changed: false, completed: this.isComplete(objectives), events };
    }
    let changed = false;
    const next = objectives.map(obj => {
      const match = obj.type === event.type &&
        (obj.targetId == null || obj.targetId === event.targetId);
      if (!match) return { ...obj };
      const required = obj.requiredCount != null ? obj.requiredCount : 1;
      const cur = obj.currentCount || 0;
      if (cur >= required) return { ...obj };
      const updated = Math.min(required, cur + (event.amount != null ? event.amount : 1));
      changed = true;
      const done = updated >= required;
      events.push({ type: 'objectiveProgress', objectiveId: obj.id, current: updated, required, done });
      return { ...obj, currentCount: updated };
    });
    const completed = this.isComplete(next);
    if (completed) events.push({ type: 'questComplete' });
    return { objectives: next, changed, completed, events };
  },

  /**
   * 判定任务是否完成（所有非可选目标达标）
   * @param {Array<Object>} objectives
   * @returns {boolean}
   */
  isComplete(objectives) {
    if (!Array.isArray(objectives) || objectives.length === 0) return false;
    return objectives
      .filter(o => !o.optional)
      .every(o => (o.currentCount || 0) >= (o.requiredCount != null ? o.requiredCount : 1));
  },

  /**
   * 完成百分比（0~100），非可选目标平均
   * @param {Array<Object>} objectives
   * @returns {number}
   */
  progressPercent(objectives) {
    if (!Array.isArray(objectives)) return 0;
    const req = objectives.filter(o => !o.optional);
    if (req.length === 0) return 100;
    const sum = req.reduce((acc, o) => {
      const required = o.requiredCount != null ? o.requiredCount : 1;
      return acc + Math.min(100, ((o.currentCount || 0) / required) * 100);
    }, 0);
    return sum / req.length;
  }
};

export default QuestResolver;
