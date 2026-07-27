/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * PointLedger.js
 * 成长点数账本。
 *
 * 默认四个独立点数池：skill / talent / unit / passive。
 * 支持配置为共享池：poolAliases 把多个逻辑池映射到同一个物理池。
 *
 * 所有扣点必须先 canAfford 再 spend，禁止出现“节点已分配但扣点失败”。
 */

export class PointLedger {
  /**
   * @param {Object} [config]
   * @param {Object} [config.pools] - 初始点数，如 { skill: 0, talent: 0 }
   * @param {Object} [config.aliases] - 逻辑池 -> 物理池映射，用于共享点数
   */
  constructor(config = {}) {
    /** @type {Map<string, {available: number, spent: number}>} */
    this.pools = new Map();
    this.aliases = { ...(config.aliases || {}) };

    for (const [pool, amount] of Object.entries(config.pools || {})) {
      this.pools.set(this._resolvePool(pool), {
        available: typeof amount === 'number' ? amount : 0,
        spent: 0
      });
    }
  }

  /** @private 解析物理池名 */
  _resolvePool(pool) {
    return this.aliases[pool] || pool;
  }

  /** @private 获取或创建池 */
  _ensurePool(pool) {
    const key = this._resolvePool(pool);
    if (!this.pools.has(key)) this.pools.set(key, { available: 0, spent: 0 });
    return this.pools.get(key);
  }

  /**
   * 增加可用点数
   * @param {string} pool
   * @param {number} amount
   */
  grant(pool, amount) {
    if (typeof amount !== 'number' || amount <= 0) return;
    this._ensurePool(pool).available += amount;
  }

  /**
   * 批量增加
   * @param {Object} amounts - { skill: 1, talent: 2 }
   */
  grantAll(amounts = {}) {
    for (const [pool, amount] of Object.entries(amounts)) this.grant(pool, amount);
  }

  /**
   * 获取可用点数
   * @param {string} pool
   * @returns {number}
   */
  getAvailable(pool) {
    const entry = this.pools.get(this._resolvePool(pool));
    return entry ? entry.available : 0;
  }

  /**
   * 获取已消耗点数
   * @param {string} pool
   * @returns {number}
   */
  getSpent(pool) {
    const entry = this.pools.get(this._resolvePool(pool));
    return entry ? entry.spent : 0;
  }

  /**
   * 判断是否付得起
   * @param {Object} costs - { skill: 1 }
   * @returns {{ok: boolean, missing?: Object}}
   */
  canAfford(costs = {}) {
    const missing = {};
    let ok = true;

    // 先合并同物理池的消耗，避免共享池下分别判定导致超支
    const merged = new Map();
    for (const [pool, amount] of Object.entries(costs)) {
      if (typeof amount !== 'number' || amount <= 0) continue;
      const key = this._resolvePool(pool);
      merged.set(key, (merged.get(key) || 0) + amount);
    }

    for (const [key, amount] of merged) {
      const available = this.getAvailable(key);
      if (available < amount) {
        ok = false;
        missing[key] = amount - available;
      }
    }

    return ok ? { ok: true } : { ok: false, missing };
  }

  /**
   * 扣除点数；不足时不做任何修改
   * @param {Object} costs
   * @returns {boolean} 是否成功
   */
  spend(costs = {}) {
    const check = this.canAfford(costs);
    if (!check.ok) return false;

    for (const [pool, amount] of Object.entries(costs)) {
      if (typeof amount !== 'number' || amount <= 0) continue;
      const entry = this._ensurePool(pool);
      entry.available -= amount;
      entry.spent += amount;
    }
    return true;
  }

  /**
   * 返还点数
   * @param {Object} costs
   */
  refund(costs = {}) {
    for (const [pool, amount] of Object.entries(costs)) {
      if (typeof amount !== 'number' || amount <= 0) continue;
      const entry = this._ensurePool(pool);
      entry.available += amount;
      entry.spent = Math.max(0, entry.spent - amount);
    }
  }

  /** 序列化 */
  serialize() {
    const pools = {};
    for (const [pool, entry] of this.pools) {
      pools[pool] = { available: entry.available, spent: entry.spent };
    }
    return { pools, aliases: { ...this.aliases } };
  }

  /**
   * 从存档恢复
   * @param {Object} data
   * @returns {PointLedger}
   */
  static deserialize(data) {
    const ledger = new PointLedger({ aliases: data && data.aliases });
    for (const [pool, entry] of Object.entries((data && data.pools) || {})) {
      ledger.pools.set(pool, {
        available: typeof entry.available === 'number' ? entry.available : 0,
        spent: typeof entry.spent === 'number' ? entry.spent : 0
      });
    }
    return ledger;
  }
}

export default PointLedger;
