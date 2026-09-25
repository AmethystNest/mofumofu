/**
 * 2Dパーツの描画（Canvas2D ＋ ピクセル単位の陰影）。
 *
 * 1. 形：制御点のなめらかな閉曲線に、大小不揃いの毛束（細長い房）を外向きに生やす。
 * 2. 色：下地と模様（やわらかい楕円）を塗る。
 * 3. 立体：形の内側で「縁からの距離」を求め（距離変換）、それを丸みの高さとして法線を出し、
 *    左上の光で陰影をつける。黒い毛にはツヤと縁の反射光を足す（純黒でも形が見える）。
 * 4. 線：縁からの距離が小さい所を、その場所の色を暗くした色で塗る（毛束に沿った色線）。
 * 5. 毛：流れに沿った細い毛を控えめに重ねる。
 * 6. 影：必要なパーツは、下のパーツに落とす影（ぼかしたシルエット）も作る。
 *
 * 座標は設計座標（地面中央が原点・Y下向き）。xf を渡すと「作画座標 → 設計座標」の変換をかけて描く。
 */
export type Pt = [number, number];
/** アフィン変換 [a, b, c, d, e, f]：x' = a x + c y + e, y' = b x + d y + f */
export type Xf = [number, number, number, number, number, number];

export interface Tuft {
  /** 毛束の間隔（設計単位） */ step: number;
  /** 毛束の長さの目安（設計単位） */ amp: number;
  /** 毛の流れへの傾き（0〜1） */ lean?: number;
}
export interface PartSpec {
  name: string;
  outline: Pt[];
  tuft?: Tuft | null;
  base: string;
  marks?: (ctx: CanvasRenderingContext2D) => void;
  flow?: (x: number, y: number) => Pt;
  /** 表面の毛の長さ・密度（100単位²あたり） */
  len?: number;
  density?: number;
  /** 輪郭線の太さ（設計単位。0で線なし）と濃さ（0〜1） */
  line?: number;
  lineDark?: number;
  /** 陰影の強さ（0〜1）と丸みの深さ（0で平ら） */
  shade?: number;
  volume?: number;
  /** 丸みが最大になる縁からの距離（設計単位）。省略時は形の大きさから決める */
  radius?: number;
  post?: (ctx: CanvasRenderingContext2D) => void;
  /** 黒い毛のツヤと縁の反射光 */
  sheen?: boolean;
  /** 輪郭を曲線にせず、制御点を直線でつなぐ（家具など） */
  sharp?: boolean;
  /** 下のパーツに落とす影の濃さ（0〜1） */
  shadow?: number;
  /** 縁の内側の縫い目（inset：縁からの距離、設計単位） */
  stitch?: { inset: number; color: string; dash?: [number, number]; width?: number };
  xf?: Xf;
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

export const apply = (m: Xf, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export function invert(m: Xf): Xf {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
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

export function polyPath(pts: Pt[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i]![0], pts[i]![1]);
  p.closePath();
  return p;
}

/** 輪郭に沿って、大小不揃いの毛束（細長く尖った房を数本ずつ）を生やす */
function tuftPath(pts: Pt[], tuft: Tuft, flow: ((x: number, y: number) => Pt) | undefined, seed: number): Path2D {
  const r = rng(seed);
  const P = resample(pts, 0.8);
  let area = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i]!, b = P[(i + 1) % P.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  const path = new Path2D();
  let i = 0;
  while (i < P.length) {
    const p = P[i]!, a = P[(i - 2 + P.length) % P.length]!, b = P[(i + 2) % P.length]!;
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    const ux = tx / tl, uy = ty / tl;
    const nx = uy * sgn, ny = -ux * sgn;
    let fx = 0, fy = 0;
    if (flow) { const f = flow(p[0], p[1]); const fl = Math.hypot(f[0], f[1]) || 1; fx = f[0] / fl; fy = f[1] / fl; }
    // 流れが外向きのところほど毛束が長く出る
    const out = Math.max(0, fx * nx + fy * ny);
    const big = r() < 0.18;                                       // ときどき大きな房
    const Lc = tuft.amp * (0.45 + r() * 0.75 + out * 0.6) * (big ? 1.7 : 1);
    const strands = 2 + Math.floor(r() * 3);
    const width = tuft.step * (0.35 + r() * 0.3) * (big ? 1.3 : 1);
    for (let k = 0; k < strands; k++) {
      const off = (k - (strands - 1) / 2) * width * 0.55;
      const rx = p[0] + ux * off - nx * Lc * 0.35, ry = p[1] + uy * off - ny * Lc * 0.35;
      const lean = (tuft.lean ?? 0.4) * (0.6 + r() * 0.8);
      let dx = nx + fx * lean + (r() - 0.5) * 0.35, dy = ny + fy * lean + (r() - 0.5) * 0.35;
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const L = Lc * (0.7 + r() * 0.5) * (k === Math.floor(strands / 2) ? 1.15 : 0.85);
      const tipx = rx + dx * (L + Lc * 0.35), tipy = ry + dy * (L + Lc * 0.35);
      const w = width * (0.45 + r() * 0.3);
      const bend = (r() - 0.5) * L * 0.5;
      const mx = (rx + tipx) / 2 - dy * bend, my = (ry + tipy) / 2 + dx * bend;
      path.moveTo(rx - dy * w, ry + dx * w);
      path.quadraticCurveTo(mx - dy * w * 0.5, my + dx * w * 0.5, tipx, tipy);
      path.quadraticCurveTo(mx + dy * w * 0.5, my - dx * w * 0.5, rx + dy * w, ry - dx * w);
      path.closePath();
    }
    i += Math.max(2, Math.round((tuft.step * (0.55 + r() * 0.8)) / 0.8));
  }
  return path;
}

/** 距離変換（Felzenszwalb）：内側の各ピクセルから最も近い外側ピクセルまでの距離 */
function edt(inside: Uint8Array, W: number, H: number): Float32Array {
  const INF = 1e20;
  const g = new Float64Array(W * H);
  const n = Math.max(W, H);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const dt = (len: number) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      while (s <= z[k]!) { k--; s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1]! < q) k++; d[q] = (q - v[k]!) ** 2 + f[v[k]!]!; }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = inside[y * W + x] ? INF : 0;
    dt(H);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y]!;
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x]!;
    dt(W);
    for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]!);
  }
  return out;
}

