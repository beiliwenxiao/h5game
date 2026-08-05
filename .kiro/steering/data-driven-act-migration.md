---
inclusion: fileMatch
fileMatchPattern: '{**/DataDrivenPrologueScene*,**/BaseGameScene*,**/TriggerActions*,**/game.project.json}'
---

# 数据驱动幕迁移（Act 迁移）

## 现状

所有幕已统一迁入 `DataDrivenPrologueScene` 大地图运行时。旧 `PrologueScene`、`Act1SceneRefactored`、`Act2Scene`～`Act6Scene` 及其入口注册均已删除；场景推进只使用 `_scene_order.json` 中的 chunk ID 和 `teleportToChunk()`。

## 已有触发器驱动的 Act3 流程

| 触发器 | 事件 | 动作 |
|---|---|---|
| `trg_enter_act3` | `sceneEnter{s2-1}` | setVar act=3 / act3Scene=true → spawnGroup{act3_npcs} → 开场对话 |
| `trg_act3_give_coin_sword` | `dialogueEnd{coin_artifact_intro}` | giveReward 铜钱剑 + showTip |
| `trg_act3_use_coin_sword` | `itemUsed{coin_sword}` | completeScene |
| `trg_act3_complete_switch` | `sceneComplete{s2-1}` | promptSwitch → s3-1 |

## 放置点覆盖机制

同一个 NPC 库定义在不同场景可以有不同交互：
```json
{
  "type": "ref", "kind": "npc", "ref": "zhangjiao",
  "group": "act3_npcs",
  "overrides": { "dialogueId": "coin_artifact_intro" }
}
```

`DataDrivenPrologueScene._spawnGroup` 委托框架 `PlacementSpawner.spawnGroup()`，由它执行定义合并和实体创建；场景通过 `onSpawn` 回调维护 `_npcEntities` / `_groupEnemies`，保留 Demo 诊断和剧情副作用。

编辑器支持：SceneEditorUI 的 ref 属性面板对 npc 类显示"本处覆盖"分组（对话ID/商店ID/交互半径/交互方式），`data-prop` 处理器走 `overrides.*` 嵌套分支。

## 关键事件源（已在 BaseGameScene 中接好）

| 事件 | 触发位置 | 用途 |
|---|---|---|
| `itemUsed{id}` | `BaseGameScene.onItemUsed` | 铜钱剑使用 → 切幕 |
| `equipItem{slot,item}` | `DataDrivenPrologueScene.onEquipmentChanged` | 装备武器 → 刷野狗 |
| `dialogueEnd{id}` | `SceneGameLoaderBridge` 对 `dialogueSystem.onEnd` 的唯一订阅 | 对话结束 → 给物品 |
| `sceneComplete{sceneId}` | 数据驱动触发器 `fire('sceneComplete')` | 区块流程推进 |

## 运行时约束

- 默认入口和微信小游戏入口只注册 `DataDrivenPrologueScene`。
- 不再注册 `Act1Scene` 别名，也不允许回退到 `ActNScene` 类名。
- `BaseGameScene` 直接继承框架 `Scene`，不再加载 `ActXData.json` 或提供按幕切场景逻辑。
- `spawnGroup` 动作需要场景中有对应 group 的 ref 放置点。
- 场景归属、触发器和传送目标统一使用 chunk ID（如 `s0-1`、`s2-1`）。
