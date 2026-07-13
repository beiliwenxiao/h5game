---
inclusion: manual
---

# 数据驱动编辑器架构蓝图（A2 + B2 + C2）

> 长期架构蓝图。方向已选定：A2 重构式 + B2 数据化 DSL + C2 无缝地形分块，从 P0 起步，收益最大化。
> 手动引用（#editor-architecture）加载。实现某阶段前先据此出字段级 schema + 类骨架。

## 0. 总体架构

```
编辑器 (editor/)：世界地图Tab / 场景Tab / 对话图Tab / 事件Tab / 内容库Tab
        ↓ 全部读写同一份 GameProject.json（单一数据源）
GameLoader（装配器，取代 PrologueManager）
   ├─ dialogues → DialogueSystem
   ├─ quests    → QuestSystem
   ├─ triggers  → TriggerSystem（新核心）
   ├─ npcs/spawns/shops → 各系统
   ├─ worldMap  → WorldStreamingManager（新）
   └─ variables → Blackboard（剧情变量黑板，新）
```

新增运行时组件：
- `Blackboard`：全局变量黑板（DSL 读写的状态容器）
- `ExpressionEngine`：B2 表达式/条件求值
- `TriggerSystem`：触发器（条件→动作），覆盖 引导/事件/幕切换
- `WorldStreamingManager`：C2 九宫格流式加载
- `GameLoader`：读 GameProject 自动装配所有系统

## 1. GameProject 数据模型（单一数据源）

```jsonc
{
  "meta": { "id","name","version","schema":2 },
  "variables": { "act":0, "hasSword":false, "killCount":0 },   // → Blackboard 初值
  "worldMap": { "regions": [{
    "id":"prologue_world", "chunkWidth":1280,"chunkHeight":720,
    "cols":4,"rows":3,
    "grid":[["scene_a","scene_b",null,null], ...],             // grid[row][col]=sceneId|null
    "terrain": { "$ref":"worldTerrain_prologue" }
  }]},
  "worldTerrains": { "worldTerrain_prologue": {
    "shapes":[ /* Shape[]，世界坐标，跨 chunk 连续 */ ],
    "backgroundColor":"#1a2a1a"
  }},
  "scenes": [{
    "id":"scene_a",
    "grid":{ "col":0,"row":0 },        // 属于哪个 worldMap 格子
    "size":{ "width":1280,"height":720 },
    "layers":[ /* 视觉：shape/deco/slice/image，局部坐标 */ ],
    "objects":{                        // 逻辑对象（新）
      "regions":[], "npcs":[], "spawns":[], "portals":[]
    },
    "audio":{ "bgm":"battle","onEnter":[] }
  }],
  "dialogues":[], "quests":[], "triggers":[], "tutorials":[],
  "library":{                          // 定义（非实例）
    "npcs":[],"enemies":[],"items":[],"equipment":[],
    "shops":[],"classes":[],"skills":[]
  }
}
```

原则：**库(definition) 与 实例(placement) 分离**。库存 `library`，实例存 `scenes[].objects` 引用库 id。
大工程分文件（scenes/*.json、dialogues/*.json）用 `$ref`，加载器/编辑器解析。

## 2. GameLoader 装配

```js
load(projectPath, engine){
  proj = loadWithRefs(projectPath);
  blackboard.init(proj.variables);
  proj.dialogues.forEach(d => dialogueSystem.registerDialogue(d.id,d));
  proj.quests.forEach(q => questSystem.registerQuest(new Quest(q)));
  proj.library.enemies.forEach(e => enemyRegistry.register(e));
  proj.triggers.forEach(t => triggerSystem.register(t));
  proj.tutorials.forEach(t => triggerSystem.register(toTrigger(t)));
  worldStreaming.init(proj.worldMap.regions[0], proj);
  // 场景/实体在 chunk 加载时按需实例化，不在此全建
}
```
取代 PrologueManager：六幕流程 → GameProject 里若干 `switchScene/loadRegion` 触发器 + 场景数据；
`ActXScene.js` 合并为一个 `DataDrivenScene`（读 chunk 数据渲染）。

## 3. P0 — 统一 Shape 背景层（起点）

合并现有 `fill` + `ellipse` 为统一 `shape` 类型。

```jsonc
{
  "type":"shape", "id":"...",
  "shapeType":"rect|ellipse|polygon|path|circle",
  "x":0,"y":0,"width":400,"height":260,   // rect/ellipse 包围盒
  "points":[[x,y],...],                    // polygon/path（局部坐标）
  "radius":130,                            // circle
  "fillMode":"color|image|slice|gradient|pattern",
  "fill":"#3a5a2a",
  "imageSrc":"assets/...","imageMode":"cover|stretch|contain|tile",
  "atlasId":"...","sliceKey":"...","sliceMode":"tile|stretch",
  "gradient":{ "type":"linear|radial","angle":0,"stops":[] },
  "opacity":1, "edgeFade":0.28,
  "stroke":"","strokeWidth":0,
  "collide":false,                         // 作为不可通行区（多边形碰撞）
  "sort":"ground|ysort"
}
```

- **渲染共用**：抽 `src/rendering/ShapeRenderer.js`，`ShapeRenderer.render(ctx, shape, resolver)`，
  resolver 注入 `getImage/getAtlas`。编辑器 SceneEditorCanvas 与游戏 DataDrivenScene 都调它，渲染逻辑只一份。
  现椭圆的 `_drawImageInBox/_drawSliceTiled/edgeFade` 迁入。
- **编辑器**：资源库拖入 矩形/椭圆/圆/多边形/路径；多边形点击落点、双击闭合、顶点可拖；统一属性面板。
- **兼容**：加载旧 fill/ellipse 自动转 shape。
- **碰撞**：collide 的 shape 生成碰撞多边形，游戏侧 isBlocked 用点在多边形内判定，取代写死盆地椭圆碰撞。

## 4. B2 — 数据化 DSL + TriggerSystem（核心）

### 4.1 ExpressionEngine（条件/取值，JSON 结构，编辑器好出表单）
```jsonc
{ "op":"and","args":[
  { "op":">=","left":{"var":"killCount"},"right":10 },
  { "op":"==","left":{"var":"act"},"right":1 },
  { "op":"questState","quest":"q_save_people","state":"completed" }
]}
```
- 上下文：`{ blackboard, player, questSystem, sceneManager, world }`
- op：比较/逻辑/`var`/`flag`/`questState`/`hasItem`/`distanceTo`/`inRegion`
- 可选支持字符串表达式编译成同结构（编辑器"简单/高级"两种输入）

### 4.2 触发器数据
```jsonc
{
  "id":"trg_intro",
  "when":{ "type":"sceneEnter|enterRegion|dialogueEnd|kill|itemPickup|flagChange|timer|interact|questComplete",
           "params":{ "region":"r1","sceneId":"scene_a","enemyType":"bandit","count":5 } },
  "if":{ /* ExpressionEngine 条件，可空 */ },
  "do":[
    { "action":"startDialogue","params":{"id":"dlg_intro"},"await":true },
    { "action":"giveReward","params":{"exp":100,"items":[]} },
    { "action":"setVar","params":{"key":"act","value":1} },
    { "action":"loadRegion","params":{"region":"world_act1","at":"spawn_a"} }
  ],
  "once":true, "cooldown":0
}
```

### 4.3 动作注册表（可扩展）
```js
TriggerSystem.registerAction('startDialogue', (p,ctx)=>ctx.dialogue.startDialogue(p.id));
// switchScene/loadRegion/spawnEnemy/giveReward/setVar/addVar/setFlag/
// startQuest/completeQuest/showTip/playSound/playBgm/cameraFocus/wait/parallel ...
```
`await:true` 的动作返回 Promise，序列等待（如对话结束再继续）→ 过场编排可数据化。

### 4.4 事件源接入
监听各系统 emit：`combatSystem.on('kill')`→when:kill；`dialogueSystem.onEnd()`→dialogueEnd；
拾取→itemPickup；每帧检查 enterRegion/timer；loadRegion/sceneEnter。

### 4.5 编辑器（事件 Tab）
触发器列表 + 表单：when 下拉→动态 params；if 条件树可视化(and/or/比较)；do 动作列表(拖拽排序)。
区域触发在画布框选生成 region 对象。**多幕切换** = when:enterRegion/sceneEnter → do:loadRegion。

## 5. 对话 / 引导 / 任务

### 5.1 对话图（沿用 DialogueSystem 节点 + DSL 条件/动作）
```jsonc
{ "id":"dlg_intro","start":"n1","nodes":{
  "n1":{ "speaker":"张角","portrait":"zhangjiao","text":"...",
         "choices":[ {"text":"接受","goto":"n2","do":[{"action":"setFlag"}]},
                     {"text":"拒绝","goto":"n3","if":{}} ] },
  "n2":{ "text":"...","next":"end" }
}}
```
编辑器对话图 Tab：节点卡片 + choice 连线。

### 5.2 引导 = 触发器语法糖：when:teachStep → do:showTip。现有 TutorialConfig/ProgressiveTipsConfig 迁移为 tutorials[]。

### 5.3 任务：QuestSystem 已完整。编辑器表单：目标/奖励/前置(DSL)/绑定 NPC。进度事件喂 TriggerSystem(when:questComplete)。

## 6. C2 — 无缝地形分块 + 九宫格流式

### 6.1 坐标系（铁律：世界坐标唯一）
```
世界坐标 (worldX,worldY) —— 所有实体/相机/碰撞用它
chunk(col,row) 原点 = (col*chunkWidth, row*chunkHeight)
chunk 局部坐标 = worldXY - chunkOrigin
```
- 地形(worldTerrain)：全局坐标定义 shape，不按 chunk 切 → 天然无缝
- 场景对象(装饰/NPC/刷怪/触发区)：存局部坐标，归属 chunk，加载时 +chunkOrigin 转世界坐标

### 6.2 WorldStreamingManager
```js
update(playerWorldPos){
  const {col,row}=worldToChunk(playerWorldPos);
  need = ring(col,row,1);                 // 3×3=9
  for(key of need) if(!loaded.has(key)) loadChunk(key);
  for([key,c] of loaded) if(manhattan(key,col,row)>2) unloadChunk(key); // 离开>2格卸载
}
loadChunk(key){
  scene=project.scenes[byGrid(key)]; origin=originOf(key);
  chunk=new LoadedChunk(scene,origin);
  chunk.instantiate(entityFactory, worldEntities); // 装饰/NPC/刷怪→世界坐标建实体
  chunk.restoreState(savedStates.get(key));        // 恢复卸载前状态
  loaded.set(key,chunk); triggerSystem.emit('chunkEnter',{key});
}
unloadChunk(key){
  savedStates.set(key, chunk.serialize());         // 存拾取/死怪/开关
  chunk.destroy(); loaded.delete(key);
}
```

### 6.3 渲染
- 地形：`WorldTerrainRenderer` 按相机视口裁剪，只画可见 shape（空间网格索引加速），全局连续→无缝
- chunk 装饰/实体：各 LoadedChunk 提供 renderQueue，统一 Y-sort 后画
- 缓存：per-chunk 静态装饰离屏缓存（现 `_combinedGroundCache` 思路改 per-chunk）

### 6.4 状态持久化
LoadedChunk.serialize() 存动态状态（拾取/死怪/开关/NPC 位置）；卸载存 savedStates（内存+可选存档）；
重进 restoreState，避免"回头怪复活"。

### 6.5 与 SceneManager 关系
- SceneManager：管大区/幕之间切换（黑屏过渡），loadRegion 动作触发；登录/角色选择 UI 场景也用它
- WorldStreamingManager：管一个大区内 chunk 无缝流式

### 6.6 编辑器（世界地图 Tab）
网格视图(cols×rows)分配 scene；缩放看全局拼接预览；编辑全局地形层(世界坐标画 shape 跨格)；
设 chunkW/H、出生点、相邻传送。

## 7. 内容库整合（让未用系统活起来）

编辑器"内容库 Tab"，每系统一列表，数据进 library，实例进场景：

| 库 | 编辑 | 放置/绑定 |
|----|------|-----------|
| NPC | 外观/名字/默认对话/商店/任务 | 拖入 objects.npcs，引用库 id |
| 敌人 | 属性/技能/掉落表 | 场景放 spawns（点/波次/触发条件） |
| 物品/装备 | 数值/图标/效果 | 掉落表、商店、初始背包 |
| 商店 | 商品/价格 | 绑定 NPC |
| 职业/技能树/天赋 | 节点/数值表 | 全局生效 |
| 世界事件 | EventTemplate（已有机制加 UI） | 绑定大区/刷新条件 |
| 音频 | BGM/SFX 映射 | 场景 onEnter 触发器 |

运行时：GameLoader 把 library 注册到各系统 registry；chunk 加载按 objects 实例化并绑定
（NPC↔对话/商店/任务，spawn↔敌人）。

## 8. 编辑器架构（重构）

```
editor/
├── EditorShell.js           // Tab 切换 + 共享 GameProject 状态
├── project/GameProjectStore.js  // 加载/保存/$ref/校验/撤销栈（全局单一数据源）
├── scene/  (现有 SceneEditor* 模块，改读 GameProject.scenes)
├── world/  WorldMapEditor.js     // 世界地图网格 + 全局地形
├── dialogue/ DialogueGraphEditor.js
├── trigger/ TriggerEditor.js      // 事件/引导
├── library/ LibraryEditor.js      // NPC/敌人/物品/商店/任务/职业...
└── shared/
    ├── ShapeRenderer.js  (§3.2，与游戏共用)
    ├── ExpressionEditor.js (条件树可视化)
    └── ConditionActionForms.js (when/do 动态表单)
