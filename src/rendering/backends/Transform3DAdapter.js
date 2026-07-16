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
 * Transform3DAdapter.js
 * TransformComponent → three.js 坐标适配器
 *
 * 映射规则（阶段 A）：
 *   - TransformComponent.position.x → three.x
 *   - TransformComponent.position.elevation → three.y
 *   - TransformComponent.position.z (== .y) → three.z
 */

/**
 * 把 TransformComponent 转为三维位置对象
 * @param {import('../../ecs/components/TransformComponent.js').TransformComponent} transform
 * @returns {{x:number, y:number, z:number, floorId:string}|null}
 */
export function toThreePosition(transform) {
  if (!transform) return null;
  const pos = transform.position;
  if (!pos) return null;
  const x = pos.x ?? 0;
  const z = (pos.z !== undefined ? pos.z : pos.y) ?? 0;
  const y = pos.elevation ?? 0;
  return { x, y, z, floorId: transform.floorId ?? 'ground' };
}

/**
 * 应用 transform 到任意具有 position.set(x,y,z) 的对象（如 THREE.Object3D）
 * @param {*} object3D
 * @param {import('../../ecs/components/TransformComponent.js').TransformComponent} transform
 */
export function applyTransformToObject3D(object3D, transform) {
  if (!object3D || !transform) return;
  const mapped = toThreePosition(transform);
  if (!mapped) return;
  if (object3D.position && typeof object3D.position.set === 'function') {
    object3D.position.set(mapped.x, mapped.y, mapped.z);
  }
  if (typeof transform.rotation === 'number' && object3D.rotation) {
    // 单值 rotation 理解为绕 Y 轴旋转
    if (typeof object3D.rotation.y === 'number') {
      object3D.rotation.y = transform.rotation;
    }
  }
}

export default { toThreePosition, applyTransformToObject3D };
