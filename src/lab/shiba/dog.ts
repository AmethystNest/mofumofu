/** 2D黒柴（ちびキャラ）の骨組み・表情・成長・着せ替え。PixiJS v8 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { paint, type PartSpec, type Pt } from './painter';
import * as P from './parts';

export type DogState = 'idle' | 'petted' | 'eat' | 'sleep' | 'sad';
export interface Outfit { neck: string; head: string }
const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 子犬(0)・若犬(0.5)・成犬(1) の3点を滑らかにつなぐ */
const grow = (a: number, b: number, c: number, t: number) => (t < 0.5 ? a + (b - a) * (t / 0.5) : b + (c - b) * ((t - 0.5) / 0.5));

const KEYS = ['squash', 'legFold', 'breathAmp', 'breathRate', 'headX', 'headY', 'headRot', 'look', 'earRot', 'earFlat',
  'tailRot', 'droop', 'wagAmp', 'wagRate', 'bounce', 'eyeOpen', 'happy', 'sad', 'smile', 'frown', 'mouthOpen', 'tongue',
  'blush', 'munch', 'hindAlpha'] as const;
type Key = typeof KEYS[number];
type Params = Record<Key, number>;

const BASE: Params = {
  squash: 1, legFold: 0, breathAmp: 1, breathRate: 0.45, headX: 0, headY: 0, headRot: 0, look: 1, earRot: 0, earFlat: 1,
  tailRot: 0, droop: 0, wagAmp: 6, wagRate: 1.2, bounce: 0, eyeOpen: 1, happy: 0, sad: 0, smile: 1, frown: 0, mouthOpen: 0,
  tongue: 0, blush: 0, munch: 0, hindAlpha: 1,
};
export const TARGETS: Record<DogState, Partial<Params>> = {
  idle: {},
  petted: { happy: 1, smile: 0, mouthOpen: 1, tongue: 1, blush: 1, headRot: -9, look: 0.2, earRot: 14, earFlat: 0.9, wagAmp: 16, wagRate: 4, bounce: 1, breathRate: 1.2 },
  eat: { headY: 58, headX: -12, headRot: 10, look: 0, happy: 0.85, smile: 0, munch: 1, blush: 0.35, wagAmp: 9, wagRate: 1.8, earRot: 6 },
  sleep: { squash: 0.66, legFold: 1, headY: 40, headX: -6, headRot: -7, look: 0, eyeOpen: 0, smile: 0.6, earRot: 18, earFlat: 0.92,
    tailRot: 24, wagAmp: 0, breathAmp: 1.8, breathRate: 0.26, hindAlpha: 0 },
  sad: { headY: 18, headRot: 7, look: 0.25, sad: 1, eyeOpen: 0.86, smile: 0, frown: 1, earRot: 34, earFlat: 0.8, droop: 1, wagAmp: 0.8, wagRate: 0.5,
    breathRate: 0.3, squash: 0.97 },
};

function node(parent: Container, at: Pt, parentAt: Pt): Container {
  const c = new Container();
  c.position.set(at[0] - parentAt[0], at[1] - parentAt[1]);
  parent.addChild(c);
  return c;
}

