/**
 * SystemEditor - 系统编辑器
 * 
 * 配置游戏系统级参数（加载页面、全局设置等），保存到 game.project.json 的 system 字段。
 * 第一个标签：加载页面配置（标题、副标题、加载文字、图标、步骤间隔）
 */
export class SystemEditor {
  constructor(container, opts = {}) {
    this.container = container;
    this.gameId = opts.gameId || 'sanguo_zhangjiao';
    this._initialized = false;
    this._data = null; // system 配置数据
  }

  init() {
    if (!this._initialized) {
      this._loadData();
      this._render();
      this._initialized = true;
    } else {
      this._loadData();
      this._updateFields();
    }
  }

  _loadData() {
    try {
      const raw = localStorage.getItem('yijian18-engine_editor_project_' + this.gameId);
      if (raw) {
        const project = JSON.parse(raw);
        this._data = project.system || {};
      } else {
        this._data = {};
      }
    } catch (e) {
      this._data = {};
    }
    // 确保 loading 子对象存在
    if (!this._data.loading) {
      this._data.loading = {
        title: '张角黄巾起义序章',
        subtitle: '第一幕：绝望的开始',
        loadingText: '加载中...',
        icon: '',
        backgroundColor: '#1a1a1a',
        titleColor: '#4CAF50',
        progressBarColor: '#4CAF50,#8BC34A',
        steps: [
          { progress: 0, text: '初始化 ECS 系统...', delay: 500 },
          { progress: 25, text: '加载核心系统...', delay: 500 },
          { progress: 50, text: '创建场景管理器...', delay: 300 },
          { progress: 60, text: '注册场景...', delay: 500 },
          { progress: 75, text: '初始化玩家实体...', delay: 0 },
          { progress: 90, text: '进入第一幕...', delay: 500 },
          { progress: 100, text: '完成！', delay: 500 }
        ]
      };
    }
  }

  _save() {
    try {
      const key = 'yijian18-engine_editor_project_' + this.gameId;
      let project = {};
      const raw = localStorage.getItem(key);
      if (raw) project = JSON.parse(raw);
      project.system = this._data;
      localStorage.setItem(key, JSON.stringify(project));

      // 同时写入 game.project.json（通过 Vite API）
      this._saveToFile(project);
      this._showToast('已保存');
    } catch (e) {
      console.error('SystemEditor: 保存失败', e);
    }
  }

