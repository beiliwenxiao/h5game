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
import { EditorDataManager, loadBuiltinGamesConfig, loadScenePresetsConfig } from './EditorDataManager.js';

// 1. 并行加载所有配置
await Promise.all([
  loadEditorDefaults(),
  loadBuiltinGamesConfig(),
  loadScenePresetsConfig()
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
| `EditorDataManager.js` | `builtin-games.json`, `scene-presets.json` | `init()`, `getBuiltinGames()`, `getGameScenes()`, `setCurrentScene()` |
| `SceneDataLoader.js` | `scene-presets.json`, `deco-sprites.json`, `atlases.json` | `loadScene()`, `getScenePreset()` |
| `SceneDataExporter.js` | `scene-presets.json`, `deco-sprites.json` | `exportScene()` |

## 修改默认值的方式

**不要直接修改 JS 代码中的硬编码值**，而是修改 `editor/config/` 下对应的 JSON 文件。例如：

- 想修改默认背景色：编辑 `editor-defaults.json` 的 `scene.backgroundColor`
- 想添加新场景预设：在 `scene-presets.json` 的 `scenes` 中增加条目
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
