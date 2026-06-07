/**
 * ProgressiveTipsConfig - 渐进式提示配置（平台选择器）
 *
 * 按当前平台（PlatformProfile）在桌面 / 移动两套文案之间选择：
 *   - 桌面（键鼠）：ProgressiveTipsConfig.desktop.js（键盘按键措辞）
 *   - 移动（触屏）：ProgressiveTipsConfig.mobile.js（屏幕按钮措辞）
 *
 * 两套配置的 id / priority / 条件 / 流程字段保持一致，仅 text 不同，
 * 因此下游（Act1SceneECS 等）无需感知平台，import 方式不变。
 */

import { PlatformProfile } from '../../../src/core/PlatformProfile.js';
import { ProgressiveTipsConfigDesktop } from './ProgressiveTipsConfig.desktop.js';
import { ProgressiveTipsConfigMobile } from './ProgressiveTipsConfig.mobile.js';

export const ProgressiveTipsConfig = PlatformProfile.isMobile
  ? ProgressiveTipsConfigMobile
  : ProgressiveTipsConfigDesktop;

/**
 * 获取提示的前置提示列表
 * @param {string} tipId - 提示ID
 * @returns {string[]} - 前置提示ID数组
 */
export function getPrerequisites(tipId) {
  const tip = ProgressiveTipsConfig[tipId];
  return tip ? tip.prerequisites : [];
}

/**
 * 获取提示的后续提示
 * @param {string} tipId - 提示ID
 * @returns {string|null} - 后续提示ID
 */
export function getNextTip(tipId) {
  const tip = ProgressiveTipsConfig[tipId];
  return tip ? tip.nextTip : null;
}

/**
 * 检查前置提示是否全部完成
 * @param {string} tipId - 提示ID
 * @param {Object} completedTips - 已完成的提示对象 { tipId: true }
 * @returns {boolean}
 */
export function arePrerequisitesMet(tipId, completedTips) {
  const prerequisites = getPrerequisites(tipId);
  if (prerequisites.length === 0) return true;
  return prerequisites.every(prereq => completedTips[prereq] === true);
}

/**
 * 获取第一个提示ID（没有前置条件的提示）
 * @returns {string|null}
 */
export function getFirstTipId() {
  for (const tipId in ProgressiveTipsConfig) {
    if (ProgressiveTipsConfig[tipId].prerequisites.length === 0) {
      return tipId;
    }
  }
  return null;
}

export default ProgressiveTipsConfig;
