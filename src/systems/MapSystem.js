/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
 ************************************************************/

/**
 * MapSystem.js
 * 地图系统 - 管理多地图、传送点和地图切换
 */

/**
 * 地图状态枚举
 */
export const MapState = {
  LOCKED: 'locked',       // 未解锁
  UNLOCKED: 'unlocked',   // 已解锁
  COMPLETED: 'completed'  // 已完成
};

/**
 * 传送点类型枚举
 */
export const PortalType = {
  NORMAL: 'normal',       // 普通传送点
  DUNGEON: 'dungeon',     // 副本入口
  SAFE_ZONE: 'safe_zone', // 安全区
  BOSS: 'boss'            // Boss区域
};

/**
 * 传送点类
 */
export class Portal {
  /**
   * @param {Object} config - 传送点配置
   * @param {string} config.id - 传送点ID
   * @param {string} config.name - 传送点名称
   * @param {string} config.type - 传送点类型
   * @param {Object} config.position - 位置 {x, y}
   * @param {string} config.targetMapId - 目标地图ID
   * @param {Object} config.targetPosition - 目标位置 {x, y}
   * @param {Object} config.unlockCondition - 解锁条件
   * @param {number} config.radius - 触发半径
   */
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type || PortalType.NORMAL;
    this.position = config.position || { x: 0, y: 0 };
    this.targetMapId = config.targetMapId;
    this.targetPosition = config.targetPosition || { x: 0, y: 0 };
    this.unlockCondition = config.unlockCondition || null;
    this.radius = config.radius || 30;
    this.isUnlocked = !config.unlockCondition;
    this.isActive = true;
  }

  /**
   * 检查是否可以使用传送点
   * @param {Object} character - 角色数据
   * @returns {Object} {canUse: boolean, reason: string}
   */
  canUse(character) {
    if (!this.isActive) {
      return { canUse: false, reason: '传送点未激活' };
    }

    if (!this.isUnlocked) {
      return { canUse: false, reason: '传送点未解锁' };
    }

    if (this.unlockCondition) {
      const conditionResult = this.checkUnlockCondition(character);
      if (!conditionResult.met) {
        return { canUse: false, reason: conditionResult.reason };
      }
    }

    return { canUse: true, reason: '' };
  }

  /**
   * 检查解锁条件
   * @param {Object} character - 角色数据
   * @returns {Object} {met: boolean, reason: string}
   */
  checkUnlockCondition(character) {
    if (!this.unlockCondition) {
      return { met: true, reason: '' };
    }

    const condition = this.unlockCondition;

    // 等级条件
    if (condition.minLevel && character.level < condition.minLevel) {
      return { met: false, reason: `需要等级 ${condition.minLevel}` };
    }

    // 任务条件
    if (condition.requiredQuest && !character.completedQuests?.includes(condition.requiredQuest)) {
      return { met: false, reason: '需要完成前置任务' };
    }

    // 物品条件
    if (condition.requiredItem && !character.inventory?.hasItem(condition.requiredItem)) {
      return { met: false, reason: '缺少必要物品' };
    }

    return { met: true, reason: '' };
  }

  /**
   * 检查角色是否在传送点范围内
   * @param {Object} position - 角色位置 {x, y}
   * @returns {boolean}
   */
  isInRange(position) {
    const dx = position.x - this.position.x;
    const dy = position.y - this.position.y;
    return Math.sqrt(dx * dx + dy * dy) <= this.radius;
  }

  /**
   * 解锁传送点
   */
  unlock() {
    this.isUnlocked = true;
  }
}

/**
 * 游戏地图类
 */
export class GameMap {
  /**
   * @param {Object} config - 地图配置
   * @param {string} config.id - 地图ID
   * @param {string} config.name - 地图名称
   * @param {string} config.description - 地图描述
   * @param {number} config.width - 地图宽度
   * @param {number} config.height - 地图高度
   * @param {number} config.minLevel - 最低等级要求
   * @param {string} config.bgColor - 背景颜色
   * @param {Array} config.portals - 传送点列表
   * @param {Array} config.spawnPoints - 刷怪点列表
   * @param {Object} config.playerSpawn - 玩家出生点
   */
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description || '';
    this.width = config.width || 2000;
    this.height = config.height || 2000;
    this.minLevel = config.minLevel || 1;
    this.bgColor = config.bgColor || '#2a4a2a';
    this.state = MapState.LOCKED;
    
