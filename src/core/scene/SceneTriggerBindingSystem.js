/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { InputEventType, PointerButton } from '../input/InputEvent.js';
import { normalizeSceneObjectSelector, resolveSceneObjects } from './SceneObjectSelector.js';
import { createSpatialTriggerBinding } from './SpatialTriggerBinding.js';

/**
 * 场景空间触发器绑定：只处理已投影到世界坐标的 binding，行为始终由 TriggerSystem 执行。
 */
export class SceneTriggerBindingSystem {
  constructor({
    triggerSystem = null,
    getPlayer = null,
    getConditionRoot = null,
    isTutorialCompleted = null,
    resolveDynamicTarget = null,
    logger = null,
    onPromptChange = null
  } = {}) {
    this.triggerSystem = triggerSystem;
    this.getPlayer = typeof getPlayer === 'function' ? getPlayer : () => null;
    this.getConditionRoot = typeof getConditionRoot === 'function' ? getConditionRoot : () => undefined;
    this.isTutorialCompleted = typeof isTutorialCompleted === 'function'
      ? isTutorialCompleted
      : () => false;
    this.resolveDynamicTarget = typeof resolveDynamicTarget === 'function' ? resolveDynamicTarget : null;
    this.logger = typeof logger === 'function' ? logger : null;
    this.onPromptChange = typeof onPromptChange === 'function' ? onPromptChange : null;
    this.bindings = [];
    this.sceneObjects = [];
    this._inside = new Map();
    this._completedBindings = new Set();
    this._activePromptBindingId = null;
    this._disposed = false;
  }

  setTriggerSystem(triggerSystem) {
    this.triggerSystem = triggerSystem || null;
    return this;
  }

  setBindings(bindings = [], sceneObjects = []) {
    if (this._disposed) return this;
    const ids = new Set();
    this.sceneObjects = Array.isArray(sceneObjects) ? sceneObjects : [];
    this.bindings = (bindings || []).flatMap(rawBinding => {
      if (!rawBinding || rawBinding.type !== 'trigger') return [];
      let binding;
      try {
        binding = createSpatialTriggerBinding(rawBinding);
      } catch (error) {
        console.warn('SceneTriggerBindingSystem: binding 无效', rawBinding?.id, error);
        return [];
      }
      if (!binding.id || !binding.triggerId || ids.has(binding.id)) {
        console.warn('SceneTriggerBindingSystem: binding.id/triggerId 缺失或 id 重复', binding.id);
        return [];
      }
      ids.add(binding.id);
      return [binding];
    });
    this._setActivePrompt(null);
    this._inside.clear();
    this._completedBindings.clear();
    for (const binding of this.bindings) this._inside.set(binding.id, false);
    return this;
  }

  update() {
    if (this._disposed || !this.triggerSystem) return 0;
    const position = this._playerPosition();
    if (!position) return 0;
    let fired = 0;
    for (const binding of this.bindings) {
      const eventType = this._eventType(binding);
      if (!['approach', 'enter', 'leave'].includes(eventType)) continue;
      if (!this._isBindingActive(binding)) {
        this._inside.set(binding.id, false);
        continue;
      }
      const inside = this._contains(binding, position.x, position.y);
      const wasInside = this._inside.get(binding.id) === true;
      this._inside.set(binding.id, inside);
      if (inside && !wasInside && (eventType === 'approach' || eventType === 'enter')) {
        if (this._fire(binding, eventType)) fired++;
      } else if (!inside && wasInside && eventType === 'leave') {
        if (this._fire(binding, eventType)) fired++;
      }
    }
    this._updatePrompt(position);
    return fired;
  }

  _updatePrompt(position) {
    const candidate = this.bindings
      .filter(binding => this._eventType(binding) === 'interact' && binding.prompt && !this._completedBindings.has(binding.id))
      .filter(binding => this._isBindingActive(binding))
      .filter(binding => {
        const definition = this.triggerSystem?.getById?.(binding.triggerId);
        return !definition?.once || !this.triggerSystem.hasFiredOnce?.(binding.triggerId);
      })
      .filter(binding => this._contains(binding, position.x, position.y))
      .sort((a, b) => this._distanceSq(a, position) - this._distanceSq(b, position))[0] || null;
    this._setActivePrompt(candidate);
  }

