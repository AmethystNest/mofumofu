/**
 * 黒柴のパーツ。子犬の形は参考画像 docs/reference/shiba-style.png の座標で書き、設計座標へ変換する。
 * 設計座標：地面中央が原点・Y下向き。参考画像の (270, 700) が原点、0.5倍。
 * 成長（age 0=子犬 … 1=成犬）は、部位ごとの配置・大きさを補間し、脚は長さと太さから形を作り直す。
 */
import { apply, blob, rng, type PartSpec, type Pt, type Xf } from './painter';
import { centerline, fillAlong, fillMotif, fold, metal, weave, type Fabric } from './cloth';
export { apply };

export const R = (x: number, y: number): Pt => [(x - 270) * 0.5, (y - 700) * 0.5];
const RS = (pts: Pt[]): Pt[] => pts.map(([x, y]) => R(x, y));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 顔の配置表（作画座標）。目・眉・鼻・口・頬と、頭に描く模様は全部ここから位置を取る。
 * 参考画像より顔の傾きを取り除き、目はほぼ水平・眉は目の真上（やや内側）・鼻は目から離す。
 */
export const FACE = {
  eyeL: [170, 220] as Pt, eyeR: [304, 224] as Pt,
  browL: [178, 178] as Pt, browR: [294, 182] as Pt,
  nose: [236, 274] as Pt, snout: [238, 294] as Pt,
  cheekL: [120, 300] as Pt, cheekR: [360, 304] as Pt,
};

export const COL = {
  black: 'rgb(0,0,0)',
  cream: 'rgb(252,238,220)',
  creamShade: 'rgb(238,218,194)',
  tan: 'rgb(142,78,38)',        // 赤茶：控えめで黒寄り（ユーザー指定）
  brow: 'rgb(214,176,128)',     // 麻呂眉：淡い黄土
  innerEar: 'rgb(244,214,196)',
};

function img(ctx: CanvasRenderingContext2D, f: (b: (x: number, y: number, rx: number, ry: number, c: string, rot?: number, soft?: number) => void) => void) {
  f((x, y, rx, ry, c, rot = 0, soft = 0.35) => { const [cx, cy] = R(x, y); blob(ctx, cx, cy, rx * 0.5, ry * 0.5, c, rot, soft); });
}
const away = (cx: number, cy: number) => (x: number, y: number): Pt => { const [ox, oy] = R(cx, cy); return [x - ox, y - oy]; };
const down: () => Pt = () => [0.08, 1];

/** 点 a を中心に (sx, sy) 倍してから t だけ動かす変換 */
export const scaleAt = (a: Pt, sx: number, sy: number, to: Pt = a): Xf => [sx, 0, 0, sy, to[0] - sx * a[0], to[1] - sy * a[1]];
/** 2点 a0→a1, b0→b1 を写す相似変換（拡大・回転・移動） */
export function similarity(a0: Pt, b0: Pt, a1: Pt, b1: Pt): Xf {
  const ux = b0[0] - a0[0], uy = b0[1] - a0[1], vx = b1[0] - a1[0], vy = b1[1] - a1[1];
  const d = ux * ux + uy * uy;
  const c = (ux * vx + uy * vy) / d, s = (ux * vy - uy * vx) / d;
  return [c, s, -s, c, a1[0] - (c * a0[0] - s * a0[1]), a1[1] - (s * a0[0] + c * a0[1])];
}
/** 変換の合成：先に m2、次に m1 */
export const compose = (m1: Xf, m2: Xf): Xf => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

/** 同じ点数の輪郭どうしを補間する（形そのものの成長） */
const morph = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => [lerp(p[0], b[i]![0], t), lerp(p[1], b[i]![1], t)]);

const HEAD_PUPPY: Pt[] = [[180, 95], [270, 82], [360, 102], [420, 158], [446, 240], [432, 322], [382, 372], [300, 396], [220, 398], [140, 382], [80, 342], [44, 280], [52, 200], [98, 128]];
// 成犬：頬が締まり、あごと鼻づらが下へ伸びる
const HEAD_ADULT: Pt[] = [[186, 100], [270, 88], [352, 106], [410, 160], [428, 236], [412, 312], [364, 370], [296, 418], [226, 428], [158, 400], [102, 352], [68, 288], [70, 206], [110, 134]];