    // 传送点
    this.portals = new Map();
    if (config.portals) {
      for (const portalConfig of config.portals) {
        const portal = new Portal(portalConfig);
        this.portals.set(portal.id, portal);
      }
    }
    
    // 刷怪点
    this.spawnPoints = config.spawnPoints || [];
    
    // 玩家出生点
    this.playerSpawn = config.playerSpawn || { x: 100, y: 100 };
    
    // 地图数据（障碍物、装饰等）
    this.obstacles = config.obstacles || [];
    this.decorations = config.decorations || [];
  }

  /**
   * 获取传送点
   * @param {string} portalId - 传送点ID
   * @returns {Portal|null}
   */
  getPortal(portalId) {
    return this.portals.get(portalId) || null;
  }

  /**
   * 获取所有传送点
   * @returns {Array<Portal>}
   */
  getAllPortals() {
    return Array.from(this.portals.values());
  }

  /**
   * 检查位置是否在传送点范围内
   * @param {Object} position - 位置 {x, y}
   * @returns {Portal|null} 返回触发的传送点或null
   */
  checkPortalTrigger(position) {
    for (const portal of this.portals.values()) {
      if (portal.isInRange(position)) {
        return portal;
      }
    }
    return null;
  }

  /**
   * 解锁地图
   */
  unlock() {
    if (this.state === MapState.LOCKED) {
      this.state = MapState.UNLOCKED;
    }
  }

  /**
   * 标记地图完成
   */
  complete() {
    this.state = MapState.COMPLETED;
  }

  /**
   * 检查角色是否可以进入地图
   * @param {Object} character - 角色数据
   * @returns {Object} {canEnter: boolean, reason: string}
   */
  canEnter(character) {
    if (this.state === MapState.LOCKED) {
      return { canEnter: false, reason: '地图未解锁' };
    }

    if (character.level < this.minLevel) {
      return { canEnter: false, reason: `需要等级 ${this.minLevel}` };
    }

    return { canEnter: true, reason: '' };
  }
}


/**
 * 地图系统主类
 */
export class MapSystem {
  constructor() {
    this.maps = new Map();
    this.currentMapId = null;
    this.previousMapId = null;
    this.isTransitioning = false;
    this.transitionProgress = 0;
    this.transitionDuration = 500; // 毫秒
    
    // 回调函数
    this.onMapChange = null;
    this.onPortalTrigger = null;
    this.onTransitionStart = null;
    this.onTransitionEnd = null;
    
    // 初始化默认地图
    this.initializeDefaultMaps();
  }

