/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 ************************************************************/

/**
 * CanonicalSchemas.js
 * 跨内容、存档和集成边界共享的规范业务模型。
 */

import { FieldType } from '../../core/validation/ContentValidator.js';
import { ValidationCode, makeError } from '../../core/validation/ValidationError.js';

export const CANONICAL_SCHEMA_VERSION = 2;

const idField = () => ({ type: FieldType.STRING, required: true, minLength: 1 });
const versionField = () => ({
  type: FieldType.INTEGER,
  required: true,
  min: 1,
  max: CANONICAL_SCHEMA_VERSION
});
const nonNegativeInteger = (required = false) => ({
  type: FieldType.INTEGER,
  required,
  min: 0
});
const ratioField = (required = false) => ({
  type: FieldType.NUMBER,
  required,
  min: 0,
  max: 1
});

function validateNonNegativeIntegerMap(value, path) {
  const errors = [];
  for (const [key, amount] of Object.entries(value || {})) {
    if (Number.isInteger(amount) && amount >= 0) continue;
    errors.push(makeError(
      ValidationCode.OUT_OF_RANGE,
      `${path}.${key}`,
      '数量必须为非负整数',
      { expected: 'integer >= 0', actual: amount }
    ));
  }
  return errors;
}

export const POSITION_SCHEMA = {
  id: 'position',
  allowUnknown: false,
  fields: {
    x: { type: FieldType.NUMBER, required: true },
    y: { type: FieldType.NUMBER, required: true },
    elevation: { type: FieldType.NUMBER }
  }
};


export const UNIT_SCHEMA = {
  id: 'unit',
  fields: {
    schemaVersion: versionField(),
    id: idField(),
    name: { type: FieldType.STRING, required: true, minLength: 1 },
    unitType: { type: FieldType.STRING, required: true, minLength: 1 },
    factionId: idField(),
    level: { type: FieldType.INTEGER, min: 1 },
    stats: { type: FieldType.OBJECT, valueType: FieldType.NUMBER },
    equipmentIds: { type: FieldType.ARRAY, itemType: FieldType.STRING },
    skillIds: { type: FieldType.ARRAY, itemType: FieldType.STRING },
    tags: { type: FieldType.ARRAY, itemType: FieldType.STRING }
  }
};

export const HERO_SCHEMA = {
  id: 'hero',
  fields: {
    schemaVersion: versionField(),
    id: idField(),
    name: { type: FieldType.STRING, required: true, minLength: 1 },
    unitId: idField(),
    classId: idField(),
    factionId: idField(),
    level: { type: FieldType.INTEGER, min: 1 },
    stats: { type: FieldType.OBJECT, valueType: FieldType.NUMBER },
    skillIds: { type: FieldType.ARRAY, itemType: FieldType.STRING },
    tags: { type: FieldType.ARRAY, itemType: FieldType.STRING }
  }
};

export const FORMATION_SCHEMA = {
  id: 'formation',
  fields: {
    schemaVersion: versionField(),
    id: idField(),
    name: { type: FieldType.STRING, required: true, minLength: 1 },
    unitIds: { type: FieldType.ARRAY, required: true, minItems: 1, itemType: FieldType.STRING },
    leaderHeroId: { type: FieldType.STRING, minLength: 1 },
    rows: { type: FieldType.INTEGER, min: 1 },
    columns: { type: FieldType.INTEGER, min: 1 },
    strategy: { type: FieldType.STRING }
  }
};

export const ARMY_SCHEMA = {
  id: 'army',
  fields: {
    schemaVersion: versionField(),
    id: idField(),
    name: { type: FieldType.STRING, required: true, minLength: 1 },
    factionId: idField(),
    formationIds: { type: FieldType.ARRAY, required: true, minItems: 1, itemType: FieldType.STRING },
    commanderHeroId: { type: FieldType.STRING, minLength: 1 },
    morale: nonNegativeInteger(true),
    resources: { type: FieldType.OBJECT, valueType: FieldType.INTEGER }
  },
  validate(army) {
    const errors = validateNonNegativeIntegerMap(army.resources, 'resources');
    return { ok: errors.length === 0, errors };
  }
};


