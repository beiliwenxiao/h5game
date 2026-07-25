---
inclusion: fileMatch
fileMatchPattern: 'editor/**'
---

# 地图编辑器开发指南

## 概述

地图编辑器位于 `editor/` 目录下。编辑器核心已模块化拆分为多个文件，所有默认值外部化到 `editor/config/` 目录下的 JSON 文件中。修改配置时只需编辑对应的 JSON 文件，无需修改 JS 代码。

## 模块架构

### 文件结构

```
editor/
├── index.html                    ← 编辑器入口页面（游戏列表 + 场景/UI 编辑器切换）
├── styles/
│   └── scene-editor.css          ← 场景编辑器所有样式（独立 CSS 文件）
├── config/
│   ├── editor-defaults.json      ← 编辑器核心默认值
│   ├── scene-presets.json        ← 预设场景配置
│   ├── scene-templates.json      ← 场景模板（多套可复用的新建场景初始数据）
│   ├── deco-sprites.json         ← 装饰物精灵图配置
│   ├── atlases.json              ← 图集资源定义
│   └── builtin-games.json        ← 内置游戏列表
├── SceneEditor.js                ← 主入口：构造函数 + 事件绑定 + 组合模块 + 兼容 API
├── SceneEditorUI.js              ← UI 面板初始化、属性面板更新、缩放、拖拽分隔条
├── SceneEditorCanvas.js          ← Canvas 渲染（场景、网格、对象、地形、选中框）
├── SceneEditorInteraction.js     ← 鼠标/键盘事件处理、右键菜单、对象拾取、缩放手柄
├── SceneEditorLayers.js          ← 图层管理（增删排序、批量操作、规范化、装饰物合并）
├── SceneEditorAssets.js          ← 资源管理（图集、切片、拖放、图片加载）
├── SceneEditorHistory.js         ← 撤销/重做、保存/导出/导入
├── EditorDataManager.js          ← 游戏/场景数据管理（localStorage 读写）
├── SceneDataLoader.js            ← 从预设加载场景，提供图集/切片数据
├── SceneDataExporter.js          ← 把代码定义的场景转换成可编辑的 JSON 数据
├── ImageSlicer.js                ← 图片切片工具
└── UIEditor.js                   ← UI 编辑器
```

### 模块职责与通信

| 模块 | 职责 | 大约行数 |
|------|------|---------|
| `SceneEditor.js` | 主入口，构造函数，事件绑定，组合所有子模块，提供兼容旧 API | ~280 |
| `SceneEditorUI.js` | UI 面板 HTML 生成、属性面板、工具模式切换、缩放控制、拖拽分隔条 | ~400 |
| `SceneEditorCanvas.js` | 所有 Canvas 渲染：场景背景、网格、各类对象、地形效果、选中框 | ~360 |
| `SceneEditorInteraction.js` | 鼠标/键盘事件、右键菜单、对象拾取、缩放手柄检测、装饰物/对象层次调整 | ~310 |
| `SceneEditorLayers.js` | 图层增删排序、移动对象到图层、批量深度/偏移/去重、图层规范化、装饰物合并 | ~320 |
| `SceneEditorAssets.js` | 图集/切片管理、拖放到场景、精灵列表、图集图片加载、切片预览 | ~310 |
| `SceneEditorHistory.js` | 撤销/重做栈、保存触发回调、JSON 导出/导入 | ~120 |
| `styles/scene-editor.css` | 编辑器所有样式（从 JS 动态注入改为外部 CSS link） | ~100 |

**通信方式**：各子模块构造时接收 `editor`（主 SceneEditor 实例）引用，通过它访问共享状态：
- `editor.sceneData` — 场景数据
- `editor.selectedObjects` — 选中对象数组
- `editor.activeLayerIndex` — 当前激活图层索引
- `editor.viewport` — 视口状态（scale, offsetX, offsetY）
- `editor.interaction` — 交互状态（mode, isDragging 等）
- `editor.loadedImages` — 已加载的图片缓存 Map
- `editor.options` — 编辑器配置项

**子模块互相调用**通过 editor 实例上的引用：
- `editor.ui` — SceneEditorUI 实例
- `editor.canvas` — SceneEditorCanvas 实例
- `editor.interactionModule` — SceneEditorInteraction 实例
- `editor.layers` — SceneEditorLayers 实例
- `editor.assets` — SceneEditorAssets 实例
- `editor.history` — SceneEditorHistory 实例

