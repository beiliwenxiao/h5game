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
 * FriendSystem - 好友系统
 * 实现好友添加、删除、搜索、在线状态等功能
 */

/**
 * 好友状态枚举
 */
export const FriendStatus = {
  OFFLINE: 'offline',
  ONLINE: 'online',
  BUSY: 'busy',
  AWAY: 'away',
  IN_GAME: 'in_game',
  IN_DUNGEON: 'in_dungeon'
};

/**
 * 好友请求状态
 */
export const FriendRequestStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/**
 * 好友分组类型
 */
export const FriendGroupType = {
  DEFAULT: 'default',
  CLOSE_FRIENDS: 'close_friends',
  GUILD_MEMBERS: 'guild_members',
  TEAM_MEMBERS: 'team_members',
  BLOCKED: 'blocked'
};

/**
 * 好友数据类
 */
export class Friend {
  constructor(data = {}) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.level = data.level || 1;
    this.class = data.class || 'warrior';
    this.status = data.status || FriendStatus.OFFLINE;
    this.lastOnline = data.lastOnline || Date.now();
    this.group = data.group || FriendGroupType.DEFAULT;
    this.note = data.note || '';
    this.addedAt = data.addedAt || Date.now();
    this.location = data.location || '';
    this.avatar = data.avatar || null;
    this.intimacy = data.intimacy || 0; // 亲密度
  }

  /**
   * 是否在线
   */
  isOnline() {
    return this.status !== FriendStatus.OFFLINE;
  }

  /**
   * 获取状态显示文本
   */
  getStatusText() {
    const statusTexts = {
      [FriendStatus.OFFLINE]: '离线',
      [FriendStatus.ONLINE]: '在线',
      [FriendStatus.BUSY]: '忙碌',
      [FriendStatus.AWAY]: '离开',
      [FriendStatus.IN_GAME]: '游戏中',
      [FriendStatus.IN_DUNGEON]: '副本中'
    };
    return statusTexts[this.status] || '未知';
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      level: this.level,
      class: this.class,
      status: this.status,
      lastOnline: this.lastOnline,
      group: this.group,
      note: this.note,
      addedAt: this.addedAt,
      location: this.location,
      avatar: this.avatar,
      intimacy: this.intimacy
    };
  }
}

/**
 * 好友请求类
 */
