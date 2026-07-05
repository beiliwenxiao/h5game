/**
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 */

/**
 * PortraitsConfig - 对话头像配置
 *
 * 定义所有对话中使用的头像 key 与图片路径的映射。
 * DialogueBox 会根据对话节点的 portrait 字段查找此配置加载图片。
 *
 * 路径相对于 index.html 所在目录（example/sanguo_zhangjiao/）。
 */
export const PortraitsConfig = {
  zhangjiao:  'assets/images/zhangjiao.png',
  player:     'assets/images/zhujiao.png',
  // 后续可扩展：
  // zhangliang: 'assets/images/zhangliang.png',
  // zhangbao:   'assets/images/zhangbao.png',
};

export default PortraitsConfig;
