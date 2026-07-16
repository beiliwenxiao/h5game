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
 * 模拟数据服务
 * 提供角色、敌人、技能、地图和装备的模拟数据
 */
import { EquipmentData } from './EquipmentData.js';
import { ItemData } from './ItemData.js';

export class MockDataService {
    constructor() {
        // 初始化所有模拟数据
        this.characterTemplates = this.initCharacterTemplates();
        this.enemyTemplates = this.initEnemyTemplates();
        this.skillData = this.initSkillData();
        this.mapData = this.initMapData();
        this.equipmentData = new EquipmentData();
        this.itemData = new ItemData();
    }

    /**
     * 初始化角色模板数据
     */
    initCharacterTemplates() {
        return {
            warrior: {
                id: 'warrior',
                name: '战士',
                class: 'warrior',
                description: '近战物理职业，拥有高生命值和防御力',
                baseStats: {
                    hp: 150,
                    maxHp: 150,
                    mp: 50,
                    maxMp: 50,
                    attack: 15,
                    defense: 10,
                    speed: 100,
                    mainElement: 0, // 火元素
                    elementAttack: { 0: 10, 9: 5 }, // 火攻击10，土攻击5
                    elementDefense: { 0: 8, 9: 12 }, // 火防御8，土防御12
                    unitType: 0 // 刀盾步兵
                },
                skills: ['basic_attack', 'warrior_slash', 'warrior_charge', 'warrior_defense'],
                spriteSheet: 'warrior_sprite',
                startPosition: { x: 400, y: 300 }
            },
            mage: {
                id: 'mage',
                name: '法师',
                class: 'mage',
                description: '远程魔法职业，拥有高魔法值和魔法攻击力',
                baseStats: {
                    hp: 80,
                    maxHp: 80,
                    mp: 150,
                    maxMp: 150,
                    attack: 8,
                    defense: 5,
                    speed: 90,
                    mainElement: 2, // 水元素
                    elementAttack: { 2: 15, 5: 8 }, // 水攻击15，电攻击8
                    elementDefense: { 2: 10, 5: 6 }, // 水防御10，电防御6
                    unitType: 3 // 弓弩兵
                },
                skills: ['basic_attack', 'mage_fireball', 'mage_ice_lance', 'mage_heal'],
                spriteSheet: 'mage_sprite',
                startPosition: { x: 400, y: 300 }
            },
            archer: {
                id: 'archer',
                name: '弓箭手',
                class: 'archer',
                description: '远程物理职业，拥有高攻击速度和闪避',
                baseStats: {
                    hp: 100,
                    maxHp: 100,
                    mp: 80,
                    maxMp: 80,
                    attack: 12,
                    defense: 6,
                    speed: 120,
                    mainElement: 4, // 风元素
                    elementAttack: { 4: 12, 11: 6 }, // 风攻击12，木攻击6
                    elementDefense: { 4: 8, 11: 10 }, // 风防御8，木防御10
                    unitType: 3 // 弓弩兵
                },
                skills: ['basic_attack', 'archer_multi_shot', 'archer_poison_arrow', 'archer_trap'],
                spriteSheet: 'archer_sprite',
                startPosition: { x: 400, y: 300 }
            }
        };
    }

