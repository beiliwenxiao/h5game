/**
 * FlowGroupDebugPanel - FlowGroup 状态机调试面板（P2）。
 *
 * 在 Editor 内实例化一份 FlowGroupRuntimeStateMachine（与运行时同一实现），
 * 实时展示每个 FlowGroup 的 phase / progress / activations / completions，
 * 并提供手动控制（激活/完成/重置/进度+1）、场景 scope 模拟、黑板变量注入。
 *
 * 数据来源：当前 TriggerEditor.project 的 flowGroups（兼容期内与 sceneEvents 双轨合并）。
 * 本面板只读工程定义、只在内存中模拟，不写回任何工程文件。
 */

import { Blackboard } from '../src/core/Blackboard.js';
import { FlowGroupDefinitionRepository } from '../src/core/scene/FlowGroupDefinitionRepository.js';
import { FlowGroupRuntimeStateMachine, FLOW_GROUP_PHASE } from '../src/core/scene/FlowGroupRuntimeStateMachine.js';
import { normalizeLegacyCondition } from '../src/migration/SceneEventToFlowGroupMigrator.js';

const asList = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();

// flowGroups / sceneEvents 双数组合并去重（flowGroups 优先），与 TriggerEditor 同规则
const mergeFlowGroups = (project = {}) => {
  const map = new Map();
  [...(Array.isArray(project.sceneEvents) ? project.sceneEvents : []),
   ...(Array.isArray(project.flowGroups) ? project.flowGroups : [])].forEach(fg => {
    if (fg?.id) map.set(fg.id, fg);
  });
  return [...map.values()];
};

const PHASE_META = {
  [FLOW_GROUP_PHASE.LOCKED]: { label: '🔒 locked', color: '#8a93a8', bg: '#2a3040' },
  [FLOW_GROUP_PHASE.DORMANT]: { label: '⏸ dormant', color: '#e8a33d', bg: '#3a2f1a' },
  [FLOW_GROUP_PHASE.ACTIVE]: { label: '▶ active', color: '#4CAF50', bg: '#1a3320' },
  [FLOW_GROUP_PHASE.COMPLETED]: { label: '✅ completed', color: '#4a9bd8', bg: '#1a2a3a' }
};

export class FlowGroupDebugPanel {
  /** @param {TriggerEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.overlay = null;
    this.machine = null;
    this.blackboard = null;
    this.repository = null;
    this._unsubscribeMachine = null;
    this._logEntries = [];
    this._visible = false;
  }

  /** 显示/隐藏面板；每次显示都从工程定义重建状态机。 */
  toggle() {
    if (this._visible) this.hide();
    else this.show();
    return this._visible;
  }

  show() {
    if (!this.overlay) this._buildOverlay();
    this._visible = true;
    this.overlay.style.display = 'flex';
    this._rebuild();
    return true;
  }

  hide() {
    this._visible = false;
    if (this.overlay) this.overlay.style.display = 'none';
    return false;
  }

