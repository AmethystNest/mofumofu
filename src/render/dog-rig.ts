/**
 * Phaser 3 の Container（親子関係）と Tween で動かす、パーツ式の犬。
 *
 * 承認済みの待機絵（idle-v12/frame_00）を scripts/cut-rig.py でパーツに切り分けてあり、
 * 安静時に重ねると元の絵に戻る。動きは二層：
 * - 主な動き（体）：Tween。上下・伸び縮み（スクワッシュ＆ストレッチ）・傾き・呼吸。
 * - 従い遅れ（耳・ほほ毛・しっぽ・前足・黒目）：体の動きの速さから目標を計算し、
 *   行き過ぎて戻るばね（rig-math.ts の Spring）で追わせる。体が止まったあとも少し揺れる。
 * まばたき・視線・耳ぴく・しっぽ振りは、間隔と向きをばらつかせて自動で起こす。
 *
 * 座っている姿勢から大きく外れる動き（食事・眠り・しょんぼり）は、承認済みの専用コマを
 * そのまま使い、体の伸び縮みと呼吸だけを重ねる。
 */
import type PhaserNS from 'phaser';
import type { DogMotion, Motion } from './dog-motion';
import { enterExtra, EXTRA_MOTIONS, FIDGETS, type GaitKit } from './gaits';
import { Spring, clamp, gazeFromDir, gazeTarget, randBetween, squashX, velocity } from './rig-math';

type Frame = { src: string; ms: number };
type Part = { x: number; y: number; w: number; h: number; kind: string; axis?: 'v' | 'h'; root?: string; behind?: boolean; pivot?: [number, number] };
type Meta = { parts: Record<string, Part>; eyes: { L: { c: [number, number]; r: [number, number] }; R: { c: [number, number]; r: [number, number] } } };

const FLOOR: [number, number] = [160, 287];      // 床に着く点（伸び縮みの支点）
const HEAD_H = 240;                              // 床から頭のてっぺんまで（px）
const RIG_MOTIONS: Motion[] = ['idle', 'pet', 'play', ...EXTRA_MOTIONS];
const FADE = 110;
const GAZE_PX = 0.55;                            // 視線（rig-math の値）→ 目のシールのずれ px
const EYE_HOME: [number, number] = [-FLOOR[0], -FLOOR[1]];

/** Tween が動かす値（主な動き） */
interface State {
  sy: number; bodyY: number; bodyX: number; lean: number; strokeLean: number;   // 体
  breath: number;                                                                // 呼吸（伸び縮みに足す）
  squint: number; blink: number;                              // 目
  gx: number; gy: number;                                                        // 視線
  tail: number; tailAmb: number; earBase: number; earFlickL: number; earFlickR: number;
}

interface Inner { api: DogMotion; attach(image: HTMLImageElement): void; detach(image: HTMLImageElement): void }
let shared: Promise<Inner> | undefined;
let failed = false;     // 一度失敗した端末では作り直しを繰り返さない

/**
 * 画面の描き直し（お世話のたびに起こる）で Phaser を作り直さないよう、ゲームは1つだけ作って使い回す。
 * 描き直しでは canvas を新しい場所へ付け替えるだけ。外している間は更新を止める。
 */
export async function createDogRig(image: HTMLImageElement): Promise<DogMotion> {
  if (failed) throw new Error('rig unavailable');
  shared ??= init().catch((e) => { failed = true; shared = undefined; throw e; });
  const inner = await shared;
  inner.attach(image);
  return { ...inner.api, get motion() { return inner.api.motion; }, get drawMs() { return inner.api.drawMs; }, destroy: () => inner.detach(image) };
}

