/**
 * SkillTreeSystem.test.js
 * 技能树系统单元测试
 */

import { SkillTreeSystem, SkillTreeNode, SkillTree } from './SkillTreeSystem.js';

/**
 * 技能树系统测试套件
 */
export class SkillTreeSystemTest {
  constructor() {
    this.testResults = [];
    this.skillTreeSystem = new SkillTreeSystem();
  }

  /**
   * 运行所有测试
   */
  runAllTests() {
    console.log('开始技能树系统测试...');
    
    this.testSkillTreeNodeCreation();
    this.testSkillTreeNodeCanLearn();
    this.testSkillTreeNodeLearn();
    this.testSkillTreeNodeEffects();
    this.testSkillTreeCreation();
    this.testSkillTreeLearnSkill();
    this.testSkillTreeResetSkills();
    this.testSkillTreeSystemIntegration();
    this.testPrerequisiteChain();
    this.testSkillPointManagement();
    
    this.printResults();
    return this.testResults;
  }

  /**
   * 测试技能树节点创建
   */
  testSkillTreeNodeCreation() {
    const node = new SkillTreeNode({
      id: 'test_skill',
      name: '测试技能',
      description: '这是一个测试技能',
      type: 'passive',
      maxLevel: 3,
      requiredLevel: 5,
      requiredPoints: 2,
      position: { x: 1, y: 1 },
      effects: { attackBonus: 10 }
    });

    this.assert(node.id === 'test_skill', '技能ID设置正确');
    this.assert(node.name === '测试技能', '技能名称设置正确');
    this.assert(node.type === 'passive', '技能类型设置正确');
    this.assert(node.maxLevel === 3, '最大等级设置正确');
    this.assert(node.currentLevel === 0, '初始等级为0');
    this.assert(node.isLearned === false, '初始未学习状态');
    this.assert(node.isUnlocked === false, '初始未解锁状态');
  }

  /**
   * 测试技能学习条件检查
   */
  testSkillTreeNodeCanLearn() {
    const node = new SkillTreeNode({
      id: 'test_skill',
      name: '测试技能',
      type: 'passive',
      maxLevel: 3,
      requiredLevel: 5,
      requiredPoints: 2,
      prerequisites: []
    });

    const character = {
      level: 3,
      skillPoints: 1
    };

    const mockSkillTree = {
      getNode: () => null
    };

    // 等级不足
    this.assert(!node.canLearn(character, mockSkillTree), '等级不足时不能学习');

    // 技能点不足
    character.level = 5;
    this.assert(!node.canLearn(character, mockSkillTree), '技能点不足时不能学习');

    // 条件满足
    character.skillPoints = 2;
    this.assert(node.canLearn(character, mockSkillTree), '条件满足时可以学习');

    // 已达最大等级
    node.currentLevel = 3;
    this.assert(!node.canLearn(character, mockSkillTree), '已达最大等级时不能学习');
  }

  /**
   * 测试技能学习
   */
  testSkillTreeNodeLearn() {
    const node = new SkillTreeNode({
      id: 'test_skill',
      name: '测试技能',
      type: 'passive',
      maxLevel: 3
    });

    // 学习技能
    const success = node.learn();
    this.assert(success === true, '学习技能成功');
    this.assert(node.currentLevel === 1, '技能等级增加');
    this.assert(node.isLearned === true, '技能状态为已学习');

    // 继续学习
    node.learn();
    node.learn();
    this.assert(node.currentLevel === 3, '技能等级达到最大');

    // 尝试超过最大等级
    const failResult = node.learn();
    this.assert(failResult === false, '超过最大等级时学习失败');
    this.assert(node.currentLevel === 3, '等级不会超过最大值');
  }

  /**
   * 测试技能效果计算
   */
  testSkillTreeNodeEffects() {
    const node = new SkillTreeNode({
      id: 'test_skill',
      name: '测试技能',
      type: 'passive',
      maxLevel: 3,
      effects: {
        attackBonus: 5,
        defenseMultiplier: [0.1, 0.15, 0.2],
        staticValue: 'constant'
      }
    });

    // 未学习时无效果
    let effects = node.getCurrentEffects();
    this.assert(Object.keys(effects).length === 0, '未学习时无效果');

    // 学习1级
    node.learn();
    effects = node.getCurrentEffects();
    this.assert(effects.attackBonus === 5, '数值效果正确计算');
    this.assert(effects.defenseMultiplier === 0.1, '数组效果正确取值');
    this.assert(effects.staticValue === 'constant', '静态值正确传递');

    // 学习2级
    node.learn();
    effects = node.getCurrentEffects();
    this.assert(effects.attackBonus === 10, '数值效果按等级倍增');
    this.assert(effects.defenseMultiplier === 0.15, '数组效果按等级索引');
  }

  /**
   * 测试技能树创建
   */
  testSkillTreeCreation() {
    const nodes = [
      new SkillTreeNode({
        id: 'skill1',
        name: '技能1',
        type: 'passive'
      }),
      new SkillTreeNode({
        id: 'skill2',
        name: '技能2',
        type: 'active',
        prerequisites: ['skill1']
      })
    ];

    const skillTree = new SkillTree('test', nodes);
    
    this.assert(skillTree.className === 'test', '职业名称设置正确');
    this.assert(skillTree.getAllNodes().length === 2, '节点数量正确');
    this.assert(skillTree.getNode('skill1') !== null, '可以获取节点');
    this.assert(skillTree.getNode('nonexistent') === null, '不存在的节点返回null');
  }

