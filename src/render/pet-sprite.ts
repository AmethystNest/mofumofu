/**
 * Phaser 3 のスプライトで、コマ画像のアニメーション（待機・歩き・食事・水飲み・遊び・なでられる・睡眠）を再生する。
 * 素材はユーザー提供の PetGame_{Cat,Dog}_Phaser_Pack（public/assets/pets、scripts/import-pets.py で取り込み）。
 * 768×768 のコマを、足元 y=690 の同じ基準線で重ねて切り替える。左右の歩きは別コマ。
 *
 * - 動作の切り替えでコマが「ぱっ」と変わらないよう、前のコマを短く溶かす。
 * - ゲーム（WebGL）はスロットごとに1つだけ作り、画面の描き直しでは canvas を付け替える。
 * - 「動きを減らす」設定では、待機の1コマを静止表示する。
 */
import type PhaserNS from 'phaser';

export type Motion = 'idle' | 'pet' | 'play' | 'eat' | 'drink' | 'sleep' | 'sad' | 'walk';
export type Stage = 'baby' | 'young' | 'adult';

export interface PetMotion {
  react(m: Motion, ms?: number): void;
  set(m: Motion): void;
  /** 触れた方向（-1〜1）。コマ絵なので首は動かさず、何もしない（インターフェースを揃えるため） */
  look(dir: number): void;
  /** なでられている間は true */
  stroke(on: boolean, dir?: number): void;
  /** 歩く（dir: 1=右 / -1=左）。ms 後に待機へ戻る */
  walk(dir: number, ms: number): void;
  readonly motion: Motion;
  readonly drawMs: number;
  destroy(): void;
}

type Frame = { frame: string; page: number; durationMs: number };
type Manifest = { origin: [number, number]; characters: Record<string, { pages: number; actions: Record<string, Frame[]> }> };

const SIZE = 768;
const FADE_MS = 70;        // 動作が切り替わるときの溶かし時間

/** 動作ごとの見せ方：コマとコマの間を溶かす割合と上限(ms)。歩き・睡眠はなめらかに、瞬きなど短いコマはほとんど溶かさない */
const BLEND: Record<string, { frac: number; max: number }> = {
  idle: { frac: 0.5, max: 60 },
  walk: { frac: 0.55, max: 80 },
  petted: { frac: 0.5, max: 90 },
  play: { frac: 0.5, max: 90 },
  eat: { frac: 0.5, max: 90 },
  drink: { frac: 0.5, max: 90 },
  sleep: { frac: 1, max: 700 },
};
/** 待機：素材の待機には頭を大きく傾けるコマ（idle/04〜06）があり不自然なので使わない。瞬き（00→02→03→02→00）だけを間隔をあけて繰り返す */
const IDLE_SEQ: [string, number][] = [
  ['idle/00', 2600], ['idle/02', 70], ['idle/03', 110], ['idle/02', 70],
  ['idle/00', 1700], ['idle/02', 70], ['idle/03', 110], ['idle/02', 70], ['idle/00', 220], ['idle/02', 70], ['idle/03', 110], ['idle/02', 70],
  ['idle/00', 1100],
];

interface Inner {
  api: PetMotion;
  attach(image: HTMLImageElement): void;
  detach(image: HTMLImageElement): void;
  setChar(char: string, walkScale: number): Promise<void>;
  dispose(): void;
}
const slots = new Map<string, Promise<Inner>>();
let failed = false;
let manifestP: Promise<{ m: Manifest; phaser: typeof PhaserNS }> | undefined;
const root = () => `${import.meta.env.BASE_URL}assets/pets/`;

function loadShared() {
  manifestP ??= (async () => {
    const [res, mod] = await Promise.all([fetch(`${root()}pets.json`), import('phaser')]);
    if (!res.ok) throw new Error('pets.json unavailable');
    const phaser = ((mod as unknown as { default?: typeof PhaserNS }).default ?? mod) as typeof PhaserNS;
    return { m: (await res.json()) as Manifest, phaser };
  })().catch((e) => { manifestP = undefined; throw e; });
  return manifestP;
}

/** 静止画（読み込み前・代替表示用）のパス */
export const stillSrc = (char: string) => `${root()}${char}/still.webp`;