function boxBlur(a: Float32Array, W: number, H: number, rad: number) {
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      let acc = 0; const row = y * W;
      for (let x = -rad; x <= rad; x++) acc += a[row + Math.min(W - 1, Math.max(0, x))]!;
      for (let x = 0; x < W; x++) {
        tmp[row + x] = acc / (2 * rad + 1);
        acc += a[row + Math.min(W - 1, x + rad + 1)]! - a[row + Math.max(0, x - rad)]!;
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]!;
      for (let y = 0; y < H; y++) {
        a[y * W + x] = acc / (2 * rad + 1);
        acc += tmp[Math.min(H - 1, y + rad + 1) * W + x]! - tmp[Math.max(0, y - rad) * W + x]!;
      }
    }
  }
}

export interface Painted {
  canvas: HTMLCanvasElement; x0: number; y0: number; scale: number;
  shadow?: HTMLCanvasElement;
}

// 光（画面の右が+x、下が+y、手前が+z）
const L = (() => { const v = [-0.42, -0.62, 0.66]; const l = Math.hypot(...v); return v.map(c => c / l) as [number, number, number]; })();
const HV = (() => { const v = [L[0], L[1], L[2] + 1]; const l = Math.hypot(...v); return v.map(c => c / l) as [number, number, number]; })();

