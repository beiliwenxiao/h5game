# 音频资源目录

此目录用于存放游戏的音频文件。

## 目录结构

```
audio/
  sfx/          # 音效文件
  music/        # 背景音乐
```

## 音效文件 (sfx/)

推荐的音效文件：

- `attack.mp3` - 普通攻击音效
- `skill_fire.mp3` - 火球术音效
- `skill_heal.mp3` - 治疗术音效
- `skill_frost.mp3` - 冰霜术音效
- `skill_arrow.mp3` - 箭雨音效
- `skill_shield.mp3` - 护盾音效
- `hit.mp3` - 受击音效
- `death.mp3` - 死亡音效
- `levelup.mp3` - 升级音效
- `coin.mp3` - 拾取金币音效
- `button_click.mp3` - 按钮点击音效
- `menu_open.mp3` - 菜单打开音效
- `menu_close.mp3` - 菜单关闭音效

## 背景音乐 (music/)

推荐的背景音乐：

- `menu.mp3` - 菜单背景音乐
- `battle.mp3` - 战斗背景音乐
- `victory.mp3` - 胜利音乐
- `defeat.mp3` - 失败音乐

## 音频规格建议

### 音效
- **格式**：MP3 或 OGG
- **时长**：1-3 秒
- **文件大小**：< 100KB
- **采样率**：44.1kHz
- **比特率**：128 kbps
- **声道**：单声道或立体声

### 背景音乐
- **格式**：MP3 或 OGG
- **时长**：2-5 分钟（循环）
- **文件大小**：< 5MB
- **采样率**：44.1kHz 或 48kHz
- **比特率**：192-256 kbps
- **声道**：立体声

## 免费音频资源网站

如果需要免费的游戏音频资源，可以访问以下网站：

