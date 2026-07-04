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

import { ObjectPool } from '../core/ObjectPool.js';

/**
 * CombatEffects - 战斗特效管理器
 * 处理受击闪烁、伤害数字飘字、治疗特效等
 */
export class CombatEffects {
  /**
   * @param {ParticleSystem} particleSystem - 粒子系统实例
   */
  constructor(particleSystem) {
    this.particleSystem = particleSystem;
    
    // 伤害数字列表
    this.damageNumbers = [];
    
    // 闪烁效果列表
    this.flashEffects = [];
    
    // 伤害数字对象池
    this.damageNumberPool = new ObjectPool(
      // 工厂函数
      () => ({
        value: 0,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        life: 0,
        maxLife: 0,
        type: 'damage',
        active: false,
        scale: 1.0
      }),
      // 重置函数
      (obj) => {
        obj.value = 0;
        obj.position.x = 0;
        obj.position.y = 0;
        obj.velocity.x = 0;
        obj.velocity.y = 0;
        obj.life = 0;
        obj.maxLife = 0;
        obj.type = 'damage';
        obj.scale = 1.0;
      },
      100, // 初始大小
      500  // 最大大小
    );
    
    // 闪烁效果对象池
    this.flashEffectPool = new ObjectPool(
      // 工厂函数
      () => ({
        entity: null,
        duration: 0,
        elapsed: 0,
        color: '#ffffff',
        active: false
      }),
      // 重置函数
      (obj) => {
        obj.entity = null;
        obj.duration = 0;
        obj.elapsed = 0;
        obj.color = '#ffffff';
      },
      50,  // 初始大小
      200  // 最大大小
    );
  }

  /**
   * 创建伤害数字飘字
   * @param {number} damage - 伤害值
   * @param {Object} position - 位置 {x, y}
   * @param {string} [type='damage'] - 类型：'damage', 'heal', 'critical'
   */
  createDamageNumber(damage, position, type = 'damage') {
    // 从对象池获取伤害数字对象
    const damageNumber = this.damageNumberPool.acquire();
    
    // 设置属性
    damageNumber.value = Math.round(damage);
    damageNumber.position.x = position.x;
    damageNumber.position.y = position.y;
    damageNumber.velocity.x = (Math.random() - 0.5) * 30;
    damageNumber.velocity.y = -80;
    damageNumber.life = 1500;
    damageNumber.maxLife = 1500;
    damageNumber.type = type;
    damageNumber.scale = 1.0;

    this.damageNumbers.push(damageNumber);

    // 根据类型发射粒子
    if (type === 'heal') {
      this.particleSystem.emitBurst({
        position: { ...position },
        velocity: { x: 0, y: 0 },
        life: 800,
        size: 4,
        color: '#00ff88',
        gravity: -40
      }, 15, {
        velocityRange: { min: 40, max: 80 }
      });
    } else if (type === 'critical') {
      this.particleSystem.emitBurst({
        position: { ...position },
        velocity: { x: 0, y: 0 },
        life: 600,
        size: 6,
        color: '#ff0000',
        gravity: 30
      }, 20, {
        velocityRange: { min: 60, max: 120 }
      });
    }
  }

  /**
   * 更新伤害数字
   * @param {number} deltaTime - 时间增量（秒）
   */
  updateDamageNumbers(deltaTime) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dmg = this.damageNumbers[i];
      
      dmg.life -= deltaTime * 1000;
      if (dmg.life <= 0) {
        // 归还到对象池
        this.damageNumberPool.release(dmg);
        this.damageNumbers.splice(i, 1);
        continue;
      }

      // 更新位置
      dmg.position.x += dmg.velocity.x * deltaTime;
      dmg.position.y += dmg.velocity.y * deltaTime;

      // 应用重力
      dmg.velocity.y += 100 * deltaTime;

