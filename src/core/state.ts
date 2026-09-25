import { AI_MORNING } from '../content/lines';
import { pick } from './rng';
import type { GameState } from './types';
import { log } from './util';

/** 保存形式のバージョン。プロトタイプ（haikyu.html）の v1 と互換。 */
export const VERSION = 1;
export const DEFAULT_NAME = 'ハル';
export const NAME_MAX = 8;

export function newGame(name?: string, seed?: number, now: number = Date.now()): GameState {
  const st: GameState = {
    v: VERSION, name: (name || DEFAULT_NAME).slice(0, NAME_MAX), day: 1, ap: 3,
    dog: { full: 35, energy: 55, trust: 5, anx: 60 },
    me: { hp: 70, collapsed: false },
    inv: { ration: 0, can: 1, dogfood: 0 },
    gear: { ball: false, blanket: false, map: false },
    daily: { pets: 0, played: false, explored: false, dogAte: false },
    flags: {}, seen: [], registered: null, chapter: 0,
    stats: { explores: 0 }, pendingNight: null,
    seed: (seed == null ? now & 0x7fffffff : seed) | 0,
    log: [], lastSeen: now,
  };
  morning(st, true);
  return st;
}

/** 保存データを現行形式へ。読めないものは null。 */
export function migrate(obj: unknown): GameState | null {
  if (!obj || typeof obj !== 'object' || (obj as { v?: unknown }).v !== VERSION) return null;
  const o = obj as Partial<GameState>;
  const base = newGame(o.name || DEFAULT_NAME, 1);
  const st: GameState = Object.assign(base, o);
  st.dog = Object.assign(base.dog, o.dog);
  st.me = Object.assign(base.me, o.me);
  st.inv = Object.assign({ ration: 0, can: 0, dogfood: 0 }, o.inv);
  st.gear = Object.assign({ ball: false, blanket: false, map: false }, o.gear);
  st.daily = Object.assign({ pets: 0, played: false, explored: false, dogAte: false }, o.daily);
  return st;
}

/** 朝：行動を回復し、配給を受け取る。 */
export function morning(st: GameState, first: boolean): void {
  st.ap = st.me.collapsed ? 1 : 3;
  st.apMax = st.ap;
  st.me.collapsed = false;
  st.daily = { pets: 0, played: false, explored: false, dogAte: false };
  const n = st.registered ? 2 : 1;
  st.inv.ration += n;
  if (first) {
    log(st, 'ai', 'おはようございます、市民番号0417。本日の配給、一名分をお届けしました。');
    log(st, 'nar', '玄関の前に、いつもの小さな箱。昨夜拾った犬——{name}が、その匂いを嗅いでいる。');
    log(st, 'sys', '犬をタップするとなでられます。ごはんは行動を使いません。');
    return;
  }
  const who = st.registered ? '市民番号0417、0418' : '市民番号0417';
  log(st, 'ai', `${who}。本日の配給、${n === 2 ? '二名分' : '一名分'}をお届けしました。${pick(st, AI_MORNING)}`);
  if (st.day === 8 && st.chapter === 1) {
    log(st, 'sys', '第1章 おわり。この先も{name}との日々は続きます（第2章は今後追加予定）。');
  }
}
