import { SchemaFieldEditor } from './SchemaFieldEditor.js';

/**
 * 配置/场景编辑器共享绑定：仅保存根 path 和 UI schema 投影，文档、undo 与提交均由共享服务拥有。
 */
export class CanonicalEditorSession {
  constructor({ sourceUri, documentService, commandService, schemaRegistry, schemaId = 'gameProject', rootPath = 'project', catalogs = {}, consumptionRegistry = null } = {}) {
    if (!sourceUri || !documentService || !commandService) throw new TypeError('CanonicalEditorSession requires shared canonical services');
    this.sourceUri = sourceUri;
    this.documentService = documentService;
    this.commandService = commandService;
    this.rootPath = rootPath;
    this.dirtyRootPaths = new Set();
    this.fields = new SchemaFieldEditor({
      registry: schemaRegistry,
      documentModel: documentService.requireProject(sourceUri),
      schemaId,
      rootPath,
      catalogs,
      consumptionRegistry
    });
  }

  get model() { return this.documentService.requireProject(this.sourceUri); }
  getValue(path = '') { return this.fields.getValue(path); }
  describe(path = '') { return this.fields.describe(path); }

  patch(path, value, options) {
    const result = this.fields.patch(path, value, options);
    this.dirtyRootPaths.add(this._rootFor(path));
    return result;
  }

  patchMany(operations) {
    const result = this.fields.patchMany(operations);
    operations.forEach(operation => this.dirtyRootPaths.add(this._rootFor(operation.path)));
    return result;
  }

  replace(value) { return this.patch('', value); }
  remove(path) {
    const result = this.fields.remove(path);
    this.dirtyRootPaths.add(this._rootFor(path));
    return result;
  }
  undo() { return this.documentService.undo(this.sourceUri); }
  redo() { return this.documentService.redo(this.sourceUri); }

  async save(extra = {}) {
    const rootPaths = this.dirtyRootPaths.size > 0 ? [...this.dirtyRootPaths] : [this.rootPath];
    const result = await this.commandService.save(this.sourceUri, { ...extra, rootPaths });
    if (result?.ok === true && result.committed === true) this.dirtyRootPaths.clear();
    return result;
  }

  _rootFor(path) {
    if (!path) return this.rootPath;
    const first = String(path).match(/^[^[.]+/)?.[0];
    return first ? `${this.rootPath}.${first}` : this.rootPath;
  }
}

export default CanonicalEditorSession;