  /**
   * 测试技能树学习技能
   */
  testSkillTreeLearnSkill() {
    const nodes = [
      new SkillTreeNode({
        id: 'skill1',
        name: '技能1',
        type: 'passive',
        requiredLevel: 1,
        requiredPoints: 1
      })
    ];

    const skillTree = new SkillTree('test', nodes);
    const character = {
      level: 1,
      skillPoints: 1
    };

    // 学习技能
    const success = skillTree.learnSkill(character, 'skill1');
    this.assert(success === true, '学习技能成功');
    this.assert(character.skillPoints === 0, '技能点被消耗');
    this.assert(skillTree.getNode('skill1').isLearned === true, '技能状态更新');
  }

  /**
   * 测试技能树重置
   */
  testSkillTreeResetSkills() {
    const nodes = [
      new SkillTreeNode({
        id: 'skill1',
        name: '技能1',
        type: 'passive',
        requiredLevel: 1,
        requiredPoints: 2,
        maxLevel: 3
      })
    ];

    const skillTree = new SkillTree('test', nodes);
    const character = {
      level: 1,
      skillPoints: 10
    };

    // 学习技能到满级
    skillTree.learnSkill(character, 'skill1');
    skillTree.learnSkill(character, 'skill1');
    skillTree.learnSkill(character, 'skill1');

    this.assert(character.skillPoints === 4, '技能点正确消耗');
    this.assert(skillTree.getNode('skill1').currentLevel === 3, '技能等级正确');

    // 重置技能树
    const returnedPoints = skillTree.resetAllSkills(character);
    this.assert(returnedPoints === 6, '返还技能点正确');
    this.assert(character.skillPoints === 10, '技能点正确返还');
    this.assert(skillTree.getNode('skill1').currentLevel === 0, '技能等级重置');
    this.assert(skillTree.getNode('skill1').isLearned === false, '技能状态重置');
  }

  /**
   * 测试技能树系统集成
   */
  testSkillTreeSystemIntegration() {
    const character = {
      class: 'warrior',
      level: 10,
      skillPoints: 5
    };

    // 获取技能树
    const skillTree = this.skillTreeSystem.getSkillTree('warrior');
    this.assert(skillTree !== null, '可以获取战士技能树');

    // 检查技能是否可学习
    const canLearn = this.skillTreeSystem.canLearnSkill(character, 'warrior_basic_combat');
    this.assert(canLearn === true, '基础技能可以学习');

    // 学习技能
    const success = this.skillTreeSystem.learnSkill(character, 'warrior_basic_combat');
    this.assert(success === true, '学习基础技能成功');

    // 获取被动效果
    const passiveEffects = this.skillTreeSystem.getPassiveEffects(character);
    this.assert(typeof passiveEffects === 'object', '可以获取被动效果');

    // 获取主动技能
    const activeSkills = this.skillTreeSystem.getActiveSkills(character);
    this.assert(Array.isArray(activeSkills), '可以获取主动技能列表');
  }

  /**
   * 测试前置条件链
   */
  testPrerequisiteChain() {
    const character = {
      class: 'warrior',
      level: 15,
      skillPoints: 10
    };

    // 尝试学习需要前置条件的技能
    let canLearn = this.skillTreeSystem.canLearnSkill(character, 'warrior_weapon_mastery');
    this.assert(canLearn === false, '未学习前置技能时不能学习');

    // 学习前置技能
    this.skillTreeSystem.learnSkill(character, 'warrior_basic_combat');
    
    // 再次检查
    canLearn = this.skillTreeSystem.canLearnSkill(character, 'warrior_weapon_mastery');
    this.assert(canLearn === true, '学习前置技能后可以学习');

    // 学习后续技能
    const success = this.skillTreeSystem.learnSkill(character, 'warrior_weapon_mastery');
    this.assert(success === true, '学习后续技能成功');
  }

  /**
   * 测试技能点管理
   */
  testSkillPointManagement() {
    const character = {
      class: 'strategist',
      level: 20,
      skillPoints: 3
    };

    // 学习消耗不同技能点的技能
    let success = this.skillTreeSystem.learnSkill(character, 'strategist_planning_focus');
    this.assert(success === true, '学习1点技能成功');
    this.assert(character.skillPoints === 2, '技能点正确减少');

    // 尝试学习需要更多技能点的技能
    success = this.skillTreeSystem.learnSkill(character, 'strategist_fire_tactics');
    this.assert(success === true, '学习前置技能成功');
    this.assert(character.skillPoints === 1, '技能点继续减少');

    // 技能点不足时无法学习
    let canLearn = this.skillTreeSystem.canLearnSkill(character, 'strategist_fire_attack');
    this.assert(canLearn === false, '技能点不足时不能学习高级技能');
  }

  /**
   * 断言函数
   */
  assert(condition, message) {
    const result = {
      passed: condition,
      message: message,
      timestamp: new Date().toISOString()
    };
    
    this.testResults.push(result);
    
    if (condition) {
      console.log(`✓ ${message}`);
    } else {
      console.error(`✗ ${message}`);
    }
  }

  /**
   * 打印测试结果
   */
  printResults() {
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    
    console.log(`\n技能树系统测试完成: ${passed}/${total} 通过`);
    
    if (passed === total) {
      console.log('🎉 所有测试通过！');
    } else {
      console.log('❌ 部分测试失败');
      this.testResults.filter(r => !r.passed).forEach(result => {
        console.log(`  - ${result.message}`);
      });
    }
  }
}

// 导出测试函数
export function runSkillTreeTests() {
  const test = new SkillTreeSystemTest();
  return test.runAllTests();
}