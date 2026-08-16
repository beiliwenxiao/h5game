import { DEFAULT_TRIGGER_ACTION_IDS } from '../../systems/TriggerActions.js';
import { createStandardCapabilityStrategyRegistry } from '../../systems/items/CapabilityStrategyRegistry.js';
import { ValidationCode, makeError } from './ValidationError.js';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isReferenceStub = value => isObject(value) && typeof value.$ref === 'string';
const list = value => Array.isArray(value) ? value : [];

function stableIds(values, path, errors, seen = new Set()) {
  list(values).forEach((value, index) => {
    const idPath = `${path}[${index}].id`;
    const id = value?.id;
    if (typeof id !== 'string' || !id.trim()) {
      errors.push(makeError(ValidationCode.MISSING_FIELD, idPath, '定义缺少非空稳定 id'));
    } else if (seen.has(id)) {
      errors.push(makeError(ValidationCode.DUPLICATE_ID, idPath, `重复的 id: ${id}`));
    } else {
      seen.add(id);
    }
  });
  return seen;
}

function referenceArray(owner, field, targetIds, path, label, errors) {
  if (!own(owner, field)) return;
  if (!Array.isArray(owner[field])) {
    errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${path}.${field}`, `${field} 必须为数组`));
    return;
  }
  owner[field].forEach((ref, index) => {
    if (typeof ref === 'string' && targetIds.has(ref)) return;
    errors.push(makeError(
      ValidationCode.INVALID_REFERENCE,
      `${path}.${field}[${index}]`,
      `${label}不存在: ${String(ref)}`
    ));
  });
}

const EXECUTABLE_CONTENT_FIELDS = new Set([
  'execute', 'handler', 'callback', 'modulePath', 'className', 'function',
  'code', 'script', 'sourceCode', 'eval', 'adapter'
]);

function rejectExecutableContent(value, path, errors, seen = new WeakSet(), schemaPropertyMap = false) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if ((!schemaPropertyMap && EXECUTABLE_CONTENT_FIELDS.has(key)) || typeof child === 'function') {
      errors.push(makeError('executableContentNotAllowed', childPath, `canonical action 不得声明可执行内容 ${key}`));
      continue;
    }
    rejectExecutableContent(child, childPath, errors, seen, key === 'properties');
  }
}

/**
 * 完整候选的 schema/reference/business-rule 聚合器。
 * 所有方法均为只读，并尽可能收集互相独立的错误而不是遇到首错即停止。
 */
export class CandidateRuleValidator {
  constructor({ contentValidator, businessRuleValidators = [], capabilityStrategyRegistry = null } = {}) {
    if (!contentValidator) throw new TypeError('CandidateRuleValidator requires contentValidator');
    this.contentValidator = contentValidator;
    this.capabilityStrategyRegistry = capabilityStrategyRegistry || createStandardCapabilityStrategyRegistry();
    this.businessRuleValidators = list(businessRuleValidators).filter(value => typeof value === 'function');
  }

  validateSchema(candidate, schemaId = 'gameProject') {
    const errors = [];
    errors.push(...this.contentValidator.validateVersion(candidate).errors);
    errors.push(...this.contentValidator.validate(candidate, schemaId).errors);

    if (isObject(candidate?.presentation) && !isReferenceStub(candidate.presentation)) {
      errors.push(...this.contentValidator.validate(candidate.presentation, 'presentationProfile', 'presentation').errors);
    }
    if (isObject(candidate?.assetManifest) && !isReferenceStub(candidate.assetManifest)) {
      errors.push(...this.contentValidator.validate(candidate.assetManifest, 'assetManifest', 'assetManifest').errors);
    }
    if (Array.isArray(candidate?.rescues)) {
      candidate.rescues.forEach((rescue, index) => {
        if (!isReferenceStub(rescue)) errors.push(...this.contentValidator.validate(rescue, 'rescueDefinition', `rescues[${index}]`).errors);
      });
    }
    if (Array.isArray(candidate?.library?.items)) {
      errors.push(...this.contentValidator.validateList(candidate.library.items, 'itemDefinition', 'library.items').errors);
    }

    const progression = candidate?.progression;
    if (isObject(progression)) {
      errors.push(...this.contentValidator.validate(progression, 'progressionConfig', 'progression').errors);
      const skills = Array.isArray(progression.skills?.skills)
        ? progression.skills.skills
        : (Array.isArray(progression.skills) ? progression.skills : []);
      errors.push(...this.contentValidator.validateList(skills, 'skill', 'progression.skills').errors);
      list(progression.graphs).forEach((graph, index) => {
        if (!isReferenceStub(graph)) {
          errors.push(...this.contentValidator.validate(graph, 'progressionGraph', `progression.graphs[${index}]`).errors);
        }
      });
    }

    list(candidate?.variables?.cityStates).forEach((city, index) => {
      errors.push(...this.contentValidator.validate(city, 'city', `variables.cityStates[${index}]`).errors);
    });
    return errors;
  }

  validateReferences(candidate) {
    const errors = [];
    const sceneIds = stableIds(candidate?.scenes, 'scenes', errors);
    const dialogueIds = stableIds(candidate?.dialogues, 'dialogues', errors);
    const tutorialIds = stableIds(candidate?.tutorials, 'tutorials', errors);
    const questIds = stableIds(candidate?.quests, 'quests', errors);
    const triggerIds = stableIds(candidate?.triggers, 'triggers', errors);

    const libraryIds = {};
    for (const [kind, definitions] of Object.entries(candidate?.library || {})) {
      if (Array.isArray(definitions)) libraryIds[kind] = stableIds(definitions, `library.${kind}`, errors);
    }

    const itemIds = libraryIds.items || new Set();
    const toolTypes = new Set(list(candidate?.library?.items)
      .filter(item => item?.type === 'tool' && typeof item.toolType === 'string')
      .map(item => item.toolType));
    list(candidate?.library?.resourceNodes).forEach((node, index) => {
      if (!itemIds.has(node?.itemId)) {
        errors.push(makeError(ValidationCode.INVALID_REFERENCE, `library.resourceNodes[${index}].itemId`, `资源节点引用了不存在的物品: ${node?.itemId}`));
      }
      if (node?.requiredToolType && !toolTypes.has(node.requiredToolType)) {
        errors.push(makeError(ValidationCode.INVALID_REFERENCE, `library.resourceNodes[${index}].requiredToolType`, `资源节点要求的工具类型不存在: ${node.requiredToolType}`));
      }
    });

    list(candidate?.quests).forEach((quest, index) => {
      const path = `quests[${index}]`;
      referenceArray(quest, 'prerequisites', questIds, path, '前置任务', errors);
      referenceArray(quest, 'triggerRefs', triggerIds, path, '触发器', errors);
      referenceArray(quest, 'dialogueRefs', dialogueIds, path, '对话', errors);
      referenceArray(quest, 'sceneRefs', sceneIds, path, '场景', errors);
    });

    const commandDefinitions = Array.isArray(candidate?.commands)
      ? candidate.commands
      : list(candidate?.commandCatalog?.commands);
    const commandIds = stableIds(commandDefinitions, 'commands', errors);
    const scenarioIds = stableIds(candidate?.scenarios, 'scenarios', errors);

    list(candidate?.scenarios).forEach((scenario, index) => {
      const path = `scenarios[${index}]`;
      referenceArray(scenario, 'triggerRefs', triggerIds, path, '触发器', errors);
      referenceArray(scenario, 'questRefs', questIds, path, '任务', errors);
      referenceArray(scenario, 'dialogueRefs', dialogueIds, path, '对话', errors);
      referenceArray(scenario, 'sceneRefs', sceneIds, path, '场景', errors);
      referenceArray(scenario, 'commandRefs', commandIds, path, '命令', errors);
      referenceArray(scenario, 'scenarioRefs', scenarioIds, path, '场景编排', errors);
      referenceArray(scenario, 'entryTriggerRefs', triggerIds, path, '入口触发器', errors);
      referenceArray(scenario, 'exitTriggerRefs', triggerIds, path, '出口触发器', errors);
    });

    const actionDefinitions = [
      ...list(candidate?.triggerCatalog?.actions),
      ...list(candidate?.actionCatalog?.actions),
      ...list(candidate?.actions)
    ];
    const actionIds = new Set([
      ...DEFAULT_TRIGGER_ACTION_IDS,
      ...actionDefinitions
        .map(action => typeof action === 'string' ? action : action?.value || action?.id)
        .filter(Boolean)
    ]);
    const extensionEndings = isObject(candidate?.extensions?.endings)
      ? [candidate.extensions.endings]
      : [];
    const vehicleIds = libraryIds.vehicles || new Set();
    const standardActionReferences = {
      'rescue.command': ['rescueId', stableIds(candidate?.rescues, 'rescues', errors), '救援'],
      'battle.command': ['battleId', stableIds(candidate?.battles, 'battles', errors), '战役'],
      'construction.command': ['definitionId', stableIds(candidate?.construction?.definitions, 'construction.definitions', errors), '营建定义'],
      // Vehicle definitions are scene-owned canonical data. Project-only validation verifies
      // a non-empty stable reference here; a populated global library remains strictly closed.
      'vehicle.command': ['vehicleId', vehicleIds, '载具', { allowSceneOwned: true }],
      'quest.command': ['questId', questIds, '任务'],
      'world.teleport': ['sceneId', sceneIds, '场景'],
      'ending.command': ['endingId', stableIds(candidate?.endings || extensionEndings, candidate?.endings ? 'endings' : 'extensions.endings', errors), '结局'],
      'dialogue.command': ['dialogueId', dialogueIds, '对话'],
      'tutorial.command': ['tutorialId', tutorialIds, '教学'],
      'state.transaction': ['definitionId', stableIds(candidate?.commands, 'commands', errors), '事务']
    };
    if (actionIds.size > 0) {
      list(candidate?.triggers).forEach((trigger, triggerIndex) => {
        list(trigger?.do).forEach((action, actionIndex) => {
          const actionPath = `triggers[${triggerIndex}].do[${actionIndex}]`;
          if (!actionIds.has(action?.action)) {
            errors.push(makeError(
              ValidationCode.INVALID_REFERENCE,
              `${actionPath}.action`,
              `未登记的 action: ${String(action?.action)}`
            ));
          }
          const referenceContract = standardActionReferences[action?.action];
          if (referenceContract) {
            const [field, ids, label, options = {}] = referenceContract;
            const referenceId = action?.params?.[field];
            const canResolveFromScene = options.allowSceneOwned === true && ids.size === 0;
            if (typeof referenceId !== 'string' || !referenceId.trim() || (!canResolveFromScene && !ids.has(referenceId))) {
              errors.push(makeError(ValidationCode.INVALID_REFERENCE, `${actionPath}.params.${field}`, `${label}不存在: ${String(referenceId)}`));
            }
          }
          if (action?.commandType && commandIds.size > 0 && !commandIds.has(action.commandType)) {
            errors.push(makeError(
              ValidationCode.INVALID_REFERENCE,
              `${actionPath}.commandType`,
              `未登记的 command: ${action.commandType}`
            ));
          }
        });
      });
    }

    this._validateCapabilities(candidate, errors);
    return errors;
  }

  _validateCapabilities(candidate, errors) {
    const catalog = candidate?.capabilityCatalog;
    const capabilityIds = new Set(
      Array.isArray(catalog) ? catalog.map(value => typeof value === 'string' ? value : value?.id)
        : Object.keys(isObject(catalog) ? catalog : {})
    );
    const strategies = candidate?.strategyCatalog;
    const strategyIds = new Set(
      Array.isArray(strategies) ? strategies.map(value => typeof value === 'string' ? value : value?.id)
        : Object.keys(isObject(strategies) ? strategies : {})
    );
    const hasDefinition = (kind, id) => list(candidate?.library?.[kind]).some(definition => definition?.id === id)
      || list(candidate?.[kind]).some(definition => definition?.id === id);

    for (const [kind, definitions] of Object.entries(candidate?.library || {})) {
      list(definitions).forEach((definition, definitionIndex) => {
        const values = Array.isArray(definition?.capabilities)
          ? definition.capabilities
          : Object.entries(isObject(definition?.capabilities) ? definition.capabilities : {})
            .map(([id, parameters]) => ({ id, ...(isObject(parameters) ? parameters : { parameters }) }));
        values.forEach((capability, capabilityIndex) => {
          const id = typeof capability === 'string' ? capability : capability?.capabilityId || capability?.id;
          const path = `library.${kind}[${definitionIndex}].capabilities[${capabilityIndex}]`;
          const builtIn = this.capabilityStrategyRegistry.find(id, capability?.strategyId);
          if (!builtIn && !capabilityIds.has(id)) {
            errors.push(makeError(ValidationCode.INVALID_REFERENCE, `${path}.id`, `未知 capability: ${String(id)}`));
          }
          const strategyId = typeof capability === 'object' ? capability?.strategyId : null;
          if (strategyId && !builtIn && !strategyIds.has(strategyId)) {
            errors.push(makeError(ValidationCode.INVALID_REFERENCE, `${path}.strategyId`, `未知 strategy: ${strategyId}`));
          }
        });
        if (values.length > 0 && kind === 'items') {
          errors.push(...this.capabilityStrategyRegistry.validateDefinition(definition, {
            path: `library.${kind}[${definitionIndex}]`, hasDefinition, allowUnknownStrategies: true
          }));
        }
      });
    }
  }

  validateBusinessRules(candidate, context = {}) {
    const errors = [];
    const weather = candidate?.system?.weather;
    if (weather !== undefined) {
      const weatherTypes = new Set(['clear', 'breeze', 'wind', 'lightRain', 'heavyRain', 'lightFog', 'heavyFog', 'storm']);
      if (!isObject(weather)) {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, 'system.weather', 'weather 必须为对象'));
      } else {
        if (typeof weather.default !== 'string' || !weatherTypes.has(weather.default)) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, 'system.weather.default', 'default weather 未登记'));
        }
        if (typeof weather.transitionSpeed !== 'number' || !Number.isFinite(weather.transitionSpeed) || weather.transitionSpeed <= 0) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, 'system.weather.transitionSpeed', 'transitionSpeed 必须为正数'));
        }
        if (own(weather, 'particles') && !isObject(weather.particles)) {
          errors.push(makeError(ValidationCode.TYPE_MISMATCH, 'system.weather.particles', 'particles 必须为对象'));
        }
      }
    }
    const month = candidate?.variables?.storyState?.month;
    if (month !== undefined && (!Number.isInteger(month) || month < 1)) {
      errors.push(makeError(ValidationCode.OUT_OF_RANGE, 'variables.storyState.month', 'month 必须为正整数'));
    }
    const triggers = list(candidate?.triggers);
    triggers.forEach((trigger, index) => {
      const path = `triggers[${index}]`;
      if (typeof trigger?.when?.type !== 'string' || !trigger.when.type.trim()) {
        errors.push(makeError(ValidationCode.MISSING_FIELD, `${path}.when.type`, 'trigger.when.type 必须是非空字符串'));
      }
      if (!Array.isArray(trigger?.do)) {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${path}.do`, 'trigger.do 必须为数组'));
      } else {
        trigger.do.forEach((action, actionIndex) => {
          const actionPath = `${path}.do[${actionIndex}]`;
          rejectExecutableContent(action, actionPath, errors);
          if (typeof action?.action !== 'string' || !action.action.trim()) {
            errors.push(makeError(ValidationCode.MISSING_FIELD, `${actionPath}.action`, 'action 必须是非空字符串'));
          }
          if (own(action, 'params') && !isObject(action.params)) {
            errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${actionPath}.params`, 'action.params 必须为对象'));
          }
          if (own(action, 'await') && typeof action.await !== 'boolean') {
            errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${actionPath}.await`, 'action.await 必须为布尔值'));
          }
        });
      }
      if (own(trigger, 'cooldown') && (typeof trigger.cooldown !== 'number' || trigger.cooldown < 0)) {
        errors.push(makeError(ValidationCode.OUT_OF_RANGE, `${path}.cooldown`, 'cooldown 必须为非负数'));
      }
      if (trigger?.when?.type === 'timer') {
        const seconds = trigger.when.params?.seconds;
        if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, `${path}.when.params.seconds`, 'timer seconds 必须大于 0'));
        }
      }
    });

    list(candidate?.quests).forEach((quest, questIndex) => {
      const path = `quests[${questIndex}]`;
      if (!isObject(quest)) {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, path, 'QuestDefinition 必须为对象'));
        return;
      }
      if (!Array.isArray(quest.objectives)) {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${path}.objectives`, 'quest objectives 必须为数组'));
      } else {
        stableIds(quest.objectives, `${path}.objectives`, errors);
        quest.objectives.forEach((objective, objectiveIndex) => {
          const objectivePath = `${path}.objectives[${objectiveIndex}]`;
          if (typeof objective?.type !== 'string' || !objective.type.trim()) errors.push(makeError(ValidationCode.MISSING_FIELD, `${objectivePath}.type`, '任务目标必须声明 type'));
          if (objective?.targetId !== undefined && objective.targetId !== null && typeof objective.targetId !== 'string') errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${objectivePath}.targetId`, 'targetId 必须为字符串或 null（通配）'));
          if (objective?.requiredCount !== undefined && (!Number.isInteger(objective.requiredCount) || objective.requiredCount < 1)) errors.push(makeError(ValidationCode.OUT_OF_RANGE, `${objectivePath}.requiredCount`, 'requiredCount 必须为正整数'));
          if (objective?.optional !== undefined && typeof objective.optional !== 'boolean') errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${objectivePath}.optional`, 'optional 必须为布尔值'));
        });
      }
      for (const field of ['text', 'giver', 'turnIn', 'reward', 'time', 'repeatPolicy']) {
        if (own(quest, field) && !isObject(quest[field])) errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${path}.${field}`, `${field} 必须为对象`));
      }
      const runtimeFields = ['questRuntimeId', 'state', 'objectiveProgress', 'acceptedLogicalTime', 'remaining', 'repeat', 'rewardSettlementLedger', 'tracking', 'stateRevision', 'acceptedTime', 'completedTime', 'expiresAt', 'lastCompletedTime', 'tracked'];
      runtimeFields.forEach(field => {
        if (own(quest, field)) errors.push(makeError('runtimeFieldInDefinition', `${path}.${field}`, `QuestDefinition 不得包含运行态字段 ${field}`));
      });
    });

    list(candidate?.rescues).forEach((rescue, rescueIndex) => {
      const path = `rescues[${rescueIndex}]`;
      const positiveFields = ['duration', 'postGateDuration', 'evacuationRadius', 'followDistance', 'followMaxDistance'];
      positiveFields.forEach(field => {
        if (!own(rescue, field)) return;
        const value = rescue[field];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, `${path}.${field}`, `${field} 必须为正数`));
        }
      });
      for (const field of ['requiredGuardCount', 'assassinWaveCount']) {
        if (!own(rescue, field)) continue;
        if (!Number.isInteger(rescue[field]) || rescue[field] <= 0) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, `${path}.${field}`, `${field} 必须为正整数`));
        }
      }
      if (own(rescue, 'followDistance') && own(rescue, 'followMaxDistance')
        && Number(rescue.followDistance) >= Number(rescue.followMaxDistance)) {
        errors.push(makeError(ValidationCode.OUT_OF_RANGE, `${path}.followDistance`, 'followDistance 必须小于 followMaxDistance'));
      }
      if (own(rescue, 'followOffset') && (!isObject(rescue.followOffset)
        || typeof rescue.followOffset.x !== 'number' || !Number.isFinite(rescue.followOffset.x)
        || typeof rescue.followOffset.y !== 'number' || !Number.isFinite(rescue.followOffset.y))) {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${path}.followOffset`, 'followOffset 必须包含有限数值 x/y'));
      }
    });

    list(candidate?.scenarios).forEach((scenario, scenarioIndex) => {
      const path = `scenarios[${scenarioIndex}]`;
      if (own(scenario, 'actions') || own(scenario, 'execute')) {
        errors.push(makeError('scenarioExecutionNotAllowed', path, 'ScenarioDefinition 只能声明引用闭包，不能持有执行逻辑'));
      }
    });

    const actionDefinitions = [
      ...list(candidate?.triggerCatalog?.actions),
      ...list(candidate?.actionCatalog?.actions),
      ...list(candidate?.actions)
    ];
    actionDefinitions.forEach((descriptor, index) => {
      if (!isObject(descriptor)) return;
      const path = `actions[${index}]`;
      rejectExecutableContent(descriptor, path, errors);
      if (own(descriptor, 'paramsSchema') && !isObject(descriptor.paramsSchema) && typeof descriptor.paramsSchema !== 'string') {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${path}.paramsSchema`, 'paramsSchema 必须为对象或 schema id'));
      }
    });

    const commandDefinitions = Array.isArray(candidate?.commands)
      ? candidate.commands
      : list(candidate?.commandCatalog?.commands);
    commandDefinitions.forEach((command, index) => {
      const path = `commands[${index}]`;
      if (!isObject(command)) {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, path, 'command descriptor 必须为对象'));
        return;
      }
      rejectExecutableContent(command, path, errors);
      if (own(command, 'payloadSchema') && !isObject(command.payloadSchema) && typeof command.payloadSchema !== 'string') {
        errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${path}.payloadSchema`, 'payloadSchema 必须为对象或 schema id'));
      }
    });

    for (const [kind, definitions] of Object.entries(candidate?.library || {})) {
      list(definitions).forEach((definition, definitionIndex) => {
        const capabilities = list(definition?.capabilities);
        const ids = capabilities.map(value => typeof value === 'string' ? value : value?.capabilityId || value?.id).filter(Boolean);
        const seen = new Set();
        ids.forEach((id, capabilityIndex) => {
          if (seen.has(id)) {
            errors.push(makeError(ValidationCode.DUPLICATE_ID, `library.${kind}[${definitionIndex}].capabilities[${capabilityIndex}]`, `重复 capability: ${id}`));
          }
          seen.add(id);
        });
        capabilities.forEach((capability, capabilityIndex) => {
          if (!isObject(capability)) return;
          const path = `library.${kind}[${definitionIndex}].capabilities[${capabilityIndex}]`;
          referenceArray(capability, 'requires', seen, path, '依赖 capability', errors);
          referenceArray(capability, 'conflictsWith', seen, path, '互斥 capability', errors);
          if (own(capability, 'parameters') && !isObject(capability.parameters)) {
            errors.push(makeError(ValidationCode.TYPE_MISMATCH, `${path}.parameters`, 'capability parameters 必须为对象'));
          }
        });
      });
    }

    for (const validator of this.businessRuleValidators) {
      try {
        const result = validator(candidate, context);
        const validatorErrors = Array.isArray(result) ? result : list(result?.errors);
        validatorErrors.forEach(error => errors.push({
          code: error?.code || 'projectPolicy',
          path: error?.path || 'project',
          message: error?.message || '项目内容策略校验失败',
          ...(isObject(error) ? error : {})
        }));
      } catch (error) {
        errors.push(makeError('projectPolicy', 'project', String(error?.message || error)));
      }
    }
    return errors;
  }
}

export default CandidateRuleValidator;