- **Freesound** (https://freesound.org/) - 大量免费音效
- **OpenGameArt** (https://opengameart.org/) - 游戏音频和音乐
- **Incompetech** (https://incompetech.com/) - 免费背景音乐
- **Zapsplat** (https://www.zapsplat.com/) - 音效库
- **Bensound** (https://www.bensound.com/) - 免版税音乐

## 使用示例

```javascript
import { AssetManager } from './src/core/AssetManager.js';

const assetManager = new AssetManager();
const audioManager = assetManager.getAudioManager();

// 加载音效
audioManager.addSound('attack', 'assets/audio/sfx/attack.mp3');
audioManager.addSound('skill_fire', 'assets/audio/sfx/skill_fire.mp3');

// 加载背景音乐
audioManager.addMusic('menu', 'assets/audio/music/menu.mp3');
audioManager.addMusic('battle', 'assets/audio/music/battle.mp3');

// 播放音效
audioManager.playSound('attack');

// 播放背景音乐
audioManager.playMusic('menu', true); // 带淡入效果
```

## 注意事项

1. **浏览器自动播放限制**：现代浏览器通常会阻止自动播放音频，需要用户交互后才能播放
2. **文件格式兼容性**：建议同时提供 MP3 和 OGG 格式以确保跨浏览器兼容
3. **文件大小**：注意控制文件大小，避免影响游戏加载速度
4. **版权问题**：确保使用的音频文件有合法的使用权限


---

## 序章音频系统

### 当前状态

**注意：序章音频配置已完成，但实际音频文件待添加。**

序章音效系统已完全集成并配置，支持优雅降级：

- ✅ 音频配置已完成 (`src/prologue/data/AudioConfig.json`)
- ✅ AudioManager 已集成到 PrologueManager
- ✅ 场景音乐自动切换已实现
- ✅ 音效辅助方法已提供
- ⏳ 实际音频文件待添加

### 序章音乐列表

序章需要以下背景音乐：

- `prologue_theme.mp3` - 序章主题音乐（悲壮而充满希望）
- `battle_theme.mp3` - 战斗音乐（激昂的战斗旋律）
- `peaceful_theme.mp3` - 和平场景音乐（平和温暖）
- `epic_battle_theme.mp3` - 史诗战斗音乐（宏大史诗）
- `ending_theme.mp3` - 结局音乐（感人告别）

### 序章音效列表

序章需要以下音效（共 35 个）：

**战斗音效 (9个)**
- `attack_sword.mp3` - 剑类武器攻击
- `attack_bow.mp3` - 弓箭攻击
- `attack_magic.mp3` - 法术攻击
- `hit_normal.mp3` - 普通命中
- `hit_critical.mp3` - 暴击命中
- `player_hurt.mp3` - 玩家受伤
- `enemy_hurt.mp3` - 敌人受伤
- `player_death.mp3` - 玩家死亡
- `enemy_death.mp3` - 敌人死亡

**物品音效 (8个)**
- `pickup_item.mp3` - 拾取物品
- `pickup_coin.mp3` - 拾取货币
- `equip_item.mp3` - 装备物品
- `unequip_item.mp3` - 卸下装备
- `enhance_success.mp3` - 强化成功
- `enhance_fail.mp3` - 强化失败
- `shop_buy.mp3` - 购买物品
- `shop_sell.mp3` - 出售物品

**UI 音效 (7个)**
- `ui_click.mp3` - UI 点击
- `ui_hover.mp3` - UI 悬停
- `ui_open.mp3` - UI 面板打开
- `ui_close.mp3` - UI 面板关闭
- `dialogue_open.mp3` - 对话框打开
- `dialogue_close.mp3` - 对话框关闭
- `dialogue_text.mp3` - 对话文字显示

**游戏事件音效 (7个)**
- `skill_learn.mp3` - 学习技能
- `level_up.mp3` - 升级
- `quest_complete.mp3` - 任务完成
- `battle_start.mp3` - 战斗开始
- `battle_victory.mp3` - 战斗胜利
- `battle_defeat.mp3` - 战斗失败
- `general_appear.mp3` - 历史武将登场
- `npc_recruit.mp3` - NPC 招募
- `class_select.mp3` - 职业选择
- `prologue_complete.mp3` - 序章完成

**环境音效 (4个)**
- `footstep.mp3` - 脚步声
- `door_open.mp3` - 门打开
- `ambient_wind.mp3` - 环境音 - 风声
- `ambient_crowd.mp3` - 环境音 - 人群声

### 场景音乐映射

每一幕自动播放对应的背景音乐：

- **第一幕**（绝望的开始）: `prologue_theme`
- **第二幕**（符水救灾）: `peaceful_theme`
- **第三幕**（铜钱法器）: `peaceful_theme`
- **第四幕**（职业选择）: `peaceful_theme`
- **第五幕**（四场战斗）: `epic_battle_theme`
- **第六幕**（结局）: `ending_theme`

### 使用示例

```javascript
// 在序章场景中使用音效
class Act1Scene extends PrologueScene {
    enter(data) {
        super.enter(data);
        
        // 场景音乐会自动播放
        // 也可以手动播放音效
        this.prologueManager.playSound('battle_start');
    }
    
    onPlayerAttack() {
        // 播放攻击音效
        this.prologueManager.playSound('attack_sword');
    }
    
    onEnemyHit(isCritical) {
        // 播放命中音效
        if (isCritical) {
            this.prologueManager.playSound('hit_critical');
        } else {
            this.prologueManager.playSound('hit_normal');
        }
    }
}
```

### 详细使用指南

完整的序章音效使用指南请参考：`src/prologue/data/AUDIO_USAGE_GUIDE.md`

### 优雅降级

即使音频文件不存在，游戏也能正常运行：

- AudioManager 会在控制台输出警告
- 不会抛出错误或中断游戏
- 所有游戏逻辑正常执行

这样设计的好处是可以先完成游戏逻辑开发，后续再添加音频资源。
