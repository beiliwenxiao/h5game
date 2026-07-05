# 项目基本信息

## 项目概述

- **项目名称**: H5Game - 基于HTML5的游戏引擎
- **版本**: 1.0.0
- **作者**: 刘枭 (beiliwenxiao)
- **邮箱**: beiliwenxiao@qq.com
- **博客**: https://blog.csdn.net/beiliwenxiao
- **仓库**: 
  - https://github.com/beiliwenxiao/h5game
  - https://gitee.com/coderaaa/h5game
- **许可证**: MIT
- **交流QQ群**: 58607027

## 技术栈

### 核心技术
- **语言**: ES6+ JavaScript (ES Module)
- **构建工具**: Vite 5.x
- **测试框架**: Vitest 3.x + jsdom
- **渲染**: HTML5 Canvas 2D / three.js 3D (双渲染后端)
- **移动端**: Capacitor 6.x (Android打包)

### 依赖库
- `three`: 0.184.0 - 3D 渲染引擎
- `@capacitor/core`: 6.2.1 - 移动端桥接核心
- `@capacitor/android`: 6.2.1 - Android 平台支持
- `vitest`: 3.2.4 - 单元测试框架
- `vite`: 5.0.0 - 构建开发工具
- `jsdom`: 26.1.0 - DOM 模拟环境

## 架构设计

### 核心架构: ECS (Entity-Component-System)

项目采用 ECS 架构，实现高性能、模块化的游戏设计：

- **Entity (实体)**: 游戏对象的唯一标识
- **Component (组件)**: 纯数据容器，无逻辑
- **System (系统)**: 处理特定功能的逻辑单元

### 目录结构

```
src/
├── core/           # 核心引擎模块
│   ├── GameEngine.js       # 游戏引擎核心
│   ├── SceneManager.js     # 场景管理器
│   ├── InputManager.js     # 输入管理器
│   ├── AssetManager.js     # 资源管理器
│   ├── AudioManager.js     # 音频管理器
│   ├── PerformanceMonitor.js # 性能监控
│   ├── ObjectPool.js       # 对象池
│   ├── ErrorHandler.js     # 错误处理
│   ├── Logger.js           # 日志系统
│   └── PlatformProfile.js  # 平台检测
│
├── ecs/            # ECS 架构
│   ├── Entity.js           # 实体基类
│   ├── Component.js        # 组件基类
│   ├── EntityFactory.js    # 实体工厂
│   └── components/         # 组件定义
│
├── systems/        # 游戏系统 (30+ 系统)
│   ├── CombatSystem.js     # 战斗系统
│   ├── MovementSystem.js   # 移动系统
│   ├── EquipmentSystem.js  # 装备系统
│   ├── DialogueSystem.js   # 对话系统
│   ├── TutorialSystem.js   # 教程系统
│   ├── QuestSystem.js      # 任务系统
│   ├── ClassSystem.js      # 职业系统
│   ├── SkillTreeSystem.js  # 技能树系统
│   ├── ShopSystem.js       # 商店系统
│   ├── AISystem.js         # AI 行为系统
│   └── ...                 # 更多系统
│
├── rendering/      # 渲染系统
│   ├── RenderSystem.js     # 渲染系统
│   ├── Camera.js           # 相机系统
│   ├── ParticleSystem.js   # 粒子系统
│   ├── CombatEffects.js    # 战斗特效
│   ├── SkillEffects.js     # 技能特效
│   └── backends/           # 双渲染后端
│       ├── Canvas2DBackend.js  # 2D 渲染
│       └── ThreeBackend.js     # 3D 渲染
│
├── ui/             # UI 组件 (25+ 组件)
│   ├── DialogueBox.js      # 对话框
│   ├── InventoryPanel.js   # 背包面板
│   ├── PlayerInfoPanel.js  # 角色信息面板
│   ├── SkillTreePanel.js   # 技能树面板
│   ├── ShopPanel.js        # 商店面板
│   └── ...                 # 更多组件
│
├── scenes/         # 通用场景
│   ├── LoginScene.js       # 登录场景
│   ├── CharacterScene.js   # 角色选择场景
│   └── GameScene.js        # 游戏场景
│
├── network/        # 网络通信
│   ├── NetworkManager.js   # 网络管理器
│   ├── WebSocketClient.js  # WebSocket 客户端
│   └── MockWebSocket.js    # 模拟 WebSocket
│
└── data/           # 数据层
    ├── ItemData.js         # 物品数据
    └── EquipmentData.js    # 装备数据

example/
└── sanguo_zhangjiao/   # 三国张角序章 Demo
    ├── index.html          # 入口文件
    ├── assets/             # 资源文件
    ├── scenes/             # 场景 (Act1-6)
    ├── config/             # 配置文件
    ├── conditions/         # 条件函数
    ├── entities/           # 实体定义
    ├── data/               # 剧情数据
    └── PrologueManager.js  # 序章管理器

editor/                 # 地图编辑器
├── index.html          # 编辑器入口
├── SceneEditor.js      # 场景编辑器主入口
├── SceneEditorUI.js    # UI 模块
├── SceneEditorCanvas.js # 渲染模块
├── ...                 # 其他模块
└── config/             # 编辑器配置
```

