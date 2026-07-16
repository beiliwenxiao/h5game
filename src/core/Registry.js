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
 * Registry.js
 * 通用定义注册表（P2 内容库）—— 按 id 存放“定义(definition)”，与“实例(placement)”分离
 *
 * authority: 'shared'  // 纯数据定义，前后端共享（§13.4）
 *
 * 用于 GameProject.library 的各类：npcs/enemies/items/equipment/shops/classes/skills/vehicles/buildings。
 * 库存定义，场景 objects 引用库 id → 运行时实例化（§1 原则：库与实例分离）。
 */

export class Registry {
  /**
   * @param {string} [name] - 注册表名（调试用）
   * @param {string} [idKey] - 定义对象里作为主键的字段名，默认 'id'
   */
  constructor(name = 'registry', idKey = 'id') {
    this.name = name;
    this.idKey = idKey;
    this.map = new Map();
  }

  /** 注册一条定义（同 id 覆盖） */
  register(def) {
    if (!def) return this;
    const id = def[this.idKey];
    if (id == null) { console.warn(`Registry(${this.name}): 定义缺少 ${this.idKey}`, def); return this; }
    this.map.set(id, def);
    return this;
  }

  /** 批量注册 */
  registerAll(list = []) {
    for (const d of list) this.register(d);
    return this;
  }

  /** 取定义 */
  get(id) {
    return this.map.get(id) || null;
  }

  has(id) {
    return this.map.has(id);
  }

  /** 移除 */
  remove(id) {
    return this.map.delete(id);
  }

  /** 全部定义（数组） */
  all() {
    return [...this.map.values()];
  }

  /** 全部 id */
  ids() {
    return [...this.map.keys()];
  }

  get size() {
    return this.map.size;
  }

  clear() {
    this.map.clear();
  }

  /** 序列化为数组（存档/导出） */
  serialize() {
    return this.all();
  }
}

/**
 * 创建一组标准内容库注册表（对应 GameProject.library 的各类）
 * @returns {Object<string, Registry>}
 */
export function createStandardRegistries() {
  return {
    npcs: new Registry('npcs'),
    enemies: new Registry('enemies'),
    items: new Registry('items'),
    equipment: new Registry('equipment'),
    shops: new Registry('shops'),
    classes: new Registry('classes'),
    skills: new Registry('skills'),
    vehicles: new Registry('vehicles'),
    buildings: new Registry('buildings')
  };
}

export default Registry;
