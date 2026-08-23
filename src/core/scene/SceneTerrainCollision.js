/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 ************************************************************/

import { SceneObjectProjector } from './SceneObjectProjector.js';

const SCENE_OBJECT_PROJECTOR = new SceneObjectProjector();

/**
 * SceneTerrainCollision - 地形碰撞与区域收集（框架级）
 *
 * 承担四类地形约束的统一解算：
 *   1. 椭圆盆地边界（可留入口扇形缺口）
 *   2. 水池（椭圆，从内部推出）
 *   3. 树木（圆形碰撞体）
 *   4. 编辑器 collide shape（rect / circle / ellipse / polygon / path）
 *
 * 以及从场景数据收集 buffZone 多边形并转世界坐标。
 *
 * 设计约定：
 *   - 只做几何解算，不认识 ECS 之外的游戏概念
 *   - 直接就地修改传入的 position 对象（性能考虑，避免每帧分配）
 *   - terrain 只提供已投影到世界坐标的碰撞数据；shape 命中与推出算法由本模块拥有
 *
 * 用法：
 *   const collision = new SceneTerrainCollision();
 *   collision.resolveEntities(terrain, entities, { entityRadius: 12 });
 *   const zones = SceneTerrainCollision.collectBuffZones(terrains);
 */
const EMPTY_SPATIAL_ITEMS = Object.freeze([]);
const EMPTY_OPTIONS = Object.freeze({});

export class SceneTerrainCollision {
  /**
   * @param {Object} [options]
   * @param {number} [options.entityRadius=12] - 实体碰撞半径
   * @param {number} [options.pushEpsilon=2] - 推出后的额外余量，防止贴边抖动
   */
  constructor(options = {}) {
    this.entityRadius = options.entityRadius != null ? options.entityRadius : 12;
    this.pushEpsilon = options.pushEpsilon != null ? options.pushEpsilon : 2;
    this.spatialCellSize = Math.max(32, options.spatialCellSize || 128);
    /** terrain -> 静态碰撞数据空间索引；terrain 生命周期结束后可自动回收。 */
    this._spatialCache = new WeakMap();
  }

  /**
   * 对一批实体解算地形碰撞。
   * @param {Object} terrain - 地形实例（Scene1Terrain 或同构对象）
   * @param {Array} entities - 实体数组
   * @param {Object} [options]
   * @param {number} [options.entityRadius] - 覆盖默认半径
   */
  resolveEntities(terrain, entities, options = {}) {
    if (!terrain || !entities || entities.length === 0) return;
    const radius = options.entityRadius != null ? options.entityRadius : this.entityRadius;

    const trees = terrain.getTreeColliders ? terrain.getTreeColliders() : [];
    const shapes = terrain._collisionShapes || [];
    const walkables = terrain._walkableShapes || [];
    const ponds = terrain.waterPatches || [];
    const spatial = this._getSpatialIndex(terrain, trees, shapes, walkables, ponds, radius);

    for (const entity of entities) {
      if (entity.isDead || entity.isDying) continue;
      const transform = entity.getComponent && entity.getComponent('transform');
      if (!transform) continue;
      const p = transform.position;

      // 可落脚区域优先于编辑器 collide shape 和盆地边界，与 Scene1Terrain.isBlocked 一致。
      const nearbyWalkables = this._querySpatial(spatial.walkables, p.x, p.y);
      let isWalkable = false;
      for (let i = 0; i < nearbyWalkables.length; i++) {
        if (this._pointInShape(nearbyWalkables[i], p.x, p.y)) {
          isWalkable = true;
          break;
        }
      }
      if (!isWalkable) {
        for (let i = 0; i < spatial.unboundedWalkables.length; i++) {
          if (this._pointInShape(spatial.unboundedWalkables[i], p.x, p.y)) {
            isWalkable = true;
            break;
          }
        }
      }
      const nearbyPonds = this._querySpatial(spatial.ponds, p.x, p.y);
      for (let i = 0; i < nearbyPonds.length; i++) this.resolvePond(p, nearbyPonds[i]);
      const nearbyTrees = this._querySpatial(spatial.trees, p.x, p.y);
      for (let i = 0; i < nearbyTrees.length; i++) this.resolveTree(p, nearbyTrees[i], radius);
      const nearbyShapes = isWalkable ? EMPTY_SPATIAL_ITEMS : this._querySpatial(spatial.shapes, p.x, p.y);
      for (let i = 0; i < nearbyShapes.length; i++) this.resolveShape(p, nearbyShapes[i], radius);
      // 缺少可计算包围盒的自定义 shape 始终走兜底列表（walkable 内除外）。
      if (!isWalkable) {
        for (let i = 0; i < spatial.unboundedShapes.length; i++) {
          this.resolveShape(p, spatial.unboundedShapes[i], radius);
        }
      }
    }
  }

