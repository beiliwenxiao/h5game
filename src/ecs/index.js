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

// 战场组件（P2 / §14）
export { ControllerComponent, ControllerKind } from './components/ControllerComponent.js';
export { BuildingComponent, BuildingType } from './components/BuildingComponent.js';
export { ObjectiveComponent, ObjectiveKind } from './components/ObjectiveComponent.js';
export { VehicleComponent, SeatRole } from './components/VehicleComponent.js';
export { CargoComponent } from './components/CargoComponent.js';
export { RiderComponent } from './components/RiderComponent.js';
export { ResourceNodeComponent } from './components/ResourceNodeComponent.js';
export { DeathDropComponent } from './components/DeathDropComponent.js';
