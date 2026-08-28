// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DialogueSystem } from '../src/systems/DialogueSystem.js';
import { Blackboard } from '../src/core/Blackboard.js';
import { FlowGroupDefinitionRepository } from '../src/core/scene/FlowGroupDefinitionRepository.js';
import { FlowGroupRuntimeStateMachine } from '../src/core/scene/FlowGroupRuntimeStateMachine.js';
import { FlowGroupStorylinePanel } from './FlowGroupStorylinePanel.js';

function buildMachine() {
  const blackboard = new Blackboard();
  const repository = new FlowGroupDefinitionRepository([
    { id: 'fg-1', name: '第一章', scope: { sceneIds: ['s1'] }, order: 0, control: { maxProgress: 3 } }
  ]);
  const machine = new FlowGroupRuntimeStateMachine({ definitions: repository, blackboard });
  machine.evaluate();
  return machine;
}

describe('DialogueSystem FlowGroup 接入', () => {
  it('对话挂组：未激活组拒绝开始；完成后回报进度', () => {
    const system = new DialogueSystem();
    const machine = buildMachine();
    system.setFlowGroupStateMachine(machine);
    system.registerDialogue('dlg-1', {
      title: '村长对话', startNode: 'n1',
      nodes: { n1: { text: '你好', nextNode: null } },
      flowGroupId: 'fg-1'
    });
    expect(machine.getPhase('fg-1')).toBe('active'); // 无条件组立即激活

    system.startDialogue('dlg-1');
    expect(system.currentDialogue).toBeTruthy();
    system.endDialogue();
    expect(machine.getState('fg-1').progress).toBe(1); // 完成回报 +1
  });

  it('组完成后门控拒绝再次开始同一对话', () => {
    const system = new DialogueSystem();
    const machine = buildMachine();
    system.setFlowGroupStateMachine(machine);
    system.registerDialogue('dlg-1', { nodes: {}, flowGroupId: 'fg-1' });
    system.registerDialogue('dlg-2', { nodes: {}, flowGroupId: 'fg-1' });
    // maxProgress=3：用 3 次完成对话把组打满
    system.startDialogue('dlg-1'); system.endDialogue();
    system.startDialogue('dlg-2'); system.endDialogue();
    system.registerDialogue('dlg-1', { nodes: {}, flowGroupId: 'fg-1' });
    system.completedDialogues.delete('dlg-1'); // 允许重播
    system.startDialogue('dlg-1'); system.endDialogue();
    expect(machine.getPhase('fg-1')).toBe('completed');
    expect(system.startDialogue('dlg-2')).toBe(false); // completed 组门控
  });
});

describe('FlowGroupStorylinePanel', () => {
  const editor = {
    project: {
      flowGroups: [{ id: 'fg-1', name: '第一章', scope: { sceneIds: ['s1'] }, order: 0,
        activeWhen: { blackboardKey: 'act', equals: 3 }, completionWhen: { blackboardKey: 'flag', equals: true } }],
      triggers: [{ id: 't-1', when: { type: 'interact' }, flowGroupId: 'fg-1', sceneEventId: 'fg-1' }],
      tutorials: [{ id: 'tu-1', steps: [{ text: 'a' }, { text: 'b' }], flowGroupId: 'fg-1' }],
      dialogues: [{ id: 'dlg-1', title: '村长', flowGroupId: 'fg-1' }, { id: 'dlg-x', title: '游离' }]
    },
    _escapeHtml: v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    _status: () => {},
    selectById: () => {}
  };

  it('渲染组卡片：开始/结束条件摘要 + 三类成员 + 未分组区', () => {
    const panel = document.createElement('div');
    new FlowGroupStorylinePanel(editor).render(panel);
    const html = panel.innerHTML;
    expect(html).toContain('第一章');
    expect(html).toContain('▶ 开始条件');
    expect(html).toContain('🏁 结束条件');
    expect(html).toContain('act = 3'); // 条件摘要可读化
    expect(html).toContain('⚡ t-1');
    expect(html).toContain('🎓 tu-1');
    expect(html).toContain('💬 dlg-1');
    expect(html).toContain('未分组成员');
    expect(html).toContain('dlg-x');
  });

  it('未分组成员可指派到组（双写 flowGroupId/sceneEventId）', () => {
    const panel = document.createElement('div');
    const storyline = new FlowGroupStorylinePanel(editor);
    storyline.render(panel);
    const select = panel.querySelector('.story-assign[data-member-id="dlg-x"]');
    expect(select).toBeTruthy();
    select.value = 'fg-1';
    select.dispatchEvent(new Event('change'));
    expect(editor.project.dialogues.find(d => d.id === 'dlg-x').flowGroupId).toBe('fg-1');
    expect(editor.project.dialogues.find(d => d.id === 'dlg-x').sceneEventId).toBe('fg-1');
    // 重渲染后 dlg-x 进入组卡片
    expect(panel.innerHTML).toContain('💬 dlg-x');
  });
});
