/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const CARDINAL_COST = 1;
const DIAGONAL_COST = Math.SQRT2;

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(node) {
    const items = this.items;
    items.push(node);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].priority <= node.priority) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = node;
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return null;
    const first = items[0];
    const last = items.pop();
    if (items.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= items.length) break;
      const right = left + 1;
      const child = right < items.length && items[right].priority < items[left].priority
        ? right : left;
      if (items[child].priority >= last.priority) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = last;
    return first;
  }
}

/** 有界网格 A*；只消费调用方提供的只读阻挡查询。 */
export class PathfindingSystem {
  constructor(config = {}) {
    this.defaultCellSize = Math.max(8, Number(config.cellSize) || 32);
    this.defaultMaxVisited = Math.max(64, Number(config.maxVisited) || 2048);
    this.defaultGoalSearchRadius = Math.max(1, Number(config.goalSearchRadius) || 4);
  }

  findPath(options = {}) {
    const start = this._point(options.start);
    const requestedGoal = this._point(options.goal);
    const isBlocked = typeof options.isBlocked === 'function' ? options.isBlocked : () => false;
    if (!start || !requestedGoal) return [];

    const cellSize = Math.max(8, Number(options.cellSize) || this.defaultCellSize);
    const maxVisited = Math.max(1, Number(options.maxVisited) || this.defaultMaxVisited);
    const allowDiagonal = options.allowDiagonal !== false;
    const bounds = this._resolveBounds(start, requestedGoal, cellSize, options.bounds);
    const startCell = this._toCell(start, cellSize);
    const requestedGoalCell = this._toCell(requestedGoal, cellSize);
    if (!this._inside(startCell, bounds) || !this._inside(requestedGoalCell, bounds)) return [];

    if (!isBlocked(requestedGoal.x, requestedGoal.y)
      && this._hasLineOfSight(start, requestedGoal, isBlocked, cellSize)) {
      return [requestedGoal];
    }

    const isCellBlocked = (x, y) => {
      if (x === startCell.x && y === startCell.y) return false;
      const point = this._cellCenter(x, y, cellSize);
      return isBlocked(point.x, point.y);
    };
    const goalCell = this._resolveGoalCell(
      requestedGoalCell,
      startCell,
      bounds,
      isCellBlocked,
      Math.max(1, Number(options.goalSearchRadius) || this.defaultGoalSearchRadius)
    );
    if (!goalCell) return [];

    const open = new MinHeap();
    const records = new Map();
    const closed = new Set();
    const startKey = this._key(startCell.x, startCell.y);
    records.set(startKey, { x: startCell.x, y: startCell.y, g: 0, parent: null });
    open.push({ key: startKey, priority: this._heuristic(startCell, goalCell) });

    const directions = allowDiagonal
      ? [[1, 0, CARDINAL_COST], [-1, 0, CARDINAL_COST], [0, 1, CARDINAL_COST], [0, -1, CARDINAL_COST],
        [1, 1, DIAGONAL_COST], [1, -1, DIAGONAL_COST], [-1, 1, DIAGONAL_COST], [-1, -1, DIAGONAL_COST]]
      : [[1, 0, CARDINAL_COST], [-1, 0, CARDINAL_COST], [0, 1, CARDINAL_COST], [0, -1, CARDINAL_COST]];
    let visited = 0;
    let found = null;

    while (open.size > 0 && visited < maxVisited) {
      const currentEntry = open.pop();
      if (!currentEntry || closed.has(currentEntry.key)) continue;
      const current = records.get(currentEntry.key);
      if (!current) continue;
      closed.add(currentEntry.key);
      visited++;
      if (current.x === goalCell.x && current.y === goalCell.y) {
        found = current;
        break;
      }

      for (let index = 0; index < directions.length; index++) {
        const [dx, dy, cost] = directions[index];
        const x = current.x + dx;
        const y = current.y + dy;
        if (!this._inside({ x, y }, bounds) || isCellBlocked(x, y)) continue;
        if (dx !== 0 && dy !== 0
          && (isCellBlocked(current.x + dx, current.y) || isCellBlocked(current.x, current.y + dy))) continue;
        const key = this._key(x, y);
        if (closed.has(key)) continue;
        const g = current.g + cost;
        const previous = records.get(key);
        if (previous && previous.g <= g) continue;
        records.set(key, { x, y, g, parent: current });
        open.push({ key, priority: g + this._heuristic({ x, y }, goalCell) });
      }
    }
    if (!found) return [];

    const reversed = [];
    for (let node = found; node?.parent; node = node.parent) {
      reversed.push(this._cellCenter(node.x, node.y, cellSize));
    }
    reversed.reverse();
    const goalIsRequested = goalCell.x === requestedGoalCell.x && goalCell.y === requestedGoalCell.y
      && !isBlocked(requestedGoal.x, requestedGoal.y);
    if (reversed.length === 0) {
      return goalIsRequested && this._hasLineOfSight(start, requestedGoal, isBlocked, cellSize)
        ? [requestedGoal] : [];
    }
    if (goalIsRequested) reversed[reversed.length - 1] = requestedGoal;
    return this._simplify(start, reversed, isBlocked, cellSize);
  }

