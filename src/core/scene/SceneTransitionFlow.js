/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 ************************************************************/

/**
 * SceneTransitionFlow - 场景过渡（框架级）
 *
 * 三段式黑屏转场：
 *
 *   fade_out      黑幕渐入（transitionDuration 秒）
 *   show_text     黑屏上显示主/副标题（textDisplayDuration 秒）
 *   switch_scene   触发 onSwitch 回调，由调用方真正切场景
 *
 * 只管状态机与绘制，不认识 SceneManager。切场景动作通过 onSwitch 注入，
 * 这样同一套转场既能用于换幕，也能用于存档读取、区域传送等场合。
 */
export class SceneTransitionFlow {
  /**
   * @param {Object} [options]
   * @param {number} [options.fadeDuration=1] - 黑幕渐入秒数
   * @param {number} [options.textDuration=2] - 文字停留秒数
   * @param {Function} [options.onSwitch] - 进入 switch_scene 阶段时调用
   */
  constructor(options = {}) {
    this.fadeDuration = options.fadeDuration != null ? options.fadeDuration : 1;
    this.textDuration = options.textDuration != null ? options.textDuration : 2;
    this.onSwitch = options.onSwitch || null;

    this.active = false;
    /** 'fade_out' | 'show_text' | 'switch_scene' */
    this.phase = 'fade_out';
    this.timer = 0;
    this.alpha = 0;
    this.text = { main: '', sub: '' };
  }

  /**
   * 启动转场。
   * @param {string} [mainText] - 主标题
   * @param {string} [subText] - 副标题
   */
  start(mainText = '场景切换中...', subText = '') {
    this.active = true;
    this.phase = 'fade_out';
    this.timer = 0;
    this.alpha = 0;
    this.text = { main: mainText, sub: subText };
  }

  /** 重置为未激活状态（切换完成或中断时调用） */
  reset() {
    this.active = false;
    this.phase = 'fade_out';
    this.timer = 0;
    this.alpha = 0;
  }

  /**
   * 是否应当暂停世界逻辑更新。
   * 黑幕完全盖住之后再跑世界逻辑没有意义，且可能在切场景瞬间读到半初始化状态。
   * @returns {boolean}
   */
  get shouldPauseWorld() {
    return this.active && (this.phase === 'show_text' || this.phase === 'switch_scene');
  }

  /**
   * 推进转场状态机。
   * @param {number} deltaTime - 秒
   */
  update(deltaTime) {
    if (!this.active) return;
    this.timer += deltaTime;

    if (this.phase === 'fade_out') {
      this.alpha = Math.min(1, this.timer / this.fadeDuration);
      if (this.alpha >= 1) {
        this.phase = 'show_text';
        this.timer = 0;
      }
      return;
    }

    if (this.phase === 'show_text' && this.timer >= this.textDuration) {
      this.phase = 'switch_scene';
      if (this.onSwitch) this.onSwitch();
    }
  }

  /**
   * 绘制黑幕与文字。
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width - 逻辑画布宽
   * @param {number} height - 逻辑画布高
   */
  render(ctx, width, height) {
    if (!this.active) return;

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${this.alpha})`;
    ctx.fillRect(0, 0, width, height);

    if (this.phase === 'show_text') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.text.main, width / 2, height / 2 - 30);

      if (this.text.sub) {
        ctx.font = '24px Arial';
        ctx.fillText(this.text.sub, width / 2, height / 2 + 30);
      }
    }
    ctx.restore();
  }
}

export default SceneTransitionFlow;