export const RESOURCE_NODE_SCHEMA = {
  id: 'resourceNode',
  fields: {
    schemaVersion: versionField(),
    id: idField(),
    resourceType: {
      type: FieldType.STRING,
      required: true,
      enum: ['wood', 'iron', 'food', 'herb', 'stone']
    },
    remaining: nonNegativeInteger(true),
    refreshDays: nonNegativeInteger(true),
    refreshProgressDays: nonNegativeInteger(),
    guardUnitIds: { type: FieldType.ARRAY, required: true, itemType: FieldType.STRING },
    damageRatio: ratioField(true),
    sceneId: { type: FieldType.STRING, minLength: 1 },
    position: { type: FieldType.OBJECT, schema: 'position' }
  }
};

export const RESOURCE_NODE_RISK_EVENT_SCHEMA = {
  id: 'resourceNodeRiskEvent',
  allowUnknown: false,
  fields: {
    id: idField(),
    type: { type: FieldType.STRING, required: true, minLength: 1 },
    chance: ratioField(true),
    message: { type: FieldType.STRING },
    payload: { type: FieldType.OBJECT }
  }
};

/** 内容库中的资源节点定义；与存档里的动态 resourceNode 状态分离。 */
export const RESOURCE_NODE_DEFINITION_SCHEMA = {
  id: 'resourceNodeDefinition',
  fields: {
    schemaVersion: versionField(),
    id: idField(),
    name: { type: FieldType.STRING, required: true, minLength: 1 },
    resourceType: {
      type: FieldType.STRING,
      required: true,
      enum: ['wood', 'iron', 'food', 'herb', 'stone']
    },
    itemId: idField(),
    remaining: nonNegativeInteger(true),
    maxRemaining: nonNegativeInteger(true),
    yieldPerGather: { type: FieldType.INTEGER, required: true, min: 1 },
    gatherDuration: { type: FieldType.NUMBER, required: true, min: Number.MIN_VALUE },
    interactionRadius: { type: FieldType.NUMBER, required: true, min: Number.MIN_VALUE },
    requiredToolType: {},
    refreshDays: nonNegativeInteger(true),
    guardUnitIds: { type: FieldType.ARRAY, required: true, itemType: FieldType.STRING },
    riskEvents: { type: FieldType.ARRAY, itemSchema: 'resourceNodeRiskEvent' },
    damageRatio: ratioField(true)
  },
  validate(node) {
    const errors = [];
    if (node.remaining > node.maxRemaining) {
      errors.push(makeError(
        ValidationCode.OUT_OF_RANGE,
        'remaining',
        '资源节点 remaining 不能大于 maxRemaining'
      ));
    }
    if (node.requiredToolType != null && (
      typeof node.requiredToolType !== 'string' || !node.requiredToolType.trim()
    )) {
      errors.push(makeError(
        ValidationCode.TYPE_MISMATCH,
        'requiredToolType',
        'requiredToolType 必须为非空字符串或 null'
      ));
    }
    return { ok: errors.length === 0, errors };
  }
};

export const INVENTORY_STACK_SCHEMA = {
  id: 'inventoryStack',
  allowUnknown: false,
  fields: {
    itemId: idField(),
    quantity: nonNegativeInteger(true),
    maxStack: { type: FieldType.INTEGER, required: true, min: 1 },
    instanceIds: { type: FieldType.ARRAY, itemType: FieldType.STRING }
  }
};

