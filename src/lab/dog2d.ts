/** 2Dボーン方式の黒柴（PixiJS v8）。パーツは fur-painter で実行時に生成する。 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { paintPart, type PartSpec } from './fur-painter';
import { buildParts, PIVOT } from './dog2d-parts';

export type DogState = 'idle' | 'petted' | 'eat' | 'sleep' | 'sad';
type P = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;

/** 姿勢パラメータ（すべてばねで目標値へ近づく） */
const KEYS = ['bodyY', 'bodyRot', 'breathAmp', 'breathRate', 'neckRot', 'headRot', 'lookAmp', 'munch', 'earRot', 'earFlat',
  'tailRot', 'tailScale', 'tailDroop', 'wagAmp', 'wagRate', 'wiggle', 'eyeOpen', 'happy', 'tongue',
  'fuRot', 'flRot', 'huRot', 'hlRot'] as const;
type Key = typeof KEYS[number];
type Params = Record<Key, number>;

const BASE: Params = {
  bodyY: 0, bodyRot: 0, breathAmp: 1, breathRate: 0.45, neckRot: 0, headRot: 0, lookAmp: 1, munch: 0, earRot: 0, earFlat: 1,
  tailRot: 0, tailScale: 1, tailDroop: 0, wagAmp: 5, wagRate: 1.1, wiggle: 0, eyeOpen: 1, happy: 0, tongue: 0,
  fuRot: 0, flRot: 0, huRot: 0, hlRot: 0,
};
export const TARGETS: Record<DogState, Partial<Params>> = {
  idle: {},
  petted: { neckRot: -10, headRot: -12, lookAmp: 0.3, earRot: -28, earFlat: 0.9, wagAmp: 16, wagRate: 4.2, wiggle: 2.2, happy: 1, tongue: 1, breathRate: 0.9 },
  eat: { neckRot: 38, headRot: 30, lookAmp: 0, munch: 1, earRot: -14, wagAmp: 8, wagRate: 1.6, eyeOpen: 0.7, fuRot: -6, flRot: 4 },
  sleep: { bodyY: 60, bodyRot: 1.5, breathAmp: 1.6, breathRate: 0.28, neckRot: 30, headRot: 12, lookAmp: 0, earRot: -22, earFlat: 0.92,
    tailRot: 4, wagAmp: 0, eyeOpen: 0, fuRot: -32, flRot: -58, huRot: -12, hlRot: -72 },
  sad: { bodyY: 3, breathAmp: 1.3, breathRate: 0.3, neckRot: 16, headRot: 12, lookAmp: 0.2, earRot: -52, earFlat: 0.82,
    tailRot: 0, tailDroop: 1, wagAmp: 1.2, wagRate: 0.5, eyeOpen: 0.62 },
};

function partSprite(spec: PartSpec, scale: number, pivot: P): Sprite {
  const p = paintPart(spec, scale);
  const s = new Sprite(Texture.from(p.canvas));
  s.scale.set(1 / scale);
  s.position.set(p.x0 - pivot[0], p.y0 - pivot[1]);
  return s;
}
function joint(parent: Container, at: P, parentAt: P): Container {
  const c = new Container();
  c.position.set(at[0] - parentAt[0], at[1] - parentAt[1]);
  parent.addChild(c);
  return c;
}

class Eye {
  root = new Container();
  open = new Graphics(); closed = new Graphics(); happy = new Graphics();
  constructor(parent: Container, at: P, parentAt: P, narrow: number) {
    this.root.position.set(at[0] - parentAt[0], at[1] - parentAt[1]);
    this.root.scale.x = narrow;
    this.open.ellipse(0, 0, 6.6, 6).fill(0x2b170c).ellipse(0.6, 0.3, 4.6, 4.8).fill(0x0c0706)
      .circle(-1.8, -2.1, 1.9).fill({ color: 0xffffff, alpha: 0.95 }).circle(2, 1.8, 0.9).fill({ color: 0xffffff, alpha: 0.5 });
    this.closed.moveTo(-6.5, -0.5).quadraticCurveTo(0, 3.2, 6.5, -0.5).stroke({ width: 2, color: 0x120c0a, cap: 'round' });
    this.happy.moveTo(-6.5, 2).quadraticCurveTo(0, -5, 6.5, 2).stroke({ width: 2.2, color: 0x120c0a, cap: 'round' });
    this.root.addChild(this.open, this.closed, this.happy);
    parent.addChild(this.root);
  }
  set(open: number, happy: number) {
    this.open.scale.y = Math.max(0.05, open);
    this.open.alpha = (1 - happy) * (open > 0.12 ? 1 : 0);
    this.closed.alpha = (1 - happy) * (open <= 0.12 ? 1 : 0);
    this.happy.alpha = happy;
  }
}

