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
 * 通过 Vite dev server 的 /api/read-file、/api/save-file 读写工程文件（保留其它字段）。
 */

import { getTriggerEvents, getTriggerActions, validateTriggerDefinition } from '../src/systems/TriggerCatalog.js';

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
    // 场景列表由编辑器入口按当前游戏动态提供，禁止由触发器引用反推。
    this.getSceneList = typeof options.getSceneList === 'function' ? options.getSceneList : () => [];
    // 当前场景的完整放置点由场景编辑器显式注入，供物品生成动作可视化选择。
    this.getPlacementOptions = typeof options.getPlacementOptions === 'function' ? options.getPlacementOptions : () => [];
    this.onSaved = typeof options.onSaved === 'function' ? options.onSaved : null;
    this.projectPath = `example/${this.gameId}/game.project.json`;
    this.project = null;
    this.triggers = [];
    this.selectedIndex = -1;
    // 编辑目标：'triggers'（事件触发器）或 'tutorials'（引导，同为触发器结构，do 用 showTip）
    this.target = options.target === 'tutorials' ? 'tutorials' : 'triggers';
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
    try {
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
      this.project = { meta: { id: this.gameId }, variables: {}, triggers: [], tutorials: [] };
    }
    // 确保两个数组都存在
    if (!Array.isArray(this.project.triggers)) this.project.triggers = [];
    if (!Array.isArray(this.project.tutorials)) this.project.tutorials = [];
    // 当前编辑目标数组
    this.triggers = this.project[this.target];
    WHEN_TYPES = getTriggerEvents(this.project);
    ACTION_TYPES = getTriggerActions(this.project);
    this._refreshCatalogControls();
  }

  _refreshCatalogControls() {
    const when = this.container.querySelector('#trg-filter-when');
    const action = this.container.querySelector('#trg-filter-do');
    if (when) when.innerHTML = '<option value="">全部时机</option>' + WHEN_TYPES.map(item => `<option value="${item.v}">${item.label}</option>`).join('');
    if (action) action.innerHTML = '<option value="">全部动作</option>' + ACTION_TYPES.map(item => `<option value="${item.v}">${item.label}</option>`).join('');
  }

  /** 切换编辑目标（triggers ↔ tutorials 引导） */
  _switchTarget(target) {
    if (target === this.target) return;
    this._commitDetail();
    this.project[this.target] = this.triggers; // 回写当前
    this.target = target;
    this.triggers = this.project[this.target];
    this.selectedIndex = -1;
    this._renderTargetTabs();
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
    this.project[this.target] = this.triggers;
    const definitionError = this._validateDefinitions();
    if (definitionError) {
      this._status('❌ ' + definitionError, 'err');
      this._toast(definitionError, false);
      return;
    }
    console.log('[TriggerEditor] 准备保存:', this.projectPath, this.target, '数量:', this.triggers.length, JSON.parse(JSON.stringify(this.triggers)));
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.projectPath, content: JSON.stringify(this.project, null, 2) })
      });
      const data = await res.json();
      console.log('[TriggerEditor] 保存返回:', data);
      if (data && data.ok) {
        this._status('✅ 已保存到 ' + this.projectPath + '（触发器 ' + this.triggers.length + ' 条）', 'ok');
        this._toast('保存成功（触发器 ' + this.triggers.length + ' 条）', true);
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
    const all = [...(this.project.triggers || []), ...(this.project.tutorials || [])];
    const ids = new Set();
    for (const trigger of all) {
      const errors = validateTriggerDefinition(trigger, this.project);
      if (errors.length) return `${trigger?.id || '(未命名)'}: ${errors[0]}`;
      if (ids.has(trigger.id)) return `重复 ID "${trigger.id}"（triggers/tutorials 共用命名空间）`;
      ids.add(trigger.id);
    }
    return '';
  }

  getTriggers() { return this.project?.triggers || []; }
  getTriggerById(id) { return this.getTriggers().find(trigger => trigger.id === id) || null; }

  selectById(id) {
    if (!id || !this.project) return false;
    if (this.target !== 'triggers') this._switchTarget('triggers');
    const index = this.triggers.findIndex(trigger => trigger.id === id);
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
    const els = [
      panel.querySelector('#d-when-params'),
      panel.querySelector('#d-if'),
      ...panel.querySelectorAll('.do-params')
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

  _buildUI() {
    // 构建 when.type 筛选选项
    const whenOpts = WHEN_TYPES.map(w => `<option value="${w.v}">${w.label}</option>`).join('');
    // 构建 do 动作筛选选项
    const doOpts = ACTION_TYPES.map(a => `<option value="${a.v}">${a.label}</option>`).join('');

    this.container.innerHTML = `
      <div class="trg-root">
        <div class="trg-target-tabs" id="trg-target-tabs">
          <button data-target="triggers">事件触发器</button>
          <button data-target="tutorials">引导 (showTip)</button>
        </div>
        <div class="trg-toolbar">
          <select id="trg-filter-enabled" title="筛选启用/停用" style="padding:4px;background:#26304e;color:#fff;border:1px solid #3a4a7e;border-radius:3px;font-size:12px;">
            <option value="">全部状态</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
          <select id="trg-filter-scene" title="筛选场景" style="padding:4px;background:#26304e;color:#fff;border:1px solid #3a4a7e;border-radius:3px;font-size:12px;">
            <option value="">全部场景</option>
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
          <button id="trg-save" class="primary">💾 保存到工程</button>
          <span class="trg-hint">数据 → ${this.projectPath}</span>
        </div>
        <div class="trg-main">
          <div class="trg-list" id="trg-list"></div>
          <div class="trg-detail" id="trg-detail"></div>
        </div>
        <div class="trg-status" id="trg-status"></div>
      </div>
    `;
    this.container.querySelector('#trg-add').addEventListener('click', () => this._addTrigger());
    this.container.querySelector('#trg-del').addEventListener('click', () => this._deleteTrigger());
    this.container.querySelector('#trg-save').addEventListener('click', () => this.save());
    this.container.querySelectorAll('#trg-target-tabs button').forEach(btn => {
      btn.addEventListener('click', () => this._switchTarget(btn.dataset.target));
    });
    // 筛选器事件
    this.container.querySelector('#trg-filter-enabled').addEventListener('change', () => this._renderList());
    this.container.querySelector('#trg-filter-scene').addEventListener('change', () => this._renderList());
    this.container.querySelector('#trg-filter-when').addEventListener('change', () => this._renderList());
    this.container.querySelector('#trg-filter-do').addEventListener('change', () => this._renderList());
    this._renderTargetTabs();
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
      .trg-main{flex:1;display:flex;overflow:hidden;}
      .trg-list{width:240px;background:#111a30;border-right:1px solid #2a3a5e;overflow-y:auto;}
      .trg-item{padding:10px 14px;border-bottom:1px solid #1e2b47;cursor:pointer;display:flex;align-items:center;gap:6px;}
      .trg-item:hover{background:#1a2540;}
      .trg-item.active{background:#2a3a6e;}
      .trg-item.disabled{opacity:0.45;}
      .trg-item .trg-status{font-size:10px;flex-shrink:0;}
      .trg-item .tid{font-weight:bold;font-size:13px;}
      .trg-item .twhen{font-size:11px;color:#9ab;}
      .trg-detail{flex:1;padding:16px;overflow-y:auto;}
      .trg-detail .row{margin-bottom:10px;}
      .trg-detail label{display:block;font-size:12px;color:#9ab;margin-bottom:3px;}
      .trg-detail input[type=text],.trg-detail select,.trg-detail textarea{width:100%;box-sizing:border-box;background:#0a1020;border:1px solid #2a3a5e;color:#fff;padding:6px;border-radius:3px;font-family:monospace;font-size:12px;}
      .trg-detail textarea{min-height:48px;resize:vertical;}
      .trg-do-item{border:1px solid #2a3a5e;border-radius:4px;padding:8px;margin-bottom:8px;background:#0f1830;}
      .trg-do-item .do-head{display:flex;gap:6px;align-items:center;margin-bottom:6px;}
      .trg-do-item select{flex:1;}
      .spawn-placement-controls{display:grid;grid-template-columns:110px minmax(0,1fr);gap:6px;align-items:center;}
      .spawn-placement-controls label{grid-column:1 / -1;margin:0;color:#7cf;}
      .spawn-placement-hint{grid-column:1 / -1;color:#89a;font-size:11px;line-height:1.4;}
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

  _renderList() {
    const list = this.container.querySelector('#trg-list');
    if (!list) return;

    // 读取筛选条件
    const filterEnabled = this.container.querySelector('#trg-filter-enabled')?.value || '';
    const filterScene = this.container.querySelector('#trg-filter-scene')?.value || '';
    const filterWhen = this.container.querySelector('#trg-filter-when')?.value || '';
    const filterDo = this.container.querySelector('#trg-filter-do')?.value || '';

    // 更新场景下拉选项（从触发器数据中收集）
    this._updateSceneFilter();

    // 筛选触发器
    const filtered = this.triggers.filter((t, i) => {
      if (filterEnabled === 'enabled' && t.enabled === false) return false;
      if (filterEnabled === 'disabled' && t.enabled !== false) return false;
      if (filterScene) {
        const tScene = t.when?.params?.sceneId || '';
        if (tScene !== filterScene) return false;
      }
      if (filterWhen && t.when?.type !== filterWhen) return false;
      if (filterDo) {
        const doList = Array.isArray(t.do) ? t.do : [];
        if (!doList.some(d => (d.action || d.type || d) === filterDo)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      list.innerHTML = '<div class="trg-empty">无匹配的触发器</div>';
      return;
    }
    list.innerHTML = '';
    filtered.forEach((t) => {
      const i = this.triggers.indexOf(t);
      const item = document.createElement('div');
      const disabled = t.enabled === false;
      item.className = 'trg-item' + (i === this.selectedIndex ? ' active' : '') + (disabled ? ' disabled' : '');
      const whenLabel = (WHEN_TYPES.find(w => w.v === t.when?.type) || {}).label || t.when?.type || '?';
      const statusIcon = disabled ? '⏸' : '▶';
      item.innerHTML = `<span class="trg-status" data-toggle="${i}">${statusIcon}</span><div class="tid">${t.id || '(未命名)'}</div><div class="twhen">when: ${whenLabel}</div>`;
      item.querySelector('.trg-status').addEventListener('click', (e) => {
        e.stopPropagation();
        this._commitDetail();
        t.enabled = t.enabled === false ? undefined : false;
        if (t.enabled === undefined) delete t.enabled;
        this._renderList();
        this._renderDetail();
      });
      item.addEventListener('click', () => {
        this._commitDetail();
        this.selectedIndex = i;
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

    // 保留旧触发器中已删除的场景引用，避免筛选值和历史数据被静默抹掉。
    for (const trigger of this.triggers) {
      const sceneId = trigger.when?.params?.sceneId;
      if (sceneId && !scenes.has(sceneId)) scenes.set(sceneId, `${sceneId}（旧引用）`);
    }

    let options = '<option value="">全部场景</option>';
    for (const [sceneId, sceneName] of scenes) {
      const selected = sceneId === currentValue ? 'selected' : '';
      options += `<option value="${sceneId}" ${selected}>${sceneName}</option>`;
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
    const mode = item.querySelector('.spawn-placement-mode')?.value || 'placement';
    const target = item.querySelector('.spawn-placement-target')?.value || '';
    const sceneId = item.querySelector('.spawn-placement-target')?.selectedOptions?.[0]?.dataset.sceneId || '';
    const selector = { sceneId, kinds: ['item'] };
    if (mode === 'placement') selector.placementIds = target ? [target] : [];
    else if (mode === 'group') selector.group = target;
    else selector.tag = target;
    return { selector };
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

  // ---- 详情表单 ----

  _renderDetail() {
    const panel = this.container.querySelector('#trg-detail');
    if (!panel) return;
    const t = this.triggers[this.selectedIndex];
    if (!t) {
      panel.innerHTML = '<div class="trg-empty">选择或新增一个触发器</div>';
      return;
    }
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
      let actOpts = ACTION_TYPES.map(a =>
        `<option value="${a.v}" ${act.action === a.v ? 'selected' : ''}>${a.label} (${a.v})</option>`).join('');
      // 保留下拉里没有的自定义 action（避免编辑保存时被重置丢失）
      if (act.action && !ACTION_TYPES.some(a => a.v === act.action)) {
        actOpts = `<option value="${act.action}" selected>自定义: ${act.action}</option>` + actOpts;
      }
      const paramsEditor = act.action === 'spawnPlacements'
        ? `${this._renderSpawnPlacementControls(act.params)}<textarea class="do-params" style="display:none">${this._json(act.params)}</textarea>`
        : `<textarea class="do-params" placeholder='params JSON，如 {"id":"dlg1"}'>${this._json(act.params)}</textarea>`;
      doHtml += `
        <div class="trg-do-item" data-di="${di}">
          <div class="do-head">
            <select class="do-action">${actOpts}</select>
            <label style="display:flex;align-items:center;gap:3px;margin:0;color:#9ab;font-size:11px;">
              <input type="checkbox" class="do-await" ${act.await ? 'checked' : ''}>await
            </label>
            <button class="trg-mini do-del">删</button>
          </div>
          ${paramsEditor}
        </div>`;
    });

    panel.innerHTML = `
      <div class="row"><label>ID</label><input type="text" id="d-id" value="${t.id || ''}"></div>
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

    panel.querySelector('#d-add-do').addEventListener('click', () => {
      this._commitDetail();
      if (!t.do) t.do = [];
      t.do.push({ action: 'setVar', params: {} });
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
    panel.querySelectorAll('.do-action').forEach(select => {
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
    panel.querySelectorAll('.do-params').forEach(el => this._bindJsonValidation(el, true));
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

  /** 把详情表单的编辑写回当前触发器数据 */
  _commitDetail() {
    const t = this.triggers[this.selectedIndex];
    const panel = this.container.querySelector('#trg-detail');
    if (!t || !panel || !panel.querySelector('#d-id')) return;

    t.id = panel.querySelector('#d-id').value.trim() || t.id;
    // enabled：未勾选 = false（停用），勾选 = 删除字段（默认启用）
    const enabledEl = panel.querySelector('#d-enabled');
    if (enabledEl && !enabledEl.checked) {
      t.enabled = false;
    } else {
      delete t.enabled; // 默认启用不写字段，保持 JSON 简洁
    }
    t.when = t.when || {};
    t.when.type = panel.querySelector('#d-when-type').value;
    t.when.params = this._parseJson(panel.querySelector('#d-when-params').value, {});
    const ifVal = panel.querySelector('#d-if').value.trim();
    if (ifVal) t.if = this._parseJson(ifVal, null); else delete t.if;
    t.once = panel.querySelector('#d-once').checked;
    const cd = panel.querySelector('#d-cooldown').value.trim();
    if (cd) t.cooldown = parseFloat(cd); else delete t.cooldown;

    // 动作
    const doItems = panel.querySelectorAll('.trg-do-item');
    t.do = [];
    doItems.forEach(el => {
      const action = el.querySelector('.do-action').value;
      const params = action === 'spawnPlacements'
        ? this._readSpawnPlacementParams(el)
        : this._parseJson(el.querySelector('.do-params').value, {});
      t.do.push({
        action,
        params,
        ...(el.querySelector('.do-await').checked ? { await: true } : {})
      });
    });
  }

  _addTrigger() {
    this._commitDetail();
    if (this.target === 'tutorials') {
      // 引导默认：进入场景时显示一句提示（showTip）
      const id = 'tut_' + Date.now().toString(36);
      this.triggers.push({
        id,
        when: { type: 'sceneEnter', params: {} },
        do: [{ action: 'showTip', params: { text: '提示文本' } }],
        once: true
      });
    } else {
      const id = 'trg_' + Date.now().toString(36);
      this.triggers.push({ id, when: { type: 'sceneEnter', params: {} }, do: [], once: true });
    }
    this.selectedIndex = this.triggers.length - 1;
    this._renderList();
    this._renderDetail();
  }

  _deleteTrigger() {
    if (this.selectedIndex < 0) return;
    this.triggers.splice(this.selectedIndex, 1);
    this.selectedIndex = Math.min(this.selectedIndex, this.triggers.length - 1);
    this._renderList();
    this._renderDetail();
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
