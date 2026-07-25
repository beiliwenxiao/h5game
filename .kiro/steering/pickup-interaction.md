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


## 获得物品弹窗（食物/装备）

### 功能
拾取或获得「食物(consumable)/装备(equipment)」时，弹出带图标的小窗口 + 左侧系统文字提示。
- 窗口：物品图标（稀有度边框）、名称（稀有度色）、描述、属性对比、两个按钮（主操作 + 放入背包）
- **属性对比配色约定（涨红跌绿）**：增加 → 箭头向上 ▲ + 红色(`#ff4d4d`) + `+N`；减少 → 箭头向下 ▼ + 绿色(`#3cc46a`) + `-N`

### 组件 `src/ui/ItemGainedPopup.js`（继承 UIElement）
- `show({ item, comparison, primaryLabel, onPrimary, onStore })` / `hide()`
- `comparison`：`[{ name:'攻击', diff:+3 }, ...]`，diff>0 涨红↑、diff<0 跌绿↓
- 复用 `ItemIconRenderer.drawIcon()` 画图标（失败回退首字占位）
- `handleMouseClick` 内做按钮命中检测；zIndex=260（高于其它面板，UIClickHandler 按 zIndex 降序派发，优先拿到点击）
- 高度随对比行数自适应

### 触发流程（两条路径，统一走 `BaseGameScene.onItemGained(item, player)`）
1. **拾取**：`PickupSystem.onPickup(cb)` 钩子 → 在 BaseGameScene 注册 `this.pickupSystem.onPickup((item,p)=>this.onItemGained(item,p))`。注意：拾取时 `PickupSystem.pickupItem` **已把物品加入背包**，所以"放入背包"按钮=仅关闭窗口。
2. **得到（奖励/对话）**：`TriggerActions.giveReward` 每加一件物品后调用 `ctx.onItemGained(item, player)`。链路：`giveReward` → `ctx.onItemGained` ←(GameLoader setContext 透传 `deps.onItemGained`)← `DataDrivenPrologueScene._initGameLoader` 传入 `onItemGained:(item,p)=>this.onItemGained(...)`。

### onItemGained 逻辑（BaseGameScene）
- 只对 `type==='equipment'` 或 `'consumable'` 弹窗
- 左侧系统提示：`this.notificationSystem.addNotification('获得 xxx', ...)`（NotificationSystem 渲染于左上 HUD 下方 x:10,y:96）
- 装备：`_computeEquipComparison(item, player)` 预览"新装备 stats vs 当前槽位装备 stats"差值（**不真正装备**）；主按钮"装备"
- 可用消耗品：主按钮"使用"
- 主按钮动作 `_onGainedPopupPrimary`：
  - 装备：从背包 `removeItem` → `EquipmentSystem.equipItem(player, targetSlot, item)`（穿上+重算属性，旧装备放回背包）→ 属性变化提示 → `_refreshEquipmentPanels`
  - 消耗品：在 `inventory.slots` 定位 → `inventoryPanel.useItem(idx)` 应用效果

### 关键点/复用
- **槽位映射**：`{weapon:'mainhand', shield:'offhand', ammo:'offhand', ring:'ring1'}`，其余 subType 即槽位名；用 `EquipmentComponent.isValidEquipmentForSlot` 校验
- **面板刷新**：面板持有玩家实体引用并每帧从中渲染，装备后调 `setPlayer`/`setEntity` 重设即可（不是 updatePlayer/updateInventory）
- **渲染顺序**：BaseGameScene.render 末尾显式 `notificationSystem.render(ctx)` 再 `itemGainedPopup.render(ctx)`（弹窗最上层）；update 里 `notificationSystem.update(deltaTime)` 过期清理
- **点击注册**：弹窗注册进 `uiClickHandler`（仅可见时接收点击，按钮外点击不拦截）；通知系统不可交互，不注册点击
- 新弹窗/系统提示是框架级能力，其他 demo 复用同一套 `PickupSystem.onPickup` + `giveReward` 的 `ctx.onItemGained` 钩子即可接入


## 获得物品弹窗——连续拾取队列

### 需求
连续拾取多件食物/装备时，新物品不覆盖当前弹窗，而是**排队逐个弹出**让用户依次选择。

### 实现（BaseGameScene）
- 维护 `this._gainedQueue = [{item, player}, ...]`
- `onItemGained(item, player)`：每件都发左侧系统提示；把 `{item, player}` **压入队列**；仅当 `itemGainedPopup.visible === false` 时才 `_showNextGained()` 弹出队首（避免打断正在处理的那件）
- `_showNextGained()`：`q.shift()` 出队一件 → 算 `comparison`/`primaryLabel` → `popup.show({..., remaining: q.length})`；三个按钮回调（装备/使用、放入背包）处理完统一调 `_showNextGained()` 推进；队列空则 `popup.hide()`
- `_onGainedPopupPrimary` **不再自己 hide/show**（含装备失败的提前 return 分支也不 hide），显示推进完全交给 `_showNextGained` 收尾，避免 hide 后又 show 的抖动，也保证装备失败仍推进到下一件

### 弹窗（ItemGainedPopup）
- `show({ remaining })` 存 `this.remaining`；`render` 在右上角画「还有 N 件」提示队列剩余

### 关键点
- 入队判断用 `popup.visible`；正在显示时只入队不弹，靠按钮回调驱动出队，形成"处理一件→弹下一件"的链
- 系统文字提示（NotificationSystem）与队列解耦：每件拾取都即时提示，不受逐个弹窗节奏影响

## 掉落物/无图源实体：sprite 图源留空避免刷警告（通用规则）
`renderEntity` 的序列帧分支条件是 `sprite.spriteSheet` 为真时才 `getAsset()`。若给实体设了**不存在的占位图名**（如 `'loot_sprite'`、`'npc_sprite'`），会每帧 `getAsset` 失败刷 `AssetManager: Image 'xxx' not found`。
**规则**：实体无真实图片来源时，`SpriteComponent` 的图源一律传空字符串 `''`（不要用占位名），使 renderEntity 跳过图片分支，落到 renderStyle 代码立绘 / 占位色块 / `renderPotionSprite`(loot) 等分支。
已修复点：`EntityFactory.createNPC`（无图→''）、`PickupSystem.createLootEntity`（`'loot_sprite'`→''）。`createProp` 本就用 `|| ''`。
