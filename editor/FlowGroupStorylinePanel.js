/**
 * FlowGroupStorylinePanel - 剧情线总览视图（方案 A）。
 *
 * 以 FlowGroup 为主视角的策划总览：每个剧情组一张卡片，直观展示
 * 「开始条件 / 结束条件 / 组内成员（Trigger/Tutorial/Dialogue）」。
 * 支持把未分组成员指派到组（写入 flowGroupId，双轨兼容 sceneEventId）。
 *
 * 只读展示 + 成员归属调整；定义细节编辑仍走各自的 Tab / 编辑器。
 */

import { InputHints } from '../src/core/input/InputHints.js';

const asList = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();
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
const mergeFlowGroups = (project = {}) => {
  const map = new Map();
  [...(Array.isArray(project.sceneEvents) ? project.sceneEvents : []),
   ...(Array.isArray(project.flowGroups) ? project.flowGroups : [])].forEach(fg => {
    if (fg?.id) map.set(fg.id, fg);
  });
  return [...map.values()].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
};

/** 条件摘要：CompositeCondition / 旧格式叶子 → 一行可读文本。 */
function conditionSummary(condition) {
  if (!condition || typeof condition !== 'object') return '（无条件，立即可用）';
  if (Array.isArray(condition.children) && condition.operator) {
    const op = condition.operator === 'OR' ? ' 或 ' : ' 且 ';
    const parts = condition.children.map(child => conditionSummary(
      child?.config ? { blackboardKey: child.config.blackboardKey, path: child.config.path, equals: child.config.value }
        : child
    ));
    return parts.join(op);
  }
  const key = [text(condition.blackboardKey), text(condition.path)].filter(Boolean).join('.') || '变量';
  const value = JSON.stringify(condition.value ?? condition.equals);
  const operator = text(condition.operator) || (condition.equals !== undefined ? '=' : '存在');
  return `${key} ${operator} ${value}`;
}

export class FlowGroupStorylinePanel {
  /** @param {TriggerEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.expanded = new Set(); // 展开的组 id
  }

  render(panel) {
    const project = this.editor.project || {};
    const groups = mergeFlowGroups(project);
    const groupIds = new Set(groups.map(group => group.id));
    const members = this._collectMembers(project, groupIds);
    if (!groups.length) {
      panel.innerHTML = '<div style="padding:24px;color:#8a93a8;">暂无 FlowGroup。先在「FlowGroup 剧情流程」Tab 创建剧情组。</div>';
      return;
    }
    // 默认全部展开
    for (const group of groups) if (!this.expanded.size || true) this.expanded.add(group.id);
    this._injectButtonHelpStyles();
    panel.innerHTML = this._toolbarHtml()
      + groups.map(group => this._renderGroup(group, members)).join('')
      + this._renderUnassigned(project, groupIds);
    this._bindEvents(panel, groups, groupIds);
  }

  /** 从 InputHints 汇总全部可用动作写法（{动作} 完整短语 / {key:动作} 仅按键名）。 */
  _buttonReferenceRows() {
    const escape = value => this.editor._escapeHtml(value);
    return Object.entries(InputHints.getActions()).map(([name, def]) => {
      const pc = def?.pc || {};
      let pcText;
      try { pcText = InputHints.phrase(name) || pc.key || name; }
      catch (e) { pcText = (pc.kind === 'raw' ? '点击' : '按 ') + (pc.key || name); }
      return {
        name,
        tokens: `{${name}}　{key:${name}}`,
        pc: escape(pcText),
        android: escape(def?.android || '—'),
        pad: escape(def?.padKey || def?.padFixed || '—')
      };
    });
  }

  /** 顶部工具栏：提供「按钮写法」帮助入口。 */
  _toolbarHtml() {
    return `
      <div class="story-toolbar">
        <strong class="story-toolbar-title">剧情线总览</strong>
        <button type="button" class="story-btn-help" data-btn-help>⌨ 按钮写法</button>
      </div>`;
  }

