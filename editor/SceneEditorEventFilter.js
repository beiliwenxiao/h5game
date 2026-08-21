/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import {
  normalizeSceneObjectSelector,
  resolveSceneObjects
} from '../src/core/scene/SceneObjectSelector.js';

const SELECTOR_MODES = ['id', 'group', 'tag', 'name', 'type', 'ref'];

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

export class SceneEditorEventFilter {
  constructor(editor) {
    this.editor = editor;
    this.state = { mode: 'all', selectedPhaseId: '', selectedBindingId: '', includeRelated: false };
    this.events = [];
    this.phases = [];
    this.visibleObjects = null;
    this.dynamicTargets = [];
    this._scrollLeft = 0;
    this._bound = false;
  }
  reset(sceneData = this.editor.sceneData) {
    this.sceneData = sceneData;
    this._scrollLeft = 0;
    this.state = { mode: 'all', selectedPhaseId: '', selectedBindingId: '', includeRelated: false };
    this.rebuild({ preserveSelection: false });
  }

  rebuild({ preserveSelection = true, notify = false } = {}) {
    this.sceneData = this.editor.sceneData;
    const previousPhase = preserveSelection ? this.state.selectedPhaseId : '';
    const previousBinding = preserveSelection ? this.state.selectedBindingId : '';
    const definitions = new Map((this.editor.getProjectTriggers?.() || [])
      .filter(Boolean).map(definition => [definition.id, definition]));
    const records = [];
    for (let layerIndex = 0; layerIndex < (this.sceneData?.layers || []).length; layerIndex++) {
      const layer = this.sceneData.layers[layerIndex];
      for (let objectIndex = 0; objectIndex < (layer.objects || []).length; objectIndex++) {
        const binding = layer.objects[objectIndex];
        if (binding?.type !== 'trigger') continue;
        const id = text(binding.id) || `binding-${layerIndex}-${objectIndex}`;
        records.push({ id, binding, definition: definitions.get(binding.triggerId) || null, layerIndex, objectIndex });
      }
    }
    this.events = records;
    this.phases = this._derivePhases(records);
    if (!records.some(record => record.id === previousBinding)) this.state.selectedBindingId = '';
    if (!this.phases.some(phase => phase.id === previousPhase)) this.state.selectedPhaseId = '';
    if (this.state.mode === 'event' && !this.state.selectedBindingId) this.state.mode = 'all';
    if (this.state.mode === 'phase' && !this.state.selectedPhaseId) this.state.mode = 'all';
    this._recomputeProjection();
    this.renderBar();
    if (notify) this._notifyViewChanged();
  }

  _derivePhases(records) {
    const phases = [];
    let current = null;
    for (const record of records) {
      const activeAnchor = conditionAnchor(record.binding.activeWhen);
      const firstAction = record.definition?.do?.[0];
      const actionName = text(firstAction?.action);
      const actionDomain = actionName ? actionName.split('.')[0] : '';
      const signature = activeAnchor || (actionDomain ? `动作 · ${actionDomain}` : '主流程');
      if (!current || current.signature !== signature) {
        current = { id: `phase-${phases.length + 1}`, label: signature, signature, events: [] };
        phases.push(current);
      }
      current.events.push(record);
      record.phaseId = current.id;
    }
    return phases;
  }

  getState() { return { ...this.state }; }
  getEvents() { return [...this.events]; }
  getPhases() { return this.phases.map(phase => ({ ...phase, events: [...phase.events] })); }
  isFiltering() { return this.state.mode !== 'all'; }
  isObjectVisible(object) { return !this.visibleObjects || this.visibleObjects.has(object); }
  filterObjects(objects = []) { return this.visibleObjects ? objects.filter(object => this.visibleObjects.has(object)) : [...objects]; }

  selectAll() {
    this.state.mode = 'all';
    this.state.selectedPhaseId = '';
    this.state.selectedBindingId = '';
    this._applySelection();
  }

  selectPhase(phaseId) {
    if (!this.phases.some(phase => phase.id === phaseId)) return;
    this.state.mode = 'phase';
    this.state.selectedPhaseId = phaseId;
    this.state.selectedBindingId = '';
    this._applySelection();
  }

  selectEvent(bindingId) {
    const record = this.events.find(event => event.id === bindingId);
    if (!record) return;
    this.state.mode = 'event';
    this.state.selectedBindingId = bindingId;
    this.state.selectedPhaseId = record.phaseId;
    this._applySelection();
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
    if (this.state.mode === 'event') {
      return this.events.filter(event => event.id === this.state.selectedBindingId);
    }
    if (this.state.mode === 'phase') {
      return this.events.filter(event => event.phaseId === this.state.selectedPhaseId);
    }
    return this.events;
  }

  _allObjects() {
    return (this.sceneData?.layers || []).flatMap(layer => layer.objects || []);
  }

  _recomputeProjection() {
    this.dynamicTargets = [];
    if (this.state.mode === 'all') {
      this.visibleObjects = null;
      return;
    }
    const selectedEvents = this._selectedEvents();
    const visible = new Set(selectedEvents.map(event => event.binding));
    if (this.state.includeRelated) this._resolveRelatedObjects(selectedEvents, visible);
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
      const button = event.target.closest('button[data-filter-mode]');
      if (!button) return;
      if (button.dataset.filterMode === 'all') this.selectAll();
      else if (button.dataset.filterMode === 'phase') this.selectPhase(button.dataset.phaseId);
      else if (button.dataset.filterMode === 'event') this.selectEvent(button.dataset.bindingId);
    });
    bar.addEventListener('change', event => {
      if (event.target.id === 'editor-event-filter-related') this.setIncludeRelated(event.target.checked);
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
    title.textContent = '事件视图';
    title.title = '阶段由 activeWhen 或首个动作域推导，仅影响编辑器视图，不写入场景 JSON';
    bar.appendChild(title);

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
      const phaseButton = document.createElement('button');
      phaseButton.type = 'button';
      phaseButton.dataset.filterMode = 'phase';
      phaseButton.dataset.phaseId = phase.id;
      phaseButton.className = `scene-event-filter-item phase${this.state.mode === 'phase' && this.state.selectedPhaseId === phase.id ? ' active' : ''}`;
      phaseButton.textContent = `阶段 ${phaseIndex + 1} · ${phase.label} (${phase.events.length})`;
      phaseButton.title = '编辑器推导阶段；按场景图层与对象顺序排列';
      scroll.appendChild(phaseButton);
      for (const record of phase.events) {
        const eventButton = document.createElement('button');
        eventButton.type = 'button';
        eventButton.dataset.filterMode = 'event';
        eventButton.dataset.bindingId = record.id;
        eventButton.className = `scene-event-filter-item event${this.state.mode === 'event' && this.state.selectedBindingId === record.id ? ' active' : ''}`;
        eventButton.textContent = eventLabel(record);
        eventButton.title = `${record.binding.triggerId || '未绑定'} · ${record.definition?.when?.type || record.binding.event || '?'}`;
        scroll.appendChild(eventButton);
      }
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
