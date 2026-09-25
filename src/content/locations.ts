import type { LocId, LootId } from '../core/types';

export interface Location {
  name: string;
  desc: string;
  /** 巡回ドローンに遭遇する確率 */
  danger: number;
  /** [拾えるもの, 重み] */
  loot: ReadonlyArray<readonly [LootId, number]>;
  intro: readonly string[];
}

export const LOCS: Record<LocId, Location> = {
  street: {
    name: '旧商店街', desc: '静か。食べ物が残っていることがある。', danger: 0.15,
    loot: [['can', 5], ['dogfood', 3], ['ration', 1], ['none', 3]],
    intro: [
      'シャッターの降りた商店街を歩いた。自動音声の「いらっしゃいませ」だけが、まだ生きている。',
      '看板の文字が半分剥がれた薬局の前を通った。店内の棚は、ほとんど空だった。',
    ],
  },
  parking: {
    name: '地下駐車場', desc: '巡回ドローンが来る。道具が見つかりやすい。', danger: 0.3,
    loot: [['can', 3], ['dogfood', 2], ['ball', 2], ['blanket', 2], ['map', 2], ['none', 3]],
    intro: [
      '地下駐車場は冷たく、音がよく響いた。止まったままの車の中を一台ずつ覗いた。',
      '非常灯の緑色だけが続く地下へ降りた。乾いた落ち葉が足元で鳴った。',
    ],
  },
  tower: {
    name: '管理塔の外周', desc: '監視が厳しい。配給の予備があるらしい。', danger: 0.45,
    loot: [['ration', 2], ['can', 3], ['dogfood', 2], ['none', 4]],
    intro: [
      '管理塔の足元は、街で一番清潔だった。誰も歩かない歩道を、清掃ロボットが今日も磨いている。',
      '塔のガラス面に、自分と犬の姿が小さく映った。',
    ],
  },
};

export const LOC_IDS = Object.keys(LOCS) as LocId[];
