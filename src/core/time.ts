import type { GameState, TimeOfDay } from './types';
import { clamp, log } from './util';

/** 残り行動から時間帯を決める（実時間は使わない） */
export function timeOfDay(st: GameState): TimeOfDay {
  if (st.pendingNight) return 'night';
  if (st.ap <= 0) return 'night';
  const spent = (st.apMax || 3) - st.ap;
  return spent <= 0 ? 'morning' : spent === 1 ? 'noon' : 'evening';
}

export const WELCOME_BACK_HOURS = 4;

/** 久しぶりに戻ったとき：罰は与えず「犬が待っていた」演出のみ。 */
export function welcomeBack(st: GameState, now: number): boolean {
  const h = (now - (st.lastSeen || now)) / 36e5;
  if (h >= WELCOME_BACK_HOURS && !st.pendingNight) {
    st.dog.anx = clamp(st.dog.anx + 3);
    log(st, 'nar', '戻ってくると、{name}が扉の前で待っていた。尻尾が床を打つ音がする。');
    return true;
  }
  return false;
}
