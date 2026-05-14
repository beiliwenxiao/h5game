/**
 * TutorialConditions - 教程条件判断器
 * 
 * 定义所有教程的触发条件和完成条件判断函数。
 * 每个条件函数接收场景实例和游戏状态作为参数，返回布尔值。
 * 
 * 条件函数命名规范：
 * - 触发条件：{tutorialId}_trigger
 * - 完成条件：{tutorialId}_complete
 */

export class TutorialConditions {
  /**
   * 移动教程 - 触发条件
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static movement_trigger(scene, gameState) {
    return scene.tutorialPhase === 'movement' && 
           !scene.tutorialsCompleted.movement;
  }

  /**
   * 移动教程 - 完成条件
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static movement_complete(scene, gameState) {
    return scene.playerMovedDistance >= 100; // 移动100像素后完成
  }

  /**
   * 拾取教程 - 触发条件
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static pickup_trigger(scene, gameState) {
    return scene.tutorialPhase === 'pickup' && 
           !scene.tutorialsCompleted.pickup;
  }

  /**
   * 拾取教程 - 完成条件
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static pickup_complete(scene, gameState) {
    const pickedCount = scene.pickupItems.filter(item => item.picked).length;
    return pickedCount > 0;
  }

  /**
   * 装备教程 - 触发条件
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static equipment_trigger(scene, gameState) {
    return scene.tutorialPhase === 'equipment' && 
           !scene.tutorialsCompleted.equipment;
  }

  /**
   * 装备教程 - 完成条件
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static equipment_complete(scene, gameState) {
    if (!scene.player) {
      return false;
    }
    
    const equipment = scene.player.getComponent('equipment');
    return equipment && equipment.weapon !== null;
  }

  /**
   * 战斗教程 - 触发条件
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static combat_trigger(scene, gameState) {
    return scene.tutorialPhase === 'combat' && 
           !scene.tutorialsCompleted.combat;
  }

  /**
   * 战斗教程 - 完成条件
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static combat_complete(scene, gameState) {
    // 战斗教程在完成前三波战斗后完成
    return scene.combatWave >= 2 && scene.waveCompleted;
  }

  /**
   * 根据条件ID获取条件函数
   * @param {string} conditionId - 条件ID
   * @returns {Function|null}
   */
  static getCondition(conditionId) {
    if (typeof this[conditionId] === 'function') {
      return this[conditionId].bind(this);
    }
    
    console.warn(`TutorialConditions: 未找到条件函数 - ${conditionId}`);
    return null;
  }

  /**
   * 执行条件判断
   * @param {string} conditionId - 条件ID
   * @param {Object} scene - 场景实例
   * @param {Object} gameState - 游戏状态
   * @returns {boolean}
   */
  static evaluate(conditionId, scene, gameState) {
    const condition = this.getCondition(conditionId);
    
    if (!condition) {
      return false;
    }
    
    try {
      return condition(scene, gameState);
    } catch (error) {
      console.error(`TutorialConditions: 条件判断出错 - ${conditionId}`, error);
      return false;
    }
  }
}

export default TutorialConditions;
