---
inclusion: fileMatch
fileMatchPattern: '{**/input/**,**/InputManager.js,**/GamepadPanel.js,**/MovementSystem.js,**/Xbox360Profile.js,**/GamepadManager.js,**/UIEditor.js}'
---

# 手柄支持（Xbox 360 / W3C Standard Gamepad）

跨端手柄输入实现，遵循引擎 `src/core/input/` 分层。仅在编辑输入相关文件时加载本文档。

## 模块位置

| 文件 | 职责 |
|---|---|
| `src/core/input/Xbox360Profile.js` | W3C standard 按钮/轴索引常量、默认绑定表、UI 绘制布局、按钮标签与功能说明 |
| `src/core/input/GamepadManager.js` | Gamepad API 轮询器（采集层） |
| `src/ui/GamepadPanel.js` | 手柄示意 UI（表现层，纯 Canvas） |
| `src/core/InputManager.js` | 内置 GamepadManager，与键盘状态取或 |
| `src/systems/MovementSystem.js` | 通过 `getMoveAxis()` 支持摇杆模拟量移动 |

## 核心约定

### 1. Gamepad API 是轮询式，必须帧首 poll
`GameEngine.update` 开头调 `inputManager.pollGamepads()`，在任何 `isKeyDown/isKeyPressed` 读取**之前**。放到帧末（`InputManager.update()` 清帧处）会读到上一帧状态。

### 2. 手柄状态独立存放，查询时与键盘取或
手柄虚拟键存在 `_padDown/_padPressed/_padReleased`，**不写进** `this.keys`，避免污染键盘的按下/释放沿判定。`isKeyDown` 等做 `键盘 || 手柄` 合并。这样键盘和手柄可同时使用、互不干扰。

### 3. 虚拟键名必须对齐 InputManager.keyMap 的输出
绑定表的值是项目已用的虚拟键名（`up/down/left/right`、`skill1..skill7`、`e/c/b/v/q/escape/space`），不是原始物理键。改绑定时对照 `keyMap` 与各系统实际读取的键名（如 CombatSystem 的 `skillKeyMap`/`potionKeyMap` 用 `skill1..skill7`）。

### 4. A 键 = 攻击，走虚拟鼠标而非虚拟键
`Xbox360Profile.DEFAULT_BINDINGS[A] = null`。A 键在 `InputManager._updateGamepadCursor` 里注入虚拟鼠标左键（`_padMouseButtons.add(0)`），复用 `MeleeAttackSystem` 读 `isMouseButtonDown(0)` 的那套攻击瞄准逻辑。右摇杆驱动虚拟准星（原点取画面中心＝相机跟随的玩家位置）。

### 5. 摇杆死区用径向死区 + 重标定
`_applyDeadzone` 把 `[deadzone,1]` 重映射到 `[0,1]`，避免死区边缘速度突跳。默认死区 0.22。扳机（LT/RT）是模拟量，按 `triggerThreshold`（默认 0.5）离散成按下/松开。

### 6. 移动优先用 getMoveAxis()
`MovementSystem.handleKeyboardInput` 先取 `inputManager.getMoveAxis()`（返回归一化方向 + magnitude 推杆量，手柄摇杆可轻推慢走），拿不到再退回逐键判断。`getMoveAxis` 不存在时（旧 InputManager / 测试替身）走兜底分支，测试不受影响。摇杆同时补出数字方向键（`up/left` 等），让只读 `isKeyDown('up')` 的朝向/动画代码也能跟随。

### 7. 组合键热键用 registerHotkey 的修饰键选项
`registerHotkey(id, keys, cb, { ctrl, shift, alt })`。需要组合键时用这个选项，不要另写 keydown 监听。

- 判定在 `InputManager._modifiersSatisfied()`，只读 `this.keys`（**纯键盘状态**），不用 `isKeyDown()`。
- 原因：`isKeyDown()` 会并入手柄虚拟键，而手柄绑定里 `ctrl` 用于轻功，用它判断会在按住轻功时误触发组合键。
- 需要屏蔽浏览器默认行为时，`handleKeyDown` 里按组合条件 preventDefault（如 `key === 'X' && event.ctrlKey`），不要整键拦截，否则该单键就被游戏吃掉了。
- 调试/工具类入口优先放调试面板按钮，不要占用键盘键位（手柄按键图就是这么处理的）。

## 平台支持

| 宿主 | 支持度 |
|---|---|
| web / electron | 完整（Chrome/Edge 下 Xbox 360 走 XInput，standard 映射） |
| capacitor(Android WebView) | 按钮/摇杆可用，震动多数机型不支持 |
| weapp(微信小游戏) | 无 Gamepad API，`isSupported()` 返回 false，全部降级 |

浏览器安全策略：手柄插上后需**先按一次任意键**才会出现在 `navigator.getGamepads()` 中。

## UI（GamepadPanel）

- HUD 常驻小指示：手柄连接即在左下角显示 🎮 + 手柄名，不受面板 `visible` 影响。
- 完整面板：由**调试面板**（反引号 `` ` `` 打开）里「手柄」分组的「🎮 Xbox 360 按键图」按钮切换，不占用键盘热键。左半画手柄图（摇杆帽随推杆偏移、按下的键呼吸高亮），右半是按键→功能映射表。
- 纯 Canvas 绘制无图片依赖（微信小游戏也能画）。面板内点击一律消费，防穿透。
- 手柄面板**不注册任何键盘热键**。F1 被系统/浏览器帮助占用，Ctrl+F1 也易与外部软件冲突，因此入口放在调试面板：
  - `DebugPanel` 的「手柄」分组里有 `#dp-gamepad-panel` 按钮，点击调 `scene.gamepadPanel.toggle()`；同组的 `#dp-gamepad-state` 每帧显示连接状态（读 `inputManager.gamepad.isConnected()` 与 `.info`）。
  - `InputManager.handleKeyDown` 的 preventDefault 白名单**不含 F1**，F1 完整交回系统。