  _setActivePrompt(binding) {
    const id = binding?.id || null;
    if (id === this._activePromptBindingId) return;
    this._activePromptBindingId = id;
    this.onPromptChange?.(binding?.prompt || '', binding || null);
  }

  /** 处理统一交互事件；存在有效候选时返回 true 并消费输入，不代表后续业务动作已提交成功。 */
  handleInteract(event) {
    if (this._disposed || !this.triggerSystem) return false;
    const isKey = event?.type === InputEventType.KEY_PRESS && event.key === 'e';
    const isPointer = event?.type === InputEventType.POINTER_DOWN && event.button === PointerButton.LEFT;
    if (!isKey && !isPointer) return false;

    const player = this._playerPosition();
    if (!player) return false;
    const candidates = this.bindings
      .filter(binding => this._eventType(binding) === 'interact' && this._contains(binding, player.x, player.y))
      .filter(binding => this._isBindingActive(binding))
      .filter(binding => !this._completedBindings.has(binding.id))
      .filter(binding => {
        const definition = this.triggerSystem?.getById?.(binding.triggerId);
        return !definition?.once || !this.triggerSystem.hasFiredOnce?.(binding.triggerId);
      })
      .filter(binding => !isPointer || !event.world || this._contains(binding, event.world.x, event.world.y, true));
    if (candidates.length === 0) return false;

    const binding = candidates.find(candidate => candidate.id === this._activePromptBindingId)
      || candidates.sort((a, b) => this._distanceSq(a, player) - this._distanceSq(b, player))[0];
    this._fire(binding, 'interact');
    return true;
  }

  /** 当前是否有空间 trigger 占用交互提示。 */
  hasActivePrompt() {
    return this._activePromptBindingId !== null;
  }

  clear() {
    this._setActivePrompt(null);
    this.bindings = [];
    this.sceneObjects = [];
    this._inside.clear();
    this._completedBindings.clear();
  }

  dispose() {
    if (this._disposed) return false;
    this.clear();
    this.triggerSystem = null;
    this._disposed = true;
    return true;
  }

  resetBinding(id) {
    if (!id) return false;
    const existed = this._completedBindings.delete(id);
    this._inside.set(id, false);
    if (this._activePromptBindingId === id) this._setActivePrompt(null);
    return existed;
  }

  _isBindingActive(binding) {
    if (!binding?.activeWhen) return true;
    try {
      return this._evaluateCondition(binding.activeWhen);
    } catch (error) {
      this.logger?.('activeConditionError', binding, error);
      return false;
    }
  }

  /** activeWhen 与 placement spawnWhen 共享基础比较语义，并支持组合及教学完成状态。 */
  _evaluateCondition(condition) {
    if (!condition || typeof condition !== 'object') return true;
    if (Array.isArray(condition.all)) return condition.all.every(item => this._evaluateCondition(item));
    if (Array.isArray(condition.any)) return condition.any.some(item => this._evaluateCondition(item));
    if (condition.not) return !this._evaluateCondition(condition.not);
    if (condition.tutorialId) {
      const completed = this.isTutorialCompleted(String(condition.tutorialId));
      return completed === (condition.completed !== false);
    }

    let value = this.getConditionRoot(condition.blackboardKey || 'storyState');
    for (const segment of String(condition.path || '').split('.').filter(Boolean)) {
      value = value && typeof value === 'object' ? value[segment] : undefined;
    }
    if (condition.exists === true && value === undefined) return false;
    if (condition.exists === false && value !== undefined) return false;
    if (Object.prototype.hasOwnProperty.call(condition, 'equals') && value !== condition.equals) return false;
    if (Object.prototype.hasOwnProperty.call(condition, 'gte') && !(Number(value) >= Number(condition.gte))) return false;
    if (Object.prototype.hasOwnProperty.call(condition, 'lte') && !(Number(value) <= Number(condition.lte))) return false;
    if (Array.isArray(condition.in) && !condition.in.includes(value)) return false;
    return true;
  }

  _eventType(binding) {
    return this.triggerSystem?.getById?.(binding.triggerId)?.when?.type || '';
  }

