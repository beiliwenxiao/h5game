# 《三国张角传》场景运行时

本目录承载 canonical `S01`–`S14` 大地图运行时。旧 Act1–6 独立场景已退出，不提供旧场景 ID 或旧存档兼容。

## 当前文件职责

- `DataDrivenPrologueScene.js`：正式 Web/小游戏入口使用的 Demo 组合根；负责把剧情 coordinator、领域系统、UI 和配置接到统一大地图运行时。
- `BaseGameScene.js`：通用可玩场景父类；装配 ECS、输入、UI、存档、帧管线和场景通用能力。
- `Scene1Terrain.js`：名称沿用历史，但当前是正式的多 chunk 地形、碰撞、`worldOffset` 与 Y-sort 适配器，不能按文件名删除。
- `DataDrivenScene.js`：`?ddscene=preview` 使用的单场景编辑器预览器；不是正式玩法入口。预览同样以磁盘 JSON 为事实源，localStorage 仅作 fallback。

## 入口与数据源

正式入口由 `../index.html` 注册 `DataDrivenPrologueScene`。各幕不是独立 Scene 类，而是通过 `game.project.json`、`assets/scenes/SXX.json`、战役/救援配置和 `teleportToChunk()` 推进。

场景磁盘 JSON 是唯一真实源。运行时坐标由局部对象投影得到，`worldOffset` 只能应用一次；普通场景使用同名 SXX chunk，大战场附属 chunk 使用 `SXX-CNN`。

## 配置化边界

- 文案、提示、数值、空间 trigger binding、战役/救援定义和静态内容放配置。
- `SceneTriggerBindingSystem` 只解释空间事件和目标选择器，再调用 TriggerSystem action。
- 原子事务、回滚、幂等和 checkpoint 放通用 system 或 Demo coordinator，不把可执行事务直接塞进 JSON。
- 顶层 `update()` 仅保留有顺序约束的帧编排；可独立更新的领域流程应逐步下沉到 coordinator/system。

## 当前状态

S01–S10 已有不同程度的可玩纵向切片，但浏览器完整通玩、音画验收和边界回归尚未完成；S11–S14 仍待实施。不得因类名或静态 diagnostics 存在而把阶段标为完成。

`DataDrivenScene.js` 与正式装配仍有部分重复。删除它之前必须先让 `?ddscene=preview` 复用正式装配并同步修改入口；`Scene1Terrain.js` 当前仍是正式依赖，不得直接删除。