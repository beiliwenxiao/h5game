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
   * 设置碰撞地图
   * @param {Array<Array<boolean>>} collisionMap - 碰撞地图
   * @param {number} tileSize - 瓦片大小
   */
  setCollisionMap(collisionMap, tileSize = 32) {
    this.collisionMap = collisionMap;
    this.tileSize = tileSize;
  }

  /**
   * 更新系统
   * @param {number} deltaTime - 帧间隔时间（秒）
   * @param {Array<Entity>} entities - 实体列表
   */
  update(deltaTime, entities) {
    // 更新相机跟随
    if (this.camera) {
      this.camera.update(deltaTime);
      
      // 更新输入管理器的相机位置（用于坐标转换）
      if (this.inputManager) {
        const viewBounds = this.camera.getViewBounds();
        this.inputManager.setCameraPosition(viewBounds.left, viewBounds.top);
      }
    }
    
    // 处理键盘移动输入
    this.handleKeyboardInput(entities);
    
    // 处理点击移动
    this.handleClickMovement(entities);
    
    // 更新所有实体的移动
    for (const entity of entities) {
      this.updateEntityMovement(entity, deltaTime);
    }
  }

  /**
   * 处理键盘输入
   * @param {Array<Entity>} entities - 实体列表
   */
  handleKeyboardInput(entities) {
    if (!this.inputManager) return;
    
    // 只处理玩家实体的键盘输入
    const playerEntity = this.playerEntity || entities.find(e => e.type === 'player');
    if (!playerEntity) return;
    
    const movement = playerEntity.getComponent('movement');
    const sprite = playerEntity.getComponent('sprite');
    if (!movement) return;
    
    // 检测方向键输入
    let vx = 0;
    let vy = 0;
    
    const upPressed = this.inputManager.isKeyDown('up');
    const downPressed = this.inputManager.isKeyDown('down');
    const leftPressed = this.inputManager.isKeyDown('left');
    const rightPressed = this.inputManager.isKeyDown('right');
    
    if (upPressed) {
      vy -= 1;
    }
    if (downPressed) {
      vy += 1;
    }
    if (leftPressed) {
      vx -= 1;
    }
    if (rightPressed) {
      vx += 1;
    }
    

    
    // 如果有键盘输入
    if (vx !== 0 || vy !== 0) {
      // 获取修改后的移动速度（考虑状态效果）
      let speed = movement.speed;
      if (this.statusEffectSystem) {
        const modifiedStats = this.statusEffectSystem.getModifiedStats(playerEntity);
        speed = modifiedStats.speed;
      }
      
      // 归一化方向向量（避免斜向移动过快）
      const magnitude = Math.sqrt(vx * vx + vy * vy);
      vx = (vx / magnitude) * speed;
      vy = (vy / magnitude) * speed;
      
      // 开始键盘移动
      movement.startKeyboardMovement(vx, vy);
      
      // 切换到移动动画
      if (sprite && sprite.currentAnimation !== 'walk') {
        sprite.playAnimation('walk');
      }
    } else {
      // 没有键盘输入，如果当前是键盘移动模式，则停止
      if (movement.movementType === 'keyboard') {
        movement.stop();
        
        // 停止行走动画
        if (sprite && sprite.useAnimatedSprite) {
          sprite.setWalking(false);
        }
        // 切换到待机动画
        if (sprite && sprite.currentAnimation !== 'idle') {
          sprite.playAnimation('idle');
        }
      }
    }
  }

  /**
   * 处理点击移动
   * @param {Array<Entity>} entities - 实体列表
   */
  handleClickMovement(entities) {
    if (!this.inputManager) return;
    
    // 检测鼠标点击（左键）
    // 只有当点击未被 UI 处理时才响应移动
    if (this.inputManager.isMouseClicked() && 
        this.inputManager.getMouseButton() === 0 &&
        !this.inputManager.isMouseClickHandled()) {
      
      // 如果按住了Shift键或Ctrl键，不处理点击移动（这些是特殊操作）
      const shiftPressed = this.inputManager.isKeyDown('shift');
      const ctrlPressed = this.inputManager.isKeyDown('ctrl');
      if (shiftPressed || ctrlPressed) {
        return;
      }
      
      // 只处理玩家实体的点击移动
      const playerEntity = this.playerEntity || entities.find(e => e.type === 'player');
      if (!playerEntity) return;
      
      const movement = playerEntity.getComponent('movement');
      const sprite = playerEntity.getComponent('sprite');
      if (!movement) return;
      
      // 如果当前是键盘移动模式，不处理点击
      if (movement.movementType === 'keyboard') {
        return;
      }
      
      // 获取点击的世界坐标
      const clickPos = this.inputManager.getMouseWorldPosition();
      
      // 检查是否点击了敌人（如果点击了敌人，不移动）
      const clickedEnemy = this.findEnemyAtPosition(clickPos, entities);
      if (clickedEnemy) {
        // 点击了敌人，不移动（由 CombatSystem 处理选中）
        return;
      }
      
      // 设置移动路径（简单的直线路径）
      movement.setPath([clickPos]);
      
      // 切换到移动动画
      if (sprite && sprite.currentAnimation !== 'walk') {
        sprite.playAnimation('walk');
      }
      
      // 标记点击已处理
      this.inputManager.markMouseClickHandled();
    }
  }
  
  /**
   * 查找指定位置的敌人
   * @param {Object} position - 位置 {x, y}
   * @param {Array<Entity>} entities - 实体列表
   * @returns {Entity|null}
   */
  findEnemyAtPosition(position, entities) {
    const clickRadius = 30;
    const enemies = entities.filter(e => e.type === 'enemy' && !e.isDead);
    
    for (const enemy of enemies) {
      const transform = enemy.getComponent('transform');
      if (!transform) continue;
      
      const dx = transform.position.x - position.x;
      const dy = transform.position.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= clickRadius) {
        return enemy;
      }
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
    
    // 检查碰撞地图
    if (this.collisionMap && this.checkCollisionMap(x, y)) {
      return false;
    }
    
    return true;
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
