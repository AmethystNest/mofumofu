// SVG（make_room.py の出力）を Chromium で描いて PNG にする。使い方：node render-room.mjs <svgフォルダ> <pngフォルダ> [倍率]
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [svgDir, pngDir, scale = '2'] = process.argv.slice(2);
mkdirSync(pngDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 780, height: 720 }, deviceScaleFactor: Number(scale) });
for (const f of readdirSync(svgDir).filter((n) => n.endsWith('.svg'))) {
  await page.setContent(`<body style="margin:0;background:#000">${readFileSync(join(svgDir, f), 'utf8')}</body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(pngDir, f.replace('.svg', '.png')), clip: { x: 0, y: 0, width: 780, height: 720 } });
}
await browser.close();
