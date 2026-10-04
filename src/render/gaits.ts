/**
 * 犬・猫のリグで共通の「歩く・のびる・ぶるぶる・くんくん」の動き。
 * 体（親コンテナ）の伸び縮み・上下・傾きと、耳・しっぽ・目の目標値だけを Tween で動かす。耳としっぽは
 * 体の動きに遅れて追う（リグ側のばね）ので、体を弾ませるだけでぴょこぴょこ揺れる。
 * k はキャンバスの大きさに合わせた振れ幅の倍率（猫 = 1、犬 = 0.42）。
 * 部屋の中を実際に移動させるのは render/wander.ts（DOM 側）。ここは足踏みの上下動だけを受け持つ。
 */
import type { Motion } from './dog-motion';

export const EXTRA_MOTIONS: Motion[] = ['walk', 'stretch', 'shake', 'sniff'];
/** 自然に挟む「ふとした仕草」とその長さ(ms) */
export const FIDGETS: { m: Motion; ms: number }[] = [
  { m: 'stretch', ms: 2000 },
  { m: 'shake', ms: 1000 },
  { m: 'sniff', ms: 1900 },
];

type Tw = (cfg: Record<string, unknown>) => unknown;
export interface GaitKit {
  S: Record<string, number>;
  tw: Tw;
  chain: Tw;
  eyes: (blink: number, squint: number, ms?: number) => void;
  settle: (ms?: number, over?: Record<string, number>) => void;
}

export function enterExtra(m: Motion, { S, tw, chain, eyes, settle }: GaitKit, k: number) {
  if (m === 'walk') {
    // とことこ：一歩ごとに少し沈み → 伸びて浮き → 着地。体は左右に交互に傾き、しっぽは立つ
    eyes(0, 0);
    settle(200, { tail: -8 * k });
    tw({ targets: S, earBase: 3, duration: 180, ease: 'Sine.Out' });
    tw({ targets: S, lean: { from: -2.4, to: 2.4 }, duration: 380, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    tw({ targets: S, tail: { from: -13 * k, to: -3 * k }, duration: 380, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    chain({ targets: S, loop: -1, tweens: [
      { sy: 0.955, bodyY: 1 * k, duration: 70, ease: 'Quad.Out' },
      { sy: 1.035, bodyY: -10 * k, duration: 130, ease: 'Quad.Out' },
      { sy: 1.01, bodyY: -1 * k, duration: 110, ease: 'Quad.In' },
    ] });
  } else if (m === 'stretch') {
    // のび：しゃがんで、ゆっくり伸び上がり、目を閉じたまま少し止まって、ふっと戻る
    eyes(1, 0, 260);
    tw({ targets: S, earBase: -6, tail: -15 * k, duration: 500, ease: 'Sine.Out' });
    chain({ targets: S, tweens: [
      { sy: 0.95, bodyY: 1.5 * k, duration: 260, ease: 'Sine.Out' },
      { sy: 1.1, bodyY: -2 * k, duration: 760, ease: 'Sine.InOut' },
      { sy: 1.1, bodyY: -2 * k, duration: 380 },
      { sy: 0.97, bodyY: 1 * k, duration: 260, ease: 'Quad.In' },
      { sy: 1, bodyY: 0, duration: 340, ease: 'Elastic.Out' },
    ] });
    tw({ targets: S, blink: 0, delay: 1500, duration: 240, ease: 'Sine.Out' });
  } else if (m === 'shake') {
    // ぶるぶる：目を閉じ、体を細かく左右に振る。耳が大きくはためく
    eyes(1, 0, 90);
    tw({ targets: S, lean: { from: -7, to: 7 }, duration: 58, ease: 'Sine.InOut', yoyo: true, repeat: 13 });
    tw({ targets: S, bodyX: { from: -4 * k, to: 4 * k }, duration: 58, ease: 'Sine.InOut', yoyo: true, repeat: 13 });
    tw({ targets: S, earBase: { from: -9, to: 11 }, duration: 58, ease: 'Sine.InOut', yoyo: true, repeat: 13 });
    tw({ targets: S, blink: 0, delay: 780, duration: 160 });
  } else if (m === 'sniff') {
    // くんくん：うつむき加減で、小さく上下しながら左右を嗅ぐ
    eyes(0.25, 0, 200);
    tw({ targets: S, gy: 1.1, duration: 200, ease: 'Sine.Out' });
    tw({ targets: S, gx: { from: -0.9, to: 0.9 }, duration: 620, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    tw({ targets: S, lean: { from: -1.6, to: 1.6 }, duration: 620, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    chain({ targets: S, loop: -1, tweens: [
      { sy: 0.982, bodyY: 1 * k, duration: 110, ease: 'Sine.InOut' },
      { sy: 1.008, bodyY: -1.8 * k, duration: 110, ease: 'Sine.InOut' },
    ] });
    tw({ targets: S, tail: { from: -4 * k, to: 4 * k }, duration: 260, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
  }
}
