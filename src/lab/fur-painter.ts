/**
 * 毛並みペインター：パーツの輪郭（Path2D）と模様から、毛を1本ずつ描いたテクスチャを生成する。
 * 座標は「犬の設計座標」（地面中央が原点、Y下向き、犬は右向き）。
 */
export interface Marking {
  /** 模様を塗る（輪郭でクリップ済みの ctx、設計座標） */
  (ctx: CanvasRenderingContext2D): void;
}
export interface PartSpec {
  name: string;
  /** 輪郭（複数のサブパスは和集合） */
  shape: Path2D;
  /** 設計座標でのバウンディングボックス [x0, y0, x1, y1] */
  box: [number, number, number, number];
  /** 下地の色 */
  base: string;
  marks?: Marking;
  /** 毛の流れ（単位ベクトルでなくてよい） */
  flow: (x: number, y: number) => [number, number];
  /** 毛の長さ（設計px） */
  len: number;
  /** 100px² あたりの本数 */
  density?: number;
  /** 光の当たり方（上が明るい）の強さ */
  shade?: number;
  /** 奥側のパーツを暗くする（0-1） */
  dark?: number;
  /** 毛を描いた後に重ねる線（口元など） */
  post?: Marking;
  seed?: number;
}

const MARGIN = 10;

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Painted {
  canvas: HTMLCanvasElement;
  /** キャンバス左上の設計座標 */
  x0: number;
  y0: number;
  scale: number;
}

export function paintPart(spec: PartSpec, scale: number): Painted {
  const [bx0, by0, bx1, by1] = spec.box;
  const x0 = bx0 - MARGIN, y0 = by0 - MARGIN;
  const W = Math.ceil((bx1 - bx0 + MARGIN * 2) * scale), H = Math.ceil((by1 - by0 + MARGIN * 2) * scale);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const toDesign = () => ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
  toDesign();

  // 1. 下地と模様
  ctx.save();
  ctx.clip(spec.shape);
  ctx.fillStyle = spec.base;
  ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  spec.marks?.(ctx);
  ctx.restore();
  const img = ctx.getImageData(0, 0, W, H).data;
  const at = (x: number, y: number): [number, number, number] => {
    const px = Math.min(W - 1, Math.max(0, Math.round((x - x0) * scale)));
    const py = Math.min(H - 1, Math.max(0, Math.round((y - y0) * scale)));
    const i = (py * W + px) * 4;
    return [img[i]!, img[i + 1]!, img[i + 2]!];
  };

  // 2. 毛（根元の色を下地から拾う。輪郭の外へはみ出して毛羽立ったシルエットになる）
  const r = rng(spec.seed ?? 1);
  const area = (bx1 - bx0) * (by1 - by0);
  const n = Math.round(area / 100 * (spec.density ?? 9));
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = bx0 + r() * (bx1 - bx0), y = by0 + r() * (by1 - by0);
    if (!ctx.isPointInPath(spec.shape, (x - x0) * scale, (y - y0) * scale)) continue;
    const [cr, cg, cb] = at(x, y);
    const [fx, fy] = spec.flow(x, y);
    const fl = Math.hypot(fx, fy) || 1;
    const ang = Math.atan2(fy / fl, fx / fl) + (r() - 0.5) * 0.5;
    const L = spec.len * (0.6 + r() * 0.45);
    const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
    const bend = (r() - 0.5) * L * 0.35;
    const k = 0.82 + r() * 0.36;   // 明るさのむら
    ctx.strokeStyle = `rgba(${Math.min(255, cr * k) | 0},${Math.min(255, cg * k) | 0},${Math.min(255, cb * k) | 0},${0.75 + r() * 0.25})`;
    ctx.lineWidth = 0.7 + r() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(ang) * bend, (y + ey) / 2 + Math.cos(ang) * bend, ex, ey);
    ctx.stroke();
  }

  // 3. 陰影（上から光、下は暗い）。描いた部分だけに乗せる
  const shade = spec.shade ?? 1;
  if (shade > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    // 全パーツ共通の光（設計座標の高さで決める）。パーツ境界で陰影が段にならない
    const g = ctx.createLinearGradient(0, -300, 0, 0);
    g.addColorStop(0, `rgba(255,236,210,${0.18 * shade})`);
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(22,15,10,${0.3 * shade})`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, W / scale, H / scale);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (spec.dark) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(8,10,16,${spec.dark})`;
    ctx.fillRect(x0, y0, W / scale, H / scale);
    ctx.globalCompositeOperation = 'source-over';
  }
  spec.post?.(ctx);
  return { canvas: cv, x0, y0, scale };
}

/* ---------- 輪郭づくりの補助 ---------- */
export function ellipse(p: Path2D, cx: number, cy: number, rx: number, ry: number, rot = 0) {
  p.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  p.closePath();
}
/** 半径が変わるカプセル（点列と半径列）。各区間を台形＋円で和集合にする */
export function capsule(p: Path2D, pts: [number, number][], rs: number[]) {
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    p.moveTo(x + rs[i]!, y); p.arc(x, y, rs[i]!, 0, Math.PI * 2); p.closePath();
    if (i === 0) continue;
    const [ax, ay] = pts[i - 1]!, ra = rs[i - 1]!, rb = rs[i]!;
    const dx = x - ax, dy = y - ay, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    p.moveTo(ax + nx * ra, ay + ny * ra); p.lineTo(x + nx * rb, y + ny * rb);
    p.lineTo(x - nx * rb, y - ny * rb); p.lineTo(ax - nx * ra, ay - ny * ra); p.closePath();
  }
}
export function softEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, rot = 0, soft = 0.25) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color); g.addColorStop(1 - soft, color); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
