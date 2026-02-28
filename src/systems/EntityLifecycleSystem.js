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
   * 从主列表和所有跟踪列表中移除死亡实体
   * @param {Array} entities - 主实体列表（会被修改）
   * @returns {Array} 被移除的实体列表
   */
  removeDeadEntities(entities) {
    const deadEntities = [];
    
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      if (entity.isDead && !this.protectedEntities.has(entity)) {
        deadEntities.push(entity);
        
        // 执行移除前回调
        if (this.onBeforeRemove) {
          this.onBeforeRemove(entity);
        }
        
        // 从主列表移除
        entities.splice(i, 1);
      }
    }
    
    // 从所有跟踪列表中移除
    if (deadEntities.length > 0) {
      for (const list of this.trackedLists) {
        for (const dead of deadEntities) {
          const idx = list.indexOf(dead);
          if (idx > -1) {
            list.splice(idx, 1);
          }
        }
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
