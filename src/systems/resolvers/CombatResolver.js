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
 * CombatResolver.js
 * 战斗结算纯函数（§13 约定1/5/6）—— 权威伤害裁决集中于此，便于将来 Golang 移植/服务器权威。
 *
 * authority: 'server'
 *
 * 设计：
 *   - 纯函数：输入快照 + 意图 → 输出 { damage, dead, targetHp, events }，不改渲染/DOM/全局。
 *   - 不直接扣血：调用方拿 damage 后自行 applyDamage（表现层订阅 events 做飘字/动画）。
 *   - 随机走注入的 RNG（ctx.rng: RNG 实例），禁止 Math.random（约定6）。
 *   - 元素/兵种相克等可注入计算器（ctx.elementCalc/ctx.unitCalc），保持解耦；缺省走基础公式。
 *
 * 快照(combatant snapshot)字段（从实体 stats 提取，纯数据、可序列化）：
 *   { attack, defense, hp, maxHp, element, unitType, moraleMultiplier }
 */

export const CombatResolver = {
  /**
   * 结算一次攻击（基础/技能通用）
   * @param {Object} args
   * @param {Object} args.attacker - 攻击者快照 { attack, element, unitType, moraleMultiplier }
   * @param {Object} args.target   - 目标快照 { defense, hp, maxHp, element, unitType, moraleMultiplier }
   * @param {Object} [args.skill]  - 技能 { power?, element?, multiplier? }（普攻可省）
   * @param {Object} ctx - { rng, elementCalc?, unitCalc? }
   *   rng: RNG 实例（必需，用于波动/最小伤害/暴击）
   *   elementCalc(atkSnap, tgtSnap, elementType, dmg) => dmg
   *   unitCalc(atkSnap, tgtSnap, dmg) => dmg
   * @returns {{ damage:number, dead:boolean, targetHp:number, events:Array }}
   */
  resolveAttack({ attacker, target, skill = null }, ctx = {}) {
    const events = [];
    if (!attacker || !target) return { damage: 0, dead: false, targetHp: target ? target.hp : 0, events };

    const rng = ctx.rng;
    const rand = rng ? () => rng.next() : Math.random; // 兜底（不推荐，联网需注入）

    // 属性（已含状态效果的修改值应由调用方传入快照）
    let attack = attacker.attack || 0;
    let defense = target.defense || 0;

    // 士气加成
    if (attacker.moraleMultiplier) attack *= attacker.moraleMultiplier;
    if (target.moraleMultiplier) defense *= target.moraleMultiplier;

    // 技能威力/倍率
    if (skill) {
      if (skill.power) attack += skill.power;
      if (skill.multiplier) attack *= skill.multiplier;
    }

    // 基础公式：攻击 - 防御，最低 1
    let dmg = Math.max(1, attack - defense);

    // 兵种相克（可注入）
    if (typeof ctx.unitCalc === 'function') {
      dmg = ctx.unitCalc(attacker, target, dmg);
    }

    // 元素相克（可注入）
    const elementType = (skill && skill.element != null) ? skill.element
      : (attacker.element != null ? attacker.element : 0);
    if (typeof ctx.elementCalc === 'function') {
      dmg = ctx.elementCalc(attacker, target, elementType, dmg);
    }

    // ±10% 波动
    const variance = 0.1;
    const randomFactor = 1 + (rand() * 2 - 1) * variance;
    dmg = Math.floor(dmg * randomFactor);

    // 最小伤害 1~5
    const minDamage = Math.floor(rand() * 5) + 1;
    dmg = Math.max(minDamage, dmg);

    // 结算目标血量（纯计算，不写回实体）
    const targetHp = Math.max(0, (target.hp || 0) - dmg);
    const dead = targetHp <= 0;

    events.push({ type: 'damage', amount: dmg, element: elementType, dead });
    if (dead) events.push({ type: 'death' });

    return { damage: dmg, dead, targetHp, events };
  },

  /**
   * 从实体提取战斗快照（便于调用方；仍是纯读取）
   * @param {Entity} entity
   * @returns {Object|null}
   */
  snapshot(entity) {
    if (!entity || !entity.getComponent) return null;
    const s = entity.getComponent('stats');
    if (!s) return null;
    return {
      attack: s.attack,
      defense: s.defense,
      hp: s.hp,
      maxHp: s.maxHp,
      element: (typeof s.getMainElement === 'function') ? s.getMainElement() : (s.mainElement || 0),
      unitType: s.unitType || 0,
      moraleMultiplier: s.moraleMultiplier || 1
    };
  }
};

export default CombatResolver;
