---
inclusion: auto
---

# UI 编辑器组件管理指南

## 概述

UI 编辑器（`editor/UIEditor.js`）用于可视化编辑移动端/PC端的 UI 按钮和面板布局。
编辑后保存为 JSON 配置：
- `example/sanguo_zhangjiao/config/UILayout.mobile.json`
- `example/sanguo_zhangjiao/config/UILayout.desktop.json`

游戏运行时通过 `UILayoutLoader` 和 `applyUILayoutToDom()` 读取配置并应用布局。

## 架构关系

### 三处需要同步修改

当新增/删除/修改 UI 组件时，必须同步修改以下三处：

1. **`editor/UIEditor.js`** — `DEFAULT_COMPONENTS.mobile.components[]`（编辑器默认值）
2. **`config/UILayout.mobile.json`** — 已保存的布局配置
3. **`index.html`** — 两处：
   - HTML DOM 元素（按钮实际结构）
   - `applyUILayoutToDom()` 中的 `domIds` 映射表

### Canvas 面板类组件（非 DOM）

如 `PlayerStatusHUD` 这类纯 Canvas 渲染的面板，不在 `domIds` 映射中，
而是通过 `BaseGameScene._applyUILayout()` 使用 `UILayoutLoader.applyToCanvasPanel()` 应用布局。

## 组件类型

| kind | 说明 | 示例 |
|------|------|------|
| `zone` | 区域（虚线框） | 摇杆区 |
| `panel` | 面板 | HUD血条、背包面板 |
| `button` | 圆形按钮 | 攻击、技能、药瓶 |
| `bar` | 条形栏（已废弃） | ~~底部快捷栏~~ |

## 设计原则

### 组件应尽量原子化

- **不要**把多个独立功能合并成一个组件（如"底部快捷栏"包含6个按钮）
- **应该**让每个按钮/元素都是独立的可编辑组件
- 这样在 UI 编辑器中可以自由调整每个元素的位置和大小

### 按钮不应共用/切换

- **不要**让一个按钮在不同状态下切换功能（如攻击/交互共用）
- **应该**每个功能有独立的按钮，始终可见、始终可点

### PlayerStatusHUD 子组件独立布局

HUD 已拆分为4个独立子组件：
- `hud-avatar` — 头像
- `hud-name` — 昵称
- `hud-hp` — 血条
- `hud-mp` — 蓝条

`PlayerStatusHUD` 通过 `applySubLayout({ avatarRect, nameRect, hpRect, mpRect })` 接收独立位置。
当有子布局时，不画整体背景面板，各子元素自由定位。

## 当前 Android UI 组件列表（mobile）

| id | label | kind | 说明 |
|----|-------|------|------|
| joystick | 摇杆区 | zone | 虚拟摇杆区域 |
| hud-avatar | HUD头像 | button | 玩家头像 |
| hud-name | HUD昵称 | panel | 玩家昵称 |
| hud-hp | HUD血条 | panel | 生命值条 |
| hud-mp | HUD蓝条 | panel | 魔法值条 |
| act-attack | 攻击 | button | 普攻（瞄准模式） |
| act-block | 格挡 | button | 主动格挡（1秒，CD8秒） |
| act-skill3 | 技能3 | button | 火焰掌 |
| act-skill4 | 技能4 | button | 寒冰指 |
| act-skill5 | 技能5 | button | 烈焰掌 |
| act-flight | 轻功 | button | 轻功闪避 |
| act-interact | 交互 | button | NPC交互/拾取 |
| act-throw | 投掷 | button | 投掷武器 |
| act-axe | 采集 | button | 斧头/采集 |
| hb-hp | 红瓶 | button | 生命药水 |
| hb-mp | 蓝瓶 | button | 魔法药水 |
| hb-char | 装备 | button | 打开装备面板 |
| hb-bag | 背包 | button | 打开背包面板 |
| hb-skill6 | 回血 | button | 回血技能 |
| hb-skill7 | 打坐 | button | 打坐恢复 |

## 新增按钮的完整流程

1. 在 `index.html` 的 `#action-buttons` 或合适位置添加 HTML DOM
2. 在 `index.html` CSS 中添加默认定位样式
3. 在 `index.html` 的 `triggerAction()` 和/或 `doPress()` 中添加事件处理
4. 在 `index.html` 的 `applyUILayoutToDom()` 的 `domIds` 映射中注册
5. 在 `editor/UIEditor.js` 的 `DEFAULT_COMPONENTS.mobile.components[]` 中添加条目
6. 在 `config/UILayout.mobile.json` 的 `components[]` 中添加配置（含百分比值）

## 已废弃的模式

- ~~`bottom-hotbar` 整体栏~~ → 拆分为 hb-hp/hb-mp/hb-char/hb-bag/hb-skill6/hb-skill7
- ~~`playerStatusHUD` 整体面板~~ → 拆分为 hud-avatar/hud-name/hud-hp/hud-mp
- ~~`updateAttackButtonMode()` 攻击/交互切换~~ → 攻击和交互独立按钮