  _buildOverlay() {
    this._injectStyles();
    this.overlay = document.createElement('div');
    this.overlay.className = 'fg-debug-overlay';
    this.overlay.innerHTML = `
      <div class="fg-debug-modal">
        <div class="fg-debug-header">
          <strong>🐞 FlowGroup 状态机调试</strong>
          <span class="fg-debug-sub">内存模拟（与运行时同一实现）；不写回工程文件</span>
          <button class="fg-debug-close" title="关闭">✕</button>
        </div>
        <div class="fg-debug-controls">
          <label>当前场景 scope</label>
          <select class="fg-debug-scene"></select>
          <label>黑板变量 JSON</label>
          <textarea class="fg-debug-vars" placeholder='如 {"act": 0, "flag": false}' spellcheck="false"></textarea>
          <button class="fg-debug-apply-vars">应用变量</button>
          <button class="fg-debug-rebuild">🔄 重建状态机</button>
        </div>
        <div class="fg-debug-error" hidden></div>
        <div class="fg-debug-table-wrap"><table class="fg-debug-table"></table></div>
        <div class="fg-debug-log-title">事件日志（最近 50 条）</div>
        <div class="fg-debug-log"></div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    this.overlay.querySelector('.fg-debug-close').addEventListener('click', () => this.hide());
    this.overlay.querySelector('.fg-debug-rebuild').addEventListener('click', () => this._rebuild());
    this.overlay.querySelector('.fg-debug-apply-vars').addEventListener('click', () => this._applyVariables());
    this.overlay.querySelector('.fg-debug-scene').addEventListener('change', event => {
      if (!this.machine) return;
      try { this.machine.setScene(text(event.target.value) || null); }
      catch (error) { this._showError(`setScene 失败: ${error.message}`); }
      this._renderTable();
    });
    this._renderSceneOptions();
  }

  _injectStyles() {
    if (document.getElementById('fg-debug-styles')) return;
    const style = document.createElement('style');
    style.id = 'fg-debug-styles';
    style.textContent = `
      .fg-debug-overlay{position:fixed;inset:0;background:rgba(5,10,25,.72);z-index:10000;display:none;align-items:center;justify-content:center;}
      .fg-debug-modal{width:min(920px,92vw);max-height:88vh;display:flex;flex-direction:column;background:#0d1326;color:#e6ecf7;border:1px solid #2a3a5e;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.55);overflow:hidden;font-size:13px;}
      .fg-debug-header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#101a30;border-bottom:1px solid #2a3a5e;}
      .fg-debug-sub{color:#8aa;font-size:11px;}
      .fg-debug-close{margin-left:auto;background:#3a4a7e;border:none;color:#fff;border-radius:4px;padding:4px 10px;cursor:pointer;}
      .fg-debug-controls{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#16213e;border-bottom:1px solid #2a3a5e;flex-wrap:wrap;}
      .fg-debug-controls label{color:#93a8cc;font-size:11px;}
      .fg-debug-controls select,.fg-debug-controls textarea{background:#26304e;color:#e6ecf7;border:1px solid #3a4a7e;border-radius:4px;padding:5px 8px;font-size:12px;}
      .fg-debug-controls textarea{flex:1;min-width:260px;min-height:34px;max-height:64px;font-family:Consolas,monospace;resize:vertical;}
      .fg-debug-controls button{background:#3a4a7e;border:none;color:#fff;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;}
      .fg-debug-controls button:hover{background:#4a5d9e;}
      .fg-debug-error{padding:8px 16px;color:#ff8a80;background:#2a1a1a;font-size:12px;border-bottom:1px solid #3a2a2a;white-space:pre-wrap;}
      .fg-debug-table-wrap{flex:1;overflow:auto;min-height:120px;padding:8px 16px;}
      .fg-debug-table{width:100%;border-collapse:collapse;}
      .fg-debug-table th{position:sticky;top:0;background:#101a30;color:#93a8cc;text-align:left;font-weight:normal;font-size:11px;padding:6px 8px;border-bottom:1px solid #2a3a5e;}
      .fg-debug-table td{padding:7px 8px;border-bottom:1px solid #1e2b47;vertical-align:middle;}
      .fg-debug-phase{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:bold;white-space:nowrap;}
      .fg-debug-name{color:#e6ecf7;font-weight:600;}
      .fg-debug-id{color:#7a8aab;font-size:11px;}
      .fg-debug-dep{font-size:11px;color:#93a8cc;}
      .fg-debug-rowbtn{background:#26304e;border:1px solid #3a4a7e;color:#bcd;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:11px;margin-right:4px;}
      .fg-debug-rowbtn:hover{background:#34406a;color:#fff;}
      .fg-debug-progress{height:6px;background:#1a2440;border-radius:3px;overflow:hidden;min-width:80px;}
      .fg-debug-progress>div{height:100%;background:#4CAF50;border-radius:3px;}
      .fg-debug-log-title{padding:6px 16px 2px;color:#93a8cc;font-size:11px;border-top:1px solid #2a3a5e;background:#101a30;}
      .fg-debug-log{max-height:150px;overflow-y:auto;padding:4px 16px 10px;font-family:Consolas,monospace;font-size:11px;color:#9ab0d0;background:#0a1020;}
      .fg-debug-log-entry{padding:1px 0;border-bottom:1px dotted #1a2440;}
      .fg-debug-log-time{color:#5a6a8a;margin-right:6px;}
      .fg-debug-evt-activated{color:#4CAF50;}
      .fg-debug-evt-completed{color:#4a9bd8;}
      .fg-debug-evt-unlocked{color:#e8a33d;}
      .fg-debug-evt-reset{color:#c07a9a;}
      .fg-debug-evt-progress{color:#8a93a8;}
    `;
    document.head.appendChild(style);
  }

  _renderSceneOptions() {
    const select = this.overlay?.querySelector('.fg-debug-scene');
    if (!select) return;
    const scenes = this.editor?._getScenes?.() || [];
    select.innerHTML = '<option value="">（全局：不限定场景）</option>' + scenes.map(scene => (
      `<option value="${this._escape(scene.id)}">${this._escape(scene.name || scene.id)}</option>`
    )).join('');
  }

  /** 从工程定义重建状态机（定义 + 变量重置为面板当前输入）。 */
  _rebuild() {
    const errorBox = this.overlay.querySelector('.fg-debug-error');
    errorBox.hidden = true;
    errorBox.textContent = '';

    if (this._unsubscribeMachine) {
      try { this._unsubscribeMachine(); } catch { /* listener already gone */ }
      this._unsubscribeMachine = null;
    }
    this.machine = null;
    this.blackboard = null;
    this.repository = null;
    this._logEntries = [];

    const project = this.editor?.project || {};
    const definitions = mergeFlowGroups(project)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
      .map(definition => {
        const cloned = JSON.parse(JSON.stringify(definition));
        if (cloned.activeWhen && typeof cloned.activeWhen === 'object') {
          cloned.activeWhen = normalizeLegacyCondition(cloned.activeWhen);
        }
        if (cloned.completionWhen && typeof cloned.completionWhen === 'object') {
          cloned.completionWhen = normalizeLegacyCondition(cloned.completionWhen);
        }
        return cloned;
      });

    try {
      this.repository = new FlowGroupDefinitionRepository(definitions);
    } catch (error) {
      this._showError(`定义校验失败（先在 FlowGroup 页修正后重试）：\n${error.message}`);
      this._renderTable();
      this._renderLog();
      return;
    }

    this.blackboard = new Blackboard();
    this.machine = new FlowGroupRuntimeStateMachine({
      definitions: this.repository,
      blackboard: this.blackboard,
      currentSceneId: text(this.overlay.querySelector('.fg-debug-scene').value) || null
    });
    this._unsubscribeMachine = this.machine.onEvent(event => this._onMachineEvent(event));
    this._applyVariables(true);
    this.machine.evaluate(); // 初始推导（变量为空时 _applyVariables 提前返回，这里兜底）
    this._renderTable();
    this._renderLog();
  }

  /** 解析变量 JSON 并写入黑板（触发自动重估）。 */
  _applyVariables(silent = false) {
    if (!this.blackboard) return;
    const source = text(this.overlay.querySelector('.fg-debug-vars').value);
    if (!source) {
      if (!silent) this._showError('变量 JSON 为空');
      return;
    }
    let parsed;
    try { parsed = JSON.parse(source); }
    catch (error) {
      this._showError(`变量 JSON 解析失败: ${error.message}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this._showError('变量必须是 JSON 对象，如 {"act": 0}');
      return;
    }
    this.overlay.querySelector('.fg-debug-error').hidden = true;
    for (const [key, value] of Object.entries(parsed)) this.blackboard.set(key, value);
    this._renderTable();
  }

  _onMachineEvent(event) {
    const time = new Date().toLocaleTimeString();
    this._logEntries.unshift({ time, event });
    if (this._logEntries.length > 50) this._logEntries.length = 50;
    this._renderLog();
    this._renderTable();
  }

  _renderTable() {
    const table = this.overlay?.querySelector('.fg-debug-table');
    if (!table) return;
    if (!this.machine || !this.repository) {
      table.innerHTML = '<tbody><tr><td style="color:#8a93a8;padding:16px;">状态机未构建（定义校验失败或无 FlowGroup）</td></tr></tbody>';
      return;
    }
    const rows = [...this.repository.values()]
      .sort((left, right) => left.order - right.order)
      .map(definition => this._renderRow(definition));
    table.innerHTML = `
      <thead><tr>
        <th>FlowGroup</th><th>phase</th><th>progress</th><th>激活/完成</th><th>dependsOn</th><th>操作</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    `;
    for (const button of table.querySelectorAll('button[data-action]')) {
      button.addEventListener('click', () => this._onRowAction(button.dataset.action, button.dataset.id));
    }
  }

  _renderRow(definition) {
    const state = this.machine.getState(definition.id) || {};
    const meta = PHASE_META[state.phase] || PHASE_META[FLOW_GROUP_PHASE.LOCKED];
    const control = definition.control || {};
    const progress = Number(state.progress) || 0;
    const maxProgress = Number.isFinite(control.maxProgress) ? Number(control.maxProgress) : null;
    const progressCell = maxProgress != null && maxProgress > 0
      ? `<div class="fg-debug-progress"><div style="width:${Math.min(100, Math.round(progress / maxProgress * 100))}%"></div></div>
         <small style="color:#93a8cc;">${progress} / ${maxProgress}</small>`
      : `<small style="color:#93a8cc;">${progress}${maxProgress != null ? ` / ${maxProgress}` : ''}</small>`;

    const deps = asList(definition.dependsOn);
    const depsCell = deps.length
      ? deps.map(depId => {
        const depPhase = this.machine.getPhase(depId) || FLOW_GROUP_PHASE.LOCKED;
        const depMeta = PHASE_META[depPhase] || PHASE_META[FLOW_GROUP_PHASE.LOCKED];
        return `<span class="fg-debug-dep" style="color:${depMeta.color};">${depMeta.label.split(' ')[1]}:${this._escape(depId)}</span>`;
      }).join(' ')
      : '<span class="fg-debug-dep">—</span>';

    const scopeHint = this.machine.currentSceneId
      && asList(definition.scope?.sceneIds).length
      && !asList(definition.scope?.sceneIds).includes(this.machine.currentSceneId)
      ? '<div><small style="color:#e8a33d;">⚠ 当前场景不在 scope</small></div>'
      : '';

    return `
      <tr>
        <td>
          <div class="fg-debug-name">${this._escape(definition.name || definition.id)}</div>
          <div class="fg-debug-id">${this._escape(definition.id)}</div>
          ${scopeHint}
        </td>
        <td><span class="fg-debug-phase" style="color:${meta.color};background:${meta.bg};">${meta.label}</span></td>
        <td>${progressCell}</td>
        <td><small style="color:#93a8cc;">${Number(state.activations) || 0} / ${Number(state.completions) || 0}</small></td>
        <td>${depsCell}</td>
        <td>
          <button class="fg-debug-rowbtn" data-action="activate" data-id="${this._escape(definition.id)}" title="manual 激活（绕过 autoActivate）">激活</button>
          <button class="fg-debug-rowbtn" data-action="complete" data-id="${this._escape(definition.id)}" title="manual 完成（绕过 completionWhen）">完成</button>
          <button class="fg-debug-rowbtn" data-action="progress" data-id="${this._escape(definition.id)}" title="模拟一次组内成员成功（progress +1）">+1</button>
          <button class="fg-debug-rowbtn" data-action="reset" data-id="${this._escape(definition.id)}" title="重置回初始阶段">重置</button>
        </td>
      </tr>
    `;
  }

  _onRowAction(action, flowGroupId) {
    if (!this.machine || !flowGroupId) return;
    try {
      if (action === 'activate') this.machine.activateFlowGroup(flowGroupId, 'debug');
      else if (action === 'complete') this.machine.completeFlowGroup(flowGroupId, 'debug');
      else if (action === 'progress') this.machine.notifyProgress(flowGroupId, 'debug-panel', 'debug');
      else if (action === 'reset') this.machine.resetFlowGroup(flowGroupId);
    } catch (error) {
      this._showError(`操作失败 (${action} ${flowGroupId}): ${error.message}`);
    }
    this._renderTable();
  }

  _renderLog() {
    const log = this.overlay?.querySelector('.fg-debug-log');
    if (!log) return;
    if (!this._logEntries.length) {
      log.innerHTML = '<div class="fg-debug-log-entry" style="color:#5a6a8a;">（暂无事件）</div>';
      return;
    }
    log.innerHTML = this._logEntries.map(({ time, event }) => {
      const typeClass = `fg-debug-evt-${({
        flowGroupActivated: 'activated',
        flowGroupCompleted: 'completed',
        flowGroupUnlocked: 'unlocked',
        flowGroupReset: 'reset',
        flowGroupProgress: 'progress'
      })[event.type] || 'progress'}`;
      const detail = event.type === 'flowGroupProgress'
        ? `progress=${event.progress} source=${event.sourceType}:${event.sourceId ?? ''}`
        : (event.reason ? `reason=${event.reason}` : '');
      return `<div class="fg-debug-log-entry"><span class="fg-debug-time">${time}</span><span class="${typeClass}">${this._escape(event.type)}</span> <span style="color:#7a8aab;">${this._escape(event.flowGroupId)}</span> ${this._escape(detail)}</div>`;
    }).join('');
  }

  _showError(message) {
    const errorBox = this.overlay?.querySelector('.fg-debug-error');
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  _escape(value) {
    return this.editor?._escapeHtml?.(value) ?? String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

export default FlowGroupDebugPanel;
