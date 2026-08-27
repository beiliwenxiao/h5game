import { describe, expect, it, vi } from 'vitest';
import { Blackboard } from '../Blackboard.js';
import { FlowGroupDefinitionRepository } from './FlowGroupDefinitionRepository.js';
import { FlowGroupRuntimeStateMachine, FLOW_GROUP_PHASE } from './FlowGroupRuntimeStateMachine.js';
import { evaluateCompositeCondition } from './FlowGroupConditionEvaluator.js';

function leaf(operator, value, blackboardKey = 'storyState', path = '') {
  return {
    operator: 'AND',
    children: [{ type: 'leaf', conditionType: 'variable', config: { blackboardKey, path, operator, value } }]
  };
}

describe('FlowGroupConditionEvaluator', () => {
  const blackboard = new Blackboard();

  it('空条件恒真（无门控）', () => {
    expect(evaluateCompositeCondition(null, blackboard)).toBe(true);
    expect(evaluateCompositeCondition(undefined, blackboard)).toBe(true);
  });

  it('equals / notEquals / gte / in / exists 语义', () => {
    blackboard.init({ act: 3, flag: true, chosen: 'b', list: { items: ['a', 'b'] } });
    expect(evaluateCompositeCondition(leaf('equals', 3, 'act'), blackboard)).toBe(true);
    expect(evaluateCompositeCondition(leaf('equals', 4, 'act'), blackboard)).toBe(false);
    expect(evaluateCompositeCondition(leaf('notEquals', 4, 'act'), blackboard)).toBe(true);
    expect(evaluateCompositeCondition(leaf('gte', 3, 'act'), blackboard)).toBe(true);
    expect(evaluateCompositeCondition(leaf('lt', 3, 'act'), blackboard)).toBe(false);
    expect(evaluateCompositeCondition(leaf('in', ['a', 'b'], 'chosen'), blackboard)).toBe(true);
    expect(evaluateCompositeCondition(leaf('in', ['c'], 'chosen'), blackboard)).toBe(false);
    expect(evaluateCompositeCondition(leaf('exists', true, 'list', 'items'), blackboard)).toBe(true);
    expect(evaluateCompositeCondition(leaf('exists', true, 'missing'), blackboard)).toBe(false);
  });

  it('兼容旧格式叶子（blackboardKey/path/equals）与 OR 组合', () => {
    blackboard.init({ act: 3 });
    expect(evaluateCompositeCondition({ blackboardKey: 'act', equals: 3 }, blackboard)).toBe(true);
    expect(evaluateCompositeCondition({
      operator: 'OR',
      children: [{ blackboardKey: 'act', equals: 5 }, { blackboardKey: 'act', gte: 3 }]
    }, blackboard)).toBe(true);
  });
});