class Eye {
  root = new Container();
  private ball = new Container();
  private lid = new Graphics();
  private closed = new Graphics();
  private happyArc = new Graphics();
  private rim = new Graphics();
  constructor(parent: Container, at: Pt, parentAt: Pt, private side: -1 | 1) {
    this.root.position.set(at[0] - parentAt[0], at[1] - parentAt[1]);
    const rx = 12.5, ry = 13.5;
    // 黒い毛の上でも目が沈まないよう、淡い縁取りを外側に置く
    this.rim.ellipse(0, 0.3, rx + 2.6, ry + 2.6).stroke({ width: 1.6, color: 0x8a817c, alpha: 0.55 });
    this.root.addChild(this.rim);
    const g = new Graphics()
      .ellipse(0, 0, rx + 1.2, ry + 1.2).fill(0x1a0f09)
      .ellipse(0, 0.5, rx, ry).fill(0x3a2114)
      .ellipse(0, 1.2, rx * 0.84, ry * 0.84).fill(0x140905)
      .ellipse(0, 6, rx * 0.6, ry * 0.3).fill({ color: 0x6a4028, alpha: 0.45 })
      .circle(3.8 * side - 0.5, -4.6, 4.2).fill({ color: 0xffffff, alpha: 0.96 })
      .circle(-4 * side + 0.5, 4.2, 1.8).fill({ color: 0xffffff, alpha: 0.8 });
    const mask = new Graphics().ellipse(0, 0, rx + 1.5, ry + 1.5).fill(0xffffff);
    this.lid.rect(-16, -16, 32, 16).fill(0x000000);
    this.ball.addChild(g, this.lid, mask);
    this.ball.mask = mask;
    // 閉じた目・笑い目は黒い毛の上でも見えるよう、白っぽい縁取りを下に敷く
    this.closed.moveTo(-10, -1).quadraticCurveTo(0, 6, 10, -1).stroke({ width: 4.5, color: 0x6b6f7a, cap: 'round', alpha: 0.5 })
      .moveTo(-10, -1).quadraticCurveTo(0, 6, 10, -1).stroke({ width: 2.4, color: 0x050303, cap: 'round' });
    this.happyArc.moveTo(-10, 4).quadraticCurveTo(0, -8, 10, 4).stroke({ width: 5, color: 0x6b6f7a, cap: 'round', alpha: 0.5 })
      .moveTo(-10, 4).quadraticCurveTo(0, -8, 10, 4).stroke({ width: 2.8, color: 0x050303, cap: 'round' });
    this.root.addChild(this.ball, this.closed, this.happyArc);
    parent.addChild(this.root);
  }
  set(open: number, happy: number, sad: number) {
    const shown = open > 0.1;
    this.ball.visible = shown && happy < 0.99;
    this.ball.alpha = 1 - happy;
    this.ball.scale.y = Math.max(0.1, open);
    this.rim.visible = this.ball.visible; this.rim.alpha = this.ball.alpha; this.rim.scale.y = this.ball.scale.y;
    this.lid.position.y = -16 + 16 * 0.55 * sad;
    this.lid.rotation = rad(16 * sad * this.side);
    this.closed.alpha = (1 - happy) * (shown ? 0 : 1);
    this.happyArc.alpha = happy;
  }
}

/** 犬の口：鼻の下の縦線から「人」の字に分かれる。開くと下あごが下がり、舌が垂れる */
class Mouth {
  g = new Graphics();
  private key = '';
  draw(open: number, tongue: number, smile: number, frown: number) {
    const k = [open, tongue, smile, frown].map(v => Math.round(v * 20)).join(',');
    if (k === this.key) return;
    this.key = k;
    const g = this.g.clear();
    const J = 13 * open;                               // 下あごの下がり
    const cy = 4 + 2.5 * frown - 2 * smile * (1 - open); // 口角の高さ
    const L: Pt = [-19, cy], Rr: Pt = [16, cy];
    const INK = 0x1c1210;
    if (open > 0.04) {
      // 口の中
      g.moveTo(L[0], L[1]).quadraticCurveTo(-10, 7 + J * 1.05, -1, 8 + J).quadraticCurveTo(8, 7 + J * 1.05, Rr[0], Rr[1])
        .quadraticCurveTo(7, 8, -1, 3).quadraticCurveTo(-9, 8, L[0], L[1]).fill(0x5c2220);
      // 下あご（白い毛）
      g.moveTo(-14, 7 + J).quadraticCurveTo(-1, 20 + J, 12, 7 + J).quadraticCurveTo(-1, 11 + J, -14, 7 + J).fill(0xf6e2c8)
        .moveTo(-14, 7 + J).quadraticCurveTo(-1, 20 + J, 12, 7 + J).stroke({ width: 1.6, color: INK, alpha: 0.7, cap: 'round' });
      // 垂れた舌
      if (tongue > 0.05) {
        const T = 6 + 12 * tongue;
        g.moveTo(-7, 5 + J * 0.5).lineTo(-7, 5 + J * 0.5 + T).quadraticCurveTo(-7, 11 + J * 0.5 + T, -1, 11 + J * 0.5 + T)
          .quadraticCurveTo(5, 11 + J * 0.5 + T, 5, 5 + J * 0.5 + T).lineTo(5, 5 + J * 0.5).fill(0xee8a92)
          .stroke({ width: 1.4, color: 0xa84a55, alpha: 0.8 })
          .moveTo(-1, 7 + J * 0.5).lineTo(-1, 3 + J * 0.5 + T).stroke({ width: 1.1, color: 0xc4636b });
      }
    } else {
      // 閉じた口の下のあご線
      g.moveTo(-10, 12).quadraticCurveTo(-1, 16, 8, 12).stroke({ width: 1.3, color: INK, alpha: 0.45, cap: 'round' });
    }
    // 鼻の下の縦線と「人」の字の口
    g.moveTo(-1, -4).lineTo(-1, 3)
      .moveTo(-1, 3).quadraticCurveTo(-9, 9 - 3 * frown, L[0], L[1])
      .moveTo(-1, 3).quadraticCurveTo(7, 9 - 3 * frown, Rr[0], Rr[1])
      .stroke({ width: 2.1, color: INK, cap: 'round', join: 'round' });
  }
}

