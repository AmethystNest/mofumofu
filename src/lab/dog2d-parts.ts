/** 2D黒柴のパーツ定義（設計座標：地面中央が原点・Y下向き・右向き・単位px） */
import { capsule, ellipse, softEllipse, type PartSpec } from './fur-painter';

export const C = {
  black: 'rgb(30,26,24)',
  tan: 'rgba(166,84,34,1)',
  tanLight: 'rgba(200,128,66,1)',
  white: 'rgba(242,232,214,1)',
  cream: 'rgba(226,206,176,1)',
};

const back = (): [number, number] => [-1, 0.3];
const down = (): [number, number] => [0.15, 1];

function torso(): PartSpec {
  const p = new Path2D(
    'M -98,-152 C -88,-180 -30,-172 20,-173 C 62,-174 98,-168 108,-134 C 117,-100 106,-74 80,-68 ' +
    'C 52,-62 24,-72 -8,-80 C -40,-88 -62,-80 -84,-86 C -106,-94 -114,-116 -110,-132 C -108,-142 -104,-148 -98,-152 Z');
  return {
    name: 'torso', shape: p, box: [-115, -185, 120, -62], base: C.black, len: 11, density: 10, seed: 11,
    flow: (x, y) => (x > 70 && y > -150 ? down() : back()),
    marks: ctx => {
      softEllipse(ctx, 96, -114, 34, 56, C.tan, -0.15, 0.4);
      softEllipse(ctx, 102, -110, 24, 48, C.white, -0.15, 0.35);
      softEllipse(ctx, 30, -70, 70, 15, C.tan, 0.12, 0.5);
      softEllipse(ctx, 40, -66, 56, 11, C.white, 0.12, 0.5);
      softEllipse(ctx, -98, -98, 16, 24, C.tan, 0.3, 0.6);
    },
  };
}

function neck(): PartSpec {
  const p = new Path2D(); ellipse(p, 84, -168, 40, 46, 0.35);
  return {
    name: 'neck', shape: p, box: [40, -218, 128, -118], base: C.black, len: 11, density: 11, seed: 12,
    flow: (x) => [x > 95 ? 0.1 : -0.5, 1],
    marks: ctx => {
      softEllipse(ctx, 104, -152, 28, 46, C.tan, -0.3, 0.4);
      softEllipse(ctx, 110, -148, 20, 40, C.white, -0.3, 0.4);
    },
  };
}

function head(): PartSpec {
  const p = new Path2D();
  ellipse(p, 122, -222, 44, 40);
  ellipse(p, 117, -198, 50, 30);
  ellipse(p, 160, -206, 26, 17, 0.1);
  ellipse(p, 151, -193, 20, 10);
  return {
    name: 'head', shape: p, box: [64, -264, 190, -164], base: C.black, len: 6, density: 16, seed: 13, shade: 0.8,
    flow: (x, y) => (y > -205 && x < 145 ? [-0.6, 0.8] : [-1, -0.15]),
    marks: ctx => {
      softEllipse(ctx, 122, -188, 56, 30, C.tan, 0, 0.45);
      softEllipse(ctx, 160, -206, 29, 19, C.tan, 0.1, 0.4);
      softEllipse(ctx, 126, -182, 50, 24, C.white, 0, 0.35);
      softEllipse(ctx, 164, -200, 25, 14, C.white, 0.1, 0.4);
      softEllipse(ctx, 106, -206, 11, 8, C.tan, 0, 0.5);
      softEllipse(ctx, 116, -241, 7.5, 5.5, C.tanLight, -0.2, 0.3);  // 麻呂眉
      softEllipse(ctx, 146, -239, 6.5, 5, C.tanLight, 0.2, 0.3);
    },
    post: ctx => {   // 口元
      ctx.strokeStyle = 'rgba(40,26,22,.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(183, -199); ctx.quadraticCurveTo(178, -190, 168, -191); ctx.quadraticCurveTo(162, -192, 158, -196); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(183, -203); ctx.lineTo(183, -198); ctx.stroke();
    },
  };
}

function ear(name: string, a: [number, number], b: [number, number], tip: [number, number], dark = 0): PartSpec {
  const p = new Path2D();
  const mid = (u: [number, number], v: [number, number], t: number): [number, number] => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
  const [m1, m2] = [mid(a, tip, 0.85), mid(b, tip, 0.85)];
  p.moveTo(...a); p.lineTo(...m1); p.quadraticCurveTo(tip[0], tip[1], m2[0], m2[1]); p.lineTo(...b); p.closePath();
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  const xs = [a[0], b[0], tip[0]], ys = [a[1], b[1], tip[1]];
  return {
    name, shape: p, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], base: C.black, len: 3.5, density: 18, seed: name.length * 7, dark,
    flow: (x, y) => [x - cx, y - cy - 30],
    marks: ctx => {
      const q = new Path2D();
      const i1 = mid(a, b, 0.22), i2 = mid(a, b, 0.78), it = mid([cx, cy], tip, 0.8);
      q.moveTo(...mid(i1, it, 0)); q.lineTo(...it); q.lineTo(...i2); q.closePath();
      ctx.fillStyle = C.cream; ctx.fill(q);
    },
  };
}

function tail(): PartSpec {
  const p = new Path2D();
  ellipse(p, -70, -180, 37, 31, -0.2);
  capsule(p, [[-96, -150], [-92, -172]], [17, 20]);
  const cx = -68, cy = -178;
  return {
    name: 'tail', shape: p, box: [-114, -214, -30, -134], base: C.black, len: 12, density: 11, seed: 21,
    flow: (x, y) => [-(y - cy), x - cx],     // 渦巻き
    marks: ctx => {
      softEllipse(ctx, -64, -176, 22, 15, C.tan, -0.25, 0.5);
      softEllipse(ctx, -62, -175, 15, 9, C.cream, -0.25, 0.5);
    },
  };
}

