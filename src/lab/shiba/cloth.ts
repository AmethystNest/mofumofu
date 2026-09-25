/**
 * 布・革・金属の質感づくり（着せ替え用）。painter の marks の中で使う。
 * ctx は設計座標（必要なら xf 込み）の変換がかかった状態で呼ばれる前提。
 */
import { rng, type Pt } from './painter';

export type Motif = 'swirl' | 'dots' | 'asanoha' | 'check';
export interface Fabric { base: string; motif: Motif; motifColor: string; shade: string; light: string }

/** 現在の変換の拡大率（px / 設計単位） */
const pxScale = (ctx: CanvasRenderingContext2D) => { const m = ctx.getTransform(); return Math.hypot(m.a, m.b); };

/** 模様の1タイル（period 設計単位の正方形）を、描画先と同じ解像度で作る */
function tile(f: Fabric, period: number, scale: number): HTMLCanvasElement {
  const n = Math.max(8, Math.round(period * scale));
  const cv = document.createElement('canvas'); cv.width = cv.height = n;
  const c = cv.getContext('2d')!;
  const k = n / period;
  c.scale(k, k);
  c.fillStyle = f.base; c.fillRect(0, 0, period, period);
  c.strokeStyle = f.motifColor; c.fillStyle = f.motifColor; c.lineCap = 'round'; c.lineJoin = 'round';
  const P = period;
  if (f.motif === 'swirl') {
    // 唐草：渦から蔓が伸びて隣の渦へつながる
    const spiral = (cx: number, cy: number, r: number, rot: number) => {
      c.beginPath();
      for (let t = 0; t <= Math.PI * 3.3; t += 0.08) {
        const rr = r * (1 - t / (Math.PI * 3.7));
        const x = cx + Math.cos(t + rot) * rr, y = cy + Math.sin(t + rot) * rr;
        t === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    };
    c.lineWidth = P * 0.07;
    spiral(P * 0.28, P * 0.3, P * 0.2, 0);
    spiral(P * 0.78, P * 0.78, P * 0.2, Math.PI);
    c.beginPath(); c.moveTo(P * 0.48, P * 0.3); c.bezierCurveTo(P * 0.62, P * 0.3, P * 0.52, P * 0.7, P * 0.58, P * 0.78); c.stroke();
    c.beginPath(); c.moveTo(P * 0.98, P * 0.78); c.bezierCurveTo(P * 1.1, P * 0.78, P * 1.05, P * 1.2, P * 1.28, P * 1.3); c.stroke();
    c.beginPath(); c.moveTo(-P * 0.02, P * 0.3); c.bezierCurveTo(-P * 0.1, P * 0.3, -P * 0.05, -P * 0.1, -P * 0.22, -P * 0.22); c.stroke();
    for (const [x, y] of [[0.55, 0.52], [0.05, 0.62], [0.95, 0.12]] as Pt[]) { c.beginPath(); c.ellipse(x * P, y * P, P * 0.06, P * 0.035, 0.6, 0, Math.PI * 2); c.fill(); }
  } else if (f.motif === 'dots') {
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.75]] as Pt[]) { c.beginPath(); c.arc(x * P, y * P, P * 0.12, 0, Math.PI * 2); c.fill(); }
  } else if (f.motif === 'asanoha') {
    // 麻の葉：正六角形の中心から六方と、各三角の中心へ
    c.lineWidth = P * 0.03;
    const h = P / 2;
    const star = (cx: number, cy: number) => {
      for (let a = 0; a < 6; a++) {
        const x = cx + Math.cos(a * Math.PI / 3) * h, y = cy + Math.sin(a * Math.PI / 3) * h;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke();
        const mx = cx + Math.cos(a * Math.PI / 3 + Math.PI / 6) * h * 0.58, my = cy + Math.sin(a * Math.PI / 3 + Math.PI / 6) * h * 0.58;
        c.beginPath(); c.moveTo(mx, my); c.lineTo(x, y); c.moveTo(mx, my); c.lineTo(cx + Math.cos((a + 1) * Math.PI / 3) * h, cy + Math.sin((a + 1) * Math.PI / 3) * h); c.stroke();
      }
    };
    star(P / 2, P / 2); star(0, 0); star(P, 0); star(0, P); star(P, P);
  } else {
    // チェック：太い帯と細い線の重なり
    c.globalAlpha = 0.45; c.fillRect(0, 0, P * 0.35, P); c.fillRect(0, 0, P, P * 0.35);
    c.globalAlpha = 0.9; c.fillRect(P * 0.62, 0, P * 0.05, P); c.fillRect(0, P * 0.62, P, P * 0.05);
    c.globalAlpha = 1;
  }
  return cv;
}

