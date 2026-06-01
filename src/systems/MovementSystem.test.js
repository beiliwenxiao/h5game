/**
 * MovementSystem.test.js
 * 移动系统单元测试
 */

import { MovementSystem } from './MovementSystem.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../ecs/components/TransformComponent.js';
import { MovementComponent } from '../ecs/components/MovementComponent.js';
import { SpriteComponent } from '../ecs/components/SpriteComponent.js';

/**
 * 模拟输入管理器
 */
class MockInputManager {
  constructor() {
    this.keys = new Map();
    this.mouseClicked = false;
    this.mouseButton = -1;
    this.mouseWorldX = 0;
    this.mouseWorldY = 0;
  }

  isKeyDown(key) {
    return this.keys.get(key) === true;
  }

  isMouseClicked() {
    return this.mouseClicked;
  }

  getMouseButton() {
    return this.mouseButton;
  }

  isMouseClickHandled() {
    return this.mouseHandled === true;
  }

  markMouseClickHandled() {
    this.mouseHandled = true;
    this.mouseClicked = false;
  }

  isMouseButtonDown(button) {
    return this.mouseButton === button;
  }

  getMouseWorldPosition() {
    return { x: this.mouseWorldX, y: this.mouseWorldY };
  }

  // 测试辅助方法
  setKeyDown(key, value) {
    this.keys.set(key, value);
  }

  simulateClick(x, y, button = 2) {
    this.mouseClicked = true;
    this.mouseButton = button;
    this.mouseHandled = false;
    this.mouseWorldX = x;
    this.mouseWorldY = y;
  }

  reset() {
    this.keys.clear();
    this.mouseClicked = false;
    this.mouseButton = -1;
    this.mouseHandled = false;
  }
}

/**
 * 模拟相机
 */
class MockCamera {
  constructor() {
    this.target = null;
    this.updateCalled = false;
  }

  setTarget(target) {
    this.target = target;
  }

  update(deltaTime) {
    this.updateCalled = true;
  }

  setBounds(minX, minY, maxX, maxY) {
    this.bounds = { minX, minY, maxX, maxY };
  }
}

/**
 * 创建测试实体
 */
function createTestEntity(x = 0, y = 0, speed = 100) {
  const entity = new Entity('test-entity', 'player');
  entity.addComponent(new TransformComponent(x, y));
  entity.addComponent(new MovementComponent({ speed }));
  entity.addComponent(new SpriteComponent());
  return entity;
}

// 测试套件
console.log('=== MovementSystem Tests ===\n');

