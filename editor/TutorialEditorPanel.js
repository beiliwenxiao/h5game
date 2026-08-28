const asList = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();
const _resolveFgId = obj => {
  if (!obj) return '';
  const fromFg = text(obj.flowGroupId);
  return fromFg ? fromFg : text(obj.sceneEventId);
};

/** Tutorial 详情编辑器；宏观顺序继承 FlowGroup(SceneEvent)，只管理本定义与 steps[]。 */
export class TutorialEditorPanel {
  constructor(editor) {
    this.editor = editor;
  }

  render(panel, tutorial) {
    const escape = value => this.editor._escapeHtml(value);
    // FlowGroup 双读：flowGroups 优先，缺失时回退 sceneEvents（旧名）
    const flowGroupsRaw = [...(this.editor.project.flowGroups || []), ...(this.editor.project.flowGroups ? [] : (this.editor.project.sceneEvents || []))];
    const fgMap = new Map();
    flowGroupsRaw.forEach(fg => { if (fg?.id) fgMap.set(fg.id, fg); });
    const flowGroups = [...fgMap.values()].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    const tutorialFgId = _resolveFgId(tutorial);
    const eventOptions = flowGroups.map(fg => (
      `<option value="${escape(fg.id)}"${tutorialFgId === fg.id ? ' selected' : ''}>${escape(`${Number(fg.order || 0) + 1}. ${fg.name || fg.id}`)}</option>`
    )).join('');
    const selectedEvent = flowGroups.find(fg => fg.id === tutorialFgId);
    const scopedSceneIds = new Set(asList(tutorial.scope?.sceneIds));
    const scenes = new Map();
    for (const scene of this.editor._getScenes()) {
      if (scene?.id) scenes.set(scene.id, scene.name || scene.id);
    }
    for (const sceneId of scopedSceneIds) {
      if (!scenes.has(sceneId)) scenes.set(sceneId, `${sceneId}（旧引用）`);
    }
    const sceneOptions = [...scenes].map(([sceneId, name]) => (
      `<option value="${escape(sceneId)}"${scopedSceneIds.has(sceneId) ? ' selected' : ''}>${escape(name)}</option>`
    )).join('');
    const stepsHtml = asList(tutorial.steps).map((step, index) => this._renderStep(step, index)).join('');

    panel.innerHTML = `
      <div class="trg-definition-heading">
        <strong>Tutorial 教学表现</strong>
        <span>所属 FlowGroup(SceneEvent) ${escape(selectedEvent?.name || tutorialFgId || '未归属')} 只用于组织与静态排序；展示必须由事件 action 显式调用 tutorial.command(show, tutorialId)</span>
      </div>
      <div class="row"><label>ID</label><input type="text" id="d-tutorial-id" value="${escape(tutorial.id || '')}"></div>
      <div class="row"><label>标题</label><input type="text" id="d-tutorial-title" value="${escape(tutorial.title || '')}"></div>
      <div class="row"><label>说明</label><textarea id="d-tutorial-description">${escape(tutorial.description || '')}</textarea></div>
      <div class="row"><label>开场提示 beginText（教程弹出时展示，与步骤独立）</label><textarea id="d-tutorial-begin-text">${escape(tutorial.beginText || '')}</textarea></div>
      <div class="row"><label>收场提示 endText（教程完成时展示）</label><textarea id="d-tutorial-end-text">${escape(tutorial.endText || '')}</textarea></div>
      <div class="row"><label>所属 FlowGroup 剧情流程（旧名 SceneEvent，仅用于组织不自动展示）</label><select id="d-tutorial-event"><option value="">-- 选择 FlowGroup --</option>${eventOptions}</select></div>
      <div class="row"><label>场景 scope（必须属于 FlowGroup scope）</label><select id="d-tutorial-scenes" multiple size="${Math.min(7, Math.max(3, scenes.size))}">${sceneOptions}</select></div>
      <div class="row"><label>分类 category</label><input type="text" id="d-tutorial-category" value="${escape(tutorial.category || 'general')}"></div>
      <div class="row"><label>完成策略</label><select id="d-tutorial-policy">
        <option value="allSteps"${tutorial.completionPolicy === 'allSteps' ? ' selected' : ''}>完成全部步骤</option>
        <option value="signal"${tutorial.completionPolicy === 'signal' ? ' selected' : ''}>等待领域信号</option>
        <option value="manual"${tutorial.completionPolicy === 'manual' ? ' selected' : ''}>显式完成</option>
      </select></div>
      <div class="row trg-inline-options">
        <label><input type="checkbox" id="d-tutorial-pause"${tutorial.pauseGame === true ? ' checked' : ''}> 暂停游戏</label>
        <label><input type="checkbox" id="d-tutorial-skip"${tutorial.canSkip !== false ? ' checked' : ''}> 可跳过</label>
      </div>
      <div class="row"><label>展示入口</label><div class="do-result-semantics">只允许 Trigger 事件动作 <code>tutorial.command</code> 以 <code>operation: "show"</code> 和稳定 <code>tutorialId</code> 显式展示；场景加载、读档、帧更新和上一教程完成均不会自动弹出。</div></div>
      <div class="row"><label>同一 FlowGroup 内优先级 priority（高值先展示）</label><input type="number" id="d-tutorial-priority" value="${Number(tutorial.priority || 0)}"></div>
      <div class="row"><label>信号规则 signalRules（JSON 数组，可空）</label><textarea id="d-tutorial-signals">${tutorial.signalRules ? escape(JSON.stringify(tutorial.signalRules, null, 2)) : ''}</textarea></div>
      <div class="row"><label>移动规则 movementRule（JSON 对象，可空）</label><textarea id="d-tutorial-movement">${tutorial.movementRule ? escape(JSON.stringify(tutorial.movementRule, null, 2)) : ''}</textarea></div>
      <div class="row">
        <label>教学步骤 steps[]（严格按此顺序）</label>
        <div id="d-tutorial-steps">${stepsHtml || '<div class="trg-empty compact">暂无教学步骤</div>'}</div>
        <button type="button" class="trg-mini" id="d-add-tutorial-step">+ 添加步骤</button>
      </div>
    `;

    this.editor._bindJsonValidation(panel.querySelector('#d-tutorial-signals'), true);
    this.editor._bindJsonValidation(panel.querySelector('#d-tutorial-movement'), true);
    this._bindSteps(panel, tutorial);
    panel.querySelector('#d-add-tutorial-step')?.addEventListener('click', () => {
      this.commit(tutorial, panel);
      tutorial.steps = asList(tutorial.steps);
      tutorial.steps.push({
        id: this.editor._nextStableId(`${tutorial.id || 'tutorial'}-step`, tutorial.steps),
        text: '新教学步骤'
      });
      this.render(panel, tutorial);
    });
    panel.querySelector('#d-tutorial-event')?.addEventListener('change', event => {
      const fgId = text(event.target.value);
      this.commit(tutorial, panel);
      // 双写保证兼容
      tutorial.flowGroupId = fgId;
      tutorial.sceneEventId = fgId;
      const flowGroup = flowGroups.find(candidate => candidate.id === fgId);
      if (flowGroup) tutorial.scope = { ...(tutorial.scope || {}), sceneIds: [...asList(flowGroup.scope?.sceneIds)] };
      this.editor._renderList();
      this.render(panel, tutorial);
    });
  }

