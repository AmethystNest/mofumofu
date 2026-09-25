import type { GameState, LogKind } from './types';

export const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(v)));

/** {name} を犬の名前に置き換える。名前に $ が含まれても置換パターンとして解釈しない。 */
export const fmt = (st: Pick<GameState, 'name'>, s: string): string => s.replace(/\{name\}/g, () => st.name);

export const LOG_MAX = 60;

export function log(st: GameState, k: LogKind, t: string): void {
  st.log.push({ k, t: fmt(st, t), d: st.day });
  if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
}
