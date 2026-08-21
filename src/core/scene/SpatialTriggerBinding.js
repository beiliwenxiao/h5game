import { cloneCanonicalValue, deepFreeze } from '../CanonicalSnapshot.js';
import { normalizeSceneObjectSelector } from './SceneObjectSelector.js';

const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));

/** 将场景 trigger 对象投影为不含行为目标副本和运行态的空间 binding。 */
export function createSpatialTriggerBinding(source = {}) {
  if (!source || source.type !== 'trigger') throw new TypeError('Spatial trigger binding requires type="trigger"');
  const selector = normalizeSceneObjectSelector(source.selector || {
    mode: source.targetMode,
    value: source.target,
    sceneId: source.sceneId
  });
  const binding = {
    id: String(source.id || '').trim(),
    type: 'trigger',
    triggerId: String(source.triggerId || '').trim(),
    sceneId: String(source.sceneId || '').trim(),
    selector,
    ...(finite(source.x) ? { x: Number(source.x) } : {}),
    ...(finite(source.y) ? { y: Number(source.y) } : {}),
    ...(finite(source.width) ? { width: Number(source.width) } : {}),
    ...(finite(source.height) ? { height: Number(source.height) } : {}),
    ...(finite(source.radius) ? { radius: Number(source.radius) } : {}),
    ...(finite(source.pointerRadius) ? { pointerRadius: Number(source.pointerRadius) } : {}),
    ...(finite(source.anchorOffsetX) ? { anchorOffsetX: Number(source.anchorOffsetX) } : {}),
    ...(finite(source.anchorOffsetY) ? { anchorOffsetY: Number(source.anchorOffsetY) } : {}),
    ...(typeof source.prompt === 'string' ? { prompt: source.prompt } : {}),
    ...(source.activeWhen && typeof source.activeWhen === 'object'
      ? { activeWhen: cloneCanonicalValue(source.activeWhen) }
      : {})
  };
  return deepFreeze(binding);
}

export default createSpatialTriggerBinding;