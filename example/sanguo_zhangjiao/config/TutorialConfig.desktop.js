/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 */

/**
 * TutorialConfig.desktop - 基础教程配置（桌面 / 键鼠版）
 *
 * 文案使用键盘按键措辞。移动版见 TutorialConfig.mobile.js。
 * 平台选择见 TutorialConfig.js（选择器）。
 */

export const TutorialConfigDesktop = {
  // 移动教程
  movement: {
    id: 'movement',
    title: '移动教程',
    description: '学习如何移动角色',
    steps: [
      {
        text: '使用WASD或方向键移动角色',
        position: 'top'
      }
    ],
    triggerConditionId: 'movement_trigger',
    completionConditionId: 'movement_complete',
    pauseGame: false,
    canSkip: false,
    priority: 10
  },

  // 拾取教程
  pickup: {
    id: 'pickup',
    title: '拾取教程',
    description: '学习如何拾取物品',
    steps: [
      {
        text: '靠近物品并按E键拾取',
        position: 'top'
      }
    ],
    triggerConditionId: 'pickup_trigger',
    completionConditionId: 'pickup_complete',
    pauseGame: false,
    canSkip: false,
    priority: 9
  },

  // 装备教程
  equipment: {
    id: 'equipment',
    title: '装备教程',
    description: '学习如何装备物品',
    steps: [
      {
        text: '打开背包（按 <span class="key">B</span>键），点击装备物品即可装备',
        position: 'top'
      }
    ],
    triggerConditionId: 'equipment_trigger',
    completionConditionId: 'equipment_complete',
    pauseGame: false,
    canSkip: false,
    priority: 8
  },

  // 战斗教程
  combat: {
    id: 'combat',
    title: '战斗教程',
    description: '学习如何战斗',
    steps: [
      {
        text: '使用技能栏（<span class="key">1</span> <span class="key">2</span> <span class="key">3</span> <span class="key">4</span>键 攻击敌人。注意生命值，低于30%时要小心',
        position: 'top'
      }
    ],
    triggerConditionId: 'combat_trigger',
    completionConditionId: 'combat_complete',
    pauseGame: false,
    canSkip: false,
    priority: 7
  }
};

export default TutorialConfigDesktop;