```
所有 Tab 共享 GameProjectStore；保存走 Vite /api/save-file，支持分文件写。

## 9. 运行时接入点（替换现状）

| 现状 | 重构后 |
|------|--------|
| PrologueManager 手写六幕 | 删除；GameLoader + 触发器数据 |
| Act1~6Scene.js | 合并为 DataDrivenScene（读 chunk 渲染） |
| TutorialConfig/conditions/*.js | → tutorials[] + DSL |
| DialogueData.json | → dialogues[]（补条件/动作） |
| Scene1Terrain 写死地形 | → WorldTerrainRenderer + shape 数据 |
| 场景 new NPC/敌人 | → chunk 按 objects 实例化 |
| EntityFactory | 保留，GameLoader/chunk 调它建实体 |

## 10. 实施路线图（master，P0 起，每阶段可独立验证）

> 横切关注点：§13 网络编码约定贯穿所有阶段（写任何逻辑都遵守 6 约定）；
> §14 战场模式组件在 P1/P2 落位（下表已标注）；决战/攻城/逃亡均为 BattleMode 数据变体。

| 阶段 | 交付物 | 关键任务 | 依赖 |
|------|--------|----------|------|
| **P0** | 统一 Shape 背景层 | ShapeRenderer(编辑器/游戏共用)、shape 类型(rect/ellipse/circle/polygon/path)、多边形绘制工具、collide 多边形碰撞、旧 fill/ellipse 自动迁移 | — |
| **P1** | 触发器内核 + 事件编辑器 | Blackboard、ExpressionEngine、TriggerSystem(条件→动作)、事件 Tab；注册战场动作(battleWin/battleLose/spawnWave/mount)；**按 §13 约定：动作=纯函数+events，条件=数据** | P0 |
| **P2** | 逻辑对象 + 内容库 + 战场组件 | region/npc/spawn/portal 逻辑对象、内容库 Tab、各系统 registry；**§14 组件**：BuildingComponent/ObjectiveComponent/VehicleComponent/SeatComponent + `controller` 抽象 + VehicleSystem(驾乘) | P1 |
| **P3** | 对话 + 引导 | 对话图编辑器(节点+连线+条件/动作)、引导迁移为 tutorials[] 触发器 | P1 |
| **P4** | 数据化装配 | GameProject 数据模型、GameLoader(装配)、DataDrivenScene；序章数据化、拆 PrologueManager；**Resolver 化**(CombatResolver/LootResolver 纯函数，§13 约定5) | P1-P3 |
| **P5** | 大地图流式 | WorldStreamingManager(九宫格 3×3 加载 / 离开>2 格卸载)、无缝全局地形(WorldTerrainRenderer)、chunk 状态持久化、世界地图 Tab；**先统一世界坐标**(§11 铁律) | P4 |
| **P6** | 存档 + 性能 + 示例战场 | 存档(chunk 状态+黑板+任务)、per-chunk 离屏缓存 + 地形空间索引 + ObjectPool；用 BattleConfig 做一个完整攻城战示例关卡验证 | P5 |

每阶段的细粒度可勾选任务见 §16。

## 11. 关键风险与应对

- 坐标系混乱(C2)：铁律"世界坐标唯一"，chunk 只做加载单元 + 局部↔世界转换；P5 前先统一相机/碰撞坐标。
- DSL 过度设计(B2)：动作/条件用注册表，先做 80% 常用；保留"自定义脚本动作"逃生口（引用 JS 函数名）。
- 序章回归：P4 重建序章时与旧版逐幕对照验收；保留旧 PrologueManager 到 P4 完成再删。
- 性能：per-chunk 离屏缓存 + 地形空间网格索引 + 复用 ObjectPool。

## 12. 决策记录
- A2 重构式（建 GameProject + GameLoader，拆 PrologueManager）
- B2 全数据化 DSL（ExpressionEngine + 注册表动作，保留脚本逃生口）
- C2 无缝地形分块（全局地形 + chunk 流式，世界坐标唯一）
- 起点 P0（ShapeRenderer）

## 13. 网络预留编码规范（横切关注点，贯穿各阶段；现在不实现网络，仅约定固化）

> 现阶段单机开发，不写任何网络代码。但从 P1 开始写 TriggerSystem / 战斗结算 / 移动等逻辑时，
> **必须遵守以下 6 条约定**。它们几乎零成本（还让单机代码更干净），却决定将来接 Golang 后端的难度：
> 遵守则将来是"填空"（写解释器+网络层），不遵守则是"重写整个逻辑层"。

### 13.1 六条编码约定（强制）

1. **逻辑与表现分离**
   - System 分两类职责：**结算**（改状态）与 **演出**（粒子/动画/UI/音效）。
   - 结算写成**纯函数**：`(state, intent) → { newState, events }`，不直接操作渲染/DOM/全局。
   - 演出订阅 events 表现。示例：`CombatResolver.resolve(attacker, target, skill) → {damage, dead, drops, events}`。

2. **输入 Intent 化**
   - 玩家操作先生成 intent 对象（`{ type:'attack', target }` / `{ type:'move', dir }` / `{ type:'useSkill', id }`），本地立即消费。
   - 将来联网 = "把 intent 发服务器"，客户端逻辑几乎不改。现有 `NetworkManager.sendAction/sendMove` 是雏形。

3. **状态可序列化**
   - 实体/黑板(Blackboard)/任务/触发器/chunk 状态都实现 `serialize/deserialize`（现状已大量具备，继续保持）。
   - 禁止把不可序列化的东西（函数、DOM 引用、闭包状态）塞进"逻辑状态"。

4. **数值/公式数据化**
   - 伤害、经验、掉落、CD、命中等公式与数值放**配置/DSL**（见 §4 ExpressionEngine + 公式表），不 hardcode 散落在各 JS。
   - 目标：改数值/加技能 = 改数据，两端（将来）同时生效，零代码。

5. **权威逻辑集中（未来的移植点）**
   - 战斗结算、掉落、任务判定、交易等"必须权威"的逻辑集中到少数 **Resolver 模块**
     （`CombatResolver` / `LootResolver` / `QuestResolver`），不散落。
   - 将来 Golang 只需移植这几个模块，集中 = 好移植、好对齐。

6. **随机与时间可控**
   - 用**可注入的带种子 RNG**（如 `ctx.rng`）+ 逻辑时钟，禁止在结算里直接用 `Math.random()` / `Date.now()`。
   - 服务器权威、战斗回放、断线重连都依赖确定性。

### 13.2 authority 标签（先占位，不实现分支）

System / Resolver 上标注权威归属，现在只写字段/注释，不实现联网分支：
```
authority: 'client'  // 纯表现，本地跑
         | 'server'  // 权威裁决（战斗/掉落/任务/交易/切场景），将来服务器跑
         | 'shared'  // 客户端预测 + 服务器校正（移动）
