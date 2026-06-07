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
 *   - data/    运行时 fetch 的 JSON 配置（ActXData.json、AudioConfig.json 等）
 */
function copyRuntimeDirsPlugin(outDir) {
  const dirs = ['assets', 'data'];
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

// 输出目录：仓库根的 dist/sanguo_zhangjiao
const outDir = path.resolve(repoRoot, 'dist/sanguo_zhangjiao');

export default defineConfig({
  // 以本 demo 目录作为项目根，index.html 即入口
  root: __dirname,

  // 资源用相对路径引用，方便部署到任意子目录 / 直接用 file:// 打开
  base: './',

  plugins: [copyRuntimeDirsPlugin(outDir)],

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
