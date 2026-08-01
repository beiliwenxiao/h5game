/**
 * performance 适配
 *
 * 小游戏有 wx.getPerformance()，但全局 performance 可能不存在。
 * 部分基础库版本已经有全局 performance.now，这里做兜底。
 */

export function shimPerformance(_global) {
  if (_global.performance && typeof _global.performance.now === 'function') return;

  let _perf;
  try { _perf = wx.getPerformance(); } catch (e) { /* ignore */ }

  _global.performance = _global.performance || {};
  _global.performance.now = _perf
    ? () => _perf.now()
    : () => Date.now();
}
