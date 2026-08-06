import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 仓库根目录（引擎 src 所在位置）
const repoRoot = path.resolve(__dirname, '../../');

/**
 * 拷贝运行时按字符串路径加载的资源目录。
 * 这些资源不是通过 import 引入的，Vite 不会自动处理，需要手动整体拷贝：
 *   - assets/  图片、音频等
 *   - data/    运行时 fetch 的剧情和资源数据
 *   - config/  UIEditor、PanelEditor 与手柄绑定的运行时配置
 */
function copyRuntimeDirsPlugin(outDir) {
  const dirs = ['assets', 'data', 'config'];
  return {
    name: 'copy-runtime-dirs',
    apply: 'build',
    closeBundle() {
      for (const dir of dirs) {
        const from = path.resolve(__dirname, dir);
        const to = path.resolve(outDir, dir);
        if (fs.existsSync(from)) {
          fs.cpSync(from, to, { recursive: true });
          console.log(`[copy-runtime-dirs] 已拷贝 ${dir} -> ${to}`);
        }
      }
    }
  };
}

/**
 * 编辑器文件读写 API（Vite dev server middleware）
 *
 * 仅在 dev 模式生效。提供两个 API:
 *   GET  /api/read-file?path=relative/path.json  → 返回文件内容
 *   POST /api/save-file  body: { path, content } → 写入文件
 *
 * path 相对于仓库根目录(repoRoot)，限制在仓库内，防止越权写入。
 */
function editorFileAPIPlugin() {
  return {
    name: 'editor-file-api',
    apply: 'serve', // 仅 dev server
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // 读取文件
        if (req.method === 'GET' && req.url.startsWith('/api/read-file')) {
          const url = new URL(req.url, 'http://localhost');
          const filePath = url.searchParams.get('path');
          if (!filePath) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: '缺少 path 参数' }));
            return;
          }
          const absPath = path.resolve(repoRoot, filePath);
          // 安全检查：必须在仓库内
          if (!absPath.startsWith(repoRoot)) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: '路径越权' }));
            return;
          }
          if (!fs.existsSync(absPath)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: '文件不存在', path: filePath }));
            return;
          }
          const content = fs.readFileSync(absPath, 'utf-8');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, content }));
          return;
        }
        
        // 保存文件
        if (req.method === 'POST' && req.url === '/api/save-file') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { path: filePath, content, encoding = 'utf8' } = JSON.parse(body);
              if (!filePath || content === undefined) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: '缺少 path 或 content' }));
                return;
              }
              if (encoding !== 'utf8' && encoding !== 'base64') {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: '不支持的文件编码' }));
                return;
              }
              const absPath = path.resolve(repoRoot, filePath);
              const relativePath = path.relative(repoRoot, absPath);
              // 必须是仓库内相对路径，避免 ../ 或盘符路径绕过。
              if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                res.statusCode = 403;
                res.end(JSON.stringify({ error: '路径越权' }));
                return;
              }
              // 确保目录存在
              const dir = path.dirname(absPath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              const fileContent = encoding === 'base64' ? Buffer.from(content, 'base64') : content;
              fs.writeFileSync(absPath, fileContent, encoding === 'base64' ? undefined : 'utf-8');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true, path: filePath }));
              console.log(`[editor-file-api] 已保存: ${filePath}`);
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }
        
        // 列出目录文件
        if (req.method === 'GET' && req.url.startsWith('/api/list-files')) {
          const url = new URL(req.url, 'http://localhost');
          const dirPath = url.searchParams.get('path');
          if (!dirPath) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: '缺少 path 参数' }));
            return;
          }
          const absPath = path.resolve(repoRoot, dirPath);
          if (!absPath.startsWith(repoRoot)) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: '路径越权' }));
            return;
          }
          if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: '目录不存在' }));
            return;
          }
          const files = fs.readdirSync(absPath).map(name => {
            const stat = fs.statSync(path.join(absPath, name));
            return { name, isDir: stat.isDirectory() };
          });
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, files }));
          return;
        }

        // 获取文件大小（字节）——用于编辑器显示图片文件大小
        if (req.method === 'GET' && req.url.startsWith('/api/file-size')) {
          const url = new URL(req.url, 'http://localhost');
          const filePath = url.searchParams.get('path');
          if (!filePath) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: '缺少 path 参数' }));
            return;
          }
          const absPath = path.resolve(repoRoot, filePath);
          if (!absPath.startsWith(repoRoot)) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: '路径越权' }));
            return;
          }
          if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: '文件不存在' }));
            return;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, size: fs.statSync(absPath).size }));
          return;
        }
        
        next();
      });
    }
  };
}

// 输出目录：仓库根的 dist/sanguo_zhangjiao
const outDir = path.resolve(repoRoot, 'dist/sanguo_zhangjiao');

export default defineConfig({
  // 以本 demo 目录作为项目根，index.html 即入口
  root: __dirname,

  // 资源用相对路径引用，方便部署到任意子目录 / 直接用 file:// 打开
  base: './',

  plugins: [copyRuntimeDirsPlugin(outDir), editorFileAPIPlugin()],

  // 允许 Vite dev server 访问仓库根目录下的引擎 src
  server: {
    port: 3100,
    open: true,
    fs: {
      allow: [repoRoot]
    }
  },

  build: {
    outDir,
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2018'
  }
});
