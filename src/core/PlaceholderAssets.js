/**
 * 占位符资源生成器
 * 用于生成简单的占位符精灵图和UI元素
 */
export class PlaceholderAssets {
    constructor() {
        this.cache = new Map();
    }

    /**
     * 创建角色精灵（不同职业）
     * @param {string} className - 职业名称 ('warrior', 'mage', 'archer')
     * @param {number} size - 精灵大小
     * @returns {HTMLCanvasElement}
     */
    createCharacterSprite(className, size = 64) {
        const key = `character_${className}_${size}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // 根据职业选择颜色
        const colors = {
            warrior: { primary: '#FF6B6B', secondary: '#C92A2A' },
            mage: { primary: '#4DABF7', secondary: '#1971C2' },
            archer: { primary: '#51CF66', secondary: '#2F9E44' }
        };

        const color = colors[className] || colors.warrior;

        // 绘制身体（圆形）
        ctx.fillStyle = color.primary;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
        ctx.fill();

        // 绘制头部（小圆）
        ctx.fillStyle = '#FFE0B2';
        ctx.beginPath();
        ctx.arc(size / 2, size / 3, size / 6, 0, Math.PI * 2);
        ctx.fill();

        // 绘制职业标识
        ctx.fillStyle = color.secondary;
        ctx.font = `bold ${size / 3}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const symbols = { warrior: '⚔', mage: '✦', archer: '➶' };
        ctx.fillText(symbols[className] || '?', size / 2, size * 0.65);

        this.cache.set(key, canvas);
        return canvas;
    }

    /**
     * 创建敌人精灵
     * @param {string} enemyType - 敌人类型 ('slime', 'goblin', 'skeleton')
     * @param {number} size - 精灵大小
     * @returns {HTMLCanvasElement}
     */
    createEnemySprite(enemyType, size = 64) {
        const key = `enemy_${enemyType}_${size}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // 根据敌人类型选择颜色和形状
        const enemies = {
            slime: { color: '#69DB7C', shape: 'blob' },
            goblin: { color: '#8CE99A', shape: 'humanoid' },
            skeleton: { color: '#E9ECEF', shape: 'humanoid' }
        };

        const enemy = enemies[enemyType] || enemies.slime;

        if (enemy.shape === 'blob') {
            // 绘制史莱姆（椭圆形）
            ctx.fillStyle = enemy.color;
            ctx.beginPath();
            ctx.ellipse(size / 2, size * 0.6, size / 3, size / 4, 0, 0, Math.PI * 2);
            ctx.fill();

            // 眼睛
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(size / 2 - size / 8, size * 0.55, size / 16, 0, Math.PI * 2);
            ctx.arc(size / 2 + size / 8, size * 0.55, size / 16, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 绘制类人形敌人
            ctx.fillStyle = enemy.color;
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
            ctx.fill();

            // 头部
            ctx.fillStyle = enemy.color;
            ctx.beginPath();
            ctx.arc(size / 2, size / 3, size / 6, 0, Math.PI * 2);
            ctx.fill();

            // 敌对标识（红色X）
            ctx.strokeStyle = '#FA5252';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(size / 2 - size / 8, size / 2 - size / 8);
            ctx.lineTo(size / 2 + size / 8, size / 2 + size / 8);
            ctx.moveTo(size / 2 + size / 8, size / 2 - size / 8);
            ctx.lineTo(size / 2 - size / 8, size / 2 + size / 8);
            ctx.stroke();
        }

        this.cache.set(key, canvas);
        return canvas;
    }

    /**
     * 创建技能图标
     * @param {string} skillName - 技能名称
     * @param {number} size - 图标大小
     * @returns {HTMLCanvasElement}
     */
    createSkillIcon(skillName, size = 48) {
        const key = `skill_${skillName}_${size}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // 技能图标配色方案
        const skillColors = {
            attack: { bg: '#FA5252', icon: '#FFF' },
            fireball: { bg: '#FF6B6B', icon: '#FFE066' },
            heal: { bg: '#51CF66', icon: '#FFF' },
            shield: { bg: '#4DABF7', icon: '#FFF' },
            arrow: { bg: '#51CF66', icon: '#FFF' },
            frost: { bg: '#74C0FC', icon: '#FFF' },
            default: { bg: '#868E96', icon: '#FFF' }
        };

        const colors = skillColors[skillName] || skillColors.default;

        // 绘制背景（圆角矩形）
        ctx.fillStyle = colors.bg;
        this.roundRect(ctx, 2, 2, size - 4, size - 4, 8);
        ctx.fill();

        // 绘制边框
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        this.roundRect(ctx, 2, 2, size - 4, size - 4, 8);
        ctx.stroke();

        // 绘制技能符号
        ctx.fillStyle = colors.icon;
        ctx.font = `bold ${size / 2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const symbols = {
            attack: '⚔',
            fireball: '🔥',
            heal: '✚',
            shield: '🛡',
            arrow: '➶',
            frost: '❄'
        };
        
        ctx.fillText(symbols[skillName] || '?', size / 2, size / 2);

        this.cache.set(key, canvas);
        return canvas;
    }

    /**
     * 创建UI元素图片
     * @param {string} elementType - UI元素类型
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @returns {HTMLCanvasElement}
     */
    createUIElement(elementType, width = 200, height = 30) {
        const key = `ui_${elementType}_${width}_${height}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        switch (elementType) {
            case 'healthbar_bg':
                // 生命值条背景
                ctx.fillStyle = '#2C2C2C';
                this.roundRect(ctx, 0, 0, width, height, 5);
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                this.roundRect(ctx, 0, 0, width, height, 5);
                ctx.stroke();
                break;

            case 'healthbar_fill':
                // 生命值条填充
                ctx.fillStyle = '#51CF66';
                this.roundRect(ctx, 2, 2, width - 4, height - 4, 3);
                ctx.fill();
                break;

            case 'manabar_fill':
                // 魔法值条填充
                ctx.fillStyle = '#4DABF7';
                this.roundRect(ctx, 2, 2, width - 4, height - 4, 3);
                ctx.fill();
                break;

            case 'button':
                // 按钮
                ctx.fillStyle = '#495057';
                this.roundRect(ctx, 0, 0, width, height, 8);
                ctx.fill();
                ctx.strokeStyle = '#ADB5BD';
                ctx.lineWidth = 2;
                this.roundRect(ctx, 0, 0, width, height, 8);
                ctx.stroke();
                break;

            case 'panel':
                // 面板背景
                ctx.fillStyle = 'rgba(33, 37, 41, 0.9)';
                this.roundRect(ctx, 0, 0, width, height, 10);
                ctx.fill();
                ctx.strokeStyle = '#495057';
                ctx.lineWidth = 2;
                this.roundRect(ctx, 0, 0, width, height, 10);
                ctx.stroke();
                break;

            default:
                // 默认矩形
                ctx.fillStyle = '#868E96';
                ctx.fillRect(0, 0, width, height);
                break;
        }

        this.cache.set(key, canvas);
        return canvas;
    }

