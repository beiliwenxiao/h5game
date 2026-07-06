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
 * RNG.js
 * 可注入的确定性随机数发生器（§13 约定6）
 *
 * authority: 'server'  // 结算用的随机必须确定、可复现（服务器权威 / 战斗回放 / 断线重连）
 *
 * 结算逻辑（Resolver）禁止直接用 Math.random()/Date.now()，改用注入的 RNG：
 *   const rng = new RNG(seed);
 *   rng.next()            // [0,1)
 *   rng.int(min, max)     // [min,max] 整数
 *   rng.chance(p)         // p 概率返回 true
 *   rng.pick(arr)         // 数组随机取一
 * 状态可 serialize/deserialize，保证同种子同序列（§13 约定3/6）。
 *
 * 算法：mulberry32（快速、无依赖、足够均匀，用于游戏逻辑随机）。
 */
export class RNG {
  /**
   * @param {number} [seed] - 32 位整数种子；不传则用时间戳（此时不可复现，仅单机演示）
   */
  constructor(seed) {
    this._state = (seed != null ? seed : (Date.now() >>> 0)) >>> 0;
  }

  /** 下一个 [0,1) 浮点 */
  next() {
    // mulberry32
    this._state = (this._state + 0x6D2B79F5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min,max] 闭区间整数 */
  int(min, max) {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** [min,max) 浮点 */
  float(min, max) {
    return min + this.next() * (max - min);
  }

  /** 以 p 概率返回 true（p∈[0,1]） */
  chance(p) {
    return this.next() < p;
  }

  /** 从数组随机取一个元素 */
  pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** 序列化当前状态（存档/回放） */
  serialize() {
    return { state: this._state };
  }

  deserialize(data) {
    if (data && data.state != null) this._state = data.state >>> 0;
  }
}

/**
 * 便捷工厂：创建一个 () => [0,1) 的函数（供只需要一个 rng() 的场景）
 * @param {number} [seed]
 * @returns {Function}
 */
export function createRNG(seed) {
  const rng = new RNG(seed);
  const fn = () => rng.next();
  fn.rng = rng;
  return fn;
}

export default RNG;
