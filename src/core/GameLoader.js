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

import { Blackboard } from './Blackboard.js';
import { ProgressionGraphSystem } from '../systems/progression/ProgressionGraphSystem.js';
import { ProgressionProfile } from '../systems/progression/ProgressionProfile.js';
import { SkillRegistry } from '../systems/ability/SkillRegistry.js';
import { createContentValidator } from './validation/ContentSchemas.js';
import { formatErrors } from './validation/ValidationError.js';
import { TriggerSystem } from '../systems/TriggerSystem.js';
import { registerDefaultActions } from '../systems/TriggerActions.js';
import { createStandardRegistries } from './Registry.js';

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
    // 内容库注册表（P2）：库与实例分离，运行时实例化引用库 id
    this.registries = createStandardRegistries();

    // 成长系统（技能树 / 职业天赋 / 兵种天赋 / 天赋盘）
    this.progressionProfile = null;
    this.progressionSystem = null;
    this.skillRegistry = new SkillRegistry();

    // 内容校验器：在修改运行状态之前拦截错误配置
    this.contentValidator = createContentValidator();
    /** 最近一次装配的校验错误，供错误提示界面读取 */
    this.lastValidationErrors = [];

    this._baseDir = '';
  }

  /**
   * 装配成长系统：Profile、成长图、技能定义。
   *
   * 校验失败的图或技能不会写入运行时，并通过返回值报告，
   * 保证错误配置不进入可运行状态。
   *
   * @param {Object} proj - GameProject
   * @param {Object} [deps] - { effectResolver }
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  assembleProgression(proj, deps = {}) {
    const config = proj && proj.progression;
    const errors = [];
    this.lastValidationErrors = [];

    // 先整体校验：非法配置不进入运行状态
    if (config) {
      const configCheck = this.contentValidator.validate(config, 'progressionConfig', 'progression');
      if (!configCheck.ok) {
        this.lastValidationErrors = configCheck.errors;
        console.warn('GameLoader: progression 配置校验失败，已跳过成长装配\n' + formatErrors(configCheck.errors));
        return { ok: false, errors: configCheck.errors };
      }
    }

    this.progressionProfile = new ProgressionProfile(config || {});
    const profileCheck = this.progressionProfile.validate();
    if (!profileCheck.ok) {
      errors.push(...profileCheck.errors.map(e => ({ ...e, path: `progression.${e.path}` })));
    }

    this.progressionSystem = new ProgressionGraphSystem({
      effectResolver: deps.effectResolver,
      profile: this.progressionProfile
    });

    if (!config) return { ok: errors.length === 0, errors };

    // 技能定义：Schema 校验通过后才注册
    const skills = config.skills && Array.isArray(config.skills.skills)
      ? config.skills.skills
      : (Array.isArray(config.skills) ? config.skills : []);

    const skillCheck = this.contentValidator.validateList(skills, 'skill', 'progression.skills');
    if (skillCheck.ok) {
      const skillResult = this.skillRegistry.registerAll(skills);
      for (const item of skillResult.errors) {
        errors.push({
          code: 'invalidSkill',
          path: `progression.skills.${item.id}`,
          message: JSON.stringify(item.errors)
        });
      }
    } else {
      errors.push(...skillCheck.errors);
    }

    // 成长图：Schema 校验通过后才交给成长系统
    for (const graphConfig of config.graphs || []) {
      const graphPath = `progression.graphs.${(graphConfig && graphConfig.id) || '<unknown>'}`;
      const graphCheck = this.contentValidator.validate(graphConfig, 'progressionGraph', graphPath);

      if (!graphCheck.ok) {
        errors.push(...graphCheck.errors);
        continue;
      }

      const result = this.progressionSystem.registerGraph(graphConfig);
      if (!result.ok) {
        errors.push(...result.errors.map(e => ({ ...e, path: `${graphPath}.${e.path}` })));
      }
    }

    this.lastValidationErrors = errors;
    return { ok: errors.length === 0, errors };
  }

  /**
   * 获取最近一次装配的校验错误文本，供错误提示界面显示
   * @returns {string}
   */
  getValidationReport() {
    return formatErrors(this.lastValidationErrors);
  }

  /** 取某类内容库注册表（npcs/enemies/items/equipment/shops/classes/skills/vehicles/buildings） */
  getRegistry(name) {
    return this.registries[name] || null;
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
      tutorial: deps.tutorial,
      onItemGained: deps.onItemGained,
      registries: this.registries
    });
    registerDefaultActions(this.triggerSystem);
    this.triggerSystem.registerAll(proj.triggers || []);
    // 引导 = 触发器（tutorials 直接作为触发器注册）
    this.triggerSystem.registerAll(proj.tutorials || []);

    // 3. 对话 → DialogueSystem（跳过 enabled:false 的停用对话）
    if (deps.dialogueSystem && Array.isArray(proj.dialogues)) {
      for (const d of proj.dialogues) {
        if (d.enabled === false) continue;
        deps.dialogueSystem.registerDialogue?.(d.id, d);
      }
    }

    // 4. 任务 → QuestSystem
    if (deps.questSystem && Array.isArray(proj.quests)) {
      for (const q of proj.quests) deps.questSystem.registerQuest?.(q);
    }

    // 5. 内容库 → 注册表（P2）：全部库类统一进 this.registries
    if (proj.library) {
      const lib = proj.library;
      for (const key of Object.keys(this.registries)) {
        if (Array.isArray(lib[key])) this.registries[key].registerAll(lib[key]);
      }
      // 若外部系统提供了自己的 registry（deps.registries），一并同步注册（桥接现有系统）
      if (deps.registries) {
        for (const [key, reg] of Object.entries(deps.registries)) {
          if (reg && typeof reg.register === 'function' && Array.isArray(lib[key])) {
            lib[key].forEach(def => reg.register(def));
          }
        }
      }
    }

    // 6. worldMap → WorldStreamingManager（P5，若提供）
    if (deps.world && deps.world.init && proj.worldMap) {
      const region = proj.worldMap.regions?.[0];
      if (region) {
        deps.world.init(region, proj, {
          entityFactory: deps.entityFactory || null,
          triggerSystem: this.triggerSystem,
          registries: this.registries
        });
      }
    }

    // 7. 成长系统 → ProgressionGraphSystem + SkillRegistry
    const progressionResult = this.assembleProgression(proj, deps);
    if (!progressionResult.ok) {
      console.warn('GameLoader: 成长配置存在问题，已跳过非法项', progressionResult.errors);
    }

    // 8. 事件源桥接（§4.4）：集中订阅各系统事件 → fire 到 TriggerSystem
    this.bridgeEventSources(deps);
  }

  /**
   * 事件源桥接（架构 §4.4）：把各系统发出的事件统一转成 TriggerSystem 的 fire。
   * 集中在此处接入，避免散落到各场景；系统无侵入（只订阅已有 emit/回调）。
   *
   * 已接入：
   *   - questSystem.on('questCompleted') → fire('questComplete', {quest})
   *   - questSystem.on('questProgress')  → fire('questProgress', {quest, objectiveType, targetId})
   *   - combatSystem.setOnKillCallback   → fire('kill', {enemyType, entityId, name})
   *
   * @param {Object} deps - { questSystem, combatSystem, ... }
   */
  bridgeEventSources(deps = {}) {
    const trig = this.triggerSystem;

    // 任务完成 / 进度（QuestSystem 已有 on/emit 机制）
    if (deps.questSystem && typeof deps.questSystem.on === 'function') {
      // 防重复订阅：同一 GameLoader 只桥接一次
      if (!this._questBridged) {
        this._questBridged = true;
        deps.questSystem.on('questCompleted', (d) => {
          const id = d && d.quest ? (d.quest.id || d.quest.questId) : undefined;
          trig.fire('questComplete', { quest: id });
        });
        deps.questSystem.on('questProgress', (d) => {
          trig.fire('questProgress', {
            quest: d && d.quest ? (d.quest.id || d.quest.questId) : undefined,
            objectiveType: d ? d.objectiveType : undefined,
            targetId: d ? d.targetId : undefined
          });
        });
      }
    }

    // 击杀（CombatSystem 击杀回调 → 通用 kill 事件源）
    if (deps.combatSystem && typeof deps.combatSystem.setOnKillCallback === 'function') {
      deps.combatSystem.setOnKillCallback((entity) => {
        trig.fire('kill', {
          enemyType: entity ? (entity.templateId || entity.type) : undefined,
          entityId: entity ? entity.id : undefined,
          name: entity ? entity.name : undefined
        });
      });
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

  /**
   * 序列化运行时状态（存档：黑板 + 触发器 once/cooldown + 角色成长）
   * @param {string} [characterId] - 提供时一并保存该角色的成长状态
   */
  serialize(characterId = null) {
    const data = {
      blackboard: this.blackboard.serialize(),
      triggers: this.triggerSystem.serialize()
    };

    if (characterId && this.progressionSystem) {
      data.progression = this.progressionSystem.serializeCharacter(characterId);
    }

    return data;
  }

  /**
   * 从存档恢复
   * @param {Object} data
   * @param {string} [characterId]
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  deserialize(data, characterId = null) {
    if (!data) return { ok: false, errors: [{ code: 'missingField', path: '', message: '存档为空' }] };

    this.blackboard.deserialize(data.blackboard);
    this.triggerSystem.deserialize(data.triggers);

    if (characterId && data.progression && this.progressionSystem) {
      return this.progressionSystem.deserializeCharacter(characterId, data.progression);
    }

    return { ok: true, errors: [] };
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