// 测试1: 系统初始化
console.log('Test 1: System initialization');
try {
  const inputManager = new MockInputManager();
  const camera = new MockCamera();
  const system = new MovementSystem({
    inputManager,
    camera,
    mapBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
  });
  
  console.assert(system.inputManager === inputManager, 'InputManager should be set');
  console.assert(system.camera === camera, 'Camera should be set');
  console.assert(system.mapBounds.maxX === 1000, 'Map bounds should be set');
  console.log('✓ System initializes correctly\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试2: 键盘移动 - 向上移动
console.log('Test 2: Keyboard movement - up');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(100, 100, 100);
  
  // 模拟按下向上键
  inputManager.setKeyDown('up', true);
  
  // 更新系统
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]); // ~60 FPS
  
  const movement = entity.getComponent('movement');
  console.assert(movement.isMoving, 'Entity should be moving');
  console.assert(movement.velocity.y < 0, 'Velocity Y should be negative (moving up)');
  console.assert(movement.movementType === 'keyboard', 'Movement type should be keyboard');
  console.log('✓ Keyboard up movement works\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试3: 键盘移动 - 斜向移动归一化
console.log('Test 3: Keyboard movement - diagonal normalization');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(100, 100, 100);
  
  // 模拟按下右和下键（斜向移动）
  inputManager.setKeyDown('right', true);
  inputManager.setKeyDown('down', true);
  
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  const movement = entity.getComponent('movement');
  const speed = Math.sqrt(movement.velocity.x ** 2 + movement.velocity.y ** 2);
  
  // 速度应该接近设定的速度（100），而不是141（未归一化的斜向速度）
  console.assert(Math.abs(speed - 100) < 1, `Speed should be normalized to ~100, got ${speed}`);
  console.log('✓ Diagonal movement is normalized\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试4: 键盘移动停止
console.log('Test 4: Keyboard movement stop');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(100, 100, 100);
  
  // 开始移动
  inputManager.setKeyDown('up', true);
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  let movement = entity.getComponent('movement');
  console.assert(movement.isMoving, 'Entity should be moving');
  
  // 停止移动
  inputManager.setKeyDown('up', false);
  system.update(0.016, [entity]);
  
  movement = entity.getComponent('movement');
  console.assert(!movement.isMoving, 'Entity should stop moving');
  console.assert(movement.velocity.x === 0 && movement.velocity.y === 0, 'Velocity should be zero');
  console.log('✓ Movement stops when keys released\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试5: 点击移动
console.log('Test 5: Click movement');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(100, 100, 100);
  
  // 模拟点击（右键移动）
  inputManager.simulateClick(200, 200, 2);
  
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  const movement = entity.getComponent('movement');
  console.assert(movement.isMoving, 'Entity should be moving');
  console.assert(movement.movementType === 'path', 'Movement type should be path');
  console.assert(movement.targetPosition.x === 200, 'Target X should be 200');
  console.assert(movement.targetPosition.y === 200, 'Target Y should be 200');
  console.log('✓ Click movement works\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试6: 位置更新
console.log('Test 6: Position update');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(100, 100, 100);
  
  // 设置移动
  inputManager.setKeyDown('right', true);
  system.setPlayerEntity(entity);
  
  const transform = entity.getComponent('transform');
  const initialX = transform.position.x;
  
  // 更新多帧
  for (let i = 0; i < 10; i++) {
    system.update(0.016, [entity]);
  }
  
  console.assert(transform.position.x > initialX, 'Position X should increase');
  console.log('✓ Position updates correctly\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试7: 地图边界检测
console.log('Test 7: Map boundary detection');
try {
  const system = new MovementSystem({
    mapBounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 }
  });
  
  console.assert(system.isWithinMapBounds(250, 250), 'Point inside bounds should return true');
  console.assert(!system.isWithinMapBounds(-10, 250), 'Point outside left bound should return false');
  console.assert(!system.isWithinMapBounds(600, 250), 'Point outside right bound should return false');
  console.assert(!system.isWithinMapBounds(250, -10), 'Point outside top bound should return false');
  console.assert(!system.isWithinMapBounds(250, 600), 'Point outside bottom bound should return false');
  console.log('✓ Map boundary detection works\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试8: 碰撞地图检测
console.log('Test 8: Collision map detection');
try {
  const collisionMap = [
    [false, false, false],
    [false, true, false],
    [false, false, false]
  ];
  
  const system = new MovementSystem({
    collisionMap,
    tileSize: 32
  });
  
  console.assert(!system.checkCollisionMap(16, 16), 'Empty tile should return false');
  console.assert(system.checkCollisionMap(48, 48), 'Collision tile should return true');
  console.assert(system.checkCollisionMap(-10, 16), 'Out of bounds should return true');
  console.log('✓ Collision map detection works\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试9: AABB碰撞检测
console.log('Test 9: AABB collision detection');
try {
  const system = new MovementSystem({});
  
  const rect1 = { x: 0, y: 0, width: 50, height: 50 };
  const rect2 = { x: 25, y: 25, width: 50, height: 50 };
  const rect3 = { x: 100, y: 100, width: 50, height: 50 };
  
  console.assert(system.checkAABBCollision(rect1, rect2), 'Overlapping rects should collide');
  console.assert(!system.checkAABBCollision(rect1, rect3), 'Separated rects should not collide');
  console.log('✓ AABB collision detection works\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试10: 相机跟随设置
console.log('Test 10: Camera follow setup');
try {
  const camera = new MockCamera();
  const system = new MovementSystem({ camera });
  const entity = createTestEntity(100, 100);
  
  system.setPlayerEntity(entity);
  
  const transform = entity.getComponent('transform');
  console.assert(camera.target === transform, 'Camera target should be set to entity transform');
  console.log('✓ Camera follow setup works\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试11: 相机更新
console.log('Test 11: Camera update');
try {
  const camera = new MockCamera();
  const system = new MovementSystem({ camera });
  
  system.update(0.016, []);
  
  console.assert(camera.updateCalled, 'Camera update should be called');
  console.log('✓ Camera updates correctly\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试12: 到达目标点停止
console.log('Test 12: Stop at target');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(100, 100, 200);
  
  // 点击附近的位置（距离约10像素）
  inputManager.simulateClick(110, 100, 2);
  
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  // 重置点击状态，避免重复触发
  inputManager.reset();
  
  // 更新多帧直到到达目标
  let maxIterations = 100;
  let iterations = 0;
  const movement = entity.getComponent('movement');
  const transform = entity.getComponent('transform');
  
  while (movement.isMoving && iterations < maxIterations) {
    system.update(0.016, [entity]);
    iterations++;
  }
  
  // 检查是否到达目标附近（允许一定误差）
  const dx = transform.position.x - 110;
  const dy = transform.position.y - 100;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  console.assert(!movement.isMoving, `Entity should stop at target (stopped: ${!movement.isMoving})`);
  console.assert(distance < 10, `Entity should be near target (distance: ${distance.toFixed(2)})`);
  console.log('✓ Entity stops at target\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试13: 点击移动 - 路径跟随
console.log('Test 13: Click movement - path following');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(0, 0, 100);
  
  // 点击远处的位置
  inputManager.simulateClick(300, 400, 2);
  
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  const movement = entity.getComponent('movement');
  const transform = entity.getComponent('transform');
  
  // 检查路径是否设置
  console.assert(movement.path.length > 0, 'Path should be set');
  console.assert(movement.targetPosition !== null, 'Target position should be set');
  
  // 检查速度方向是否朝向目标
  const dx = movement.targetPosition.x - transform.position.x;
  const dy = movement.targetPosition.y - transform.position.y;
  const expectedAngle = Math.atan2(dy, dx);
  const actualAngle = Math.atan2(movement.velocity.y, movement.velocity.x);
  const angleDiff = Math.abs(expectedAngle - actualAngle);
  
  console.assert(angleDiff < 0.01, `Velocity should point toward target (angle diff: ${angleDiff})`);
  console.log('✓ Path following works correctly\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试14: 点击移动 - 键盘中断
console.log('Test 14: Click movement - keyboard interrupt');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(100, 100, 100);
  
  // 开始点击移动
  inputManager.simulateClick(300, 300, 2);
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  let movement = entity.getComponent('movement');
  console.assert(movement.movementType === 'path', 'Should be in path movement mode');
  
  // 重置点击
  inputManager.reset();
  
  // 按下键盘键
  inputManager.setKeyDown('up', true);
  system.update(0.016, [entity]);
  
  movement = entity.getComponent('movement');
  console.assert(movement.movementType === 'keyboard', 'Should switch to keyboard movement');
  console.assert(movement.path.length === 0, 'Path should be cleared');
  console.log('✓ Keyboard interrupts click movement\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试15: 点击移动 - 直线路径
console.log('Test 15: Click movement - straight line path');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const entity = createTestEntity(0, 0, 100);
  
  // 点击位置
  inputManager.simulateClick(100, 0, 2);
  
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  const movement = entity.getComponent('movement');
  
  // 检查路径是简单的直线（只有一个目标点）
  console.assert(movement.path.length === 1, 'Path should have one point for straight line');
  console.assert(movement.path[0].x === 100, 'Target X should be 100');
  console.assert(movement.path[0].y === 0, 'Target Y should be 0');
  console.log('✓ Straight line path works\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试16: 点击移动 - 速度计算
console.log('Test 16: Click movement - velocity calculation');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({ inputManager });
  const speed = 150;
  const entity = createTestEntity(0, 0, speed);
  
  // 点击位置
  inputManager.simulateClick(100, 100, 2);
  
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  const movement = entity.getComponent('movement');
  const actualSpeed = Math.sqrt(movement.velocity.x ** 2 + movement.velocity.y ** 2);
  
  // 速度大小应该等于设定的速度
  console.assert(Math.abs(actualSpeed - speed) < 1, `Speed should be ${speed}, got ${actualSpeed.toFixed(2)}`);
  console.log('✓ Velocity calculation is correct\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试17: 碰撞阻止移动 - 地图边界
console.log('Test 17: Collision prevents movement - map boundary');
try {
  const inputManager = new MockInputManager();
  const system = new MovementSystem({
    inputManager,
    mapBounds: { minX: 0, minY: 0, maxX: 200, maxY: 200 }
  });
  const entity = createTestEntity(190, 100, 100);
  
  // 尝试向右移动（超出边界）
  inputManager.setKeyDown('right', true);
  system.setPlayerEntity(entity);
  
  const transform = entity.getComponent('transform');
  const initialX = transform.position.x;
  
  // 更新多帧
  for (let i = 0; i < 20; i++) {
    system.update(0.016, [entity]);
  }
  
  // 位置应该被限制在边界内
  console.assert(transform.position.x <= 200, `Position should not exceed boundary (x: ${transform.position.x})`);
  console.assert(transform.position.x >= initialX, 'Position should not move backward');
  console.log('✓ Map boundary prevents movement\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试18: 碰撞阻止移动 - 障碍物
console.log('Test 18: Collision prevents movement - obstacles');
try {
  const inputManager = new MockInputManager();
  
  // 创建简单的碰撞地图
  // [0][1][2]
  // [3][X][5]  X = 障碍物
  // [6][7][8]
  const collisionMap = [
    [false, false, false],
    [false, true, false],
    [false, false, false]
  ];
  
  const system = new MovementSystem({
    inputManager,
    collisionMap,
    tileSize: 32,
    mapBounds: { minX: 0, minY: 0, maxX: 96, maxY: 96 }
  });
  
  // 将实体放在障碍物左侧
  const entity = createTestEntity(16, 48, 100);
  
  // 尝试向右移动（进入障碍物）
  inputManager.setKeyDown('right', true);
  system.setPlayerEntity(entity);
  
  const transform = entity.getComponent('transform');
  const initialX = transform.position.x;
  
  // 更新多帧
  for (let i = 0; i < 30; i++) {
    system.update(0.016, [entity]);
  }
  
  // 位置应该被阻止在障碍物前
  console.assert(transform.position.x < 32, `Position should be blocked by obstacle (x: ${transform.position.x})`);
  console.log('✓ Obstacle prevents movement\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试19: 点击移动遇到障碍物停止
console.log('Test 19: Click movement stops at obstacle');
try {
  const inputManager = new MockInputManager();
  
  // 创建碰撞地图，中间有障碍物
  const collisionMap = [
    [false, false, false, false, false],
    [false, false, true, false, false],
    [false, false, false, false, false]
  ];
  
  const system = new MovementSystem({
    inputManager,
    collisionMap,
    tileSize: 32,
    mapBounds: { minX: 0, minY: 0, maxX: 160, maxY: 96 }
  });
  
  // 实体在左侧
  const entity = createTestEntity(16, 48, 100);
  
  // 点击障碍物右侧
  inputManager.simulateClick(112, 48, 2);
  
  system.setPlayerEntity(entity);
  system.update(0.016, [entity]);
  
  // 重置点击
  inputManager.reset();
  
  // 更新多帧
  let maxIterations = 100;
  let iterations = 0;
  const movement = entity.getComponent('movement');
  const transform = entity.getComponent('transform');
  
  while (movement.isMoving && iterations < maxIterations) {
    system.update(0.016, [entity]);
    iterations++;
  }
  
  // 实体应该在障碍物前停止
  console.assert(!movement.isMoving, 'Entity should stop when hitting obstacle');
  console.assert(transform.position.x < 64, `Entity should be blocked before obstacle (x: ${transform.position.x})`);
  console.log('✓ Click movement stops at obstacle\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试20: AABB碰撞 - 边缘情况
console.log('Test 20: AABB collision - edge cases');
try {
  const system = new MovementSystem({});
  
  // 测试边缘接触（不应该碰撞）
  const rect1 = { x: 0, y: 0, width: 50, height: 50 };
  const rect2 = { x: 50, y: 0, width: 50, height: 50 };
  
  console.assert(!system.checkAABBCollision(rect1, rect2), 'Edge touching should not collide');
  
  // 测试一个像素重叠（应该碰撞）
  const rect3 = { x: 49, y: 0, width: 50, height: 50 };
  console.assert(system.checkAABBCollision(rect1, rect3), 'One pixel overlap should collide');
  
  // 测试完全包含（应该碰撞）
  const rect4 = { x: 10, y: 10, width: 20, height: 20 };
  console.assert(system.checkAABBCollision(rect1, rect4), 'Contained rect should collide');
  
  console.log('✓ AABB edge cases work correctly\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试21: 碰撞地图 - 边界检测
console.log('Test 21: Collision map - boundary detection');
try {
  const collisionMap = [
    [true, true, true],
    [true, false, true],
    [true, true, true]
  ];
  
  const system = new MovementSystem({
    collisionMap,
    tileSize: 32
  });
  
  // 测试边界瓦片
  console.assert(system.checkCollisionMap(16, 16), 'Top-left corner should be blocked');
  console.assert(system.checkCollisionMap(80, 16), 'Top-right corner should be blocked');
  console.assert(system.checkCollisionMap(16, 80), 'Bottom-left corner should be blocked');
  console.assert(system.checkCollisionMap(80, 80), 'Bottom-right corner should be blocked');
  
  // 测试中心（应该可通行）
  console.assert(!system.checkCollisionMap(48, 48), 'Center should be passable');
  
  console.log('✓ Collision map boundary detection works\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

// 测试22: canMoveTo 综合测试
console.log('Test 22: canMoveTo comprehensive test');
try {
  const collisionMap = [
    [false, false, false],
    [false, true, false],
    [false, false, false]
  ];
  
  const system = new MovementSystem({
    collisionMap,
    tileSize: 32,
    mapBounds: { minX: 0, minY: 0, maxX: 96, maxY: 96 }
  });
  
  const entity = createTestEntity(16, 16);
  
  // 测试有效移动
  console.assert(system.canMoveTo(16, 16, entity), 'Current position should be valid');
  console.assert(system.canMoveTo(80, 16, entity), 'Empty tile should be valid');
  
  // 测试障碍物
  console.assert(!system.canMoveTo(48, 48, entity), 'Obstacle tile should be invalid');
  
  // 测试边界外
  console.assert(!system.canMoveTo(-10, 16, entity), 'Outside left boundary should be invalid');
  console.assert(!system.canMoveTo(100, 16, entity), 'Outside right boundary should be invalid');
  console.assert(!system.canMoveTo(16, -10, entity), 'Outside top boundary should be invalid');
  console.assert(!system.canMoveTo(16, 100, entity), 'Outside bottom boundary should be invalid');
  
  console.log('✓ canMoveTo works correctly\n');
} catch (error) {
  console.error('✗ Test failed:', error.message, '\n');
}

console.log('=== All MovementSystem Tests Complete ===');
