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
import { BattleClient } from '../integration/BattleClient.js';
import { LocalMockTransport } from '../integration/LocalMockTransport.js';

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
  constructor(config = {}) {
    const {
      contentValidator = null,
      contentValidatorConfig = {},
      projectValidators = [],
      contentPolicy = null
    } = config || {};
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
    this.contentValidator = contentValidator || createContentValidator(contentValidatorConfig);
    this.projectValidators = Array.isArray(projectValidators)
      ? projectValidators.filter(validator => typeof validator === 'function')
      : [];
    if (typeof contentPolicy === 'function') {
      this.projectValidators.push(contentPolicy);
    } else if (typeof contentPolicy?.validateProject === 'function') {
      this.projectValidators.push(contentPolicy.validateProject.bind(contentPolicy));
    }
    /** 最近一次装配的校验错误，供错误提示界面读取 */
    this.lastValidationErrors = [];

    // 战斗集成只允许一个结果源；默认在有效工程装配时创建。
    this.battleTransport = null;
    this.battleClient = null;

    this._baseDir = '';
    this._loadGeneration = 0;
    this._disposed = false;
    this._eventSourceDisposers = [];
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
   * 在任何运行状态写入前完成工程、成长配置、触发器和内容库预检。
   * @returns {{ok: boolean, value: Object|null, errors: Array<Object>}}
   */
  validateProjectCandidate(project) {
    const loaded = this.contentValidator.loadCandidate(project, 'gameProject', this.project);
    if (!loaded.committed) return { ok: false, value: null, errors: loaded.errors };

    const candidate = loaded.value;
    const errors = [];
    errors.push(...this.contentValidator.validate(
      candidate.presentation,
      'presentationProfile',
      'presentation'
    ).errors);
    errors.push(...this.contentValidator.validate(
      candidate.assetManifest,
      'assetManifest',
      'assetManifest'
    ).errors);
    errors.push(...this.contentValidator.validateList(
      candidate.rescues || [],
      'rescueDefinition',
      'rescues'
    ).errors);
    const progression = candidate.progression;

    if (progression) {
      errors.push(...this.contentValidator.validate(
        progression,
        'progressionConfig',
        'progression'
      ).errors);

      const skills = progression.skills && Array.isArray(progression.skills.skills)
        ? progression.skills.skills
        : (Array.isArray(progression.skills) ? progression.skills : []);
      errors.push(...this.contentValidator.validateList(
        skills,
        'skill',
        'progression.skills'
      ).errors);

      for (const [index, graph] of (progression.graphs || []).entries()) {
        errors.push(...this.contentValidator.validate(
          graph,
          'progressionGraph',
          `progression.graphs[${index}]`
        ).errors);
      }
    }

    try {
      new TriggerSystem().registerAll([
        ...(candidate.triggers || []),
        ...(candidate.tutorials || [])
      ]);
    } catch (error) {
      errors.push({
        code: 'invalidTrigger',
        path: 'triggers',
        message: String(error && error.message ? error.message : error)
      });
    }

    for (const [libraryName, definitions] of Object.entries(candidate.library || {})) {
      if (!Array.isArray(definitions)) continue;
      const seen = new Set();
      definitions.forEach((definition, index) => {
        const id = definition && definition.id;
        const path = `library.${libraryName}[${index}].id`;
        if (typeof id !== 'string' || !id.trim()) {
          errors.push({ code: 'missingField', path, message: '内容库定义缺少稳定 id' });
        } else if (seen.has(id)) {
          errors.push({ code: 'duplicateId', path, message: `重复的内容库 id: ${id}` });
        }
        seen.add(id);
      });
    }

    const itemDefinitions = Array.isArray(candidate.library?.items) ? candidate.library.items : [];
    const itemIds = new Set(itemDefinitions.map(item => item?.id).filter(Boolean));
    const availableToolTypes = new Set(itemDefinitions
      .filter(item => item?.type === 'tool' && typeof item.toolType === 'string')
      .map(item => item.toolType));
    for (const [index, node] of (candidate.library?.resourceNodes || []).entries()) {
      if (!itemIds.has(node?.itemId)) {
        errors.push({
          code: 'invalidReference',
          path: `library.resourceNodes[${index}].itemId`,
          message: `资源节点引用了不存在的物品: ${node?.itemId}`
        });
      }
      if (node?.requiredToolType && !availableToolTypes.has(node.requiredToolType)) {
        errors.push({
          code: 'invalidReference',
          path: `library.resourceNodes[${index}].requiredToolType`,
          message: `资源节点要求的工具类型不存在: ${node.requiredToolType}`
        });
      }
    }

    for (const [index, city] of (candidate.variables?.cityStates || []).entries()) {
      errors.push(...this.contentValidator.validate(
        city, 'city', `variables.cityStates[${index}]`
      ).errors);
    }

    for (const validator of this.projectValidators) {
      try {
        const result = validator(candidate, { loader: this });
        const policyErrors = Array.isArray(result) ? result : (result?.errors || []);
        for (const error of policyErrors) {
          errors.push({
            code: error?.code || 'projectPolicy',
            path: error?.path || 'project',
            message: error?.message || '项目内容策略校验失败',
            ...(error && typeof error === 'object' ? error : {})
          });
        }
      } catch (error) {
        errors.push({
          code: 'projectPolicy',
          path: 'project',
          message: String(error?.message || error)
        });
      }
    }

    return { ok: errors.length === 0, value: candidate, errors };
  }

  /** 创建带结构化 errors 的公开内容校验异常。 */
  createValidationError(errors = []) {
    const error = new Error('GameLoader: 工程内容校验失败\n' + formatErrors(errors));
    error.name = 'ContentValidationError';
    error.errors = errors;
    return error;
  }

  _createValidationError(errors) {
    return this.createValidationError(errors);
  }

  _createBattleIntegration(project, deps = {}) {
    const battleConfig = project.integration.battle;
    if (battleConfig.resultSource === 'localMock') {
      const transport = new LocalMockTransport({ validator: this.contentValidator });
      return { transport, client: new BattleClient({ transport }) };
    }
    if (battleConfig.resultSource === 'external' && deps.battleTransport?.request) {
      return {
        transport: deps.battleTransport,
        client: new BattleClient({ transport: deps.battleTransport })
      };
    }
    throw this._createValidationError([{
      code: 'invalidResultSource',
      path: `integration.battle.${battleConfig.resultSource}`,
      message: `战斗结果源 ${battleConfig.resultSource} 当前不可用`
    }]);
  }

  /**
   * 获取最近一次装配的校验错误文本，供错误提示界面显示
   * @returns {string}
   */
  getValidationReport() {
    return formatErrors(this.lastValidationErrors);
  }

  /** 取某类内容库注册表。 */
  getRegistry(name) {
    return this.registries[name] || null;
  }

  /**
   * 在实例化前校验场景 ref 放置点，运行态防线仍由 PlacementSpawner 保留。
   * @param {Array<Object>} placements
   */
  validatePlacementReferences(placements = []) {
    const registryNames = {
      item: 'items', equipment: 'equipment', enemy: 'enemies', npc: 'npcs',
      building: 'buildings', vehicle: 'vehicles', resourceNode: 'resourceNodes'
    };
    const errors = [];
    for (const [index, placement] of (placements || []).entries()) {
      if (placement?.type !== 'ref' || !placement.kind) continue;
      const registryName = registryNames[placement.kind];
      if (!registryName) continue;
      const registry = this.registries[registryName];
      if (registry?.get?.(placement.ref)) continue;
      const key = placement.id || index;
      errors.push({
        code: 'invalidReference',
        path: `placements[${key}].ref`,
        message: `放置点引用了不存在的 ${placement.kind} 定义: ${placement.ref}`
      });
    }
    return { ok: errors.length === 0, errors };
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
    const generation = ++this._loadGeneration;
    this._disposed = false;
    const baseDir = url.substring(0, url.lastIndexOf('/') + 1);
    this._baseDir = baseDir;
    const proj = await this._loadJson(url);
    await this._resolveRefs(proj, baseDir);
    if (generation !== this._loadGeneration) return proj;
    return this.assemble(proj, deps);
  }

  /**
   * 用已解析的 project 对象直接装配（无需 fetch，供编辑器/测试）
   * @param {Object} proj
   * @param {Object} deps
   */
  assemble(proj, deps = {}) {
    const validation = this.validateProjectCandidate(proj);
    if (!validation.ok) {
      this.lastValidationErrors = validation.errors;
      throw this._createValidationError(validation.errors);
    }

    // 所有候选对象先在影子容器中建立；预检失败时不会触碰当前运行状态。
    const candidate = validation.value;
    const nextRegistries = createStandardRegistries();
    for (const key of Object.keys(nextRegistries)) {
      const definitions = candidate.library?.[key];
      if (Array.isArray(definitions)) nextRegistries[key].registerAll(definitions);
    }
    const battleIntegration = this._createBattleIntegration(candidate, deps);

    this._disposed = false;
    this.project = candidate;
    this.registries = nextRegistries;
    this.battleTransport = battleIntegration.transport;
    this.battleClient = battleIntegration.client;
    this.skillRegistry = new SkillRegistry();
    proj = candidate;

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
      battleClient: this.battleClient,
      registries: this.registries
    });
    registerDefaultActions(this.triggerSystem);
    // 项目触发器与 tutorials 共用稳定 ID 命名空间；合并预检避免失败后留下半注册状态。
    this.triggerSystem.registerAll([...(proj.triggers || []), ...(proj.tutorials || [])]);

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

    // 5. 内容库已在影子注册表中完整构建；此处只同步外部兼容 registry。
    if (proj.library && deps.registries) {
      const lib = proj.library;
      for (const [key, reg] of Object.entries(deps.registries)) {
        if (reg && typeof reg.register === 'function' && Array.isArray(lib[key])) {
          lib[key].forEach(def => reg.register(def));
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
    return proj;
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
    this._disposed = false;
    this._releaseEventSources();
    const trig = this.triggerSystem;

    // 任务完成 / 进度（QuestSystem 已有 on/emit 机制）
    const questSystem = deps.questSystem;
    if (questSystem && typeof questSystem.on === 'function') {
      const onQuestCompleted = (d) => {
        const id = d && d.quest ? (d.quest.id || d.quest.questId) : undefined;
        trig.fire('questComplete', { quest: id });
      };
      const onQuestProgress = (d) => {
        trig.fire('questProgress', {
          quest: d && d.quest ? (d.quest.id || d.quest.questId) : undefined,
          objectiveType: d ? d.objectiveType : undefined,
          targetId: d ? d.targetId : undefined
        });
      };
      questSystem.on('questCompleted', onQuestCompleted);
      this._eventSourceDisposers.push(() => questSystem.off?.('questCompleted', onQuestCompleted));
      questSystem.on('questProgress', onQuestProgress);
      this._eventSourceDisposers.push(() => questSystem.off?.('questProgress', onQuestProgress));
    }

    // 击杀（CombatSystem 击杀回调 → 通用 kill 事件源）
    const combatSystem = deps.combatSystem;
    if (combatSystem && typeof combatSystem.setOnKillCallback === 'function') {
      const onKill = (entity) => {
        trig.fire('kill', {
          enemyType: entity ? (entity.templateId || entity.type) : undefined,
          entityId: entity ? entity.id : undefined,
          name: entity ? entity.name : undefined
        });
      };
      combatSystem.setOnKillCallback(onKill);
      this._eventSourceDisposers.push(() => {
        if (combatSystem.onKillCallback === onKill) combatSystem.setOnKillCallback(null);
      });
    }
  }

  _releaseEventSources() {
    const disposers = this._eventSourceDisposers.splice(0).reverse();
    for (const disposer of disposers) {
      try {
        disposer();
      } catch (error) {
        console.warn('GameLoader: 事件源释放失败', error);
      }
    }
  }

  /** 释放事件桥接并使当前在途加载失效。 */
  dispose() {
    if (this._disposed) return false;
    this._disposed = true;
    this._loadGeneration++;
    this._releaseEventSources();
    return true;
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
    const text = await res.text();
    const parsed = this.contentValidator.parseJson(text);
    if (!parsed.ok) {
      const errors = parsed.errors.map(error => ({ ...error, resource: url }));
      this.lastValidationErrors = errors;
      throw this._createValidationError(errors);
    }
    return parsed.value;
  }

  /**
   * 递归解析对象/数组中的 { "$ref": "相对路径" }，加载并替换
   * @private
   */
  async _resolveRefs(node, baseDir = this._baseDir) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        node[i] = await this._resolveNode(node[i], baseDir);
      }
    } else if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        node[key] = await this._resolveNode(node[key], baseDir);
      }
    }
    return node;
  }

  async _resolveNode(value, baseDir = this._baseDir) {
    if (value && typeof value === 'object' && typeof value.$ref === 'string') {
      const loaded = await this._loadJson(baseDir + value.$ref);
      await this._resolveRefs(loaded, baseDir);
      return loaded;
    }
    if (value && typeof value === 'object') {
      await this._resolveRefs(value, baseDir);
    }
    return value;
  }
}

export default GameLoader;
