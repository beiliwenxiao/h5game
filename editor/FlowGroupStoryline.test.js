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
    expect(html).toContain('⚡ 触发器');
    expect(html).toContain('t-1');
    expect(html).toContain('🎓 教程');
    expect(html).toContain('tu-1');
    expect(html).toContain('💬 对话');
    expect(html).toContain('dlg-1');
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
    expect(panel.innerHTML).toContain('dlg-x');
  });

  it('触发器编排：展开后上移会改写 do[] 顺序（出现/消失时机）', () => {
    const editor2 = {
      project: {
        flowGroups: [{ id: 'fg-1', name: '第一章', order: 0 }],
        triggers: [{ id: 't-1', when: { type: 'interact' }, flowGroupId: 'fg-1',
          do: [
            { action: 'tutorial.command', params: { operation: 'show', tutorialId: 'tu-a' }, stepId: 's1' },
            { action: 'tutorial.command', params: { operation: 'complete', tutorialId: 'tu-b' }, stepId: 's2' }
          ] }],
        tutorials: [{ id: 'tu-a', title: 'A' }, { id: 'tu-b', title: 'B' }]
      },
      _escapeHtml: v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      _status: () => {},
      _nextStableId: (base, list) => `${base}-${list.length + 1}`,
      selectById: () => {}
    };
    const panel = document.createElement('div');
    const storyline = new FlowGroupStorylinePanel(editor2);
    storyline.render(panel);
    // 展开编排块
    panel.querySelector('.story-orch-toggle').click();
    expect(panel.innerHTML).toContain('动作顺序');
    // 点击第二个动作的"上移" → tu-b 走到 tu-a 前面
    const down = panel.querySelectorAll('.story-orch-step')[1].querySelector('.story-orch-up');
    down.click();
    expect(editor2.project.triggers[0].do[0].params.tutorialId).toBe('tu-b');
    expect(editor2.project.triggers[0].do[1].params.tutorialId).toBe('tu-a');
  });

  it('教程编排：内联编辑开场提示写回教程定义', () => {
    const editor2 = {
      project: {
        flowGroups: [{ id: 'fg-1', name: '第一章', order: 0 }],
        tutorials: [{ id: 'tu-1', steps: [{ text: 'a' }], flowGroupId: 'fg-1' }]
      },
      _escapeHtml: v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      _status: () => {},
      selectById: () => {}
    };
    const panel = document.createElement('div');
    const storyline = new FlowGroupStorylinePanel(editor2);
    storyline.render(panel);
    const input = panel.querySelector('.story-begin[data-tutorial="tu-1"]');
    input.value = '首次任务：吃野果';
    input.dispatchEvent(new Event('change'));
    expect(editor2.project.tutorials[0].beginText).toBe('首次任务：吃野果');
  });

  it('「按钮写法」帮助：按钮打开全局弹层并列出 InputHints 动作清单，可关闭', async () => {
    const panel = document.createElement('div');
    const storyline = new FlowGroupStorylinePanel(editor);
    storyline.render(panel);
    const openBtn = panel.querySelector('.story-btn-help');
    expect(openBtn).toBeTruthy();
    await storyline.openButtonHelp(); // 打开全局弹层
    const overlay = document.querySelector('.story-btn-help-overlay');
    expect(overlay).toBeTruthy();
    // 弹层枚举了文档中出现的常见动作写法（以 InputHints 分支为准）
    const tokens = [...overlay.querySelectorAll('.story-help-tokens')].map(el => el.textContent).join(' ');
    expect(tokens).toContain('{attack}');
    expect(tokens).toContain('{pickup}');
    expect(tokens).toContain('{harvest}');
    expect(tokens).toContain('{key:attack}');
    // 点击关闭移除全局弹层
    overlay.querySelector('.story-btn-help-close').click();
    expect(document.querySelector('.story-btn-help-overlay')).toBeNull();
  });
});