    /**
     * 初始化敌人模板数据
     */
    initEnemyTemplates() {
        return {
            slime: {
                id: 'slime',
                name: '史莱姆',
                type: 'enemy',
                level: 1,
                description: '最弱的怪物，移动缓慢',
                stats: {
                    hp: 30,
                    maxHp: 30,
                    attack: 5,
                    defense: 2,
                    speed: 50,
                    mainElement: 2, // 水元素
                    elementAttack: { 2: 3 }, // 水攻击3
                    elementDefense: { 2: 5, 0: 2 }, // 水防御5，火防御2
                    unitType: 0 // 刀盾步兵
                },
                aiType: 'passive',
                attackRange: 30,
                detectionRange: 100,
                expReward: 10,
                lootTable: [
                    { itemId: 'slime_gel', chance: 0.5, quantity: 1 }
                ],
                spriteSheet: 'slime_sprite'
            },
            goblin: {
                id: 'goblin',
                name: '哥布林',
                type: 'enemy',
                level: 3,
                description: '狡猾的小怪物，会主动攻击',
                stats: {
                    hp: 60,
                    maxHp: 60,
                    attack: 10,
                    defense: 5,
                    speed: 80,
                    mainElement: 11, // 木元素
                    elementAttack: { 11: 6, 9: 3 }, // 木攻击6，土攻击3
                    elementDefense: { 11: 4, 9: 7 }, // 木防御4，土防御7
                    unitType: 3 // 弓弩兵
                },
                aiType: 'aggressive',
                attackRange: 40,
                detectionRange: 150,
                expReward: 25,
                lootTable: [
                    { itemId: 'goblin_ear', chance: 0.3, quantity: 1 },
                    { itemId: 'rusty_dagger', chance: 0.1, quantity: 1 }
                ],
                spriteSheet: 'goblin_sprite'
            },
            skeleton: {
                id: 'skeleton',
                name: '骷髅',
                type: 'enemy',
                level: 5,
                description: '不死生物，拥有较高的攻击力',
                stats: {
                    hp: 80,
                    maxHp: 80,
                    attack: 15,
                    defense: 8,
                    speed: 70,
                    mainElement: 9, // 土元素
                    elementAttack: { 9: 8, 0: 4 }, // 土攻击8，火攻击4
                    elementDefense: { 9: 6, 0: 3 }, // 土防御6，火防御3
                    unitType: 6 // 长枪兵
                },
                aiType: 'patrol',
                attackRange: 50,
                detectionRange: 200,
                expReward: 40,
                lootTable: [
                    { itemId: 'bone', chance: 0.6, quantity: 2 },
                    { itemId: 'rusty_sword', chance: 0.15, quantity: 1 }
                ],
                spriteSheet: 'skeleton_sprite'
            }
        };
    }

