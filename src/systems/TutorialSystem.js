/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * 教程系统
 * 
 * 职责：
 * - 教程注册和触发逻辑
 * - 教程完成状态管理
 * - 教程显示和隐藏
 * - 教程步骤管理
 * 
 * 需求：2, 3, 4, 5, 11, 12, 37
 */

export class TutorialSystem {
  constructor() {
    // 教程注册表
    this.tutorials = new Map();
    
    // 已完成的教程ID集合
    this.completedTutorials = new Set();
    
    // 当前显示的教程
    this.currentTutorial = null;
    
    // 当前教程步骤索引
    this.currentStepIndex = 0;
    
    // 教程是否暂停游戏
    this.pauseGame = false;
    
    // 教程显示回调
    this.onShowCallback = null;
    this.onHideCallback = null;
    this.onCompleteCallback = null;
    
    // 教程触发条件检查器
    this.triggerCheckers = new Map();
    
    // 是否启用教程系统
    this.enabled = true;
  }

  /**
   * 注册教程
   * @param {string} tutorialId - 教程ID
   * @param {Object} tutorialData - 教程数据
   * @returns {boolean} 是否注册成功
   */
  registerTutorial(tutorialId, tutorialData) {
    if (!tutorialId || !tutorialData) {
      console.error('TutorialSystem: 无效的教程ID或数据');
      return false;
    }

    const tutorial = {
      id: tutorialId,
      title: tutorialData.title || '教程',
      description: tutorialData.description || '',
      steps: tutorialData.steps || [],
      triggerCondition: tutorialData.triggerCondition || null,
      completionCondition: tutorialData.completionCondition || null,
      pauseGame: tutorialData.pauseGame !== undefined ? tutorialData.pauseGame : false,
      canSkip: tutorialData.canSkip !== undefined ? tutorialData.canSkip : true,
      priority: tutorialData.priority || 0,
      category: tutorialData.category || 'general',
      autoTrigger: tutorialData.autoTrigger !== undefined ? tutorialData.autoTrigger : true
    };

    this.tutorials.set(tutorialId, tutorial);
    return true;
  }

  /**
   * 显示教程
   * @param {string} tutorialId - 教程ID
   * @param {Object} context - 上下文数据
   * @returns {boolean} 是否显示成功
   */
  showTutorial(tutorialId, context = {}) {
    console.log(`TutorialSystem: showTutorial 被调用, ID=${tutorialId}`);
    
    if (!this.enabled) {
      console.log('TutorialSystem: 教程系统未启用');
      return false;
    }

    // 检查教程是否已完成
    if (this.completedTutorials.has(tutorialId)) {
      console.log(`TutorialSystem: 教程 ${tutorialId} 已完成`);
      return false;
    }

    // 获取教程
    const tutorial = this.tutorials.get(tutorialId);
    if (!tutorial) {
      console.warn(`TutorialSystem: 教程不存在: ${tutorialId}`);
      return false;
    }

    // 检查是否有其他教程正在显示
    if (this.currentTutorial) {
      console.warn('TutorialSystem: 已有教程正在显示:', this.currentTutorial.id);
      return false;
    }

    console.log(`TutorialSystem: 显示教程 ${tutorialId}`);

    // 设置当前教程
    this.currentTutorial = tutorial;
    this.currentStepIndex = 0;
    this.pauseGame = tutorial.pauseGame;

    // 显示第一步（showStep内部会调用onShowCallback）
    this.showStep(0, context);

    return true;
  }

  /**
   * 显示教程步骤
   * @param {number} stepIndex - 步骤索引
   * @param {Object} context - 上下文数据
   */
  showStep(stepIndex, context = {}) {
    if (!this.currentTutorial) {
      return;
    }

    const steps = this.currentTutorial.steps;
    if (stepIndex < 0 || stepIndex >= steps.length) {
      return;
    }

    this.currentStepIndex = stepIndex;
    const step = steps[stepIndex];

    // 构建步骤显示数据
    const stepData = {
      tutorialId: this.currentTutorial.id,
      tutorialTitle: this.currentTutorial.title,
      stepIndex,
      totalSteps: steps.length,
      step: {
        text: step.text || '',
        image: step.image || null,
        target: step.target || null,
        highlightTarget: step.highlightTarget !== undefined ? step.highlightTarget : true,
        position: step.position || 'center',
        arrow: step.arrow || null
      },
      canSkip: this.currentTutorial.canSkip,
      isLastStep: stepIndex === steps.length - 1,
      context
    };

    // 触发步骤显示回调
    if (this.onShowCallback) {
      console.log('TutorialSystem: 调用 onShowCallback');
      this.onShowCallback(stepData, context);
    } else {
      console.warn('TutorialSystem: onShowCallback 未设置！');
    }
  }

