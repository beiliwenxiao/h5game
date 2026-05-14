/**
 * Act1Config.js
 * 第一幕场景配置文件
 * 
 * 这个文件只包含数据和配置，不包含任何功能性代码
 */

/**
 * 场景基础配置
 */
export const Act1SceneConfig = {
  id: 'act1_scene',
  name: '第一幕：黄巾起义',
  description: '公元184年，太平道起义爆发',
  
  // 场景尺寸
  width: 1600,
  height: 1200,
  
  // 背景配置
  background: {
    color: '#2a4a2a',
    image: null // 可以添加背景图片路径
  },
  
  // 初始玩家位置
  playerSpawn: {
    x: 400,
    y: 300
  }
};

/**
 * NPC 配置
 */
export const Act1NPCConfig = [
  {
    id: 'zhang_jiao',
    name: '张角',
    title: '天公将军',
    position: { x: 800, y: 400 },
    dialogueId: 'zhang_jiao_intro',
    portrait: 'zhang_jiao_portrait'
  },
  {
    id: 'zhang_liang',
    name: '张梁',
    title: '地公将军',
    position: { x: 600, y: 400 },
    dialogueId: 'zhang_liang_intro',
    portrait: 'zhang_liang_portrait'
  },
  {
    id: 'zhang_bao',
    name: '张宝',
    title: '人公将军',
    position: { x: 1000, y: 400 },
    dialogueId: 'zhang_bao_intro',
    portrait: 'zhang_bao_portrait'
  }
];

/**
 * 对话配置
 * 这些配置会被加载到 DialogueSystem 中
 */
export const Act1DialogueConfig = {
  'zhang_jiao_intro': {
    title: '与张角对话',
    startNode: 'start',
    nodes: {
      'start': {
        speaker: '张角',
        text: '欢迎来到太平道。我是天公将军张角，你愿意加入我们，为天下苍生而战吗？',
        portrait: 'zhang_jiao_neutral',
        emotion: 'neutral',
        choices: [
          {
            text: '我愿意加入太平道',
            nextNode: 'accept'
          },
          {
            text: '让我再考虑考虑',
            nextNode: 'decline'
          }
        ]
      },
      'accept': {
        speaker: '张角',
        text: '很好！从今天起，你就是太平道的一员了。现在，让我的两位兄弟为你介绍我们的职业体系。',
        portrait: 'zhang_jiao_happy',
        emotion: 'happy',
        nextNode: null,
        action: (context) => {
          // 这里可以触发任务或其他事件
          context.questAccepted = true;
        }
      },
      'decline': {
        speaker: '张角',
        text: '没关系，当你准备好了，随时可以来找我。',
        portrait: 'zhang_jiao_neutral',
        emotion: 'neutral',
        nextNode: null
      }
    }
  },
  
  'zhang_liang_intro': {
    title: '与张梁对话',
    startNode: 'start',
    nodes: {
      'start': {
        speaker: '张梁',
        text: '我是地公将军张梁，擅长近战和防御。如果你想成为一名战士，我可以教你。',
        portrait: 'zhang_liang_neutral',
        choices: [
          {
            text: '我想学习战士技能',
            nextNode: 'learn_warrior'
          },
          {
            text: '我想了解其他职业',
            nextNode: 'other_classes'
          }
        ]
      },
      'learn_warrior': {
        speaker: '张梁',
        text: '战士是战场上的中流砥柱，拥有强大的生命值和防御力。你准备好接受训练了吗？',
        portrait: 'zhang_liang_happy',
        choices: [
          {
            text: '是的，我准备好了',
            nextNode: 'confirm_warrior',
            action: (context) => {
              context.selectedClass = 'warrior';
            }
          },
          {
            text: '让我再想想',
            nextNode: null
          }
        ]
      },
      'confirm_warrior': {
        speaker: '张梁',
        text: '很好！从现在开始，你就是一名战士了。记住，勇气和力量是战士的根本。',
        portrait: 'zhang_liang_happy',
        nextNode: null
      },
      'other_classes': {
        speaker: '张梁',
        text: '你可以去找我的兄弟们。张宝擅长远程攻击，张角精通法术。',
        portrait: 'zhang_liang_neutral',
        nextNode: null
      }
    }
  }
};

/**
 * 教程配置
 * 这些配置会被加载到 TutorialSystem 中
 */
