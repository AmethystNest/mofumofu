/** ゲーム状態の型。保存形式（v1）は haikyu.html のプロトタイプと互換。 */

export type LogKind = 'ai' | 'nar' | 'sys';
export interface LogEntry { k: LogKind; t: string; d: number }

export type ItemId = 'ration' | 'can' | 'dogfood';
export type GearId = 'ball' | 'blanket' | 'map';
export type LootId = ItemId | GearId | 'none';
export type LocId = 'street' | 'parking' | 'tower';
export type FeedTarget = 'dog' | 'half' | 'me';
export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night';
export type NightId = 'n1' | 'n2' | 'n3' | 'n3b' | 'n4' | 'n5' | 'n6' | 'ch1' | 'vig';

export interface DogStats {
  /** おなか 0-100 */ full: number;
  /** げんき 0-100 */ energy: number;
  /** 信頼 0-100 */ trust: number;
  /** 不安 0-100（UIでは 安心 = 100 - 不安） */ anx: number;
}

export interface PendingNight {
  id: NightId;
  lines: string[];
  text: string[];
  resolved: boolean;
  result: string[];
}

export interface GameState {
  v: number;
  name: string;
  day: number;
  ap: number;
  apMax?: number;
  dog: DogStats;
  me: { hp: number; collapsed: boolean };
  inv: Record<ItemId, number>;
  gear: Record<GearId, boolean>;
  daily: { pets: number; played: boolean; explored: boolean; dogAte: boolean };
  flags: { tag?: 'keep' | 'remove'; lied?: boolean; silent?: boolean; vig?: number };
  seen: NightId[];
  registered: boolean | null;
  chapter: number;
  stats: { explores: number };
  pendingNight: PendingNight | null;
  seed: number;
  log: LogEntry[];
  lastSeen: number;
}

/** ステータス変化の表示用（例：「信頼 +1」） */
export interface Fx { label: string; d: number }

export type Fail = { ok: false; msg: string };
export type FeedResult = Fail | { ok: true; fx: Fx[]; toDog: boolean };
export type PlayResult = Fail | { ok: true; fx: Fx[] };
export type ExploreResult =
  | Fail
  | { ok: true; lines: string[]; found: Partial<Record<LootId, number>>; caught: boolean; withDog: boolean };
