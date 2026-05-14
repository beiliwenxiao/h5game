/**
 * ProgressiveTipsConfig - 渐进式提示配置文件
 * 
 * 定义所有渐进式提示的配置信息，包括：
 * - 提示基本信息（标题、描述、文本）
 * - 触发条件ID（对应ProgressiveTipsConditions中的条件函数）
 * - 显示位置和优先级
 * - prerequisites: 前置提示数组，所有前置提示完成后才能执行本提示
 * - nextTip: 后续提示ID，本提示完成后执行
 * 
 * 提示流程：
 * 醒来 -> 移动 -> 发现火堆 -> 发现物品 -> 查看背包 -> 查看属性 
 * -> 使用消耗品 -> 关闭面板 -> 又发现物品 -> 装备物品 -> 查看装备
 */

export const ProgressiveTipsConfig = {
  // 1. 醒来（不显示火堆）
  progressive_tip_1: {
    id: 'progressive_tip_1',
    title: '提示',
    description: '你从黑暗中醒来',
    text: '你从黑暗中醒来,饥寒交迫。按任意键继续',
    position: 'center',
    priority: 100,
    triggerConditionId: 'progressive_tip_1_trigger',
    prerequisites: [],
    nextTip: 'progressive_tip_2'
  },

  // 2. 移动（火堆出现）
  progressive_tip_2: {
    id: 'progressive_tip_2',
    title: '提示',
    description: '四处走走看看',
    text: '四处走走。按<span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span>移动',
    position: 'center',
    priority: 99,
    triggerConditionId: 'progressive_tip_2_trigger',
    prerequisites: ['progressive_tip_1'],
    nextTip: 'progressive_tip_3'
  },

  // 3. 发现火堆
  progressive_tip_3: {
    id: 'progressive_tip_3',
    title: '提示',
    description: '发现火堆',
    text: '你发现一个熄灭的火堆。靠近并按<span class="key">E</span>键点燃火堆',
    position: 'center',
    priority: 98,
    triggerConditionId: 'progressive_tip_3_trigger',
    prerequisites: ['progressive_tip_2'],
    nextTip: 'progressive_tip_4'
  },

  // 4. 发现物品（点燃火堆后，只有残羹）
  progressive_tip_4: {
    id: 'progressive_tip_4',
    title: '提示',
    description: '发现物品',
    text: '点燃了篝火，你发现了一些物品。靠近物品，按<span class="key">E</span>键拾取',
    position: 'center',
    priority: 97,
    triggerConditionId: 'progressive_tip_4_trigger',
    prerequisites: ['progressive_tip_3'],
    nextTip: 'progressive_tip_5'
  },

  // 5. 查看背包（拾取1个物品后）
  progressive_tip_5: {
    id: 'progressive_tip_5',
    title: '提示',
    description: '查看背包',
    text: '物品到了背包里，查看一下背包，按<span class="key">B</span>键查看背包',
    position: 'center',
    priority: 96,
    triggerConditionId: 'progressive_tip_5_trigger',
    prerequisites: ['progressive_tip_4'],
    nextTip: 'progressive_tip_7'
  },

  // 6. 查看属性（打开背包后）
  // progressive_tip_6: {
  //   id: 'progressive_tip_6',
  //   title: '提示',
  //   description: '查看属性',
  //   text: '按 <span class="key">C</span> 查看属性',
  //   position: 'center',
  //   priority: 95,
  //   triggerConditionId: 'progressive_tip_6_trigger',
  //   prerequisites: ['progressive_tip_4'],
  //   nextTip: 'progressive_tip_5'
  // },

  // 7. 使用消耗品（查看属性后）
  progressive_tip_7: {
    id: 'progressive_tip_7',
    title: '提示',
    description: '使用消耗品',
    text: '你发现自己生命值很低。点击残羹使用，恢复生命值',
    position: 'center',
    priority: 94,
    triggerConditionId: 'progressive_tip_7_trigger',
    prerequisites: ['progressive_tip_5'],
    nextTip: 'progressive_tip_8'
  },

  // 7.1 关闭属性，关闭背包
  // progressive_tip_7_1: {
  //   id: 'progressive_tip_7_1',
  //   title: '提示',
  //   description: '关闭属性和背包',
  //   text: '再次按 <span class="key">C</span>关闭属性。再次按 <span class="key">B</span> 关闭背包',
  //   position: 'center',
  //   priority: 93,
  //   triggerConditionId: 'progressive_tip_7_1_trigger',
  //   prerequisites: ['progressive_tip_7'],
  //   nextTip: 'progressive_tip_8'
  // },

  // 8. 又发现物品（关闭面板后，2个装备）
  progressive_tip_8: {
    id: 'progressive_tip_8',
    title: '提示',
    description: '又发现了物品',
    text: '查看周围，你又发现了一些物品。靠近物品，按<span class="key">E</span>键拾取',
    position: 'center',
    priority: 90,
    triggerConditionId: 'progressive_tip_8_trigger',
    prerequisites: ['progressive_tip_7'],
    nextTip: 'progressive_tip_9'
  },

  // 9. 装备物品
  progressive_tip_9: {
    id: 'progressive_tip_9',
    title: '提示',
    description: '装备物品',
    text: '按 <span class="key">B</span> 打开背包，点击物品装备',
    position: 'center',
    priority: 80,
    triggerConditionId: 'progressive_tip_9_trigger',
    prerequisites: ['progressive_tip_8'],
    nextTip: 'progressive_tip_10'
  },

  // 10. 查看装备（装备2件物品后）
  progressive_tip_10: {
    id: 'progressive_tip_10',
    title: '提示',
    description: '查看装备',
    text: '按<span class="key">V</span>键查看装备',
    position: 'center',
    priority: 70,
    triggerConditionId: 'progressive_tip_10_trigger',
    prerequisites: ['progressive_tip_9'],
    nextTip: null
  },

  // 11. 按N键进入下一幕（野狗打完后）
  progressive_tip_11: {
    id: 'progressive_tip_11',
    title: '提示',
    description: '进入下一幕',
    text: '你击退了野狗。按<span class="key">N</span>键进入下一幕',
    position: 'center',
    priority: 60,
    triggerConditionId: 'progressive_tip_11_trigger',
    prerequisites: ['progressive_tip_10'],
    nextTip: null
  }
};

/**
 * 获取提示的前置提示列表
 * @param {string} tipId - 提示ID
 * @returns {string[]} - 前置提示ID数组
 */
export function getPrerequisites(tipId) {
  const tip = ProgressiveTipsConfig[tipId];
  return tip ? tip.prerequisites : [];
}

/**
 * 获取提示的后续提示
 * @param {string} tipId - 提示ID
 * @returns {string|null} - 后续提示ID
 */
export function getNextTip(tipId) {
  const tip = ProgressiveTipsConfig[tipId];
  return tip ? tip.nextTip : null;
}

/**
 * 检查前置提示是否全部完成
 * @param {string} tipId - 提示ID
 * @param {Object} completedTips - 已完成的提示对象 { tipId: true }
 * @returns {boolean}
 */
export function arePrerequisitesMet(tipId, completedTips) {
  const prerequisites = getPrerequisites(tipId);
  if (prerequisites.length === 0) return true;
  return prerequisites.every(prereq => completedTips[prereq] === true);
}

/**
 * 获取第一个提示ID（没有前置条件的提示）
 * @returns {string|null}
 */
export function getFirstTipId() {
  for (const tipId in ProgressiveTipsConfig) {
    if (ProgressiveTipsConfig[tipId].prerequisites.length === 0) {
      return tipId;
    }
  }
  return null;
}

export default ProgressiveTipsConfig;
