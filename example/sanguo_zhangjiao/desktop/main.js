const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// 是否为开发模式（通过环境变量控制）
const isDev = process.env.GAME_DEV === '1';

// 游戏静态资源目录（打包后 game/ 与 main.js 同级）
const gameRoot = path.join(__dirname, 'game');

// 常见 MIME 类型
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

/**
 * 启动一个仅监听本机回环地址的极简静态服务器。
 * ES Module（type="module"）在 file:// 下会被 CORS 拦截，
 * 因此用 http://127.0.0.1 加载游戏以保证模块和资源正常工作。
 */
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

        // 规范化并防止目录穿越
        const filePath = path.join(gameRoot, path.normalize(urlPath));
        if (!filePath.startsWith(gameRoot)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          res.end(data);
        });
      } catch (e) {
        res.writeHead(500);
        res.end('Internal Error');
      }
    });

    // 端口设为 0，由系统分配空闲端口，避免冲突
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}/index.html`);
    });
    server.on('error', reject);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#1a1a1a',
    title: '张角黄巾起义序章',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 隐藏菜单栏（发布版不需要 Electron 默认菜单）
  Menu.setApplicationMenu(null);

  const url = await startStaticServer();
  win.loadURL(url);

  if (isDev) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
