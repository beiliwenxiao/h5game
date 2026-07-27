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

**GameSceneRuntime**：帧内顺序固定为「输入分发 → 系统更新 → 场景 hook → `InputManager.update()` 清帧」。清帧必须最后，否则本帧按键状态被提前清空。`registerInputHandler`、`registerSnapshotProvider`、`onUpdate` 返回的注销函数自动进入 disposer，`dispose()` 逆序执行。

`BaseGameScene` 本体未改动。它有 5000 行且输入与拾取、攻击、瞄准、UI 深度耦合，迁移应分两步：先替换系统注册与 `exit()` 清理，再单独处理输入路由。

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
