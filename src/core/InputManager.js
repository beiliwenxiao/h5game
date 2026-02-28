/**
 * 输入管理器
 * 统一处理键盘、鼠标输入
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        
        // 键盘状态缓存
        this.keys = new Map();
        this.keysPressed = new Map(); // 本帧按下的键
        this.keysReleased = new Map(); // 本帧释放的键
        
        // 鼠标状态
        this.mouse = {
            x: 0,
            y: 0,
            worldX: 0,
            worldY: 0,
            isDown: false,
            button: -1,
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
        
        // 初始化事件监听
        this.initEventListeners();
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
        const mappedKey = this.keyMap[key] || key;
        
        // 如果键已经按下，不重复触发
        if (!this.keys.get(mappedKey)) {
            this.keysPressed.set(mappedKey, true);
        }
        
        this.keys.set(mappedKey, true);
        
        // 阻止某些默认行为
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(key)) {
            event.preventDefault();
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
        this.mouse.clicked = true;
        this.mouse.ctrlKey = event.ctrlKey; // 记录Ctrl键状态
    }

    /**
     * 处理鼠标释放事件
     */
    handleMouseUp(event) {
        this.updateMousePosition(event);
        this.mouse.isDown = false;
        this.mouse.button = -1;
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
        const rect = this.canvas.getBoundingClientRect();
        
        // 计算Canvas坐标（考虑缩放）
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        this.mouse.x = (event.clientX - rect.left) * scaleX;
        this.mouse.y = (event.clientY - rect.top) * scaleY;
        
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
        }
    }

    /**
     * 处理触摸结束事件
     */
    handleTouchEnd(event) {
        event.preventDefault();
        this.mouse.isDown = false;
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
        const rect = this.canvas.getBoundingClientRect();
        
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        this.mouse.x = (touch.clientX - rect.left) * scaleX;
        this.mouse.y = (touch.clientY - rect.top) * scaleY;
        
        this.mouse.worldX = this.mouse.x + this.cameraX;
        this.mouse.worldY = this.mouse.y + this.cameraY;
    }

    /**
     * 检查键是否按下
     * @param {string} key - 键名
     * @returns {boolean}
     */
    isKeyDown(key) {
        return this.keys.get(key) === true;
    }

    /**
     * 检查键是否在本帧按下
     * @param {string} key - 键名
     * @returns {boolean}
     */
    isKeyPressed(key) {
        return this.keysPressed.get(key) === true;
    }

    /**
     * 检查是否有任意键在本帧按下
     * @returns {boolean}
     */
    isAnyKeyPressed() {
        return this.keysPressed.size > 0;
    }

    /**
     * 检查键是否在本帧释放
     * @param {string} key - 键名
     * @returns {boolean}
     */
    isKeyReleased(key) {
        return this.keysReleased.get(key) === true;
    }

    /**
     * 获取本帧按下的所有键
     * @returns {Array<string>}
     */
    getKeysPressed() {
        return Array.from(this.keysPressed.keys());
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
     * @returns {{x: number, y: number}}
     */
    getMouseWorldPosition() {
        return { x: this.mouse.worldX, y: this.mouse.worldY };
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
        return this.mouse.isDown;
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
        
        this.clear();
        this.clearHotkeys();
        console.log('InputManager: Destroyed');
    }
}