### UI 布局

编辑器主界面为三栏布局（左中右）：
- **左侧边栏**：资源库（精灵/图集标签页）+ 选中切片属性
- **中间画布**：Canvas 场景绘制区 + 缩放控件
- **右侧边栏**：图层管理 + 选中对象属性 + 场景信息

三栏之间有可拖拽的分隔条（`.editor-resizer`），用户可以左右拖动调整各面板宽度（范围 120px~500px）。

## JSON 配置文件结构

### `editor/config/editor-defaults.json`
编辑器核心默认值：
- `editor` — 编辑器画布尺寸、网格、显示开关
- `scene` — 新场景默认名称、宽高、背景色、默认图层定义
- `viewport` — 视口初始缩放/偏移
- `history` — 撤销/重做栈最大深度

### `editor/config/scene-presets.json`
所有预设场景配置：
- `assetBase` — 资源根路径
- `scenes` — 按场景 ID 索引的预设数据（name, width, height, backgroundColor, centerX, centerY, basinRadius, basinAspectY, terrain 等）
- `sceneNames` — 场景代码名 → 显示名称 的映射
- `presetScenesList` — 预设场景列表（id, name, type）

### `editor/config/scene-templates.json`
场景模板配置（**多套**可复用的新建场景初始数据）：
- `defaultTemplateId` — 新建场景时默认选中的模板 id
- `templates[]` — 模板数组，每个模板：
  - `id` / `name` / `description` / `category` / `thumbnail`
  - `scene` — 模板的场景初始数据，**与真实场景 JSON 同构**（`width, height, backgroundColor, type, terrain, layers[], decoSprites, atlases` 等）。这是核心设计：新建时只需深拷贝 `scene` + 换 id/name，无需转换；编辑模板时直接把这份 `scene` 丢给场景编辑器打开。

与 `scene-presets.json` 的区别：presets 是三国 demo 里**已有的具体场景实例**；templates 是**通用可复用的初始骨架**（户外/室内/战场/空白等）。与 `editor-defaults.json.scene` 的区别：后者是"无模板时的最小空场景兜底"。

### `editor/config/deco-sprites.json`
装饰物精灵图配置：
- `outdoor` — 室外场景精灵（树/灌木/帐篷/旗帜/围栏/废墟等）
- `indoor` — 室内场景精灵（锅/桌/蒲团/屏风/宝座等）
- 每个精灵属性：`sx, sy, sw, sh, scale, collide, colliderRadius`

### `editor/config/atlases.json`
图集资源定义：
- `atlases[]` — 图集列表（id, name, path, width, height, slices）
- 每个 slice：`{ name, sx, sy, sw, sh, collide?, colliderRadius? }`

### `editor/config/builtin-games.json`
内置游戏列表：
- `games[]` — 包含 id, name, description, thumbnail, path, scenes

## 模块加载流程

1. 编辑器启动时，各模块异步加载对应 JSON 配置
2. 如果 fetch 失败，回退到代码中的硬编码默认值（确保离线可用）
3. 配置加载后缓存在模块级变量中，后续不会重复 fetch

### 初始化顺序
```javascript
// index.html 中的初始化流程：
import { SceneEditor, loadEditorDefaults } from './SceneEditor.js';
import { EditorDataManager, loadBuiltinGamesConfig, loadScenePresetsConfig, loadSceneTemplatesConfig } from './EditorDataManager.js';

// 1. 并行加载所有配置
await Promise.all([
  loadEditorDefaults(),
  loadBuiltinGamesConfig(),
  loadScenePresetsConfig(),
  loadSceneTemplatesConfig()
]);

// 2. 初始化数据管理器
await dataManager.init();

// 3. 创建 SceneEditor 实例时自动组装所有子模块
const sceneEditor = new SceneEditor(containerElement);
```

### SceneEditor 构造内部流程
1. 初始化共享状态（sceneData, viewport, interaction 等）
2. 创建子模块实例：layers → history → ui → canvas → interactionModule → assets
3. `ui.initUI()` — 生成 HTML、加载 CSS、初始化画布、初始化分隔条
4. `_bindEvents()` — 绑定工具栏按钮、Canvas 交互、键盘快捷键、资源拖放