describe('FlowGroupRuntimeStateMachine', () => {
  function buildMachine(definitions, variables = {}) {
    const blackboard = new Blackboard();
    blackboard.init(variables);
    const repository = new FlowGroupDefinitionRepository(definitions);
    const machine = new FlowGroupRuntimeStateMachine({ definitions: repository, blackboard });
    return { blackboard, repository, machine };
  }

  it('无依赖且无条件 → 立即 active；completionWhen 满足 → completed', () => {
    const { blackboard, machine } = buildMachine([{
      id: 'fg-a', scope: { sceneIds: ['s1'] }, order: 0,
      completionWhen: leaf('equals', 5, 'act')
    }], { act: 0 });
    machine.evaluate();
    expect(machine.getPhase('fg-a')).toBe(FLOW_GROUP_PHASE.ACTIVE);
    expect(machine.isRunnable('fg-a')).toBe(true);

    blackboard.set('act', 5); // onChange 自动重估
    expect(machine.getPhase('fg-a')).toBe(FLOW_GROUP_PHASE.COMPLETED);
    expect(machine.isRunnable('fg-a')).toBe(false);
  });

  it('dependsOn 未完成 → locked；上游完成 → 解锁 → active（DAG 链）', () => {
    const { blackboard, machine } = buildMachine([
      { id: 'fg-root', scope: { sceneIds: ['s1'] }, order: 0, completionWhen: leaf('equals', 1, 'act') },
      { id: 'fg-child', scope: { sceneIds: ['s1'] }, order: 1, dependsOn: ['fg-root'] }
    ], { act: 0 });
    machine.evaluate();
    expect(machine.getPhase('fg-root')).toBe(FLOW_GROUP_PHASE.ACTIVE);
    expect(machine.getPhase('fg-child')).toBe(FLOW_GROUP_PHASE.LOCKED);
    expect(machine.isRunnable('fg-child')).toBe(false);

    blackboard.set('act', 1); // root 完成 → 同一轮解锁 child
    expect(machine.getPhase('fg-root')).toBe(FLOW_GROUP_PHASE.COMPLETED);
    expect(machine.getPhase('fg-child')).toBe(FLOW_GROUP_PHASE.ACTIVE);
  });

  it('activeWhen 未满足 → dormant；满足后激活', () => {
    const { blackboard, machine } = buildMachine([{
      id: 'fg-gated', scope: { sceneIds: ['s1'] }, order: 0,
      activeWhen: leaf('equals', 3, 'act')
    }]);
    machine.evaluate();
    expect(machine.getPhase('fg-gated')).toBe(FLOW_GROUP_PHASE.DORMANT);
    expect(machine.isRunnable('fg-gated')).toBe(false);

    blackboard.set('act', 3);
    expect(machine.getPhase('fg-gated')).toBe(FLOW_GROUP_PHASE.ACTIVE);
  });

  it('scope 命中：setScene 后仅 scope 内场景可激活', () => {
    const { machine } = buildMachine([{ id: 'fg-scope', scope: { sceneIds: ['s1'] }, order: 0 }]);
    machine.setScene('s2');
    expect(machine.getPhase('fg-scope')).toBe(FLOW_GROUP_PHASE.DORMANT);
    machine.setScene('s1');
    expect(machine.getPhase('fg-scope')).toBe(FLOW_GROUP_PHASE.ACTIVE);
  });

  it('autoActivate=false 需显式 activateFlowGroup', () => {
    const { machine } = buildMachine([{
      id: 'fg-manual', scope: { sceneIds: ['s1'] }, order: 0,
      control: { autoActivate: false }
    }]);
    machine.evaluate();
    expect(machine.getPhase('fg-manual')).toBe(FLOW_GROUP_PHASE.DORMANT);
    expect(machine.activateFlowGroup('fg-manual')).toBe(true);
    expect(machine.getPhase('fg-manual')).toBe(FLOW_GROUP_PHASE.ACTIVE);
  });

  it('progress 累计 + maxProgress 自动完成 + notifyProgressEvery 事件', () => {
    const { machine } = buildMachine([{
      id: 'fg-prog', scope: { sceneIds: ['s1'] }, order: 0,
      control: { maxProgress: 3, notifyProgressEvery: 2 }
    }]);
    machine.evaluate();
    const progressEvents = [];
    machine.onEvent(event => { if (event.type === 'flowGroupProgress') progressEvents.push(event); });

    expect(machine.notifyProgress('fg-prog', 't1')).toBe(true); // 1
    expect(machine.notifyProgress('fg-prog', 't2')).toBe(true); // 2 → 通知
    expect(progressEvents.length).toBe(1);
    expect(machine.getState('fg-prog').progress).toBe(2);
    expect(machine.notifyProgress('fg-prog', 't3')).toBe(true); // 3 → maxProgress 完成
    expect(machine.getPhase('fg-prog')).toBe(FLOW_GROUP_PHASE.COMPLETED);
    expect(machine.notifyProgress('fg-prog', 't4')).toBe(false); // completed 后不再计入
  });

  it('repeatable：完成且 completionWhen 不再满足 → 自动重新武装为 dormant', () => {
    const { blackboard, machine } = buildMachine([{
      id: 'fg-loop', scope: { sceneIds: ['s1'] }, order: 0,
      completionWhen: leaf('equals', 1, 'act'),
      control: { repeatable: true }
    }], { act: 0 });
    machine.evaluate();
    blackboard.set('act', 1);
    expect(machine.getPhase('fg-loop')).toBe(FLOW_GROUP_PHASE.COMPLETED);
    blackboard.set('act', 0); // 条件不再满足 → 重新武装
    expect(machine.getPhase('fg-loop')).toBe(FLOW_GROUP_PHASE.DORMANT);
    blackboard.set('act', 1);
    expect(machine.getPhase('fg-loop')).toBe(FLOW_GROUP_PHASE.COMPLETED);
    expect(machine.getState('fg-loop').completions).toBe(2);
  });

  it('序列化 / 反序列化往返保持 phase 与 progress', () => {
    const { machine } = buildMachine([{
      id: 'fg-save', scope: { sceneIds: ['s1'] }, order: 0,
      control: { maxProgress: 5 }
    }]);
    machine.evaluate();
    machine.notifyProgress('fg-save', 't1');
    const snapshot = machine.serialize();
    expect(snapshot.snapshotSchemaVersion).toBe(1);
    expect(snapshot.groups['fg-save'].phase).toBe(FLOW_GROUP_PHASE.ACTIVE);

    const { machine: restored } = buildMachine([{
      id: 'fg-save', scope: { sceneIds: ['s1'] }, order: 0,
      control: { maxProgress: 5 }
    }]);
    const result = restored.deserialize(snapshot);
    expect(result.ok).toBe(true);
    expect(restored.getPhase('fg-save')).toBe(FLOW_GROUP_PHASE.ACTIVE);
    expect(restored.getState('fg-save').progress).toBe(1);
  });

  it('反序列化拒绝非法 schema 与未知 FlowGroup', () => {
    const { machine } = buildMachine([{ id: 'fg-x', scope: { sceneIds: ['s1'] }, order: 0 }]);
    expect(machine.deserialize({ snapshotSchemaVersion: 2 }).ok).toBe(false);
    expect(machine.deserialize({
      snapshotSchemaVersion: 1, groups: { 'fg-missing': { phase: 'active' } }
    }).ok).toBe(false);
    expect(machine.deserialize({
      snapshotSchemaVersion: 1, groups: { 'fg-x': { phase: 'bogus' } }
    }).ok).toBe(false);
  });

  it('事件监听器异常不打断状态机', () => {
    const { blackboard, machine } = buildMachine([{
      id: 'fg-err', scope: { sceneIds: ['s1'] }, order: 0,
      completionWhen: leaf('equals', 1, 'act')
    }]);
    machine.onEvent(() => { throw new Error('listener boom'); });
    expect(() => machine.evaluate()).not.toThrow();
    blackboard.set('act', 1);
    expect(machine.getPhase('fg-err')).toBe(FLOW_GROUP_PHASE.COMPLETED);
  });
});