/** 模様を、角度 angle・原点 origin で塗る（パーツの形でクリップ済みの ctx に） */
export function fillMotif(ctx: CanvasRenderingContext2D, f: Fabric, period: number, angle = 0, origin: Pt = [0, 0], box = 400) {
  const s = pxScale(ctx);
  const pat = ctx.createPattern(tile(f, period, s), 'repeat')!;
  pat.setTransform(new DOMMatrix().scale(period / Math.round(Math.max(8, period * s))));
  ctx.save();
  ctx.translate(origin[0], origin[1]); ctx.rotate(angle);
  ctx.fillStyle = pat;
  ctx.fillRect(-box, -box, box * 2, box * 2);
  ctx.restore();
}

/** 帯（中心線に沿って曲がる布）に、模様を曲線に沿って貼る */
export function fillAlong(ctx: CanvasRenderingContext2D, f: Fabric, period: number, center: Pt[], halfWidth: number) {
  const s = pxScale(ctx);
  const pat = ctx.createPattern(tile(f, period, s), 'repeat')!;
  const k = period / Math.round(Math.max(8, period * s));
  let u = 0;
  for (let i = 0; i < center.length - 1; i++) {
    const a = center[i]!, b = center[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.save();
    ctx.translate(a[0], a[1]); ctx.rotate(ang);
    ctx.beginPath(); ctx.rect(-0.6, -halfWidth * 1.6, len + 1.2, halfWidth * 3.2); ctx.clip();
    pat.setTransform(new DOMMatrix().translate(-u, -halfWidth).scale(k));
    ctx.fillStyle = pat;
    ctx.fillRect(-1, -halfWidth * 1.6, len + 2, halfWidth * 3.2);
    ctx.restore();
    u += len;
  }
}

/** なめらかな中心線（Catmull-Rom、端点は延長） */
export function centerline(ctrl: Pt[], per = 10): Pt[] {
  const out: Pt[] = [];
  const P = [ctrl[0]!, ...ctrl, ctrl[ctrl.length - 1]!];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1]!, p1 = P[i]!, p2 = P[i + 1]!, p3 = P[i + 2]!;
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * (2 * p1[j]! + (-p0[j]! + p2[j]!) * t + (2 * p0[j]! - 5 * p1[j]! + 4 * p2[j]! - p3[j]!) * t2 + (-p0[j]! + 3 * p1[j]! - 3 * p2[j]! + p3[j]!) * t3)) as Pt);
    }
  }
  out.push(ctrl[ctrl.length - 1]!);
  return out;
}

/** しわ：a→b の線に沿った、影と明るい縁の二本の柔らかい筋 */
export function fold(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, width: number, depth = 0.35) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  const band = (off: number, color: string) => {
    const g = ctx.createLinearGradient(a[0] + nx * (off - width), a[1] + ny * (off - width), a[0] + nx * (off + width), a[1] + ny * (off + width));
    g.addColorStop(0, color.replace('A', '0')); g.addColorStop(0.5, color.replace('A', String(depth))); g.addColorStop(1, color.replace('A', '0'));
    ctx.strokeStyle = g; ctx.lineWidth = width * 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0] + nx * off, a[1] + ny * off); ctx.lineTo(b[0] + nx * off, b[1] + ny * off); ctx.stroke();
  };
  band(0, 'rgba(30,8,8,A)');
  band(width * 1.1, 'rgba(255,240,230,A)');
}

/** 布目（細かい織りのむら） */
export function weave(ctx: CanvasRenderingContext2D, box: [number, number, number, number], seed: number, strength = 0.06) {
  const r = rng(seed);
  const [x0, y0, x1, y1] = box;
  ctx.save();
  ctx.lineWidth = 0.35;
  for (let y = y0; y < y1; y += 0.9) {
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${strength * r()})`;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y + (r() - 0.5) * 0.6); ctx.stroke();
  }
  ctx.restore();
}

/** 金属の反射（円形の部品用） */
export function metal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tint: [number, number, number]) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.05);
  const [R, G, B] = tint;
  g.addColorStop(0, 'rgba(255,255,250,0.95)');
  g.addColorStop(0.25, `rgb(${Math.min(255, R + 40)},${Math.min(255, G + 40)},${Math.min(255, B + 30)})`);
  g.addColorStop(0.7, `rgb(${R},${G},${B})`);
  g.addColorStop(1, `rgb(${R * 0.55 | 0},${G * 0.55 | 0},${B * 0.5 | 0})`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}