    /**
     * 初始化技能数据
     */
    initSkillData() {
        return {
            // 通用技能
            basic_attack: {
                id: 'basic_attack',
                name: '普通攻击',
                description: '基础物理攻击',
                icon: 'icon_basic_attack',
                type: 'physical',
                cooldown: 1.0,
                manaCost: 0,
                castTime: 0.3,
                range: 50,
                damage: 1.0, // 伤害倍率（基于攻击力）
                elementType: null, // 使用角色主元素
                effects: [],
                animation: 'attack',
                particleEffect: 'slash'
            },
            
            // 战士技能
            warrior_slash: {
                id: 'warrior_slash',
                name: '强力斩击',
                description: '造成150%火元素物理伤害',
                icon: 'icon_warrior_slash',
                type: 'physical',
                cooldown: 5.0,
                manaCost: 15,
                castTime: 0.5,
                range: 60,
                damage: 1.5,
                elementType: 0, // 火元素
                effects: [],
                animation: 'skill_1',
                particleEffect: 'slash_heavy'
            },
            warrior_charge: {
                id: 'warrior_charge',
                name: '冲锋',
                description: '冲向目标并造成土元素伤害，眩晕1秒',
                icon: 'icon_warrior_charge',
                type: 'physical',
                cooldown: 10.0,
                manaCost: 20,
                castTime: 0.2,
                range: 200,
                damage: 1.2,
                elementType: 9, // 土元素
                effects: [
                    { type: 'stun', duration: 1.0 }
                ],
                animation: 'skill_2',
                particleEffect: 'charge_trail'
            },
            warrior_defense: {
                id: 'warrior_defense',
                name: '防御姿态',
                description: '提高50%防御力，持续5秒',
                icon: 'icon_warrior_defense',
                type: 'buff',
                cooldown: 15.0,
                manaCost: 10,
                castTime: 0.1,
                range: 0,
                damage: 0,
                elementType: null, // 无元素
                effects: [
                    { type: 'defense_buff', value: 0.5, duration: 5.0 }
                ],
                animation: 'skill_3',
                particleEffect: 'shield_glow'
            },
            
            // 法师技能
            mage_fireball: {
                id: 'mage_fireball',
                name: '火球术',
                description: '发射火球造成火元素魔法伤害',
                icon: 'icon_mage_fireball',
                type: 'magic',
                cooldown: 3.0,
                manaCost: 25,
                castTime: 1.0,
                range: 300,
                damage: 2.0,
                elementType: 0, // 火元素
                effects: [
                    { type: 'burn', damage: 5, duration: 3.0 }
                ],
                animation: 'skill_1',
                particleEffect: 'fireball'
            },
            mage_ice_lance: {
                id: 'mage_ice_lance',
                name: '冰枪术',
                description: '发射冰枪造成冰元素伤害并减速',
                icon: 'icon_mage_ice_lance',
                type: 'magic',
                cooldown: 4.0,
                manaCost: 30,
                castTime: 0.8,
                range: 250,
                damage: 1.8,
                elementType: 3, // 冰元素
                effects: [
                    { type: 'slow', value: 0.5, duration: 2.0 }
                ],
                animation: 'skill_2',
                particleEffect: 'ice_lance'
            },
            mage_heal: {
                id: 'mage_heal',
                name: '治疗术',
                description: '恢复生命值',
                icon: 'icon_mage_heal',
                type: 'heal',
                cooldown: 8.0,
                manaCost: 40,
                castTime: 1.5,
                range: 0,
                damage: 0,
                elementType: null, // 无元素
                effects: [
                    { type: 'heal', value: 50 }
                ],
                animation: 'skill_3',
                particleEffect: 'heal_glow'
            },
            
            // 弓箭手技能
            archer_multi_shot: {
                id: 'archer_multi_shot',
                name: '多重射击',
                description: '同时射出3支风元素箭',
                icon: 'icon_archer_multi_shot',
                type: 'physical',
                cooldown: 6.0,
                manaCost: 20,
                castTime: 0.5,
                range: 250,
                damage: 0.7,
                elementType: 4, // 风元素
                effects: [
                    { type: 'multi_hit', count: 3 }
                ],
                animation: 'skill_1',
                particleEffect: 'arrow_multi'
            },
            archer_poison_arrow: {
                id: 'archer_poison_arrow',
                name: '毒箭',
                description: '射出木元素毒箭，造成持续伤害',
                icon: 'icon_archer_poison_arrow',
                type: 'physical',
                cooldown: 8.0,
                manaCost: 25,
                castTime: 0.6,
                range: 300,
                damage: 1.0,
                elementType: 11, // 木元素
                effects: [
                    { type: 'poison', damage: 8, duration: 5.0 }
                ],
                animation: 'skill_2',
                particleEffect: 'poison_arrow'
            },
            archer_trap: {
                id: 'archer_trap',
                name: '陷阱',
                description: '放置土元素陷阱，敌人触发时造成伤害和定身',
                icon: 'icon_archer_trap',
                type: 'physical',
                cooldown: 12.0,
                manaCost: 30,
                castTime: 1.0,
                range: 100,
                damage: 1.5,
                elementType: 9, // 土元素
                effects: [
                    { type: 'root', duration: 2.0 }
                ],
                animation: 'skill_3',
                particleEffect: 'trap'
            }
        };
    }

