/**
 * PrologueManager 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrologueManager } from './PrologueManager.js';

// 模拟游戏引擎
function createMockGameEngine() {
    return {
        sceneManager: {
            registerScene: vi.fn(),
            switchTo: vi.fn(),
            getCurrentScene: vi.fn()
        },
        audioManager: {
            addMusic: vi.fn(),
            addSound: vi.fn(),
            playMusic: vi.fn(),
            playSound: vi.fn(),
            stopMusic: vi.fn(),
            hasMusic: vi.fn(() => false),
            hasSound: vi.fn(() => false)
        },
        inputManager: {
            isKeyDown: vi.fn(),
            getMousePosition: vi.fn()
        },
        assetManager: {
            loadAsset: vi.fn()
        },
        errorHandler: {
            handleError: vi.fn()
        }
    };
}

describe('PrologueManager', () => {
    let prologueManager;
    let mockGameEngine;

    beforeEach(() => {
        // 清除localStorage
        localStorage.clear();
        
        // 创建模拟引擎
        mockGameEngine = createMockGameEngine();
        
        // 创建序章管理器
        prologueManager = new PrologueManager(mockGameEngine);
    });

    describe('初始化', () => {
        it('应该正确创建实例', () => {
            expect(prologueManager).toBeDefined();
            expect(prologueManager.isInitialized).toBe(false);
            expect(prologueManager.isActive).toBe(false);
            expect(prologueManager.currentAct).toBe(0);
        });

        it('应该正确初始化', async () => {
            await prologueManager.init();
            
            expect(prologueManager.isInitialized).toBe(true);
            expect(prologueManager.playerData).toBeDefined();
            expect(prologueManager.playerData.name).toBe('');
            expect(prologueManager.playerData.level).toBe(1);
        });

        it('不应该重复初始化', async () => {
            await prologueManager.init();
            const firstInit = prologueManager.isInitialized;
            
            await prologueManager.init();
            
            expect(prologueManager.isInitialized).toBe(firstInit);
        });
    });

    describe('开始序章', () => {
        beforeEach(async () => {
            await prologueManager.init();
        });

        it('应该正确开始序章', () => {
            prologueManager.start('测试角色');
            
            expect(prologueManager.isActive).toBe(true);
            expect(prologueManager.playerData.name).toBe('测试角色');
            expect(prologueManager.currentAct).toBe(1);
        });

        it('应该使用默认角色名', () => {
            prologueManager.start();
            
            expect(prologueManager.playerData.name).toBe('无名氏');
        });
    });

    describe('场景切换', () => {
        beforeEach(async () => {
            await prologueManager.init();
            prologueManager.start('测试角色');
        });

        it('应该正确切换到指定幕', () => {
            prologueManager.goToAct(3);
            
            expect(prologueManager.currentAct).toBe(3);
            expect(mockGameEngine.sceneManager.switchTo).toHaveBeenCalled();
        });

        it('应该拒绝无效的幕数', () => {
            prologueManager.goToAct(0);
            expect(prologueManager.currentAct).toBe(1); // 保持原状态
            
            prologueManager.goToAct(7);
            expect(prologueManager.currentAct).toBe(1); // 保持原状态
        });

        it('应该传递正确的数据给场景', () => {
            prologueManager.goToAct(2);
            
            // 获取最后一次调用（start()会调用goToAct(1)，所以这是第二次调用）
            const calls = mockGameEngine.sceneManager.switchTo.mock.calls;
            const lastCall = calls[calls.length - 1];
            expect(lastCall[1]).toHaveProperty('actNumber', 2);
            expect(lastCall[1]).toHaveProperty('playerData');
            expect(lastCall[1]).toHaveProperty('prologueManager');
        });
    });

    describe('完成幕', () => {
        beforeEach(async () => {
            await prologueManager.init();
            prologueManager.start('测试角色');
        });

        it('应该正确完成当前幕并进入下一幕', () => {
            prologueManager.goToAct(1);
            prologueManager.completeCurrentAct();
            
            expect(prologueManager.currentAct).toBe(2);
            expect(prologueManager.playerData.prologueData.completedActs).toContain(1);
        });

        it('完成第六幕应该完成序章', () => {
            prologueManager.goToAct(6);
            prologueManager.completeCurrentAct();
            
            expect(prologueManager.isCompleted).toBe(true);
            expect(prologueManager.isActive).toBe(false);
        });
    });

    describe('玩家数据管理', () => {
        beforeEach(async () => {
            await prologueManager.init();
        });

        it('应该正确记录玩家选择', () => {
            prologueManager.recordPlayerChoice('choice1', '选项A');
            
            expect(prologueManager.playerData.prologueData.playerChoices.get('choice1')).toBe('选项A');
        });

        it('应该正确招募NPC', () => {
            prologueManager.recruitNPC('管骇');
            prologueManager.recruitNPC('周仓');
            
            expect(prologueManager.playerData.prologueData.recruitedNPCs).toContain('管骇');
            expect(prologueManager.playerData.prologueData.recruitedNPCs).toContain('周仓');
            expect(prologueManager.playerData.prologueData.recruitedNPCs.length).toBe(2);
        });

        it('不应该重复招募相同NPC', () => {
            prologueManager.recruitNPC('管骇');
            prologueManager.recruitNPC('管骇');
            
            expect(prologueManager.playerData.prologueData.recruitedNPCs.length).toBe(1);
        });

        it('应该正确记录战斗统计', () => {
            prologueManager.recordBattleWon();
            prologueManager.recordBattleWon();
            prologueManager.recordEnemiesDefeated(5);
            prologueManager.recordEnemiesDefeated(3);
            
            expect(prologueManager.playerData.prologueData.battlesWon).toBe(2);
            expect(prologueManager.playerData.prologueData.enemiesDefeated).toBe(8);
        });

        it('应该正确记录救援盟友', () => {
            prologueManager.recordAllyRescued('张梁');
            prologueManager.recordAllyRescued('张宝');
            
            expect(prologueManager.playerData.prologueData.rescuedAllies).toContain('张梁');
            expect(prologueManager.playerData.prologueData.rescuedAllies).toContain('张宝');
        });
    });

    describe('进度保存和加载', () => {
        beforeEach(async () => {
            await prologueManager.init();
            prologueManager.start('测试角色');
        });

        it('应该正确保存进度', () => {
            prologueManager.goToAct(3);
            prologueManager.recordPlayerChoice('test', 'value');
            prologueManager.saveProgress();
            
            const saved = localStorage.getItem('prologue_progress');
            expect(saved).toBeDefined();
            
            const data = JSON.parse(saved);
            expect(data.currentAct).toBe(3);
            expect(data.playerData.name).toBe('测试角色');
        });

        it('应该正确加载进度', () => {
            // 保存进度
            prologueManager.goToAct(4);
            prologueManager.playerData.currency = 500;
            prologueManager.saveProgress();
            
            // 创建新实例并加载
            const newManager = new PrologueManager(mockGameEngine);
            const success = newManager.loadProgress();
            
            expect(success).toBe(true);
            expect(newManager.currentAct).toBe(4);
            expect(newManager.playerData.currency).toBe(500);
        });

        it('没有保存时加载应该返回false', () => {
            const newManager = new PrologueManager(mockGameEngine);
            const success = newManager.loadProgress();
            
            expect(success).toBe(false);
        });

        it('应该正确清除进度', () => {
            prologueManager.saveProgress();
            prologueManager.clearProgress();
            
            const saved = localStorage.getItem('prologue_progress');
            expect(saved).toBeNull();
        });
    });

    describe('进度继承', () => {
        beforeEach(async () => {
            await prologueManager.init();
            prologueManager.start('测试角色');
        });

        it('应该正确准备继承数据', () => {
            prologueManager.playerData.level = 5;
            prologueManager.playerData.currency = 1000;
            prologueManager.recruitNPC('管骇');
            prologueManager.recordBattleWon();
            
            const inheritData = prologueManager.prepareInheritData();
            
            expect(inheritData.characterName).toBe('测试角色');
            expect(inheritData.level).toBe(5);
            expect(inheritData.currency).toBe(1000);
            expect(inheritData.allies).toContain('管骇');
            expect(inheritData.statistics.battlesWon).toBe(1);
        });
    });

    describe('获取器方法', () => {
        beforeEach(async () => {
            await prologueManager.init();
            prologueManager.start('测试角色');
        });

        it('应该正确获取当前幕数', () => {
            prologueManager.goToAct(3);
            expect(prologueManager.getCurrentAct()).toBe(3);
        });

        it('应该正确获取当前幕名称', () => {
            prologueManager.goToAct(1);
            expect(prologueManager.getCurrentActName()).toBe('第一幕：绝望的开始');
            
            prologueManager.goToAct(4);
            expect(prologueManager.getCurrentActName()).toBe('第四幕：职业选择');
        });

        it('应该正确获取玩家数据', () => {
            const playerData = prologueManager.getPlayerData();
            expect(playerData).toBeDefined();
            expect(playerData.name).toBe('测试角色');
        });

        it('应该正确检查完成状态', () => {
            expect(prologueManager.isComplete()).toBe(false);
            
            prologueManager.complete();
            expect(prologueManager.isComplete()).toBe(true);
        });

        it('应该正确检查活动状态', () => {
            expect(prologueManager.isActivePrologue()).toBe(true);
            
            prologueManager.complete();
            expect(prologueManager.isActivePrologue()).toBe(false);
        });
    });

    describe('完成回调', () => {
        beforeEach(async () => {
            await prologueManager.init();
            prologueManager.start('测试角色');
        });

        it('应该在完成时调用回调', () => {
            const callback = vi.fn();
            prologueManager.setOnComplete(callback);
            
            prologueManager.complete();
            
            expect(callback).toHaveBeenCalled();
            expect(callback.mock.calls[0][0]).toHaveProperty('characterName');
        });
    });
});
