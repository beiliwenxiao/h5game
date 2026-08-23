---
inclusion: fileMatch
fileMatchPattern: '{**/Scene1Terrain*,**/SceneTerrain*,**/SceneEditorUI*,**/CollisionSystem*,**/MovementSystem*,**/PathfindingSystem*,**/SceneFramePipeline*}'
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
## 非战斗碰撞自动绕障

玩家移动被地图/瓦片阻挡，或实体碰撞、地形碰撞把玩家推出时，由 `SceneFramePipeline` 在全部碰撞解算完成后统一处理：

- 非战斗状态优先调用 `MovementSystem.tryRerouteAfterContact()`，使用框架级 `PathfindingSystem` 做有界 A*；战斗状态不自动寻路，保持即时移动语义
- A* 固定使用 32px 网格、8 邻接与 octile heuristic；对角移动必须同时确认两个正交格可通行，路径简化也不得切墙角
- blocker 必须组合 `MovementSystem.canMoveTo()`、`SceneTerrainBinding.isPositionBlocked()` 和活动可碰撞实体快照；terrain 查询复用 `SceneTerrainCollision` 的水池、树、shape 与 walkable 优先规则，不得复制第二套几何，也不得再次应用 worldOffset
- 右键移动保留原始点击终点；键盘、触屏摇杆和手柄轴输入保留方向 intent，并只规划约 4–6 格的局部前视目标。三端继续共用 `getMoveAxis()` 和 `moveIntentRouter`，驾驶席不得错误套用玩家 A*
- 自动绕行路径仍由 `MovementComponent.path` 执行；相同方向的持续轴输入不得在下一帧调用 `startKeyboardMovement()` 清空路径。明显换向、松开方向或新右键输入会取消旧自动路径
- 搜索必须有局部 bounds、`maxVisited` 和重算冷却；目标格被阻挡时只在有限半径选择离原目标最近的合法格
- 非战斗 A* 不可达、搜索超限或战斗碰撞时，回退现有 0.5 秒 contact lock。锁只影响移动，不修改全局暂停，也不禁用攻击、交互或 UI
- 锁期间以首次合法落点为锚点；相机只能在移动、实体碰撞、地形修正和绕行提交后跟随最终位置，避免持续推挤抖动