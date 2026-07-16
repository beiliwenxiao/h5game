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
 * ObjectPool - 通用对象池
 * 用于复用频繁创建和销毁的对象，减少垃圾回收压力
 */
export class ObjectPool {
  /**
   * @param {Function} factory - 创建对象的工厂函数
   * @param {Function} reset - 重置对象的函数
   * @param {number} [initialSize=50] - 初始池大小
   * @param {number} [maxSize=500] - 最大池大小
   */
  constructor(factory, reset, initialSize = 50, maxSize = 500) {
    this.factory = factory;
    this.reset = reset;
    this.initialSize = initialSize;
    this.maxSize = maxSize;
    
    this.pool = [];
    this.activeObjects = new Set();
    
    // 预创建对象
    this.initialize();
  }

  /**
   * 初始化对象池
   */
  initialize() {
    for (let i = 0; i < this.initialSize; i++) {
      const obj = this.factory();
      obj.active = false;
      this.pool.push(obj);
    }
  }

  /**
   * 从池中获取对象
   * @returns {Object} 对象实例
   */
  acquire() {
    let obj;
    
    // 从池中获取
    if (this.pool.length > 0) {
      obj = this.pool.pop();
    } else {
      // 池为空，创建新对象
      obj = this.factory();
    }
    
    obj.active = true;
    this.activeObjects.add(obj);
    
    return obj;
  }

  /**
   * 归还对象到池中
   * @param {Object} obj - 要归还的对象
   */
  release(obj) {
    if (!this.activeObjects.has(obj)) {
      return; // 对象不在活跃列表中
    }
    
    // 重置对象状态
    this.reset(obj);
    obj.active = false;
    
    // 归还到池中（如果未超过最大大小）
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
    
    this.activeObjects.delete(obj);
  }

  /**
   * 释放所有活跃对象
   */
  releaseAll() {
    for (const obj of this.activeObjects) {
      this.reset(obj);
      obj.active = false;
      
      if (this.pool.length < this.maxSize) {
        this.pool.push(obj);
      }
    }
    
    this.activeObjects.clear();
  }

  /**
   * 清空对象池
   */
  clear() {
    this.pool = [];
    this.activeObjects.clear();
  }

  /**
   * 获取池中对象数量
   * @returns {number}
   */
  getPoolSize() {
    return this.pool.length;
  }

  /**
   * 获取活跃对象数量
   * @returns {number}
   */
  getActiveCount() {
    return this.activeObjects.size;
  }

  /**
   * 获取总对象数量
   * @returns {number}
   */
  getTotalCount() {
    return this.pool.length + this.activeObjects.size;
  }
}