  /**
   * 下一步
   * @param {Object} context - 上下文数据
   * @returns {boolean} 是否还有下一步
   */
  nextStep(context = {}) {
    if (!this.currentTutorial) {
      return false;
    }

    const nextIndex = this.currentStepIndex + 1;
    
    if (nextIndex >= this.currentTutorial.steps.length) {
      // 已经是最后一步，完成教程
      this.completeTutorial();
      return false;
    }

    // 显示下一步
    this.showStep(nextIndex, context);
    return true;
  }

  /**
   * 上一步
   * @param {Object} context - 上下文数据
   * @returns {boolean} 是否还有上一步
   */
  previousStep(context = {}) {
    if (!this.currentTutorial) {
      return false;
    }

    const prevIndex = this.currentStepIndex - 1;
    
    if (prevIndex < 0) {
      return false;
    }

    // 显示上一步
    this.showStep(prevIndex, context);
    return true;
  }

  /**
   * 跳过教程
   * @returns {boolean} 是否跳过成功
   */
  skipTutorial() {
    if (!this.currentTutorial) {
      return false;
    }

    if (!this.currentTutorial.canSkip) {
      return false;
    }

    // 标记为已完成（跳过也算完成）
    this.completedTutorials.add(this.currentTutorial.id);

    // 隐藏教程
    this.hideTutorial();

    return true;
  }

  /**
   * 完成教程
   * @param {string} tutorialId - 可选的教程ID，如果不提供则完成当前教程
   */
  completeTutorial(tutorialId = null) {
    // 如果提供了 tutorialId，直接标记为完成
    if (tutorialId) {
      this.completedTutorials.add(tutorialId);
      
      // 如果是当前教程，也隐藏它
      if (this.currentTutorial && this.currentTutorial.id === tutorialId) {
        // 触发完成回调
        if (this.onCompleteCallback) {
          this.onCompleteCallback(tutorialId, this.currentTutorial);
        }
        this.hideTutorial();
      }
      return;
    }
    
    // 否则完成当前教程
    if (!this.currentTutorial) {
      return;
    }

    const currentTutorialId = this.currentTutorial.id;

    // 标记为已完成
    this.completedTutorials.add(currentTutorialId);

    // 触发完成回调
    if (this.onCompleteCallback) {
      this.onCompleteCallback(currentTutorialId, this.currentTutorial);
    }

    // 隐藏教程
    this.hideTutorial();
  }

  /**
   * 隐藏教程
   */
  hideTutorial() {
    if (!this.currentTutorial) {
      return;
    }

    const tutorial = this.currentTutorial;

    // 清除当前教程
    this.currentTutorial = null;
    this.currentStepIndex = 0;
    this.pauseGame = false;

    // 触发隐藏回调
    if (this.onHideCallback) {
      this.onHideCallback(tutorial);
    }
  }

  /**
   * 检查教程是否已完成
   * @param {string} tutorialId - 教程ID
   * @returns {boolean} 是否已完成
   */
  isTutorialCompleted(tutorialId) {
    return this.completedTutorials.has(tutorialId);
  }

  /**
   * 获取教程
   * @param {string} tutorialId - 教程ID
   * @returns {Object|null} 教程对象
   */
  getTutorial(tutorialId) {
    return this.tutorials.get(tutorialId) || null;
  }

  /**
   * 获取所有教程
   * @returns {Array} 教程列表
   */
  getAllTutorials() {
    return Array.from(this.tutorials.values());
  }

  /**
   * 获取当前教程
   * @returns {Object|null} 当前教程对象
   */
  getCurrentTutorial() {
    return this.currentTutorial;
  }

  /**
   * 获取当前步骤索引
   * @returns {number} 当前步骤索引
   */
  getCurrentStepIndex() {
    return this.currentStepIndex;
  }

  /**
   * 检查是否有教程正在显示
   * @returns {boolean} 是否有教程正在显示
   */
  isShowingTutorial() {
    return this.currentTutorial !== null;
  }

  /**
   * 检查游戏是否应该暂停
   * @returns {boolean} 是否应该暂停
   */
  shouldPauseGame() {
    return this.pauseGame;
  }

  /**
   * 更新教程系统（每帧调用）
   * @param {number} deltaTime - 时间增量
   * @param {Object} gameState - 游戏状态
   */
  update(deltaTime, gameState = {}) {
    if (!this.enabled) {
      return;
    }

    // 检查自动触发的教程
    this.checkAutoTriggers(gameState);

    // 检查当前教程的完成条件
    if (this.currentTutorial && this.currentTutorial.completionCondition) {
      if (this.currentTutorial.completionCondition(gameState)) {
        this.completeTutorial();
      }
    }
  }