  async _saveToFile(project) {
    try {
      // 读取现有 game.project.json 并合并 system 字段
      const res = await fetch(`../example/${this.gameId}/game.project.json`);
      if (!res.ok) return;
      const existing = await res.json();
      existing.system = this._data;
      await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `example/${this.gameId}/game.project.json`,
          content: JSON.stringify(existing, null, 2)
        })
      });
    } catch (e) {
      console.warn('SystemEditor: 写入文件失败（dev server 可能不支持）', e);
    }
  }

  _render() {
    const ld = this._data.loading;
    this.container.innerHTML = `
      <div style="padding:16px;color:#ccc;font-family:sans-serif;overflow-y:auto;height:100%;">
        <h2 style="color:#4CAF50;margin:0 0 16px;">系统编辑器</h2>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button class="sys-tab active" data-tab="loading">加载页面</button>
        </div>
        <div id="sys-tab-loading" class="sys-tab-content">
          <fieldset style="border:1px solid #333;padding:12px;border-radius:6px;margin-bottom:12px;">
            <legend style="color:#8cf;">基本信息</legend>
            <div class="sys-row"><label>标题:</label><input type="text" id="sys-ld-title" value="${this._esc(ld.title)}"></div>
            <div class="sys-row"><label>副标题:</label><input type="text" id="sys-ld-subtitle" value="${this._esc(ld.subtitle)}"></div>
            <div class="sys-row"><label>加载文字:</label><input type="text" id="sys-ld-text" value="${this._esc(ld.loadingText)}"></div>
            <div class="sys-row"><label>图标URL:</label><input type="text" id="sys-ld-icon" value="${this._esc(ld.icon)}" placeholder="留空=无图标，如 assets/images/logo.png"></div>
          </fieldset>
          <fieldset style="border:1px solid #333;padding:12px;border-radius:6px;margin-bottom:12px;">
            <legend style="color:#8cf;">样式</legend>
            <div class="sys-row"><label>背景色:</label><input type="color" id="sys-ld-bg" value="${ld.backgroundColor || '#1a1a1a'}"></div>
            <div class="sys-row"><label>标题色:</label><input type="color" id="sys-ld-titlecolor" value="${ld.titleColor || '#4CAF50'}"></div>
            <div class="sys-row"><label>进度条渐变:</label><input type="text" id="sys-ld-barcolor" value="${ld.progressBarColor || '#4CAF50,#8BC34A'}" placeholder="#颜色1,#颜色2"></div>
          </fieldset>
          <fieldset style="border:1px solid #333;padding:12px;border-radius:6px;margin-bottom:12px;">
            <legend style="color:#8cf;">加载步骤</legend>
            <div id="sys-ld-steps"></div>
            <button id="sys-ld-add-step" style="margin-top:8px;padding:4px 12px;background:#2a3a2a;border:1px solid #4CAF50;color:#fff;border-radius:4px;cursor:pointer;">+ 添加步骤</button>
          </fieldset>
          <button id="sys-ld-save" style="padding:8px 24px;background:#4CAF50;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:14px;">保存</button>
        </div>
      </div>
      <style>
        .sys-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .sys-row label { min-width:80px; color:#aaa; font-size:13px; }
        .sys-row input[type="text"], .sys-row input[type="number"] { flex:1; padding:4px 8px; background:#1a2a3a; border:1px solid #333; color:#fff; border-radius:3px; }
        .sys-row input[type="color"] { width:50px; height:28px; border:none; cursor:pointer; }
        .sys-tab { padding:6px 16px; background:#1a2a3a; border:1px solid #333; color:#aaa; border-radius:4px 4px 0 0; cursor:pointer; }
        .sys-tab.active { background:#0d1326; color:#4CAF50; border-bottom-color:#0d1326; }
        .sys-step-row { display:flex; align-items:center; gap:6px; margin-bottom:6px; background:#0a1020; padding:6px 8px; border-radius:4px; }
        .sys-step-row input { padding:3px 6px; background:#1a2a3a; border:1px solid #333; color:#fff; border-radius:3px; }
        .sys-step-row .step-progress { width:50px; }
        .sys-step-row .step-text { flex:1; }
        .sys-step-row .step-delay { width:60px; }
        .sys-step-row button { background:none; border:none; color:#f66; cursor:pointer; font-size:16px; }
      </style>
    `;
    this._renderSteps();
    this._bindEvents();
  }

  _renderSteps() {
    const container = this.container.querySelector('#sys-ld-steps');
    const steps = this._data.loading.steps || [];
    container.innerHTML = steps.map((s, i) => `
      <div class="sys-step-row" data-index="${i}">
        <input type="number" class="step-progress" value="${s.progress}" min="0" max="100" title="进度%">
        <input type="text" class="step-text" value="${this._esc(s.text)}" title="显示文字">
        <input type="number" class="step-delay" value="${s.delay}" min="0" step="100" title="延迟ms">
        <button class="step-remove" title="删除">✕</button>
      </div>
    `).join('');
  }

  _bindEvents() {
    // 保存
    this.container.querySelector('#sys-ld-save').addEventListener('click', () => {
      this._collectFields();
      this._save();
    });
    // 添加步骤
    this.container.querySelector('#sys-ld-add-step').addEventListener('click', () => {
      const steps = this._data.loading.steps;
      const lastProgress = steps.length > 0 ? steps[steps.length - 1].progress : 0;
      steps.push({ progress: Math.min(100, lastProgress + 10), text: '加载中...', delay: 300 });
      this._renderSteps();
      this._bindStepEvents();
    });
    this._bindStepEvents();
  }

  _bindStepEvents() {
    // 删除步骤
    this.container.querySelectorAll('.step-remove').forEach(btn => {
      btn.onclick = (e) => {
        const row = e.target.closest('.sys-step-row');
        const idx = parseInt(row.dataset.index);
        this._data.loading.steps.splice(idx, 1);
        this._renderSteps();
        this._bindStepEvents();
      };
    });
    // 步骤字段变化实时同步到 data
    this.container.querySelectorAll('.sys-step-row').forEach(row => {
      const idx = parseInt(row.dataset.index);
      row.querySelector('.step-progress').addEventListener('change', (e) => {
        this._data.loading.steps[idx].progress = parseInt(e.target.value) || 0;
      });
      row.querySelector('.step-text').addEventListener('change', (e) => {
        this._data.loading.steps[idx].text = e.target.value;
      });
      row.querySelector('.step-delay').addEventListener('change', (e) => {
        this._data.loading.steps[idx].delay = parseInt(e.target.value) || 0;
      });
    });
  }

  _collectFields() {
    const ld = this._data.loading;
    ld.title = this.container.querySelector('#sys-ld-title').value;
    ld.subtitle = this.container.querySelector('#sys-ld-subtitle').value;
    ld.loadingText = this.container.querySelector('#sys-ld-text').value;
    ld.icon = this.container.querySelector('#sys-ld-icon').value;
    ld.backgroundColor = this.container.querySelector('#sys-ld-bg').value;
    ld.titleColor = this.container.querySelector('#sys-ld-titlecolor').value;
    ld.progressBarColor = this.container.querySelector('#sys-ld-barcolor').value;
  }

  _updateFields() {
    const ld = this._data.loading;
    const q = (id) => this.container.querySelector(id);
    if (q('#sys-ld-title')) q('#sys-ld-title').value = ld.title || '';
    if (q('#sys-ld-subtitle')) q('#sys-ld-subtitle').value = ld.subtitle || '';
    if (q('#sys-ld-text')) q('#sys-ld-text').value = ld.loadingText || '';
    if (q('#sys-ld-icon')) q('#sys-ld-icon').value = ld.icon || '';
    if (q('#sys-ld-bg')) q('#sys-ld-bg').value = ld.backgroundColor || '#1a1a1a';
    if (q('#sys-ld-titlecolor')) q('#sys-ld-titlecolor').value = ld.titleColor || '#4CAF50';
    if (q('#sys-ld-barcolor')) q('#sys-ld-barcolor').value = ld.progressBarColor || '#4CAF50,#8BC34A';
    this._renderSteps();
    this._bindStepEvents();
  }

  _esc(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  _showToast(msg) {
    let toast = document.getElementById('sys-editor-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sys-editor-toast';
      toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);padding:8px 20px;background:#4CAF50;color:#fff;border-radius:4px;font-size:13px;z-index:99999;transition:opacity 0.3s;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
  }
}

export default SystemEditor;
