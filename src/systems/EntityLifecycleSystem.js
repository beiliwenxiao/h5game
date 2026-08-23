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
 * EntityLifecycleSystem - 实体生命周期管理系统
 * 
 * 负责自动清理死亡实体，支持：
 * - 死亡实体检测与移除
 * - 死亡前回调（处理场景特定逻辑）
 * - 多列表同步清理
 */
export class EntityLifecycleSystem {
  constructor() {
    /** @type {Function|null} 死亡实体移除前的回调 (entity) => void */
    this.onBeforeRemove = null;
    
    /** @type {Array<Array>} 需要同步清理的额外实体列表 */
    this.trackedLists = [];
    
    /** @type {Set<Object>} 受保护的实体（不会被自动移除，如玩家） */
    this.protectedEntities = new Set();
  }

  /**
   * 设置受保护的实体
   * @param {Object} entity - 不会被自动移除的实体
   */
  protect(entity) {
    this.protectedEntities.add(entity);
  }

  /**
   * 取消实体保护
   * @param {Object} entity
   */
  unprotect(entity) {
    this.protectedEntities.delete(entity);
  }

  /**
   * 注册需要同步清理的额外列表
   * @param {Array} list - 实体列表引用
   */
  trackList(list) {
    if (!this.trackedLists.includes(list)) {
      this.trackedLists.push(list);
    }
  }

  /**
   * 取消跟踪列表
   * @param {Array} list
   */
  untrackList(list) {
    const idx = this.trackedLists.indexOf(list);
    if (idx > -1) {
      this.trackedLists.splice(idx, 1);
    }
  }

  /**
   * 设置移除前回调
   * @param {Function} callback - (entity) => void
   */
  setOnBeforeRemove(callback) {
    this.onBeforeRemove = callback;
  }

  /**
   * 收集死亡实体并执行移除前回调，不修改任何实体列表。
   * @param {Array} entities - 只读主实体列表
   * @returns {Array} 待移除的实体列表
   */
  collectDeadEntities(entities = []) {
    const deadEntities = [];
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      if (!entity?.isDead || entity.isCorpse === true || this.protectedEntities.has(entity)) continue;
      deadEntities.push(entity);
      this.onBeforeRemove?.(entity);
    }
    return deadEntities;
  }

  /**
   * 兼容旧调用方：从主列表和所有跟踪列表中移除死亡实体。
   * 新场景应调用 collectDeadEntities()，再由实体存储统一提交删除。
   * @param {Array} entities - 主实体列表（会被修改）
   * @returns {Array} 被移除的实体列表
   */
  removeDeadEntities(entities) {
    const deadEntities = this.collectDeadEntities(entities);
    if (deadEntities.length === 0) return deadEntities;

    const deadSet = new Set(deadEntities);
    for (const list of [entities, ...this.trackedLists]) {
      if (!Array.isArray(list)) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        if (deadSet.has(list[i])) list.splice(i, 1);
      }
    }
    return deadEntities;
  }

  /**
   * 清理系统状态
   */
  cleanup() {
    this.onBeforeRemove = null;
    this.trackedLists = [];
    this.protectedEntities.clear();
  }
}
