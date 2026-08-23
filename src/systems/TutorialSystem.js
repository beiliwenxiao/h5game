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

import { TutorialDefinitionRepository } from './TutorialDefinitionRepository.js';

const matchesScope = (definition, scope = null) => {
  const sceneId = typeof scope === 'string' ? scope : scope?.sceneId;
  const sceneIds = definition?.scope?.sceneIds;
  return !Array.isArray(sceneIds) || sceneIds.length === 0 || !sceneId || sceneIds.includes(sceneId);
};

export class TutorialSystem {
  constructor(config = {}) {
    // definitions 属于不可变 Repository；本系统只借用索引并拥有运行进度。
    this.definitionRepository = TutorialDefinitionRepository.from(config.definitions || []);
    
    // 已完成的教程ID集合
    this.completedTutorials = new Set();
    
    // 当前显示只保存稳定 definition id；完整定义始终从只读索引解析。
    this.currentTutorialId = null;
    Object.defineProperty(this, 'currentTutorial', {
      enumerable: false,
      configurable: false,
      get: () => this.currentTutorialId
        ? this.definitionRepository.get(this.currentTutorialId)
        : null,
      set: value => {
        this.currentTutorialId = typeof value === 'string' ? value : (value?.id || null);
      }
    });
    
    // 当前教程步骤索引
    this.currentStepIndex = 0;
    
    // 教程是否暂停游戏
    this.pauseGame = false;
    
    // 教程显示回调
    this.onShowCallback = null;
    this.onHideCallback = null;
    this.onCompleteCallback = null;
    this.signalProgress = new Map();
    this.movementOrigins = new Map();
    
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
    try {
      this.setDefinitionRepository(this.definitionRepository.withDefinition(tutorialId, tutorialData));
      return true;
    } catch (error) {
      console.error('TutorialSystem: 教程定义无效', error);
      return false;
    }
  }

  setDefinitionRepository(repository) {
    const next = TutorialDefinitionRepository.from(repository);
    const activeId = this.currentTutorial?.id || null;
    this.definitionRepository = next;
    if (activeId) {
      const replacement = next.get(activeId);
      if (replacement) this.currentTutorial = replacement;
      else this.hideTutorial();
    }
    return true;
  }

  replaceDefinitions(definitions = []) {
    if (!Array.isArray(definitions)) throw new TypeError('Tutorial definitions must be an array');
    return this.setDefinitionRepository(new TutorialDefinitionRepository(definitions));
  }

  showNext(category = null, scope = null) {
    if (this.currentTutorial) return false;
    const next = [...this.definitionRepository.values()]
      .filter(definition => (!category || definition.category === category)
        && matchesScope(definition, scope)
        && !this.completedTutorials.has(definition.id))
      .sort((left, right) => left.order - right.order || right.priority - left.priority)[0];
    return next ? this.showTutorial(next.id) : false;
  }

  notify(signal, payload = {}, scope = null) {
    if (!this.enabled || !signal || payload?.ok === false || payload?.committed === false) return false;
    // 教程是 committed event 的辅助消费者，只允许当前已显示教程消费信号。
    // 禁止一个事件在后台提前完成尚未激活、尚未展示的未来教程。
    const definition = this.currentTutorial;
    if (!definition
      || definition.completionPolicy !== 'signal'
      || !matchesScope(definition, scope)
      || this.completedTutorials.has(definition.id)) return false;
    for (const rule of definition.signalRules) {
      if (rule.signal !== signal || !this._matchesSignalRule(rule, payload)) continue;
      const key = `${definition.id}:${rule.id || signal}`;
      const count = (this.signalProgress.get(key) || 0) + 1;
      this.signalProgress.set(key, count);
      if (count < Math.max(1, Number(rule.threshold) || 1)) return false;
      this.completeTutorial(definition.id);
      return true;
    }
    return false;
  }

  updateMovement(position, category = null, scope = null) {
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return false;
    const definition = this.currentTutorial;
    if (!definition
      || (category && definition.category !== category)
      || !matchesScope(definition, scope)
      || definition.completionPolicy !== 'signal'
      || !definition.movementRule
      || this.completedTutorials.has(definition.id)) return false;
    const origin = this.movementOrigins.get(definition.id);
    if (!origin) {
      this.movementOrigins.set(definition.id, { x: position.x, y: position.y });
      return false;
    }
    const deltaX = position.x - origin.x;
    const deltaY = position.y - origin.y;
    if (definition.movementRule.mode === 'anyMovement') {
      const epsilon = Math.max(0.001, Number(definition.movementRule.epsilon) || 0.01);
      if (deltaX * deltaX + deltaY * deltaY <= epsilon * epsilon) return false;
    } else {
      const threshold = Math.max(0, Number(definition.movementRule.threshold) || 0);
      if (Math.hypot(deltaX, deltaY) < threshold) return false;
    }
    this.completeTutorial(definition.id);
    return true;
  }

