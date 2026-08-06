---
inclusion: fileMatch
fileMatchPattern: "src/{systems/{effects,ability,progression},core/{input,snapshot,validation,scene}}/**/*.js"
---

# 成长与引擎基础设施实施现状

记录 S1–S10 已落地的模块与必须遵循的约定。决策依据见 #[[file:progression-decisions.md]]，通用规则见 #[[file:progression-system.md]]。

## 已完成阶段

| 阶段 | 内容 | 位置 |
|---|---|---|
| S1 | 统一效果结算 | `src/systems/effects/` |
| S2 | 技能定义与执行分离 | `src/systems/ability/` |
| S3 | 统一成长图内核 | `src/systems/progression/` |
| S4 | 旧系统转发到内核 | `SkillTreeSystem` / `TalentSystem` |
| S5 | 暗黑式分支与技能形态 | `SkillDefinition.variants` + Demo 配置 |
| S6 | 45 节点天赋盘 | `example/sanguo_zhangjiao/config/` |
| S7 | 项目配置选主 | `ProgressionProfile` + `GameLoader` |
| S8 | 统一成长 UI | `src/ui/progression/` |
| S9 | 输入路由与原子检查点 | `src/core/input/`、`src/core/snapshot/` |
| S10 | 内容校验与场景通用能力 | `src/core/validation/`、`src/core/scene/` |

## 效果系统（S1）

全部成长、装备、状态、职业效果统一经 `EffectResolver` 结算，禁止各系统自行解释效果字段。

结算顺序固定：

```text
base + Σadd → ×(1 + ΣaddPercent) → ×Πmultiply → override → clampMin/clampMax
```

要点：

- 效果按 `entityId` 分来源存储，多角色天然隔离。
- `EffectSource.fromLegacy` 映射旧字段；未登记字段进入 `unmappedLegacy`，可用 `getRawLegacy()` 排查，不静默丢失。
- 未注入 `conditionEvaluator` 时，带条件效果默认不生效，避免误加成。
- 存在条件效果的实体不缓存结算结果；来源变化调用 `invalidate`。
- `explain()` 返回基线、最终值与每个来源贡献，是验证职业固定数值的唯一手段。
- `manaRegenBonus` 目标为 `manaRegen`，与现有 stats 字段一致，不要改成 `mpRegen`。

## 技能系统（S2、S5）

职责边界，不得混淆：

```text
SkillRegistry     技能是什么（只读定义）
成长系统           角色是否学会（产出 skill.unlock 效果）
EffectResolver    参数如何被强化（skill.modify 效果）
AbilitySystem     能否释放（解锁、冷却、消耗、距离、目标、施法）
CombatSystem      表现与伤害结算（作为执行器被调用）
```

约定：

- `CombatSystem.executeSkill(context)` 是执行器入口，不重复检查冷却与消耗。
- 效果目标命名：`skill.<skillId>.<param>`、`skill.<skillId>.cost.<res>`。
- 技能形态由 `rule.override` 效果指定 `skill.<skillId>.variant`。
- 形态先替换基线，强化再叠加。例如旋风斩基线 20，两级 +10% 得 24，而非先算基础 30 再换形态。
- `AbilitySystem.use()` 在执行器返回 `false` 或抛错时回滚消耗、冷却与施法状态。
- 时间源通过 `config.now` 注入，测试使用固定时钟。
- `requireUnlock: false` 用于尚未接入成长系统的场景。

## 成长图内核（S3、S4）

四类成长共用一套内核：

```text
classSkill     技能树        pointPool: skill
classTalent    职业天赋树    pointPool: talent
unitTalent     兵种天赋树    pointPool: unit
passiveBoard   天赋盘        pointPool: passive，requireConnected: true
```

强制约定：

- `NodeDefinition` 禁止包含 `currentRank`、`isLearned`、`isUnlocked`；角色状态只存 `ProgressionState`。
- 分配流程：`previewAllocate` 只读校验 → 扣点 → 写等级 → 同步效果；任一步失败不产生半成品状态。
- `deallocateNode` 先在 `clone()` 草稿上撤销，用 `checkNoOrphans` 检查后才提交，防止后续节点悬空。
- 天赋盘新节点必须与起点或已分配节点相邻；起点视为天然可达，不需先花点。
- `getSpentPoints` 统计**节点等级数**，不是消耗点数。`gates.spentInGraph` 同样基于等级数。重要节点消耗 2 点但只算 1 级。
- 存档按 `graphId` 分命名空间；禁用某图不删除其状态。
- 版本不一致时 `deserializeCharacter` 返回 `versionMismatch` 且不改运行状态。

