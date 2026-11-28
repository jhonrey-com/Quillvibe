import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const appVersion = String(pkg.version || '3.3.7');
let appCommit = 'local';
try {
  appCommit = execSync('git rev-parse --short HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim() || 'local';
} catch {
  appCommit = 'local';
}

export default defineConfig(() => ({
  base: process.env.TAURI_ENV_PLATFORM ? './' : '/',
  define: {
    __QUILLVIBE_VERSION__: JSON.stringify(appVersion),
    __QUILLVIBE_COMMIT__: JSON.stringify(appCommit),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        landing: resolve(rootDir, 'landing/index.html'),
        course: resolve(rootDir, 'course/index.html'),
        help: resolve(rootDir, 'help/index.html'),
        faq: resolve(rootDir, 'faq/index.html'),
        developer: resolve(rootDir, 'developer/index.html'),
        settings: resolve(rootDir, 'settings/index.html'),
        manual: resolve(rootDir, 'manual/index.html'),
        extensions: resolve(rootDir, 'extensions/index.html'),
      },
    },
  },
}));