  /**
   * 渲染教程系统（每帧调用）
   * @param {CanvasRenderingContext2D} ctx - Canvas渲染上下文
   */
  render(ctx) {
    // 教程系统的渲染由 UI 组件（TutorialTooltip）负责
    // 这个方法保留用于未来可能的扩展
  }

  /**
   * 检查自动触发的教程
   * @param {Object} gameState - 游戏状态
   */
  checkAutoTriggers(gameState) {
    // 如果已有教程在显示，不检查新的触发
    if (this.currentTutorial) {
      return;
    }

    // 按优先级排序教程
    const sortedTutorials = Array.from(this.tutorials.values())
      .filter(t => t.autoTrigger && !this.completedTutorials.has(t.id))
      .sort((a, b) => b.priority - a.priority);

    // 检查触发条件
    for (const tutorial of sortedTutorials) {
      if (tutorial.triggerCondition && tutorial.triggerCondition(gameState)) {
        this.showTutorial(tutorial.id, gameState);
        break;
      }
    }
  }

  /**
   * 设置显示回调
   * @param {Function} callback - 回调函数
   */
  onShow(callback) {
    this.onShowCallback = callback;
  }

  /**
   * 设置隐藏回调
   * @param {Function} callback - 回调函数
   */
  onHide(callback) {
    this.onHideCallback = callback;
  }

  /**
   * 设置完成回调
   * @param {Function} callback - 回调函数
   */
  onComplete(callback) {
    this.onCompleteCallback = callback;
  }

  /**
   * 重置教程（用于测试或重新开始）
   * @param {string} tutorialId - 教程ID（可选，不传则重置所有）
   */
  resetTutorial(tutorialId = null) {
    if (tutorialId) {
      this.completedTutorials.delete(tutorialId);
    } else {
      this.completedTutorials.clear();
    }

    // 如果当前正在显示该教程，隐藏它
    if (this.currentTutorial && (!tutorialId || this.currentTutorial.id === tutorialId)) {
      this.hideTutorial();
    }
  }

  /**
   * 重置整个教程系统
   */
  reset() {
    this.completedTutorials.clear();
    this.hideTutorial();
  }

  /**
   * 启用/禁用教程系统
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    
    // 如果禁用，隐藏当前教程
    if (!enabled && this.currentTutorial) {
      this.hideTutorial();
    }
  }

  /**
   * 获取教程进度
   * @returns {Object} 进度信息
   */
  getProgress() {
    const totalTutorials = this.tutorials.size;
    const completedCount = this.completedTutorials.size;
    
    return {
      total: totalTutorials,
      completed: completedCount,
      remaining: totalTutorials - completedCount,
      percentage: totalTutorials > 0 ? (completedCount / totalTutorials) * 100 : 0,
      completedIds: Array.from(this.completedTutorials)
    };
  }

  /**
   * 按类别获取教程
   * @param {string} category - 类别
   * @returns {Array} 教程列表
   */
  getTutorialsByCategory(category) {
    return Array.from(this.tutorials.values())
      .filter(t => t.category === category);
  }

  /**
   * 获取未完成的教程
   * @returns {Array} 未完成的教程列表
   */
  getIncompleteTutorials() {
    return Array.from(this.tutorials.values())
      .filter(t => !this.completedTutorials.has(t.id));
  }

  /**
   * 保存教程进度
   * @returns {Object} 进度数据
   */
  saveProgress() {
    return {
      completedTutorials: Array.from(this.completedTutorials),
      enabled: this.enabled
    };
  }

  /**
   * 加载教程进度
   * @param {Object} progressData - 进度数据
   */
  loadProgress(progressData) {
    if (!progressData) {
      return;
    }

    if (progressData.completedTutorials) {
      this.completedTutorials = new Set(progressData.completedTutorials);
    }

    if (progressData.enabled !== undefined) {
      this.enabled = progressData.enabled;
    }
  }

  /**
   * 清理资源（场景退出时调用）
   */
  cleanup() {
    // 隐藏当前教程
    if (this.currentTutorial) {
      this.hideTutorial();
    }
    
    // 清除所有回调
    this.onShowCallback = null;
    this.onHideCallback = null;
    this.onCompleteCallback = null;
  }

  /**
   * 清除所有教程
   */
  clearAllTutorials() {
    this.tutorials.clear();
    this.completedTutorials.clear();
    this.hideTutorial();
  }
}

export default TutorialSystem;