  /**
   * 初始化默认地图
   */
  initializeDefaultMaps() {
    // 新手村
    this.addMap(new GameMap({
      id: 'starter_village',
      name: '新手村',
      description: '冒险者的起点，安全的村庄',
      width: 1500,
      height: 1500,
      minLevel: 1,
      bgColor: '#3a5a3a',
      playerSpawn: { x: 750, y: 750 },
      portals: [
        {
          id: 'portal_to_forest',
          name: '前往绿野森林',
          type: PortalType.NORMAL,
          position: { x: 1400, y: 750 },
          targetMapId: 'green_forest',
          targetPosition: { x: 100, y: 500 },
          radius: 40
        },
        {
          id: 'portal_to_cave',
          name: '前往矿洞',
          type: PortalType.DUNGEON,
          position: { x: 750, y: 100 },
          targetMapId: 'mine_cave',
          targetPosition: { x: 400, y: 700 },
          unlockCondition: { minLevel: 5 },
          radius: 40
        }
      ],
      spawnPoints: [
        { x: 300, y: 300, enemyType: 'slime', count: 3, respawnTime: 30 },
        { x: 1200, y: 300, enemyType: 'slime', count: 3, respawnTime: 30 },
        { x: 300, y: 1200, enemyType: 'goblin', count: 2, respawnTime: 45 }
      ]
    }));

    // 绿野森林
    this.addMap(new GameMap({
      id: 'green_forest',
      name: '绿野森林',
      description: '茂密的森林，栖息着各种野兽',
      width: 2000,
      height: 2000,
      minLevel: 3,
      bgColor: '#2a4a2a',
      playerSpawn: { x: 100, y: 500 },
      portals: [
        {
          id: 'portal_to_village',
          name: '返回新手村',
          type: PortalType.NORMAL,
          position: { x: 50, y: 500 },
          targetMapId: 'starter_village',
          targetPosition: { x: 1350, y: 750 },
          radius: 40
        },
        {
          id: 'portal_to_swamp',
          name: '前往毒沼泽',
          type: PortalType.NORMAL,
          position: { x: 1900, y: 1000 },
          targetMapId: 'poison_swamp',
          targetPosition: { x: 100, y: 500 },
          unlockCondition: { minLevel: 8 },
          radius: 40
        },
        {
          id: 'portal_forest_boss',
          name: '森林深处',
          type: PortalType.BOSS,
          position: { x: 1000, y: 1900 },
          targetMapId: 'forest_boss_area',
          targetPosition: { x: 400, y: 100 },
          unlockCondition: { minLevel: 10 },
          radius: 50
        }
      ],
      spawnPoints: [
        { x: 500, y: 500, enemyType: 'wolf', count: 4, respawnTime: 40 },
        { x: 1500, y: 500, enemyType: 'wolf', count: 4, respawnTime: 40 },
        { x: 1000, y: 1000, enemyType: 'bear', count: 2, respawnTime: 60 },
        { x: 500, y: 1500, enemyType: 'goblin', count: 5, respawnTime: 35 }
      ]
    }));

    // 矿洞
    this.addMap(new GameMap({
      id: 'mine_cave',
      name: '废弃矿洞',
      description: '黑暗的矿洞，充满危险',
      width: 1200,
      height: 800,
      minLevel: 5,
      bgColor: '#1a1a2a',
      playerSpawn: { x: 400, y: 700 },
      portals: [
        {
          id: 'portal_cave_exit',
          name: '离开矿洞',
          type: PortalType.NORMAL,
          position: { x: 400, y: 750 },
          targetMapId: 'starter_village',
          targetPosition: { x: 750, y: 150 },
          radius: 40
        }
      ],
      spawnPoints: [
        { x: 300, y: 400, enemyType: 'skeleton', count: 3, respawnTime: 50 },
        { x: 900, y: 400, enemyType: 'skeleton', count: 3, respawnTime: 50 },
        { x: 600, y: 200, enemyType: 'bat', count: 5, respawnTime: 30 }
      ]
    }));

    // 毒沼泽
    this.addMap(new GameMap({
      id: 'poison_swamp',
      name: '毒沼泽',
      description: '危险的沼泽地带，毒气弥漫',
      width: 1800,
      height: 1800,
      minLevel: 8,
      bgColor: '#2a3a2a',
      playerSpawn: { x: 100, y: 500 },
      portals: [
        {
          id: 'portal_swamp_to_forest',
          name: '返回绿野森林',
          type: PortalType.NORMAL,
          position: { x: 50, y: 500 },
          targetMapId: 'green_forest',
          targetPosition: { x: 1850, y: 1000 },
          radius: 40
        },
        {
          id: 'portal_to_castle',
          name: '前往古堡',
          type: PortalType.NORMAL,
          position: { x: 1700, y: 900 },
          targetMapId: 'ancient_castle',
          targetPosition: { x: 500, y: 900 },
          unlockCondition: { minLevel: 12 },
          radius: 40
        }
      ],
      spawnPoints: [
        { x: 500, y: 500, enemyType: 'poison_frog', count: 4, respawnTime: 35 },
        { x: 1300, y: 500, enemyType: 'swamp_creature', count: 3, respawnTime: 45 },
        { x: 900, y: 1300, enemyType: 'poison_snake', count: 5, respawnTime: 40 }
      ]
    }));

    // 森林Boss区域
    this.addMap(new GameMap({
      id: 'forest_boss_area',
      name: '森林深处',
      description: '森林之王的领地',
      width: 800,
      height: 800,
      minLevel: 10,
      bgColor: '#1a3a1a',
      playerSpawn: { x: 400, y: 100 },
      portals: [
        {
          id: 'portal_boss_exit',
          name: '离开森林深处',
          type: PortalType.NORMAL,
          position: { x: 400, y: 50 },
          targetMapId: 'green_forest',
          targetPosition: { x: 1000, y: 1850 },
          radius: 40
        }
      ],
      spawnPoints: [
        { x: 400, y: 600, enemyType: 'forest_king', count: 1, respawnTime: 300, isBoss: true }
      ]
    }));

    // 古堡
    this.addMap(new GameMap({
      id: 'ancient_castle',
      name: '古堡废墟',
      description: '神秘的古代城堡遗迹',
      width: 2000,
      height: 2000,
      minLevel: 12,
      bgColor: '#2a2a3a',
      playerSpawn: { x: 500, y: 900 },
      portals: [
        {
          id: 'portal_castle_to_swamp',
          name: '返回毒沼泽',
          type: PortalType.NORMAL,
          position: { x: 450, y: 950 },
          targetMapId: 'poison_swamp',
          targetPosition: { x: 1650, y: 900 },
          radius: 40
        },
        {
          id: 'portal_castle_boss',
          name: '城堡大厅',
          type: PortalType.BOSS,
          position: { x: 1000, y: 200 },
          targetMapId: 'castle_throne',
          targetPosition: { x: 500, y: 700 },
          unlockCondition: { minLevel: 15 },
          radius: 50
        }
      ],
      spawnPoints: [
        { x: 800, y: 800, enemyType: 'skeleton_knight', count: 3, respawnTime: 55 },
        { x: 1200, y: 600, enemyType: 'ghost', count: 4, respawnTime: 45 },
        { x: 1500, y: 1200, enemyType: 'vampire', count: 2, respawnTime: 70 }
      ]
    }));

    // 城堡王座
    this.addMap(new GameMap({
      id: 'castle_throne',
      name: '城堡王座',
      description: '古堡的核心，黑暗领主的居所',
      width: 1000,
      height: 800,
      minLevel: 15,
      bgColor: '#1a1a2a',
      playerSpawn: { x: 500, y: 700 },
      portals: [
        {
          id: 'portal_throne_exit',
          name: '离开王座厅',
          type: PortalType.NORMAL,
          position: { x: 500, y: 750 },
          targetMapId: 'ancient_castle',
          targetPosition: { x: 1000, y: 250 },
          radius: 40
        }
      ],
      spawnPoints: [
        { x: 500, y: 200, enemyType: 'dark_lord', count: 1, respawnTime: 600, isBoss: true }
      ]
    }));

    // 解锁新手村
    this.getMap('starter_village')?.unlock();
  }

