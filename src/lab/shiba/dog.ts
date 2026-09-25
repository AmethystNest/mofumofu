/** 2D黒柴の骨組み・表情・成長・着せ替え。PixiJS v8 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { paint, type PartSpec, type Pt } from './painter';
import * as P from './parts';

export type DogState = 'idle' | 'petted' | 'eat' | 'sleep' | 'sad';
export interface Outfit { neck: string; head: string }
/** 初期装備はなし（ユーザー指定） */
export const NO_OUTFIT: Outfit = { neck: 'none', head: 'none' };
const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

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
  sleep: { squash: 0.66, legFold: 1, headY: 26, headX: -6, headRot: -7, look: 0, eyeOpen: 0, smile: 0.6, earRot: 18, earFlat: 0.92,
    tailRot: 24, wagAmp: 0, breathAmp: 1.8, breathRate: 0.26, hindAlpha: 0 },
  sad: { headY: 18, headRot: 7, look: 0.25, sad: 1, eyeOpen: 0.86, smile: 0, frown: 1, earRot: 34, earFlat: 0.8, droop: 1, wagAmp: 0.8, wagRate: 0.5,
    breathRate: 0.3, squash: 0.97 },
};

class Eye {
  root = new Container();
  private ball = new Container();
  private lid = new Graphics();
  private closed = new Graphics();
  private happyArc = new Graphics();
  private rim = new Graphics();
  constructor(parent: Container, private side: -1 | 1) {
    const rx = 12.5, ry = 13.5;
    this.rim.ellipse(0, 0.4, rx + 2.4, ry + 2.4).stroke({ width: 1.3, color: 0x8f8680, alpha: 0.5 });
    const g = new Graphics()
      .ellipse(0, 0, rx + 1.2, ry + 1.2).fill(0x120a06)
      .ellipse(0, 0.6, rx, ry).fill(0x4a2a18)
      .ellipse(0, 2.6, rx * 0.86, ry * 0.8).fill({ color: 0x7a4a2c, alpha: 0.55 })   // 下側が明るい虹彩
      .ellipse(0, 0.2, rx * 0.62, ry * 0.64).fill(0x0c0604)                            // 瞳孔
      .ellipse(0, -ry * 0.55, rx * 0.95, ry * 0.42).fill({ color: 0x000000, alpha: 0.35 }) // 上まぶたの影
      .ellipse(3.6 * side, -4.4, 4.6, 4.2).fill({ color: 0xffffff, alpha: 0.97 })
      .circle(-4.2 * side, 4.6, 1.9).fill({ color: 0xffffff, alpha: 0.85 })
      .circle(-1.5 * side, -6.8, 1.1).fill({ color: 0xffffff, alpha: 0.7 });
    const mask = new Graphics().ellipse(0, 0, rx + 1.5, ry + 1.5).fill(0xffffff);
    this.lid.rect(-16, -16, 32, 16).fill(0x000000);
    this.ball.addChild(g, this.lid, mask);
    this.ball.mask = mask;
    this.closed.moveTo(-10, -1).quadraticCurveTo(0, 6, 10, -1).stroke({ width: 4.2, color: 0x6b6f7a, cap: 'round', alpha: 0.45 })
      .moveTo(-10, -1).quadraticCurveTo(0, 6, 10, -1).stroke({ width: 2.3, color: 0x050303, cap: 'round' });
    this.happyArc.moveTo(-10, 4).quadraticCurveTo(0, -8, 10, 4).stroke({ width: 4.6, color: 0x6b6f7a, cap: 'round', alpha: 0.45 })
      .moveTo(-10, 4).quadraticCurveTo(0, -8, 10, 4).stroke({ width: 2.6, color: 0x050303, cap: 'round' });
    this.root.addChild(this.rim, this.ball, this.closed, this.happyArc);
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
    const J = 13 * open;
    const cy = 4 + 2.5 * frown - 2 * smile * (1 - open);
    const L: Pt = [-19, cy], Rr: Pt = [16, cy];
    const INK = 0x1c1210;
    if (open > 0.04) {
      g.moveTo(L[0], L[1]).quadraticCurveTo(-10, 7 + J * 1.05, -1, 8 + J).quadraticCurveTo(8, 7 + J * 1.05, Rr[0], Rr[1])
        .quadraticCurveTo(7, 8, -1, 3).quadraticCurveTo(-9, 8, L[0], L[1]).fill(0x4e1a1a);
      g.moveTo(-14, 7 + J).quadraticCurveTo(-1, 20 + J, 12, 7 + J).quadraticCurveTo(-1, 11 + J, -14, 7 + J).fill(0xf4e2ca)
        .moveTo(-14, 7 + J).quadraticCurveTo(-1, 20 + J, 12, 7 + J).stroke({ width: 1.4, color: INK, alpha: 0.6, cap: 'round' });
      if (tongue > 0.05) {
        const T = 6 + 12 * tongue, y0 = 5 + J * 0.5;
        g.moveTo(-7, y0).lineTo(-7, y0 + T).quadraticCurveTo(-7, y0 + T + 6, -1, y0 + T + 6).quadraticCurveTo(5, y0 + T + 6, 5, y0 + T).lineTo(5, y0).fill(0xe9848e)
          .stroke({ width: 1.2, color: 0xa24452, alpha: 0.8 })
          .ellipse(-3, y0 + T * 0.45, 2, T * 0.3).fill({ color: 0xffffff, alpha: 0.18 })
          .moveTo(-1, y0 + 2).lineTo(-1, y0 + T - 2).stroke({ width: 1, color: 0xbf5f69 });
      }
    } else {
      g.moveTo(-10, 12).quadraticCurveTo(-1, 16, 8, 12).stroke({ width: 1.2, color: INK, alpha: 0.4, cap: 'round' });
    }
    g.moveTo(-1, -4).lineTo(-1, 3)
      .moveTo(-1, 3).quadraticCurveTo(-9, 9 - 3 * frown, L[0], L[1])
      .moveTo(-1, 3).quadraticCurveTo(7, 9 - 3 * frown, Rr[0], Rr[1])
      .stroke({ width: 1.9, color: INK, cap: 'round', join: 'round' });
  }
}

