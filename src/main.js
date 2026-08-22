/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ARPG游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

import { GameEngine } from './core/GameEngine.js';

/**
 * 游戏入口点
 * 初始化游戏引擎并启动游戏
 */
async function main() {
    try {
        // 获取Canvas元素
        const canvas = document.getElementById('game-canvas');
        if (!canvas) {
            throw new Error('Canvas element not found');
        }

        // 创建游戏引擎实例
        const gameEngine = new GameEngine(canvas);
        
        // 将游戏引擎设为全局可访问（供场景使用）
        window.gameEngine = gameEngine;

        // 初始化游戏引擎
        console.log('Initializing game engine...');
        
        // 更新加载进度
        updateLoadingProgress(0, 'Initializing game engine...');
        
        await gameEngine.init();
        
        // 完成加载
        updateLoadingProgress(1, 'Loading complete!');

        // 启动游戏
        console.log('Starting game...');
        gameEngine.start();

        // 隐藏加载屏幕
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 500);
        }

    } catch (error) {
        console.error('Failed to initialize game:', error);
        showError('Failed to initialize game. Please refresh the page.');
    }
}

/**
 * 更新加载进度
 */
function updateLoadingProgress(progress, message) {
    const progressFill = document.getElementById('progress-fill');
    const loadingText = document.getElementById('loading-text');
    
    if (progressFill) {
        progressFill.style.width = `${progress * 100}%`;
    }
    
    if (loadingText && message) {
        loadingText.textContent = message;
    }
}

/**
 * 显示错误信息
 */
function showError(message) {
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
        loadingText.textContent = message;
        loadingText.style.color = '#ff4444';
    }
}

/**
 * 检查浏览器兼容性
 */
function checkBrowserCompatibility() {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext) {
        showError('Your browser does not support HTML5 Canvas');
        return false;
    }

    if (!window.requestAnimationFrame) {
        showError('Your browser does not support requestAnimationFrame');
        return false;
    }

    return true;
}

// 等待DOM加载完成后启动游戏
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (checkBrowserCompatibility()) {
            main();
        }
    });
} else {
    if (checkBrowserCompatibility()) {
        main();
    }
}