## 核心系统清单

### 引擎核心 (core/)
| 系统 | 文件 | 说明 |
|------|------|------|
| GameEngine | GameEngine.js | 游戏引擎核心，管理游戏循环 |
| SceneManager | SceneManager.js | 场景管理与切换 |
| InputManager | InputManager.js | 统一输入处理（键盘、鼠标、触摸） |
| AssetManager | AssetManager.js | 资源加载与管理 |
| AudioManager | AudioManager.js | 音频播放与管理 |
| PerformanceMonitor | PerformanceMonitor.js | 性能监控 |
| ObjectPool | ObjectPool.js | 对象池，减少 GC 压力 |
| ErrorHandler | ErrorHandler.js | 错误处理 |
| Logger | Logger.js | 日志系统 |
| PlatformProfile | PlatformProfile.js | 平台检测 (桌面/移动) |
| UIClickHandler | UIClickHandler.js | UI 点击事件处理 |

### 游戏系统 (systems/)
| 系统 | 文件 | 说明 |
|------|------|------|
| CombatSystem | CombatSystem.js | 战斗系统 |
| MovementSystem | MovementSystem.js | 移动系统 |
| EquipmentSystem | EquipmentSystem.js | 装备系统 |
| DialogueSystem | DialogueSystem.js | 对话系统 |
| TutorialSystem | TutorialSystem.js | 教程系统 |
| QuestSystem | QuestSystem.js | 任务系统 |
| ClassSystem | ClassSystem.js | 职业系统 |
| SkillTreeSystem | SkillTreeSystem.js | 技能树系统 |
| ShopSystem | ShopSystem.js | 商店系统 |
| AISystem | AISystem.js | AI 行为系统 |
| AttributeSystem | AttributeSystem.js | 属性系统 |
| ElementSystem | ElementSystem.js | 元素系统 |
| EnhancementSystem | EnhancementSystem.js | 强化系统 |
| TalentSystem | TalentSystem.js | 天赋系统 |
| UnitSystem | UnitSystem.js | 兵种系统 |
| NPCSystem | NPCSystem.js | NPC 系统 |
| NPCRecruitmentSystem | NPCRecruitmentSystem.js | NPC 招募系统 |
| StatusEffectSystem | StatusEffectSystem.js | 状态效果系统 |
| FlightSystem | FlightSystem.js | 飞行系统 |
| DungeonSystem | DungeonSystem.js | 副本系统 |
| TeamSystem | TeamSystem.js | 组队系统 |
| FriendSystem | FriendSystem.js | 好友系统 |
| ChatSystem | ChatSystem.js | 聊天系统 |
| GuildSystem | GuildSystem.js | 公会系统 |
| PVPSystem | PVPSystem.js | PVP 系统 |
| LootSystem | LootSystem.js | 掉落系统 |
| PickupSystem | PickupSystem.js | 拾取系统 |
| MapSystem | MapSystem.js | 地图系统 |
| EventSystem | EventSystem.js | 事件系统 |
| ProgressManager | ProgressManager.js | 进度管理 |

