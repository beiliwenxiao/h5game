---
inclusion: manual
---

# 开发路线图（线性计划）

本文件整合 specs/yijian18-game-demo 的 25 条需求与所有 steering 中的已完成/待完成任务，形成一份线性开发计划。手动引用时加载。

## 已完成（不再追踪）

| 阶段 | 内容 | 位置 |
|---|---|---|
| S1-S10 | 成长系统全套（EffectResolver→ContentValidator） | src/systems/effects,ability,progression + src/core/input,snapshot,validation,scene |
| 手柄 | Xbox 360 支持 + 编辑器绑定配置 | src/core/input/GamepadManager + editor UIEditor 手柄标签 |
| 特效区域 | effectZone 编辑器+运行时粒子 | src/rendering/EffectZoneRenderer + editor |
| 地形 walkable | 可落脚区域优先放行 | Scene1Terrain.isBlocked |
| 多边形顶点编辑 | 右键增删顶点+菜单自动定位 | editor/SceneEditorInteraction |
| NPC 忙碌台词 | 对话完成后不再重播 | DialogueSystem.completedDialogues + NpcComponent |
| 装备事件统一 | onEquipmentChanged 统一出口 | BaseGameScene + DataDrivenPrologueScene |
| 卸装修复 | unequipItem + 背包回收 | BaseGameScene._handleEquipmentSlotClick |
| 刷怪修复 | 拾取弹窗装备路径发 equipItem | BaseGameScene._onGainedPopupPrimary |
| 放置点覆盖 | ref overrides 递归合并 | DataDrivenPrologueScene._mergeOverrides + editor |
| Act3 数据驱动 | s2-1 放置点+触发器全链路 | game.project.json + assets/scenes/s2-1.json |
| 宿主检测 | PlatformProfile.detectHost + BackendConfig 宿主默认 | src/core/PlatformProfile + BackendConfig |
| three.js PC only | weapp/capacitor 强制 2D | pickBackend.supportsThreeBackend |
| 打包配置入库 | android/desktop/mobile .gitignore 精确排除 | .gitignore |
| weapp 适配层 | adapter 全套 shim + build.js | weapp/ |

## 当前里程碑：Demo 迁移验证（S11）

目标：全部走数据驱动（DataDrivenPrologueScene），旧 ActXScene 仅作回退保留。

### 已完成

- **默认入口已切到 DDScene** — 不再需要 `?ddscene=1`，直接走大地图 teleportToChunk
- **Act3 数据驱动** — s2-1 放置点 + 触发器全链路
- **Act2 数据驱动** — s1-1 觉醒→符水→装备升级→装备检测→切幕触发器链
- **Act4 数据驱动** — s3-1 三教官 NPC + 确认窗口 + classSelected → 切幕
- **Act5 数据驱动** — s3-2 四场战斗波次 + await 对话 + heal 回血 + waveCleared 链 + 完成切幕
- **Act6 数据驱动** — s3-3 入场对话 → 结局对话 → 完成提示（简化版，统计面板待后续完善）

### 待完成任务

1. **Act6 统计/奖励/继承面板** — 当前用 showTip 简化，后续可加 Canvas 面板渲染
2. **DOM 触屏按钮迁移到 Canvas** — 微信小游戏前置（无 DOM）
3. **全链路验收** — 六幕连续通关、存档恢复

## 下一里程碑：微信小游戏上线

前置：S11 完成 + DOM UI 迁移

1. **weapp bundle 构建验证** — `node weapp/build.js` 通过，开发者工具能跑
2. **触屏输入验证** — 虚拟摇杆/攻击/技能全 Canvas 化
3. **资源上 CDN** — 图片/音频远程加载，主包 < 4MB
4. **场景 JSON 远程热更新** — 新增幕不发版
5. **提审上线** — 填 AppID、版号（或豁免）

## 后续里程碑：14 场景 Demo（P0-P6）

来源：specs/yijian18-game-demo/requirements.md Req25

