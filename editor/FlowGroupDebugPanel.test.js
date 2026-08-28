// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { FlowGroupDebugPanel } from './FlowGroupDebugPanel.js';

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildEditor(project) {
  return {
    project,
    _getScenes: () => [{ id: 's1', name: '场景一' }, { id: 's2', name: '场景二' }],
    _escapeHtml: escapeHtml
  };
}

const leaf = (operator, value, blackboardKey = 'act') => ({
  operator: 'AND',
  children: [{ type: 'leaf', conditionType: 'variable', config: { blackboardKey, path: '', operator, value } }]
});

const baseProject = () => ({
  flowGroups: [
    { id: 'fg-root', name: '第一章', scope: { sceneIds: ['s1'] }, order: 0, completionWhen: leaf('equals', 5) },
    { id: 'fg-child', name: '第二章', scope: { sceneIds: ['s1'] }, order: 1, dependsOn: ['fg-root'] }
  ]
});

describe('FlowGroupDebugPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('fg-debug-styles')?.remove();
  });

  it('show() 挂载面板并渲染所有 FlowGroup 的实时 phase', () => {
    const panel = new FlowGroupDebugPanel(buildEditor(baseProject()));
    panel.show();

    expect(panel.overlay).toBeTruthy();
    expect(panel.machine).toBeTruthy();
    // 无依赖无条件 → fg-root 立即 active；fg-child 依赖未完成 → locked
    expect(panel.machine.getPhase('fg-root')).toBe('active');
    expect(panel.machine.getPhase('fg-child')).toBe('locked');

    const rows = panel.overlay.querySelectorAll('.fg-debug-table tbody tr');
    expect(rows.length).toBe(2);
    expect(panel.overlay.innerHTML).toContain('fg-root');
    expect(panel.overlay.innerHTML).toContain('fg-child');
    expect(panel.overlay.innerHTML).toContain('▶ active');
    expect(panel.overlay.innerHTML).toContain('🔒 locked');
  });

  it('手动「完成」上游 → 下游同轮解锁并自动激活，事件日志记录', () => {
    const panel = new FlowGroupDebugPanel(buildEditor(baseProject()));
    panel.show();

    panel.machine.completeFlowGroup('fg-root', 'debug');
    expect(panel.machine.getPhase('fg-root')).toBe('completed');
    expect(panel.machine.getPhase('fg-child')).toBe('active');

    const logHtml = panel.overlay.querySelector('.fg-debug-log').innerHTML;
    expect(logHtml).toContain('flowGroupCompleted');
    expect(logHtml).toContain('flowGroupUnlocked');
    expect(logHtml).toContain('flowGroupActivated');
    // 表格同步刷新为 completed
    expect(panel.overlay.innerHTML).toContain('✅ completed');
  });

  it('应用变量 JSON → 黑板写入 → completionWhen 满足自动完成', () => {
    const panel = new FlowGroupDebugPanel(buildEditor(baseProject()));
    panel.show();
    expect(panel.machine.getPhase('fg-root')).toBe('active');

    panel.overlay.querySelector('.fg-debug-vars').value = '{"act": 5}';
    panel._applyVariables();

    expect(panel.blackboard.get('act')).toBe(5);
    expect(panel.machine.getPhase('fg-root')).toBe('completed');
    expect(panel.machine.getPhase('fg-child')).toBe('active');
  });

  it('双数组兼容：旧 sceneEvents 定义可被合并进状态机', () => {
    const project = baseProject();
    project.sceneEvents = [...project.flowGroups];
    project.flowGroups = [];
    const panel = new FlowGroupDebugPanel(buildEditor(project));
    panel.show();

    expect(panel.machine.getPhase('fg-root')).toBe('active');
    expect(panel.overlay.querySelectorAll('.fg-debug-table tbody tr').length).toBe(2);
  });

  it('定义校验失败时显示错误而不崩溃', () => {
    const project = baseProject();
    project.flowGroups[1].id = 'fg-root'; // 重复 id
    const panel = new FlowGroupDebugPanel(buildEditor(project));
    panel.show();

    expect(panel.machine).toBeNull();
    const errorBox = panel.overlay.querySelector('.fg-debug-error');
    expect(errorBox.hidden).toBe(false);
    expect(errorBox.textContent).toContain('定义校验失败');
    // 表格显示占位提示
    expect(panel.overlay.querySelector('.fg-debug-table').textContent).toContain('状态机未构建');
  });

  it('toggle() 重复调用切换可见性；hide 后 overlay 保留（可再次 show）', () => {
    const panel = new FlowGroupDebugPanel(buildEditor(baseProject()));
    expect(panel.toggle()).toBe(true);
    expect(panel.overlay.style.display).toBe('flex');
    expect(panel.toggle()).toBe(false);
    expect(panel.overlay.style.display).toBe('none');
    expect(panel.toggle()).toBe(true);
    expect(panel.machine.getPhase('fg-root')).toBe('active');
  });

  it('下钻展开显示组内教程/触发器及其 beginText/endText 辅助提示', () => {
    const project = baseProject();
    project.tutorials = [
      {
        id: 'tut-1', title: '吃掉食物', steps: [{ id: 's1', text: '按{eat}键' }],
        beginText: '采到了野果，肚子饿了', endText: '你吃掉了野果，体力恢复了',
        flowGroupId: 'fg-root'
      }
    ];
    project.triggers = [
      {
        id: 'trg-1',
        when: { type: 'state.transaction', params: { definitionId: 'story.s01.berryEaten' } },
        do: [
          { action: 'tutorial.command', params: { operation: 'complete', tutorialId: 'tut-1' } },
          { action: 'tutorial.command', params: { operation: 'show', tutorialId: 's02.chopWood' } }
        ],
        flowGroupId: 'fg-root'
      }
    ];
    const panel = new FlowGroupDebugPanel(buildEditor(project));
    panel.show();
    expect(panel.overlay.querySelectorAll('.fg-drill-block').length).toBe(0); // 默认收起

    // 点击“下钻”按钮展开
    const drill = panel.overlay.querySelector('button[data-action="drilldown"]');
    drill.click();
    expect(panel.overlay.querySelectorAll('.fg-drill-block').length).toBe(2); // tutorial + trigger

    const html = panel.overlay.innerHTML;
    expect(html).toContain('采到了野果，肚子饿了');   // beginText 预览
    expect(html).toContain('你吃掉了野果，体力恢复了'); // endText 预览
    expect(html).toContain('story.s01.berryEaten');     // trigger when 摘要
    expect(html).toContain('tut-1');
    expect(html).toContain('s02.chopWood');

    // 再点收起
    drill.click();
    expect(panel.overlay.querySelectorAll('.fg-drill-block').length).toBe(0);
  });

  it('触发器动作顺序可在内存内 ↑↓ 试调出现位置（不写工程）', () => {
    const project = baseProject();
    project.triggers = [
      {
        id: 'trg-1',
        when: { type: 'event', the: 'x' },
        do: [
          { action: 'tutorial.command', params: { operation: 'show', tutorialId: 'tut-a' } },
          { action: 'tutorial.command', params: { operation: 'show', tutorialId: 'tut-b' } }
        ],
        flowGroupId: 'fg-root'
      }
    ];
    const panel = new FlowGroupDebugPanel(buildEditor(project));
    panel.show();
    panel.overlay.querySelector('button[data-action="drilldown"]').click();

    // 初始顺序 tut-a 在前
    const firstAct = panel.overlay.querySelector('.fg-drill-act');
    expect(firstAct.textContent).toContain('tut-a');

    // 点击第 0 个动作的 ↓，把 tut-a 移到后面
    firstAct.querySelector('.fg-drill-move[data-dir="down"]').click();
    const firstAfter = panel.overlay.querySelector('.fg-drill-act');
    expect(firstAfter.textContent).toContain('tut-b');

    // 仅内存试调，不写回工程定义
    expect(project.triggers[0].do[0].params.tutorialId).toBe('tut-a');
    // 再次重建状态机后试调序重置
    panel._rebuild();
    panel.overlay.querySelector('button[data-action="drilldown"]').click();
    expect(panel.overlay.querySelector('.fg-drill-act').textContent).toContain('tut-a');
  });
});