describe('TriggerSystem FlowGroup 门控接线', () => {
  it('无状态机时（旧行为）不受影响；有状态机时非 active 组被拒绝', async () => {
    const { TriggerSystem } = await import('../../systems/TriggerSystem.js');
    const repository = new FlowGroupDefinitionRepository([
      { id: 'fg-active', scope: { sceneIds: ['s1'] }, order: 0 },
      { id: 'fg-dormant', scope: { sceneIds: ['s1'] }, order: 1, activeWhen: leaf('equals', 9, 'act') }
    ]);
    const machine = new FlowGroupRuntimeStateMachine({ definitions: repository, blackboard: null });
    machine.evaluate();
    const system = new TriggerSystem({ flowGroupStateMachine: machine });
    system.init({ flowGroupStateMachine: machine });

    const triggerActive = { id: 'trg-a', flowGroupId: 'fg-active', when: { type: 'sceneEnter' }, do: [] };
    const triggerDormant = { id: 'trg-d', flowGroupId: 'fg-dormant', when: { type: 'sceneEnter' }, do: [] };
    const triggerFree = { id: 'trg-free', when: { type: 'sceneEnter' }, do: [] };
    expect(system.register(triggerActive)).toBe(triggerActive);
    expect(system.register(triggerDormant)).toBe(triggerDormant);
    expect(system.register(triggerFree)).toBe(triggerFree);

    expect(system._eligible(triggerActive)).toBe(true);
    expect(system._eligible(triggerDormant)).toBe(false);
    expect(system._eligible(triggerFree)).toBe(true); // 未挂组不受门控

    // 旧字段 sceneEventId 同样命中门控（双读）
    expect(system._eligible({ id: 'trg-legacy', sceneEventId: 'fg-dormant', when: { type: 'sceneEnter' }, do: [] })).toBe(false);
  });
});
