/**
 * IRenderBackend.js
 * 渲染后端抽象基类（接口约定 + 默认实现占位）
 *
 * 双后端架构约定：
 *   - Canvas2DBackend：包装现有 Canvas 2D 渲染（默认 / 阶段 A 主路径）
 *   - ThreeBackend：three.js WebGL 渲染（M5 引入）
 *
 * 业务层（Systems / Scenes）只依赖该接口，不直接引用具体实现。
 */

/**
 * @typedef {Object} BackendConfig
 * @property {'2d'|'3d'|'auto'} mode
 * @property {boolean} [debug]
 * @property {'main'|'overlay'|'auto'} [hud]
 * @property {Object} [three]
 * @property {Object} [layers]
 */

/**
 * @typedef {Object} Vec3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * 渲染后端抽象基类
 *
 * 所有子类必须实现：
 *   - init / resize / dispose
 *   - beginFrame / endFrame
 *   - renderEntities / renderParticles / renderEffects
 *   - getHUDContext
 *
 * 并暴露属性：
 *   - mode: '2d' | '3d'
 *   - canvas: HTMLCanvasElement
 *   - camera: ICameraAdapter
 *   - picker: IPicker
 */
export class IRenderBackend {
  constructor() {
    /** @type {'2d'|'3d'} */
    this.mode = '2d';
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {import('./ICameraAdapter.js').ICameraAdapter|null} */
    this.camera = null;
    /** @type {import('./IPicker.js').IPicker|null} */
    this.picker = null;
  }

  /**
   * 初始化后端
   * @param {HTMLCanvasElement} canvas
   * @param {BackendConfig} config
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async init(canvas, config) {
    throw new Error('IRenderBackend.init() must be implemented by subclass');
  }

  /**
   * 调整渲染尺寸
   * @param {number} width
   * @param {number} height
   */
  // eslint-disable-next-line no-unused-vars
  resize(width, height) {
    throw new Error('IRenderBackend.resize() must be implemented by subclass');
  }

  /**
   * 释放资源
   */
  dispose() {
    // 子类可选实现
  }

  /**
   * 帧开始（清屏、begin path 等）
   */
  beginFrame() {
    // 子类实现
  }

  /**
   * 帧结束（flush、swap buffer 等）
   */
  endFrame() {
    // 子类实现
  }

  /**
   * 渲染实体列表
   * @param {Array} entities
   * @param {import('./ICameraAdapter.js').ICameraAdapter} [camera]
   */
  // eslint-disable-next-line no-unused-vars
  renderEntities(entities, camera) {
    throw new Error('IRenderBackend.renderEntities() must be implemented by subclass');
  }

  /**
   * 渲染粒子
   * @param {*} particleSystem
   * @param {import('./ICameraAdapter.js').ICameraAdapter} [camera]
   */
  // eslint-disable-next-line no-unused-vars
  renderParticles(particleSystem, camera) {
    // 子类实现
  }

  /**
   * 渲染特效（技能抛射物等）
   * @param {*} effects
   * @param {import('./ICameraAdapter.js').ICameraAdapter} [camera]
   */
  // eslint-disable-next-line no-unused-vars
  renderEffects(effects, camera) {
    // 子类实现
  }

  /**
   * 获取 HUD 的 2D 上下文
   * - Canvas2DBackend：返回主 canvas 的 2D context
   * - ThreeBackend：返回 overlay canvas 的 2D context
   * @returns {CanvasRenderingContext2D|null}
   */
  getHUDContext() {
    throw new Error('IRenderBackend.getHUDContext() must be implemented by subclass');
  }

  /**
   * 设置地图数据（用于楼层与地面）
   * @param {*} mapData
   */
  // eslint-disable-next-line no-unused-vars
  setMapData(mapData) {
    // 子类可选实现
  }

  /**
   * 设置当前楼层 id
   * @param {string} floorId
   */
  // eslint-disable-next-line no-unused-vars
  setCurrentFloor(floorId) {
    // 子类可选实现
  }
}

export default IRenderBackend;
