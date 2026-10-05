// スマホ確認用の版（claude.ai の Artifact で開く）を組み立てる。
// 相対パスでビルドし、Artifact では動かない Service Worker 関連を除き、
// ページ本体は <head>/<body> の外枠を外した形にする（公開時に外枠が付くため）。
// 使い方：node scripts/build-preview.mjs <出力先>
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('出力先を指定してください');
rmSync(out, { recursive: true, force: true });
execSync(`npx vite build --base ./ --outDir ${JSON.stringify(out)} --emptyOutDir`, { stdio: 'inherit' });
for (const f of ['sw.js', 'registerSW.js', 'manifest.webmanifest', 'lab', 'assets/dog', 'assets/pet']) rmSync(join(out, f), { recursive: true, force: true });
for (const f of readdirSync(out)) if (/^workbox-.*\.js$/.test(f)) rmSync(join(out, f));

let html = readFileSync(join(out, 'index.html'), 'utf8');
html = html
  .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/, '')
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(/<title>[^<]*<\/title>/, '<title>灯りの残る部屋</title>');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta (charset|name="viewport")[^>]*>/g, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
// <title> は先頭 8KB 以内に置く
writeFileSync(join(out, 'index.html'), `${head.trim()}\n${body.trim()}\n`);

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(relative(out, p)); } };
walk(out);
writeFileSync(join(out, 'files.json'), JSON.stringify(Object.fromEntries(files.filter(f => f !== 'index.html').map(f => [f, join(out, f)])), null, 1));
console.log(`${files.length} files`);