```
单机时全部按 client 本地执行；联网时 server/shared 逻辑改为"发 intent → 等服务器状态"，同一套结算函数复用。

### 13.3 将来接 Golang 的折中路线（备忘，暂不实现）

- **折中1 数据化解释器**：核心逻辑用 DSL/公式数据表达，Go 端只写"一个解释器"跑同一份 GameProject 数据，业务不重写。
- **折中2 goja 复用 JS**：核心结算写成纯 JS 函数，Go 服务器用 `goja` 执行**同一份 .js** → 前后端逻辑 100% 一致。
  分频：高频(移动)Go 原生校验；低频复杂(技能/触发器/掉落)goja 跑同一份 JS。
- **折中3 渐进联网**：① 账号/存档/大厅/排行(无实时逻辑，先上线) → ② 异步校验(客户端算，服务器验+防刷) → ③ 实时权威(移动/战斗裁决，用折中1/2 复用逻辑)。

### 13.4 数据模型跨语言红利
GameProject / Intent / State 均为 JSON（或后续 protobuf），Golang 直接可读。
数据定义（对话/任务/触发器/掉落/数值）**只写一份**，前后端共享，是 A2+B2 的额外收益。

### 13.5 落地检查点
- P1 写 TriggerSystem 时：动作分发 = 纯函数 + events；条件 = ExpressionEngine 数据。
- 写战斗时：`CombatResolver.resolve()` 纯函数，演出订阅其 events。
- 写移动时：intent 驱动，RNG/时钟可注入。
- 每个 Resolver/System 顶部注释 `authority`。

## 14. 战场模式 BattleMode（横切关注点，组件在 P1/P2 落位）

> 所谓"塔防/跑酷"经澄清，是**大规模多人战场的规则变体**（攻城战/逃亡战），
> 不是独立小游戏。它们与"决战"底层完全相同（自由移动 + 战斗 + 多单位），
> 差异全部可数据化 → **一个 ActionMode + 一份 BattleConfig**。
> 所有战斗玩法（决战/攻城/逃亡）都是同一个 ActionMode + 不同 BattleConfig，无独立玩法模块概念。

### 14.1 三种战斗 = 一个 ActionMode + BattleConfig

| 战斗类型 | type | 胜负 | 说明 |
|----------|------|------|------|
| 决战(现有) | melee | 消灭对方 | 自由混战 |
| 攻城战(原"塔防") | siege | 城门/据点被破 or 守住 | 攻方 vs 守方，多玩家，建筑/小兵皆玩家可控 |
| 逃亡战(原"跑酷") | chase | 逃到终点 or 被拦截 | 追击方 vs 逃命方 |

差异点全部数据化，复用现有系统：阵营→**TeamSystem**；目标物/建筑/载具→实体+**CombatSystem/EntityFactory**；
胜负→**TriggerSystem(P1)**；单位归属→`controller`。

### 14.2 BattleConfig 数据

```jsonc
"battle": {
  "type": "melee|siege|chase",
  "teams": [
    { "id":"attacker","name":"攻方","color":"#c33","spawns":["sp_a1"] },
    { "id":"defender","name":"守方","color":"#39c","spawns":["sp_d1"] }
  ],
  "objectives": [
    { "id":"gate","kind":"building","team":"defender","entity":"city_gate","hp":5000,
      "onDestroyed":[{ "action":"battleWin","params":{"team":"attacker"} }] },
    { "id":"escape","kind":"reachZone","team":"runner","region":"exit",
      "onReached":[{ "action":"battleWin","params":{"team":"runner"} }] }
  ],
  "controllable": ["soldier","cavalry","chariot","ballista","tower"], // 玩家可控单位/建筑/载具
  "spawnRules": [ /* 波次/兵营产兵 */ ],
  "respawn": { "enabled":true, "delay":5 }
}
```

### 14.3 新增组件（都挂在普通 ECS 实体上）

- **BuildingComponent**：城墙/城门/箭塔/兵营。可摧毁、占地碰撞、可被玩家操作（如箭塔=可控建筑）。
- **ObjectiveComponent**：标记目标物，绑定 onDestroyed/onReached 触发器（= §4 动作）。
- **VehicleComponent**：载具（战马/战车/八床弩）。字段：
  ```jsonc
  { "vehicleType":"chariot", "speed":..., "turnRate":..., "hp":...,
    "seats":[ {"id":"drv","role":"driver","offset":[0,-8]},
              {"id":"gun","role":"gunner","weapon":"ballista_bolt","offset":[0,4]} ],
    "onDestroyed":"eject" }   // 摧毁时乘员下车+受伤
  ```
- **SeatComponent / RiderComponent**：驾乘关系。rider 实体附着到载具某 seat；记录 `vehicleId/seatId`。

### 14.4 controller 控制权抽象（单机就要做对，网络红利）

每个可控实体（含载具、建筑、小兵）标记控制者：
```
controller: { kind:'ai'|'localPlayer'|'remotePlayer', playerId? }
```
- 单机：1 个 localPlayer + 大量 ai（攻城 AI 攻/守）
- 网络：把部分 ai 换成 remotePlayer，战斗逻辑不变
- **席位级控制**：载具 seat 各自有 controller → 一辆战车可 A 驾驶(driver)、B 操弩(gunner)，多人协作
- intent 路由：玩家 intent → 若在载具 seat，则按 seat.role 作用（driver 移动 / gunner 开火）；否则作用于自身单位

### 14.5 VehicleSystem（新，只管驾乘，不重写移动/战斗）

```js
VehicleSystem:
  mount(riderEntity, vehicleEntity, seatId)   // 上车：占席位 + 转移 controller + 附着
  dismount(riderEntity)                        // 下车：释放席位 + 恢复自身控制 + 落地
  update(dt)                                   // 同步乘员到 seat.offset；空载具 AI/静止
  onVehicleDestroyed(vehicle)                  // eject 所有乘员 + 受伤
  routeIntent(playerId, intent)                // 按席位角色路由 intent 到移动/武器
