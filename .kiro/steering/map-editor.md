---
inclusion: manual
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
