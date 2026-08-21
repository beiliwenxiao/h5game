/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { InputEventType, PointerButton } from '../input/InputEvent.js';
import { normalizeSceneObjectSelector, resolveSceneObjects } from './SceneObjectSelector.js';
import { createSpatialTriggerBinding } from './SpatialTriggerBinding.js';
import { resolveSceneSpatialGeometry } from './SceneSpatialGeometry.js';

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
    const spatialContexts = new Map();
    const resolveSpatial = binding => {
      if (!spatialContexts.has(binding.id)) spatialContexts.set(binding.id, this._resolveSpatialContext(binding));
      return spatialContexts.get(binding.id);
    };
    let fired = 0;
    for (const binding of this.bindings) {
      const eventType = this._eventType(binding);
      if (!['approach', 'enter', 'leave'].includes(eventType)) continue;
      if (!this._isBindingActive(binding)) {
        this._inside.set(binding.id, false);
        continue;
      }
      const spatial = resolveSpatial(binding);
      const inside = this._contains(binding, position.x, position.y, false, spatial);
      const wasInside = this._inside.get(binding.id) === true;
      this._inside.set(binding.id, inside);
      if (inside && !wasInside && (eventType === 'approach' || eventType === 'enter')) {
        if (this._fire(binding, eventType, spatial)) fired++;
      } else if (!inside && wasInside && eventType === 'leave') {
        if (this._fire(binding, eventType, spatial)) fired++;
      }
    }
    this._updatePrompt(position, resolveSpatial);
    return fired;
  }

  _updatePrompt(position, resolveSpatial = binding => this._resolveSpatialContext(binding)) {
    const candidate = this.bindings
      .filter(binding => this._eventType(binding) === 'interact' && binding.prompt && !this._completedBindings.has(binding.id))
      .filter(binding => this._isBindingActive(binding))
      .filter(binding => {
        const definition = this.triggerSystem?.getById?.(binding.triggerId);
        return !definition?.once || !this.triggerSystem.hasFiredOnce?.(binding.triggerId);
      })
      .map(binding => ({ binding, spatial: resolveSpatial(binding) }))
      .filter(candidate => this._contains(candidate.binding, position.x, position.y, false, candidate.spatial))
      .sort((a, b) => this._distanceSq(a.binding, position, a.spatial)
        - this._distanceSq(b.binding, position, b.spatial))[0]?.binding || null;
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
      .filter(binding => this._eventType(binding) === 'interact')
      .map(binding => ({ binding, spatial: this._resolveSpatialContext(binding) }))
      .filter(candidate => this._contains(candidate.binding, player.x, player.y, false, candidate.spatial))
      .filter(candidate => this._isBindingActive(candidate.binding))
      .filter(candidate => !this._completedBindings.has(candidate.binding.id))
      .filter(candidate => {
        const definition = this.triggerSystem?.getById?.(candidate.binding.triggerId);
        return !definition?.once || !this.triggerSystem.hasFiredOnce?.(candidate.binding.triggerId);
      })
      .filter(candidate => !isPointer || !event.world
        || this._contains(candidate.binding, event.world.x, event.world.y, true, candidate.spatial));
    if (candidates.length === 0) return false;

    const candidate = candidates.find(item => item.binding.id === this._activePromptBindingId)
      || candidates.sort((a, b) => this._distanceSq(a.binding, player, a.spatial)
        - this._distanceSq(b.binding, player, b.spatial))[0];
    this._fire(candidate.binding, 'interact', candidate.spatial);
    return true;
  }

  /** 当前是否有空间 trigger 占用交互提示。 */
  hasActivePrompt() {
    return this._activePromptBindingId !== null;
  }

  /** 返回只读调试快照；仅解析空间事实，不执行 trigger 或修改业务状态。 */
  getDebugHotspotSnapshot() {
    if (this._disposed) return Object.freeze([]);
    const snapshots = this.bindings.map(binding => {
      const spatial = this._resolveSpatialContext(binding);
      const definition = this.triggerSystem?.getById?.(binding.triggerId);
      const onceCompleted = definition?.once === true
        && this.triggerSystem?.hasFiredOnce?.(binding.triggerId) === true;
      const geometry = spatial.geometry;
      const active = Boolean(definition) && this._isBindingActive(binding)
        && !this._completedBindings.has(binding.id) && !onceCompleted;
      return Object.freeze({
        bindingId: binding.id,
        triggerId: binding.triggerId,
        sceneId: binding.sceneId,
        eventType: this._eventType(binding),
        prompt: binding.prompt || '',
        active,
        inside: this._inside.get(binding.id) === true,
        radius: Math.max(0, Number(binding.radius) || 0),
        pointerRadius: Math.max(0, Number(binding.pointerRadius ?? binding.radius) || 0),
        anchor: Object.freeze({ ...geometry.anchor }),
        bounds: Object.freeze({
          x: geometry.x,
          y: geometry.y,
          width: geometry.width,
          height: geometry.height
        })
      });
    });
    return Object.freeze(snapshots);
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

  _fire(binding, eventType = this._eventType(binding), spatial = this._resolveSpatialContext(binding)) {
    if (!this._isBindingActive(binding)) return false;
    if (!binding.triggerId) {
      this.logger?.('missingTriggerId', binding);
      return false;
    }
    const { selector, targets, geometry } = spatial;
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
      targetAnchor: { ...geometry.anchor },
      targetGeometry: {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        center: { ...geometry.center }
      },
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

  /** 每个 binding 操作只解析一次目标，命中、排序、提示和事件共用同一空间快照。 */
  _resolveSpatialContext(binding) {
    const selector = this._selector(binding);
    const targets = selector.value ? this._resolveTargets(binding, selector) : [];
    const geometry = resolveSceneSpatialGeometry(targets[0] || binding, {
      fallback: binding,
      offsetX: binding.anchorOffsetX,
      offsetY: binding.anchorOffsetY
    });
    return { selector, targets, geometry };
  }

  _playerPosition() {
    const player = this.getPlayer();
    const transform = player?.getComponent?.('transform');
    return transform?.position || player?.position || null;
  }

  _geometry(binding, spatial = null) {
    return (spatial || this._resolveSpatialContext(binding)).geometry;
  }

  _center(binding, spatial = null) {
    return this._geometry(binding, spatial).center;
  }

  _contains(binding, x, y, pointer = false, spatial = null) {
    const geometry = this._geometry(binding, spatial);
    const radius = Math.max(0, Number(pointer ? (binding.pointerRadius ?? binding.radius) : binding.radius) || 0);
    if (radius > 0) return Math.hypot(x - geometry.anchor.x, y - geometry.anchor.y) <= radius;
    return x >= geometry.x && x <= geometry.x + geometry.width
      && y >= geometry.y && y <= geometry.y + geometry.height;
  }

  _distanceSq(binding, point, spatial = null) {
    const anchor = this._geometry(binding, spatial).anchor;
    return (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2;
  }
}

export default SceneTriggerBindingSystem;