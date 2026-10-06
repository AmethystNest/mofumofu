import { describe, it, expect } from "vitest";
import { newGame, search, rest, resolveNight, nextDay } from "../src/game";
import { decodeSave } from "../src/platform/save";
import fs from "node:fs";

describe("保存", () => {
  it("乱数の状態ごと往復できる", () => {
    const game = newGame("ハル", "dog", 1, 0);
    search(game);
    rest(game);
    resolveNight(game, 0);
    nextDay(game);
    const back = decodeSave(JSON.stringify({ version: 3, game, journal: [{ day: 1, title: "t", text: "x" }], updatedAt: 3, tutorial: "done" }));
    expect(back?.game).toEqual(game);
    expect(back?.journal.length).toBe(1);
  });
  it("壊れた・欠けた保存は読み込まない", () => {
    const g = newGame("ハル", "cat", 1, 0);
    for (const patch of [{ pet: {} }, { equip: { light: 1 } }, { day: NaN }, { seed: "1" }, { species: "bird" }, { daily: null }, { records: [1] }, { pending: { id: 3 } }, { climate: "max" }])
      expect(decodeSave(JSON.stringify({ version: 3, game: { ...g, ...patch } })), JSON.stringify(patch)).toBeNull();
    expect(decodeSave("broken")).toBeNull();
  });
  it("以前のルールの保存（version 2）は、名前と種類だけを引き継いで DAY 01 から", () => {
    const old = { version: 2, species: "dog", tutorial: "done", updatedAt: 5, journal: [{ day: 3, title: "夜間放送", text: "…" }], game: { v: 1, name: "ポチ", day: 12 } };
    const s = decodeSave(JSON.stringify(old))!;
    expect(s.game.name).toBe("ポチ");
    expect(s.game.species).toBe("dog");
    expect(s.game.day).toBe(1);
    expect(s.tutorial).toBe("feed");
    expect(decodeSave(JSON.stringify({ ...old, game: { name: "" } }))).toBeNull();
  });
});

describe("犬の旧素材", () => {
  it("keeps original head-tilt cadence within the expanded idle clip", () => {
    const m = JSON.parse(fs.readFileSync("public/assets/dog/motions-v1/motions.json", "utf8"));
    expect(m.clips.idle.reduce((n: number, f: { ms: number }) => n + f.ms, 0)).toBe(6370);
    for (const frames of Object.values(m.clips) as { src: string; ms: number }[][])
      for (const f of frames) {
        expect(fs.existsSync("public/assets/dog/" + f.src)).toBe(true);
        expect(f.ms).toBeGreaterThan(0);
      }
  });
});
