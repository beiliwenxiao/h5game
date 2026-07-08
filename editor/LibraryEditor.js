/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * LibraryEditor - 内容库编辑器（P2-2）
 *
 * 读写 GameProject（example/<game>/game.project.json）的 library.{类}。
 * 库存“定义(definition)”，场景 objects 引用库 id → 运行时实例化（§1 库与实例分离）。
 * 覆盖：NPC / 敌人 / 物品 / 装备 / 商店 / 职业 / 技能 / 载具 / 建筑。
 *
 * 每条定义 = 通用字段(id/name) + 该类专属字段(JSON)。保存前 JSON 实时校验。
 * 通过 Vite dev server 的 /api/read-file、/api/save-file 读写（保留其它字段）。
 */

// 库分类定义（内容库仅保留角色养成类全局定义；可放置内容 NPC/敌人/物品/装备/商店/载具/建筑
// 已移到场景编辑器「资源库·内容」Tab 就地定义+放置）。
const CATEGORIES = [
  { key: 'classes', label: '职业', tpl: { name: '新职业', baseStats: { maxHp: 100, maxMp: 50, attack: 10, defense: 5, speed: 100 }, startSkills: [] } },
  { key: 'combatSkills', label: '战斗技能', tpl: { name: '新战斗技能', skillType: 'combat', cooldown: 3, castTime: 0, manaCost: 10, damage: 0, element: 0, range: 100 } },
  { key: 'gatherSkills', label: '采集技能', tpl: { name: '新采集技能', skillType: 'gather', resource: '', gatherTime: 2, level: 1, yield: 1 } },
  { key: 'craftSkills', label: '生产技能', tpl: { name: '新生产技能', skillType: 'craft', product: '', materials: [], craftTime: 3, level: 1 } },
  { key: 'talents', label: '天赋', tpl: { name: '新天赋', tier: 1, maxRank: 3, effects: [] } }
];

// 通用主键字段（不进 JSON 专属区，单独用输入框编辑）
const COMMON_FIELDS = ['id', 'name'];

export class LibraryEditor {
  /**
   * @param {HTMLElement} container
   * @param {Object} options - { gameId }
   */
  constructor(container, options = {}) {
    this.container = container;
    this.gameId = options.gameId || 'sanguo_zhangjiao';
    this.projectPath = `example/${this.gameId}/game.project.json`;
    this.project = null;
    this.library = null;
    this.activeCategory = CATEGORIES[0].key;
    this.selectedIndex = -1;
    this._initialized = false;
  }

  async init() {
    if (!this._initialized) {
      this._initialized = true;
      this._buildUI();
      this._injectStyles();
    }
    await this._load();
    this._renderCategories();
    this._renderList();
    this._renderDetail();
  }

