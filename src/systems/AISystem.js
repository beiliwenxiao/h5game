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
 * AISystem.js
 * AI系统 - 管理敌人的AI行为
 * 
 * 复用现有系统：
 * - MovementSystem: 移动和路径寻找
 * - CombatSystem: 攻击判定和伤害计算
 */

/**
 * AI控制器基类
 */
class AIController {
  constructor() {
    this.updateInterval = 0.5; // AI更新间隔（秒）
    this.timeSinceLastUpdate = 0;
  }

  /**
   * 更新AI
   * @param {Entity} entity - 实体
   * @param {Array<Entity>} allEntities - 所有实体列表
   * @param {number} deltaTime - 帧间隔时间（秒）
   * @param {CombatSystem} combatSystem - 战斗系统
   */
  update(entity, allEntities, deltaTime, combatSystem) {
    this.timeSinceLastUpdate += deltaTime;
    
    if (this.timeSinceLastUpdate >= this.updateInterval) {
      this.makeDecision(entity, allEntities, combatSystem);
      this.timeSinceLastUpdate = 0;
    }
  }

  /**
   * 做出决策（子类实现）
   * @param {Entity} entity - 实体
   * @param {Array<Entity>} allEntities - 所有实体列表
   * @param {CombatSystem} combatSystem - 战斗系统
   */
  makeDecision(entity, allEntities, combatSystem) {
    // 子类实现
  }

  /**
   * 查找最近的敌人
   * @param {Entity} entity - 实体
   * @param {Array<Entity>} allEntities - 所有实体列表
   * @param {number} detectionRange - 检测范围
   * @returns {Entity|null}
   */
  findNearestEnemy(entity, allEntities, detectionRange = 300) {
    const transform = entity.getComponent('transform');
    if (!transform) return null;

    const enemies = allEntities.filter(e => {
      // 排除自己
      if (e === entity) return false;
      
      // 排除死亡单位
      if (e.isDead || e.isDying) return false;
      
      // 排除同阵营
      if (e.faction === entity.faction) return false;
      
      // 检查是否是敌对目标
      if (entity.faction === 'enemy' && e.type !== 'player' && e.faction !== 'ally') return false;
      if (entity.faction === 'ally' && e.type !== 'enemy') return false;
      
      return true;
    });

    let nearestEnemy = null;
    let nearestDistance = detectionRange;

    for (const enemy of enemies) {
      const enemyTransform = enemy.getComponent('transform');
      if (!enemyTransform) continue;

      const dx = enemyTransform.position.x - transform.position.x;
      const dy = enemyTransform.position.y - transform.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEnemy = enemy;
      }
    }

    return nearestEnemy;
  }

  /**
   * 移动到目标
   * @param {Entity} entity - 实体
   * @param {Entity} target - 目标
   */
  moveTowardsTarget(entity, target) {
    const transform = entity.getComponent('transform');
    const targetTransform = target.getComponent('transform');
    const movement = entity.getComponent('movement');

    if (!transform || !targetTransform || !movement) return;

    // 计算方向
    const dx = targetTransform.position.x - transform.position.x;
    const dy = targetTransform.position.y - transform.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      // 归一化方向
      const dirX = dx / distance;
      const dirY = dy / distance;

      // 设置移动速度
      movement.velocity.x = dirX * movement.speed;
      movement.velocity.y = dirY * movement.speed;
      
      // 播放移动动画
      const sprite = entity.getComponent('sprite');
      if (sprite && sprite.currentAnimation !== 'walk') {
        sprite.playAnimation('walk');
      }
    }
  }

  /**
   * 停止移动
   * @param {Entity} entity - 实体
   */
  stopMovement(entity) {
    const movement = entity.getComponent('movement');
    if (movement) {
      movement.velocity.x = 0;
      movement.velocity.y = 0;
      
      // 播放待机动画
      const sprite = entity.getComponent('sprite');
      if (sprite && sprite.currentAnimation !== 'idle') {
        sprite.playAnimation('idle');
      }
    }
  }

  /**
   * 检查是否在攻击范围内
   * @param {Entity} entity - 实体
   * @param {Entity} target - 目标
   * @param {number} range - 攻击范围
   * @returns {boolean}
   */
  isInRange(entity, target, range) {
    const transform = entity.getComponent('transform');
    const targetTransform = target.getComponent('transform');

    if (!transform || !targetTransform) return false;

    const dx = targetTransform.position.x - transform.position.x;
    const dy = targetTransform.position.y - transform.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= range;
  }
}

