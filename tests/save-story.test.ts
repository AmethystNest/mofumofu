import { describe, it, expect } from "vitest";
import { newGame, explore, rest, resolveNight, nextDay } from "../src/core";
import { decodeSave } from "../src/platform/save";
import { stories } from "../src/content/chapter";
import fs from "node:fs";
describe("playable chapter and persistence", () => {
  it("round trips signed RNG state after exploration", () => {
    const game = newGame("ハル", 1);
    explore(game, "street", true);
    expect(game.seed).toBeLessThan(0);
    expect(
      decodeSave(JSON.stringify({ version: 2, game, journal: [] }))?.game,
    ).toEqual(game);
  });
  it("rejects malformed or incomplete saves", () => {
    for (const patch of [
      { dog: {} },
      { pendingNight: { id: "missing" } },
      { inv: { ration: -2 } },
      { day: NaN },
      { seed: "1" },
    ])
      expect(decodeSave(JSON.stringify({ ...newGame(), ...patch }))).toBeNull();
    expect(decodeSave("broken")).toBeNull();
  });
  it("supports both seven-night endings with complete authored choices", () => {
    for (const choice of [0, 1]) {
      const game = newGame("ハル", 1);
      for (let day = 1; day <= 7; day++) {
        const pending = rest(game);
        const story = stories[pending.id];
        expect(story.lines.length).toBeGreaterThan(0);
        expect(story.after.length).toBeGreaterThanOrEqual(
          Math.max(1, story.choices.length),
        );
        resolveNight(game, choice);
        nextDay(game);
      }
      expect(game.day).toBe(8);
      expect(game.chapter).toBe(1);
      expect(game.registered).toBe(choice === 0);
    }
  });
  it("keeps original head-tilt cadence within the expanded idle clip", () => {
    const m = JSON.parse(
      fs.readFileSync("public/assets/dog/motions-v1/motions.json", "utf8"),
    );
    expect(
      m.clips.idle.reduce((n: number, f: { ms: number }) => n + f.ms, 0),
    ).toBe(6370);
    for (const frames of Object.values(m.clips) as {
      src: string;
      ms: number;
    }[][])
      for (const f of frames) {
        expect(fs.existsSync("public/assets/dog/" + f.src)).toBe(true);
        expect(f.ms).toBeGreaterThan(0);
      }
  });
});
