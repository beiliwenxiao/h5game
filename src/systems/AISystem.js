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
 * AISystem.js
 * AI系统 - 管理敌人的AI行为
 * 
 * 复用现有系统：
 * - MovementSystem: 移动和路径寻找
 * - CombatSystem: 攻击判定和伤害计算
 */

const hasTag = (entity, tag) => Array.isArray(entity?.tags) && entity.tags.includes(tag);

/** canonical 战役单位只攻击其他参战阵营；普通敌人继续使用 legacy faction/type 规则。 */
function isHostileTarget(entity, candidate) {
  if (candidate === entity || candidate?.isDead || candidate?.isDying) return false;
  if (hasTag(entity, 'battleParticipant')) {
    const candidateParticipates = hasTag(candidate, 'battleParticipant')
      || hasTag(candidate, 'battleIntervenor');
    return candidateParticipates
      && !!entity.factionId
      && !!candidate.factionId
      && entity.factionId !== candidate.factionId;
  }
  if (candidate?.faction === entity.faction) return false;
  if (entity.faction === 'enemy' && candidate?.type !== 'player' && candidate?.faction !== 'ally') return false;
  if (entity.faction === 'ally' && candidate?.type !== 'enemy') return false;
  return true;
}

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

    const enemies = allEntities.filter(candidate => isHostileTarget(entity, candidate));

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

    const enemies = allEntities.filter(candidate => isHostileTarget(entity, candidate));

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
    this.aiControllers = new Map();
    this.inactiveAI = new Map();
    this.lureTargets = new Map();
    console.log('AISystem: Initialized');
  }

  registerAI(entity, aiType = 'aggressive') {
    if (!entity?.id) return false;
    const resolvedType = aiType || this.inactiveAI.get(entity.id) || entity.aiType || 'aggressive';
    this.aiControllers.set(entity.id, this.createAIController(resolvedType));
    this.inactiveAI.delete(entity.id);
    entity.isAI = true;
    entity.aiActive = true;
    entity.aiType = resolvedType;
    console.log(`AISystem: Registered ${resolvedType} AI for entity ${entity.id}`);
    return true;
  }

  createAIController(aiType) {
    switch (aiType) {
      case 'battleFormation':
      case 'aggressive': return new AggressiveAI();
      case 'defensive': return new DefensiveAI();
      case 'support': return new SupportAI();
      default:
        console.warn(`AISystem: Unknown AI type: ${aiType}, using aggressive`);
        return new AggressiveAI();
    }
  }

  /** 暂停 AI 但保留期望类型，供可见休眠守卫稍后激活。 */
  deactivateAI(entity, aiType = entity?.aiType || 'aggressive') {
    if (!entity?.id) return false;
    this.aiControllers.delete(entity.id);
    this.lureTargets.delete(entity.id);
    this.inactiveAI.set(entity.id, aiType || 'aggressive');
    entity.getComponent?.('movement')?.stop?.();
    entity.isAI = false;
    entity.aiActive = false;
    entity.aiType = aiType || 'aggressive';
    return true;
  }

  /** 幂等激活已存在的实体，不重新创建或改变实体 ID。 */
  activateAI(entity, aiType = null) {
    if (!entity?.id || entity.isDead || entity.isDying) return false;
    const resolvedType = aiType || this.inactiveAI.get(entity.id) || entity.aiType || 'aggressive';
    if (this.aiControllers.has(entity.id) && entity.aiType === resolvedType) return true;
    return this.registerAI(entity, resolvedType);
  }

  /** 完全移除 AI 运行态，用于实体销毁/场景卸载。 */
  unregisterAI(entity) {
    if (!entity?.id) return false;
    const hadActive = this.aiControllers.delete(entity.id);
    const hadInactive = this.inactiveAI.delete(entity.id);
    const existed = hadActive || hadInactive;
    this.lureTargets.delete(entity.id);
    entity.getComponent?.('movement')?.stop?.();
    entity.isAI = false;
    entity.aiActive = false;
    entity.aiType = null;
    if (existed) console.log(`AISystem: Unregistered AI for entity ${entity.id}`);
    return existed;
  }

  /** 让 AI 在有限时间内优先调查指定位置，结束后恢复原控制器。 */
  lureToPosition(entity, position, { duration = 6, aiType = null } = {}) {
    if (!entity?.id || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return false;
    if (!this.activateAI(entity, aiType)) return false;
    const target = {
      position: { x: position.x, y: position.y },
      remaining: Math.max(0.1, Number(duration) || 6)
    };
    this.lureTargets.set(entity.id, target);
    entity.getComponent?.('movement')?.setPath?.([target.position]);
    return true;
  }

  getRuntimeState(entity) {
    if (!entity?.id) return null;
    const lure = this.lureTargets.get(entity.id);
    return {
      active: this.aiControllers.has(entity.id),
      aiType: this.inactiveAI.get(entity.id) || entity.aiType || 'aggressive',
      lure: lure ? { position: { ...lure.position }, remaining: lure.remaining } : null
    };
  }

  restoreRuntimeState(entity, state = {}) {
    if (!entity?.id) return false;
    const aiType = state.aiType || entity.aiType || 'aggressive';
    if (state.active === false) return this.deactivateAI(entity, aiType);
    if (!this.activateAI(entity, aiType)) return false;
    if (state.lure?.position) {
      return this.lureToPosition(entity, state.lure.position, {
        duration: state.lure.remaining,
        aiType
      });
    }
    return true;
  }

  update(deltaTime, entities, combatSystem) {
    for (const [entityId, controller] of this.aiControllers) {
      const entity = entities.find(candidate => candidate.id === entityId);
      if (!entity) {
        this.aiControllers.delete(entityId);
        this.lureTargets.delete(entityId);
        continue;
      }
      if (entity.isDead || entity.isDying) continue;
      if (this._updateLure(entity, deltaTime)) continue;
      controller.update(entity, entities, deltaTime, combatSystem);
    }
  }

  _updateLure(entity, deltaTime) {
    const lure = this.lureTargets.get(entity.id);
    if (!lure) return false;
    lure.remaining -= Math.max(0, Number(deltaTime) || 0);
    const transform = entity.getComponent?.('transform');
    const distance = transform
      ? Math.hypot(lure.position.x - transform.position.x, lure.position.y - transform.position.y)
      : 0;
    if (lure.remaining <= 0 || distance <= 8) {
      this.lureTargets.delete(entity.id);
      entity.getComponent?.('movement')?.stop?.();
      return false;
    }
    return true;
  }

  registerBatch(entities, aiType = 'aggressive') {
    for (const entity of entities) this.registerAI(entity, aiType);
  }

  clear() {
    this.aiControllers.clear();
    this.inactiveAI.clear();
    this.lureTargets.clear();
    console.log('AISystem: Cleared all AI controllers');
  }

  getAICount() { return this.aiControllers.size; }
  isAIControlled(entity) { return !!entity?.id && this.aiControllers.has(entity.id); }
  getAIType(entity) { return entity?.aiType || this.inactiveAI.get(entity?.id) || null; }

  changeAIType(entity, newAIType) {
    if (!entity?.id) return false;
    if (!this.aiControllers.has(entity.id)) {
      this.inactiveAI.set(entity.id, newAIType);
      entity.aiType = newAIType;
      return true;
    }
    this.aiControllers.set(entity.id, this.createAIController(newAIType));
    entity.aiType = newAIType;
    console.log(`AISystem: Changed AI type for entity ${entity.id} to ${newAIType}`);
    return true;
  }
}
