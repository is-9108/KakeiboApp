/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // ローカル開発でブラウザからAPIを同一オリジンで呼べるようにする
    proxy: {
      '/api': {
        target: 'http://api:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // ブラウザテスト（Playwright）のspecをVitestが拾わないよう、単体テストはsrc配下に限定する
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
