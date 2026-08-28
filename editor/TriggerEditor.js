/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * TriggerEditor - 事件（触发器）编辑器
 *
 * 读写 GameProject（example/<game>/game.project.json）的 triggers[]。
 * 触发器数据见 editor-architecture.md §4.2：{ id, when, if, do, once, cooldown }
 *
 * 通过 Vite dev server 的 /api/read-file、/api/canonical-transaction 读写工程文件（保留其它字段）。
 */

import {
  getTriggerEvents,
  getTriggerActions,
  getTriggerActionDescriptor,
  getTriggerActionOperations,
  getTriggerActionOperation,
  validateTriggerDefinition
} from '../src/systems/TriggerCatalog.js';
import { replaceCanonicalFile } from './CanonicalTransactionClient.js';
import { FlowGroupProjectIndex as _FGIndex, SceneEventProjectIndex } from './SceneEventProjectIndex.js';
import { FlowGroupEditorPanel as _FGPanel, SceneEventEditorPanel } from './SceneEventEditorPanel.js';
import { TutorialEditorPanel } from './TutorialEditorPanel.js';
import { FlowGroupDebugPanel } from './FlowGroupDebugPanel.js';
import { FlowGroupStorylinePanel } from './FlowGroupStorylinePanel.js';

const FlowGroupProjectIndex = _FGIndex || SceneEventProjectIndex;
const FlowGroupEditorPanel = _FGPanel || SceneEventEditorPanel;
const text = v => String(v ?? '').trim();
const resolveFgId = obj => {
  if (!obj) return '';
  const fromFg = text(obj.flowGroupId);
  return fromFg ? fromFg : text(obj.sceneEventId);
};
const syncFgFields = (obj, fgId) => {
  if (!obj) return;
  const clean = text(fgId);
  if (clean) {
    obj.flowGroupId = clean;
    obj.sceneEventId = clean;
  } else {
    delete obj.flowGroupId;
    delete obj.sceneEventId;
  }
};
// FlowGroup(SceneEvent) 双数组合并去重：flowGroups 优先，sceneEvents 次之
const mergeFlowGroups = (project = {}) => {
  const fgs = new Map();
  [...(Array.isArray(project.sceneEvents) ? project.sceneEvents : []),
   ...(Array.isArray(project.flowGroups) ? project.flowGroups : [])].forEach(fg => {
    if (fg?.id) fgs.set(fg.id, fg);
  });
  return [...fgs.values()];
};

let WHEN_TYPES = getTriggerEvents();
let ACTION_TYPES = getTriggerActions();

export class TriggerEditor {
  /**
   * @param {HTMLElement} container
   * @param {Object} options - { gameId }
   */
  constructor(container, options = {}) {
    this.container = container;
    this.gameId = options.gameId || 'sanguo_zhangjiao';
    this.canonicalSession = options.canonicalSession || null;
    this.schemaFields = this.canonicalSession?.fields || null;
    // 场景列表由编辑器入口按当前游戏动态提供，禁止由触发器引用反推。
    this.getSceneList = typeof options.getSceneList === 'function' ? options.getSceneList : () => [];
    // canonical 场景文档由编辑器入口注入；当前未保存场景可覆盖同 ID 的 committed 快照。
    this.getSceneDocuments = typeof options.getSceneDocuments === 'function' ? options.getSceneDocuments : () => [];
    // 当前场景的完整放置点由场景编辑器显式注入，供物品生成动作可视化选择。
    this.getPlacementOptions = typeof options.getPlacementOptions === 'function' ? options.getPlacementOptions : () => [];
    this.onSaved = typeof options.onSaved === 'function' ? options.onSaved : null;
    this.projectPath = `example/${this.gameId}/game.project.json`;
    this.project = null;
    this.triggers = [];
    this.selectedIndex = -1;
    // 三类 canonical 定义分别编辑：FlowGroup 剧情流程(旧名 SceneEvent)、Trigger 业务规则、Tutorial steps[]。
    // target 双轨：flowGroups / sceneEvents 等价，前者优先
    const normalizedTarget = ['flowGroups', 'sceneEvents', 'triggers', 'tutorials'].includes(options.target)
      ? options.target
      : (['sceneEvents', 'triggers', 'tutorials'].includes(options.target) ? options.target : null);
    this.target = normalizedTarget || 'flowGroups';
    // flowGroupPanel（新名）+ sceneEventPanel（旧名别名）同一个实例
    this.flowGroupPanel = new FlowGroupEditorPanel(this);
    this.sceneEventPanel = this.flowGroupPanel;
    this.tutorialPanel = new TutorialEditorPanel(this);
    // P2：FlowGroup 状态机调试面板（内存模拟，不写回工程）
    this.flowGroupDebugPanel = new FlowGroupDebugPanel(this);
    // 方案 A：剧情线总览视图（FlowGroup 主视角，展示开始/结束条件与成员）
    this.storylinePanel = new FlowGroupStorylinePanel(this);
    this._initialized = false;
  }

  async init() {
    if (!this._initialized) {
      this._initialized = true;
      this._buildUI();
      this._injectStyles();
    }
    await this._load();
    this._renderList();
    this._renderDetail();
  }