  /**
   * 对多个 chunk terrain 解算可碰撞装饰物、水面与编辑器 shape。
   * 旧椭圆盆地只是视觉地形，不再作为任何 terrain 的物理边界。
   */
  resolveTerrains(terrains, entities, { entityRadius = null } = {}) {
    if (!terrains || terrains.length === 0) return;
    const options = entityRadius == null ? EMPTY_OPTIONS : { entityRadius };
    for (let index = 0; index < terrains.length; index++) {
      const terrain = terrains[index];
      if (!terrain) continue;
      this.resolveEntities(terrain, entities, options);
    }
  }

  /**
   * 只读查询一个世界坐标是否会被 terrain 阻挡，不修改实体或坐标。
   * 判定顺序与 resolveEntities 一致：walkable 只覆盖编辑器 collide shape，
   * 水池和树木仍保持独立物理阻挡。
   */
  isPositionBlocked(terrain, x, y, { entityRadius = null } = {}) {
    if (!terrain || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const radius = entityRadius == null ? this.entityRadius : Math.max(0, Number(entityRadius) || 0);
    const trees = terrain.getTreeColliders ? terrain.getTreeColliders() : [];
    const shapes = terrain._collisionShapes || [];
    const walkables = terrain._walkableShapes || [];
    const ponds = terrain.waterPatches || [];
    const spatial = this._getSpatialIndex(terrain, trees, shapes, walkables, ponds, radius);

    const nearbyPonds = this._querySpatial(spatial.ponds, x, y);
    for (let index = 0; index < nearbyPonds.length; index++) {
      const pond = nearbyPonds[index];
      const rx = Number(pond?.rx) || 0;
      const ry = Number(pond?.ry) || 0;
      if (rx <= 0 || ry <= 0) continue;
      const nx = (x - pond.x) / rx;
      const ny = (y - pond.y) / ry;
      if (nx * nx + ny * ny < 1) return true;
    }

    const nearbyTrees = this._querySpatial(spatial.trees, x, y);
    for (let index = 0; index < nearbyTrees.length; index++) {
      const tree = nearbyTrees[index];
      const minimumDistance = (Number(tree?.r) || 0) + radius;
      const dx = x - tree.x;
      const dy = y - tree.y;
      if (dx * dx + dy * dy < minimumDistance * minimumDistance) return true;
    }

    let isWalkable = false;
    const nearbyWalkables = this._querySpatial(spatial.walkables, x, y);
    for (let index = 0; index < nearbyWalkables.length; index++) {
      if (this._pointInShape(nearbyWalkables[index], x, y)) {
        isWalkable = true;
        break;
      }
    }
    if (!isWalkable) {
      for (let index = 0; index < spatial.unboundedWalkables.length; index++) {
        if (this._pointInShape(spatial.unboundedWalkables[index], x, y)) {
          isWalkable = true;
          break;
        }
      }
    }
    if (isWalkable) return false;

    const nearbyShapes = this._querySpatial(spatial.shapes, x, y);
    for (let index = 0; index < nearbyShapes.length; index++) {
      if (this._pointInShape(nearbyShapes[index], x, y)) return true;
    }
    for (let index = 0; index < spatial.unboundedShapes.length; index++) {
      if (this._pointInShape(spatial.unboundedShapes[index], x, y)) return true;
    }
    return false;
  }

  /** 多 terrain 只读阻挡聚合；任一 terrain 命中即阻挡。 */
  isAnyPositionBlocked(terrains, x, y, options = EMPTY_OPTIONS) {
    for (let index = 0; index < (terrains?.length || 0); index++) {
      if (this.isPositionBlocked(terrains[index], x, y, options)) return true;
    }
    return false;
  }

  /** 显式使动态碰撞体变更后的 terrain 索引失效。 */
  invalidate(terrain) {
    if (!terrain) return false;
    return this._spatialCache.delete(terrain);
  }

  /**
   * 获取或重建 terrain 静态碰撞空间索引。
   * 数组替换（异步场景加载）或数量/半径变化时自动失效。
   * @private
   */
  _getSpatialIndex(terrain, trees, shapes, walkables, ponds, radius) {
    let cache = this._spatialCache.get(terrain);
    if (cache && cache.treeSource === trees && cache.treeCount === trees.length &&
        cache.shapeSource === shapes && cache.shapeCount === shapes.length &&
        cache.walkableSource === walkables && cache.walkableCount === walkables.length &&
        cache.pondSource === ponds && cache.pondCount === ponds.length &&
        cache.radius === radius) {
      return cache;
    }

    cache = {
      treeSource: trees,
      treeCount: trees.length,
      shapeSource: shapes,
      shapeCount: shapes.length,
      walkableSource: walkables,
      walkableCount: walkables.length,
      pondSource: ponds,
      pondCount: ponds.length,
      radius,
      trees: new Map(),
      shapes: new Map(),
      walkables: new Map(),
      ponds: new Map(),
      unboundedShapes: [],
      unboundedWalkables: []
    };

    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const extent = (tree.r || 0) + radius + 1;
      this._insertSpatial(cache.trees, tree, tree.x - extent, tree.y - extent,
        tree.x + extent, tree.y + extent);
    }
    for (let i = 0; i < ponds.length; i++) {
      const pond = ponds[i];
      this._insertSpatial(cache.ponds, pond, pond.x - pond.rx, pond.y - pond.ry,
        pond.x + pond.rx, pond.y + pond.ry);
    }
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i];
      const bounds = this._shapeBounds(shape);
      if (!bounds) cache.unboundedShapes.push(shape);
      else this._insertSpatial(cache.shapes, shape, bounds.left, bounds.top, bounds.right, bounds.bottom);
    }
    for (let i = 0; i < walkables.length; i++) {
      const shape = walkables[i];
      const bounds = this._shapeBounds(shape);
      if (!bounds) cache.unboundedWalkables.push(shape);
      else this._insertSpatial(cache.walkables, shape, bounds.left, bounds.top, bounds.right, bounds.bottom);
    }

    this._spatialCache.set(terrain, cache);
    return cache;
  }

  /** @private */
  _shapeBounds(shape) {
    if (Array.isArray(shape.points) && shape.points.length > 0) {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (let i = 0; i < shape.points.length; i++) {
        const point = shape.points[i];
        if (!point || point.length < 2) continue;
        if (point[0] < left) left = point[0];
        if (point[0] > right) right = point[0];
        if (point[1] < top) top = point[1];
        if (point[1] > bottom) bottom = point[1];
      }
      if (Number.isFinite(left)) return { left, top, right, bottom };
    }
    if (Number.isFinite(shape.x) && Number.isFinite(shape.y) &&
        Number.isFinite(shape.width) && Number.isFinite(shape.height)) {
      return {
        left: Math.min(shape.x, shape.x + shape.width),
        top: Math.min(shape.y, shape.y + shape.height),
        right: Math.max(shape.x, shape.x + shape.width),
        bottom: Math.max(shape.y, shape.y + shape.height)
      };
    }
    return null;
  }

  /** @private */
  _insertSpatial(grid, item, left, top, right, bottom) {
    const size = this.spatialCellSize;
    const minX = Math.floor(left / size), maxX = Math.floor(right / size);
    const minY = Math.floor(top / size), maxY = Math.floor(bottom / size);
    for (let cellX = minX; cellX <= maxX; cellX++) {
      let column = grid.get(cellX);
      if (!column) grid.set(cellX, (column = new Map()));
      for (let cellY = minY; cellY <= maxY; cellY++) {
        let items = column.get(cellY);
        if (!items) column.set(cellY, (items = []));
        items.push(item);
      }
    }
  }

  /** @private */
  _querySpatial(grid, x, y) {
    const size = this.spatialCellSize;
    return grid.get(Math.floor(x / size))?.get(Math.floor(y / size)) || EMPTY_SPATIAL_ITEMS;
  }

  /** 水池：在椭圆内部则推到边缘外 */
  resolvePond(p, pond) {
    const pdx = p.x - pond.x;
    const pdy = p.y - pond.y;
    const nx = pdx / pond.rx;
    const ny = pdy / pond.ry;
    const d2 = nx * nx + ny * ny;
    if (d2 < 1 && d2 > 0) {
      const k = 1 / Math.sqrt(d2);
      p.x = pond.x + pdx * k * 1.04;
      p.y = pond.y + pdy * k * 1.04;
    } else if (d2 === 0) {
      // 正好在圆心：垂直推出，避免除零
      p.y = pond.y - pond.ry - 2;
    }
  }

  /** 树木：圆形碰撞体，重叠则沿连线推开 */
  resolveTree(p, tree, entityRadius) {
    const tdx = p.x - tree.x;
    const tdy = p.y - tree.y;
    const minDist = tree.r + entityRadius;
    const d2 = tdx * tdx + tdy * tdy;
    if (d2 >= minDist * minDist) return;

    const td = Math.sqrt(d2);
    if (td > 0.001) {
      const k = (minDist + 1) / td;
      p.x = tree.x + tdx * k;
      p.y = tree.y + tdy * k;
    } else {
      p.y = tree.y + minDist + 1;
    }
  }

  /**
   * 编辑器 collide shape：按形状类型推出。
   * @param {Object} p - position（就地修改）
   * @param {Object} s - shape 定义
   * @param {number} radius - 实体半径（预留，当前按点判定）
   */
  resolveShape(p, s, radius) {
    if (!this._pointInShape(s, p.x, p.y)) return;

    const EPS = this.pushEpsilon;
    const st = s.shapeType;

    if (st === 'circle' || st === 'ellipse') {
      const scx = (s.x || 0) + (s.width || 0) / 2;
      const scy = (s.y || 0) + (s.height || 0) / 2;
      const dirx = p.x - scx, diry = p.y - scy;
      const dl = Math.hypot(dirx, diry) || 1;
      const rx = (st === 'circle' ? Math.min(s.width, s.height) : s.width) / 2 || 1;
      const ry = (st === 'circle' ? Math.min(s.width, s.height) : s.height) / 2 || 1;
      const ux = dirx / rx, uy = diry / ry;
      const d = Math.hypot(ux, uy) || 1;
      p.x = scx + dirx / d + dirx / dl * EPS;
      p.y = scy + diry / d + diry / dl * EPS;
      return;
    }

    if (st === 'polygon' || st === 'path') {
      this._pushOutOfPolygon(p, s.points, EPS);
      return;
    }

    // rect：推到最近边外侧
    const left = s.x || 0, top = s.y || 0;
    const right = left + (s.width || 0), bottom = top + (s.height || 0);
    const dL = p.x - left, dR = right - p.x, dT = p.y - top, dB = bottom - p.y;
    const minD = Math.min(dL, dR, dT, dB);
    if (minD === dL) p.x = left - EPS;
    else if (minD === dR) p.x = right + EPS;
    else if (minD === dT) p.y = top - EPS;
    else p.y = bottom + EPS;
  }

  /** @private 与 terrain 实现无关的 shape 点命中。 */
  _pointInShape(shape, x, y) {
    if (!shape) return false;
    if ((shape.shapeType === 'polygon' || shape.shapeType === 'path') && Array.isArray(shape.points)) {
      return this._pointInPolygon(shape.points, x, y);
    }
    const bx = shape.x || 0, by = shape.y || 0;
    const bw = shape.width || 0, bh = shape.height || 0;
    const cx = bx + bw / 2, cy = by + bh / 2;
    if (shape.shapeType === 'circle') {
      return Math.hypot(x - cx, y - cy) <= Math.min(bw, bh) / 2;
    }
    if (shape.shapeType === 'ellipse') {
      const nx = (x - cx) / (bw / 2 || 1);
      const ny = (y - cy) / (bh / 2 || 1);
      return nx * nx + ny * ny <= 1;
    }
    return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
  }

  /** @private 射线法判断点是否在闭合多边形内。 */
  _pointInPolygon(points, x, y) {
    if (!Array.isArray(points) || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const current = points[i], previous = points[j];
      const xi = Array.isArray(current) ? current[0] : current.x;
      const yi = Array.isArray(current) ? current[1] : current.y;
      const xj = Array.isArray(previous) ? previous[0] : previous.x;
      const yj = Array.isArray(previous) ? previous[1] : previous.y;
      if (((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /** @private 将多边形内部点推出到最近边界外侧。 */
  _pushOutOfPolygon(position, points, epsilon) {
    if (!Array.isArray(points) || points.length < 3) return;
    let nearestX = position.x, nearestY = position.y;
    let nearestEdgeX = 0, nearestEdgeY = 0;
    let bestDistanceSq = Infinity;

    for (let i = 0; i < points.length; i++) {
      const start = points[i], end = points[(i + 1) % points.length];
      const ax = Array.isArray(start) ? start[0] : start.x;
      const ay = Array.isArray(start) ? start[1] : start.y;
      const bx = Array.isArray(end) ? end[0] : end.x;
      const by = Array.isArray(end) ? end[1] : end.y;
      const edgeX = bx - ax, edgeY = by - ay;
      const edgeLengthSq = edgeX * edgeX + edgeY * edgeY;
      if (edgeLengthSq <= 0) continue;
      const projection = Math.max(0, Math.min(1,
        ((position.x - ax) * edgeX + (position.y - ay) * edgeY) / edgeLengthSq
      ));
      const candidateX = ax + edgeX * projection;
      const candidateY = ay + edgeY * projection;
      const dx = candidateX - position.x, dy = candidateY - position.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        nearestX = candidateX;
        nearestY = candidateY;
        nearestEdgeX = edgeX;
        nearestEdgeY = edgeY;
      }
    }

    if (!Number.isFinite(bestDistanceSq)) return;
    const distance = Math.sqrt(bestDistanceSq);
    const offset = Math.max(epsilon || 0, 0.001);
    if (distance > 1e-7) {
      position.x = nearestX + (nearestX - position.x) / distance * offset;
      position.y = nearestY + (nearestY - position.y) / distance * offset;
      return;
    }

    // 点恰好位于边界时，测试边法线两侧，选择多边形外的一侧。
    const edgeLength = Math.hypot(nearestEdgeX, nearestEdgeY) || 1;
    const normalX = -nearestEdgeY / edgeLength;
    const normalY = nearestEdgeX / edgeLength;
    const firstX = nearestX + normalX * offset;
    const firstY = nearestY + normalY * offset;
    if (!this._pointInPolygon(points, firstX, firstY)) {
      position.x = firstX;
      position.y = firstY;
    } else {
      position.x = nearestX - normalX * offset;
      position.y = nearestY - normalY * offset;
    }
  }

  /**
   * 从多个 terrain 的场景数据中收集 buffZone，坐标转为世界坐标。
   * @param {Array} terrains - terrain 实例数组
   * @returns {{zones: Array, loadedCount: number, total: number}}
   */
  static collectBuffZones(terrains) {
    const list = terrains || [];
    const zones = [];
    let loadedCount = 0;

    for (const t of list) {
      const scene = t._sceneDataRaw;
      if (!scene) continue;
      loadedCount++;
      if (!Array.isArray(scene.layers)) continue;

      const offset = t.worldOffset || { x: 0, y: 0 };

      for (const layer of scene.layers) {
        if (!Array.isArray(layer.objects)) continue;
        for (const obj of layer.objects) {
          if (obj.type !== 'buffZone' || !obj.effect) continue;
          const projected = SCENE_OBJECT_PROJECTOR.project(obj, offset);
          zones.push({
            id: projected.id,
            name: projected.name || '',
            points: projected.points || [],
            fillColor: projected.fillColor,
            borderColor: projected.borderColor,
            visible: projected.visible !== false,
            effect: projected.effect
          });
        }
      }
    }

    return { zones, loadedCount, total: list.length };
  }

  /**
   * 渲染 buffZone 多边形。
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} zones - collectBuffZones 产出的区域数组
   * @param {boolean} [debugMode=false] - true 时显示隐形区域并附加名称/效果标签
   */
  static renderBuffZones(ctx, zones, debugMode = false) {
    if (!zones || zones.length === 0) return;

    for (const zone of zones) {
      if (!zone.points || zone.points.length < 3) continue;
      if (!zone.visible && !debugMode) continue;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(zone.points[0][0], zone.points[0][1]);
      for (let i = 1; i < zone.points.length; i++) {
        ctx.lineTo(zone.points[i][0], zone.points[i][1]);
      }
      ctx.closePath();

      // 填充：调试模式下隐形区域用红色区分
      if (debugMode) {
        ctx.fillStyle = zone.visible
          ? (zone.fillColor || 'rgba(100, 0, 200, 0.15)')
          : 'rgba(200, 0, 0, 0.15)';
      } else {
        ctx.fillStyle = zone.fillColor || 'rgba(100, 0, 200, 0.15)';
      }
      ctx.fill();

      ctx.strokeStyle = debugMode
        ? (zone.visible ? (zone.borderColor || 'rgba(100,0,200,0.5)') : 'rgba(200,0,0,0.5)')
        : (zone.borderColor || 'rgba(100,0,200,0.5)');
      ctx.lineWidth = debugMode ? 2 : 1.5;
      if (debugMode) ctx.setLineDash([6, 3]);
      ctx.stroke();
      if (debugMode) ctx.setLineDash([]);

      if (debugMode) {
        const cx = zone.points.reduce((s, pt) => s + pt[0], 0) / zone.points.length;
        const cy = zone.points.reduce((s, pt) => s + pt[1], 0) / zone.points.length;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(zone.name || 'Buff', cx, cy - 6);
        if (zone.effect) {
          const eff = zone.effect;
          const label = `${eff.stat || 'hp'} ${eff.value > 0 ? '+' : ''}${eff.value || 0} (${eff.effectType || '?'})`;
          ctx.fillStyle = '#ccc';
          ctx.font = '10px sans-serif';
          ctx.fillText(label, cx, cy + 8);
        }
      }
      ctx.restore();
    }
  }
}

export default SceneTerrainCollision;
