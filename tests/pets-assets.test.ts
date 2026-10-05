import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stageForDay } from "../src/render/pets";

const root = new URL("../public/assets/pets/", import.meta.url).pathname;
type Frame = { frame: string; page: number; durationMs: number };
const manifest = JSON.parse(readFileSync(root + "pets.json", "utf8")) as {
  characters: Record<string, { pages: number; actions: Record<string, Frame[]> }>;
  repairs: Record<string, string[]>;
};
const CHARS = ["cat_baby", "cat_young", "cat_adult", "dog_baby", "dog_young", "dog_adult"];
const ACTIONS = ["idle", "walk_right", "walk_left", "eat", "drink", "play", "petted", "sleep"];

describe("取り込んだペット素材（6体 × 8動作）", () => {
  it("全キャラ・全動作がそろい、コマが空でない", () => {
    expect(Object.keys(manifest.characters).sort()).toEqual([...CHARS].sort());
    for (const c of CHARS) for (const a of ACTIONS) expect(manifest.characters[c]!.actions[a]?.length, `${c}/${a}`).toBeGreaterThan(3);
  });
  it("使うコマがすべてアトラスにあり、絵の入ったページが存在する", () => {
    for (const c of CHARS) {
      const spec = manifest.characters[c]!;
      const atlases = Array.from({ length: spec.pages }, (_, i) => {
        expect(existsSync(`${root}${c}/page-${i}.webp`), `${c} page-${i}.webp`).toBe(true);
        return JSON.parse(readFileSync(`${root}${c}/page-${i}.json`, "utf8")).frames as Record<string, { frame: { w: number; h: number } }>;
      });
      for (const seq of Object.values(spec.actions))
        for (const f of seq) {
          const fr = atlases[f.page]![f.frame];
          expect(fr, `${c} ${f.frame}`).toBeDefined();
          expect(fr!.frame.w * fr!.frame.h).toBeGreaterThan(0);
          expect(f.durationMs).toBeGreaterThan(0);
        }
      expect(existsSync(`${root}${c}/still.webp`)).toBe(true);
    }
  });
  it("動作ごとの長さは猫と犬で同じ（同じ時間の流れで動く）", () => {
    for (const a of ACTIONS) {
      const total = (c: string) => manifest.characters[c]!.actions[a]!.reduce((s, f) => s + f.durationMs, 0);
      expect(new Set(CHARS.map(total)).size, a).toBe(1);
    }
  });
  it("欠けて読めなかった絵の復元内容を記録している（cat_adult）", () => {
    expect(manifest.repairs.cat_adult!.length).toBe(8);
  });
});

describe("成長段階", () => {
  it("1〜7日＝赤ちゃん、8〜21日＝中間、22日〜＝成体", () => {
    expect([1, 7, 8, 21, 22, 40].map(stageForDay)).toEqual(["baby", "baby", "young", "young", "adult", "adult"]);
  });
});
