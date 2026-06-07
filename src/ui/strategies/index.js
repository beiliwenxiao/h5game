import { PlatformProfile } from '../../core/PlatformProfile.js';
import { DesktopUIStrategy } from './DesktopUIStrategy.js';
import { MobileUIStrategy } from './MobileUIStrategy.js';

export { UIStrategy } from './UIStrategy.js';
export { DesktopUIStrategy } from './DesktopUIStrategy.js';
export { MobileUIStrategy } from './MobileUIStrategy.js';

/**
 * 根据平台创建对应的 UI 策略
 * @param {string} [platform] - 不传则用 PlatformProfile 自动判定
 * @returns {UIStrategy}
 */
export function createUIStrategy(platform) {
  const p = platform || PlatformProfile.platform;
  return p === 'mobile' ? new MobileUIStrategy() : new DesktopUIStrategy();
}