export const INVENTORY_SCHEMA = {
  id: 'inventory',
  fields: {
    schemaVersion: versionField(),
    id: idField(),
    capacity: nonNegativeInteger(true),
    stacks: { type: FieldType.ARRAY, required: true, itemSchema: 'inventoryStack' }
  },
  validate(inventory) {
    const errors = [];
    const seen = new Set();
    let used = 0;

    for (const [index, stack] of (inventory.stacks || []).entries()) {
      if (!stack || typeof stack.itemId !== 'string') continue;
      if (seen.has(stack.itemId)) {
        errors.push(makeError(
          ValidationCode.DUPLICATE_ID,
          `stacks[${index}].itemId`,
          `重复的物品堆叠: ${stack.itemId}`
        ));
      }
      seen.add(stack.itemId);
      used += Number.isInteger(stack.quantity) ? stack.quantity : 0;
    }

    if (Number.isInteger(inventory.capacity) && used > inventory.capacity) {
      errors.push(makeError(
        ValidationCode.OUT_OF_RANGE,
        'stacks',
        `物品总量 ${used} 超过背包容量 ${inventory.capacity}`,
        { expected: `<= ${inventory.capacity}`, actual: used }
      ));
    }

    return { ok: errors.length === 0, errors };
  }
};


export const CITY_SCHEMA = {
  id: 'city',
  fields: {
    schemaVersion: versionField(),
    id: idField(),
    name: { type: FieldType.STRING, required: true, minLength: 1 },
    factionId: idField(),
    buildingLevel: nonNegativeInteger(true),
    resources: { type: FieldType.OBJECT, required: true, valueType: FieldType.INTEGER },
    damageRatio: ratioField(true),
    buildingDamage: { type: FieldType.OBJECT },
    morale: nonNegativeInteger(),
    damagePausedUntilDay: nonNegativeInteger()
  },
  validate(city) {
    const errors = validateNonNegativeIntegerMap(city.resources, 'resources');
    for (const [buildingId, ratio] of Object.entries(city.buildingDamage || {})) {
      if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        errors.push({
          code: 'outOfRange',
          path: `buildingDamage.${buildingId}`,
          message: '建筑损毁比例必须在 [0,1] 范围内',
          actual: ratio
        });
      }
    }
    return { ok: errors.length === 0, errors };
  }
};

export const BATTLE_RESOURCE_TRANSFER_SCHEMA = {
  id: 'battleResourceTransfer',
  allowUnknown: false,
  fields: {
    fromCityId: idField(),
    toCityId: idField(),
    resources: { type: FieldType.OBJECT, required: true, valueType: FieldType.INTEGER }
  },
  validate(transfer) {
    const errors = validateNonNegativeIntegerMap(transfer.resources, 'resources');
    if (transfer.fromCityId === transfer.toCityId) {
      errors.push(makeError(
        ValidationCode.INVALID_REFERENCE,
        'toCityId',
        '资源转出城市与转入城市不能相同'
      ));
    }
    return { ok: errors.length === 0, errors };
  }
};

export const BATTLE_RESULT_SCHEMA = {
  id: 'battleResult',
  fields: {
    schemaVersion: versionField(),
    resultId: idField(),
    responseId: idField(),
    battleId: idField(),
    winnerFactionId: idField(),
    casualties: { type: FieldType.OBJECT, required: true, valueType: FieldType.INTEGER },
    capturedResources: { type: FieldType.OBJECT, required: true, valueType: FieldType.INTEGER },
    resourceTransfer: { type: FieldType.OBJECT, required: true, schema: 'battleResourceTransfer' },
    affectedCityId: idField(),
    cityDamage: ratioField(true),
    damagedResourceNodeIds: { type: FieldType.ARRAY, required: true, itemType: FieldType.STRING },
    completedAt: nonNegativeInteger(true)
  },
  validate(result) {
    const errors = [
      ...validateNonNegativeIntegerMap(result.casualties, 'casualties'),
      ...validateNonNegativeIntegerMap(result.capturedResources, 'capturedResources')
    ];
    const captured = result.capturedResources || {};
    const transferred = result.resourceTransfer?.resources || {};
    const resourceKeys = new Set([...Object.keys(captured), ...Object.keys(transferred)]);
    for (const resource of resourceKeys) {
      if ((captured[resource] || 0) !== (transferred[resource] || 0)) {
        errors.push(makeError(
          ValidationCode.OUT_OF_RANGE,
          `resourceTransfer.resources.${resource}`,
          '资源转移数量必须与 capturedResources 一致',
          { expected: captured[resource] || 0, actual: transferred[resource] || 0 }
        ));
      }
    }
    return { ok: errors.length === 0, errors };
  }
};

