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
3. 不再使用椭圆盆地或区块边缘作为自动物理边界
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
## 玩家碰撞停顿

玩家移动被地图/瓦片阻挡，或实体碰撞、地形碰撞首次把玩家推出时，统一由 `SceneFramePipeline` 汇总接触信号并调用 `MovementSystem.setMovementContact()`：

- 默认只锁定玩家移动 0.5 秒，立即清空速度、点击路径和移动动画；键盘、触屏、手柄与右键移动共用同一锁，不得建立输入旁路
- 锁只影响移动，不修改全局暂停，也不禁用攻击、交互或 UI；AI 和其他实体继续更新
- 首次推出后以碰撞解算得到的合法位置作为锚点；锁定期间再次被实体或地形推出时恢复该锚点，再由相机跟随最终位置，避免画面连续往返波动
- `MovementSystem.update()` 负责报告地图/瓦片 `playerBlocked`，实体与地形推出由管线在各碰撞阶段前后比较玩家坐标；不得用渲染坐标或 worldOffset 重复推导
- 持续接触使用边沿锁存，不在每帧无限叠加计时；锁到期后再次发生推出才开始下一次停顿