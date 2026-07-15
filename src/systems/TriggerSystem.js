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

import { ExpressionEngine } from './ExpressionEngine.js';

/**
 * TriggerSystem - 数据驱动触发器（条件→动作），覆盖 引导/事件/幕切换
 *
 * authority: 'server'  // 触发器是权威逻辑（掉落/任务/切场景等）；单机本地跑，联网服务器执行
 *
 * 触发器数据（见 editor-architecture.md §4.2）：
 *   { id, when:{type,params}, if:<表达式>, do:[{action,params,await}], once, cooldown }
 *
 * 事件源：外部系统调用 fire(whenType, params) 通知事件发生；
 *   每帧 update(dt) 处理 timer 类触发器。
 * 动作：注册表 registerAction(name, fn)，fn(params, ctx) 为纯函数，返回 {events} 或 Promise。
 */
export class TriggerSystem {
  constructor() {
    this.triggers = [];
    this.actions = {};
    this.ctx = {};
    this.expr = new ExpressionEngine({});
    this._firedOnce = new Set();     // once 触发器已触发集合
    this._cooldowns = {};            // id -> 下次可触发时间戳
    this._timers = [];               // timer 触发器累计
    this._listeners = [];            // 事件监听（供表现层订阅 trigger 执行）
  }

  /**
   * 初始化上下文
   * @param {Object} ctx - { blackboard, player, questSystem, sceneManager, world, dialogue, ... }
   */
  init(ctx = {}) {
    this.ctx = { ...ctx, triggerSystem: this };
    this.expr.setContext(this.ctx);
  }

  /** 更新上下文（如玩家实体变化） */
  updateContext(patch = {}) {
    this.ctx = { ...this.ctx, ...patch };
    this.expr.setContext(this.ctx);
  }

  /** 注册动作处理器：fn(params, ctx) => void | {events} | Promise */
  registerAction(name, fn) {
    this.actions[name] = fn;
  }

  /** 批量注册动作 */
  registerActions(map = {}) {
    for (const [k, fn] of Object.entries(map)) this.registerAction(k, fn);
  }

  /** 注册一个触发器 */
  register(trigger) {
    if (!trigger || !trigger.when) return;
    this.triggers.push(trigger);
    if (trigger.when.type === 'timer') {
      this._timers.push({ trigger, elapsed: 0 });
    }
  }

  /** 批量注册 */
  registerAll(list = []) {
    for (const t of list) this.register(t);
  }

  /** 清空所有触发器与状态 */
  reset() {
    this.triggers = [];
    this._firedOnce.clear();
    this._cooldowns = {};
    this._timers = [];
  }

  /**
   * 事件源入口：某事件发生时由外部系统调用
   * @param {string} whenType - sceneEnter|enterRegion|dialogueEnd|kill|itemPickup|flagChange|interact|questComplete|chunkEnter...
   * @param {Object} params - 事件参数（用于与触发器 when.params 匹配）
   */
  fire(whenType, params = {}) {
    for (const t of this.triggers) {
      if (!t.when || t.when.type !== whenType) continue;
      if (!this._matchParams(t.when.params, params)) continue;
      this._tryRun(t);
    }
  }

  /** 每帧更新（处理 timer 类触发器） */
  update(dt) {
    if (this._timers.length === 0) return;
    for (const item of this._timers) {
      item.elapsed += dt;
      const interval = item.trigger.when.params?.seconds || 0;
      if (interval > 0 && item.elapsed >= interval) {
        item.elapsed = 0;
        this._tryRun(item.trigger);
      }
    }
  }

  /** 判断事件参数是否匹配触发器 when.params（触发器未指定的字段视为通配） */
  _matchParams(want = {}, got = {}) {
    if (!want) return true;
    for (const [k, v] of Object.entries(want)) {
      if (v === undefined || v === null || v === '') continue; // 通配
      if (got[k] !== v) return false;
    }
    return true;
  }

  /** 尝试执行触发器（检查 once/cooldown/if 条件） */
  _tryRun(t) {
    // 停用的触发器不执行
    if (t.enabled === false) return;
    if (t.once && this._firedOnce.has(t.id)) return;
    const now = Date.now();
    if (t.cooldown && this._cooldowns[t.id] && now < this._cooldowns[t.id]) return;
    if (t.if && !this.expr.eval(t.if)) return;

    if (t.once) this._firedOnce.add(t.id);
    if (t.cooldown) this._cooldowns[t.id] = now + t.cooldown * 1000;

    this._runActions(t);
  }

  /** 顺序执行动作序列（支持 await 等待异步动作，如对话结束） */
  async _runActions(t) {
    this._emit('triggerStart', t);
    for (const act of t.do || []) {
      const fn = this.actions[act.action];
      if (!fn) { console.warn('TriggerSystem: 未注册动作', act.action); continue; }
      try {
        const r = fn(act.params || {}, this.ctx);
        if (act.await && r && typeof r.then === 'function') await r;
      } catch (e) {
        console.warn('TriggerSystem: 动作执行出错', act.action, e);
      }
    }
    this._emit('triggerEnd', t);
  }

  /** 监听触发器执行（表现层用） */
  on(cb) {
    this._listeners.push(cb);
    return () => {
      const i = this._listeners.indexOf(cb);
      if (i !== -1) this._listeners.splice(i, 1);
    };
  }

  _emit(evt, trigger) {
    for (const cb of this._listeners) {
      try { cb(evt, trigger); } catch (e) { /* ignore */ }
    }
  }

  /** 序列化触发器运行状态（once/cooldown），供存档 */
  serialize() {
    return {
      firedOnce: [...this._firedOnce],
      cooldowns: { ...this._cooldowns }
    };
  }

  deserialize(data) {
    if (!data) return;
    this._firedOnce = new Set(data.firedOnce || []);
    this._cooldowns = { ...(data.cooldowns || {}) };
  }
}

export default TriggerSystem;
