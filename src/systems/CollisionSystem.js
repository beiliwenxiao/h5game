/**
 * CollisionSystem.js
 * 碰撞检测系统 - 处理实体之间的碰撞检测和推开
 * 
 * 支持：
 * - AABB 碰撞检测
 * - 碰撞层过滤
 * - 碰撞推开
 * - 碰撞回调
 */

export class CollisionSystem {
  /**
   * @param {Object} config - 配置
   * @param {number} config.entityRadius - 默认实体碰撞半径，默认20
   * @param {number} config.widthRatio - 碰撞宽度比例，默认0.8
   * @param {number} config.heightRatio - 碰撞高度比例，默认0.75
   * @param {string[]} config.collidableLayers - 参与碰撞的实体类型，默认['player', 'enemy']
   */
  constructor(config = {}) {
    this.entityRadius = config.entityRadius ?? 20;
    this.widthRatio = config.widthRatio ?? 0.8;
    this.heightRatio = config.heightRatio ?? 0.75;
    this.collidableLayers = config.collidableLayers ?? ['player', 'enemy'];
    
    // 碰撞回调列表
    this.onCollisionCallbacks = [];
  }

  /**
   * 注册碰撞回调
   * @param {Function} callback - (entityA, entityB) => void
   */
  onCollision(callback) {
    this.onCollisionCallbacks.push(callback);
  }

  /**
   * 更新碰撞检测
   * @param {Array} entities - 实体列表
   */
  update(entities) {
    const collidable = entities.filter(e => 
      !e.isDead && !e.isDying && this.collidableLayers.includes(e.type)
    );
    
    const radius = this.entityRadius * this.widthRatio;
    const halfHeight = this.entityRadius * this.heightRatio;
    
    for (let i = 0; i < collidable.length; i++) {
      const a = collidable[i];
      const ta = a.getComponent('transform');
      if (!ta) continue;
      
      for (let j = i + 1; j < collidable.length; j++) {
        const b = collidable[j];
        const tb = b.getComponent('transform');
        if (!tb) continue;
        
        // AABB 检测
        const dx = ta.position.x - tb.position.x;
        const dy = ta.position.y - tb.position.y;
        
        if (Math.abs(dx) < radius * 2 && Math.abs(dy) < halfHeight * 2) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance === 0) continue;
          
          const nx = dx / distance;
          const ny = dy / distance;
          const overlapX = (radius * 2) - Math.abs(dx);
          const overlapY = (halfHeight * 2) - Math.abs(dy);
          const push = Math.min(overlapX, overlapY) / 2;
          
          if (Math.abs(overlapX) < Math.abs(overlapY)) {
            ta.position.x += nx * push;
            tb.position.x -= nx * push;
          } else {
            ta.position.y += ny * push;
            tb.position.y -= ny * push;
          }
          
          // 触发回调
          for (const cb of this.onCollisionCallbacks) {
            cb(a, b);
          }
        }
      }
    }
  }

  /**
   * 设置可碰撞层
   * @param {string[]} layers - 实体类型数组
   */
  setCollidableLayers(layers) {
    this.collidableLayers = layers;
  }
}
