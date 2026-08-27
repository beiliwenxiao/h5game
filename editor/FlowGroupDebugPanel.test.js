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
});
