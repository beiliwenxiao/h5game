/**
 * IPicker.js
 * 鼠标/触摸拾取接口
 *
 * 2D 后端：屏幕点 → 等距投影反推地面点
 * 3D 后端：Raycaster 求交
 */

export class IPicker {
  /**
   * 屏幕点转地面世界坐标
   * @param {number} screenX
   * @param {number} screenY
   * @returns {{x:number, y:number, z:number}|null}
   */
  // eslint-disable-next-line no-unused-vars
  pickGround(screenX, screenY) {
    return null;
  }

  /**
   * 屏幕点击下最靠前的实体
   * @param {number} screenX
   * @param {number} screenY
   * @param {Array} entities
   * @returns {*|null}
   */
  // eslint-disable-next-line no-unused-vars
  pickEntity(screenX, screenY, entities) {
    return null;
  }
}

export default IPicker;