  /** 加载工程文件 */
  async _load() {
    if (this.canonicalSession) {
      this.project = this.canonicalSession.getValue();
    } else try {
      const res = await fetch('/api/read-file?path=' + encodeURIComponent(this.projectPath));
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.content) {
          this.project = JSON.parse(data.content);
        }
      }
    } catch (e) {
      console.warn('TriggerEditor: 加载工程失败', e);
    }
    if (!this.project) {
      this.project = { meta: { id: this.gameId }, variables: {}, flowGroups: [], sceneEvents: [], triggers: [], tutorials: [] };
    }
    // 三层定义数组都来自同一个 project candidate。flowGroups（新名）+ sceneEvents（旧名）双数组同步
    if (!Array.isArray(this.project.flowGroups)) this.project.flowGroups = [...(Array.isArray(this.project.sceneEvents) ? this.project.sceneEvents : [])];
    if (!Array.isArray(this.project.sceneEvents)) this.project.sceneEvents = [...this.project.flowGroups];
    if (!Array.isArray(this.project.triggers)) this.project.triggers = [];
    if (!Array.isArray(this.project.tutorials)) this.project.tutorials = [];
    // target 归一化：flowGroups 和 sceneEvents 两种 target 最后都解析为对应数组（双数组内容等价）
    const resolveArrayKey = t => t === 'flowGroups' || t === 'sceneEvents'
      ? (Array.isArray(this.project.flowGroups) && this.project.flowGroups.length ? 'flowGroups' : 'sceneEvents')
      : t;
    this.target = resolveArrayKey(this.target);
    this.triggers = this.project[this.target];
    this.projectIndex = new FlowGroupProjectIndex(this.project, { sceneDocuments: this._getSceneDocuments() });
    WHEN_TYPES = getTriggerEvents(this.project);
    ACTION_TYPES = getTriggerActions(this.project);
    this._refreshCatalogControls();
    this._updateToolbarForTarget();
  }

  _refreshCatalogControls() {
    const when = this.container.querySelector('#trg-filter-when');
    const action = this.container.querySelector('#trg-filter-do');
    if (when) when.innerHTML = '<option value="">全部时机</option>' + WHEN_TYPES.map(item => `<option value="${item.v}">${item.label}</option>`).join('');
    if (action) action.innerHTML = '<option value="">全部动作</option>' + ACTION_TYPES.map(item => `<option value="${item.v}">${item.label}</option>`).join('');
    this._updateSceneEventFilter();
  }

  _getScenes() {
    try {
      const scenes = this.getSceneList();
      return Array.isArray(scenes) ? scenes : [];
    } catch (error) {
      console.warn('TriggerEditor: 获取场景列表失败', error);
      return [];
    }
  }

  _getSceneDocuments() {
    try {
      const source = this.getSceneDocuments();
      return Array.isArray(source) ? source : Object.values(source || {});
    } catch (error) {
      console.warn('TriggerEditor: 获取 canonical 场景文档失败', error);
      return [];
    }
  }

  _nextStableId(prefix, definitions = []) {
    const ids = new Set((definitions || []).map(definition => definition?.id).filter(Boolean));
    let sequence = 1;
    let candidate = '';
    do candidate = `${prefix}-${String(sequence++).padStart(3, '0')}`;
    while (ids.has(candidate));
    return candidate;
  }

  _updateToolbarForTarget() {
    if (!this._initialized) return;
    const storyline = this.target === 'storyline';
    // 剧情线总览：列表区与新增/删除隐藏，总览占满详情区
    for (const id of ['trg-add', 'trg-del']) {
      const element = this.container.querySelector(`#${id}`);
      if (element) element.hidden = storyline;
    }
    for (const id of ['trg-list', 'trg-list-resizer']) {
      const element = this.container.querySelector(`#${id}`);
      if (element) element.style.display = storyline ? 'none' : '';
    }
    const detail = this.container.querySelector('#trg-detail');
    if (detail && storyline) detail.style.flex = '1';
    else if (detail) detail.style.flex = '';
    const triggerOnly = this.target === 'triggers';
    for (const id of ['trg-filter-enabled', 'trg-filter-when', 'trg-filter-do']) {
      const element = this.container.querySelector(`#${id}`);
      if (element) element.hidden = !triggerOnly;
    }
    const sceneFilter = this.container.querySelector('#trg-filter-scene');
    if (sceneFilter) sceneFilter.hidden = storyline;
    const eventFilter = this.container.querySelector('#trg-filter-event');
    if (eventFilter) eventFilter.hidden = storyline || this.target === 'sceneEvents' || this.target === 'flowGroups';
    if (!storyline) this._updateSceneEventFilter();
  }

  _updateSceneEventFilter() {
    const select = this.container.querySelector('#trg-filter-event');
    if (!select || !this.project) return;
    const currentValue = text(select.value);
    const definitions = mergeFlowGroups(this.project)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    select.innerHTML = '<option value="">全部 FlowGroup(SceneEvent)</option>' + definitions.map(definition => (
      `<option value="${this._escapeHtml(definition.id)}"${definition.id === currentValue ? ' selected' : ''}>${this._escapeHtml(`${Number(definition.order || 0) + 1}. ${definition.name || definition.id}`)}</option>`
    )).join('');
  }

  /** 切换编辑目标（storyline 总览 ↔ flowGroups(SceneEvent) ↔ triggers ↔ tutorials） */
  _switchTarget(target) {
    // target 双轨：flowGroups / sceneEvents 等价
    const normalized = target === 'sceneEvents' ? 'flowGroups' : target;
    if (normalized === this.target) return;
    this._commitDetail();
    if (this.target !== 'storyline') this.project[this.target] = this.triggers; // 回写当前（storyline 无独立数据）
    // 切换时双数组同步：flowGroups→sceneEvents
    if (this.target === 'flowGroups' || this.target === 'sceneEvents') {
      this.project.flowGroups = [...(Array.isArray(this.project.flowGroups) ? this.project.flowGroups : [])];
      this.project.sceneEvents = [...this.project.flowGroups];
    }
    this.target = normalized;
    // 如果目标是 flowGroups 但数组为空，回退到 sceneEvents（同样内容）
    if (this.target === 'flowGroups' && !Array.isArray(this.project.flowGroups)) this.project.flowGroups = [...(Array.isArray(this.project.sceneEvents) ? this.project.sceneEvents : [])];
    if (this.target === 'flowGroups' && Array.isArray(this.project.sceneEvents) && !this.project.sceneEvents.length) this.project.sceneEvents = [...this.project.flowGroups];
    this.triggers = this.target === 'storyline' ? [] : this.project[this.target];
    this.projectIndex = new FlowGroupProjectIndex(this.project, { sceneDocuments: this._getSceneDocuments() });
    this.selectedIndex = -1;
    this._renderTargetTabs();
    this._updateToolbarForTarget();
    this._renderList();
    this._renderDetail();
  }

  _renderTargetTabs() {
    const wrap = this.container.querySelector('#trg-target-tabs');
    if (!wrap) return;
    wrap.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.target === this.target);
    });
  }

  /** 保存回工程文件（保留其它字段） */
  async save() {
    // 保存前校验当前详情面板的所有 JSON 框
    const bad = this._validateAllJson();
    if (bad) {
      this._toast('JSON 格式错误，请修正后再保存（红框处）', false);
      this._status('❌ JSON 格式错误，未保存', 'err');
      return;
    }
    this._commitDetail(); // 先把当前编辑写回数据
    if (this.target !== 'storyline') this.project[this.target] = this.triggers;
    // 剧情线总览里指派的对话归属也要写回（storyline 修改的是 dialogues[].flowGroupId）
    if (this.target === 'storyline') this.project.dialogues = this.project.dialogues || [];
    // 保存前双数组同步：flowGroups ↔ sceneEvents（优先以 flowGroups 为主）
    if (Array.isArray(this.project.flowGroups) || Array.isArray(this.project.sceneEvents)) {
      const fgs = mergeFlowGroups(this.project);
      this.project.flowGroups = [...fgs];
      this.project.sceneEvents = [...fgs];
    }
    const definitionError = this._validateDefinitions();
    if (definitionError) {
      this._status('❌ ' + definitionError, 'err');
      this._toast(definitionError, false);
      return;
    }
    const targetLabel = {
      storyline: '剧情线总览',
      flowGroups: 'FlowGroup(SceneEvent)',
      sceneEvents: 'FlowGroup(SceneEvent)',
      triggers: 'Trigger',
      tutorials: 'Tutorial'
    }[this.target] || '定义';
    console.log('[TriggerEditor] 准备保存:', this.projectPath, this.target, '数量:', this.triggers.length, JSON.parse(JSON.stringify(this.triggers)));
    try {
      const data = this.canonicalSession
        ? await (async () => {
            this.canonicalSession.patchMany([
              { path: 'flowGroups', value: this.project.flowGroups },
              { path: 'sceneEvents', value: this.project.sceneEvents },
              { path: 'triggers', value: this.project.triggers },
              { path: 'tutorials', value: this.project.tutorials },
              { path: 'dialogues', value: this.project.dialogues }
            ]);
            return this.canonicalSession.save();
          })()
        : await replaceCanonicalFile(this.projectPath, JSON.stringify(this.project, null, 2));
      console.log('[TriggerEditor] 保存返回:', data);
      if (data && (data.ok || data.committed)) {
        this._status(`✅ 已保存到 ${this.projectPath}（${targetLabel} ${this.triggers.length} 条）`, 'ok');
        this._toast(`保存成功（${targetLabel} ${this.triggers.length} 条）`, true);
        await this.onSaved?.(this.project);
      } else {
        this._status('❌ 保存失败: ' + (data.error || '未知'), 'err');
        this._toast('保存失败: ' + (data.error || '未知'), false);
      }
    } catch (e) {
      console.error('[TriggerEditor] 保存异常:', e);
      this._status('❌ 保存失败: ' + e.message, 'err');
      this._toast('保存失败: ' + e.message, false);
    }
  }

  _validateDefinitions() {
    const sceneIds = new Set(this._getScenes().map(scene => scene?.id).filter(Boolean));
    const flowGroups = mergeFlowGroups(this.project);
    const fgIds = new Set(flowGroups.map(definition => definition?.id).filter(Boolean));
    const eventErrors = this.flowGroupPanel.validate(flowGroups, sceneIds);
    if (eventErrors.length) return eventErrors[0];

    const triggerIds = new Set();
    for (const trigger of this.project.triggers || []) {
      const errors = validateTriggerDefinition(trigger, this.project);
      if (errors.length) return `${trigger?.id || '(未命名)'}: ${errors[0]}`;
      if (triggerIds.has(trigger.id)) return `重复 Trigger ID "${trigger.id}"`;
      triggerIds.add(trigger.id);
      const fgId = resolveFgId(trigger);
      if (fgId && !fgIds.has(fgId)) {
        return `${trigger.id}.flowGroupId(sceneEventId) 未登记: ${fgId}`;
      }
    }

    const tutorialErrors = this.tutorialPanel.validate(this.project.tutorials || [], fgIds);
    if (tutorialErrors.length) return tutorialErrors[0];
    return '';
  }

  getTriggers() { return this.project?.triggers || []; }
  getTriggerById(id) { return this.getTriggers().find(trigger => trigger.id === id) || null; }

  selectById(id, target = 'triggers') {
    const normalized = target === 'sceneEvents' ? 'flowGroups' : target;
    if (!id || !this.project || !['flowGroups', 'sceneEvents', 'triggers', 'tutorials'].includes(target)) return false;
    if (this.target !== normalized) this._switchTarget(normalized);
    const index = this.triggers.findIndex(definition => definition.id === id);
    if (index < 0) return false;
    this.selectedIndex = index;
    this._renderList();
    this._renderDetail();
    return true;
  }

  async refresh() {
    await this._load();
    this._renderList();
    this._renderDetail();
    return this;
  }

  /**
   * 校验详情面板所有 JSON 框，返回是否存在非法项（true=有错）
   * @private
   */
  _validateAllJson() {
    const panel = this.container.querySelector('#trg-detail');
    if (!panel) return false;
    const els = (this.target === 'sceneEvents' || this.target === 'flowGroups')
      ? [panel.querySelector('#d-event-active'), panel.querySelector('#d-event-completion')]
      : this.target === 'tutorials'
        ? [panel.querySelector('#d-tutorial-signals'), panel.querySelector('#d-tutorial-movement')]
        : [
            panel.querySelector('#d-when-params'),
            panel.querySelector('#d-if'),
            ...panel.querySelectorAll('.do-params, .do-param-json')
          ];
    let hasError = false;
    for (const el of els) {
      if (!el) continue;
      const v = el.value.trim();
      if (!v) continue; // 空视为合法（可选字段）
      try {
        JSON.parse(v);
      } catch (e) {
        el.style.borderColor = '#e05252';
        el.title = 'JSON 格式错误: ' + e.message;
        hasError = true;
      }
    }
    return hasError;
  }

  /** 弹出式提示（醒目，2秒后淡出） */
  _toast(msg, ok) {
    let t = document.getElementById('trg-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'trg-toast';
      t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);' +
        'padding:12px 28px;border-radius:8px;color:#fff;font-size:15px;font-weight:bold;' +
        'z-index:100000;pointer-events:none;transition:opacity 0.3s;box-shadow:0 4px 16px rgba(0,0,0,0.4);';
      document.body.appendChild(t);
    }
    t.textContent = (ok ? '✅ ' : '❌ ') + msg;
    t.style.background = ok ? '#2e7d32' : '#c62828';
    t.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
  }

  /** 打开全局「按钮写法」弹层（复用剧情线总览的 InputHints 清单）。 */
  _showButtonHelp() {
    this.storylinePanel.openButtonHelp();
  }

  _buildUI() {
    // 构建 when.type 筛选选项
    const whenOpts = WHEN_TYPES.map(w => `<option value="${w.v}">${w.label}</option>`).join('');
    // 构建 do 动作筛选选项
    const doOpts = ACTION_TYPES.map(a => `<option value="${a.v}">${a.label}</option>`).join('');

    this.container.innerHTML = `
      <div class="trg-root">
        <div class="trg-target-tabs" id="trg-target-tabs">
          <button data-target="storyline">📖 剧情线总览</button>
          <button type="button" class="trg-btn-help" data-btn-help>⌨ 按钮写法</button>
          <button data-target="flowGroups">FlowGroup 剧情流程</button>
          <button data-target="triggers">Trigger 业务规则</button>
          <button data-target="tutorials">Tutorial 教学步骤</button>
        </div>
        <div class="trg-toolbar">
          <select id="trg-filter-enabled" title="筛选启用/停用" style="padding:4px;background:#26304e;color:#fff;border:1px solid #3a4a7e;border-radius:3px;font-size:12px;">
            <option value="">全部状态</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
          <select id="trg-filter-scene" title="按 FlowGroup(SceneEvent) scope、空间 binding、when.params.sceneId 与 editorScope.sceneIds 的并集筛选" style="padding:4px;background:#26304e;color:#fff;border:1px solid #3a4a7e;border-radius:3px;font-size:12px;">
            <option value="">全部场景关联</option>
          </select>
          <select id="trg-filter-event" title="按唯一 FlowGroup 外键筛选（旧字段 sceneEventId 自动同步）" style="padding:4px;background:#26304e;color:#fff;border:1px solid #3a4a7e;border-radius:3px;font-size:12px;">
            <option value="">全部 FlowGroup(SceneEvent)</option>
          </select>
          <select id="trg-filter-when" title="筛选触发时机" style="padding:4px;background:#26304e;color:#fff;border:1px solid #3a4a7e;border-radius:3px;font-size:12px;">
            <option value="">全部时机</option>
            ${whenOpts}
          </select>
          <select id="trg-filter-do" title="筛选动作" style="padding:4px;background:#26304e;color:#fff;border:1px solid #3a4a7e;border-radius:3px;font-size:12px;">
            <option value="">全部动作</option>
            ${doOpts}
          </select>
          <button id="trg-add">+ 新增</button>
          <button id="trg-del">🗑 删除</button>
          <button id="trg-fg-debug" title="在内存中模拟 FlowGroup 状态机（phase/progress 实时展示与手动控制）">🐞 状态机调试</button>
          <button id="trg-save" class="primary">💾 保存到工程</button>
          <span class="trg-hint">数据 → ${this.projectPath}</span>
        </div>
        <div class="trg-association-summary" id="trg-association-summary"></div>
        <div class="trg-main">
          <div class="trg-list" id="trg-list"></div>
          <div class="trg-resizer" id="trg-list-resizer" role="separator" aria-orientation="vertical" aria-label="调整触发器列表宽度" title="左右拖动调整列表宽度；双击恢复默认宽度"></div>
          <div class="trg-detail" id="trg-detail"></div>
        </div>
        <div class="trg-status" id="trg-status"></div>
      </div>
    `;
    this.container.querySelector('#trg-add').addEventListener('click', () => this._addTrigger());
    this.container.querySelector('#trg-del').addEventListener('click', () => this._deleteTrigger());
    this.container.querySelector('#trg-fg-debug').addEventListener('click', () => this.flowGroupDebugPanel.toggle());
    this.container.querySelector('#trg-save').addEventListener('click', () => this.save());
    this.container.querySelectorAll('#trg-target-tabs button').forEach(btn => {
      if (btn.dataset.target) btn.addEventListener('click', () => this._switchTarget(btn.dataset.target));
    });
    const helpNav = this.container.querySelector('#trg-target-tabs .trg-btn-help');
    if (helpNav) helpNav.addEventListener('click', () => this._showButtonHelp());
    // 筛选器事件
    this.container.querySelector('#trg-filter-enabled').addEventListener('change', () => this._renderList());
    this.container.querySelector('#trg-filter-scene').addEventListener('change', () => this._renderList());
    this.container.querySelector('#trg-filter-event').addEventListener('change', () => this._renderList());
    this.container.querySelector('#trg-filter-when').addEventListener('change', () => this._renderList());
    this.container.querySelector('#trg-filter-do').addEventListener('change', () => this._renderList());
    this._bindListResizer();
    this._renderTargetTabs();
    this._updateToolbarForTarget();
  }

  _bindListResizer() {
    const main = this.container.querySelector('.trg-main');
    const list = this.container.querySelector('#trg-list');
    const resizer = this.container.querySelector('#trg-list-resizer');
    if (!main || !list || !resizer) return;

    const storageKey = 'yijian18:trigger-editor:list-width';
    const clampWidth = width => {
      const mainWidth = main.getBoundingClientRect().width || this.container.getBoundingClientRect().width || 900;
      const maximum = Math.max(220, Math.min(720, mainWidth - 360));
      return Math.round(Math.max(220, Math.min(maximum, Number(width) || 320)));
    };
    const applyWidth = width => {
      const next = clampWidth(width);
      list.style.width = `${next}px`;
      resizer.setAttribute('aria-valuemin', '220');
      resizer.setAttribute('aria-valuemax', String(clampWidth(720)));
      resizer.setAttribute('aria-valuenow', String(next));
      return next;
    };
    const saveWidth = width => {
      try { localStorage.setItem(storageKey, String(width)); } catch (_error) { /* 持久化失败不影响拖动 */ }
    };

    let storedWidth = 320;
    try { storedWidth = Number(localStorage.getItem(storageKey)) || storedWidth; } catch (_error) { /* 使用默认宽度 */ }
    requestAnimationFrame(() => applyWidth(storedWidth));

    let pointerId = null;
    let startX = 0;
    let startWidth = 0;
    resizer.tabIndex = 0;
    resizer.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      pointerId = event.pointerId;
      startX = event.clientX;
      startWidth = list.getBoundingClientRect().width;
      resizer.setPointerCapture(pointerId);
      resizer.classList.add('dragging');
    });
    resizer.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return;
      applyWidth(startWidth + event.clientX - startX);
    });
    const finishResize = event => {
      if (event.pointerId !== pointerId) return;
      const completedPointerId = pointerId;
      pointerId = null;
      resizer.classList.remove('dragging');
      if (resizer.hasPointerCapture(completedPointerId)) resizer.releasePointerCapture(completedPointerId);
      saveWidth(applyWidth(list.getBoundingClientRect().width));
    };
    resizer.addEventListener('pointerup', finishResize);
    resizer.addEventListener('pointercancel', finishResize);
    resizer.addEventListener('dblclick', () => saveWidth(applyWidth(320)));
    resizer.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -20 : 20;
      saveWidth(applyWidth(list.getBoundingClientRect().width + delta));
    });
  }

  _injectStyles() {
    if (document.getElementById('trg-styles')) return;
    const s = document.createElement('style');
    s.id = 'trg-styles';
    s.textContent = `
      .trg-root{display:flex;flex-direction:column;height:100%;background:#0d1326;color:#fff;}
      .trg-target-tabs{display:flex;gap:4px;padding:8px 16px 0;background:#101a30;}
      .trg-target-tabs button{padding:6px 16px;background:#26304e;border:none;border-radius:14px;color:#bcd;cursor:pointer;font-size:12px;}
      .trg-target-tabs button.active{background:#4a6ad0;color:#fff;font-weight:bold;}
      .trg-toolbar{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#16213e;border-bottom:1px solid #2a3a5e;}
      .trg-toolbar button{padding:7px 12px;background:#3a4a7e;border:none;border-radius:4px;color:#fff;cursor:pointer;}
      .trg-toolbar button.primary{background:#4CAF50;color:#000;font-weight:bold;}
      .trg-hint{margin-left:auto;color:#8aa;font-size:12px;}
      .trg-association-summary{min-height:20px;padding:4px 16px;background:#111a30;border-bottom:1px solid #253451;color:#93a8cc;font-size:11px;box-sizing:border-box;}
      .trg-main{flex:1;display:flex;overflow:hidden;min-width:0;}
      .trg-list{width:320px;min-width:220px;max-width:70%;flex:0 0 auto;background:#111a30;border-right:0;overflow-y:auto;overflow-x:hidden;}
      .trg-resizer{width:6px;flex:0 0 6px;cursor:col-resize;background:#2a3a5e;position:relative;touch-action:none;transition:background .15s;}
      .trg-resizer::after{content:'';position:absolute;left:2px;top:calc(50% - 24px);width:2px;height:48px;border-left:1px solid rgba(255,255,255,.35);border-right:1px solid rgba(255,255,255,.2);}
      .trg-resizer:hover,.trg-resizer.dragging{background:#4CAF50;}
      .trg-item{padding:10px 12px;border-bottom:1px solid #1e2b47;cursor:grab;display:flex;align-items:flex-start;gap:7px;user-select:none;}
      .trg-item:hover{background:#1a2540;}
      .trg-item:active{cursor:grabbing;}
      .trg-item.dragging{opacity:.4;}
      .trg-item.drop-before{box-shadow:inset 0 3px 0 #6ea8ff;}
      .trg-item.drop-after{box-shadow:inset 0 -3px 0 #6ea8ff;}
      .trg-item.active{background:#2a3a6e;}
      .trg-item.disabled{opacity:0.45;}
      .trg-item .trg-status{font-size:10px;flex-shrink:0;margin-top:2px;}
      .trg-item-copy{flex:1;min-width:0;}
      .trg-item .tname{font-weight:bold;font-size:13px;line-height:1.35;color:#fff;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}
      .trg-item .tid{margin-top:2px;font-size:11px;line-height:1.3;color:#9ab;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}
      .trg-item .twhen{margin-top:3px;font-size:11px;line-height:1.3;color:#9ab;white-space:normal;overflow-wrap:anywhere;}
      .trg-item .tbinding-name{margin-top:4px;font-size:12px;line-height:1.4;color:#e8c46a;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}
      .trg-origin{margin-left:0;flex-shrink:0;padding:2px 5px;border:1px solid #53678f;border-radius:8px;color:#b9c8e6;font-size:9px;white-space:nowrap;}
      .trg-detail{flex:1;padding:16px;overflow-y:auto;}
      .trg-detail .row{margin-bottom:10px;}
      .trg-detail label{display:block;font-size:12px;color:#9ab;margin-bottom:3px;}
      .trg-detail input[type=text],.trg-detail input[type=number],.trg-detail select,.trg-detail textarea{width:100%;box-sizing:border-box;background:#0a1020;border:1px solid #2a3a5e;color:#fff;padding:6px;border-radius:3px;font-family:monospace;font-size:12px;}
      .trg-detail textarea{min-height:48px;resize:vertical;}
      .trg-do-item{border:1px solid #2a3a5e;border-radius:4px;padding:8px;margin-bottom:8px;background:#0f1830;}
      .trg-do-item.dragging{opacity:.45;}
      .trg-do-item.drop-before{box-shadow:inset 0 3px 0 #6ea8ff;}
      .trg-do-item.drop-after{box-shadow:inset 0 -3px 0 #6ea8ff;}
      .trg-do-item .do-head{display:flex;gap:6px;align-items:center;margin-bottom:6px;}
      .do-drag-handle{flex:0 0 auto;padding:4px 6px;border:0;border-radius:3px;background:#263657;color:#b9c8e6;cursor:grab;font-size:14px;line-height:1;}
      .do-drag-handle:active{cursor:grabbing;}
      .trg-do-item select{flex:1;}
      .do-sequence{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:11px;background:#29466f;color:#d8e8ff;font-size:10px;font-weight:bold;}
      .do-identity-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-bottom:8px;}
      .do-identity-grid label{margin:0;}
      .do-result-semantics{margin:5px 0 8px;padding:6px 8px;border-left:3px solid #5f9ad6;background:#101f39;color:#9fc3e8;font-size:11px;line-height:1.45;}
      .do-structured-params{margin:8px 0;padding:8px;border:1px solid #263c61;border-radius:4px;background:#0c162b;}
      .do-section-title{margin-bottom:7px;color:#80b9ed;font-size:11px;font-weight:bold;}
      .do-param-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;}
      .do-param-grid label{display:flex;flex-direction:column;gap:3px;margin:0;min-width:0;}
      .do-param-grid label span{color:#9ab;font-size:10px;overflow-wrap:anywhere;}
      .do-advanced{margin-top:7px;color:#91a8cc;font-size:11px;}
      .do-advanced summary{cursor:pointer;user-select:none;}
      .do-advanced .do-params{margin-top:6px;}
      .spawn-placement-controls{display:grid;grid-template-columns:110px minmax(0,1fr);gap:6px;align-items:center;}
      .spawn-placement-controls label{grid-column:1 / -1;margin:0;color:#7cf;}
      .spawn-placement-hint{grid-column:1 / -1;color:#89a;font-size:11px;line-height:1.4;}
      .trg-definition-heading{display:flex;flex-direction:column;gap:4px;padding:10px 12px;margin-bottom:14px;border:1px solid #355285;border-radius:5px;background:#13213b;}
      .trg-definition-heading strong{color:#d9e7ff;font-size:14px;}
      .trg-definition-heading span{color:#91a8cc;font-size:11px;line-height:1.45;}
      .trg-order{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:12px;background:#31598f;color:#fff;font-weight:bold;font-size:11px;flex:0 0 auto;}
      .tsteps{margin-top:4px;color:#7fc6a4;font-size:10px;line-height:1.45;overflow-wrap:anywhere;}
      .trg-inline-options{display:flex;gap:14px;flex-wrap:wrap;align-items:center;}
      .trg-inline-options label{display:flex;align-items:center;gap:4px;margin:0;}
      .trg-coordination-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;}
      .trg-tutorial-step{border:1px solid #2a3a5e;border-radius:4px;padding:9px;margin-bottom:8px;background:#0f1830;}
      .trg-tutorial-step .do-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
      .trg-tutorial-step .do-head strong{flex:1;color:#c9dcff;font-size:12px;}
      .trg-tutorial-step.dragging{opacity:.45;}
      .trg-tutorial-step.drop-before{box-shadow:inset 0 3px 0 #6ea8ff;}
      .trg-tutorial-step.drop-after{box-shadow:inset 0 -3px 0 #6ea8ff;}
      .tutorial-step-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;}
      .tutorial-step-grid label{display:flex;flex-direction:column;gap:3px;margin:0;}
      .tutorial-step-grid label.wide{grid-column:1 / -1;}
      .tutorial-step-grid label.check{display:flex;flex-direction:row;align-items:center;}
      .trg-empty.compact{padding:12px;}
      .trg-empty{color:#778;padding:40px;text-align:center;}
      .trg-status{padding:6px 16px;font-size:12px;min-height:22px;background:#0a1020;}
      .trg-status.ok{color:#6c6;} .trg-status.err{color:#e66;}
      .trg-mini{padding:4px 8px;background:#3a4a7e;border:none;border-radius:3px;color:#fff;cursor:pointer;font-size:12px;}
    `;
    document.head.appendChild(s);
  }

  _status(msg, kind) {
    const el = this.container.querySelector('#trg-status');
    if (el) { el.textContent = msg; el.className = 'trg-status ' + (kind || ''); }
  }

  // ---- 列表 ----

  _buildSceneAssociationIndex() {
    const byScene = new Map();
    let documents = [];
    try {
      const source = this.getSceneDocuments();
      documents = Array.isArray(source) ? source : Object.values(source || {});
    } catch (error) {
      console.warn('TriggerEditor: 获取 canonical 场景文档失败', error);
    }
    for (const scene of documents) {
      const sceneId = String(scene?.id || '').trim();
      if (!sceneId) continue;
      const bindingsByTrigger = new Map();
      for (const layer of scene.layers || []) {
        for (const binding of layer?.objects || []) {
          const triggerId = binding?.type === 'trigger' ? String(binding.triggerId || '').trim() : '';
          if (!triggerId) continue;
          let names = bindingsByTrigger.get(triggerId);
          if (!names) {
            names = new Set();
            bindingsByTrigger.set(triggerId, names);
          }
          const bindingName = String(binding.name || binding.id || '').trim();
          if (bindingName) names.add(bindingName);
        }
      }
      byScene.set(sceneId, bindingsByTrigger);
    }
    return byScene;
  }

  _getTriggerAssociation(trigger, sceneId, associationIndex) {
    const spatial = associationIndex.get(sceneId)?.has(trigger?.id) === true;
    const condition = trigger?.when?.params?.sceneId === sceneId;
    const editorScope = Array.isArray(trigger?.editorScope?.sceneIds)
      && trigger.editorScope.sceneIds.includes(sceneId);
    const fgId = resolveFgId(trigger);
    const flowGroup = fgId ? mergeFlowGroups(this.project).find(definition => definition.id === fgId) : null;
    const eventScope = Array.isArray(flowGroup?.scope?.sceneIds)
      && flowGroup.scope.sceneIds.includes(sceneId);
    return {
      spatial,
      condition,
      editorScope,
      eventScope,
      associated: spatial || condition || editorScope || eventScope
    };
  }

  _getSpatialBindingNames(triggerId, sceneId, associationIndex) {
    if (sceneId) return [...(associationIndex.get(sceneId)?.get(triggerId) || [])];
    const names = [];
    for (const [boundSceneId, bindingsByTrigger] of associationIndex) {
      for (const name of bindingsByTrigger.get(triggerId) || []) names.push(`${boundSceneId} · ${name}`);
    }
    return names;
  }

  _renderAssociationSummary(sceneId, associationIndex) {
    const summary = this.container.querySelector('#trg-association-summary');
    if (!summary) return;
    if (this.target === 'sceneEvents' || this.target === 'flowGroups') {
      const visible = sceneId
        ? this.triggers.filter(definition => definition.scope?.sceneIds?.includes(sceneId)).length
        : this.triggers.length;
      summary.textContent = `${sceneId || '全部场景'}：按 FlowGroup.order 展示 ${visible} 个剧情流程；拖动会重排 order，不改 Trigger/Tutorial 稳定身份。`;
      return;
    }
    if (this.target === 'tutorials') {
      const visible = sceneId
        ? this.triggers.filter(definition => definition.scope?.sceneIds?.includes(sceneId)).length
        : this.triggers.length;
      summary.textContent = `${sceneId || '全部场景'}：${visible} 个 Tutorial；宏观顺序继承 FlowGroup(SceneEvent)，只在详情中调整 steps[]。`;
      return;
    }
    if (!sceneId) {
      summary.textContent = `全部 Trigger ${this.triggers.length} 个；场景关联按 FlowGroup(SceneEvent) scope、空间 binding、场景条件和编辑器归属合并。`;
      return;
    }
    const stats = { spatial: 0, condition: 0, editorScope: 0, eventScope: 0, total: 0 };
    for (const trigger of this.triggers) {
      const association = this._getTriggerAssociation(trigger, sceneId, associationIndex);
      if (association.spatial) stats.spatial++;
      if (association.condition) stats.condition++;
      if (association.editorScope) stats.editorScope++;
      if (association.eventScope) stats.eventScope++;
      if (association.associated) stats.total++;
    }
    summary.textContent = `${sceneId}：SceneEvent ${stats.eventScope}，空间绑定 ${stats.spatial}，场景条件 ${stats.condition}，编辑归属 ${stats.editorScope}，合并后 ${stats.total} 个关联 Trigger。`;
  }

  _moveTrigger(source, target, placeAfter) {
    if (!source || !target || source === target) return false;
    const selected = this.triggers[this.selectedIndex] || null;
    const sourceIndex = this.triggers.indexOf(source);
    if (sourceIndex < 0 || !this.triggers.includes(target)) return false;

    // 搬运完整定义对象，保留 action 稳定 ID、policy 和 unknown-but-allowed 字段。
    this.triggers.splice(sourceIndex, 1);
    const targetIndex = this.triggers.indexOf(target);
    this.triggers.splice(targetIndex + (placeAfter ? 1 : 0), 0, source);
    if (this.target === 'sceneEvents') {
      this.triggers.forEach((definition, index) => { definition.order = index; });
    }
    this.project[this.target] = this.triggers;
    this.projectIndex = new SceneEventProjectIndex(this.project, { sceneDocuments: this._getSceneDocuments() });
    this.selectedIndex = selected ? this.triggers.indexOf(selected) : -1;
    this._status(`已调整 ${source.name || source.id || '定义'} 的顺序，请保存到工程`, 'ok');
    this._renderList();
    this._renderDetail();
    return true;
  }

  _renderSceneEventList(list, filterScene) {
    const definitions = this.triggers
      .filter(definition => !filterScene || definition.scope?.sceneIds?.includes(filterScene))
      .slice()
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    if (!definitions.length) {
      list.innerHTML = '<div class="trg-empty">无匹配的 FlowGroup(SceneEvent)</div>';
      return;
    }
    list.innerHTML = '';
    let dragged = null;
    const clearIndicators = () => list.querySelectorAll('.trg-item').forEach(element => {
      element.classList.remove('drop-before', 'drop-after');
      delete element.dataset.dropPosition;
    });
    definitions.forEach(definition => {
      const index = this.triggers.indexOf(definition);
      const fgId = definition?.id;
      const triggers = (this.project.triggers || []).filter(trigger => fgId && resolveFgId(trigger) === fgId);
      const tutorials = (this.project.tutorials || []).filter(tutorial => fgId && resolveFgId(tutorial) === fgId);
      const item = document.createElement('div');
      item.className = `trg-item scene-event flow-group${index === this.selectedIndex ? ' active' : ''}`;
      item.draggable = true;
      item.title = '拖动调整 FlowGroup.order；子 Trigger/Tutorial 只通过 flowGroupId(sceneEventId) 归属，不复制顺序';
      item.innerHTML = `<span class="trg-order">${Number(definition.order || 0) + 1}</span><div class="trg-item-copy"><div class="tname">${this._escapeHtml(definition.name || definition.id)}</div><div class="tid">${this._escapeHtml(definition.id || '(未命名)')}</div><div class="twhen">依赖 ${(definition.dependsOn || []).length} · Trigger ${triggers.length} · Tutorial ${tutorials.length}</div></div>`;
      item.addEventListener('dragstart', event => {
        this._commitDetail();
        dragged = definition;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', definition.id || String(index));
        requestAnimationFrame(() => item.classList.add('dragging'));
      });
      item.addEventListener('dragover', event => {
        if (!dragged || dragged === definition) return;
        event.preventDefault();
        const placeAfter = event.clientY >= item.getBoundingClientRect().top + item.offsetHeight / 2;
        clearIndicators();
        item.dataset.dropPosition = placeAfter ? 'after' : 'before';
        item.classList.add(placeAfter ? 'drop-after' : 'drop-before');
      });
      item.addEventListener('drop', event => {
        event.preventDefault();
        const source = dragged;
        dragged = null;
        const placeAfter = item.dataset.dropPosition === 'after';
        clearIndicators();
        this._moveTrigger(source, definition, placeAfter);
      });
      item.addEventListener('dragend', () => { dragged = null; item.classList.remove('dragging'); clearIndicators(); });
      item.addEventListener('click', () => {
        this._commitDetail();
        this.selectedIndex = index;
        this._renderList();
        this._renderDetail();
      });
      list.appendChild(item);
    });
  }

  _renderTutorialList(list, filterScene, filterSceneEvent) {
    const index = new FlowGroupProjectIndex(this.project);
    const fgFilter = text(filterSceneEvent);
    const definitions = this.triggers
      .filter(tutorial => !fgFilter || resolveFgId(tutorial) === fgFilter)
      .filter(tutorial => !filterScene || tutorial.scope?.sceneIds?.includes(filterScene))
      .slice()
      .sort((left, right) => index.compareTutorials(left, right));
    if (!definitions.length) {
      list.innerHTML = '<div class="trg-empty">无匹配的 Tutorial</div>';
      return;
    }
    list.innerHTML = '';
    definitions.forEach(tutorial => {
      const definitionIndex = this.triggers.indexOf(tutorial);
      const sceneEvent = index.getSceneEvent(tutorial.sceneEventId);
      const item = document.createElement('div');
      item.className = `trg-item tutorial${definitionIndex === this.selectedIndex ? ' active' : ''}`;
      item.title = 'Tutorial 宏观顺序继承 SceneEvent；请在右侧拖动内部 steps[]';
      const stepSummary = (tutorial.steps || []).map((step, stepIndex) => `${stepIndex + 1}.${step.text || step.id || '?'}`).join(' → ');
      item.innerHTML = `<span class="trg-order">${sceneEvent ? Number(sceneEvent.order || 0) + 1 : '?'}</span><div class="trg-item-copy"><div class="tname">${this._escapeHtml(tutorial.title || tutorial.id)}</div><div class="tid">${this._escapeHtml(tutorial.id || '(未命名)')}</div><div class="twhen">${this._escapeHtml(sceneEvent?.name || tutorial.sceneEventId || '未归属')} · priority ${Number(tutorial.priority || 0)}</div><div class="tsteps">${this._escapeHtml(stepSummary || '无 steps[]')}</div></div>`;
      item.addEventListener('click', () => {
        this._commitDetail();
        this.selectedIndex = definitionIndex;
        this._renderList();
        this._renderDetail();
      });
      list.appendChild(item);
    });
  }

  _renderList() {
    const list = this.container.querySelector('#trg-list');
    if (!list) return;

    const filterEnabled = this.container.querySelector('#trg-filter-enabled')?.value || '';
    const filterScene = this.container.querySelector('#trg-filter-scene')?.value || '';
    const filterSceneEvent = this.container.querySelector('#trg-filter-event')?.value || '';
    const filterFg = text(filterSceneEvent);
    const filterWhen = this.container.querySelector('#trg-filter-when')?.value || '';
    const filterDo = this.container.querySelector('#trg-filter-do')?.value || '';
    const associationIndex = this._buildSceneAssociationIndex();

    this._updateSceneFilter();
    this._updateSceneEventFilter();
    this._renderAssociationSummary(filterScene, associationIndex);
    if (this.target === 'sceneEvents' || this.target === 'flowGroups') {
      this._renderSceneEventList(list, filterScene);
      return;
    }
    if (this.target === 'tutorials') {
      this._renderTutorialList(list, filterScene, filterSceneEvent);
      return;
    }

    const filtered = this.triggers.filter((trigger) => {
      if (filterFg && resolveFgId(trigger) !== filterFg) return false;
      if (filterEnabled === 'enabled' && trigger.enabled === false) return false;
      if (filterEnabled === 'disabled' && trigger.enabled !== false) return false;
      if (filterScene && !this._getTriggerAssociation(trigger, filterScene, associationIndex).associated) return false;
      if (filterWhen && trigger.when?.type !== filterWhen) return false;
      if (filterDo) {
        const doList = Array.isArray(trigger.do) ? trigger.do : [];
        if (!doList.some(action => (action.action || action.type || action) === filterDo)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      list.innerHTML = '<div class="trg-empty">无匹配的触发器</div>';
      return;
    }
    list.innerHTML = '';
    let draggedTrigger = null;
    const clearDropIndicators = () => {
      list.querySelectorAll('.trg-item').forEach(element => {
        element.classList.remove('drop-before', 'drop-after');
        delete element.dataset.dropPosition;
      });
    };
    filtered.forEach((trigger) => {
      const index = this.triggers.indexOf(trigger);
      const item = document.createElement('div');
      const disabled = trigger.enabled === false;
      item.className = 'trg-item' + (index === this.selectedIndex ? ' active' : '') + (disabled ? ' disabled' : '');
      item.draggable = true;
      item.title = '拖动调整触发器定义顺序；同协调组同优先级时按此顺序稳定执行';
      const whenLabel = (WHEN_TYPES.find(event => event.v === trigger.when?.type) || {}).label || trigger.when?.type || '?';
      const triggerFgId = resolveFgId(trigger);
      const flowGroup = triggerFgId ? this.projectIndex.getFlowGroup(triggerFgId) : null;
      const priority = Number.isInteger(trigger.coordination?.priority) ? trigger.coordination.priority : 0;
      const coordinationLabel = trigger.coordination?.group
        ? `${trigger.coordination.group} · ${trigger.coordination.policy || 'broadcast'} · priority ${priority}`
        : `独立 · priority ${priority}`;
      const definitionOrder = this.project.triggers.indexOf(trigger) + 1;
      const statusIcon = disabled ? '⏸' : '▶';
      const association = filterScene ? this._getTriggerAssociation(trigger, filterScene, associationIndex) : null;
      const origins = association ? [
        association.eventScope ? '事件' : '',
        association.spatial ? '空间' : '',
        association.condition ? '条件' : '',
        association.editorScope ? '归属' : ''
      ].filter(Boolean) : [];
      const originHtml = origins.length
        ? `<span class="trg-origin" title="场景关联来源：${origins.join('、')}">${origins.join('+')}</span>`
        : '';
      const bindingNames = this._getSpatialBindingNames(trigger.id, filterScene, associationIndex);
      const bindingNamesHtml = bindingNames.length
        ? `<div class="tbinding-name" title="场景事件名称">${bindingNames.map(name => this._escapeHtml(name)).join(' / ')}</div>`
        : '';
      const triggerName = String(trigger.name || '').trim();
      const nameHtml = triggerName
        ? `<div class="tname">${this._escapeHtml(triggerName)}</div>`
        : '';
      item.innerHTML = `<span class="trg-status" data-toggle="${index}">${statusIcon}</span><div class="trg-item-copy">${nameHtml}<div class="tid">${this._escapeHtml(trigger.id || '(未命名)')}</div>${bindingNamesHtml}<div class="twhen">FlowGroup(SceneEvent): ${this._escapeHtml(flowGroup?.name || triggerFgId || '未归属')}</div><div class="twhen">when: ${this._escapeHtml(whenLabel)} · ${this._escapeHtml(coordinationLabel)} · 定义序 ${definitionOrder}</div></div>${originHtml}`;
      item.addEventListener('dragstart', (event) => {
        this._commitDetail();
        draggedTrigger = trigger;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', trigger.id || String(index));
        requestAnimationFrame(() => item.classList.add('dragging'));
      });
      item.addEventListener('dragover', (event) => {
        if (!draggedTrigger || draggedTrigger === trigger) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const placeAfter = event.clientY >= item.getBoundingClientRect().top + item.offsetHeight / 2;
        clearDropIndicators();
        item.dataset.dropPosition = placeAfter ? 'after' : 'before';
        item.classList.add(placeAfter ? 'drop-after' : 'drop-before');
      });
      item.addEventListener('dragleave', (event) => {
        if (!item.contains(event.relatedTarget)) {
          item.classList.remove('drop-before', 'drop-after');
          delete item.dataset.dropPosition;
        }
      });
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        const placeAfter = item.dataset.dropPosition === 'after';
        const source = draggedTrigger;
        draggedTrigger = null;
        clearDropIndicators();
        this._moveTrigger(source, trigger, placeAfter);
      });
      item.addEventListener('dragend', () => {
        draggedTrigger = null;
        item.classList.remove('dragging');
        clearDropIndicators();
      });
      item.querySelector('.trg-status').addEventListener('click', (event) => {
        event.stopPropagation();
        this._commitDetail();
        trigger.enabled = trigger.enabled === false ? undefined : false;
        if (trigger.enabled === undefined) delete trigger.enabled;
        this._renderList();
        this._renderDetail();
      });
      item.addEventListener('click', () => {
        this._commitDetail();
        this.selectedIndex = index;
        this._renderList();
        this._renderDetail();
      });
      list.appendChild(item);
    });
  }

  /** 动态更新场景筛选下拉选项。 */
  _updateSceneFilter() {
    const select = this.container.querySelector('#trg-filter-scene');
    if (!select) return;
    const currentValue = select.value;
    const scenes = new Map();
    try {
      for (const scene of this.getSceneList()) {
        if (scene?.id) scenes.set(scene.id, scene.name || scene.id);
      }
    } catch (e) {
      console.warn('TriggerEditor: 获取场景列表失败', e);
    }

    // 保留三层定义中的旧场景引用，避免切换编辑目标或保存时静默抹掉历史 scope。
    for (const definition of this.triggers) {
      const sceneEvent = this.target === 'sceneEvents'
        ? definition
        : (this.project.sceneEvents || []).find(candidate => candidate.id === definition?.sceneEventId);
      const referencedSceneIds = this.target === 'sceneEvents'
        ? [...(Array.isArray(definition.scope?.sceneIds) ? definition.scope.sceneIds : [])]
        : this.target === 'tutorials'
          ? [
              ...(Array.isArray(definition.scope?.sceneIds) ? definition.scope.sceneIds : []),
              ...(Array.isArray(sceneEvent?.scope?.sceneIds) ? sceneEvent.scope.sceneIds : [])
            ]
          : [
              definition.when?.params?.sceneId,
              ...(Array.isArray(definition.editorScope?.sceneIds) ? definition.editorScope.sceneIds : []),
              ...(Array.isArray(sceneEvent?.scope?.sceneIds) ? sceneEvent.scope.sceneIds : [])
            ];
      for (const sceneId of referencedSceneIds) {
        if (sceneId && !scenes.has(sceneId)) scenes.set(sceneId, `${sceneId}（旧引用）`);
      }
    }

    let options = '<option value="">全部场景关联</option>';
    for (const [sceneId, sceneName] of scenes) {
      const selected = sceneId === currentValue ? 'selected' : '';
      options += `<option value="${this._escapeHtml(sceneId)}" ${selected}>${this._escapeHtml(sceneName)}</option>`;
    }
    select.innerHTML = options;
  }

  /** 场景编辑器增删改场景后调用，保持当前筛选值并重绘触发器列表。 */
  refreshSceneList() {
    if (this._initialized) this._renderList();
  }

  _getItemPlacementOptions() {
    try {
      return (this.getPlacementOptions() || []).filter(placement =>
        placement?.type === 'ref' && placement.kind === 'item' && placement.id
      );
    } catch (error) {
      console.warn('TriggerEditor: 获取场景放置物品失败', error);
      return [];
    }
  }

  _normalizeSpawnPlacementParams(params = {}) {
    const selector = params.selector || params;
    const placementId = Array.isArray(selector.placementIds)
      ? selector.placementIds[0] || ''
      : selector.placementId || '';
    const group = String(selector.group || '').trim();
    const tag = Array.isArray(selector.tags)
      ? selector.tags[0] || ''
      : selector.tag || '';
    const mode = placementId ? 'placement' : group ? 'group' : 'tag';
    return {
      mode,
      placementId,
      group,
      tag: String(tag || '').trim(),
      sceneId: String(selector.sceneId || '').trim()
    };
  }

  _readSpawnPlacementParams(item) {
    const rawParams = this._parseJson(item.querySelector('.do-params')?.value || '{}', {});
    const params = rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? rawParams
      : {};
    const hasNestedSelector = params.selector
      && typeof params.selector === 'object'
      && !Array.isArray(params.selector);
    const previousSelector = hasNestedSelector ? params.selector : params;
    const previousSelection = this._normalizeSpawnPlacementParams(params);
    const previousTarget = previousSelection.mode === 'placement'
      ? previousSelection.placementId
      : previousSelection.mode === 'group'
        ? previousSelection.group
        : previousSelection.tag;

    const mode = item.querySelector('.spawn-placement-mode')?.value || 'placement';
    const targetElement = item.querySelector('.spawn-placement-target');
    const target = targetElement?.value || '';

    // 仅打开并保存时返回完整原参数，禁止补写 sceneId/kinds 或丢失扩展字段。
    if (mode === previousSelection.mode && target === previousTarget) return params;

    const selector = { ...previousSelector };
    const hadSelectorContent = Object.keys(previousSelector).length > 0;
    delete selector.placementId;
    delete selector.placementIds;
    delete selector.group;
    delete selector.tag;
    delete selector.tags;
    if (mode === 'placement') selector.placementIds = target ? [target] : [];
    else if (mode === 'group') selector.group = target;
    else selector.tag = target;
    if (!hadSelectorContent && !Object.prototype.hasOwnProperty.call(selector, 'kinds')) {
      selector.kinds = ['item'];
    }

    return hasNestedSelector ? { ...params, selector } : selector;
  }

  _renderSpawnPlacementControls(params = {}) {
    const selection = this._normalizeSpawnPlacementParams(params);
    const items = this._getItemPlacementOptions();
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const sceneId = selection.sceneId || items[0]?.sceneId || '';
    const buildOptions = (entries, selected, emptyText) => {
      const options = entries.map(({ value, label, optionSceneId = sceneId }) =>
        `<option value="${escape(value)}" data-scene-id="${escape(optionSceneId)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`
      );
      if (selected && !entries.some(entry => entry.value === selected)) {
        options.unshift(`<option value="${escape(selected)}" data-scene-id="${escape(sceneId)}" selected>${escape(selected)}（当前场景未找到）</option>`);
      }
      return options.length ? options.join('') : `<option value="">${emptyText}</option>`;
    };
    const placementEntries = items.map(item => ({
      value: item.id,
      label: `${item.name || item.ref || item.id} · ${item.id}`,
      optionSceneId: item.sceneId || sceneId
    }));
    const groupEntries = [...new Map(items.filter(item => item.group).map(item => [item.group, {
      value: item.group,
      label: `${item.group}（${item.name || item.ref || item.id}）`,
      optionSceneId: item.sceneId || sceneId
    }])).values()];
    const tagEntries = [...new Map(items.flatMap(item => {
      const tags = Array.isArray(item.tags) ? item.tags : String(item.tags || '').split(',');
      return tags.map(tag => tag.trim()).filter(Boolean).map(tag => [tag, {
        value: tag,
        label: `${tag}（${item.name || item.ref || item.id}）`,
        optionSceneId: item.sceneId || sceneId
      }]);
    })).values()];
    const targetEntries = selection.mode === 'group' ? groupEntries : selection.mode === 'tag' ? tagEntries : placementEntries;
    const selectedTarget = selection.mode === 'group' ? selection.group : selection.mode === 'tag' ? selection.tag : selection.placementId;
    return `
      <div class="spawn-placement-controls">
        <label>放置目标</label>
        <select class="spawn-placement-mode">
          <option value="placement" ${selection.mode === 'placement' ? 'selected' : ''}>指定物品</option>
          <option value="group" ${selection.mode === 'group' ? 'selected' : ''}>按组名</option>
          <option value="tag" ${selection.mode === 'tag' ? 'selected' : ''}>按标签</option>
        </select>
        <select class="spawn-placement-target">${buildOptions(targetEntries, selectedTarget, '请先在场景编辑器打开含物品的场景')}</select>
        <div class="spawn-placement-hint">仅列出当前打开场景中的放置物品；组名或标签会批量放置所有匹配物品。</div>
      </div>`;
  }

  _nextActionStepId(trigger) {
    const actions = Array.isArray(trigger?.do) ? trigger.do : [];
    const ids = new Set(actions.map(action => String(action?.stepId || '').trim()).filter(Boolean));
    const prefix = `${String(trigger?.id || 'trigger').trim() || 'trigger'}.step`;
    let sequence = 1;
    let candidate;
    do candidate = `${prefix}.${String(sequence++).padStart(3, '0')}`;
    while (ids.has(candidate));
    return candidate;
  }

  _formatResultSemantics(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    const labels = { success: '成功', blocked: '已处理/阻断', failure: '失败', retry: '重试', sequence: '序列' };
    return Object.entries(value)
      .map(([key, description]) => `${labels[key] || key}：${String(description)}`)
      .join('；');
  }

  _renderStructuredParams(schema, params = {}, { excludeOperation = false } = {}) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return '';
    const properties = Object.entries(schema.properties || {})
      .filter(([name]) => !excludeOperation || name !== 'operation');
    if (!properties.length) return '';
    const required = new Set(schema.required || []);
    const rows = properties.map(([name, property = {}]) => {
      const value = params?.[name];
      const type = property.type || (Array.isArray(value) ? 'array' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : typeof value === 'object' && value !== null ? 'object' : 'string');
      const label = property.title || property.label || name;
      const description = property.description ? ` title="${this._escapeHtml(property.description)}"` : '';
      const requiredMark = required.has(name) ? ' *' : '';
      let control;
      if (Array.isArray(property.enum)) {
        const options = [!required.has(name) ? '<option value="">-- 未设置 --</option>' : '', ...property.enum.map(option => (
          `<option value="${this._escapeHtml(option)}"${option === value ? ' selected' : ''}>${this._escapeHtml(option)}</option>`
        ))].join('');
        control = `<select class="do-param-field" data-param-name="${this._escapeHtml(name)}" data-schema-type="${this._escapeHtml(type)}">${options}</select>`;
      } else if (type === 'boolean') {
        control = `<select class="do-param-field" data-param-name="${this._escapeHtml(name)}" data-schema-type="boolean"><option value=""${value === undefined ? ' selected' : ''}>-- 未设置 --</option><option value="true"${value === true ? ' selected' : ''}>true</option><option value="false"${value === false ? ' selected' : ''}>false</option></select>`;
      } else if (type === 'object' || type === 'array') {
        control = `<textarea class="do-param-field do-param-json" data-param-name="${this._escapeHtml(name)}" data-schema-type="${type}">${value === undefined ? '' : this._escapeHtml(JSON.stringify(value))}</textarea>`;
      } else {
        const inputType = type === 'number' || type === 'integer' ? 'number' : 'text';
        const step = type === 'integer' ? ' step="1"' : type === 'number' ? ' step="any"' : '';
        control = `<input type="${inputType}"${step} class="do-param-field" data-param-name="${this._escapeHtml(name)}" data-schema-type="${this._escapeHtml(type)}" value="${this._escapeHtml(value ?? '')}">`;
      }
      return `<label${description}><span>${this._escapeHtml(label)}${requiredMark}</span>${control}</label>`;
    }).join('');
    return `<div class="do-structured-params"><div class="do-section-title">结构化参数</div><div class="do-param-grid">${rows}</div></div>`;
  }

  _readStructuredParams(item, params = {}) {
    const next = { ...(params || {}) };
    item.querySelectorAll('.do-param-field').forEach(element => {
      const name = element.dataset.paramName;
      const type = element.dataset.schemaType || 'string';
      const raw = element.value.trim();
      if (!name) return;
      if (!raw) {
        delete next[name];
        return;
      }
      if (type === 'boolean') next[name] = raw === 'true';
      else if (type === 'integer') next[name] = Number.parseInt(raw, 10);
      else if (type === 'number') next[name] = Number(raw);
      else if (type === 'object' || type === 'array') next[name] = this._parseJson(raw, next[name]);
      else next[name] = raw;
    });
    return next;
  }

  // ---- 详情表单 ----

  _renderDetail() {
    const panel = this.container.querySelector('#trg-detail');
    if (!panel) return;
    if (this.target === 'storyline') {
      this.storylinePanel.injectStyles();
      this.storylinePanel.render(panel);
      return;
    }
    const t = this.triggers[this.selectedIndex];
    if (!t) {
      const labels = {
        sceneEvents: 'SceneEvent',
        triggers: 'Trigger',
        tutorials: 'Tutorial'
      };
      panel.innerHTML = `<div class="trg-empty">选择或新增一个 ${labels[this.target] || '定义'}</div>`;
      return;
    }
    if (this.target === 'sceneEvents') {
      this.sceneEventPanel.render(panel, t);
      return;
    }
    if (this.target === 'tutorials') {
      this.tutorialPanel.render(panel, t);
      return;
    }

    const flowGroups = mergeFlowGroups(this.project)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    const tFgId = resolveFgId(t);
    let sceneEventOpts = flowGroups.map(fg => (
      `<option value="${this._escapeHtml(fg.id)}" ${tFgId === fg.id ? 'selected' : ''}>${this._escapeHtml(`${Number(fg.order || 0) + 1}. ${fg.name || fg.id}`)}</option>`
    )).join('');
    if (tFgId && !flowGroups.some(fg => fg.id === tFgId)) {
      sceneEventOpts = `<option value="${this._escapeHtml(tFgId)}" selected>${this._escapeHtml(tFgId)}（未登记）</option>` + sceneEventOpts;
    }
    const coordination = t.coordination && typeof t.coordination === 'object' ? t.coordination : {};
    let whenOpts = WHEN_TYPES.map(w =>
      `<option value="${w.v}" ${t.when?.type === w.v ? 'selected' : ''}>${w.label} (${w.v})</option>`).join('');
    // 保留下拉里没有的自定义 when.type（避免编辑保存时被重置丢失）
    if (t.when?.type && !WHEN_TYPES.some(w => w.v === t.when.type)) {
      whenOpts = `<option value="${t.when.type}" selected>自定义: ${t.when.type}</option>` + whenOpts;
    }

    // timer 专用间隔输入框（每隔多少秒触发一次）
    const isTimer = t.when?.type === 'timer';
    const timerSec = (t.when?.params && t.when.params.seconds != null) ? t.when.params.seconds : '';
    const timerRow = isTimer
      ? `<div class="row" style="background:#132038;padding:8px;border-radius:4px;border:1px solid #2a4a7e;">
           <label style="color:#7cf;">⏱ 间隔（秒）— 每隔多少秒触发一次</label>
           <input type="text" id="d-timer-seconds" value="${timerSec}" placeholder="如 5 表示每 5 秒触发">
           <div style="color:#89a;font-size:11px;margin-top:4px;">注意：这是循环间隔，不是冷却(cooldown)。会写入 when.params.seconds。</div>
         </div>`
      : '';

    let doHtml = '';
    (t.do || []).forEach((act, di) => {
      let actOpts = ACTION_TYPES.map(actionType => (
        `<option value="${this._escapeHtml(actionType.v)}" ${act.action === actionType.v ? 'selected' : ''}>${this._escapeHtml(actionType.label)} (${this._escapeHtml(actionType.v)})</option>`
      )).join('');
      // 保留下拉里没有的自定义 action，避免 unknown-but-allowed 字段在 round-trip 时丢失。
      if (act.action && !ACTION_TYPES.some(actionType => actionType.v === act.action)) {
        actOpts = `<option value="${this._escapeHtml(act.action)}" selected>自定义: ${this._escapeHtml(act.action)}</option>` + actOpts;
      }
      const descriptor = getTriggerActionDescriptor(act.action, this.project);
      const operations = getTriggerActionOperations(act.action, this.project);
      const operationId = String(act.params?.operation || '').trim();
      const operation = getTriggerActionOperation(act.action, operationId, this.project);
      let operationOptions = operations.map(candidate => (
        `<option value="${this._escapeHtml(candidate.value)}"${candidate.value === operationId ? ' selected' : ''}>${this._escapeHtml(candidate.label)} (${this._escapeHtml(candidate.value)})</option>`
      )).join('');
      if (operationId && !operations.some(candidate => candidate.value === operationId)) {
        operationOptions = `<option value="${this._escapeHtml(operationId)}" selected>未登记: ${this._escapeHtml(operationId)}</option>` + operationOptions;
      }
      const operationEditor = operations.length || operationId
        ? `<label>Operation<select class="do-operation"><option value="">-- 选择 operation --</option>${operationOptions}</select></label>`
        : '';
      const paramsSchema = operation?.paramsSchema || descriptor?.paramsSchema;
      const structuredParams = this._renderStructuredParams(
        paramsSchema,
        act.params || {},
        { excludeOperation: operations.length > 0 }
      );
      const rawParamsEditor = act.action === 'spawnPlacements'
        ? `${this._renderSpawnPlacementControls(act.params)}<textarea class="do-params" style="display:none">${this._escapeHtml(this._json(act.params))}</textarea>`
        : `${structuredParams}<details class="do-advanced"${structuredParams ? '' : ' open'}><summary>高级 JSON／未登记参数</summary><textarea class="do-params" placeholder='params JSON，如 {"id":"dlg1"}'>${this._escapeHtml(this._json(act.params))}</textarea></details>`;
      const semantics = this._formatResultSemantics(operation?.resultSemantics || descriptor?.resultSemantics);
      doHtml += `
        <div class="trg-do-item" data-di="${di}">
          <div class="do-head">
            <button type="button" class="do-drag-handle" draggable="true" title="拖动调整动作执行顺序" aria-label="拖动动作 ${di + 1}">↕</button>
            <span class="do-sequence">${di + 1}</span>
            <select class="do-action">${actOpts}</select>
            <button type="button" class="trg-mini do-del">删</button>
          </div>
          <div class="do-identity-grid">
            <label>稳定 stepId<input type="text" class="do-step-id" value="${this._escapeHtml(act.stepId || '')}" placeholder="${this._escapeHtml(this._nextActionStepId(t))}"></label>
            ${operationEditor}
          </div>
          ${semantics ? `<div class="do-result-semantics">结果语义：${this._escapeHtml(semantics)}</div>` : ''}
          ${rawParamsEditor}
        </div>`;
    });

    const scopeSceneIds = Array.isArray(t.editorScope?.sceneIds) ? t.editorScope.sceneIds : [];
    const scopeScenes = new Map();
    try {
      for (const scene of this.getSceneList()) {
        if (scene?.id) scopeScenes.set(scene.id, scene.name || scene.id);
      }
    } catch (error) {
      console.warn('TriggerEditor: 获取编辑器归属场景失败', error);
    }
    for (const sceneId of scopeSceneIds) {
      if (!scopeScenes.has(sceneId)) scopeScenes.set(sceneId, `${sceneId}（旧引用）`);
    }
    const scopeOptions = [...scopeScenes].map(([sceneId, sceneName]) => (
      `<option value="${this._escapeHtml(sceneId)}"${scopeSceneIds.includes(sceneId) ? ' selected' : ''}>${this._escapeHtml(sceneName)}</option>`
    )).join('');

    panel.innerHTML = `
      <div class="trg-definition-heading">
        <strong>Trigger 业务规则</strong>
        <span>同一 SceneEvent 内按 when、coordination.priority、定义顺序执行；do[] 严格串行</span>
      </div>
      <div class="row"><label>ID</label><input type="text" id="d-id" value="${this._escapeHtml(t.id || '')}"></div>
      <div class="row"><label>名称</label><input type="text" id="d-name" value="${this._escapeHtml(t.name || '')}" placeholder="如：第三次添柴后出现首狼"></div>
      <div class="row"><label>所属 SceneEvent</label><select id="d-scene-event"><option value="">-- 选择 SceneEvent --</option>${sceneEventOpts}</select></div>
      <div class="row"><label>协调组 coordination.group（空值表示独立执行）</label><input type="text" id="d-coordination-group" value="${this._escapeHtml(coordination.group || '')}" placeholder="如 s01-survival"></div>
      <div class="row trg-coordination-grid">
        <label>组策略<select id="d-coordination-policy">
          <option value="broadcast"${coordination.policy !== 'firstSuccess' ? ' selected' : ''}>全部执行 (broadcast)</option>
          <option value="firstSuccess"${coordination.policy === 'firstSuccess' ? ' selected' : ''}>首个成功 (firstSuccess)</option>
        </select></label>
        <label>优先级（高值先执行）<input type="number" step="1" id="d-coordination-priority" value="${Number.isInteger(coordination.priority) ? coordination.priority : 0}"></label>
      </div>
      <div class="row"><label>编辑器归属场景（可多选，不改变运行条件）</label><select id="d-editor-scope-scenes" multiple size="${Math.min(6, Math.max(3, scopeScenes.size))}">${scopeOptions}</select></div>
      <div class="row"><label style="display:flex;align-items:center;gap:5px;"><input type="checkbox" id="d-enabled" ${t.enabled !== false ? 'checked' : ''}> 启用</label></div>
      <div class="row"><label>触发时机 when.type</label><select id="d-when-type">${whenOpts}</select></div>
      ${timerRow}
      <div class="row"><label>when.params (JSON)</label><textarea id="d-when-params" placeholder='如 {"sceneId":"scene_a"}'>${this._json(t.when?.params)}</textarea></div>
      <div class="row"><label>条件 if (JSON，可空)</label><textarea id="d-if" placeholder='如 {"op":"==","left":{"var":"act"},"right":0}'>${t.if ? this._json(t.if) : ''}</textarea></div>
      <div class="row"><label style="display:flex;align-items:center;gap:5px;"><input type="checkbox" id="d-once" ${t.once ? 'checked' : ''}> 只触发一次(once)</label></div>
      <div class="row"><label>冷却 cooldown (秒，可空)</label><input type="text" id="d-cooldown" value="${t.cooldown != null ? t.cooldown : ''}"></div>
      <div class="row">
        <label>动作序列 do</label>
        <div id="d-do-list">${doHtml || '<div style="color:#778;font-size:12px;">暂无动作</div>'}</div>
        <button class="trg-mini" id="d-add-do" style="margin-top:6px;">+ 添加动作</button>
      </div>
    `;

    let draggedActionIndex = null;
    const clearActionDropIndicators = () => {
      panel.querySelectorAll('.trg-do-item').forEach(element => {
        element.classList.remove('drop-before', 'drop-after');
        delete element.dataset.dropPosition;
      });
    };
    panel.querySelectorAll('.trg-do-item').forEach(item => {
      const handle = item.querySelector('.do-drag-handle');
      handle?.addEventListener('dragstart', event => {
        this._commitDetail();
        draggedActionIndex = Number(item.dataset.di);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(draggedActionIndex));
        requestAnimationFrame(() => item.classList.add('dragging'));
      });
      item.addEventListener('dragover', event => {
        const targetIndex = Number(item.dataset.di);
        if (!Number.isInteger(draggedActionIndex) || draggedActionIndex === targetIndex) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const placeAfter = event.clientY >= item.getBoundingClientRect().top + item.offsetHeight / 2;
        clearActionDropIndicators();
        item.dataset.dropPosition = placeAfter ? 'after' : 'before';
        item.classList.add(placeAfter ? 'drop-after' : 'drop-before');
      });
      item.addEventListener('dragleave', event => {
        if (!item.contains(event.relatedTarget)) {
          item.classList.remove('drop-before', 'drop-after');
          delete item.dataset.dropPosition;
        }
      });
      item.addEventListener('drop', event => {
        event.preventDefault();
        const sourceIndex = draggedActionIndex;
        const targetIndex = Number(item.dataset.di);
        const placeAfter = item.dataset.dropPosition === 'after';
        draggedActionIndex = null;
        clearActionDropIndicators();
        this._moveAction(sourceIndex, targetIndex, placeAfter);
      });
      handle?.addEventListener('dragend', () => {
        draggedActionIndex = null;
        item.classList.remove('dragging');
        clearActionDropIndicators();
      });
    });

    panel.querySelector('#d-add-do').addEventListener('click', () => {
      this._commitDetail();
      if (!t.do) t.do = [];
      t.do.push({
        stepId: this._nextActionStepId(t),
        action: 'setVar',
        params: {}
      });
      this._renderDetail();
    });
    panel.querySelectorAll('.do-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const di = parseInt(e.target.closest('.trg-do-item').dataset.di);
        this._commitDetail();
        t.do.splice(di, 1);
        this._renderDetail();
      });
    });
    panel.querySelectorAll('.do-action, .do-operation').forEach(select => {
      select.addEventListener('change', () => {
        this._commitDetail();
        this._renderDetail();
      });
    });
    panel.querySelectorAll('.spawn-placement-mode').forEach(select => {
      select.addEventListener('change', () => {
        this._commitDetail();
        this._renderDetail();
      });
    });
    panel.querySelector('#d-scene-event')?.addEventListener('change', () => {
      this._commitDetail();
      this.projectIndex = new FlowGroupProjectIndex(this.project, { sceneDocuments: this._getSceneDocuments() });
      this._renderList();
    });
    for (const selector of ['#d-coordination-group', '#d-coordination-policy', '#d-coordination-priority']) {
      panel.querySelector(selector)?.addEventListener('change', () => {
        this._commitDetail();
        this._renderList();
      });
    }
    panel.querySelector('#d-editor-scope-scenes')?.addEventListener('change', () => {
      this._commitDetail();
      this._renderList();
    });
    // 启用/停用变化时即时刷新列表图标
    panel.querySelector('#d-enabled').addEventListener('change', () => {
      this._commitDetail();
      this._renderList();
    });
    // when 类型变化即时刷新列表标签 + 重渲染详情（显示/隐藏 timer 专用字段）
    panel.querySelector('#d-when-type').addEventListener('change', (e) => {
      this._commitDetail();
      // timer 类型时给个默认 seconds，避免用户忘填导致不触发
      if (e.target.value === 'timer') {
        const tt = this.triggers[this.selectedIndex];
        if (tt) {
          tt.when = tt.when || {};
          tt.when.params = tt.when.params || {};
          if (tt.when.params.seconds == null) tt.when.params.seconds = 5;
        }
      }
      this._renderList();
      this._renderDetail();
    });

    // timer 专用「间隔(秒)」输入框（若存在），双向同步 when.params.seconds
    const secInput = panel.querySelector('#d-timer-seconds');
    if (secInput) {
      secInput.addEventListener('input', () => {
        const wp = panel.querySelector('#d-when-params');
        let obj = {};
        try { obj = JSON.parse(wp.value || '{}'); } catch (err) { obj = {}; }
        const sec = parseFloat(secInput.value);
        if (!isNaN(sec) && sec > 0) obj.seconds = sec; else delete obj.seconds;
        wp.value = JSON.stringify(obj);
        // 触发 when.params 的校验高亮
        wp.dispatchEvent(new Event('input'));
      });
    }

    // JSON 输入框实时校验（合法绿框 / 非法红框 + 悬停提示）
    this._bindJsonValidation(panel.querySelector('#d-when-params'), true);
    this._bindJsonValidation(panel.querySelector('#d-if'), true);
    panel.querySelectorAll('.do-params, .do-param-json').forEach(el => this._bindJsonValidation(el, true));
  }

  /**
   * 给 JSON textarea 绑定实时校验
   * @param {HTMLTextAreaElement} el
   * @param {boolean} allowEmpty - 是否允许空值
   * @private
   */
  _bindJsonValidation(el, allowEmpty) {
    if (!el) return;
    const check = () => {
      const v = el.value.trim();
      if (!v) {
        el.style.borderColor = allowEmpty ? '#2a3a5e' : '#c62828';
        el.title = allowEmpty ? '' : '不能为空';
        return true;
      }
      try {
        JSON.parse(v);
        el.style.borderColor = '#4a8a4a';
        el.title = 'JSON 格式正确';
        return true;
      } catch (e) {
        el.style.borderColor = '#e05252';
        el.title = 'JSON 格式错误: ' + e.message + '\n（注意用半角引号 " 和大括号 {}）';
        return false;
      }
    };
    el.addEventListener('input', check);
    check(); // 初始校验
  }

  _moveAction(fromIndex, targetIndex, placeAfter = false) {
    const trigger = this.triggers[this.selectedIndex];
    if (!trigger || !Array.isArray(trigger.do)) return false;
    if (!Number.isInteger(fromIndex) || !Number.isInteger(targetIndex)
      || fromIndex < 0 || targetIndex < 0
      || fromIndex >= trigger.do.length || targetIndex >= trigger.do.length
      || fromIndex === targetIndex) return false;

    // 拖动完整 action 对象，保留稳定 ID、policy、operationId 和 unknown-but-allowed 字段。
    const [action] = trigger.do.splice(fromIndex, 1);
    let insertionIndex = targetIndex + (placeAfter ? 1 : 0);
    if (fromIndex < insertionIndex) insertionIndex -= 1;
    trigger.do.splice(insertionIndex, 0, action);
    this._status(`已调整 ${trigger.name || trigger.id || '触发器'} 的动作顺序，请保存到工程`, 'ok');
    this._renderDetail();
    return true;
  }

  /** 把详情表单的编辑写回当前触发器数据 */
  _commitDetail() {
    const t = this.triggers[this.selectedIndex];
    const panel = this.container.querySelector('#trg-detail');
    if (!t || !panel) return;
    if (this.target === 'sceneEvents' || this.target === 'flowGroups') {
      if (this.flowGroupPanel.commit(t, panel)) {
        this.projectIndex = new FlowGroupProjectIndex(this.project, { sceneDocuments: this._getSceneDocuments() });
      }
      return;
    }
    if (this.target === 'tutorials') {
      if (this.tutorialPanel.commit(t, panel)) {
        this.projectIndex = new FlowGroupProjectIndex(this.project, { sceneDocuments: this._getSceneDocuments() });
      }
      return;
    }
    if (!panel.querySelector('#d-id')) return;

    t.id = panel.querySelector('#d-id').value.trim() || t.id;
    const name = panel.querySelector('#d-name')?.value.trim() || '';
    if (name) t.name = name;
    else delete t.name;
    const fgRaw = panel.querySelector('#d-scene-event')?.value.trim() || '';
    syncFgFields(t, fgRaw);
    const coordinationGroup = panel.querySelector('#d-coordination-group')?.value.trim() || '';
    if (coordinationGroup) {
      const priority = Number(panel.querySelector('#d-coordination-priority')?.value);
      t.coordination = {
        ...(t.coordination || {}),
        group: coordinationGroup,
        policy: panel.querySelector('#d-coordination-policy')?.value || 'broadcast',
        priority: Number.isInteger(priority) ? priority : 0
      };
    } else {
      delete t.coordination;
    }
    const scopeSceneSelect = panel.querySelector('#d-editor-scope-scenes');
    const scopeSceneIds = scopeSceneSelect
      ? [...scopeSceneSelect.selectedOptions].map(option => option.value.trim()).filter(Boolean)
      : [];
    if (scopeSceneIds.length) {
      t.editorScope = { ...(t.editorScope || {}), sceneIds: [...new Set(scopeSceneIds)] };
    } else if (t.editorScope) {
      delete t.editorScope.sceneIds;
      if (Object.keys(t.editorScope).length === 0) delete t.editorScope;
    }
    // enabled：未勾选 = false（停用），勾选 = 删除字段（默认启用）
    const enabledEl = panel.querySelector('#d-enabled');
    if (enabledEl && !enabledEl.checked) {
      t.enabled = false;
    } else {
      delete t.enabled; // 默认启用不写字段，保持 JSON 简洁
    }
    t.when = t.when || {};
    t.when.type = panel.querySelector('#d-when-type').value;
    const whenParamsText = panel.querySelector('#d-when-params').value.trim();
    if (whenParamsText) t.when.params = this._parseJson(whenParamsText, {});
    else if (Object.prototype.hasOwnProperty.call(t.when, 'params')) t.when.params = {};
    const ifVal = panel.querySelector('#d-if').value.trim();
    if (ifVal) t.if = this._parseJson(ifVal, null); else delete t.if;
    const onceChecked = panel.querySelector('#d-once').checked;
    if (onceChecked) t.once = true;
    else if (Object.prototype.hasOwnProperty.call(t, 'once')) t.once = false;
    const cd = panel.querySelector('#d-cooldown').value.trim();
    if (cd) t.cooldown = parseFloat(cd); else delete t.cooldown;

    // 动作：严格按 DOM 顺序提交完整步骤；stepId 独立于数组下标，拖动不改变幂等身份。
    const previousActions = Array.isArray(t.do) ? t.do : [];
    const nextActions = [];
    const allocatedStepIds = new Set(previousActions.map(action => String(action?.stepId || '').trim()).filter(Boolean));
    let generatedSequence = 1;
    const allocateStepId = () => {
      const prefix = `${String(t.id || 'trigger').trim() || 'trigger'}.step`;
      let candidate;
      do candidate = `${prefix}.${String(generatedSequence++).padStart(3, '0')}`;
      while (allocatedStepIds.has(candidate));
      allocatedStepIds.add(candidate);
      return candidate;
    };
    const doItems = panel.querySelectorAll('.trg-do-item');
    doItems.forEach((el, index) => {
      const action = el.querySelector('.do-action').value;
      let params;
      if (action === 'spawnPlacements') {
        params = this._readSpawnPlacementParams(el);
      } else {
        const rawParams = this._parseJson(el.querySelector('.do-params')?.value || '{}', {});
        params = this._readStructuredParams(el, rawParams);
        const operationSelect = el.querySelector('.do-operation');
        if (operationSelect) {
          const operation = operationSelect.value.trim();
          if (operation) params.operation = operation;
          else delete params.operation;
        }
      }
      const requestedStepId = el.querySelector('.do-step-id')?.value.trim() || '';
      const next = {
        ...(previousActions[index] || {}),
        stepId: requestedStepId || allocateStepId(),
        action,
        params
      };
      // TriggerSystem 总是逐步 await Promise.resolve 并在首个失败处短路；旧 await 字段没有语义。
      delete next.await;
      nextActions.push(next);
    });
    t.do = nextActions;
  }

  _addTrigger() {
    this._commitDetail();
    const selectedSceneId = this.container.querySelector('#trg-filter-scene')?.value || '';
    const selectedEventId = text(this.container.querySelector('#trg-filter-event')?.value)
      || mergeFlowGroups(this.project).find(fg => !selectedSceneId
        || fg.scope?.sceneIds?.includes(selectedSceneId))?.id
      || mergeFlowGroups(this.project)[0]?.id
      || '';
    let definition;
    if (this.target === 'sceneEvents' || this.target === 'flowGroups') {
      definition = this.flowGroupPanel.create(selectedSceneId);
    } else if (this.target === 'tutorials') {
      definition = this.tutorialPanel.create(selectedEventId);
    } else {
      const id = this._nextStableId('trigger', this.project.triggers || []);
      definition = {
        id,
        when: { type: 'sceneEnter', params: {} },
        do: [],
        once: true
      };
      syncFgFields(definition, selectedEventId);
      if (selectedSceneId) definition.editorScope = { sceneIds: [selectedSceneId] };
    }
    this.triggers.push(definition);
    this.project[this.target] = this.triggers;
    // 新增后双数组同步
    if (this.target === 'flowGroups' || this.target === 'sceneEvents') {
      this.project.flowGroups = [...(Array.isArray(this.project.flowGroups) ? this.project.flowGroups : [])];
      this.project.sceneEvents = [...this.project.flowGroups];
    }
    this.projectIndex = new FlowGroupProjectIndex(this.project, { sceneDocuments: this._getSceneDocuments() });
    this.selectedIndex = this.triggers.length - 1;
    this._updateSceneEventFilter();
    this._renderList();
    this._renderDetail();
  }

  _deleteTrigger() {
    if (this.selectedIndex < 0) return;
    const definition = this.triggers[this.selectedIndex];
    if (this.target === 'sceneEvents' || this.target === 'flowGroups') {
      const fgId = definition?.id;
      const triggerCount = fgId
        ? (this.project.triggers || []).filter(trigger => resolveFgId(trigger) === fgId).length
        : 0;
      const tutorialCount = fgId
        ? (this.project.tutorials || []).filter(tutorial => resolveFgId(tutorial) === fgId).length
        : 0;
      if (triggerCount || tutorialCount) {
        this._status(`无法删除 ${definition.name || definition.id}：仍被 ${triggerCount} 个 Trigger、${tutorialCount} 个 Tutorial 引用`, 'err');
        return;
      }
    }
    this.triggers.splice(this.selectedIndex, 1);
    this.project[this.target] = this.triggers;
    if (this.target === 'flowGroups' || this.target === 'sceneEvents') {
      this.project.flowGroups = [...(Array.isArray(this.project.flowGroups) ? this.project.flowGroups : [])];
      this.project.sceneEvents = [...this.project.flowGroups];
    }
    this.projectIndex = new FlowGroupProjectIndex(this.project, { sceneDocuments: this._getSceneDocuments() });
    this.selectedIndex = Math.min(this.selectedIndex, this.triggers.length - 1);
    this._updateSceneEventFilter();
    this._renderList();
    this._renderDetail();
  }

  _escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  _json(v) {
    if (v == null) return '';
    try { return JSON.stringify(v); } catch (e) { return ''; }
  }

  _parseJson(str, fallback) {
    if (!str || !str.trim()) return fallback;
    try { return JSON.parse(str); }
    catch (e) { this._status('JSON 解析错误: ' + e.message, 'err'); return fallback; }
  }
}

export default TriggerEditor;
