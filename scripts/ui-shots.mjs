// 画面（ホーム・シート・記録・備蓄・夜の場面）のスクリーンショット。使い方: node scripts/ui-shots.mjs [幅 高さ [日 種類]]
import { chromium } from 'playwright';
import fs from 'fs';
const [,, W = '390', H = '844', DAY = '3', SP = 'cat'] = process.argv;
const OUT = `/home/user/mofumofu/docs/verification/ui/${W}x${H}-d${DAY}-${SP}/`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.addInitScript(([sp, d]) => localStorage.setItem('mofumofu-save-v2', JSON.stringify({ version: 2, species: sp, tutorial: 'done', updatedAt: 5, journal: [{ day: 1, title: '夜間待機', text: '対象「ミケ」は、部屋の隅で丸くなっている。\nこちらを見ては、目をそらす。\n耳が、こちらを向いた。距離は維持。' }, { day: 2, title: '夜間放送', text: '外部通信を受信。\nこの部屋の生体反応は、1。\n通信を終了。' }], game: { v: 1, name: 'ミケ', day: d, ap: 3, apMax: 3, dog: { full: 62, energy: 70, trust: 38, anx: 34 }, me: { hp: 68, collapsed: false }, inv: { ration: 2, can: 1, dogfood: 1 }, gear: { ball: false, blanket: true, map: false }, daily: { pets: 1, played: false, explored: false, dogAte: true }, flags: {}, seen: [], registered: d > 7 ? false : null, chapter: d > 7 ? 1 : 0, stats: { explores: 1 }, pendingNight: null, seed: 5, log: [], lastSeen: Date.now() } })), [SP, +DAY]);
await p.goto('http://127.0.0.1:5199/');
await p.waitForFunction(() => window.__play, null, { timeout: 40000 });
await p.waitForTimeout(1800);
const shot = (n) => p.screenshot({ path: `${OUT}${n}.png` });
await shot('01-home');
if (process.env.ONLYNIGHT !== '1') {
await p.tap('[data-action=feed]'); await p.waitForTimeout(700); await shot('02-feed'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.tap('[data-action=explore]'); await p.waitForTimeout(700); await shot('03-explore'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.tap('[data-open=journal]'); await p.waitForTimeout(600); await shot('04-journal'); await p.tap('.panel-head button'); await p.waitForTimeout(400);
await p.tap('[data-open=supplies]'); await p.waitForTimeout(600); await shot('05-supplies'); await p.tap('.panel-head button'); await p.waitForTimeout(400);
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
