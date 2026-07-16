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
 * NetworkManager.js
 * 网络管理器 - 管理游戏网络通信和状态同步
 */

import { WebSocketClient, ConnectionState, MessageType } from './WebSocketClient.js';

/**
 * 网络管理器类
 */
export class NetworkManager {
  constructor(config = {}) {
    this.client = new WebSocketClient(config);
    this.playerId = null;
    this.sessionId = null;
    this.isAuthenticated = false;
    
    // 玩家同步
    this.remotePlayers = new Map();
    this.localPlayerState = null;
    this.syncInterval = config.syncInterval || 100;
    this.syncTimer = null;
    
    // 客户端预测
    this.predictionEnabled = config.predictionEnabled !== false;
    this.pendingInputs = [];
    this.inputSequence = 0;
    
    // 事件监听器
    this.listeners = new Map();
    
    this.setupMessageHandlers();
  }

  /**
   * 设置消息处理器
   */
  setupMessageHandlers() {
    // 认证响应
    this.client.onMessage(MessageType.AUTH_RESPONSE, (data) => {
      if (data.success) {
        this.playerId = data.playerId;
        this.sessionId = data.sessionId;
        this.isAuthenticated = true;
        this.emit('authenticated', data);
      } else {
        this.emit('authFailed', data);
      }
    });

    // 玩家加入
    this.client.onMessage(MessageType.PLAYER_JOIN, (data) => {
      this.remotePlayers.set(data.playerId, {
        id: data.playerId,
        name: data.name,
        position: data.position,
        state: data.state,
        lastUpdate: Date.now()
      });
      this.emit('playerJoin', data);
    });

    // 玩家离开
    this.client.onMessage(MessageType.PLAYER_LEAVE, (data) => {
      this.remotePlayers.delete(data.playerId);
      this.emit('playerLeave', data);
    });

    // 玩家移动
    this.client.onMessage(MessageType.PLAYER_MOVE, (data) => {
      if (data.playerId !== this.playerId) {
        const player = this.remotePlayers.get(data.playerId);
        if (player) {
          player.position = data.position;
          player.velocity = data.velocity;
          player.lastUpdate = Date.now();
        }
      }
    });

    // 玩家同步
    this.client.onMessage(MessageType.PLAYER_SYNC, (data) => {
      if (data.playerId === this.playerId && this.predictionEnabled) {
        this.reconcileState(data);
      } else {
        const player = this.remotePlayers.get(data.playerId);
        if (player) {
          Object.assign(player, data.state);
          player.lastUpdate = Date.now();
        }
      }
    });

    // 战斗消息
    this.client.onMessage(MessageType.COMBAT_ACTION, (data) => {
      this.emit('combatAction', data);
    });

    this.client.onMessage(MessageType.COMBAT_RESULT, (data) => {
      this.emit('combatResult', data);
    });

    // 聊天消息
    this.client.onMessage(MessageType.CHAT_MESSAGE, (data) => {
      this.emit('chatMessage', data);
    });

    // 世界事件
    this.client.onMessage(MessageType.WORLD_EVENT, (data) => {
      this.emit('worldEvent', data);
    });

    // 实体生成/消失
    this.client.onMessage(MessageType.ENTITY_SPAWN, (data) => {
      this.emit('entitySpawn', data);
    });

    this.client.onMessage(MessageType.ENTITY_DESPAWN, (data) => {
      this.emit('entityDespawn', data);
    });

    // 错误处理
    this.client.onMessage(MessageType.ERROR, (data) => {
      this.emit('serverError', data);
    });

    // 连接事件
    this.client.on('connected', () => this.emit('connected'));
    this.client.on('disconnected', (data) => this.emit('disconnected', data));
    this.client.on('reconnecting', (data) => this.emit('reconnecting', data));
    this.client.on('error', (data) => this.emit('error', data));
    this.client.on('latencyUpdate', (latency) => this.emit('latencyUpdate', latency));
  }

  /**
   * 连接到服务器
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async connect(url) {
    return this.client.connect(url);
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.stopSync();
    this.client.disconnect();
    this.isAuthenticated = false;
    this.remotePlayers.clear();
  }

  /**
   * 认证
   * @param {Object} credentials
   * @returns {Promise}
   */
  authenticate(credentials) {
    return this.client.send(MessageType.AUTH, credentials, true);
  }

