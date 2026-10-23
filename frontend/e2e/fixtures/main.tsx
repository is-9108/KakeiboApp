import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../../src/App'

/**
 * ブラウザテスト（Playwright）専用のエントリポイント。
 * 本体と同じ App をレンダリングするが、認証境界（amplifyAuth）だけは
 * vite.e2e.config.ts のプラグインでテスト用の実装へ差し替えている。
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
