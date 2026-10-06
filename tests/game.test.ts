import { describe, expect, it } from "vitest";
import * as G from "../src/game";

type Strat = (st: G.GameState, r: () => number) => void;
/** 1日の過ごし方（戦略）。夜の選択は choice で決める */
function run(species: G.Species, day: Strat, choice: (id: string) => number, seed = 1) {
  const st = G.newGame("ミケ", species, seed);
  let rr = seed;
  const r = () => ((rr = (rr * 16807) % 2147483647) / 2147483647);
  const trace: number[] = [];
  for (let i = 0; i < 30; i++) {
    day(st, r);
    G.rest(st);
    G.resolveNight(st, choice(st.pending!.id));
    G.nextDay(st);
    trace.push(st.power);
    for (const v of Object.values(st.pet)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
    expect(st.pet.health).toBeGreaterThanOrEqual(10);   // 死なない
  }
  return { st, ending: st.ending, trace };
}
const careBasics: Strat = (st) => { G.feed(st); G.giveWater(st); };
const fixWhatBreaks: Strat = (st) => {
  for (const id of ["arm", "feeder", "water", "light", "climate", "camera"] as G.EquipId[])
    if (st.equip[id] < 35 && st.ap > 0 && st.parts >= G.REPAIR_COST[id]) G.repair(st, id);
};
const balanced: Strat = (st, r) => {
  careBasics(st, r); G.pet(st);
  fixWhatBreaks(st, r);
  if (st.ap > 0) G.play(st);
  if (st.ap > 0) (st.parts < 2 ? G.search(st) : G.look(st));
  if (st.power < 30) G.setClimate(st, "eco");
  if (st.pet.full < 70) G.feed(st);
};

describe("家庭用AIの30日：ルール", () => {
  it("どの遊び方でも、値は範囲内で、ペットは死なない（ランダム 400 本）", () => {
    for (let s = 1; s <= 400; s++) {
      const sp: G.Species = s % 2 ? "dog" : "cat";
      run(sp, (st, r) => {
        const acts = [() => G.feed(st), () => G.giveWater(st), () => G.pet(st), () => G.play(st), () => G.look(st), () => G.search(st), () => G.repair(st, G.EQUIP[Math.floor(r() * 7)]!), () => G.setClimate(st, (["off", "eco", "normal"] as const)[Math.floor(r() * 3)]!), () => G.setLights(st, r() < 0.5)];
        for (let k = 0; k < 6; k++) acts[Math.floor(r() * acts.length)]!();
      }, () => (s % 3 === 0 ? 1 : 0), s);
    }
  });
  it("丁寧に世話をすると、互いに暮らしを続ける結末（together か return）になる", () => {
    const dog = run("dog", balanced, () => 1, 7);
    const cat = run("cat", balanced, () => 1, 7);
    expect(["together", "return"]).toContain(dog.ending);
    expect(["together", "return"]).toContain(cat.ending);
  });
  it("毎日なでるだけで遊ばないと「待つ」結末（依存）になりうる", () => {
    const res = run("dog", (st) => { careBasics(st, Math.random); G.pet(st); G.pet(st); G.pet(st); fixWhatBreaks(st, Math.random); if (st.ap > 0 && st.parts < 2) G.search(st); G.setLights(st, st.power > 35); if (st.power < 30) G.setClimate(st, "eco"); }, (id) => (id === "d21" ? 1 : 0), 3);
    expect(res.ending).toBe("waiting");
  });
  it("生存に必要なことだけをすると「生存」の結末（LIFE の定義が変わらない）", () => {
    expect(run("cat", careBasics, () => 1, 5).ending).toBe("survival");
  });
  it("自分の機能を切って電力を回すと「最後の灯り」の結末", () => {
    expect(run("dog", balanced, (id) => (id === "d21" ? 0 : 1), 9).ending).toBe("lastlight");
  });
  it("猫で、ひとりの時間と遊びを大事にすると「戻ってくる」結末になる", () => {
    const res = run("cat", (st, r) => { careBasics(st, r); if (st.day % 2) G.pet(st); fixWhatBreaks(st, r); if (st.ap > 0) G.play(st); if (st.ap > 0) G.look(st); if (st.ap > 0) G.search(st); }, (id) => (id === "d4" ? 1 : 1), 11);
    expect(res.ending).toBe("return");
  });
  it("16日目にお世話アームが壊れ、修理できる", () => {
    const st = G.newGame("ミケ", "dog", 1);
    for (let i = 0; i < 15; i++) { careBasics(st, Math.random); G.rest(st); G.resolveNight(st, 0); G.nextDay(st); }
    expect(st.day).toBe(16);
    expect(st.equip.arm).toBe(0);
    expect(G.pet(st).ok).toBe(false);
    st.parts = 2;
    expect(G.repair(st, "arm").ok).toBe(true);
    expect(G.pet(st).ok).toBe(true);
    expect(st.stats.armRepaired).toBe(true);
  });
  it("灰が積もるほど発電が減る", () => {
    const st = G.newGame("ミケ", "cat", 1);
    const a = G.generation(st);
    st.ash = 80;
    expect(G.generation(st)).toBeLessThan(a * 0.5);
  });
});