type Piv = ReturnType<typeof P.pivots>;

export class ShibaDog {
  readonly view = new Container();
  state: DogState = 'idle';
  age = 0;
  texturePixels = 0;
  lastBuildMs = 0;
  private outfit: Outfit;
  private p: Params = { ...BASE };
  private v = Object.fromEntries(KEYS.map(k => [k, 0])) as Params;
  private t = 0;
  private blinkT = 2.2;
  private blinkUntil = -1;
  private cache = new Map<string, { tex: Texture; x0: number; y0: number; shadow?: Texture }>();
  // 組み立て後に決まる
  private L!: P.Layout; private piv!: Piv;
  private trunk!: Container; private breath!: Container; private headC!: Container; private neckC!: Container; private hatC!: Container;
  private headShadow!: Container; private bodyShadow!: Container;
  private legs!: Container[]; private hindC!: Container;
  private earL!: Container; private earR!: Container; private tailC!: Container; private tailDownC!: Container;
  private eyes!: Eye[]; private browL!: Graphics; private browR!: Graphics; private face!: Container;
  private mouth = new Mouth(); private blush!: Graphics;

  constructor(private scale: number, outfit: Outfit = NO_OUTFIT, age = 0) {
    this.outfit = { ...outfit };
    this.age = age;
    this.build();
  }

  /** 部品を描いて（キャッシュ）スプライトにする。pivot は親ノードの位置（設計座標） */
  private part(spec: PartSpec, pivot: Pt, withShadow = false): { sprite: Sprite; shadow?: Sprite } {
    const key = `${spec.name}@${this.L.age.toFixed(2)}`;
    let c = this.cache.get(key);
    if (!c) {
      const p = paint(spec, this.scale);
      c = { tex: Texture.from(p.canvas), x0: p.x0, y0: p.y0, shadow: p.shadow ? Texture.from(p.shadow) : undefined };
      this.texturePixels += p.canvas.width * p.canvas.height;
      this.cache.set(key, c);
    }
    const mk = (tex: Texture) => { const s = new Sprite(tex); s.scale.set(1 / this.scale); s.position.set(c!.x0 - pivot[0], c!.y0 - pivot[1]); return s; };
    return { sprite: mk(c.tex), shadow: withShadow && c.shadow ? mk(c.shadow) : undefined };
  }

  private node(parent: Container, at: Pt, parentAt: Pt): Container {
    const c = new Container(); c.position.set(at[0] - parentAt[0], at[1] - parentAt[1]); parent.addChild(c); return c;
  }

