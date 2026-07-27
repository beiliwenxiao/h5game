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
 * ValidationError.js
 * 统一校验错误结构。
 *
 * 所有校验错误必须能定位到具体字段路径，JSON 语法错误还需给出行列，
 * 否则内容制作时无法快速排查。
 */

/** 错误码 */
export const ValidationCode = {
  INVALID_JSON: 'invalidJson',
  MISSING_FIELD: 'missingField',
  TYPE_MISMATCH: 'typeMismatch',
  OUT_OF_RANGE: 'outOfRange',
  INVALID_REFERENCE: 'invalidReference',
  DUPLICATE_ID: 'duplicateId',
  VERSION_UNSUPPORTED: 'versionUnsupported',
  UNKNOWN_FIELD: 'unknownField'
};

/**
 * 构造校验错误
 * @param {string} code - ValidationCode
 * @param {string} path - 字段路径，如 nodes.root.maxRank
 * @param {string} message - 可显示的说明
 * @param {Object} [extra] - { expected, actual, line, column }
 * @returns {Object}
 */
export function makeError(code, path, message, extra = {}) {
  return { code, path, message, ...extra };
}

/**
 * 为错误列表统一加上路径前缀
 * @param {Array<Object>} errors
 * @param {string} prefix
 * @returns {Array<Object>}
 */
export function prefixErrors(errors = [], prefix = '') {
  if (!prefix) return errors.map(e => ({ ...e }));
  return errors.map(e => ({
    ...e,
    path: e.path ? `${prefix}.${e.path}` : prefix
  }));
}

/**
 * 从 JSON 解析异常中提取行列位置。
 *
 * 不同引擎的报错信息格式不一致，因此优先用 position 反算行列，
 * 拿不到位置时退回引擎自带的 line/column 描述。
 *
 * @param {Error} error - JSON.parse 抛出的异常
 * @param {string} text - 原始文本
 * @returns {{line: number|null, column: number|null}}
 */
export function locateJsonError(error, text) {
  const message = String(error && error.message ? error.message : '');

  const posMatch = /position\s+(\d+)/i.exec(message);
  if (posMatch && typeof text === 'string') {
    const position = Math.min(Number(posMatch[1]), text.length);
    const before = text.slice(0, position);
    const lines = before.split('\n');
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  const lineMatch = /line\s+(\d+)/i.exec(message);
  const colMatch = /column\s+(\d+)/i.exec(message);
  return {
    line: lineMatch ? Number(lineMatch[1]) : null,
    column: colMatch ? Number(colMatch[1]) : null
  };
}

/**
 * 把错误列表格式化为可读文本，用于控制台与错误提示界面
 * @param {Array<Object>} errors
 * @returns {string}
 */
export function formatErrors(errors = []) {
  return errors.map(e => {
    const location = (e.line !== undefined && e.line !== null)
      ? ` (行 ${e.line}${e.column ? ', 列 ' + e.column : ''})`
      : '';
    const detail = (e.expected !== undefined || e.actual !== undefined)
      ? ` [期望 ${JSON.stringify(e.expected)}，实际 ${JSON.stringify(e.actual)}]`
      : '';
    return `${e.code} @ ${e.path || '<root>'}${location}: ${e.message}${detail}`;
  }).join('\n');
}