  /**
   * 添加地图
   * @param {GameMap} map - 地图实例
   */
  addMap(map) {
    this.maps.set(map.id, map);
  }

  /**
   * 获取地图
   * @param {string} mapId - 地图ID
   * @returns {GameMap|null}
   */
  getMap(mapId) {
    return this.maps.get(mapId) || null;
  }

  /**
   * 获取当前地图
   * @returns {GameMap|null}
   */
  getCurrentMap() {
    return this.currentMapId ? this.getMap(this.currentMapId) : null;
  }

  /**
   * 获取所有地图
   * @returns {Array<GameMap>}
   */
  getAllMaps() {
    return Array.from(this.maps.values());
  }

  /**
   * 获取已解锁的地图
   * @returns {Array<GameMap>}
   */
  getUnlockedMaps() {
    return this.getAllMaps().filter(map => map.state !== MapState.LOCKED);
  }

  /**
   * 切换地图
   * @param {string} targetMapId - 目标地图ID
   * @param {Object} character - 角色数据
   * @param {Object} targetPosition - 目标位置（可选）
   * @returns {Object} {success: boolean, message: string}
   */
  changeMap(targetMapId, character, targetPosition = null) {
    const targetMap = this.getMap(targetMapId);
    if (!targetMap) {
      return { success: false, message: '目标地图不存在' };
    }

    const canEnter = targetMap.canEnter(character);
    if (!canEnter.canEnter) {
      return { success: false, message: canEnter.reason };
    }

    // 开始过渡动画
    this.startTransition(() => {
      this.previousMapId = this.currentMapId;
      this.currentMapId = targetMapId;
      
      // 设置角色位置
      const spawnPosition = targetPosition || targetMap.playerSpawn;
      if (character.transform) {
        character.transform.position.x = spawnPosition.x;
        character.transform.position.y = spawnPosition.y;
      }
      
      // 触发地图变更回调
      this.onMapChange && this.onMapChange(targetMap, this.previousMapId);
    });

    return { success: true, message: `正在前往 ${targetMap.name}` };
  }

