/** 犬の見た目・動きの確認ページ（2D黒柴） */
import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import { NO_OUTFIT, ShibaDog, type DogState, type Outfit } from './shiba/dog';
import { HEADWEAR, NECKWEAR } from './shiba/parts';
import { DEFAULT_DECOR, LIGHT_X, Room, RW, SLOTS, type Decor } from './room/room';
import './dog-lab.css';

const STATES: [DogState, string][] = [['idle', '待機'], ['petted', 'なでられ'], ['eat', '食事'], ['sleep', '眠り'], ['sad', 'しょんぼり']];
const q = new URLSearchParams(location.search);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>黒柴の試作（2D）</h1>
  <div class="stage" id="stage"></div>
  <div class="states" id="states">${STATES.map(([s, l]) => `<button data-s="${s}">${l}</button>`).join('')}</div>
  <p class="hint">犬をタップすると「なでられ」になります。</p>
  <label class="row">成長 <input type="range" id="age" min="0" max="1" step="0.05" value="0"><span id="ageLabel">子犬</span></label>
  <div class="row"><span>首</span><div class="chips" id="neck">${NECKWEAR.map(n => `<button data-v="${n.id}">${n.name}</button>`).join('')}</div></div>
  <div class="row"><span>頭</span><div class="chips" id="head">${HEADWEAR.map(n => `<button data-v="${n.id}">${n.name}</button>`).join('')}</div></div>
  <h2>部屋</h2>
  ${SLOTS.map(sl => `<div class="row"><span>${sl.name}</span><div class="chips" data-slot="${sl.id}">${sl.items.map(i => `<button data-v="${i.id}">${i.name}</button>`).join('')}</div></div>`).join('')}
  <dl class="meter" id="meter"></dl>`;

const stageEl = document.querySelector<HTMLDivElement>('#stage')!;
const W = Math.min(480, stageEl.clientWidth || innerWidth);
const H = Math.round(W * 0.9);
const DPR = Math.min(3, devicePixelRatio || 1);

const pixi = new Application();
await pixi.init({ width: W, height: H, resolution: DPR, autoDensity: true, antialias: true, backgroundAlpha: 0, preference: 'webgl' });
stageEl.appendChild(pixi.canvas);

// 部屋（犬と同じ画風）。部屋の座標 390×351 を画面幅に合わせる
const K = W / RW;
const decor: Decor = { ...DEFAULT_DECOR };
for (const sl of SLOTS) { const v = q.get(sl.id); if (v) decor[sl.id] = v; }
const room = new Room(K * DPR, decor);
const roomC = new Container(); roomC.scale.set(K);
pixi.stage.addChild(roomC);
roomC.addChild(room.back);
// 明かりの広がり（明かりの種類で色が変わる）
const glow = new Graphics();
const drawGlow = () => {
  const [color, alpha] = room.lightColor;
  const fg = new FillGradient({ type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, textureSpace: 'local',
    colorStops: [{ offset: 0, color: `rgba(${color >> 16},${(color >> 8) & 255},${color & 255},${alpha})` }, { offset: 1, color: 'rgba(0,0,0,0)' }] });
  glow.clear().ellipse(LIGHT_X, 160, 230, 210).fill(fg);
};
drawGlow();
roomC.addChild(glow);

// 犬の置き場所（ラグの上）
const DOG_K = 0.56;  // 設計座標1 = 部屋座標0.56（成犬の高さが部屋の約6割）
const holder = new Container();
holder.position.set(222, 318);
holder.scale.set(DOG_K);
roomC.addChild(holder);
const shadowG = new Graphics().ellipse(10, 0, 135, 13).fill({ color: 0x000000, alpha: 0.28 });
holder.addChild(shadowG);
roomC.addChild(room.front);
const dogScale = DOG_K * K;

// ごはんの器（食事のときだけ）
const bowl = new Graphics()
  .ellipse(0, -14, 58, 12).fill(0x8a8f92).stroke({ width: 2, color: 0x2a201d })
  .moveTo(-58, -14).lineTo(-46, 6).quadraticCurveTo(0, 14, 46, 6).lineTo(58, -14).fill(0x7b8488).stroke({ width: 2, color: 0x2a201d })
  .ellipse(0, -15, 48, 8).fill(0xb07a48);
bowl.position.set(-30, 8);

const t0 = performance.now();
const dog = new ShibaDog(dogScale * DPR, NO_OUTFIT, +(q.get('age') || 0));
const genMs = performance.now() - t0;
holder.addChild(dog.view);
holder.addChild(bowl);

let state: DogState = (q.get('s') as DogState) || 'idle';
const outfit: Outfit = { neck: q.get('neck') || NO_OUTFIT.neck, head: q.get('head') || NO_OUTFIT.head };
const ageLabel = (a: number) => (a < 0.25 ? '子犬' : a < 0.75 ? '若犬' : '成犬');
function applyOutfit() {
  dog.setOutfit(outfit);
  for (const slot of ['neck', 'head'] as const)
    document.querySelectorAll<HTMLButtonElement>(`#${slot} button`).forEach(b => b.classList.toggle('on', b.dataset.v === outfit[slot]));
}
const ageEl = document.querySelector<HTMLInputElement>('#age')!;
ageEl.value = q.get('age') || '0';
const setAge = () => { dog.setAge(+ageEl.value); shadowG.scale.set(0.74 + 0.26 * +ageEl.value); document.querySelector('#ageLabel')!.textContent = ageLabel(+ageEl.value); };
ageEl.addEventListener('change', setAge);
ageEl.addEventListener('input', () => { document.querySelector('#ageLabel')!.textContent = ageLabel(+ageEl.value); });
for (const slot of ['neck', 'head'] as const)
  document.querySelector(`#${slot}`)!.addEventListener('click', e => {
    const v = (e.target as HTMLElement).closest('button')?.dataset.v;
    if (v) { outfit[slot] = v; applyOutfit(); }
  });
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
      `<dt>描画時間</dt><dd>起動 ${genMs.toFixed(0)} ms／直近の組み立て ${dog.lastBuildMs.toFixed(0)} ms</dd>` +
      `<dt>GPUメモリ</dt><dd>約 ${(dog.texturePixels * 4 / 1048576).toFixed(1)} MB</dd>`;
    frames = 0; acc = 0;
  }
});

function applyDecor() {
  room.setDecor(decor); drawGlow();
  document.querySelectorAll<HTMLElement>('[data-slot]').forEach(el =>
    el.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.classList.toggle('on', b.dataset.v === decor[el.dataset.slot as keyof Decor])));
}
document.querySelectorAll<HTMLElement>('[data-slot]').forEach(el => el.addEventListener('click', e => {
  const v = (e.target as HTMLElement).closest('button')?.dataset.v;
  if (v) { decor[el.dataset.slot as keyof Decor] = v; applyDecor(); }
}));

setState(state); applyOutfit(); setAge(); applyDecor(); dog.snap();
(window as unknown as { __labReady: boolean }).__labReady = true;
