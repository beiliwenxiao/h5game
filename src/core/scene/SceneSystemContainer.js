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
 * SceneSystemContainer.js
 * 场景系统容器：依赖注入、显式更新顺序、统一清理。
 *
 * 从 BaseGameScene 的手工装配中提取。原实现把十余个系统的创建、
 * 更新顺序和清理散落在 enter/update/exit 中，容易出现：
 *   - 更新顺序被无意调整导致行为变化
 *   - 场景退出时漏清理某个系统，留下监听器或定时器
 *
 * 容器把顺序变成显式数据，并保证 destroy 覆盖全部已注册系统。
 */

export class SceneSystemContainer {
  /**
   * @param {Object} [config]
   * @param {Function} [config.onError] - (phase, name, error) => void
   */
  constructor(config = {}) {
    /** @type {Map<string, Object>} name -> { instance, order, update, render, destroy } */
    this.systems = new Map();
    /** 共享依赖，供 resolve 注入 */
    this.dependencies = {};
    this.onError = config.onError || ((phase, name, error) => {
      console.warn(`SceneSystemContainer: ${phase} 阶段出错 [${name}]`, error);
    });

    this._sortedCache = null;
  }

  /**
   * 提供共享依赖
   * @param {Object} deps
   */
  provide(deps = {}) {
    Object.assign(this.dependencies, deps);
  }

  /**
   * 获取依赖或已注册系统实例
   * @param {string} name
   * @returns {*}
   */
  resolve(name) {
    if (this.systems.has(name)) return this.systems.get(name).instance;
    return this.dependencies[name];
  }

  /**
   * 注册系统
   *
   * @param {string} name - 唯一标识
   * @param {Object|Function} systemOrFactory - 实例，或 (deps) => 实例
   * @param {Object} [options]
   * @param {number} [options.order] - 更新顺序，越小越先执行
   * @param {string|Function|false} [options.update] - 更新方法名或函数；false 表示不参与更新
   * @param {string|Function|false} [options.render] - 渲染方法名或函数
   * @param {string|Function|false} [options.destroy] - 清理方法名或函数
   * @returns {*} 系统实例
   */
  register(name, systemOrFactory, options = {}) {
    if (!name) {
      this.onError('register', String(name), new Error('系统必须提供名称'));
      return null;
    }

    const instance = typeof systemOrFactory === 'function' && !systemOrFactory.prototype?.update
      ? systemOrFactory(this.dependencies)
      : systemOrFactory;

    if (!instance) {
      this.onError('register', name, new Error('系统实例为空'));
      return null;
    }

    this.systems.set(name, {
      instance,
      order: typeof options.order === 'number' ? options.order : 100,
      update: options.update !== undefined ? options.update : 'update',
      render: options.render !== undefined ? options.render : false,
      destroy: options.destroy !== undefined ? options.destroy : 'destroy'
    });

    this._sortedCache = null;
    return instance;
  }

  /**
   * 批量注册
   * @param {Array<{name: string, system: *, options?: Object}>} list
   */
  registerAll(list = []) {
    for (const item of list) {
      this.register(item.name, item.system, item.options);
    }
  }

  /**
   * 注销系统并执行其清理
   * @param {string} name
   * @returns {boolean}
   */
  unregister(name) {
    const entry = this.systems.get(name);
    if (!entry) return false;

    this._invoke('destroy', name, entry, entry.destroy, []);
    this.systems.delete(name);
    this._sortedCache = null;
    return true;
  }

  /** 是否已注册 */
  has(name) {
    return this.systems.has(name);
  }

  /** 已注册系统名称 */
  getNames() {
    return Array.from(this.systems.keys());
  }

  /**
   * 按 order 排序的系统条目
   * @private
   */
  _sorted() {
    if (this._sortedCache) return this._sortedCache;

    this._sortedCache = Array.from(this.systems.entries())
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => a.order - b.order);

    return this._sortedCache;
  }

  /**
   * 调用系统的某个钩子
   * @private
   * @returns {boolean} 是否成功调用
   */
  _invoke(phase, name, entry, hook, args) {
    if (hook === false || hook === null) return false;

    try {
      if (typeof hook === 'function') {
        hook.apply(entry.instance, args);
        return true;
      }
      if (typeof hook === 'string' && typeof entry.instance[hook] === 'function') {
        entry.instance[hook](...args);
        return true;
      }
    } catch (e) {
      this.onError(phase, name, e);
    }
    return false;
  }

  /**
   * 按顺序更新全部系统。
   * 单个系统抛错不会中断其余系统。
   *
   * @param {number} deltaTime
   * @param {...*} extraArgs - 透传给系统 update 的额外参数
   */
  update(deltaTime, ...extraArgs) {
    for (const entry of this._sorted()) {
      this._invoke('update', entry.name, entry, entry.update, [deltaTime, ...extraArgs]);
    }
  }

  /**
   * 按顺序渲染声明了 render 的系统
   * @param {CanvasRenderingContext2D} ctx
   * @param {...*} extraArgs
   */
  render(ctx, ...extraArgs) {
    for (const entry of this._sorted()) {
      this._invoke('render', entry.name, entry, entry.render, [ctx, ...extraArgs]);
    }
  }

  /**
   * 清理全部系统。
   *
   * 按注册顺序的逆序清理，保证依赖方先于被依赖方释放；
   * 清理完成后容器清空，避免场景重入时残留旧实例。
   *
   * @returns {Array<string>} 已执行清理的系统名
   */
  destroy() {
    const cleaned = [];
    const reversed = this._sorted().slice().reverse();

    for (const entry of reversed) {
      if (this._invoke('destroy', entry.name, entry, entry.destroy, [])) {
        cleaned.push(entry.name);
      }
    }

    this.systems.clear();
    this.dependencies = {};
    this._sortedCache = null;
    return cleaned;
  }
}

export default SceneSystemContainer;
