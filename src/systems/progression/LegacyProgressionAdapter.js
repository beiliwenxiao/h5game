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
 * LegacyProgressionAdapter.js
 * 旧 API 适配器：保留 learnSkill / learnTalent 等调用方式，内部改用 ProgressionGraphSystem。
 *
 * 迁移收益：
 *   - 角色等级不再写回共享节点定义，多角色状态互相隔离
 *   - 效果统一经 EffectResolver 结算
 *   - 节点数据来自图配置，可导出为 JSON
 *
 * 兼容策略：
 *   - character.skillPoints / character.talentPoints 与内部 PointLedger 双向同步，
 *     调用方无需改写既有点数字段
 *   - 旧的 getPassiveEffects / getTalentEffects 仍返回自由键值对象
 */

import { ProgressionGraphSystem } from './ProgressionGraphSystem.js';
import { GraphMode, PointPool } from './GraphDefinition.js';
import { NodeKind } from './NodeDefinition.js';
import { LEGACY_FIELD_MAP } from '../effects/EffectTypes.js';

/** 标准效果目标 → 旧字段名的反向映射 */
const TARGET_TO_LEGACY = (() => {
  const map = new Map();
  for (const [legacyKey, mapping] of Object.entries(LEGACY_FIELD_MAP)) {
    map.set(`${mapping.type}|${mapping.target}|${mapping.operation}`, legacyKey);
  }
  return map;
})();

/** 点数字段名 */
const POINT_FIELD = {
  [PointPool.SKILL]: 'skillPoints',
  [PointPool.TALENT]: 'talentPoints',
  [PointPool.UNIT]: 'unitPoints',
  [PointPool.PASSIVE]: 'passivePoints'
};

export class LegacyProgressionAdapter {
  /**
   * @param {Object} [config]
   * @param {ProgressionGraphSystem} [config.progressionSystem] - 可注入的成长图系统
   * @param {Function} [config.resolveCharacterId] - (character) => string
   */
  constructor(config = {}) {
    this.progressionSystem = config.progressionSystem || new ProgressionGraphSystem();
    this.resolveCharacterId = config.resolveCharacterId || ((character) => {
      if (!character) return 'unknown-character';
      return String(character.id || character.characterId || character.name || 'default-character');
    });
  }

  /** 便捷访问统一效果结算器 */
  get effectResolver() {
    return this.progressionSystem.effectResolver;
  }

  /**
   * 注册图配置（通常来自 LegacyTreeConverter 或 JSON 配置）
   * @param {Array<Object>} graphConfigs
   * @returns {{registered: number, errors: Array<Object>}}
   */
  registerGraphs(graphConfigs = []) {
    return this.progressionSystem.registerGraphs(graphConfigs);
  }

  /**
   * 解析角色对应的图标识
   * @param {Object} character - 角色数据，需含 class
   * @param {string} mode - GraphMode
   * @returns {string|null}
   */
  resolveGraphId(character, mode) {
    const className = character && character.class ? character.class : null;
    if (!className) return null;

    const suffix = mode === GraphMode.CLASS_SKILL ? 'skill'
      : mode === GraphMode.CLASS_TALENT ? 'talent'
        : mode === GraphMode.UNIT_TALENT ? 'unit'
          : 'passive';

    const candidate = `${className}-${suffix}`;
    if (this.progressionSystem.getGraph(candidate)) return candidate;

    // 回退：按模式取第一张图，兼容自定义 id
    const graphs = this.progressionSystem.getGraphsByMode(mode);
    return graphs.length > 0 ? graphs[0].id : null;
  }

  /**
   * 把角色对象上的点数字段同步进内部账本
   * @private
   */
  _syncPointsIn(character, pool) {
    const field = POINT_FIELD[pool];
    if (!field) return;

    const characterId = this.resolveCharacterId(character);
    const ledger = this.progressionSystem.getLedger(characterId);
    const desired = typeof character[field] === 'number' ? character[field] : 0;
    const diff = desired - ledger.getAvailable(pool);

    if (diff > 0) ledger.grant(pool, diff);
    else if (diff < 0) ledger.spend({ [pool]: -diff });
  }

  /**
   * 把内部账本可用点数写回角色对象
   * @private
   */
  _syncPointsOut(character, pool) {
    const field = POINT_FIELD[pool];
    if (!field) return;

    const characterId = this.resolveCharacterId(character);
    character[field] = this.progressionSystem.getLedger(characterId).getAvailable(pool);
  }