  /** 「按钮写法」全局弹层内容（不含外层 overlay 容器）。 */
  _buttonHelpModalBody() {
    const escape = value => this.editor._escapeHtml(value);
    const rows = this._buttonReferenceRows();
    const body = rows.length
      ? `<div class="story-help-row story-help-head">
            <span>写法（可直接拷贝）</span><span>键鼠</span><span>触屏</span><span>手柄</span>
          </div>`
        + rows.map(row => `
          <div class="story-help-row">
            <code class="story-help-tokens" title="点击拷贝">${escape(row.tokens)}</code>
            <span>${row.pc}</span><span>${row.android}</span><span>${row.pad}</span>
          </div>`).join('')
      : '<div class="story-help-body"><div class="story-empty">（暂无动作定义）</div></div>';
    return `
      <div class="story-btn-help-modal">
        <div class="story-btn-help-head">
          <strong>⌨ 按钮写法（文本模板占位符）</strong>
          <span class="story-btn-help-sub">用于教程 beginText/endText 或对话正文，运行时自动替换成当前设备的按键/控件名</span>
          <button type="button" class="story-btn-help-close" title="关闭">✕</button>
        </div>
        <div class="story-help-note">
          两种写法：<code>{动作名}</code> 显示完整操作短语（如 <code>{attack}</code> → 点击鼠标左键）；<code>{key:动作名}</code> 只插入按键/控件名（如 <code>{key:attack}</code> → 鼠标左键）。
          点击下方任一写法即可拷贝。
        </div>
        <div class="story-help-body">${body}</div>
      </div>`;
  }

  /** 提示文案配置文件基目录（与 UIEditor 同规则：example/<gameId>/config/）。 */
  _configBase() {
    if (this.editor?.gameId) return `example/${this.editor.gameId}/config/`;
    const path = String(this.editor?.projectPath || '');
    const index = path.lastIndexOf('/');
    const dir = index >= 0 ? path.slice(0, index) : '';
    return dir ? `${dir}/config/` : 'config/';
  }

