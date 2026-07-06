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

import { Blackboard } from './Blackboard.js';
import { TriggerSystem } from '../systems/TriggerSystem.js';
import { registerDefaultActions } from '../systems/TriggerActions.js';

/**
 * GameLoader - 数据驱动游戏装配器（P4）
 *
 * 读取 GameProject（单一数据源），装配运行时系统：
 *   variables → Blackboard
 *   triggers  → TriggerSystem（+默认动作）
 *   dialogues → DialogueSystem（若提供）
 *   quests    → QuestSystem（若提供）
 *   library   → 各系统 registry（若提供）
 *   worldMap  → WorldStreamingManager（P5，若提供）
 *
 * 取代 PrologueManager 的手写装配（分步迁移，先做地基，不破坏现有场景）。
 * 支持 $ref 分文件：{ "$ref": "scenes/a.json" } 会被加载替换。
 */
export class GameLoader {
  constructor() {
    this.project = null;
    this.blackboard = new Blackboard();
    this.triggerSystem = new TriggerSystem();
    this._baseDir = '';
  }

  /**
   * 加载并装配游戏工程
   * @param {string} url - GameProject.json 路径
   * @param {Object} deps - 运行时依赖：
   *   { dialogueSystem, questSystem, sceneManager, world, player,
   *     audioManager, floatingText, tutorial, registries }
   * @returns {Promise<Object>} 解析后的 project
   */
  async load(url, deps = {}) {
    this._baseDir = url.substring(0, url.lastIndexOf('/') + 1);
    const proj = await this._loadJson(url);
    await this._resolveRefs(proj);
    this.project = proj;
    this.assemble(proj, deps);
    return proj;
  }

  /**
   * 用已解析的 project 对象直接装配（无需 fetch，供编辑器/测试）
   * @param {Object} proj
   * @param {Object} deps
   */
  assemble(proj, deps = {}) {
    this.project = proj;

    // 1. 变量 → 黑板
    this.blackboard.init(proj.variables || {});

    // 2. 触发器 → TriggerSystem
    this.triggerSystem.reset();
    this.triggerSystem.init({
      blackboard: this.blackboard,
      dialogue: deps.dialogueSystem,
      questSystem: deps.questSystem,
      sceneManager: deps.sceneManager,
      world: deps.world,
      player: deps.player,
      audioManager: deps.audioManager,
      floatingText: deps.floatingText,
      tutorial: deps.tutorial
    });
    registerDefaultActions(this.triggerSystem);
    this.triggerSystem.registerAll(proj.triggers || []);
    // 引导 = 触发器（tutorials 直接作为触发器注册）
    this.triggerSystem.registerAll(proj.tutorials || []);

    // 3. 对话 → DialogueSystem
    if (deps.dialogueSystem && Array.isArray(proj.dialogues)) {
      for (const d of proj.dialogues) deps.dialogueSystem.registerDialogue?.(d.id, d);
    }

    // 4. 任务 → QuestSystem
    if (deps.questSystem && Array.isArray(proj.quests)) {
      for (const q of proj.quests) deps.questSystem.registerQuest?.(q);
    }

    // 5. 内容库 → 各系统 registry（P2 接入；registries 可选）
    if (deps.registries && proj.library) {
      const lib = proj.library;
      const reg = deps.registries;
      if (reg.enemies && Array.isArray(lib.enemies)) lib.enemies.forEach(e => reg.enemies.register?.(e));
      if (reg.npcs && Array.isArray(lib.npcs)) lib.npcs.forEach(n => reg.npcs.register?.(n));
      if (reg.items && Array.isArray(lib.items)) lib.items.forEach(i => reg.items.register?.(i));
      if (reg.shops && Array.isArray(lib.shops)) lib.shops.forEach(s => reg.shops.register?.(s));
    }

    // 6. worldMap → WorldStreamingManager（P5，若提供）
    if (deps.world && deps.world.init && proj.worldMap) {
      deps.world.init(proj.worldMap.regions?.[0], proj);
    }
  }

  /** 更新触发器/表达式上下文（如玩家实体创建后） */
  updateContext(patch = {}) {
    this.triggerSystem.updateContext(patch);
  }

  /** 每帧更新（timer 触发器） */
  update(dt) {
    this.triggerSystem.update(dt);
  }

  /** 序列化运行时状态（存档：黑板 + 触发器 once/cooldown） */
  serialize() {
    return {
      blackboard: this.blackboard.serialize(),
      triggers: this.triggerSystem.serialize()
    };
  }

  deserialize(data) {
    if (!data) return;
    this.blackboard.deserialize(data.blackboard);
    this.triggerSystem.deserialize(data.triggers);
  }

  // ---- 内部：加载 + $ref 解析 ----

  async _loadJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('GameLoader: 加载失败 ' + url);
    return res.json();
  }

  /**
   * 递归解析对象/数组中的 { "$ref": "相对路径" }，加载并替换
   * @private
   */
  async _resolveRefs(node) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        node[i] = await this._resolveNode(node[i]);
      }
    } else if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        node[key] = await this._resolveNode(node[key]);
      }
    }
    return node;
  }

  async _resolveNode(value) {
    if (value && typeof value === 'object' && typeof value.$ref === 'string') {
      const loaded = await this._loadJson(this._baseDir + value.$ref);
      await this._resolveRefs(loaded);
      return loaded;
    }
    if (value && typeof value === 'object') {
      await this._resolveRefs(value);
    }
    return value;
  }
}

export default GameLoader;
