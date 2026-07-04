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
 * AnimationManager.js
 * 动画管理器 - 管理精灵动画和动画状态机
 */

/**
 * 动画数据结构
 */
export class Animation {
  /**
   * @param {string} name - 动画名称
   * @param {number[]} frames - 帧序列
   * @param {number} frameRate - 帧率（帧/秒）
   * @param {boolean} loop - 是否循环
   */
  constructor(name, frames, frameRate = 10, loop = true) {
    this.name = name;
    this.frames = frames;
    this.frameRate = frameRate;
    this.loop = loop;
    this.frameDuration = 1000 / frameRate; // 每帧持续时间（毫秒）
  }
}

/**
 * 动画状态
 */
export const AnimationState = {
  IDLE: 'idle',
  WALK: 'walk',
  ATTACK: 'attack',
  SKILL: 'skill',
  HIT: 'hit',
  DEATH: 'death'
};

/**
 * 动画管理器
 * 管理实体的动画播放和状态转换
 */
export class AnimationManager {
  constructor() {
    // 动画模板库
    this.animationTemplates = new Map();
    
    // 初始化默认动画
    this.initDefaultAnimations();
  }

  /**
   * 初始化默认动画
   */
  initDefaultAnimations() {
    // 玩家动画模板
    this.registerAnimationTemplate('player', {
      [AnimationState.IDLE]: new Animation(AnimationState.IDLE, [0], 1, true),
      [AnimationState.WALK]: new Animation(AnimationState.WALK, [0, 1, 2, 3], 8, true),
      [AnimationState.ATTACK]: new Animation(AnimationState.ATTACK, [4, 5, 6, 7], 12, false),
      [AnimationState.SKILL]: new Animation(AnimationState.SKILL, [8, 9, 10, 11], 10, false),
      [AnimationState.HIT]: new Animation(AnimationState.HIT, [12, 13], 15, false),
      [AnimationState.DEATH]: new Animation(AnimationState.DEATH, [14, 15, 16, 17], 8, false)
    });

    // 敌人动画模板（史莱姆）
    this.registerAnimationTemplate('slime', {
      [AnimationState.IDLE]: new Animation(AnimationState.IDLE, [0, 1], 4, true),
      [AnimationState.WALK]: new Animation(AnimationState.WALK, [0, 1, 2, 3], 6, true),
      [AnimationState.ATTACK]: new Animation(AnimationState.ATTACK, [4, 5], 10, false),
      [AnimationState.HIT]: new Animation(AnimationState.HIT, [6], 15, false),
      [AnimationState.DEATH]: new Animation(AnimationState.DEATH, [7, 8, 9], 8, false)
    });

    // 敌人动画模板（哥布林）
    this.registerAnimationTemplate('goblin', {
      [AnimationState.IDLE]: new Animation(AnimationState.IDLE, [0], 1, true),
      [AnimationState.WALK]: new Animation(AnimationState.WALK, [0, 1, 2, 3], 8, true),
      [AnimationState.ATTACK]: new Animation(AnimationState.ATTACK, [4, 5, 6], 12, false),
      [AnimationState.HIT]: new Animation(AnimationState.HIT, [7], 15, false),
      [AnimationState.DEATH]: new Animation(AnimationState.DEATH, [8, 9, 10], 8, false)
    });

    // 敌人动画模板（骷髅）
    this.registerAnimationTemplate('skeleton', {
      [AnimationState.IDLE]: new Animation(AnimationState.IDLE, [0], 1, true),
      [AnimationState.WALK]: new Animation(AnimationState.WALK, [0, 1, 2, 3], 8, true),
      [AnimationState.ATTACK]: new Animation(AnimationState.ATTACK, [4, 5, 6, 7], 12, false),
      [AnimationState.HIT]: new Animation(AnimationState.HIT, [8], 15, false),
      [AnimationState.DEATH]: new Animation(AnimationState.DEATH, [9, 10, 11, 12], 8, false)
    });
  }

  /**
   * 注册动画模板
   * @param {string} templateName - 模板名称
   * @param {Object} animations - 动画集合 {state: Animation}
   */
  registerAnimationTemplate(templateName, animations) {
    this.animationTemplates.set(templateName, animations);
  }

  /**
   * 获取动画模板
   * @param {string} templateName - 模板名称
   * @returns {Object|null} 动画集合
   */
  getAnimationTemplate(templateName) {
    return this.animationTemplates.get(templateName) || null;
  }

  /**
   * 为实体应用动画模板
   * @param {Entity} entity - 实体
   * @param {string} templateName - 模板名称
   */
  applyAnimationTemplate(entity, templateName) {
    const sprite = entity.getComponent('sprite');
    if (!sprite) {
      console.warn(`Entity ${entity.id} has no sprite component`);
      return;
    }

    const template = this.getAnimationTemplate(templateName);
    if (!template) {
      console.warn(`Animation template "${templateName}" not found`);
      return;
    }

    // 添加所有动画到精灵组件
    for (const [state, animation] of Object.entries(template)) {
      sprite.addAnimation(state, {
        frames: animation.frames,
        frameRate: animation.frameRate,
        loop: animation.loop
      });
    }

    // 设置默认动画
    sprite.playAnimation(AnimationState.IDLE);
  }