    /**
     * 初始化地图数据
     */
    initMapData() {
        return {
            test_map: {
                id: 'test_map',
                name: '测试地图',
                width: 2000,
                height: 1500,
                tileSize: 32,
                backgroundColor: '#2d5016',
                layers: {
                    // 背景层（简化为纯色，后续可扩展为瓦片地图）
                    background: [],
                    // 碰撞层（true表示有障碍物）
                    collision: this.generateTestCollisionMap(2000, 1500, 32),
                    // 装饰层
                    decoration: []
                },
                spawnPoints: {
                    player: { x: 400, y: 300 },
                    enemies: [
                        { templateId: 'slime', x: 600, y: 400, count: 3 },
                        { templateId: 'slime', x: 800, y: 500, count: 2 },
                        { templateId: 'goblin', x: 1000, y: 600, count: 2 },
                        { templateId: 'goblin', x: 1200, y: 400, count: 1 },
                        { templateId: 'skeleton', x: 1400, y: 700, count: 1 }
                    ]
                },
                boundaries: {
                    minX: 0,
                    minY: 0,
                    maxX: 2000,
                    maxY: 1500
                }
            },
            // M3 示例：多楼层地图（ground + upper，一个 portal）
            test_multifloor_map: {
                id: 'test_multifloor_map',
                name: '多层测试地图',
                width: 2000,
                height: 1500,
                tileSize: 32,
                backgroundColor: '#2d5016',
                defaultFloor: 'ground',
                floors: [
                    {
                        id: 'ground',
                        elevation: 0,
                        tileSize: 32,
                        collision: this.generateTestCollisionMap(2000, 1500, 32),
                        tiles: [],
                        portals: [
                            { x: 1000, z: 750, radius: 32, toFloor: 'upper', toX: 1000, toZ: 750, trigger: 'touch' }
                        ]
                    },
                    {
                        id: 'upper',
                        elevation: 80,
                        tileSize: 32,
                        collision: this.generateTestCollisionMap(2000, 1500, 32),
                        tiles: [],
                        portals: [
                            { x: 1000, z: 750, radius: 32, toFloor: 'ground', toX: 1000, toZ: 750, trigger: 'touch' }
                        ]
                    }
                ],
                spawnPoints: {
                    player: { x: 400, y: 300 },
                    enemies: [
                        { templateId: 'slime', x: 800, y: 600, count: 2 }
                    ]
                },
                boundaries: { minX: 0, minY: 0, maxX: 2000, maxY: 1500 }
            }
        };
    }

