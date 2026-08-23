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
    this.state = { mode: 'all', selectedPhaseId: '', selectedBindingId: '', includeRelated: false };
    this.events = [];
    this.phases = [];
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
    const currentIds = new Set(records.map(record => record.id));
    for (const id of this.hiddenBindingIds) {
      if (!currentIds.has(id)) this.hiddenBindingIds.delete(id);
    }
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
    // 单事件调试仍保留地貌上下文；只投影视觉层对象，不扩大其他逻辑层。
    if (this.state.mode === 'event') {
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
      const button = event.target.closest('button[data-filter-mode]');
      if (!button) return;
      if (button.dataset.filterMode === 'all') this.selectAll();
      else if (button.dataset.filterMode === 'phase') this.selectPhase(button.dataset.phaseId);
      else if (button.dataset.filterMode === 'event') this.selectEvent(button.dataset.bindingId);
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
    title.textContent = '事件视图';
    title.title = '阶段由 activeWhen 或首个动作域推导，仅影响编辑器视图，不写入场景 JSON';
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
      const phaseButton = document.createElement('button');
      phaseButton.type = 'button';
      phaseButton.dataset.filterMode = 'phase';
      phaseButton.dataset.phaseId = phase.id;
      phaseButton.className = `scene-event-filter-item phase${this.state.mode === 'phase' && this.state.selectedPhaseId === phase.id ? ' active' : ''}`;
      phaseButton.textContent = `阶段 ${phaseIndex + 1} · ${phase.label} (${phase.events.length})`;
      phaseButton.title = '编辑器推导阶段；按场景图层与对象顺序排列';
      scroll.appendChild(phaseButton);
      for (const record of phase.events) {
        const eventEntry = document.createElement('div');
        eventEntry.className = 'scene-event-filter-event-entry';
        const visibility = document.createElement('input');
        visibility.type = 'checkbox';
        visibility.dataset.eventVisibility = record.id;
        visibility.checked = !this.hiddenBindingIds.has(record.id) && record.binding.enabled !== false;
        visibility.disabled = record.binding.enabled === false;
        visibility.setAttribute('aria-label', `显示事件 ${eventLabel(record)}`);
        visibility.title = record.binding.enabled === false
          ? '右侧“是否显示”已关闭；点击事件名称后可在属性栏重新启用'
          : '仅控制此事件在编辑器中的显示，不写入场景 JSON';
        const eventButton = document.createElement('button');
        eventButton.type = 'button';
        eventButton.dataset.filterMode = 'event';
        eventButton.dataset.bindingId = record.id;
        eventButton.className = `scene-event-filter-item event${this.state.mode === 'event' && this.state.selectedBindingId === record.id ? ' active' : ''}`;
        eventButton.textContent = eventLabel(record);
        eventButton.title = `${record.binding.triggerId || '未绑定'} · ${record.definition?.when?.type || record.binding.event || '?'}`;
        eventEntry.append(visibility, eventButton);
        scroll.appendChild(eventEntry);
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
