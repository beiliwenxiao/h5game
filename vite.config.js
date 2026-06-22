import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = __dirname;

/**
 * 编辑器文件读写 API（Vite dev server middleware）
 * 仅在 dev 模式生效。
 */
function editorFileAPIPlugin() {
  return {
    name: 'editor-file-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === 'GET' && req.url.startsWith('/api/read-file')) {
          const url = new URL(req.url, 'http://localhost');
          const filePath = url.searchParams.get('path');
          if (!filePath) { res.statusCode = 400; res.end(JSON.stringify({ error: '缺少 path 参数' })); return; }
          const absPath = path.resolve(repoRoot, filePath);
          if (!absPath.startsWith(repoRoot)) { res.statusCode = 403; res.end(JSON.stringify({ error: '路径越权' })); return; }
          if (!fs.existsSync(absPath)) { res.statusCode = 404; res.end(JSON.stringify({ error: '文件不存在' })); return; }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, content: fs.readFileSync(absPath, 'utf-8') }));
          return;
        }
        if (req.method === 'POST' && req.url === '/api/save-file') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { path: filePath, content } = JSON.parse(body);
              if (!filePath || content === undefined) { res.statusCode = 400; res.end(JSON.stringify({ error: '缺少参数' })); return; }
              const absPath = path.resolve(repoRoot, filePath);
              if (!absPath.startsWith(repoRoot)) { res.statusCode = 403; res.end(JSON.stringify({ error: '路径越权' })); return; }
              const dir = path.dirname(absPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(absPath, content, 'utf-8');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true, path: filePath }));
              console.log(`[editor-file-api] 已保存: ${filePath}`);
            } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
          });
          return;
        }
        if (req.method === 'GET' && req.url.startsWith('/api/list-files')) {
          const url = new URL(req.url, 'http://localhost');
          const dirPath = url.searchParams.get('path');
          if (!dirPath) { res.statusCode = 400; res.end(JSON.stringify({ error: '缺少 path 参数' })); return; }
          const absPath = path.resolve(repoRoot, dirPath);
          if (!absPath.startsWith(repoRoot)) { res.statusCode = 403; res.end(JSON.stringify({ error: '路径越权' })); return; }
          if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) { res.statusCode = 404; res.end(JSON.stringify({ error: '目录不存在' })); return; }
          const files = fs.readdirSync(absPath).map(name => ({ name, isDir: fs.statSync(path.join(absPath, name)).isDirectory() }));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, files }));
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  plugins: [editorFileAPIPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
