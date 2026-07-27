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
 * SkillRegistry.js
 * 技能定义注册表：配置驱动，定义只读且全局共享。
 */

import { SkillDefinition } from './SkillDefinition.js';

export class SkillRegistry {
  constructor() {
    /** @type {Map<string, SkillDefinition>} */
    this.definitions = new Map();
  }

  /**
   * 注册单个技能定义
   * @param {SkillDefinition|Object} definition
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  register(definition) {
    const def = definition instanceof SkillDefinition
      ? definition
      : new SkillDefinition(definition);

    const result = def.validate();
    if (!result.ok) return result;

    this.definitions.set(def.id, def);
    return { ok: true, errors: [] };
  }

  /**
   * 批量注册；任一项非法时不写入该项，并汇总错误
   * @param {Array<Object>} list
   * @returns {{registered: number, errors: Array<Object>}}
   */
  registerAll(list = []) {
    let registered = 0;
    const errors = [];
    for (const item of list) {
      const result = this.register(item);
      if (result.ok) registered++;
      else errors.push({ id: item && item.id, errors: result.errors });
    }
    return { registered, errors };
  }

  /**
   * 批量注册旧版技能对象
   * @param {Array<Object>} legacyList
   * @returns {{registered: number, errors: Array<Object>}}
   */
  registerLegacyAll(legacyList = []) {
    return this.registerAll(legacyList.map(l => SkillDefinition.fromLegacy(l)));
  }

  /**
   * 获取定义
   * @param {string} skillId
   * @returns {SkillDefinition|null}
   */
  get(skillId) {
    return this.definitions.get(skillId) || null;
  }

  /** 是否存在 */
  has(skillId) {
    return this.definitions.has(skillId);
  }

  /** 全部定义 */
  getAll() {
    return Array.from(this.definitions.values());
  }

  /**
   * 按标签查询
   * @param {string} tag
   * @returns {Array<SkillDefinition>}
   */
  getByTag(tag) {
    return this.getAll().filter(d => d.tags.includes(tag));
  }

  /**
   * 按分类查询
   * @param {string} category
   * @returns {Array<SkillDefinition>}
   */
  getByCategory(category) {
    return this.getAll().filter(d => d.category === category);
  }

  /** 清空 */
  clear() {
    this.definitions.clear();
  }

  /** 输出规范 JSON 数组 */
  toJSON() {
    return this.getAll().map(d => d.toJSON());
  }
}

export default SkillRegistry;