  /**
   * 开始状态同步
   */
  startSync() {
    this.stopSync();
    this.syncTimer = setInterval(() => {
      if (this.localPlayerState && this.isAuthenticated) {
        this.sendPlayerState();
      }
    }, this.syncInterval);
  }

  /**
   * 停止状态同步
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * 更新本地玩家状态
   * @param {Object} state
   */
  updateLocalPlayer(state) {
    this.localPlayerState = { ...this.localPlayerState, ...state };
  }

  /**
   * 发送玩家状态
   */
  sendPlayerState() {
    if (!this.localPlayerState) return;
    
    this.client.send(MessageType.PLAYER_SYNC, {
      playerId: this.playerId,
      state: this.localPlayerState,
      sequence: this.inputSequence
    });
  }

  /**
   * 发送玩家移动
   * @param {Object} position
   * @param {Object} velocity
   */
  sendMove(position, velocity) {
    if (this.predictionEnabled) {
      this.pendingInputs.push({
        sequence: ++this.inputSequence,
        position,
        velocity,
        timestamp: Date.now()
      });
    }
    
    this.client.send(MessageType.PLAYER_MOVE, {
      playerId: this.playerId,
      position,
      velocity,
      sequence: this.inputSequence
    });
  }

  /**
   * 发送玩家动作
   * @param {string} action
   * @param {Object} data
   */
  sendAction(action, data = {}) {
    this.client.send(MessageType.PLAYER_ACTION, {
      playerId: this.playerId,
      action,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 发送战斗动作
   * @param {Object} action
   */
  sendCombatAction(action) {
    this.client.send(MessageType.COMBAT_ACTION, {
      playerId: this.playerId,
      ...action
    });
  }

  /**
   * 发送聊天消息
   * @param {string} channel
   * @param {string} message
   */
  sendChatMessage(channel, message) {
    this.client.send(MessageType.CHAT_MESSAGE, {
      playerId: this.playerId,
      channel,
      message,
      timestamp: Date.now()
    });
  }

  /**
   * 状态校正（服务器权威）
   * @param {Object} serverState
   */
  reconcileState(serverState) {
    // 移除已确认的输入
    this.pendingInputs = this.pendingInputs.filter(
      input => input.sequence > serverState.lastProcessedInput
    );
    
    // 从服务器状态开始重新应用未确认的输入
    let reconciledState = { ...serverState.state };
    
    for (const input of this.pendingInputs) {
      reconciledState = this.applyInput(reconciledState, input);
    }
    
    this.localPlayerState = reconciledState;
    this.emit('stateReconciled', reconciledState);
  }

  /**
   * 应用输入到状态
   * @param {Object} state
   * @param {Object} input
   * @returns {Object}
   */
  applyInput(state, input) {
    return {
      ...state,
      position: input.position,
      velocity: input.velocity
    };
  }

  /**
   * 获取远程玩家
   * @param {string} playerId
   * @returns {Object|null}
   */
  getRemotePlayer(playerId) {
    return this.remotePlayers.get(playerId) || null;
  }

  /**
   * 获取所有远程玩家
   * @returns {Object[]}
   */
  getAllRemotePlayers() {
    return Array.from(this.remotePlayers.values());
  }

  /**
   * 插值远程玩家位置
   * @param {string} playerId
   * @param {number} renderTime
   * @returns {Object|null}
   */
  interpolatePlayer(playerId, renderTime) {
    const player = this.remotePlayers.get(playerId);
    if (!player || !player.positionHistory) return player?.position;
    
    const history = player.positionHistory;
    if (history.length < 2) return player.position;
    
    // 找到两个用于插值的状态
    let before = null, after = null;
    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].timestamp <= renderTime && history[i + 1].timestamp >= renderTime) {
        before = history[i];
        after = history[i + 1];
        break;
      }
    }
    
    if (!before || !after) return player.position;
    
    const t = (renderTime - before.timestamp) / (after.timestamp - before.timestamp);
    return {
      x: before.position.x + (after.position.x - before.position.x) * t,
      y: before.position.y + (after.position.y - before.position.y) * t
    };
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
   */
  getConnectionState() {
    return this.client.getState();
  }

  /**
   * 检查是否已连接
   */
  isConnected() {
    return this.client.isConnected();
  }

  /**
   * 获取延迟
   */
  getLatency() {
    return this.client.latency;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.client.getStats(),
      playerId: this.playerId,
      isAuthenticated: this.isAuthenticated,
      remotePlayers: this.remotePlayers.size,
      pendingInputs: this.pendingInputs.length
    };
  }
}