    /**
     * 生成测试用的碰撞地图
     */
    generateTestCollisionMap(width, height, tileSize) {
        const cols = Math.ceil(width / tileSize);
        const rows = Math.ceil(height / tileSize);
        const collisionMap = [];

        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                // 边界设为障碍物
                if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
                    row.push(true);
                }
                // 不添加随机障碍物，保持地图干净
                else {
                    row.push(false);
                }
            }
            collisionMap.push(row);
        }

        return collisionMap;
    }

    /**
     * 获取角色模板
     */
    getCharacterTemplate(classType) {
        return this.characterTemplates[classType] || null;
    }

    /**
     * 获取所有角色模板
     */
    getAllCharacterTemplates() {
        return this.characterTemplates;
    }

    /**
     * 获取敌人模板
     */
    getEnemyTemplate(enemyId) {
        return this.enemyTemplates[enemyId] || null;
    }

    /**
     * 获取所有敌人模板
     */
    getAllEnemyTemplates() {
        return this.enemyTemplates;
    }

    /**
     * 获取技能数据
     */
    getSkillData(skillId) {
        return this.skillData[skillId] || null;
    }

    /**
     * 获取角色的所有技能
     */
    getCharacterSkills(classType) {
        const template = this.getCharacterTemplate(classType);
        if (!template) return [];
        
        return template.skills.map(skillId => this.getSkillData(skillId)).filter(skill => skill !== null);
    }

    /**
     * 获取地图数据
     * 若地图无 floors 定义，会自动用 layers.collision 包装为单层
     */
    getMapData(mapId) {
        const raw = this.mapData[mapId];
        if (!raw) return null;
        return this._normalizeMapData(raw);
    }

    /**
     * 统一填充 floors[] 兜底，兼容单层旧地图
     * @private
     */
    _normalizeMapData(map) {
        if (!map) return map;
        // 已有 floors 则直接返回（避免每次重建对象）
        if (Array.isArray(map.floors) && map.floors.length > 0) return map;
        const collision = map.layers?.collision ?? null;
        map.defaultFloor = map.defaultFloor ?? 'ground';
        map.floors = [
            {
                id: 'ground',
                elevation: 0,
                tileSize: map.tileSize ?? 32,
                collision,
                tiles: map.layers?.background ?? [],
                portals: []
            }
        ];
        return map;
    }

    /**
     * 创建角色实例
     */
    createCharacter(name, classType) {
        const template = this.getCharacterTemplate(classType);
        if (!template) {
            throw new Error(`Unknown character class: ${classType}`);
        }

        return {
            id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            class: classType,
            level: 1,
            exp: 0,
            expToNextLevel: 100,
            skillPoints: 3, // 初始技能点
            attributePoints: 15, // 初始属性点（3级*5点）
            stats: { ...template.baseStats },
            skills: [...template.skills],
            equipment: {
                weapon: null,
                armor: null,
                accessory: null
            },
            position: { ...template.startPosition },
            spriteSheet: template.spriteSheet,
            // 初始属性（基础值10点）
            attributes: {
                strength: 10,
                agility: 10,
                intelligence: 10,
                constitution: 10,
                spirit: 10,
                availablePoints: 15, // 初始可用属性点
                totalInvestedPoints: 0
            }
        };
    }

    /**
     * 创建敌人实例
     */
    createEnemy(templateId, position) {
        const template = this.getEnemyTemplate(templateId);
        if (!template) {
            throw new Error(`Unknown enemy template: ${templateId}`);
        }

        return {
            id: `enemy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            templateId: templateId,
            name: template.name,
            type: 'enemy',
            level: template.level,
            stats: { ...template.stats },
            aiType: template.aiType,
            attackRange: template.attackRange,
            detectionRange: template.detectionRange,
            position: position ? { ...position } : { x: 0, y: 0 },
            spriteSheet: template.spriteSheet,
            lootTable: [...template.lootTable],
            expReward: template.expReward
        };
    }

    /**
     * 获取装备数据
     */
    getEquipmentData(equipmentId) {
        return this.equipmentData.getEquipmentTemplate(equipmentId);
    }

    /**
     * 获取所有装备数据
     */
    getAllEquipmentData() {
        return this.equipmentData.getAllEquipmentTemplates();
    }

    /**
     * 创建装备实例
     */
    createEquipment(equipmentId, options = {}) {
        return this.equipmentData.createEquipment(equipmentId, options);
    }

    /**
     * 根据类型获取装备
     */
    getEquipmentsByType(type) {
        return this.equipmentData.getEquipmentsByType(type);
    }

    /**
     * 根据品质获取装备
     */
    getEquipmentsByQuality(quality) {
        return this.equipmentData.getEquipmentsByQuality(quality);
    }

    /**
     * 检查角色是否可以装备
     */
    canCharacterEquip(equipment, character) {
        return this.equipmentData.canEquip(equipment, character);
    }

    /**
     * 获取物品数据
     */
    getItemData(itemId) {
        return this.itemData.getItemTemplate(itemId);
    }

    /**
     * 获取所有物品数据
     */
    getAllItemData() {
        return this.itemData.getAllItemTemplates();
    }

    /**
     * 创建物品实例
     */
    createItem(itemId, quantity = 1) {
        return this.itemData.createItem(itemId, quantity);
    }

    /**
     * 根据类型获取物品
     */
    getItemsByType(type) {
        return this.itemData.getItemsByType(type);
    }

    /**
     * 根据稀有度获取物品
     */
    getItemsByRarity(rarity) {
        return this.itemData.getItemsByRarity(rarity);
    }

    /**
     * 使用物品效果
     */
    useItemEffect(item, target) {
        return this.itemData.useItemEffect(item, target);
    }
}
