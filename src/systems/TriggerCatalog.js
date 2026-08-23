const CORE_EVENTS = [
  ['sceneEnter', '进入场景'], ['enterRegion', '进入区域'], ['dialogueEnd', '对话结束'],
  ['kill', '击杀敌人'], ['itemPickup', '拾取物品'], ['interact', '交互', true],
  ['questComplete', '任务完成'], ['questProgress', '任务进度'], ['flagChange', '变量变化'],
  ['timer', '定时器'], ['chunkEnter', '进入区块'], ['campfireLit', '火堆点燃'],
  ['waveCleared', '波次清空'], ['gatheringRisk', '采集风险'], ['playerMoved', '玩家移动'], ['panelOpen', '打开面板'],
  ['equipItem', '装备物品'], ['unequipItem', '卸下物品'], ['classSelected', '选择职业'],
  ['approach', '靠近', true], ['enter', '进入范围', true], ['leave', '离开范围', true],
  ['stand', '站立'], ['climb', '攀爬'], ['jump', '跳跃'], ['itemTransform', '物品转化'],
  ['sceneComplete', '场景完成']
].map(([value, label, spatial = false]) => Object.freeze({ value, v: value, label: `${label} ${value}`, spatial }));

const CORE_ACTIONS = [
  ['setVar', '设置变量'], ['addVar', '变量累加'], ['setFlag', '设置标记'], ['toggleFlag', '切换标记'],
  ['startDialogue', '开始对话'], ['teleportToChunk', '大地图传送'], ['switchScene', '切换场景'],
  ['loadRegion', '加载区域'], ['giveReward', '给予奖励'], ['heal', '治疗/恢复'],
  ['startQuest', '开始任务'], ['completeQuest', '完成任务'], ['showTip', '显示提示'],
  ['playSound', '播放音效'], ['playBgm', '播放BGM'], ['spawnEnemy', '生成敌人'], ['wait', '等待'],
  ['parallel', '并行执行'], ['battleWin', '战斗胜利'], ['battleLose', '战斗失败'],
  ['mount', '上载具/骑乘']
].map(([value, label]) => Object.freeze({ value, v: value, label: `${label} ${value}` }));

function mergeCatalog(core, extra = []) {
  const merged = new Map(core.map(item => [item.value, item]));
  for (const raw of extra || []) {
    const value = raw?.value || raw?.v || raw?.id;
    if (value) merged.set(value, { ...raw, value, v: value, label: raw.label || value });
  }
  return [...merged.values()];
}

export const getTriggerEvents = project => mergeCatalog(CORE_EVENTS, project?.triggerCatalog?.events);
export const getTriggerActions = project => mergeCatalog(CORE_ACTIONS, project?.triggerCatalog?.actions);
export const isSpatialTriggerEvent = (type, project = null) => getTriggerEvents(project).some(item => item.value === type && item.spatial);
export function summarizeTrigger(trigger, project = null) {
  if (!trigger) return '未找到行为定义';
  const names = new Map(getTriggerActions(project).map(item => [item.value, item.label.split(' ').slice(0, -1).join(' ') || item.value]));
  const actions = (trigger.do || []).map(item => names.get(item.action) || item.action || '?').join(' → ') || '无动作';
  return `${trigger.when?.type || '?'} · ${actions}${trigger.once ? ' · 一次' : ''}${trigger.cooldown ? ` · ${trigger.cooldown}s` : ''}`;
}
export function validateTriggerDefinition(trigger, project = null) {
  const errors = [];
  if (!trigger?.id || typeof trigger.id !== 'string') errors.push('id 必须是非空字符串');
  if (!trigger?.when?.type) errors.push('when.type 不能为空');
  if (!Array.isArray(trigger?.do)) errors.push('do 必须是数组');
  if (trigger?.coordination !== undefined) {
    const coordination = trigger.coordination;
    if (!coordination || typeof coordination !== 'object' || Array.isArray(coordination)) {
      errors.push('coordination 必须是对象');
    } else {
      if (typeof coordination.group !== 'string' || !coordination.group.trim()) {
        errors.push('coordination.group 必须是非空字符串');
      }
      if (coordination.priority !== undefined && !Number.isInteger(coordination.priority)) {
        errors.push('coordination.priority 必须是整数');
      }
      const policy = coordination.policy ?? 'broadcast';
      if (!['broadcast', 'firstSuccess'].includes(policy)) {
        errors.push('coordination.policy 仅允许 broadcast 或 firstSuccess');
      }
      if (policy === 'firstSuccess' && !coordination.group?.trim?.()) {
        errors.push('firstSuccess 必须声明 coordination.group');
      }
    }
  }
  const known = new Set(getTriggerActions(project).map(item => item.value));
  for (const [index, action] of (trigger?.do || []).entries()) if (!known.has(action?.action)) errors.push(`do[${index}].action 未登记: ${action?.action || ''}`);
  return errors;
}

export default { getTriggerEvents, getTriggerActions, isSpatialTriggerEvent, summarizeTrigger, validateTriggerDefinition };