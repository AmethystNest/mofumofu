// 比較ページの各状態をスクリーンショットする: node scripts/lab-shots.mjs URL OUT_PREFIX [2d|3d]
import { chromium } from '@playwright/test';
const [url, out, m = '2d'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', c => c.type() === 'error' && errs.push(c.text()));
for (const s of ['idle', 'petted', 'eat', 'sleep', 'sad']) {
  await p.goto(`${url}?s=${s}`);
  await p.waitForFunction(() => window.__labReady, null, { timeout: 90000 });
  await p.waitForTimeout(1200);
  await p.locator('#stage').screenshot({ path: `${out}-${s}.png` });
}
console.log(await p.textContent('#meter'));
console.log('errors', errs);
await b.close();
