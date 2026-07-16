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
 * Entity.js
 * 实体类 - ECS架构的核心，管理组件集合
 */

import { Component } from './Component.js';

/**
 * 实体类
 * 管理组件的容器，通过组件组合实现不同功能
 */
export class Entity {
  /**
   * @param {string} id - 实体唯一标识
   * @param {string} type - 实体类型 ('player' | 'enemy' | 'npc')
   */
  constructor(id, type = 'entity') {
    this.id = id;
    this.type = type;
    this.components = new Map();
    this.active = true;
  }

  /**
   * 添加组件
   * @param {Component} component - 要添加的组件
   * @returns {Entity} 返回自身，支持链式调用
   */
  addComponent(component) {
    if (!(component instanceof Component)) {
      throw new Error('Component must be an instance of Component class');
    }
    
    this.components.set(component.type, component);
    component.init(this);
    return this;
  }

  /**
   * 获取组件
   * @param {string} type - 组件类型
   * @returns {Component|null} 组件实例或null
   */
  getComponent(type) {
    return this.components.get(type) || null;
  }

  /**
   * 检查是否有指定组件
   * @param {string} type - 组件类型
   * @returns {boolean}
   */
  hasComponent(type) {
    return this.components.has(type);
  }

  /**
   * 移除组件
   * @param {string} type - 组件类型
   * @returns {boolean} 是否成功移除
   */
  removeComponent(type) {
    const component = this.components.get(type);
    if (component) {
      component.destroy();
      return this.components.delete(type);
    }
    return false;
  }

  /**
   * 更新实体（更新所有组件）
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    if (!this.active) return;
    
    for (const component of this.components.values()) {
      if (component.enabled) {
        component.update(deltaTime);
      }
    }
  }

  /**
   * 销毁实体
   */
  destroy() {
    for (const component of this.components.values()) {
      component.destroy();
    }
    this.components.clear();
    this.active = false;
  }
}
