---
inclusion: manual
---

# 安卓 APK 打包指南（Capacitor）

本项目使用 Capacitor 将 H5 游戏（示例 `sanguo_zhangjiao`）打包为 Android APK。

## 一、环境前提

| 项目 | 要求 | 本机实际 |
|------|------|----------|
| JDK | 17 | `E:\Program Files\Java\jdk-17.0.4`（JAVA_HOME 已设置） |
| Android SDK | cmdline-tools + platform-tools + platforms;android-34 + build-tools;34.0.0 | `H:\Android\Sdk` |
| Node / npm | 已安装 | npm 10.8.2 |
| Capacitor | 6.x | core / cli / android 已装 |

### Android SDK 目录结构（关键）
```
H:\Android\Sdk\
├── cmdline-tools\latest\bin\sdkmanager.bat   ← 注意必须有 latest 这层版本目录
├── platform-tools\
├── platforms\android-34\
└── build-tools\34.0.0\
```

> 解压 cmdline-tools 时务必用 Windows 自带解压或「只解一层」，
> 不要用会递归解包的工具（7-Zip/Bandizip 的「解压到」会把 jar 也解开），
> 否则 `lib\sdklib.jar` 会变成 `lib\sdklib\` 目录，导致
> `ClassNotFoundException: SdkManagerCli`。
> 验证正确：`dir H:\Android\Sdk\cmdline-tools\latest\lib\sdklib.jar` 能找到该文件。

## 二、关键配置文件

### capacitor.config.json（项目根目录）
```json
{
  "appId": "com.sanguo.zhangjiao",
  "appName": "三国张角",
  "webDir": "dist/sanguo_zhangjiao",
  "server": { "androidScheme": "https" }
}
```
- `webDir` 必须指向 vite 实际产物目录 `dist/sanguo_zhangjiao`（不是 `dist`）。

### android/local.properties（Gradle 定位 SDK）
```
sdk.dir=H:\\Android\\Sdk
```

## 三、构建步骤

### 1. 构建 Web 产物
```cmd
npm run build
```
产物输出到 `dist/sanguo_zhangjiao/`。

### 2. 同步到 Android 工程
每次改了 web 产物或 Capacitor 配置后执行：
```cmd
npx cap sync android
```
（首次生成 android 工程用 `npx cap add android`，只需一次。）

### 3. 构建 Debug APK
在 `android` 目录下执行（临时注入环境变量，避免依赖全局设置）：
```cmd
cd android
set ANDROID_HOME=H:\Android\Sdk
set ANDROID_SDK_ROOT=H:\Android\Sdk
gradlew.bat assembleDebug --no-daemon
```

### 4. 产物位置
```
android\app\build\outputs\apk\debug\app-debug.apk
```

## 四、常见问题排查

- **命令在终端 Exit Code 一直为 -1 / 回显错乱**：是终端会话回显问题，命令本身可能已执行成功。用 `cmd /c "dir ..."` 单条核验真实落盘结果，不要轻信回显。
- **解压后目标目录为空**：检查源 zip 文件头是否为 `PK`（`50 4B`），并改用 Windows 自带解压重试。
- **`Could not determine SDK root`**：cmdline-tools 缺少 `latest` 版本层目录。
- **`ClassNotFoundException: SdkManagerCli`**：lib 下的 jar 被错误递归解包成了目录，需重新正确解压。
- **Gradle 找不到 SDK**：检查 `android/local.properties` 的 `sdk.dir`，或设置 `ANDROID_HOME` 环境变量。

## 五、发布版（Release APK，需签名）

```cmd
cd android
gradlew.bat assembleRelease --no-daemon
```
Release 包需配置签名（keystore），未签名包无法安装。签名配置写在 `android/app/build.gradle` 的 `signingConfigs` 中，此处暂未配置。

## 六、移动端 UI 适配（sanguo_zhangjiao）

本节记录把 demo 适配安卓触屏的设计与改动点，方便后续维护。

### 移动端布局判定
`scenes/BaseGameScene.js` 构造函数里有 `this.isMobileLayout`：
```js
this.isMobileLayout = (typeof window !== 'undefined') &&
  (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
```
据此切换桌面/移动端 UI。

### 改动清单
1. **左下角虚拟摇杆**（替代原四向 D-pad）
   - HTML：`index.html` 的 `#touch-controls` 内 `#joystick-zone` + `#joystick-canvas`（透明圆形热区）。
   - 逻辑：`index.html` 的 `setupVirtualJoystick(pressKey, releaseKey, dirKey)`。
   - 原理：手指按下处作为摇杆中心，按手指方向绘制 90° 扇形圆周 + 圆周上方向小箭头；
     方向换算为 8 向，派发 `ArrowUp/Down/Left/Right` 键盘事件，**复用 InputManager / MovementSystem**，不改移动逻辑。
   - 死区 `DEAD_ZONE=18`，圆周半径 `RADIUS=70`，用 `requestAnimationFrame` 持续重绘。

2. **提示框字号缩小**
   - `index.html` CSS：`#tutorial-panel`/`#tips-panel` 的 `h3` 20→16px、`p` 18→14px、`.key` 18→14px。

3. **下方红球/蓝球/数字快捷键移动端隐藏 + 左上角新增玩家 HUD**
   - `src/ui/BottomControlBar.js` 新增 `showOrbs` / `showHotkeyNumbers` 选项（默认 true），
     render 时按开关跳过血球/蓝球和技能槽数字。移动端创建时传 `false`。
   - 新增框架组件 `src/ui/PlayerStatusHUD.js`：左上角头像 + 昵称 + 血条 + 蓝条，
     **复用已有 `HealthBar` / `ManaBar` 组件**。头像取 `SelectedCharacterStore` 的 `previewImage`。
   - 在 `BaseGameScene.js` 的 `initializeUIPanels()` 创建 `this.playerStatusHUD`（`visible: this.isMobileLayout`），
     并在 `createPlayerEntity`/`bindUIPanelsToPlayer` 调 `setPlayer`，在 `update`/`render` 中调用。

4. **去掉左上角 FPS 框**
   - `index.html` CSS：`#debug-panel` 增加 `display: none;`。

### 维护要点
- 新增的移动端 UI 都是引擎内可复用组件（PlayerStatusHUD）或现有组件加开关（BottomControlBar），
  符合"优先复用/补充到框架"的约定。
- 桌面版不受影响：`isMobileLayout` 为 false 时维持原样（显示血球、数字、FPS 走原逻辑）。

## 七、修改手机版本的工作流（重点：开发调试不需要每次打包）

> **修改手机版（UI/逻辑）时，绝大多数情况不需要重新打 APK。**

APK 里的 WebView 加载的是打包进去的静态 web 产物，但日常开发改的是 H5 代码。
调试有两种高效方式，都**不用走 3 分钟的 Gradle 打包**：

### 方式 A：浏览器 / Vite Dev Server 调试（最快，首选）
直接在桌面浏览器调试 H5，移动端布局可用 Chrome DevTools 设备模拟：
```cmd
npx vite --config example/sanguo_zhangjiao/vite.config.js
```
- 打开 DevTools → 切换设备模拟（触屏）即可触发 `isMobileLayout`，验证摇杆、HUD 等。
- 改代码热更新，无需打包。

### 方式 B：只重建 web 产物 + 同步（验证 WebView 内表现，仍不必每次出 APK）
```cmd
npx vite build --config example/sanguo_zhangjiao/vite.config.js
npx cap sync android
```
- 这一步把最新产物同步进 `android/app/src/main/assets/public`。
- 若设备已装过 APK 且用 live-reload/远程调试，可即时看到效果。

### 只有这些情况才需要重新打 APK（assembleDebug）
- 需要产出可分发/安装的安装包给别人测试时。
- 改了原生层：Capacitor 插件、`capacitor.config.json`、Android 权限、图标、包名等。
- 纯 H5 的 UI/逻辑改动**不在此列**，用方式 A/B 即可。

### 构建 demo web 产物的正确命令（易错点）
demo 有**独立 vite 配置**，根目录 `npm run build` 只会构建落地页，不会生成 `dist/sanguo_zhangjiao`：
```cmd
npx vite build --config example/sanguo_zhangjiao/vite.config.js
```
该配置 `emptyOutDir: true` 会清空并重建 `dist/sanguo_zhangjiao`，并自动拷贝 `assets`、`data`。

## 八、竖屏自动以横屏方式显示（不锁定方向）

需求：手机竖屏时不弹"请旋转手机"，也不强制锁定方向，而是直接把游戏页面以横屏呈现。

### 实现方式（CSS 旋转 + 坐标变换）
1. **CSS 旋转容器**（`example/sanguo_zhangjiao/index.html`）
   - 触屏 + 竖屏时给 `body` 加类 `force-landscape`。
   - `body.force-landscape #game-container` 旋转 90°，宽高对调（`width:100vh; height:100vw`），
     `transform: translate(-50%,-50%) rotate(90deg)` 填满屏幕。
   - 横屏/桌面不加类，保持原样。
   - 移除了原 `screen.orientation.lock('landscape')` 强制锁定 和 `#rotate-overlay` 竖屏提示遮罩。

2. **坐标变换（关键坑）**
   - CSS 旋转后 `getBoundingClientRect()` 返回的是旋转后外接矩形，触摸/点击坐标会错位。
   - 框架级补充：`src/core/InputManager.js` 新增 `setPointerTransform(fn)` 钩子，
     `updateMousePosition` / `updateTouchPosition` 优先用该钩子把页面坐标映射回 canvas 像素坐标。
   - 入口 `index.html`：
     - `applyForceLandscape()` 按竖屏与否切换 `force-landscape` 类并重算 canvas 尺寸。
     - `makePointerTransform()` 返回坐标映射函数（处理旋转 90° + 缩放）；旋转时
       `cx = py/rect.height*canvas.width`，`cy = (rect.width-px)/rect.width*canvas.height`。
     - `setupOrientation()` 把变换装到当前场景的 `inputManager.setPointerTransform`，
       并暴露 `window.__pointerTransform` 供虚拟摇杆复用。
     - 监听 `resize` / `orientationchange` 动态切换。

3. **虚拟摇杆适配旋转**
   - 摇杆绘制层改为与主 canvas 同像素尺寸的覆盖 canvas（`#joystick-overlay`），在 canvas 像素空间绘制。
   - 摇杆的 `clientToCanvas` 复用 `window.__pointerTransform`，保证旋转后摇杆中心、方向、
     点击移动、技能释放坐标都正确。

### 维护要点
- `setPointerTransform` 是通用框架能力：任何"页面被 CSS 旋转/缩放"的场景都可复用，不止本 demo。
- 若以后改为原生锁定横屏（AndroidManifest 加 `android:screenOrientation="landscape"`），
  则不需要 CSS 旋转，此时应让 `applyForceLandscape()` 不加 `force-landscape` 类（横屏即原样）。
