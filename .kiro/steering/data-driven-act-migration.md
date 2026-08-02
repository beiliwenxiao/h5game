---
inclusion: fileMatch
fileMatchPattern: '{**/Act*Scene*,**/DataDrivenPrologueScene*,**/TriggerActions*,**/game.project.json}'
---

# 数据驱动幕迁移（Act 迁移）

## 现状

Act1 已完成数据驱动迁移（DataDrivenPrologueScene），Act2-6 仍是硬编码场景类。Act3 的数据驱动版本实际已在 `game.project.json` 触发器中定义完毕（区块 s2-1），仅缺放置点。

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

`DataDrivenPrologueScene._spawnGroup` 用 `_mergeOverrides(baseDef, pl.overrides)` 递归合并（一层深度），只覆盖指定字段不抹掉库里其他配置。

编辑器支持：SceneEditorUI 的 ref 属性面板对 npc 类显示"本处覆盖"分组（对话ID/商店ID/交互半径/交互方式），`data-prop` 处理器走 `overrides.*` 嵌套分支。

## 关键事件源（已在 BaseGameScene 中接好）

| 事件 | 触发位置 | 用途 |
|---|---|---|
| `itemUsed{id}` | `BaseGameScene.onItemUsed` | 铜钱剑使用 → 切幕 |
| `equipItem{slot,item}` | `DataDrivenPrologueScene.onEquipmentChanged` | 装备武器 → 刷野狗 |
| `dialogueEnd{id}` | `BaseGameScene.initGameLoader` 中订阅 `dialogueSystem.onEnd` | 对话结束 → 给物品 |
| `sceneComplete{sceneId}` | 各 Act 的 `fire('sceneComplete')` | 切幕 |

## 剩余迁移工作量估计（上次评估）

| 幕 | 难度 | 主要障碍 |
|---|---|---|
| Act3 | 低（已几乎完成） | 仅缺放置点，现已补齐 |
| Act2/Act5 | 中 | 手绘 NPC/建筑渲染（已有 NpcRenderStyles）|
| Act4 | 中高 | 职业选择流程 |
| Act6 | 高 | 四个统计面板 + 结局判定 |

## 注意事项

- `Act3Scene.js` 保留不删，与数据驱动版并存对照
- 场景 `?ddscene=1` 进数据驱动版，默认仍进旧版
- `spawnGroup` 动作需要场景中有对应 group 的 ref 放置点
- 触发器的 `if` 条件用黑板变量（如 `act3Scene`）限定作用域
