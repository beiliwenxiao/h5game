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
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        editor: path.resolve(__dirname, 'editor/index.html'),
        'editor-game-list': path.resolve(__dirname, 'editor/game-list.html'),
        'editor-scene-workflow': path.resolve(__dirname, 'editor/scene-workflow.html'),
        'editor-ui': path.resolve(__dirname, 'editor/ui-editor.html'),
        'editor-library': path.resolve(__dirname, 'editor/library-editor.html'),
        'editor-item-reference': path.resolve(__dirname, 'editor/item-reference.html'),
        'editor-dialogue': path.resolve(__dirname, 'editor/dialogue-editor.html'),
        'editor-world-map': path.resolve(__dirname, 'editor/world-map-editor.html'),
        'editor-panel': path.resolve(__dirname, 'editor/panel-editor.html'),
        'editor-system': path.resolve(__dirname, 'editor/system-editor.html')
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});