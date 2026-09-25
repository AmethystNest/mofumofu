/**
 * 黒柴のパーツ。子犬の形は参考画像 docs/reference/shiba-style.png の座標で書き、設計座標へ変換する。
 * 設計座標：地面中央が原点・Y下向き。参考画像の (270, 700) が原点、0.5倍。
 * 成長（age 0=子犬 … 1=成犬）は、部位ごとの配置・大きさを補間し、脚は長さと太さから形を作り直す。
 */
import { apply, blob, type PartSpec, type Pt, type Xf } from './painter';
export { apply };

export const R = (x: number, y: number): Pt => [(x - 270) * 0.5, (y - 700) * 0.5];
const RS = (pts: Pt[]): Pt[] => pts.map(([x, y]) => R(x, y));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const COL = {
  black: 'rgb(0,0,0)',
  cream: 'rgb(252,238,220)',
  creamShade: 'rgb(238,218,194)',
  tan: 'rgb(214,140,72)',
  innerEar: 'rgb(244,214,196)',
};

function img(ctx: CanvasRenderingContext2D, f: (b: (x: number, y: number, rx: number, ry: number, c: string, rot?: number, soft?: number) => void) => void) {
  f((x, y, rx, ry, c, rot = 0, soft = 0.35) => { const [cx, cy] = R(x, y); blob(ctx, cx, cy, rx * 0.5, ry * 0.5, c, rot, soft); });
}
const away = (cx: number, cy: number) => (x: number, y: number): Pt => { const [ox, oy] = R(cx, cy); return [x - ox, y - oy]; };
const down: () => Pt = () => [0.08, 1];

/** 点 a を中心に (sx, sy) 倍してから t だけ動かす変換 */
export const scaleAt = (a: Pt, sx: number, sy: number, to: Pt = a): Xf => [sx, 0, 0, sy, to[0] - sx * a[0], to[1] - sy * a[1]];
/** 変換の合成：先に m2、次に m1 */
export const compose = (m1: Xf, m2: Xf): Xf => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

/* ---------------- 成長に応じた配置 ---------------- */
export interface Layout {
  age: number;
  body: Xf; head: Xf; tail: Xf; earL: Xf; earR: Xf; muzzle: Xf; neck: Xf;
  headScale: number; eyeScale: number;
  /** 全体の大きさ（子犬は小さい） */
  size: number;
  legs: { front: number[]; hind: number; width: number; hindWidth: number; top: number };
}
export function layout(age: number): Layout {
  const a = Math.max(0, Math.min(1, age));
  const lift = 40 * a;                                            // 脚が伸びて胴が上がる量
  const body = scaleAt([0, -48], lerp(1, 0.9, a), lerp(1, 1.08, a), [0, -48 - lift]);
  const headScale = lerp(1, 0.84, a);
  const headAnchor: Pt = [-10, -152];
  const bodyTop = apply(body, [0, -156]);
  const head = scaleAt(headAnchor, headScale, headScale, [-10 + 4 * a, bodyTop[1] + 4 + 14 * a]);
  const tailPiv = R(420, 480);
  const tail = compose(scaleAt(apply(body, tailPiv), lerp(1, 1.12, a), lerp(1, 1.12, a)), body);
  const earL = compose(head, scaleAt(R(160, 112), lerp(1, 1.26, a), lerp(1, 1.3, a)));
  const earR = compose(head, scaleAt(R(392, 150), lerp(1, 1.26, a), lerp(1, 1.3, a)));
  const muzzle = compose(head, scaleAt(R(236, 250), lerp(1, 1.12, a), lerp(1, 1.34, a)));
  const neckPt = R(205, 420);
  const neckTo: Pt = [neckPt[0] + 5 * a, apply(head, headAnchor)[1] + 12 * lerp(1, 0.95, a)];
  const neck = scaleAt(neckPt, lerp(1, 0.94, a), lerp(1, 0.94, a), neckTo);
  return {
    age: a, body, head, tail, earL, earR, muzzle, neck, headScale, eyeScale: headScale * lerp(1, 0.86, a),
    legs: { front: [lerp(-67, -60, a), lerp(-11, -6, a)], hind: lerp(92, 84, a), width: lerp(50, 44, a), hindWidth: lerp(48, 44, a), top: lerp(-82, -135, a) },
    size: lerp(0.72, 1, a),
  };
}

