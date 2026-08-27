/**
 * FlowGroupRuntimeStateMachine - FlowGroup 运行时状态机（P1）。
 *
 * 把 previously 纯静态的 FlowGroup（旧 SceneEvent）定义做成实状态机：
 *
 *   locked ──(dependsOn 全部 completed)──▶ dormant ──(activeWhen 满足 && scope 命中 && autoActivate)──▶ active
 *   active ──(completionWhen 满足 && autoComplete) / (progress ≥ maxProgress) / 显式 complete──▶ completed
 *   completed ──(repeatable && completionWhen 不再满足)──▶ dormant（重新武装）
 *
 * 职责：
 * - activeWhen / completionWhen 条件求值（Blackboard onChange 自动重估）
 * - dependsOn 前置解锁门控
 * - scope.sceneIds 场景命中判定（setScene 后激活需在场景范围内）
 * - control 语义：autoActivate / autoComplete / repeatable / maxProgress / notifyProgressEvery
 * - progress 进度（组内 Trigger/Tutorial 成功 +1）
 * - 事件发布（flowGroupUnlocked/Activated/Completed/Progress/Reset）
 * - 可序列化（存档）
 *
 * 与 TriggerSystem 的接线：TriggerSystem._eligible() 调用 isRunnable(fgId) 门控；
 * trigger 成功后调用 notifyTriggerSucceeded() 累计进度。
 */

import { evaluateCompositeCondition } from './FlowGroupConditionEvaluator.js';

const text = v => typeof v === 'string' ? v.trim() : '';
const PHASES = new Set(['locked', 'dormant', 'active', 'completed']);

export const FLOW_GROUP_PHASE = Object.freeze({
  LOCKED: 'locked',
  DORMANT: 'dormant',
  ACTIVE: 'active',
  COMPLETED: 'completed'
});

const initialGroupState = hasDependencies => ({
  phase: hasDependencies ? FLOW_GROUP_PHASE.LOCKED : FLOW_GROUP_PHASE.DORMANT,
  progress: 0,
  completions: 0,
  activations: 0,
  lastNotifiedProgress: 0
});

export class FlowGroupRuntimeStateMachine {
  /**
   * @param {Object} config
   * @param {FlowGroupDefinitionRepository} config.definitions - 只读定义索引
   * @param {Blackboard|null} [config.blackboard] - 变量黑板（onChange 自动重估）
   * @param {string|null} [config.currentSceneId] - 当前场景（scope 判定用）
   */
  constructor({ definitions, blackboard = null, currentSceneId = null } = {}) {
    if (!definitions || typeof definitions.values !== 'function' || typeof definitions.get !== 'function') {
      throw new TypeError('FlowGroupRuntimeStateMachine: definitions 必须是 FlowGroupDefinitionRepository');
    }
    this.definitions = definitions;
    this.blackboard = null;
    this.currentSceneId = text(currentSceneId) || null;
    this._states = new Map();
    this._listeners = [];
    this._unsubscribeBlackboard = null;
    for (const definition of definitions.values()) {
      this._states.set(definition.id, initialGroupState((definition.dependsOn || []).length > 0));
    }
    if (blackboard) this.setBlackboard(blackboard);
  }

  /** 绑定黑板；变量变化时自动重估全部条件。重复调用会先解绑旧黑板。 */
  setBlackboard(blackboard) {
    if (this._unsubscribeBlackboard) {
      try { this._unsubscribeBlackboard(); } catch { /* listener already gone */ }
      this._unsubscribeBlackboard = null;
    }
    this.blackboard = blackboard || null;
    if (this.blackboard && typeof this.blackboard.onChange === 'function') {
      this._unsubscribeBlackboard = this.blackboard.onChange(() => this.evaluate());
    }
    return this;
  }

  /** 当前场景切换；scope 命中是 dormant→active 的必要条件。切换后立即重估。 */
  setScene(sceneId) {
    this.currentSceneId = text(sceneId) || null;
    this.evaluate();
    return this;
  }

  /** TriggerSystem 准入门：只有 active 阶段的 FlowGroup 的子 Trigger/Tutorial 可运行。 */
  isRunnable(flowGroupId) {
    return this._states.get(text(flowGroupId))?.phase === FLOW_GROUP_PHASE.ACTIVE;
  }

  getPhase(flowGroupId) {
    return this._states.get(text(flowGroupId))?.phase || null;
  }

  getState(flowGroupId) {
    const state = this._states.get(text(flowGroupId));
    return state ? { ...state } : null;
  }

  /** 订阅状态机事件：cb(event)。返回取消函数。 */
  onEvent(callback) {
    if (typeof callback !== 'function') throw new TypeError('FlowGroupRuntimeStateMachine.onEvent 需要 function');
    this._listeners.push(callback);
    return () => {
      const index = this._listeners.indexOf(callback);
      if (index !== -1) this._listeners.splice(index, 1);
    };
  }

