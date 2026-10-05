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
const ACTION: Record<Exclude<Motion, 'walk'>, string> = { idle: 'idle', pet: 'petted', play: 'play', eat: 'eat', drink: 'drink', sleep: 'sleep', sad: 'idle' };
const FADE_MS = 90;

interface Inner {
  api: PetMotion;
  attach(image: HTMLImageElement): void;
  detach(image: HTMLImageElement): void;
  setChar(char: string): Promise<void>;
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
 * ペット（種類×成長段階）の動きを作る。slot は画面上の置き場所（'home' など）。
 * 同じ slot では Phaser のゲームを使い回し、成長段階が変わったときは絵を読み込み直す。
 */
export async function createPetSprite(slot: string, char: string, image: HTMLImageElement): Promise<PetMotion> {
  if (failed) throw new Error('sprite unavailable');
  let p = slots.get(slot);
  if (!p) {
    p = init().catch((e) => { failed = true; slots.delete(slot); throw e; });
    slots.set(slot, p);
  }
  const inner = await p;
  await inner.setChar(char);
  inner.attach(image);
  return { ...inner.api, get motion() { return inner.api.motion; }, get drawMs() { return inner.api.drawMs; }, destroy: () => inner.detach(image) };
}

/** 置き場所を片づける（導入で使った2体ぶんの WebGL を解放する） */
export async function disposeSlot(slot: string) {
  const p = slots.get(slot);
  slots.delete(slot);
  if (p) (await p.catch(() => undefined))?.dispose();
}

async function init(): Promise<Inner> {
  const { m: manifest, phaser: Phaser } = await loadShared();
  const holder = document.createElement('div');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let sc!: PhaserNS.Scene;
  let game!: PhaserNS.Game;
  let sprite!: PhaserNS.GameObjects.Sprite;
  let ghost!: PhaserNS.GameObjects.Image;
  let char = '';
  let passive: Motion = 'idle';
  let active: Motion = 'idle';
  let reactTimer: PhaserNS.Time.TimerEvent | undefined;
  let stroking = false;
  let walkDir = 1;
  let current: HTMLImageElement | undefined;
  let sleeping = false;
  const loaded = new Set<string>();

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
            ghost = sc.add.image(SIZE * manifest.origin[0], SIZE * manifest.origin[1], '__DEFAULT').setOrigin(...manifest.origin).setAlpha(0).setVisible(false);
            sprite = sc.add.sprite(SIZE * manifest.origin[0], SIZE * manifest.origin[1], '__DEFAULT').setOrigin(...manifest.origin).setVisible(false);
            resolve();
          },
        },
      });
    } catch (e) { reject(e as Error); }
  });
  await ready;
  const canvas = game.canvas;
  canvas.className = 'pet-canvas';
  canvas.setAttribute('role', 'img');
  canvas.dataset.renderer = game.renderer.type === Phaser.WEBGL ? 'phaser-webgl' : 'phaser-canvas';

  const key = (c: string, page: number) => `pet:${c}:${page}`;
  const animKey = (c: string, action: string) => `${c}:${action}`;

  /** 絵（アトラス）を読み込み、動作のアニメーションを登録する */
  async function ensure(c: string) {
    if (loaded.has(c)) return;
    const spec = manifest.characters[c];
    if (!spec) throw new Error(`unknown pet ${c}`);
    await new Promise<void>((resolve, reject) => {
      const onErr = (f: { src: string }) => reject(new Error(`load failed ${f.src}`));
      sc.load.on('loaderror', onErr);
      for (let i = 0; i < spec.pages; i++) sc.load.atlas(key(c, i), `${root()}${c}/page-${i}.webp`, `${root()}${c}/page-${i}.json`);
      sc.load.once('complete', () => { sc.load.off('loaderror', onErr); resolve(); });
      sc.load.start();
    });
    for (const [action, seq] of Object.entries(spec.actions)) {
      sc.anims.create({
        key: animKey(c, action),
        frameRate: 1000,
        repeat: -1,
        frames: seq.map((f) => ({ key: key(c, f.page), frame: f.frame, duration: f.durationMs - 1 })),
      });
    }
    loaded.add(c);
  }

  function play(action: string) {
    const k = animKey(char, action);
    if (sprite.anims.currentAnim?.key === k && sprite.anims.isPlaying) return;
    // 前のコマを残して、新しいコマへ短く溶かす
    if (!reduced && sprite.visible && sprite.frame) {
      sc.tweens.killTweensOf(ghost);
      ghost.setTexture(sprite.texture.key, sprite.frame.name).setAlpha(1).setVisible(true);
      sc.tweens.add({ targets: ghost, alpha: 0, duration: FADE_MS, onComplete: () => ghost.setVisible(false) });
    }
    sprite.setVisible(true).play(k);
    if (reduced) sprite.anims.pause(sprite.anims.currentAnim!.frames[0]);
  }

  function begin(m: Motion) {
    active = m;
    canvas.dataset.motion = m;
    if (current) current.dataset.motion = m;
    wake();
    if (m === 'walk') { play(walkDir > 0 ? 'walk_right' : 'walk_left'); sprite.setAlpha(1).setScale(1); return; }
    play(ACTION[m]);
    // しょんぼり：待機の絵のまま、少し低く・ゆっくり・やや暗く
    sprite.anims.timeScale = m === 'sad' ? 0.55 : 1;
    sprite.setTint(m === 'sad' ? 0xe4e6f2 : 0xffffff);
    sprite.setScale(1, m === 'sad' ? 0.985 : 1);
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
    async setChar(c) {
      if (c === char) return;
      await ensure(c);
      char = c;
      reactTimer?.remove();
      sprite.setVisible(false); ghost.setVisible(false);
      begin(passive);
    },
    attach(image) {
      current = image;
      image.after(canvas);
      image.hidden = true;
      image.dataset.motion = active;
      canvas.setAttribute('aria-label', image.alt);
      wake();
      if (reduced) { sleeping = false; sc.time.delayedCall(200, () => { game.loop.sleep(); sleeping = true; }); }
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
