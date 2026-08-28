/**
 * FlowGroupStorylinePanel - 剧情线总览视图（方案 A）。
 *
 * 以 FlowGroup 为主视角的策划总览：每个剧情组一张卡片，直观展示
 * 「开始条件 / 结束条件 / 组内成员（Trigger/Tutorial/Dialogue）」。
 * 支持把未分组成员指派到组（写入 flowGroupId，双轨兼容 sceneEventId）。
 *
 * 只读展示 + 成员归属调整；定义细节编辑仍走各自的 Tab / 编辑器。
 */

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
    panel.innerHTML = groups.map(group => this._renderGroup(group, members)).join('')
      + this._renderUnassigned(project, groupIds);
    this._bindEvents(panel, groups, groupIds);
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
    const typeMeta = { trigger: '⚡', tutorial: '🎓', dialogue: '💬' };
    const summary = member.type === 'trigger'
      ? `触发时机：${this._escape(text(member.def?.when?.type) || text(member.def?.when) || '?')}`
      : member.type === 'tutorial'
        ? `${asList(member.def?.steps).length} 个步骤`
        : `标题：${this._escape(text(member.def?.title) || '-')}`;
    const jumpTarget = member.type === 'trigger' ? 'triggers' : 'tutorials';
    return `
      <div class="story-member">
        <span>${typeMeta[member.type]} ${this._escape(member.id)}</span>
        <small>${summary}</small>
        ${withAssign
          ? `<select class="story-assign" data-member-type="${member.type}" data-member-id="${this._escape(member.id)}"></select>`
          : (member.type !== 'dialogue'
            ? `<button class="story-jump" data-jump-target="${jumpTarget}" data-jump-id="${this._escape(member.id)}">编辑 →</button>`
            : '<small style="color:#5a6a8a;">在对话编辑器中编辑</small>')}
      </div>
    `;
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

  _bindEvents(panel, groups, groupIds) {
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
    `;
    document.head.appendChild(style);
  }
}

export default FlowGroupStorylinePanel;
