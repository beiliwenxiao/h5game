/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 *
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * ContentValidator.js
 * 内容配置校验器：在 GameLoader 修改运行状态之前拦截错误配置。
 *
 * 设计原则：
 *   - 校验失败时不替换当前已加载内容，保持最近一次有效状态可运行
 *   - 错误必须定位到字段路径；JSON 语法错误给出行列
 *   - 支持规范化输出，保证「序列化 → 解析 → 再序列化」结果稳定
 *
 * 校验规则以轻量 Schema 描述，避免引入外部依赖。
 */

import {
  ValidationCode,
  makeError,
  prefixErrors,
  locateJsonError,
  formatErrors
} from './ValidationError.js';

/** 字段类型 */
export const FieldType = {
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object'
};

export class ContentValidator {
  /**
   * @param {Object} [config]
   * @param {Object} [config.schemas] - schemaId -> schema
   * @param {number} [config.supportedVersion] - 支持的最高内容版本
   */
  constructor(config = {}) {
    /** @type {Map<string, Object>} */
    this.schemas = new Map(Object.entries(config.schemas || {}));
    this.supportedVersion = config.supportedVersion !== undefined ? config.supportedVersion : 1;
  }

  /**
   * 注册 Schema
   *
   * Schema 结构：
   *   {
   *     id: 'skill',
   *     fields: {
   *       id:     { type: 'string', required: true },
   *       damage: { type: 'number', min: 0 },
   *       tags:   { type: 'array', itemType: 'string' },
   *       params: { type: 'object', schema: 'params' }
   *     },
   *     allowUnknown: true,
   *     validate: (value) => ({ok, errors})   // 可选的自定义规则
   *   }
   *
   * @param {Object} schema
   * @returns {boolean}
   */
  registerSchema(schema) {
    if (!schema || typeof schema.id !== 'string') {
      console.warn('ContentValidator: Schema 必须包含字符串 id');
      return false;
    }
    this.schemas.set(schema.id, schema);
    return true;
  }

  /** 批量注册 */
  registerSchemas(list = []) {
    let count = 0;
    for (const schema of list) {
      if (this.registerSchema(schema)) count++;
    }
    return count;
  }

  /**
   * 获取 Schema
   * @param {string} schemaId
   * @returns {Object|null}
   */
  getSchema(schemaId) {
    return this.schemas.get(schemaId) || null;
  }

  /**
   * 解析 JSON 文本，语法错误时给出行列
   * @param {string} text
   * @returns {{ok: boolean, value?: *, errors: Array<Object>}}
   */
  parseJson(text) {
    if (typeof text !== 'string') {
      return {
        ok: false,
        errors: [makeError(ValidationCode.INVALID_JSON, '', 'JSON 内容必须为字符串')]
      };
    }

    try {
      return { ok: true, value: JSON.parse(text), errors: [] };
    } catch (e) {
      const { line, column } = locateJsonError(e, text);
      return {
        ok: false,
        errors: [makeError(
          ValidationCode.INVALID_JSON,
          '',
          `JSON 语法错误: ${e.message}`,
          { line, column }
        )]
      };
    }
  }

  /**
   * 校验对象
   * @param {*} value
   * @param {string} schemaId
   * @param {string} [path] - 起始路径
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  validate(value, schemaId, path = '') {
    const schema = this.getSchema(schemaId);
    if (!schema) {
      return {
        ok: false,
        errors: [makeError(ValidationCode.INVALID_REFERENCE, path, `未注册的 Schema: ${schemaId}`)]
      };
    }

    const errors = this._validateAgainstSchema(value, schema, path);
    return { ok: errors.length === 0, errors };
  }

  /**
   * 校验数组，逐项定位错误并检查 id 唯一
   * @param {Array} list
   * @param {string} schemaId
   * @param {string} [path]
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  validateList(list, schemaId, path = '') {
    if (!Array.isArray(list)) {
      return {
        ok: false,
        errors: [makeError(ValidationCode.TYPE_MISMATCH, path, '必须为数组', {
          expected: 'array',
          actual: typeof list
        })]
      };
    }

    const errors = [];
    const seen = new Set();

    list.forEach((item, index) => {
      const itemPath = path ? `${path}[${index}]` : `[${index}]`;
      const result = this.validate(item, schemaId, itemPath);
      errors.push(...result.errors);

      const id = item && item.id;
      if (typeof id === 'string') {
        if (seen.has(id)) {
          errors.push(makeError(ValidationCode.DUPLICATE_ID, `${itemPath}.id`, `重复的 id: ${id}`));
        }
        seen.add(id);
      }
    });

    return { ok: errors.length === 0, errors };
  }

  /**
   * 校验内容版本
   * @param {*} value - 含 version 字段的配置
   * @param {string} [path]
   * @returns {{ok: boolean, errors: Array<Object>}}
   */
  validateVersion(value, path = 'version') {
    const version = value && value.version;
    if (version === undefined) return { ok: true, errors: [] };

    if (typeof version !== 'number') {
      return {
        ok: false,
        errors: [makeError(ValidationCode.TYPE_MISMATCH, path, '版本必须为数字', {
          expected: 'number',
          actual: typeof version
        })]
      };
    }

    if (version > this.supportedVersion) {
      return {
        ok: false,
        errors: [makeError(
          ValidationCode.VERSION_UNSUPPORTED,
          path,
          `内容版本 ${version} 高于支持版本，受支持范围为 1 至 ${this.supportedVersion}`,
          { expected: `<= ${this.supportedVersion}`, actual: version }
        )]
      };
    }

    return { ok: true, errors: [] };
  }