export class Dog2D {
  readonly view = new Container();
  state: DogState = 'idle';
  private p: Params = { ...BASE };
  private v: Params = Object.fromEntries(KEYS.map(k => [k, 0])) as Params;
  private t = 0;
  private blinkT = 2;
  private blinkUntil = -1;
  private n!: Record<string, Container>;
  private eyes!: Eye[];
  private tongue!: Graphics;
  private torsoWrap!: Container;
  private tailCurl!: Sprite;
  private tailDown!: Sprite;
  /** テクスチャの合計ピクセル数（メモリ見積もり用） */
  texturePixels = 0;

  constructor(scale: number) {
    const parts = buildParts();
    const B = PIVOT.body;
    const body = joint(this.view, B, [0, 0]);
    const sprite = (parent: Container, spec: PartSpec, pivot: P) => {
      const s = partSprite(spec, scale, pivot);
      this.texturePixels += s.texture.width * s.texture.height;
      parent.addChild(s);
      return s;
    };
    // 下の段（膝から先）を先に置き、上の段の毛が膝に重なるようにする
    const leg = (L: ReturnType<typeof buildParts>['frontNear']) => {
      const hip = joint(body, L.hip, B);
      const knee = joint(hip, L.knee, L.hip);
      sprite(knee, L.lower, L.knee);
      sprite(hip, L.upper, L.hip);
      return { hip, knee };
    };
    const hf = leg(parts.hindFar), ff = leg(parts.frontFar), fn = leg(parts.frontNear);   // 前脚は胴の後ろ
    this.torsoWrap = joint(body, [0, -74], B);          // 呼吸は腹側を支点に伸縮
    sprite(this.torsoWrap, parts.torso, [0, -74]);
    const tailDown = joint(body, PIVOT.tail, B);
    this.tailDown = sprite(tailDown, parts.tailDown, PIVOT.tail);
    const tail = joint(body, PIVOT.tail, B);
    this.tailCurl = sprite(tail, parts.tail, PIVOT.tail);
    const neck = joint(body, PIVOT.neck, B);
    sprite(neck, parts.neck, PIVOT.neck);
    const head = joint(neck, PIVOT.head, PIVOT.neck);
    const earFar = joint(head, PIVOT.earFar, PIVOT.head); sprite(earFar, parts.earFar, PIVOT.earFar);
    const earNear = joint(head, PIVOT.earNear, PIVOT.head); sprite(earNear, parts.earNear, PIVOT.earNear);
    sprite(head, parts.head, PIVOT.head);
    this.tongue = new Graphics().ellipse(0, 6, 6.5, 9).fill(0xd4626a).moveTo(0, 1).lineTo(0, 11).stroke({ width: 1, color: 0xa8444c });
    this.tongue.position.set(PIVOT.tongue[0] - PIVOT.head[0], PIVOT.tongue[1] - PIVOT.head[1]);
    head.addChildAt(this.tongue, head.children.length - 1);
    this.eyes = [new Eye(head, PIVOT.eyeNear, PIVOT.head, 1), new Eye(head, PIVOT.eyeFar, PIVOT.head, 0.8)];
    const nose = new Graphics().ellipse(0, 0, 9, 7).fill(0x141112).ellipse(-2.5, -3, 3.2, 1.6).fill({ color: 0xffffff, alpha: 0.3 });
    nose.position.set(PIVOT.nose[0] - PIVOT.head[0], PIVOT.nose[1] - PIVOT.head[1]);
    head.addChild(nose);
    const hn = leg(parts.hindNear);
    this.n = { body, tail, tailDown, neck, head, earFar, earNear, hfHip: hf.hip, hfKnee: hf.knee, ffHip: ff.hip, ffKnee: ff.knee,
      hnHip: hn.hip, hnKnee: hn.knee, fnHip: fn.hip, fnKnee: fn.knee };
    this.update(0);
  }

