/**
 * SceneEditorHistory - 场景编辑器撤销/重做/导入导出模块
 */
export class SceneEditorHistory {
  /**
   * @param {import('./SceneEditor.js').SceneEditor} editor - 主编辑器实例
   */
  constructor(editor) {
    this.editor = editor;
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = 50;
  }

  /**
   * 设置最大历史记录条数
   */
  setMaxSize(size) {
    this.maxSize = size;
  }

  /**
   * 保存历史状态
   */
  saveHistory() {
    const editor = this.editor;
    this.undoStack.push(JSON.stringify(editor.sceneData));
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
  }

  /**
   * 撤销
   */
  undo() {
    if (this.undoStack.length === 0) return;
    const editor = this.editor;
    this.redoStack.push(JSON.stringify(editor.sceneData));
    editor.sceneData = JSON.parse(this.undoStack.pop());
    editor.selectedObjects = [];
    editor.layers.updateLayerList();
    editor.ui.updateObjectProperties();
    editor.ui.updateObjectCount();
    editor.render();
  }

  /**
   * 重做
   */
  redo() {
    if (this.redoStack.length === 0) return;
    const editor = this.editor;
    this.undoStack.push(JSON.stringify(editor.sceneData));
    editor.sceneData = JSON.parse(this.redoStack.pop());
    editor.selectedObjects = [];
    editor.layers.updateLayerList();
    editor.ui.updateObjectProperties();
    editor.ui.updateObjectCount();
    editor.render();
  }

  /**
   * 重置历史
   */
  reset() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * 保存场景（触发回调）
   */
  save() {
    const editor = this.editor;
    if (editor.onSceneChange) editor.onSceneChange(editor.sceneData);
    editor.ui.showToast('场景已保存');
    return editor.sceneData;
  }

  /**
   * 导出 JSON
   */
  exportJSON() {
    const editor = this.editor;
    const json = JSON.stringify(editor.sceneData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editor.sceneData.name || 'scene'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return json;
  }

  /**
   * 导入 JSON
   */
  importJSON(source) {
    const editor = this.editor;
    const loadJSON = (json) => {
      try {
        editor.loadScene(JSON.parse(json));
        return true;
      } catch (e) {
        console.error('导入失败:', e);
        return false;
      }
    };

    if (source instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => loadJSON(e.target.result);
      reader.readAsText(source);
    } else if (typeof source === 'string') {
      return loadJSON(source);
    }
    return false;
  }

  /**
   * 获取场景数据
   */
  getSceneData() {
    return this.editor.sceneData;
  }
}
