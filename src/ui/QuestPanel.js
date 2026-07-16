/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-02-10
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * QuestPanel.js
 * 任务面板UI组件
 */

import { QuestType, QuestState } from '../systems/QuestSystem.js';

export class QuestPanel {
  constructor(questSystem) {
    this.questSystem = questSystem;
    this.container = null;
    this.isVisible = false;
    this.currentTab = 'active';
    
    this.questTypeLabels = {
      [QuestType.MAIN]: '主线',
      [QuestType.SIDE]: '支线',
      [QuestType.DAILY]: '日常',
      [QuestType.WEEKLY]: '周常',
      [QuestType.REPEATABLE]: '重复',
      [QuestType.EVENT]: '活动'
    };

    this.questTypeColors = {
      [QuestType.MAIN]: '#ffd700',
      [QuestType.SIDE]: '#87ceeb',
      [QuestType.DAILY]: '#98fb98',
      [QuestType.WEEKLY]: '#dda0dd',
      [QuestType.REPEATABLE]: '#f0e68c',
      [QuestType.EVENT]: '#ff6b6b'
    };

    this.init();
  }

  init() {
    this.createContainer();
    this.bindEvents();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'quest-panel';
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 700px;
      max-width: 90vw;
      max-height: 80vh;
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid #8b7355;
      border-radius: 10px;
      color: white;
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      z-index: 1000;
      display: none;
      flex-direction: column;
    `;

    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 15px 20px;
      background: linear-gradient(135deg, #4a3728, #2a1f18);
      border-bottom: 1px solid #8b7355;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 8px 8px 0 0;
    `;
    header.innerHTML = `
      <span style="font-size: 18px; font-weight: bold;">📜 任务日志</span>
      <button id="quest-panel-close" style="
        background: none;
        border: none;
        color: #999;
        font-size: 24px;
        cursor: pointer;
      ">×</button>
    `;
    this.container.appendChild(header);

    // 标签栏
    this.tabBar = document.createElement('div');
    this.tabBar.style.cssText = `
      display: flex;
      border-bottom: 1px solid #4a4a4a;
      background: rgba(0, 0, 0, 0.3);
    `;
    this.container.appendChild(this.tabBar);

    // 内容区
    this.content = document.createElement('div');
    this.content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      min-height: 300px;
    `;
    this.container.appendChild(this.content);

    document.body.appendChild(this.container);

    // 绑定关闭按钮
    document.getElementById('quest-panel-close').addEventListener('click', () => this.hide());
  }

  bindEvents() {
    if (this.questSystem) {
      this.questSystem.on('questAccepted', () => this.refresh());
      this.questSystem.on('questProgress', () => this.refresh());
      this.questSystem.on('questCompleted', () => this.refresh());
      this.questSystem.on('questTurnedIn', () => this.refresh());
      this.questSystem.on('questAbandoned', () => this.refresh());
    }
  }

  show() {
    this.container.style.display = 'flex';
    this.isVisible = true;
    this.refresh();
  }

  hide() {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  refresh() {
    this.renderTabs();
    this.renderContent();
  }

  renderTabs() {
    const tabs = [
      { id: 'active', label: '进行中', count: this.questSystem?.getActiveQuests().length || 0 },
      { id: 'completed', label: '已完成', count: this.questSystem?.completedQuests.size || 0 },
      { id: 'all', label: '全部任务', count: this.questSystem?.quests.size || 0 }
    ];

    this.tabBar.innerHTML = tabs.map(tab => `
      <button class="quest-tab" data-tab="${tab.id}" style="
        flex: 1;
        padding: 12px;
        background: ${this.currentTab === tab.id ? 'rgba(139, 115, 85, 0.3)' : 'transparent'};
        border: none;
        border-bottom: ${this.currentTab === tab.id ? '2px solid #ffd700' : '2px solid transparent'};
        color: ${this.currentTab === tab.id ? '#ffd700' : '#999'};
        cursor: pointer;
        font-size: 14px;
      ">${tab.label} (${tab.count})</button>
    `).join('');

    this.tabBar.querySelectorAll('.quest-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentTab = btn.dataset.tab;
        this.refresh();
      });
    });
  }

  renderContent() {
    let quests = [];
    
    switch (this.currentTab) {
      case 'active':
        quests = this.questSystem?.getActiveQuests() || [];
        break;
      case 'completed':
        quests = Array.from(this.questSystem?.completedQuests || [])
          .map(id => this.questSystem?.getQuest(id))
          .filter(q => q);
        break;
      case 'all':
        quests = this.questSystem?.getAllQuests() || [];
        break;
    }

    if (quests.length === 0) {
      this.content.innerHTML = `
        <div style="text-align: center; color: #7f8c8d; padding: 40px;">
          暂无任务
        </div>
      `;
      return;
    }

    this.content.innerHTML = quests.map(quest => this.renderQuestItem(quest)).join('');

    // 绑定事件
    this.content.querySelectorAll('.quest-item').forEach(item => {
      const questId = item.dataset.questId;
      item.addEventListener('click', () => this.showQuestDetail(questId));
    });
  }

  renderQuestItem(quest) {
    const color = this.questTypeColors[quest.type] || '#fff';
    const label = this.questTypeLabels[quest.type] || '任务';
    const progress = quest.getProgressPercent();
    const isCompleted = quest.state === QuestState.COMPLETED || quest.state === QuestState.TURNED_IN;

    return `
      <div class="quest-item" data-quest-id="${quest.id}" style="
        background: rgba(255, 255, 255, 0.05);
        border-left: 3px solid ${color};
        border-radius: 5px;
        padding: 12px 15px;
        margin-bottom: 10px;
        cursor: pointer;
        transition: background 0.2s;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div>
            <span style="
              background: ${color}30;
              color: ${color};
              padding: 2px 8px;
              border-radius: 3px;
              font-size: 11px;
              margin-right: 8px;
            ">${label}</span>
            <span style="font-weight: bold; ${isCompleted ? 'text-decoration: line-through; color: #7f8c8d;' : ''}">${quest.name}</span>
          </div>
          <span style="font-size: 12px; color: #95a5a6;">Lv.${quest.minLevel}</span>
        </div>
        <div style="font-size: 12px; color: #bdc3c7; margin-bottom: 8px;">${quest.shortDescription}</div>
        ${this.currentTab === 'active' ? `
          <div style="background: rgba(0, 0, 0, 0.3); border-radius: 3px; height: 4px; overflow: hidden;">
            <div style="width: ${progress}%; height: 100%; background: ${color}; transition: width 0.3s;"></div>
          </div>
          <div style="font-size: 11px; color: #7f8c8d; margin-top: 4px; text-align: right;">${Math.floor(progress)}%</div>
        ` : ''}
      </div>
    `;
  }

  showQuestDetail(questId) {
    const quest = this.questSystem?.activeQuests.get(questId) || this.questSystem?.getQuest(questId);
    if (!quest) return;

    const color = this.questTypeColors[quest.type] || '#fff';
    
    const detailHtml = `
      <div style="padding: 20px;">
        <button onclick="window.questPanel.refresh()" style="
          background: none;
          border: none;
          color: #ffd700;
          cursor: pointer;
          margin-bottom: 15px;
        ">← 返回列表</button>
        
        <h3 style="color: ${color}; margin-bottom: 10px;">${quest.name}</h3>
        <p style="color: #bdc3c7; margin-bottom: 20px;">${quest.description}</p>
        
        <h4 style="color: #ffd700; margin-bottom: 10px;">任务目标</h4>
        ${quest.objectives.map(obj => `
          <div style="
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            margin-bottom: 5px;
          ">
            <span style="color: ${obj.isComplete() ? '#2ecc71' : '#95a5a6'};">
              ${obj.isComplete() ? '✓' : '○'}
            </span>
            <span style="${obj.isComplete() ? 'text-decoration: line-through; color: #7f8c8d;' : ''}">
              ${obj.description || obj.targetName}
            </span>
            <span style="margin-left: auto; color: #7f8c8d;">
              ${obj.currentCount}/${obj.requiredCount}
            </span>
          </div>
        `).join('')}
        
        <h4 style="color: #ffd700; margin: 20px 0 10px;">奖励</h4>
        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
          ${quest.reward.exp ? `<span>⭐ ${quest.reward.exp} 经验</span>` : ''}
          ${quest.reward.gold ? `<span>💰 ${quest.reward.gold} 金币</span>` : ''}
          ${quest.reward.items?.map(item => `<span>📦 ${item.name} x${item.count || 1}</span>`).join('') || ''}
        </div>
        
        ${quest.state === QuestState.ACTIVE ? `
          <button onclick="window.questPanel.abandonQuest('${quest.id}')" style="
            margin-top: 20px;
            padding: 10px 20px;
            background: #e74c3c;
            border: none;
            border-radius: 5px;
            color: white;
            cursor: pointer;
          ">放弃任务</button>
        ` : ''}
      </div>
    `;
    
    this.content.innerHTML = detailHtml;
  }

  abandonQuest(questId) {
    if (this.questSystem?.abandonQuest(questId)) {
      this.refresh();
    }
  }

  destroy() {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

// 全局引用
window.questPanel = null;
