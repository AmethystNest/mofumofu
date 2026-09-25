/**
 * 部屋とデコレーション。犬と同じ描画エンジン（painter）で描く。
 * 部屋の座標：左上が原点、幅 390 × 高さ 351、床の線は y=262。
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { blob, paint, rng, type PartSpec, type Pt } from '../shiba/painter';

export const RW = 390, RH = 351, FLOOR = 262;
/** 天井の明かりの位置（x） */
export const LIGHT_X = 215;

export type Slot = 'window' | 'wall' | 'light' | 'bed' | 'rug' | 'toy';
export const SLOTS: { id: Slot; name: string; items: { id: string; name: string }[] }[] = [
  { id: 'window', name: '窓辺', items: [{ id: 'none', name: 'なし' }, { id: 'curtain-linen', name: '生成りのカーテン' }, { id: 'curtain-blue', name: '青いカーテン' }, { id: 'plant', name: '鉢植え' }] },
  { id: 'wall', name: '壁', items: [{ id: 'none', name: 'なし' }, { id: 'poster', name: '古いポスター' }, { id: 'clock', name: '壁時計' }, { id: 'dried', name: 'ドライフラワー' }] },
  { id: 'light', name: '明かり', items: [{ id: 'bulb', name: '裸電球' }, { id: 'lantern', name: 'ランタン' }, { id: 'paper', name: '紙の灯り' }] },
  { id: 'bed', name: '寝床', items: [{ id: 'box', name: '段ボール箱' }, { id: 'cushion', name: 'クッション' }, { id: 'blanket', name: '毛布の寝床' }] },
  { id: 'rug', name: '床', items: [{ id: 'none', name: 'なし' }, { id: 'rug-round', name: '丸いラグ' }, { id: 'tatami', name: '古い畳マット' }] },
  { id: 'toy', name: 'おもちゃ', items: [{ id: 'none', name: 'なし' }, { id: 'ball', name: '古いボール' }, { id: 'plush', name: '魚のぬいぐるみ' }] },
];
export type Decor = Record<Slot, string>;
export const DEFAULT_DECOR: Decor = { window: 'none', wall: 'none', light: 'bulb', bed: 'box', rug: 'none', toy: 'none' };

const flat = (name: string, outline: Pt[], base: string, extra: Partial<PartSpec> = {}): PartSpec =>
  ({ name, outline, base, tuft: null, sharp: true, line: 1, lineDark: 0.5, shade: 0.7, radius: 4, ...extra });
const soft = (name: string, outline: Pt[], base: string, extra: Partial<PartSpec> = {}): PartSpec =>
  ({ name, outline, base, tuft: null, line: 1, lineDark: 0.5, shade: 0.8, radius: 9, ...extra });