  /**
   * 学习技能（旧 API）
   * @param {Object} character - 角色数据
   * @param {string} skillId - 技能节点标识
   * @returns {boolean} 是否成功
   */
  learnSkill(character, skillId) {
    return this._allocate(character, GraphMode.CLASS_SKILL, PointPool.SKILL, skillId).ok;
  }

  /**
   * 学习天赋（旧 API，返回 {success, message}）
   * @param {Object} character
   * @param {string} talentId
   * @returns {{success: boolean, message: string}}
   */
  learnTalent(character, talentId) {
    const result = this._allocate(character, GraphMode.CLASS_TALENT, PointPool.TALENT, talentId);
    if (!result.ok) {
      return { success: false, message: result.message || '学习失败' };
    }
    return { success: true, message: `成功学习天赋: ${result.name} (等级 ${result.rank})` };
  }

  /**
   * 通用分配
   * @private
   */
  _allocate(character, mode, pool, nodeId) {
    const graphId = this.resolveGraphId(character, mode);
    if (!graphId) return { ok: false, message: '未找到对应成长图' };

    const characterId = this.resolveCharacterId(character);
    this._syncPointsIn(character, pool);

    const result = this.progressionSystem.allocateNode(characterId, graphId, nodeId, {
      characterLevel: character && character.level ? character.level : 1
    });

    this._syncPointsOut(character, pool);
    if (!result.ok) return { ok: false, message: result.message, reason: result.reason };

    const node = this.progressionSystem.getGraph(graphId).getNode(nodeId);
    return { ok: true, rank: result.rank, name: node ? node.name : nodeId };
  }

  /**
   * 判断技能是否可学习（旧 API）
   * @param {Object} character
   * @param {string} skillId
   * @returns {boolean}
   */
  canLearnSkill(character, skillId) {
    const graphId = this.resolveGraphId(character, GraphMode.CLASS_SKILL);
    if (!graphId) return false;

    this._syncPointsIn(character, PointPool.SKILL);
    return this.progressionSystem.previewAllocate(
      this.resolveCharacterId(character),
      graphId,
      skillId,
      { characterLevel: character && character.level ? character.level : 1 }
    ).ok;
  }

  /**
   * 判断天赋是否可学习（旧 API，返回 {canLearn, reason}）
   * @param {Object} character
   * @param {string} talentId
   * @returns {{canLearn: boolean, reason: string}}
   */
  canLearnTalent(character, talentId) {
    const graphId = this.resolveGraphId(character, GraphMode.CLASS_TALENT);
    if (!graphId) return { canLearn: false, reason: '未找到天赋树' };

    this._syncPointsIn(character, PointPool.TALENT);
    const preview = this.progressionSystem.previewAllocate(
      this.resolveCharacterId(character),
      graphId,
      talentId,
      { characterLevel: character && character.level ? character.level : 1 }
    );

    return preview.ok
      ? { canLearn: true, reason: '' }
      : { canLearn: false, reason: preview.message || '不满足条件' };
  }

  /**
   * 重置技能树（旧 API，返回返还点数）
   * @param {Object} character
   * @returns {number}
   */
  resetSkillTree(character) {
    return this._reset(character, GraphMode.CLASS_SKILL, PointPool.SKILL);
  }

  /**
   * 重置天赋树（旧 API，返回返还点数）
   * @param {Object} character
   * @returns {number}
   */
  resetTalentTree(character) {
    return this._reset(character, GraphMode.CLASS_TALENT, PointPool.TALENT);
  }

  /**
   * 通用重置
   * @private
   */
  _reset(character, mode, pool) {
    const graphId = this.resolveGraphId(character, mode);
    if (!graphId) return 0;

    const characterId = this.resolveCharacterId(character);
    this._syncPointsIn(character, pool);

    const result = this.progressionSystem.resetGraph(characterId, graphId);
    this._syncPointsOut(character, pool);

    return (result.refunded && result.refunded[pool]) || 0;
  }

  /**
   * 获取被动技能效果（旧 API，返回自由键值对象）
   * @param {Object} character
   * @returns {Object}
   */
  getPassiveEffects(character) {
    return this._collectLegacyEffects(character, GraphMode.CLASS_SKILL, NodeKind.PASSIVE);
  }

  /**
   * 获取天赋效果（旧 API，返回自由键值对象）
   * @param {Object} character
   * @returns {Object}
   */
  getTalentEffects(character) {
    return this._collectLegacyEffects(character, GraphMode.CLASS_TALENT, null);
  }

