/**
 * ふわふわ2Dパーツの描画（Canvas2D）。
 * 輪郭＝制御点のなめらかな閉曲線に「毛束のギザギザ」を付け、こげ茶の線で縁取る。
 * 中は下地と模様を塗り、毛の流れに沿った短い筆致を重ね、柔らかい陰影をのせる。
 * 座標は設計座標（地面中央が原点・Y下向き）。
 */
export type Pt = [number, number];

export interface Tuft { step: number; amp: number; lean?: number }
export interface PartSpec {
  name: string;
  outline: Pt[];
  tuft?: Tuft | null;
  base: string;
  marks?: (ctx: CanvasRenderingContext2D) => void;
  flow?: (x: number, y: number) => Pt;
  len?: number;
  density?: number;
  /** 線の色・太さ（0で線なし） */
  line?: number;
  lineColor?: string;
  /** 陰影の強さ */
  shade?: number;
  /** 線の後に描く（口元など） */
  post?: (ctx: CanvasRenderingContext2D) => void;
  seed?: number;
}

export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 閉じた Catmull-Rom 曲線を細かい点列にする */
export function smooth(ctrl: Pt[], per = 16): Pt[] {
  const out: Pt[] = [];
  const n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n]!, p1 = ctrl[i]!, p2 = ctrl[(i + 1) % n]!, p3 = ctrl[(i + 2) % n]!;
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

/** 点列を一定間隔（d）で取り直す */
function resample(pts: Pt[], d: number): Pt[] {
  const out: Pt[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = carry;
    while (s < L) { const t = s / L; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); s += d; }
    carry = s - L;
  }
  return out;
}

/** 毛束のギザギザを付ける：一定間隔で外向きに尖った房を作り、流れの向きへ少し傾ける */
export function tufted(pts: Pt[], tuft: Tuft, seed: number): Pt[] {
  const r = rng(seed);
  const d = 1.2;
  const P = resample(pts, d);
  let area = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i]!, b = P[(i + 1) % P.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;        // Y下向き座標で時計回りなら外向き法線の向きを合わせる
  const out: Pt[] = [];
  let s = 0, step = tuft.step * (0.7 + r() * 0.6), amp = tuft.amp * (0.6 + r() * 0.7);
  for (let i = 0; i < P.length; i++) {
    const a = P[(i - 1 + P.length) % P.length]!, b = P[(i + 1) % P.length]!;
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    const nx = (ty / tl) * sgn, ny = (-tx / tl) * sgn;
    const u = s / step;
    const prof = u < 0.62 ? Math.sin((u / 0.62) * Math.PI / 2) ** 1.4 : Math.cos(((u - 0.62) / 0.38) * Math.PI / 2) ** 0.8;   // 丸く膨らみ、先でやや鋭く戻る
    const lean = (tuft.lean ?? 0.35) * amp * prof;
    out.push([P[i]![0] + nx * amp * prof + (tx / tl) * lean, P[i]![1] + ny * amp * prof + (ty / tl) * lean]);
    s += d;
    if (s >= step) { s -= step; step = tuft.step * (0.7 + r() * 0.6); amp = tuft.amp * (0.6 + r() * 0.7); }
  }
  return out;
}

export function polyPath(pts: Pt[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i]![0], pts[i]![1]);
  p.closePath();
  return p;
}

export interface Painted { canvas: HTMLCanvasElement; x0: number; y0: number; scale: number }

const MARGIN = 6;

export function paint(spec: PartSpec, scale: number): Painted {
  const seed = spec.seed ?? spec.name.length * 97;
  const base = smooth(spec.outline);
  const pts = spec.tuft ? tufted(base, spec.tuft, seed) : base;
  const path = polyPath(pts);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const bx0 = Math.min(...xs), by0 = Math.min(...ys), bx1 = Math.max(...xs), by1 = Math.max(...ys);
  const x0 = bx0 - MARGIN, y0 = by0 - MARGIN;
  const W = Math.ceil((bx1 - bx0 + MARGIN * 2) * scale), H = Math.ceil((by1 - by0 + MARGIN * 2) * scale);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);

  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = spec.base;
  ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  spec.marks?.(ctx);

  // 毛の筆致（輪郭の内側だけ。色は下地から拾う）
  if (spec.flow) {
    const img = ctx.getImageData(0, 0, W, H).data;
    const r = rng(seed + 1);
    const n = Math.round((bx1 - bx0) * (by1 - by0) / 100 * (spec.density ?? 14));
    const len = spec.len ?? 7;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = bx0 + r() * (bx1 - bx0), y = by0 + r() * (by1 - by0);
      const px = Math.min(W - 1, Math.max(0, Math.round((x - x0) * scale))), py = Math.min(H - 1, Math.max(0, Math.round((y - y0) * scale)));
      const j = (py * W + px) * 4;
      if (img[j + 3]! < 10) continue;
      const [fx, fy] = spec.flow(x, y);
      const ang = Math.atan2(fy, fx) + (r() - 0.5) * 0.45;
      const L = len * (0.55 + r() * 0.6);
      const k = r() < 0.5 ? 0.9 + r() * 0.07 : 1.04 + r() * 0.1;   // 暗い毛と明るい毛
      const c = (v: number) => Math.min(255, Math.round(v * k + (k > 1 ? 10 : 0)));
      ctx.strokeStyle = `rgba(${c(img[j]!)},${c(img[j + 1]!)},${c(img[j + 2]!)},${0.35 + r() * 0.3})`;
      ctx.lineWidth = 0.7 + r() * 0.9;
      const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L, bend = (r() - 0.5) * L * 0.3;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(ang) * bend, (y + ey) / 2 + Math.cos(ang) * bend, ex, ey);
      ctx.stroke();
    }
  }

  // 陰影：左上から光。全パーツ共通の座標で決めるので境目に段ができない
  const sh = spec.shade ?? 1;
  if (sh > 0) {
    const g = ctx.createLinearGradient(-120, -340, 120, 0);
    g.addColorStop(0, `rgba(255,244,228,${0.16 * sh})`);
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(28,16,12,${0.26 * sh})`);
    ctx.fillStyle = g;
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // 縁の内側を少し暗く（丸み）
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(30,18,14,${0.22 * sh})`;
    ctx.lineWidth = 7;
    ctx.stroke(path);
  }
  ctx.restore();

  const lw = spec.line ?? 1.8;
  if (lw > 0) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = spec.lineColor ?? 'rgba(38,26,22,0.78)';
    ctx.lineWidth = lw;
    ctx.stroke(path);
  }
  spec.post?.(ctx);
  return { canvas: cv, x0, y0, scale };
}

/** やわらかい縁の楕円（模様用） */
export function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, rot = 0, soft = 0.3) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  const m = color.match(/rgba?\(([^)]+)\)/);
  const rgb = m ? m[1]!.split(',').slice(0, 3).join(',') : '0,0,0';
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(Math.max(0, 1 - soft), `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