/**
 * 素材では「あそぶ」「なでられる」のコマが待機より 2〜15% 小さく描かれている。
 * 待機の絵と輪郭が最もよく重なる倍率（足元を支点、提供素材から実測）で拡大し、動作のたびに縮んで見えないようにする。
 */
const POSE_SCALE: Record<string, { play: number; petted: number }> = {
  cat_baby: { play: 1.11, petted: 1.08 },
  cat_young: { play: 1.1, petted: 1.08 },
  cat_adult: { play: 1.15, petted: 1.1 },
  dog_baby: { play: 1.12, petted: 1.1 },
  dog_young: { play: 1.09, petted: 1.02 },
  dog_adult: { play: 1.11, petted: 1.02 },
};

/**
 * ペット（種類×成長段階）の動きを作る。slot は画面上の置き場所（'home' など）。
 * walkScale：歩きのコマは待機より小さく描かれているので、頭の大きさが揃うよう拡大する倍率（足元を支点）。
 */
export async function createPetSprite(slot: string, char: string, walkScale: number, image: HTMLImageElement): Promise<PetMotion> {
  if (failed) throw new Error('sprite unavailable');
  let p = slots.get(slot);
  if (!p) {
    p = init().catch((e) => { failed = true; slots.delete(slot); throw e; });
    slots.set(slot, p);
  }
  const inner = await p;
  await inner.setChar(char, walkScale);
  inner.attach(image);
  return { ...inner.api, get motion() { return inner.api.motion; }, get drawMs() { return inner.api.drawMs; }, destroy: () => inner.detach(image) };
}

/** 置き場所を片づける（導入で使った2体ぶんの WebGL を解放する） */
export async function disposeSlot(slot: string) {
  const p = slots.get(slot);
  slots.delete(slot);
  if (p) (await p.catch(() => undefined))?.dispose();
}

type Ref = { key: string; frame: string; ms: number };

