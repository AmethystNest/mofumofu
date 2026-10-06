// 画面（ホーム・シート・記録・備蓄・夜の場面）のスクリーンショット。使い方: node scripts/ui-shots.mjs [幅 高さ [日 種類]]
import { chromium } from 'playwright';
import fs from 'fs';
const [,, W = '390', H = '844', DAY = '3', SP = 'cat'] = process.argv; // 日・種類はフォルダ名のみ（中身は SAVE）
const OUT = `/home/user/mofumofu/docs/verification/ui/${process.env.TAG || ''}${W}x${H}-d${DAY}-${SP}/`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); }); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
// 保存は scripts/sim/make-save.ts で作った JSON（環境変数 SAVE にファイルの場所）
const saveJson = fs.readFileSync(process.env.SAVE, 'utf8');
await p.addInitScript((j) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('mofumofu-save-v3', j); sessionStorage.setItem('seeded', '1'); } }, saveJson);
await p.goto(process.env.URL || 'http://127.0.0.1:5199/');
await p.waitForSelector('canvas.pet-canvas', { timeout: 40000 });
await p.waitForTimeout(1800);
const shot = (n) => p.screenshot({ path: `${OUT}${n}.png` });
await shot('01-home');
if (process.env.PET === '1') { await p.tap('#dog'); await p.waitForTimeout(1200); await shot('01b-pet1'); await p.tap('#dog'); await p.waitForTimeout(3200); await shot('01c-pet2'); }
if (process.env.ONLYNIGHT !== '1') {
await p.tap('[data-action=feed]'); await p.waitForTimeout(700); await shot('02-feed'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.tap('[data-action=room]'); await p.waitForTimeout(700); await shot('03-room'); await p.mouse.wheel(0, 700); await p.locator('.panel').evaluate((e) => e.scrollTop = 520); await p.waitForTimeout(300); await shot('03-room-2'); await p.locator('.panel').evaluate((e) => e.scrollTop = 99999); await p.waitForTimeout(300); await shot('03-room-3'); await p.tap('.panel-head button'); await p.waitForTimeout(400);
await p.tap('[data-open=journal]'); await p.waitForTimeout(600); await shot('04-journal'); await p.tap('.panel-head button'); await p.waitForTimeout(400);
await p.tap('[data-open=settings]'); await p.waitForTimeout(700); await shot('06-settings'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
}
if (process.env.NIGHT === '0') { console.log('errors', errs); await b.close(); process.exit(0); }
await p.tap('[data-action=rest]'); await p.waitForTimeout(700); await shot('07-rest-confirm');
await p.tap('.choices button >> nth=0');
let i = 0;
const t0 = Date.now();
while (await p.locator('.scene-ov').count() && Date.now() - t0 < 120000) {
  await p.waitForTimeout(process.env.NOTAP === '1' ? 1500 : 1800);
  if (await p.locator('.sc-panel.on').count()) { await shot(`08-night-choice`); await p.tap('.sc-panel button >> nth=0'); await p.waitForTimeout(900); continue; }
  if (i < 60) await shot(`08-night-${String(i++).padStart(2, '0')}`);
  const ov = p.locator('.scene-ov'); if (process.env.NOTAP !== '1' && await ov.count()) await p.touchscreen.tap(+W / 2, +H / 2).catch(() => {});
}
await p.waitForTimeout(1500);
await shot('09-next-morning');
console.log('errors', errs);
await b.close();