## 默认按键映射

```
左摇杆/十字键  移动          右摇杆  瞄准方向
RT 按住  攻击（快按=面向攻击；长按+右摇杆=精确朝向，松开释放）
RB 按住  释放当前技能（右摇杆瞄准，松开释放；自瞄技能按下即放）
LB       切换技能（按住弹出环形轮盘，右摇杆选，松开确认）
Y 按住   轻功（左摇杆控制目标位置，松开触发瞬移）
B 按住   投掷（左摇杆方向，松开投出）
LT 按住  格挡（按住期间生效，有时效/冷却）
A        拾取/交互/确认对话
X        拾取/交互/确认对话
十字键↑  红药水    十字键↓  蓝药水
Back 背包（属性+装备+物品）
Start （空出，留给未来功能）
RS 取消选中
按键图入口：调试面板（反引号打开）→ 手柄 → 🎮 Xbox 360 按键图
```

### 操作模型（三端同构）

| 操作 | PC | 手机 | 手柄 |
|---|---|---|---|
| 普通攻击 | 鼠标左键（方向=鼠标位置） | 攻击按钮按住→拖拽方向→释放 | RT 按住→右摇杆方向→释放 |
| 技能 | 数字键进入瞄准→鼠标指向→左键确认 | 技能按钮按住→拖拽→释放 | RB 按住→右摇杆指向→释放 |
| 轻功 | Ctrl 进入瞄准→鼠标指向→左键确认 | 轻功按钮按住→拖拽位置→释放 | Y 按住→左摇杆指向目标→释放 |
| 投掷 | Shift 进入瞄准→鼠标指向→左键确认 | 投掷按钮按住→拖拽方向→释放 | B 按住→左摇杆方向→释放 |
| 格挡 | Q 按住 | 格挡按钮按住 | LT 按住 |
| 切换技能 | 数字键直选 | 点击技能按钮 | LB 环形轮盘 |

### 环形轮盘（LB 技能选择器）

- LB **按住**瞬间弹出环形 UI（以玩家为中心），显示所有可用技能图标
- 右摇杆推向目标技能方向 → 高亮该技能
- LB **松开** → 确认选择，关闭轮盘，HUD 更新当前技能
- 轮盘开启期间游戏不暂停，但玩家不能攻击/释放技能（LB 占用右手食指，RT/RB 无法同时按）
- 快按 LB（< 200ms 无推杆）= 顺序切到下一个技能（不弹轮盘，适合快切）

### 攻击判定

- RT 快速按放（< 150ms）：以角色当前面向方向立刻攻击
- RT 长按：进入攻击蓄力态，脚下显示扇形预览跟随右摇杆方向，松开释放
- 右摇杆在死区内时朝向默认为角色面向

### 自瞄技能特殊处理

`range === 0` 的技能（heal / meditation）在 RB 按下瞬间直接释放，不进入瞄准态。

`GamepadManager.setBinding(buttonIndex, key)` 可运行时改绑定；构造时传 `options.bindings` 覆盖默认。

## 编辑器绑定配置（UIEditor 手柄标签页）

UIEditor 的第三个标签页 `🎮 手柄`：
- 左侧表格：每个手柄按钮一行 + 下拉选择可绑定动作（分组：战斗/移动/技能/快捷/面板/其它）
- 右侧：摇杆死区 + 扳机阈值数值输入
- 保存到 `config/gamepad.json`（与 UILayout.desktop/mobile.json 同目录）
- 游戏运行时 `BaseGameScene._loadGamepadConfig()` 读取并 `GamepadManager.applyConfig(cfg)`

### 可绑定动作清单（Xbox360Profile.BINDABLE_ACTIONS）

`ATTACK_ACTION`（攻击，走虚拟鼠标）、`NONE_ACTION`（无）、以及所有虚拟键名。`ACTION_LABELS` 提供中文名快速查表。

### 攻击键可配置

绑定值为 `ATTACK_ACTION`（`'attack'`）的按钮走虚拟鼠标左键。可以把攻击从 A 改到 RT 等：
- `GamepadManager.getAttackButtons()` → 所有绑定为 attack 的按钮索引列表
- `GamepadManager.isAttackDown()` / `isAttackPressed()` → 查询

## Demo 主循环与帧守卫

张角 demo 不走 `GameEngine`（自建主循环），所以 `pollGamepads` 必须在场景 update 帧首调用：
- `BaseGameScene.update` 开头：`this.inputManager.pollGamepads()`
- `DataDrivenPrologueScene.update` 开头也调一次（它在 `super.update` 前就读输入）

**帧守卫**：`InputManager._padPolledThisFrame`，一帧只真正轮询一次。`InputManager.update()`（帧末清帧）重置。重复调用（GameEngine + 场景）不会互相清空 pressed/released。

## 测试

`src/core/input/GamepadManager.test.js` 用假 navigator（`options.nav` 注入）覆盖连接/断开、按钮沿、扳机阈值、摇杆死区、虚拟键映射。手柄真机行为需实际设备验证。
