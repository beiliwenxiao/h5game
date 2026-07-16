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
 * WebSocketClient.js
 * WebSocket客户端 - 管理与服务器的实时通信
 */

/**
 * 连接状态枚举
 */
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

/**
 * 消息类型枚举
 */
export const MessageType = {
  // 系统消息
  PING: 'ping',
  PONG: 'pong',
  AUTH: 'auth',
  AUTH_RESPONSE: 'auth_response',
  
  // 玩家消息
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  PLAYER_MOVE: 'player_move',
  PLAYER_ACTION: 'player_action',
  PLAYER_SYNC: 'player_sync',
  
  // 战斗消息
  COMBAT_START: 'combat_start',
  COMBAT_ACTION: 'combat_action',
  COMBAT_RESULT: 'combat_result',
  COMBAT_END: 'combat_end',
  
  // 聊天消息
  CHAT_MESSAGE: 'chat_message',
  CHAT_PRIVATE: 'chat_private',
  
  // 世界消息
  WORLD_EVENT: 'world_event',
  ENTITY_SPAWN: 'entity_spawn',
  ENTITY_DESPAWN: 'entity_despawn',
  
  // 错误消息
  ERROR: 'error'
};

/**
 * WebSocket客户端类
 */
export class WebSocketClient {
  constructor(config = {}) {
    this.url = config.url || 'ws://localhost:8080';
    this.socket = null;
    this.state = ConnectionState.DISCONNECTED;
    
    // 重连配置
    this.autoReconnect = config.autoReconnect !== false;
    this.reconnectInterval = config.reconnectInterval || 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    
    // 心跳配置
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    this.heartbeatTimer = null;
    this.lastPongTime = 0;
    this.heartbeatTimeout = config.heartbeatTimeout || 10000;
    
    // 消息队列
    this.messageQueue = [];
    this.maxQueueSize = config.maxQueueSize || 100;
    this.pendingMessages = new Map();
    this.messageId = 0;
    
    // 事件监听器
    this.listeners = new Map();
    this.messageHandlers = new Map();
    
    // 延迟统计
    this.latency = 0;
    this.latencyHistory = [];
    this.maxLatencyHistory = 10;
  }

  /**
   * 连接到服务器
   * @param {string} url - 可选，覆盖默认URL
   * @returns {Promise<boolean>}
   */
  connect(url = null) {
    return new Promise((resolve, reject) => {
      if (this.state === ConnectionState.CONNECTED) {
        resolve(true);
        return;
      }
      
      if (url) this.url = url;
      
      this.state = ConnectionState.CONNECTING;
      this.emit('stateChange', this.state);
      
      try {
        this.socket = new WebSocket(this.url);
        
        this.socket.onopen = () => {
          this.state = ConnectionState.CONNECTED;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.flushMessageQueue();
          this.emit('connected');
          this.emit('stateChange', this.state);
          resolve(true);
        };
        
        this.socket.onclose = (event) => {
          this.handleDisconnect(event);
        };
        
        this.socket.onerror = (error) => {
          this.state = ConnectionState.ERROR;
          this.emit('error', error);
          this.emit('stateChange', this.state);
          reject(error);
        };
        
        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };
      } catch (error) {
        this.state = ConnectionState.ERROR;
        this.emit('error', error);
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.autoReconnect = false;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.state = ConnectionState.DISCONNECTED;
    this.emit('disconnected');
    this.emit('stateChange', this.state);
  }

  /**
   * 处理断开连接
   * @param {CloseEvent} event
   */
  handleDisconnect(event) {
    this.stopHeartbeat();
    this.state = ConnectionState.DISCONNECTED;
    this.emit('disconnected', { code: event.code, reason: event.reason });
    this.emit('stateChange', this.state);
    
    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * 安排重连
   */
  scheduleReconnect() {
    this.clearReconnectTimer();
    this.state = ConnectionState.RECONNECTING;
    this.emit('stateChange', this.state);
    
    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.emit('reconnecting', { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts });
      this.connect().catch(() => {});
    }, Math.min(delay, 30000));
  }

  /**
   * 清除重连定时器
   */
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 开始心跳
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongTime = Date.now();
    
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastPongTime > this.heartbeatTimeout) {
        this.emit('heartbeatTimeout');
        this.socket?.close();
        return;
      }
      