  /**
   * 创建自定义动画
   * @param {string} name - 动画名称
   * @param {number[]} frames - 帧序列
   * @param {number} frameRate - 帧率
   * @param {boolean} loop - 是否循环
   * @returns {Animation}
   */
  createAnimation(name, frames, frameRate = 10, loop = true) {
    return new Animation(name, frames, frameRate, loop);
  }

  /**
   * 更新实体动画
   * @param {Entity} entity - 实体
   * @param {number} deltaTime - 帧间隔时间（秒）
   */
  update(entity, deltaTime) {
    const sprite = entity.getComponent('sprite');
    if (!sprite) return;

    // 更新精灵动画（SpriteComponent已经有update方法）
    sprite.update(deltaTime * 1000); // 转换为毫秒
  }

  /**
   * 批量更新实体动画
   * @param {Entity[]} entities - 实体列表
   * @param {number} deltaTime - 帧间隔时间（秒）
   */
  updateAll(entities, deltaTime) {
    for (const entity of entities) {
      if (!entity.active) continue;
      this.update(entity, deltaTime);
    }
  }
}

/**
 * 动画状态机
 * 管理动画状态转换逻辑
 */
export class AnimationStateMachine {
  /**
   * @param {Entity} entity - 实体
   */
  constructor(entity) {
    this.entity = entity;
    this.currentState = AnimationState.IDLE;
    this.previousState = null;
    this.stateTime = 0;
    
    // 状态转换规则
    this.transitions = new Map();
    this.initDefaultTransitions();
  }

  /**
   * 初始化默认状态转换规则
   */
  initDefaultTransitions() {
    // 任何状态都可以转换到HIT
    this.addTransition('*', AnimationState.HIT, () => true);
    
    // 任何状态都可以转换到DEATH
    this.addTransition('*', AnimationState.DEATH, () => true);
    
    // IDLE可以转换到WALK
    this.addTransition(AnimationState.IDLE, AnimationState.WALK, () => true);
    
    // WALK可以转换到IDLE
    this.addTransition(AnimationState.WALK, AnimationState.IDLE, () => true);
    
    // IDLE和WALK可以转换到ATTACK
    this.addTransition(AnimationState.IDLE, AnimationState.ATTACK, () => true);
    this.addTransition(AnimationState.WALK, AnimationState.ATTACK, () => true);
    
    // IDLE和WALK可以转换到SKILL
    this.addTransition(AnimationState.IDLE, AnimationState.SKILL, () => true);
    this.addTransition(AnimationState.WALK, AnimationState.SKILL, () => true);
    
    // ATTACK完成后回到IDLE
    this.addTransition(AnimationState.ATTACK, AnimationState.IDLE, () => this.isAnimationFinished());
    
    // SKILL完成后回到IDLE
    this.addTransition(AnimationState.SKILL, AnimationState.IDLE, () => this.isAnimationFinished());
    
    // HIT完成后回到之前的状态或IDLE
    this.addTransition(AnimationState.HIT, AnimationState.IDLE, () => this.isAnimationFinished());
  }

  /**
   * 添加状态转换规则
   * @param {string} fromState - 源状态（'*'表示任意状态）
   * @param {string} toState - 目标状态
   * @param {Function} condition - 转换条件函数
   */
  addTransition(fromState, toState, condition) {
    const key = `${fromState}->${toState}`;
    this.transitions.set(key, condition);
  }

  /**
   * 检查是否可以转换状态
   * @param {string} toState - 目标状态
   * @returns {boolean}
   */
  canTransition(toState) {
    // 检查通配符转换
    const wildcardKey = `*->${toState}`;
    if (this.transitions.has(wildcardKey)) {
      const condition = this.transitions.get(wildcardKey);
      if (condition()) return true;
    }
    
    // 检查具体状态转换
    const key = `${this.currentState}->${toState}`;
    if (this.transitions.has(key)) {
      const condition = this.transitions.get(key);
      return condition();
    }
    
    return false;
  }

  /**
   * 转换到新状态
   * @param {string} newState - 新状态
   * @param {boolean} force - 是否强制转换
   * @returns {boolean} 是否成功转换
   */
  transitionTo(newState, force = false) {
    if (this.currentState === newState && !force) {
      return false;
    }
    
    if (!force && !this.canTransition(newState)) {
      return false;
    }
    
    const sprite = this.entity.getComponent('sprite');
    if (!sprite) return false;
    
    // 保存之前的状态
    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateTime = 0;
    
    // 播放对应动画
    sprite.playAnimation(newState, force);
    
    return true;
  }

  /**
   * 检查当前动画是否播放完成
   * @returns {boolean}
   */
  isAnimationFinished() {
    const sprite = this.entity.getComponent('sprite');
    if (!sprite) return true;
    
    const animation = sprite.animations.get(this.currentState);
    if (!animation) return true;
    
    // 如果是循环动画，永远不会完成
    if (animation.loop) return false;
    
    // 检查是否播放到最后一帧
    return sprite.frame >= animation.frames.length - 1;
  }

  /**
   * 更新状态机
   * @param {number} deltaTime - 帧间隔时间（秒）
   */
  update(deltaTime) {
    this.stateTime += deltaTime;
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * 获取之前的状态
   * @returns {string|null}
   */
  getPreviousState() {
    return this.previousState;
  }
}
