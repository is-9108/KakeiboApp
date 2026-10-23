import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * テスト用の認証境界（e2e/fixtures/amplifyAuth.ts）への差し替え。
 * 本体の AuthContext と api/client が持つ相対import「だけ」を差し替える。
 */
const e2eAuthOverride: Plugin = {
  name: 'e2e-auth-override',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer === undefined) {
      return null
    }
    const normalized = importer.split(path.sep).join('/')
    if (source === './amplifyAuth' && normalized.includes('/src/auth/AuthContext')) {
      return path.resolve(dirname, 'e2e/fixtures/amplifyAuth.ts')
    }
    if (source === '../auth/amplifyAuth' && normalized.includes('/src/api/client')) {
      return path.resolve(dirname, 'e2e/fixtures/amplifyAuth.ts')
    }
    return null
  },
}

export default defineConfig({
  root: path.resolve(dirname, 'e2e/fixtures'),
  plugins: [react(), e2eAuthOverride],
  server: {
    port: 5174,
    strictPort: true,
  },
})
