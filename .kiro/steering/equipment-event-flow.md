---
inclusion: fileMatch
fileMatchPattern: '{**/BaseGameScene*,**/InventoryPanel*,**/EquipmentSystem*,**/DataDrivenPrologueScene*}'
---

# 装备变更事件流

## 统一出口

所有装备/卸下操作最终必须走 `BaseGameScene.onEquipmentChanged(messages, info)` 出口，否则数据驱动事件源 `equipItem`/`unequipItem` 不会发出。

## 两条装备路径

| 路径 | 调用链 | 注意 |
|---|---|---|
| 背包面板点装备 | `InventoryPanel.equipItem → showEquipmentNotification(…, info) → onEquipmentChange(messages, info)` | `info` 包含 `{ slot, item, oldItem, action:'equip' }` |
| 拾取弹窗点"装备" | `BaseGameScene._onGainedPopupPrimary → equipmentSystem.equipItem → onEquipmentChanged(messages, info)` | 必须手动调 |

## 卸下路径

`BaseGameScene._handleEquipmentSlotClick`（右键/移动端点击装备槽）：
1. `equipmentSystem.unequipItem(entity, slotType)` — 注意方法名是 `unequipItem` 不是 `unequip`
2. `inv.addItem(removed, quantity)` — 放回背包，返回 0 时撤销卸下
3. `onEquipmentChanged([...], { slot, item:null, oldItem, action:'unequip' })`

## DataDrivenPrologueScene.onEquipmentChanged

- 装备时 fire `'equipItem'`，卸下时 fire `'unequipItem'`（分开事件，避免卸下武器误触发刷怪）
- 真实槽位 `mainhand` 归一化为内容侧逻辑名 `weapon`（触发器配置用 `weapon`）
- 优先用 `info.slot`/`info.item`，没有则兜底推断

## EquipmentSystem API

```js
equipmentSystem.equipItem(entity, slotType, equipment)  → 被替换的旧装备 | null
equipmentSystem.unequipItem(entity, slotType)           → 被卸下的装备 | null
```

**不要**用 `equipmentSystem.unequip`（不存在，会报 TypeError）。

## 槽位名映射

| 内容侧/编辑器 | EquipmentComponent 真实槽位 |
|---|---|
| weapon / mainhand | `mainhand` |
| shield / offhand / ammo | `offhand` |
| armor | `armor` |
| helmet | `helmet` |
| necklace | `necklace` |
| accessory | `accessory` |

`InventoryPanel` 的 `slotMap = { weapon:'mainhand', shield:'offhand', ammo:'offhand' }` 做转换。