  private build() {
    const t0 = performance.now();
    this.view.removeChildren();
    const L = (this.L = P.layout(this.age));
    const piv = (this.piv = P.pivots(L));
    const V = this.view;
    const O: Pt = [0, 0];
    // 脚（胸の毛の下から出る：胴より先）
    this.hindC = this.node(V, piv.hind, O); this.hindC.addChild(this.part(P.hind(L), piv.hind).sprite);
    const fl = this.node(V, piv.frontL, O); fl.addChild(this.part(P.frontL(L), piv.frontL).sprite);
    const fr = this.node(V, piv.frontR, O); fr.addChild(this.part(P.frontR(L), piv.frontR).sprite);
    this.legs = [this.hindC, fl, fr];
    // 胴の影（脚の上・胴の下）と胴（地面の中心を支点に、伏せでつぶれる）
    const bodyPart = this.part(P.body(L), O, true);
    this.bodyShadow = this.node(V, O, O); this.bodyShadow.addChild(bodyPart.shadow!);
    this.trunk = this.node(V, O, O);
    this.tailDownC = this.node(this.trunk, piv.tail, O); this.tailDownC.addChild(this.part(P.tailDown(L), piv.tail).sprite);
    this.tailC = this.node(this.trunk, piv.tail, O); this.tailC.addChild(this.part(P.tail(L), piv.tail).sprite);
    this.breath = this.node(this.trunk, O, O); this.breath.addChild(bodyPart.sprite);
    // 首まわり
    this.neckC = this.node(V, piv.neck, O);
    this.dressNeck();
    // 頭の影（胴とバンダナの上）
    const headPart = this.part(P.head(L), piv.head, true);
    this.headShadow = this.node(V, piv.head, O); this.headShadow.addChild(headPart.shadow!);
    // 頭
    this.headC = this.node(V, piv.head, O);
    this.earL = this.node(this.headC, piv.earL, piv.head); this.earL.addChild(this.part(P.ear('L', L), piv.earL).sprite);
    this.earR = this.node(this.headC, piv.earR, piv.head); this.earR.addChild(this.part(P.ear('R', L), piv.earR).sprite);
    this.headC.addChild(headPart.sprite);
    const hs = L.headScale;
    this.blush = new Graphics()
      .ellipse(piv.cheekL[0] - piv.head[0], piv.cheekL[1] - piv.head[1], 13 * hs, 7 * hs).fill({ color: 0xf08a8a, alpha: 0.5 })
      .ellipse(piv.cheekR[0] - piv.head[0], piv.cheekR[1] - piv.head[1], 13 * hs, 7 * hs).fill({ color: 0xf08a8a, alpha: 0.5 });
    this.headC.addChild(this.blush);
    // 鼻づら（マズルは描画済みの大きさ。口と鼻は鼻づらの伸びに合わせて拡大）
    const snout = this.node(this.headC, piv.snout, piv.head);
    snout.addChild(this.part(P.muzzle(L), piv.snout).sprite);
    this.face = new Container(); this.face.scale.set(L.muzzle[0], L.muzzle[3]); snout.addChild(this.face);
    this.mouth.g.scale.set(1.3);
    this.face.addChild(this.mouth.g);
    const nose = new Graphics().ellipse(0, 0, 11, 7.5).fill(0x0b0808).ellipse(-3, -3.2, 4.2, 2).fill({ color: 0xffffff, alpha: 0.42 })
      .ellipse(-4.5, 1.6, 2.2, 1.6).fill(0x2a2020).ellipse(3.5, 1.6, 2.2, 1.6).fill(0x2a2020);
    nose.position.set((piv.nose[0] - piv.snout[0]) / L.muzzle[0], (piv.nose[1] - piv.snout[1]) / L.muzzle[3]);
    this.face.addChild(nose);
    this.eyes = [new Eye(this.headC, -1), new Eye(this.headC, 1)];
    this.eyes[0]!.root.position.set(piv.eyeL[0] - piv.head[0], piv.eyeL[1] - piv.head[1]);
    this.eyes[1]!.root.position.set(piv.eyeR[0] - piv.head[0], piv.eyeR[1] - piv.head[1]);
    for (const e of this.eyes) e.root.scale.set(L.eyeScale);
    const brow = (at: Pt, rot: number) => {
      const g = new Graphics().ellipse(0, 0, 10.5, 6.5).fill(0xe0a86a).ellipse(1, 1.5, 8, 4.2).fill({ color: 0xf6d2a2, alpha: 0.8 });
      g.position.set(at[0] - piv.head[0], at[1] - piv.head[1]); g.rotation = rot; g.scale.set(hs); this.headC.addChild(g); return g;
    };
    this.browL = brow(piv.browL, rad(-8)); this.browR = brow(piv.browR, rad(14));
    this.hatC = this.node(this.headC, piv.head, piv.head);
    this.dressHead();
    this.lastBuildMs = performance.now() - t0;
    this.update(0);
  }

  private dressNeck() {
    this.neckC.removeChildren();
    for (const spec of P.neckwearParts(this.outfit.neck, this.L)) this.neckC.addChild(this.part(spec, this.piv.neck).sprite);
  }
  private dressHead() {
    this.hatC.removeChildren();
    for (const spec of P.headwearParts(this.outfit.head, this.L)) this.hatC.addChild(this.part(spec, this.piv.head).sprite);
  }

