/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 ************************************************************/

/**
 * SceneAimController - 三端统一的方向瞄准（框架级）
 *
 * 把 PC / 触屏 / 手柄 三套截然不同的瞄准输入，归一化成同一份预览状态：
 *
 *   PC     进入瞄准态 → 鼠标位置算方向 → 左键确认 / 右键取消
 *   触屏   按住按钮   → 拖拽偏移算方向 → 松手确认
 *   手柄   按住按钮   → 右摇杆算方向   → 松手确认
 *
 * 三者最终都产出 { dirX, dirY, distRatio, inRange }，由调用方据此渲染预览、执行释放。
 *
 * 预览目标类型用 index 约定（与既有 demo 保持兼容）：
 *   >= 0   技能索引
 *   -1     攻击（远程武器才有预览）
 *   -2     投掷
 *   -3     轻功
 *
 * 设计约定：
 *   - 不持有 scene，通过构造参数注入取值回调，便于单测
 *   - 只算几何与状态，不直接调用释放逻辑（由调用方在 onConfirm 里做）
 */
export class SceneAimController {
  /**
   * @param {Object} options
   * @param {Function} options.getPlayerPosition - () => {x,y} | null
   * @param {Function} options.getRange - (kind, index) => number 该动作最大射程
   * @param {Function} [options.onConfirm] - (kind, index, aim) => void 确认释放
   * @param {Function} [options.onCancel] - (kind, index) => void 取消
   */
  constructor(options = {}) {
    this.getPlayerPosition = options.getPlayerPosition || (() => null);
    this.getRange = options.getRange || (() => 300);
    this.onConfirm = options.onConfirm || null;
    this.onCancel = options.onCancel || null;

    /** 当前瞄准态：{ kind, index } | null。kind: 'skill'|'flight'|'throw' */
    this.state = null;
    /** 最近一次归一化方向与距离比例（渲染预览用） */
    this.dirX = 0;
    this.dirY = 0;
    this.distRatio = 0;
    this.inRange = false;
  }

  /** 是否处于瞄准态 */
  get isAiming() {
    return this.state !== null;
  }

  /**
   * 进入瞄准态。
   * @param {string} kind - 'skill' | 'flight' | 'throw'
   * @param {number} [index=-1] - 技能索引（kind==='skill' 时有效）
   * @returns {boolean} 是否成功进入
   */
  enter(kind, index = -1) {
    if (!this.getPlayerPosition()) return false;
    this.state = { kind, index };
    return true;
  }

  /** 退出瞄准态 */
  cancel() {
    if (!this.state) return;
    const { kind, index } = this.state;
    this.state = null;
    this.distRatio = 0;
    this.inRange = false;
    if (this.onCancel) this.onCancel(kind, index);
  }

  /**
   * 用世界坐标目标点更新瞄准（PC 鼠标路径）。
   * @param {{x:number,y:number}} worldTarget
   * @returns {Object|null} 瞄准结果 { dirX, dirY, distRatio, inRange, previewIndex } 或 null
   */
  aimAtWorldPoint(worldTarget) {
    if (!this.state) return null;
    const pos = this.getPlayerPosition();
    if (!pos) { this.cancel(); return null; }

    const { kind, index } = this.state;
    const range = this.getRange(kind, index);
    if (!range) { this.cancel(); return null; }

    const dx = worldTarget.x - pos.x;
    const dy = worldTarget.y - pos.y;
    const dist = Math.hypot(dx, dy);
    return this._commit(dx, dy, range > 0 ? dist / range : 0);
  }

  /**
   * 用方向向量 + 推杆量更新瞄准（手柄摇杆 / 触屏拖拽路径）。
   * @param {number} dirX - 方向 X（不必归一化）
   * @param {number} dirY - 方向 Y
   * @param {number} magnitude - 0~1 推杆量，直接作为射程比例
   * @returns {Object|null}
   */
  aimByDirection(dirX, dirY, magnitude) {
    if (!this.state) return null;
    const pos = this.getPlayerPosition();
    if (!pos) { this.cancel(); return null; }
    return this._commit(dirX, dirY, magnitude);
  }

  /** @private 归一化并缓存瞄准结果 */
  _commit(dx, dy, distRatio) {
    const mag = Math.hypot(dx, dy);
    this.dirX = mag > 0 ? dx / mag : 0;
    this.dirY = mag > 0 ? dy / mag : 0;
    this.distRatio = Math.min(distRatio, 1.5);
    this.inRange = distRatio <= 1.0;

    return {
      dirX: this.dirX,
      dirY: this.dirY,
      distRatio: this.distRatio,
      inRange: this.inRange,
      previewIndex: this.getPreviewIndex()
    };
  }

  /**
   * 当前瞄准目标对应的预览索引约定值。
   * @returns {number} >=0 技能索引 / -2 投掷 / -3 轻功
   */
  getPreviewIndex() {
    if (!this.state) return -1;
    const { kind, index } = this.state;
    if (kind === 'flight') return -3;
    if (kind === 'throw') return -2;
    return index;
  }

  /**
   * 确认释放：射程内才触发 onConfirm，随后自动退出瞄准态。
   * @param {Object} [extra] - 附加给 onConfirm 的数据（如鼠标世界坐标）
   * @returns {boolean} 是否实际触发了释放
   */
  confirm(extra = {}) {
    if (!this.state) return false;
    const { kind, index } = this.state;
    const fired = this.inRange;

    if (fired && this.onConfirm) {
      this.onConfirm(kind, index, {
        dirX: this.dirX,
        dirY: this.dirY,
        distRatio: this.distRatio,
        ...extra
      });
    }
    // 无论射程内外都退出瞄准（超出射程视为放弃）
    this.state = null;
    this.distRatio = 0;
    this.inRange = false;
    return fired;
  }
}

export default SceneAimController;
