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
 * Component.js
 * 组件基类 - ECS架构的基础接口
 */

/**
 * 组件基类
 * 所有组件都应该继承此类
 */
export class Component {
  constructor(type) {
    this.type = type;
    this.enabled = true;
  }

  /**
   * 组件初始化
   * @param {Entity} entity - 所属实体
   */
  init(entity) {
    this.entity = entity;
  }

  /**
   * 组件更新
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    // 子类实现
  }

  /**
   * 组件销毁
   */
  destroy() {
    this.entity = null;
  }
}
