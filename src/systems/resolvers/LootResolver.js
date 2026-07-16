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
 * LootResolver.js
 * 掉落结算纯函数（§13 约定4/5/6）—— 掉落判定集中、数据化、可复现。
 *
 * authority: 'server'
 *
 * 纯函数：输入掉落表 + RNG → 输出掉落物列表，不建实体、不改状态。
 * 掉落表项：{ itemId, chance, minQuantity=1, maxQuantity=1 }
 * RNG 注入（约定6），禁止 Math.random。
 */

export const LootResolver = {
  /**
   * 滚动一张掉落表
   * @param {Array<Object>} lootTable - [{ itemId, chance, minQuantity, maxQuantity }]
   * @param {Object} ctx - { rng }（RNG 实例）
   * @returns {Array<{itemId:string, quantity:number}>}
   */
  roll(lootTable, ctx = {}) {
    const out = [];
    if (!Array.isArray(lootTable)) return out;
    const rng = ctx.rng;
    const rand = rng ? () => rng.next() : Math.random;

    for (const entry of lootTable) {
      if (!entry || !entry.itemId) continue;
      const chance = entry.chance != null ? entry.chance : 1;
      if (rand() < chance) {
        const min = entry.minQuantity != null ? entry.minQuantity : 1;
        const max = entry.maxQuantity != null ? entry.maxQuantity : min;
        const quantity = Math.floor(rand() * (max - min + 1)) + min;
        if (quantity > 0) out.push({ itemId: entry.itemId, quantity });
      }
    }
    return out;
  },

  /**
   * 结算击杀奖励（掉落 + 经验 + 金钱），纯计算
   * @param {Object} args - { lootTable?, exp?, gold? }
   * @param {Object} ctx - { rng }
   * @returns {{ items:Array, exp:number, gold:number, events:Array }}
   */
  resolveKillReward({ lootTable = [], exp = 0, gold = 0 }, ctx = {}) {
    const items = this.roll(lootTable, ctx);
    const events = [{ type: 'loot', items, exp, gold }];
    return { items, exp, gold, events };
  }
};

export default LootResolver;
