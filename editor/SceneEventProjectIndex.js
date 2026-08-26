/**
 * @deprecated 已迁移为 FlowGroupProjectIndex（保留一个版本兼容）
 * 新代码请直接 import { FlowGroupProjectIndex } from './FlowGroupProjectIndex.js'
 */
import {
  FlowGroupProjectIndex,
  SceneEventProjectIndex as _SceneEventProjectIndexAlias
} from './FlowGroupProjectIndex.js';

export { FlowGroupProjectIndex };
export const SceneEventProjectIndex = _SceneEventProjectIndexAlias || FlowGroupProjectIndex;
export default SceneEventProjectIndex;
