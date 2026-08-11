/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/** 判断单元是否仅用于规划展示、禁止运行时加载。 */
export function isReservedWorldMapCell(cell) {
  return Boolean(cell && typeof cell === 'object' && cell.reserved === true);
}

/**
 * 从世界地图单元解析 canonical sceneId。
 * 默认排除 reserved 单元；编辑器可显式包含它们用于规划展示。
 */
export function getWorldMapCellSceneId(cell, { includeReserved = false } = {}) {
  if (typeof cell === 'string') return cell || null;
  if (!cell || typeof cell !== 'object') return null;
  if (!includeReserved && isReservedWorldMapCell(cell)) return null;
  const sceneId = cell.sceneId ?? cell.scene ?? cell.id;
  return typeof sceneId === 'string' && sceneId.length > 0 ? sceneId : null;
}

export default getWorldMapCellSceneId;