  resetMovementOrigin(tutorialId = null, position = null) {
    const value = Number.isFinite(position?.x) && Number.isFinite(position?.y)
      ? { x: position.x, y: position.y } : null;
    if (tutorialId) {
      if (value) this.movementOrigins.set(tutorialId, value);
      else this.movementOrigins.delete(tutorialId);
    } else {
      this.movementOrigins.clear();
    }
  }

  _matchesSignalRule(rule, payload) {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    return conditions.every(condition => {
      const value = String(condition.field || '').split('.').filter(Boolean)
        .reduce((current, key) => current?.[key], payload);
      if (condition.operator === 'exists') return condition.value === false ? value == null : value != null;
      if (condition.operator === 'notEquals') return value !== condition.value;
      if (condition.operator === 'gte') return Number(value) >= Number(condition.value);
      if (condition.operator === 'lte') return Number(value) <= Number(condition.value);
      return value === condition.value;
    });
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
    const tutorial = this.definitionRepository.get(tutorialId);
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
      // 只有 allSteps policy 由步骤浏览完成；signal/manual 等待各自正式命令。
      if (this.currentTutorial.completionPolicy === 'allSteps') this.completeTutorial();
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
    return this.definitionRepository.get(tutorialId);
  }

  /**
   * 获取所有教程
   * @returns {Array} 教程列表
   */
  getAllTutorials() {
    return [...this.definitionRepository.values()];
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
    if (!this.enabled) return;
    // Definition 只包含可序列化规则；系统不执行 JavaScript when/completion callback。
    this.checkAutoTriggers(gameState);
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

    // autoTrigger 只决定是否按 canonical order/priority 展示，不执行 JavaScript when。
    const next = Array.from(this.definitionRepository.values())
      .filter(t => t.autoTrigger && !this.completedTutorials.has(t.id))
      .sort((a, b) => a.order - b.order || b.priority - a.priority)[0];
    if (next) this.showTutorial(next.id, gameState);
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
      this.movementOrigins.delete(tutorialId);
      for (const key of [...this.signalProgress.keys()]) {
        if (key.startsWith(`${tutorialId}:`)) this.signalProgress.delete(key);
      }
    } else {
      this.completedTutorials.clear();
      this.signalProgress.clear();
      this.movementOrigins.clear();
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
    this.signalProgress.clear();
    this.movementOrigins.clear();
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
    const totalTutorials = this.definitionRepository.size;
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
    return Array.from(this.definitionRepository.values())
      .filter(t => t.category === category);
  }

  /**
   * 获取未完成的教程
   * @returns {Array} 未完成的教程列表
   */
  getIncompleteTutorials() {
    return Array.from(this.definitionRepository.values())
      .filter(t => !this.completedTutorials.has(t.id));
  }

  /**
   * 保存教程进度
   * @returns {Object} 进度数据
   */
  saveProgress() {
    return {
      completedTutorials: Array.from(this.completedTutorials),
      enabled: this.enabled,
      currentTutorialId: this.currentTutorial?.id || null,
      currentStepIndex: this.currentStepIndex,
      signalProgress: Object.fromEntries(this.signalProgress),
      movementOrigins: Object.fromEntries(this.movementOrigins)
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

    // 读档前清除可能由新游戏启动流程显示的旧步骤，完成事实只取存档。
    if (this.currentTutorial) this.hideTutorial();

    if (progressData.completedTutorials) {
      this.completedTutorials = new Set(progressData.completedTutorials);
    }

    if (progressData.enabled !== undefined) {
      this.enabled = progressData.enabled;
    }
    this.signalProgress = new Map(Object.entries(progressData.signalProgress || {})
      .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value) || 0))]));
    this.movementOrigins = new Map(Object.entries(progressData.movementOrigins || {})
      .filter(([, value]) => Number.isFinite(value?.x) && Number.isFinite(value?.y)));
    const active = progressData.currentTutorialId
      ? this.definitionRepository.get(progressData.currentTutorialId) : null;
    if (active && !this.completedTutorials.has(active.id)) {
      this.currentTutorial = active;
      this.currentStepIndex = Math.min(
        Math.max(0, Math.floor(Number(progressData.currentStepIndex) || 0)),
        Math.max(0, active.steps.length - 1)
      );
      this.pauseGame = active.pauseGame;
      this.showStep(this.currentStepIndex);
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
    this.setDefinitionRepository(new TutorialDefinitionRepository());
    this.completedTutorials.clear();
    this.signalProgress.clear();
    this.movementOrigins.clear();
    this.hideTutorial();
  }
}

export default TutorialSystem;