export class ShibaDog {
  readonly view = new Container();
  state: DogState = 'idle';
  age = 0;
  texturePixels = 0;
  private p: Params = { ...BASE };
  private v = Object.fromEntries(KEYS.map(k => [k, 0])) as Params;
  private t = 0;
  private blinkT = 2.2;
  private blinkUntil = -1;
  private trunk: Container; private breath: Container; private headC: Container; private neckC: Container; private hatC: Container;
  private legs: Container[]; private legX: number[]; private hindC: Container;
  private earL: Container; private earR: Container; private tailC: Container; private tailDownC: Container;
  private eyes: Eye[]; private browL: Graphics; private browR: Graphics; private snout: Container;
  private mouth = new Mouth(); private blush: Graphics;
  private cache = new Map<string, Sprite>();

  constructor(private scale: number, outfit: Outfit = { neck: 'bandana-red', head: 'none' }) {
    const V = this.view;
    const add = (parent: Container, spec: PartSpec, pivot: Pt) => { const s = this.sprite(spec, pivot); parent.addChild(s); return s; };
    // 脚（接地点が支点。成長で上へ伸びる。胸の毛の下から出るので胴より先に置く）
    this.hindC = node(V, P.PIV.hind, [0, 0]); add(this.hindC, P.hind(), P.PIV.hind);
    const fl = node(V, P.PIV.frontL, [0, 0]); add(fl, P.frontL(), P.PIV.frontL);
    const fr = node(V, P.PIV.frontR, [0, 0]); add(fr, P.frontR(), P.PIV.frontR);
    this.legs = [this.hindC, fl, fr];
    this.legX = [P.PIV.hind[0], P.PIV.frontL[0], P.PIV.frontR[0]];
    // 胴（地面の中心を支点に拡大・伏せでつぶれる）
    this.trunk = node(V, [0, 0], [0, 0]);
    this.tailDownC = node(this.trunk, P.PIV.tail, [0, 0]); add(this.tailDownC, P.tailDown(), P.PIV.tail);
    this.tailC = node(this.trunk, P.PIV.tail, [0, 0]); add(this.tailC, P.tail(), P.PIV.tail);
    this.breath = node(this.trunk, [0, 0], [0, 0]); add(this.breath, P.body(), [0, 0]);
    // 首まわり（胴の大きさで、頭の動きに半分ついていく）
    this.neckC = node(V, P.PIV.neck, [0, 0]);
    // 頭
    const H = P.PIV.head;
    this.headC = node(V, H, [0, 0]);
    this.earL = node(this.headC, P.PIV.earL, H); add(this.earL, P.ear('L'), P.PIV.earL);
    this.earR = node(this.headC, P.PIV.earR, H); add(this.earR, P.ear('R'), P.PIV.earR);
    add(this.headC, P.head(), H);
    this.blush = new Graphics()
      .ellipse(P.PIV.cheekL[0] - H[0], P.PIV.cheekL[1] - H[1], 13, 7).fill({ color: 0xf08a8a, alpha: 0.55 })
      .ellipse(P.PIV.cheekR[0] - H[0], P.PIV.cheekR[1] - H[1], 13, 7).fill({ color: 0xf08a8a, alpha: 0.55 });
    this.headC.addChild(this.blush);
    // 鼻づら（マズル・口・鼻）。成長で前へ伸びる
    const S = P.PIV.snout;
    this.snout = node(this.headC, S, H);
    add(this.snout, P.muzzle(), S);
    this.mouth.g.scale.set(1.3);
    this.snout.addChild(this.mouth.g);
    const nose = new Graphics().ellipse(0, 0, 11, 7.5).fill(0x0b0808).ellipse(-3, -3, 4, 2).fill({ color: 0xffffff, alpha: 0.4 })
      .ellipse(-4.5, 1.5, 2.2, 1.6).fill(0x2a2020).ellipse(3.5, 1.5, 2.2, 1.6).fill(0x2a2020);
    nose.position.set(P.PIV.nose[0] - S[0], P.PIV.nose[1] - S[1]);
    this.snout.addChild(nose);
    this.eyes = [new Eye(this.headC, P.PIV.eyeL, H, -1), new Eye(this.headC, P.PIV.eyeR, H, 1)];
    const brow = (at: Pt, rot: number) => {
      const g = new Graphics().ellipse(0, 0, 10.5, 6.5).fill(0xe6ae70).ellipse(1, 1.5, 8, 4.2).fill({ color: 0xf6d2a2, alpha: 0.8 });
      g.position.set(at[0] - H[0], at[1] - H[1]); g.rotation = rot; this.headC.addChild(g); return g;
    };
    this.browL = brow(P.PIV.browL, rad(-8)); this.browR = brow(P.PIV.browR, rad(14));
    this.hatC = node(this.headC, H, H);
    this.setOutfit(outfit);
    this.update(0);
  }

