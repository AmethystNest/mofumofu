/**
 * 犬のモーション再生（キャンバス描画）。
 * 承認済み idle-v12 と motions-v1 の PNG タイムラインはそのまま使い、コマの間に次を足す：
 * - 呼吸：胸から上だけをわずかに持ち上げる（足・胴体下側 y>=245 は固定）
 * - 首の寄せ：指の方向へ頭の行だけを横へずらす（顔の大きさ・形は変えない）
 * - 反応の切り替え：短いクロスフェード（コマの差し替えによる「ぱっ」とした飛びを防ぐ）
 * 端末の「動きを減らす」設定では、従来どおり最初のコマを静止表示する。
 */
import { BREATH, PAW_Y, SIZE, strips } from './warp';
import { createGlRenderer, type DogRenderer } from './dog-gl';

export type Motion = 'idle' | 'pet' | 'play' | 'eat' | 'sleep' | 'sad';
type Frame = { src: string; ms: number };
const FADE_MS = 140;

export interface DogMotion {
  react(m: Motion, ms?: number): void;
  set(m: Motion): void;
  /** 首の向き（-1=左 … 1=右、0=正面） */
  look(dir: number): void;
  /** なでられている間は true（首を手の方へ寄せ続ける） */
  stroke(on: boolean, dir?: number): void;
  readonly motion: Motion;
  /** 直近の描画1回あたりの所要時間（ms・計測用） */
  readonly drawMs: number;
  destroy(): void;
}

export async function createDogMotion(image: HTMLImageElement): Promise<DogMotion> {
  const root = `${import.meta.env.BASE_URL}assets/dog/`;
  const response = await fetch(`${root}motions-v1/motions.json`);
  if (!response.ok) throw new Error('Motion assets unavailable');
  const { clips } = (await response.json()) as { clips: Record<Motion, Frame[]> };
  const images = new Map<string, HTMLImageElement>();
  await Promise.all([...new Set(Object.values(clips).flat().map(f => f.src))].map(async src => {
    const im = new Image();
    im.src = root + src;
    await im.decode();
    images.set(src, im);
  }));

  // 画像と同じ位置・大きさにキャンバスを重ね、準備ができたら画像を隠す（画像は失敗時の表示として残す）
  const canvas = document.createElement('canvas');
  canvas.className = 'dog-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', image.alt);
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = canvas.height = Math.round(SIZE * dpr);
  // WebGL（継ぎ目のない格子変形）を優先し、使えない端末では Canvas2D の帯描きで代用する
  let gl: DogRenderer | null = null;
  try { gl = createGlRenderer(canvas); } catch { gl = null; }
  const ctx = gl ? null : canvas.getContext('2d')!;
  if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }
  canvas.dataset.renderer = gl ? 'webgl' : 'canvas2d';
  image.after(canvas);
  image.hidden = true;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let passive: Motion = 'idle', active: Motion = 'idle';
  let elapsed = 0, until = 0, clock = 0, last = performance.now(), handle = 0;
  let fade = 1;                      // 0→1：前の反応から次の反応へ
  let prev: Motion = 'idle', prevElapsed = 0;
  let leanTarget = 0, lean = 0, leanVel = 0;
  let stroking = false, strokeDir = 0;
  let lookUntil = 0;
  let breathPhase = 0;
  let drawMs = 0;

  function frameOf(m: Motion, t: number): HTMLImageElement {
    const frames = clips[m];
    const total = frames.reduce((a, f) => a + f.ms, 0);
    let phase = reduced.matches ? 0 : t % total;
    let f = frames[0]!;
    for (const item of frames) { f = item; if (phase < item.ms) break; phase -= item.ms; }
    return images.get(f.src)!;
  }

  function begin(m: Motion) {
    if (m === active) return;
    // 前の反応のコマを残したまま、新しい反応へ短く溶かす
    prev = active; prevElapsed = elapsed;
    fade = 0;
    active = m;
    elapsed = 0;
  }

  function draw(img: HTMLImageElement, breath: number, amp: number, from?: HTMLImageElement, mix = 1) {
    if (gl) { gl.draw(img, breath, amp, lean, from, mix); return; }
    // Canvas2D の代用：前のコマを不透明で敷き、その上に新しいコマを mix の濃さで重ねる
    const c = ctx!;
    const one = (im: HTMLImageElement, alpha: number) => {
      c.globalAlpha = alpha;
      // 足・胴体下側はそのまま、胸から上は帯ごとに描き先をずらす
      c.drawImage(im, 0, PAW_Y, SIZE, SIZE - PAW_Y, 0, PAW_Y, SIZE, SIZE - PAW_Y);
      for (const s of strips(breath, amp, lean)) c.drawImage(im, 0, s.sy, SIZE, s.sh, s.dx, s.dy, SIZE, s.dh);
    };
    if (from) one(from, 1);
    one(img, from ? mix : 1);
    c.globalAlpha = 1;
  }

  function tick(now: number) {
    const delta = document.hidden ? 0 : Math.min(now - last, 100);
    last = now;
    elapsed += delta;
    clock += delta;
    if (until > 0 && elapsed >= until && !stroking) { until = 0; begin(passive); }
    const t0 = performance.now();
    if (gl) gl.clear();
    else { ctx!.setTransform(dpr, 0, 0, dpr, 0, 0); ctx!.clearRect(0, 0, SIZE, SIZE); }
    if (reduced.matches) {
      draw(frameOf(active, 0), 0, 0);
    } else {
      // 首の寄せ：なでている間は手の方へ、タップでは一瞬だけ見る。ばねで追う
      const goal = stroking ? strokeDir * 3.2 : clock < lookUntil ? leanTarget : 0;
      const w = 14, dt = delta / 1000;
      leanVel += (w * w * (goal - lean) - 2 * w * leanVel) * dt;
      lean += leanVel * dt;
      const b = BREATH[active] ?? BREATH.idle!;
      breathPhase += (delta / 1000) * (Math.PI * 2 / b.period);
      const breath = Math.sin(breathPhase);
      if (fade < 1) {
        fade = Math.min(1, fade + delta / FADE_MS);
        prevElapsed += delta;
        draw(frameOf(active, elapsed), breath, b.amp, frameOf(prev, prevElapsed), fade);
      } else draw(frameOf(active, elapsed), breath, b.amp);
    }
    // 既存の確認スクリプト（scripts/check-playable.py）は img の data-motion を見るので両方に付ける
    canvas.dataset.motion = image.dataset.motion = active;
    drawMs = drawMs * 0.9 + (performance.now() - t0) * 0.1;
    handle = requestAnimationFrame(tick);
  }
  const visibility = () => { last = performance.now(); };
  document.addEventListener('visibilitychange', visibility);
  handle = requestAnimationFrame(tick);

  return {
    react(m, ms = 2200) { begin(m); until = ms; },
    set(m) { passive = m; if (!until && !stroking) begin(m); },
    look(dir) { leanTarget = Math.max(-1, Math.min(1, dir)) * 2.4; lookUntil = clock + 900; },
    stroke(on, dir = 0) {
      stroking = on;
      strokeDir = Math.max(-1, Math.min(1, dir));
      if (on && active !== 'pet') begin('pet');
      if (on) until = Math.max(until, elapsed + 900);
    },
    get motion() { return active; },
    get drawMs() { return drawMs; },
    destroy() {
      cancelAnimationFrame(handle);
      document.removeEventListener('visibilitychange', visibility);
      gl?.dispose();
      canvas.remove();
      image.hidden = false;
    },
  };
}
