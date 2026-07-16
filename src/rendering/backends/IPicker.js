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