async function init(): Promise<Inner> {
  const root = `${import.meta.env.BASE_URL}assets/dog/`;
  const [motionsRes, rigRes, phaserMod] = await Promise.all([
    fetch(`${root}motions-v1/motions.json`), fetch(`${root}rig-v1/rig.json`), import('phaser'),
  ]);
  if (!motionsRes.ok || !rigRes.ok) throw new Error('Rig assets unavailable');
  const clips = ((await motionsRes.json()) as { clips: Record<Motion, Frame[]> }).clips;
  const meta = (await rigRes.json()) as Meta;
  const Phaser = ((phaserMod as unknown as { default?: typeof PhaserNS }).default ?? phaserMod) as typeof PhaserNS;

  const holder = document.createElement('div');   // いったん外に作り、attach で実際の場所へ付ける
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const px = Math.round(320 * dpr);

  const S: State = {
    sy: 1, bodyY: 0, bodyX: 0, lean: 0, strokeLean: 0, breath: 0, squint: 0, blink: 0,
    gx: 0, gy: 0, tail: 0, tailAmb: 0, earBase: 0, earFlickL: 0, earFlickR: 0,
  };
  const STATE_REST = { sy: 1, bodyY: 0, bodyX: 0, lean: 0, strokeLean: 0, squint: 0, tail: 0, earBase: 0 };

  let sc!: PhaserNS.Scene;
  let game!: PhaserNS.Game;
  let passive: Motion = 'idle';
  let active: Motion = 'idle';
  let reactTimer: PhaserNS.Time.TimerEvent | undefined;
  let stateTweens: PhaserNS.Tweens.Tween[] = [];
  let breathTween: PhaserNS.Tweens.Tween | undefined;
  let settleTween: PhaserNS.Tweens.Tween | undefined;
  let stroking = false;
  let strokeDir = 0;
  let strokeTween: PhaserNS.Tweens.Tween | undefined;
  let lookTimer: PhaserNS.Time.TimerEvent | undefined;
  let drawMs = 0;
  let sleeping = false;
  let sleepAfter = 6;      // 動きを減らす設定：この回数のコマを描いたら更新を止める

  // ---- 場面の組み立て -------------------------------------------------------
  const ready = new Promise<void>((resolve, reject) => {
    const cfg: PhaserNS.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: holder,
      width: px,
      height: px,
      transparent: true,
      banner: false,
      disableContextMenu: true,
      audio: { noAudio: true },
      input: { mouse: false, touch: false, keyboard: false, gamepad: false },
      render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'low-power' },
      scale: { mode: Phaser.Scale.NONE },
      fps: { target: 60 },
      scene: {
        key: 'dog-rig',
        preload(this: PhaserNS.Scene) {
          this.load.setPath(root);
          this.load.atlas('rig', 'rig-v1/atlas.png', 'rig-v1/atlas.json');
          for (const m of ['eat', 'sleep', 'sad'] as const) {
            for (const f of clips[m]) if (!this.textures.exists(`pose:${f.src}`)) this.load.image(`pose:${f.src}`, f.src);
          }
          this.load.on('loaderror', (file: { src: string }) => reject(new Error(`load failed: ${file.src}`)));
        },
        create(this: PhaserNS.Scene) {
          sc = this;
          try { build(); resolve(); } catch (e) { reject(e as Error); }
        },
        update(this: PhaserNS.Scene, _t: number, deltaMs: number) { frame(deltaMs); },
      },
    };
    try { game = new Phaser.Game(cfg); } catch (e) { reject(e as Error); }
    // Rope は WebGL 専用。使えないときは従来の描画へ切り替える（呼び出し側で捕まえる）
    if (game && game.renderer.type !== Phaser.WEBGL) { game.destroy(true); reject(new Error('WebGL unavailable')); }
  });

  let rootC!: PhaserNS.GameObjects.Container;
  let rigC!: PhaserNS.GameObjects.Container;
  let poseA!: PhaserNS.GameObjects.Image, poseB!: PhaserNS.GameObjects.Image;
  type Rope = { obj: PhaserNS.GameObjects.Rope; base: { x: number; y: number }[]; axis: 'v' | 'h'; t: number[] };
  const ropes: Record<string, Rope> = {};                                       // 耳・ほほ毛・しっぽ（付け根を固定してしなる）
  const eye = {} as Record<'L' | 'R', { box: PhaserNS.GameObjects.Container; half: PhaserNS.GameObjects.Image; closed: PhaserNS.GameObjects.Image }>;
  const spring = {
    earL: new Spring(0, 22, 0.34), earR: new Spring(0, 22, 0.34), tail: new Spring(0, 13, 0.4),
    cheekL: new Spring(0, 18, 0.4), cheekR: new Spring(0, 18, 0.4),
    gx: new Spring(0, 34, 0.6), gy: new Spring(0, 34, 0.6),
  };

  function build() {
    const at = (x: number, y: number): [number, number] => [x - FLOOR[0], y - FLOOR[1]];
    const img = (name: string, p: Part, ox = 0, oy = 0) => sc.add.image(p.x - ox, p.y - oy, 'rig', name).setOrigin(0, 0);
    rootC = sc.add.container(FLOOR[0] * dpr, FLOOR[1] * dpr).setScale(dpr);
    rigC = sc.add.container(0, 0);
    rootC.add(rigC);
    const P = meta.parts;
    const place = (c: PhaserNS.GameObjects.GameObject) => { rigC.add(c); return c; };

    // 付け根を固定してしなるパーツ（Rope）。t は付け根からの距離の割合（0=付け根）
    const makeRope = (name: string) => {
      const p = P[name]!;
      const vertical = p.axis === 'v';
      const segs = 12;
      const len = vertical ? p.h : p.w;
      const pts = Array.from({ length: segs }, (_, i) => {
        const d = -len / 2 + (len * i) / (segs - 1);
        return vertical ? { x: 0, y: d } : { x: d, y: 0 };
      });
      const obj = sc.add.rope(...at(p.x + p.w / 2, p.y + p.h / 2), 'rig', name, pts, !vertical);
      const base = pts.map((q) => ({ x: q.x, y: q.y }));
      const t = base.map((q) => {
        const d = vertical ? q.y + len / 2 : q.x + len / 2;            // 先頭から
        return clamp(p.root === 'bottom' ? 1 - d / len : p.root === 'top' || p.root === 'left' ? d / len : 0, 0, 1);
      });
      ropes[name] = { obj, base, axis: p.axis!, t };
      return obj;
    };
    // 奥：しっぽ
    rigC.add(makeRope('tail'));
    // 体（頭・胴）
    rigC.add(sc.add.image(...at(0, 0), 'rig', 'base').setOrigin(0, 0));
    // 目：目のまわりをひとまとめにした「シール」。開き目の上に、半目・閉じ目を重ねて切り替える
    for (const side of ['L', 'R'] as const) {
      const o = P[`eyeOpen${side}`]!, h = P[`eyeHalf${side}`]!, c = P[`eyeClosed${side}`]!;
      const open = sc.add.image(o.x, o.y, 'rig', `eyeOpen${side}`).setOrigin(0, 0);
      const half = sc.add.image(h.x, h.y, 'rig', `eyeHalf${side}`).setOrigin(0, 0).setAlpha(0);
      const closed = sc.add.image(c.x, c.y, 'rig', `eyeClosed${side}`).setOrigin(0, 0).setAlpha(0);
      const box = sc.add.container(...at(0, 0), [open, half, closed]);
      eye[side] = { box, half, closed };
      rigC.add(box);
    }
    // 手前：耳・ほほ毛
    for (const n of ['earL', 'earR', 'cheekL', 'cheekR']) rigC.add(makeRope(n));

    // 専用コマ（食事・眠り・しょんぼり）
    const first = `pose:${clips.sleep[0]!.src}`;
    poseA = sc.add.image(...at(0, 0), first).setOrigin(0, 0).setVisible(false);
    poseB = sc.add.image(...at(0, 0), first).setOrigin(0, 0).setVisible(false).setAlpha(0);
    rootC.add([poseA, poseB]);

    const canvas = game.canvas;
    canvas.className = 'dog-canvas';
    canvas.setAttribute('role', 'img');
    canvas.style.setProperty('width', '100%', 'important');
    canvas.style.setProperty('height', 'auto', 'important');
    canvas.dataset.renderer = game.renderer.type === Phaser.WEBGL ? 'phaser-webgl' : 'phaser-canvas';
    if (import.meta.env.DEV) (window as unknown as { __rig?: unknown }).__rig = { S, spring, ropes, eye, root: rootC };
  }

  // ---- 状態の切り替え -------------------------------------------------------
  const tw = (cfg: PhaserNS.Types.Tweens.TweenBuilderConfig) => { const t = sc.tweens.add(cfg); stateTweens.push(t); return t; };
  const chain = (cfg: PhaserNS.Types.Tweens.TweenChainBuilderConfig | Record<string, unknown>) => { const t = sc.tweens.chain(cfg as PhaserNS.Types.Tweens.TweenChainBuilderConfig); stateTweens.push(t as unknown as PhaserNS.Tweens.Tween); return t; };

  function stopState() {
    for (const t of stateTweens) t.stop();
    stateTweens = [];
    settleTween?.stop();
  }
  /** 体を元の姿勢へ戻す。行き過ぎて収まる（着地後の余韻） */
  function settle(ms = 240) {
    settleTween = sc.tweens.add({ targets: S, ...STATE_REST, duration: ms, ease: 'Back.Out' });
  }

  function setBreath(amp: number, ms: number) {
    breathTween?.stop();
    S.breath = 0;
    breathTween = sc.tweens.add({ targets: S, breath: amp, duration: ms, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
  }

  function setTexture(key: string) { poseA.setTexture(key); }
  let poseClock = 0;
  const poseKey = (m: Motion, t: number) => {
    const fr = clips[m];
    const total = fr.reduce((a, f) => a + f.ms, 0);
    let ph = t % total;
    let f = fr[0]!;
    for (const item of fr) { f = item; if (ph < item.ms) break; ph -= item.ms; }
    return `pose:${f.src}`;
  };

  let showing: 'rig' | 'pose' = 'rig';
  function showMode(next: 'rig' | 'pose', m: Motion) {
    if (next === showing && next === 'rig') return;
    if (reduced) {
      rigC.setVisible(next === 'rig');
      poseA.setVisible(next === 'pose');
      if (next === 'pose') setTexture(poseKey(m, 0));
      showing = next;
      return;
    }
    if (next === 'pose') {
      const key = poseKey(m, 0);
      poseClock = 0;
      if (showing === 'rig') {
        poseB.setTexture(key).setVisible(true).setAlpha(0);
        sc.tweens.add({ targets: poseB, alpha: 1, duration: FADE, onComplete: () => { setTexture(key); poseA.setVisible(true); poseB.setVisible(false); rigC.setVisible(false); } });
      } else {
        poseB.setTexture(key).setVisible(true).setAlpha(0);
        sc.tweens.add({ targets: poseB, alpha: 1, duration: FADE, onComplete: () => { setTexture(key); poseB.setVisible(false); } });
      }
    } else {
      // 専用コマ → 座り姿勢：体を出し、手前のコマを溶かす
      poseB.setTexture(poseA.texture.key).setVisible(true).setAlpha(1);
      rigC.setVisible(true);
      poseA.setVisible(false);
      sc.tweens.add({ targets: poseB, alpha: 0, duration: FADE, onComplete: () => poseB.setVisible(false) });
    }
    showing = next;
  }

  let started = false;
  function begin(m: Motion) {
    if (started && m === active) return;
    started = true;
    stopState();
    const wasRig = showing === 'rig';
    active = m;
    canvas().dataset.motion = m;
    if (current) current.dataset.motion = m;
    const rigMode = RIG_MOTIONS.includes(m);
    showMode(rigMode ? 'rig' : 'pose', m);
    if (reduced) { Object.assign(S, STATE_REST); wake(); sleepAfter = game.loop.frame + 4; return; }
    wake();
    if (rigMode) {
      setBreath(0.012, 1750);
      if (m === 'pet') enterPet();
      else if (m === 'play') enterPlay();
      else if (EXTRA_MOTIONS.includes(m)) enterExtra(m, kit(), 0.42);
      else settle();
      if (!wasRig) settle(160);
    } else {
      // 専用コマ：体の伸び縮みと呼吸だけを重ねる
      Object.assign(S, { blink: 0, squint: 0 });
      if (m === 'sleep') { setBreath(0.026, 2600); settle(); }
      else if (m === 'sad') { setBreath(0.012, 3200); settle(); }
      else if (m === 'eat') {
        setBreath(0, 1);
        tw({ targets: S, sy: 0.972, bodyY: 0.6, duration: 180, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
      }
    }
  }

  const canvas = () => game.canvas;

  const kit = (): GaitKit => ({
    S: S as unknown as Record<string, number>,
    tw: (c) => tw(c as PhaserNS.Types.Tweens.TweenBuilderConfig),
    chain: (c) => chain(c),
    eyes: (blink, squint, ms = 160) => tw({ targets: S, blink, squint, duration: ms, ease: 'Sine.Out' }),
    settle: (ms, over) => { settleTween = sc.tweens.add({ targets: S, ...STATE_REST, ...(over ?? {}), duration: ms ?? 240, ease: 'Back.Out' }); },
  });

  function enterPet() {
    tw({ targets: S, squint: 1, earBase: 3, duration: 160, ease: 'Sine.Out' });
    tw({ targets: S, tail: { from: -6, to: 6 }, duration: 150, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    tw({ targets: S, lean: { from: -1.4, to: 1.4 }, duration: 330, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    chain({ targets: S, loop: -1, tweens: [
      { sy: 0.95, bodyY: 0.5, duration: 90, ease: 'Quad.Out' },
      { sy: 1.045, bodyY: -4, duration: 120, ease: 'Quad.Out' },
      { sy: 0.97, bodyY: 0, duration: 110, ease: 'Quad.In' },
      { sy: 1, bodyY: 0, duration: 260, ease: 'Elastic.Out' },
    ] });
  }

  function enterPlay() {
    tw({ targets: S, earBase: 1.5, duration: 140, ease: 'Sine.Out' });
    tw({ targets: S, tail: { from: -7, to: 7 }, duration: 120, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    // ぴょんぴょん：ため（つぶれ）→ 跳ぶ（縦に伸びる）→ 落ちる → 着地（つぶれ）→ 戻る
    chain({ targets: S, loop: -1, tweens: [
      { sy: 0.88, bodyY: 1, duration: 120, ease: 'Quad.Out' },
      { sy: 1.07, bodyY: -16, duration: 150, ease: 'Quad.Out' },
      { sy: 1.05, bodyY: -19, duration: 70, ease: 'Sine.Out' },
      { sy: 1.03, bodyY: 0, duration: 170, ease: 'Quad.In' },
      { sy: 0.86, bodyY: 1.5, duration: 70, ease: 'Quad.Out' },
      { sy: 1, bodyY: 0, duration: 190, ease: 'Elastic.Out' },
    ] });
    tw({ targets: S, lean: { from: -1, to: 1 }, duration: 560, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
  }

  function wake() { if (sleeping) { game.loop.wake(); sleeping = false; } }

  // ---- 自動で起こす「生きている」動き ----------------------------------------
  const clock = { blink: 1200, gaze: 900, flick: 3500, wag: 5000, curious: 8000, fidget: 12000 };
  let ambientTail: PhaserNS.Tweens.Tween | undefined;
  const ambient = (dt: number) => {
    if (!RIG_MOTIONS.includes(active) || showing !== 'rig' || reduced) return;
    clock.blink -= dt; clock.gaze -= dt; clock.flick -= dt; clock.wag -= dt; clock.curious -= dt;
    const calm = active === 'idle';
    if (calm && !stroking && (!reactTimer || reactTimer.getProgress() >= 1)) {
      clock.fidget -= dt;
      if (clock.fidget <= 0) {
        clock.fidget = randBetween(Math.random, 14000, 26000);
        const f = FIDGETS[Math.floor(Math.random() * FIDGETS.length)]!;
        api.react(f.m, f.ms);
      }
    }
    if (clock.blink <= 0) {
      clock.blink = randBetween(Math.random, 2200, 5500);
      const double = Math.random() < 0.18;
      sc.tweens.chain({ targets: S, tweens: [
        { blink: 1, duration: 70, ease: 'Sine.Out' }, { blink: 1, duration: 40 }, { blink: 0, duration: 110, ease: 'Sine.In' },
        ...(double ? [{ blink: 0, duration: 120 }, { blink: 1, duration: 60, ease: 'Sine.Out' }, { blink: 0, duration: 100, ease: 'Sine.In' }] : []),
      ] });
    }
    if (clock.gaze <= 0 && calm && !stroking && !lookTimer) {
      clock.gaze = randBetween(Math.random, 1300, 3800);
      const [x, y] = gazeTarget(Math.random);
      sc.tweens.add({ targets: S, gx: x, gy: y, duration: randBetween(Math.random, 70, 130), ease: 'Cubic.Out' });
      // ときどき、少し間を置いて反対側も見る（キョロキョロ）
      if (Math.random() < 0.3) {
        sc.tweens.add({ targets: S, gx: -x * 0.8, gy: -y * 0.5, duration: 110, ease: 'Cubic.Out', delay: randBetween(Math.random, 450, 800) });
      }
    }
    if (clock.flick <= 0 && calm) {
      clock.flick = randBetween(Math.random, 3500, 8500);
      const left = Math.random() < 0.5;
      const key = left ? 'earFlickL' : 'earFlickR';
      sc.tweens.chain({ targets: S, tweens: [
        { [key]: -6, duration: 70, ease: 'Quad.Out' }, { [key]: 2, duration: 90, ease: 'Quad.InOut' }, { [key]: 0, duration: 220, ease: 'Elastic.Out' },
      ] });
      if (Math.random() < 0.4) { // 音のしたほうへ視線を向ける
        const g = gazeFromDir(left ? -1 : 1);
        sc.tweens.add({ targets: S, gx: g[0], duration: 100, ease: 'Cubic.Out', delay: 60 });
      }
    }
    if (calm) {
      // ゆっくり揺れるしっぽ。ときどき短く速く振る
      if (!ambientTail) ambientTail = sc.tweens.add({ targets: S, tailAmb: { from: -3, to: 3 }, duration: 1350, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
      if (clock.wag <= 0) {
        clock.wag = randBetween(Math.random, 6000, 12000);
        ambientTail.stop();
        sc.tweens.add({ targets: S, tailAmb: { from: -6, to: 6 }, duration: 130, ease: 'Sine.InOut', yoyo: true, repeat: 7, onComplete: () => { ambientTail = undefined; } });
      }
      // ふとした首かしげ（体をわずかに傾ける。耳が遅れて追う）
      if (clock.curious <= 0) {
        clock.curious = randBetween(Math.random, 8000, 14000);
        const d = Math.random() < 0.5 ? -1 : 1;
        sc.tweens.chain({ targets: S, tweens: [
          { lean: d * 2.4, duration: 260, ease: 'Sine.Out' }, { lean: d * 2.4, duration: 900 }, { lean: 0, duration: 420, ease: 'Back.Out' },
        ] });
        sc.tweens.add({ targets: S, gx: d * 2.5, duration: 120, ease: 'Cubic.Out' });
        sc.tweens.add({ targets: S, gx: 0, duration: 160, ease: 'Cubic.Out', delay: 1300 });
      }
    }
  };

  // ---- 毎フレーム ----------------------------------------------------------
  let prevHeadY = 0, prevHeadX = 0, first = true;
  function frame(deltaMs: number) {
    const t0 = performance.now();
    const dt = Math.min(deltaMs, 50) / 1000;
    ambient(dt * 1000);
    if (showing === 'pose' && !reduced) {
      poseClock += dt * 1000;
      if (!poseB.visible) setTexture(poseKey(active, poseClock));
    }
    // 体：床を支点に伸び縮み・傾き
    const sy = S.sy * (1 + S.breath);
    const sx = squashX(sy, 0.7);
    rootC.setPosition((FLOOR[0] + S.bodyX) * dpr, (FLOOR[1] + S.bodyY) * dpr);
    rootC.setScale(dpr * sx, dpr * sy);
    rootC.setAngle(S.lean + S.strokeLean);

    // 体の動きの速さ（頭のてっぺんの動き）。従い遅れの元になる
    const headY = S.bodyY - (sy - 1) * HEAD_H;
    const headX = S.bodyX + Math.sin(((S.lean + S.strokeLean) * Math.PI) / 180) * HEAD_H;
    const up = first ? 0 : -velocity(headY, prevHeadY, dt);      // 上向きが正（px/s）
    const vx = first ? 0 : velocity(headX, prevHeadX, dt);
    prevHeadY = headY; prevHeadX = headX; first = false;

    if (showing === 'rig' || poseB.visible) {
      // 耳：付け根は動かさず、先ほど大きくしなる（px は先端のずれ）。上へ動くと遅れて外へ垂れ、着地ではね返る
      const earL = -S.earBase + S.earFlickL, earR = S.earBase - S.earFlickR;
      const drag = clamp(up * 0.006, -6, 6), side = clamp(vx * 0.01, -5, 5);
      bend('earL', spring.earL.step(earL - drag - side, dt));
      bend('earR', spring.earR.step(earR + drag - side, dt));
      // しっぽ（先端の上下のずれ）。体が上がると遅れて下へ
      bend('tail', spring.tail.step(S.tail + S.tailAmb + clamp(up * 0.006, -5, 5) - clamp(vx * 0.008, -5, 5), dt));
      // ほほ毛：体が横に動くと逆へなびく
      const ca = clamp(vx * 0.006, -2.6, 2.6);
      bend('cheekL', spring.cheekL.step(-ca, dt)); bend('cheekR', spring.cheekR.step(-ca, dt));
      // 目：シールごと小さくずらす（視線）。体の動きに少し遅れる
      const gx = spring.gx.step(clamp((S.gx - clamp(vx * 0.002, -0.5, 0.5)) * GAZE_PX, -2.2, 1.8), dt);
      const gy = spring.gy.step(clamp((S.gy + clamp(up * 0.003, -0.6, 0.8)) * GAZE_PX, -1.6, 1.4), dt);
      // まばたき・目を細める：開き目 → 半目 → 閉じ目 の順に重ねる
      const lid = Math.max(S.blink, S.squint);
      for (const k of ['L', 'R'] as const) {
        const e = eye[k];
        e.box.setPosition(EYE_HOME[0] + gx, EYE_HOME[1] + gy);
        e.half.setAlpha(clamp(lid * 2, 0, 1));
        e.closed.setAlpha(clamp(lid * 2 - 1, 0, 1));
      }
    }
    drawMs = drawMs * 0.9 + (performance.now() - t0) * 0.1;
    if (reduced && !sleeping && game.loop.frame >= sleepAfter) { game.loop.sleep(); sleeping = true; }
  }

  /** しなる：付け根(t=0)は動かず、先へいくほど大きくずれる。amp は先端のずれ(px)。縦長は横へ、横長は縦へ */
  function bend(name: string, amp: number) {
    const r = ropes[name]!;
    const key = r.axis === 'v' ? 'x' : 'y';
    for (let i = 0; i < r.base.length; i++) r.obj.points[i]![key] = r.base[i]![key] + amp * Math.pow(r.t[i]!, 1.7);
    r.obj.setDirty();
  }

  let current: HTMLImageElement | undefined;
  await ready;
  begin(passive);

  const api: DogMotion = {
    react(m, ms = 2200) {
      if (reduced) return;   // 動きを減らす設定では一時的な反応は出さない（静止の姿勢だけ）
      reactTimer?.remove();
      begin(m);
      reactTimer = sc.time.delayedCall(ms, () => { if (!stroking) begin(passive); else reactTimer = sc.time.delayedCall(400, () => begin(passive)); });
    },
    set(m) {
      passive = m;
      if (!reactTimer || reactTimer.getProgress() >= 1) begin(m);
    },
    look(dir) {
      if (reduced || showing !== 'rig') return;
      const [gx] = gazeFromDir(dir);
      sc.tweens.add({ targets: S, gx, gy: -0.5, duration: 90, ease: 'Cubic.Out' });
      sc.tweens.add({ targets: S, strokeLean: clamp(dir, -1, 1) * 1.2, duration: 160, ease: 'Sine.Out' });
      lookTimer?.remove();
      lookTimer = sc.time.delayedCall(900, () => {
        lookTimer = undefined;
        if (!stroking) { sc.tweens.add({ targets: S, gx: 0, gy: 0, strokeLean: 0, duration: 200, ease: 'Back.Out' }); }
      });
    },
    stroke(on, dir = 0) {
      if (reduced) return;
      const wasOn = stroking;
      const d = clamp(dir, -1, 1);
      stroking = on;
      if (on) {
        if (active !== 'pet') { reactTimer?.remove(); begin('pet'); }
        // 手の向きが変わったときだけ寄せ直す（pointermove ごとに Tween を作らない）
        if (!wasOn || Math.abs(d - strokeDir) > 0.12) {
          strokeDir = d;
          strokeTween?.stop();
          strokeTween = sc.tweens.add({ targets: S, strokeLean: d * 2.2, bodyX: d * 2.5, gx: gazeFromDir(d)[0], duration: 140, ease: 'Sine.Out' });
        }
        lookTimer?.remove(); lookTimer = undefined;
        reactTimer?.remove();
        reactTimer = sc.time.delayedCall(900, () => { if (!stroking) begin(passive); });
      } else if (wasOn) {
        strokeTween?.stop();
        strokeTween = sc.tweens.add({ targets: S, strokeLean: 0, bodyX: 0, gx: 0, duration: 260, ease: 'Back.Out' });
      }
    },
    get motion() { return active; },
    get drawMs() { return drawMs; },
    destroy() { /* attach/detach で管理する */ },
  };
  return {
    api,
    attach(image) {
      current = image;
      image.after(game.canvas);
      image.hidden = true;
      image.dataset.motion = active;
      game.canvas.setAttribute('aria-label', image.alt);
      wake();
      if (reduced) sleepAfter = game.loop.frame + 4;
    },
    detach(image) {
      if (current === image) current = undefined;
      game.canvas.remove();
      image.hidden = false;
      if (!current && !sleeping) { game.loop.sleep(); sleeping = true; }
    },
  };
}