      this.send(MessageType.PING, { timestamp: Date.now() });
    }, this.heartbeatInterval);
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 处理接收到的消息
   * @param {MessageEvent} event
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      const { type, data, id } = message;
      
      // 处理心跳响应
      if (type === MessageType.PONG) {
        this.lastPongTime = Date.now();
        this.updateLatency(data.timestamp);
        return;
      }
      
      // 处理待确认消息
      if (id && this.pendingMessages.has(id)) {
        const { resolve } = this.pendingMessages.get(id);
        this.pendingMessages.delete(id);
        resolve(data);
      }
      
      // 触发消息处理器
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.forEach(handler => handler(data, message));
      }
      
      // 触发通用消息事件
      this.emit('message', message);
      
    } catch (error) {
      this.emit('error', { type: 'parse_error', error });
    }
  }

  /**
   * 更新延迟统计
   * @param {number} sentTime
   */
  updateLatency(sentTime) {
    this.latency = Date.now() - sentTime;
    this.latencyHistory.push(this.latency);
    
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }
    
    this.emit('latencyUpdate', this.latency);
  }

  /**
   * 获取平均延迟
   * @returns {number}
   */
  getAverageLatency() {
    if (this.latencyHistory.length === 0) return 0;
    return Math.round(this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length);
  }

  /**
   * 发送消息
   * @param {string} type - 消息类型
   * @param {Object} data - 消息数据
   * @param {boolean} reliable - 是否需要确认
   * @returns {Promise|void}
   */
  send(type, data = {}, reliable = false) {
    const message = {
      type,
      data,
      timestamp: Date.now()
    };
    
    if (reliable) {
      message.id = ++this.messageId;
      return new Promise((resolve, reject) => {
        this.pendingMessages.set(message.id, { resolve, reject, timestamp: Date.now() });
        this.sendRaw(message);
        
        // 超时处理
        setTimeout(() => {
          if (this.pendingMessages.has(message.id)) {
            this.pendingMessages.delete(message.id);
            reject(new Error('Message timeout'));
          }
        }, 10000);
      });
    }
    
    this.sendRaw(message);
  }

  /**
   * 发送原始消息
   * @param {Object} message
   */
  sendRaw(message) {
    if (this.state !== ConnectionState.CONNECTED) {
      this.queueMessage(message);
      return;
    }
    
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      this.queueMessage(message);
      this.emit('error', { type: 'send_error', error });
    }
  }

  /**
   * 将消息加入队列
   * @param {Object} message
   */
  queueMessage(message) {
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift();
    }
    this.messageQueue.push(message);
  }

  /**
   * 发送队列中的消息
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.state === ConnectionState.CONNECTED) {
      const message = this.messageQueue.shift();
      this.sendRaw(message);
    }
  }

  /**
   * 注册消息处理器
   * @param {string} type
   * @param {Function} handler
   */
  onMessage(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  /**
   * 移除消息处理器
   * @param {string} type
   * @param {Function} handler
   */
  offMessage(type, handler) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
    }
  }

  /**
   * 添加事件监听器
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);
  }

  /**
   * 移除事件监听器
   */
  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) callbacks.splice(index, 1);
    }
  }

  /**
   * 触发事件
   */
  emit(eventName, data) {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  /**
   * 获取连接状态
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * 检查是否已连接
   * @returns {boolean}
   */
  isConnected() {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      state: this.state,
      latency: this.latency,
      averageLatency: this.getAverageLatency(),
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      pendingMessages: this.pendingMessages.size
    };
  }
}
