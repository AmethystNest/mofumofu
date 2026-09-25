/** 犬の表現方式の比較ページ（第2段階の試作） */
import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import { Dog2D, type DogState } from './dog2d';
import { Dog3DSprites } from './dog3d-sprites';
import './dog-lab.css';

const STATES: [DogState, string][] = [['idle', '待機'], ['petted', 'なでられ'], ['eat', '食事'], ['sleep', '眠り'], ['sad', 'しょんぼり']];
type Method = '3d' | '2d';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>犬の表現方式の比較</h1>
  <div class="stage" id="stage"></div>
  <div class="seg" id="method">
    <button data-m="3d">A. 3D→スプライト</button><button data-m="2d">B. 2Dボーン</button>
  </div>
  <div class="states" id="states">${STATES.map(([s, l]) => `<button data-s="${s}">${l}</button>`).join('')}</div>
  <p class="hint">犬をタップすると「なでられ」になります。</p>
  <dl class="meter" id="meter"></dl>
  <section class="notes" id="notes"></section>`;

const stageEl = document.querySelector<HTMLDivElement>('#stage')!;
const W = Math.min(480, stageEl.clientWidth || innerWidth);
const H = Math.round(W * 0.8);
const DPR = Math.min(3, devicePixelRatio || 1);

const pixi = new Application();
await pixi.init({ width: W, height: H, resolution: DPR, autoDensity: true, antialias: true, backgroundAlpha: 0, preference: 'webgl' });
stageEl.appendChild(pixi.canvas);

// 部屋（仮の背景：夕方の室内）
const room = new Container();
const wall = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: 0x3d4944 }, { offset: 1, color: 0x2f3834 }], textureSpace: 'local' });
room.addChild(new Graphics().rect(0, 0, W, H).fill(wall));
const glow = new FillGradient({ type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5,
  colorStops: [{ offset: 0, color: 'rgba(242,179,90,0.35)' }, { offset: 1, color: 'rgba(232,163,61,0)' }], textureSpace: 'local' });
room.addChild(new Graphics().rect(0, H * 0.78, W, H * 0.22).fill(0x2a2e2c));
room.addChild(new Graphics().rect(0, H * 0.78, W, 2).fill(0x1c201f));
room.addChild(new Graphics().ellipse(W * 0.62, H * 0.78, W * 0.55, H * 0.4).fill(glow));
pixi.stage.addChild(room);

// 犬の置き場所（地面の中央）
const GROUND_Y = H * 0.9;
const DESIGN_W = 330;                       // 2D犬の設計上の横幅
const dogScale = (W * 0.62) / DESIGN_W;
const holder = new Container();
holder.position.set(W * 0.47, GROUND_Y);
pixi.stage.addChild(holder);
const shadow = new Graphics().ellipse(0, 0, 150, 12).fill({ color: 0x000000, alpha: 0.28 });
shadow.scale.set(dogScale);
holder.addChild(shadow);

// B. 2D
let t0 = performance.now();
const dog2d = new Dog2D(dogScale * DPR);
const gen2dMs = performance.now() - t0;
dog2d.view.scale.set(dogScale);
holder.addChild(dog2d.view);

// A. 3D スプライト
const base = import.meta.env.BASE_URL;
const dog3d = new Dog3DSprites(`${base}lab/dog3d/`);
dog3d.view.visible = false;
holder.addChild(dog3d.view);

let method: Method = (new URLSearchParams(location.search).get('m') as Method) || '3d';
let state: DogState = (new URLSearchParams(location.search).get('s') as DogState) || 'idle';
let petTimer = 0;

async function setMethod(m: Method) {
  method = m;
  dog2d.view.visible = m === '2d';
  dog3d.view.visible = m === '3d';
  if (m === '3d') {
    await dog3d.load(W * 0.5);   // 2D の犬とほぼ同じ横幅
    dog3d.setState(state);
  }
  renderUi();
}
function setState(s: DogState) {
  state = s;
  dog2d.setState(s); dog3d.setState(s);
  renderUi();
}

holder.eventMode = 'static';
holder.cursor = 'pointer';
holder.on('pointertap', () => {
  const prev = state === 'petted' ? 'idle' : state;
  setState('petted');
  clearTimeout(petTimer);
  petTimer = window.setTimeout(() => setState(prev === 'sleep' ? 'idle' : prev), 2200);
});

// FPS
let frames = 0, acc = 0, fps = 0;
pixi.ticker.add(tk => {
  const dt = tk.deltaMS / 1000;
  if (method === '2d') dog2d.update(dt); else dog3d.update(dt);
  frames++; acc += dt;
  if (acc >= 1) { fps = frames / acc; frames = 0; acc = 0; renderMeter(); }
});

function mb(bytes: number) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }
function renderMeter() {
  const rows: [string, string][] = [['描画', `${fps.toFixed(0)} fps（端末 ${DPR}x）`]];
  if (method === '2d') {
    rows.push(['生成時間', `${gen2dMs.toFixed(0)} ms（起動時に毛並みを描画）`]);
    rows.push(['GPUメモリ', `約 ${mb(dog2d.texturePixels * 4)}`]);
    rows.push(['ダウンロード', 'コードのみ（画像なし）']);
  } else {
    const st = dog3d.stats();
    rows.push(['GPUメモリ', st ? `約 ${mb(st.gpuBytes)}（全状態）` : '読み込み中…']);
    rows.push(['ダウンロード', st ? `${mb(st.downloadBytes)}（WebP）` : '…']);
    rows.push(['コマ', st ? `${st.frames} コマ・${st.fps} fps・${st.frameSize}px` : '…']);
  }
  document.querySelector('#meter')!.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

const NOTES: Record<Method, string> = {
  '3d': `<h2>A. Blenderで3D→スプライト</h2>
    <p>3Dの黒柴を手続き的に作り、毛（パーティクルの毛）ごとレンダリングして連番画像にしたもの。立体感と毛並みの質感が出る。</p>
    <ul><li>状態の切り替えはコマの切り替え（中間の動きは別途レンダリングが必要）</li>
    <li>光の向き・時間帯の色は画像に焼き込み（色調補正はできる）</li>
    <li>容量とGPUメモリが大きい。コマ数・解像度とのトレードオフ</li></ul>`,
  '2d': `<h2>B. 2Dボーン（カットアウト）</h2>
    <p>パーツごとに毛並みを1本ずつ描いたテクスチャを起動時に生成し、骨組みで動かすもの。画像ファイルなし。</p>
    <ul><li>状態間を滑らかに補間できる（ばねで姿勢が移る）。反応を細かく足しやすい</li>
    <li>容量・メモリが小さく、解像度に依存しない</li>
    <li>立体感は3Dに劣る。頭の向きなど大きな角度変化は描き分けが必要</li></ul>`,
};
const NOTE_C = `<h2>C. 手描き／AI生成の2D（未試作）</h2>
  <p>この開発環境には画像生成の手段がなく、外部の素材サイトにも接続できないため試作していません。
  AI生成の画像を用意していただければ、コマ間の一貫性（顔・模様のずれ）を検証できます。</p>`;
function renderUi() {
  document.querySelectorAll<HTMLButtonElement>('#method button').forEach(b => b.classList.toggle('on', b.dataset.m === method));
  document.querySelectorAll<HTMLButtonElement>('#states button').forEach(b => b.classList.toggle('on', b.dataset.s === state));
  document.querySelector('#notes')!.innerHTML = NOTES[method] + NOTE_C;
  renderMeter();
}
document.querySelector('#method')!.addEventListener('click', e => {
  const m = (e.target as HTMLElement).closest('button')?.dataset.m as Method | undefined;
  if (m) void setMethod(m);
});
document.querySelector('#states')!.addEventListener('click', e => {
  const s = (e.target as HTMLElement).closest('button')?.dataset.s as DogState | undefined;
  if (s) { clearTimeout(petTimer); setState(s); }
});

dog2d.setState(state); dog2d.snap();
await setMethod(method);
(window as unknown as { __labReady: boolean }).__labReady = true;