/**
 * 激进型AI - 主动攻击最近的敌人
 */
class AggressiveAI extends AIController {
  constructor() {
    super();
    this.updateInterval = 0.3; // 更频繁的更新
    this.lastAttackTime = 0;   // 上次攻击时间
  }

  makeDecision(entity, allEntities, combatSystem) {
    const combat = entity.getComponent('combat');
    if (!combat) return;

    // 如果没有目标或目标已死亡，寻找新目标
    if (!combat.hasTarget() || this.isTargetDead(combat.target)) {
      // 清除死亡目标
      if (combat.hasTarget() && this.isTargetDead(combat.target)) {
        combat.clearTarget();
      }
      
      const newTarget = this.findNearestEnemy(entity, allEntities, 400);
      if (newTarget) {
        combat.setTarget(newTarget);
        console.log(`${entity.name} 找到目标: ${newTarget.name} (type: ${newTarget.type}, faction: ${newTarget.faction})`);
      }
    }

    // 如果有目标，尝试攻击或移动
    if (combat.hasTarget()) {
      const target = combat.target;

      // 检查是否在攻击范围内
      if (this.isInRange(entity, target, combat.attackRange)) {
        // 在范围内，停止移动并攻击
        this.stopMovement(entity);
        
        // 执行攻击
        const currentTime = performance.now();
        if (combat.canAttack(currentTime) && combatSystem) {
          combatSystem.performAttack(entity, target, currentTime);
        }
      } else {
        // 不在范围内，移动到目标
        this.moveTowardsTarget(entity, target);
      }
    } else {
      // 没有目标，停止移动
      this.stopMovement(entity);
    }
  }

  /**
   * 检查目标是否死亡
   * @param {Entity} target - 目标
   * @returns {boolean}
   */
  isTargetDead(target) {
    if (!target) return true;
    const stats = target.getComponent('stats');
    return !stats || stats.hp <= 0 || target.isDead;
  }
}

/**
 * 防御型AI - 保持距离，优先攻击靠近的敌人
 */
class DefensiveAI extends AIController {
  constructor() {
    super();
    this.updateInterval = 0.4;
    this.safeDistance = 150; // 安全距离
  }

  makeDecision(entity, allEntities, combatSystem) {
    const combat = entity.getComponent('combat');
    const transform = entity.getComponent('transform');
    if (!combat || !transform) return;

    // 查找最近的敌人
    const nearestEnemy = this.findNearestEnemy(entity, allEntities, 300);

    if (nearestEnemy) {
      const enemyTransform = nearestEnemy.getComponent('transform');
      if (!enemyTransform) return;

      const dx = enemyTransform.position.x - transform.position.x;
      const dy = enemyTransform.position.y - transform.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 如果敌人太近，后退
      if (distance < this.safeDistance) {
        this.retreatFrom(entity, nearestEnemy);
      } else if (distance <= combat.attackRange) {
        // 在攻击范围内，停止移动并攻击
        this.stopMovement(entity);
        combat.setTarget(nearestEnemy);
        
        // 执行攻击
        const currentTime = performance.now();
        if (combat.canAttack(currentTime) && combatSystem) {
          combatSystem.performAttack(entity, nearestEnemy, currentTime);
        }
      } else {
        // 保持距离
        this.stopMovement(entity);
        combat.setTarget(nearestEnemy);
      }
    } else {
      // 没有敌人，停止移动
      this.stopMovement(entity);
      combat.clearTarget();
    }
  }