## 模块详细说明

| 文件 | 读取的 JSON 配置 | 关键方法 |
|------|-----------------|---------|
| `SceneEditor.js` | `editor-defaults.json` | `render()`, `loadScene()`, `save()`, `exportJSON()`, `importJSON()` |
| `SceneEditorUI.js` | 无（通过主入口间接获取） | `initUI()`, `fitToContainer()`, `setMode()`, `zoom()`, `updateObjectProperties()`, `showToast()` |
| `SceneEditorCanvas.js` | 无 | `render()`, `_renderObject()`, `_renderFillObject()`, `_renderTerrainBackground()`, `_renderSelection()` |
| `SceneEditorInteraction.js` | 无 | `handleMouseDown()`, `handleMouseMove()`, `handleMouseUp()`, `handleContextMenu()`, `getObjectAt()` |
| `SceneEditorLayers.js` | 无 | `addLayer()`, `deleteLayer()`, `moveLayerUp()`, `batchSetDepth()`, `normalizeLayers()`, `mergeDecorationsToLayer()` |
| `SceneEditorAssets.js` | 无 | `setupAssetDragDrop()`, `addImageAsset()`, `updateAssetLibrary()`, `loadAtlasImages()` |
| `SceneEditorHistory.js` | 无 | `saveHistory()`, `undo()`, `redo()`, `save()`, `exportJSON()`, `importJSON()` |
| `EditorDataManager.js` | `builtin-games.json`, `scene-presets.json`, `scene-templates.json` | `init()`, `getBuiltinGames()`, `getGameScenes()`, `setCurrentScene()`, `createScene()`, `getSceneTemplates()`, `upsertSceneTemplate()` |
| `SceneDataLoader.js` | `scene-presets.json`, `deco-sprites.json`, `atlases.json` | `loadScene()`, `getScenePreset()` |
| `SceneDataExporter.js` | `scene-presets.json`, `deco-sprites.json` | `exportScene()` |

## 修改默认值的方式

**不要直接修改 JS 代码中的硬编码值**，而是修改 `editor/config/` 下对应的 JSON 文件。例如：

- 想修改默认背景色：编辑 `editor-defaults.json` 的 `scene.backgroundColor`
- 想添加新场景预设：在 `scene-presets.json` 的 `scenes` 中增加条目
- 想添加新场景模板：在 `scene-templates.json` 的 `templates` 中增加条目（或在编辑器里点「📐 场景模板 → + 新建模板」可视化编辑并自动写回）
- 想修改装饰物的精灵图坐标：编辑 `deco-sprites.json` 中对应的 sprite
- 想添加新图集：在 `atlases.json` 的 `atlases` 数组中追加

## 扩展新功能的方式

1. **新增渲染功能**：在 `SceneEditorCanvas.js` 中添加方法
2. **新增交互功能**：在 `SceneEditorInteraction.js` 中添加处理器
3. **新增图层操作**：在 `SceneEditorLayers.js` 中添加方法
4. **新增资源类型**：在 `SceneEditorAssets.js` 中扩展拖放和列表
5. **新增 UI 面板**：在 `SceneEditorUI.js` 中添加 HTML 和初始化逻辑
6. **如果需要全新的独立功能域**：创建新的 `SceneEditorXxx.js` 模块，在 `SceneEditor.js` 中实例化并挂载到 `this.xxx`

## 装饰物统一管理（type:'deco'）

### 数据统一
- 旧格式 `sceneData.decorations[]`（`{x, y, key, scale}`，底部中心锚点）已废弃
- 所有装饰物统一为 `type:'deco'` 对象存储在 `layer_deco.objects` 中
- 格式：`{type:'deco', decoKey, x, y, width, height, scale, name}`，锚点是**左上角**
- 场景加载时 `SceneEditorLayers.mergeDecorationsToLayer()` 会将旧 `decorations` 转换合并（仅在 layer_deco 中无 deco 对象时执行，避免重复）

### 锚点转换（编辑器 → 游戏）
- 编辑器存储：左上角锚点 `(x, y, width, height)`
- 游戏使用：底部中心锚点 `(x + width/2, y + height)`
- `Scene1Terrain._applySceneData()` 中自动转换

