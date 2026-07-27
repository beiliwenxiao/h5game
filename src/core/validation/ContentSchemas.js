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
 * ContentSchemas.js
 * 内容配置 Schema 定义。
 *
 * 覆盖成长系统相关配置；其他内容类型可按同样方式追加。
 */

import { FieldType, ContentValidator } from './ContentValidator.js';
import { ValidationCode, makeError } from './ValidationError.js';

/** 效果 */
export const EFFECT_SCHEMA = {
  id: 'effect',
  fields: {
    type: { type: FieldType.STRING, required: true },
    target: { type: FieldType.STRING, required: true },
    operation: { type: FieldType.STRING },
    value: {},   // 数值、数组或布尔，由领域层进一步校验
    sourceId: { type: FieldType.STRING },
    stackGroup: { type: FieldType.STRING },
    priority: { type: FieldType.NUMBER }
  }
};

/** 技能定义 */
export const SKILL_SCHEMA = {
  id: 'skill',
  fields: {
    id: { type: FieldType.STRING, required: true, minLength: 1 },
    name: { type: FieldType.STRING },
    description: { type: FieldType.STRING },
    category: {
      type: FieldType.STRING,
      enum: ['attack', 'heal', 'buff', 'locomotion', 'utility']
    },
    targeting: {
      type: FieldType.STRING,
      enum: ['self', 'entity', 'position', 'direction', 'area']
    },
    params: { type: FieldType.OBJECT, valueType: FieldType.NUMBER },
    costs: { type: FieldType.OBJECT, valueType: FieldType.NUMBER },
    tags: { type: FieldType.ARRAY, itemType: FieldType.STRING },
    vfx: { type: FieldType.OBJECT },
    variants: { type: FieldType.OBJECT }
  }
};

/** 成长节点 */
export const NODE_SCHEMA = {
  id: 'progressionNode',
  fields: {
    id: { type: FieldType.STRING, required: true, minLength: 1 },
    name: { type: FieldType.STRING },
    description: { type: FieldType.STRING },
    kind: {
      type: FieldType.STRING,
      enum: [
        'activeSkill', 'skillModifier', 'passive', 'specialization',
        'minor', 'notable', 'keystone', 'mastery', 'socket', 'start'
      ]
    },
    maxRank: { type: FieldType.INTEGER, min: 1 },
    costs: { type: FieldType.OBJECT, valueType: FieldType.NUMBER },
    prerequisites: {},   // 数组或 { mode, nodes }，由领域层规范化
    choiceGroup: { type: FieldType.STRING },
    exclusiveWith: { type: FieldType.ARRAY, itemType: FieldType.STRING },
    position: { type: FieldType.OBJECT, valueType: FieldType.NUMBER },
    region: { type: FieldType.STRING },
    gates: { type: FieldType.OBJECT, valueType: FieldType.NUMBER },
    effects: { type: FieldType.ARRAY, itemSchema: 'effect' },
    tags: { type: FieldType.ARRAY, itemType: FieldType.STRING }
  }
};

