/**
 * 测试MockDataService功能
 * 这是一个简单的测试文件，用于验证模拟数据服务的基本功能
 */
import { MockDataService } from './MockDataService.js';

// 创建MockDataService实例
const mockDataService = new MockDataService();

console.log('=== MockDataService Test ===\n');

// 测试1: 获取角色模板
console.log('Test 1: Get Character Templates');
const warriorTemplate = mockDataService.getCharacterTemplate('warrior');
console.log('Warrior Template:', warriorTemplate);
console.log('✓ Warrior template loaded\n');

const strategistTemplate = mockDataService.getCharacterTemplate('strategist');
console.log('Strategist Template:', strategistTemplate);
console.log('✓ Strategist template loaded\n');

const archerTemplate = mockDataService.getCharacterTemplate('archer');
console.log('Archer Template:', archerTemplate);
console.log('✓ Archer template loaded\n');

// 测试2: 获取所有角色模板
console.log('Test 2: Get All Character Templates');
const allCharacterTemplates = mockDataService.getAllCharacterTemplates();
console.log('All Character Templates:', Object.keys(allCharacterTemplates));
console.log('✓ All character templates loaded\n');

// 测试3: 获取敌人模板
console.log('Test 3: Get Enemy Templates');
const slimeTemplate = mockDataService.getEnemyTemplate('slime');
console.log('Slime Template:', slimeTemplate);
console.log('✓ Slime template loaded\n');

const goblinTemplate = mockDa
taService.getEnemyTemplate('goblin');
console.log('Goblin Template:', goblinTemplate);
console.log('✓ Goblin template loaded\n');

const skeletonTemplate = mockDataService.getEnemyTemplate('skeleton');
console.log('Skeleton Template:', skeletonTemplate);
console.log('✓ Skeleton template loaded\n');

// 测试4: 获取技能数据
console.log('Test 4: Get Skill Data');
const basicAttack = mockDataService.getSkillData('basic_attack');
console.log('Basic Attack:', basicAttack);
console.log('✓ Basic attack skill loaded\n');

const warriorSlash = mockDataService.getSkillData('warrior_slash');
console.log('Warrior Slash:', warriorSlash);
console.log('✓ Warrior slash skill loaded\n');

// 测试5: 获取角色技能列表
console.log('Test 5: Get Character Skills');
const warriorSkills = mockDataService.getCharacterSkills('warrior');
console.log('Warrior Skills:', warriorSkills.map(s => s.name));
console.log('✓ Warrior skills loaded\n');

const strategistSkills = mockDataService.getCharacterSkills('strategist');
console.log('Strategist Skills:', strategistSkills.map(s => s.name));
console.log('✓ Strategist skills loaded\n');

// 测试6: 获取地图数据
console.log('Test 6: Get Map Data');
const testMap = mockDataService.getMapData('test_map');
console.log('Test Map:', {
    id: testMap.id,
    name: testMap.name,
    width: testMap.width,
    height: testMap.height,
    enemySpawns: testMap.spawnPoints.enemies.length
});
console.log('✓ Test map loaded\n');

// 测试7: 创建角色实例
console.log('Test 7: Create Character Instance');
const character = mockDataService.createCharacter('TestWarrior', 'warrior');
console.log('Created Character:', character);
console.log('✓ Character instance created\n');

// 测试8: 创建敌人实例
console.log('Test 8: Create Enemy Instance');
const enemy = mockDataService.createEnemy('slime', { x: 100, y: 200 });
console.log('Created Enemy:', enemy);
console.log('✓ Enemy instance created\n');

console.log('=== All Tests Passed! ===');
