// 承認済み犬の待機PNGから PNG アイコンを書き出す（npm run icons）
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const dog = readFileSync(new URL('../public/assets/dog/idle-v12/frame_00.png', import.meta.url)).toString('base64');
const out = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  // maskable：安全領域（中央80%）に収まるよう縮める
  ['icon-maskable-512.png', 512, 0.1],
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [name, size] of out) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size * 0.8;
  await page.setContent(`<body style="margin:0;background:#f8f4ed;display:grid;place-items:center;height:${size}px">
    <img width="${inner}" height="${inner}" src="data:image/png;base64,${dog}" alt=""></body>`);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
