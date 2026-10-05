// 溶かし（クロスフェード）の途中で、絵が半透明にならないかを調べる：背景を消して canvas を撮り、半透明の画素の割合を見る
import { chromium } from 'playwright';
import fs from 'fs';
const [,, id = 'cat_adult', action = 'walk'] = process.argv;
const [species, stage] = id.split('_');
const day = { baby: 2, young: 10, adult: 25 }[stage];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
await p.addInitScript(([sp, d]) => localStorage.setItem('mofumofu-save-v2', JSON.stringify({ version: 2, species: sp, tutorial: 'done', updatedAt: 5, journal: [], game: { v: 1, name: 'ミケ', day: d, ap: 3, dog: { full: 70, energy: 70, trust: 30, anx: 30 }, me: { hp: 70, collapsed: false }, inv: { ration: 2, can: 1, dogfood: 1 }, gear: { ball: false, blanket: false, map: false }, daily: { pets: 0, played: false, explored: false, dogAte: false }, flags: {}, seen: [], registered: null, chapter: 0, stats: { explores: 0 }, pendingNight: null, seed: 5, log: [], lastSeen: Date.now(), apMax: 3 } })), [species, day]);
await p.goto('http://127.0.0.1:5199/');
await p.waitForFunction(() => window.__play, null, { timeout: 40000 });
await p.addStyleTag({ content: '.room-bg,.hud,.care,nav,header,.save-note{display:none!important} html,body,.stage,.scene,main,#app,#view{background:#00ff00!important}' });
await p.evaluate(([a]) => window.__play(a, 6000), [action]);
await p.waitForTimeout(600);
const out = [];
for (let i = 0; i < 14; i++) {
  const buf = await p.locator('canvas.pet-canvas').screenshot({ omitBackground: true });
  fs.writeFileSync(`/tmp/alpha-${i}.png`, buf);
  await p.waitForTimeout(37);
}
await b.close();
