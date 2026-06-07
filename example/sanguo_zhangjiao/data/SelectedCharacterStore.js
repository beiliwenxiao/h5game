/**
 * SelectedCharacterStore - 当前选中主角的全局存储
 *
 * 登录/角色选择界面写入选中的角色配置，
 * 场景创建玩家实体时读取，用于决定精灵图与名称。
 */
import { CharactersConfig } from './CharactersConfig.js';

let _selected = CharactersConfig[0];

export const SelectedCharacterStore = {
  /** 获取当前选中的角色配置 */
  get() {
    return _selected;
  },

  /** 通过 id 设置选中角色 */
  setById(id) {
    const found = CharactersConfig.find(c => c.id === id);
    if (found) {
      _selected = found;
    }
    return _selected;
  },

  /** 直接设置选中角色配置对象 */
  set(config) {
    if (config) _selected = config;
    return _selected;
  },

  /** 获取全部可选角色 */
  list() {
    return CharactersConfig;
  },
};

export default SelectedCharacterStore;