  _emit(event) {
    for (const callback of [...this._listeners]) {
      try { callback(event); } catch { /* 监听器异常不得打断状态机 */ }
    }
    return event;
  }

  _definition(flowGroupId) {
    return this.definitions.get(text(flowGroupId)) || null;
  }

  /** 依赖是否全部 completed。 */
  _dependenciesSatisfied(definition) {
    return (definition.dependsOn || []).every(depId => (
      this._states.get(depId)?.phase === FLOW_GROUP_PHASE.COMPLETED
    ));
  }

  /** scope 命中：未设置当前场景或组不限场景时恒真。 */
  _scopeSatisfied(definition) {
    if (!this.currentSceneId) return true;
    const sceneIds = definition.scope?.sceneIds || [];
    return sceneIds.length === 0 || sceneIds.includes(this.currentSceneId);
  }

  /**
   * 全量重估：执行所有状态迁移并发布事件。黑板变化 / 场景切换时自动调用。
   * @returns {Array<Object>} 本次产生的事件列表
   */
  evaluate() {
    const events = [];
    for (const definition of this.definitions.values()) {
      const state = this._states.get(definition.id);
      if (!state) continue;
      const control = definition.control || {};

      if (state.phase === FLOW_GROUP_PHASE.COMPLETED) {
        // repeatable 重武装仅对声明了 completionWhen 的组生效（无完成条件的组只能显式/进度完成）
        if (control.repeatable === true && definition.completionWhen
          && !evaluateCompositeCondition(definition.completionWhen, this.blackboard)) {
          state.phase = FLOW_GROUP_PHASE.DORMANT;
          state.progress = 0;
          state.lastNotifiedProgress = 0;
          events.push(this._emit({
            type: 'flowGroupReset', flowGroupId: definition.id, phase: state.phase, reason: 'repeatableRearm'
          }));
        }
        continue;
      }

      if (state.phase === FLOW_GROUP_PHASE.LOCKED && this._dependenciesSatisfied(definition)) {
        state.phase = FLOW_GROUP_PHASE.DORMANT;
        events.push(this._emit({
          type: 'flowGroupUnlocked', flowGroupId: definition.id, phase: state.phase
        }));
      }

      if (state.phase === FLOW_GROUP_PHASE.DORMANT) {
        const autoActivate = control.autoActivate !== false;
        const activeWhenOk = evaluateCompositeCondition(definition.activeWhen, this.blackboard);
        if (autoActivate && this._scopeSatisfied(definition) && activeWhenOk) {
          state.phase = FLOW_GROUP_PHASE.ACTIVE;
          state.activations += 1;
          events.push(this._emit({
            type: 'flowGroupActivated', flowGroupId: definition.id, phase: state.phase,
            activations: state.activations
          }));
        }
      }

      if (state.phase === FLOW_GROUP_PHASE.ACTIVE) {
        // autoComplete 仅对声明了 completionWhen 的组生效：无完成条件的组永不自动完成
        // （只能通过 maxProgress / 显式 completeFlowGroup 完成）。
        const autoComplete = control.autoComplete !== false;
        if (autoComplete && definition.completionWhen
          && evaluateCompositeCondition(definition.completionWhen, this.blackboard)) {
          this._complete(definition, state, 'completionWhen', events);
        }
      }
    }
    return events;
  }

  _complete(definition, state, reason, events) {
    state.phase = FLOW_GROUP_PHASE.COMPLETED;
    state.completions += 1;
    events.push(this._emit({
      type: 'flowGroupCompleted', flowGroupId: definition.id, phase: state.phase,
      progress: state.progress, completions: state.completions, reason
    }));
    // 完成可能解锁下游依赖，同一轮继续推导。
    for (const other of this.definitions.values()) {
      if ((other.dependsOn || []).includes(definition.id)) {
        const otherState = this._states.get(other.id);
        if (otherState?.phase === FLOW_GROUP_PHASE.LOCKED && this._dependenciesSatisfied(other)) {
          otherState.phase = FLOW_GROUP_PHASE.DORMANT;
          events.push(this._emit({
            type: 'flowGroupUnlocked', flowGroupId: other.id, phase: otherState.phase
          }));
        }
      }
    }
  }

  /** 显式完成（绕过 completionWhen；来源标记 source）。完成后全量重估，让下游解锁→激活链继续推导。 */
  completeFlowGroup(flowGroupId, source = 'manual') {
    const definition = this._definition(flowGroupId);
    const state = this._states.get(definition?.id);
    if (!definition || !state || state.phase === FLOW_GROUP_PHASE.COMPLETED) return false;
    const events = [];
    if (state.phase === FLOW_GROUP_PHASE.LOCKED) state.phase = FLOW_GROUP_PHASE.DORMANT;
    this._complete(definition, state, source, events);
    events.push(...this.evaluate());
    return events.length > 0;
  }