旧系统已转发到内核：

- `SkillTreeSystem.learnSkill` / `TalentSystem.learnTalent` 内部调用 `LegacyProgressionAdapter`。
- 节点上的 `currentLevel` / `isLearned` 降级为**当前查询角色的只读投影**，由 `projectCharacterState` 刷新，仅供尚未迁移的 `SkillTreePanel` / `TalentPanel` 使用。真实状态在 `ProgressionState`。
- `SkillTree`、`SkillTreeNode`、`TalentTree`、`TalentNode` 四个类未改动，其单元测试仍有效。
- 硬编码节点可用 `LegacyTreeConverter` 导出为图配置 JSON。

## 项目配置（S7）

`game.project.json` 的 `progression` 段驱动 `ProgressionProfile`：

- 四个预设：`classicRpg`、`arpg`（默认）、`poeLike`、`roguelite`。
- 主结构必须在 `enabled` 内，否则回退到 `enabled` 首项。
- 未启用的图分配时返回 `AllocationReject.GRAPH_DISABLED`，但**不删除存档状态**。
- `pointPools` 配置为共享池名时生成 `PointLedger` 别名；`canAfford` 会合并同物理池消耗，避免超支。
- 未设置 Profile 时全部图可用，保持向后兼容。

## 统一成长 UI（S8）

- `ProgressionViewModel` 是 UI 与成长系统之间的唯一通道；UI 不得直接改状态或点数。
- 页签顺序来自 `profile.getTabOrder()`，主结构在首位并标 `★`。
- 天赋盘必须经 `GraphViewport.cull()` 裁剪；裁剪结果按视口状态缓存，状态未变返回同一引用。
- 连线只要一端可见就绘制，否则视口边界会断线。
- 移动端 `requireConfirm`，首次点击只选中并提示，防止误耗点数。
- 面板内任何点击都被消费，避免穿透到游戏世界。
- 新面板不替换旧 `SkillTreePanel` / `TalentPanel`；两者通过节点投影并存。

## 输入路由（S9）

`InputManager` 继续采集设备状态，`InputActionRouter` 负责分发。优先级固化为数据：

```text
模态UI → 面板UI → 瞄准 → Ctrl轻功 → Shift投掷 → 拾取 → 技能 → 攻击 → 右键移动
```

这取代了「靠调用顺序保证拾取先于攻击」的旧做法，顺序不再依赖代码行位置。

按键与修饰键约束内置在 `HANDLER_CONSTRAINTS`，接线时无需手写 `canHandle`：

```text
FLIGHT   左键 + 需要 Ctrl
THROW    左键 + 需要 Shift + 禁止 Ctrl
PICKUP   左键 + 禁止 Ctrl/Shift
ATTACK   左键 + 禁止 Ctrl/Shift
MOVE     右键
```

要点：

- `buttons` 只作用于指针事件，键盘与虚拟按钮不受影响，因此 E 键仍能进入 PICKUP。
- `constraint: null` 取消内置约束，传对象可覆盖；用 `hasOwnProperty` 区分「显式 null」与「未传」。
- `InputEvent.consume()` 只能成功一次，重复调用返回 `false`。
- 指针事件被攻击之前的处理者消费时，自动调用 `markMouseClickHandled()`，桥接尚未迁移的 `MeleeAttackSystem`。攻击与移动消费时不标记。
- `enqueueInteract()` 让 E 键、移动端按钮、触屏产生完全相同的事件。
- `describeLastFrame()` 输出每个事件的消费者，排查争抢不用加日志。

## 原子检查点（S9）

`SnapshotManager` 参与者提供 `snapshot` / `validate` / `restore`。恢复严格分两段：

```text
1. migrate → validate 全部参与者   任一失败即放弃，运行状态零改动
2. capture 回滚快照 → 依次 restore  某个失败则回滚已写入的部分
```

要点：