    /**
     * 创建粒子纹理
     * @param {string} particleType - 粒子类型
     * @param {number} size - 粒子大小
     * @returns {HTMLCanvasElement}
     */
    createParticleTexture(particleType, size = 16) {
        const key = `particle_${particleType}_${size}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        switch (particleType) {
            case 'fire':
                // 火焰粒子（渐变圆）
                const fireGradient = ctx.createRadialGradient(
                    size / 2, size / 2, 0,
                    size / 2, size / 2, size / 2
                );
                fireGradient.addColorStop(0, '#FFE066');
                fireGradient.addColorStop(0.5, '#FF6B6B');
                fireGradient.addColorStop(1, 'rgba(255, 107, 107, 0)');
                ctx.fillStyle = fireGradient;
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'heal':
                // 治疗粒子（绿色光点）
                const healGradient = ctx.createRadialGradient(
                    size / 2, size / 2, 0,
                    size / 2, size / 2, size / 2
                );
                healGradient.addColorStop(0, '#FFF');
                healGradient.addColorStop(0.3, '#51CF66');
                healGradient.addColorStop(1, 'rgba(81, 207, 102, 0)');
                ctx.fillStyle = healGradient;
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'frost':
                // 冰霜粒子（蓝色晶体）
                ctx.fillStyle = '#74C0FC';
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2;
                    const x = size / 2 + Math.cos(angle) * size / 3;
                    const y = size / 2 + Math.sin(angle) * size / 3;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                break;

            case 'spark':
                // 火花粒子（星形）
                ctx.fillStyle = '#FFE066';
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    const radius = i % 2 === 0 ? size / 2 : size / 4;
                    const x = size / 2 + Math.cos(angle) * radius;
                    const y = size / 2 + Math.sin(angle) * radius;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                break;

            default:
                // 默认圆形粒子
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.fill();
                break;
        }

        this.cache.set(key, canvas);
        return canvas;
    }

    /**
     * 辅助方法：绘制圆角矩形
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * 创建九宫格方向精灵（3x3网格）
     * @param {string} className - 职业名称
     * @param {number} spriteSize - 单个精灵大小
     * @returns {HTMLCanvasElement}
     */
    createDirectionalSprite(className, spriteSize = 32) {
        const key = `directional_${className}_${spriteSize}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        // 创建3x3网格的canvas
        const canvas = document.createElement('canvas');
        canvas.width = spriteSize * 3;
        canvas.height = spriteSize * 3;
        const ctx = canvas.getContext('2d');

        // 根据职业选择颜色
        const colors = {
            warrior: { primary: '#FF6B6B', secondary: '#C92A2A', accent: '#FFE066' },
            mage: { primary: '#4DABF7', secondary: '#1971C2', accent: '#74C0FC' },
            archer: { primary: '#51CF66', secondary: '#2F9E44', accent: '#8CE99A' },
            refugee: { primary: '#868E96', secondary: '#495057', accent: '#ADB5BD' }
        };

        const color = colors[className] || colors.refugee;

        // 九宫格布局：
        // [0:上左] [1:上]   [2:上右]
        // [3:左]   [4:静止] [5:右]
        // [6:下左] [7:下]   [8:下右]

        const directions = [
            { row: 0, col: 0, angle: -135 }, // 上左
            { row: 0, col: 1, angle: -90 },  // 上
            { row: 0, col: 2, angle: -45 },  // 上右
            { row: 1, col: 0, angle: 180 },  // 左
            { row: 1, col: 1, angle: 0 },    // 静止/下（默认）
            { row: 1, col: 2, angle: 0 },    // 右
            { row: 2, col: 0, angle: 135 },  // 下左
            { row: 2, col: 1, angle: 90 },   // 下
            { row: 2, col: 2, angle: 45 }    // 下右
        ];

        directions.forEach((dir, index) => {
            const x = dir.col * spriteSize + spriteSize / 2;
            const y = dir.row * spriteSize + spriteSize / 2;

            ctx.save();
            ctx.translate(x, y);

            // 绘制身体（椭圆形，适应等距视角）
            ctx.fillStyle = color.primary;
            ctx.beginPath();
            ctx.ellipse(0, 0, spriteSize * 0.35, spriteSize * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();

            // 绘制头部（圆形）
            ctx.fillStyle = '#FFE0B2';
            ctx.beginPath();
            ctx.arc(0, -spriteSize * 0.15, spriteSize * 0.2, 0, Math.PI * 2);
            ctx.fill();

            // 根据方向绘制朝向指示器
            if (index !== 4) { // 非静止状态
                ctx.rotate(dir.angle * Math.PI / 180);
                
                // 绘制方向箭头
                ctx.fillStyle = color.accent;
                ctx.beginPath();
                ctx.moveTo(spriteSize * 0.25, 0);
                ctx.lineTo(spriteSize * 0.15, -spriteSize * 0.08);
                ctx.lineTo(spriteSize * 0.15, spriteSize * 0.08);
                ctx.closePath();
                ctx.fill();
            } else {
                // 静止状态：绘制职业标识
                ctx.fillStyle = color.secondary;
                ctx.font = `bold ${spriteSize * 0.4}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const symbols = { warrior: '⚔', mage: '✦', archer: '➶', refugee: '?' };
                ctx.fillText(symbols[className] || '?', 0, spriteSize * 0.1);
            }

            ctx.restore();

            // 绘制网格线（调试用）
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(dir.col * spriteSize, dir.row * spriteSize, spriteSize, spriteSize);
        });

        this.cache.set(key, canvas);
        return canvas;
    }

    /**
     * 创建4x8格式的玩家动画精灵图
     * @param {number} cellSize - 每个格子的尺寸
     * @returns {HTMLCanvasElement}
     */
    createAnimatedPlayerSprite(cellSize = 64) {
        const key = `animated_player_${cellSize}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const cols = 4;
        const rows = 8;
        const canvas = document.createElement('canvas');
        canvas.width = cellSize * cols;
        canvas.height = cellSize * rows;
        const ctx = canvas.getContext('2d');

        const dirAngles = [225, 45, 315, 135, 180, 0, 270, 90];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cx = col * cellSize + cellSize / 2;
                const cy = row * cellSize + cellSize / 2;
                const angle = dirAngles[row];

                ctx.save();
                ctx.translate(cx, cy);

                const walkOffset = col === 0 ? 0 : Math.sin(col * Math.PI / 2) * 3;
                this._drawPlayerSprite(ctx, cellSize, angle, walkOffset, col);

                ctx.restore();
            }
        }

        this.cache.set(key, canvas);
        return canvas;
    }

    /**
     * 绘制玩家精灵（东汉末年灾民形象）
     */
    _drawPlayerSprite(ctx, cellSize, angle, walkOffset, frame) {
        const s = cellSize * 0.38;
        const rad = angle * Math.PI / 180;
        const legSpread = frame === 0 ? 0 : Math.sin(frame * Math.PI / 1.5) * 6;
        const armSwing = frame === 0 ? 0 : Math.sin(frame * Math.PI / 1.5) * 5;
        const bodyBob = frame === 0 ? 0 : Math.abs(Math.sin(frame * Math.PI / 1.5)) * 1.5;

        // 地面阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, s * 1.05, s * 0.55, s * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();

        // 左腿（后层）
        const lLegX = -s * 0.18 - legSpread;
        const lLegY = s * 0.95 + walkOffset;
        ctx.strokeStyle = '#7a6b5a';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.18, s * 0.5 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(-s * 0.2 - legSpread * 0.5, s * 0.72 + walkOffset, lLegX, lLegY);
        ctx.stroke();
        // 草鞋
        ctx.fillStyle = '#5a4a32';
        ctx.beginPath();
        ctx.ellipse(lLegX, lLegY + 2, s * 0.1, s * 0.06, legSpread * 0.05, 0, Math.PI * 2);
        ctx.fill();

        // 右腿（后层）
        const rLegX = s * 0.18 + legSpread;
        const rLegY = s * 0.95 + walkOffset;
        ctx.strokeStyle = '#7a6b5a';
        ctx.beginPath();
        ctx.moveTo(s * 0.18, s * 0.5 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(s * 0.2 + legSpread * 0.5, s * 0.72 + walkOffset, rLegX, rLegY);
        ctx.stroke();
        ctx.fillStyle = '#5a4a32';
        ctx.beginPath();
        ctx.ellipse(rLegX, rLegY + 2, s * 0.1, s * 0.06, -legSpread * 0.05, 0, Math.PI * 2);
        ctx.fill();

        // 身体（粗布长衫）- 渐变
        const bodyGrad = ctx.createLinearGradient(0, -s * 0.15, 0, s * 0.55);
        bodyGrad.addColorStop(0, '#9e8060');
        bodyGrad.addColorStop(0.5, '#8a6d48');
        bodyGrad.addColorStop(1, '#7a5d3a');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, -s * 0.1 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(-s * 0.55, s * 0.2 + walkOffset - bodyBob, -s * 0.4, s * 0.55 + walkOffset - bodyBob);
        ctx.lineTo(s * 0.4, s * 0.55 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(s * 0.55, s * 0.2 + walkOffset - bodyBob, s * 0.45, -s * 0.1 + walkOffset - bodyBob);
        ctx.closePath();
        ctx.fill();

        // 衣服褶皱
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.8;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * s * 0.15, -s * 0.05 + walkOffset - bodyBob);
            ctx.quadraticCurveTo(i * s * 0.12, s * 0.25 + walkOffset - bodyBob, i * s * 0.18, s * 0.5 + walkOffset - bodyBob);
            ctx.stroke();
        }

        // 领口V字
        ctx.strokeStyle = '#6b5030';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, -s * 0.1 + walkOffset - bodyBob);
        ctx.lineTo(0, s * 0.15 + walkOffset - bodyBob);
        ctx.lineTo(s * 0.15, -s * 0.1 + walkOffset - bodyBob);
        ctx.stroke();

        // 腰带（布条）
        ctx.fillStyle = '#5c4028';
        ctx.beginPath();
        ctx.moveTo(-s * 0.48, s * 0.22 + walkOffset - bodyBob);
        ctx.lineTo(s * 0.48, s * 0.22 + walkOffset - bodyBob);
        ctx.lineTo(s * 0.45, s * 0.32 + walkOffset - bodyBob);
        ctx.lineTo(-s * 0.45, s * 0.32 + walkOffset - bodyBob);
        ctx.closePath();
        ctx.fill();
        // 腰带结
        ctx.fillStyle = '#4a3520';
        ctx.beginPath();
        ctx.arc(s * 0.1, s * 0.27 + walkOffset - bodyBob, s * 0.06, 0, Math.PI * 2);
        ctx.fill();

        // 左臂
        ctx.strokeStyle = '#e8bb8a';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, -s * 0.02 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(-s * 0.6 + armSwing * 0.3, s * 0.2 + walkOffset - bodyBob, -s * 0.55 + armSwing, s * 0.42 + walkOffset);
        ctx.stroke();
        // 袖口
        ctx.strokeStyle = '#8a6d48';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, -s * 0.02 + walkOffset - bodyBob);
        ctx.lineTo(-s * 0.5 + armSwing * 0.15, s * 0.1 + walkOffset - bodyBob);
        ctx.stroke();
        // 手
        ctx.fillStyle = '#e8bb8a';
        ctx.beginPath();
        ctx.arc(-s * 0.55 + armSwing, s * 0.42 + walkOffset, s * 0.06, 0, Math.PI * 2);
        ctx.fill();

        // 右臂
        ctx.strokeStyle = '#e8bb8a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(s * 0.45, -s * 0.02 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(s * 0.6 - armSwing * 0.3, s * 0.2 + walkOffset - bodyBob, s * 0.55 - armSwing, s * 0.42 + walkOffset);
        ctx.stroke();
        ctx.strokeStyle = '#8a6d48';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(s * 0.45, -s * 0.02 + walkOffset - bodyBob);
        ctx.lineTo(s * 0.5 - armSwing * 0.15, s * 0.1 + walkOffset - bodyBob);
        ctx.stroke();
        ctx.fillStyle = '#e8bb8a';
        ctx.beginPath();
        ctx.arc(s * 0.55 - armSwing, s * 0.42 + walkOffset, s * 0.06, 0, Math.PI * 2);
        ctx.fill();

        // 脖子
        ctx.fillStyle = '#e0b080';
        ctx.fillRect(-s * 0.08, -s * 0.18 + walkOffset - bodyBob, s * 0.16, s * 0.1);

        // 头部
        const headY = -s * 0.42 + walkOffset - bodyBob;
        const headGrad = ctx.createRadialGradient(-s * 0.05, headY - s * 0.05, 0, 0, headY, s * 0.36);
        headGrad.addColorStop(0, '#f5d4a8');
        headGrad.addColorStop(1, '#deb888');
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.arc(0, headY, s * 0.34, 0, Math.PI * 2);
        ctx.fill();

        // 头发（黑色蓬乱短发）
        ctx.fillStyle = '#1e1e1e';
        ctx.beginPath();
        ctx.arc(0, headY - s * 0.08, s * 0.32, Math.PI * 0.8, Math.PI * 2.2);
        ctx.fill();
        // 碎发
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 0.25, headY - s * 0.2);
        ctx.quadraticCurveTo(-s * 0.35, headY - s * 0.35, -s * 0.2, headY - s * 0.38);
        ctx.moveTo(s * 0.2, headY - s * 0.22);
        ctx.quadraticCurveTo(s * 0.32, headY - s * 0.36, s * 0.18, headY - s * 0.4);
        ctx.stroke();
        // 鬓发
        ctx.fillStyle = '#1e1e1e';
        ctx.beginPath();
        ctx.ellipse(-s * 0.28, headY + s * 0.02, s * 0.06, s * 0.16, 0.15, 0, Math.PI * 2);
        ctx.ellipse(s * 0.28, headY + s * 0.02, s * 0.06, s * 0.16, -0.15, 0, Math.PI * 2);
        ctx.fill();