  private sprite(spec: PartSpec, pivot: Pt): Sprite {
    const key = spec.name;
    let s = this.cache.get(key);
    if (!s) {
      const p = paint(spec, this.scale);
      s = new Sprite(Texture.from(p.canvas));
      s.scale.set(1 / this.scale);
      s.position.set(p.x0 - pivot[0], p.y0 - pivot[1]);
      this.texturePixels += s.texture.width * s.texture.height;
      this.cache.set(key, s);
    }
    return s;
  }

  setOutfit(o: Outfit) {
    this.neckC.removeChildren();
    for (const spec of P.neckwearParts(o.neck)) this.neckC.addChild(this.sprite(spec, P.PIV.neck));
    this.hatC.removeChildren();
    for (const spec of P.headwearParts(o.head)) this.hatC.addChild(this.sprite(spec, P.PIV.head));
  }
  setState(s: DogState) { this.state = s; }
  setAge(a: number) { this.age = clamp01(a); }
  snap() {
    const tgt = { ...BASE, ...TARGETS[this.state] };
    for (const k of KEYS) { this.p[k] = tgt[k]; this.v[k] = 0; }
    this.update(0);
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const tgt = { ...BASE, ...TARGETS[this.state] };
    const w = 8.5;
    for (const k of KEYS) {
      const a = w * w * (tgt[k] - this.p[k]) - 2 * w * this.v[k];
      this.v[k] += a * dt; this.p[k] += this.v[k] * dt;
    }
    const p = this.p, t = this.t, TAU = Math.PI * 2, A = this.age;
    // 成長：頭身・脚・耳・目・鼻づら・全体の大きさ
    const G = {
      size: grow(0.74, 0.88, 1.0, A), head: grow(1.0, 0.9, 0.8, A), bodyX: grow(0.88, 1.0, 1.1, A), bodyY: grow(0.86, 0.96, 1.02, A),
      legs: grow(0.75, 1.05, 1.35, A), ears: grow(0.9, 1.04, 1.16, A), eyes: grow(1.1, 0.98, 0.86, A), snout: grow(0.88, 1.04, 1.22, A),
    };
    const br = Math.sin(t * TAU * p.breathRate) * p.breathAmp;
    const wag = Math.sin(t * TAU * p.wagRate) * p.wagAmp;
    const hop = p.bounce * Math.abs(Math.sin(t * TAU * 1.6)) * 7;
    this.view.scale.set(G.size);
    this.view.pivot.y = hop / G.size;
    const legY = G.legs * (1 - 0.72 * clamp01(p.legFold));
    this.legs.forEach((l, i) => { l.scale.set(G.bodyX * 0.96, legY); l.position.x = this.legX[i]! * G.bodyX * (1 + (1 - p.squash) * 0.18); });
    const lift = (legY - 1) * P.LEG_H;
    this.trunk.position.y = -lift;
    this.trunk.scale.set(G.bodyX * (1 + (1 - p.squash) * 0.18), G.bodyY * p.squash);
    this.breath.scale.set(1 + br * 0.004, 1 + br * 0.012);
    this.hindC.alpha = clamp01(p.hindAlpha);
    // 頭の位置：胴の上端に合わせて動く
    const look = (Math.sin(t * 0.6) * 4 + Math.sin(t * 1.7) * 1.2) * p.look;
    const munch = p.munch * Math.max(0, Math.sin(t * TAU * 2.2));
    const Hx = P.PIV.head[0] * this.trunk.scale.x, Hy = P.PIV.head[1] * this.trunk.scale.y - lift;
    this.headC.position.set(Hx + p.headX, Hy + p.headY - br * 1.1 + munch * 3);
    this.headC.scale.set(G.head);
    this.headC.rotation = rad(p.headRot + look);
    this.neckC.position.set(P.PIV.neck[0] * this.trunk.scale.x + p.headX * 0.7, P.PIV.neck[1] * this.trunk.scale.y - lift + p.headY * 0.75 - br * 0.8);
    this.neckC.scale.set(G.bodyX * 0.9 + G.head * 0.15);
    this.neckC.rotation = rad((p.headRot + look) * 0.5);
    // 耳・尾
    const twitch = Math.max(0, Math.sin(t * 0.8)) ** 40 * 10 * p.look;
    this.earL.rotation = rad(-p.earRot - twitch); this.earR.rotation = rad(p.earRot * 0.9);
    this.earL.scale.set(G.ears, G.ears * p.earFlat); this.earR.scale.set(G.ears, G.ears * p.earFlat);
    this.tailC.rotation = rad(p.tailRot + wag);
    const d = clamp01(p.droop);
    this.tailC.alpha = 1 - d; this.tailDownC.alpha = d;
    this.tailC.rotation += rad(30 * d);
    this.tailDownC.rotation = rad(wag * 0.5 - 20 * (1 - d));
    // 顔
    for (const e of this.eyes) e.root.scale.set(G.eyes);
    this.snout.scale.set(G.snout);
    if (t > this.blinkT) { this.blinkUntil = t + 0.13; this.blinkT = t + 2.4 + ((t * 7919) % 3.2); }
    const blink = t < this.blinkUntil && p.eyeOpen > 0.4 ? 0.1 : 1;
    for (const e of this.eyes) e.set(clamp01(p.eyeOpen) * blink, clamp01(p.happy), clamp01(p.sad));
    this.browL.position.y = P.PIV.browL[1] - P.PIV.head[1] - 3 * p.sad + 2 * p.happy;
    this.browR.position.y = P.PIV.browR[1] - P.PIV.head[1] - 3 * p.sad + 2 * p.happy;
    this.browL.rotation = rad(-8 + 22 * p.sad); this.browR.rotation = rad(14 - 22 * p.sad);
    this.mouth.draw(clamp01(p.mouthOpen + munch * 0.45), clamp01(p.tongue + p.munch * 0.3), clamp01(p.smile), clamp01(p.frown));
    this.blush.alpha = clamp01(p.blush);
  }
}
