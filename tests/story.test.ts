import { describe, expect, it } from "vitest";
import { newGame, rest, resolveNight, nextDay, NIGHT_CHOICES, type Ending, type GameState } from "../src/game";
import { BLANKET_LINE, CORE_LINE, DISMANTLE_LINE, EVENT_LINE, FULL_RECORD, PLACE_LOOK, PLACE_NAME, absenceLine, awayLine, endingText, findText, learnedLine, nightStory, observeLines, phaseOfDay, voice, wantCue, wantMetLine, wantNight } from "../src/content/story";
import { WANTS, observe } from "../src/game";

const FORBIDDEN = ["AI", "ＡＩ", "人工知能", "30日", "エンディング", "犬", "猫", "ホログラム", "クリア", "ミッション", "報酬", "TRUE"];
const ENDINGS: Ending[] = ["together", "lastlight", "return", "waiting", "survival"];
function at(day: number, species: "dog" | "cat" = "cat"): GameState {
  const g = newGame("ミケ", species, 1, 0);
  g.day = day;
  return g;
}
function allText(): string[] {
  const all: string[] = [...FULL_RECORD, CORE_LINE];
  for (const sp of ["dog", "cat"] as const) {
    for (let d = 1; d <= 40; d++) {
      const s = nightStory(at(d, sp));
      all.push(s.title, ...s.lines, ...s.choices, ...s.after, ...(s.subs ?? []));
    }
    for (const e of ENDINGS) { const t = endingText(e, at(30, sp)); all.push(t.title, ...t.lines); }
    for (const id of ["r_ash", "r_sound", "r_lights", "r_tower", "r_bird", "m_note", "m_photo", "m_leash", "m_calendar", "m_collar"]) all.push(findText(id, at(5, sp)));
    for (const k of Object.keys(EVENT_LINE)) if (k !== "arm") all.push(EVENT_LINE[k]!(at(5, sp)));
    all.push(...Object.values(PLACE_NAME), ...Object.values(PLACE_LOOK), BLANKET_LINE, DISMANTLE_LINE, absenceLine(at(5, sp)), awayLine(at(5, sp)));
    for (const w of WANTS) for (const d of [2, 3, 9, 16, 25]) {
      const g = at(d, sp); g.want = w; all.push(wantCue(g), learnedLine(w, g), wantNight(g));
      g.daily.wantMet = true; all.push(wantNight(g)); const m = wantMetLine(g); if (m) all.push(m);
    }
    for (const [s1, d1, i1] of [[10, 10, 80], [50, 50, 50], [90, 80, 10]]) { const g = at(5, sp); g.pet.stress = s1!; g.pet.depend = d1!; g.pet.indep = i1!; for (const o of observeLines(observe(g), g)) all.push(o.label, o.text); }
    for (const k of ["feed", "water", "pet", "play", "idle", "morning"] as const)
      for (const d of [1, 9, 16, 25]) for (let i = 0; i < 6; i++) all.push(voice(k, at(d, sp)));
  }
  return all;
}

describe("物語の本文", () => {
  it("1〜40日目、すべての夜に本文があり、選択肢・補足・結果の数がルールと合う", () => {
    for (const sp of ["dog", "cat"] as const)
      for (let d = 1; d <= 40; d++) {
        const s = nightStory(at(d, sp));
        expect(s.title, `${d}`).toBeTruthy();
        expect(s.lines.length, `${d}`).toBeGreaterThan(0);
        expect(s.choices.length, `${d}`).toBe(NIGHT_CHOICES[`d${d}`] ?? 0);
        expect(s.after.length, `${d}`).toBeGreaterThanOrEqual(Math.max(1, s.choices.length));
        if (s.subs) expect(s.subs.length).toBe(s.choices.length);
      }
  });
  it("書いてはいけない言葉を含まない（主人公の正体・期間・種類名・結末の強調など）", () => {
    for (const text of allText()) for (const w of FORBIDDEN) expect(text, w).not.toContain(w);
  });
  it("空の文がない（すべての手がかり・できごとに本文がある）", () => {
    for (const text of allText()) expect(text.length).toBeGreaterThan(0);
  });
  it("「……それから、あなたも。」は 30 日目の復元まで出さない（結末の中の引用を除く）", () => {
    for (let d = 1; d <= 40; d++) {
      const s = nightStory(at(d));
      for (const t of [...s.lines, ...s.after]) expect(t).not.toContain("それから、あなたも");
    }
    expect(FULL_RECORD.join("")).toContain("それから、あなたも");
    expect(nightStory(at(30)).record).toBe(true);
    expect(nightStory(at(29)).record).toBeFalsy();
  });
  it("結末は 5 種類あり、生存だけの結末にだけ「核の一文」が出ない", () => {
    const titles = new Set(ENDINGS.map((e) => endingText(e, at(30)).title));
    expect(titles.size).toBe(5);
    for (const e of ENDINGS) expect(endingText(e, at(30)).lines.includes(CORE_LINE)).toBe(e !== "survival");
  });
  it("犬と猫で書き分けた夜がある（待つ／戻る）", () => {
    expect(nightStory(at(6, "dog")).title).not.toBe(nightStory(at(6, "cat")).title);
  });
  it("認識の段階は日数で進む（7・14・22 日で切り替わる）", () => {
    expect([1, 7, 8, 14, 15, 22, 23, 40].map(phaseOfDay)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it("ルールの夜と物語の夜が 30 日通しで噛み合う（選択の数・結末の決定）", () => {
    for (const sp of ["dog", "cat"] as const) {
      const g = newGame("ハル", sp, 7, 0);
      for (let d = 1; d <= 31; d++) {
        rest(g);
        const s = nightStory(g);
        resolveNight(g, s.choices.length ? 1 : 0);
        nextDay(g);
      }
      expect(g.day).toBe(32);
      expect(ENDINGS).toContain(g.ending);
    }
  });
});
