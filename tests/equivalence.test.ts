/**
 * 移植の等価性：同じシード・同じ操作列を、プロトタイプの CORE と TS 版の core に与え、
 * 毎ステップで戻り値と状態全体が一致することを確認する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Core from '../src/core';
import type { FeedTarget, GameState, ItemId, LocId } from '../src/core';
import { loadPrototypeCore } from './prototype';

const Proto = loadPrototypeCore();
const NOW = 1_750_000_000_000;

/** 操作を選ぶための乱数（ゲームの乱数とは別系統） */
function driver(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Op =
  | ['feed', ItemId, FeedTarget] | ['pet'] | ['play'] | ['explore', LocId, boolean]
  | ['rest'] | ['resolve', number] | ['nextDay'] | ['roundtrip'] | ['welcomeBack', number];

function chooseOp(st: GameState, r: () => number): Op {
  if (st.pendingNight) {
    if (!st.pendingNight.resolved) return ['resolve', Math.floor(r() * 3)];
    return ['nextDay'];
  }
  const x = r();
  const items: ItemId[] = ['ration', 'can', 'dogfood'];
  const targets: FeedTarget[] = ['dog', 'half', 'me'];
  const locs: LocId[] = ['street', 'parking', 'tower'];
  if (x < 0.25) return ['feed', items[Math.floor(r() * 3)]!, targets[Math.floor(r() * 3)]!];
  if (x < 0.4) return ['pet'];
  if (x < 0.55) return ['play'];
  if (x < 0.75) return ['explore', locs[Math.floor(r() * 3)]!, r() < 0.7];
  if (x < 0.78) return ['roundtrip'];
  if (x < 0.8) return ['welcomeBack', Math.floor(r() * 10)];
  return ['rest'];
}

function apply(C: any, st: any, op: Op): { st: any; ret: unknown } {
  switch (op[0]) {
    case 'feed': return { st, ret: C.feed(st, op[1], op[2]) };
    case 'pet': return { st, ret: C.pet(st) };
    case 'play': return { st, ret: C.play(st) };
    case 'explore': return { st, ret: C.explore(st, op[1], op[2]) };
    case 'rest': return { st, ret: C.rest(st) };
    case 'resolve': return { st, ret: C.resolveNight(st, op[1]) };
    case 'nextDay': return { st, ret: C.nextDay(st) };
    case 'roundtrip': { const s2 = C.migrate(JSON.parse(JSON.stringify(st))); return { st: s2, ret: s2 != null }; }
    case 'welcomeBack': return { st, ret: C.welcomeBack(st, st.lastSeen + op[1] * 36e5) };
  }
}

const snapshot = (C: any, st: any) => ({
  st: JSON.parse(JSON.stringify(st)),
  tod: C.timeOfDay(st),
  canDog: C.canDogCome(st),
  locs: ['street', 'parking', 'tower'].map(l => C.locUnlocked(st, l)),
  choices: C.nightChoices(st),
});

describe('プロトタイプとの等価性', () => {
  beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(NOW); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('newGame の初期状態が一致する', () => {
    for (const seed of [0, 1, 42, 123456789, -5]) {
      expect(Core.newGame('ハル', seed)).toEqual(Proto.newGame('ハル', seed));
    }
    expect(Core.newGame('', 7)).toEqual(Proto.newGame('', 7));
    expect(Core.newGame('とても長い名前の犬です', 7)).toEqual(Proto.newGame('とても長い名前の犬です', 7));
  });

  it('ランダムな操作列（300本×最大40日）で毎ステップ一致する', () => {
    let steps = 0, maxDay = 0;
    for (let run = 0; run < 300; run++) {
      const r = driver(run * 7919 + 13);
      let a: any = Core.newGame('ポチ', run);
      let b: any = Proto.newGame('ポチ', run);
      for (let i = 0; i < 400 && a.day <= 40; i++) {
        const op = chooseOp(a, r);
        const ra = apply(Core, a, op), rb = apply(Proto, b, op);
        a = ra.st; b = rb.st;
        const sa = JSON.stringify([ra.ret, snapshot(Core, a)]), sb = JSON.stringify([rb.ret, snapshot(Proto, b)]);
        // 速度のため文字列で比較し、ずれたときだけ差分を出す
        if (sa !== sb) expect(JSON.parse(sa), `run ${run} step ${i} ${op.join(' ')}`).toEqual(JSON.parse(sb));
        steps++;
      }
      maxDay = Math.max(maxDay, a.day);
    }
    expect(steps).toBeGreaterThan(50_000);
    expect(maxDay).toBeGreaterThan(20);
  }, 60_000);

  it('プロトタイプのセーブを読み込める（v1 互換）', () => {
    const b = Proto.newGame('ハル', 3);
    Proto.explore(b, 'parking', true);
    Proto.rest(b);
    const a = Core.migrate(JSON.parse(JSON.stringify(b)));
    expect(a).toEqual(Proto.migrate(JSON.parse(JSON.stringify(b))));
    expect(Core.migrate({ v: 2 })).toBeNull();
    expect(Core.migrate(null)).toBeNull();
  });
});