export function paint(spec: PartSpec, scale: number): Painted {
  const seed = spec.seed ?? [...spec.name].reduce((s, c) => s * 31 + c.charCodeAt(0), 7);
  const xf = spec.xf;
  const ctrl = xf ? spec.outline.map(p => apply(xf, p)) : spec.outline;
  const base = spec.sharp ? ctrl : smooth(ctrl);
  const inv = xf ? invert(xf) : null;
  const flow = spec.flow ? (x: number, y: number): Pt => {
    const q = inv ? apply(inv, [x, y]) : [x, y] as Pt;
    const f = spec.flow!(q[0], q[1]);
    return xf ? [xf[0] * f[0] + xf[2] * f[1], xf[1] * f[0] + xf[3] * f[1]] : f;
  } : undefined;
  const tuftLen = spec.tuft ? spec.tuft.amp * 3.2 : 0;
  const xs = base.map(p => p[0]), ys = base.map(p => p[1]);
  const bx0 = Math.min(...xs), by0 = Math.min(...ys), bx1 = Math.max(...xs), by1 = Math.max(...ys);
  const margin = tuftLen + 3 + (spec.shadow ? 10 : 0);
  const x0 = bx0 - margin, y0 = by0 - margin;
  const W = Math.ceil((bx1 - bx0 + margin * 2) * scale), H = Math.ceil((by1 - by0 + margin * 2) * scale);
  const toDesign = (c: CanvasRenderingContext2D) => c.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
  const withXf = (c: CanvasRenderingContext2D, f: (c: CanvasRenderingContext2D) => void) => {
    c.save(); if (xf) c.transform(...xf); f(c); c.restore();
  };

  // 1. 形（マスク）
  const mcv = document.createElement('canvas'); mcv.width = W; mcv.height = H;
  const m = mcv.getContext('2d', { willReadFrequently: true })!;
  toDesign(m);
  m.fillStyle = '#fff';
  const body = polyPath(base);
  m.fill(body);
  if (spec.tuft) m.fill(tuftPath(base, spec.tuft, flow, seed));
  const mask = m.getImageData(0, 0, W, H).data;

  // 2. 色
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  toDesign(ctx);
  ctx.fillStyle = spec.base;
  ctx.fillRect(x0, y0, W / scale, H / scale);
  if (spec.marks) withXf(ctx, spec.marks);
  const col = ctx.getImageData(0, 0, W, H);
  const c = col.data;

  // 3. 立体（距離 → 高さ → 法線 → 光）
  const N = W * H;
  const inside = new Uint8Array(N);
  for (let i = 0; i < N; i++) inside[i] = mask[i * 4 + 3]! > 127 ? 1 : 0;
  const dist = edt(inside, W, H);
  const vol = spec.volume ?? 1;
  const R = Math.max(2, (spec.radius ?? Math.min(bx1 - bx0, by1 - by0) * 0.42) * scale);
  const h = new Float32Array(N);
  for (let i = 0; i < N; i++) { const t = Math.min(1, dist[i]! / R); h[i] = Math.sqrt(1 - (1 - t) * (1 - t)); }
  const shade = spec.shade ?? 1;
  const lw = (spec.line ?? 1.1) * scale, ld = spec.lineDark ?? 0.42;
  const sheen = spec.sheen ? 1 : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = mask[i * 4 + 3]!;
      if (a === 0) { c[i * 4 + 3] = 0; continue; }
      const hx = (h[y * W + Math.min(W - 1, x + 1)]! - h[y * W + Math.max(0, x - 1)]!) * 0.5 * R * vol;
      const hy = (h[Math.min(H - 1, y + 1) * W + x]! - h[Math.max(0, y - 1) * W + x]!) * 0.5 * R * vol;
      let nx = -hx, ny = -hy, nz = 1;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const ndl = nx * L[0] + ny * L[1] + nz * L[2];
      const wrap = Math.max(0, (ndl + 0.45) / 1.45);
      const ao = 0.8 + 0.2 * h[i]!;
      const key = (1 - shade) + shade * (0.52 + 0.6 * wrap) * ao;
      let r = c[i * 4]! * key * 1.02, g = c[i * 4 + 1]! * key, b = c[i * 4 + 2]! * key * 0.97;
      const lum = (c[i * 4]! + c[i * 4 + 1]! + c[i * 4 + 2]!) / 765;
      const ndh = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]);
      // ツヤ：黒い毛ほど強く、青みのある灰色。広いツヤと鋭いツヤの二段
      const dark = sheen * (1 - lum) ** 2;
      const sp = (ndh ** 5 * 0.2 + ndh ** 24 * 0.32) * shade;
      r += (150 * dark + 60 * (1 - dark) * 0.25) * sp; g += (158 * dark + 58 * (1 - dark) * 0.25) * sp; b += (178 * dark + 52 * (1 - dark) * 0.25) * sp;
      // 縁の反射光（右上の奥から）
      const rim = Math.max(0, nx * 0.6 - ny * 0.55) * (1 - nz) ** 2 * shade;
      r += (95 * dark + 30) * rim; g += (104 * dark + 28) * rim; b += (124 * dark + 26) * rim;
      // 色線：縁から lw 以内を、その場所の色を暗くした色に
      if (lw > 0) {
        const e = dist[i]!;
        const f = e < lw ? 1 : e < lw + 1 ? lw + 1 - e : 0;
        const k = 1 - ld * f;
        r *= k; g *= k; b *= k;
      }
      c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = a;
    }
  }
  ctx.putImageData(col, 0, 0);

  // 5. 表面の細い毛（形の内側だけに重ねる）
  if (flow && (spec.density ?? 6) > 0) {
    const lit = ctx.getImageData(0, 0, W, H).data;
    const r = rng(seed + 1);
    const n = Math.round((bx1 - bx0) * (by1 - by0) / 100 * (spec.density ?? 6));
    const len = spec.len ?? 5;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const x = bx0 + r() * (bx1 - bx0), y = by0 + r() * (by1 - by0);
      const px = Math.round((x - x0) * scale), py = Math.round((y - y0) * scale);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const j = (py * W + px) * 4;
      if (lit[j + 3]! < 200 || dist[py * W + px]! < lw + 1) continue;
      const [fx, fy] = flow(x, y);
      const ang = Math.atan2(fy, fx) + (r() - 0.5) * 0.3;
      const Ls = len * (0.6 + r() * 0.6);
      const bright = r() < 0.5;
      const kk = bright ? 1.18 : 0.8;
      const add = bright ? 12 + 26 * sheen : 0;
      ctx.strokeStyle = `rgba(${Math.min(255, lit[j]! * kk + add) | 0},${Math.min(255, lit[j + 1]! * kk + add) | 0},${Math.min(255, lit[j + 2]! * kk + add * 1.15) | 0},${0.22 + r() * 0.25})`;
      ctx.lineWidth = 0.35 + r() * 0.45;
      const ex = x + Math.cos(ang) * Ls, ey = y + Math.sin(ang) * Ls;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(ang) * Ls * 0.08, (y + ey) / 2 + Math.cos(ang) * Ls * 0.08, ex, ey);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // 縫い目：なめらかな輪郭を内側へ inset だけずらした線を点線で
  if (spec.stitch) {
    const st = spec.stitch;
    let area = 0;
    for (let i = 0; i < base.length; i++) { const a = base[i]!, b = base[(i + 1) % base.length]!; area += a[0] * b[1] - b[0] * a[1]; }
    const sg = area > 0 ? -1 : 1;
    const off = base.map((p, i) => {
      const a = base[(i - 1 + base.length) % base.length]!, b = base[(i + 1) % base.length]!;
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      return [p[0] + (ty / tl) * sg * st.inset, p[1] - (tx / tl) * sg * st.inset] as Pt;
    });
    ctx.save();
    ctx.setLineDash(st.dash ?? [2.2, 1.6]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.width ?? 0.7;
    ctx.stroke(polyPath(off));
    ctx.restore();
  }
  if (spec.post) withXf(ctx, spec.post);

  // 6. 落とす影
  let shadow: HTMLCanvasElement | undefined;
  if (spec.shadow) {
    const a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = mask[i * 4 + 3]! / 255;
    boxBlur(a, W, H, Math.max(1, Math.round(3.5 * scale)));
    shadow = document.createElement('canvas'); shadow.width = W; shadow.height = H;
    const sctx = shadow.getContext('2d')!;
    const sd = sctx.createImageData(W, H);
    for (let i = 0; i < N; i++) { sd.data[i * 4] = 18; sd.data[i * 4 + 1] = 10; sd.data[i * 4 + 2] = 8; sd.data[i * 4 + 3] = a[i]! * 255 * spec.shadow; }
    sctx.putImageData(sd, 0, 0);
  }
  return { canvas: cv, x0, y0, scale, shadow };
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
