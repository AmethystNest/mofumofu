// public/icons/icon.svg から PNG アイコンを書き出す（npm run icons）
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  // maskable：安全領域（中央80%）に収まるよう縮める
  ['icon-maskable-512.png', 512, 0.1],
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [name, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size * (1 - pad * 2);
  await page.setContent(`<body style="margin:0;background:#20262B;display:grid;place-items:center;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