// 移动仍走 MovementSystem（用载具的 speed/turnRate），攻击仍走 CombatSystem（用载具武器）
```

### 14.6 编辑器（战场 Tab / 场景逻辑对象）

- 场景 objects 里放：目标物(building/reachZone)、出生点(spawn)、兵营、载具初始位
- BattleConfig 表单：type、teams、objectives(绑触发器)、controllable、波次、复活
- 载具/建筑定义进 §7 内容库（enemies/units 同级新增 vehicles/buildings 库）

### 14.7 与网络/§13 的衔接

- controller（含席位级）= 服务器分配"谁控哪个单位/席位"的天然锚点
- 战斗/攻城/载具伤害走 Resolver 纯函数（§13 约定1/5）→ 服务器权威裁决
- BattleConfig/objectives/teams 全是数据（§13.4）→ 前后端共享
- 单机把 controller + Resolver + BattleConfig 做对，联网就是"AI controller 换远程玩家"，不重写

### 14.8 实施顺序影响
- 组件（Building/Objective/Vehicle/Seat）+ controller 抽象建议在 **P2（场景逻辑对象 + 内容库）** 一并落地
- `battleWin/battleLose/spawnWave/mount` 等动作在 **P1 TriggerSystem** 注册
- VehicleSystem 在 P2 实现；BattleConfig 驱动的完整攻城战在 P4（序章数据化）后作为示例关卡验证
- 所有战斗玩法（决战/攻城/逃亡）均为 BattleMode 数据变体，无独立玩法模块阶段

## 16. 细粒度实现步骤清单（可勾选，供选择实施）

> 每个阶段拆成独立可验证的小步。建议顺序执行，但每步都能单独交付。
> 标注 [验收] 为该步完成的判定标准。

### P0 — 统一 Shape 背景层 ✅ 已完成
- [x] P0-1 `src/rendering/ShapeRenderer.js`：render(ctx, shape, resolver)，5 形状 + 5 填充 + edgeFade + stroke，编辑器/游戏共用
- [x] P0-2 编辑器 `SceneEditorCanvas` 改调 ShapeRenderer（fill/ellipse/shape 统一 + `_shapeResolver` + 透明度0编辑显示0.5）
- [x] P0-3 游戏侧 `Scene1Terrain._renderTerrainEllipse` 改调 ShapeRenderer；`_editorShapes` 收集渲染普通 shape
- [x] P0-4 polygon/path：资源库拖入 + 命中(射线法) + 整体移动 + 顶点拖拽 + 选中框顶点手柄 + 属性面板 + 顶点数(3~100,随机增删)
- [x] P0-5 collide 碰撞：`isBlocked` 点在多边形内 + `checkTerrainCollision` 推开式(多边形精确边界,无 entityRadius 缩进)
- [x] P0-6 旧数据迁移：`_migrateShapes` 加载时 rect/circle/fill/ellipse → shape
- [x] [验收] 已通过：多边形可画/可编辑/可碰撞/游戏显示；遮罩层已删；不再自动生成椭圆
- 注：编辑器 `SceneEditorCanvas` 旧 `_renderFillObject/_renderEllipseObject` 等死代码保留待清理（不影响功能）

### P1 — 触发器内核 + 事件编辑器 ✅ 已完成（内核部分）
- [x] P1-1 `Blackboard`（`src/core/Blackboard.js`）：变量存取 + serialize/deserialize + 变更事件
- [x] P1-2 `ExpressionEngine`（`src/systems/ExpressionEngine.js`）：JSON 条件求值（比较/逻辑/var/flag/questState/hasItem/distanceTo/inRegion）
- [x] P1-3 `TriggerSystem`（`src/systems/TriggerSystem.js`）：register/update/fire/条件判定/once/cooldown/序列化；事件源目前接入 sceneEnter、dialogueEnd（kill/enterRegion/itemPickup/timer/questComplete 待按需接）
- [x] P1-4 动作注册表（`src/systems/TriggerActions.js`）：setVar/addVar/setFlag/startDialogue/showTip/giveReward/playSound/wait 等默认动作；战场动作(battleWin/spawnWave/mount)待 P2 组件到位后补
- [x] P1-5 编辑器事件 Tab（`editor/TriggerEditor.js`）：读写 game.project.json 的 triggers，JSON 实时校验(合法绿框/非法红框)、保存前拦截非法 JSON、保存成功/失败 toast 提示；集成到 `editor/index.html` 导航
- [x] [验收] 已通过：编辑器配 sceneEnter→setVar 触发器，游戏中 Act1SceneECS 加载后 fire('sceneEnter') 执行，控制台确认 `act: 0 → 1`
- 注：可视化 if 条件树 / do 动作拖拽表单仍是 JSON 文本编辑（够用）；画布框选生成 region 待 P2

### P2 — 逻辑对象 + 内容库 + 战场组件 ✅ 已完成（框架 + 编辑器部分）
- [x] P2-1 场景逻辑对象类型：region/npc/spawn/portal（编辑器资源库拖入 + 数据结构 + 画布可视化标记 + 命中检测 + 属性面板；存于 `layer_logic` 图层）
- [x] P2-2 内容库 Tab（`editor/LibraryEditor.js`）：NPC/敌人/物品/装备/商店/职业/技能/载具/建筑 分类列表编辑，JSON 校验 + 保存 toast，数据进 `library`；已接入 `editor/index.html` 导航
- [x] P2-3 各系统 registry：`src/core/Registry.js`（通用定义注册表 + createStandardRegistries）；`GameLoader` 把 `library` 全类注册进 `this.registries`，并桥接外部 deps.registries
- [x] P2-4 战场组件：`BuildingComponent`/`ObjectiveComponent`/`VehicleComponent`/`RiderComponent`（席位在 VehicleComponent.seats 内，含 SeatRole）；EntityFactory 新增 createBuilding/createVehicle/attachObjective
- [x] P2-5 `ControllerComponent`（ai/localPlayer/remotePlayer + team + intent 队列，席位级控制）+ intent 路由（`VehicleSystem.routeIntent` 按 seat.role 分发）
- [x] P2-6 `VehicleSystem`（`src/systems/VehicleSystem.js`）：mount/dismount/席位控制转移/每帧附着同步/摧毁 eject 受伤/routeIntent
- [ ] [验收] 编辑器放 NPC/刷怪点/城门/载具 = ✅（可拖入可编辑可保存）；游戏中可上下载具/多席位/建筑可摧毁的**运行时场景接入**待 P4-3 DataDrivenScene 就绪后按 objects 实例化验证
- 注：所有战场组件/系统均带 `authority` 注释 + serialize/deserialize，遵守 §13 网络约定（纯状态 + 事件 + 可序列化 + 可注入）

### P3 — 对话 + 引导 ✅ 已完成（编辑器 + 数据格式部分）
- [x] P3-1 对话图编辑器 Tab（`editor/DialogueGraphEditor.js`）：对话列表 + 节点卡片（speaker/portrait/text）+ nextNode 单跳（下拉引用节点）+ choices 多选分支（每个选项 text/goto/if/do，if/do 为 DSL JSON 且实时校验）；已接入 `editor/index.html` 导航「对话编辑器」
- [x] P3-2 DialogueData 迁移：DialogueGraphEditor「⬇ 导入 DialogueData」按钮把 `data/DialogueData.json`（按幕嵌套）扁平化合并进工程 `dialogues[]`（非破坏，不改原文件；同 id 覆盖）；格式与 DialogueSystem.registerDialogue 兼容，choices 可补 if/do
- [x] P3-3 引导数据化：`tutorials[]` 复用触发器结构（GameLoader 已把 tutorials 注册进 TriggerSystem）；TriggerEditor 增「事件触发器 / 引导(showTip)」目标切换，可新增/编辑引导（默认 sceneEnter → showTip）。**序章现有提示的实际灌入 + 运行时替换 TutorialSystem 属高风险**，按 §11/§12 约定留到 P4-5 逐幕验收时做（避免与仍在运行的旧 TutorialSystem 重复弹提示）
- [x] [验收] 对话可在编辑器创建/编辑/导入并保存到工程；引导可在编辑器以 showTip 触发器形式编辑；序章运行时全量数据驱动待 P4-5

### P4 — 数据化装配（重构核心，风险较高）
- [x] P4-1 GameProject 数据模型 + $ref 解析（`example/sanguo_zhangjiao/game.project.json` 工程骨架 + 示例触发器）
- [x] P4-2 GameLoader（`src/core/GameLoader.js`）：读工程→装配 Blackboard/TriggerSystem/dialogues/quests/library，支持 $ref、序列化；已试点叠加到 Act1SceneECS（不拆现有逻辑），验证通过
- [x] P4-3 DataDrivenScene（`example/sanguo_zhangjiao/scenes/DataDrivenScene.js`）：叠加式新类，读 GameProject.scenes[id] 图层用 ShapeRenderer 渲染 + 逻辑对象(spawn/npc/building/vehicle)经 EntityFactory+registries 实例化 + GameLoader 装配触发器/黑板/库 + VehicleSystem 驾乘；loadFromProject/loadFromUrl/enter/update/render2D。**未替换现有 Act 场景**（P4-5 再逐幕迁移）
- [x] P4-4 Resolver 化：`src/core/RNG.js`（可注入种子 RNG，§13约定6）+ `src/systems/resolvers/CombatResolver.js`（伤害纯函数，镜像现有公式）+ `LootResolver.js`（掉落纯函数）+ `QuestResolver.js`（任务进度/完成纯函数）；均纯函数 + events + 注入 RNG（§13约定1/5/6），**叠加式，现有 CombatSystem/LootSystem/QuestSystem 未改动**
- [~] P4-5 序章数据化（进行中，逐幕对照）：
  - **关键发现**：PrologueManager 在运行中的 2D demo 里**未被引用**（仅其自身测试引用），六幕硬编码实际在各 Act 场景类 + index.html 直接注册/switchTo。序章**视觉/地形已数据驱动**（编辑器场景 `scene_Prologue`，localStorage 或 `assets/scenes/*.json`，Scene1Terrain 读取）。真正待数据化的是各 Act 的**脚本化流程**（醒来/移动/点火/拾取/战斗/对话/切幕）。
  - **Stage 0 静态预览对照（已验收）**：`?ddscene=preview` → 轻量 `DataDrivenScene`(ShapeRenderer) 渲染 `scene_Prologue`（shape/ellipse/fill/image/slice/deco + 按 collide 分层 Y-sort + 内容包围盒居中）。已与旧场景视觉对齐（草丛在树下、居中）。该类保留作编辑器/无头预览。
  - **Stage 1 可玩数据驱动场景（已交付）**：`scenes/DataDrivenPrologueScene.js` = **extends BaseGameScene + 迁移(复制) Act1 通用代码**（不继承 Act1，避免带入脚本）。迁移内容：相机限制 clampCameraToBasin、地形碰撞 checkTerrainCollision/checkCampfireCollision/_resolveShapeCollision/_pushOutOfPolygon/_closestOnSegment、火堆渲染 renderCampfireBottom/Top、火焰粒子 lightCampfire、火焰动画 updateCampfireAnimation、地形+装饰 Y-sort 渲染。**不含** Act1 脚本流程（阶段机/渐进提示/刷怪/倒计时切幕/迷雾）。`?ddscene=1` 进本场景（默认仍进旧 Act1）。当前：真实地形可自由走动（相机限盆地）+ 多边形/树/水池碰撞 + 火堆+火焰粒子 + sceneEnter 触发器（showTip）。
  - **关键架构决策**：数据驱动场景**继承 BaseGameScene 复用可玩管线**，只把脚本流程数据化，绝不重写玩家/相机/战斗/渲染。
  - **迁移进度**：
    - [x] ② 点火交互：`DataDrivenPrologueScene._checkCampfireInteract()` 靠近火堆按 E/点击 → `fire('interact',{target:'campfire'})`；GameProject 触发器 `trg_campfire_interact`(interact→lightCampfire) + `trg_campfire_autolight`(timer 10s→lightCampfire，`if ddScene==true` 仅本场景生效)；场景注册 `lightCampfire` 动作调 `this.lightCampfire()`（含火焰粒子）。火堆初始熄灭，交互/超时点燃。
    - [x] 开场迷雾：迁移 fog（模糊黑雾 + 玩家周围 2.5D 椭圆透光，点火后淡出）——updateFog + render 叠加 + lightCampfire 触发 targetOpacity=0。
    - [x] ③ 拾取物（方案A：库定义 + 场景放置 + 组激活）：物品/装备**明细**移入内容库 `library.items/equipment`（残羹/破旧衣服/木剑，无坐标）；**位置**由场景编辑器「资源库·内容」拖入生成 `type:'ref'` 放置点（存 kind/ref/x/y/group）；触发器 `trg_spawn_pickup`(campfireLit→`spawnGroup{group:'act1_pickups'}`) 只给组名；运行时 `DataDrivenPrologueScene._spawnGroup` 按组找放置点 + 从 registries 取库定义 + 放置点坐标 → push 到 pickupItems/equipmentItems（继承 PickupSystem 拾取）。事件源 `campfireLit`。**三者解耦**：明细在库、位置在场景、触发器只引用组名。
    - [x] ④ 刷怪波次（对齐旧 Act1 双波流程）：`_spawnGroup` 支持 kind=enemy/npc/building/vehicle（经 EntityFactory + registries 实例化，敌人入 entities+enemyEntities，AI/战斗继承自 BaseGameScene）；`waveCleared`（某组敌人全灭，每组一次，逐渐生成波须全部生成完才判定）。**流程**：
      - **装备武器才刷第一波**（不再"拾木剑即刷"）：`onEquipmentChanged` 覆盖 → fire `equipItem{slot,item}`；触发器 `trg_spawn_wave`(equipItem weapon → spawnGroup act1_wave1 野狗)。
      - **第一波清 → 按 N → 第二波**：`trg_wave_cleared_switch`(waveCleared act1_wave1 → **promptNextWave**) 显示"按 N 继续"；按 N（`_updatePromptNextWave` 在 super.update 前检测键）→ fire `nextWave`；`trg_next_wave_starving`(nextWave → **spawnStarvingWave** act1_wave2) 逐渐生成 18 饥民（`_starvingSpawner` 复用旧 Act1 逻辑，四面涌入）。
    - [x] ⑤ 倒计时→死亡过渡→切幕（对齐旧 Act1）：`trg_wave2_cleared_countdown`(waveCleared act1_wave2 → **sceneCountdown**{scene,seconds:20,text})；`_updateSceneCountdown` 到点 → `_triggerPlayerDeath`(HP=0 → startTransition 黑屏 → `switchToNextScene` 覆盖切目标场景)。另保留 `promptSwitch{scene,text}`（提示按 N/E 切幕）作可选演出。
    - [x] ① 渐进提示：`tutorials[]` 7 条 showTip（醒来/移动→点火/点火→拾取/拾取→背包/背包→属性/完成 + **拾木剑→装备武器**`tut_equip_weapon`(itemPickup wooden_sword)衔接装备触发刷怪），均 `if ddScene`；条件事件源 `playerMoved`（离出生点>60px）、`panelOpen{panel:inventory|stats}`（面板打开上升沿）由 DataDrivenPrologueScene fire。
    - [x] ⑤（历史）曾用 `promptSwitch{scene,text}` 单波直接切幕；现已改为双波流程（见上 ④⑤），最终切幕走 sceneCountdown 死亡过渡。`promptSwitch` 动作保留可用。
    - [x] **关键 bug 修复**：`_updatePromptSwitch`/`_updatePromptNextWave` 用 `isKeyPressed`（单帧按下）检测 N/E，必须放在 `super.update()` **之前**——否则 super.update 末尾 `inputManager.update()` 已清空 keysPressed，永远检测不到（表现为"打完不切幕/按 N 无反应"）。
  - **P4-5 序章流程链路已全部数据化**（对齐旧 Act1）：醒来→移动→点火→拾残羹(掉装备)→拾木剑→**装备武器**→刷野狗(第一波)→清波按 N→饥民围困(第二波逐渐涌入)→全灭→20s 倒计时→死亡黑屏→切第二幕。全程 事件源→触发器→动作+组激活，零硬编码。
  - **新增事件源**：`interact`/`campfireLit`/`itemPickup`/`equipItem`/`nextWave`/`kill`/`waveCleared`/`playerMoved`/`panelOpen`；**系统级通用事件源**（GameLoader 桥接，见 §17.3）：`questComplete`/`questProgress`/`dialogueEnd`。
  - **新增场景动作**：`lightCampfire`/`spawnGroup`/`spawnStarvingWave`/`promptNextWave`/`sceneCountdown`/`promptSwitch`（均入 TriggerEditor 列表；when/action 下拉保留自定义值）。
  - **编辑器健壮性修复**：TriggerEditor 的 when.type / action 下拉现在保留列表外的自定义值（显示"自定义: xxx"），避免编辑保存时把 campfireLit/lightCampfire/spawnGroup 等场景专属值重置丢失。
  - **拾取物图标**：暂由 BaseGameScene 按 item.id 硬编码绘制（leftover_food/ragged_clothes/wooden_sword/wooden_bow/wooden_arrow 有专属画法，其它画默认圆点）；后续可数据化为库 icon 字段。

### 18. 资源库 / 内容库 信息架构重构（已实施）

> 统一"定义 vs 放置"心智：**内容库存图纸，资源库放实例**。

- **资源库**（场景编辑器左侧，`SceneEditorUI`/`SceneEditorAssets`）分 4 Tab：
  - **图形**：rect/circle/ellipse/polygon/fill（拖入=背景 shape）
  - **图集**：图集切片
  - **逻辑**：region/spawn/portal（从「图形」拆出单列）
  - **内容**（= 资源库·定义 + 放置）：列表 + 顶部分类筛选（物品/装备/NPC/敌人/商店/载具/建筑），读写 `game.project.json` 的 `library`；点条目→右侧浮层编辑定义（`showContentDefinitionEditor`）；拖入画布→生成 `type:'ref'` 放置实例 `{kind,ref,x,y,group}`（存 `layer_placement`）。
- **内容库**（导航 `LibraryEditor`）精简为角色养成全局定义：**职业 / 战斗技能 / 采集技能 / 生产技能 / 天赋**（不进场景坐标）。
- **placement 引用对象 `type:'ref'`**：`SceneEditorCanvas._renderRefObject`（按 kind 图标+名称+组名）、`SceneEditorInteraction` 命中、`SceneEditorUI._buildRefProperties`（编辑 group）。
- **运行时**：`GameLoader.registries` 存 library 定义；`DataDrivenPrologueScene._spawnGroup` 按组实例化（库定义 + 放置坐标）。
- **命名统一**：全部用「资源库(定义+放置) / 内容库(养成)」两词，不再出现"精灵"混称。
- **运行时实体化已接**：`DataDrivenPrologueScene._spawnGroup` 已支持 kind=item/equipment/enemy/npc/building/vehicle（库定义 + 放置坐标 → EntityFactory 实例化）。
- [x] [验收] 序章**可玩流程**（`?ddscene=1`）已完全 GameProject 驱动，与旧 Act1 对齐：醒来→移动→点火→拾取→装备武器→双波战斗（野狗+饥民）→倒计时死亡过渡→切第二幕，全程零硬编码。
- [ ] [验收] **删除 PrologueManager / 用 DataDrivenPrologueScene 替换默认 Act1**（高风险，待用户确认；当前新旧并存，默认走旧 Act1，`?ddscene=1` 走数据驱动）。

### P5 — 无缝大地图流式（最大工程）
- [ ] P5-1 统一世界坐标（相机/碰撞/实体全改世界坐标，§11 铁律）
- [ ] P5-2 WorldStreamingManager：3×3 加载 / 离开>2 格卸载 / 局部↔世界转换
- [ ] P5-3 LoadedChunk：instantiate/serialize/restoreState/destroy
- [ ] P5-4 WorldTerrainRenderer：全局地形按视口裁剪渲染（无缝）
- [ ] P5-5 世界地图 Tab：网格分配 scene + 全局地形编辑 + 拼接预览
- [ ] [验收] 玩家跨 chunk 无缝移动，回头怪不复活，编辑器可编大地图

### P6 — 存档 + 性能 + 示例战场
- [ ] P6-1 存档系统：chunk 状态 + 黑板 + 任务序列化/读档
- [ ] P6-2 性能：per-chunk 离屏缓存 + 地形空间网格索引 + ObjectPool 复用
- [ ] P6-3 示例：BattleConfig 驱动的完整攻城战关卡（攻/守、城门、载具、胜负）
- [ ] [验收] 存读档正确；大地图 60FPS；攻城战示例可玩

### 建议起步
从 **P0** 开始（低风险、复用你已完成的椭圆/填充/淡化逻辑、为后续所有视觉编辑打底）。
P0 完成后 **P1** 是关键跳板（触发器内核，后续逻辑编辑全依赖它）。

## 17. 进度快照（截至当前）

> 记录实际交付情况，便于下次续接。勾选状态以 §16 为准，本节侧重"落地文件清单 + 接入现状 + 下一步"。

### 17.1 已交付文件清单

| 阶段 | 交付文件 | 说明 |
|------|----------|------|
| P0 | `src/rendering/ShapeRenderer.js` | 5 形状 + 5 填充 + edgeFade + stroke，编辑器/游戏共用 |
| P0 | `editor/SceneEditorCanvas.js` 等编辑器模块 | 统一走 ShapeRenderer，多边形绘制/编辑/顶点数配置 |
| P0 | `example/sanguo_zhangjiao/scenes/Scene1Terrain.js` | 游戏侧用 ShapeRenderer，`_editorShapes` 数据驱动渲染 + 多边形碰撞 |
| P1 | `src/core/Blackboard.js` | 全局变量黑板 |
| P1 | `src/systems/ExpressionEngine.js` | 数据化条件求值 |
| P1 | `src/systems/TriggerSystem.js` | 触发器内核（fire/update/条件/动作/once/cooldown/序列化） |
| P1 | `src/systems/TriggerActions.js` | 默认动作注册表 |
| P1 | `editor/TriggerEditor.js` + `editor/index.html` | 事件编辑器（JSON 校验 + 保存 toast），已接入导航 |
| P4 | `src/core/GameLoader.js` | 工程装配器（$ref/序列化）+ library 注册进 registries |
| P4 | `example/sanguo_zhangjiao/game.project.json` | 工程数据源骨架 + 示例触发器 |
| P2 | `src/core/Registry.js` | 通用定义注册表 + createStandardRegistries |
| P2 | `src/ecs/components/ControllerComponent.js` | 控制权抽象（ai/localPlayer/remotePlayer + 席位级 + intent 队列） |
| P2 | `src/ecs/components/BuildingComponent.js` | 建筑（城墙/城门/箭塔/兵营，可摧毁/占地/可控） |
| P2 | `src/ecs/components/ObjectiveComponent.js` | 战场目标物（building/reachZone/survive/eliminate） |
| P2 | `src/ecs/components/VehicleComponent.js` | 载具 + 席位（driver/gunner/passenger） |
| P2 | `src/ecs/components/RiderComponent.js` | 乘员驾乘关系 |
| P2 | `src/systems/VehicleSystem.js` | 驾乘系统（mount/dismount/附着/eject/routeIntent） |
| P2 | `src/ecs/EntityFactory.js` | 新增 createBuilding/createVehicle/attachObjective |
| P2 | `editor/LibraryEditor.js` + `editor/index.html` | 内容库编辑器（9 类库），已接入导航 |
| P2 | `editor/SceneEditor*.js` | 逻辑对象 region/npc/spawn/portal：拖入/渲染/命中/属性面板 |
| P3 | `editor/DialogueGraphEditor.js` + `editor/index.html` | 对话图编辑器（节点卡片 + choices + if/do DSL + 导入 DialogueData），已接入导航 |
| P3 | `editor/TriggerEditor.js` | 增 triggers/tutorials 目标切换，引导以 showTip 触发器编辑 |
| P4 | `src/core/RNG.js` | 可注入种子 RNG（mulberry32，serialize，§13约定6） |
| P4 | `src/systems/resolvers/CombatResolver.js` | 战斗伤害纯函数（镜像现有公式，注入 RNG，events） |
| P4 | `src/systems/resolvers/LootResolver.js` | 掉落滚动纯函数（数据化掉落表，注入 RNG） |
| P4 | `src/systems/resolvers/QuestResolver.js` | 任务进度/完成纯函数 |
| P4 | `example/sanguo_zhangjiao/scenes/DataDrivenScene.js` | 数据驱动场景（读工程/编辑器场景渲染 + 实例化逻辑对象 + loadEditorScene/loadProjectUrl + 无相机自适应） |
| P4-5 | `example/sanguo_zhangjiao/scenes/DataDrivenPrologueScene.js` | 完整可玩数据驱动序章（`?ddscene=1`）：双波战斗/装备触发刷怪/饥民逐渐生成/倒计时死亡过渡切幕/7 条渐进提示；场景专属动作 lightCampfire/spawnGroup/spawnStarvingWave/promptNextWave/sceneCountdown/promptSwitch |
| P4-5 | `example/sanguo_zhangjiao/scenes/BaseGameScene.js` | **通用 `initGameLoader` + `_showScreenTip/_hideScreenTip` + update 驱动 gameLoader**（任意幕一行接入事件源） |
| P4-5 | `src/core/GameLoader.js` | 新增 `bridgeEventSources(deps)`：桥接 questComplete/questProgress/kill 系统级事件源 → TriggerSystem |
| P4-5 | `src/systems/CombatSystem.js` | 新增 `setOnKillCallback` + `_notifyKill`（防重、仅非玩家，两条死亡路径触发通用 kill） |
| P4-5 | `example/sanguo_zhangjiao/scenes/Act2Scene.js`~`Act6Scene.js` | 全六幕各一行接入 `initGameLoader`（后续幕零成本用事件源） |
| P4-5 | `example/sanguo_zhangjiao/game.project.json` | 序章双波流程触发器 + 装备触发/N键推进/倒计时切幕 + kill 计数示范 + `trg_enter_act2`~`act6`(sceneEnter→setVar act=N) + tut_equip_weapon |
| P4-5 | `example/sanguo_zhangjiao/index.html` | `?ddscene=1` 并存试点分支（守卫，默认走旧流程不变） |

### 17.2 试点接入现状 + GameLoader 通用化（已完成）

- **GameLoader 挂载已下沉为 BaseGameScene 通用能力**（任意幕一行接入）：
  - `BaseGameScene.initGameLoader(projectUrl, opts)`：组装标准 deps（dialogue/quest/**combat**/sceneManager/audio/floatingText/tutorial/player）+ `GameLoader.load` + 订阅 `dialogueEnd` + `opts.sceneFlag` 黑板标记 + `opts.onReady(gameLoader,trig)` 补场景专属动作 + `opts.sceneId` fire sceneEnter。**叠加式**：不调用则场景行为完全不变。
  - `BaseGameScene._showScreenTip/_hideScreenTip`：通用屏幕提示（原版面板 `window.__ddShowTips` 优先，回退黑框），从序章场景上提到基类，所有幕共用。
  - **基类 `update` 统一驱动 `this.gameLoader.update(dt)`**（timer 触发器）；已移除 DataDrivenPrologueScene / Act1SceneECS 里重复的 gameLoader.update 调用，避免 timer double-tick。