- `capture()` 一次遍历全部参与者，避免不同系统状态错位。
- 参与者错误自动加段落前缀，如 `data.progression.value`。
- 缺少迁移器时返回 `missingMigration`，不静默失败；有 32 次循环保护。
- 存档 JSON 损坏时返回 `invalidJson`，**原样保留存档**，不删不覆盖。
- `SaveGameService` 基于 `SnapshotManager + LocalStorageAdapter` 提供命名空间化存档；业务场景只注入 `capture/validate/restore`，不得绕过原子恢复直接逐段写状态。
- 存档位固定分为 `autosave-1`、`autosave-2`、`autosave-3` 三个轮换自动位与最多 100 个 `slot-1` 至 `slot-100` 手动位。自动保存只能调用 `saveAuto()`：优先填充空自动位，三个均存在时覆盖 `createdAt` 最早的一位；手动保存只能调用 `save(index)`，两者不得互相覆盖。
- 张角 Demo 每 15 分钟、完成地图区块传送、以及内容触发器的 `autoSave` 动作都会请求自动保存。保存开始/成功/失败均通过 `NotificationSystem` 与菜单状态栏反馈；场景层只经 `BaseGameScene.requestAutoSave()` 请求，由宿主注入实际服务并用单一 in-flight Promise 防止并发选中同一自动位。
- 张角 Demo 在 Vite 开发服务器下还必须把成功快照镜像到 `example/sanguo_zhangjiao/saves/{autosave-1|autosave-2|autosave-3|slot-N}/snapshot.json`，并将画面缩略图以二进制 `thumbnail.jpg` 同目录保存；JSON 用 `meta.previewFile` 引用图片，不重复内嵌 base64。浏览器 localStorage 仍是运行时同步读档缓存，文件写入失败必须向用户明确提示。
- `ProgressManager` 未废弃，可继续作为旧路径；新代码用 `SnapshotManager` + `LocalStorageAdapter`。

## 内容校验（S10）

`ContentValidator` 在 `GameLoader` 修改运行状态之前拦截错误配置。

要点：

- 所有错误必须能定位字段路径；JSON 语法错误还要给出行列（`locateJsonError` 优先用 position 反算）。
- `loadCandidate` 实现「校验通过才替换」，失败时返回当前值，最近一次有效状态保持可运行。
- `canonicalize` 按 Schema 字段声明顺序重排，其余键名排序，保证 `stringify → parse → stringify` 文本一致。
- 内置五个 Schema：`effect`、`skill`、`progressionNode`、`progressionGraph`、`progressionConfig`。
- Schema 校验与 `GraphDefinition.validate()` 是双层拦截，职责不同：前者在配置进入系统前，后者在构造后。
- `GameLoader.assembleProgression` 三层校验：配置整体 → 技能列表 → 每张图；非法项不写入运行状态，错误累积到 `lastValidationErrors`。

## 场景通用能力（S10）

`src/core/scene/` 提供三个可增量采纳的模块：

**SceneSystemContainer**：系统注册、`order` 显式更新顺序、`destroy()` 覆盖全部系统并逆序执行。单个系统抛错不影响其余。

**SceneObjectProjector**：局部坐标一次偏移后派生碰撞、渲染、交互视图。四条硬约束：

1. 原始局部对象只读
2. 每个对象只算一次世界坐标
3. 各视图共享同一份世界坐标但各持独立副本
4. 重复投影结果一致，不累积偏移

`verifyNoSharedReferences(projection)` 可在回归测试中检测视图间是否又出现共享引用。这直接针对 `_applySceneData` 的双重偏移问题。

**GameSceneRuntime**：既支持完整帧的「输入分发 → 系统更新 → 场景 hook → `InputManager.update()` 清帧」，也支持 `beforeInput` / `priorityInput` / `systems` / `afterScene` 分阶段调度。迁移旧场景时由 `SceneFramePipeline` 在原调用位置触发阶段，转场提前返回不会意外清帧。`registerInputHandler`、`registerSnapshotProvider`、阶段 hook 与 `onUpdate` 的注销函数自动进入 disposer，`dispose()` 逆序执行。

`BaseGameScene` 已采用这些模块，场景本体只保留场景编排、游戏内容钩子与兼容转发入口：