  /**
   * 从目标后退
   * @param {Entity} entity - 实体
   * @param {Entity} target - 目标
   */
  retreatFrom(entity, target) {
    const transform = entity.getComponent('transform');
    const targetTransform = target.getComponent('transform');
    const movement = entity.getComponent('movement');

    if (!transform || !targetTransform || !movement) return;

    // 计算反方向
    const dx = transform.position.x - targetTransform.position.x;
    const dy = transform.position.y - targetTransform.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      // 归一化方向（反向）
      const dirX = dx / distance;
      const dirY = dy / distance;

      // 设置移动速度（后退）
      movement.velocity.x = dirX * movement.speed;
      movement.velocity.y = dirY * movement.speed;
      
      // 播放移动动画
      const sprite = entity.getComponent('sprite');
      if (sprite && sprite.currentAnimation !== 'walk') {
        sprite.playAnimation('walk');
      }
    }
  }
}

/**
 * 支援型AI - 优先攻击低血量敌人，保护友军
 */
class SupportAI extends AIController {
  constructor() {
    super();
    this.updateInterval = 0.5;
  }

  makeDecision(entity, allEntities, combatSystem) {
    const combat = entity.getComponent('combat');
    if (!combat) return;

    // 查找低血量的敌人
    const weakEnemy = this.findWeakestEnemy(entity, allEntities, 350);

    if (weakEnemy) {
      combat.setTarget(weakEnemy);

      // 检查是否在攻击范围内
      if (this.isInRange(entity, weakEnemy, combat.attackRange)) {
        // 在范围内，停止移动并攻击
        this.stopMovement(entity);
        
        // 执行攻击
        const currentTime = performance.now();
        if (combat.canAttack(currentTime) && combatSystem) {
          combatSystem.performAttack(entity, weakEnemy, currentTime);
        }
      } else {
        // 不在范围内，移动到目标
        this.moveTowardsTarget(entity, weakEnemy);
      }
    } else {
      // 没有低血量敌人，查找最近的敌人
      const nearestEnemy = this.findNearestEnemy(entity, allEntities, 300);
      
      if (nearestEnemy) {
        combat.setTarget(nearestEnemy);
        
        if (this.isInRange(entity, nearestEnemy, combat.attackRange)) {
          this.stopMovement(entity);
          
          // 执行攻击
          const currentTime = performance.now();
          if (combat.canAttack(currentTime) && combatSystem) {
            combatSystem.performAttack(entity, nearestEnemy, currentTime);
          }
        } else {
          this.moveTowardsTarget(entity, nearestEnemy);
        }
      } else {
        // 没有敌人，停止移动
        this.stopMovement(entity);
        combat.clearTarget();
      }
    }
  }

  /**
   * 查找最弱的敌人（血量最低）
   * @param {Entity} entity - 实体
   * @param {Array<Entity>} allEntities - 所有实体列表
   * @param {number} detectionRange - 检测范围
   * @returns {Entity|null}
   */
  findWeakestEnemy(entity, allEntities, detectionRange) {
    const transform = entity.getComponent('transform');
    if (!transform) return null;

    const enemies = allEntities.filter(e => {
      if (e === entity) return false;
      if (e.isDead || e.isDying) return false;
      if (e.faction === entity.faction) return false;
      if (entity.faction === 'enemy' && e.type !== 'player' && e.faction !== 'ally') return false;
      if (entity.faction === 'ally' && e.type !== 'enemy') return false;
      return true;
    });

    let weakestEnemy = null;
    let lowestHpPercent = 1.0;

    for (const enemy of enemies) {
      const enemyTransform = enemy.getComponent('transform');
      const enemyStats = enemy.getComponent('stats');
      
      if (!enemyTransform || !enemyStats) continue;

      // 检查距离
      const dx = enemyTransform.position.x - transform.position.x;
      const dy = enemyTransform.position.y - transform.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > detectionRange) continue;

      // 计算血量百分比
      const hpPercent = enemyStats.hp / enemyStats.maxHp;

      // 优先攻击血量低于50%的敌人
      if (hpPercent < 0.5 && hpPercent < lowestHpPercent) {
        lowestHpPercent = hpPercent;
        weakestEnemy = enemy;
      }
    }

