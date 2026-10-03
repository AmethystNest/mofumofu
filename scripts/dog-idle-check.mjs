// Run against a Pages-path production preview, e.g. BASE_PATH=/mofumofu/ npm run preview.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.env.APP_URL || 'http://127.0.0.1:4173/mofumofu/';
const out = process.env.OUTPUT_DIR || '/tmp/mofumofu-dog-idle-review';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(url);
await page.waitForSelector('.dog-idle[data-ready="true"]');
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
});
assert.match(await page.locator('.dev').textContent(), /8日目/);
assert.equal(await page.locator('.dog-idle-error').isVisible(), false);
assert.equal(await page.locator('.dog-idle').evaluate(image => getComputedStyle(image).transform), 'none');

await page.evaluate(() => {
  const image = document.querySelector('.dog-idle');
  const read = () => Number(image.getAttribute('src').match(/frame_(\d+)\.png/)[1]);
  window.dogFrames = [read()];
  window.dogObserver = setInterval(() => { const frame = read(); if (dogFrames.at(-1) !== frame) dogFrames.push(frame); }, 8);
});
await page.waitForTimeout(13000);
const rendered = await page.evaluate(() => { clearInterval(dogObserver); return dogFrames; });
assert.deepEqual([...new Set(rendered)].sort((a, b) => a - b), [0, 1, 2, 4, 5, 7, 8]);
const expected = [0, 1, 2, 1, 0, 4, 5, 4, 0, 7, 8, 7];
for (let i = 0; i < rendered.length; i++) assert.equal(rendered[i], expected[i % expected.length]);

const viewports = [];
for (const width of [320, 390, 430]) {
  await page.setViewportSize({ width, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const box = await page.locator('.dog-idle').boundingBox();
  assert.equal(box.width, Math.min(320, width - 48));
  assert.equal(box.height, box.width);
  assert.ok(box.x >= 0 && box.x + box.width <= width);
  viewports.push({ width, imageWidth: box.width, overflow: false });
}
await page.setViewportSize({ width: 390, height: 844 });
for (const frame of [0, 5, 8]) {
  await page.waitForFunction(f => document.querySelector('.dog-idle').getAttribute('src').endsWith(`frame_${String(f).padStart(2, '0')}.png`), frame);
  await page.screenshot({ path: path.join(out, `game-frame-${frame}.png`) });
}
const cached = await page.evaluate(async () => {
  const urls = [];
  for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
  return urls;
});
assert.ok(cached.some(asset => asset.includes('/assets/dog/idle-v12/animation.json')));
for (const frame of [0, 1, 2, 4, 5, 7, 8]) assert.ok(cached.some(asset => asset.includes(`/assets/dog/idle-v12/frame_${String(frame).padStart(2, '0')}.png`)));
assert.ok(cached.some(asset => asset.includes('/assets/dog/idle-v12/dog_idle.webp')));
await context.setOffline(true);
await page.reload();
await page.waitForSelector('.dog-idle[data-ready="true"]');
await page.waitForFunction(() => document.querySelector('.dog-idle').getAttribute('src').endsWith('frame_05.png'));
await page.screenshot({ path: path.join(out, 'game-offline.png') });
assert.equal(await page.locator('.dog-idle-error').isVisible(), false);
await context.setOffline(false);
await page.goto(new URL('lab/dog.html', url).href);
await page.waitForFunction(() => window.__labReady === true, null, { timeout: 90000 });
assert.match(await page.locator('h1').textContent(), /黒柴/);
assert.deepEqual(errors, []);
const result = { browser: 'Chromium', viewport: [390, 844], deviceScaleFactor: 3, touchEmulated: true, frames: rendered, viewports, offlineReload: true, offlineHeadTilt: true, oldLabRetained: true, errors, physicalDeviceTested: false };
await writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
await browser.close();
