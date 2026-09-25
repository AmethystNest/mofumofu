/**
 * 黒柴（ちびキャラ）のパーツ。参考画像 docs/reference/shiba-style.png の座標で書き、設計座標へ変換する。
 * 設計座標：地面中央が原点・Y下向き。参考画像の (270, 700) が原点、0.5倍。
 */
import { blob, type PartSpec, type Pt } from './painter';

export const R = (x: number, y: number): Pt => [(x - 270) * 0.5, (y - 700) * 0.5];
const RS = (pts: Pt[]): Pt[] => pts.map(([x, y]) => R(x, y));

export const COL = {
  black: 'rgb(0,0,0)',
  cream: 'rgb(252,236,216)',
  creamShade: 'rgb(236,214,188)',
  tan: 'rgb(214,140,72)',
  innerEar: 'rgb(244,214,196)',
};

/** 画像座標のまま模様を描くためのラッパー */
function img(ctx: CanvasRenderingContext2D, f: (b: (x: number, y: number, rx: number, ry: number, c: string, rot?: number, soft?: number) => void) => void) {
  f((x, y, rx, ry, c, rot = 0, soft = 0.35) => { const [cx, cy] = R(x, y); blob(ctx, cx, cy, rx * 0.5, ry * 0.5, c, rot, soft); });
}
const away = (cx: number, cy: number) => (x: number, y: number): Pt => { const [ox, oy] = R(cx, cy); return [x - ox, y - oy]; };
const down: () => Pt = () => [0.1, 1];

/* ---------------- 体 ---------------- */

export function head(): PartSpec {
  return {
    name: 'head', base: COL.black, sheen: true, len: 4, density: 22, tuft: { step: 18, amp: 2.4, lean: 0.6 },
    outline: RS([[180, 95], [270, 82], [360, 102], [420, 158], [446, 240], [432, 322], [382, 372], [300, 396], [220, 398], [140, 382], [80, 342], [44, 280], [52, 200], [98, 128]]),
    flow: away(245, 260),
    marks: ctx => img(ctx, b => {
      b(92, 262, 70, 90, COL.tan, 0.2, 0.5);
      b(400, 296, 60, 80, COL.tan, -0.2, 0.5);
      b(240, 322, 188, 88, COL.tan, 0.12, 0.35);
      b(242, 326, 170, 80, COL.cream, 0.12, 0.3);   // 頬〜あごの白
      b(236, 268, 50, 40, COL.cream, 0.1, 0.45);    // 鼻筋
      b(246, 374, 130, 30, COL.creamShade, 0.1, 0.6);
    }),
  };
}

/** マズル（鼻づら）のふくらみ。線なし、陰影で立体を出す */
export function muzzle(): PartSpec {
  return {
    name: 'muzzle', base: COL.cream, len: 3, density: 26, tuft: { step: 10, amp: 1.2 }, line: 0, shade: 0,
    outline: RS([[186, 252], [236, 234], [290, 250], [306, 290], [280, 324], [236, 334], [192, 322], [172, 290]]),
    flow: away(238, 250),
    marks: ctx => img(ctx, b => {
      b(232, 262, 70, 30, 'rgb(255,248,238)', 0, 0.6);   // 上面のハイライト
      b(240, 326, 110, 26, 'rgb(226,200,172)', 0, 0.6);  // 下側の影
    }),
  };
}

export function ear(side: 'L' | 'R'): PartSpec {
  const pts: Pt[] = side === 'L'
    ? [[92, 160], [112, 64], [170, 2], [206, 52], [226, 104], [160, 124]]
    : [[324, 106], [404, 78], [478, 84], [470, 170], [444, 232], [396, 156]];
  const inner: [number, number, number, number, number] = side === 'L' ? [163, 78, 40, 70, 0.45] : [424, 142, 40, 66, -0.6];
  return {
    name: `ear${side}`, base: COL.black, sheen: true, len: 3.5, density: 22, tuft: { step: 12, amp: 1.8, lean: 0.3 },
    outline: RS(pts), flow: down, shade: 0.8,
    marks: ctx => img(ctx, b => {
      b(inner[0], inner[1], inner[2] + 10, inner[3] + 10, COL.tan, inner[4], 0.5);
      b(inner[0], inner[1] + 4, inner[2], inner[3], COL.innerEar, inner[4], 0.45);
    }),
  };
}