export const Act1TutorialConfig = {
  'movement_tutorial': {
    id: 'movement_tutorial',
    title: '移动教程',
    description: '学习如何在游戏中移动',
    steps: [
      {
        text: '使用 WASD 键或方向键来移动你的角色',
        targetElement: null,
        highlightTarget: false,
        position: 'center'
      },
      {
        text: '试着移动到地图的不同位置',
        targetElement: null,
        highlightTarget: false,
        position: 'center'
      }
    ],
    triggerCondition: (gameState) => {
      return gameState.isFirstTime && !gameState.tutorialCompleted.includes('movement_tutorial');
    },
    autoTrigger: true,
    priority: 100,
    category: 'basic'
  },
  
  'dialogue_tutorial': {
    id: 'dialogue_tutorial',
    title: '对话教程',
    description: '学习如何与NPC对话',
    steps: [
      {
        text: '靠近NPC并点击他们来开始对话',
        targetElement: { x: 800, y: 400, width: 50, height: 50 },
        highlightTarget: true,
        position: 'bottom',
        arrowDirection: 'up'
      },
      {
        text: '在对话中，你可以选择不同的回答',
        targetElement: null,
        highlightTarget: false,
        position: 'center'
      }
    ],
    triggerCondition: (gameState) => {
      return gameState.tutorialCompleted.includes('movement_tutorial') && 
             !gameState.tutorialCompleted.includes('dialogue_tutorial');
    },
    autoTrigger: true,
    priority: 90,
    category: 'basic'
  },
  
  'class_selection_tutorial': {
    id: 'class_selection_tutorial',
    title: '职业选择教程',
    description: '选择你的职业',
    steps: [
      {
        text: '与三位将军对话，了解不同的职业',
        targetElement: null,
        highlightTarget: false,
        position: 'center'
      },
      {
        text: '战士：近战专家，高生命和防御',
        targetElement: { x: 600, y: 400, width: 50, height: 50 },
        highlightTarget: true,
        position: 'left',
        arrowDirection: 'right'
      },
      {
        text: '弓箭手：远程专家，高攻击和敏捷',
        targetElement: { x: 1000, y: 400, width: 50, height: 50 },
        highlightTarget: true,
        position: 'right',
        arrowDirection: 'left'
      },
      {
        text: '法师：魔法专家，强大的法术伤害',
        targetElement: { x: 800, y: 400, width: 50, height: 50 },
        highlightTarget: true,
        position: 'bottom',
        arrowDirection: 'up'
      }
    ],
    triggerCondition: (gameState) => {
      return gameState.questAccepted && !gameState.classSelected;
    },
    autoTrigger: true,
    priority: 80,
    category: 'class'
  }
};

/**
 * 任务配置
 */
export const Act1QuestConfig = [
  {
    id: 'join_taiping',
    name: '加入太平道',
    type: 'main',
    description: '与张角对话，加入太平道',
    shortDescription: '与张角对话',
    giverNPCId: 'zhang_jiao',
    turnInNPCId: 'zhang_jiao',
    minLevel: 1,
    objectives: [
      {
        id: 'talk_to_zhang_jiao',
        type: 'talk',
        targetId: 'zhang_jiao',
        targetName: '张角',
        requiredCount: 1,
        description: '与张角对话'
      }
    ],
    reward: {
      exp: 100,
      gold: 0,
      items: []
    }
  },
  
  {
    id: 'choose_class',
    name: '选择职业',
    type: 'main',
    description: '与三位将军对话，选择你的职业',
    shortDescription: '选择职业',
    giverNPCId: 'zhang_jiao',
    turnInNPCId: null,
    minLevel: 1,
    requiredQuests: ['join_taiping'],
    objectives: [
      {
        id: 'select_class',
        type: 'talk',
        targetId: null,
        targetName: '任意将军',
        requiredCount: 1,
        description: '选择一个职业'
      }
    ],
    reward: {
      exp: 200,
      gold: 50,
      items: []
    }
  }
];

/**
 * 渐进提示配置
 */
export const Act1ProgressiveTipsConfig = {
  tips: [
    {
      id: 'welcome_tip',
      text: '欢迎来到《三国志：黄巾起义》',
      duration: 3000,
      priority: 100,
      condition: (context) => context.isFirstTime
    },
    {
      id: 'movement_tip',
      text: '使用 WASD 或方向键移动',
      duration: 5000,
      priority: 90,
      condition: (context) => !context.hasMoved
    },
    {
      id: 'npc_interaction_tip',
      text: '点击 NPC 与他们对话',
      duration: 5000,
      priority: 80,
      condition: (context) => context.nearNPC && !context.hasInteracted
    }
  ]
};

/**
 * 导出所有配置
 */
export default {
  scene: Act1SceneConfig,
  npcs: Act1NPCConfig,
  dialogues: Act1DialogueConfig,
  tutorials: Act1TutorialConfig,
  quests: Act1QuestConfig,
  progressiveTips: Act1ProgressiveTipsConfig
};
