/**
 * 黒柴（ちびキャラ）のパーツ。参考画像（ユーザー提供）の座標で書き、設計座標へ変換する。
 * 設計座標：地面中央が原点・Y下向き。参考画像の (270, 700) が原点、0.5倍。
 */
import { blob, type PartSpec, type Pt } from './painter';

export const R = (x: number, y: number): Pt => [(x - 270) * 0.5, (y - 700) * 0.5];
const RS = (pts: Pt[]): Pt[] => pts.map(([x, y]) => R(x, y));

export const COL = {
  black: 'rgb(58,50,48)',
  blackDeep: 'rgb(36,29,27)',
  cream: 'rgb(252,234,212)',
  creamShade: 'rgb(238,212,184)',
  tan: 'rgb(226,168,108)',
  tanDeep: 'rgb(196,128,70)',
  innerEar: 'rgb(244,214,196)',
  red: 'rgb(210,86,72)',
  redDeep: 'rgb(170,60,52)',
  swirl: 'rgb(252,238,228)',
  line: 'rgba(38,26,22,0.92)',
};

/** 画像座標のまま模様を描くためのラッパー */
function img(ctx: CanvasRenderingContext2D, f: (b: (x: number, y: number, rx: number, ry: number, c: string, rot?: number, soft?: number) => void) => void) {
  f((x, y, rx, ry, c, rot = 0, soft = 0.35) => { const [cx, cy] = R(x, y); blob(ctx, cx, cy, rx * 0.5, ry * 0.5, c, rot, soft); });
}
const away = (cx: number, cy: number, k = 1) => (x: number, y: number): Pt => { const [ox, oy] = R(cx, cy); return [(x - ox) * k, (y - oy) * k]; };
const down: () => Pt = () => [0.1, 1];

export function head(): PartSpec {
  return {
    name: 'head', base: COL.black, len: 4, density: 22, tuft: { step: 15, amp: 3.2, lean: 0.5 },
    outline: RS([[180, 95], [270, 82], [360, 102], [420, 158], [446, 240], [432, 322], [382, 372], [300, 396], [220, 398], [140, 382], [80, 342], [44, 280], [52, 200], [98, 128]]),
    flow: away(245, 260),
    marks: ctx => img(ctx, b => {
      b(92, 262, 70, 90, COL.tan, 0.2, 0.5);        // 頬の赤茶（左）
      b(400, 296, 60, 80, COL.tan, -0.2, 0.5);      // 頬の赤茶（右）
      b(240, 318, 190, 92, COL.tan, 0.12, 0.35);
      b(242, 322, 172, 84, COL.cream, 0.12, 0.3);   // 口元〜頬の白
      b(236, 262, 52, 42, COL.cream, 0.1, 0.4);     // 鼻筋
      b(246, 372, 130, 30, COL.creamShade, 0.1, 0.6);
    }),
  };
}

export function ear(side: 'L' | 'R'): PartSpec {
  const pts: Pt[] = side === 'L'
    ? [[92, 160], [112, 64], [170, 2], [206, 52], [226, 104], [160, 124]]
    : [[324, 106], [404, 78], [478, 84], [470, 170], [444, 232], [396, 156]];
  const inner: [number, number, number, number, number] = side === 'L' ? [163, 78, 40, 70, 0.45] : [424, 142, 40, 66, -0.6];
  return {
    name: `ear${side}`, base: COL.black, len: 3.5, density: 22, tuft: { step: 12, amp: 1.8, lean: 0.3 },
    outline: RS(pts), flow: down, shade: 0.8,
    marks: ctx => img(ctx, b => {
      b(inner[0], inner[1], inner[2] + 10, inner[3] + 10, COL.tan, inner[4], 0.5);
      b(inner[0], inner[1] + 4, inner[2], inner[3], COL.innerEar, inner[4], 0.45);
    }),
  };
}

export function body(): PartSpec {
  return {
    name: 'body', base: COL.black, len: 6, density: 18, tuft: { step: 16, amp: 4, lean: 0.55 },
    outline: RS([[70, 410], [200, 392], [330, 388], [432, 420], [496, 500], [506, 600], [482, 668], [424, 690], [364, 676], [326, 604], [252, 610], [184, 604], [112, 594], [62, 572], [36, 540], [42, 468]]),
    flow: (x, y) => (y > -60 ? [0.05, 1] : [x > 20 ? 0.6 : -0.4, 1]),
    marks: ctx => img(ctx, b => {
      b(196, 526, 150, 150, COL.tan, 0, 0.45);
      b(196, 530, 128, 132, COL.cream, 0, 0.4);     // 胸の白
      b(330, 660, 120, 40, COL.tan, 0, 0.6);
    }),
  };
}

