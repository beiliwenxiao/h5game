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
