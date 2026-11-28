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

/**
 * Dedicated desktop Vite build configuration outputting into `dist-desktop/`
 * so web hosting updates (`dist/`) remain isolated from native Tauri packaging.
 */
export default defineConfig(() => ({
  base: './',
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
    outDir: 'dist-desktop',
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      input: {
        desktop: resolve(rootDir, 'desktop.html'),
      },
    },
  },
}));