/** 耳の付け根：頭の輪郭の点 i と j の間（t）から、内側へ in だけ入った位置（作画座標） */
const EAR_ROOT = { L: { i: 13, j: 0, t: 0.55, in: 14 }, R: { i: 2, j: 3, t: 0.5, in: 14 } } as const;
export function earRoot(side: 'L' | 'R', age: number): Pt {
  const h = morph(HEAD_PUPPY, HEAD_ADULT, age);
  const e = EAR_ROOT[side];
  const a = h[e.i]!, b = h[e.j]!;
  const px = lerp(a[0], b[0], e.t), py = lerp(a[1], b[1], e.t);
  // 輪郭の中心へ向けて in だけ入る
  const c = h.reduce((s, q) => [s[0] + q[0] / h.length, s[1] + q[1] / h.length], [0, 0] as Pt);
  const dx = c[0] - px, dy = c[1] - py, dl = Math.hypot(dx, dy);
  return [px + (dx / dl) * e.in, py + (dy / dl) * e.in];
}

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
  // 耳：付け根を「その成長段階の頭の輪郭」に追従させ、付け根を中心に大きくする（横より縦に伸ばす）
  const earXf = (side: 'L' | 'R') => {
    const r0 = R(...earRoot(side, 0)), r1 = R(...earRoot(side, a));
    return compose(head, scaleAt(r0, lerp(1, 1.1, a), lerp(1, 1.3, a), r1));
  };
  const earL = earXf('L'), earR = earXf('R');
  const muzzle = compose(head, scaleAt(R(236, 264), lerp(1, 1.12, a), lerp(1, 1.34, a)));
  // 首まわり：結び目を「頭の座標で見たあごの下の点」に固定し、幅は頭の大きさに比例させる。
  // 子犬で収まりの良い配置を、どの成長段階でも頭に対して同じ関係に保つ（両端は頬の毛の下）
  const knot = R(205, 420);
  const neck = scaleAt(knot, headScale * 0.95, headScale * lerp(1.08, 1.0, a), apply(head, knot));
  return {
    age: a, body, head, tail, earL, earR, muzzle, neck, headScale, eyeScale: headScale * lerp(1, 0.86, a),
    legs: { front: [lerp(-67, -60, a), lerp(-11, -6, a)], hind: lerp(92, 84, a), width: lerp(50, 44, a), hindWidth: lerp(48, 44, a), top: lerp(-82, -135, a) },
    size: lerp(0.72, 1, a),
  };
}

export function head(L: Layout): PartSpec {
  return {
    name: 'head', xf: L.head, base: COL.black, sheen: true, len: 4, density: 7, shadow: 0.35, radius: 70,
    tuft: { step: 7, amp: 2.6, lean: 0.55 },
    outline: RS(morph(HEAD_PUPPY, HEAD_ADULT, L.age)),
    flow: away(245, 250),
    marks: ctx => img(ctx, b => {
      const F = FACE, ey = (F.eyeL[1] + F.eyeR[1]) / 2;
      // 頬の外側にだけ控えめな赤茶。白い口元は目のすぐ下から始まる
      b(F.eyeL[0] - 76, ey + 44, 48, 64, COL.tan, 0.2, 0.6);
      b(F.eyeR[0] + 76, ey + 48, 44, 60, COL.tan, -0.2, 0.6);
      b(F.nose[0] + 2, ey + 102, 176, 86, COL.tan, 0, 0.45);
      b(F.nose[0] + 4, ey + 106, 164, 80, COL.cream, 0, 0.35);
      b(F.nose[0], F.nose[1] - 8, 46, 40, COL.cream, 0, 0.5);     // 鼻筋
      b(F.nose[0] + 8, ey + 152, 130, 30, COL.creamShade, 0, 0.6);
    }),
  };
}

export function muzzle(L: Layout): PartSpec {
  return {
    name: 'muzzle', xf: L.muzzle, base: COL.cream, len: 2.5, density: 8, line: 0, radius: 12, shade: 0.9,
    tuft: { step: 5, amp: 0.9 },
    outline: RS([[186, 266], [236, 250], [290, 266], [306, 306], [280, 340], [236, 350], [192, 338], [172, 306]]),
    flow: away(238, 266),
  };
}