      // 缩放动画（先放大后缩小）
      const lifeRatio = dmg.life / dmg.maxLife;
      if (lifeRatio > 0.8) {
        dmg.scale = 1.0 + (1 - lifeRatio) * 2; // 0.8-1.0: 放大到1.4
      } else {
        dmg.scale = 1.4 * lifeRatio / 0.8; // 0-0.8: 从1.4缩小到0
      }
    }
  }

  /**
   * 渲染伤害数字
   * @param {CanvasRenderingContext2D} ctx - Canvas 渲染上下文
   * @param {Object} camera - 相机对象
   */
  renderDamageNumbers(ctx, camera) {
    for (const dmg of this.damageNumbers) {
      if (!dmg.active) continue;

      const screenX = dmg.position.x - camera.x;
      const screenY = dmg.position.y - camera.y;

      ctx.save();

      // 透明度随生命周期衰减
      const lifeRatio = dmg.life / dmg.maxLife;
      ctx.globalAlpha = Math.min(lifeRatio * 2, 1);

      // 设置字体和颜色
      const fontSize = Math.floor(24 * dmg.scale);
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 根据类型设置颜色
      let color, outlineColor;
      if (dmg.type === 'heal') {
        color = '#00ff88';
        outlineColor = '#004422';
      } else if (dmg.type === 'critical') {
        color = '#ff3333';
        outlineColor = '#660000';
      } else {
        color = '#ffffff';
        outlineColor = '#000000';
      }

      // 绘制描边
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3;
      ctx.strokeText(dmg.value.toString(), screenX, screenY);

      // 绘制文字
      ctx.fillStyle = color;
      ctx.fillText(dmg.value.toString(), screenX, screenY);

      ctx.restore();
    }
  }

  /**
   * 创建受击闪烁效果
   * @param {Entity} entity - 实体对象
   * @param {number} [duration=300] - 持续时间（毫秒）
   * @param {string} [color='#ffffff'] - 闪烁颜色
   */
  createFlashEffect(entity, duration = 300, color = '#ffffff') {
    // 从对象池获取闪烁效果对象
    const flash = this.flashEffectPool.acquire();
    
    flash.entity = entity;
    flash.duration = duration;
    flash.elapsed = 0;
    flash.color = color;

    this.flashEffects.push(flash);
  }

  /**
   * 更新闪烁效果
   * @param {number} deltaTime - 时间增量（秒）
   */
  updateFlashEffects(deltaTime) {
    for (let i = this.flashEffects.length - 1; i >= 0; i--) {
      const flash = this.flashEffects[i];
      
      flash.elapsed += deltaTime * 1000;
      if (flash.elapsed >= flash.duration) {
        // 归还到对象池
        this.flashEffectPool.release(flash);
        this.flashEffects.splice(i, 1);
      }
    }
  }

  /**
   * 应用闪烁效果到渲染上下文
   * @param {CanvasRenderingContext2D} ctx - Canvas 渲染上下文
   * @param {Entity} entity - 实体对象
   * @returns {boolean} 是否有活跃的闪烁效果
   */
  applyFlashEffect(ctx, entity) {
    const flash = this.flashEffects.find(f => f.entity === entity && f.active);
    if (!flash) return false;

    // 计算闪烁强度（快速衰减）
    const progress = flash.elapsed / flash.duration;
    const intensity = 1 - progress;

    // 应用颜色混合
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = intensity * 0.6;

    return true;
  }

  /**
   * 重置闪烁效果的混合模式
   * @param {CanvasRenderingContext2D} ctx - Canvas 渲染上下文
   */
  resetFlashEffect(ctx) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /**
   * 创建治疗特效
   * @param {Object} position - 位置 {x, y}
   * @param {number} healAmount - 治疗量
   */
  createHealEffect(position, healAmount) {
    // 创建治疗数字
    this.createDamageNumber(healAmount, position, 'heal');

    // 创建治疗粒子环绕效果
    this.particleSystem.emitBurst({
      position: { ...position },
      velocity: { x: 0, y: 0 },
      life: 1200,
      size: 5,
      color: '#00ff88',
      gravity: -30
    }, 25, {
      velocityRange: { min: 50, max: 100 }
    });

    // 创建上升的治疗粒子
    const emitter = this.particleSystem.createEmitter({
      position: { ...position },
      particleConfig: {
        position: { ...position },
        velocity: { x: 0, y: -60 },
        life: 1000,
        size: 4,
        color: '#66ffaa',
        gravity: -20,
        friction: 0.98
      },
      rate: 20,
      duration: 0.8
    });

    return emitter;
  }

  /**
   * 创建暴击特效
   * @param {Object} position - 位置 {x, y}
   * @param {number} damage - 伤害值
   */
  createCriticalEffect(position, damage) {
    // 创建暴击数字
    this.createDamageNumber(damage, position, 'critical');

    // 创建暴击粒子爆发
    this.particleSystem.emitBurst({
      position: { ...position },
      velocity: { x: 0, y: 0 },
      life: 800,
      size: 7,
      color: '#ff3333',
      gravity: 50
    }, 35, {
      velocityRange: { min: 80, max: 180 }
    });
  }

  /**
   * 创建格挡特效
   * @param {Object} position - 位置 {x, y}
   */
  createBlockEffect(position) {
    this.particleSystem.emitBurst({
      position: { ...position },
      velocity: { x: 0, y: 0 },
      life: 500,
      size: 5,
      color: '#cccccc',
      gravity: 0
    }, 20, {
      velocityRange: { min: 60, max: 120 }
    });

    // 显示 "BLOCK" 文字
    this.createDamageNumber(0, position, 'block');
  }

  /**
   * 创建闪避特效
   * @param {Object} position - 位置 {x, y}
   */
  createDodgeEffect(position) {
    this.particleSystem.emitBurst({
      position: { ...position },
      velocity: { x: 0, y: 0 },
      life: 400,
      size: 3,
      color: '#ffff66',
      gravity: 0
    }, 15, {
      velocityRange: { min: 100, max: 150 }
    });
  }

  /**
   * 更新所有战斗特效
   * @param {number} deltaTime - 时间增量（秒）
   */
  update(deltaTime) {
    this.updateDamageNumbers(deltaTime);
    this.updateFlashEffects(deltaTime);
  }

  /**
   * 渲染所有战斗特效
   * @param {CanvasRenderingContext2D} ctx - Canvas 渲染上下文
   * @param {Object} camera - 相机对象
   */
  render(ctx, camera) {
    this.renderDamageNumbers(ctx, camera);
  }

  /**
   * 清除所有战斗特效
   */
  clear() {
    // 归还所有对象到池中
    for (const dmg of this.damageNumbers) {
      this.damageNumberPool.release(dmg);
    }
    for (const flash of this.flashEffects) {
      this.flashEffectPool.release(flash);
    }
    
    this.damageNumbers = [];
    this.flashEffects = [];
  }

  /**
   * 获取活跃的伤害数字数量
   * @returns {number}
   */
  getActiveDamageNumberCount() {
    return this.damageNumbers.length;
  }

  /**
   * 获取活跃的闪烁效果数量
   * @returns {number}
   */
  getActiveFlashEffectCount() {
    return this.flashEffects.length;
  }

  /**
   * 获取对象池统计信息
   * @returns {Object} 统计信息
   */
  getPoolStats() {
    return {
      damageNumbers: {
        active: this.damageNumberPool.getActiveCount(),
        pooled: this.damageNumberPool.getPoolSize(),
        total: this.damageNumberPool.getTotalCount()
      },
      flashEffects: {
        active: this.flashEffectPool.getActiveCount(),
        pooled: this.flashEffectPool.getPoolSize(),
        total: this.flashEffectPool.getTotalCount()
      }
    };
  }
}