- **DataDrivenPrologueScene**：完整数据驱动序章（`?ddscene=1`），自带 `_initGameLoader`（含 lightCampfire/spawnGroup/spawnStarvingWave/promptNextWave/sceneCountdown/promptSwitch 等场景专属动作）。
- **Act1SceneECS**：早期试点仍挂 GameLoader（叠加，不拆六幕逻辑）；保留 `[GameLoader]`/`[Trigger]` 诊断 log，删除前需征得用户同意。
- **Act2Scene 示范接入（已验证后续幕零成本用事件源）**：enter 末尾一行 `initGameLoader({sceneId:'Act2Scene', sceneFlag:'act2Scene'})`；触发器 `trg_enter_act2`(sceneEnter Act2Scene + if act2Scene → setVar act=2)，不打扰觉醒对话。

### 17.3 事件源接入现状（已扩展为系统级通用事件源）

- **系统级通用事件源**（`GameLoader.bridgeEventSources(deps)` 集中桥接，符合 §4.4；任意挂 GameLoader 的场景自动获得）：
  - `kill`：**CombatSystem 新增 `setOnKillCallback` + `_notifyKill`**（实体 `_killNotified` 标记防重、仅非玩家；在 `triggerDeathEffect` 普攻致死 / `handleDeath` 兜底两条路径触发）→ fire `kill{enemyType(=templateId), entityId, name}`。
  - `questComplete` / `questProgress`：订阅 QuestSystem 已有 `on('questCompleted'/'questProgress')` → fire 对应事件（`_questBridged` 防重复订阅）。
  - `dialogueEnd`：`initGameLoader` 订阅 DialogueSystem.onEnd。