    return weakestEnemy;
  }
}

/**
 * AI系统
 * 管理所有AI控制的实体
 */
export class AISystem {
  constructor() {
    // AI控制器映射 entityId -> AIController
    this.aiControllers = new Map();
    
    console.log('AISystem: Initialized');
  }

  /**
   * 注册AI控制器
   * @param {Entity} entity - 实体
   * @param {string} aiType - AI类型 'aggressive', 'defensive', 'support'
   */
  registerAI(entity, aiType = 'aggressive') {
    const controller = this.createAIController(aiType);
    this.aiControllers.set(entity.id, controller);
    
    // 标记实体为AI控制
    entity.isAI = true;
    entity.aiType = aiType;
    
    console.log(`AISystem: Registered ${aiType} AI for entity ${entity.id}`);
  }

  /**
   * 创建AI控制器
   * @param {string} aiType - AI类型
   * @returns {AIController}
   */
  createAIController(aiType) {
    switch (aiType) {
      case 'aggressive':
        return new AggressiveAI();
      case 'defensive':
        return new DefensiveAI();
      case 'support':
        return new SupportAI();
      default:
        console.warn(`AISystem: Unknown AI type: ${aiType}, using aggressive`);
        return new AggressiveAI();
    }
  }

  /**
   * 移除AI控制器
   * @param {Entity} entity - 实体
   */
  unregisterAI(entity) {
    if (this.aiControllers.has(entity.id)) {
      this.aiControllers.delete(entity.id);
      entity.isAI = false;
      entity.aiType = null;
      console.log(`AISystem: Unregistered AI for entity ${entity.id}`);
    }
  }

  /**
   * 更新系统
   * @param {number} deltaTime - 帧间隔时间（秒）
   * @param {Array<Entity>} entities - 实体列表
   * @param {CombatSystem} combatSystem - 战斗系统
   */
  update(deltaTime, entities, combatSystem) {
    // 更新所有AI控制的实体
    for (const [entityId, controller] of this.aiControllers) {
      const entity = entities.find(e => e.id === entityId);
      
      if (!entity) {
        // 实体不存在，移除控制器
        this.aiControllers.delete(entityId);
        continue;
      }

      // 跳过死亡实体
      if (entity.isDead || entity.isDying) continue;

      // 更新AI
      controller.update(entity, entities, deltaTime, combatSystem);
    }
  }

  /**
   * 批量注册AI
   * @param {Array<Entity>} entities - 实体列表
   * @param {string} aiType - AI类型
   */
  registerBatch(entities, aiType = 'aggressive') {
    for (const entity of entities) {
      this.registerAI(entity, aiType);
    }
  }

  /**
   * 清除所有AI控制器
   */
  clear() {
    this.aiControllers.clear();
    console.log('AISystem: Cleared all AI controllers');
  }

  /**
   * 获取AI控制的实体数量
   * @returns {number}
   */
  getAICount() {
    return this.aiControllers.size;
  }

  /**
   * 检查实体是否被AI控制
   * @param {Entity} entity - 实体
   * @returns {boolean}
   */
  isAIControlled(entity) {
    return this.aiControllers.has(entity.id);
  }

  /**
   * 获取实体的AI类型
   * @param {Entity} entity - 实体
   * @returns {string|null}
   */
  getAIType(entity) {
    return entity.aiType || null;
  }

  /**
   * 更改实体的AI类型
   * @param {Entity} entity - 实体
   * @param {string} newAIType - 新的AI类型
   */
  changeAIType(entity, newAIType) {
    if (this.aiControllers.has(entity.id)) {
      const newController = this.createAIController(newAIType);
      this.aiControllers.set(entity.id, newController);
      entity.aiType = newAIType;
      console.log(`AISystem: Changed AI type for entity ${entity.id} to ${newAIType}`);
    }
  }
}