        // 眉毛
        const eyeOffX = Math.cos(rad) * s * 0.04;
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(eyeOffX - s * 0.18, headY - s * 0.08);
        ctx.lineTo(eyeOffX - s * 0.08, headY - s * 0.1);
        ctx.moveTo(eyeOffX + s * 0.08, headY - s * 0.1);
        ctx.lineTo(eyeOffX + s * 0.18, headY - s * 0.08);
        ctx.stroke();

        // 眼睛
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(eyeOffX - s * 0.13, headY, s * 0.05, s * 0.035, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeOffX + s * 0.13, headY, s * 0.05, s * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(eyeOffX - s * 0.13 + s * 0.01, headY, s * 0.03, 0, Math.PI * 2);
        ctx.arc(eyeOffX + s * 0.13 + s * 0.01, headY, s * 0.03, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(eyeOffX - s * 0.12, headY - s * 0.015, s * 0.012, 0, Math.PI * 2);
        ctx.arc(eyeOffX + s * 0.14, headY - s * 0.015, s * 0.012, 0, Math.PI * 2);
        ctx.fill();

        // 鼻子
        ctx.strokeStyle = 'rgba(160,120,80,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(eyeOffX, headY + s * 0.02);
        ctx.lineTo(eyeOffX - s * 0.02, headY + s * 0.1);
        ctx.stroke();

        // 嘴巴
        ctx.strokeStyle = '#a07050';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(eyeOffX, headY + s * 0.18, s * 0.05, 0.2, Math.PI - 0.2);
        ctx.stroke();
    }

    /**
     * 创建4x8格式的敌人动画精灵图
     * 4列（动画帧）× 8行（方向）
     * 行顺序：下左、上右、上左、下右、左、右、上、下
     * @param {string} enemyType - 敌人类型
     * @param {number} cellSize - 每个格子的尺寸
     * @returns {HTMLCanvasElement}
     */
    createAnimatedEnemySprite(enemyType, cellSize = 64) {
        const key = `animated_enemy_${enemyType}_${cellSize}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const cols = 4;
        const rows = 8;
        const canvas = document.createElement('canvas');
        canvas.width = cellSize * cols;
        canvas.height = cellSize * rows;
        const ctx = canvas.getContext('2d');

        // 敌人配色方案
        const configs = {
            wild_dog: {
                bodyColor: '#8b4513', headColor: '#a0522d', accentColor: '#d2691e',
                type: 'beast', label: '犬'
            },
            soldier: {
                bodyColor: '#4169e1', headColor: '#ffe0b2', accentColor: '#1e90ff',
                type: 'humanoid', label: '兵'
            },
            government_soldier: {
                bodyColor: '#4169e1', headColor: '#ffe0b2', accentColor: '#1e90ff',
                type: 'humanoid', label: '兵'
            },
            bandit: {
                bodyColor: '#556b2f', headColor: '#ffe0b2', accentColor: '#8b8000',
                type: 'humanoid', label: '匪'
            },
            starving: {
                bodyColor: '#696969', headColor: '#e8c4a0', accentColor: '#808080',
                type: 'humanoid', label: '民'
            },
            refugee: {
                bodyColor: '#696969', headColor: '#e8c4a0', accentColor: '#808080',
                type: 'humanoid', label: '民'
            }
        };

        const config = configs[enemyType] || configs.wild_dog;

        // 8个方向的角度偏移（用于绘制朝向指示）
        const dirAngles = [
            225, // 行0: 下左
            45,  // 行1: 上右
            315, // 行2: 上左
            135, // 行3: 下右
            180, // 行4: 左
            0,   // 行5: 右
            270, // 行6: 上
            90   // 行7: 下
        ];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cx = col * cellSize + cellSize / 2;
                const cy = row * cellSize + cellSize / 2;
                const angle = dirAngles[row];

                ctx.save();
                ctx.translate(cx, cy);

                // 行走动画偏移（col 0=静止, 1-3=行走帧）
                const walkOffset = col === 0 ? 0 : Math.sin(col * Math.PI / 2) * 3;

                if (config.type === 'beast') {
                    this._drawBeastSprite(ctx, cellSize, config, angle, walkOffset, col);
                } else {
                    this._drawHumanoidSprite(ctx, cellSize, config, angle, walkOffset, col);
                }

                ctx.restore();
            }
        }

        this.cache.set(key, canvas);
        return canvas;
    }

    /**
     * 绘制兽类精灵（野狗等）- 写实版
     */
    _drawBeastSprite(ctx, cellSize, config, angle, walkOffset, frame) {
        const s = cellSize * 0.38;
        const rad = angle * Math.PI / 180;
        const legAnim = frame === 0 ? 0 : Math.sin(frame * Math.PI / 1.5) * 5;
        const bodyBob = frame === 0 ? 0 : Math.abs(Math.sin(frame * Math.PI / 1.5)) * 1.5;

        // 地面阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, s * 0.65, s * 0.6, s * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 尾巴（后层）
        const tailBaseX = -Math.cos(rad) * s * 0.6;
        const tailBaseY = -Math.sin(rad) * s * 0.2 + walkOffset - bodyBob;
        ctx.strokeStyle = config.bodyColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailBaseX * 0.4, tailBaseY + s * 0.05);
        ctx.quadraticCurveTo(tailBaseX * 0.8, tailBaseY - s * 0.25, tailBaseX * 1.1, tailBaseY - s * 0.35 + Math.sin(frame * 1.5) * 3);
        ctx.stroke();
        // 尾巴毛
        ctx.lineWidth = 4;
        ctx.strokeStyle = config.accentColor;
        ctx.beginPath();
        ctx.moveTo(tailBaseX * 0.9, tailBaseY - s * 0.28);
        ctx.lineTo(tailBaseX * 1.1, tailBaseY - s * 0.35 + Math.sin(frame * 1.5) * 3);
        ctx.stroke();

        // 后腿
        ctx.strokeStyle = config.bodyColor;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-Math.cos(rad) * s * 0.15 - 5, s * 0.15 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(-Math.cos(rad) * s * 0.15 - 5 + legAnim, s * 0.4 + walkOffset, -Math.cos(rad) * s * 0.15 - 5 + legAnim * 0.8, s * 0.55 + walkOffset);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-Math.cos(rad) * s * 0.15 + 5, s * 0.15 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(-Math.cos(rad) * s * 0.15 + 5 - legAnim, s * 0.4 + walkOffset, -Math.cos(rad) * s * 0.15 + 5 - legAnim * 0.8, s * 0.55 + walkOffset);
        ctx.stroke();

        // 身体（椭圆，带渐变）
        const bodyGrad = ctx.createRadialGradient(-s * 0.05, walkOffset - bodyBob - s * 0.05, 0, 0, walkOffset - bodyBob, s * 0.5);
        bodyGrad.addColorStop(0, config.accentColor);
        bodyGrad.addColorStop(1, config.bodyColor);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, walkOffset - bodyBob, s * 0.55, s * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        // 腹部高光
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.ellipse(0, walkOffset - bodyBob + s * 0.08, s * 0.35, s * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();

        // 前腿
        ctx.strokeStyle = config.bodyColor;
        ctx.lineWidth = 4;
        const headDist = s * 0.55;
        const hx = Math.cos(rad) * headDist;
        ctx.beginPath();
        ctx.moveTo(hx * 0.3 - 5, s * 0.1 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(hx * 0.3 - 5 - legAnim, s * 0.35 + walkOffset, hx * 0.3 - 5 - legAnim * 0.8, s * 0.55 + walkOffset);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(hx * 0.3 + 5, s * 0.1 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(hx * 0.3 + 5 + legAnim, s * 0.35 + walkOffset, hx * 0.3 + 5 + legAnim * 0.8, s * 0.55 + walkOffset);
        ctx.stroke();

        // 爪子
        ctx.fillStyle = '#2a1a0a';
        const pawPositions = [
            { x: hx * 0.3 - 5 - legAnim * 0.8, y: s * 0.55 + walkOffset },
            { x: hx * 0.3 + 5 + legAnim * 0.8, y: s * 0.55 + walkOffset },
            { x: -Math.cos(rad) * s * 0.15 - 5 + legAnim * 0.8, y: s * 0.55 + walkOffset },
            { x: -Math.cos(rad) * s * 0.15 + 5 - legAnim * 0.8, y: s * 0.55 + walkOffset }
        ];
        pawPositions.forEach(p => {
            ctx.beginPath();
            ctx.ellipse(p.x, p.y + 1, s * 0.06, s * 0.035, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // 头部
        const hy = Math.sin(rad) * headDist * 0.5 + walkOffset - bodyBob - s * 0.08;
        const headGrad = ctx.createRadialGradient(hx * 0.85 - s * 0.03, hy - s * 0.03, 0, hx * 0.85, hy, s * 0.28);
        headGrad.addColorStop(0, config.accentColor);
        headGrad.addColorStop(1, config.headColor);
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.ellipse(hx * 0.85, hy, s * 0.28, s * 0.22, rad * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // 吻部（鼻口）
        const muzzleDist = s * 0.22;
        const mx = hx * 0.85 + Math.cos(rad) * muzzleDist;
        const my = hy + Math.sin(rad) * muzzleDist * 0.5 + s * 0.04;
        ctx.fillStyle = config.headColor;
        ctx.beginPath();
        ctx.ellipse(mx, my, s * 0.14, s * 0.1, rad * 0.3, 0, Math.PI * 2);
        ctx.fill();
        // 鼻子
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.ellipse(mx + Math.cos(rad) * s * 0.08, my + Math.sin(rad) * s * 0.02, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();

        // 耳朵（三角形）
        ctx.fillStyle = config.bodyColor;
        const earBaseX = hx * 0.85;
        const earBaseY = hy - s * 0.18;
        // 左耳
        ctx.beginPath();
        ctx.moveTo(earBaseX - s * 0.12, earBaseY + s * 0.05);
        ctx.lineTo(earBaseX - s * 0.18, earBaseY - s * 0.15);
        ctx.lineTo(earBaseX - s * 0.04, earBaseY);
        ctx.closePath();
        ctx.fill();
        // 右耳
        ctx.beginPath();
        ctx.moveTo(earBaseX + s * 0.12, earBaseY + s * 0.05);
        ctx.lineTo(earBaseX + s * 0.18, earBaseY - s * 0.15);
        ctx.lineTo(earBaseX + s * 0.04, earBaseY);
        ctx.closePath();
        ctx.fill();
        // 耳内
        ctx.fillStyle = '#c08060';
        ctx.beginPath();
        ctx.moveTo(earBaseX - s * 0.11, earBaseY + s * 0.02);
        ctx.lineTo(earBaseX - s * 0.15, earBaseY - s * 0.1);
        ctx.lineTo(earBaseX - s * 0.06, earBaseY);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(earBaseX + s * 0.11, earBaseY + s * 0.02);
        ctx.lineTo(earBaseX + s * 0.15, earBaseY - s * 0.1);
        ctx.lineTo(earBaseX + s * 0.06, earBaseY);
        ctx.closePath();
        ctx.fill();

        // 眼睛（凶狠的红眼）
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.ellipse(hx * 0.85 - s * 0.1, hy - s * 0.03, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
        ctx.ellipse(hx * 0.85 + s * 0.1, hy - s * 0.03, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#cc2200';
        ctx.beginPath();
        ctx.arc(hx * 0.85 - s * 0.1, hy - s * 0.03, s * 0.02, 0, Math.PI * 2);
        ctx.arc(hx * 0.85 + s * 0.1, hy - s * 0.03, s * 0.02, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * 绘制人形精灵（官兵、饥民、土匪等）- 写实版
     */
    _drawHumanoidSprite(ctx, cellSize, config, angle, walkOffset, frame) {
        const s = cellSize * 0.38;
        const rad = angle * Math.PI / 180;
        const legSpread = frame === 0 ? 0 : Math.sin(frame * Math.PI / 1.5) * 6;
        const armSwing = frame === 0 ? 0 : Math.sin(frame * Math.PI / 1.5) * 5;
        const bodyBob = frame === 0 ? 0 : Math.abs(Math.sin(frame * Math.PI / 1.5)) * 1.5;

        // 地面阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, s * 1.05, s * 0.5, s * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 左腿
        const lLegEndX = -s * 0.18 - legSpread;
        const lLegEndY = s * 0.95 + walkOffset;
        ctx.strokeStyle = config.label === '兵' ? '#3a5a9e' : config.bodyColor;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, s * 0.5 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(-s * 0.17 - legSpread * 0.5, s * 0.72 + walkOffset, lLegEndX, lLegEndY);
        ctx.stroke();
        // 鞋
        ctx.fillStyle = config.label === '兵' ? '#2a2a2a' : '#4a3a28';
        ctx.beginPath();
        ctx.ellipse(lLegEndX, lLegEndY + 2, s * 0.09, s * 0.05, legSpread * 0.04, 0, Math.PI * 2);
        ctx.fill();

        // 右腿
        const rLegEndX = s * 0.18 + legSpread;
        const rLegEndY = s * 0.95 + walkOffset;
        ctx.strokeStyle = config.label === '兵' ? '#3a5a9e' : config.bodyColor;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(s * 0.15, s * 0.5 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(s * 0.17 + legSpread * 0.5, s * 0.72 + walkOffset, rLegEndX, rLegEndY);
        ctx.stroke();
        ctx.fillStyle = config.label === '兵' ? '#2a2a2a' : '#4a3a28';
        ctx.beginPath();
        ctx.ellipse(rLegEndX, rLegEndY + 2, s * 0.09, s * 0.05, -legSpread * 0.04, 0, Math.PI * 2);
        ctx.fill();

        // 身体（带渐变的衣服）
        const bodyGrad = ctx.createLinearGradient(0, -s * 0.15, 0, s * 0.55);
        if (config.label === '兵') {
            bodyGrad.addColorStop(0, '#5078c0');
            bodyGrad.addColorStop(0.5, '#4169b0');
            bodyGrad.addColorStop(1, '#3558a0');
        } else if (config.label === '匪') {
            bodyGrad.addColorStop(0, '#6a7a40');
            bodyGrad.addColorStop(0.5, '#556b2f');
            bodyGrad.addColorStop(1, '#4a5c28');
        } else {
            bodyGrad.addColorStop(0, '#787878');
            bodyGrad.addColorStop(0.5, '#666');
            bodyGrad.addColorStop(1, '#555');
        }
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(-s * 0.42, -s * 0.08 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(-s * 0.5, s * 0.2 + walkOffset - bodyBob, -s * 0.38, s * 0.55 + walkOffset - bodyBob);
        ctx.lineTo(s * 0.38, s * 0.55 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(s * 0.5, s * 0.2 + walkOffset - bodyBob, s * 0.42, -s * 0.08 + walkOffset - bodyBob);
        ctx.closePath();
        ctx.fill();

        // 衣服细节
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.8;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * s * 0.12, s * 0.0 + walkOffset - bodyBob);
            ctx.quadraticCurveTo(i * s * 0.1, s * 0.25 + walkOffset - bodyBob, i * s * 0.14, s * 0.5 + walkOffset - bodyBob);
            ctx.stroke();
        }

        // 官兵特有：铠甲/腰带
        if (config.label === '兵') {
            // 护甲片
            ctx.fillStyle = 'rgba(200,180,120,0.4)';
            ctx.fillRect(-s * 0.35, s * 0.0 + walkOffset - bodyBob, s * 0.7, s * 0.15);
            // 腰带
            ctx.fillStyle = '#8b7000';
            ctx.fillRect(-s * 0.42, s * 0.22 + walkOffset - bodyBob, s * 0.84, s * 0.08);
            // 腰带扣
            ctx.fillStyle = '#c0a000';
            ctx.beginPath();
            ctx.arc(0, s * 0.26 + walkOffset - bodyBob, s * 0.04, 0, Math.PI * 2);
            ctx.fill();
        } else if (config.label === '匪') {
            // 布腰带
            ctx.fillStyle = '#3a3a20';
            ctx.fillRect(-s * 0.4, s * 0.2 + walkOffset - bodyBob, s * 0.8, s * 0.08);
        } else {
            // 饥民：破烂补丁
            ctx.fillStyle = 'rgba(100,80,60,0.3)';
            ctx.fillRect(-s * 0.15, s * 0.1 + walkOffset - bodyBob, s * 0.2, s * 0.15);
            ctx.fillRect(s * 0.1, s * 0.3 + walkOffset - bodyBob, s * 0.15, s * 0.12);
        }

        // 左臂
        ctx.strokeStyle = config.headColor;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.42, -s * 0.0 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(-s * 0.55 + armSwing * 0.3, s * 0.2 + walkOffset - bodyBob, -s * 0.5 + armSwing, s * 0.4 + walkOffset);
        ctx.stroke();
        // 袖子
        ctx.strokeStyle = config.label === '兵' ? '#4a6ab0' : config.bodyColor;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-s * 0.42, -s * 0.0 + walkOffset - bodyBob);
        ctx.lineTo(-s * 0.48 + armSwing * 0.15, s * 0.1 + walkOffset - bodyBob);
        ctx.stroke();
        // 手
        ctx.fillStyle = config.headColor;
        ctx.beginPath();
        ctx.arc(-s * 0.5 + armSwing, s * 0.4 + walkOffset, s * 0.055, 0, Math.PI * 2);
        ctx.fill();

        // 右臂
        ctx.strokeStyle = config.headColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(s * 0.42, -s * 0.0 + walkOffset - bodyBob);
        ctx.quadraticCurveTo(s * 0.55 - armSwing * 0.3, s * 0.2 + walkOffset - bodyBob, s * 0.5 - armSwing, s * 0.4 + walkOffset);
        ctx.stroke();
        ctx.strokeStyle = config.label === '兵' ? '#4a6ab0' : config.bodyColor;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(s * 0.42, -s * 0.0 + walkOffset - bodyBob);
        ctx.lineTo(s * 0.48 - armSwing * 0.15, s * 0.1 + walkOffset - bodyBob);
        ctx.stroke();
        ctx.fillStyle = config.headColor;
        ctx.beginPath();
        ctx.arc(s * 0.5 - armSwing, s * 0.4 + walkOffset, s * 0.055, 0, Math.PI * 2);
        ctx.fill();

        // 武器
        if (config.label === '兵') {
            // 长矛
            ctx.strokeStyle = '#6b5a30';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(s * 0.5 - armSwing, s * 0.4 + walkOffset);
            ctx.lineTo(s * 0.5 - armSwing + s * 0.05, -s * 0.85 + walkOffset - bodyBob);
            ctx.stroke();
            // 矛头
            ctx.fillStyle = '#b0b0b0';
            ctx.beginPath();
            ctx.moveTo(s * 0.5 - armSwing + s * 0.05, -s * 0.95 + walkOffset - bodyBob);
            ctx.lineTo(s * 0.5 - armSwing + s * 0.05 - 4, -s * 0.8 + walkOffset - bodyBob);
            ctx.lineTo(s * 0.5 - armSwing + s * 0.05 + 4, -s * 0.8 + walkOffset - bodyBob);
            ctx.closePath();
            ctx.fill();
            // 矛头高光
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.moveTo(s * 0.5 - armSwing + s * 0.05, -s * 0.95 + walkOffset - bodyBob);
            ctx.lineTo(s * 0.5 - armSwing + s * 0.05 - 2, -s * 0.82 + walkOffset - bodyBob);
            ctx.lineTo(s * 0.5 - armSwing + s * 0.05, -s * 0.82 + walkOffset - bodyBob);
            ctx.closePath();
            ctx.fill();
        } else if (config.label === '匪') {
            // 砍刀
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(s * 0.5 - armSwing, s * 0.4 + walkOffset);
            ctx.quadraticCurveTo(s * 0.65 - armSwing, s * 0.1 + walkOffset, s * 0.6 - armSwing, -s * 0.15 + walkOffset - bodyBob);
            ctx.stroke();
            // 刀刃高光
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(s * 0.52 - armSwing, s * 0.35 + walkOffset);
            ctx.quadraticCurveTo(s * 0.63 - armSwing, s * 0.12 + walkOffset, s * 0.58 - armSwing, -s * 0.1 + walkOffset - bodyBob);
            ctx.stroke();
        }

        // 脖子
        ctx.fillStyle = config.headColor;
        ctx.fillRect(-s * 0.07, -s * 0.16 + walkOffset - bodyBob, s * 0.14, s * 0.1);

        // 头部
        const headY = -s * 0.4 + walkOffset - bodyBob;
        const headGrad = ctx.createRadialGradient(-s * 0.04, headY - s * 0.04, 0, 0, headY, s * 0.32);
        headGrad.addColorStop(0, '#f5d4a8');
        headGrad.addColorStop(1, config.headColor);
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.arc(0, headY, s * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // 头发/头盔
        const eyeOffX = Math.cos(rad) * s * 0.04;
        if (config.label === '兵') {
            // 头盔
            ctx.fillStyle = '#3a3a3a';
            ctx.beginPath();
            ctx.arc(0, headY - s * 0.05, s * 0.3, Math.PI * 0.75, Math.PI * 2.25);
            ctx.fill();
            // 头盔边沿
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.ellipse(0, headY - s * 0.02, s * 0.32, s * 0.06, 0, 0, Math.PI * 2);
            ctx.fill();
            // 头盔顶饰
            ctx.fillStyle = '#cc3333';
            ctx.beginPath();
            ctx.ellipse(0, headY - s * 0.32, s * 0.04, s * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (config.label === '匪') {
            // 头巾
            ctx.fillStyle = '#4a4a30';
            ctx.beginPath();
            ctx.arc(0, headY - s * 0.06, s * 0.28, Math.PI * 0.8, Math.PI * 2.2);
            ctx.fill();
            // 头巾结
            ctx.fillStyle = '#3a3a20';
            ctx.beginPath();
            ctx.moveTo(s * 0.22, headY - s * 0.1);
            ctx.lineTo(s * 0.35, headY - s * 0.05);
            ctx.lineTo(s * 0.3, headY + s * 0.05);
            ctx.closePath();
            ctx.fill();
        } else {
            // 饥民：蓬乱头发
            ctx.fillStyle = '#3a3a2a';
            ctx.beginPath();
            ctx.arc(0, headY - s * 0.06, s * 0.28, Math.PI * 0.8, Math.PI * 2.2);
            ctx.fill();
            // 碎发
            ctx.strokeStyle = '#3a3a2a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-s * 0.2, headY - s * 0.18);
            ctx.quadraticCurveTo(-s * 0.3, headY - s * 0.28, -s * 0.18, headY - s * 0.32);
            ctx.moveTo(s * 0.15, headY - s * 0.2);
            ctx.quadraticCurveTo(s * 0.28, headY - s * 0.3, s * 0.15, headY - s * 0.34);
            ctx.stroke();
        }

        // 眉毛
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(eyeOffX - s * 0.16, headY - s * 0.06);
        ctx.lineTo(eyeOffX - s * 0.07, headY - s * 0.08);
        ctx.moveTo(eyeOffX + s * 0.07, headY - s * 0.08);
        ctx.lineTo(eyeOffX + s * 0.16, headY - s * 0.06);
        ctx.stroke();

        // 眼睛
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(eyeOffX - s * 0.11, headY + s * 0.01, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeOffX + s * 0.11, headY + s * 0.01, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(eyeOffX - s * 0.11, headY + s * 0.01, s * 0.025, 0, Math.PI * 2);
        ctx.arc(eyeOffX + s * 0.11, headY + s * 0.01, s * 0.025, 0, Math.PI * 2);
        ctx.fill();

        // 嘴巴
        ctx.strokeStyle = '#a07050';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(eyeOffX, headY + s * 0.15, s * 0.04, 0.2, Math.PI - 0.2);
        ctx.stroke();

        // 饥民特有：脸上脏污
        if (config.label === '民') {
            ctx.fillStyle = 'rgba(80,60,40,0.15)';
            ctx.beginPath();
            ctx.ellipse(s * 0.08, headY + s * 0.05, s * 0.06, s * 0.04, 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * 获取缓存大小
     */
    getCacheSize() {
        return this.cache.size;
    }
}
