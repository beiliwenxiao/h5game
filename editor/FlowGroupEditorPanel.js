import { normalizeLegacyCondition } from '../src/migration/SceneEventToFlowGroupMigrator.js';

const asList = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();

/**
 * FlowGroup 详情编辑器；只修改 project.flowGroups[]（兼容期内双写 sceneEvents）中当前定义。
 *
 * 兼容说明：本类是旧 SceneEventEditorPanel 的继任者。
 *   - 写入：双写 project.flowGroups 与 project.sceneEvents（同对象引用）
 *   - 读取：优先 flowGroups，回退 sceneEvents
 *   - control 字段：写入新字段默认值，activeWhen/completionWhen 归一化为 CompositeCondition
 */
export class FlowGroupEditorPanel {
  constructor(editor) {
    this.editor = editor;
  }

  // ========= 兼容别名 =========
  get definitions() {
    const p = this.editor.project;
    if (Array.isArray(p.flowGroups)) return p.flowGroups;
    if (Array.isArray(p.sceneEvents)) return p.sceneEvents;
    // 都没有：初始化 flowGroups（迁移起点）
    p.flowGroups = [];
    p.sceneEvents = p.flowGroups; // 同引用双写
    return p.flowGroups;
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

    const allDefs = this.definitions.filter(candidate => candidate !== definition)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    const dependencyIds = new Set(asList(definition?.dependsOn));
    const dependencyOptions = allDefs.map(candidate => (
      `<option value="${escape(candidate.id)}"${dependencyIds.has(candidate.id) ? ' selected' : ''}>${escape(`${Number(candidate.order || 0) + 1}. ${candidate.name || candidate.id}`)}</option>`
    )).join('');

    const control = definition?.control && typeof definition.control === 'object'
      ? definition.control
      : { autoActivate: true, autoComplete: true, repeatable: false, maxProgress: null, notifyProgressEvery: 10 };

    panel.innerHTML = `
      <div class="trg-definition-heading">
        <strong>🔶 FlowGroup 剧情流程</strong>
        <span>拖动左侧列表调整 order；Trigger/Tutorial 保存 flowGroupId（兼容 sceneEventId 回退）</span>
      </div>
      <div class="row"><label>ID</label><input type="text" id="d-fg-id" value="${escape(definition.id || '')}"></div>
      <div class="row"><label>名称</label><input type="text" id="d-fg-name" value="${escape(definition.name || '')}" placeholder="玩家可理解的剧情/章节名称"></div>
      <div class="row"><label>说明</label><textarea id="d-fg-description" placeholder="流程目标与边界">${escape(definition.description || '')}</textarea></div>
      <div class="row"><label>执行序号 order（从 0 开始；拖动后自动重排）</label><input type="number" min="0" step="1" id="d-fg-order" value="${Number.isInteger(definition.order) ? definition.order : 0}"></div>
      <div class="row"><label>所属场景（可多选）scope.sceneIds</label><select id="d-fg-scenes" multiple size="${Math.min(8, Math.max(3, scenes.size))}">${sceneOptions}</select></div>
      <div class="row"><label>前置 FlowGroup dependsOn（可多选；全部完成才解锁）</label><select id="d-fg-depends" multiple size="${Math.min(8, Math.max(3, allDefs.length))}">${dependencyOptions}</select></div>
      <fieldset>
        <legend>🚥 生命周期控制 control</legend>
        <div class="row">
          <label><input type="checkbox" id="d-fg-autoactivate" ${control.autoActivate !== false ? 'checked' : ''}> 激活条件满足时自动 pending→active（取消勾选需动作 activateFlowGroup）</label>
        </div>
        <div class="row">
          <label><input type="checkbox" id="d-fg-autocomplete" ${control.autoComplete !== false ? 'checked' : ''}> 完成条件满足时自动 active→completed（取消勾选需动作 completeFlowGroup）</label>
        </div>
        <div class="row">
          <label><input type="checkbox" id="d-fg-repeatable" ${control.repeatable === true ? 'checked' : ''}> completed 后允许重复进入</label>
        </div>
        <div class="row">
          <label>启用进度 maxProgress（留空=二进制完成）</label>
          <input type="number" min="0" step="1" id="d-fg-maxprogress" placeholder="如 100" value="${Number.isFinite(control.maxProgress) ? control.maxProgress : ''}">
        </div>
        <div class="row">
          <label>进度每 N% 触发一次 progress 事件</label>
          <input type="number" min="1" step="1" id="d-fg-notifyevery" value="${Number.isInteger(control.notifyProgressEvery) && control.notifyProgressEvery > 0 ? control.notifyProgressEvery : 10}">
        </div>
      </fieldset>
      <div class="row"><label>激活条件 activeWhen（dependsOn 全部满足后，此条件成立 → pending→active）<br><small>支持旧格式 <code>{blackboardKey,path,equals}</code>，保存时自动归一化为 CompositeCondition</small></label><textarea id="d-fg-active" placeholder='如 {"blackboardKey":"storyState","path":"s01Survival.awakened","equals":true}'>${definition.activeWhen ? escape(JSON.stringify(definition.activeWhen, null, 2)) : ''}</textarea></div>
      <div class="row"><label>完成条件 completionWhen（active 期间成立 → completed）</label><textarea id="d-fg-completion" placeholder='如 {"blackboardKey":"storyState","path":"s01Survival.fireLit","equals":true}'>${definition.completionWhen ? escape(JSON.stringify(definition.completionWhen, null, 2)) : ''}</textarea></div>
    `;

    this.editor._bindJsonValidation(panel.querySelector('#d-fg-active'), true);
    this.editor._bindJsonValidation(panel.querySelector('#d-fg-completion'), true);
    for (const selector of [
      '#d-fg-order', '#d-fg-scenes', '#d-fg-depends',
      '#d-fg-autoactivate', '#d-fg-autocomplete', '#d-fg-repeatable',
      '#d-fg-maxprogress', '#d-fg-notifyevery'
    ]) {
      panel.querySelector(selector)?.addEventListener('change', () => {
        this.commit(definition, panel);
        this.editor._renderList();
      });
    }
  }