  setState(s: DogState) { this.state = s; }

  /** すぐに目標の姿勢へ（初期表示用） */
  snap() {
    const tgt = { ...BASE, ...TARGETS[this.state] };
    for (const k of KEYS) { this.p[k] = tgt[k]; this.v[k] = 0; }
    this.update(0);
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const tgt = { ...BASE, ...TARGETS[this.state] };
    const w = 9;   // ばねの固有角振動数（臨界減衰）
    for (const k of KEYS) {
      const a = w * w * (tgt[k] - this.p[k]) - 2 * w * this.v[k];
      this.v[k] += a * dt; this.p[k] += this.v[k] * dt;
    }
    const p = this.p, n = this.n, t = this.t;
    const TAU = Math.PI * 2;
    const br = Math.sin(t * TAU * p.breathRate) * p.breathAmp;
    const wag = Math.sin(t * TAU * p.wagRate) * p.wagAmp;
    n.body!.position.y = PIVOT.body[1] + p.bodyY;
    n.body!.rotation = rad(p.bodyRot + p.wiggle * Math.sin(t * TAU * p.wagRate + 1));
    this.torsoWrap.scale.set(1 + br * 0.006, 1 + br * 0.016);
    n.neck!.rotation = rad(p.neckRot - br * 0.8);
    const look = Math.sin(t * 0.55) * 4 + Math.sin(t * 1.3) * 1.5;
    n.head!.rotation = rad(p.headRot + look * p.lookAmp + p.munch * 4 * Math.max(0, Math.sin(t * TAU * 2.4)));
    const twitch = Math.max(0, Math.sin(t * 0.9)) ** 30 * 12 * p.lookAmp;
    n.earNear!.rotation = rad(p.earRot - twitch); n.earFar!.rotation = rad(p.earRot * 0.8);
    n.earNear!.scale.y = n.earFar!.scale.y = p.earFlat;
    n.tail!.rotation = rad(p.tailRot + wag);
    n.tail!.scale.set(p.tailScale, p.tailScale * (1 + Math.abs(wag) * 0.004));
    // 巻き尾 ⇄ 垂れた尾（ほどける途中は巻き尾を後ろへ倒しながら入れ替える）
    const d = Math.max(0, Math.min(1, p.tailDroop));
    n.tail!.rotation += rad(-40 * d);
    this.tailCurl.alpha = 1 - d; this.tailDown.alpha = d;
    n.tailDown!.rotation = rad(wag * 0.6 + 25 * (1 - d));
    for (const [hip, knee, u, l] of [['ffHip', 'ffKnee', p.fuRot, p.flRot], ['fnHip', 'fnKnee', p.fuRot, p.flRot],
      ['hfHip', 'hfKnee', p.huRot, p.hlRot], ['hnHip', 'hnKnee', p.huRot, p.hlRot]] as const) {
      n[hip]!.rotation = rad(u); n[knee]!.rotation = rad(l);
    }
    // 瞬き（目が開いている状態のときだけ）
    if (t > this.blinkT) { this.blinkUntil = t + 0.14; this.blinkT = t + 2.5 + ((t * 9301) % 3.5); }
    const blink = t < this.blinkUntil && p.eyeOpen > 0.4 ? 0.08 : 1;
    for (const e of this.eyes) e.set(Math.max(0, Math.min(1, p.eyeOpen)) * blink, Math.max(0, Math.min(1, p.happy)));
    this.tongue.scale.y = Math.max(0.001, p.tongue);
    this.tongue.alpha = p.tongue > 0.05 ? 1 : 0;
  }
}
