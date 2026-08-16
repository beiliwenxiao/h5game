import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { editorFileAPIPlugin } from './src/dev/EditorFileApiPlugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANONICAL_PROJECT = 'example/sanguo_zhangjiao/game.project.json';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  plugins: [editorFileAPIPlugin({
    repoRoot: __dirname,
    allowedProjectPaths: [CANONICAL_PROJECT]
  })],
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