export const TOOL_STATE_SCHEMA = {
  id: 'checkpointTool',
  allowUnknown: false,
  fields: {
    instanceId: idField(),
    itemId: idField(),
    durability: nonNegativeInteger(true),
    maxDurability: nonNegativeInteger(true)
  },
  validate(tool) {
    if (tool.durability <= tool.maxDurability) return { ok: true, errors: [] };
    return {
      ok: false,
      errors: [makeError(
        ValidationCode.OUT_OF_RANGE,
        'durability',
        '当前耐久不得大于最大耐久',
        { expected: `<= ${tool.maxDurability}`, actual: tool.durability }
      )]
    };
  }
};

export const CHECKPOINT_PLAYER_SCHEMA = {
  id: 'checkpointPlayer',
  fields: {
    entityId: idField(),
    position: { type: FieldType.OBJECT, required: true, schema: 'position' },
    classId: idField(),
    health: nonNegativeInteger(true),
    maxHealth: nonNegativeInteger(true),
    inventory: { type: FieldType.OBJECT, required: true, schema: 'inventory' },
    tools: { type: FieldType.ARRAY, required: true, itemSchema: 'checkpointTool' }
  },
  validate(player) {
    if (player.health <= player.maxHealth) return { ok: true, errors: [] };
    return {
      ok: false,
      errors: [makeError(
        ValidationCode.OUT_OF_RANGE,
        'health',
        '当前生命不得大于最大生命',
        { expected: `<= ${player.maxHealth}`, actual: player.health }
      )]
    };
  }
};


export const CHECKPOINT_SCHEMA = {
  id: 'checkpoint',
  fields: {
    schemaVersion: versionField(),
    checkpointId: idField(),
    campaignId: idField(),
    createdAt: nonNegativeInteger(true),
    currentSceneId: {
      type: FieldType.STRING,
      required: true,
      minLength: 3
    },
    player: { type: FieldType.OBJECT, required: true, schema: 'checkpointPlayer' },
    storyState: { type: FieldType.OBJECT, required: true },
    sceneDynamicState: { type: FieldType.OBJECT, required: true },
    resourceNodes: { type: FieldType.ARRAY, required: true, itemSchema: 'resourceNode' },
    fieldStructures: { type: FieldType.ARRAY, required: true },
    vehicles: { type: FieldType.ARRAY, required: true },
    cityStates: { type: FieldType.ARRAY, required: true, itemSchema: 'city' },
    warState: { type: FieldType.OBJECT, required: true },
    progressionState: { type: FieldType.OBJECT, required: true },
    appliedBattleResultIds: { type: FieldType.ARRAY, required: true, itemType: FieldType.STRING },
    endingState: { type: FieldType.OBJECT, required: true }
  },
  validate(checkpoint) {
    if (/^S(?:0[1-9]|1[0-4])(?:-C\d{2})?$/.test(checkpoint.currentSceneId)) {
      return { ok: true, errors: [] };
    }
    return {
      ok: false,
      errors: [makeError(
        ValidationCode.OUT_OF_RANGE,
        'currentSceneId',
        '场景 ID 必须为 S01-S14 或对应的 SXX-CNN 附属 chunk',
        { expected: 'S01-S14 or SXX-CNN', actual: checkpoint.currentSceneId }
      )]
    };
  }
};

export const GAME_PROJECT_META_SCHEMA = {
  id: 'gameProjectMeta',
  fields: {
    id: idField(),
    name: { type: FieldType.STRING, required: true, minLength: 1 },
    version: { type: FieldType.INTEGER, required: true, min: 1 },
    schema: { type: FieldType.INTEGER, required: true, min: 1 },
    campaignId: idField()
  }
};

