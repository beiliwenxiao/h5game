/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * ChatPanel.js
 * 聊天面板UI组件
 */

import { ChatChannel, ChatMessageType } from '../systems/ChatSystem.js';

export class ChatPanel {
  constructor(chatSystem, config = {}) {
    this.chatSystem = chatSystem;
    this.container = null;
    this.currentChannel = ChatChannel.WORLD;
    this.isVisible = true;
    this.isMinimized = false;
    this.playerId = config.playerId || 'local_player';
    this.playerName = config.playerName || '玩家';
    
    this.channelColors = {
      [ChatChannel.WORLD]: '#ffd700',
      [ChatChannel.MAP]: '#87ceeb',
      [ChatChannel.TEAM]: '#98fb98',
      [ChatChannel.GUILD]: '#dda0dd',
      [ChatChannel.PRIVATE]: '#ff69b4',
      [ChatChannel.SYSTEM]: '#ff6b6b',
      [ChatChannel.COMBAT]: '#bdc3c7'
    };

    this.init();
  }

  init() {
    this.createContainer();
    this.bindEvents();
    this.refresh();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'chat-panel';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 400px;
      height: 300px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid #4a4a4a;
      border-radius: 8px;
      color: white;
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      z-index: 900;
    `;

    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.5);
      border-bottom: 1px solid #4a4a4a;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
    `;
    header.innerHTML = `
      <span>💬 聊天</span>
      <div>
        <button id="chat-minimize" style="background:none;border:none;color:#999;cursor:pointer;font-size:16px;">_</button>
        <button id="chat-close" style="background:none;border:none;color:#999;cursor:pointer;font-size:16px;">×</button>
      </div>
    `;
    this.container.appendChild(header);

    // 频道标签
    this.tabBar = document.createElement('div');
    this.tabBar.style.cssText = `
      display: flex;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid #4a4a4a;
      overflow-x: auto;
    `;
    this.container.appendChild(this.tabBar);

    // 消息区域
    this.messageArea = document.createElement('div');
    this.messageArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 10px;
    `;
    this.container.appendChild(this.messageArea);

    // 输入区域
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
      padding: 8px;
      border-top: 1px solid #4a4a4a;
      display: flex;
      gap: 8px;
    `;
    inputArea.innerHTML = `
      <input type="text" id="chat-input" placeholder="输入消息..." style="
        flex: 1;
        padding: 8px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid #4a4a4a;
        border-radius: 4px;
        color: white;
        outline: none;
      ">
      <button id="chat-send" style="
        padding: 8px 15px;
        background: #3498db;
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
      ">发送</button>
    `;
    this.container.appendChild(inputArea);

    document.body.appendChild(this.container);

    // 绑定按钮事件
    document.getElementById('chat-minimize').addEventListener('click', () => this.toggleMinimize());
    document.getElementById('chat-close').addEventListener('click', () => this.hide());
    document.getElementById('chat-send').addEventListener('click', () => this.sendMessage());
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
  }

  bindEvents() {
    if (this.chatSystem) {
      this.chatSystem.on('messageReceived', (msg) => this.onMessageReceived(msg));
      this.chatSystem.on('messageSent', (msg) => this.onMessageReceived(msg));
    }
  }

  renderTabs() {
    const channels = [
      { id: ChatChannel.WORLD, label: '世界' },
      { id: ChatChannel.MAP, label: '地图' },
      { id: ChatChannel.TEAM, label: '队伍' },
      { id: ChatChannel.GUILD, label: '公会' },
      { id: ChatChannel.SYSTEM, label: '系统' }
    ];

    this.tabBar.innerHTML = channels.map(ch => `
      <button class="chat-tab" data-channel="${ch.id}" style="
        padding: 6px 12px;
        background: ${this.currentChannel === ch.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};
        border: none;
        border-bottom: ${this.currentChannel === ch.id ? `2px solid ${this.channelColors[ch.id]}` : '2px solid transparent'};
        color: ${this.channelColors[ch.id]};
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
      ">${ch.label}</button>
    `).join('');

    this.tabBar.querySelectorAll('.chat-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentChannel = btn.dataset.channel;
        this.refresh();
      });
    });
  }

  renderMessages() {
    const messages = this.chatSystem?.getMessages(this.currentChannel, 50) || [];
    
    this.messageArea.innerHTML = messages.map(msg => {
      const color = this.channelColors[msg.channel] || '#fff';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      
      if (msg.type === ChatMessageType.SYSTEM) {
        return `<div style="color: ${color}; margin-bottom: 4px; font-style: italic;">[${time}] ${msg.content}</div>`;
      }
      
      return `
        <div style="margin-bottom: 4px;">
          <span style="color: #7f8c8d; font-size: 11px;">[${time}]</span>
          <span style="color: ${color}; font-weight: bold;">${msg.senderName}</span>
          <span style="color: #bdc3c7;">: ${msg.content}</span>
        </div>
      `;
    }).join('');

    this.messageArea.scrollTop = this.messageArea.scrollHeight;
  }

  refresh() {
    this.renderTabs();
    this.renderMessages();
  }

  sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    
    if (!content) return;
    
    const result = this.chatSystem?.sendMessage({
      channel: this.currentChannel,
      senderId: this.playerId,
      senderName: this.playerName,
      content
    });
    
    if (result?.success) {
      input.value = '';
    } else if (result?.error) {
      console.warn('发送失败:', result.error);
    }
  }

  onMessageReceived(message) {
    if (message.channel === this.currentChannel || message.channel === ChatChannel.SYSTEM) {
      this.renderMessages();
    }
  }

  show() {
    this.container.style.display = 'flex';
    this.isVisible = true;
  }

  hide() {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.container.style.height = this.isMinimized ? '40px' : '300px';
    this.messageArea.style.display = this.isMinimized ? 'none' : 'block';
    this.tabBar.style.display = this.isMinimized ? 'none' : 'flex';
    this.container.querySelector('div:last-child').style.display = this.isMinimized ? 'none' : 'flex';
  }

  destroy() {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
