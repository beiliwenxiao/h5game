# 拾取与交互统一入口

## 拾取的四种触发方式（走同一套逻辑）

游戏中拾取地上物品有四种触发方式，全部复用 `PickupSystem` 的**范围拾取**（拾取玩家 `pickupRadius` 内的物品）：

1. **E 键**（PC 键盘）— `PickupSystem.update()` 检测 `isKeyDown('e')`
2. **交互按钮**（移动端）— index.html 里 `data-act="interact"` 按钮调用 `tapKey('e')` 模拟按 E
3. **触屏**（移动端）— 同交互按钮，`tapKey('e')`
4. **PC 左键点击物品** — `BaseGameScene.handlePickupClick()` 命中物品图标后调用 `PickupSystem.triggerPickup()`

## PickupSystem 结构（src/systems/PickupSystem.js）

- `update(...)`：检测 E 键 → 调用 `_tryPickup()`
- `triggerPickup(playerEntity, pickupItems, equipmentItems)`：外部触发一次拾取（PC 左键点击用），→ `_tryPickup()`
- `_tryPickup(...)`：核心逻辑（冷却检测 + 范围内批量拾取），E 键和左键共用

新增其它拾取触发方式时，统一调用 `triggerPickup()`，不要复制拾取逻辑。

## PC 左键点击拾取（BaseGameScene）

- `tryClickPickup(worldX, worldY)`：检测点击世界坐标是否命中可拾取物品图标（命中半径 30px），命中则触发范围拾取并移除掉落物实体
- `handlePickupClick()`：包装左键判定，命中物品时 `markMouseClickHandled()` 阻止本次左键攻击/投掷

### 关键坑：拾取判定必须在攻击判定之前
`MeleeAttackSystem.update()` 内部用 `isMouseButtonDown(0) && !isMouseClickHandled()` 触发攻击。而 `meleeAttackSystem.update()` 在 `handleUIClick()` **之前**调用。因此左键拾取判定 `handlePickupClick()` 必须放在 `meleeAttackSystem.update()` **之前**执行，命中物品时提前 `markMouseClickHandled()`，否则会先触发攻击。

调用顺序（BaseGameScene.update）：
```
updateMouseAngle → handlePickupClick() → meleeAttackSystem.update() → ... → handleUIClick()
```

### 安全条件
`handlePickupClick()` 在以下情况不拾取：
- 右键（移动，`getMouseButton() === 2`）
- 对话激活（`dialogueSystem.isDialogueActive()`）
- 背包/装备面板打开（点击交给 UI 处理）

## 鼠标操作约定（PC）
- **左键**：点物品 → 拾取；点空白 → 攻击（MeleeAttackSystem）
- **右键**：移动到目标位置（MovementSystem）
- **Ctrl+左键**：轻功瞬移（FlightSystem）
- **Shift+左键**：投掷武器

## 世界坐标获取
点击世界坐标优先用 `this.camera.screenToWorld(screenX, screenY)`，相机不存在时回退 `inputManager.getMouseWorldPosition()`（与 `_debugRightClick` 一致）。