export function body(): PartSpec {
  return {
    name: 'body', base: COL.black, sheen: true, len: 6, density: 18, tuft: { step: 20, amp: 2.8, lean: 0.6 },
    outline: RS([[70, 410], [200, 392], [330, 388], [432, 420], [496, 500], [506, 600], [482, 668], [424, 690], [364, 676], [326, 604], [252, 610], [184, 604], [112, 594], [62, 572], [36, 540], [42, 468]]),
    flow: (x, y) => (y > -60 ? [0.05, 1] : [x > 20 ? 0.6 : -0.4, 1]),
    marks: ctx => img(ctx, b => {
      b(196, 526, 150, 150, COL.tan, 0, 0.45);
      b(196, 530, 128, 132, COL.cream, 0, 0.4);
      b(330, 660, 120, 40, COL.tan, 0, 0.6);
    }),
  };
}

function leg(name: string, pts: [number, number][], tanAt: [number, number, number, number], pawAt: [number, number, number, number]): PartSpec {
  return {
    name, base: COL.black, sheen: true, len: 4, density: 22, tuft: { step: 12, amp: 1.8, lean: 0.4 },
    outline: RS(pts), flow: down,
    marks: ctx => img(ctx, b => {
      b(tanAt[0], tanAt[1], tanAt[2], tanAt[3], COL.tan, 0, 0.35);
      b(pawAt[0], pawAt[1], pawAt[2], pawAt[3], COL.cream, 0, 0.3);
    }),
    post: ctx => {   // 指の線
      ctx.strokeStyle = 'rgba(60,40,32,.7)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      for (const dx of [-0.28, 0.02, 0.3]) {
        const [x, y] = R(pawAt[0] + dx * pawAt[2], pawAt[1] + pawAt[3] * 0.25);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 5); ctx.stroke();
      }
    },
  };
}
export const frontL = () => leg('frontL', [[84, 540], [186, 540], [196, 640], [202, 700], [168, 722], [92, 720], [70, 692], [80, 630]], [130, 668, 118, 90], [134, 704, 118, 46]);
export const frontR = () => leg('frontR', [[196, 550], [300, 550], [306, 648], [312, 704], [276, 724], [202, 722], [184, 692], [194, 640]], [250, 676, 118, 90], [248, 708, 120, 46]);
export const hind = () => leg('hind', [[398, 596], [494, 586], [502, 650], [508, 696], [478, 708], [414, 704], [394, 664]], [452, 660, 110, 90], [458, 698, 96, 36]);

export function tail(): PartSpec {
  return {
    name: 'tail', base: COL.cream, sheen: true, len: 6, density: 18, tuft: { step: 15, amp: 4, lean: 0.6 },
    outline: RS([[400, 338], [470, 318], [534, 348], [556, 420], [542, 492], [498, 532], [440, 522], [408, 470], [394, 400]]),
    flow: (x, y) => { const [cx, cy] = R(470, 430); return [-(y - cy), x - cx]; },
    marks: ctx => img(ctx, b => {
      b(456, 440, 120, 150, COL.tan, -0.3, 0.5);
      b(452, 444, 100, 128, COL.black, -0.3, 0.45);
    }),
  };
}

export function tailDown(): PartSpec {
  return {
    name: 'tailDown', base: COL.black, sheen: true, len: 6, density: 18, tuft: { step: 14, amp: 3.5, lean: 0.6 },
    outline: RS([[418, 470], [468, 480], [500, 540], [512, 620], [496, 668], [466, 660], [452, 600], [430, 540]]),
    flow: down,
    marks: ctx => img(ctx, b => b(500, 610, 40, 80, COL.cream, 0.2, 0.5)),
  };
}

/* ---------------- 着せ替え：首まわり ---------------- */

export interface Cloth { id: string; name: string; base: string; motif: 'swirl' | 'dots' | 'asanoha' | 'check'; motifColor: string }
export const BANDANAS: Cloth[] = [
  { id: 'bandana-red', name: '唐草バンダナ（赤）', base: 'rgb(210,86,72)', motif: 'swirl', motifColor: 'rgb(252,238,228)' },
  { id: 'bandana-indigo', name: '麻の葉バンダナ（藍）', base: 'rgb(52,78,128)', motif: 'asanoha', motifColor: 'rgb(226,234,246)' },
  { id: 'bandana-yellow', name: '水玉バンダナ（山吹）', base: 'rgb(232,178,58)', motif: 'dots', motifColor: 'rgb(255,250,236)' },
  { id: 'bandana-green', name: 'チェックのバンダナ（若草）', base: 'rgb(112,160,96)', motif: 'check', motifColor: 'rgba(250,250,240,0.55)' },
];