### 类型匹配
- 凡是涉及 `obj.type` 判断的位置（点击检测、缩放手柄、选中框、属性面板宽高显示），都需要包含 `|| obj.type === 'deco'`
- 批量操作（深度/去重）筛选时同时检查 `obj.decoKey`、`obj.sliceKey`、`obj.name` 三个字段，任一匹配即命中

### 游戏侧渲染策略（混合策略）
- **非碰撞装饰物**（`sprite.collide === false`，如 grass1、bush2/3/4）：预渲染到离屏缓存 `_groundDecoCache`，作为整体一次绘制，始终在最底层
- **碰撞装饰物**（`sprite.collide === true`，如 tree1/2/3）：参与 Y-sort，互相之间和与实体之间正确遮挡

## 图片资源管理

### 添加图片流程
1. 用户先将图片文件放到项目 `example/sanguo_zhangjiao/assets/images/` 目录下（支持子文件夹）
2. 在编辑器点"添加图片"，弹出输入框让用户填写 `assets/images/` 下的相对路径（如 `scene1/bg.png`）
3. 编辑器用相对路径直接加载图片，场景数据 `imageAssets[id]` 中只存路径字符串
4. **不使用 base64/dataURL** — 避免 JSON 膨胀和 localStorage 配额溢出

### imageAssets 清理
- `SceneEditorHistory.save()` 保存前自动调用 `_cleanupImageAssets()`
- 遍历所有图层对象，收集实际引用的 `imageId`，删除未引用的 `imageAssets` 条目
- 如果 imageAssets 清空则删除整个字段

### 游戏侧加载图片
- `Scene1Terrain._applySceneData()` 第3步读取 `type:'image'` 对象
- 从 `scene.imageAssets[obj.imageId].src` 获取路径
- **路径修正**：编辑器路径（如 `../example/sanguo_zhangjiao/assets/images/x.png`）→ 游戏路径（`assets/images/x.png`），通过截取 `assets/` 之后的部分实现

## 场景模板机制（多套可复用模板）

### 概念分层（三者各司其职，勿混淆）
```
editor-defaults.json.scene   →  无模板时的最小空场景兜底（保留）
scene-templates.json         →  多套可命名、可复用的完整初始模板（新建时套用）
游戏 localStorage / *.json    →  由模板生成的具体场景实例
```
- `scene-presets.json`：三国 demo 里**已有的具体场景**（scene_Prologue 等），是实例配置，不是通用模板。

### 核心设计：模板 scene 与真实场景 JSON 同构
每个模板的 `scene` 字段结构 = 一份完整场景 JSON 的子集。带来两个好处：
1. **新建**只需深拷贝 `template.scene` + 分配新 id/name，无转换逻辑
2. **编辑**模板时直接把 `template.scene` 丢给场景编辑器打开，复用全部图层/椭圆/装饰/对象能力

### 新建流程（应用模板）
1. 新建场景弹窗有「场景模板」下拉（`#scene-template`），选项来自 `scene-templates.json`，默认选 `defaultTemplateId`
2. 切换下拉 → `onSceneTemplateChange()` 显示描述并把模板宽高/背景色回填表单（用户仍可改）
3. `createScene()` 把 `templateId` 传给 `EditorDataManager.createScene(gameId, {templateId,...})`：
   - 深拷贝模板 `scene` 作为初始内容 → 覆盖用户填的 name/宽高/背景色 → 生成新 id + createdAt
   - 无 templateId 时回退最小空场景（不破坏旧行为）

### 模板编辑入口（复用场景编辑器，零新增编辑器 UI）
入口有两个（管理弹窗已废弃删除）：
1. **筛选下拉选「场景模板」**（`#scene-filter-type` 的 `value="template"`）→ `renderSceneList()` 检测到该值时**只渲染模板项**（`_buildTemplateSectionHtml()`），每项含「编辑/×删除」+ 顶部「＋」新建
2. **场景侧栏底部「+ 新建场景模板」按钮**（`#new-template-btn`）→ `createNewTemplate()`（任意视图下都能快速新建）

- 点模板项/「编辑」→ `editSceneTemplate(id)`：进入**模板编辑态**（设 `this._editingTemplateId`，`currentSceneId=null`），用模板 `scene` 调 `sceneEditor.loadScene()`
- **保存分支**：`saveScene(data)` 检测到 `_editingTemplateId` 时 → `dataManager.upsertSceneTemplate(id, data)` 更新内存配置 → `_saveTemplatesToFile()` 通过 `/api/save-file` 写回 `editor/config/scene-templates.json`；**不**写游戏场景/触发器
- 编辑普通场景时 `editScene()` 会 `this._editingTemplateId = null` 退出模板态，两条保存路径互不干扰

