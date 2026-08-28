// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { TriggerTracePanel } from './TriggerTracePanel.js';

function buildEditor(project) {
  return {
    project,
    selectById: () => {}
  };
}

const baseProject = () => ({
  triggerCatalog: { events: [{ value: 'interact', label: '交互' }] },
  triggers: [
    { id: 'trg-a', when: { type: 'interact' }, once: true },
    { id: 'trg-b', when: { type: 'kill' } }
  ]
});

describe('TriggerTracePanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('tr-trace-styles')?.remove();
  });

  it('show() 挂载 overlay 并显示；hide 后 overlay 保留可再次 show', () => {
    const panel = new TriggerTracePanel(buildEditor(baseProject()));
    expect(panel.show()).toBe(true);
    expect(panel.overlay).toBeTruthy();
    expect(panel.overlay.style.display).toBe('flex');
    expect(panel.hide()).toBe(false);
    expect(panel.overlay.style.display).toBe('none');
    expect(panel.show()).toBe(true);
  });

  it('toggle() 反复切换可见性', () => {
    const panel = new TriggerTracePanel(buildEditor(baseProject()));
    expect(panel.toggle()).toBe(true);
    expect(panel.toggle()).toBe(false);
    expect(panel.toggle()).toBe(true);
  });

  it('pushTrace 记录轨迹：benign 显示「✅ 良性跳过（已提交）」色标', () => {
    const panel = new TriggerTracePanel(buildEditor(baseProject()));
    panel.show();
    panel.pushTrace({ eventType: 'gathering.completed', triggerId: 'trg-a', result: 'benign' });
    const html = panel.overlay.querySelector('.tr-trace-log').innerHTML;
    expect(html).toContain('trg-a');
    expect(html).toContain('✅ 良性跳过（已提交）');
  });

  it('clear 清空轨迹', () => {
    const panel = new TriggerTracePanel(buildEditor(baseProject()));
    panel.show();
    panel.pushTrace({ eventType: 'x', triggerId: 'trg-a', result: 'succeeded' });
    panel.clear();
    expect(panel.overlay.querySelector('.tr-trace-log').textContent).toContain('暂无轨迹');
  });

  it('事件探针：按 when.type 静态匹配 Trigger', () => {
    const panel = new TriggerTracePanel(buildEditor(baseProject()));
    panel.show();
    panel.overlay.querySelector('.tr-trace-probe-event').value = 'interact';
    panel._runProbe();
    const resultHtml = panel.overlay.querySelector('.tr-trace-probe-result').innerHTML;
    expect(resultHtml).toContain('trg-a');
    expect(resultHtml).not.toContain('trg-b');
  });
});
