import { PlaceholderAssets } from './PlaceholderAssets.js';
import { AudioManager } from './AudioManager.js';

/**
 * 资源管理器
 * 负责加载和管理游戏资源（图片、音频等）
 */
export class AssetManager {
    constructor() {
        // 资源缓存
        this.images = new Map();
        this.audio = new Map();
        
        // 加载队列
        this.loadQueue = [];
        this.loadedCount = 0;
        this.totalCount = 0;
        
        // 加载状态
        this.isLoading = false;
        this.loadProgress = 0;
        
        // 精灵图集数据
        this.spriteSheets = new Map();
        
        // 占位符资源生成器
        this.placeholderAssets = new PlaceholderAssets();
        
        // 音频管理器
        this.audioManager = new AudioManager();
    }

    /**
     * 添加图片资源到加载队列
     * @param {string} key - 资源键名
     * @param {string} url - 资源URL
     */
    addImage(key, url) {
        this.loadQueue.push({
            type: 'image',
            key,
            url
        });
        this.totalCount++;
    }

    /**
     * 添加音频资源到加载队列
     * @param {string} key - 资源键名
     * @param {string} url - 资源URL
     */
    addAudio(key, url) {
        this.loadQueue.push({
            type: 'audio',
            key,
            url
        });
        this.totalCount++;
    }

    /**
     * 添加精灵图集
     * @param {string} key - 图集键名
     * @param {object} data - 图集数据
     */
    addSpriteSheet(key, data) {
        this.spriteSheets.set(key, data);
    }

    /**
     * 加载所有队列中的资源
     * @returns {Promise<void>}
     */
    async loadAll() {
        if (this.loadQueue.length === 0) {
            console.log('AssetManager: No assets to load');
            return;
        }

        this.isLoading = true;
        this.loadedCount = 0;
        this.loadProgress = 0;

        console.log(`AssetManager: Loading ${this.totalCount} assets...`);

        const promises = this.loadQueue.map(asset => this.loadAssetWithFallback(asset));
        
        try {
            await Promise.all(promises);
            console.log('AssetManager: All assets loaded successfully');
        } catch (error) {
            console.error('AssetManager: Failed to load some assets', error);
            
            // 尝试加载占位符资源作为降级方案
            console.warn('AssetManager: Loading placeholder assets as fallback');
            this.loadPlaceholderAssets();
        } finally {
            this.isLoading = false;
            this.loadQueue = [];
        }
    }

    /**
     * 加载资源并提供降级方案
     * @param {object} asset - 资源对象
     * @returns {Promise<void>}
     */
    async loadAssetWithFallback(asset) {
        try {
            await this.loadAsset(asset);
        } catch (error) {
            console.warn(`AssetManager: Failed to load ${asset.key}, using fallback`, error);
            
            // 为失败的资源创建占位符
            if (asset.type === 'image') {
                this.createFallbackImage(asset.key);
            }
            
            // 继续加载，不抛出错误
            this.loadedCount++;
            this.loadProgress = this.loadedCount / this.totalCount;
        }
    }

    /**
     * 为失败的图片创建降级占位符
     * @param {string} key - 资源键名
     */
    createFallbackImage(key) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // 绘制简单的占位符
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Missing', 32, 28);
        ctx.fillText('Asset', 32, 42);
        