export function ear(side: 'L' | 'R', L: Layout): PartSpec {
  const pts: Pt[] = side === 'L'
    ? [[100, 162], [112, 64], [170, 2], [206, 52], [224, 108], [196, 150], [150, 176]]
    : [[346, 140], [404, 78], [478, 84], [470, 170], [430, 220], [388, 200], [360, 176]];
  const inner: [number, number, number, number, number] = side === 'L' ? [163, 78, 40, 70, 0.45] : [424, 142, 40, 66, -0.6];
  return {
    name: `ear${side}`, xf: side === 'L' ? L.earL : L.earR, base: COL.black, sheen: true, len: 3, density: 6, radius: 14,
    tuft: { step: 6, amp: 1.5, lean: 0.3 },
    outline: RS(pts), flow: down,
    marks: ctx => img(ctx, b => {
      b(inner[0], inner[1], inner[2] + 6, inner[3] + 6, COL.tan, inner[4], 0.6);
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
      b(196, 526, 140, 140, COL.tan, 0, 0.55);
      b(196, 530, 128, 132, COL.cream, 0, 0.45);
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
      blob(ctx, cx, (tanTop * 0.6 + 4) / 2, w * 0.5, Math.abs(tanTop * 0.6 - 4) / 2 + 4, COL.tan, 0, 0.45);   // 脚の赤茶は下半分だけ
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
      b(456, 440, 108, 138, COL.tan, -0.3, 0.6);
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
export interface Cloth extends Fabric { id: string; name: string; period: number }
export const BANDANAS: Cloth[] = [
  { id: 'bandana-red', name: '唐草バンダナ（赤）', base: 'rgb(196,62,52)', motif: 'swirl', motifColor: 'rgb(252,240,230)', shade: 'rgb(120,28,28)', light: 'rgb(236,120,104)', period: 17 },
  { id: 'bandana-indigo', name: '麻の葉バンダナ（藍）', base: 'rgb(40,62,108)', motif: 'asanoha', motifColor: 'rgb(214,226,244)', shade: 'rgb(18,28,58)', light: 'rgb(92,120,176)', period: 15 },
  { id: 'bandana-yellow', name: '水玉バンダナ（山吹）', base: 'rgb(224,164,44)', motif: 'dots', motifColor: 'rgb(255,250,236)', shade: 'rgb(150,96,20)', light: 'rgb(248,206,110)', period: 11 },
  { id: 'bandana-green', name: 'チェックのバンダナ（若草）', base: 'rgb(98,146,84)', motif: 'check', motifColor: 'rgb(238,236,214)', shade: 'rgb(50,86,44)', light: 'rgb(152,194,128)', period: 14 },
];

const boxOf = (pts: Pt[]): [number, number, number, number] => {
  const q = RS(pts); const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  return [Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) + 4, Math.max(...ys) + 4];
};
/** 布・革などの部品（毛なし・細い色線・やわらかい丸み） */
const cloth = (name: string, pts: Pt[], base: string, xf: Xf, marks?: (ctx: CanvasRenderingContext2D) => void, extra: Partial<PartSpec> = {}): PartSpec =>
  ({ name, xf, base, outline: RS(pts), tuft: null, line: 0.9, lineDark: 0.55, radius: 4, volume: 0.9, shade: 0.95, seed: name.length * 13, marks, ...extra });
const thread = (c: Cloth) => ({ inset: 1.5, color: 'rgba(255,244,232,0.55)', dash: [1.5, 1.3] as [number, number], width: 0.5 });
/** 画像座標の2点で、しわを入れる */
const F = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt, w = 1.6, d = 0.32) => fold(ctx, R(...a), R(...b), w, d);

export function bandana(c: Cloth, L: Layout): PartSpec[] {
  const band: Pt[] = [[84, 356], [124, 376], [205, 392], [300, 398], [370, 386], [374, 408], [310, 432], [205, 434], [120, 416], [86, 382]];
  const center = centerline(RS([[78, 366], [122, 394], [205, 412], [300, 414], [380, 396]]));
  const piece = (name: string, pts: Pt[], angle: number, folds: [Pt, Pt][], extra: Partial<PartSpec> = {}) =>
    cloth(`${c.id}-${name}`, pts, c.base, L.neck, ctx => {
      fillMotif(ctx, c, c.period, angle, R(...pts[0]!));
      weave(ctx, boxOf(pts), name.length * 7);
      for (const [a, b] of folds) F(ctx, a, b);
    }, { stitch: thread(c), ...extra });
  return [
    cloth(`${c.id}-band`, band, c.base, L.neck, ctx => {
      fillAlong(ctx, c, c.period, center, 9);
      weave(ctx, boxOf(band), 3);
      // 首に巻かれて上側（あごの下）が陰る。所々に横じわ
      const g = ctx.createLinearGradient(0, R(0, 372)[1], 0, R(0, 420)[1]);
      g.addColorStop(0, 'rgba(20,6,6,0.42)'); g.addColorStop(0.45, 'rgba(20,6,6,0)'); g.addColorStop(1, 'rgba(20,6,6,0.12)');
      ctx.fillStyle = g; ctx.fillRect(...boxOf(band).slice(0, 2) as [number, number], 300, 60);
      F(ctx, [118, 380], [126, 412], 1.4); F(ctx, [300, 402], [296, 428], 1.4); F(ctx, [360, 390], [362, 414], 1.2);
    }, { shadow: 0.32, stitch: thread(c), radius: 5 }),
    piece('tailL', [[196, 424], [176, 470], [140, 494], [130, 466], [168, 424]], -0.9, [[[190, 430], [150, 484]], [[178, 432], [140, 470]]]),
    piece('tailR', [[214, 424], [236, 468], [264, 492], [272, 462], [238, 420]], 0.8, [[[222, 430], [258, 482]], [[234, 428], [266, 468]]]),
    piece('wingL', [[200, 414], [150, 388], [118, 404], [126, 444], [178, 440]], -0.35, [[[196, 418], [128, 400]], [[196, 426], [132, 438]]], { radius: 6 }),
    piece('wingR', [[214, 414], [262, 396], [294, 414], [286, 448], [236, 440]], 0.35, [[[218, 418], [288, 410]], [[218, 428], [282, 442]]], { radius: 6 }),
    piece('knot', [[188, 402], [226, 400], [232, 428], [208, 442], [184, 428]], 0.2, [[[194, 408], [224, 434]], [[222, 406], [196, 436]]], { radius: 4, volume: 1.3, stitch: undefined }),
  ];
}

export function collar(L: Layout): PartSpec[] {
  const strap: Pt[] = [[84, 356], [130, 374], [205, 388], [300, 392], [370, 380], [374, 404], [300, 420], [205, 418], [128, 400], [86, 382]];
  const leather = 'rgb(128,50,36)';
  return [
    cloth('collar', strap, leather, L.neck, ctx => {
      const bx = boxOf(strap);
      const g = ctx.createLinearGradient(0, R(0, 380)[1], 0, R(0, 414)[1]);
      g.addColorStop(0, 'rgba(255,200,170,0.22)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,8,4,0.35)');
      ctx.fillStyle = g; ctx.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
      const r = rng(11);   // 革のしぼ
      for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,220,200'},${0.05 + r() * 0.06})`; ctx.fillRect(bx[0] + r() * (bx[2] - bx[0]), bx[1] + r() * (bx[3] - bx[1]), 0.8, 0.5); }
    }, { radius: 3, volume: 1.1, shadow: 0.3, stitch: { inset: 1.3, color: 'rgba(250,224,190,0.75)', dash: [1.4, 1.1], width: 0.45 } }),
    // バックル（左の横）：真鍮の枠と留め具
    cloth('buckle', [[100, 360], [126, 370], [120, 396], [94, 386]], 'rgb(196,160,84)', L.neck, ctx => {
      const [x, y] = R(110, 378);
      metal(ctx, x, y, 7, [190, 154, 80]);
      ctx.fillStyle = leather; ctx.fillRect(x - 3.4, y - 4.4, 6.8, 8.8);
      ctx.strokeStyle = 'rgba(70,50,20,.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 4, y + 0.6); ctx.stroke();
    }, { radius: 2, volume: 1.5, sharp: true }),
    // Dカン
    { name: 'ring', xf: L.neck, base: 'rgb(170,172,176)', outline: RS([[206, 400], [224, 400], [228, 414], [215, 424], [202, 414]]), tuft: null, line: 0.8, lineDark: 0.6, radius: 1.5, volume: 1.6,
      marks: ctx => { const [x, y] = R(215, 412); metal(ctx, x, y, 7, [150, 152, 158]); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x, y + 0.5, 3, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; } },
    // 札：擦れて読めない刻印（物語の「首輪の札」）
    { name: 'tag', xf: L.neck, base: 'rgb(200,168,92)', outline: RS([[196, 428], [216, 418], [236, 428], [240, 452], [216, 466], [194, 452]]), tuft: null, line: 0.9, lineDark: 0.6, radius: 3, volume: 1.4, shadow: 0.35,
      marks: ctx => {
        const [x, y] = R(217, 442);
        metal(ctx, x, y, 11.5, [196, 162, 86]);
        ctx.strokeStyle = 'rgba(80,56,20,0.55)'; ctx.lineWidth = 0.7;
        const r = rng(4);
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 6, y - 3 + i * 3); for (let k = 0; k < 5; k++) ctx.lineTo(x - 6 + k * 3 + r(), y - 3 + i * 3 + (r() - 0.5) * 1.2); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,250,230,0.35)'; ctx.lineWidth = 0.4;
        for (let i = 0; i < 10; i++) { const a = r() * 6.28; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9 + r()); ctx.stroke(); }
      } },
  ];
}

