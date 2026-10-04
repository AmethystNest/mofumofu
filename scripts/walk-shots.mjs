import { chromium } from 'playwright';
const OUT = '/home/user/mofumofu/docs/verification/anim/';
import fs from 'fs'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const species of ['cat', 'dog']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((sp) => localStorage.setItem('mofumofu-save-v2', JSON.stringify({ version: 2, species: sp, tutorial: 'done', updatedAt: 5, journal: [], game: { v: 1, name: 'ミケ', day: 2, ap: 3, dog: { full: 70, energy: 70, trust: 30, anx: 30 }, me: { hp: 70, collapsed: false }, inv: { ration: 2, can: 1, dogfood: 1 }, gear: { ball: false, blanket: false, map: false }, daily: { pets: 0, played: false, explored: false, dogAte: false }, flags: {}, seen: [], registered: null, chapter: 0, stats: { explores: 0 }, pendingNight: null, seed: 5, log: [], lastSeen: Date.now(), apMax: 3 } })), species);
  await p.goto('http://127.0.0.1:5199/');
  await p.waitForFunction(() => window.__play, null, { timeout: 20000 }).catch(async () => { console.log('NO __play', errs, await p.evaluate(() => [document.querySelector('#feedback')?.textContent, document.body.className, localStorage.getItem('mofumofu-save-v2')?.slice(0,120)])); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + `${species}-00-rest.png` });
  // 床の左をタップ → 歩く
  await p.touchscreen.tap(60, 650);
  for (let i = 1; i <= 4; i++) { await p.waitForTimeout(450); await p.screenshot({ path: OUT + `${species}-walk-${i}.png` }); }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + `${species}-walk-end.png` });
  for (const m of ['stretch', 'shake', 'sniff']) {
    await p.evaluate((m) => window.__play(m, 3000), m);
    await p.waitForTimeout(900); await p.screenshot({ path: OUT + `${species}-${m}.png` });
    await p.waitForTimeout(2600);
  }
  console.log(species, 'errors', errs);
  await ctx.close();
}
await b.close();