  commit(definition, panel) {
    if (!definition || !panel?.querySelector('#d-fg-id')) return false;
    definition.id = text(panel.querySelector('#d-fg-id').value) || definition.id;
    definition.name = text(panel.querySelector('#d-fg-name').value) || definition.id;
    const description = text(panel.querySelector('#d-fg-description').value);
    if (description) definition.description = description;
    else delete definition.description;

    const order = Number(panel.querySelector('#d-fg-order').value);
    definition.order = Number.isInteger(order) && order >= 0 ? order : 0;
    const sceneIds = [...panel.querySelector('#d-fg-scenes').selectedOptions]
      .map(option => text(option.value)).filter(Boolean);
    definition.scope = { ...(definition.scope || {}), sceneIds: [...new Set(sceneIds)] };
    const dependsOn = [...panel.querySelector('#d-fg-depends').selectedOptions]
      .map(option => text(option.value)).filter(id => id && id !== definition.id);
    if (dependsOn.length) definition.dependsOn = [...new Set(dependsOn)];
    else delete definition.dependsOn;

    const maxProgressRaw = panel.querySelector('#d-fg-maxprogress').value;
    const maxProgress = Number.isFinite(Number(maxProgressRaw)) && String(maxProgressRaw).trim() !== ''
      ? Number(maxProgressRaw) : null;
    const notifyEveryRaw = Number(panel.querySelector('#d-fg-notifyevery').value);
    definition.control = {
      autoActivate: panel.querySelector('#d-fg-autoactivate').checked,
      autoComplete: panel.querySelector('#d-fg-autocomplete').checked,
      repeatable: panel.querySelector('#d-fg-repeatable').checked,
      maxProgress,
      notifyProgressEvery: Number.isInteger(notifyEveryRaw) && notifyEveryRaw > 0 ? notifyEveryRaw : 10
    };

    this._commitCondition(definition, 'activeWhen', panel.querySelector('#d-fg-active').value);
    this._commitCondition(definition, 'completionWhen', panel.querySelector('#d-fg-completion').value);

    // 双写：保证同一 project 中 sceneEvents 与 flowGroups 指向同一数组引用时两边同步
    const p = this.editor.project;
    if (Array.isArray(p.sceneEvents) && p.sceneEvents !== p.flowGroups) {
      // 不同数组的兼容情况，补齐同对象到 flowGroups 数组（若还没在）
      if (Array.isArray(p.flowGroups) && !p.flowGroups.includes(definition)) {
        p.flowGroups.push(definition);
      }
    }
    return true;
  }