/* ---------------- 着せ替え：頭 ---------------- */
export function beret(L: Layout): PartSpec[] {
  const pts: Pt[] = [[196, 118], [236, 66], [300, 48], [372, 64], [414, 104], [398, 128], [300, 120], [214, 138]];
  const felt = (ctx: CanvasRenderingContext2D, bx: [number, number, number, number], seed: number) => {
    const r = rng(seed);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,210,200'},${0.04 + r() * 0.07})`; ctx.fillRect(bx[0] + r() * (bx[2] - bx[0]), bx[1] + r() * (bx[3] - bx[1]), 0.6, 0.6); }
  };
  return [
    cloth('beret', pts, 'rgb(150,40,46)', L.head, ctx => {
      const bx = boxOf(pts);
      felt(ctx, bx, 5);
      // 天辺のつまみから放射状のふくらみ
      for (const [a, b] of [[[304, 56], [240, 110]], [[304, 56], [380, 104]], [[304, 56], [310, 116]]] as [Pt, Pt][]) F(ctx, a, b, 3, 0.22);
    }, { radius: 16, volume: 1.2, shadow: 0.3, line: 1 }),
    cloth('beretBand', [[208, 124], [300, 114], [404, 118], [398, 132], [300, 126], [214, 140]], 'rgb(118,30,36)', L.head, ctx => felt(ctx, boxOf([[208, 114], [404, 140]]), 6),
      { radius: 2, stitch: { inset: 0.9, color: 'rgba(255,220,210,0.4)', dash: [1.2, 1], width: 0.4 } }),
    cloth('beretStem', [[296, 56], [300, 34], [314, 30], [318, 40], [308, 42], [310, 58]], 'rgb(126,34,40)', L.head, undefined, { radius: 2 }),
  ];
}