/** 同じ点数の輪郭どうしを補間する（形そのものの成長） */
const morph = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => [lerp(p[0], b[i]![0], t), lerp(p[1], b[i]![1], t)]);

/* ---------------- 体 ---------------- */
const HEAD_PUPPY: Pt[] = [[180, 95], [270, 82], [360, 102], [420, 158], [446, 240], [432, 322], [382, 372], [300, 396], [220, 398], [140, 382], [80, 342], [44, 280], [52, 200], [98, 128]];
// 成犬：頬が締まり、あごと鼻づらが下へ伸びる
const HEAD_ADULT: Pt[] = [[186, 100], [270, 88], [352, 106], [410, 160], [428, 236], [412, 312], [364, 370], [296, 418], [226, 428], [158, 400], [102, 352], [68, 288], [70, 206], [110, 134]];

export function head(L: Layout): PartSpec {
  return {
    name: 'head', xf: L.head, base: COL.black, sheen: true, len: 4, density: 7, shadow: 0.35, radius: 70,
    tuft: { step: 7, amp: 2.6, lean: 0.55 },
    outline: RS(morph(HEAD_PUPPY, HEAD_ADULT, L.age)),
    flow: away(245, 250),
    marks: ctx => img(ctx, b => {
      b(92, 262, 70, 90, COL.tan, 0.2, 0.55);
      b(400, 296, 60, 80, COL.tan, -0.2, 0.55);
      b(240, 322, 188, 88, COL.tan, 0.12, 0.4);
      b(242, 326, 170, 80, COL.cream, 0.12, 0.35);
      b(236, 268, 50, 40, COL.cream, 0.1, 0.5);
      b(246, 374, 130, 30, COL.creamShade, 0.1, 0.6);
    }),
  };
}

export function muzzle(L: Layout): PartSpec {
  return {
    name: 'muzzle', xf: L.muzzle, base: COL.cream, len: 2.5, density: 8, line: 0, radius: 12, shade: 0.9,
    tuft: { step: 5, amp: 0.9 },
    outline: RS([[186, 252], [236, 234], [290, 250], [306, 290], [280, 324], [236, 334], [192, 322], [172, 290]]),
    flow: away(238, 250),
  };
}

export function ear(side: 'L' | 'R', L: Layout): PartSpec {
  const pts: Pt[] = side === 'L'
    ? [[92, 160], [112, 64], [170, 2], [206, 52], [226, 104], [160, 124]]
    : [[324, 106], [404, 78], [478, 84], [470, 170], [444, 232], [396, 156]];
  const inner: [number, number, number, number, number] = side === 'L' ? [163, 78, 40, 70, 0.45] : [424, 142, 40, 66, -0.6];
  return {
    name: `ear${side}`, xf: side === 'L' ? L.earL : L.earR, base: COL.black, sheen: true, len: 3, density: 6, radius: 14,
    tuft: { step: 6, amp: 1.5, lean: 0.3 },
    outline: RS(pts), flow: down,
    marks: ctx => img(ctx, b => {
      b(inner[0], inner[1], inner[2] + 12, inner[3] + 12, COL.tan, inner[4], 0.55);
      b(inner[0], inner[1] + 4, inner[2], inner[3], COL.innerEar, inner[4], 0.5);
    }),
  };
}

export function body(L: Layout): PartSpec {
  return {
    name: 'body', xf: L.body, base: COL.black, sheen: true, len: 6, density: 6, shadow: 0.4, radius: 60,
    tuft: { step: 8, amp: 3.4, lean: 0.6 },
    outline: RS([[70, 410], [200, 392], [330, 388], [432, 420], [496, 500], [506, 600], [482, 668], [424, 690], [364, 676], [326, 604], [252, 610], [184, 604], [112, 594], [62, 572], [36, 540], [42, 468]]),
    flow: (x, y) => (y > -60 ? [0.05, 1] : [x > 20 ? 0.6 : -0.4, 1]),
    marks: ctx => img(ctx, b => {
      b(196, 526, 150, 150, COL.tan, 0, 0.5);
      b(196, 530, 128, 132, COL.cream, 0, 0.45);
      b(330, 660, 120, 40, COL.tan, 0, 0.6);
    }),
  };
}

