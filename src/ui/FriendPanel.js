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
 * FriendPanel - 好友面板UI
 * 显示好友列表、好友请求、搜索等功能
 */

import { FriendStatus, FriendGroupType } from '../systems/FriendSystem.js';

export class FriendPanel {
  constructor(friendSystem, options = {}) {
    this.friendSystem = friendSystem;
    this.container = null;
    this.visible = false;
    this.currentTab = 'friends'; // friends, requests, blocked, search
    this.currentGroup = 'all';
    this.sortBy = 'status';
    this.searchKeyword = '';
    
    this.options = {
      width: 350,
      height: 500,
      x: 100,
      y: 100,
      ...options
    };

    this.init();
  }

  init() {
    this.createContainer();
    this.bindEvents();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.className = 'friend-panel';
    this.container.style.cssText = `
      position: fixed;
      left: ${this.options.x}px;
      top: ${this.options.y}px;
      width: ${this.options.width}px;
      height: ${this.options.height}px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #4a4a6a;
      border-radius: 10px;
      display: none;
      flex-direction: column;
      font-family: 'Microsoft YaHei', sans-serif;
      color: #fff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      z-index: 1000;
    `;

    this.container.innerHTML = `
      <div class="friend-header" style="
        padding: 15px;
        background: linear-gradient(90deg, #2d2d4a 0%, #1a1a2e 100%);
        border-radius: 8px 8px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <span style="font-size: 18px; font-weight: bold;">👥 好友</span>
        <div class="friend-stats" style="font-size: 12px; color: #aaa;"></div>
        <button class="close-btn" style="
          background: #e74c3c;
          border: none;
          color: white;
          width: 25px;
          height: 25px;
          border-radius: 50%;
          cursor: pointer;
        ">×</button>
      </div>

      <div class="friend-tabs" style="
        display: flex;
        padding: 10px;
        gap: 5px;
        background: #1a1a2e;
      ">
        <button class="tab-btn active" data-tab="friends" style="flex: 1;">好友</button>
        <button class="tab-btn" data-tab="requests" style="flex: 1;">请求</button>
        <button class="tab-btn" data-tab="blocked" style="flex: 1;">黑名单</button>
        <button class="tab-btn" data-tab="search" style="flex: 1;">搜索</button>
      </div>

      <div class="friend-toolbar" style="
        padding: 10px;
        display: flex;
        gap: 10px;
        background: #1a1a2e;
      ">
        <select class="group-filter" style="flex: 1; padding: 5px; border-radius: 5px;">
          <option value="all">全部</option>
          <option value="default">默认分组</option>
          <option value="close_friends">密友</option>
          <option value="guild_members">公会成员</option>
          <option value="team_members">队友</option>
        </select>
        <select class="sort-select" style="flex: 1; padding: 5px; border-radius: 5px;">
          <option value="status">按状态</option>
          <option value="name">按名字</option>
          <option value="level">按等级</option>
          <option value="intimacy">按亲密度</option>
        </select>
      </div>

      <div class="friend-content" style="
        flex: 1;
        overflow-y: auto;
        padding: 10px;
      "></div>

      <div class="friend-actions" style="
        padding: 10px;
        display: flex;
        gap: 10px;
        border-top: 1px solid #4a4a6a;
      ">
        <button class="action-btn add-friend-btn" style="flex: 1;">添加好友</button>
      </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .friend-panel .tab-btn {
        padding: 8px;
        border: none;
        background: #2d2d4a;
        color: #aaa;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.3s;
      }
      .friend-panel .tab-btn:hover {
        background: #3d3d5a;
      }
      .friend-panel .tab-btn.active {
        background: #4a90d9;
        color: white;
      }
      .friend-panel .action-btn {
        padding: 10px;
        border: none;
        background: #4a90d9;
        color: white;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.3s;
      }
      .friend-panel .action-btn:hover {
        background: #5aa0e9;
      }
      .friend-item {
        display: flex;
        align-items: center;
        padding: 10px;
        margin-bottom: 5px;
        background: #2d2d4a;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
      }
      .friend-item:hover {
        background: #3d3d5a;
      }
      .friend-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #4a4a6a;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 10px;
        font-size: 20px;
      }
      .friend-info {
        flex: 1;
      }
      .friend-name {
        font-weight: bold;
        margin-bottom: 3px;
      }
      .friend-details {
        font-size: 12px;
        color: #aaa;
      }
      .friend-status {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-left: 10px;
      }
      .status-online { background: #2ecc71; }
      .status-offline { background: #7f8c8d; }
      .status-busy { background: #e74c3c; }
      .status-away { background: #f39c12; }
      .status-in_game { background: #3498db; }
      .status-in_dungeon { background: #9b59b6; }
      .request-item {
        padding: 10px;
        margin-bottom: 5px;
        background: #2d2d4a;
        border-radius: 8px;
      }
      .request-actions {
        display: flex;
        gap: 10px;
        margin-top: 10px;
      }
      .request-actions button {
        flex: 1;
        padding: 8px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      }
      .accept-btn { background: #2ecc71; color: white; }
      .reject-btn { background: #e74c3c; color: white; }
      .search-input {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 5px;
        background: #2d2d4a;
        color: white;
        margin-bottom: 10px;
      }
      .friend-menu {
        position: absolute;
        background: #2d2d4a;
        border: 1px solid #4a4a6a;
        border-radius: 5px;
        padding: 5px 0;
        z-index: 1001;
      }
      .friend-menu-item {
        padding: 8px 15px;
        cursor: pointer;
        transition: background 0.3s;
      }
      .friend-menu-item:hover {
        background: #3d3d5a;
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(this.container);
  }

  bindEvents() {
    // 关闭按钮
    this.container.querySelector('.close-btn').addEventListener('click', () => {
      this.hide();
    });

    // 标签切换
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // 分组筛选
    this.container.querySelector('.group-filter').addEventListener('change', (e) => {
      this.currentGroup = e.target.value;
      this.render();
    });

    // 排序
    this.container.querySelector('.sort-select').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.render();
    });

    // 添加好友按钮
    this.container.querySelector('.add-friend-btn').addEventListener('click', () => {
      this.showAddFriendDialog();
    });

    // 系统事件
    this.friendSystem.on('friendAdded', () => this.render());
    this.friendSystem.on('friendRemoved', () => this.render());
    this.friendSystem.on('friendStatusChanged', () => this.render());
    this.friendSystem.on('requestReceived', () => this.render());
    this.friendSystem.on('requestAccepted', () => this.render());
    this.friendSystem.on('requestRejected', () => this.render());
  }

  switchTab(tab) {
    this.currentTab = tab;
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.render();
  }

  render() {
    this.updateStats();
    const content = this.container.querySelector('.friend-content');
    
    switch (this.currentTab) {
      case 'friends':
        this.renderFriendList(content);
        break;
      case 'requests':
        this.renderRequests(content);
        break;
      case 'blocked':
        this.renderBlocked(content);
        break;
      case 'search':
        this.renderSearch(content);
        break;
    }
  }

  updateStats() {
    const stats = this.friendSystem.getStatistics();
    this.container.querySelector('.friend-stats').textContent = 
      `${stats.online}/${stats.total} 在线`;
  }

  renderFriendList(content) {
    let friends;
    if (this.currentGroup === 'all') {
      friends = this.friendSystem.getSortedFriends(this.sortBy);
    } else {
      friends = this.friendSystem.getFriendsByGroup(this.currentGroup);
    }

    if (friends.length === 0) {
      content.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">暂无好友</div>';
      return;
    }

    content.innerHTML = friends.map(friend => this.renderFriendItem(friend)).join('');
    
    // 绑定点击事件
    content.querySelectorAll('.friend-item').forEach(item => {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showFriendMenu(e, item.dataset.friendId);
      });
    });
  }

  renderFriendItem(friend) {
    const classIcons = {
      warrior: '⚔️',
      mage: '🔮',
      archer: '🏹',
      priest: '✨'
    };

    return `
      <div class="friend-item" data-friend-id="${friend.id}">
        <div class="friend-avatar">${classIcons[friend.class] || '👤'}</div>
        <div class="friend-info">
          <div class="friend-name">${friend.name}${friend.note ? ` (${friend.note})` : ''}</div>
          <div class="friend-details">
            Lv.${friend.level} ${friend.location || friend.getStatusText()}
          </div>
        </div>
        <div class="friend-status status-${friend.status}"></div>
      </div>
    `;
  }

  renderRequests(content) {
    const requests = this.friendSystem.getPendingRequests();

    if (requests.length === 0) {
      content.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">暂无好友请求</div>';
      return;
    }

    content.innerHTML = requests.map(request => `
      <div class="request-item" data-request-id="${request.id}">
        <div style="display: flex; align-items: center;">
          <div class="friend-avatar">👤</div>
          <div class="friend-info">
            <div class="friend-name">${request.fromName}</div>
            <div class="friend-details">Lv.${request.fromLevel}</div>
          </div>
        </div>
        ${request.message ? `<div style="margin-top: 5px; color: #aaa; font-size: 12px;">"${request.message}"</div>` : ''}
        <div class="request-actions">
          <button class="accept-btn" data-request-id="${request.id}">接受</button>
          <button class="reject-btn" data-request-id="${request.id}">拒绝</button>
        </div>
      </div>
    `).join('');

    // 绑定按钮事件
    content.querySelectorAll('.accept-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.friendSystem.acceptRequest(btn.dataset.requestId);
      });
    });

    content.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.friendSystem.rejectRequest(btn.dataset.requestId);
      });
    });
  }

  renderBlocked(content) {
    const blocked = this.friendSystem.getBlockedList();

    if (blocked.length === 0) {
      content.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">黑名单为空</div>';
      return;
    }

    content.innerHTML = blocked.map(playerId => `
      <div class="friend-item" data-player-id="${playerId}">
        <div class="friend-avatar">🚫</div>
        <div class="friend-info">
          <div class="friend-name">${playerId}</div>
        </div>
        <button class="unblock-btn" data-player-id="${playerId}" style="
          padding: 5px 10px;
          background: #e74c3c;
          border: none;
          color: white;
          border-radius: 5px;
          cursor: pointer;
        ">解除</button>
      </div>
    `).join('');

    content.querySelectorAll('.unblock-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.friendSystem.unblockPlayer(btn.dataset.playerId);
        this.render();
      });
    });
  }

  renderSearch(content) {
    content.innerHTML = `
      <input type="text" class="search-input" placeholder="输入好友名称搜索..." value="${this.searchKeyword}">
      <div class="search-results"></div>
    `;

    const input = content.querySelector('.search-input');
    const results = content.querySelector('.search-results');

    input.addEventListener('input', (e) => {
      this.searchKeyword = e.target.value;
      if (this.searchKeyword.length > 0) {
        const friends = this.friendSystem.searchFriends(this.searchKeyword);
        results.innerHTML = friends.length > 0 
          ? friends.map(f => this.renderFriendItem(f)).join('')
          : '<div style="text-align: center; color: #aaa;">未找到匹配的好友</div>';
      } else {
        results.innerHTML = '';
      }
    });
  }

  showFriendMenu(event, friendId) {
    // 移除已有菜单
    document.querySelectorAll('.friend-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'friend-menu';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';

    menu.innerHTML = `
      <div class="friend-menu-item" data-action="chat">💬 私聊</div>
      <div class="friend-menu-item" data-action="invite">📨 邀请组队</div>
      <div class="friend-menu-item" data-action="note">📝 设置备注</div>
      <div class="friend-menu-item" data-action="group">📁 移动分组</div>
      <div class="friend-menu-item" data-action="block">🚫 加入黑名单</div>
      <div class="friend-menu-item" data-action="delete" style="color: #e74c3c;">❌ 删除好友</div>
    `;

    document.body.appendChild(menu);

    menu.querySelectorAll('.friend-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        this.handleMenuAction(item.dataset.action, friendId);
        menu.remove();
      });
    });

    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
  }

  handleMenuAction(action, friendId) {
    switch (action) {
      case 'chat':
        this.emit('startChat', { friendId });
        break;
      case 'invite':
        this.emit('inviteToTeam', { friendId });
        break;
      case 'note':
        this.showNoteDialog(friendId);
        break;
      case 'group':
        this.showGroupDialog(friendId);
        break;
      case 'block':
        if (confirm('确定要将该好友加入黑名单吗？')) {
          this.friendSystem.blockPlayer(friendId);
        }
        break;
      case 'delete':
        if (confirm('确定要删除该好友吗？')) {
          this.friendSystem.removeFriend(friendId);
        }
        break;
    }
  }

  showAddFriendDialog() {
    const playerId = prompt('请输入要添加的玩家ID:');
    if (playerId) {
      const message = prompt('附言（可选）:') || '';
      this.friendSystem.sendFriendRequest(playerId, playerId, message);
    }
  }

  showNoteDialog(friendId) {
    const friend = this.friendSystem.getFriend(friendId);
    const note = prompt('设置备注:', friend?.note || '');
    if (note !== null) {
      this.friendSystem.setFriendNote(friendId, note);
      this.render();
    }
  }

  showGroupDialog(friendId) {
    const groups = [
      { value: 'default', label: '默认分组' },
      { value: 'close_friends', label: '密友' },
      { value: 'guild_members', label: '公会成员' },
      { value: 'team_members', label: '队友' }
    ];

    const group = prompt(`选择分组:\n${groups.map((g, i) => `${i + 1}. ${g.label}`).join('\n')}\n请输入数字:`);
    if (group && groups[parseInt(group) - 1]) {
      this.friendSystem.moveFriendToGroup(friendId, groups[parseInt(group) - 1].value);
      this.render();
    }
  }

  show() {
    this.visible = true;
    this.container.style.display = 'flex';
    this.render();
  }

  hide() {
    this.visible = false;
    this.container.style.display = 'none';
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  // 简单的事件发射
  emit(event, data) {
    const customEvent = new CustomEvent(`friendPanel:${event}`, { detail: data });
    document.dispatchEvent(customEvent);
  }

  destroy() {
    if (this.container) {
      this.container.remove();
    }
  }
}
