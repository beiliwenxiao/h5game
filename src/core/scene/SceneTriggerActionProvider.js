/************************************************************
 * 场景通用 Trigger action provider：只做依赖适配，不解释具体游戏剧情。
 ************************************************************/

/**
 * 注册可复用的场景动作；具体场景通过回调注入状态所有者。
 * @returns {string[]} 本次注册的 action 名称
 */
export function registerSceneTriggerActions(triggerSystem, {
  spawnPlacements,
  teleportToChunk,
  requestAutoSave,
  weatherSystem,
  timeSystem,
  logger = console
} = {}) {
  if (!triggerSystem?.registerAction) {
    throw new TypeError('registerSceneTriggerActions requires TriggerSystem');
  }
  const registered = [];
  const register = (name, handler) => {
    if (typeof handler !== 'function') return;
    triggerSystem.registerAction(name, handler);
    registered.push(name);
  };

  if (typeof spawnPlacements === 'function') {
    register('spawnPlacements', params => spawnPlacements(params?.selector || params));
  }
  if (typeof teleportToChunk === 'function') {
    register('teleportToChunk', params => teleportToChunk(params || {}));
  }
  if (typeof requestAutoSave === 'function') {
    register('autoSave', (params = {}) => requestAutoSave({
      reason: params.reason || 'story-event',
      checkpointId: params.checkpointId,
      sceneId: params.sceneId
    }));
  }
  if (typeof weatherSystem?.setWeather === 'function') {
    register('setWeather', (params = {}) => {
      if (!params.type) return false;
      weatherSystem.setWeather(params.type, params);
      return true;
    });
  }
  if (typeof timeSystem?.setTimePeriod === 'function') {
    register('setTime', (params = {}) => {
      if (!params.period) return false;
      timeSystem.setTimePeriod(params.period);
      return true;
    });
  }
  register('completeScene', (params = {}) => {
    const sceneId = params.sceneId || params.scene;
    if (!sceneId) {
      logger.warn?.('completeScene: 缺少 sceneId');
      return false;
    }
    triggerSystem.fire('sceneComplete', { sceneId });
    return true;
  });
  return registered;
}