  /**
   * 使用传送点
   * @param {string} portalId - 传送点ID
   * @param {Object} character - 角色数据
   * @returns {Object} {success: boolean, message: string}
   */
  usePortal(portalId, character) {
    const currentMap = this.getCurrentMap();
    if (!currentMap) {
      return { success: false, message: '当前地图无效' };
    }

    const portal = currentMap.getPortal(portalId);
    if (!portal) {
      return { success: false, message: '传送点不存在' };
    }

    const canUse = portal.canUse(character);
    if (!canUse.canUse) {
      return { success: false, message: canUse.reason };
    }

    // 触发传送点回调
    this.onPortalTrigger && this.onPortalTrigger(portal);

    // 切换地图
    return this.changeMap(portal.targetMapId, character, portal.targetPosition);
  }

  /**
   * 检查角色位置是否触发传送点
   * @param {Object} position - 角色位置
   * @param {Object} character - 角色数据
   * @returns {Portal|null}
   */
  checkPortalAtPosition(position, character) {
    const currentMap = this.getCurrentMap();
    if (!currentMap) return null;

    const portal = currentMap.checkPortalTrigger(position);
    if (portal && portal.canUse(character).canUse) {
      return portal;
    }
    return null;
  }

  /**
   * 开始过渡动画
   * @param {Function} onComplete - 完成回调
   */
  startTransition(onComplete) {
    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.onTransitionStart && this.onTransitionStart();

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      this.transitionProgress = Math.min(elapsed / this.transitionDuration, 1);

      if (this.transitionProgress >= 0.5 && onComplete) {
        onComplete();
        onComplete = null; // 只执行一次
      }

      if (this.transitionProgress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isTransitioning = false;
        this.onTransitionEnd && this.onTransitionEnd();
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * 解锁地图
   * @param {string} mapId - 地图ID
   * @returns {boolean}
   */
  unlockMap(mapId) {
    const map = this.getMap(mapId);
    if (map) {
      map.unlock();
      return true;
    }
    return false;
  }

  /**
   * 获取地图进度信息
   * @returns {Object}
   */
  getProgressInfo() {
    const allMaps = this.getAllMaps();
    const unlockedMaps = this.getUnlockedMaps();
    const completedMaps = allMaps.filter(map => map.state === MapState.COMPLETED);

    return {
      total: allMaps.length,
      unlocked: unlockedMaps.length,
      completed: completedMaps.length,
      progress: allMaps.length > 0 ? (unlockedMaps.length / allMaps.length) * 100 : 0
    };
  }

  /**
   * 渲染过渡效果
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width - 画布宽度
   * @param {number} height - 画布高度
   */
  renderTransition(ctx, width, height) {
    if (!this.isTransitioning) return;

    // 淡入淡出效果
    let alpha;
    if (this.transitionProgress < 0.5) {
      alpha = this.transitionProgress * 2;
    } else {
      alpha = (1 - this.transitionProgress) * 2;
    }

    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, width, height);

    // 显示加载文字
    if (alpha > 0.3) {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('传送中...', width / 2, height / 2);
    }
  }

  /**
   * 设置回调函数
   */
  setOnMapChange(callback) {
    this.onMapChange = callback;
  }

  setOnPortalTrigger(callback) {
    this.onPortalTrigger = callback;
  }

  setOnTransitionStart(callback) {
    this.onTransitionStart = callback;
  }

  setOnTransitionEnd(callback) {
    this.onTransitionEnd = callback;
  }
}
