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
 * MovementSystem.js
 * 移动系统 - 处理实体的移动逻辑
 */

/**
 * 移动系统
 * 处理键盘移动、点击移动、碰撞检测和相机跟随
 */
export class MovementSystem {
  /**
   * @param {Object} config - 配置
   * @param {InputManager} config.inputManager - 输入管理器
   * @param {Camera} config.camera - 相机
   * @param {Object} config.mapBounds - 地图边界 {minX, minY, maxX, maxY}
   * @param {StatusEffectSystem} config.statusEffectSystem - 状态效果系统（可选）
   */
  constructor(config = {}) {
    this.inputManager = config.inputManager;
    this.camera = config.camera;
    this.statusEffectSystem = config.statusEffectSystem;
    this.jumpSystem = config.jumpSystem || null;
    this.isMovementLocked = typeof config.isMovementLocked === 'function'
      ? config.isMovementLocked
      : entity => this.jumpSystem?.isJumping?.(entity) === true;
    this.moveIntentRouter = typeof config.moveIntentRouter === 'function'
      ? config.moveIntentRouter
      : null;
    
    // 地图边界（默认无限大）
    this.mapBounds = config.mapBounds || {
      minX: -Infinity,
      minY: -Infinity,
      maxX: Infinity,
      maxY: Infinity
    };
    
    // 碰撞层数据（2D数组，true表示有障碍物）
    this.collisionMap = config.collisionMap || null;
    this.tileSize = config.tileSize || 32;

    // 多楼层支持
    /** @type {Map<string, any>} */
    this.floors = new Map();
    this.defaultFloorId = 'ground';
    this.interactKey = config.interactKey || 'e';
    
    // 玩家实体引用（用于相机跟随）
    this.playerEntity = null;
    
    console.log('MovementSystem: Initialized');
  }

  /**
   * 设置玩家实体
   * @param {Entity} entity - 玩家实体
   */
  setPlayerEntity(entity) {
    this.playerEntity = entity;
    
    // 设置相机跟随目标
    if (this.camera && entity) {
      const transform = entity.getComponent('transform');
      if (transform) {
        this.camera.setTarget(transform);
      }
    }
  }

  /**
   * 注入设备无关的移动 intent 路由。驾驶席可将同一输入转发到载具。
   * @param {Function|null} router
   */
  setMoveIntentRouter(router) {
    this.moveIntentRouter = typeof router === 'function' ? router : null;
  }

  _resolveMoveTarget(playerEntity, intent) {
    let route = null;
    try { route = this.moveIntentRouter?.(playerEntity, intent) || null; }
    catch (error) { console.warn('MovementSystem: move intent router failed', error); }
    const entity = route?.target === 'vehicle' && route.vehicle ? route.vehicle : playerEntity;
    return {
      entity,
      movement: entity?.getComponent?.('movement') || null,
      sprite: entity?.getComponent?.('sprite') || null,
      routedToVehicle: entity !== playerEntity
    };
  }

  /**
   * 设置碰撞地图
   * @param {Array<Array<boolean>>} collisionMap - 碰撞地图
   * @param {number} tileSize - 瓦片大小
   */
  setCollisionMap(collisionMap, tileSize = 32) {
    this.collisionMap = collisionMap;
    this.tileSize = tileSize;
  }

  /**
   * 导入地图数据（包含楼层信息）
   * @param {Object} mapData - 由 MockDataService 返回的地图，带 floors
   */
  setMapData(mapData) {
    this.floors.clear();
    if (!mapData || !Array.isArray(mapData.floors)) return;
    for (const f of mapData.floors) {
      this.floors.set(f.id, f);
    }
    this.defaultFloorId = mapData.defaultFloor || 'ground';
    this.tileSize = mapData.tileSize ?? this.tileSize;
    // 默认楼层的 collision 作为兜底
    const ground = this.floors.get(this.defaultFloorId);
    if (ground && ground.collision) {
      this.collisionMap = ground.collision;
      this.tileSize = ground.tileSize ?? this.tileSize;
    }
  }