/** 脚：中心 x・太さ・上端（胴に隠れる）から形を作る。肉球は伸ばさない */
function leg(name: string, cx: number, w: number, top: number, dark = 0): PartSpec {
  const hw = w / 2;
  const pts: Pt[] = [[cx - hw * 0.96, top], [cx + hw * 0.96, top], [cx + hw, top * 0.4], [cx + hw * 0.98, -12], [cx + hw * 1.08, 2],
    [cx + hw * 0.8, 9], [cx, 10.5], [cx - hw * 0.8, 9], [cx - hw * 1.1, 3], [cx - hw * 1.02, -12], [cx - hw, top * 0.4]];
  const tanTop = Math.max(top * 0.62, -70);
  return {
    name, base: COL.black, sheen: true, len: 3.5, density: 7, radius: w * 0.42, shade: 1,
    tuft: { step: 6, amp: 1.4, lean: 0.4 },
    outline: pts, flow: down,
    marks: ctx => {
      blob(ctx, cx, (tanTop + 4) / 2, w * 0.62, Math.abs(tanTop - 4) / 2 + 6, COL.tan, 0, 0.35);
      blob(ctx, cx, 2, w * 0.6, 10, COL.cream, 0, 0.4);
      if (dark) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(cx - w, top - 5, w * 2, -top + 20); }
    },
    post: ctx => {
      ctx.strokeStyle = 'rgba(96,70,56,.75)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
      for (const dx of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(cx + dx * w, 4); ctx.lineTo(cx + dx * w * 1.05, 9.5); ctx.stroke(); }
    },
  };
}
export const frontL = (L: Layout) => leg('frontL', L.legs.front[0]!, L.legs.width, L.legs.top);
export const frontR = (L: Layout) => leg('frontR', L.legs.front[1]!, L.legs.width, L.legs.top);
export const hind = (L: Layout) => leg('hind', L.legs.hind, L.legs.hindWidth, L.legs.top + 20, 0.12);

export function tail(L: Layout): PartSpec {
  return {
    name: 'tail', xf: L.tail, base: COL.cream, sheen: true, len: 5, density: 7, radius: 22,
    tuft: { step: 7, amp: 3.4, lean: 0.7 },
    outline: RS([[400, 338], [470, 318], [534, 348], [556, 420], [542, 492], [498, 532], [440, 522], [408, 470], [394, 400]]),
    flow: (x, y) => { const [cx, cy] = R(470, 430); return [-(y - cy), x - cx]; },
    marks: ctx => img(ctx, b => {
      b(456, 440, 120, 150, COL.tan, -0.3, 0.55);
      b(452, 444, 100, 128, COL.black, -0.3, 0.5);
    }),
  };
}

export function tailDown(L: Layout): PartSpec {
  return {
    name: 'tailDown', xf: L.tail, base: COL.black, sheen: true, len: 5, density: 7, radius: 14,
    tuft: { step: 7, amp: 3, lean: 0.7 },
    outline: RS([[418, 470], [468, 480], [500, 540], [512, 620], [496, 668], [466, 660], [452, 600], [430, 540]]),
    flow: down,
    marks: ctx => img(ctx, b => b(500, 610, 40, 80, COL.cream, 0.2, 0.5)),
  };
}

/* ---------------- 着せ替え：首まわり ---------------- */
export interface Cloth { id: string; name: string; base: string; motif: 'swirl' | 'dots' | 'asanoha' | 'check'; motifColor: string }
export const BANDANAS: Cloth[] = [
  { id: 'bandana-red', name: '唐草バンダナ（赤）', base: 'rgb(200,74,62)', motif: 'swirl', motifColor: 'rgb(252,238,228)' },
  { id: 'bandana-indigo', name: '麻の葉バンダナ（藍）', base: 'rgb(46,70,118)', motif: 'asanoha', motifColor: 'rgb(226,234,246)' },
  { id: 'bandana-yellow', name: '水玉バンダナ（山吹）', base: 'rgb(226,168,50)', motif: 'dots', motifColor: 'rgb(255,250,236)' },
  { id: 'bandana-green', name: 'チェックのバンダナ（若草）', base: 'rgb(104,150,88)', motif: 'check', motifColor: 'rgba(250,250,240,0.5)' },
];