function motif(ctx: CanvasRenderingContext2D, c: Cloth, box: [number, number, number, number]) {
  const [x0, y0, x1, y1] = box;
  ctx.strokeStyle = c.motifColor; ctx.fillStyle = c.motifColor; ctx.lineCap = 'round';
  if (c.motif === 'swirl') {
    for (let x = x0 + 6, i = 0; x < x1; x += 17, i++) {
      const y = y0 + 8 + (i % 2) * 7;
      ctx.lineWidth = 2; ctx.beginPath();
      for (let t = 0; t <= Math.PI * 3.2; t += 0.12) { const rr = 6.5 * (1 - t / (Math.PI * 3.6)); const px = x + Math.cos(t + i) * rr, py = y + Math.sin(t + i) * rr; t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
    }
  } else if (c.motif === 'dots') {
    for (let y = y0 + 3, j = 0; y < y1; y += 8, j++) for (let x = x0 + (j % 2) * 5; x < x1; x += 10) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
  } else if (c.motif === 'asanoha') {
    ctx.lineWidth = 0.9;
    for (let y = y0, j = 0; y < y1 + 10; y += 10, j++) for (let x = x0 + (j % 2) * 6; x < x1 + 12; x += 12) {
      for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a * Math.PI / 3) * 6, y + Math.sin(a * Math.PI / 3) * 6); ctx.stroke(); }
    }
  } else {
    ctx.lineWidth = 2.4;
    for (let x = x0; x < x1; x += 9) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
    for (let y = y0; y < y1; y += 9) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  }
}
function clothShade(ctx: CanvasRenderingContext2D, box: [number, number, number, number]) {
  const g = ctx.createLinearGradient(box[0], box[1], box[2], box[3]);
  g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(40,10,10,.28)');
  ctx.fillStyle = g; ctx.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
}
const boxOf = (pts: Pt[]): [number, number, number, number] => {
  const q = RS(pts); const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/** バンダナ（帯＋結び目）。首の支点を基準に配置する */
export function bandana(c: Cloth): PartSpec[] {
  const mk = (name: string, pts: Pt[]): PartSpec => ({
    name: `${c.id}-${name}`, base: c.base, tuft: null, line: 2, outline: RS(pts), seed: name.length * 13,
    marks: ctx => { const bx = boxOf(pts); motif(ctx, c, bx); clothShade(ctx, bx); },
  });
  return [
    mk('band', [[58, 342], [120, 372], [205, 392], [300, 398], [392, 380], [396, 404], [310, 432], [205, 434], [118, 414], [62, 372]]),
    mk('tailL', [[196, 424], [176, 470], [140, 492], [132, 468], [168, 424]]),
    mk('tailR', [[214, 424], [236, 468], [262, 490], [270, 462], [238, 420]]),
    mk('wingL', [[200, 414], [150, 388], [120, 406], [128, 442], [178, 440]]),
    mk('wingR', [[214, 414], [262, 396], [292, 416], [284, 446], [236, 440]]),
    mk('knot', [[190, 404], [224, 402], [230, 428], [206, 440], [186, 428]]),
  ];
}

/** 首輪と札（物語の「首輪の札」） */
export function collar(): PartSpec[] {
  const strap: Pt[] = [[62, 350], [130, 376], [205, 392], [300, 396], [390, 380], [392, 398], [300, 414], [205, 412], [128, 394], [64, 366]];
  return [
    { name: 'collar', base: 'rgb(150,62,44)', tuft: null, line: 2, outline: RS(strap),
      marks: ctx => {
        const bx = boxOf(strap); clothShade(ctx, bx);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,220,180,.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); const a = RS([[70, 358], [140, 384], [205, 400], [300, 404], [388, 388]]);
        a.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
      } },
    { name: 'tag', base: 'rgb(214,182,96)', tuft: null, line: 1.8, outline: RS([[214, 408], [236, 412], [244, 438], [226, 452], [206, 440]]),
      marks: ctx => {
        const [x, y] = R(225, 430);
        const g = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, 12);
        g.addColorStop(0, 'rgba(255,248,210,.9)'); g.addColorStop(1, 'rgba(120,90,30,.4)');
        ctx.fillStyle = g; ctx.fillRect(x - 14, y - 14, 28, 28);
        ctx.strokeStyle = 'rgba(90,64,20,.6)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x + 5, y - 2); ctx.moveTo(x - 4, y + 3); ctx.lineTo(x + 3, y + 2); ctx.stroke();
      } },
  ];
}

