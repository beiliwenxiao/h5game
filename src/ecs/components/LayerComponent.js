/**
 * LayerComponent.js
 * 世界渲染分层组件
 *
 * 三类分层语义（见 .kiro/specs/dual-rendering-backend/design.md §9）：
 *   - worldLayer ：世界子层（绘制顺序分组）
 *   - floorId    ：地图楼层（与 TransformComponent.floorId 冗余，便于索引）
 *   - renderOrder：同层内手动微调
 */

import { Component } from '../Component.js';

/**
 * 允许的 worldLayer 值
 */
export const WORLD_LAYERS = Object.freeze([
  'ground',   // 地面/影子，不参与 Y-sort
  'decal',    // 地面装饰（血迹、符文、光圈）
  'entity',   // 角色/敌人/NPC/物体
  'aerial',   // 飞行物/投掷武器/箭矢
  'effect'    // 技能特效/粒子
]);

export class LayerComponent extends Component {
  /**
   * @param {Object} [config]
   * @param {string} [config.worldLayer='entity']
   * @param {string} [config.floorId='ground']
   * @param {number} [config.renderOrder=0]
   */
  constructor(config = {}) {
    super('layer');
    const wl = config.worldLayer ?? 'entity';
    this.worldLayer = WORLD_LAYERS.includes(wl) ? wl : 'entity';
    this.floorId = config.floorId ?? 'ground';
    this.renderOrder = config.renderOrder ?? 0;

    /** 原始 worldLayer（用于临时切换后恢复，如 FlightSystem） */
    this._originalWorldLayer = this.worldLayer;
  }

  /**
   * 切到新层并记住原层
   * @param {string} layer
   */
  pushLayer(layer) {
    if (!WORLD_LAYERS.includes(layer)) return;
    this._originalWorldLayer = this.worldLayer;
    this.worldLayer = layer;
  }

  /**
   * 恢复到原层
   */
  popLayer() {
    this.worldLayer = this._originalWorldLayer ?? 'entity';
  }

  setFloor(id) {
    this.floorId = id;
  }
}

export default LayerComponent;
