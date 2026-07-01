---
inclusion: manual
---

# 地图编辑器开发指南

## 概述

地图编辑器位于 `editor/` 目录下，所有默认值已外部化到 `editor/config/` 目录下的 JSON 文件中。修改配置时只需编辑对应的 JSON 文件，无需修改 JS 代码。

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
- `sceneNames` — 场景代码名 → 显示名称 的映射（如 `"PrologueScene": "序章 - 盆地营地"`）
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
// 1. 加载编辑器默认配置
import { loadEditorDefaults } from './SceneEditor.js';
await loadEditorDefaults();

// 2. 初始化数据管理器
import { editorDataManager } from './EditorDataManager.js';
await editorDataManager.init();

// 3. SceneDataLoader 自动在首次加载场景时初始化配置
```

## 编辑器主要模块

| 文件 | 职责 | 读取的 JSON 配置 |
|------|------|-----------------|
| `SceneEditor.js` | 场景编辑核心 | `editor-defaults.json` |
| `EditorDataManager.js` | 游戏/场景数据管理 | `builtin-games.json`, `scene-presets.json` |
| `SceneDataLoader.js` | 预设场景加载 | `scene-presets.json`, `deco-sprites.json`, `atlases.json` |
| `SceneDataExporter.js` | 场景数据导出 | `scene-presets.json`, `deco-sprites.json` |

## 修改默认值的方式

**不要直接修改 JS 代码中的硬编码值**，而是修改 `editor/config/` 下对应的 JSON 文件。例如：

- 想修改默认背景色：编辑 `editor-defaults.json` 的 `scene.backgroundColor`
- 想添加新场景预设：在 `scene-presets.json` 的 `scenes` 中增加条目
- 想修改装饰物的精灵图坐标：编辑 `deco-sprites.json` 中对应的 sprite
- 想添加新图集：在 `atlases.json` 的 `atlases` 数组中追加

## 当前开发计划（来自开发计划_2026_06_28.txt）

6. 地图编辑器，编辑时，所有默认值改为 json 值，保存在对应 json 文件里 ✅ 已完成
7. 地图编辑器，明确物体属于哪一个层；支持新建/删除/调整层遮挡关系
8. 地图编辑器，画笔工具：可到达区域、不可到达区域、增益(buff)区域、减益(debuff)区域
