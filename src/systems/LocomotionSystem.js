/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { ClimbSystem } from './ClimbSystem.js';

/**
 * 位移能力执行层。AbilitySystem 负责规则和事务，本系统把 canonical
 * locomotion 技能路由到 Jump/Flight/Climb 执行器。
 */
export class LocomotionSystem {
  constructor({ jumpSystem = null, flightSystem = null, climbSystem = null, resolveClimbTarget = null } = {}) {
    this.jumpSystem = jumpSystem;
    this.flightSystem = flightSystem;
    this.climbSystem = climbSystem || new ClimbSystem();
    this.resolveClimbTarget = typeof resolveClimbTarget === 'function' ? resolveClimbTarget : () => null;
  }

  execute(context = {}) {
    const { caster, skillId, params = {}, targetPosition, context: abilityContext = null } = context;
    if (!caster) return false;
    if (skillId === 'jump' || skillId === 'power_jump') {
      const transform = caster.getComponent?.('transform');
      if (!transform || !this.jumpSystem) return false;
      const dx = Number(targetPosition?.x) - transform.position.x;
      const dy = Number(targetPosition?.y) - transform.position.y;
      const magnitude = Math.hypot(dx, dy);
      const direction = magnitude > 0 ? { x: dx / magnitude, y: dy / magnitude } : { x: 0, y: 0 };
      return this.jumpSystem.startJump(caster, direction, {
        mode: skillId === 'power_jump' ? 'power' : 'normal',
        distance: magnitude > 0 ? Math.min(magnitude, Number(params.range) || magnitude) : 0,
        duration: params.duration,
        chargeDuration: skillId === 'power_jump' ? (Number(params.castTime) || 0) / 1000 : 0,
        peakHeight: params.peakHeight
      });
    }
    if (skillId === 'flight') {
      if (!this.flightSystem || !targetPosition) return false;
      return this.flightSystem.startFlight(caster, targetPosition.x, targetPosition.y, {
        maxDistance: Number(params.range) || undefined
      });
    }
    if (skillId === 'climb') {
      const target = abilityContext?.climbTarget || this.resolveClimbTarget({ entity: caster, context: abilityContext });
      return !!target && this.climbSystem.startClimb(caster, target.targetPosition || target, {
        duration: Number(params.duration) || undefined,
        peakHeight: Number(params.peakHeight) || undefined
      });
    }
    return null;
  }

  isBusy(entity) {
    return this.jumpSystem?.isJumping?.(entity) === true
      || this.flightSystem?.isPlayerFlying?.() === true
      || this.climbSystem?.isClimbing?.(entity) === true;
  }

  update(deltaTime) {
    this.climbSystem.update(deltaTime);
  }

  serialize(entity) {
    return { schemaVersion: 1, climb: this.climbSystem.serialize(entity) };
  }

  validateSerialized(data = {}) {
    if (data == null) return { ok: true };
    if (data.schemaVersion !== 1) return { ok: false, code: 'invalidLocomotionState' };
    return this.climbSystem.validateSerialized(data.climb || { schemaVersion: 1, active: false });
  }

  deserialize(entity, data = {}) {
    const check = this.validateSerialized(data);
    if (!check.ok) return check;
    return this.climbSystem.deserialize(entity, data.climb || { schemaVersion: 1, active: false });
  }

  cleanup() {
    this.climbSystem.cleanup();
  }
}

export default LocomotionSystem;