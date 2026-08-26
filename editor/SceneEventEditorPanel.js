/**
 * @deprecated 已迁移为 FlowGroupEditorPanel（保留一个版本兼容）
 * 新代码请直接 import { FlowGroupEditorPanel } from './FlowGroupEditorPanel.js'
 */
import {
  FlowGroupEditorPanel,
  SceneEventEditorPanel as _SceneEventEditorPanelAlias
} from './FlowGroupEditorPanel.js';

export { FlowGroupEditorPanel };
export const SceneEventEditorPanel = _SceneEventEditorPanelAlias || class extends FlowGroupEditorPanel {
  constructor(editor) { super(editor); }
};
export default SceneEventEditorPanel;
