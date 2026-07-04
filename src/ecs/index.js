/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * index.js
 * ECS模块导出
 */

// 核心
export { Component } from './Component.js';
export { Entity } from './Entity.js';
export { EntityFactory } from './EntityFactory.js';

// 组件
export { TransformComponent } from './components/TransformComponent.js';
export { StatsComponent } from './components/StatsComponent.js';
export { SpriteComponent } from './components/SpriteComponent.js';
export { CombatComponent } from './components/CombatComponent.js';
export { MovementComponent } from './components/MovementComponent.js';
export { LayerComponent, WORLD_LAYERS } from './components/LayerComponent.js';
