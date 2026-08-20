/************************************************************
 * 场景通用 Trigger action provider：只做依赖适配，不解释具体游戏剧情。
 ************************************************************/

/**
 * 注册可复用的场景动作；具体场景通过回调注入状态所有者。
 * @returns {string[]} 本次注册的 action 名称
 */
export function registerSceneTriggerActions(triggerSystem, {
  spawnPlacements,
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
  if (typeof weatherSystem?.setWeather === 'function') {
    register('setWeather', (params = {}) => {
      if (!params.type) return false;
      return weatherSystem.setWeather(params.type, params) !== false;
    });
  }
  if (typeof timeSystem?.setTimePeriod === 'function') {
    register('setTime', (params = {}) => {
      if (!params.period) return false;
      return timeSystem.setTimePeriod(params.period) !== false;
    });
  }
  register('completeScene', async (params = {}) => {
    const sceneId = params.sceneId || params.scene;
    if (!sceneId) {
      logger.warn?.('completeScene: 缺少 sceneId');
      return { ok: false, code: 'sceneIdRequired', committed: false };
    }
    const result = await triggerSystem.fireAndWait('sceneComplete', { sceneId });
    return result.ok
      ? { ok: true, committed: true }
      : { ok: false, code: 'sceneCompleteRejected', committed: false };
  });
  return registered;
}