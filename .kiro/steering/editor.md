---
inclusion: fileMatch
fileMatchPattern: 'editor/**'
---

# 游戏编辑器开发指南

## 1. 编辑器架构与数据约定

### 模块结构（editor/ 目录）
- `SceneEditor.js` — 场景编辑核心（图层管理、拖拽、选中、渲染、切片编辑）
- `EditorDataManager.js` — 游戏/场景数据管理（localStorage 读写）
- `SceneDataLoader.js` — 从预设加载场景，提供图集/切片数据
- `SceneDataExporter.js` — 把代码定义的场景转换成可编辑的 JSON 数据

### localStorage 存储键约定
- 场景数据：`h5game_editor_data_scenes_<gameId>`（值是场景对象数组）
- 游戏列表：`h5game_editor_games`
- 序章场景 id 固定为 `scene_Prologue`
- 内置游戏 id：`sanguo_zhangjiao`、`sanguo_zhangjiao_3d`

### 场景数据格式
- `decorations`：`{ x, y, key, scale }`，锚点是**底部中心**（用于 Y-sort）
- 装饰层 slice 对象：`{ type:'slice', atlasId, sliceKey, x, y, width, height }`，锚点是**左上角**
- `decoSprites`：切片配置 `{ sx, sy, sw, sh, scale, collide, colliderRadius }`
- `atlases`：图集定义（含 `id, name, path, width, height, slices`）
  - 切片 DOM 元素属性统一用 `data-atlas` / `data-slice`（不要用 `data-atlas-id` / `data-slice-key`）

### 图层约定
- 标准四层（从底到顶）：`layer_bg`（背景层）、`layer_mask`（遮罩层）、`layer_deco`（装饰层）、`layer_entity`（实体层）
- 序章地形渲染拆分：背景层画草地椭圆填充，遮罩层画森林环带大椭圆（渐变）
- 拖入的切片默认加入 `layer_deco`
- 选中/删除/拾取对象时要遍历**所有可见图层**，不能只看当前激活图层
- 右键物体弹出菜单：上移一层/下移一层、置于顶层/置于底层、删除（调整的是**同一图层内不同物体之间的前后层次**，不是跨图层移动）

### 物体层次（同图层内）渲染规则
- 图层 objects（拖入的切片）：按**数组顺序**渲染，数组靠后 = 绘制在上层；调整层次即调整数组位置
- 装饰物 decorations（地形树木等）：按 **Y 坐标排序**渲染（Y 越大越靠前/上层，符合 2.5D Y-sort）；调整层次通过微调/交换 Y 坐标实现

## 2. 编辑器与游戏的联动机制

### 数据流
- 游戏场景 `Act1SceneECS` 通过 `new Scene1Terrain(config)` 创建地形
- `Scene1Terrain` 的装饰物默认在构造函数里**程序化生成**
- 联动入口：`Scene1Terrain` 构造末尾调用 `_applyEditorOverrides(config)`
  - 从 localStorage 读取编辑器保存的场景数据
  - 用保存的 `decoSprites` 覆盖切片配置
  - 用保存的 `decorations` + 装饰层 slice 对象重建装饰物列表
  - 只有装饰物数量 > 0 时才覆盖，避免空数据清空整个场景
  - 覆盖后重置碰撞缓存（`this._treeColliders = null`）

### 锚点转换
- slice 对象（左上角锚点）转游戏装饰物（底部中心锚点）：
  - `x_game = x + width / 2`
  - `y_game = y + height`
  - `scale = width / sprite.sw`

### 布局一致性要求
- 编辑器导出器（`SceneDataExporter`）与游戏场景必须使用**相同的盆地参数**，否则装饰物布局不一致：
  - 中心点：`centerX: 350, centerY: 250`
  - 盆地半径：`basinRadius: 640`
  - Y 压缩比：`basinAspectY: 0.65`
- 这些参数与游戏 `Act1SceneECS` 的 `campfire` 位置（350, 250）对齐
