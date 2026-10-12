import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')

// One self-contained HTML file: Django serves it as a plain file (it contains {{ }} and {% %} examples,
// so it must never go through the Django template engine) and it can be published as a claude.ai artifact.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: { alias: { '@': path.resolve(here, 'src') } },
  server: { fs: { allow: [repo] } },
  build: {
    outDir: path.resolve(repo, 'renderer/frontend'),
    emptyOutDir: false,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx,js}'],
    setupFiles: ['src/test-setup.ts'],
  },
})