/** SVGパス文字列を (dx, dy) だけずらした Path2D */
function shifted(d: string, dx: number, dy: number): Path2D {
  let i = 0;
  return new Path2D(d.replace(/-?\d+(\.\d+)?/g, m => String(+m + (i++ % 2 === 0 ? dx : dy))));
}
const FRONT_LOWER = 'M 67,-70 C 66,-44 68,-26 69,-14 C 69,-5 74,0 86,0 L 100,0 C 109,0 109,-10 101,-14 C 96,-17 94,-26 94,-42 C 94,-56 95,-64 93,-72 Z';
const HIND_LOWER = 'M -54,-88 C -55,-62 -68,-46 -72,-28 L -62,-16 C -54,-10 -55,0 -68,0 L -88,0 C -97,0 -99,-8 -95,-16 C -101,-34 -105,-58 -97,-74 C -91,-86 -74,-94 -54,-88 Z';

/** しょんぼりのときの垂れた尾（巻きがほどけて下がる） */
function tailDown(): PartSpec {
  const p = new Path2D('M -92,-160 C -112,-160 -128,-140 -134,-112 C -138,-94 -134,-80 -126,-74 C -120,-70 -114,-78 -114,-92 C -113,-112 -104,-130 -90,-138 Z');
  return {
    name: 'tail-down', shape: p, box: [-140, -164, -86, -70], base: C.black, len: 11, density: 12, seed: 22,
    flow: () => [-0.35, 1],
    marks: ctx => softEllipse(ctx, -112, -100, 7, 26, C.tan, 0.35, 0.6),
  };
}

type Leg = { upper: PartSpec; lower: PartSpec; hip: [number, number]; knee: [number, number] };

function frontLeg(side: 'near' | 'far', dx: number, dy: number, dark: number): Leg {
  const T = (x: number, y: number): [number, number] => [x + dx, y + dy];
  const u = new Path2D(); capsule(u, [T(78, -116), T(80, -64)], [25, 17]);
  const l = shifted(FRONT_LOWER, dx, dy);
  return {
    hip: T(78, -116), knee: T(80, -64),
    upper: {
      name: `fu-${side}`, shape: u, box: [T(52, 0)[0], T(0, -142)[1], T(106, 0)[0], T(0, -46)[1]], base: C.black, len: 9, density: 11, seed: 31, dark,
      flow: down, marks: ctx => softEllipse(ctx, ...T(80, -66), 20, 14, C.tan, 0, 0.5),
    },
    lower: {
      name: `fl-${side}`, shape: l, box: [T(64, 0)[0], T(0, -80)[1], T(107, 0)[0], T(0, 1)[1]], base: C.tan, len: 3.5, density: 20, seed: 32, dark,
      flow: down,
      marks: ctx => { softEllipse(ctx, ...T(71, -36), 6, 26, C.cream, 0, 0.7); softEllipse(ctx, ...T(90, -5), 19, 10, C.white, 0, 0.4); },
    },
  };
}

function hindLeg(side: 'near' | 'far', dx: number, dy: number, dark: number): Leg {
  const T = (x: number, y: number): [number, number] => [x + dx, y + dy];
  const u = new Path2D(); ellipse(u, ...T(-78, -106), 36, 46, 0.15);
  const l = shifted(HIND_LOWER, dx, dy);
  return {
    hip: T(-78, -126), knee: T(-66, -74),
    upper: {
      name: `hu-${side}`, shape: u, box: [T(-116, 0)[0], T(0, -154)[1], T(-40, 0)[0], T(0, -58)[1]], base: C.black, len: 11, density: 10, seed: 41, dark,
      flow: (x, y) => [-0.4, 1], marks: ctx => softEllipse(ctx, ...T(-106, -92), 12, 28, C.tan, 0.2, 0.6),
    },
    lower: {
      name: `hl-${side}`, shape: l, box: [T(-110, 0)[0], T(0, -96)[1], T(-50, 0)[0], T(0, 1)[1]], base: C.tan, len: 3.5, density: 20, seed: 42, dark,
      flow: down,
      marks: ctx => {
        softEllipse(ctx, ...T(-70, -76), 22, 18, C.black, 0, 0.6);
        softEllipse(ctx, ...T(-93, -40), 5, 16, C.cream, 0.4, 0.7);
        softEllipse(ctx, ...T(-78, -5), 20, 10, C.white, 0, 0.4);
      },
    },
  };
}

export function buildParts() {
  return {
    torso: torso(), neck: neck(), head: head(), tail: tail(), tailDown: tailDown(),
    earNear: ear('ear-near', [84, -238], [116, -254], [88, -294], 0.12),
    earFar: ear('ear-far', [132, -255], [160, -240], [158, -292], 0.28),
    frontNear: frontLeg('near', 0, 0, 0), frontFar: frontLeg('far', 20, -4, 0.45),
    hindNear: hindLeg('near', 0, 0, 0), hindFar: hindLeg('far', 22, -4, 0.45),
  };
}

/** 各パーツの回転の支点（設計座標） */
export const PIVOT = {
  body: [0, -120] as [number, number],
  neck: [62, -150] as [number, number],
  head: [100, -190] as [number, number],
  earNear: [100, -246] as [number, number],
  earFar: [146, -247] as [number, number],
  tail: [-94, -152] as [number, number],
  eyeNear: [122, -224] as [number, number],
  eyeFar: [150, -221] as [number, number],
  nose: [184, -208] as [number, number],
  tongue: [168, -190] as [number, number],
};
