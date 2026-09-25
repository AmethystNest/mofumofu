/** core のシミュレーション：値の範囲・日付の進行・セーブ往復・バランスの回帰確認 */
import { describe, expect, it } from 'vitest';
import * as Core from '../src/core';
import type { GameState, ItemId, LocId } from '../src/core';

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(st: GameState) {
  const vals = [st.dog.full, st.dog.energy, st.dog.trust, st.dog.anx, st.me.hp];
  for (const v of vals) {
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  }
  for (const n of Object.values(st.inv)) { expect(Number.isInteger(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(0); }
  expect(st.ap).toBeGreaterThanOrEqual(0);
  expect(st.ap).toBeLessThanOrEqual(3);
  expect(st.log.length).toBeLessThanOrEqual(60);
  expect(Number.isNaN(st.seed)).toBe(false);
}

/** 丁寧な世話：毎日なでる3回・遊ぶ・犬と探索、ごはんは半分こ中心 */
function carefulDay(st: GameState) {
  for (let i = 0; i < 3; i++) Core.pet(st);
  const feedDog = () => {
    const order: [ItemId, 'dog' | 'half'][] = [['dogfood', 'dog'], ['can', 'dog'], ['ration', 'half']];
    for (const [item, t] of order) if (st.inv[item] > 0 && st.dog.full < 70) Core.feed(st, item, t);
  };
  feedDog();
  if (st.me.hp < 40 && st.inv.can > 0) Core.feed(st, 'can', 'me');
  Core.play(st);
  const loc: LocId = st.gear.blanket && st.gear.ball ? 'street' : 'parking';
  Core.explore(st, loc, Core.canDogCome(st));
  feedDog();
  Core.play(st);
}

/** 放置に近い世話：なでない・遊ばない、配給は自分で食べる（引き継ぎ書の「雑な世話 約47」より厳しい条件） */
function carelessDay(st: GameState) {
  if (st.inv.ration > 0) Core.feed(st, 'ration', 'me');
  if (st.dog.full < 15 && st.inv.can > 0) Core.feed(st, 'can', 'dog');
  Core.explore(st, 'street', false);
}

function runDays(policy: (st: GameState) => void, seed: number, days: number, pickChoice: (st: GameState) => number) {
  const st = Core.newGame('ハル', seed, 0);
  while (st.day <= days) {
    policy(st);
    Core.rest(st);
    Core.resolveNight(st, pickChoice(st));
    if (st.day === 7) return { st, trust7: st.dog.trust, days };
    Core.nextDay(st);
  }
  return { st, trust7: st.dog.trust, days };
}

describe('シミュレーション', () => {
  it('20日×600回：範囲外・NaNなし、日付進行とセーブ往復が正常', () => {
    for (let run = 0; run < 600; run++) {
      const r = rng(run + 1);
      let st = Core.newGame('ハル', run, 0);
      for (let day = 1; day <= 20; day++) {
        expect(st.day).toBe(day);
        const nActs = Math.floor(r() * 8);
        for (let i = 0; i < nActs; i++) {
          const x = r();
          if (x < 0.3) Core.feed(st, (['ration', 'can', 'dogfood'] as const)[Math.floor(r() * 3)]!, (['dog', 'half', 'me'] as const)[Math.floor(r() * 3)]!);
          else if (x < 0.5) Core.pet(st);
          else if (x < 0.7) Core.play(st);
          else Core.explore(st, Core.LOC_IDS[Math.floor(r() * 3)]!, r() < 0.6);
          checkInvariants(st);
        }
        Core.rest(st);
        expect(Core.timeOfDay(st)).toBe('night');
        Core.resolveNight(st, Math.floor(r() * 2));
        expect(Core.nextDay(st)).toBe(true);
        checkInvariants(st);
        const back = Core.migrate(JSON.parse(JSON.stringify(st)));
        expect(back).toEqual(st);
        st = back!;
      }
      expect(st.chapter).toBe(1);
      expect(st.registered).not.toBeNull();
    }
  }, 60_000);

  it('バランス（叩き台の回帰）：丁寧なら7日目の信頼は高く、放置に近いと低い', () => {
    const N = 200;
    const register = () => 1; // 夜の選択は常に2番目（ch1 では「登録しない」）
    let care = 0, rough = 0;
    for (let s = 0; s < N; s++) {
      care += runDays(carefulDay, s, 7, register).trust7;
      rough += runDays(carelessDay, s, 7, () => 0).trust7;
    }
    care /= N; rough /= N;
    // 引き継ぎ書の記録：丁寧 92〜99
    expect(care).toBeGreaterThanOrEqual(85);
    expect(rough).toBeLessThan(care - 25);
    console.log(`7日目の信頼 平均：丁寧 ${care.toFixed(1)} / 放置 ${rough.toFixed(1)}`);
  });

  it('夜の選択肢がない日は resolveNight(0) で進む', () => {
    const st = Core.newGame('ハル', 1, 0);
    Core.rest(st); Core.resolveNight(st, 0); Core.nextDay(st); // day2 = n2（選択肢なし）
    Core.rest(st);
    expect(st.pendingNight!.id).toBe('n2');
    expect(Core.nightChoices(st)).toEqual([]);
    Core.resolveNight(st, 0);
    expect(Core.nextDay(st)).toBe(true);
    expect(st.day).toBe(3);
  });

  it('名前に $ が含まれても壊れない', () => {
    const st = Core.newGame('$&ポチ', 1, 0);
    expect(st.log[1]!.t).toContain('$&ポチ');
  });

  it('不在時は罰を与えず、待っていた演出のみ', () => {
    const t0 = 1_750_000_000_000;
    const st = Core.newGame('ハル', 1, t0);
    const before = { ...st.dog };
    expect(Core.welcomeBack(st, t0 + 3 * 36e5)).toBe(false);
    expect(Core.welcomeBack(st, t0 + 100 * 36e5)).toBe(true);
    expect(st.dog.full).toBe(before.full);
    expect(st.dog.trust).toBe(before.trust);
  });
});
