import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { editorFileAPIPlugin } from '../../src/dev/EditorFileApiPlugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');
const CANONICAL_PROJECT = 'example/sanguo_zhangjiao/game.project.json';

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

const outDir = path.resolve(repoRoot, 'dist/sanguo_zhangjiao');

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [
    copyRuntimeDirsPlugin(outDir),
    editorFileAPIPlugin({ repoRoot, allowedProjectPaths: [CANONICAL_PROJECT] })
  ],
  server: {
    port: 3100,
    open: true,
    fs: { allow: [repoRoot] }
  },
  build: {
    outDir,
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2018'
  }
});