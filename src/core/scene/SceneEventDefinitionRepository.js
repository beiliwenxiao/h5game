/**
 * @deprecated 2026-08: SceneEventDefinitionRepository 已重命名为 FlowGroupDefinitionRepository。
 * 本文件作为兼容别名转发导入，保留一个大版本（或到所有项目执行过一键迁移后）删除。
 *
 * 迁移方式：
 *   - 新代码: import { FlowGroupDefinitionRepository } from './FlowGroupDefinitionRepository.js'
 *   - 旧代码: import { SceneEventDefinitionRepository } from './SceneEventDefinitionRepository.js'
 *     两者返回的是同一个类，运行时行为完全一致。
 */
export {
  FlowGroupDefinitionRepository as SceneEventDefinitionRepository,
  FlowGroupDefinitionRepository as default,
  FlowGroupDefinitionRepository
} from './FlowGroupDefinitionRepository.js';