        this.images.set(key, canvas);
        console.log(`AssetManager: Created fallback image for ${key}`);
    }

    /**
     * 加载单个资源
     * @param {object} asset - 资源对象
     * @returns {Promise<void>}
     */
    async loadAsset(asset) {
        try {
            if (asset.type === 'image') {
                await this.loadImage(asset.key, asset.url);
            } else if (asset.type === 'audio') {
                await this.loadAudioFile(asset.key, asset.url);
            }
            
            this.loadedCount++;
            this.loadProgress = this.loadedCount / this.totalCount;
            
            console.log(`AssetManager: Loaded ${asset.key} (${this.loadedCount}/${this.totalCount})`);
        } catch (error) {
            console.error(`AssetManager: Failed to load ${asset.key}`, error);
            throw error;
        }
    }

    /**
     * 加载图片资源
     * @param {string} key - 资源键名
     * @param {string} url - 图片URL
     * @returns {Promise<HTMLImageElement>}
     */
    loadImage(key, url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                this.images.set(key, img);
                resolve(img);
            };
            
            img.onerror = () => {
                reject(new Error(`Failed to load image: ${url}`));
            };
            
            img.src = url;
        });
    }

    /**
     * 加载音频资源
     * @param {string} key - 资源键名
     * @param {string} url - 音频URL
     * @returns {Promise<HTMLAudioElement>}
     */
    loadAudioFile(key, url) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            
            audio.oncanplaythrough = () => {
                this.audio.set(key, audio);
                resolve(audio);
            };
            
            audio.onerror = () => {
                reject(new Error(`Failed to load audio: ${url}`));
            };
            
            audio.src = url;
        });
    }

    /**
     * 获取图片资源
     * @param {string} key - 资源键名
     * @returns {HTMLImageElement|null}
     */
    getImage(key) {
        if (!this.images.has(key)) {
            console.warn(`AssetManager: Image '${key}' not found`);
            return null;
        }
        return this.images.get(key);
    }

    /**
     * 获取资源（getImage的别名，用于兼容）
     * @param {string} key - 资源键名
     * @returns {HTMLImageElement|null}
     */
    getAsset(key) {
        return this.getImage(key);
    }

    /**
     * 获取音频资源
     * @param {string} key - 资源键名
     * @returns {HTMLAudioElement|null}
     */
    getAudio(key) {
        if (!this.audio.has(key)) {
            console.warn(`AssetManager: Audio '${key}' not found`);
            return null;
        }
        return this.audio.get(key);
    }

    /**
     * 获取精灵图集
     * @param {string} key - 图集键名
     * @returns {object|null}
     */
    getSpriteSheet(key) {
        if (!this.spriteSheets.has(key)) {
            console.warn(`AssetManager: Sprite sheet '${key}' not found`);
            return null;
        }
        return this.spriteSheets.get(key);
    }

    /**
     * 获取加载进度
     * @returns {number} 0-1之间的进度值
     */
    getProgress() {
        return this.loadProgress;
    }

    /**
     * 检查资源是否已加载
     * @param {string} key - 资源键名
     * @returns {boolean}
     */
    hasImage(key) {
        return this.images.has(key);
    }

    /**
     * 检查音频是否已加载
     * @param {string} key - 资源键名
     * @returns {boolean}
     */
    hasAudio(key) {
        return this.audio.has(key);
    }

    /**
     * 清除所有资源
     */
    clear() {
        this.images.clear();
        this.audio.clear();
        this.spriteSheets.clear();
        this.loadQueue = [];
        this.loadedCount = 0;
        this.totalCount = 0;
        this.loadProgress = 0;
        console.log('AssetManager: All assets cleared');
    }

    /**
     * 清除特定资源
     * @param {string} key - 资源键名
     */
    remove(key) {
        this.images.delete(key);
        this.audio.delete(key);
        this.spriteSheets.delete(key);
    }

    /**
     * 生成并加载占位符资源
     * 用于快速开发，无需外部图片文件
     */
    loadPlaceholderAssets() {
        console.log('AssetManager: Loading placeholder assets...');

        // 加载4x8动画精灵（玩家角色）
        this.loadAnimatedSpriteImage('player_animated', 'assets/girl.png');

        // 九宫格方向精灵（用于玩家）
        const characterClasses = ['warrior', 'mage', 'archer', 'refugee'];
        characterClasses.forEach(className => {
            // 尝试加载真实图片，如果失败则使用占位符
            const realImagePath = `assets/${className}.png`;
            this.loadDirectionalSpriteImage(className, realImagePath);
            
            // 保留旧的单帧精灵作为备用
            const sprite = this.placeholderAssets.createCharacterSprite(className, 64);
            this.images.set(`character_${className}`, sprite);
        });

        // 敌人精灵（4x8动画格式）
        const animatedEnemyTypes = ['wild_dog', 'soldier', 'government_soldier', 'bandit', 'starving', 'refugee'];
        animatedEnemyTypes.forEach(enemyType => {
            const sprite = this.placeholderAssets.createAnimatedEnemySprite(enemyType, 64);
            this.images.set(`enemy_animated_${enemyType}`, sprite);
        });

        // 敌人精灵（旧格式备用）
        const enemyTypes = ['slime', 'goblin', 'skeleton'];
        enemyTypes.forEach(enemyType => {
            const sprite = this.placeholderAssets.createEnemySprite(enemyType, 64);
            this.images.set(`enemy_${enemyType}`, sprite);
        });

        // 技能图标
        const skills = ['attack', 'fireball', 'heal', 'shield', 'arrow', 'frost'];
        skills.forEach(skillName => {
            const icon = this.placeholderAssets.createSkillIcon(skillName, 48);
            this.images.set(`skill_${skillName}`, icon);
        });

        // UI元素
        const uiElements = [
            { type: 'healthbar_bg', width: 200, height: 20 },
            { type: 'healthbar_fill', width: 196, height: 16 },
            { type: 'manabar_fill', width: 196, height: 16 },
            { type: 'button', width: 150, height: 40 },
            { type: 'panel', width: 300, height: 200 }
        ];
        uiElements.forEach(({ type, width, height }) => {
            const element = this.placeholderAssets.createUIElement(type, width, height);
            this.images.set(`ui_${type}`, element);
        });

        // 粒子纹理
        const particleTypes = ['fire', 'heal', 'frost', 'spark'];
        particleTypes.forEach(particleType => {
            const texture = this.placeholderAssets.createParticleTexture(particleType, 16);
            this.images.set(`particle_${particleType}`, texture);
        });

        console.log('AssetManager: Placeholder assets loaded successfully');
        console.log('AssetManager: 已加载的图片资源:', Array.from(this.images.keys()));
    }

    /**
     * 加载九宫格方向精灵图片
     * @param {string} className - 职业名称
     * @param {string} imagePath - 图片路径
     */
    loadDirectionalSpriteImage(className, imagePath) {
        const key = `directional_${className}`;
        
        // 先设置占位符
        const placeholder = this.placeholderAssets.createDirectionalSprite(className, 32);
        this.images.set(key, placeholder);
        
        // 尝试加载真实图片
        const img = new Image();
        img.onload = () => {
            this.images.set(key, img);
            console.log(`AssetManager: 成功加载真实精灵图 ${key} (${img.width}x${img.height})`);
        };
        img.onerror = () => {
            console.log(`AssetManager: 无法加载 ${imagePath}，使用占位符`);
        };
        img.src = imagePath;
    }

    /**
     * 加载4x9动画精灵图片
     * @param {string} key - 资源键名
     * @param {string} imagePath - 图片路径
     */
    loadAnimatedSpriteImage(key, imagePath) {
        // 先设置4x8占位符canvas，避免加载期间 getImage 返回 null
        const placeholder = this.placeholderAssets.createAnimatedEnemySprite('refugee', 64);
        this.images.set(key, placeholder);
        
        // 尝试加载真实图片
        const img = new Image();
        img.onload = () => {
            this.images.set(key, img);
            console.log(`AssetManager: 成功加载动画精灵图 ${key} (${img.width}x${img.height})`);
        };
        img.onerror = () => {
            console.log(`AssetManager: 无法加载 ${imagePath}，使用占位符渲染`);
        };
        img.src = imagePath;
    }

    /**
     * 获取占位符资源生成器
     * @returns {PlaceholderAssets}
     */
    getPlaceholderAssets() {
        return this.placeholderAssets;
    }

    /**
     * 获取音频管理器
     * @returns {AudioManager}
     */
    getAudioManager() {
        return this.audioManager;
    }

    /**
     * 加载占位符音效
     * 注意：这些是占位符，实际游戏应该使用真实的音频文件
     */
    loadPlaceholderSounds() {
        console.log('AudioManager: Placeholder sounds would be loaded here');
        console.log('Note: Actual audio files should be added to assets/audio/ directory');
        
        // 示例：如果有真实音频文件，可以这样加载
        // this.audioManager.addSound('attack', 'assets/audio/attack.mp3');
        // this.audioManager.addSound('skill', 'assets/audio/skill.mp3');
        // this.audioManager.addMusic('bgm', 'assets/audio/background.mp3');
    }
}
