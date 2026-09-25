/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages（https://<owner>.github.io/mofumofu/）では BASE_PATH=/mofumofu/ でビルドする
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    target: ['es2022', 'safari16'],
    rollupOptions: { input: { main: 'index.html', lab: 'lab/dog.html' } },
  },
  plugins: [
    VitePWA({
      // 開発中は新しい版をすぐ有効にする（古い版が残ってページが差し替わる問題を避ける）。
      // 第3段階で、プレイ中に勝手に切り替えない「更新のお知らせ」方式（prompt）へ戻す
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/icon.svg'],
      manifest: {
        name: '配給は一人分',
        short_name: '配給は一人分',
        description: '住民の消えた管理都市で、一人分の配給を犬と分け合う育成シミュレーション。',
        lang: 'ja',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#161B20',
        theme_color: '#20262B',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,ink,mp3,m4a,ogg}'],
        // 比較用の大きなスプライトは事前キャッシュしない
        globIgnores: ['lab/**'],
        navigateFallback: 'index.html',
        // 比較ページなど index.html 以外のページへの遷移は、トップページで代替しない
        navigateFallbackDenylist: [/\/lab\//],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