/* ---------------- 着せ替え：頭 ---------------- */

export function beret(): PartSpec[] {
  const pts: Pt[] = [[196, 116], [236, 66], [300, 50], [370, 66], [412, 104], [396, 128], [300, 118], [214, 136]];
  return [
    { name: 'beret', base: 'rgb(176,58,58)', tuft: null, line: 2, outline: RS(pts),
      marks: ctx => {
        const bx = boxOf(pts);
        const g = ctx.createRadialGradient(bx[0] + 30, bx[1] + 8, 4, bx[0] + 40, bx[1] + 20, 70);
        g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(60,10,10,.3)');
        ctx.fillStyle = g; ctx.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
        ctx.strokeStyle = 'rgba(90,20,20,.5)'; ctx.lineWidth = 1.4;
        const band = RS([[206, 126], [300, 112], [404, 116]]);
        ctx.beginPath(); band.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      } },
    { name: 'beretStem', base: 'rgb(150,44,44)', tuft: null, line: 1.6, outline: RS([[296, 54], [304, 32], [316, 36], [310, 56]]) },
  ];
}

export function flower(): PartSpec[] {
  const [cx, cy] = [132, 158];
  const petals: PartSpec[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * 34, py = cy + Math.sin(a) * 34;
    const pts: Pt[] = [];
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; pts.push([px + Math.cos(t) * 28 * (Math.cos(t - a) > 0 ? 1 : 0.8), py + Math.sin(t) * 22]); }
    petals.push({ name: `petal${i}`, base: 'rgb(252,246,240)', tuft: null, line: 1.6, outline: RS(pts), seed: i + 3,
      marks: ctx => { const [x, y] = R(px, py); blob(ctx, x, y, 12, 9, 'rgb(246,200,210)', a, 0.8); } });
  }
  petals.push({ name: 'flowerCenter', base: 'rgb(244,196,70)', tuft: null, line: 1.4,
    outline: RS([[cx - 16, cy], [cx, cy - 16], [cx + 16, cy], [cx, cy + 16]]) });
  return petals;
}

export function ribbon(): PartSpec[] {
  const pink = 'rgb(236,128,150)';
  const sh = (pts: Pt[]) => (ctx: CanvasRenderingContext2D) => clothShade(ctx, boxOf(pts));
  const L: Pt[] = [[396, 180], [340, 138], [324, 188], [344, 228]];
  const Rr: Pt[] = [[410, 182], [468, 150], [478, 206], [446, 232]];
  const K: Pt[] = [[388, 166], [416, 168], [420, 196], [390, 200]];
  return [
    { name: 'ribbonL', base: pink, tuft: null, line: 1.8, outline: RS(L), marks: sh(L) },
    { name: 'ribbonR', base: pink, tuft: null, line: 1.8, outline: RS(Rr), marks: sh(Rr) },
    { name: 'ribbonKnot', base: 'rgb(214,96,122)', tuft: null, line: 1.6, outline: RS(K) },
  ];
}

export const NECKWEAR = [...BANDANAS.map(b => ({ id: b.id, name: b.name })), { id: 'collar', name: '首輪と札' }, { id: 'none', name: 'なし' }];
export const HEADWEAR = [{ id: 'none', name: 'なし' }, { id: 'beret', name: 'ベレー帽' }, { id: 'flower', name: '花飾り' }, { id: 'ribbon', name: 'リボン' }];

export function neckwearParts(id: string): PartSpec[] {
  const b = BANDANAS.find(x => x.id === id);
  if (b) return bandana(b);
  if (id === 'collar') return collar();
  return [];
}
export function headwearParts(id: string): PartSpec[] {
  return id === 'beret' ? beret() : id === 'flower' ? flower() : id === 'ribbon' ? ribbon() : [];
}

/** 回転の支点（画像座標） */
export const PIV = {
  head: R(240, 392), earL: R(160, 112), earR: R(392, 150), tail: R(420, 480), neck: R(205, 420),
  eyeL: R(186, 214), eyeR: R(312, 252), browL: R(214, 170), browR: R(318, 204),
  nose: R(236, 258), snout: R(238, 280), cheekL: R(128, 300), cheekR: R(372, 330),
  // 脚は接地点（足の裏）を支点にして、成長で上へ伸ばす
  frontL: R(135, 720), frontR: R(248, 722), hind: R(458, 706),
};
/** 脚の見えている長さ（設計px）：成長で胴が持ち上がる量の基準 */
export const LEG_H = 55;
