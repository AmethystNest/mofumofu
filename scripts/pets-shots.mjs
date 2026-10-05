// 犬・猫 × 成長段階 × 動作の確認用スクリーンショット（開発サーバー http://127.0.0.1:5199 を使う）
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = '/home/user/mofumofu/docs/verification/pets/';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const day = { baby: 2, young: 10, adult: 25 };
const only = process.argv[2];
for (const species of ['cat', 'dog']) for (const stage of ['baby', 'young', 'adult']) {
  if (only && only !== `${species}_${stage}`) continue;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(([sp, d]) => localStorage.setItem('mofumofu-save-v2', JSON.stringify({ version: 2, species: sp, tutorial: 'done', updatedAt: 5, journal: [], game: { v: 1, name: 'ミケ', day: d, ap: 3, dog: { full: 70, energy: 70, trust: 30, anx: 30 }, me: { hp: 70, collapsed: false }, inv: { ration: 2, can: 1, dogfood: 1 }, gear: { ball: false, blanket: false, map: false }, daily: { pets: 0, played: false, explored: false, dogAte: false }, flags: {}, seen: [], registered: null, chapter: 0, stats: { explores: 0 }, pendingNight: null, seed: 5, log: [], lastSeen: Date.now(), apMax: 3 } })), [species, day[stage]]);
  await p.goto('http://127.0.0.1:5199/');
  await p.waitForSelector('canvas.pet-canvas', { timeout: 40000 }).catch(() => console.log('no canvas', species, stage, errs));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + `${species}_${stage}-home.png` });
  console.log(species, stage, 'errors', errs);
  await ctx.close();
}
await b.close();