export function flower(L: Layout): PartSpec[] {
  const [cx, cy] = [122, 150];
  const petals: PartSpec[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * 30, py = cy + Math.sin(a) * 30;
    // 花びら：根元が細く、先がふくらみ、先端に小さな切れ込み
    const loc = (u: number, v: number): Pt => [cx + Math.cos(a) * u - Math.sin(a) * v, cy + Math.sin(a) * u + Math.cos(a) * v];
    const pts: Pt[] = [loc(4, -5), loc(26, -20), loc(50, -16), loc(58, -4), loc(54, 0), loc(58, 4), loc(50, 16), loc(26, 20), loc(4, 5)];
    petals.push(cloth(`petal${i}`, pts, 'rgb(253,248,244)', L.head, ctx => {
      const [x0, y0] = R(cx, cy), [x1, y1] = R(px + Math.cos(a) * 26, py + Math.sin(a) * 26);
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgb(236,150,172)'); g.addColorStop(0.45, 'rgb(250,214,224)'); g.addColorStop(1, 'rgb(255,250,248)');
      ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1) - 20, Math.min(y0, y1) - 20, Math.abs(x1 - x0) + 40, Math.abs(y1 - y0) + 40);
      ctx.strokeStyle = 'rgba(200,120,140,0.35)'; ctx.lineWidth = 0.4;
      for (const v of [-8, 0, 8]) { const [ax, ay] = R(...loc(6, 0)), [bx, by] = R(...loc(46, v)); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + v * 0.1, bx, by); ctx.stroke(); }
    }, { radius: 6, volume: 1, line: 0.7, lineDark: 0.35 }));
  }
  petals.push(cloth('flowerCenter', [[cx - 12, cy - 2], [cx - 2, cy - 12], [cx + 10, cy - 8], [cx + 12, cy + 4], [cx + 2, cy + 12], [cx - 10, cy + 8]], 'rgb(238,184,58)', L.head, ctx => {
    const r = rng(9);
    for (let i = 0; i < 16; i++) { const [x, y] = R(cx + (r() - 0.5) * 18, cy + (r() - 0.5) * 18); ctx.fillStyle = r() < 0.5 ? 'rgba(170,110,20,0.8)' : 'rgba(255,236,150,0.9)'; ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill(); }
  }, { radius: 5, volume: 1.4, line: 0.7 }));
  return petals;
}