  _fire(binding, eventType = this._eventType(binding)) {
    if (!this._isBindingActive(binding)) return false;
    if (!binding.triggerId) {
      this.logger?.('missingTriggerId', binding);
      return false;
    }
    const selector = this._selector(binding);
    const targets = selector.value ? this._resolveTargets(binding, selector) : [];
    if (selector.value && targets.length === 0) {
      this.logger?.('missingTarget', binding);
      return false;
    }

    const params = {
      target: targets[0]?.id ?? '',
      targetSelector: selector,
      targetObject: targets[0] || null,
      targetObjects: targets,
      targetIds: targets.map(object => object.id).filter(Boolean),
      triggerId: binding.triggerId,
      bindingId: binding.id,
      sceneId: binding.sceneId
    };
    const fired = this.triggerSystem.fireById(binding.triggerId, eventType, params);
    const definition = this.triggerSystem.getById?.(binding.triggerId);
    if (!fired && !definition) this.logger?.('missingTrigger', binding);
    return fired;
  }

  _selector(binding) {
    return normalizeSceneObjectSelector(binding.selector || { sceneId: binding.sceneId });
  }

  _resolveDynamicTargets(binding, selector = this._selector(binding)) {
    if (!this.resolveDynamicTarget || selector.mode !== 'id' || !selector.value) return [];
    try {
      const resolved = this.resolveDynamicTarget(selector.value, binding, selector);
      const targets = Array.isArray(resolved) ? resolved : [resolved];
      return targets.filter(target => target?.id === selector.value
        && (!selector.sceneId || !target.sceneId || target.sceneId === selector.sceneId));
    } catch (error) {
      this.logger?.('dynamicTargetError', binding, error);
      return [];
    }
  }

  _resolveTargets(binding, selector = this._selector(binding)) {
    const dynamicTargets = this._resolveDynamicTargets(binding, selector);
    if (dynamicTargets.length > 0) return dynamicTargets;
    return resolveSceneObjects(this.sceneObjects.filter(object => object !== binding), selector);
  }

  _playerPosition() {
    const player = this.getPlayer();
    const transform = player?.getComponent?.('transform');
    return transform?.position || player?.position || null;
  }

  _geometry(binding) {
    const dynamicTarget = this._resolveDynamicTargets(binding)[0];
    if (dynamicTarget) {
      const width = Math.max(1, Number(dynamicTarget.width) || 1);
      const height = Math.max(1, Number(dynamicTarget.height) || 1);
      const center = dynamicTarget.center && Number.isFinite(dynamicTarget.center.x)
        && Number.isFinite(dynamicTarget.center.y)
        ? { x: dynamicTarget.center.x, y: dynamicTarget.center.y }
        : {
            x: Number(dynamicTarget.x || 0) + width / 2,
            y: Number(dynamicTarget.y || 0) + height / 2
          };
      return {
        x: Number.isFinite(dynamicTarget.x) ? dynamicTarget.x : center.x - width / 2,
        y: Number.isFinite(dynamicTarget.y) ? dynamicTarget.y : center.y - height / 2,
        width,
        height,
        center
      };
    }
    const width = Math.max(1, Number(binding.width) || 1);
    const height = Math.max(1, Number(binding.height) || 1);
    const x = Number(binding.x || 0);
    const y = Number(binding.y || 0);
    return { x, y, width, height, center: { x: x + width / 2, y: y + height / 2 } };
  }

  _center(binding) {
    return this._geometry(binding).center;
  }

  _contains(binding, x, y, pointer = false) {
    const geometry = this._geometry(binding);
    const radius = Math.max(0, Number(pointer ? (binding.pointerRadius ?? binding.radius) : binding.radius) || 0);
    if (radius > 0) return Math.hypot(x - geometry.center.x, y - geometry.center.y) <= radius;
    return x >= geometry.x && x <= geometry.x + geometry.width
      && y >= geometry.y && y <= geometry.y + geometry.height;
  }

  _distanceSq(binding, point) {
    const center = this._center(binding);
    return (center.x - point.x) ** 2 + (center.y - point.y) ** 2;
  }
}

export default SceneTriggerBindingSystem;