- **场景级事件源**（由场景 fire）：`sceneEnter`/`interact`/`campfireLit`/`itemPickup`/`equipItem`/`nextWave`/`waveCleared`/`playerMoved`/`panelOpen`。
- **示范验证**：`trg_kill_count`(kill→addVar killCount) + 饥民专属 `trg_starving_kill_count`(kill{enemyType:starving}→addVar starvingKilled) + `trg_starving_encourage`(kill{starving} + if `and`(ddScene, starvingKilled>=9) → showTip，once) 端到端验证 kill 事件源 + enemyType 匹配 + 计数 + 复合条件。
- **TriggerEditor when 下拉**已含 `kill`/`questComplete`/`questProgress` 等。
- 未接（按需再接）：`enterRegion`、`flagChange`（`timer` 内核已支持，编辑器可配）。

### 17.4 未做 / 待续

- **P2 运行时场景接入**：逻辑对象（spawn/npc/portal/region）与战场组件（building/vehicle/objective）的**游戏内实例化**待 P4-3 DataDrivenScene 就绪后，由 chunk/scene 按 `objects` + `library` 引用实例化（框架/编辑器已就位，运行时装配未接）。
- **P4-3 DataDrivenScene**：✅ 已交付（叠加式新类，未替换 Act 场景）。渲染用简版占位方块画实体，接入现有 RenderSystem/相机做正式表现属后续增强。
- **P4-4 Resolver**：✅ 已交付（RNG + Combat/Loot/Quest Resolver）。**增强1已做**：CombatSystem.calculateDamage/calculateSkillDamage 已收敛为委托 `CombatResolver.resolveAttack/resolveSkillAttack`（行为等价：兵种/元素相克经闭包注入真实 stats，单机 rng=null→Math.random 与旧行为统计等价，联网注入种子 RNG）。CombatResolver 现为普攻+技能伤害的唯一权威入口。LootSystem/QuestSystem 的委托可后续按需做。
- **P4-5 序章可玩流程**：✅ 已完全数据驱动（`?ddscene=1`），与旧 Act1 对齐（双波战斗 + 装备触发 + 死亡过渡切幕 + 7 条渐进提示）。
- **P4-5 事件源通用化**：✅ 已完成——GameLoader 挂载下沉为 BaseGameScene 通用能力（一行 `initGameLoader`），系统级事件源 `kill`/`questComplete`/`questProgress`/`dialogueEnd` 由 `bridgeEventSources` 集中桥接，任意幕自动获得；Act2Scene 已示范接入。
- **P4-5 拆 PrologueManager / 替换默认 Act1**：未做（高风险，需逐幕对照验收）。【待用户确认后推进】
- **全六幕已接入事件源**：✅ Act2-6 各 enter 一行 `initGameLoader({sceneId:'ActXScene', sceneFlag:'actXScene'})`；触发器 `trg_enter_act2`~`trg_enter_act6`(sceneEnter ActXScene + if actXScene → setVar act=N) 随幕推进剧情进度变量。后续各幕补具体剧情节点（对话/战斗/任务）直接编辑器配触发器即可，无需改代码。
- **P5 大地图流式 / P6 存档性能**：未开始。

