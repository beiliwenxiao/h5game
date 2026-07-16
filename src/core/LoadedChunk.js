/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-07-16
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * LoadedChunk - 已加载的地图块
 *
 * 管理一个 chunk 内的实体（NPC/敌人/装饰物/建筑/载具）的实例化、渲染和状态持久化。
 * 由 WorldStreamingManager 创建和销毁。
 *
 * 坐标约定：
 * - chunk 数据（来自编辑器）使用**局部坐标**（相对 chunk 左上角）
 * - 实例化时转为**世界坐标**（+= origin）
 * - 渲染时由相机变换处理（与其他实体一致）
 */
export class LoadedChunk {
  /**
   * @param {Object} options
   * @param {number} options.col - chunk 网格列
   * @param {number} options.row - chunk 网格行
   * @param {string} options.sceneId - 对应编辑器场景 ID
   * @param {{x: number, y: number}} options.origin - chunk 世界坐标原点
   * @param {Object} [options.sceneData] - 编辑器场景数据（layers/objects/terrain）
   * @param {Object} [options.savedState] - 之前卸载时保存的状态
   */
  constructor(options = {}) {
    this.col = options.col;
    this.row = options.row;
    this.sceneId = options.sceneId;
    this.origin = options.origin || { x: 0, y: 0 };
    this.sceneData = options.sceneData || null;

    // 本 chunk 管理的实体 ID 列表（世界 entities 数组中的引用）
    this.entityIds = [];

    // 装饰物渲染队列（世界坐标）
    this.decorations = [];

    // 动态状态（拾取/死怪/开关/NPC位置）
    this._state = {
      pickedItems: [],    // 已拾取的物品 ID
      killedEnemies: [],  // 已死亡的敌人 ID
      switches: {},       // 开关状态 { switchId: boolean }
      npcPositions: {}    // NPC 位置覆盖 { npcId: {x, y} }
    };

    // 恢复之前保存的状态
    if (options.savedState) {
      this.restoreState(options.savedState);
    }
  }

  /**
   * 实例化 chunk 内的实体（从 sceneData 创建世界坐标实体）
   * @param {EntityFactory} entityFactory
   * @param {Array} worldEntities - 全局实体数组（push 进去）
   * @param {Object} [registries] - 定义注册表
   */
  instantiate(entityFactory, worldEntities, registries) {
    if (!this.sceneData) return;

    const ox = this.origin.x;
    const oy = this.origin.y;

    // 从场景 layers 中提取可实例化的逻辑对象
    const layers = this.sceneData.layers || [];
    for (const layer of layers) {
      if (!layer || !layer.objects || layer.visible === false) continue;
      for (const obj of layer.objects) {
        if (!obj) continue;

        // 跳过已被消灭/已拾取的对象
        if (obj.type === 'ref' && obj.kind === 'enemy' && this._state.killedEnemies.includes(obj.ref)) continue;
        if (obj.type === 'ref' && obj.kind === 'item' && this._state.pickedItems.includes(obj.ref)) continue;

        // 逻辑对象：type='ref' 引用内容库定义
        if (obj.type === 'ref') {
          const worldX = (obj.x || 0) + ox;
          const worldY = (obj.y || 0) + oy;
          // 恢复 NPC 位置
          if (obj.kind === 'npc' && this._state.npcPositions[obj.ref]) {
            const pos = this._state.npcPositions[obj.ref];
            // 使用保存的位置而非默认位置
          }
          // TODO: 按 kind 调用 entityFactory 创建实体
          // entityFactory.createFromLibrary(obj.kind, obj.ref, worldX, worldY, registries)
        }

        // 装饰物（非逻辑对象）
        if (obj.type === 'deco' || obj.type === 'slice') {
          this.decorations.push({
            ...obj,
            x: (obj.x || 0) + ox,
            y: (obj.y || 0) + oy
          });
        }
      }
    }
  }

  /**
   * 记录物品被拾取
   * @param {string} itemId
   */
  markItemPicked(itemId) {
    if (!this._state.pickedItems.includes(itemId)) {
      this._state.pickedItems.push(itemId);
    }
  }

  /**
   * 记录敌人被击杀
   * @param {string} enemyId
   */
  markEnemyKilled(enemyId) {
    if (!this._state.killedEnemies.includes(enemyId)) {
      this._state.killedEnemies.push(enemyId);
    }
  }

  /**
   * 设置开关状态
   * @param {string} switchId
   * @param {boolean} value
   */
  setSwitch(switchId, value) {
    this._state.switches[switchId] = value;
  }

  /**
   * 保存 NPC 当前位置
   * @param {string} npcId
   * @param {number} x - 世界坐标
   * @param {number} y - 世界坐标
   */
  saveNpcPosition(npcId, x, y) {
    this._state.npcPositions[npcId] = { x: x - this.origin.x, y: y - this.origin.y };
  }

  /**
   * 序列化状态（卸载时保存）
   * @returns {Object}
   */
  serialize() {
    return JSON.parse(JSON.stringify(this._state));
  }

  /**
   * 恢复状态（重新加载时）
   * @param {Object} state
   */
  restoreState(state) {
    if (!state) return;
    this._state.pickedItems = state.pickedItems || [];
    this._state.killedEnemies = state.killedEnemies || [];
    this._state.switches = state.switches || {};
    this._state.npcPositions = state.npcPositions || {};
  }

  /**
   * 销毁 chunk（卸载时调用）
   * 清理实体引用和装饰物
   */
  destroy() {
    this.entityIds = [];
    this.decorations = [];
    this.sceneData = null;
  }
}

export default LoadedChunk;