  commit(tutorial, panel) {
    if (!tutorial || !panel?.querySelector('#d-tutorial-id')) return false;
    tutorial.id = text(panel.querySelector('#d-tutorial-id').value) || tutorial.id;
    tutorial.title = text(panel.querySelector('#d-tutorial-title').value) || tutorial.id;
    const description = text(panel.querySelector('#d-tutorial-description').value);
    if (description) tutorial.description = description;
    else delete tutorial.description;
    tutorial.beginText = text(panel.querySelector('#d-tutorial-begin-text').value) || tutorial.beginText || undefined;
    if (!tutorial.beginText) delete tutorial.beginText;
    tutorial.endText = text(panel.querySelector('#d-tutorial-end-text').value) || tutorial.endText || undefined;
    if (!tutorial.endText) delete tutorial.endText;
    // 双写保证兼容
    const fgId = text(panel.querySelector('#d-tutorial-event').value);
    tutorial.flowGroupId = fgId;
    tutorial.sceneEventId = fgId;
    tutorial.category = text(panel.querySelector('#d-tutorial-category').value) || 'general';
    tutorial.completionPolicy = panel.querySelector('#d-tutorial-policy').value || 'allSteps';
    tutorial.pauseGame = panel.querySelector('#d-tutorial-pause').checked;
    tutorial.canSkip = panel.querySelector('#d-tutorial-skip').checked;
    tutorial.autoTrigger = false;
    tutorial.autoAdvance = false;
    tutorial.priority = Number(panel.querySelector('#d-tutorial-priority').value) || 0;
    const sceneIds = [...panel.querySelector('#d-tutorial-scenes').selectedOptions]
      .map(option => text(option.value)).filter(Boolean);
    if (sceneIds.length) tutorial.scope = { ...(tutorial.scope || {}), sceneIds: [...new Set(sceneIds)] };
    else delete tutorial.scope;
    this._commitJson(tutorial, 'signalRules', panel.querySelector('#d-tutorial-signals').value, []);
    this._commitJson(tutorial, 'movementRule', panel.querySelector('#d-tutorial-movement').value, {});

    const previousSteps = asList(tutorial.steps);
    tutorial.steps = [...panel.querySelectorAll('.trg-tutorial-step')].map((element, index) => {
      const previous = previousSteps[index] || {};
      const next = {
        ...previous,
        id: text(element.querySelector('.tutorial-step-id').value) || previous.id,
        text: text(element.querySelector('.tutorial-step-text').value) || previous.text || '教学步骤'
      };
      this._assignOptional(next, 'image', element.querySelector('.tutorial-step-image').value);
      this._assignOptional(next, 'target', element.querySelector('.tutorial-step-target').value);
      this._assignOptional(next, 'position', element.querySelector('.tutorial-step-position').value);
      this._assignOptional(next, 'arrow', element.querySelector('.tutorial-step-arrow').value);
      next.highlightTarget = element.querySelector('.tutorial-step-highlight').checked;
      return next;
    });
    return true;
  }

