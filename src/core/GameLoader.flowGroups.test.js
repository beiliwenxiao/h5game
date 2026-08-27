/**
 * GameLoader ↔ FlowGroupRuntimeStateMachine 存档集成测试（P3）。
 *
 * 验证 GameLoader.serialize()/deserialize() 对 flowGroups 段的读写：
 * - serialize 包含状态机快照
 * - deserialize 往返恢复 phase/progress/下游推导状态
 * - 旧存档（无 flowGroups 段）向后兼容跳过
 * - 非法 flowGroups 段返回错误且不修改任何运行状态
 */
import { describe, expect, it } from 'vitest';
import { GameLoader } from './GameLoader.js';
import { Blackboard } from './Blackboard.js';
import { FlowGroupDefinitionRepository } from './scene/FlowGroupDefinitionRepository.js';
import { FlowGroupRuntimeStateMachine, FLOW_GROUP_PHASE } from './scene/FlowGroupRuntimeStateMachine.js';

const DEFINITIONS = [
  { id: 'fg-a', name: '第一章', scope: { sceneIds: ['s1'] }, order: 0, control: { maxProgress: 5 } },
  { id: 'fg-b', name: '第二章', scope: { sceneIds: ['s1'] }, order: 1, dependsOn: ['fg-a'] }
];

/** 构造装配了 FlowGroup 状态机的 GameLoader（不经过网络加载，直接注入运行时组件）。 */
function buildLoader() {
  const loader = new GameLoader();
  loader.blackboard = new Blackboard();
  loader.blackboard.init({ act: 0 });
  const repository = new FlowGroupDefinitionRepository(DEFINITIONS);
  loader.flowGroupStateMachine = new FlowGroupRuntimeStateMachine({
    definitions: repository,
    blackboard: loader.blackboard
  });
  loader.flowGroupStateMachine.evaluate();
  return loader;
}

describe('GameLoader FlowGroup 存档集成', () => {
  it('serialize 包含 flowGroups 状态机快照', () => {
    const loader = buildLoader();
    const data = loader.serialize();

    expect(data.flowGroups).toBeDefined();
    expect(data.flowGroups.snapshotSchemaVersion).toBe(1);
    expect(data.flowGroups.groups['fg-a'].phase).toBe(FLOW_GROUP_PHASE.ACTIVE);
    expect(data.flowGroups.groups['fg-b'].phase).toBe(FLOW_GROUP_PHASE.LOCKED);
  });

  it('deserialize 往返恢复 phase/progress 与下游推导状态', () => {
    const source = buildLoader();
    source.flowGroupStateMachine.notifyProgress('fg-a', 't1');
    source.flowGroupStateMachine.notifyProgress('fg-a', 't2');
    source.flowGroupStateMachine.completeFlowGroup('fg-a', 'save-test'); // 下游 fg-b 解锁并激活
    expect(source.flowGroupStateMachine.getPhase('fg-b')).toBe(FLOW_GROUP_PHASE.ACTIVE);

    const target = buildLoader();
    // 目标处于初始状态，确保恢复确实来自存档数据
    expect(target.flowGroupStateMachine.getPhase('fg-a')).toBe(FLOW_GROUP_PHASE.ACTIVE);
    expect(target.flowGroupStateMachine.getPhase('fg-b')).toBe(FLOW_GROUP_PHASE.LOCKED);

    const result = target.deserialize(source.serialize());
    expect(result.ok).toBe(true);
    expect(target.flowGroupStateMachine.getPhase('fg-a')).toBe(FLOW_GROUP_PHASE.COMPLETED);
    expect(target.flowGroupStateMachine.getState('fg-a').progress).toBe(2);
    expect(target.flowGroupStateMachine.getPhase('fg-b')).toBe(FLOW_GROUP_PHASE.ACTIVE);
  });

  it('旧存档无 flowGroups 段时跳过并保持成功（向后兼容）', () => {
    const loader = buildLoader();
    loader.flowGroupStateMachine.completeFlowGroup('fg-a', 'preset');

    const legacyData = {
      blackboard: { act: 1 },
      triggers: loader.triggerSystem.serialize()
    };
    const result = loader.deserialize(legacyData);
    expect(result.ok).toBe(true);
    // flowGroups 段被跳过，状态机保持当前值不被清空
    expect(loader.flowGroupStateMachine.getPhase('fg-a')).toBe(FLOW_GROUP_PHASE.COMPLETED);
  });

  it('非法 flowGroups 段返回错误且不修改任何运行状态', () => {
    const loader = buildLoader();
    const saved = loader.serialize();
    const phaseBefore = loader.flowGroupStateMachine.getPhase('fg-a');
    const progressBefore = loader.flowGroupStateMachine.getState('fg-a').progress;

    const corrupted = {
      ...saved,
      flowGroups: { snapshotSchemaVersion: 1, groups: { 'fg-ghost': { phase: 'active' } } }
    };
    const result = loader.deserialize(corrupted);
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('invalidReference');

    // 原子性：校验失败不应用任何状态
    expect(loader.flowGroupStateMachine.getPhase('fg-a')).toBe(phaseBefore);
    expect(loader.flowGroupStateMachine.getState('fg-a').progress).toBe(progressBefore);
  });

  it('状态机未装配时 serialize 不产生 flowGroups 段且不报错', () => {
    const loader = new GameLoader();
    const data = loader.serialize();
    expect(data.flowGroups).toBeUndefined();
  });
});
