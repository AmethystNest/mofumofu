/** 2D黒柴（ちびキャラ）の骨組みと表情。PixiJS v8 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { paint, type PartSpec, type Pt } from './painter';
import * as P from './parts';

export type DogState = 'idle' | 'petted' | 'eat' | 'sleep' | 'sad';
const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const KEYS = ['bodyY', 'squash', 'breathAmp', 'breathRate', 'headX', 'headY', 'headRot', 'look', 'earRot', 'earFlat',
  'tailRot', 'droop', 'wagAmp', 'wagRate', 'bounce', 'eyeOpen', 'happy', 'sad', 'smile', 'frown', 'mouthOpen', 'tongue',
  'blush', 'munch', 'hindAlpha'] as const;
type Key = typeof KEYS[number];
type Params = Record<Key, number>;

const BASE: Params = {
  bodyY: 0, squash: 1, breathAmp: 1, breathRate: 0.45, headX: 0, headY: 0, headRot: 0, look: 1, earRot: 0, earFlat: 1,
  tailRot: 0, droop: 0, wagAmp: 6, wagRate: 1.2, bounce: 0, eyeOpen: 1, happy: 0, sad: 0, smile: 1, frown: 0, mouthOpen: 0,
  tongue: 0, blush: 0, munch: 0, hindAlpha: 1,
};
export const TARGETS: Record<DogState, Partial<Params>> = {
  idle: {},
  petted: { happy: 1, smile: 0, mouthOpen: 1, tongue: 1, blush: 1, headRot: -9, look: 0.2, earRot: 14, earFlat: 0.9, wagAmp: 16, wagRate: 4, bounce: 1, breathRate: 1.2 },
  eat: { headY: 64, headX: -12, headRot: 10, look: 0, happy: 0.85, smile: 0, munch: 1, blush: 0.35, wagAmp: 9, wagRate: 1.8, earRot: 6 },
  sleep: { squash: 0.66, bodyY: 0, headY: 104, headX: -6, headRot: -7, look: 0, eyeOpen: 0, smile: 0.7, earRot: 18, earFlat: 0.92,
    tailRot: 24, wagAmp: 0, breathAmp: 1.8, breathRate: 0.26, hindAlpha: 0 },
  sad: { headY: 20, headRot: 7, look: 0.25, sad: 1, eyeOpen: 0.86, smile: 0, frown: 1, earRot: 34, earFlat: 0.8, droop: 1, wagAmp: 0.8, wagRate: 0.5,
    breathRate: 0.3, squash: 0.97 },
};

function sprite(spec: PartSpec, scale: number, pivot: Pt): Sprite {
  const p = paint(spec, scale);
  const s = new Sprite(Texture.from(p.canvas));
  s.scale.set(1 / scale);
  s.position.set(p.x0 - pivot[0], p.y0 - pivot[1]);
  return s;
}
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
  constructor(parent: Container, at: Pt, parentAt: Pt, private side: -1 | 1) {
    this.root.position.set(at[0] - parentAt[0], at[1] - parentAt[1]);
    const rx = 12.5, ry = 13.5;
    const g = new Graphics()
      .ellipse(0, 0, rx + 1.2, ry + 1.2).fill(0x24140c)
      .ellipse(0, 0.5, rx, ry).fill(0x3a2114)
      .ellipse(0, 1.2, rx * 0.84, ry * 0.84).fill(0x160a06)
      .ellipse(0, 6, rx * 0.6, ry * 0.3).fill({ color: 0x6a4028, alpha: 0.45 })
      .circle(-3.8 * side * -1 - 0.5, -4.6, 4.2).fill({ color: 0xffffff, alpha: 0.96 })
      .circle(4 * side * -1 + 0.5, 4.2, 1.8).fill({ color: 0xffffff, alpha: 0.8 });
    const mask = new Graphics().ellipse(0, 0, rx + 1.5, ry + 1.5).fill(0xffffff);
    this.lid.rect(-16, -16, 32, 16).fill(0x3a3230);
    this.ball.addChild(g, this.lid, mask);
    this.ball.mask = mask;
    this.closed.moveTo(-10, -1).quadraticCurveTo(0, 6, 10, -1).stroke({ width: 2.6, color: 0x1e1410, cap: 'round' });
    this.happyArc.moveTo(-10, 4).quadraticCurveTo(0, -8, 10, 4).stroke({ width: 3, color: 0x1e1410, cap: 'round' });
    this.root.addChild(this.ball, this.closed, this.happyArc);
    parent.addChild(this.root);
  }
  set(open: number, happy: number, sad: number) {
    const shown = open > 0.1;
    this.ball.visible = shown && happy < 0.99;
    this.ball.alpha = 1 - happy;
    this.ball.scale.y = Math.max(0.1, open);
    // 困り顔：上まぶたが目じり側へ下がる
    this.lid.position.y = -16 + 16 * 0.55 * sad;
    this.lid.rotation = rad(-16 * sad * this.side);
    this.closed.alpha = (1 - happy) * (shown ? 0 : 1);
    this.happyArc.alpha = happy;
  }
}

export class ShibaDog {
  readonly view = new Container();
  state: DogState = 'idle';
  texturePixels = 0;
  private p: Params = { ...BASE };
  private v = Object.fromEntries(KEYS.map(k => [k, 0])) as Params;
  private t = 0;
  private blinkT = 2.2;
  private blinkUntil = -1;
  private bodyC: Container; private breath: Container; private headC: Container;
  private earL: Container; private earR: Container; private tailC: Container; private tailDownC: Container; private hindC: Container;
  private eyes: Eye[]; private browL: Graphics; private browR: Graphics;
  private mouthOpen: Graphics; private tongue: Graphics; private smile: Graphics; private frown: Graphics; private blush: Graphics;
  private mouthC: Container;

  constructor(scale: number) {
    const add = (parent: Container, spec: PartSpec, pivot: Pt) => {
      const s = sprite(spec, scale, pivot);
      this.texturePixels += s.texture.width * s.texture.height;
      parent.addChild(s); return s;
    };
    // 胴（地面を支点に伸縮：伏せでつぶれる）
    const ground: Pt = [P.PIV.body[0], 0];
    this.bodyC = node(this.view, ground, [0, 0]);
    this.tailDownC = node(this.bodyC, P.PIV.tail, ground); add(this.tailDownC, P.tailDown(), P.PIV.tail);
    this.tailC = node(this.bodyC, P.PIV.tail, ground); add(this.tailC, P.tail(), P.PIV.tail);
    this.hindC = node(this.bodyC, P.PIV.hind, ground); add(this.hindC, P.hind(), P.PIV.hind);
    // 前脚は胸の毛の下から出る（胴より先に置く）
    const fl = node(this.bodyC, P.PIV.frontL, ground); add(fl, P.frontL(), P.PIV.frontL);
    const fr = node(this.bodyC, P.PIV.frontR, ground); add(fr, P.frontR(), P.PIV.frontR);
    this.breath = node(this.bodyC, ground, ground); add(this.breath, P.body(), ground);
    // 頭（バンダナは頭と一緒に動く）
    const H = P.PIV.head;
    this.headC = node(this.view, H, [0, 0]);
    const band = node(this.headC, P.PIV.bandana, H);
    add(band, P.bandana(), P.PIV.bandana);
    for (const b of P.bow()) add(band, b, P.PIV.bandana);
    this.earL = node(this.headC, P.PIV.earL, H); add(this.earL, P.ear('L'), P.PIV.earL);
    this.earR = node(this.headC, P.PIV.earR, H); add(this.earR, P.ear('R'), P.PIV.earR);
    add(this.headC, P.head(), H);
    // 顔
    this.blush = new Graphics()
      .ellipse(P.PIV.cheekL[0] - H[0], P.PIV.cheekL[1] - H[1], 13, 7).fill({ color: 0xf08a8a, alpha: 0.55 })
      .ellipse(P.PIV.cheekR[0] - H[0], P.PIV.cheekR[1] - H[1], 13, 7).fill({ color: 0xf08a8a, alpha: 0.55 });
    this.headC.addChild(this.blush);
    this.eyes = [new Eye(this.headC, P.PIV.eyeL, H, -1), new Eye(this.headC, P.PIV.eyeR, H, 1)];
    const brow = (at: Pt, rot: number) => {
      const g = new Graphics().ellipse(0, 0, 10.5, 6.5).fill(0xecc08e).ellipse(1, 1.5, 8, 4.2).fill({ color: 0xf6d6ae, alpha: 0.8 });
      g.position.set(at[0] - H[0], at[1] - H[1]); g.rotation = rot; this.headC.addChild(g); return g;
    };
    this.browL = brow(P.PIV.browL, rad(-8)); this.browR = brow(P.PIV.browR, rad(14));
    this.mouthC = node(this.headC, P.PIV.mouth, H);
    this.mouthC.rotation = rad(16);
    // 開いた口（下側に舌）
    this.mouthOpen = new Graphics()
      .moveTo(-31, -3).quadraticCurveTo(0, 3, 31, -3).quadraticCurveTo(22, 30, 0, 32).quadraticCurveTo(-24, 30, -31, -3)
      .fill(0x5a2420).stroke({ width: 2.2, color: 0x2a1812, join: 'round' });
    this.tongue = new Graphics().ellipse(0, 20, 17, 12).fill(0xee8f95).moveTo(0, 12).lineTo(0, 24).stroke({ width: 1.4, color: 0xc4636b });
    const tmask = new Graphics().moveTo(-31, -3).quadraticCurveTo(0, 3, 31, -3).quadraticCurveTo(22, 30, 0, 32).quadraticCurveTo(-24, 30, -31, -3).fill(0xffffff);
    const openC = new Container(); openC.addChild(this.mouthOpen, this.tongue, tmask); this.tongue.mask = tmask;
    this.mouthOpen = openC as unknown as Graphics;
    this.smile = new Graphics().moveTo(0, -12).lineTo(0, -4).moveTo(-14, -6).quadraticCurveTo(-7, 3, 0, -4).quadraticCurveTo(7, 3, 14, -6)
      .stroke({ width: 2.4, color: 0x2a1812, cap: 'round', join: 'round' });
    this.frown = new Graphics().moveTo(0, -12).lineTo(0, -5).moveTo(-12, 2).quadraticCurveTo(0, -8, 12, 2)
      .stroke({ width: 2.4, color: 0x2a1812, cap: 'round', join: 'round' });
    this.mouthC.addChild(openC, this.smile, this.frown);
    const nose = new Graphics().ellipse(0, 0, 11, 7.5).fill(0x1b1414).ellipse(-3, -3, 4, 2).fill({ color: 0xffffff, alpha: 0.35 });
    nose.position.set(P.PIV.nose[0] - H[0], P.PIV.nose[1] - H[1]);
    this.headC.addChild(nose);
    this.update(0);
  }

  setState(s: DogState) { this.state = s; }
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
    const p = this.p, t = this.t, TAU = Math.PI * 2;
    const br = Math.sin(t * TAU * p.breathRate) * p.breathAmp;
    const wag = Math.sin(t * TAU * p.wagRate) * p.wagAmp;
    const hop = p.bounce * Math.abs(Math.sin(t * TAU * 1.6)) * 7;
    this.view.position.y = -hop;
    this.bodyC.scale.set(1 + (1 - p.squash) * 0.18, p.squash);
    this.breath.scale.set(1 + br * 0.004, 1 + br * 0.012);
    const look = (Math.sin(t * 0.6) * 4 + Math.sin(t * 1.7) * 1.2) * p.look;
    const munch = p.munch * Math.max(0, Math.sin(t * TAU * 2.2));
    this.headC.position.set(P.PIV.head[0] + p.headX, P.PIV.head[1] + p.headY - br * 1.1 + munch * 3);
    this.headC.rotation = rad(p.headRot + look);
    const twitch = Math.max(0, Math.sin(t * 0.8)) ** 40 * 10 * p.look;
    this.earL.rotation = rad(-p.earRot - twitch); this.earR.rotation = rad(p.earRot * 0.9);
    this.earL.scale.y = this.earR.scale.y = p.earFlat;
    this.tailC.rotation = rad(p.tailRot + wag);
    const d = clamp01(p.droop);
    this.tailC.alpha = 1 - d; this.tailDownC.alpha = d;
    this.tailC.rotation += rad(30 * d);
    this.tailDownC.rotation = rad(wag * 0.5 - 20 * (1 - d));
    this.hindC.alpha = clamp01(p.hindAlpha);
    // 表情
    if (t > this.blinkT) { this.blinkUntil = t + 0.13; this.blinkT = t + 2.4 + ((t * 7919) % 3.2); }
    const blink = t < this.blinkUntil && p.eyeOpen > 0.4 ? 0.1 : 1;
    for (const e of this.eyes) e.set(clamp01(p.eyeOpen) * blink, clamp01(p.happy), clamp01(p.sad));
    this.browL.position.y = P.PIV.browL[1] - P.PIV.head[1] - 3 * p.sad + 2 * p.happy;
    this.browR.position.y = P.PIV.browR[1] - P.PIV.head[1] - 3 * p.sad + 2 * p.happy;
    this.browL.rotation = rad(-8 + 22 * p.sad); this.browR.rotation = rad(14 - 22 * p.sad);
    const open = clamp01(p.mouthOpen + munch * 0.4);
    this.mouthOpen.alpha = open > 0.05 ? 1 : 0;
    this.mouthOpen.scale.set(0.8 + 0.2 * open, Math.max(0.05, open));
    this.tongue.alpha = clamp01(p.tongue + p.munch * 0.8);
    this.smile.alpha = clamp01(p.smile) * (open > 0.3 ? 0 : 1);
    this.frown.alpha = clamp01(p.frown);
    this.blush.alpha = clamp01(p.blush);
  }
}
