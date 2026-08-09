/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { InputEventType, PointerButton } from '../input/InputEvent.js';
import { normalizeSceneObjectSelector, resolveSceneObjects } from './SceneObjectSelector.js';

/**
 * 场景空间触发器绑定：只处理已投影到世界坐标的 binding，行为始终由 TriggerSystem 执行。
 */
export class SceneTriggerBindingSystem {
  constructor({ triggerSystem = null, getPlayer = null, logger = null, onPromptChange = null } = {}) {
    this.triggerSystem = triggerSystem;
    this.getPlayer = typeof getPlayer === 'function' ? getPlayer : () => null;
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
    this.bindings = (bindings || []).filter(binding => {
      if (!binding || binding.type !== 'trigger') return false;
      if (!binding.id || ids.has(binding.id)) {
        console.warn('SceneTriggerBindingSystem: binding.id 缺失或重复', binding?.id);
        return false;
      }
      ids.add(binding.id);
      return true;
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

  /** 处理统一交互事件；成功执行时返回 true，由 InputActionRouter 消费。 */
  handleInteract(event) {
    if (this._disposed || !this.triggerSystem) return false;
    const isKey = event?.type === InputEventType.KEY_PRESS && event.key === 'e';
    const isPointer = event?.type === InputEventType.POINTER_DOWN && event.button === PointerButton.LEFT;
    if (!isKey && !isPointer) return false;

    const player = this._playerPosition();
    if (!player) return false;
    const candidates = this.bindings
      .filter(binding => this._eventType(binding) === 'interact' && this._contains(binding, player.x, player.y))
      .filter(binding => !isPointer || !event.world || this._contains(binding, event.world.x, event.world.y, true))
      .sort((a, b) => this._distanceSq(a, player) - this._distanceSq(b, player));
    for (const binding of candidates) {
      if (this._fire(binding, 'interact')) return true;
    }
    return false;
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

  _eventType(binding) {
    return this.triggerSystem?.getById?.(binding.triggerId)?.when?.type || binding.event || '';
  }

  _fire(binding, eventType = this._eventType(binding)) {
    if (!binding.triggerId) {
      this.logger?.('missingTriggerId', binding);
      return false;
    }
    const selector = normalizeSceneObjectSelector({
      mode: binding.targetMode,
      value: binding.target,
      sceneId: binding.sceneId
    });
    const targets = selector.value
      ? resolveSceneObjects(this.sceneObjects.filter(object => object !== binding), selector)
      : [];
    if (selector.value && targets.length === 0) {
      this.logger?.('missingTarget', binding);
      return false;
    }

    const definition = this.triggerSystem.getById?.(binding.triggerId);
    const legacyEventTarget = definition?.when?.params?.target;
    const params = {
      // 旧项目行为仍可使用 when.params.target；新行为通过 targetSelector/targets 获取真实对象。
      target: legacyEventTarget ?? targets[0]?.id ?? '',
      targetSelector: selector,
      targetObject: targets[0] || null,
      targetObjects: targets,
      targetIds: targets.map(object => object.id).filter(Boolean),
      triggerId: binding.triggerId,
      bindingId: binding.id,
      sceneId: binding.sceneId
    };
    const fired = this.triggerSystem.fireById(binding.triggerId, eventType, params);
    if (fired && definition?.once) {
      this._completedBindings.add(binding.id);
      if (this._activePromptBindingId === binding.id) this._setActivePrompt(null);
    }
    if (!fired && !definition) this.logger?.('missingTrigger', binding);
    return fired;
  }

  _playerPosition() {
    const player = this.getPlayer();
    const transform = player?.getComponent?.('transform');
    return transform?.position || player?.position || null;
  }

  _center(binding) {
    return {
      x: Number(binding.x || 0) + Number(binding.width || 0) / 2,
      y: Number(binding.y || 0) + Number(binding.height || 0) / 2
    };
  }

  _contains(binding, x, y, pointer = false) {
    const center = this._center(binding);
    const radius = Math.max(0, Number(pointer ? (binding.pointerRadius ?? binding.radius) : binding.radius) || 0);
    if (radius > 0) return Math.hypot(x - center.x, y - center.y) <= radius;
    const width = Math.max(1, Number(binding.width) || 1);
    const height = Math.max(1, Number(binding.height) || 1);
    return x >= Number(binding.x || 0) && x <= Number(binding.x || 0) + width
      && y >= Number(binding.y || 0) && y <= Number(binding.y || 0) + height;
  }

  _distanceSq(binding, point) {
    const center = this._center(binding);
    return (center.x - point.x) ** 2 + (center.y - point.y) ** 2;
  }
}

export default SceneTriggerBindingSystem;