export class FriendRequest {
  constructor(data = {}) {
    this.id = data.id || `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.fromId = data.fromId || '';
    this.fromName = data.fromName || '';
    this.fromLevel = data.fromLevel || 1;
    this.fromClass = data.fromClass || 'warrior';
    this.toId = data.toId || '';
    this.message = data.message || '';
    this.status = data.status || FriendRequestStatus.PENDING;
    this.createdAt = data.createdAt || Date.now();
    this.expiresAt = data.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天过期
  }

  /**
   * 是否已过期
   */
  isExpired() {
    return Date.now() > this.expiresAt;
  }

  /**
   * 是否待处理
   */
  isPending() {
    return this.status === FriendRequestStatus.PENDING && !this.isExpired();
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      id: this.id,
      fromId: this.fromId,
      fromName: this.fromName,
      fromLevel: this.fromLevel,
      fromClass: this.fromClass,
      toId: this.toId,
      message: this.message,
      status: this.status,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt
    };
  }
}

/**
 * 好友系统主类
 */
export class FriendSystem {
  constructor() {
    this.friends = new Map(); // 好友列表 id -> Friend
    this.requests = new Map(); // 好友请求 id -> FriendRequest
    this.groups = new Map(); // 好友分组 groupType -> Set<friendId>
    this.blocked = new Set(); // 黑名单
    this.currentPlayerId = '';
    this.maxFriends = 100;
    this.maxBlocked = 50;
    this.eventListeners = new Map();
    
    // 初始化默认分组
    this.initializeGroups();
  }

  /**
   * 初始化好友分组
   */
  initializeGroups() {
    Object.values(FriendGroupType).forEach(group => {
      this.groups.set(group, new Set());
    });
  }

  /**
   * 设置当前玩家ID
   */
  setCurrentPlayer(playerId) {
    this.currentPlayerId = playerId;
  }

  /**
   * 添加好友
   */
  addFriend(friendData) {
    if (this.friends.size >= this.maxFriends) {
      this.emit('error', { message: '好友数量已达上限' });
      return false;
    }

    if (this.friends.has(friendData.id)) {
      this.emit('error', { message: '该玩家已是您的好友' });
      return false;
    }

    if (this.blocked.has(friendData.id)) {
      this.emit('error', { message: '该玩家在您的黑名单中' });
      return false;
    }

    const friend = new Friend(friendData);
    this.friends.set(friend.id, friend);
    this.groups.get(friend.group).add(friend.id);
    
    this.emit('friendAdded', { friend });
    return true;
  }

  /**
   * 删除好友
   */
  removeFriend(friendId) {
    const friend = this.friends.get(friendId);
    if (!friend) {
      this.emit('error', { message: '好友不存在' });
      return false;
    }

    this.friends.delete(friendId);
    this.groups.get(friend.group).delete(friendId);
    
    this.emit('friendRemoved', { friendId, friend });
    return true;
  }

  /**
   * 获取好友
   */
  getFriend(friendId) {
    return this.friends.get(friendId);
  }

  /**
   * 获取所有好友
   */
  getAllFriends() {
    return Array.from(this.friends.values());
  }

  /**
   * 获取在线好友
   */
  getOnlineFriends() {
    return this.getAllFriends().filter(f => f.isOnline());
  }

  /**
   * 获取分组好友
   */
  getFriendsByGroup(groupType) {
    const friendIds = this.groups.get(groupType);
    if (!friendIds) return [];
    return Array.from(friendIds).map(id => this.friends.get(id)).filter(Boolean);
  }

  /**
   * 移动好友到分组
   */
  moveFriendToGroup(friendId, newGroup) {
    const friend = this.friends.get(friendId);
    if (!friend) return false;

    // 从旧分组移除
    this.groups.get(friend.group).delete(friendId);
    
    // 添加到新分组
    friend.group = newGroup;
    this.groups.get(newGroup).add(friendId);
    
    this.emit('friendGroupChanged', { friendId, newGroup });
    return true;
  }

  /**
   * 设置好友备注
   */
  setFriendNote(friendId, note) {
    const friend = this.friends.get(friendId);
    if (!friend) return false;

    friend.note = note;
    this.emit('friendNoteChanged', { friendId, note });
    return true;
  }

  /**
   * 更新好友状态
   */
  updateFriendStatus(friendId, status, location = '') {
    const friend = this.friends.get(friendId);
    if (!friend) return false;

    const oldStatus = friend.status;
    friend.status = status;
    friend.location = location;
    
    if (status !== FriendStatus.OFFLINE) {
      friend.lastOnline = Date.now();
    }

    this.emit('friendStatusChanged', { friendId, oldStatus, newStatus: status, location });
    return true;
  }

  /**
   * 更新好友信息
   */
  updateFriendInfo(friendId, info) {
    const friend = this.friends.get(friendId);
    if (!friend) return false;

    if (info.level !== undefined) friend.level = info.level;
    if (info.class !== undefined) friend.class = info.class;
    if (info.avatar !== undefined) friend.avatar = info.avatar;
    if (info.location !== undefined) friend.location = info.location;

    this.emit('friendInfoUpdated', { friendId, info });
    return true;
  }

  /**
   * 增加亲密度
   */
  addIntimacy(friendId, amount) {
    const friend = this.friends.get(friendId);
    if (!friend) return false;

    friend.intimacy = Math.min(friend.intimacy + amount, 10000);
    this.emit('intimacyChanged', { friendId, intimacy: friend.intimacy });
    return true;
  }

  /**
   * 发送好友请求
   */
  sendFriendRequest(toId, toName, message = '') {
    if (this.friends.has(toId)) {
      this.emit('error', { message: '该玩家已是您的好友' });
      return null;
    }

    if (this.blocked.has(toId)) {
      this.emit('error', { message: '该玩家在您的黑名单中' });
      return null;
    }

    // 检查是否已有待处理的请求
    for (const request of this.requests.values()) {
      if (request.toId === toId && request.isPending()) {
        this.emit('error', { message: '已向该玩家发送过好友请求' });
        return null;
      }
    }

    const request = new FriendRequest({
      fromId: this.currentPlayerId,
      fromName: '当前玩家',
      toId,
      message
    });

    this.requests.set(request.id, request);
    this.emit('requestSent', { request });
    return request;
  }

  /**
   * 接收好友请求
   */
  receiveRequest(requestData) {
    const request = new FriendRequest(requestData);
    this.requests.set(request.id, request);
    this.emit('requestReceived', { request });
    return request;
  }

  /**
   * 接受好友请求
   */
  acceptRequest(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      this.emit('error', { message: '请求不存在' });
      return false;
    }

    if (!request.isPending()) {
      this.emit('error', { message: '请求已处理或已过期' });
      return false;
    }

    request.status = FriendRequestStatus.ACCEPTED;
    
    // 添加为好友
    this.addFriend({
      id: request.fromId,
      name: request.fromName,
      level: request.fromLevel,
      class: request.fromClass
    });

    this.emit('requestAccepted', { request });
    return true;
  }

  /**
   * 拒绝好友请求
   */
  rejectRequest(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      this.emit('error', { message: '请求不存在' });
      return false;
    }

    if (!request.isPending()) {
      this.emit('error', { message: '请求已处理或已过期' });
      return false;
    }

    request.status = FriendRequestStatus.REJECTED;
    this.emit('requestRejected', { request });
    return true;
  }

  /**
   * 获取待处理的请求
   */
  getPendingRequests() {
    return Array.from(this.requests.values()).filter(r => r.isPending());
  }

  /**
   * 清理过期请求
   */
  cleanExpiredRequests() {
    const now = Date.now();
    for (const [id, request] of this.requests) {
      if (request.isExpired() && request.status === FriendRequestStatus.PENDING) {
        request.status = FriendRequestStatus.EXPIRED;
        this.emit('requestExpired', { request });
      }
    }
  }

  /**
   * 添加到黑名单
   */
  blockPlayer(playerId) {
    if (this.blocked.size >= this.maxBlocked) {
      this.emit('error', { message: '黑名单已满' });
      return false;
    }

    // 如果是好友，先删除
    if (this.friends.has(playerId)) {
      this.removeFriend(playerId);
    }

    this.blocked.add(playerId);
    this.emit('playerBlocked', { playerId });
    return true;
  }

  /**
   * 从黑名单移除
   */
  unblockPlayer(playerId) {
    if (!this.blocked.has(playerId)) {
      return false;
    }

    this.blocked.delete(playerId);
    this.emit('playerUnblocked', { playerId });
    return true;
  }

  /**
   * 检查是否在黑名单
   */
  isBlocked(playerId) {
    return this.blocked.has(playerId);
  }

  /**
   * 获取黑名单列表
   */
  getBlockedList() {
    return Array.from(this.blocked);
  }

  /**
   * 搜索好友
   */
  searchFriends(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return this.getAllFriends().filter(friend => 
      friend.name.toLowerCase().includes(lowerKeyword) ||
      friend.note.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * 排序好友列表
   */
  getSortedFriends(sortBy = 'status') {
    const friends = this.getAllFriends();
    
    switch (sortBy) {
      case 'status':
        return friends.sort((a, b) => {
          if (a.isOnline() && !b.isOnline()) return -1;
          if (!a.isOnline() && b.isOnline()) return 1;
          return a.name.localeCompare(b.name);
        });
      case 'name':
        return friends.sort((a, b) => a.name.localeCompare(b.name));
      case 'level':
        return friends.sort((a, b) => b.level - a.level);
      case 'intimacy':
        return friends.sort((a, b) => b.intimacy - a.intimacy);
      case 'lastOnline':
        return friends.sort((a, b) => b.lastOnline - a.lastOnline);
      default:
        return friends;
    }
  }

  /**
   * 获取好友统计
   */
  getStatistics() {
    const friends = this.getAllFriends();
    const online = friends.filter(f => f.isOnline());
    
    return {
      total: friends.length,
      online: online.length,
      offline: friends.length - online.length,
      maxFriends: this.maxFriends,
      blocked: this.blocked.size,
      pendingRequests: this.getPendingRequests().length
    };
  }

  /**
   * 检查是否是好友
   */
  isFriend(playerId) {
    return this.friends.has(playerId);
  }

  /**
   * 事件监听
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * 移除事件监听
   */
  off(event, callback) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      friends: Array.from(this.friends.values()).map(f => f.toJSON()),
      requests: Array.from(this.requests.values()).map(r => r.toJSON()),
      blocked: Array.from(this.blocked),
      currentPlayerId: this.currentPlayerId
    };
  }

  /**
   * 从JSON恢复
   */
  fromJSON(data) {
    this.friends.clear();
    this.requests.clear();
    this.blocked.clear();
    this.initializeGroups();

    if (data.friends) {
      data.friends.forEach(f => {
        const friend = new Friend(f);
        this.friends.set(friend.id, friend);
        this.groups.get(friend.group).add(friend.id);
      });
    }

    if (data.requests) {
      data.requests.forEach(r => {
        const request = new FriendRequest(r);
        this.requests.set(request.id, request);
      });
    }

    if (data.blocked) {
      data.blocked.forEach(id => this.blocked.add(id));
    }

    if (data.currentPlayerId) {
      this.currentPlayerId = data.currentPlayerId;
    }
  }

  /**
   * 重置系统
   */
  reset() {
    this.friends.clear();
    this.requests.clear();
    this.blocked.clear();
    this.initializeGroups();
    this.currentPlayerId = '';
  }
}