async function init(): Promise<Inner> {
  const { m: manifest, phaser: Phaser } = await loadShared();
  const holder = document.createElement('div');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let sc!: PhaserNS.Scene;
  let game!: PhaserNS.Game;
  let A!: PhaserNS.GameObjects.Image, B!: PhaserNS.GameObjects.Image, C!: PhaserNS.GameObjects.Image;
  let char = '';
  let walkScale = 1;
  let passive: Motion = 'idle';
  let active: Motion = 'idle';
  let reactTimer: PhaserNS.Time.TimerEvent | undefined;
  let stroking = false;
  let walkDir = 1;
  let current: HTMLImageElement | undefined;
  let sleeping = false;
  const loaded = new Set<string>();

  // 再生の状態
  let seq: Ref[] = [];
  let blend = BLEND.idle!;
  let idx = 0, elapsed = 0, timeScale = 1;
  let scaleY = 1, baseScale = 1, breathAmp = 0, swayAmp = 0;
  let from: { ref: Ref; scale: number } | undefined;     // 切り替え前のコマ
  let mix = 1;                                           // 0→1：切り替えの進み
  let clock = 0;
  const frameKey = (c: string, page: number) => `pet:${c}:${page}`;

  const ready = new Promise<void>((resolve, reject) => {
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: holder,
        width: SIZE,
        height: SIZE,
        transparent: true,
        banner: false,
        disableContextMenu: true,
        audio: { noAudio: true },
        input: { mouse: false, touch: false, keyboard: false, gamepad: false },
        render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'low-power' },
        scale: { mode: Phaser.Scale.NONE },
        fps: { target: 60 },
        scene: {
          key: 'pet-sprite',
          create(this: PhaserNS.Scene) {
            sc = this;
            // 隣り合う2コマを「足し合わせ」で溶かす：不透明な部分は濃さが落ちず、輪郭だけがなめらかに移る
            // 標準の ADD は色を不透明度の二乗で足すため、溶かしの途中で絵が半透明になる。色も不透明度も素直に足す加算を登録する
            let add: number = Phaser.BlendModes.ADD;
            const r = game.renderer as PhaserNS.Renderer.WebGL.WebGLRenderer;
            if (game.renderer.type === Phaser.WEBGL) {
              const gl = r.gl;
              add = r.addBlendMode([gl.ONE, gl.ONE, gl.ONE, gl.ONE], gl.FUNC_ADD);
            }
            const mk = () => sc.add.image(SIZE * manifest.origin[0], SIZE * manifest.origin[1], '__DEFAULT')
              .setOrigin(...manifest.origin).setBlendMode(add).setVisible(false);
            A = mk(); B = mk(); C = mk();
            resolve();
          },
          update(this: PhaserNS.Scene, _t: number, delta: number) { tick(Math.min(delta, 50)); },
        },
      });
    } catch (e) { reject(e as Error); }
  });
  await ready;
  const canvas = game.canvas;
  canvas.className = 'pet-canvas';
  canvas.setAttribute('role', 'img');
  canvas.dataset.renderer = game.renderer.type === Phaser.WEBGL ? 'phaser-webgl' : 'phaser-canvas';

  /** 絵（アトラス）を読み込む */
  async function ensure(c: string) {
    if (loaded.has(c)) return;
    const spec = manifest.characters[c];
    if (!spec) throw new Error(`unknown pet ${c}`);
    await new Promise<void>((resolve, reject) => {
      const onErr = (f: { src: string }) => reject(new Error(`load failed ${f.src}`));
      sc.load.on('loaderror', onErr);
      for (let i = 0; i < spec.pages; i++) sc.load.atlas(frameKey(c, i), `${root()}${c}/page-${i}.webp`, `${root()}${c}/page-${i}.json`);
      sc.load.once('complete', () => { sc.load.off('loaderror', onErr); resolve(); });
      sc.load.start();
    });
    loaded.add(c);
  }

  const pageOf = (c: string, frame: string) => {
    for (const s of Object.values(manifest.characters[c]!.actions)) for (const f of s) if (f.frame === frame) return f.page;
    throw new Error(`frame ${frame}`);
  };
  const sequenceOf = (action: string): Ref[] => {
    const spec = manifest.characters[char]!;
    if (action === 'idle') return IDLE_SEQ.map(([frame, ms]) => ({ key: frameKey(char, pageOf(char, frame)), frame, ms }));
    return spec.actions[action]!.map((f) => ({ key: frameKey(char, f.page), frame: f.frame, ms: f.durationMs }));
  };
  const same = (a: Ref, b: Ref) => a.key === b.key && a.frame === b.frame;

  /** いま見えている主なコマ（切り替えの溶かし元） */
  function snapshot() {
    if (!seq.length) return undefined;
    const cur = seq[idx]!, nxt = seq[(idx + 1) % seq.length]!;
    const w = Math.min(cur.ms * blend.frac, blend.max);
    const t = elapsed > cur.ms - w ? (elapsed - (cur.ms - w)) / w : 0;
    return { ref: t >= 0.5 ? nxt : cur, scale: baseScale };
  }

  function compose() {
    if (!seq.length) return;
    const cur = seq[idx]!, nxt = seq[(idx + 1) % seq.length]!;
    const w = Math.min(cur.ms * blend.frac, blend.max);
    let t = elapsed > cur.ms - w ? (elapsed - (cur.ms - w)) / w : 0;
    if (same(cur, nxt)) t = 0;
    const k = mix;
    // 呼吸と、ごくわずかな揺れ（足元を支点にした伸び縮みと傾き）
    const breath = breathAmp ? Math.sin((clock / 3400) * Math.PI * 2) : 0;
    const sy = baseScale * scaleY * (1 + breath * breathAmp), sx = baseScale * (1 - breath * breathAmp * 0.45);
    const ang = swayAmp ? Math.sin((clock / 7300) * Math.PI * 2) * swayAmp : 0;
    A.setTexture(cur.key, cur.frame).setAlpha((1 - t) * k).setScale(sx, sy).setAngle(ang).setVisible(true);
    if (t > 0) B.setTexture(nxt.key, nxt.frame).setAlpha(t * k).setScale(sx, sy).setAngle(ang).setVisible(true);
    else B.setVisible(false);
    if (from && mix < 1) C.setTexture(from.ref.key, from.ref.frame).setAlpha(1 - mix).setScale(from.scale).setAngle(0).setVisible(true);
    else C.setVisible(false);
  }

  function tick(delta: number) {
    if (reduced || !seq.length) return;
    clock += delta;
    elapsed += delta * timeScale;
    for (let guard = 0; guard < 8 && elapsed >= seq[idx]!.ms; guard++) { elapsed -= seq[idx]!.ms; idx = (idx + 1) % seq.length; }
    if (mix < 1) mix = Math.min(1, mix + delta / FADE_MS);
    compose();
  }

  function play(action: string, o: { scale?: number; sy?: number; breath?: number; sway?: number; speed?: number } = {}) {
    from = reduced ? undefined : snapshot();
    seq = sequenceOf(action);
    blend = BLEND[action] ?? BLEND.idle!;
    idx = 0; elapsed = 0; mix = from ? 0 : 1;
    baseScale = o.scale ?? 1; scaleY = o.sy ?? 1; breathAmp = o.breath ?? 0; swayAmp = o.sway ?? 0; timeScale = o.speed ?? 1;
    compose();
  }

  function begin(m: Motion) {
    active = m;
    canvas.dataset.motion = m;
    if (current) current.dataset.motion = m;
    wake();
    switch (m) {
      case 'walk': play(walkDir > 0 ? 'walk_right' : 'walk_left', { scale: walkScale }); break;
      case 'pet': play('petted', { scale: POSE_SCALE[char]?.petted }); break;
      case 'play': play('play', { scale: POSE_SCALE[char]?.play }); break;
      case 'eat': play('eat'); break;
      case 'drink': play('drink'); break;
      case 'sleep': play('sleep', { breath: 0.006 }); break;
      // しょんぼり：待機の絵のまま、少し低く・ゆっくり
      case 'sad': play('idle', { sy: 0.982, breath: 0.004, speed: 0.6 }); break;
      default: play('idle', { breath: 0.008, sway: 0.35 });
    }
  }

  function wake() { if (sleeping) { game.loop.wake(); sleeping = false; } }

  const api: PetMotion = {
    react(m, ms = 2200) {
      if (reduced) return;
      reactTimer?.remove();
      begin(m);
      reactTimer = sc.time.delayedCall(ms, () => { if (!stroking) begin(passive); else reactTimer = sc.time.delayedCall(400, () => begin(passive)); });
    },
    set(m) {
      passive = m;
      if (!reactTimer || reactTimer.getProgress() >= 1) begin(m);
    },
    look() {},
    stroke(on) {
      if (reduced) return;
      const was = stroking;
      stroking = on;
      if (on) {
        if (active !== 'pet') { reactTimer?.remove(); begin('pet'); }
        reactTimer?.remove();
        reactTimer = sc.time.delayedCall(900, () => { if (!stroking) begin(passive); });
      } else if (was) {
        reactTimer?.remove();
        reactTimer = sc.time.delayedCall(700, () => begin(passive));
      }
    },
    walk(dir, ms) {
      if (reduced) return;
      walkDir = dir >= 0 ? 1 : -1;
      reactTimer?.remove();
      begin('walk');
      reactTimer = sc.time.delayedCall(ms, () => begin(passive));
    },
    get motion() { return active; },
    get drawMs() { return 0; },
    destroy() { /* attach/detach で管理する */ },
  };

  return {
    api,
    async setChar(c, ws) {
      walkScale = ws;
      if (c === char) return;
      await ensure(c);
      char = c;
      reactTimer?.remove();
      seq = []; from = undefined;
      begin(passive);
    },
    attach(image) {
      current = image;
      image.after(canvas);
      image.hidden = true;
      image.dataset.motion = active;
      canvas.setAttribute('aria-label', image.alt);
      wake();
      if (reduced) { sc.time.delayedCall(200, () => { game.loop.sleep(); sleeping = true; }); }
    },
    detach(image) {
      if (current === image) current = undefined;
      canvas.remove();
      image.hidden = false;
      if (!current && !sleeping) { game.loop.sleep(); sleeping = true; }
    },
    dispose() { canvas.remove(); game.destroy(true); },
  };
}