function motif(ctx: CanvasRenderingContext2D, c: Cloth, box: [number, number, number, number]) {
  const [x0, y0, x1, y1] = box;
  ctx.strokeStyle = c.motifColor; ctx.fillStyle = c.motifColor; ctx.lineCap = 'round';
  if (c.motif === 'swirl') {
    for (let x = x0 + 6, i = 0; x < x1; x += 17, i++) {
      const y = y0 + 8 + (i % 2) * 7;
      ctx.lineWidth = 1.8; ctx.beginPath();
      for (let t = 0; t <= Math.PI * 3.2; t += 0.1) { const rr = 6.5 * (1 - t / (Math.PI * 3.6)); const px = x + Math.cos(t + i) * rr, py = y + Math.sin(t + i) * rr; t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
    }
  } else if (c.motif === 'dots') {
    for (let y = y0 + 3, j = 0; y < y1; y += 8, j++) for (let x = x0 + (j % 2) * 5; x < x1; x += 10) { ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill(); }
  } else if (c.motif === 'asanoha') {
    ctx.lineWidth = 0.8;
    for (let y = y0, j = 0; y < y1 + 10; y += 10, j++) for (let x = x0 + (j % 2) * 6; x < x1 + 12; x += 12) {
      for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a * Math.PI / 3) * 6, y + Math.sin(a * Math.PI / 3) * 6); ctx.stroke(); }
    }
  } else {
    ctx.lineWidth = 2.2;
    for (let x = x0; x < x1; x += 9) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
    for (let y = y0; y < y1; y += 9) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  }
}
const boxOf = (pts: Pt[]): [number, number, number, number] => {
  const q = RS(pts); const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const cloth = (name: string, pts: Pt[], base: string, xf: Xf, marks?: (ctx: CanvasRenderingContext2D) => void, extra: Partial<PartSpec> = {}): PartSpec =>
  ({ name, xf, base, outline: RS(pts), tuft: null, line: 1, lineDark: 0.5, radius: 5, volume: 0.8, shade: 0.9, seed: name.length * 13, marks, ...extra });

export function bandana(c: Cloth, L: Layout): PartSpec[] {
  const mk = (name: string, pts: Pt[]) => cloth(`${c.id}-${name}`, pts, c.base, L.neck, ctx => motif(ctx, c, boxOf(pts)), { shadow: name === 'band' ? 0.3 : 0 });
  return [
    mk('band', [[58, 342], [120, 372], [205, 392], [300, 398], [392, 380], [396, 404], [310, 432], [205, 434], [118, 414], [62, 372]]),
    mk('tailL', [[196, 424], [176, 470], [140, 492], [132, 468], [168, 424]]),
    mk('tailR', [[214, 424], [236, 468], [262, 490], [270, 462], [238, 420]]),
    mk('wingL', [[200, 414], [150, 388], [120, 406], [128, 442], [178, 440]]),
    mk('wingR', [[214, 414], [262, 396], [292, 416], [284, 446], [236, 440]]),
    mk('knot', [[190, 404], [224, 402], [230, 428], [206, 440], [186, 428]]),
  ];
}

export function collar(L: Layout): PartSpec[] {
  const strap: Pt[] = [[62, 350], [130, 376], [205, 392], [300, 396], [390, 380], [392, 398], [300, 414], [205, 412], [128, 394], [64, 366]];
  return [
    cloth('collar', strap, 'rgb(140,56,40)', L.neck, ctx => {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,220,180,.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); RS([[70, 358], [140, 384], [205, 400], [300, 404], [388, 388]]).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    }, { radius: 3 }),
    cloth('tag', [[214, 408], [236, 412], [244, 438], [226, 452], [206, 440]], 'rgb(214,178,90)', L.neck, ctx => {
      const [x, y] = R(225, 430);
      ctx.strokeStyle = 'rgba(90,64,20,.6)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x + 5, y - 2); ctx.moveTo(x - 4, y + 3); ctx.lineTo(x + 3, y + 2); ctx.stroke();
    }, { radius: 6, volume: 1.4 }),
  ];
}

