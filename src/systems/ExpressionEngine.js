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
 * ExpressionEngine - 数据化条件/取值求值器（B2 DSL）
 *
 * 条件与取值用 JSON 结构表达（编辑器可出表单），跨语言（将来 Go 端可实现同一套解释器）。
 * authority: 'shared'  // 纯函数求值，无副作用；客户端与服务器可各自求值
 *
 * 求值上下文 ctx：{ blackboard, player, questSystem, sceneManager, world }
 *
 * 表达式节点：
 *   字面量：       3 / "x" / true
 *   取值：         { "var": "killCount" } / { "flag": "hasSword" }
 *   逻辑：         { "op":"and|or", "args":[...] } / { "op":"not", "arg":... }
 *   比较：         { "op":"==|!=|>|>=|<|<=", "left":..., "right":... }
 *   变量/开关：    { "op":"var", "name":"x" } / { "op":"flag", "name":"x" }
 *   任务状态：     { "op":"questState", "quest":"q1", "state":"completed" }
 *   持有物品：     { "op":"hasItem", "item":"potion", "count":1 }
 *   距离/区域：    { "op":"distanceTo", "x":.., "y":.. } / { "op":"inRegion", "region":"r1" }
 */
export class ExpressionEngine {
  /**
   * @param {Object} ctx - 求值上下文
   */
  constructor(ctx = {}) {
    this.ctx = ctx;
  }

  setContext(ctx) {
    this.ctx = ctx || {};
  }

  /**
   * 求值。空表达式(null/undefined)视为 true（无条件）。
   * @param {*} expr
   * @returns {*}
   */
  eval(expr) {
    if (expr == null) return true;
    if (typeof expr !== 'object') return expr;         // 字面量
    if (Array.isArray(expr)) return expr;              // 数组字面量

    // 取值简写；带比较 op 与 value 时按紧凑比较语义求值：
    //   { "op":"==", "var":"x", "value":false }  ≡  x === false
    if ('var' in expr) {
      const value = this._getVar(expr.var);
      return expr.op && 'value' in expr ? this._compare(expr.op, value, expr.value) : value;
    }
    if ('flag' in expr) {
      const value = !!this._getVar(expr.flag);
      return expr.op && 'value' in expr ? this._compare(expr.op, value, expr.value) : value;
    }

    const op = expr.op;
    switch (op) {
      case 'and': return (expr.args || []).every(a => this._truthy(this.eval(a)));
      case 'or':  return (expr.args || []).some(a => this._truthy(this.eval(a)));
      case 'not': return !this._truthy(this.eval(expr.arg));

      case '==': return this.eval(expr.left) === this.eval(expr.right);
      case '!=': return this.eval(expr.left) !== this.eval(expr.right);
      case '>':  return this.eval(expr.left) >  this.eval(expr.right);
      case '>=': return this.eval(expr.left) >= this.eval(expr.right);
      case '<':  return this.eval(expr.left) <  this.eval(expr.right);
      case '<=': return this.eval(expr.left) <= this.eval(expr.right);

      case 'var':  return this._getVar(expr.name ?? expr.key);
      case 'flag': return !!this._getVar(expr.name ?? expr.key);

      case 'questState': return this._questState(expr.quest, expr.state);
      case 'hasItem':    return this._hasItem(expr.item, expr.count || 1);
      case 'distanceTo': return this._distanceTo(expr.x, expr.y);
      case 'inRegion':   return this._inRegion(expr.region);

      default:
        console.warn('ExpressionEngine: 未知 op', op);
        return false;
    }
  }

  /** 紧凑比较：左侧可为任意求值结果，右侧按字面量参与比较。 */
  _compare(op, left, right) {
    switch (op) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '>':  return left > right;
      case '>=': return left >= right;
      case '<':  return left < right;
      case '<=': return left <= right;
      default:   return this.eval(right) === left;
    }
  }

  _truthy(v) { return !!v; }

  /**
   * 取值：优先扁平键直接命中；未命中且形如 `story.a.b` 时，回退到
   * 黑板 `storyState` 的嵌套点路径（触发器/步骤 if / branch when 的统一读法）。
   */
  _getVar(key) {
    const board = this.ctx.blackboard;
    if (!board) return undefined;
    const direct = board.get(key);
    if (direct !== undefined) return direct;
    if (typeof key === 'string' && key.startsWith('story.')) {
      const story = board.get('storyState');
      if (story == null) return undefined;
      const path = key.slice('story.'.length).split('.').filter(Boolean);
      return path.reduce((value, part) => (value == null ? undefined : value[part]), story);
    }
    return direct;
  }

  _questState(questId, state) {
    const qs = this.ctx.questSystem;
    if (!qs || !qs.getQuest) return false;
    const q = qs.getQuest(questId);
    if (!q) return false;
    // 兼容不同实现：state 字段或 completed/active 判断
    if (q.state !== undefined) return q.state === state;
    if (state === 'completed') return !!q.completed;
    if (state === 'active') return !!q.active;
    return false;
  }

  _hasItem(itemId, count) {
    const player = this.ctx.player;
    if (!player || !player.getComponent) return false;
    const inv = player.getComponent('inventory');
    if (!inv) return false;
    if (typeof inv.getItemCount === 'function') return inv.getItemCount(itemId) >= count;
    if (typeof inv.hasItem === 'function') return inv.hasItem(itemId);
    return false;
  }

  _distanceTo(x, y) {
    const player = this.ctx.player;
    const t = player && player.getComponent && player.getComponent('transform');
    if (!t) return Infinity;
    return Math.hypot(t.position.x - x, t.position.y - y);
  }

  _inRegion(regionId) {
    const w = this.ctx.world;
    if (w && typeof w.isPlayerInRegion === 'function') return w.isPlayerInRegion(regionId);
    return false;
  }
}

export default ExpressionEngine;