  create(sceneId = '') {
    const definitions = this.definitions;
    const scopedSceneId = text(sceneId) || text(this.editor._getScenes()[0]?.id);
    const nextOrder = definitions.reduce((maximum, definition) => (
      Math.max(maximum, Number.isInteger(definition?.order) ? definition.order : -1)
    ), -1) + 1;
    return {
      id: this.editor._nextStableId('flowgroup', definitions),
      name: '新剧情分组',
      description: '',
      scope: { sceneIds: scopedSceneId ? [scopedSceneId] : [] },
      order: nextOrder,
      dependsOn: definitions.length ? [definitions[definitions.length - 1].id] : [],
      control: {
        autoActivate: true,
        autoComplete: true,
        repeatable: false,
        maxProgress: null,
        notifyProgressEvery: 10
      }
    };
  }

  validate(definitions, sceneIds) {
    const errors = [];
    const ids = new Set();
    const ordersByScene = new Map();
    for (const [index, definition] of asList(definitions).entries()) {
      const path = `flowGroups[${index}]`;
      const legacyPath = `sceneEvents[${index}]`;
      const id = text(definition?.id);
      if (!id) errors.push(`${path}.id 不能为空`);
      else if (ids.has(id)) errors.push(`${path}.id 重复: ${id}`);
      else ids.add(id);
      if (!text(definition?.name)) errors.push(`${path}.name 不能为空`);
      if (!Number.isInteger(definition?.order) || definition.order < 0) errors.push(`${path}.order 必须是非负整数`);
      const scoped = asList(definition?.scope?.sceneIds);
      if (!scoped.length) errors.push(`${path}.scope.sceneIds 至少选择一个场景`);
      for (const sId of scoped) {
        if (!sceneIds.has(sId)) errors.push(`${path}.scope.sceneIds 场景不存在: ${sId}`);
        const orders = ordersByScene.get(sId) || new Map();
        if (orders.has(definition.order)) errors.push(`${path}.order 与 ${orders.get(definition.order)} 在 ${sId} 中重复（参考 ${legacyPath} 同位置）`);
        else orders.set(definition.order, id);
        ordersByScene.set(sId, orders);
      }
    }
    for (const [index, definition] of asList(definitions).entries()) {
      for (const dependencyId of asList(definition?.dependsOn)) {
        if (dependencyId === definition.id || !ids.has(dependencyId)) {
          errors.push(`flowGroups[${index}].dependsOn 无效: ${dependencyId}`);
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
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      definition[field] = normalizeLegacyCondition(parsed);
    }
  }
}

/**
 * @deprecated 请使用 FlowGroupEditorPanel。SceneEvent 重命名为 FlowGroup；
 *             本类作为兼容别名，保留一个大版本后删除。
 */
export class SceneEventEditorPanel extends FlowGroupEditorPanel {
  constructor(editor) { super(editor); }
  // 兼容：旧代码仍调用 create(sceneId)，父类已支持；不改行为
}

export default FlowGroupEditorPanel;
