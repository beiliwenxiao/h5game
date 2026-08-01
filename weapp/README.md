# 微信小游戏（WeApp MiniGame）

将 YiJian18-Engine 张角序章 Demo 打包为微信小游戏。

## 目录结构

```
weapp/
├── game.js              ← 小游戏入口
├── game.json            ← 小游戏配置
├── project.config.json  ← 微信开发者工具配置
├── build.js             ← 构建脚本（node weapp/build.js）
├── entry.js             ← Vite 构建入口（build.js 自动生成）
├── vite.config.weapp.js ← Vite 配置（build.js 自动生成）
├── adapter/             ← 浏览器 API → 小游戏 API 适配层
│   ├── index.js         ← 统一注入入口
│   ├── canvas.js        ← document.createElement('canvas') shim
│   ├── image.js         ← new Image() shim
│   ├── audio.js         ← Audio shim
│   ├── storage.js       ← localStorage shim
│   ├── fetch.js         ← fetch shim（本地文件 + 网络）
│   ├── event.js         ← 触摸事件 + window 事件 shim
│   ├── performance.js   ← performance.now shim
│   └── misc.js          ← navigator/location/raf 等杂项
├── src/                 ← 构建产物（bundle.js）
└── assets/              ← 构建时复制的静态资源
```

## 快速开始

### 1. 构建

```bash
# 在项目根目录
node weapp/build.js
```

这会：
- 用 Vite 把引擎+场景打成 `weapp/src/bundle.js`
- 复制资源文件到 `weapp/assets/`

### 2. 配置 AppID

编辑 `weapp/project.config.json`，填入你的微信小游戏 AppID：
```json
"appid": "你的AppID"
```

### 3. 启用引擎

编辑 `weapp/game.js`，取消注释 bootstrap 相关行：
```js
import { bootstrap } from './src/bundle.js';

bootstrap({
  canvas: mainCanvas,
  ctx,
  screenWidth,
  screenHeight,
  dpr
});
```

### 4. 预览

用微信开发者工具 → 导入项目 → 选择 `weapp/` 目录 → 预览。

## 适配层原理

小游戏环境没有 DOM/BOM（无 document、window、localStorage 等），但有自己的全局 API（wx.*）。

适配层在引擎代码加载之前执行，把 wx.* API 伪装成标准浏览器全局对象：

| 引擎代码调用 | 适配层转译为 |
|---|---|
| `document.createElement('canvas')` | `wx.createCanvas()` / `wx.createOffscreenCanvas()` |
| `new Image()` | `wx.createImage()` |
| `new Audio()` | `wx.createInnerAudioContext()` |
| `localStorage.getItem()` | `wx.getStorageSync()` |
| `fetch('file.json')` | `fs.readFileSync()` |
| `fetch('https://...')` | `wx.request()` |
| `canvas.addEventListener('touchstart')` | `wx.onTouchStart()` 转发 |
| `performance.now()` | `wx.getPerformance().now()` |

这样引擎源码不需要修改就能在小游戏中运行。

## 注意事项

- **包体限制**：主包 4MB，大资源（图片/音频）应放 CDN
- **无键盘**：小游戏没有物理键盘，InputManager 的键盘监听会空跑（不报错），依靠触屏虚拟摇杆/按钮操作
- **无 Gamepad**：手柄 API 不存在，GamepadManager.isSupported() 返回 false，自动降级
- **three.js**：不可用，BackendConfig 已配置 weapp 默认走 2D
- **横屏**：game.json 已设 `"deviceOrientation": "landscape"`
- **ES Module**：小游戏基础库 3.0+ 支持 ES Module，如遇问题改为 CommonJS bundle