  setOutfit(o: Outfit) { this.outfit = { ...o }; this.dressNeck(); this.dressHead(); }
  setState(s: DogState) { this.state = s; }
  /** 成長度（0=子犬・0.5=若犬・1=成犬）。形を描き直すので、段階（0.05刻み）が変わったときだけ組み立て直す */
  setAge(a: number) {
    const q = Math.round(Math.max(0, Math.min(1, a)) * 20) / 20;
    if (q === this.age && this.L) return;
    this.age = q;
    this.build();
  }
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
    const p = this.p, t = this.t, TAU = Math.PI * 2, piv = this.piv;
    const br = Math.sin(t * TAU * p.breathRate) * p.breathAmp;
    const wag = Math.sin(t * TAU * p.wagRate) * p.wagAmp;
    const hop = p.bounce * Math.abs(Math.sin(t * TAU * 1.6)) * 7;
    this.view.pivot.y = hop;
    this.view.scale.set(this.L.size);
    const sx = 1 + (1 - p.squash) * 0.18, sy = p.squash;
    const legY = 1 - 0.72 * clamp01(p.legFold);
    const legX = [piv.hind[0], piv.frontL[0], piv.frontR[0]];
    this.legs.forEach((l, i) => { l.scale.set(1, legY); l.position.x = legX[i]! * sx; });
    // 伏せ：つぶした胴の底が床に着くまで下げる（成犬ほど脚が長いので下げる量が大きい）
    const fold = clamp01(p.legFold);
    const bottom = P.apply(this.L.body, [0, -48])[1] * sy;
    const drop = fold * Math.max(0, -6 - bottom);
    this.trunk.position.y = drop;
    this.trunk.scale.set(sx, sy);
    this.bodyShadow.scale.set(sx, sy); this.bodyShadow.position.y = 7 * sy + drop;
    this.breath.scale.set(1 + br * 0.004, 1 + br * 0.012);
    this.hindC.alpha = clamp01(p.hindAlpha);
    const look = (Math.sin(t * 0.6) * 4 + Math.sin(t * 1.7) * 1.2) * p.look;
    const munch = p.munch * Math.max(0, Math.sin(t * TAU * 2.2));
    const reach = clamp01(p.munch) * this.L.age * 58;   // 成犬ほど器まで頭を下げる
    const hx = piv.head[0] * sx + p.headX, hy = piv.head[1] * sy + drop + p.headY + reach - br * 1.1 + munch * 3;
    this.headC.position.set(hx, hy);
    this.headC.rotation = rad(p.headRot + look);
    this.headShadow.position.set(hx + 3, hy + 9);
    this.headShadow.rotation = this.headC.rotation;
    this.neckC.position.set(piv.neck[0] * sx + p.headX * 0.7, piv.neck[1] * sy + drop + (p.headY + reach) * 0.75 - br * 0.8);
    this.neckC.rotation = rad((p.headRot + look) * 0.5);
    const twitch = Math.max(0, Math.sin(t * 0.8)) ** 40 * 10 * p.look;
    this.earL.rotation = rad(-p.earRot - twitch); this.earR.rotation = rad(p.earRot * 0.9);
    this.earL.scale.y = this.earR.scale.y = p.earFlat;
    this.tailC.rotation = rad(p.tailRot + wag);
    const d = clamp01(p.droop);
    this.tailC.alpha = 1 - d; this.tailDownC.alpha = d;
    this.tailC.rotation += rad(30 * d);
    this.tailDownC.rotation = rad(wag * 0.5 - 20 * (1 - d));
    if (t > this.blinkT) { this.blinkUntil = t + 0.13; this.blinkT = t + 2.4 + ((t * 7919) % 3.2); }
    const blink = t < this.blinkUntil && p.eyeOpen > 0.4 ? 0.1 : 1;
    for (const e of this.eyes) e.set(clamp01(p.eyeOpen) * blink, clamp01(p.happy), clamp01(p.sad));
    const hs = this.L.headScale;
    this.browL.position.y = piv.browL[1] - piv.head[1] + (-3 * p.sad + 2 * p.happy) * hs;
    this.browR.position.y = piv.browR[1] - piv.head[1] + (-3 * p.sad + 2 * p.happy) * hs;
    this.browL.rotation = rad(-8 + 22 * p.sad); this.browR.rotation = rad(14 - 22 * p.sad);
    this.mouth.draw(clamp01(p.mouthOpen + munch * 0.45), clamp01(p.tongue + p.munch * 0.3), clamp01(p.smile), clamp01(p.frown));
    this.blush.alpha = clamp01(p.blush);
  }
}
