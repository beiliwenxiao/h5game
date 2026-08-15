/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

/** 为场景通用玩法系统提供稳定快照字段、纯校验和分阶段恢复。 */
export class SceneGameplaySnapshotRuntime {
  constructor({ context, getPlayer = null, getEntities = null } = {}) {
    if (!context) throw new TypeError('SceneGameplaySnapshotRuntime requires GameSceneContext');
    this.context = context;
    this.getPlayer = getPlayer || (() => context.player?.entity || null);
    this.getEntities = getEntities || (() => context.entities?.all || []);
  }

  capture() {
    const systems = this.context.systems || {};
    const player = this.getPlayer();
    return {
      defeatState: systems.playerDefeat?.serialize?.() || null,
      gatheringState: systems.gathering?.serialize?.() || null,
      locomotionState: systems.locomotion?.serialize?.(player) || null,
      puppetState: systems.gatheringPuppet?.serialize?.() || null,
      proficiencyState: systems.proficiency?.serialize?.() || null,
      constructionState: systems.construction?.serialize?.() || null
    };
  }

  validate(data = {}) {
    const systems = this.context.systems || {};
    const player = this.getPlayer();
    if (data.locomotionState) {
      if (!systems.locomotion) return this._failure(
        'locomotionRuntimeUnavailable', 'locomotionState', '位移运行时尚未就绪'
      );
      const checked = systems.locomotion.validateSerialized(data.locomotionState);
      if (!checked.ok) return this._failure(
        checked.code, 'locomotionState', '位移状态校验失败'
      );
    }
    if (data.proficiencyState && !systems.proficiency) {
      return this._failure('proficiencyRuntimeUnavailable', 'proficiencyState', '熟练度运行时尚未就绪');
    }
    const proficiencyCheck = systems.proficiency?.validateSerialized?.(data.proficiencyState || {});
    if (proficiencyCheck?.ok === false) {
      return this._prefixedFailure('proficiencyState', proficiencyCheck.errors);
    }
    if (data.constructionState) {
      if (!systems.construction) {
        return this._failure('constructionRuntimeUnavailable', 'constructionState', '营建运行时尚未就绪');
      }
      const inventory = player?.getComponent?.('inventory');
      const constructionCheck = systems.construction.validateSerialized(data.constructionState, {
        resolveInventory: characterId => characterId === player?.id ? inventory : null
      });
      if (!constructionCheck.ok) {
        return this._prefixedFailure('constructionState', constructionCheck.errors);
      }
    }
    return { ok: true, errors: [] };
  }

  /** 在场景实体重建后原子恢复不依赖角色派生职业表现的基础领域状态。 */
  restoreFoundations(data = {}) {
    const systems = this.context.systems || {};
    const player = this.getPlayer();
    if (data.proficiencyState && !systems.proficiency) {
      return this._failure('proficiencyRuntimeUnavailable', 'proficiencyState', '熟练度运行时尚未就绪');
    }
    if (data.constructionState && !systems.construction) {
      return this._failure('constructionRuntimeUnavailable', 'constructionState', '营建运行时尚未就绪');
    }
    const inventory = player?.getComponent?.('inventory');
    const constructionOptions = {
      resolveInventory: characterId => characterId === player?.id ? inventory : null
    };
    const restoreProficiency = state => {
      const result = systems.proficiency?.deserialize?.(clone(state || {}));
      return result?.ok === false
        ? this._prefixedFailure('proficiencyState', result.errors)
        : { ok: true, errors: [] };
    };
    const restoreConstruction = state => {
      if (!systems.construction || state == null) return { ok: true, errors: [] };
      const result = systems.construction.deserialize(clone(state), constructionOptions);
      if (result?.ok) return { ok: true, errors: [] };
      return this._prefixedFailure('constructionState', result?.errors || [{
        code: result?.code || 'constructionRestoreFailed',
        path: '',
        message: '营建状态恢复失败'
      }]);
    };

    const steps = [];
    if (systems.playerDefeat?.deserialize) steps.push({
      path: 'defeatState',
      capture: () => clone(systems.playerDefeat.serialize?.() || {}),
      apply: () => {
        systems.playerDefeat.deserialize(clone(data.defeatState || {}));
        return { ok: true, errors: [] };
      },
      rollback: before => systems.playerDefeat.deserialize(clone(before))
    });
    if (systems.gathering?.deserialize) steps.push({
      path: 'gatheringState',
      capture: () => clone(systems.gathering.serialize?.() || {}),
      apply: () => {
        systems.gathering.deserialize(clone(data.gatheringState || {}));
        return { ok: true, errors: [] };
      },
      rollback: before => systems.gathering.deserialize(clone(before))
    });
    if (systems.proficiency?.deserialize) steps.push({
      path: 'proficiencyState',
      capture: () => clone(systems.proficiency.serialize?.() || {}),
      apply: () => restoreProficiency(data.proficiencyState || {}),
      rollback: before => restoreProficiency(before)
    });
    if (data.constructionState && systems.construction?.deserialize) steps.push({
      path: 'constructionState',
      capture: () => clone(systems.construction.serialize?.() || {}),
      apply: () => restoreConstruction(data.constructionState),
      rollback: before => restoreConstruction(before)
    });
    return this._runAtomic(steps);
  }