  /**
   * 按 Schema 递归校验
   * @private
   * @returns {Array<Object>}
   */
  _validateAgainstSchema(value, schema, path) {
    const errors = [];

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return [makeError(ValidationCode.TYPE_MISMATCH, path, '必须为对象', {
        expected: 'object',
        actual: Array.isArray(value) ? 'array' : (value === null ? 'null' : typeof value)
      })];
    }

    const fields = schema.fields || {};

    for (const [name, rule] of Object.entries(fields)) {
      const fieldPath = path ? `${path}.${name}` : name;
      const present = Object.prototype.hasOwnProperty.call(value, name)
        && value[name] !== undefined
        && value[name] !== null;

      if (!present) {
        if (rule.required) {
          errors.push(makeError(
            ValidationCode.MISSING_FIELD,
            fieldPath,
            rule.message || `缺少必填字段 ${name}`
          ));
        }
        continue;
      }

      errors.push(...this._validateField(value[name], rule, fieldPath));
    }

    // 未知字段：默认允许，显式禁止时报告
    if (schema.allowUnknown === false) {
      for (const name of Object.keys(value)) {
        if (!fields[name]) {
          const fieldPath = path ? `${path}.${name}` : name;
          errors.push(makeError(ValidationCode.UNKNOWN_FIELD, fieldPath, `未知字段 ${name}`));
        }
      }
    }

    // 自定义规则（跨字段约束）
    if (typeof schema.validate === 'function' && errors.length === 0) {
      try {
        const custom = schema.validate(value);
        if (custom && custom.ok === false) {
          errors.push(...prefixErrors(custom.errors || [], path));
        }
      } catch (e) {
        errors.push(makeError(ValidationCode.INVALID_REFERENCE, path, `自定义校验出错: ${e.message}`));
      }
    }