### 关键坑 1：模板编辑态改名不保存
编辑器改场景名走 `onSceneMetaChange({name})` → `_handleSceneMetaChange(meta)`，但该方法开头有 `if (!this.currentGameId || !this.currentSceneId) return;`。模板态下 `currentSceneId=null` 会直接 return，名称改动丢失。
**修复**：`_handleSceneMetaChange` 开头加模板态分支 → `dataManager.updateSceneTemplateMeta(id, {name})`（**只**改元信息、不动 scene）+ `_saveTemplatesToFile()`。
配套：`upsertSceneTemplate(id, sceneData, meta)` 加防御——**仅当 `sceneData` 非空时才覆盖 `tpl.scene`**，否则"只改名"会把整个 scene 清空。

### 关键坑 2：模板项复用 `scene-item` class 导致双绑定/拖拽污染
模板项若带 `scene-item` class，会被普通场景的点击处理器和拖拽排序处理器一并选中：① 双重绑定点击（模板点击 + 场景点击，后者拿到 undefined sceneId）；② 能被拖进场景排序，`_scene_order` 里被塞入 `undefined`。
**修复**：模板项用 `scene-item template-item` 双 class，场景侧所有处理器的选择器改为 `.scene-item:not(.template-item)`；模板项点击单独由 `_bindTemplateItems()` 绑定（`data-tpl-action`）。

### 关键坑 3：模板资源库缺少新加的图片
`loadScene` 内部只 `_mergeGlobalImages()`（全局 `images.json`），但**新加的图片常只存在于某个场景自己的 `imageAssets`（localStorage），未写进全局库**。模板 `scene` 没有 per-scene imageAssets，于是缺图。
**修复**：`editSceneTemplate` 打开模板前用 `_collectAllSceneImages()` 聚合当前游戏**所有场景**的 `imageAssets` 塞进 `sceneToLoad.imageAssets`（`loadScene` 再叠加全局库）→ 模板资源库 = 所有场景图片 ∪ 全局库，与其他场景一致。保存时 `_cleanupImageAssets` 自动裁掉未使用且非全局的条目，模板不被撑大。

### EditorDataManager 模板相关方法
| 方法 | 作用 |
|------|------|
| `getSceneTemplates()` | 返回 `{ defaultTemplateId, templates }` |
| `getSceneTemplate(id)` | 按 id 取单个模板 |
| `getSceneTemplatesConfig()` | 取完整配置对象（用于写回文件） |
| `createScene(gameId, {templateId,...})` | 按模板深拷贝生成新场景实例 |
| `upsertSceneTemplate(id, sceneData, meta)` | 更新/新增模板的 scene（剥离 id/时间戳等实例字段；`sceneData` 为空时只更新 meta 不动 scene） |
| `updateSceneTemplateMeta(id, meta)` | 只改模板 name/description/category，不动 scene（用于编辑器内改模板名） |
| `createSceneTemplate({name, baseTemplateId})` | 克隆基模板新建模板 |
| `deleteSceneTemplate(id)` | 删除模板（default 被删时回退首个） |

### index.html 侧模板相关方法
| 方法 | 作用 |
|------|------|
| `populateSceneTemplates()` / `onSceneTemplateChange()` | 新建弹窗模板下拉填充/切换回填宽高背景色 |
| `_buildTemplateSectionHtml()` / `_bindTemplateItems(list)` | 「场景模板」筛选视图的列表 HTML 与事件绑定 |
| `editSceneTemplate(id)` | 进入模板编辑态并加载到场景编辑器 |
| `createNewTemplate()` / `deleteTemplate(id)` | 新建/删除模板 |
| `_collectAllSceneImages(base)` | 聚合所有场景 imageAssets（模板资源库图片一致性） |
| `_saveTemplatesToFile()` | 写回 `editor/config/scene-templates.json` |