  /**
   * 传送实体到指定楼层
   * @param {Entity} entity
   * @param {string} toFloor
   * @param {number} toX
   * @param {number} toZ
   */
  teleport(entity, toFloor, toX, toZ) {
    const transform = entity?.getComponent?.('transform');
    const floor = this.floors.get(toFloor);
    if (!transform || !floor) return false;
    transform.floorId = toFloor;
    transform.setPosition(toX, toZ, floor.elevation ?? 0);
    const layer = entity.getComponent?.('layer');
    if (layer) layer.floorId = toFloor;
    try {
      if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('floorChanged', {
          detail: { entityId: entity.id, floorId: toFloor }
        }));
      }
    } catch (_) { /* noop */ }
    return true;
  }

  /**
   * portal 命中检查（仅对玩家运行）
   * @private
   */
  _checkPortals(entity) {
    if (!entity) return;
    const transform = entity.getComponent?.('transform');
    if (!transform) return;
    const floor = this.floors.get(transform.floorId) || this.floors.get(this.defaultFloorId);
    if (!floor || !Array.isArray(floor.portals) || floor.portals.length === 0) return;

    const px = transform.position.x;
    const pz = transform.position.z ?? transform.position.y;

    for (const portal of floor.portals) {
      const dx = (portal.x ?? 0) - px;
      const dz = (portal.z ?? 0) - pz;
      const r = portal.radius ?? 32;
      if (dx * dx + dz * dz > r * r) continue;

      if (portal.trigger === 'interact') {
        if (this.inputManager && typeof this.inputManager.isKeyPressed === 'function' &&
            this.inputManager.isKeyPressed(this.interactKey)) {
          this.teleport(entity, portal.toFloor, portal.toX, portal.toZ);
          return;
        }
      } else {
        // 默认 touch
        this.teleport(entity, portal.toFloor, portal.toX, portal.toZ);
        return;
      }
    }
  }

  /**
   * 更新系统
   * @param {number} deltaTime - 帧间隔时间（秒）
   * @param {Array<Entity>} entities - 实体列表
   */
  update(deltaTime, entities) {
    // 更新输入管理器的相机位置（用于坐标转换）
    // 注意：camera.update() 由外部（BaseGameScene）调用并做后处理（如 clamp），
    // 这里只负责同步相机位置到 InputManager
    if (this.camera && this.inputManager) {
      const viewBounds = this.camera.getViewBounds();
      this.inputManager.setCameraPosition(viewBounds.left, viewBounds.top);
    }
    
    // 处理键盘移动输入
    this.handleKeyboardInput(entities);
    
    // 处理点击移动
    this.handleClickMovement(entities);
    
    // 更新所有实体的移动
    for (const entity of entities) {
      this.updateEntityMovement(entity, deltaTime);
    }

    // 楼层 portal 检测（只对玩家生效）
    const player = this.playerEntity || entities.find(e => e.type === 'player');
    if (player) this._checkPortals(player);
  }

  /**
   * 处理键盘输入
   * @param {Array<Entity>} entities - 实体列表
   */
  handleKeyboardInput(entities) {
    if (!this.inputManager) return;

    const playerEntity = this.playerEntity || entities.find(e => e.type === 'player');
    if (!playerEntity) return;

    // 方向输入统一来自 InputManager；触屏虚拟摇杆和手柄均在采集层映射到这里。
    let vx = 0;
    let vy = 0;
    let magnitude = 0;
    if (typeof this.inputManager.getMoveAxis === 'function') {
      const axis = this.inputManager.getMoveAxis();
      vx = Number(axis?.x) || 0;
      vy = Number(axis?.y) || 0;
      magnitude = Math.max(0, Number(axis?.magnitude) || 0);
    } else {
      if (this.inputManager.isKeyDown('up')) vy -= 1;
      if (this.inputManager.isKeyDown('down')) vy += 1;
      if (this.inputManager.isKeyDown('left')) vx -= 1;
      if (this.inputManager.isKeyDown('right')) vx += 1;
      if (vx !== 0 || vy !== 0) {
        const len = Math.hypot(vx, vy);
        vx /= len;
        vy /= len;
        magnitude = 1;
      }
    }

    const target = this._resolveMoveTarget(playerEntity, {
      type: 'move', source: 'axis', direction: { x: vx, y: vy }, magnitude
    });
    const { entity, movement, sprite, routedToVehicle } = target;
    if (!movement || movement.enabled === false
      || (!routedToVehicle && this.isMovementLocked(playerEntity))) return;

    if (magnitude > 0) {
      let speed = movement.speed;
      if (!routedToVehicle && this.statusEffectSystem) {
        speed = this.statusEffectSystem.getModifiedStats(playerEntity).speed;
      }
      movement.startKeyboardMovement(vx * speed * magnitude, vy * speed * magnitude);
      if (sprite && sprite.currentAnimation !== 'walk') sprite.playAnimation('walk');
      return;
    }

    if (movement.movementType === 'keyboard') {
      movement.stop();
      if (sprite?.useAnimatedSprite) sprite.setWalking(false);
      if (sprite && sprite.currentAnimation !== 'idle') sprite.playAnimation('idle');
    }
  }

  /**
   * 处理点击移动
   * @param {Array<Entity>} entities - 实体列表
   */
  handleClickMovement(entities) {
    if (!this.inputManager) return;
    if (!this.inputManager.isMouseClicked()
      || this.inputManager.getMouseButton() !== 2
      || this.inputManager.isMouseClickHandled()) return;

    const playerEntity = this.playerEntity || entities.find(e => e.type === 'player');
    if (!playerEntity) return;
    const target = this._resolveMoveTarget(playerEntity, { type: 'move', source: 'pointer' });
    const { movement, sprite, routedToVehicle } = target;
    if (!movement || movement.enabled === false
      || (!routedToVehicle && this.isMovementLocked(playerEntity))) return;
    if (movement.movementType === 'keyboard') return;

    const mouseScreen = this.inputManager.getMousePosition();
    const clickPos = this.camera
      ? this.camera.screenToWorld(mouseScreen.x, mouseScreen.y)
      : this.inputManager.getMouseWorldPosition();
    if (this.findEnemyAtPosition(clickPos, entities)) return;

    movement.setPath([clickPos]);
    if (sprite && sprite.currentAnimation !== 'walk') sprite.playAnimation('walk');
    this.inputManager.markMouseClickHandled();
  }
  
  /**
   * 查找指定位置的敌人
   * @param {Object} position - 位置 {x, y}
   * @param {Array<Entity>} entities - 实体列表
   * @returns {Entity|null}
   */
  findEnemyAtPosition(position, entities) {
    const clickRadius = 30;
    const clickRadiusSquared = clickRadius * clickRadius;
    for (let index = 0, length = entities?.length || 0; index < length; index++) {
      const enemy = entities[index];
      if (enemy?.type !== 'enemy' || enemy.isDead) continue;
      const transform = enemy.getComponent('transform');
      if (!transform) continue;

      const dx = transform.position.x - position.x;
      const dy = transform.position.y - position.y;
      if (dx * dx + dy * dy <= clickRadiusSquared) return enemy;
    }
    return null;
  }

  /**
   * 更新实体移动
   * @param {Entity} entity - 实体
   * @param {number} deltaTime - 帧间隔时间（秒）
   */
  updateEntityMovement(entity, deltaTime) {
    const transform = entity.getComponent('transform');
    const movement = entity.getComponent('movement');
    const sprite = entity.getComponent('sprite');
    
    if (!transform || !movement) return;
    
    // 远程玩家的移动由网络同步控制，不走本地 MovementSystem
    if (entity.isRemote) return;

    // 位移能力期间坐标由对应执行器推进，避免普通移动重复叠加。
    if (this.isMovementLocked(entity)) {
      movement.velocity.x = 0;
      movement.velocity.y = 0;
      movement.clearPath?.();
      if (sprite?.useAnimatedSprite) sprite.setWalking(false);
      return;
    }
    
    // 如果实体被武器钉住，不能移动
    if (entity.pinnedByWeapon) {
      movement.velocity.x = 0;
      movement.velocity.y = 0;
      movement.clearPath();
      if (sprite && sprite.useAnimatedSprite) {
        sprite.setWalking(false);
      }
      if (sprite && sprite.currentAnimation !== 'idle') {
        sprite.playAnimation('idle');
      }
      return;
    }
    
    // 如果实体正在移动
    if (movement.isCurrentlyMoving()) {
      // 获取修改后的移动速度（考虑状态效果）
      let currentSpeed = movement.speed;
      if (this.statusEffectSystem) {
        const modifiedStats = this.statusEffectSystem.getModifiedStats(entity);
        currentSpeed = modifiedStats.speed;
      }

      // 路径移动模式
      if (movement.movementType === 'path' && movement.targetPosition) {
        // 检查是否到达目标点
        if (movement.hasReachedTarget(transform.position)) {
          // 移动到下一个路径点
          const hasMore = movement.moveToNextPathPoint();
          if (!hasMore) {
            // 路径结束，切换到待机动画
            if (sprite && sprite.useAnimatedSprite) {
              sprite.setWalking(false);
            }
            if (sprite && sprite.currentAnimation !== 'idle') {
              sprite.playAnimation('idle');
            }
            return;
          }
        }
        
        // 计算朝向目标的速度（使用修改后的速度）
        movement.calculateVelocityToTarget(transform.position, currentSpeed);
      }
      
      // 计算新位置
      const newX = transform.position.x + movement.velocity.x * deltaTime;
      const newY = transform.position.y + movement.velocity.y * deltaTime;
      
      // 更新精灵方向（如果使用方向精灵或动画精灵）
      if (sprite && (sprite.useDirectionalSprite || sprite.useAnimatedSprite)) {
        sprite.setDirectionFromVelocity(movement.velocity.x, movement.velocity.y);
      }
      
      // 碰撞检测
      const canMove = this.canMoveTo(newX, newY, entity);
      
      if (canMove) {
        transform.setPosition(newX, newY);
      } else {
        // 碰撞，停止移动
        if (movement.movementType === 'path') {
          movement.clearPath();
          if (sprite && sprite.useAnimatedSprite) {
            sprite.setWalking(false);
          }
          if (sprite && sprite.currentAnimation !== 'idle') {
            sprite.playAnimation('idle');
          }
        }
      }
    }
  }

  /**
   * 检查是否可以移动到指定位置
   * @param {number} x - 目标X坐标
   * @param {number} y - 目标Y坐标
   * @param {Entity} entity - 实体
   * @returns {boolean}
   */
  canMoveTo(x, y, entity) {
    // 检查地图边界
    if (!this.isWithinMapBounds(x, y)) {
      return false;
    }
    
    // 楼层碰撞地图优先（若有）
    const floorId = entity?.getComponent?.('transform')?.floorId;
    const floor = this.floors.get(floorId);
    if (floor && floor.collision) {
      if (this._checkCollisionArray(floor.collision, floor.tileSize ?? this.tileSize, x, y)) {
        return false;
      }
      return true;
    }

    // 兼容：旧的单层 collisionMap
    if (this.collisionMap && this.checkCollisionMap(x, y)) {
      return false;
    }
    
    return true;
  }

  /**
   * 通用的 collision 数组查询
   * @private
   */
  _checkCollisionArray(collision, tileSize, x, y) {
    if (!collision) return false;
    const tileX = Math.floor(x / tileSize);
    const tileY = Math.floor(y / tileSize);
    if (tileY < 0 || tileY >= collision.length) return true;
    if (tileX < 0 || tileX >= collision[0].length) return true;
    return collision[tileY][tileX] === true;
  }

  /**
   * 检查是否在地图边界内
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @returns {boolean}
   */
  isWithinMapBounds(x, y) {
    return (
      x >= this.mapBounds.minX &&
      x <= this.mapBounds.maxX &&
      y >= this.mapBounds.minY &&
      y <= this.mapBounds.maxY
    );
  }

  /**
   * 检查碰撞地图
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @returns {boolean} true表示有碰撞
   */
  checkCollisionMap(x, y) {
    if (!this.collisionMap) return false;
    
    // 转换为瓦片坐标
    const tileX = Math.floor(x / this.tileSize);
    const tileY = Math.floor(y / this.tileSize);
    
    // 检查是否越界
    if (tileY < 0 || tileY >= this.collisionMap.length) return true;
    if (tileX < 0 || tileX >= this.collisionMap[0].length) return true;
    
    // 检查碰撞
    return this.collisionMap[tileY][tileX] === true;
  }

  /**
   * AABB碰撞检测
   * @param {Object} rect1 - 矩形1 {x, y, width, height}
   * @param {Object} rect2 - 矩形2 {x, y, width, height}
   * @returns {boolean}
   */
  checkAABBCollision(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  /**
   * 设置地图边界
   * @param {number} minX - 最小X坐标
   * @param {number} minY - 最小Y坐标
   * @param {number} maxX - 最大X坐标
   * @param {number} maxY - 最大Y坐标
   */
  setMapBounds(minX, minY, maxX, maxY) {
    this.mapBounds = { minX, minY, maxX, maxY };
    
    // 同时更新相机边界
    if (this.camera) {
      this.camera.setBounds(minX, minY, maxX, maxY);
    }
  }
}
