# 双后端渲染架构（Canvas2D / three.js）

本目录实现 `IRenderBackend` 抽象及其 2D / 3D 两套具体实现。

## 文件组织

```
backends/
├── IRenderBackend.js        # 后端抽象基类
├── ICameraAdapter.js        # 相机适配器接口
├── IPicker.js               # 拾取接口
├── IParticleRenderer.js     # 粒子渲染器接口
├── BackendConfig.js         # 后端配置 & URL 参数解析
├── pickBackend.js           # 根据配置选择后端（含降级）
│
├── Canvas2DBackend.js       # Canvas 2D 后端（默认）
├── Camera2DAdapter.js       # 2D 相机适配器
├── Picker2D.js              # 2D 拾取器
├── ParticleRenderer2D.js    # 2D 粒子渲染器
│
├── ThreeBackend.js          # three.js 后端
├── Camera3DAdapter.js       # 3D 相机适配器（默认正交）
├── Picker3D.js              # 3D 拾取器（Raycaster）
├── ParticleRenderer3D.js    # 3D 粒子（THREE.Points）
├── EntityView3D.js          # ECS 实体 → Object3D 映射
└── Transform3DAdapter.js    # TransformComponent → three 坐标适配
```

## 启动方式

- `?mode=2d` 强制使用 Canvas2D
- `?mode=3d` 强制使用 three.js（WebGL 不可用时降级 2D）
- `?mode=auto`（默认）自动选择：WebGL 可用优先 3D

另外支持：

- `?debug=1`
- `?camera=ortho|perspective`
- `?pitch=30&yaw=45`

## 坐标约定（阶段 A 兼容期）

| 字段 | 含义 | 备注 |
|---|---|---|
| `position.x` | 水平（屏幕/世界一致） | |
| `position.y` | 地面深度 | 与 `position.z` 等价，为兼容旧代码保留 |
| `position.z` | 地面深度（新） | 值与 `position.y` 同步 |
| `position.elevation` | 离地高度 | 2D 后端映射为"屏幕 Y 上移"，3D 后端映射为 `mesh.position.y` |
| `transform.floorId` | 所属楼层 | 多层地图用 |

## 渲染分层

- **World sublayer**：`ground → decal → entity → aerial → effect`
  - 2D 后端：按桶分层绘制，`entity/decal/aerial` 内 Y-sort
  - 3D 后端：映射到 `Object3D.renderOrder`
- **Map floor**：按 `transform.floorId` 分组渲染
  - 2D：仅绘制当前层实体（可配 crossFloorAlpha 叠加相邻层）
  - 3D：独立 `THREE.Group`，非当前层可按配置半透明
- **Screen layer**：HUD / DOM 面板 / Modal 与后端无关

## 向后兼容

- 老场景（`render(ctx)` 签名）在 2D 后端下完全无感；3D 后端下 `SceneManager` 会自动把 HUD overlay 2D context 作为 ctx 传入
- 新场景可通过 `this.__dualBackendAware = true` 配合 `renderCommon(backend)` 使用双后端抽象
- `TransformComponent` 旧 `setPosition(x, y)` 调用完全兼容

## 降级链

`three` 初始化失败 → `pickBackend` 返回 `Canvas2DBackend`，游戏不阻塞。
