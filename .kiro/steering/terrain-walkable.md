---
inclusion: fileMatch
fileMatchPattern: '{**/Scene1Terrain*,**/SceneEditorUI*,**/CollisionSystem*}'
---

# 地形碰撞与可落脚区域

## 两种互斥的地形多边形属性

编辑器中 shape 对象有两个复选框，互斥（勾选一个自动取消另一个）：

- **可碰撞** (`collide: true`) — 不可通行区域，玩家碰到被弹回
- **可落脚** (`walkable: true`) — 可行走区域，**即使脚下有碰撞区也放行**

## 运行时判定顺序（Scene1Terrain.isBlocked）

```
1. 遍历 walkableShapes → 点在内部 → return false（放行）
2. 遍历 collisionShapes → 点在内部 → return true（阻塞）
3. 椭圆盆地边界判定（原有逻辑）
```

**walkable 优先于 collide**：可以在整片碰撞区（如树林）中画一条 walkable 多边形（小路），路上的点先命中 walkable 直接放行。

## 数据收集（_applySceneData）

```js
this._collisionShapes = [];  // obj.type === 'shape' && obj.collide
this._walkableShapes = [];   // obj.type === 'shape' && obj.walkable
```

- 碰撞和可落脚 shape 无论图层是否可见都收集（逻辑层不依赖视觉）
- 两者都不放入 `_editorShapes`（避免 worldOffset 双重偏移）
- worldOffset 阶段对两者都做坐标偏移

## 编辑器属性面板

SceneEditorUI.js 中 `_buildShapeProperties` 末尾：
```html
可碰撞: <checkbox data-prop="collide">
可落脚: <checkbox data-prop="walkable">
```

互斥逻辑在 `data-prop` change 处理器中：勾选 collide 时 `obj.walkable = false`，反之亦然。取消勾选则两个都为 false（普通装饰形状）。