  /** 职业事实同步完成后原子恢复位移租约与采集傀儡实体。 */
  restoreActors(data = {}) {
    const systems = this.context.systems || {};
    const player = this.getPlayer();
    if (data.locomotionState && !systems.locomotion) {
      return this._failure('locomotionRuntimeUnavailable', 'locomotionState', '位移运行时尚未就绪');
    }
    const restoreLocomotion = state => {
      const result = systems.locomotion?.deserialize?.(player, clone(state));
      return result?.ok
        ? { ok: true, errors: [] }
        : this._failure(result?.code || 'locomotionRestoreFailed', 'locomotionState', '位移状态恢复失败');
    };
    const puppetOptions = {
      owner: player,
      resolveNode: nodeId => this.getEntities().find(entity => entity?.id === nodeId) || null
    };
    const restorePuppet = state => {
      const result = systems.gatheringPuppet?.deserialize?.(clone(state || {}), puppetOptions);
      return result?.ok === false
        ? this._failure(result.code || 'puppetRestoreFailed', 'puppetState', `采集傀儡恢复失败: ${result.code || 'unknown'}`)
        : { ok: true, errors: [] };
    };

    const steps = [];
    if (data.locomotionState && systems.locomotion?.deserialize) steps.push({
      path: 'locomotionState',
      capture: () => clone(systems.locomotion.serialize?.(player) || {}),
      apply: () => restoreLocomotion(data.locomotionState),
      rollback: before => restoreLocomotion(before)
    });
    if (systems.gatheringPuppet?.deserialize) steps.push({
      path: 'puppetState',
      capture: () => clone(systems.gatheringPuppet.serialize?.() || {}),
      apply: () => restorePuppet(data.puppetState || {}),
      rollback: before => restorePuppet(before)
    });
    return this._runAtomic(steps);
  }

  /** 完整捕获后依次提交；当前失败步骤也进入逆序回滚。 @private */
  _runAtomic(steps) {
    let prepared;
    try {
      prepared = steps.map(step => ({ ...step, before: step.capture() }));
    } catch (error) {
      return this._failure(
        'gameplaySnapshotRollbackCaptureFailed',
        'gameplaySnapshot',
        error?.message || '玩法快照恢复前状态采集失败'
      );
    }

    for (let index = 0; index < prepared.length; index += 1) {
      const step = prepared[index];
      let result;
      try {
        result = step.apply();
      } catch (error) {
        result = this._failure(
          'gameplaySnapshotRestoreFailed',
          step.path,
          error?.message || '玩法快照恢复失败'
        );
      }
      if (result?.ok !== false) continue;

      const rollbackErrors = [];
      for (let rollbackIndex = index; rollbackIndex >= 0; rollbackIndex -= 1) {
        const rollbackStep = prepared[rollbackIndex];
        try {
          const rollbackResult = rollbackStep.rollback(rollbackStep.before);
          if (rollbackResult?.ok === false) {
            rollbackErrors.push({
              code: 'gameplaySnapshotRollbackFailed',
              path: `rollback.${rollbackStep.path}`,
              message: rollbackResult.errors?.[0]?.message || '玩法快照回滚失败'
            });
          }
        } catch (error) {
          rollbackErrors.push({
            code: 'gameplaySnapshotRollbackFailed',
            path: `rollback.${rollbackStep.path}`,
            message: error?.message || '玩法快照回滚失败'
          });
        }
      }
      return rollbackErrors.length > 0
        ? { ok: false, errors: [...(result.errors || []), ...rollbackErrors] }
        : result;
    }
    return { ok: true, errors: [] };
  }

  _failure(code, path, message) {
    return { ok: false, errors: [{ code, path, message }] };
  }

  _prefixedFailure(prefix, errors = []) {
    return {
      ok: false,
      errors: errors.map(error => ({
        ...error,
        path: error.path ? `${prefix}.${error.path}` : prefix
      }))
    };
  }
}

export default SceneGameplaySnapshotRuntime;