  /**
   * 汇总已分配节点效果并还原为旧字段名，供尚未迁移的 UI 使用
   * @private
   * @param {Object} character
   * @param {string} mode
   * @param {string|null} kindFilter - 仅统计指定类型节点
   * @returns {Object}
   */
  _collectLegacyEffects(character, mode, kindFilter) {
    const graphId = this.resolveGraphId(character, mode);
    if (!graphId) return {};

    const graph = this.progressionSystem.getGraph(graphId);
    const characterId = this.resolveCharacterId(character);
    const state = this.progressionSystem.getState(characterId);
    const result = {};

    for (const { nodeId, rank } of state.getAllocations(graphId)) {
      const node = graph.getNode(nodeId);
      if (!node) continue;
      if (kindFilter && node.kind !== kindFilter) continue;

      for (const effect of node.getEffectsAtRank(rank)) {
        const legacyKey = TARGET_TO_LEGACY.get(`${effect.type}|${effect.target}|${effect.operation}`)
          || (typeof effect.target === 'string' && effect.target.startsWith('legacy.')
            ? effect.target.slice('legacy.'.length)
            : null);

        if (!legacyKey) continue;

        if (typeof effect.value === 'number') {
          result[legacyKey] = (typeof result[legacyKey] === 'number' ? result[legacyKey] : 0) + effect.value;
        } else if (result[legacyKey] === undefined) {
          result[legacyKey] = effect.value;
        }
      }
    }

    return result;
  }

  /**
   * 获取已学主动技能列表（旧 API）
   * @param {Object} character
   * @returns {Array<Object>}
   */
  getActiveSkills(character) {
    const graphId = this.resolveGraphId(character, GraphMode.CLASS_SKILL);
    if (!graphId) return [];

    const graph = this.progressionSystem.getGraph(graphId);
    const characterId = this.resolveCharacterId(character);
    const state = this.progressionSystem.getState(characterId);
    const skills = [];

    for (const { nodeId, rank } of state.getAllocations(graphId)) {
      const node = graph.getNode(nodeId);
      if (!node || node.kind !== NodeKind.ACTIVE_SKILL) continue;
      skills.push({
        id: node.id,
        name: node.name,
        description: node.description,
        level: rank
      });
    }

    return skills;
  }

  /**
   * 应用成长效果到角色属性。
   * 与旧 applyTalentEffects 行为一致，但结算统一走 EffectResolver。
   *
   * @param {Object} character
   * @param {Object} baseStats
   * @param {Array<string>} [targets] - 需要结算的属性字段
   * @returns {Object}
   */
  applyEffectsToStats(character, baseStats, targets = ['maxHp', 'maxMp', 'attack', 'defense', 'speed', 'hpRegen', 'manaRegen']) {
    const characterId = this.resolveCharacterId(character);
    const inputs = {};
    for (const key of targets) {
      inputs[key] = typeof baseStats[key] === 'number' ? baseStats[key] : 0;
    }

    const resolved = this.effectResolver.resolveAll(characterId, inputs);
    const modified = { ...baseStats };

    for (const key of targets) {
      if (resolved[key] !== inputs[key] || typeof baseStats[key] === 'number') {
        modified[key] = resolved[key];
      }
    }

    return modified;
  }

  /**
   * 获取节点当前等级
   * @param {Object} character
   * @param {string} mode - GraphMode
   * @param {string} nodeId
   * @returns {number}
   */
  getNodeRank(character, mode, nodeId) {
    const graphId = this.resolveGraphId(character, mode);
    if (!graphId) return 0;
    return this.progressionSystem.getRank(this.resolveCharacterId(character), graphId, nodeId);
  }

  /**
   * 获取 UI 视图模型
   * @param {Object} character
   * @param {string} mode - GraphMode
   * @returns {Object|null}
   */
  getViewModel(character, mode) {
    const graphId = this.resolveGraphId(character, mode);
    if (!graphId) return null;
    return this.progressionSystem.getViewModel(this.resolveCharacterId(character), graphId, {
      characterLevel: character && character.level ? character.level : 1
    });
  }

  /**
   * 序列化角色成长数据
   * @param {Object} character
   * @returns {Object}
   */
  serialize(character) {
    return this.progressionSystem.serializeCharacter(this.resolveCharacterId(character));
  }

  /**
   * 恢复角色成长数据
   * @param {Object} character
   * @param {Object} data
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  deserialize(character, data) {
    const result = this.progressionSystem.deserializeCharacter(this.resolveCharacterId(character), data);
    if (result.ok) {
      this._syncPointsOut(character, PointPool.SKILL);
      this._syncPointsOut(character, PointPool.TALENT);
    }
    return result;
  }
}

export default LegacyProgressionAdapter;
