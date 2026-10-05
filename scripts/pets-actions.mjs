// 動作ごとの連続スクリーンショット（猫・犬 × 赤ちゃん/成体）。使い方: node scripts/pets-actions.mjs [cat_baby ...]
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = '/home/user/mofumofu/docs/verification/pets/';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const day = { baby: 2, young: 10, adult: 25 };
const want = process.argv.slice(2);
for (const species of ['cat', 'dog']) for (const stage of ['baby', 'adult']) {
  const id = `${species}_${stage}`;
  if (want.length && !want.includes(id)) continue;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(([sp, d]) => localStorage.setItem('mofumofu-save-v2', JSON.stringify({ version: 2, species: sp, tutorial: 'done', updatedAt: 5, journal: [], game: { v: 1, name: 'ミケ', day: d, ap: 3, dog: { full: 30, energy: 70, trust: 30, anx: 30 }, me: { hp: 70, collapsed: false }, inv: { ration: 2, can: 1, dogfood: 1 }, gear: { ball: false, blanket: false, map: false }, daily: { pets: 0, played: false, explored: false, dogAte: false }, flags: {}, seen: [], registered: null, chapter: 0, stats: { explores: 0 }, pendingNight: null, seed: 5, log: [], lastSeen: Date.now(), apMax: 3 } })), [species, day[stage]]);
  await p.goto('http://127.0.0.1:5199/');
  await p.waitForFunction(() => window.__play, null, { timeout: 40000 });
  await p.waitForTimeout(1200);
  const shot = (n) => p.screenshot({ path: `${OUT}${id}-${n}.png`, clip: { x: 0, y: 380, width: 390, height: 330 } });
  // 歩く：左の床をタップ → 数コマ
  await p.touchscreen.tap(40, 640);
  for (let i = 0; i < 5; i++) { await p.waitForTimeout(500); await shot(`walk-${i}`); }
  await p.waitForTimeout(4000);
  // 中央の右へ
  await p.touchscreen.tap(350, 640);
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(600); await shot(`walkR-${i}`); }
  await p.waitForTimeout(4500);
  // なでる
  const box = await p.locator('#dog').boundingBox();
  await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(450); await shot(`pet-${i}`); }
  await p.waitForTimeout(2500);
  // ごはん（実際の操作）
  await p.tap('[data-action=feed]'); await p.waitForTimeout(500);
  await p.tap('#foods button >> nth=0'); 
  for (let i = 0; i < 5; i++) { await p.waitForTimeout(700); await shot(`eat-${i}`); }
  await p.waitForTimeout(4000);
  for (const [m, ms, n] of [['drink', 1600, 3], ['play', 1700, 3], ['sleep', 2000, 3], ['sad', 1500, 1]]) {
    await p.evaluate(([m, ms]) => window.__play(m, ms), [m, ms]);
    for (let i = 0; i < n; i++) { await p.waitForTimeout(ms / (n + 0.5)); await shot(`${m}-${i}`); }
    await p.waitForTimeout(1500);
  }
  console.log(id, 'errors', errs);
  await ctx.close();
}
await b.close();