  /** 合并项目已保存的提示文案覆盖（config/InputHints.json），与 UIEditor「提示文案」读取同一文件。 */
  async _ensureInputHintsConfig() {
    if (this._hintsConfigLoaded) return;
    this._hintsConfigLoaded = true;
    try {
      const file = this._configBase() + 'InputHints.json';
      const res = await fetch('/api/read-file?path=' + encodeURIComponent(file));
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.ok || !data.content) return;
      const parsed = JSON.parse(data.content);
      InputHints.merge(parsed && parsed.actions ? parsed.actions : parsed);
    } catch (e) {
      // 无覆盖文件或环境不支持读取时，沿用内部默认表（与 UIEditor 行为一致）
    }
  }

  /** 打开全局「按钮写法」弹层（挂在 body，任一切换页可用）。 */
  async openButtonHelp() {
    await this._ensureInputHintsConfig();
    this._injectButtonHelpStyles();
    if (this._buttonHelpOverlay) {
      this._buttonHelpOverlay.remove();
      this._buttonHelpOverlay = null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'story-btn-help-overlay';
    overlay.innerHTML = this._buttonHelpModalBody();
    document.body.appendChild(overlay);
    this._buttonHelpOverlay = overlay;
    const close = () => {
      overlay.remove();
      if (this._buttonHelpOverlay === overlay) this._buttonHelpOverlay = null;
    };
    overlay.querySelector('.story-btn-help-close').addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    for (const el of overlay.querySelectorAll('.story-help-tokens')) {
      el.addEventListener('click', () => {
        try { navigator.clipboard?.writeText?.(el.textContent || ''); } catch (e) { /* 忽略剪贴板拒绝 */ }
        this.editor._status?.(`已拷贝写法：${el.textContent}`.replace(/　/g, '，'), 'ok');
      });
    }
  }

  _injectButtonHelpStyles() {
    if (document.getElementById('story-btn-help-styles')) return;
    const style = document.createElement('style');
    style.id = 'story-btn-help-styles';
    style.textContent = `
      .story-toolbar{display:flex;align-items:center;gap:12px;padding:0 4px;margin:0 0 10px;}
      .story-toolbar-title{font-size:15px;color:#e6ecf7;}
      .story-btn-help{background:#3a4a7e;border:none;color:#fff;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:12px;}
      .story-btn-help:hover{background:#4a5d9e;}
      .story-btn-help-overlay{position:fixed;inset:0;background:rgba(5,10,25,.72);z-index:10000;display:flex;align-items:center;justify-content:center;}
      .story-btn-help-overlay[hidden]{display:none;}
      .story-btn-help-modal{width:min(720px,92vw);max-height:86vh;display:flex;flex-direction:column;background:#0d1326;color:#e6ecf7;border:1px solid #2a3a5e;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.55);overflow:hidden;font-size:13px;}
      .story-btn-help-head{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#101a30;border-bottom:1px solid #2a3a5e;}
      .story-btn-help-sub{color:#8aa;font-size:11px;}
      .story-btn-help-close{margin-left:auto;background:#3a4a7e;border:none;color:#fff;border-radius:4px;padding:4px 10px;cursor:pointer;}
      .story-help-note{padding:10px 16px;color:#93a8cc;font-size:12px;background:#16213e;border-bottom:1px solid #2a3a5e;}
      .story-help-note code{background:#26304e;color:#7a9bd8;border-radius:3px;padding:1px 5px;}
      .story-help-body{flex:1;overflow:auto;padding:8px 16px 16px;}
      .story-help-row{display:grid;grid-template-columns:minmax(160px,1.4fr) 1fr 1fr 1fr;gap:8px;align-items:center;padding:5px 4px;border-bottom:1px dotted #1e2b47;font-size:12px;color:#aebce0;}
      .story-help-row.story-help-head{color:#8a93a8;font-size:11px;position:sticky;top:0;background:#0d1326;}
      .story-help-tokens{color:#7ad;cursor:pointer;white-space:nowrap;}
      .story-help-tokens:hover{color:#fff;}
    `;
    document.head.appendChild(style);
  }

  /** 汇总三类成员并按组归类。 */
  _collectMembers(project, groupIds) {
    const byGroup = new Map();
    const push = (fgId, item) => {
      if (!byGroup.has(fgId)) byGroup.set(fgId, []);
      byGroup.get(fgId).push(item);
    };
    for (const trigger of asList(project.triggers)) {
      const fgId = resolveFgId(trigger);
      if (fgId && groupIds.has(fgId)) push(fgId, { type: 'trigger', id: trigger.id, def: trigger });
    }
    for (const tutorial of asList(project.tutorials)) {
      const fgId = resolveFgId(tutorial);
      if (fgId && groupIds.has(fgId)) push(fgId, { type: 'tutorial', id: tutorial.id, def: tutorial });
    }
    for (const dialogue of asList(project.dialogues)) {
      const fgId = resolveFgId(dialogue);
      if (fgId && groupIds.has(fgId)) push(fgId, { type: 'dialogue', id: dialogue.id, def: dialogue });
    }
    return byGroup;
  }

  _renderGroup(group, members) {
    const control = group.control || {};
    const deps = asList(group.dependsOn);
    const start = [
      deps.length ? `前置：${deps.map(dep => text(dep)).join('、')} 全部完成` : '无前置依赖',
      `激活条件：${conditionSummary(group.activeWhen)}`,
      `所属场景：${asList(group.scope?.sceneIds).join('、') || '不限'}`,
      control.autoActivate === false ? '⚠ 需动作 activateFlowGroup 手动激活' : '条件满足自动激活'
    ];
    const end = [
      `完成条件：${conditionSummary(group.completionWhen)}`,
      Number.isFinite(control.maxProgress) ? `进度完成：成员成功 ${control.maxProgress} 次` : '无进度线（二进制完成）',
      control.autoComplete === false ? '⚠ 需动作 completeFlowGroup 手动完成' : '条件满足自动完成',
      control.repeatable === true ? '✅ 可重复（完成后条件失效自动重开）' : '一次性'
    ];
    const groupMembers = members.get(group.id) || [];
    return `
      <div class="story-card" data-group="${this._escape(group.id)}">
        <div class="story-head">
          <strong>${Number(group.order || 0) + 1}. ${this._escape(group.name || group.id)}</strong>
          <span class="story-id">${this._escape(group.id)}</span>
          <span class="story-count">${groupMembers.length} 成员</span>
        </div>
        <div class="story-cond">
          <div class="story-cond-col"><div class="story-cond-title">▶ 开始条件</div>${start.map(line => `<div>${this._escape(line)}</div>`).join('')}</div>
          <div class="story-cond-col"><div class="story-cond-title">🏁 结束条件</div>${end.map(line => `<div>${this._escape(line)}</div>`).join('')}</div>
        </div>
        <div class="story-members">
          <div class="story-cond-title">👥 组内成员（按 ${groupMembers.length} 项展示）</div>
          ${groupMembers.length ? groupMembers.map(member => this._renderMember(member, false)).join('')
            : '<div class="story-empty">（暂无成员，在下方「未分组成员」中指派）</div>'}
        </div>
      </div>
    `;
  }

  _renderMember(member, withAssign) {
    const escape = value => this.editor._escapeHtml(value);
    const typeMeta = { trigger: '⚡', tutorial: '🎓', dialogue: '💬' };
    const typeLabel = { trigger: '触发器', tutorial: '教程', dialogue: '对话' }[member.type];
    const summary = member.type === 'trigger'
      ? `触发时机：${this._escape(text(member.def?.when?.type) || text(member.def?.when) || '?')} · ${asList(member.def?.do).length} 个动作`
      : member.type === 'tutorial'
        ? `${asList(member.def?.steps).length} 个步骤${text(member.def?.beginText) ? ' · 有开场提示' : ''}${text(member.def?.endText) ? ' · 有收场提示' : ''}`
        : `标题：${this._escape(text(member.def?.title) || '-')}`;
    const jumpTarget = member.type === 'trigger' ? 'triggers' : 'tutorials';
    const orchestration = member.type === 'tutorial'
      ? this._renderTutorialPrompts(member, escape)
      : member.type === 'trigger'
        ? this._renderTriggerOrchToggle(member, escape)
        : '';
    return `
      <div class="story-member">
        <div class="story-member-main">
          <span class="story-type">${typeMeta[member.type]} ${typeLabel}</span>
          <span class="story-member-id">${this._escape(member.id)}</span>
          <small>${summary}</small>
          ${withAssign
            ? `<select class="story-assign" data-member-type="${member.type}" data-member-id="${this._escape(member.id)}"></select>`
            : (member.type !== 'dialogue'
              ? `<button class="story-jump" data-jump-target="${jumpTarget}" data-jump-id="${this._escape(member.id)}">编辑 →</button>`
              : '<small style="color:#5a6a8a;">在对话编辑器中编辑</small>')}
        </div>
        ${orchestration}
      </div>
    `;
  }

  /** 教程成员：内联编辑开场/收场提示（写回工程，点击保存生效）。 */
  _renderTutorialPrompts(member, escape) {
    return `
      <div class="story-detail story-detail-fields">
        <label class="story-prompt"><span>开场提示 beginText</span><input class="story-begin" data-tutorial="${escape(member.id)}" value="${escape(text(member.def?.beginText))}" placeholder="（可选）"></label>
        <label class="story-prompt"><span>收场提示 endText</span><input class="story-end" data-tutorial="${escape(member.id)}" value="${escape(text(member.def?.endText))}" placeholder="（可选）"></label>
      </div>`;
  }

  /** 触发器成员：动作编排开关，展开后可调整教程/对话的出现/消失位置。 */
  _renderTriggerOrchToggle(member, escape) {
    return `
      <button type="button" class="story-orch-toggle" data-trigger="${escape(member.id)}">⚙ 动作编排（调整教程/对话出现·消失位置）</button>
      <div class="story-orch" data-orch="${escape(member.id)}" hidden></div>`;
  }

  _renderUnassigned(project, groupIds) {
    const unassigned = [];
    for (const trigger of asList(project.triggers)) {
      if (!resolveFgId(trigger)) unassigned.push({ type: 'trigger', id: trigger.id, def: trigger });
    }
    for (const tutorial of asList(project.tutorials)) {
      if (!resolveFgId(tutorial)) unassigned.push({ type: 'tutorial', id: tutorial.id, def: tutorial });
    }
    for (const dialogue of asList(project.dialogues)) {
      if (!resolveFgId(dialogue)) unassigned.push({ type: 'dialogue', id: dialogue.id, def: dialogue });
    }
    if (!unassigned.length && groupIds.size) return '';
    return `
      <div class="story-card story-unassigned">
        <div class="story-head"><strong>🧩 未分组成员</strong><span class="story-count">${unassigned.length} 项不受任何剧情组管控</span></div>
        <div class="story-members">
          ${unassigned.length ? unassigned.map(member => this._renderMember(member, true)).join('')
            : '<div class="story-empty">（全部成员均已归属剧情组）</div>'}
        </div>
      </div>
    `;
  }

  /** 渲染（或刷新）单个触发器"动作编排"块：按 do[] 顺序展示出现/消失动作，可上移/下移/切换目标/追加。 */
  _renderTriggerOrch(block, trigger) {
    const escape = value => this.editor._escapeHtml(value);
    if (!trigger) return;
    const steps = asList(trigger.do);
    const targetOptions = this._tutorialOptions(trigger);
    if (!steps.length) {
      block.innerHTML = '<div class="story-orch-empty">（此触发器没有动作；下方可添加一个"显示教程"动作）</div>'
        + `<div class="story-orch-actions"><button type="button" class="story-orch-add" data-trigger="${escape(trigger.id)}">+ 追加「显示教程」动作</button></div>`;
      return;
    }
    block.innerHTML = `
      <div class="story-orch-head">动作顺序 = 出现/消失时机（上↑下↓换序）</div>
      ${steps.map((step, index) => this._renderOrchStep(step, index, trigger.id, targetOptions)).join('')}
      <div class="story-orch-actions"><button type="button" class="story-orch-add" data-trigger="${escape(trigger.id)}">+ 追加「显示教程」动作</button></div>
    `;
    this._bindOrchBlock(block, trigger, steps);
  }

  _renderOrchStep(step, index, triggerId, targetOptions) {
    const escape = value => this.editor._escapeHtml(value);
    const action = text(step?.action);
    const isTutorial = action === 'tutorial.command';
    const op = isTutorial ? text(step?.params?.operation) : '';
    const targetId = isTutorial ? text(step?.params?.tutorialId) : '';
    const opLabel = { show: '🎓 显示教程', complete: '✓ 完成教程', showStep: '🎓 显示教程步骤' }[op] || (isTutorial ? `操作 ${op}` : (action || '未知动作'));
    const targetControls = isTutorial
      ? `<select class="story-orch-target" data-pos="${escape(String(index))}" data-field="tutorialId">${targetOptions}</select>`
      : `<span class="story-orch-other">${escape(opLabel)} · ${escape(targetId || (step?.params?.definitionId || '—'))}</span>`;
    return `
      <div class="story-orch-step" data-index="${escape(String(index))}">
        <button type="button" class="story-orch-up" data-trigger="${escape(triggerId)}" data-index="${escape(String(index))}" title="上移（更早出现）">↑</button>
        <button type="button" class="story-orch-down" data-trigger="${escape(triggerId)}" data-index="${escape(String(index))}" title="下移（更迟出现）">↓</button>
        <span class="story-orch-del" title="删除此动作">✕</span>
        <span class="story-orch-op">${escape(opLabel)}</span>
        ${targetControls}
      </div>`;
  }

  _tutorialOptions(trigger) {
    const tutorials = asList(this.editor.project?.tutorials);
    return `<option value="">（未选）</option>` + tutorials.map(t =>
      `<option value="${this._escape(t.id)}">${this._escape(t.title || t.id)}</option>`).join('');
  }

  _bindOrchBlock(block, trigger, steps) {
    const refresh = () => this._renderTriggerOrch(block, trigger);
    // 上移/下移：交换 do[] 中相邻两个动作 → 改变教程出现/消失时机。
    for (const button of block.querySelectorAll('.story-orch-up, .story-orch-down')) {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.index);
        const delta = button.classList.contains('story-orch-up') ? -1 : 1;
        const target = index + delta;
        if (target < 0 || target >= steps.length) return false;
        [steps[index], steps[target]] = [steps[target], steps[index]];
        refresh();
        this.editor._status(`已调整 ${trigger.name || trigger.id} 的动作顺序（${button.classList.contains('story-orch-up') ? '更早' : '更迟'}），请保存到工程`, 'ok');
      });
    }
    // 删除动作。
    for (const del of block.querySelectorAll('.story-orch-del')) {
      del.addEventListener('click', () => {
        const index = Number(del.closest('.story-orch-step').dataset.index);
        steps.splice(index, 1);
        refresh();
        this.editor._status(`已删除 ${trigger.name || trigger.id} 的一个动作，请保存到工程`, 'ok');
      });
    }
    // 切换动作目标教程（写回 params.tutorialId）。
    for (const target of block.querySelectorAll('.story-orch-target')) {
      target.addEventListener('change', event => {
        const step = steps[Number(target.dataset.pos)];
        if (!step) return;
        step.params = step.params || {};
        const value = text(event.target.value);
        if (value) {
          step.params.tutorialId = value;
          step.action = 'tutorial.command';
          step.params.operation = step.params.operation || 'show';
        } else {
          delete step.params.tutorialId;
        }
        refresh();
        this.editor._status(`已切换 ${trigger.name || trigger.id} 动作目标 -> ${value || '（空）'}，请保存到工程`, 'ok');
      });
    }
    for (const add of block.querySelectorAll('.story-orch-add')) {
      add.addEventListener('click', () => {
        trigger.do = asList(trigger.do);
        trigger.do.push({
          action: 'tutorial.command',
          params: { operation: 'show', tutorialId: '' },
          stepId: this.editor._nextStableId(`${trigger.id || 'trg'}-step`, trigger.do)
        });
        refresh();
        this.editor._status(`已为 ${trigger.name || trigger.id} 追加「显示教程」动作（请选择目标教程），请保存到工程`, 'ok');
      });
    }
  }

  _bindEvents(panel, groups, groupIds) {
    // 「按钮写法」：打开全局弹层。
    const openBtn = panel.querySelector('.story-btn-help');
    if (openBtn) openBtn.addEventListener('click', () => { this.openButtonHelp(); });
    const groupOptions = group => `<option value="">（不归属任何组）</option>`
      + groups.map(candidate => (
        `<option value="${this._escape(candidate.id)}"${candidate.id === group ? ' selected' : ''}>${Number(candidate.order || 0) + 1}. ${this._escape(candidate.name || candidate.id)}</option>`
      )).join('');
    for (const select of panel.querySelectorAll('.story-assign')) {
      const current = this._memberOf(select.dataset.memberType, select.dataset.memberId);
      select.innerHTML = groupOptions(resolveFgId(current));
      select.addEventListener('change', event => {
        const member = this._memberOf(select.dataset.memberType, select.dataset.memberId);
        if (!member) return;
        syncFgFields(member, event.target.value);
        this.editor._status?.(event.target.value
          ? `${select.dataset.memberId} 已指派到 ${event.target.value}（点击「💾 保存到工程」生效）`
          : `${select.dataset.memberId} 已移出剧情组（点击「💾 保存到工程」生效）`, 'ok');
        this.render(panel);
      });
    }
    for (const button of panel.querySelectorAll('.story-jump')) {
      button.addEventListener('click', () => {
        this.editor.selectById(button.dataset.jumpId, button.dataset.jumpTarget);
      });
    }
    // 展开/收起触发器"动作编排"块（惰性渲染，避免无效 DOM 开销）。
    for (const toggle of panel.querySelectorAll('.story-orch-toggle')) {
      toggle.addEventListener('click', () => {
        const block = panel.querySelector(`.story-orch[data-orch="${this._escape(toggle.dataset.trigger)}"]`);
        if (!block) return;
        if (block.hidden) {
          block.hidden = false;
          const trigger = this._memberOf('trigger', toggle.dataset.trigger);
          this._renderTriggerOrch(block, trigger);
        } else {
          block.hidden = true;
          block.innerHTML = '';
        }
      });
    }
    // 内联编辑教程 开场/收场 提示（写回工程定义）。
    for (const input of panel.querySelectorAll('.story-begin, .story-end')) {
      input.addEventListener('change', event => {
        const tutorial = this._memberOf('tutorial', input.dataset.tutorial);
        if (!tutorial) return;
        const field = input.classList.contains('story-begin') ? 'beginText' : 'endText';
        const value = text(event.target.value);
        if (value) tutorial[field] = value;
        else delete tutorial[field];
        this.editor._status(`${input.dataset.tutorial} 的 ${field === 'beginText' ? '开场提示' : '收场提示'} 已更新（点击「💾 保存到工程」生效）`, 'ok');
      });
    }
  }

  _memberOf(type, id) {
    const list = {
      trigger: asList(this.editor.project?.triggers),
      tutorial: asList(this.editor.project?.tutorials),
      dialogue: asList(this.editor.project?.dialogues)
    }[type] || [];
    return list.find(item => item?.id === id) || null;
  }

  _escape(value) {
    return this.editor?._escapeHtml?.(value) ?? String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  injectStyles() {
    if (document.getElementById('story-styles')) return;
    const style = document.createElement('style');
    style.id = 'story-styles';
    style.textContent = `
      .story-card{margin:12px 0;border:1px solid #2a3a5e;border-radius:8px;background:#111a30;overflow:hidden;}
      .story-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#16213e;border-bottom:1px solid #2a3a5e;}
      .story-id{color:#7a8aab;font-size:11px;}
      .story-count{margin-left:auto;color:#93a8cc;font-size:11px;}
      .story-cond{display:flex;gap:0;border-bottom:1px solid #1e2b47;}
      .story-cond-col{flex:1;padding:8px 14px;font-size:12px;color:#bcd;line-height:1.7;}
      .story-cond-col+.story-cond-col{border-left:1px solid #1e2b47;}
      .story-cond-title{color:#e6ecf7;font-weight:600;font-size:11px;margin-bottom:2px;}
      .story-members{padding:8px 14px;}
      .story-member{display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px dotted #1a2440;font-size:12px;color:#bcd;}
      .story-member small{color:#8a93a8;}
      .story-jump{background:#26304e;border:1px solid #3a4a7e;color:#bcd;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:11px;}
      .story-assign{background:#26304e;color:#e6ecf7;border:1px solid #3a4a7e;border-radius:3px;padding:3px 6px;font-size:11px;margin-left:auto;}
      .story-unassigned{border-style:dashed;background:#0d1326;}
      .story-empty{color:#5a6a8a;font-size:12px;padding:4px 0;}
      .story-member-main{display:flex;align-items:center;gap:10px;}
      .story-type{color:#c6d4f0;font-weight:600;font-size:11px;min-width:44px;}
      .story-member-id{color:#e6ecf7;font-weight:600;}
      .story-detail{padding:6px 0 2px 0;margin-top:6px;border-top:1px dashed #22304d;}
      .story-detail-fields{display:flex;gap:10px;flex-wrap:wrap;}
      .story-prompt{display:flex;align-items:center;gap:6px;color:#93a8cc;font-size:11px;}
      .story-prompt span{min-width:96px;}
      .story-prompt input{background:#1a2440;color:#dbe6ff;border:1px solid #2f4168;border-radius:3px;padding:4px 7px;font-size:12px;min-width:220px;}
      .story-orch-toggle{background:#1d2a4a;border:1px solid #2f4168;color:#bfd0f0;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:11px;margin-top:6px;}
      .story-orch-toggle:hover{background:#2a3a64;color:#fff;}
      .story-orch{padding:7px 0 2px 0;margin-top:4px;border-top:1px dashed #22304d;}
      .story-orch-head{color:#7c92bd;font-size:11px;margin-bottom:4px;}
      .story-orch-step{display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;}
      .story-orch-step button{background:#26304e;border:1px solid #33446e;color:#c3d2f0;border-radius:3px;padding:1px 7px;cursor:pointer;font-size:11px;}
      .story-orch-step button:hover{background:#34406a;}
      .story-orch-op{color:#dbe6ff;font-size:11px;white-space:nowrap;}
      .story-orch-target{background:#1a2440;color:#dbe6ff;border:1px solid #2f4168;border-radius:3px;padding:2px 6px;font-size:11px;}
      .story-orch-other{color:#7c92bd;font-size:11px;}
      .story-orch-del{color:#c07a9a;cursor:pointer;padding:0 3px;}
      .story-orch-del:hover{color:#ff8a80;}
      .story-orch-actions{margin-top:5px;}
      .story-orch-add{background:#1d2a4a;border:1px dashed #3a5490;color:#9ab6e0;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:11px;}
      .story-orch-add:hover{background:#2a3a64;color:#fff;}
      .story-orch-empty{color:#5a6a8a;font-size:11px;padding:3px 0;}
    `;
    document.head.appendChild(style);
  }
}

export default FlowGroupStorylinePanel;
