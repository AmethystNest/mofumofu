/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages（https://<owner>.github.io/mofumofu/）では BASE_PATH=/mofumofu/ でビルドする
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: { target: ['es2022', 'safari16'] },
  plugins: [
    VitePWA({
      // 新しい版は、開いているタブがすべて閉じられてから有効になる（プレイ中に勝手に再読み込みしない）
      registerType: 'prompt',
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
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json,ink,mp3,m4a,ogg}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