### 数据一致性
模板的唯一真实数据源是 `editor/config/scene-templates.json`。任何模板增删改都通过 `_saveTemplatesToFile()` 写回该文件（内存 `_sceneTemplatesConfig` 同步更新）。新增内置模板直接编辑此 JSON 即可，编辑器启动时 `loadSceneTemplatesConfig()` 加载。

## 场景保存机制

### 双重保存
- **localStorage**：`EditorDataManager.updateScene()` 写入，游戏联动实时生效
- **JSON 文件**：通过 Vite dev server `/api/save-file` 接口写入 `example/sanguo_zhangjiao/assets/scenes/{场景名}.json`，用于安卓打包 fallback

### Vite dev server API 端点
- `GET /api/read-file?path=xxx` — 读取文件内容
- `POST /api/save-file` — 写入文本文件（JSON）
- `GET /api/list-files?path=xxx` — 列出目录内容

## 性能优化（游戏侧 Scene1Terrain）

### 离屏缓存策略
| 缓存 | 内容 | 构建时机 |
|------|------|---------|
| `_grassCanvas` | 椭圆草地铺面纹理 | 首次渲染且图集加载完成后 |
| `_groundDecoCache` | 所有非碰撞装饰物（草/灌木） | 图集加载完成后 |
| `_bgImageCache` | 编辑器背景图片合并 | 所有背景图加载完成后 |
| `_combinedGroundCache` | 上述全部合并（森林环带+草地+水池+背景图） | 所有资源就绪后 |

### 合并地面缓存（`_buildCombinedGroundCache`）
- 将森林环带、草地铺面、水池、背景图片全部渲染到一张离屏 Canvas
- 构建成功后 `renderGround()` 每帧只需 1 次 `drawImage`（之前需要 4-5 次大面积绘制）
- 限制缓存 Canvas 尺寸不超过 4096×4096

### collectDecorations 优化
- 非碰撞装饰物：从缓存图一次性绘制（1 次 draw call 替代 200+ 次）
- 碰撞装饰物（树）：逐个参与 Y-sort renderQueue（数量少，通常几十棵）

## 地形椭圆（可编辑对象 type:'ellipse'）

### 概述
序章等户外场景的“盆地草地椭圆”以前是编辑器里由 `_renderTerrainBackground()` 自动画的固定背景，不可交互。现已改为**可编辑对象** `type:'ellipse'`，存放在 `layer_fill`（背景填充层）中，可添加、删除、移动、缩放、改颜色。

### 编辑器侧改动位置
- **SceneEditorUI.js**：工具栏新增“⬭”按钮；`updateObjectProperties()` 支持 ellipse 宽高；新增 `_buildEllipseProperties()`（名称/填充色/透明度/边框色/边框宽）
- **SceneEditor.js**：`editor-add-ellipse` 按钮事件；`_ensureTerrainEllipse()` 在 `loadScene()` 时把旧 terrain 椭圆转换为 ellipse 对象（仅当 layer_fill 无 ellipse 时执行，避免重复）
- **SceneEditorCanvas.js**：`_renderEllipseObject()` 渲染椭圆；`_renderTerrainBackground()` 对非 indoor 场景不再自动画椭圆（交给对象渲染）；`_renderTerrainMask()` 优先从 layer_fill 的 ellipse 对象读参数；选中框/`_renderObject` 支持 ellipse
- **SceneEditorInteraction.js**：`getObjectAt()` 用椭圆方程 `(dx/rx)²+(dy/ry)²<=1` 做命中检测；`getResizeHandleAt()` 支持 ellipse

### 关键坑：图层锁定导致选不中
`getObjectAt()` 会跳过 `locked` 或不可见图层：`if (!layer || layer.locked || !layer.visible) continue;`。
旧场景数据里 `layer_fill` 常是 `locked:true`（以前椭圆是纯背景不需交互）。椭圆变可编辑后必须解锁——`_ensureTerrainEllipse()` 添加椭圆时会自动 `fillLayer.locked = false`。

### 坐标换算（编辑器 ↔ 游戏）
- 编辑器椭圆用**左上角锚点** `(x, y, width, height)`；中心 = `(x+width/2, y+height/2)`，半径 = `width/2, height/2`
- 游戏侧 `Scene1Terrain` 的 `centerY` 比编辑器椭圆中心**多 32 像素**（编辑器里草地视觉中心上移了 32：`centerY = data.centerY - 32`）。互转时注意 ±32。
- 椭圆半径转盆地半径时有 20px 余量：编辑器 `radiusX = basinRadius + 20`，游戏侧反推 `basinRadiusX = rx - 20`。

