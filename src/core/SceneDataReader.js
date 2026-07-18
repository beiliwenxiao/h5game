/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * SceneDataReader - 游戏运行时读取编辑器场景数据的公共工具
 *
 * 统一数据源：
 *   1. 优先从 localStorage 读取（浏览器编辑器联动）
 *   2. 回退到 assets/scenes/ 下的 JSON 文件（安卓打包后 fallback）
 *
 * localStorage key 格式：
 *   'yijian18-engine_editor_data_scenes_<gameId>'
 *   value = JSON 数组，每个元素是完整场景对象（含 id, layers, decorations 等）
 */

const STORAGE_KEY_PREFIX = 'yijian18-engine_editor_data_scenes_';

/**
 * 从 localStorage 同步读取指定场景数据
 * @param {string} gameId - 游戏 ID（如 'sanguo_zhangjiao'）
 * @param {string} sceneId - 场景 ID（如 'scene_Prologue'）
 * @returns {Object|null} 包含 layers 的完整场景对象，无有效数据时返回 null
 */
export function loadSceneFromStorage(gameId, sceneId) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + gameId);
    if (!raw) return null;
    const scenes = JSON.parse(raw);
    if (!Array.isArray(scenes)) return null;
    const found = scenes.find(s => s && s.id === sceneId);
    // 只有包含 layers 数据的场景才算有效编辑数据
    if (found && Array.isArray(found.layers) && found.layers.length > 0) {
      return found;
    }
  } catch (e) {
    console.warn('SceneDataReader: 读取 localStorage 场景数据失败', e);
  }
  return null;
}

/**
 * 检查 localStorage 中是否存在有效的场景编辑数据
 * @param {string} gameId - 游戏 ID
 * @param {string} sceneId - 场景 ID
 * @returns {boolean}
 */
export function hasSceneData(gameId, sceneId) {
  return loadSceneFromStorage(gameId, sceneId) !== null;
}

/**
 * 从 JSON 文件异步加载场景数据（localStorage 无数据时的 fallback）
 * @param {string} sceneId - 场景 ID
 * @param {string} [assetBase='assets/scenes/'] - 资源目录
 * @param {string} [fileName] - 指定文件名，不指定时自动推断
 * @returns {Promise<Object|null>} 场景对象或 null
 */
export async function loadSceneFromFile(sceneId, assetBase = 'assets/scenes/', fileName) {
  if (typeof fetch === 'undefined') return null;
  
  // 1. 如果明确指定了文件名，直接加载
  if (fileName) {
    return _fetchSceneFile(assetBase + encodeURIComponent(fileName).replace(/%2F/g, '/'), sceneId);
  }
  
  // 2. 尝试从 _scene_order.json 获取场景名称作为文件名
  const nameFromOrder = await _getSceneNameFromOrder(sceneId, assetBase);
  if (nameFromOrder) {
    const result = await _fetchSceneFile(assetBase + encodeURIComponent(nameFromOrder + '.json').replace(/%2F/g, '/'), sceneId);
    if (result) return result;
  }
  
  // 3. 回退到写死的文件名映射
  const defaultFile = _getSceneFileName(sceneId);
  return _fetchSceneFile(assetBase + encodeURIComponent(defaultFile).replace(/%2F/g, '/'), sceneId);
}

/**
 * 从 _scene_order.json 获取场景名称
 * @private
 */
async function _getSceneNameFromOrder(sceneId, assetBase) {
  try {
    const res = await fetch(assetBase + '_scene_order.json');
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.scenes && data.scenes[sceneId]) {
      return data.scenes[sceneId].name;
    }
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * 从指定路径 fetch 场景文件
 * @private
 */
async function _fetchSceneFile(jsonPath, sceneId) {
  try {
    const res = await fetch(jsonPath);
    if (!res.ok) return null;
    const data = await res.json();
    // 支持文件内容为单个场景对象或场景数组
    if (Array.isArray(data)) {
      return data.find(s => s && s.id === sceneId) || null;
    }
    if (data && data.id === sceneId) return data;
    // 文件内容无 id 字段或 id 不匹配时直接返回（单场景文件）
    if (data && typeof data === 'object' && (data.layers || data.decorations)) return data;
  } catch (e) {
    // 文件不存在或解析失败
  }
  return null;
}

/**
 * 完整加载流程：先 localStorage，再 fallback 到文件
 * @param {string} gameId - 游戏 ID
 * @param {string} sceneId - 场景 ID
 * @param {string} [assetBase='assets/scenes/'] - 资源目录
 * @param {string} [fileName] - 指定 fallback 文件名
 * @returns {Promise<Object|null>} 场景对象或 null
 */
export async function loadScene(gameId, sceneId, assetBase = 'assets/scenes/', fileName) {
  const scene = loadSceneFromStorage(gameId, sceneId);
  if (scene) return scene;
  return loadSceneFromFile(sceneId, assetBase, fileName);
}

/**
 * 场景 ID → 默认文件名映射
 * @private
 */
function _getSceneFileName(sceneId) {
  const fileNames = {
    's0-0': 's0-0.json',
    's0-1': 's0-1-火堆.json',
    'scene_Prologue': 's0-1-火堆.json',
    'scene_Act1': 's0-0.json'
  };
  return fileNames[sceneId] || (sceneId + '.json');
}