  /** 显式激活（autoActivate=false 时的唯一激活途径）。 */
  activateFlowGroup(flowGroupId, source = 'manual') {
    const definition = this._definition(flowGroupId);
    const state = this._states.get(definition?.id);
    if (!definition || !state || state.phase !== FLOW_GROUP_PHASE.DORMANT) return false;
    state.phase = FLOW_GROUP_PHASE.ACTIVE;
    state.activations += 1;
    this._emit({
      type: 'flowGroupActivated', flowGroupId: definition.id, phase: state.phase,
      activations: state.activations, source
    });
    return true;
  }

  /** 显式重置回初始阶段（依赖存在则 locked）。 */
  resetFlowGroup(flowGroupId) {
    const definition = this._definition(flowGroupId);
    const state = this._states.get(definition?.id);
    if (!definition || !state) return false;
    state.phase = initialGroupState((definition.dependsOn || []).length > 0).phase;
    state.progress = 0;
    state.lastNotifiedProgress = 0;
    this._emit({ type: 'flowGroupReset', flowGroupId: definition.id, phase: state.phase, reason: 'manual' });
    return true;
  }

  /**
   * 组内成员成功通知（TriggerSystem triggerSucceeded / TutorialSystem completeTutorial 接线点）。
   * 进度 +1；达到 maxProgress 时自动完成；每 notifyProgressEvery 次发布一次进度事件。
   * @returns {boolean} 是否处于 active（即进度是否被计入）
   */
  notifyProgress(flowGroupId, sourceId = null, sourceType = 'trigger') {
    const definition = this._definition(flowGroupId);
    const state = this._states.get(definition?.id);
    if (!definition || !state) return false;
    if (state.phase !== FLOW_GROUP_PHASE.ACTIVE) return false;
    const control = definition.control || {};
    state.progress += 1;
    const notifyEvery = Number.isInteger(control.notifyProgressEvery) && control.notifyProgressEvery > 0
      ? control.notifyProgressEvery
      : 10;
    if (state.progress - state.lastNotifiedProgress >= notifyEvery) {
      state.lastNotifiedProgress = state.progress;
      this._emit({
        type: 'flowGroupProgress', flowGroupId: definition.id, phase: state.phase,
        progress: state.progress, sourceId, sourceType
      });
    }
    if (control.maxProgress != null && Number.isFinite(control.maxProgress)
      && state.progress >= Number(control.maxProgress)) {
      const events = [];
      this._complete(definition, state, 'maxProgress', events);
      events.push(...this.evaluate());
    }
    return true;
  }

  /** @deprecated 使用 notifyProgress。 */
  notifyTriggerSucceeded(flowGroupId, triggerId) {
    return this.notifyProgress(flowGroupId, triggerId, 'trigger');
  }

  /** @deprecated 使用 notifyProgress。 */
  notifyTutorialCompleted(flowGroupId, tutorialId) {
    return this.notifyProgress(flowGroupId, tutorialId, 'tutorial');
  }

  serialize() {
    const groups = {};
    for (const [id, state] of this._states) {
      groups[id] = { ...state };
    }
    return {
      snapshotSchemaVersion: 1,
      currentSceneId: this.currentSceneId,
      groups
    };
  }

  deserialize(data) {
    const errors = [];
    if (!data || data.snapshotSchemaVersion !== 1) {
      return {
        ok: false,
        errors: [{ code: 'invalidSnapshotSchema', path: 'flowGroups.snapshotSchemaVersion', message: 'FlowGroup snapshot schema 必须为 1' }]
      };
    }
    const groups = data.groups && typeof data.groups === 'object' ? data.groups : null;
    if (!groups) {
      errors.push({ code: 'invalidSnapshot', path: 'flowGroups.groups', message: 'flowGroups.groups 必须是对象' });
    }
    for (const [id, saved] of Object.entries(groups || {})) {
      if (!this.definitions.has(id)) {
        errors.push({ code: 'invalidReference', path: `flowGroups.groups.${id}`, message: `未知 FlowGroup ${id}` });
        continue;
      }
      if (!PHASES.has(saved?.phase)) {
        errors.push({ code: 'invalidPhase', path: `flowGroups.groups.${id}.phase`, message: `非法 phase "${saved?.phase}"` });
        continue;
      }
    }
    if (errors.length) return { ok: false, errors };
    for (const [id, saved] of Object.entries(groups)) {
      const state = this._states.get(id);
      state.phase = saved.phase;
      state.progress = Number.isInteger(saved.progress) ? saved.progress : 0;
      state.completions = Number.isInteger(saved.completions) ? saved.completions : 0;
      state.activations = Number.isInteger(saved.activations) ? saved.activations : 0;
      state.lastNotifiedProgress = Number.isInteger(saved.lastNotifiedProgress) ? saved.lastNotifiedProgress : 0;
    }
    this.currentSceneId = text(data.currentSceneId) || null;
    return { ok: true, errors: [] };
  }
}

export default FlowGroupRuntimeStateMachine;