  create(preferredFlowGroupId = '') {
    const tutorials = this.editor.project.tutorials || [];
    // FlowGroup 双读：flowGroups 优先，缺失时回退 sceneEvents（旧名）
    const flowGroups = [...(this.editor.project.flowGroups || []), ...(this.editor.project.flowGroups ? [] : (this.editor.project.sceneEvents || []))];
    const sceneEvent = flowGroups.find(candidate => candidate.id === preferredFlowGroupId)
      || flowGroups[0];
    const id = this.editor._nextStableId('tutorial', tutorials);
    const fgId = sceneEvent?.id || '';
    return {
      id,
      title: '新教学',
      description: '',
      beginText: '',
      endText: '',
      category: 'general',
      flowGroupId: fgId,
      sceneEventId: fgId,
      scope: { sceneIds: [...asList(sceneEvent?.scope?.sceneIds)] },
      steps: [{ id: `${id}-step-001`, text: '提示文本' }],
      completionPolicy: 'allSteps',
      pauseGame: false,
      canSkip: true,
      autoTrigger: false,
      autoAdvance: false,
      priority: 0
    };
  }

  validate(tutorials, eventIds) {
    const errors = [];
    const ids = new Set();
    asList(tutorials).forEach((tutorial, index) => {
      const path = `tutorials[${index}]`;
      const id = text(tutorial?.id);
      if (!id) errors.push(`${path}.id 不能为空`);
      else if (ids.has(id)) errors.push(`${path}.id 重复: ${id}`);
      else ids.add(id);
      if (!text(tutorial?.title)) errors.push(`${path}.title 不能为空`);
      const fgId = _resolveFgId(tutorial);
      if (fgId && !eventIds.has(fgId)) errors.push(`${path}.flowGroupId(sceneEventId) 未登记: ${fgId}`);
      if (tutorial?.autoTrigger === true) errors.push(`${path}.autoTrigger 不允许自动触发，请使用事件 action 显式展示`);
      if (tutorial?.autoAdvance === true) errors.push(`${path}.autoAdvance 不允许自动推进，请由下一事件显式展示`);
      if (!asList(tutorial?.steps).length) errors.push(`${path}.steps 至少需要一个步骤`);
      asList(tutorial?.steps).forEach((step, stepIndex) => {
        if (!text(step?.text)) errors.push(`${path}.steps[${stepIndex}].text 不能为空`);
      });
    });
    return errors;
  }

