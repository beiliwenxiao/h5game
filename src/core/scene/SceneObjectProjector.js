/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * SceneObjectProjector.js
 * 场景逻辑对象投影：局部坐标 → 世界坐标，一次偏移后派生多种视图。
 *
 * 解决 Scene1Terrain._applySceneData 的已知问题：
 * 同一个 obj 引用被 push 到 _collisionShapes 与 _editorShapes 两个数组，
 * 之后两次遍历各自对 points 应用 worldOffset，导致坐标被偏移两次。
 *
 * 本模块的约束：
 *   1. 原始局部对象只读，不被修改
 *   2. 每个对象只计算一次世界坐标
 *   3. 碰撞、渲染、交互视图共享同一份世界坐标，且各自持有独立数据副本
 *   4. 重复投影同一场景，结果与首次一致（不累积偏移）
 */

/** 视图类型 */
export const ProjectionView = {
  RENDER: 'render',
  COLLISION: 'collision',
  INTERACTION: 'interaction'
};

export class SceneObjectProjector {
  /**
   * @param {Object} [config]
   * @param {Function} [config.isCollidable] - (obj) => boolean
   * @param {Function} [config.isInteractive] - (obj) => boolean
   * @param {Function} [config.isRenderable] - (obj) => boolean
   */
  constructor(config = {}) {
    this.isCollidable = config.isCollidable || ((obj) => !!obj.collide);
    this.isInteractive = config.isInteractive || ((obj) => !!obj.interactive || !!obj.trigger);
    this.isRenderable = config.isRenderable || ((obj) => obj.type !== 'trigger');
  }

  /**
   * 对单个对象应用一次世界偏移，返回新对象。
   * 原对象不被修改，因此可重复调用而不累积偏移。
   *
   * @param {Object} obj - 原始局部坐标对象
   * @param {{x: number, y: number}} worldOffset
   * @returns {Object} 世界坐标对象
   */
  project(obj, worldOffset, metadata = null) {
    if (!obj || typeof obj !== 'object') throw new TypeError('SceneObjectProjector.project requires a local object');
    if (!worldOffset || !Number.isFinite(worldOffset.x) || !Number.isFinite(worldOffset.y)) {
      throw new TypeError('SceneObjectProjector.project requires a finite worldOffset');
    }
    const ox = worldOffset.x;
    const oy = worldOffset.y;
    const projected = { ...obj, ...(metadata || {}) };

    if (typeof obj.x === 'number') projected.x = obj.x + ox;
    if (typeof obj.y === 'number') projected.y = obj.y + oy;
    if (typeof obj.sortY === 'number') projected.sortY = obj.sortY + oy;

    if (Array.isArray(obj.points)) {
      projected.points = obj.points.map(p => (
        Array.isArray(p) ? [p[0] + ox, p[1] + oy, ...p.slice(2)] : {
          ...p,
          ...(typeof p?.x === 'number' ? { x: p.x + ox } : {}),
          ...(typeof p?.y === 'number' ? { y: p.y + oy } : {})
        }
      ));
    }

    if (Array.isArray(obj.path)) {
      projected.path = obj.path.map(p => (
        Array.isArray(p) ? [p[0] + ox, p[1] + oy, ...p.slice(2)] : {
          ...p,
          ...(typeof p?.x === 'number' ? { x: p.x + ox } : {}),
          ...(typeof p?.y === 'number' ? { y: p.y + oy } : {})
        }
      ));
    }

    // 记录不可枚举的投影证明；消费者不得根据标记再次补 offset。
    Object.defineProperties(projected, {
      _localX: { value: typeof obj.x === 'number' ? obj.x : undefined, enumerable: false },
      _localY: { value: typeof obj.y === 'number' ? obj.y : undefined, enumerable: false },
      _worldOffset: { value: Object.freeze({ x: ox, y: oy }), enumerable: false },
      _worldOffsetApplied: { value: true, enumerable: false }
    });

    return projected;
  }

  /**
   * 投影整个场景的逻辑对象，并派生视图。
   *
   * 关键点：先算一次世界坐标，再基于同一份世界坐标生成各视图，
   * 且每个视图持有独立副本，后续任何视图级修改都不会互相污染。
   *
   * @param {Object} sceneData - { layers: [{ hidden, objects: [] }] }
   * @param {{x: number, y: number}} worldOffset
   * @returns {{objects: Array<Object>, render: Array<Object>, collision: Array<Object>, interaction: Array<Object>, byId: Map<string, Object>}}
   */
  projectScene(sceneData, worldOffset = { x: 0, y: 0 }) {
    const objects = [];
    const render = [];
    const collision = [];
    const interaction = [];
    const byId = new Map();

    const layers = (sceneData && sceneData.layers) || [];

    for (const layer of layers) {
      const layerHidden = !!(layer && layer.hidden);

      for (const obj of (layer && layer.objects) || []) {
        if (!obj) continue;

        // 一次偏移，得到该对象唯一的世界坐标
        const world = this.project(obj, worldOffset);
        world._layerHidden = layerHidden;

        objects.push(world);
        if (obj.id) byId.set(obj.id, world);

        // 各视图使用独立副本，避免共享引用被重复处理
        if (this.isCollidable(obj)) {
          collision.push(this._copy(world));
        }
        if (this.isInteractive(obj)) {
          interaction.push(this._copy(world));
        }
        if (!layerHidden && this.isRenderable(obj)) {
          render.push(this._copy(world));
        }
      }
    }

    return { objects, render, collision, interaction, byId };
  }

  /**
   * 深拷贝投影结果，切断视图之间的引用共享
   * @private
   */
  _copy(world) {
    const copy = { ...world };

    if (Array.isArray(world.points)) {
      copy.points = world.points.map(p => (Array.isArray(p) ? [...p] : { ...p }));
    }
    if (Array.isArray(world.path)) {
      copy.path = world.path.map(p => (Array.isArray(p) ? [...p] : { ...p }));
    }
    if (world._worldOffset) {
      Object.defineProperties(copy, {
        _localX: { value: world._localX, enumerable: false },
        _localY: { value: world._localY, enumerable: false },
        _worldOffset: { value: world._worldOffset, enumerable: false },
        _worldOffsetApplied: { value: true, enumerable: false }
      });
    }

    return copy;
  }

  /**
   * 校验投影结果是否存在共享引用。
   * 用于回归测试与调试，避免重新引入双重偏移问题。
   *
   * @param {Object} projection - projectScene 的返回值
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  static verifyNoSharedReferences(projection) {
    const errors = [];
    const seen = new Map();

    const check = (viewName, list) => {
      for (const item of list || []) {
        if (seen.has(item)) {
          errors.push({
            code: 'sharedReference',
            path: item.id || '<anonymous>',
            message: `对象同时出现在 ${seen.get(item)} 与 ${viewName} 视图中，会导致重复偏移`
          });
        } else {
          seen.set(item, viewName);
        }

        if (Array.isArray(item.points)) {
          for (const point of item.points) {
            if (!Array.isArray(point)) continue;
            if (seen.has(point)) {
              errors.push({
                code: 'sharedReference',
                path: `${item.id || '<anonymous>'}.points`,
                message: `points 数组在 ${seen.get(point)} 与 ${viewName} 之间共享引用`
              });
            } else {
              seen.set(point, viewName);
            }
          }
        }
      }
    };

    check(ProjectionView.COLLISION, projection.collision);
    check(ProjectionView.RENDER, projection.render);
    check(ProjectionView.INTERACTION, projection.interaction);

    return { ok: errors.length === 0, errors };
  }
}

export default SceneObjectProjector;