export const BATTLE_INTEGRATION_SCHEMA = {
  id: 'battleIntegration',
  allowUnknown: false,
  fields: {
    resultSource: {
      type: FieldType.STRING,
      required: true,
      enum: ['localMock', 'external']
    },
    localMock: { type: FieldType.OBJECT },
    external: { type: FieldType.OBJECT }
  },
  validate(config) {
    const selected = config[config.resultSource];
    if (selected && typeof selected === 'object') return { ok: true, errors: [] };
    return {
      ok: false,
      errors: [makeError(
        ValidationCode.MISSING_FIELD,
        config.resultSource,
        `结果源 ${config.resultSource} 缺少对应配置`
      )]
    };
  }
};

export const GAME_PROJECT_INTEGRATION_SCHEMA = {
  id: 'gameProjectIntegration',
  allowUnknown: false,
  fields: {
    battle: { type: FieldType.OBJECT, required: true, schema: 'battleIntegration' }
  }
};

export const GAME_PROJECT_LIBRARY_SCHEMA = {
  id: 'gameProjectLibrary',
  fields: {
    items: { type: FieldType.ARRAY },
    equipment: { type: FieldType.ARRAY },
    enemies: { type: FieldType.ARRAY },
    npcs: { type: FieldType.ARRAY },
    shops: { type: FieldType.ARRAY },
    classes: { type: FieldType.ARRAY },
    skills: { type: FieldType.ARRAY },
    vehicles: { type: FieldType.ARRAY },
    buildings: { type: FieldType.ARRAY },
    resourceNodes: { type: FieldType.ARRAY, itemSchema: 'resourceNodeDefinition' }
  }
};

export const GAME_PROJECT_SCHEMA = {
  id: 'gameProject',
  fields: {
    schemaVersion: versionField(),
    meta: { type: FieldType.OBJECT, required: true, schema: 'gameProjectMeta' },
    assetManifest: { type: FieldType.OBJECT, required: true },
    presentation: { type: FieldType.OBJECT, required: true },
    // 游戏专属的纯数据扩展；复杂事务仍由具体游戏 coordinator/system 消费。
    extensions: { type: FieldType.OBJECT },
    progression: { type: FieldType.OBJECT },
    construction: { type: FieldType.OBJECT },
    variables: { type: FieldType.OBJECT, required: true },
    worldMap: { type: FieldType.OBJECT, required: true },
    scenes: { type: FieldType.ARRAY, required: true },
    dialogues: { type: FieldType.ARRAY, required: true },
    quests: { type: FieldType.ARRAY, required: true },
    triggerCatalog: { type: FieldType.OBJECT },
    triggers: { type: FieldType.ARRAY, required: true },
    tutorials: { type: FieldType.ARRAY, required: true },
    library: { type: FieldType.OBJECT, required: true, schema: 'gameProjectLibrary' },
    integration: { type: FieldType.OBJECT, required: true, schema: 'gameProjectIntegration' }
  }
};

export const CANONICAL_SCHEMAS = [
  POSITION_SCHEMA,
  UNIT_SCHEMA,
  HERO_SCHEMA,
  FORMATION_SCHEMA,
  ARMY_SCHEMA,
  RESOURCE_NODE_SCHEMA,
  RESOURCE_NODE_RISK_EVENT_SCHEMA,
  RESOURCE_NODE_DEFINITION_SCHEMA,
  INVENTORY_STACK_SCHEMA,
  INVENTORY_SCHEMA,
  CITY_SCHEMA,
  BATTLE_RESOURCE_TRANSFER_SCHEMA,
  BATTLE_RESULT_SCHEMA,
  TOOL_STATE_SCHEMA,
  CHECKPOINT_PLAYER_SCHEMA,
  CHECKPOINT_SCHEMA,
  GAME_PROJECT_META_SCHEMA,
  BATTLE_INTEGRATION_SCHEMA,
  GAME_PROJECT_INTEGRATION_SCHEMA,
  GAME_PROJECT_LIBRARY_SCHEMA,
  GAME_PROJECT_SCHEMA
];

export default CANONICAL_SCHEMAS;