### 17.6 P2 交付说明（截至当前）

- **战场组件（§14）全部落地**为独立 ECS 组件，均带 `authority` 注释 + serialize/deserialize，遵守 §13 六约定（纯状态改动 + 事件回调 + 可序列化 + 依赖注入）。
- **VehicleSystem** 只管驾乘与 intent 路由，不重写移动/战斗：移动仍走 MovementSystem（用载具 speed），攻击仍走 CombatSystem（用席位 weapon）。多人协作靠席位级 ControllerComponent。
- **内容库 LibraryEditor** 与 **事件 TriggerEditor** 同构（读写 game.project.json、JSON 实时校验、保存 toast）。
- **逻辑对象** 复用现有场景编辑器的图层对象机制（type 分发），存于自动创建的 `layer_logic` 图层。
- **下一步**：P4-3 DataDrivenScene 做运行时装配，把 spawn/npc/building/vehicle 从数据实例化进场景，届时验证"上下载具/多席位/建筑摧毁/刷怪"。

### 17.7 P3 交付说明（截至当前）

- **对话图编辑器**（DialogueGraphEditor）与 事件/内容库编辑器同构：读写 game.project.json `dialogues[]`、JSON 实时校验、保存 toast。节点卡片支持 speaker/portrait/text；分支两种：无选项走 nextNode（下拉引用节点），有选项用 choices（每项 text/goto/if/do，if/do 为 DSL）。
- **导入迁移**：一键把 `data/DialogueData.json`（act 嵌套）扁平化并进 `dialogues[]`，非破坏、同 id 覆盖，格式直接兼容 DialogueSystem。
- **引导**：tutorials[] 即 showTip 触发器；TriggerEditor 目标切换即可编辑。GameLoader 已 `registerAll(proj.tutorials)`。
- **安全边界**：不动正在运行的 PrologueManager/TutorialSystem/DialogueSystem 注册逻辑；对话与引导的运行时全量数据驱动（读 dialogues[]/tutorials[] 替代硬编码）随 P4-5 序章数据化一起逐幕验收。

