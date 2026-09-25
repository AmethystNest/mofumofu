import type { GameState } from './types';

/** シード付き乱数（mulberry32）。状態の seed を進めるので、同じシードなら同じ展開になる。 */
export function rand(st: Pick<GameState, 'seed'>): number {
  st.seed = (st.seed + 0x6d2b79f5) | 0;
  let t = st.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function pick<T>(st: Pick<GameState, 'seed'>, arr: readonly T[]): T {
  return arr[Math.floor(rand(st) * arr.length)]!;
}