### UI 组件 (ui/)
| 组件 | 文件 | 说明 |
|------|------|------|
| DialogueBox | DialogueBox.js | 对话框 |
| InventoryPanel | InventoryPanel.js | 背包面板 |
| PlayerInfoPanel | PlayerInfoPanel.js | 角色信息面板 (装备栏) |
| AttributePanel | AttributePanel.js | 属性面板 |
| SkillTreePanel | SkillTreePanel.js | 技能树面板 |
| ShopPanel | ShopPanel.js | 商店面板 |
| QuestPanel | QuestPanel.js | 任务面板 |
| Minimap | Minimap.js | 小地图 |
| HealthBar | HealthBar.js | 血条 |
| ManaBar | ManaBar.js | 蓝条 |
| SkillBar | SkillBar.js | 技能栏 |
| BottomControlBar | BottomControlBar.js | 底部控制栏 (移动端) |
| TutorialTooltip | TutorialTooltip.js | 教程提示 |
| FloatingText | FloatingText.js | 飘字 |
| NotificationSystem | NotificationSystem.js | 通知系统 |

## 开发命令

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器 (端口 3000)
npm run build        # 构建生产版本
npm test             # 运行单元测试
```

## 性能目标

- **帧率**: 60 FPS (稳定)
- **实体数量**: 100+ 同时在线
- **内存使用**: < 100MB

## 渲染模式

支持双渲染后端，通过 URL 参数切换：

- `?mode=2d` - Canvas 2D 渲染（默认）
- `?mode=3d` - three.js 3D 渲染
- `?mode=auto` - 自动选择

## 控制方式

### 键盘 (桌面)
| 按键 | 功能 |
|------|------|
| W/A/S/D 或 方向键 | 移动 |
| E | 拾取物品 |
| C | 属性/装备面板 |
| B | 背包 |
| 空格 | 攻击 |
| 1-4 | 使用技能 |
| N | 下一幕 (测试用) |

### 鼠标
- 左键点击：移动到目标位置
- 右键点击：选择目标

### 触屏 (移动端)
- 虚拟摇杆：移动
- 技能按钮：释放技能
- 交互按钮：拾取/交互

## 示例项目

`example/sanguo_zhangjiao/` - 三国张角序章

包含六幕剧情：
1. **第一幕 - 绝望的开始**: 角色创建、教程、战斗
2. **第二幕 - 符水救灾**: 加入黄巾军，学习新技能
3. **第三幕 - 铜钱法器**: 获取铜钱剑
4. **第四幕 - 职业选择**: 职业选择、技能树
5. **第五幕 - 四场战斗**: 大规模战役
6. **第六幕 - 结局**: 最终决战、结局分支

## 调试模式

BaseGameScene 有 `this.debugMode` 属性（默认 false）

开启方式：控制台执行 `sceneManager.getCurrentScene().debugMode = true`

调试功能：
- 红色十字：鼠标屏幕位置
- 蓝色方块：玩家位置
- 坐标标签：详细坐标信息
- 控制台输出：详细日志

## 特殊约定

1. **装备栏**: 在 zhangjiao demo 中，装备栏指 PlayerInfoPanel
2. **desktop 目录**: 打包为 exe 用，修改功能时不要管
3. **测试文件**: 所有测试用 .html 文件放在 test 文件夹
4. **文档文件**: 所有 .md 文档放在 docs 文件夹
