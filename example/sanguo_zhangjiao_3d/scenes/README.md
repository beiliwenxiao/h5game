# Prologue 场景说明

## 概述

本目录包含序章（Prologue）的所有场景类。重构后的场景采用配置驱动的方式，所有功能性代码都在核心系统中实现。

## 场景文件

### Act1SceneRefactored.js ✅ 推荐使用
- **状态**: 重构完成，配置驱动
- **特点**: 
  - 继承自 `Scene` 基类
  - 使用配置文件驱动
  - 所有功能通过核心系统实现
  - 代码简洁，易于维护

### Act1Scene.js ⚠️ 待废弃
- **状态**: 旧版本，包含功能性代码
- **问题**: 
  - 导入了已删除的系统
  - 包含大量功能性代码
  - 不符合配置驱动原则

### Act1SceneECS.js ⚠️ 待废弃
- **状态**: 旧版本，ECS实现但包含功能性代码
- **问题**: 
  - 导入了已删除的系统
  - 包含大量功能性代码
  - 不符合配置驱动原则

### PrologueScene.js
- **状态**: 基类，需要简化
- **用途**: 所有序章场景的基类

## 使用方法

### 1. 创建新场景

```javascript
import { Scene } from '../../core/Scene.js';
import MySceneConfig from '../config/MySceneConfig.js';

export class MyScene extends Scene {
  constructor(engine) {
    super(engine);
    this.config = MySceneConfig;
  }
  
  async init() {
    // 获取系统
    this.dialogueSystem = this.engine.getSystem('dialogue');
    this.tutorialSystem = this.engine.getSystem('tutorial');
    
    // 加载配置
    this.loadConfigurations();
    
    // 设置场景
    this.setupScene();
  }
  
  loadConfigurations() {
    // 加载对话
    for (const [id, data] of Object.entries(this.config.dialogues)) {
      this.dialogueSystem.registerDialogue(id, data);
    }
    
    // 加载教程
    for (const [id, data] of Object.entries(this.config.tutorials)) {
      this.tutorialSystem.registerTutorial(id, data);
    }
  }
  
  setupScene() {
    // 设置场景属性
    this.width = this.config.scene.width;
    this.height = this.config.scene.height;
    this.backgroundColor = this.config.scene.background.color;
  }
}
```

### 2. 配置文件结构

```javascript
// config/MySceneConfig.js
export default {
  scene: {
    width: 1600,
    height: 1200,
    background: {
      color: '#2a4a2a',
      image: null
    },
    playerSpawn: { x: 400, y: 300 }
  },
  
  npcs: [
    {
      id: 'npc_1',
      name: 'NPC名称',
      position: { x: 800, y: 400 },
      dialogueId: 'npc_1_intro'
    }
  ],
  
  dialogues: {
    'npc_1_intro': {
      startNode: 'start',
      nodes: {
        'start': {
          speaker: 'NPC名称',
          text: '对话内容',
          choices: [...]
        }
      }
    }
  },
  
  tutorials: {
    'tutorial_1': {
      id: 'tutorial_1',
      title: '教程标题',
      steps: [...]
    }
  },
  
  quests: [
    {
      id: 'quest_1',
      name: '任务名称',
      objectives: [...]
    }
  ]
};
```

### 3. 在引擎中注册场景

```javascript
// main.js
import { Act1Scene } from './prologue/scenes/Act1SceneRefactored.js';

const engine = new GameEngine();
const sceneManager = engine.sceneManager;

// 注册场景
sceneManager.registerScene('act1', new Act1Scene(engine));

// 切换到场景
sceneManager.switchTo('act1');
```

## 重构原则

### 1. 配置驱动
- 所有数据都在配置文件中
- 场景类只负责加载和协调

### 2. 系统复用
- 使用引擎提供的核心系统
- 不在场景中创建系统实例

### 3. 简洁代码
- 场景类应该简短（< 300行）
- 复杂逻辑在系统中实现

### 4. 清晰职责
- 场景：配置加载、实体创建、系统协调
- 系统：功能实现、状态管理、业务逻辑
- 配置：数据定义、参数设置

## 迁移指南

### 从旧场景迁移到新场景

1. **提取配置数据**
   - 将硬编码的数据移到配置文件
   - 包括对话、教程、任务、NPC等

2. **移除功能性代码**
   - 删除系统实现代码
   - 使用引擎提供的系统

3. **简化场景类**
   - 只保留初始化和协调代码
   - 删除业务逻辑

4. **更新导入**
   - 从核心目录导入系统
   - 导入配置文件

### 示例对比

**旧版本（不推荐）：**
```javascript
class OldScene {
  constructor() {
    // 创建系统实例
    this.dialogueSystem = new DialogueSystem();
    
    // 硬编码数据
    this.dialogues = {
      'intro': {
        text: '欢迎...'
      }
    };
    
    // 大量功能性代码
    this.handleDialogue() { ... }
    this.updateTutorial() { ... }
  }
}
```

**新版本（推荐）：**
```javascript
class NewScene extends Scene {
  constructor(engine) {
    super(engine);
    this.config = SceneConfig; // 配置文件
  }
  
  async init() {
    // 获取系统
    this.dialogueSystem = this.engine.getSystem('dialogue');
    
    // 加载配置
    this.loadDialogues();
  }
  
  loadDialogues() {
    for (const [id, data] of Object.entries(this.config.dialogues)) {
      this.dialogueSystem.registerDialogue(id, data);
    }
  }
}
```

## 注意事项

1. **向后兼容**: 重构后的场景提供了向后兼容支持，如果引擎中没有注册系统，会创建临时实例
2. **渐进式迁移**: 可以逐步迁移旧场景，不需要一次性全部重构
3. **测试验证**: 每次迁移后都要测试功能是否正常
4. **文档更新**: 及时更新相关文档

## 相关文档

- [重构计划](../../../docs/PROLOGUE_REFACTOR_PLAN.md)
- [重构指南](../../../docs/PROLOGUE_REFACTOR_GUIDE.md)
- [配置文件说明](../config/README.md)
- [ECS架构](../../../docs/QUICK_START_ECS.md)