  _renderStep(step, index) {
    const escape = value => this.editor._escapeHtml(value);
    return `
      <div class="trg-tutorial-step" data-step-index="${index}">
        <div class="do-head">
          <button type="button" class="tutorial-step-drag do-drag-handle" draggable="true" title="拖动调整教学步骤顺序">↕</button>
          <strong>步骤 ${index + 1}</strong>
          <button type="button" class="trg-mini tutorial-step-delete">删</button>
        </div>
        <div class="tutorial-step-grid">
          <label>稳定 ID<input class="tutorial-step-id" value="${escape(step.id || '')}"></label>
          <label>位置<input class="tutorial-step-position" value="${escape(step.position || '')}" placeholder="center/top/bottom"></label>
          <label class="wide">教学文本<textarea class="tutorial-step-text">${escape(step.text || '')}</textarea></label>
          <label>图片 ID<input class="tutorial-step-image" value="${escape(step.image || '')}"></label>
          <label>目标<input class="tutorial-step-target" value="${escape(step.target || '')}"></label>
          <label>箭头<input class="tutorial-step-arrow" value="${escape(step.arrow || '')}"></label>
          <label class="check"><input type="checkbox" class="tutorial-step-highlight"${step.highlightTarget ? ' checked' : ''}> 高亮目标</label>
        </div>
      </div>`;
  }

  _bindSteps(panel, tutorial) {
    let draggedIndex = null;
    const clear = () => panel.querySelectorAll('.trg-tutorial-step').forEach(element => {
      element.classList.remove('drop-before', 'drop-after', 'dragging');
      delete element.dataset.dropPosition;
    });
    panel.querySelectorAll('.trg-tutorial-step').forEach(element => {
      const handle = element.querySelector('.tutorial-step-drag');
      handle.addEventListener('dragstart', event => {
        this.commit(tutorial, panel);
        draggedIndex = Number(element.dataset.stepIndex);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(draggedIndex));
        requestAnimationFrame(() => element.classList.add('dragging'));
      });
      element.addEventListener('dragover', event => {
        const targetIndex = Number(element.dataset.stepIndex);
        if (!Number.isInteger(draggedIndex) || draggedIndex === targetIndex) return;
        event.preventDefault();
        const placeAfter = event.clientY >= element.getBoundingClientRect().top + element.offsetHeight / 2;
        clear();
        element.dataset.dropPosition = placeAfter ? 'after' : 'before';
        element.classList.add(placeAfter ? 'drop-after' : 'drop-before');
      });
      element.addEventListener('drop', event => {
        event.preventDefault();
        const targetIndex = Number(element.dataset.stepIndex);
        const placeAfter = element.dataset.dropPosition === 'after';
        const fromIndex = draggedIndex;
        draggedIndex = null;
        clear();
        this._moveStep(tutorial, fromIndex, targetIndex, placeAfter);
        this.render(panel, tutorial);
      });
      handle.addEventListener('dragend', () => { draggedIndex = null; clear(); });
      element.querySelector('.tutorial-step-delete').addEventListener('click', () => {
        this.commit(tutorial, panel);
        tutorial.steps.splice(Number(element.dataset.stepIndex), 1);
        this.render(panel, tutorial);
      });
    });
  }

  _moveStep(tutorial, fromIndex, targetIndex, placeAfter) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(targetIndex) || fromIndex === targetIndex) return false;
    const steps = asList(tutorial.steps);
    if (!steps[fromIndex] || !steps[targetIndex]) return false;
    const [step] = steps.splice(fromIndex, 1);
    let insertionIndex = targetIndex + (placeAfter ? 1 : 0);
    if (fromIndex < insertionIndex) insertionIndex -= 1;
    steps.splice(insertionIndex, 0, step);
    tutorial.steps = steps;
    this.editor._status(`已调整 ${tutorial.title || tutorial.id} 的 steps[] 顺序，请保存到工程`, 'ok');
    return true;
  }

  _assignOptional(owner, field, value) {
    const normalized = text(value);
    if (normalized) owner[field] = normalized;
    else delete owner[field];
  }

  _commitJson(owner, field, source, emptyFallback) {
    const value = text(source);
    if (!value) {
      delete owner[field];
      return;
    }
    const parsed = this.editor._parseJson(value, owner[field] ?? emptyFallback);
    owner[field] = parsed;
  }
}

export default TutorialEditorPanel;
