/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import {
  normalizeSceneObjectSelector,
  resolveSceneObjects
} from '../src/core/scene/SceneObjectSelector.js';
import { FlowGroupProjectIndex as _FGIndex, SceneEventProjectIndex } from './SceneEventProjectIndex.js';

const FlowGroupProjectIndex = _FGIndex || SceneEventProjectIndex;

const SELECTOR_MODES = ['id', 'group', 'tag', 'name', 'type', 'ref'];
const _resolveFgId = obj => {
  if (!obj) return '';
  const t = v => String(v ?? '').trim();
  const fromFg = t(obj.flowGroupId);
  return fromFg ? fromFg : t(obj.sceneEventId);
};
const _syncFgState = (state, fgId) => {
  state.flowGroupId = fgId;
  state.sceneEventId = fgId;
};

function asList(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function text(value) {
  return String(value ?? '').trim();
}

function conditionAnchor(condition) {
  if (!condition || typeof condition !== 'object') return '';
  const children = [...asList(condition.all), ...asList(condition.any)];
  for (const child of children) {
    const anchor = conditionAnchor(child);
    if (anchor) return anchor;
  }
  const positive = condition.completed === true || condition.equals === true ||
    (Number.isFinite(condition.gte) && condition.gte > 0);
  if (!positive) return '';
  if (condition.tutorialId) return `教学 · ${condition.tutorialId}`;
  if (condition.path) return `状态 · ${condition.path}`;
  if (condition.blackboardKey) return `状态 · ${condition.blackboardKey}`;
  return '';
}

function eventLabel(record) {
  const binding = record.binding;
  return binding.name || binding.triggerId || record.id;
}

function isPersistentVisualLayer(layer) {
  const id = text(layer?.id).toLowerCase();
  const name = text(layer?.name).toLowerCase();
  if (['layer_bg', 'layer_background', 'layer_fill', 'layer_deco', 'layer_decoration'].includes(id)) return true;
  if (/(^|[_-])(bg|background|fill|deco|decoration|decorations)($|[_-])/.test(id)) return true;
  return name.includes('背景') || name.includes('装饰') ||
    name.includes('background') || name.includes('decoration');
}

export class SceneEditorEventFilter {
  constructor(editor) {
    this.editor = editor;
    // selectedFlowGroupId 和 selectedSceneEventId 通过 _syncFgState 始终保持同值；旧变量名保留兼容
    this.state = {
      mode: 'all',
      selectedFlowGroupId: '',
      selectedSceneEventId: '',
      selectedTriggerId: '',
      selectedBindingId: '',
      includeRelated: false
    };
    this.events = [];
    // flowGroups（新名）= phases（旧名），同一数组引用双别名
    this.flowGroups = [];
    this.phases = this.flowGroups;
    this.projectIndex = new FlowGroupProjectIndex();
    this.hiddenBindingIds = new Set();
    this.visibleObjects = null;
    this.dynamicTargets = [];
    this._scrollLeft = 0;
    this._bound = false;
  }
  reset(sceneData = this.editor.sceneData) {
    this.sceneData = sceneData;
    this._scrollLeft = 0;
    this.hiddenBindingIds.clear();
    this.state = {
      mode: 'all',
      selectedFlowGroupId: '',
      selectedSceneEventId: '',
      selectedTriggerId: '',
      selectedBindingId: '',
      includeRelated: false
    };
    this.rebuild({ preserveSelection: false });
  }

  rebuild({ preserveSelection = true, notify = false } = {}) {
    this.sceneData = this.editor.sceneData;
    const previousSceneEventId = preserveSelection ? _resolveFgId(this.state) : '';
    const previousTriggerId = preserveSelection ? this.state.selectedTriggerId : '';
    const previousBindingId = preserveSelection ? this.state.selectedBindingId : '';
    const project = this.editor.getProjectDefinitions?.() || {};
    this.projectIndex = new FlowGroupProjectIndex(project, {
      sceneDocuments: this.sceneData ? [this.sceneData] : []
    });
    const records = [];
    for (let layerIndex = 0; layerIndex < (this.sceneData?.layers || []).length; layerIndex++) {
      const layer = this.sceneData.layers[layerIndex];
      for (let objectIndex = 0; objectIndex < (layer.objects || []).length; objectIndex++) {
        const binding = layer.objects[objectIndex];
        if (binding?.type !== 'trigger') continue;
        const id = text(binding.id) || `binding-${layerIndex}-${objectIndex}`;
        records.push({
          id,
          binding,
          definition: this.projectIndex.getTrigger(binding.triggerId),
          layerIndex,
          objectIndex
        });
      }
    }

    const projection = this.projectIndex.getSceneProjection(this.sceneData?.id, records);
    // FlowGroup 双字段：每个 phase 同时挂 flowGroup + sceneEvent 属性（兼容旧代码读 sceneEvent）
    this.flowGroups.splice(0, this.flowGroups.length, ...projection.groups.map(group => {
      const fg = group.flowGroup || group.sceneEvent || null;
      return {
        id: group.id,
        label: (fg?.name || group.id),
        flowGroup: fg,
        sceneEvent: fg,
        triggers: group.triggers,
        tutorials: group.tutorials,
        events: group.bindings
      };
    }));
    if (projection.unassigned.length) {
      const triggerIds = new Set(projection.unassigned.map(record => record.definition?.id).filter(Boolean));
      this.flowGroups.push({
        id: '__unassigned__',
        label: '未归属 FlowGroup(SceneEvent)',
        flowGroup: null,
        sceneEvent: null,
        triggers: this.projectIndex.triggers.filter(trigger => triggerIds.has(trigger.id)),
        tutorials: [],
        events: projection.unassigned
      });
    }
    this.events = this.flowGroups.flatMap(phase => phase.events.map(record => {
      record.phaseId = phase.id;
      return record;
    }));

    const currentIds = new Set(this.events.map(record => record.id));
    for (const id of this.hiddenBindingIds) {
      if (!currentIds.has(id)) this.hiddenBindingIds.delete(id);
    }
    const fgExists = this.flowGroups.some(phase => phase.id === previousSceneEventId);
    _syncFgState(this.state, fgExists ? previousSceneEventId : '');
    this.state.selectedTriggerId = this.projectIndex.getTrigger(previousTriggerId)
      ? previousTriggerId : '';
    this.state.selectedBindingId = currentIds.has(previousBindingId) ? previousBindingId : '';
    if (this.state.mode === 'sceneEvent' && !this.state.selectedSceneEventId) this.state.mode = 'all';
    if (this.state.mode === 'flowGroup' && !this.state.selectedFlowGroupId) this.state.mode = 'all';
    if (this.state.mode === 'trigger' && !this.state.selectedTriggerId) this.state.mode = 'all';
    if (this.state.mode === 'binding' && !this.state.selectedBindingId) this.state.mode = 'all';
    this._recomputeProjection();
    this.renderBar();
    if (notify) this._notifyViewChanged();
  }

  getState() {
    return {
      ...this.state,
      showAllEvents: this.hiddenBindingIds.size === 0,
      hiddenBindingIds: [...this.hiddenBindingIds]
    };
  }
  getEvents() { return [...this.events]; }
  getPhases() { return this.phases.map(phase => ({ ...phase, events: [...phase.events] })); }
  isFiltering() { return this.state.mode !== 'all' || this.hiddenBindingIds.size > 0; }
  isObjectVisible(object) { return !this.visibleObjects || this.visibleObjects.has(object); }
  filterObjects(objects = []) { return this.visibleObjects ? objects.filter(object => this.visibleObjects.has(object)) : [...objects]; }

  setAllEventsVisible(value) {
    this.hiddenBindingIds.clear();
    if (!value) {
      for (const event of this.events) this.hiddenBindingIds.add(event.id);
    }
    this._applySelection();
  }

  setEventVisible(bindingId, value) {
    if (!this.events.some(event => event.id === bindingId)) return;
    if (value) this.hiddenBindingIds.delete(bindingId);
    else this.hiddenBindingIds.add(bindingId);
    this._applySelection();
  }

  selectAll() {
    this.state.mode = 'all';
    _syncFgState(this.state, '');
    this.state.selectedTriggerId = '';
    this.state.selectedBindingId = '';
    this._applySelection();
  }

  /** @deprecated 使用 selectFlowGroup */
  selectPhase(sceneEventId) {
    return this.selectFlowGroup(sceneEventId);
  }

  selectFlowGroup(flowGroupId) {
    if (!this.flowGroups.some(phase => phase.id === flowGroupId)) return;
    this.state.mode = 'flowGroup';
    // sceneEvent 模式同时兼容（旧代码可能硬编码判断 mode==='sceneEvent'）
    _syncFgState(this.state, flowGroupId);
    this.state.selectedTriggerId = '';
    this.state.selectedBindingId = '';
    this._applySelection();
  }

  selectTrigger(triggerId) {
    const definition = this.projectIndex.getTrigger(triggerId);
    if (!definition) return;
    this.state.mode = 'trigger';
    const fgId = _resolveFgId(definition) || '__unassigned__';
    _syncFgState(this.state, fgId);
    this.state.selectedTriggerId = triggerId;
    this.state.selectedBindingId = '';
    this._applySelection();
  }

  selectEvent(bindingId) {
    const record = this.events.find(event => event.id === bindingId);
    if (!record) return;
    this.state.mode = 'binding';
    this.state.selectedBindingId = bindingId;
    this.state.selectedTriggerId = record.definition?.id || '';
    const fgId = record.phaseId || '';
    _syncFgState(this.state, fgId);
    this._applySelection();
    // 即使 canonical enabled=false 导致画布不绘制，也允许从事件条重新选中并在右侧恢复。
    this.editor.selectedObjects = [record.binding];
    this.editor.ui?.updateObjectProperties();
    this.editor.render();
  }

  setIncludeRelated(value) {
    this.state.includeRelated = !!value;
    this._applySelection();
  }

  _applySelection() {
    this._recomputeProjection();
    this.sanitizeInteractionState();
    this.renderBar();
    this._notifyViewChanged();
  }
  _selectedEvents() {
    if (this.state.mode === 'binding') {
      return this.events.filter(event => event.id === this.state.selectedBindingId);
    }
    if (this.state.mode === 'trigger') {
      return this.events.filter(event => event.definition?.id === this.state.selectedTriggerId
        || event.binding?.triggerId === this.state.selectedTriggerId);
    }
    // sceneEvent（旧名）和 flowGroup（新名）两个 mode 都等价命中双读判断
    if (this.state.mode === 'sceneEvent' || this.state.mode === 'flowGroup') {
      const fgId = _resolveFgId(this.state);
      return this.events.filter(event => event.phaseId === fgId);
    }
    return this.events;
  }

  getFlowGroups() { return this.flowGroups.map(phase => ({ ...phase, events: [...phase.events] })); }

  _allObjects() {
    return (this.sceneData?.layers || []).flatMap(layer => layer.objects || []);
  }

  _recomputeProjection() {
    this.dynamicTargets = [];
    const hasDisabledBindings = this.events.some(event => event.binding.enabled === false);
    if (this.state.mode === 'all' && this.hiddenBindingIds.size === 0 && !hasDisabledBindings) {
      this.visibleObjects = null;
      return;
    }
    const selectedEvents = this._selectedEvents()
      .filter(event => !this.hiddenBindingIds.has(event.id) && event.binding.enabled !== false);
    const visible = this.state.mode === 'all'
      ? new Set(this._allObjects().filter(object => object?.type !== 'trigger'))
      : new Set();
    for (const event of selectedEvents) visible.add(event.binding);
    // 任一三层聚焦视图都保留地貌上下文；只投影视觉层对象，不扩大其他逻辑层。
    if (this.state.mode !== 'all') {
      for (const layer of this.sceneData?.layers || []) {
        if (!isPersistentVisualLayer(layer)) continue;
        for (const object of layer.objects || []) visible.add(object);
      }
    }
    if (this.state.includeRelated) this._resolveRelatedObjects(selectedEvents, visible);
    // 临时隐藏与 canonical enabled=false 都拥有最终优先级，关联闭包或视觉层不得重新加入。
    for (const event of this.events) {
      if (this.hiddenBindingIds.has(event.id) || event.binding.enabled === false) visible.delete(event.binding);
    }
    this.visibleObjects = visible;
  }

  _resolveRelatedObjects(seedEvents, visible) {
    const allObjects = this._allObjects();
    const eventByBinding = new Map(this.events.map(event => [event.binding, event]));
    const queue = [...seedEvents];
    const visitedEvents = new Set();
    const missing = new Set();
    while (queue.length && visible.size <= allObjects.length) {
      const event = queue.shift();
      if (!event || visitedEvents.has(event.id)) continue;
      visitedEvents.add(event.id);
      for (const selector of this._selectorsForEvent(event)) {
        const matches = resolveSceneObjects(allObjects, selector);
        if (!matches.length) missing.add(`${selector.mode}:${selector.value}`);
        for (const object of matches) {
          visible.add(object);
          const relatedEvent = eventByBinding.get(object);
          if (relatedEvent && !visitedEvents.has(relatedEvent.id)) queue.push(relatedEvent);
        }
      }
    }
    this.dynamicTargets = [...missing];
  }

  _selectorsForEvent(event) {
    const selectors = [];
    const seen = new Set();
    const add = (mode, value) => {
      const normalized = normalizeSceneObjectSelector({ mode, value });
      if (!normalized.value) return;
      const key = `${normalized.mode}:${normalized.value}`;
      if (seen.has(key)) return;
      seen.add(key);
      selectors.push(normalized);
    };
    const addSelectorObject = raw => {
      if (!raw || typeof raw !== 'object') return;
      if (raw.mode || raw.targetMode || raw.value || raw.target) {
        const normalized = normalizeSceneObjectSelector(raw);
        add(normalized.mode, normalized.value);
      }
      for (const mode of SELECTOR_MODES) {
        for (const value of asList(raw[mode])) add(mode, value);
      }
    };

    add(event.binding.targetMode || 'auto', event.binding.target);
    for (const action of event.definition?.do || []) {
      const params = action?.params || {};
      addSelectorObject(params.targetSelector);
      addSelectorObject(params.selector);
      if (params.targetMode || params.target) add(params.targetMode || 'auto', params.target);
      for (const value of [...asList(params.targetId), ...asList(params.objectId), ...asList(params.targetIds)]) add('id', value);
      for (const value of [...asList(params.ref), ...asList(params.npcRef), ...asList(params.enemyRef)]) add('ref', value);
      for (const value of [...asList(params.entityId), ...asList(params.actorId), ...asList(params.vehicleId)]) add('auto', value);
      if (action.action === 'spawnGroup' || action.action === 'spawnWave') add('group', params.group);
    }
    return selectors;
  }

  sanitizeInteractionState() {
    const editor = this.editor;
    editor.selectedObjects = (editor.selectedObjects || []).filter(object => this.isObjectVisible(object));
    const interaction = editor.interaction || {};
    Object.assign(interaction, {
      isDragging: false, isResizing: false, isRotating: false,
      isLinking: false, isPickingTarget: false, isBoxSelecting: false,
      draggingVertex: null, resizeTarget: null, resizeStart: null,
      linkSource: null, linkEnd: null, pickSource: null,
      boxSelectStart: null, boxSelectEnd: null, allObjectStarts: null
    });
    editor.interactionModule?._clearArrowKeyState?.();
  }

  _notifyViewChanged() {
    this.editor.layers?.updateLayerList();
    this.editor.ui?.updateObjectProperties();
    this.editor.render();
  }
  bindUI() {
    const bar = document.getElementById('editor-scene-event-filter');
    if (!bar || this._bound) return;
    this._bound = true;
    bar.addEventListener('click', event => {
      const editButton = event.target.closest('button[data-editor-target]');
      if (editButton) {
        this.editor.options.openTriggerEditor?.(editButton.dataset.definitionId, editButton.dataset.editorTarget);
        return;
      }
      const button = event.target.closest('button[data-filter-mode]');
      if (!button) return;
      if (button.dataset.filterMode === 'all') this.selectAll();
      else if (button.dataset.filterMode === 'sceneEvent') this.selectPhase(button.dataset.sceneEventId);
      else if (button.dataset.filterMode === 'trigger') this.selectTrigger(button.dataset.triggerId);
      else if (button.dataset.filterMode === 'binding') this.selectEvent(button.dataset.bindingId);
    });
    bar.addEventListener('dblclick', event => {
      const button = event.target.closest('button[data-filter-mode="sceneEvent"], button[data-filter-mode="trigger"]');
      if (!button) return;
      const target = button.dataset.filterMode === 'sceneEvent' ? 'sceneEvents' : 'triggers';
      const id = button.dataset.sceneEventId || button.dataset.triggerId;
      this.editor.options.openTriggerEditor?.(id, target);
    });
    bar.addEventListener('change', event => {
      if (event.target.id === 'editor-event-filter-all-visible') {
        this.setAllEventsVisible(event.target.checked);
      } else if (event.target.matches('input[data-event-visibility]')) {
        this.setEventVisible(event.target.dataset.eventVisibility, event.target.checked);
      } else if (event.target.id === 'editor-event-filter-related') {
        this.setIncludeRelated(event.target.checked);
      }
    });
    this.renderBar();
  }

  renderBar() {
    const bar = document.getElementById('editor-scene-event-filter');
    if (!bar) return;
    const previousScroll = bar.querySelector('.scene-event-filter-scroll');
    if (previousScroll) this._scrollLeft = previousScroll.scrollLeft;
    bar.replaceChildren();

    const title = document.createElement('span');
    title.className = 'scene-event-filter-title';
    title.textContent = 'SceneEvent 流程';
    title.title = '按 SceneEvent.order 展示宏观流程；Trigger 使用定义顺序与协调优先级；Tutorial 继承 SceneEvent 顺序并保留 steps[]';
    bar.appendChild(title);

    const showAll = document.createElement('label');
    showAll.className = 'scene-event-filter-all-visible';
    const showAllInput = document.createElement('input');
    showAllInput.id = 'editor-event-filter-all-visible';
    showAllInput.type = 'checkbox';
    const effectivelyVisibleCount = this.events.filter(event =>
      !this.hiddenBindingIds.has(event.id) && event.binding.enabled !== false).length;
    showAllInput.checked = this.events.length === 0 || effectivelyVisibleCount === this.events.length;
    showAllInput.indeterminate = effectivelyVisibleCount > 0 && effectivelyVisibleCount < this.events.length;
    showAll.append(showAllInput, document.createTextNode(' 显示全部'));
    showAll.title = '仅控制编辑器中的事件标记显隐，不写入场景 JSON';
    bar.appendChild(showAll);

    const scroll = document.createElement('div');
    scroll.className = 'scene-event-filter-scroll';
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.dataset.filterMode = 'all';
    allButton.className = `scene-event-filter-item${this.state.mode === 'all' ? ' active' : ''}`;
    allButton.textContent = `全部 (${this.events.length})`;
    allButton.title = '显示完整场景，关闭事件视图过滤';
    scroll.appendChild(allButton);

    for (let phaseIndex = 0; phaseIndex < this.phases.length; phaseIndex++) {
      const phase = this.phases[phaseIndex];
      const sceneEvent = phase.sceneEvent;
      const phaseButton = document.createElement('button');
      phaseButton.type = 'button';
      phaseButton.dataset.filterMode = 'sceneEvent';
      phaseButton.dataset.sceneEventId = phase.id;
      phaseButton.className = `scene-event-filter-item scene-event${this.state.mode === 'sceneEvent' && this.state.selectedSceneEventId === phase.id ? ' active' : ''}`;
      const orderLabel = sceneEvent ? `E${Number(sceneEvent.order) + 1}` : 'E?';
      phaseButton.textContent = `${orderLabel} · ${phase.label}`;
      phaseButton.title = sceneEvent
        ? `SceneEvent ${sceneEvent.id}\n依赖: ${(sceneEvent.dependsOn || []).join(', ') || '无'}\nTrigger ${phase.triggers.length} 个，Tutorial ${phase.tutorials.length} 个\n双击打开定义`
        : '尚未迁移到 SceneEvent 的空间 binding';
      scroll.appendChild(phaseButton);

      const appendBindingEntry = record => {
        const eventEntry = document.createElement('div');
        eventEntry.className = `scene-event-filter-event-entry${record.sceneEventMismatch ? ' mismatch' : ''}`;
        const visibility = document.createElement('input');
        visibility.type = 'checkbox';
        visibility.dataset.eventVisibility = record.id;
        visibility.checked = !this.hiddenBindingIds.has(record.id) && record.binding.enabled !== false;
        visibility.disabled = record.binding.enabled === false;
        visibility.setAttribute('aria-label', `显示空间 binding ${eventLabel(record)}`);
        visibility.title = record.binding.enabled === false
          ? '右侧“是否显示”已关闭；点击 binding 名称后可在属性栏重新启用'
          : '仅控制此空间 binding 在编辑器中的显示，不写入场景 JSON';
        const bindingButton = document.createElement('button');
        bindingButton.type = 'button';
        bindingButton.dataset.filterMode = 'binding';
        bindingButton.dataset.bindingId = record.id;
        bindingButton.className = `scene-event-filter-item binding${this.state.mode === 'binding' && this.state.selectedBindingId === record.id ? ' active' : ''}`;
        bindingButton.textContent = `空间 · ${eventLabel(record)}`;
        bindingButton.title = record.sceneEventMismatch
          ? `SceneEvent 外键不一致：binding=${record.binding.sceneEventId || '空'}，Trigger=${record.definition?.sceneEventId || '空'}`
          : `${record.binding.triggerId || '未绑定'} · ${record.definition?.when?.type || record.binding.event || '?'}`;
        eventEntry.append(visibility, bindingButton);
        scroll.appendChild(eventEntry);
      };

      const representedBindings = new Set();
      phase.triggers.forEach((trigger, triggerIndex) => {
        const triggerButton = document.createElement('button');
        triggerButton.type = 'button';
        triggerButton.dataset.filterMode = 'trigger';
        triggerButton.dataset.triggerId = trigger.id;
        triggerButton.className = `scene-event-filter-item trigger${this.state.mode === 'trigger' && this.state.selectedTriggerId === trigger.id ? ' active' : ''}`;
        const priority = Number(trigger.coordination?.priority) || 0;
        triggerButton.textContent = `T${triggerIndex + 1} · ${trigger.name || trigger.id} · do[${(trigger.do || []).length}]`;
        triggerButton.title = `Trigger ${trigger.id}\nwhen: ${trigger.when?.type || '?'}\n协调组: ${trigger.coordination?.group || '独立'}\npriority: ${priority}\n定义顺序: ${this.projectIndex.triggers.indexOf(trigger) + 1}\n双击打开定义`;
        scroll.appendChild(triggerButton);
        for (const record of phase.events.filter(item => item.definition?.id === trigger.id)) {
          representedBindings.add(record.id);
          appendBindingEntry(record);
        }
      });

      for (const record of phase.events) {
        if (!representedBindings.has(record.id)) appendBindingEntry(record);
      }

      phase.tutorials.forEach((tutorial, tutorialIndex) => {
        const tutorialButton = document.createElement('button');
        tutorialButton.type = 'button';
        tutorialButton.dataset.editorTarget = 'tutorials';
        tutorialButton.dataset.definitionId = tutorial.id;
        tutorialButton.className = 'scene-event-filter-item tutorial';
        const stepTexts = (tutorial.steps || []).map((step, index) => `${index + 1}. ${step.text || step.id || '未命名步骤'}`);
        tutorialButton.textContent = `教学${tutorialIndex + 1} · ${tutorial.title || tutorial.id} · ${stepTexts.length}步`;
        tutorialButton.title = `Tutorial ${tutorial.id}\n继承 ${phase.id} 顺序\n${stepTexts.join('\n') || '无步骤'}\n点击打开教学定义`;
        scroll.appendChild(tutorialButton);
      });
    }
    bar.appendChild(scroll);

    const related = document.createElement('label');
    related.className = 'scene-event-filter-related';
    related.innerHTML = `<input id="editor-event-filter-related" type="checkbox"${this.state.includeRelated ? ' checked' : ''}> 显示关联对象`;
    related.title = '显示 binding/action 明确引用的目标、组、NPC、敌人和刷怪对象；不会按对象自身 group 自动扩大';
    bar.appendChild(related);

    const total = this._allObjects().length;
    const visible = this.visibleObjects ? this.visibleObjects.size : total;
    const status = document.createElement('span');
    status.className = 'scene-event-filter-status';
    status.textContent = `${visible}/${total}`;
    status.title = '当前可见对象数 / 场景对象总数';
    if (this.dynamicTargets.length) {
      status.textContent += ` · 动态目标 ${this.dynamicTargets.length}`;
      status.title += `\n运行时动态目标或当前场景未找到：${this.dynamicTargets.join(', ')}`;
    }
    bar.appendChild(status);

    const dragTrack = document.createElement('div');
    dragTrack.className = 'scene-event-filter-drag-track';
    dragTrack.title = '拖动以横向浏览事件视图';
    const dragThumb = document.createElement('div');
    dragThumb.className = 'scene-event-filter-drag-thumb';
    dragTrack.appendChild(dragThumb);
    bar.appendChild(dragTrack);
    this._bindHorizontalDrag(scroll, dragTrack, dragThumb);
  }

  _bindHorizontalDrag(scroll, track, thumb) {
    const metrics = () => {
      const trackWidth = track.clientWidth;
      const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      const ratio = scroll.scrollWidth > 0 ? scroll.clientWidth / scroll.scrollWidth : 1;
      const thumbWidth = Math.min(trackWidth, Math.max(32, trackWidth * ratio));
      const travel = Math.max(0, trackWidth - thumbWidth);
      return { trackWidth, maxScroll, thumbWidth, travel };
    };
    const updateThumb = () => {
      const { maxScroll, thumbWidth, travel } = metrics();
      const offset = maxScroll > 0 ? (scroll.scrollLeft / maxScroll) * travel : 0;
      thumb.style.width = `${thumbWidth}px`;
      thumb.style.transform = `translateX(${offset}px)`;
      track.classList.toggle('disabled', maxScroll <= 0);
    };
    const scrollToPointer = clientX => {
      const rect = track.getBoundingClientRect();
      const { maxScroll, thumbWidth, travel } = metrics();
      if (maxScroll <= 0 || travel <= 0) return;
      const offset = Math.max(0, Math.min(travel, clientX - rect.left - thumbWidth / 2));
      scroll.scrollLeft = (offset / travel) * maxScroll;
    };

    const onScroll = () => {
      this._scrollLeft = scroll.scrollLeft;
      updateThumb();
    };
    scroll.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('pointerdown', event => {
      if (event.target === thumb || track.classList.contains('disabled')) return;
      event.preventDefault();
      scrollToPointer(event.clientX);
    });
    thumb.addEventListener('pointerdown', event => {
      if (track.classList.contains('disabled')) return;
      event.preventDefault();
      const startX = event.clientX;
      const startScroll = scroll.scrollLeft;
      const pointerId = event.pointerId;
      thumb.classList.add('dragging');
      thumb.setPointerCapture(pointerId);
      const onMove = moveEvent => {
        const { maxScroll, travel } = metrics();
        if (maxScroll > 0 && travel > 0) {
          scroll.scrollLeft = startScroll + ((moveEvent.clientX - startX) / travel) * maxScroll;
        }
      };
      const onEnd = () => {
        thumb.classList.remove('dragging');
        thumb.removeEventListener('pointermove', onMove);
        thumb.removeEventListener('pointerup', onEnd);
        thumb.removeEventListener('pointercancel', onEnd);
      };
      thumb.addEventListener('pointermove', onMove);
      thumb.addEventListener('pointerup', onEnd);
      thumb.addEventListener('pointercancel', onEnd);
    });
    const restoreScroll = () => {
      const { maxScroll } = metrics();
      scroll.scrollLeft = Math.max(0, Math.min(maxScroll, this._scrollLeft));
      this._scrollLeft = scroll.scrollLeft;
      updateThumb();
    };
    restoreScroll();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restoreScroll);
  }
}

export default SceneEditorEventFilter;
