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
 * Blackboard - 全局变量黑板（剧情变量/开关的状态容器）
 *
 * DSL（ExpressionEngine / TriggerSystem）读写状态的唯一入口。
 * 状态可序列化，供存档与（将来）网络同步。
 *
 * authority: 'server'  // 剧情/进度状态属权威状态；单机本地跑，联网由服务器托管
 *
 * 约定（见 editor-architecture.md §13）：只存可序列化的纯数据，
 * 不存函数/DOM/实体引用。
 */
export class Blackboard {
  constructor() {
    this._vars = {};
    this._listeners = [];
  }

  /**
   * 用初值初始化（GameLoader 传入 GameProject.variables）
   * @param {Object} vars
   */
  init(vars = {}) {
    this._vars = { ...vars };
    for (const [k, v] of Object.entries(this._vars)) this._emit(k, v, undefined);
  }

  /** 取变量值 */
  get(key) {
    return this._vars[key];
  }

  /** 设变量值（值变化时触发 change 事件） */
  set(key, value) {
    const old = this._vars[key];
    this._vars[key] = value;
    if (old !== value) this._emit(key, value, old);
  }

  /** 数值增减 */
  add(key, delta = 1) {
    this.set(key, (Number(this._vars[key]) || 0) + delta);
  }

  /** 布尔取反 */
  toggle(key) {
    this.set(key, !this._vars[key]);
  }

  /** 是否存在该键 */
  has(key) {
    return Object.prototype.hasOwnProperty.call(this._vars, key);
  }

  /** 取全部变量的浅拷贝 */
  all() {
    return { ...this._vars };
  }

  /**
   * 监听变量变化
   * @param {Function} cb - (key, newValue, oldValue) => void
   * @returns {Function} 取消监听
   */
  onChange(cb) {
    this._listeners.push(cb);
    return () => {
      const i = this._listeners.indexOf(cb);
      if (i !== -1) this._listeners.splice(i, 1);
    };
  }

  _emit(key, value, old) {
    for (const cb of this._listeners) {
      try { cb(key, value, old); } catch (e) { console.warn('Blackboard listener error', e); }
    }
  }

  /** 序列化（存档/网络） */
  serialize() {
    return { ...this._vars };
  }

  /** 反序列化 */
  deserialize(data) {
    this._vars = { ...(data || {}) };
  }

  /** 重置 */
  reset() {
    this._vars = {};
  }
}

export default Blackboard;
