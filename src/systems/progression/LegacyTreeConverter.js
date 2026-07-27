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
 * LegacyTreeConverter.js
 * 把旧版硬编码的 SkillTree / TalentTree 节点转换为 GraphDefinition 配置。
 *
 * 转换后即可导出为 JSON 配置文件，实现“节点数据来自配置而非构造函数”。
 *
 * 数值语义与旧实现保持一致：
 *   number 值 → 按等级线性累计（旧 getCurrentEffects 为 value * currentLevel）
 *   数组值   → 按等级取对应项（旧实现取 value[level-1]）
 *   其他值   → 转为 rule.override，目标为 legacy.<key>，不静默丢弃
 */

import { GraphMode, PointPool } from './GraphDefinition.js';
import { NodeKind } from './NodeDefinition.js';
import { EffectType, EffectOperation, LEGACY_FIELD_MAP } from '../effects/EffectTypes.js';

/** 旧版天赋类型 → 天赋盘区域 */
const TALENT_TYPE_TO_REGION = {
  combat: 'combat',
  survival: 'survival',
  utility: 'utility',
  element: 'element'
};

/**
 * 把旧版自由键值效果对象转换为标准效果列表（保留按等级语义）
 * @param {Object} legacyEffects
 * @returns {Array<Object>}
 */
export function convertLegacyEffects(legacyEffects = {}) {
  const effects = [];

  for (const [key, value] of Object.entries(legacyEffects || {})) {
    const mapping = LEGACY_FIELD_MAP[key];

    if (mapping && (typeof value === 'number' || Array.isArray(value))) {
      effects.push({
        type: mapping.type,
        target: mapping.target,
        operation: mapping.operation,
        value
      });
      continue;
    }

    // 未登记字段保留为规则覆盖，可通过 EffectResolver.getRuleValue 读取
    effects.push({
      type: EffectType.RULE_OVERRIDE,
      target: `legacy.${key}`,
      operation: EffectOperation.OVERRIDE,
      value
    });
  }

  return effects;
}

/**
 * 转换单个旧版技能树节点
 * @param {Object} node - SkillTreeNode 实例或同结构对象
 * @returns {Object} NodeDefinition 配置
 */
export function convertSkillNode(node) {
  const isActive = node.type === 'active';
  const effects = convertLegacyEffects(node.effects);

  // 主动技能节点额外产出 skill.unlock，供 AbilitySystem 判定准入
  if (isActive) {
    effects.unshift({
      type: EffectType.SKILL_UNLOCK,
      target: node.id,
      value: true
    });
  }

  return {
    id: node.id,
    name: node.name,
    description: node.description || '',
    kind: isActive ? NodeKind.ACTIVE_SKILL : NodeKind.PASSIVE,
    maxRank: node.maxLevel || 1,
    costs: { [PointPool.SKILL]: node.requiredPoints || 1 },
    prerequisites: Array.isArray(node.prerequisites) ? [...node.prerequisites] : [],
    gates: node.requiredLevel > 1 ? { characterLevel: node.requiredLevel } : {},
    position: node.position ? { ...node.position } : { x: 0, y: 0 },
    effects
  };
}

/**
 * 转换单个旧版天赋节点
 * @param {Object} node - TalentNode 实例或同结构对象
 * @returns {Object} NodeDefinition 配置
 */
export function convertTalentNode(node) {
  return {
    id: node.id,
    name: node.name,
    description: node.description || '',
    kind: NodeKind.PASSIVE,
    maxRank: node.maxLevel || 1,
    costs: { [PointPool.TALENT]: node.requiredTalentPoints || 1 },
    prerequisites: Array.isArray(node.prerequisites) ? [...node.prerequisites] : [],
    gates: node.requiredCharacterLevel > 1 ? { characterLevel: node.requiredCharacterLevel } : {},
    position: node.position ? { ...node.position } : { x: 0, y: 0 },
    region: TALENT_TYPE_TO_REGION[node.type] || null,
    effects: convertLegacyEffects(node.effects)
  };
}

/**
 * 把旧版 SkillTree 转换为技能树图配置
 * @param {Object} skillTree - SkillTree 实例（需提供 className 与 getAllNodes）
 * @param {Object} [options] - { id, version }
 * @returns {Object} GraphDefinition 配置
 */
export function convertSkillTree(skillTree, options = {}) {
  const nodes = (skillTree.getAllNodes ? skillTree.getAllNodes() : []).map(convertSkillNode);
  return {
    id: options.id || `${skillTree.className}-skill`,
    mode: GraphMode.CLASS_SKILL,
    version: options.version || 1,
    pointPool: PointPool.SKILL,
    nodes
  };
}

/**
 * 把旧版 TalentTree 转换为职业天赋树图配置
 * @param {Object} talentTree - TalentTree 实例
 * @param {Object} [options] - { id, version }
 * @returns {Object} GraphDefinition 配置
 */
export function convertTalentTree(talentTree, options = {}) {
  const nodes = (talentTree.getAllNodes ? talentTree.getAllNodes() : []).map(convertTalentNode);
  return {
    id: options.id || `${talentTree.className}-talent`,
    mode: GraphMode.CLASS_TALENT,
    version: options.version || 1,
    pointPool: PointPool.TALENT,
    nodes
  };
}

/**
 * 批量转换 SkillTreeSystem 内的全部职业技能树
 * @param {Object} skillTreeSystem - 需提供 skillTrees: Map<className, SkillTree>
 * @param {Object} [options]
 * @returns {Array<Object>} 图配置数组
 */
export function convertSkillTreeSystem(skillTreeSystem, options = {}) {
  const graphs = [];
  const trees = skillTreeSystem && skillTreeSystem.skillTrees;
  if (!trees) return graphs;

  for (const [className, tree] of trees) {
    graphs.push(convertSkillTree(tree, { id: `${className}-skill`, version: options.version }));
  }
  return graphs;
}

/**
 * 批量转换 TalentSystem 内的全部职业天赋树
 * @param {Object} talentSystem - 需提供 talentTrees: Map<className, TalentTree>
 * @param {Object} [options]
 * @returns {Array<Object>} 图配置数组
 */
export function convertTalentSystem(talentSystem, options = {}) {
  const graphs = [];
  const trees = talentSystem && talentSystem.talentTrees;
  if (!trees) return graphs;

  for (const [className, tree] of trees) {
    graphs.push(convertTalentTree(tree, { id: `${className}-talent`, version: options.version }));
  }
  return graphs;
}