export function ribbon(L: Layout): PartSpec[] {
  const satin = 'rgb(226,112,140)';
  const sheen = (pts: Pt[], a: Pt, b: Pt) => (ctx: CanvasRenderingContext2D) => {
    const bx = boxOf(pts);
    const [ax, ay] = R(...a), [bx2, by] = R(...b);
    const g = ctx.createLinearGradient(ax, ay, bx2, by);
    g.addColorStop(0, 'rgba(120,20,50,0.35)'); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,236,242,0.55)'); g.addColorStop(0.68, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(120,20,50,0.3)');
    ctx.fillStyle = g; ctx.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
  };
  const loopL: Pt[] = [[396, 180], [346, 136], [322, 150], [324, 196], [346, 226]];
  const loopR: Pt[] = [[410, 182], [462, 146], [482, 170], [476, 214], [446, 232]];
  const tailL: Pt[] = [[396, 192], [380, 232], [366, 262], [378, 256], [386, 266], [404, 200]];
  const tailR: Pt[] = [[408, 194], [424, 236], [440, 262], [428, 258], [420, 268], [398, 200]];
  return [
    cloth('ribbonTailL', tailL, satin, L.head, sheen(tailL, [372, 230], [404, 220]), { radius: 3 }),
    cloth('ribbonTailR', tailR, satin, L.head, sheen(tailR, [420, 220], [440, 240]), { radius: 3 }),
    cloth('ribbonL', loopL, satin, L.head, ctx => { sheen(loopL, [330, 150], [370, 220])(ctx); F(ctx, [394, 184], [334, 170], 1.4, 0.3); }, { radius: 7 }),
    cloth('ribbonR', loopR, satin, L.head, ctx => { sheen(loopR, [470, 150], [430, 226])(ctx); F(ctx, [412, 186], [472, 186], 1.4, 0.3); }, { radius: 7 }),
    cloth('ribbonKnot', [[388, 168], [416, 168], [420, 196], [392, 202]], 'rgb(204,88,116)', L.head, ctx => { F(ctx, [394, 172], [404, 198], 1.2, 0.35); }, { radius: 4, volume: 1.3 }),
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
    earL: apply(L.earL, R(...earRoot('L', 0))), earR: apply(L.earR, R(...earRoot('R', 0))), tail: apply(L.tail, R(420, 480)),
    eyeL: H(...FACE.eyeL), eyeR: H(...FACE.eyeR), browL: H(...FACE.browL), browR: H(...FACE.browR),
    nose: apply(L.muzzle, R(...FACE.nose)), snout: apply(L.muzzle, R(...FACE.snout)), cheekL: H(...FACE.cheekL), cheekR: H(...FACE.cheekR),
    frontL: [L.legs.front[0]!, 0] as Pt, frontR: [L.legs.front[1]!, 0] as Pt, hind: [L.legs.hind, 0] as Pt,
  };
}