| 阶段 | 内容 | 工期 |
|---|---|---|
| P0 | Canonical Schema + Battle Contract + Mock Service | 3 天 |
| P1 | S01-S02 教学：移动/战斗/拾取/采集/工具/死亡掉落 | 2 周 |
| P2 | S09 加入黄巾/职业/饥民争斗/City State | 1.5 周 |
| P3 | S03-S08 观战与介入/波才张曼成救援/南阳西华分支 | 4 周 |
| P4 | S10-S12 张角病逝/张梁张宝救援/城市战争/载具运输 | 3 周 |
| P5 | S13(可选)+S14 六种结局判定与演出 | 1.5 周 |
| P6 | 全图九宫格集成/性能验收/缺陷修复 | 2 周 |

### P0-P6 需要新增的系统（按需求文档）

- **Story System** — 月份/路线/标志（复用 TriggerSystem+Blackboard，加 StoryState 序列化）
- **Battle System** — 观战/介入/胜负/Battle Result 幂等应用
- **Rescue System** — 限时计时器+多阶段目标+结果冻结
- **Gathering System** — 采集进度/中断/风险事件/守卫警戒
- **Construction System** — 扎营/选址/施工/维修/抢修（复用 BuildingComponent）
- **City War System** — 城市库存/损毁/士气/资源点刷新
- **Ending System** — 六结局优先级判定
- **Integration Layer** — JSON-RPC 2.0 Battle Contract + Mock Service

## 已确认决策（保持不变）

1. 位移能力 A：跳跃/用力跳跃/轻功/攀爬
2. 生活技能 A：熟练度+配方+天赋盘被动
3. 职业与兵种 A：职业天赋+兵种天赋两层
4. 兵种天赋 C：树解锁，POE 盘数值
5. 兵种点 A：参战与战役行为获得
6. 箭楼统一：建筑类工事同时可载人（Manned_Structure）
7. Demo 启用四类成长（含天赋盘）
8. 烹饪延后到 Demo 之后
9. 天赋盘 45 节点，Profile arpg
10. 允许直接修改现有系统

## 文件整合结果

### 删除的 steering（内容已合并进本文件或其他文件）

无需删除：所有现有 steering 各司其职（技术参考用 fileMatch 按需加载），本文件作为唯一的线性计划总纲。

### Specs 保留

`specs/yijian18-game-demo/requirements.md` 和 `design.md` 保留为需求和设计的权威文档，不再重复写进 steering。本路线图只引用其阶段编号（P0-P6）和需求编号（Req1-25）。

### Steering 分工

| 文件 | 用途 | inclusion |
|---|---|---|
| `development-roadmap.md` | **本文件**：线性计划、进度追踪 | manual |
| `project-info.md` | 项目基本信息、技术栈、目录结构 | always |
| `custom.md` | 用户硬性约束（中文/不自动构建/不写文档等） | always |
| `fswrite.md` | 文件写入最佳实践 | always |
| `scene-terrain-pitfalls.md` | worldOffset 双重偏移陷阱 | always |
| `scene-data-consistency.md` | localStorage/文件一致性 | always |
| `progression-system.md` | 成长系统设计约定 | fileMatch |
| `progression-implementation.md` | S1-S10 实施现状与约定 | fileMatch |
| `progression-decisions.md` | 已确认决策列表 | manual |
| `optimization-plan-b-plus.md` | 引擎优化总方案（含进度） | manual |
| `gamepad-support.md` | 手柄技术参考 | fileMatch |
| `weapp-minigame.md` | 微信小游戏适配 | fileMatch |
| `effect-zones.md` | 特效区域粒子 | fileMatch |
| `npc-dialogue-idle.md` | NPC 对话完成行为 | fileMatch |
| `terrain-walkable.md` | 可落脚区域判定 | fileMatch |
| `editor-polygon-vertex.md` | 多边形顶点编辑 | fileMatch |
| `equipment-event-flow.md` | 装备事件统一出口 | fileMatch |
| `data-driven-act-migration.md` | 幕迁移状态与触发器 | fileMatch |
| `map-editor.md` | 地图编辑器架构 | fileMatch |
| `ui-editor.md` | UI 编辑器指南 | fileMatch |
| `atlas-system.md` | 图集切片系统 | fileMatch |
| `camera-coordinate-system.md` | 相机坐标系 | fileMatch |
| `pickup-interaction.md` | 拾取交互 | fileMatch |
| `editor-architecture.md` | 编辑器总架构 | fileMatch |
| `android-build.md` | Android 打包 | fileMatch |
| `build-desktop-exe.md` | Electron 打包 | fileMatch |
