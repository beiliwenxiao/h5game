/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));
const point = value => value && finite(value.x) && finite(value.y);

function resolveBounds(source) {
  if (source?.bounds && point(source.bounds) && finite(source.bounds.width) && finite(source.bounds.height)) {
    return { x: Number(source.bounds.x), y: Number(source.bounds.y), width: Math.max(1, Number(source.bounds.width)), height: Math.max(1, Number(source.bounds.height)) };
  }
  if (Array.isArray(source?.points) && source.points.length > 0) {
    const points = source.points.filter(item => Array.isArray(item) && finite(item[0]) && finite(item[1]));
    if (points.length > 0) {
      const xs = points.map(item => Number(item[0]));
      const ys = points.map(item => Number(item[1]));
      const x = Math.min(...xs); const y = Math.min(...ys);
      return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
    }
  }
  if (finite(source?.x) && finite(source?.y) && finite(source?.width) && finite(source?.height)) {
    return { x: Number(source.x), y: Number(source.y), width: Math.max(1, Number(source.width)), height: Math.max(1, Number(source.height)) };
  }
  return null;
}

/** 将 ECS 实体投影为“脚点锚点 + 真实精灵边界”的通用空间目标。 */
export function createEntitySpatialTarget(entity, { sceneId = '' } = {}) {
  const position = entity?.getComponent?.('transform')?.position;
  if (!entity || !point(position)) return null;
  const sprite = entity.getComponent?.('sprite');
  const width = Math.max(1, Number(sprite?.width) || 1);
  const height = Math.max(1, Number(sprite?.height) || 1);
  return { id: entity.id, type: 'entity', sceneId, entityId: entity.id, dynamicTarget: true,
    x: position.x - width / 2, y: position.y - height, width, height,
    anchor: { x: position.x, y: position.y } };
}

/** 统一解析点对象、实体、矩形和多边形的交互锚点与命中边界。 */
export function resolveSceneSpatialGeometry(source = {}, { fallback = null, offsetX = 0, offsetY = 0 } = {}) {
  const bounds = resolveBounds(source) || resolveBounds(fallback);
  const pointAnchored = source.dynamicTarget === true || ['entity', 'spawn', 'ref'].includes(source.type);
  const baseAnchor = point(source.anchor) ? source.anchor : point(source.center) ? source.center
    : pointAnchored && finite(source.x) && finite(source.y) ? source
      : bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
        : finite(source.x) && finite(source.y) ? source : { x: 0, y: 0 };
  const dx = Number(offsetX) || 0; const dy = Number(offsetY) || 0;
  const anchor = { x: Number(baseAnchor.x) + dx, y: Number(baseAnchor.y) + dy };
  const hitBounds = bounds ? { x: bounds.x + dx, y: bounds.y + dy, width: bounds.width, height: bounds.height }
    : { x: anchor.x - 0.5, y: anchor.y - 0.5, width: 1, height: 1 };
  return { ...hitBounds, center: anchor, anchor };
}