- `SceneTerrainCollision`：集中处理水池、树木和编辑器碰撞形状；静态碰撞体按 terrain 建空间索引，异步场景数据替换或数量变化时自动失效。椭圆盆地只负责视觉与装饰布局，**不得**作为物理边界；walkable 优先于 collide，区块接缝不会被 terrain 自动推出。
- `SceneTerrainBinding`：统一单/多 terrain 的创建、特效区域、Buff 区域、碰撞与小地图绑定；所有 terrain 均处理水池、树与 shape，具体 Terrain 类型通过依赖注入。
- `SceneAimController` + `SceneAimPresentation` + `AimPreviewRenderer`：统一 PC/触屏/手柄的瞄准控制、状态与 5px 虚线预览；场景通过回调注入射程和确认动作。
- `SceneEquipmentFlow`：统一装备槽位映射、属性差值和装备/卸下事务；变更结果仍必须由 `BaseGameScene.onEquipmentChanged(messages, info)` 派发。
- `SceneItemGainedFlow`：管理拾取/奖励后的 FIFO 弹窗、装备比较和使用动作；弹窗装备同样必须经过统一装备事件出口。
- `SceneInventoryFlow`：统一卸装、物品使用和获得物品入口；所有卸装结果仍由 `onEquipmentChanged(messages, info)` 派发。
- `SceneInputFlow`：统一帧首手柄 poll、弹窗优先消费、战斗意图、InputActionRouter 与正常帧末 flush；转场提前返回只 release，不清输入。
- `SceneHudUpdater`：统一冷却、面板、对话框、手柄面板和小地图更新；RenderPipeline 只绘制，不在 render 内修改 UI 状态。
- `SceneLifecycleCoordinator`：为同步 Scene API 提供 `exitSync()`，Base 退出事务由协调器拥有；ResourceScope 先失效，随后按既有顺序释放输入、玩家、系统、UI 与实体。
- `WorldMapLoadSession` + `WorldReadyGate`：项目/场景只加载一次，terrain 与 placements 共享 Promise；JSON 文件优先、localStorage 仅 fallback，3 秒超时仍开放渲染。
- `PlacementSpawner` + `ChunkNavigator` + `FadeOverlayTransition`：分别承接通用放置点生成、chunk 传送和淡黑状态机；Demo 分组/NPC/剧情副作用通过回调注入。
- `SceneGameLoaderBridge`：组装标准 GameLoader 依赖、物品奖励、对话结束唯一订阅、上下文和 sceneEnter；具体剧情动作由场景通过 `registerActions` 注入，Bridge 负责 generation 防止退出后旧加载继续装配。
- `SceneTransitionFlow`：封装转场的淡入、提示和切换阶段，`isTransitioning` 与 `transitionPhase` 只读投影给子场景。
- `SceneCombatActions`：承接 PC、触屏和手柄的攻击、轻功、投掷、格挡、药水与自动攻击；不拥有系统或实体状态，也不再混入技能编排和世界拾取。
- `SceneSkillActions`：统一技能可用性、特殊技能、按索引/方向释放、PC 瞄准控制与预览；`SceneAimController` 仍只负责几何和状态。
- `SceneWorldInteraction`：统一 UI 点击优先级、点击拾取、保留的 `handleTeleport` 入口与右键正式反馈/调试标记；拾取删除必须经过 `SceneEntityStore.removeMany()`。
- `SceneDialogueFlow`：统一继续对话、跳过打字机、选项节点保护和点击消费；`lastSpacePressed` 继续作为兼容字段保留。
- `ScenePanelLayout`：组合并绑定 HUD，加载 UIEditor/PanelEditor 布局、响应窗口缩放、同步面板悬停，并在背包打开时协调 Canvas 与 DOM 触屏控件层级。
- `SceneWorldPresentation`：统一通用 terrain/等距背景、掉落物、飞行阴影与格挡护盾；子场景仍通过 `renderBackground`、`renderFogLayer`、`renderSpeechBubbles` 覆盖 Demo 内容表现。
- `SceneFramePipeline`：通过显式 `{ scene, context }` 构造，输入与 HUD 优先从 `context.services` 调度；保持系统更新顺序和转场提前返回语义，正常帧最后才清输入。
- `SceneRenderPipeline`：通过显式 `{ scene, context }` 构造，并按 `worldLayers → screenLayers → modalLayers` 有序绘制；render 内禁止更新 UI 状态，Y-sort 缓冲继续复用。
- `SceneGameplaySystemAssembler`：集中创建、接线和释放 Combat/Movement/AI/Collision/Pickup/Meditation/Zone/Flight/Melee 及战斗渲染器；实例仍投影到场景字段，保持 `SceneFramePipeline` 调用契约和初始化顺序。
- `SceneDiagnostics`：集中管理 DebugPanel、PerformanceOptimizer/Monitor、draw-call Canvas 代理和纹理内存估算；监控关闭时不保留代理，场景退出时恢复 Canvas 原方法。
- `EntityRenderer2D`、`ItemSpriteRenderer`、`ClickFeedbackRenderer`：承接实体、掉落物和点击反馈绘制；实体渲染器缓存已就绪资源、代码样式与稳定文本测量结果。

