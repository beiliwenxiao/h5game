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

import { GamepadManager } from './input/GamepadManager.js';

/**
 * 输入管理器
 * 统一处理键盘、鼠标、手柄输入
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        
        // 键盘状态缓存
        this.keys = new Map();
        this.keysPressed = new Map(); // 本帧按下的键
        this.keysReleased = new Map(); // 本帧释放的键
        
        // 手柄状态（独立存放，查询时与键盘取或；不写进 keys 以免干扰键盘的按下/释放判定）
        this.gamepad = new GamepadManager();
        this._padDown = new Set();
        this._padPressed = new Set();
        this._padReleased = new Set();
        this._padMouseButtons = new Set();   // 手柄注入的虚拟鼠标按键
        this._padCursorActive = false;       // 本帧准星是否由右摇杆控制
        this._padPolledThisFrame = false;    // 帧守卫：本帧是否已轮询手柄
        
        // 手柄虚拟准星：以画面中心（≈玩家所在处，相机跟随）为原点，右摇杆偏移出瞄准点
        this.gamepadCursorRadius = 150;
        this.gamepadEnabled = true;
        
        // 鼠标状态
        this.mouse = {
            x: 0,
            y: 0,
            worldX: 0,
            worldY: 0,
            isDown: false,
            button: -1,
            buttons: new Set(),  // 当前按住的所有按键（支持同时按住左右键）
            clicked: false,
            handled: false  // 标记点击事件是否已被处理（用于 UI 点击阻止）
        };
        
        // 键位映射
        this.keyMap = {
            // 移动键
            'w': 'up',
            'W': 'up',
            'ArrowUp': 'up',
            's': 'down',
            'S': 'down',
            'ArrowDown': 'down',
            'a': 'left',
            'A': 'left',
            'ArrowLeft': 'left',
            'd': 'right',
            'D': 'right',
            'ArrowRight': 'right',
            
            // 技能键
            '1': 'skill1',
            '2': 'skill2',
            '3': 'skill3',
            '4': 'skill4',
            '5': 'skill5',
            '6': 'skill6',
            '7': 'skill7',
            
            // 其他功能键
            ' ': 'space',
            'Escape': 'escape',
            'Enter': 'enter',
            'Shift': 'shift',
            'Control': 'ctrl',
            'Tab': 'tab',
            // 注意：m, h, r 等字母键不需要映射，直接使用原始键名
        };
        
        // 相机偏移（用于坐标转换）
        this.cameraX = 0;
        this.cameraY = 0;
        
        // 快捷键注册表
        // Map<key, Array<{ id, callback, cooldown, lastTriggerTime }>>
        this.hotkeys = new Map();
        
        // 指针坐标变换钩子（用于页面被 CSS 旋转/缩放时修正触摸与鼠标坐标）
        // 形如 (clientX, clientY) => ({ x, y })，返回 Canvas 像素坐标；返回 null 则走默认 rect 计算
        this.pointerTransform = null;
        
        // 初始化事件监听
        this.initEventListeners();
    }

    /**
     * 设置指针坐标变换钩子
     * @param {Function|null} fn - (clientX, clientY) => ({x, y}) | null
     */
    setPointerTransform(fn) {
        this.pointerTransform = (typeof fn === 'function') ? fn : null;
    }

    /**
     * 初始化事件监听器
     */
    initEventListeners() {
        // 键盘事件 - 绑定到 window，确保能捕获所有按键
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        console.log('InputManager: 键盘事件监听器已绑定到 window');
        
        // 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // 触摸事件（移动端支持）
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        
        console.log('InputManager: Event listeners initialized');
    }

    /**
     * 处理键盘按下事件
     */
    handleKeyDown(event) {
        const key = event.key;
        const isDebugPanelKey = key === '`' || event.code === 'Backquote';
        // 反引号键统一归一化为 `，Shift+反引号产生 ~ 时也能正确触发
        const mappedKey = isDebugPanelKey ? '`' : (this.keyMap[key] || key);
        const wasDown = this.keys.get(mappedKey) === true;
        
        // 如果键已经按下，不重复触发
        if (!wasDown) {
            this.keysPressed.set(mappedKey, true);
        }
        
        this.keys.set(mappedKey, true);

        // 调试面板快捷键诊断：确认浏览器事件是否到达 InputManager，以及是否写入本帧按下状态
        if (isDebugPanelKey) {
            console.log('[InputManager][DebugPanel] 收到反引号 keydown', {
                key,
                code: event.code,
                repeat: event.repeat,
                mappedKey,
                wasDown,
                pressedThisFrame: this.keysPressed.get(mappedKey) === true,
                activeElement: document.activeElement?.tagName || null
            });
        }
        
        // 阻止游戏快捷键的浏览器默认行为（F1 默认打开帮助，需拦截）
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'F1'].includes(key) || isDebugPanelKey) {
            event.preventDefault();
            if (isDebugPanelKey) {
                console.log('[InputManager][DebugPanel] 已阻止反引号键默认行为', {
                    defaultPrevented: event.defaultPrevented
                });
            }
        }
    }

    /**
     * 处理键盘释放事件
     */
    handleKeyUp(event) {
        const key = event.key;
        const mappedKey = this.keyMap[key] || key;
        
        this.keys.set(mappedKey, false);
        this.keysReleased.set(mappedKey, true);
    }

    /**
     * 处理鼠标按下事件
     */
    handleMouseDown(event) {
        this.updateMousePosition(event);
        this.mouse.isDown = true;
        this.mouse.button = event.button;
        this.mouse.buttons.add(event.button);  // 记录按下的按键（支持同时按住）
        this.mouse.clicked = true;
        this.mouse.ctrlKey = event.ctrlKey; // 记录Ctrl键状态
    }

    /**
     * 处理鼠标释放事件
     */
    handleMouseUp(event) {
        this.updateMousePosition(event);
        this.mouse.buttons.delete(event.button);
        this.mouse.isDown = this.mouse.buttons.size > 0;
        // button 仍指向剩余按住的按键（若有），否则置为 -1
        this.mouse.button = this.mouse.buttons.size > 0
            ? Array.from(this.mouse.buttons)[this.mouse.buttons.size - 1]
            : -1;
    }

    /**
     * 处理鼠标移动事件
     */
    handleMouseMove(event) {
        this.updateMousePosition(event);
    }

    /**
     * 更新鼠标位置
     */
    updateMousePosition(event) {
        if (this.pointerTransform) {
            const p = this.pointerTransform(event.clientX, event.clientY);
            if (p) {
                this.mouse.x = p.x;
                this.mouse.y = p.y;
                this.mouse.worldX = this.mouse.x + this.cameraX;
                this.mouse.worldY = this.mouse.y + this.cameraY;
                return;
            }
        }
        const rect = this.canvas.getBoundingClientRect();
        
        // 归一化映射：将 CSS 像素位置映射到 canvas 逻辑坐标
        // 使用比例映射而非 canvas.width/rect.width（避免 CSS 拉伸导致的不一致）
        this.mouse.x = (event.clientX - rect.left) / rect.width * this.canvas.width;
        this.mouse.y = (event.clientY - rect.top) / rect.height * this.canvas.height;
        
        // 转换为游戏世界坐标
        this.mouse.worldX = this.mouse.x + this.cameraX;
        this.mouse.worldY = this.mouse.y + this.cameraY;
    }

    /**
     * 处理触摸开始事件
     */
    handleTouchStart(event) {
        event.preventDefault();
        if (event.touches.length > 0) {
            const touch = event.touches[0];
            this.updateTouchPosition(touch);
            this.mouse.isDown = true;
            this.mouse.clicked = true;
            // 触摸等价于左键按下，记入 buttons，保证 isMouseButtonDown(0) 生效
            this.mouse.button = 0;
            this.mouse.buttons.add(0);
        }
    }

    /**
     * 处理触摸结束事件
     */
    handleTouchEnd(event) {
        event.preventDefault();
        this.mouse.isDown = false;
        // 释放左键
        this.mouse.buttons.delete(0);
        this.mouse.button = -1;
    }

    /**
     * 处理触摸移动事件
     */
    handleTouchMove(event) {
        event.preventDefault();
        if (event.touches.length > 0) {
            const touch = event.touches[0];
            this.updateTouchPosition(touch);
        }
    }

    /**
     * 更新触摸位置
     */
    updateTouchPosition(touch) {
        if (this.pointerTransform) {
            const p = this.pointerTransform(touch.clientX, touch.clientY);
            if (p) {
                this.mouse.x = p.x;
                this.mouse.y = p.y;
                this.mouse.worldX = this.mouse.x + this.cameraX;
                this.mouse.worldY = this.mouse.y + this.cameraY;
                return;
            }
        }
        const rect = this.canvas.getBoundingClientRect();
        
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        this.mouse.x = (touch.clientX - rect.left) * scaleX;
        this.mouse.y = (touch.clientY - rect.top) * scaleY;
        
        this.mouse.worldX = this.mouse.x + this.cameraX;
        this.mouse.worldY = this.mouse.y + this.cameraY;
    }

    /**
     * 检查键是否按下（键盘或手柄）
     * @param {string} key - 键名
     * @returns {boolean}
     */
    isKeyDown(key) {
        return this.keys.get(key) === true || this._padDown.has(key);
    }

    /**
     * 检查键是否在本帧按下（键盘或手柄）
     * @param {string} key - 键名
     * @returns {boolean}
     */
    isKeyPressed(key) {
        return this.keysPressed.get(key) === true || this._padPressed.has(key);
    }

    /**
     * 检查是否有任意键在本帧按下
     * @returns {boolean}
     */
    isAnyKeyPressed() {
        return this.keysPressed.size > 0 || this._padPressed.size > 0;
    }

    /**
     * 检查键是否在本帧释放（键盘或手柄）
     * @param {string} key - 键名
     * @returns {boolean}
     */
    isKeyReleased(key) {
        return this.keysReleased.get(key) === true || this._padReleased.has(key);
    }

    /**
     * 获取本帧按下的所有键（含手柄）
     * @returns {Array<string>}
     */
    getKeysPressed() {
        const keys = new Set(this.keysPressed.keys());
        for (const k of this._padPressed) keys.add(k);
        return Array.from(keys);
    }

    // ─── 手柄 ───────────────────────────────────────────

    /**
     * 帧首轮询手柄并注入虚拟键 / 虚拟准星。
     * 必须在任何 isKeyDown/isKeyPressed 读取之前调用（GameEngine.update 开头），
     * 否则本帧读到的是上一帧的手柄状态。
     * @returns {boolean} 本帧是否有可用手柄
     */
    pollGamepads() {
        if (!this.gamepadEnabled || !this.gamepad) return false;
        // 帧守卫：一帧只真正轮询一次。GameEngine 路径与场景 update 可能都会调，
        // 重复 poll 会用刚写入的状态做对比，导致本帧 pressed/released 被清空。
        // 守卫在帧末 update() 重置。
        if (this._padPolledThisFrame) return this.isGamepadConnected();
        this._padPolledThisFrame = true;

        const active = this.gamepad.poll();
        this._padDown.clear();
        this._padPressed.clear();
        this._padReleased.clear();
        this._padMouseButtons.clear();
        this._padCursorActive = false;
        if (!active) return false;

        const vk = this.gamepad.getVirtualKeys();
        for (const k of vk.down) this._padDown.add(k);
        for (const k of vk.pressed) this._padPressed.add(k);
        for (const k of vk.released) this._padReleased.add(k);

        this._updateGamepadCursor();
        return true;
    }

    /**
     * 右摇杆驱动虚拟准星，A 键注入鼠标左键（攻击瞄准复用鼠标那套逻辑）。
     * 准星原点取画面中心：相机跟随玩家，中心即玩家位置，无需知道玩家实体。
     * @private
     */
    _updateGamepadCursor() {
        const aim = this.gamepad.getAimVector();
        if (aim.magnitude > 0) {
            const cx = this.canvas ? this.canvas.width / 2 : 0;
            const cy = this.canvas ? this.canvas.height / 2 : 0;
            this.mouse.x = cx + aim.x * this.gamepadCursorRadius;
            this.mouse.y = cy + aim.y * this.gamepadCursorRadius;
            this.mouse.worldX = this.mouse.x + this.cameraX;
            this.mouse.worldY = this.mouse.y + this.cameraY;
            this._padCursorActive = true;
        }

        // 攻击键（绑定为 attack 的按钮，默认 A）：等价按住鼠标左键
        // （MeleeAttackSystem 读 isMouseButtonDown(0)），支持编辑器改绑
        if (this.gamepad.isAttackDown()) {
            this._padMouseButtons.add(0);
            if (this.gamepad.isAttackPressed()) this.mouse.clicked = true;
        }
    }

    /** 是否有手柄连接 */
    isGamepadConnected() {
        return !!this.gamepad && this.gamepad.isConnected();
    }

    /** 手柄信息（无手柄返回 null） */
    getGamepadInfo() {
        return this.gamepad ? this.gamepad.info : null;
    }

    /** 本帧准星是否由手柄右摇杆控制（供 UI 画准星） */
    isGamepadCursorActive() {
        return this._padCursorActive;
    }

    /** 启用/禁用手柄输入 */
    setGamepadEnabled(enabled) {
        this.gamepadEnabled = !!enabled;
        if (!this.gamepadEnabled) {
            this._padDown.clear();
            this._padPressed.clear();
            this._padReleased.clear();
            this._padMouseButtons.clear();
            this._padCursorActive = false;
        }
    }

    /**
     * 移动输入向量。手柄左摇杆可给出模拟量（轻推慢走），键盘/十字键为 ±1。
     * MovementSystem 优先用它，取不到再退回逐键判断。
     * @returns {{x:number, y:number, magnitude:number}}
     */
    getMoveAxis() {
        // 手柄优先：摇杆有输入时用模拟量
        if (this.gamepad && this.gamepad.isConnected()) {
            const mv = this.gamepad.getMoveVector();
            if (mv.magnitude > 0) return mv;
        }

        let x = 0, y = 0;
        if (this.keys.get('left') === true) x -= 1;
        if (this.keys.get('right') === true) x += 1;
        if (this.keys.get('up') === true) y -= 1;
        if (this.keys.get('down') === true) y += 1;
        if (x === 0 && y === 0) return { x: 0, y: 0, magnitude: 0 };

        const mag = Math.hypot(x, y);
        return { x: x / mag, y: y / mag, magnitude: 1 };
    }

    /**
     * 手柄震动（不支持的平台静默忽略）
     * @param {number} [duration=200]
     * @param {number} [strong=0.6]
     * @param {number} [weak=0.3]
     */
    vibrate(duration, strong, weak) {
        if (this.gamepad) return this.gamepad.vibrate(duration, strong, weak);
        return Promise.resolve(false);
    }

    /**
     * 获取鼠标屏幕坐标
     * @returns {{x: number, y: number}}
     */
    getMousePosition() {
        return { x: this.mouse.x, y: this.mouse.y };
    }

    /**
     * 获取鼠标世界坐标
     * 优先使用 backend.picker.pickGround（3D 真实反投影），否则回退到 cameraX/Y 偏移
     * @returns {{x: number, y: number}}
     */
    getMouseWorldPosition() {
        // 只在 3D 模式下使用 picker（3D 需要光线投射做屏幕→地面的反投影）
        // 2D 模式下直接使用 InputManager 通过 setCameraPosition 维护的 worldX/worldY，
        // 避免 backend 内部相机与游戏实际相机不同步导致坐标错误
        if (this._backend && this._backend.mode === '3d' && this._backend.picker && typeof this._backend.picker.pickGround === 'function') {
            const ground = this._backend.picker.pickGround(this.mouse.x, this.mouse.y);
            if (ground) {
                return { x: ground.x, y: ground.z };
            }
        }
        return { x: this.mouse.worldX, y: this.mouse.worldY };
    }

    /**
     * 设置当前渲染后端（由 GameEngine 注入，用于 picker 坐标转换）
     * @param {import('../rendering/backends/IRenderBackend.js').IRenderBackend} backend
     */
    setBackend(backend) {
        this._backend = backend;
    }

    /**
     * 检查鼠标是否点击
     * @returns {boolean}
     */
    isMouseClicked() {
        return this.mouse.clicked;
    }

    /**
     * 检查是否是Ctrl+鼠标左键点击
     * @returns {boolean}
     */
    isCtrlClick() {
        return this.mouse.clicked && this.mouse.ctrlKey && this.mouse.button === 0;
    }

    /**
     * 检查鼠标是否按下
     * @returns {boolean}
     */
    isMouseDown() {
        return this.mouse.isDown || this._padMouseButtons.size > 0;
    }

    /**
     * 检查指定鼠标按键是否按住
     * @param {number} button - 0=左键, 1=中键, 2=右键
     * @returns {boolean}
     */
    isMouseButtonDown(button) {
        return this.mouse.buttons.has(button) || this._padMouseButtons.has(button);
    }

    /**
     * 获取鼠标按钮
     * @returns {number} 0=左键, 1=中键, 2=右键
     */
    getMouseButton() {
        return this.mouse.button;
    }

    /**
     * 标记鼠标点击已被处理
     * 用于 UI 点击阻止功能，当 UI 处理了点击事件后调用此方法
     * 防止点击事件传播到游戏世界层（如移动系统）
     */
    markMouseClickHandled() {
        this.mouse.handled = true;
        this.mouse.clicked = false;  // 清除点击状态
    }

    /**
     * 检查鼠标点击是否已被处理
     * @returns {boolean} 如果点击已被 UI 处理则返回 true
     */
    isMouseClickHandled() {
        return this.mouse.handled;
    }

    /**
     * 设置相机位置（用于坐标转换）
     * @param {number} x - 相机X坐标
     * @param {number} y - 相机Y坐标
     */
    setCameraPosition(x, y) {
        this.cameraX = x;
        this.cameraY = y;
    }

    /**
     * 屏幕坐标转世界坐标
     * @param {number} screenX - 屏幕X坐标
     * @param {number} screenY - 屏幕Y坐标
     * @returns {{x: number, y: number}}
     */
    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.cameraX,
            y: screenY + this.cameraY
        };
    }

    /**
     * 世界坐标转屏幕坐标
     * @param {number} worldX - 世界X坐标
     * @param {number} worldY - 世界Y坐标
     * @returns {{x: number, y: number}}
     */
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.cameraX,
            y: worldY - this.cameraY
        };
    }

    /**
     * 注册快捷键
     * @param {string} id - 快捷键唯一标识
     * @param {string|string[]} keys - 键名或键名数组（任一触发）
     * @param {Function} callback - 触发回调
     * @param {Object} options - 配置选项
     * @param {number} options.cooldown - 冷却时间（毫秒），默认300
     * @param {boolean} options.onPress - 是否在按下瞬间触发（默认true），false则在持续按住时触发
     */
    registerHotkey(id, keys, callback, options = {}) {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        const cooldown = options.cooldown ?? 300;
        const onPress = options.onPress ?? true;
        
        const hotkeyData = { id, callback, cooldown, lastTriggerTime: 0, onPress };
        
        for (const key of keyArray) {
            const mappedKey = this.keyMap[key] || key;
            if (!this.hotkeys.has(mappedKey)) {
                this.hotkeys.set(mappedKey, []);
            }
            this.hotkeys.get(mappedKey).push(hotkeyData);
        }
    }

    /**
     * 注销快捷键
     * @param {string} id - 快捷键唯一标识
     */
    unregisterHotkey(id) {
        for (const [key, handlers] of this.hotkeys) {
            const filtered = handlers.filter(h => h.id !== id);
            if (filtered.length === 0) {
                this.hotkeys.delete(key);
            } else {
                this.hotkeys.set(key, filtered);
            }
        }
    }

    /**
     * 清除所有快捷键
     */
    clearHotkeys() {
        this.hotkeys.clear();
    }

    /**
     * 处理快捷键（每帧调用）
     * @private
     */
    processHotkeys() {
        const now = Date.now();
        
        for (const [key, handlers] of this.hotkeys) {
            for (const handler of handlers) {
                const shouldTrigger = handler.onPress 
                    ? this.isKeyPressed(key)
                    : this.isKeyDown(key);
                
                if (shouldTrigger && (now - handler.lastTriggerTime >= handler.cooldown)) {
                    handler.lastTriggerTime = now;
                    handler.callback(key);
                }
            }
        }
    }

    /**
     * 更新输入状态（每帧调用）
     */
    update() {
        // 处理注册的快捷键
        this.processHotkeys();
        
        // 清除本帧的按键状态
        this.keysPressed.clear();
        this.keysReleased.clear();
        
        // 清除鼠标点击状态
        this.mouse.clicked = false;
        this.mouse.handled = false;  // 重置处理标记
        
        // 重置手柄帧守卫：下一帧允许再次真正轮询
        this._padPolledThisFrame = false;
    }

    /**
     * 清除所有输入状态
     */
    clear() {
        this.keys.clear();
        this.keysPressed.clear();
        this.keysReleased.clear();
        this.mouse.clicked = false;
        this.mouse.isDown = false;
        this.mouse.button = -1;
        this.mouse.buttons.clear();
        this._padDown.clear();
        this._padPressed.clear();
        this._padReleased.clear();
        this._padMouseButtons.clear();
        this._padCursorActive = false;
    }

    /**
     * 销毁输入管理器
     */
    destroy() {
        // 移除所有事件监听器
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        
        if (this.gamepad) this.gamepad.destroy();
        this.clear();
        this.clearHotkeys();
        console.log('InputManager: Destroyed');
    }
}