### 17.8 P4-3/P4-4 交付说明（截至当前）

- **Resolver（P4-4）全部纯函数**：`(输入快照/意图) → { ...结果, events }`，不改渲染/全局；随机走注入的 `RNG`（禁止 Math.random）。CombatResolver 镜像现有 CombatSystem 伤害公式（攻-防→兵种→元素→±10%波动→最小1~5），元素/兵种相克通过 `ctx.elementCalc/unitCalc` 注入保持解耦。**现有系统未改动**，Resolver 为将来服务器权威/goja 复用打底（§13.3）。
- **DataDrivenScene（P4-3）叠加式**：继承核心 `Scene`，`loadFromProject/loadFromUrl` 装配，`enter` fire('sceneEnter')，`update` 驱动触发器+VehicleSystem+实体，`render2D` 用 ShapeRenderer 画图层 + 简版占位方块画实体。逻辑对象兼容两种存法（scene.objects 与 layer_logic 图层）。**未替换任何 Act 场景**。
- **下一步（可选增强，非拆除）**：① 让 CombatSystem 内部调用 CombatResolver 去重；② DataDrivenScene 实体渲染接入现有 RenderSystem/精灵。
- **P4-5（高风险，待确认）**：用 DataDrivenScene 逐幕重建序章，与旧 Act 场景对照验收通过后再删 PrologueManager；期间新旧并存。

### 17.5 下一步建议（优先级）

1. **完整验收数据驱动序章**：跑 `?ddscene=1` 全流程，与旧 Act1 逐环节对照（醒来→…→切第二幕），确认行为一致。
2. **删 PrologueManager / 替换默认 Act1**（高风险，需用户确认）：验收通过后把默认入口切到 DataDrivenPrologueScene，删旧脚本。
3. **后续幕剧情数据化**（低风险，能力已就位）：Act3-6 各 enter 加一行 `initGameLoader`，在编辑器用 kill/questComplete/sceneEnter 等事件源配剧情节点。
4. **P5 大地图流式**（最大工程）：先统一世界坐标（§11 铁律），再 WorldStreamingManager。
5. 决战/攻城/逃亡战场组件（P2-4~P2-6）运行时接入，用 BattleConfig 做示例关卡。

### 17.9 P4-5 事件源通用化交付说明（本轮）

- **CombatSystem**（框架增强）：`setOnKillCallback(cb)` + 内部 `_notifyKill(entity)`（`entity._killNotified` 防重、仅非玩家），在 `triggerDeathEffect`（普攻致死）与 `handleDeath`（update 兜底）两条死亡路径统一触发。遵循现有 `setXxxCallback` 风格，无侵入。
- **GameLoader**：`bridgeEventSources(deps)`（assemble 末尾调用）集中把系统事件转 TriggerSystem.fire——questSystem.on(questCompleted/questProgress) + combatSystem 击杀回调；`_questBridged` 防重复订阅。符合 §4.4「监听各系统 emit」。
- **BaseGameScene 通用化**：`initGameLoader(url, {sceneId,sceneFlag,deps,onReady})` 一行接入；`_showScreenTip/_hideScreenTip` 上提基类；update 统一驱动 gameLoader（子类重复调用已移除，防 timer double-tick）。
- **关键 bug 修复**：数据驱动序章「打完不切幕/按 N 无反应」根因＝`isKeyPressed` 检测放在 `super.update()`（末尾清 keysPressed）之后；已把 `_updatePromptSwitch/_updatePromptNextWave` 提到 super.update 之前。
- **网络约定符合性（§13）**：kill 事件 payload 为纯数据（enemyType/entityId/name），Resolver/结算不受影响；事件源桥接是「表现层订阅→数据事件」，联网时同套触发器数据复用。

### 17.10 全六幕接入 + 第五幕剧情节点示范（本轮）

- **全六幕已接入事件源**：Act2-6 各 enter 一行 `initGameLoader({sceneId, sceneFlag})`；`trg_enter_act2`~`trg_enter_act6`(sceneEnter + if actXScene → setVar act=N) 随幕推进 `act` 进度变量。每幕独立 `sceneFlag`（act2Scene~act6Scene）+ `if` 隔离，互不干扰。
- **第五幕剧情节点（真实端到端示范，纯叠加不改战斗流程）**：
  - 关键点：第五幕所有敌人 `templateId` 都是 `'soldier'`，但武将 `entity.name` 不同（"曹操·孟德"/"关羽·云长"…）；`kill` 事件 payload 带 `name`，`_matchParams` 精确匹配 → 可按 BOSS 名配节点。
  - `trg_act5_slay_count`(kill + if act5Scene → addVar act5Kills)：击杀总数统计。
  - `trg_act5_kill_caocao`(kill{name:'曹操·孟德'} → showTip 广宗解围)、`trg_act5_kill_guanyu`(kill{name:'关羽·云长'} → showTip)：击杀特定 BOSS 触发台词，once。
  - `trg_act5_bloodbath`(kill + if `and`(act5Scene, act5Kills>=100) → showTip 百人斩)：里程碑，once。
  - 注册顺序保证同帧先 `slay_count` 累加、后 `bloodbath` 判阈值。广宗"曹操·孟德"与终战"曹操"名字不同不误匹配。
- **样板价值**：后续任意幕加剧情节点＝编辑器配触发器（`kill{name}`/`questComplete`/`dialogueEnd` → `showTip`/`startDialogue`/`giveReward`），零改代码。

### 17.11 第二幕(dialogueEnd) + 第四幕(classSelected) 剧情节点 + heal 动作（本轮）

- **dialogueEnd 带对话 id**：`endDialogue()` 的 `onEndCallback(dialogue)` 本就带 dialogue 对象；BaseGameScene.initGameLoader 订阅改为 `fire('dialogueEnd', {id: dialogue.id})` → 触发器可 `when:dialogueEnd{id:'awakening'}` 精确匹配某段对话结束。（`onEnd` 为单回调，但仅 GameLoader 桥接使用、各场景独立 dialogueSystem 实例，无覆盖冲突。）
- **新动作 `heal`（框架增强）**：`heal{hp,mp,full}` 作用于 ctx.player.stats（full=全满）。已入 TriggerEditor ACTION 列表。
- **第二幕节点**：`trg_act2_awakening_heal`(dialogueEnd{id:'awakening'} + if act2Scene → heal{full} + showTip)。第二幕开场玩家 hp/mp=1 濒死，觉醒对话结束→符水救活（全满）+ 台词，纯叠加不改第二幕流程。
- **第四幕节点**：第四幕职业选择走 `classSystem.selectClass`（**不用 QuestSystem**），故加**场景级事件源 `classSelected`**（selectClass 成功处 fire{class,className}，同 equipItem 模式）；`trg_act4_class_selected`(classSelected + if act4Scene → giveReward{exp:200,gold:100} + showTip)。
- **questComplete 说明**：能力已就位（GameLoader 桥接 QuestSystem.on(questCompleted) + 编辑器下拉），但当前 demo 各幕未用 QuestSystem 完成剧情，故未配 questComplete 触发器；将来接入真实任务（acceptQuest→updateObjective→completed）即自动可用。
- **编辑器 WHEN 下拉**新增 `equipItem`/`classSelected`；ACTION 下拉新增 `heal`。

### 17.12 第三幕 + 第六幕剧情节点（本轮，纯数据零改代码）

- **第三幕**（`dialogueEnd{id:'coin_artifact'}`）：`trg_act3_coin_dialogue`(+if act3Scene → showTip「按 B 用铜钱剑前往第四幕」)。铜钱法器对话结束即提示，纯叠加。
- **第六幕结局分支（关键设计）**：结局对话 id 是**动态的**（`ending_savior`/`ending_leader`/`ending_witness`/`ending_survivor`，各只在对应结局播放）→ `dialogueEnd{id:'ending_xxx'}` **天然就是结局分支**，无需读 endingType，零改 Act6 代码：
  - `trg_act6_intro_end`(dialogueEnd{act6_intro} → showTip 追思张角)。
  - `trg_act6_ending_savior/leader/witness/survivor`(dialogueEnd{ending_xxx} + if act6Scene → setVar ending + giveReward(exp/gold 按结局递减) + showTip 结局达成)。
  - `ending` 变量写黑板，供将来正式游戏/存档读结局分支。
- **至此全六幕剧情节点均已数据化接入**（序章完整流程 / 二觉醒救活 / 三铜钱剑 / 四拜师奖励 / 五 BOSS 台词+里程碑 / 六结局分支），全部事件源→触发器→动作，零改各幕核心逻辑。事件源模式覆盖：sceneEnter/interact/itemPickup/equipItem/classSelected/kill(含 name)/waveCleared/dialogueEnd(含 id)/playerMoved/panelOpen/计数阈值。