    return errors;
  }

  /**
   * 校验单个字段
   * @private
   * @returns {Array<Object>}
   */
  _validateField(value, rule, path) {
    const errors = [];

    switch (rule.type) {
      case FieldType.STRING:
        if (typeof value !== 'string') {
          return [this._typeError(path, 'string', value)];
        }
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, path, `长度不得小于 ${rule.minLength}`, {
            expected: `>= ${rule.minLength}`, actual: value.length
          }));
        }
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, path, `取值必须为 ${rule.enum.join('/')} 之一`, {
            expected: rule.enum, actual: value
          }));
        }
        break;

      case FieldType.NUMBER:
      case FieldType.INTEGER: {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return [this._typeError(path, rule.type, value)];
        }
        if (rule.type === FieldType.INTEGER && !Number.isInteger(value)) {
          errors.push(makeError(ValidationCode.TYPE_MISMATCH, path, '必须为整数', {
            expected: 'integer', actual: value
          }));
        }
        if (rule.min !== undefined && value < rule.min) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, path, `不得小于 ${rule.min}`, {
            expected: `>= ${rule.min}`, actual: value
          }));
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, path, `不得大于 ${rule.max}`, {
            expected: `<= ${rule.max}`, actual: value
          }));
        }
        break;
      }

      case FieldType.BOOLEAN:
        if (typeof value !== 'boolean') return [this._typeError(path, 'boolean', value)];
        break;

      case FieldType.ARRAY: {
        if (!Array.isArray(value)) return [this._typeError(path, 'array', value)];
        if (rule.minItems !== undefined && value.length < rule.minItems) {
          errors.push(makeError(ValidationCode.OUT_OF_RANGE, path, `至少需要 ${rule.minItems} 项`, {
            expected: `>= ${rule.minItems}`, actual: value.length
          }));
        }
        value.forEach((item, index) => {
          const itemPath = `${path}[${index}]`;
          if (rule.itemSchema) {
            errors.push(...this.validate(item, rule.itemSchema, itemPath).errors);
          } else if (rule.itemType) {
            errors.push(...this._validateField(item, { type: rule.itemType }, itemPath));
          }
        });
        break;
      }

      case FieldType.OBJECT: {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return [this._typeError(path, 'object', value)];
        }
        if (rule.schema) {
          errors.push(...this.validate(value, rule.schema, path).errors);
        }
        if (rule.valueType) {
          for (const [key, entry] of Object.entries(value)) {
            errors.push(...this._validateField(entry, { type: rule.valueType }, `${path}.${key}`));
          }
        }
        break;
      }

      default:
        break;
    }

    return errors;
  }

  /** @private */
  _typeError(path, expected, actual) {
    return makeError(ValidationCode.TYPE_MISMATCH, path, `类型必须为 ${expected}`, {
      expected,
      actual: Array.isArray(actual) ? 'array' : (actual === null ? 'null' : typeof actual)
    });
  }

  /**
   * 加载候选内容：解析 → 版本 → Schema 全部通过后才返回新值。
   *
   * 任一环节失败时返回当前值，调用方据此保持最近一次有效状态可运行。
   *
   * @param {string|Object} source - JSON 文本或已解析对象
   * @param {string} schemaId
   * @param {*} [currentValue] - 当前已加载内容
   * @returns {{committed: boolean, value: *, errors: Array<Object>}}
   */
  loadCandidate(source, schemaId, currentValue = null) {
    let candidate = source;

    if (typeof source === 'string') {
      const parsed = this.parseJson(source);
      if (!parsed.ok) return { committed: false, value: currentValue, errors: parsed.errors };
      candidate = parsed.value;
    }

    const versionCheck = this.validateVersion(candidate);
    if (!versionCheck.ok) {
      return { committed: false, value: currentValue, errors: versionCheck.errors };
    }

    const result = this.validate(candidate, schemaId);
    if (!result.ok) {
      return { committed: false, value: currentValue, errors: result.errors };
    }

    return { committed: true, value: candidate, errors: [] };
  }

  /**
   * 加载候选列表
   * @param {string|Array} source
   * @param {string} schemaId
   * @param {Array} [currentValue]
   * @returns {{committed: boolean, value: Array, errors: Array<Object>}}
   */
  loadCandidateList(source, schemaId, currentValue = []) {
    let candidate = source;

    if (typeof source === 'string') {
      const parsed = this.parseJson(source);
      if (!parsed.ok) return { committed: false, value: currentValue, errors: parsed.errors };
      candidate = parsed.value;
    }

    const result = this.validateList(candidate, schemaId);
    if (!result.ok) return { committed: false, value: currentValue, errors: result.errors };

    return { committed: true, value: candidate, errors: [] };
  }

  /**
   * 规范化输出：按 Schema 字段顺序重排，并递归排序对象键。
   *
   * 保证「序列化 → 解析 → 再序列化」得到完全相同的文本，
   * 便于内容文件做版本比对。
   *
   * @param {*} value
   * @param {string} [schemaId]
   * @returns {*}
   */
  canonicalize(value, schemaId = null) {
    const schema = schemaId ? this.getSchema(schemaId) : null;

    if (Array.isArray(value)) {
      return value.map(item => this.canonicalize(item, schemaId));
    }
    if (value === null || typeof value !== 'object') return value;

    const result = {};

    // Schema 字段优先，按声明顺序输出
    if (schema && schema.fields) {
      for (const name of Object.keys(schema.fields)) {
        if (!Object.prototype.hasOwnProperty.call(value, name)) continue;
        const rule = schema.fields[name];
        result[name] = this.canonicalize(value[name], rule.schema || rule.itemSchema || null);
      }
    }

    // 其余字段按键名排序，保证输出稳定
    for (const name of Object.keys(value).sort()) {
      if (Object.prototype.hasOwnProperty.call(result, name)) continue;
      result[name] = this.canonicalize(value[name], null);
    }

    return result;
  }

  /**
   * 输出规范 JSON 文本
   * @param {*} value
   * @param {string} [schemaId]
   * @param {number} [indent]
   * @returns {string}
   */
  stringify(value, schemaId = null, indent = 2) {
    return JSON.stringify(this.canonicalize(value, schemaId), null, indent);
  }
}

export { ValidationCode, formatErrors };
export default ContentValidator;