function leg(name: string, pts: [number, number][], tanAt: [number, number, number, number], pawAt: [number, number, number, number]): PartSpec {
  return {
    name, base: COL.black, len: 4, density: 22, tuft: { step: 12, amp: 1.8, lean: 0.4 },
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
    name: 'tail', base: COL.cream, len: 6, density: 18, tuft: { step: 15, amp: 4, lean: 0.6 },
    outline: RS([[400, 338], [470, 318], [534, 348], [556, 420], [542, 492], [498, 532], [440, 522], [408, 470], [394, 400]]),
    flow: (x, y) => { const [cx, cy] = R(470, 430); return [-(y - cy), x - cx]; },   // 渦
    marks: ctx => img(ctx, b => {
      b(456, 440, 120, 150, COL.tan, -0.3, 0.5);
      b(452, 444, 100, 128, COL.black, -0.3, 0.45);   // 巻きの内側は黒
    }),
  };
}

/** しょんぼり用：ほどけて垂れた尾 */
export function tailDown(): PartSpec {
  return {
    name: 'tailDown', base: COL.black, len: 6, density: 18, tuft: { step: 14, amp: 3.5, lean: 0.6 },
    outline: RS([[418, 470], [468, 480], [500, 540], [512, 620], [496, 668], [466, 660], [452, 600], [430, 540]]),
    flow: down,
    marks: ctx => img(ctx, b => b(500, 610, 40, 80, COL.cream, 0.2, 0.5)),
  };
}

/** 唐草バンダナ（毛なし・線あり） */
export function bandana(): PartSpec {
  return {
    name: 'bandana', base: COL.red, tuft: null, line: 2,
    outline: RS([[58, 342], [120, 372], [205, 392], [300, 398], [392, 380], [396, 404], [310, 432], [205, 434], [118, 414], [62, 372]]),
    marks: ctx => {
      const sw = (ix: number, iy: number, r: number, rot: number) => {
        const [x, y] = R(ix, iy);
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.strokeStyle = COL.swirl; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let t = 0; t <= Math.PI * 3.2; t += 0.12) {
          const rr = r * (1 - t / (Math.PI * 3.6));
          const px = Math.cos(t) * rr, py = Math.sin(t) * rr;
          t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke(); ctx.restore();
      };
      for (const [ix, iy, rot] of [[90, 366, 0], [150, 392, 2], [270, 412, 4], [335, 405, 1], [378, 392, 3]] as const) sw(ix, iy, 7, rot);
      const g = ctx.createLinearGradient(0, R(0, 380)[1], 0, R(0, 434)[1]);
      g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(60,10,10,.25)');
      ctx.fillStyle = g; ctx.fillRect(-150, -200, 300, 200);
    },
  };
}

/** 結び目と羽・垂れ */
export function bow(): PartSpec[] {
  const mk = (name: string, pts: [number, number][]): PartSpec => ({
    name, base: COL.red, tuft: null, line: 2, outline: RS(pts),
    marks: ctx => {
      const [x, y] = R(pts[0]![0], pts[0]![1]);
      ctx.strokeStyle = COL.swirl; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const xs = pts.map(p => R(p[0], p[1])[0]), ys = pts.map(p => R(p[0], p[1])[1]);
      const cx = xs.reduce((a, b) => a + b) / xs.length, cy = ys.reduce((a, b) => a + b) / ys.length;
      ctx.beginPath();
      for (let t = 0; t <= Math.PI * 3; t += 0.12) { const rr = 6 * (1 - t / (Math.PI * 3.4)); const px = cx + Math.cos(t) * rr, py = cy + Math.sin(t) * rr; t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
      void x; void y;
      const g = ctx.createLinearGradient(cx - 20, cy - 20, cx + 20, cy + 20);
      g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(60,10,10,.28)');
      ctx.fillStyle = g; ctx.fillRect(cx - 40, cy - 40, 80, 80);
    },
  });
  return [
    mk('bowTailL', [[196, 424], [176, 470], [140, 492], [132, 468], [168, 424]]),
    mk('bowTailR', [[214, 424], [236, 468], [262, 490], [270, 462], [238, 420]]),
    mk('bowWingL', [[200, 414], [150, 388], [120, 406], [128, 442], [178, 440]]),
    mk('bowWingR', [[214, 414], [262, 396], [292, 416], [284, 446], [236, 440]]),
    mk('bowKnot', [[190, 404], [224, 402], [230, 428], [206, 440], [186, 428]]),
  ];
}

/** 回転の支点（画像座標） */
export const PIV = {
  body: R(270, 600), head: R(240, 392), earL: R(160, 112), earR: R(392, 150), tail: R(420, 480),
  frontL: R(135, 580), frontR: R(248, 594), hind: R(446, 612), bandana: R(205, 420),
  eyeL: R(186, 214), eyeR: R(312, 252), browL: R(214, 170), browR: R(318, 204),
  nose: R(236, 262), mouth: R(232, 292), cheekL: R(128, 300), cheekR: R(372, 330),
};