const ellipsePts = (cx: number, cy: number, rx: number, ry: number, n = 14): Pt[] =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt; });
const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/* ---------------- 部屋そのもの ---------------- */
function wall(): PartSpec {
  return flat('wall', rect(0, 0, RW, FLOOR + 2), 'rgb(120,112,104)', {
    line: 0, shade: 0, volume: 0,
    marks: ctx => {
      const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
      g.addColorStop(0, 'rgb(92,86,82)'); g.addColorStop(1, 'rgb(132,122,112)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, RW, FLOOR + 2);
      // コンクリートの打ち継ぎ目と型枠の穴
      ctx.strokeStyle = 'rgba(40,34,30,.25)'; ctx.lineWidth = 1;
      for (const y of [88, 176]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(RW, y); ctx.stroke(); }
      for (const x of [130, 260]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FLOOR); ctx.stroke(); }
      ctx.fillStyle = 'rgba(40,34,30,.3)';
      for (const [x, y] of [[20, 20], [110, 20], [150, 108], [240, 108], [280, 196], [370, 196], [20, 196], [110, 196], [280, 20], [370, 20]] as Pt[]) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
      const r = rng(5);
      for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '255,250,240' : '30,26,24'},${0.04 + r() * 0.05})`; ctx.fillRect(r() * RW, r() * FLOOR, 1.2, 1.2); }
      // 壁の下の汚れ
      const s = ctx.createLinearGradient(0, FLOOR - 40, 0, FLOOR);
      s.addColorStop(0, 'rgba(40,30,24,0)'); s.addColorStop(1, 'rgba(40,30,24,.25)');
      ctx.fillStyle = s; ctx.fillRect(0, FLOOR - 40, RW, 42);
    },
  });
}
function floor(): PartSpec {
  return flat('floor', rect(0, FLOOR, RW, RH - FLOOR), 'rgb(120,86,58)', {
    line: 0, shade: 0, volume: 0,
    marks: ctx => {
      const r = rng(9);
      for (let y = FLOOR, row = 0; y < RH; y += 17, row++) {
        let x = -r() * 80;
        while (x < RW) {
          const w = 70 + r() * 70;
          const c = 108 + r() * 26;
          ctx.fillStyle = `rgb(${c | 0},${(c * 0.72) | 0},${(c * 0.48) | 0})`;
          ctx.fillRect(x, y, w, 17);
          ctx.strokeStyle = 'rgba(40,24,14,.45)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, 17);
          ctx.strokeStyle = 'rgba(60,36,20,.18)';
          for (let k = 0; k < 3; k++) { const yy = y + 3 + r() * 11; ctx.beginPath(); ctx.moveTo(x + 4, yy); ctx.bezierCurveTo(x + w * 0.3, yy + 2, x + w * 0.6, yy - 2, x + w - 4, yy); ctx.stroke(); }
          x += w;
        }
      }
      const g = ctx.createLinearGradient(0, FLOOR, 0, RH);
      g.addColorStop(0, 'rgba(20,12,8,.35)'); g.addColorStop(0.3, 'rgba(20,12,8,0)');
      ctx.fillStyle = g; ctx.fillRect(0, FLOOR, RW, RH - FLOOR);
      ctx.fillStyle = 'rgb(70,58,50)'; ctx.fillRect(0, FLOOR - 2, RW, 5);   // 巾木
    },
  });
}
function windowFrame(): PartSpec[] {
  const [x, y, w, h] = [26, 34, 150, 128];
  return [
    flat('windowGlass', rect(x, y, w, h), 'rgb(150,170,180)', {
      line: 0, shade: 0, volume: 0,
      marks: ctx => {
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, 'rgb(122,146,162)'); g.addColorStop(1, 'rgb(206,200,186)');
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        // 管理都市の街並み
        ctx.fillStyle = 'rgb(88,104,116)';
        for (const [bx, bh, bw] of [[26, 40, 20], [44, 58, 16], [58, 34, 24], [80, 96, 12], [90, 50, 22], [110, 70, 16], [124, 44, 28], [150, 62, 18], [166, 38, 12]] as Pt3[]) ctx.fillRect(bx, y + h - bh, bw, bh);
        ctx.fillRect(84, y + h - 106, 4, 12);                                    // 管理塔のアンテナ
        ctx.fillStyle = 'rgba(127,200,194,.9)';
        for (const [wx, wy] of [[48, 88], [62, 120], [94, 110], [114, 100], [130, 128], [84, 70]] as Pt[]) ctx.fillRect(wx, wy + 10, 3, 3);
        ctx.fillStyle = 'rgb(224,86,75)'; ctx.beginPath(); ctx.arc(86, y + h - 108, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + 50, y); ctx.lineTo(x + 10, y + 60); ctx.fill();
      },
    }),
    flat('windowFrame', [[x - 6, y - 6], [x + w + 6, y - 6], [x + w + 6, y + h + 6], [x - 6, y + h + 6], [x - 6, y - 6], [x, y], [x, y + h], [x + w, y + h], [x + w, y], [x, y]],
      'rgb(64,56,50)', { line: 1.4 }),
    flat('windowBar', rect(x + w / 2 - 2.5, y, 5, h), 'rgb(64,56,50)', { line: 1.2 }),
    flat('windowSill', rect(x - 12, y + h + 5, w + 24, 9), 'rgb(92,80,70)', { line: 1.6 }),
  ];
}
type Pt3 = [number, number, number];

/* ---------------- デコ ---------------- */
function curtain(color: string, deep: string): PartSpec[] {
  const drape = (name: string, x0: number, dir: 1 | -1): PartSpec => soft(name,
    [[x0, 22], [x0 + dir * 34, 22], [x0 + dir * 26, 90], [x0 + dir * 34, 176], [x0, 178]], color, {
      marks: ctx => {
        for (let i = 0; i < 4; i++) {
          const xx = x0 + dir * (5 + i * 8);
          const g = ctx.createLinearGradient(xx - 4, 0, xx + 4, 0);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, deep); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(xx - 4, 22, 8, 160);
        }
      },
    });
  return [drape('curtainL', 14, 1), drape('curtainR', 188, -1), flat('curtainRod', rect(8, 18, 186, 5), 'rgb(80,68,58)', { line: 1.2 })];
}
function plant(): PartSpec[] {
  const leaves: PartSpec[] = [];
  const r = rng(3);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.38, L = 22 + r() * 10;
    const cx = 150 + Math.cos(a) * L * 0.6, cy = 150 + Math.sin(a) * L * 0.6;
    leaves.push(soft(`leaf${i}`, ellipsePts(cx, cy, L * 0.5, 7, 10).map(([px, py]) => {
      const dx = px - cx, dy = py - cy; return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)] as Pt;
    }), i % 2 ? 'rgb(96,140,84)' : 'rgb(118,160,96)', { line: 1.4 }));
  }
  return [...leaves, flat('pot', [[136, 150], [164, 150], [160, 172], [140, 172]], 'rgb(186,104,70)', { line: 1.6 })];
}
function poster(): PartSpec[] {
  return [flat('poster', [[258, 44], [338, 40], [342, 142], [260, 146]], 'rgb(232,220,196)', {
    marks: ctx => {
      ctx.fillStyle = 'rgb(214,120,90)'; ctx.beginPath(); ctx.arc(300, 76, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(96,124,132)'; ctx.beginPath(); ctx.moveTo(264, 124); ctx.lineTo(292, 88); ctx.lineTo(312, 110); ctx.lineTo(324, 96); ctx.lineTo(340, 124); ctx.fill();
      ctx.fillStyle = 'rgba(60,50,40,.6)'; ctx.fillRect(272, 130, 56, 3); ctx.fillRect(280, 136, 40, 2);
      ctx.fillStyle = 'rgba(200,190,170,.5)'; for (const [x, y] of [[258, 40], [334, 36], [256, 138], [336, 138]] as Pt[]) ctx.fillRect(x, y, 10, 8);
    },
  })];
}
function clock(): PartSpec[] {
  return [soft('clock', ellipsePts(300, 92, 30, 30, 16), 'rgb(240,232,214)', {
    line: 2.2, lineDark: 0.7,
    post: ctx => {
      ctx.strokeStyle = 'rgba(40,30,26,.9)'; ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.lineWidth = i % 3 ? 1 : 2; ctx.beginPath(); ctx.moveTo(300 + Math.cos(a) * 22, 92 + Math.sin(a) * 22); ctx.lineTo(300 + Math.cos(a) * 26, 92 + Math.sin(a) * 26); ctx.stroke(); }
      ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(300, 92); ctx.lineTo(300, 76); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(300, 92); ctx.lineTo(314, 98); ctx.stroke();
    },
  })];
}
function dried(): PartSpec[] {
  const parts: PartSpec[] = [];
  const r = rng(7);
  for (let i = 0; i < 9; i++) {
    const x = 284 + (i - 4) * 6 + r() * 4, y = 108 + r() * 18;
    parts.push(soft(`bud${i}`, ellipsePts(x, y, 6, 5, 8), ['rgb(214,160,120)', 'rgb(190,120,140)', 'rgb(232,210,160)'][i % 3]!, { line: 1.2 }));
  }
  return [flat('stems', [[282, 70], [290, 70], [304, 120], [268, 120]], 'rgb(140,120,80)', { line: 1.2 }), ...parts,
    flat('twine', rect(278, 72, 18, 6), 'rgb(200,176,130)', { line: 1.2 })];
}
function light(id: string): PartSpec[] {
  const cord = flat('cord', rect(214, 0, 2, id === 'lantern' ? 30 : 44), 'rgb(40,36,34)', { line: 0 });
  if (id === 'bulb') return [cord, flat('socket', rect(209, 44, 12, 10), 'rgb(60,54,50)', { line: 1.2 }), soft('bulb', ellipsePts(215, 64, 9, 11, 12), 'rgb(255,226,160)', { line: 1.4, shade: 0 })];
  if (id === 'lantern') return [cord, flat('lanternTop', [[204, 30], [226, 30], [230, 38], [200, 38]], 'rgb(70,62,56)', { line: 1.4 }),
    flat('lanternGlass', rect(202, 38, 26, 32), 'rgb(255,214,140)', { line: 1.6, shade: 0, marks: ctx => { ctx.fillStyle = 'rgba(60,50,40,.6)'; ctx.fillRect(213, 38, 4, 32); } }),
    flat('lanternBase', [[200, 70], [230, 70], [226, 76], [204, 76]], 'rgb(70,62,56)', { line: 1.4 })];
  return [cord, soft('paperShade', ellipsePts(215, 66, 22, 20, 14), 'rgb(250,236,210)', { line: 1.6, shade: 0,
    marks: ctx => { ctx.strokeStyle = 'rgba(160,130,100,.4)'; ctx.lineWidth = 1; for (let y = 52; y < 86; y += 6) { ctx.beginPath(); ctx.moveTo(190, y); ctx.lineTo(240, y); ctx.stroke(); } } })];
}
export const LIGHT_COLOR: Record<string, [number, number]> = { bulb: [0xffd08a, 0.34], lantern: [0xffb45e, 0.38], paper: [0xfff0d0, 0.3] };

function bed(id: string): PartSpec[] {
  if (id === 'box') return [
    flat('boxBack', [[18, 252], [110, 252], [116, 236], [24, 236]], 'rgb(170,128,84)', { line: 1.6 }),
    flat('boxFront', rect(14, 252, 102, 48), 'rgb(196,150,100)', { line: 1.8, marks: ctx => {
      ctx.strokeStyle = 'rgba(90,60,30,.5)'; ctx.lineWidth = 1; ctx.strokeRect(40, 262, 50, 14);
      ctx.fillStyle = 'rgba(90,60,30,.45)'; ctx.font = '8px sans-serif'; ctx.fillText('配給 1', 50, 272);
    } }),
    soft('boxTowel', [[20, 250], [60, 242], [108, 248], [104, 258], [24, 258]], 'rgb(214,206,190)', { line: 1.4 }),
  ];
  if (id === 'cushion') return [soft('cushion', ellipsePts(66, 280, 58, 22, 18), 'rgb(176,74,64)', { marks: ctx => {
    ctx.strokeStyle = 'rgba(255,230,210,.35)'; ctx.lineWidth = 2;
    for (let x = 12; x < 124; x += 12) { ctx.beginPath(); ctx.moveTo(x, 256); ctx.lineTo(x, 304); ctx.stroke(); }
    for (let y = 262; y < 304; y += 12) { ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(126, y); ctx.stroke(); }
    blob(ctx, 60, 272, 38, 10, 'rgb(210,110,96)', 0, 0.8);
  } })];
  return [soft('blanketNest', [[10, 288], [24, 262], [66, 254], [112, 262], [124, 290], [96, 306], [36, 306]], 'rgb(110,126,138)', { line: 1.8, marks: ctx => {
    ctx.strokeStyle = 'rgba(40,50,60,.35)'; ctx.lineWidth = 2;
    for (const [a, b, c, d] of [[20, 272, 60, 290], [60, 262, 90, 296], [96, 268, 116, 292]] as [number, number, number, number][]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo((a + c) / 2 + 10, (b + d) / 2, c, d); ctx.stroke(); }
    blob(ctx, 66, 286, 34, 9, 'rgb(84,98,110)', 0, 0.8);
  } })];
}
function rug(id: string): PartSpec[] {
  if (id === 'rug-round') return [soft('rug', ellipsePts(222, 312, 118, 26, 20), 'rgb(196,168,120)', { line: 1.4, shade: 0.3, marks: ctx => {
    for (const [ry, c] of [[20, 'rgb(170,96,72)'], [14, 'rgb(214,190,146)'], [8, 'rgb(96,120,120)']] as [number, string][]) blob(ctx, 222, 312, ry * 5.2, ry * 1.1, c, 0, 0.1);
  } })];
  return [flat('tatami', [[120, 290], [336, 290], [352, 338], [104, 338]], 'rgb(184,178,120)', { line: 1.6, shade: 0.3, marks: ctx => {
    ctx.strokeStyle = 'rgba(120,110,60,.35)'; ctx.lineWidth = 1;
    for (let y = 293; y < 338; y += 3) { ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(356, y); ctx.stroke(); }
    ctx.fillStyle = 'rgb(60,70,56)'; ctx.fillRect(100, 290, 256, 5); ctx.fillRect(100, 334, 256, 5);
  } })];
}
function toy(id: string): PartSpec[] {
  if (id === 'ball') return [soft('ball', ellipsePts(346, 300, 13, 13, 12), 'rgb(166,76,60)', { post: ctx => {
    ctx.strokeStyle = 'rgba(230,214,180,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(334, 296); ctx.quadraticCurveTo(346, 306, 358, 296); ctx.stroke();
  } })];
  return [soft('plushBody', [[322, 300], [340, 288], [362, 292], [368, 304], [350, 314], [330, 312]], 'rgb(120,170,190)', { line: 1.8 }),
    soft('plushTail', [[318, 302], [306, 290], [308, 314]], 'rgb(100,150,172)', { line: 1.6 }),
    soft('plushEye', ellipsePts(356, 298, 2.4, 2.4, 8), 'rgb(30,26,24)', { line: 0, shade: 0 })];
}

export function decorParts(slot: Slot, id: string): PartSpec[] {
  if (id === 'none') return [];
  switch (slot) {
    case 'window': return id === 'plant' ? plant() : id === 'curtain-blue' ? curtain('rgb(92,120,150)', 'rgba(40,60,90,.45)') : curtain('rgb(226,214,190)', 'rgba(150,130,100,.35)');
    case 'wall': return id === 'poster' ? poster() : id === 'clock' ? clock() : dried();
    case 'light': return light(id);
    case 'bed': return bed(id);
    case 'rug': return rug(id);
    case 'toy': return toy(id);
  }
}

export class Room {
  /** 犬より奥 */ readonly back = new Container();
  /** 犬より手前（おもちゃなど） */ readonly front = new Container();
  private layers: Record<Slot, Container>;
  private cache = new Map<string, Sprite>();
  lightColor: [number, number] = LIGHT_COLOR.bulb!;
  constructor(private scale: number, decor: Decor = DEFAULT_DECOR) {
    for (const spec of [wall(), floor(), ...windowFrame()]) this.back.addChild(this.sprite(spec));
    const L = (parent: Container) => { const c = new Container(); parent.addChild(c); return c; };
    this.layers = { window: L(this.back), wall: L(this.back), light: L(this.back), rug: L(this.back), bed: L(this.back), toy: L(this.front) };
    this.setDecor(decor);
  }
  private sprite(spec: PartSpec): Sprite {
    let s = this.cache.get(spec.name);
    if (!s) {
      const p = paint(spec, this.scale);
      s = new Sprite(Texture.from(p.canvas));
      s.scale.set(1 / this.scale); s.position.set(p.x0, p.y0);
      this.cache.set(spec.name, s);
    }
    return s;
  }
  setDecor(d: Decor) {
    for (const slot of Object.keys(this.layers) as Slot[]) {
      const layer = this.layers[slot];
      layer.removeChildren();
      for (const spec of decorParts(slot, d[slot])) layer.addChild(this.sprite({ ...spec, name: `${slot}:${d[slot]}:${spec.name}` }));
    }
    this.lightColor = LIGHT_COLOR[d.light] ?? LIGHT_COLOR.bulb!;
  }
}
