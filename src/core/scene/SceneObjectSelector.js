/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

export const SCENE_OBJECT_SELECTOR_MODES = Object.freeze(['id', 'group', 'tag', 'name', 'type', 'ref']);

function stringList(value) {
  const source = Array.isArray(value) ? value : [value];
  return [...new Set(source.flatMap(item => String(item ?? '').split(','))
    .map(item => item.trim()).filter(Boolean))];
}

export function sceneObjectSelectorValues(object, mode = 'auto') {
  if (!object) return [];
  const values = {
    id: stringList(object.id),
    group: stringList(object.group),
    tag: stringList(object.tags ?? object.tag),
    name: stringList(object.name),
    type: stringList(object.type),
    ref: stringList(object.ref)
  };
  if (SCENE_OBJECT_SELECTOR_MODES.includes(mode)) return values[mode];
  return [...new Set(SCENE_OBJECT_SELECTOR_MODES.flatMap(key => values[key]))];
}

export function normalizeSceneObjectSelector(selector = {}) {
  const requestedMode = selector.mode ?? selector.targetMode ?? 'auto';
  return {
    mode: SCENE_OBJECT_SELECTOR_MODES.includes(requestedMode) ? requestedMode : 'auto',
    value: String(selector.value ?? selector.target ?? '').trim(),
    sceneId: String(selector.sceneId ?? '').trim()
  };
}

export function sceneObjectMatchesSelector(object, selector = {}) {
  const normalized = normalizeSceneObjectSelector(selector);
  if (!object || !normalized.value) return false;
  if (normalized.sceneId && object.sceneId !== normalized.sceneId) return false;
  return sceneObjectSelectorValues(object, normalized.mode).includes(normalized.value);
}

export function resolveSceneObjects(objects = [], selector = {}) {
  const normalized = normalizeSceneObjectSelector(selector);
  if (!normalized.value) return [];
  return (objects || []).filter(object => sceneObjectMatchesSelector(object, normalized));
}

export default resolveSceneObjects;