Demo 默认角色的选择配置、技能和系统/UI 绑定位于 `example/sanguo_zhangjiao/entities/DemoPlayerFactory.js`；底层实体创建仍必须复用框架 `EntityFactory.createPlayer()`，不要把 Demo 技能写入框架。

`BaseGameScene` 已直接继承框架 `Scene`；旧 `PrologueScene` 与 Act1–6 独立场景已删除。运行时只注册 `DataDrivenPrologueScene`，各幕通过 chunk ID 与 `teleportToChunk()` 推进。

新增场景功能应优先落在对应核心模块；仅与具体剧情、角色或资源强耦合的编排才保留在 Demo 场景中。

## 已知既有测试失败（与本次改造无关）

```text
CombatSystem/ElementSystem/MovementSystem/SkillTreeSystem.test.js   旧手写测试文件，缺 describe
AISystem                                                            测试 mock 缺 canAttack
DialogueSystem                                                      打字机时间敏感断言
FlightSystem.elevation ×2                                           层级与阶段断言
FriendSystem                                                        中文名排序
```

修改这些文件时可顺手修复，但不要与成长系统改造混在同一次提交。

## 后续阶段

S11 为 Demo 迁移验证：旧张角 Demo 通过新架构运行、逐个切换 `primary` 验证默认体验、100 实体性能检查。需要实际运行才有意义。

## BaseGameScene 深度重构执行方案

目标：`BaseGameScene` 最终只作为组合根，保留 constructor/enter/update/render/exit、暂停控制和少量 Demo 内容 hook；禁止继续把系统、UI、实体和世界状态平铺为无所有权的场景字段。

### 目标结构

- `GameSceneContext`：显式分组 input/camera/runtime/systems/entities/ui/world/presentation。
- `SceneResourceScope`：统一管理 timer、listener、disposer 和异步 token；退出后禁止异步任务写回旧场景。
- `SceneLifecycleCoordinator`：固定 Canvas→terrain→input→runtime→systems→UI→player→bindings 初始化顺序，并按逆序释放。
- `SceneEntityStore`：唯一拥有 all/enemies/pickups/equipmentItems 列表和批量移除/销毁。
- `ScenePlayerLifecycle`：统一创建或继承玩家、系统/UI/相机绑定和生命周期保护。
- `SceneInputBindings` / `SceneInputFlow`：前者统一热键、手柄配置和连接生命周期；后者统一帧首采集、弹窗优先消费、战斗意图、路由和帧末清理。
- `SceneSkillActions` / `SceneWorldInteraction` / `SceneDialogueFlow`：分别拥有技能、世界点击/拾取/选敌、对话输入。
- `SceneHintPresenter`：统一屏幕提示、InputHints 格式化、DOM fallback 和可取消自动隐藏。
- `SceneWorldPresentation`：统一背景、迷雾、气泡、拾取、飞行阴影和战斗表现。
- `SceneFramePipeline` / `SceneRenderPipeline`：只负责编排，改为接收显式 context/services，不再把 scene 当无约束属性仓库。

### 执行阶段

1. 删除无消费者的旧 GameLoader/等距地图/兼容转发入口。
2. 建立 Context、ResourceScope、EntityStore、PlayerLifecycle，并迁移 enter/exit 状态所有权。
3. 迁移热键、手柄、提示、技能、世界交互和对话输入。
4. 扩展 PanelLayout/TerrainBinding，抽离世界表现。
5. 将 Frame/Render Pipeline 改为显式依赖，迁移 DataDrivenPrologueScene 直接字段访问。
6. 删除迁移期 getter 和兼容字段，压缩 BaseGameScene 为薄组合根。

### 不可破坏的约束

- `DataDrivenPrologueScene._initEditorTerrain()` 必须保持空实现。
- 转场 show_text/switch_scene 提前返回时不得清输入；正常帧最后才清输入。
- 装备/卸下最终必须经过 `onEquipmentChanged(messages, info)`。
- 操作提示必须使用 `InputHints`，不得硬编码单平台按键。
- terrain worldOffset 只能应用一次，walkable 优先于 collide。
- 不删除调试日志、`handleTeleport`、`lastSpacePressed`；调试信息迁移时原样保留。
- Demo 角色、火堆、剧情和中文内容留在 example；框架模块不硬编码 Demo 内容。
- 每阶段运行 diagnostics，不自动构建、不运行测试、不修改 desktop、不创建测试页面。