/** 成长图 */
export const GRAPH_SCHEMA = {
  id: 'progressionGraph',
  fields: {
    id: { type: FieldType.STRING, required: true, minLength: 1 },
    mode: {
      type: FieldType.STRING,
      required: true,
      enum: ['classSkill', 'classTalent', 'unitTalent', 'passiveBoard']
    },
    version: { type: FieldType.INTEGER, min: 1 },
    pointPool: { type: FieldType.STRING },
    startNodes: { type: FieldType.ARRAY, itemType: FieldType.STRING },
    rules: { type: FieldType.OBJECT },
    nodes: { type: FieldType.ARRAY, required: true, minItems: 1, itemSchema: 'progressionNode' },
    edges: { type: FieldType.ARRAY }
  },

  /**
   * 跨字段规则：
   *   - 节点 id 唯一
   *   - 连线与前置引用必须指向已定义节点
   *   - 天赋盘必须有可用起点
   */
  validate(graph) {
    const errors = [];
    const ids = new Set();

    for (const [index, node] of (graph.nodes || []).entries()) {
      if (!node || typeof node.id !== 'string') continue;
      if (ids.has(node.id)) {
        errors.push(makeError(ValidationCode.DUPLICATE_ID, `nodes[${index}].id`, `重复的节点 id: ${node.id}`));
      }
      ids.add(node.id);
    }

    for (const [index, node] of (graph.nodes || []).entries()) {
      if (!node) continue;

      const prereq = Array.isArray(node.prerequisites)
        ? node.prerequisites
        : (node.prerequisites && Array.isArray(node.prerequisites.nodes) ? node.prerequisites.nodes : []);

      for (const ref of prereq) {
        if (!ids.has(ref)) {
          errors.push(makeError(
            ValidationCode.INVALID_REFERENCE,
            `nodes[${index}].prerequisites`,
            `前置节点不存在: ${ref}`
          ));
        }
      }

      for (const ref of node.exclusiveWith || []) {
        if (!ids.has(ref)) {
          errors.push(makeError(
            ValidationCode.INVALID_REFERENCE,
            `nodes[${index}].exclusiveWith`,
            `互斥节点不存在: ${ref}`
          ));
        }
      }
    }

    for (const [index, edge] of (graph.edges || []).entries()) {
      if (!Array.isArray(edge) || edge.length !== 2) {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, `edges[${index}]`, '连线必须为两个节点 id 的数组'));
        continue;
      }
      for (const ref of edge) {
        if (!ids.has(ref)) {
          errors.push(makeError(ValidationCode.INVALID_REFERENCE, `edges[${index}]`, `连线引用了不存在的节点: ${ref}`));
        }
      }
    }

    if (graph.mode === 'passiveBoard') {
      const declared = Array.isArray(graph.startNodes) ? graph.startNodes : [];
      const implicit = (graph.nodes || []).filter(n => n && n.kind === 'start').map(n => n.id);
      const starts = declared.length > 0 ? declared : implicit;

      if (starts.length === 0) {
        errors.push(makeError(ValidationCode.MISSING_FIELD, 'startNodes', '天赋盘必须定义起点节点'));
      }
      for (const ref of declared) {
        if (!ids.has(ref)) {
          errors.push(makeError(ValidationCode.INVALID_REFERENCE, 'startNodes', `起点节点不存在: ${ref}`));
        }
      }
    }

    return { ok: errors.length === 0, errors };
  }
};

/** 成长 Profile */
export const PROGRESSION_CONFIG_SCHEMA = {
  id: 'progressionConfig',
  fields: {
    profile: { type: FieldType.STRING, enum: ['classicRpg', 'arpg', 'poeLike', 'roguelite'] },
    primary: {
      type: FieldType.STRING,
      enum: ['skillTree', 'talentTree', 'unitTalent', 'passiveBoard']
    },
    enabled: { type: FieldType.ARRAY, itemType: FieldType.STRING },
    secondary: { type: FieldType.ARRAY, itemType: FieldType.STRING },
    pointPools: { type: FieldType.OBJECT, valueType: FieldType.STRING },
    unlock: { type: FieldType.OBJECT, valueType: FieldType.STRING },
    graphs: { type: FieldType.ARRAY },
    skills: {}
  },

  /** primary 必须在 enabled 内 */
  validate(config) {
    if (!config.primary || !Array.isArray(config.enabled)) return { ok: true, errors: [] };
    if (config.enabled.includes(config.primary)) return { ok: true, errors: [] };

    return {
      ok: false,
      errors: [makeError(
        ValidationCode.INVALID_REFERENCE,
        'primary',
        `主要成长结构 ${config.primary} 未出现在 enabled 中`
      )]
    };
  }
};

/** 全部内置 Schema */
export const CONTENT_SCHEMAS = [
  EFFECT_SCHEMA,
  SKILL_SCHEMA,
  NODE_SCHEMA,
  GRAPH_SCHEMA,
  PROGRESSION_CONFIG_SCHEMA
];

/**
 * 创建预置全部 Schema 的校验器
 * @param {Object} [config]
 * @returns {ContentValidator}
 */
export function createContentValidator(config = {}) {
  const validator = new ContentValidator(config);
  validator.registerSchemas(CONTENT_SCHEMAS);
  return validator;
}
