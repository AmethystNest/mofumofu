import { describe, expect, it } from "vitest";
import { newGame, type GameState, type NightId } from "../src/core";
import { FULL_RECORD, nightStory, phaseOfDay, voice } from "../src/content/story";

const NIGHTS: NightId[] = ["n1", "n2", "n3", "n3b", "n4", "n5", "n6", "ch1", "vig"];
const FORBIDDEN = ["AI", "ＡＩ", "人工知能", "30日", "エンディング", "犬", "猫", "ホログラム", "クリア", "ミッション", "報酬"];
function at(day: number, trust = 40): GameState {
  const g = newGame("ミケ", 1);
  g.day = day;
  g.dog.trust = trust;
  return g;
}

describe("物語の本文", () => {
  it("1〜40日目、すべての夜に本文があり、選択肢と結果の数が合う", () => {
    for (let d = 1; d <= 40; d++) {
      const ids: NightId[] = d <= 7 ? NIGHTS.filter((i) => i !== "vig") : ["vig"];
      for (const id of ids) {
        const s = nightStory(id, at(d));
        expect(s.title, `${id}/${d}`).toBeTruthy();
        expect(s.lines.length, `${id}/${d}`).toBeGreaterThan(0);
        expect(s.after.length, `${id}/${d}`).toBeGreaterThanOrEqual(Math.max(1, s.choices.length));
        if (s.subs) expect(s.subs.length).toBe(s.choices.length);
      }
    }
  });
  it("書いてはいけない言葉を含まない（主人公の正体・世界の原因・期間・結末の強調など）", () => {
    const all: string[] = [...FULL_RECORD];
    for (let d = 1; d <= 40; d++)
      for (const id of NIGHTS) {
        const s = nightStory(id, at(d, d % 2 ? 10 : 60));
        all.push(s.title, ...s.lines, ...s.choices, ...s.after, ...(s.subs ?? []));
      }
    for (const k of ["feed", "feedHalf", "feedSelf", "pet", "play", "explore", "idle", "morning"] as const)
      for (const d of [1, 9, 16, 25]) for (let i = 0; i < 6; i++) all.push(voice(k, at(d)));
    for (const text of all) for (const w of FORBIDDEN) expect(text, w).not.toContain(w);
  });
  it("DAY 1 の記録には、続きの「……それから、あなたも。」を出さない", () => {
    for (let d = 1; d <= 29; d++)
      for (const id of NIGHTS) {
        const s = nightStory(id, at(d));
        for (const t of [...s.lines, ...s.after]) expect(t).not.toContain("それから、あなたも");
      }
    expect(FULL_RECORD.join("")).toContain("それから、あなたも");
  });
  it("記録の復元は 10・17・24 日目に進み、30 日目に完全になる", () => {
    const pct = (d: number) => nightStory("vig", at(d)).record;
    expect([10, 17, 24, 30].map(pct)).toEqual([41, 62, 83, 100]);
    expect(pct(11)).toBeUndefined();
  });
  it("認識の段階は日数で進む（7・14・22 日で切り替わる）", () => {
    expect([1, 7, 8, 14, 15, 22, 23, 40].map(phaseOfDay)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});
