/** 犬の見た目・動きの確認ページ（2D黒柴） */
import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import { ShibaDog, type DogState } from './shiba/dog';
import './dog-lab.css';

const STATES: [DogState, string][] = [['idle', '待機'], ['petted', 'なでられ'], ['eat', '食事'], ['sleep', '眠り'], ['sad', 'しょんぼり']];
const q = new URLSearchParams(location.search);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>黒柴の試作（2D）</h1>
  <div class="stage" id="stage"></div>
  <div class="states" id="states">${STATES.map(([s, l]) => `<button data-s="${s}">${l}</button>`).join('')}</div>
  <p class="hint">犬をタップすると「なでられ」になります。</p>
  <dl class="meter" id="meter"></dl>`;

const stageEl = document.querySelector<HTMLDivElement>('#stage')!;
const W = Math.min(480, stageEl.clientWidth || innerWidth);
const H = Math.round(W * 0.9);
const DPR = Math.min(3, devicePixelRatio || 1);

const pixi = new Application();
await pixi.init({ width: W, height: H, resolution: DPR, autoDensity: true, antialias: true, backgroundAlpha: 0, preference: 'webgl' });
stageEl.appendChild(pixi.canvas);

// 部屋（仮）：夕方の室内
const room = new Container();
const wall = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
  colorStops: [{ offset: 0, color: 0x3a3634 }, { offset: 1, color: 0x2c2826 }] });
room.addChild(new Graphics().rect(0, 0, W, H).fill(wall));
room.addChild(new Graphics().rect(0, H * 0.8, W, H * 0.2).fill(0x262220));
const glow = new FillGradient({ type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
  colorStops: [{ offset: 0, color: 'rgba(242,190,120,0.30)' }, { offset: 1, color: 'rgba(232,163,61,0)' }] });
room.addChild(new Graphics().ellipse(W * 0.5, H * 0.72, W * 0.6, H * 0.45).fill(glow));
pixi.stage.addChild(room);

const DESIGN_H = 360;
const dogScale = (H * 0.78) / DESIGN_H;
const holder = new Container();
holder.position.set(W * 0.5, H * 0.93);
holder.scale.set(dogScale);
pixi.stage.addChild(holder);
holder.addChild(new Graphics().ellipse(10, 0, 135, 13).fill({ color: 0x000000, alpha: 0.3 }));

// ごはんの器（食事のときだけ）
const bowl = new Graphics()
  .ellipse(0, -14, 58, 12).fill(0x8a8f92).stroke({ width: 2, color: 0x2a201d })
  .moveTo(-58, -14).lineTo(-46, 6).quadraticCurveTo(0, 14, 46, 6).lineTo(58, -14).fill(0x7b8488).stroke({ width: 2, color: 0x2a201d })
  .ellipse(0, -15, 48, 8).fill(0xb07a48);
bowl.position.set(-30, 8);

const t0 = performance.now();
const dog = new ShibaDog(dogScale * DPR);
const genMs = performance.now() - t0;
holder.addChild(dog.view);
holder.addChild(bowl);

let state: DogState = (q.get('s') as DogState) || 'idle';
let petTimer = 0;
function setState(s: DogState) {
  state = s; dog.setState(s);
  bowl.visible = s === 'eat';
  document.querySelectorAll<HTMLButtonElement>('#states button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
}
dog.view.eventMode = 'static';
dog.view.cursor = 'pointer';
dog.view.on('pointertap', () => {
  const back = state === 'petted' || state === 'sleep' ? 'idle' : state;
  setState('petted');
  clearTimeout(petTimer);
  petTimer = window.setTimeout(() => setState(back), 2200);
});
document.querySelector('#states')!.addEventListener('click', e => {
  const s = (e.target as HTMLElement).closest('button')?.dataset.s as DogState | undefined;
  if (s) { clearTimeout(petTimer); setState(s); }
});

let frames = 0, acc = 0;
pixi.ticker.add(tk => {
  const dt = tk.deltaMS / 1000;
  dog.update(dt);
  frames++; acc += dt;
  if (acc >= 1) {
    document.querySelector('#meter')!.innerHTML =
      `<dt>描画</dt><dd>${(frames / acc).toFixed(0)} fps（端末 ${DPR}x）</dd>` +
      `<dt>生成時間</dt><dd>${genMs.toFixed(0)} ms（起動時に毛並みを描画）</dd>` +
      `<dt>GPUメモリ</dt><dd>約 ${(dog.texturePixels * 4 / 1048576).toFixed(1)} MB</dd>`;
    frames = 0; acc = 0;
  }
});

setState(state); dog.snap();
(window as unknown as { __labReady: boolean }).__labReady = true;
