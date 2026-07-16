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
 * CombatComponent.js
 * 战斗组件 - 管理实体的战斗相关数据
 */

import { Component } from '../Component.js';

/**
 * 战斗组件
 * 存储战斗状态、目标、技能等信息
 */
export class CombatComponent extends Component {
  /**
   * @param {Object} config - 配置
   * @param {number} config.attackRange - 攻击范围
   * @param {number} config.attackCooldown - 攻击冷却时间（毫秒）
   */
  constructor(config = {}) {
    super('combat');
    
    // 目标
    this.target = null;
    
    // 攻击属性
    this.attackRange = config.attackRange || 50;
    this.attackCooldown = config.attackCooldown || 1000;
    this.lastAttackTime = 0;
    
    // 技能列表
    this.skills = [];
    this.skillCooldowns = new Map(); // 技能ID -> 上次使用时间
    
    // 战斗状态
    this.inCombat = false;
    this.isAttacking = false;
    this.isCasting = false;
    this.castingSkill = null;
    this.castStartTime = 0;
  }

  /**
   * 设置攻击目标
   * @param {Entity} target - 目标实体
   */
  setTarget(target) {
    this.target = target;
    if (target) {
      this.inCombat = true;
    }
  }

  /**
   * 清除目标
   */
  clearTarget() {
    this.target = null;
    this.inCombat = false;
  }

  /**
   * 检查是否有目标
   * @returns {boolean}
   */
  hasTarget() {
    return this.target !== null;
  }

  /**
   * 检查攻击冷却是否完成
   * @param {number} currentTime - 当前时间（毫秒）
   * @returns {boolean}
   */
  canAttack(currentTime) {
    // 如果从未攻击过（lastAttackTime === 0），则可以攻击
    if (this.lastAttackTime === 0) return true;
    return currentTime - this.lastAttackTime >= this.attackCooldown;
  }

  /**
   * 执行攻击
   * @param {number} currentTime - 当前时间（毫秒）
   */
  attack(currentTime) {
    if (this.canAttack(currentTime)) {
      this.lastAttackTime = currentTime;
      this.isAttacking = true;
      return true;
    }
    return false;
  }

  /**
   * 获取攻击冷却剩余时间
   * @param {number} currentTime - 当前时间（毫秒）
   * @returns {number} 剩余时间（毫秒）
   */
  getAttackCooldownRemaining(currentTime) {
    const elapsed = currentTime - this.lastAttackTime;
    return Math.max(0, this.attackCooldown - elapsed);
  }

  /**
   * 添加技能
   * @param {Object} skill - 技能数据
   */
  addSkill(skill) {
    this.skills.push(skill);
    this.skillCooldowns.set(skill.id, 0);
  }

  /**
   * 检查技能是否可用
   * @param {string} skillId - 技能ID
   * @param {number} currentTime - 当前时间（毫秒）
   * @returns {boolean}
   */
  canUseSkill(skillId, currentTime) {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return false;
    
    const lastUseTime = this.skillCooldowns.get(skillId) || 0;
    // 如果从未使用过（lastUseTime === 0），则可以使用
    if (lastUseTime === 0) return true;
    // 技能冷却时间是秒，需要转换为毫秒
    return currentTime - lastUseTime >= skill.cooldown * 1000;
  }

  /**
   * 使用技能
   * @param {string} skillId - 技能ID
   * @param {number} currentTime - 当前时间（毫秒）
   * @returns {Object|null} 技能数据或null
   */
  useSkill(skillId, currentTime) {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return null;
    
    if (this.canUseSkill(skillId, currentTime)) {
      this.skillCooldowns.set(skillId, currentTime);
      
      // 如果有施法时间，进入施法状态
      if (skill.castTime > 0) {
        this.isCasting = true;
        this.castingSkill = skill;
        this.castStartTime = currentTime;
      }
      
      return skill;
    }
    
    return null;
  }

  /**
   * 获取技能冷却剩余时间
   * @param {string} skillId - 技能ID
   * @param {number} currentTime - 当前时间（毫秒）
   * @returns {number} 剩余时间（毫秒）
   */
  getSkillCooldownRemaining(skillId, currentTime) {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return 0;
    
    const lastUseTime = this.skillCooldowns.get(skillId) || 0;
    const elapsed = currentTime - lastUseTime;
    // 技能冷却时间是秒，需要转换为毫秒
    return Math.max(0, skill.cooldown * 1000 - elapsed);
  }

  /**
   * 检查施法是否完成
   * @param {number} currentTime - 当前时间（毫秒）
   * @returns {boolean}
   */
  isCastComplete(currentTime) {
    if (!this.isCasting || !this.castingSkill) return false;
    return currentTime - this.castStartTime >= this.castingSkill.castTime;
  }

  /**
   * 完成施法
   */
  completeCast() {
    this.isCasting = false;
    const skill = this.castingSkill;
    this.castingSkill = null;
    this.castStartTime = 0;
    return skill;
  }

  /**
   * 中断施法
   */
  interruptCast() {
    this.isCasting = false;
    this.castingSkill = null;
    this.castStartTime = 0;
  }

  /**
   * 更新战斗组件
   * @param {number} deltaTime - 帧间隔时间
   */
  update(deltaTime) {
    // 重置攻击状态
    if (this.isAttacking) {
      this.isAttacking = false;
    }
  }
}