## 图层可见性/锁定对游戏的影响

游戏侧 `Scene1Terrain._applySceneData()` 遍历图层时**必须检查 `layer.visible === false` 跳过隐藏图层**，使编辑器隐藏的图层在游戏中也不渲染（装饰物、椭圆、背景图片三类收集都要判断）。

### 装饰物空数据的坑
不能用 `if (decorations.length > 0)` 判断是否覆盖装饰物（隐藏装饰层会导致回退到程序化默认树木）。应统计**编辑器中定义的装饰物总数** `totalDecoDefined`（含隐藏图层），只要 `>0` 就以编辑器数据为准，这样隐藏装饰层后能真正清空，而“无编辑器数据”时仍保留程序化默认。

### 椭圆删除后游戏跟随变化
游戏侧用 `this._hasTerrainEllipse` 标记场景数据中是否存在椭圆：
- `_applySceneData()` 遍历时用 `foundEllipse` 记录，并清除 `_combinedGroundCache`/`_grassCanvas` 强制重建
- `renderGround()` 中 `_hasTerrainEllipse === false` 时跳过草地和森林环带，只保留水池和背景图片
- 注意用 `=== false` 判断：未定义（无编辑器 layers 数据）时视为正常渲染，不影响未编辑过的场景

## 地形椭圆的填充与特效（编辑器 + 游戏侧数据驱动）

### 编辑器侧
- 椭圆可从左侧资源库「地形椭圆」项拖入（`SceneEditorAssets.js` 的 drop 处理 `id==='ellipse'`，放入 layer_fill 并解锁）
- 椭圆填充模式 `fillMode`：`color`（纯色 fill）/ `image`（imageSrc + imageMode）/ `slice`（atlasId+sliceKey 或 decoKey + sliceMode）
- 切片填充：在左侧资源库选中切片（`editor.selectedSlice`）后点属性面板「用选中切片填充」按钮
- 边缘淡化 `edgeFade`（0~1）：`SceneEditorCanvas._renderEllipseObject()` 用 `destination-out` 椭圆径向渐变从内向外擦除
- 渲染辅助：`_drawImageInBox`（stretch/cover/contain/tile）、`_drawSliceInBox`（tile/stretch）、`_getEllipseSliceSource`

### 游戏侧（Scene1Terrain）——已删除写死的 mountain 草地/森林环带渲染
- **已删除**：`_renderForestRing()`（写死森林环带）、`_renderGrassFill()`（写死 mountain 贴图草地）及 `_grassCanvas`
- **改为数据驱动**：`_terrainEllipse` 保存椭圆填充数据，`_renderTerrainEllipse(ctx)` 按 fillMode + edgeFade 渲染（移植自编辑器逻辑，带 `_drawImageInBox`/`_drawSliceTiled`）
- `_buildTerrainEllipseFromObject(obj, scene, cx, cy, rx, ry)`：从编辑器椭圆对象解析填充数据；image 模式加载图片（路径截取 `assets/` 之后），slice 模式从 `scene.atlases` 或 `decoSprites` 解析切片坐标，图集图用 `this.images.mountain`
- `_ensureTerrainEllipseData()`：**无编辑器椭圆时的兜底**，用 terrain 配置（basinRadius + grassTile 切片）生成默认椭圆（slice 平铺 + edgeFade=0.28 模拟原森林环带过渡）。这不是写死渲染，而是数据驱动的默认值
- `renderGround()`：`_hasTerrainEllipse===false` 不画草地；否则用合并缓存或 `_renderTerrainEllipse` + 水池 + 背景图
- `_buildCombinedGroundCache()`：合并 `_renderTerrainEllipse` + 水池 + 背景图（切片模式等 mountain 就绪，图片模式等图片 complete）

### 关键点
- 椭圆中心 `cy` = 编辑器椭圆中心 = 游戏 `centerY - 32`；渲染半径直接用椭圆 `width/2, height/2`（不减 20 余量，20 余量只用于碰撞/装饰的 basinRadiusX/Y）
- 森林环带的边缘过渡效果现由椭圆 `edgeFade` 替代
- 改椭圆填充/特效后清 `_combinedGroundCache = null` 强制重建
