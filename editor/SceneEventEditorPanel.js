const asList = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();

/** SceneEvent 详情编辑器；只修改 project.sceneEvents[] 中当前定义。 */
export class SceneEventEditorPanel {
  constructor(editor) {
    this.editor = editor;
  }

  render(panel, definition) {
    const escape = value => this.editor._escapeHtml(value);
    const sceneIds = new Set(asList(definition?.scope?.sceneIds));
    const scenes = new Map();
    for (const scene of this.editor._getScenes()) {
      if (scene?.id) scenes.set(scene.id, scene.name || scene.id);
    }
    for (const sceneId of sceneIds) {
      if (!scenes.has(sceneId)) scenes.set(sceneId, `${sceneId}（旧引用）`);
    }
    const sceneOptions = [...scenes].map(([sceneId, name]) => (
      `<option value="${escape(sceneId)}"${sceneIds.has(sceneId) ? ' selected' : ''}>${escape(name)}</option>`
    )).join('');

    const dependencyIds = new Set(asList(definition?.dependsOn));
    const dependencyOptions = (this.editor.project.sceneEvents || [])
      .filter(candidate => candidate !== definition)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
      .map(candidate => (
        `<option value="${escape(candidate.id)}"${dependencyIds.has(candidate.id) ? ' selected' : ''}>${escape(`${Number(candidate.order || 0) + 1}. ${candidate.name || candidate.id}`)}</option>`
      )).join('');

    panel.innerHTML = `
      <div class="trg-definition-heading">
        <strong>SceneEvent 宏观流程</strong>
        <span>拖动左侧列表调整 order；Trigger/Tutorial 只保存 sceneEventId 外键</span>
      </div>
      <div class="row"><label>ID</label><input type="text" id="d-event-id" value="${escape(definition.id || '')}"></div>
      <div class="row"><label>名称</label><input type="text" id="d-event-name" value="${escape(definition.name || '')}" placeholder="玩家可理解的宏观事件名称"></div>
      <div class="row"><label>说明</label><textarea id="d-event-description" placeholder="事件目标与边界">${escape(definition.description || '')}</textarea></div>
      <div class="row"><label>执行序号 order（从 0 开始；拖动后自动重排）</label><input type="number" min="0" step="1" id="d-event-order" value="${Number.isInteger(definition.order) ? definition.order : 0}"></div>
      <div class="row"><label>所属场景（可多选）</label><select id="d-event-scenes" multiple size="${Math.min(8, Math.max(3, scenes.size))}">${sceneOptions}</select></div>
      <div class="row"><label>前置 SceneEvent dependsOn（可多选）</label><select id="d-event-depends" multiple size="${Math.min(8, Math.max(3, (this.editor.project.sceneEvents || []).length - 1))}">${dependencyOptions}</select></div>
      <div class="row"><label>激活条件 activeWhen（只读取既有领域事实）</label><textarea id="d-event-active" placeholder='如 {"blackboardKey":"storyState","path":"s01Survival.awakened","equals":true}'>${definition.activeWhen ? escape(JSON.stringify(definition.activeWhen, null, 2)) : ''}</textarea></div>
      <div class="row"><label>完成条件 completionWhen（只读取既有领域事实）</label><textarea id="d-event-completion" placeholder='如 {"blackboardKey":"storyState","path":"s01Survival.fireLit","equals":true}'>${definition.completionWhen ? escape(JSON.stringify(definition.completionWhen, null, 2)) : ''}</textarea></div>
    `;

    this.editor._bindJsonValidation(panel.querySelector('#d-event-active'), true);
    this.editor._bindJsonValidation(panel.querySelector('#d-event-completion'), true);
    for (const selector of ['#d-event-order', '#d-event-scenes', '#d-event-depends']) {
      panel.querySelector(selector)?.addEventListener('change', () => {
        this.commit(definition, panel);
        this.editor._renderList();
      });
    }
  }

  commit(definition, panel) {
    if (!definition || !panel?.querySelector('#d-event-id')) return false;
    definition.id = text(panel.querySelector('#d-event-id').value) || definition.id;
    definition.name = text(panel.querySelector('#d-event-name').value) || definition.id;
    const description = text(panel.querySelector('#d-event-description').value);
    if (description) definition.description = description;
    else delete definition.description;

    const order = Number(panel.querySelector('#d-event-order').value);
    definition.order = Number.isInteger(order) && order >= 0 ? order : 0;
    const sceneIds = [...panel.querySelector('#d-event-scenes').selectedOptions]
      .map(option => text(option.value)).filter(Boolean);
    definition.scope = { ...(definition.scope || {}), sceneIds: [...new Set(sceneIds)] };
    const dependsOn = [...panel.querySelector('#d-event-depends').selectedOptions]
      .map(option => text(option.value)).filter(id => id && id !== definition.id);
    if (dependsOn.length) definition.dependsOn = [...new Set(dependsOn)];
    else delete definition.dependsOn;

    this._commitCondition(definition, 'activeWhen', panel.querySelector('#d-event-active').value);
    this._commitCondition(definition, 'completionWhen', panel.querySelector('#d-event-completion').value);
    return true;
  }

  create(sceneId = '') {
    const definitions = this.editor.project.sceneEvents || [];
    const scopedSceneId = text(sceneId) || text(this.editor._getScenes()[0]?.id);
    const nextOrder = definitions.reduce((maximum, definition) => (
      Math.max(maximum, Number.isInteger(definition?.order) ? definition.order : -1)
    ), -1) + 1;
    return {
      id: this.editor._nextStableId('scene-event', definitions),
      name: '新场景事件',
      scope: { sceneIds: scopedSceneId ? [scopedSceneId] : [] },
      order: nextOrder,
      dependsOn: definitions.length ? [definitions[definitions.length - 1].id] : []
    };
  }

  validate(definitions, sceneIds) {
    const errors = [];
    const ids = new Set();
    const ordersByScene = new Map();
    for (const [index, definition] of asList(definitions).entries()) {
      const path = `sceneEvents[${index}]`;
      const id = text(definition?.id);
      if (!id) errors.push(`${path}.id 不能为空`);
      else if (ids.has(id)) errors.push(`${path}.id 重复: ${id}`);
      else ids.add(id);
      if (!text(definition?.name)) errors.push(`${path}.name 不能为空`);
      if (!Number.isInteger(definition?.order) || definition.order < 0) errors.push(`${path}.order 必须是非负整数`);
      const scoped = asList(definition?.scope?.sceneIds);
      if (!scoped.length) errors.push(`${path}.scope.sceneIds 至少选择一个场景`);
      for (const sceneId of scoped) {
        if (!sceneIds.has(sceneId)) errors.push(`${path}.scope.sceneIds 场景不存在: ${sceneId}`);
        const orders = ordersByScene.get(sceneId) || new Map();
        if (orders.has(definition.order)) errors.push(`${path}.order 与 ${orders.get(definition.order)} 在 ${sceneId} 中重复`);
        else orders.set(definition.order, id);
        ordersByScene.set(sceneId, orders);
      }
    }
    for (const [index, definition] of asList(definitions).entries()) {
      for (const dependencyId of asList(definition?.dependsOn)) {
        if (dependencyId === definition.id || !ids.has(dependencyId)) {
          errors.push(`sceneEvents[${index}].dependsOn 无效: ${dependencyId}`);
        }
      }
    }
    return errors;
  }

  _commitCondition(definition, field, source) {
    const value = text(source);
    if (!value) {
      delete definition[field];
      return;
    }
    const parsed = this.editor._parseJson(value, definition[field] || {});
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) definition[field] = parsed;
  }
}

export default SceneEventEditorPanel;