  /** 加载工程文件 */
  async _load() {
    try {
      const res = await fetch('/api/read-file?path=' + encodeURIComponent(this.projectPath));
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.content) this.project = JSON.parse(data.content);
      }
    } catch (e) {
      console.warn('LibraryEditor: 加载工程失败', e);
    }
    if (!this.project) this.project = { meta: { id: this.gameId }, variables: {}, triggers: [], library: {} };
    if (!this.project.library || typeof this.project.library !== 'object') this.project.library = {};
    // 确保每个分类数组存在
    for (const c of CATEGORIES) {
      if (!Array.isArray(this.project.library[c.key])) this.project.library[c.key] = [];
    }
    this.library = this.project.library;
  }

  /** 保存回工程文件（保留其它字段） */
  async save() {
    if (this._validateDetailJson()) {
      this._toast('JSON 格式错误，请修正后再保存（红框处）', false);
      this._status('❌ JSON 格式错误，未保存', 'err');
      return;
    }
    this._commitDetail();
    this.project.library = this.library;
    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.projectPath, content: JSON.stringify(this.project, null, 2) })
      });
      const data = await res.json();
      if (data && data.ok) {
        const n = this._current().length;
        this._status('✅ 已保存到 ' + this.projectPath, 'ok');
        this._toast('保存成功（' + this._catLabel() + ' ' + n + ' 条）', true);
      } else {
        this._status('❌ 保存失败: ' + (data.error || '未知'), 'err');
        this._toast('保存失败: ' + (data.error || '未知'), false);
      }
    } catch (e) {
      this._status('❌ 保存失败: ' + e.message, 'err');
      this._toast('保存失败: ' + e.message, false);
    }
  }

  // ---- 数据辅助 ----
  _current() { return this.library[this.activeCategory] || []; }
  _catDef() { return CATEGORIES.find(c => c.key === this.activeCategory); }
  _catLabel() { return (this._catDef() || {}).label || this.activeCategory; }

  // ---- UI 构建 ----
  _buildUI() {
    const catBtns = CATEGORIES.map(c =>
      `<button class="lib-cat" data-cat="${c.key}">${c.label}</button>`).join('');
    this.container.innerHTML = `
      <div class="lib-root">
        <div class="lib-cats">${catBtns}</div>
        <div class="lib-toolbar">
          <button id="lib-add">+ 新增</button>
          <button id="lib-del">🗑 删除</button>
          <button id="lib-save" class="primary">💾 保存到工程</button>
          <span class="lib-hint">数据 → ${this.projectPath} · library</span>
        </div>
        <div class="lib-main">
          <div class="lib-list" id="lib-list"></div>
          <div class="lib-detail" id="lib-detail"></div>
        </div>
        <div class="lib-status" id="lib-status"></div>
      </div>`;
    this.container.querySelector('#lib-add').addEventListener('click', () => this._addEntry());
    this.container.querySelector('#lib-del').addEventListener('click', () => this._deleteEntry());
    this.container.querySelector('#lib-save').addEventListener('click', () => this.save());
    this.container.querySelectorAll('.lib-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        this._commitDetail();
        this.activeCategory = btn.dataset.cat;
        this.selectedIndex = -1;
        this._renderCategories();
        this._renderList();
        this._renderDetail();
      });
    });
  }

  _injectStyles() {
    if (document.getElementById('lib-styles')) return;
    const s = document.createElement('style');
    s.id = 'lib-styles';
    s.textContent = `
      .lib-root{display:flex;flex-direction:column;height:100%;background:#0d1326;color:#fff;}
      .lib-cats{display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px;background:#101a30;border-bottom:1px solid #2a3a5e;}
      .lib-cat{padding:6px 12px;background:#26304e;border:none;border-radius:14px;color:#bcd;cursor:pointer;font-size:12px;}
      .lib-cat.active{background:#4a6ad0;color:#fff;font-weight:bold;}
      .lib-toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px;background:#16213e;border-bottom:1px solid #2a3a5e;}
      .lib-toolbar button{padding:6px 12px;background:#3a4a7e;border:none;border-radius:4px;color:#fff;cursor:pointer;}
      .lib-toolbar button.primary{background:#4CAF50;color:#000;font-weight:bold;}
      .lib-hint{margin-left:auto;color:#8aa;font-size:12px;}
      .lib-main{flex:1;display:flex;overflow:hidden;}
      .lib-list{width:220px;background:#111a30;border-right:1px solid #2a3a5e;overflow-y:auto;}
      .lib-item{padding:9px 14px;border-bottom:1px solid #1e2b47;cursor:pointer;}
      .lib-item:hover{background:#1a2540;}
      .lib-item.active{background:#2a3a6e;}
      .lib-item .li-name{font-weight:bold;font-size:13px;}
      .lib-item .li-id{font-size:11px;color:#9ab;}
      .lib-detail{flex:1;padding:16px;overflow-y:auto;}
      .lib-detail .row{margin-bottom:10px;}
      .lib-detail label{display:block;font-size:12px;color:#9ab;margin-bottom:3px;}
      .lib-detail input[type=text],.lib-detail textarea{width:100%;box-sizing:border-box;background:#0a1020;border:1px solid #2a3a5e;color:#fff;padding:6px;border-radius:3px;font-family:monospace;font-size:12px;}
      .lib-detail textarea{min-height:180px;resize:vertical;}
      .lib-empty{color:#778;padding:40px;text-align:center;}
      .lib-status{padding:6px 16px;font-size:12px;min-height:22px;background:#0a1020;}
      .lib-status.ok{color:#6c6;} .lib-status.err{color:#e66;}
    `;
    document.head.appendChild(s);
  }

  _status(msg, kind) {
    const el = this.container.querySelector('#lib-status');
    if (el) { el.textContent = msg; el.className = 'lib-status ' + (kind || ''); }
  }

  _toast(msg, ok) {
    let t = document.getElementById('lib-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'lib-toast';
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

  // ---- 渲染 ----
  _renderCategories() {
    this.container.querySelectorAll('.lib-cat').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === this.activeCategory);
    });
  }

  _renderList() {
    const list = this.container.querySelector('#lib-list');
    if (!list) return;
    const entries = this._current();
    if (entries.length === 0) {
      list.innerHTML = '<div class="lib-empty">暂无' + this._catLabel() + '<br>点击「+ 新增」</div>';
      return;
    }
    list.innerHTML = '';
    entries.forEach((e, i) => {
      const item = document.createElement('div');
      item.className = 'lib-item' + (i === this.selectedIndex ? ' active' : '');
      item.innerHTML = `<div class="li-name">${e.name || '(未命名)'}</div><div class="li-id">${e.id || ''}</div>`;
      item.addEventListener('click', () => {
        this._commitDetail();
        this.selectedIndex = i;
        this._renderList();
        this._renderDetail();
      });
      list.appendChild(item);
    });
  }

  _renderDetail() {
    const panel = this.container.querySelector('#lib-detail');
    if (!panel) return;
    const e = this._current()[this.selectedIndex];
    if (!e) {
      panel.innerHTML = '<div class="lib-empty">选择或新增一个' + this._catLabel() + '定义</div>';
      return;
    }
    // 专属字段 = 去掉通用字段后的其余部分
    const rest = {};
    for (const k of Object.keys(e)) {
      if (!COMMON_FIELDS.includes(k)) rest[k] = e[k];
    }
    panel.innerHTML = `
      <div class="row"><label>ID（库主键，场景对象用它引用）</label><input type="text" id="l-id" value="${e.id || ''}"></div>
      <div class="row"><label>名称 name</label><input type="text" id="l-name" value="${e.name || ''}"></div>
      <div class="row"><label>专属属性（JSON）</label><textarea id="l-props">${this._json(rest, 2)}</textarea></div>
    `;
    this._bindJsonValidation(panel.querySelector('#l-props'));
  }

  _bindJsonValidation(el) {
    if (!el) return;
    const check = () => {
      const v = el.value.trim();
      if (!v) { el.style.borderColor = '#2a3a5e'; el.title = ''; return true; }
      try { JSON.parse(v); el.style.borderColor = '#4a8a4a'; el.title = 'JSON 格式正确'; return true; }
      catch (err) { el.style.borderColor = '#e05252'; el.title = 'JSON 格式错误: ' + err.message; return false; }
    };
    el.addEventListener('input', check);
    check();
  }

  _validateDetailJson() {
    const el = this.container.querySelector('#l-props');
    if (!el) return false;
    const v = el.value.trim();
    if (!v) return false;
    try { JSON.parse(v); return false; } catch (e) { el.style.borderColor = '#e05252'; return true; }
  }

  _commitDetail() {
    const e = this._current()[this.selectedIndex];
    const panel = this.container.querySelector('#lib-detail');
    if (!e || !panel || !panel.querySelector('#l-id')) return;
    e.id = panel.querySelector('#l-id').value.trim() || e.id;
    e.name = panel.querySelector('#l-name').value.trim() || e.name;
    const rest = this._parseJson(panel.querySelector('#l-props').value, {});
    // 用专属字段覆盖（保留 id/name）
    for (const k of Object.keys(e)) {
      if (!COMMON_FIELDS.includes(k)) delete e[k];
    }
    Object.assign(e, rest);
  }

  _addEntry() {
    this._commitDetail();
    const cat = this._catDef();
    const tpl = JSON.parse(JSON.stringify(cat.tpl || {}));
    const id = this.activeCategory.replace(/s$/, '') + '_' + Date.now().toString(36);
    const entry = { id, name: tpl.name || id, ...tpl };
    this._current().push(entry);
    this.selectedIndex = this._current().length - 1;
    this._renderList();
    this._renderDetail();
  }

  _deleteEntry() {
    if (this.selectedIndex < 0) return;
    this._current().splice(this.selectedIndex, 1);
    this.selectedIndex = Math.min(this.selectedIndex, this._current().length - 1);
    this._renderList();
    this._renderDetail();
  }

  _json(v, indent) {
    if (v == null) return '';
    try { return JSON.stringify(v, null, indent || 0); } catch (e) { return ''; }
  }

  _parseJson(str, fallback) {
    if (!str || !str.trim()) return fallback;
    try { return JSON.parse(str); } catch (e) { this._status('JSON 解析错误: ' + e.message, 'err'); return fallback; }
  }
}

export default LibraryEditor;