  _resolveGoalCell(goal, start, bounds, isBlocked, radius) {
    if (!isBlocked(goal.x, goal.y)) return goal;
    let best = null;
    let bestDistance = Infinity;
    let bestStartDistance = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const candidate = { x: goal.x + dx, y: goal.y + dy };
        if (!this._inside(candidate, bounds) || isBlocked(candidate.x, candidate.y)) continue;
        const distance = dx * dx + dy * dy;
        const startDistance = Math.abs(candidate.x - start.x) + Math.abs(candidate.y - start.y);
        if (distance < bestDistance || (distance === bestDistance && startDistance < bestStartDistance)) {
          best = candidate;
          bestDistance = distance;
          bestStartDistance = startDistance;
        }
      }
    }
    return best;
  }

  _simplify(start, points, isBlocked, cellSize) {
    const simplified = [];
    let anchor = start;
    let index = 0;
    while (index < points.length) {
      let furthest = index;
      for (let candidate = points.length - 1; candidate > index; candidate--) {
        if (this._hasLineOfSight(anchor, points[candidate], isBlocked, cellSize)) {
          furthest = candidate;
          break;
        }
      }
      const point = points[furthest];
      simplified.push(point);
      anchor = point;
      index = furthest + 1;
    }
    return simplified;
  }

  _hasLineOfSight(start, end, isBlocked, cellSize) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / Math.max(4, cellSize * 0.4)));
    for (let index = 1; index <= steps; index++) {
      const ratio = index / steps;
      if (isBlocked(start.x + dx * ratio, start.y + dy * ratio)) return false;
    }

    // 网格 supercover 检查；跨格角点时同时检查两侧正交格，禁止简化路径切墙角。
    let cellX = Math.floor(start.x / cellSize);
    let cellY = Math.floor(start.y / cellSize);
    const endX = Math.floor(end.x / cellSize);
    const endY = Math.floor(end.y / cellSize);
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const deltaX = stepX === 0 ? Infinity : cellSize / Math.abs(dx);
    const deltaY = stepY === 0 ? Infinity : cellSize / Math.abs(dy);
    let maxX = stepX === 0 ? Infinity : (
      (stepX > 0 ? (cellX + 1) * cellSize - start.x : start.x - cellX * cellSize) / Math.abs(dx)
    );
    let maxY = stepY === 0 ? Infinity : (
      (stepY > 0 ? (cellY + 1) * cellSize - start.y : start.y - cellY * cellSize) / Math.abs(dy)
    );
    const blockedCell = (x, y) => {
      const point = this._cellCenter(x, y, cellSize);
      return isBlocked(point.x, point.y);
    };
    let guard = 0;
    while ((cellX !== endX || cellY !== endY) && guard++ < 4096) {
      if (Math.abs(maxX - maxY) < 1e-10) {
        if (blockedCell(cellX + stepX, cellY) || blockedCell(cellX, cellY + stepY)) return false;
        cellX += stepX;
        cellY += stepY;
        maxX += deltaX;
        maxY += deltaY;
      } else if (maxX < maxY) {
        cellX += stepX;
        maxX += deltaX;
      } else {
        cellY += stepY;
        maxY += deltaY;
      }
      if ((cellX !== endX || cellY !== endY) && blockedCell(cellX, cellY)) return false;
    }
    return cellX === endX && cellY === endY;
  }

  _resolveBounds(start, goal, cellSize, supplied) {
    const distance = Math.hypot(goal.x - start.x, goal.y - start.y);
    const margin = Math.max(cellSize * 4, Math.min(384, distance * 0.35 + cellSize * 2));
    const world = supplied || {};
    const minX = Number.isFinite(world.minX) ? world.minX : Math.min(start.x, goal.x) - margin;
    const minY = Number.isFinite(world.minY) ? world.minY : Math.min(start.y, goal.y) - margin;
    const maxX = Number.isFinite(world.maxX) ? world.maxX : Math.max(start.x, goal.x) + margin;
    const maxY = Number.isFinite(world.maxY) ? world.maxY : Math.max(start.y, goal.y) + margin;
    return {
      minX: Math.floor(minX / cellSize),
      minY: Math.floor(minY / cellSize),
      maxX: Math.floor(maxX / cellSize),
      maxY: Math.floor(maxY / cellSize)
    };
  }

  _heuristic(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy);
  }

  _point(value) {
    const x = Number(value?.x);
    const y = Number(value?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  _toCell(point, cellSize) {
    return { x: Math.floor(point.x / cellSize), y: Math.floor(point.y / cellSize) };
  }

  _cellCenter(x, y, cellSize) {
    return { x: (x + 0.5) * cellSize, y: (y + 0.5) * cellSize };
  }

  _inside(cell, bounds) {
    return cell.x >= bounds.minX && cell.x <= bounds.maxX
      && cell.y >= bounds.minY && cell.y <= bounds.maxY;
  }

  _key(x, y) {
    return `${x},${y}`;
  }
}

export default PathfindingSystem;