/* ---------------- 着せ替え：頭 ---------------- */
export function beret(L: Layout): PartSpec[] {
  const pts: Pt[] = [[196, 116], [236, 66], [300, 50], [370, 66], [412, 104], [396, 128], [300, 118], [214, 136]];
  return [
    cloth('beret', pts, 'rgb(168,50,52)', L.head, ctx => {
      ctx.strokeStyle = 'rgba(90,20,20,.45)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); RS([[206, 126], [300, 112], [404, 116]]).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }, { radius: 14, volume: 1.2, shadow: 0.3 }),
    cloth('beretStem', [[296, 54], [304, 32], [316, 36], [310, 56]], 'rgb(140,40,40)', L.head, undefined, { radius: 2 }),
  ];
}

export function flower(L: Layout): PartSpec[] {
  const [cx, cy] = [122, 150];
  const petals: PartSpec[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * 30, py = cy + Math.sin(a) * 30;
    const pts: Pt[] = [];
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; pts.push([px + Math.cos(t) * 25 * (Math.cos(t - a) > 0 ? 1 : 0.8), py + Math.sin(t) * 20]); }
    petals.push(cloth(`petal${i}`, pts, 'rgb(252,246,240)', L.head, ctx => { const [x, y] = R(px, py); blob(ctx, x, y, 10, 8, 'rgb(246,196,208)', a, 0.8); }, { radius: 5 }));
  }
  petals.push(cloth('flowerCenter', [[cx - 14, cy], [cx, cy - 14], [cx + 14, cy], [cx, cy + 14]], 'rgb(240,190,64)', L.head, undefined, { radius: 4, volume: 1.4 }));
  return petals;
}

export function ribbon(L: Layout): PartSpec[] {
  return [
    cloth('ribbonL', [[396, 180], [340, 138], [324, 188], [344, 228]], 'rgb(232,120,146)', L.head, undefined, { radius: 8 }),
    cloth('ribbonR', [[410, 182], [468, 150], [478, 206], [446, 232]], 'rgb(232,120,146)', L.head, undefined, { radius: 8 }),
    cloth('ribbonKnot', [[388, 166], [416, 168], [420, 196], [390, 200]], 'rgb(206,92,118)', L.head, undefined, { radius: 5 }),
  ];
}

export const NECKWEAR = [{ id: 'none', name: 'なし' }, ...BANDANAS.map(b => ({ id: b.id, name: b.name })), { id: 'collar', name: '首輪と札' }];
export const HEADWEAR = [{ id: 'none', name: 'なし' }, { id: 'beret', name: 'ベレー帽' }, { id: 'flower', name: '花飾り' }, { id: 'ribbon', name: 'リボン' }];

export function neckwearParts(id: string, L: Layout): PartSpec[] {
  const b = BANDANAS.find(x => x.id === id);
  if (b) return bandana(b, L);
  if (id === 'collar') return collar(L);
  return [];
}
export function headwearParts(id: string, L: Layout): PartSpec[] {
  return id === 'beret' ? beret(L) : id === 'flower' ? flower(L) : id === 'ribbon' ? ribbon(L) : [];
}

/** 回転の支点など（設計座標）。成長に応じて変わる */
export function pivots(L: Layout) {
  const H = (x: number, y: number) => apply(L.head, R(x, y));
  return {
    head: apply(L.head, [-10, -152]), neck: apply(L.neck, R(205, 420)),
    earL: apply(L.earL, R(160, 112)), earR: apply(L.earR, R(392, 150)), tail: apply(L.tail, R(420, 480)),
    eyeL: H(186, 216), eyeR: H(312, 254), browL: H(214, 168), browR: H(318, 202),
    nose: apply(L.muzzle, R(236, 258)), snout: apply(L.muzzle, R(238, 282)), cheekL: H(128, 300), cheekR: H(372, 330),
    frontL: [L.legs.front[0]!, 0] as Pt, frontR: [L.legs.front[1]!, 0] as Pt, hind: [L.legs.hind, 0] as Pt,
  };
}
