import { describe, expect, it } from "vitest";
import * as G from "../src/game";

type St = G.GameState;
type Strat = (st: St, r: () => number) => void;
/** 30日を通す。夜の選択は choice で決める */
function run(species: G.Species, day: Strat, choice: (id: string) => number, seed = 1) {
  const st = G.newGame("ミケ", species, seed, 0);
  let rr = seed;
  const r = () => ((rr = (rr * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 30; i++) {
    day(st, r);
    G.rest(st);
    G.resolveNight(st, choice(st.pending!.id));
    G.nextDay(st);
    for (const v of Object.values(st.pet)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
    expect(st.pet.health).toBeGreaterThanOrEqual(10);   // 死なない
    for (const v of [st.power, st.ash, st.parts, st.food, st.water]) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
  }
  return st;
}
const basics = (st: St) => { if (st.pet.full < 60) G.feed(st); if (st.pet.hydration < 60) G.giveWater(st); };
const thermo = (st: St) => { G.setClimate(st, "eco"); if (G.roomTemp(st) < G.coldLine(st) && st.power > 25) G.setClimate(st, "normal"); G.setLights(st, st.power > 15); };
const fix = (st: St) => {
  for (const id of ["arm", "feeder", "water", "climate", "light", "camera"] as G.EquipId[])
    if (st.equip[id] < 40 && st.ap > 0) { if (st.parts < G.REPAIR_COST[id] && st.equip.comms <= 0) G.dismantle(st); if (st.parts >= G.REPAIR_COST[id]) G.repair(st, id); }
};
const searchAny = (st: St) => { const p = G.PLACE_IDS.find((id) => G.placeOpen(st, id) && G.placeLeft(st, id) > 0); return p ? G.search(st, p).ok : false; };
const fill = (st: St, quiet: boolean) => { while (st.ap > 0) if (!searchAny(st) && (quiet || !G.play(st).ok) && !G.look(st).ok) break; };
/** その子のしたいことを読んで応える */
const attentive: Strat = (st) => {
  basics(st); thermo(st); fix(st);
  const w = st.want;
  if (w === "touch") { G.pet(st); G.pet(st); }
  if (w === "play") { G.pet(st); G.play(st); }
  if (w === "window") { G.pet(st); G.look(st); }
  if (w === "rest" || !w) G.pet(st);
  fill(st, w === "alone" || w === "rest");
};
/** したいことに関係なく、毎日三回なでる */
const petMax: Strat = (st) => { basics(st); thermo(st); G.pet(st); G.pet(st); G.pet(st); fix(st); while (st.ap > 0) if (!searchAny(st)) break; };
/** 生存に必要なことだけ */
const careBasics: Strat = (st) => { basics(st); fix(st); while (st.ap > 0) if (!searchAny(st)) break; };
/** 応えつつ、ひとりの日以外はよくなでる */
const affectionate: Strat = (st) => { basics(st); thermo(st); fix(st); const w = st.want; if (w !== "alone") { G.pet(st); G.pet(st); G.pet(st); } if (w === "play") G.play(st); if (w === "window") G.look(st); fill(st, w === "alone" || w === "rest"); };
/** 応えつつ、触れるのは求められた日だけ */
const free: Strat = (st) => { basics(st); thermo(st); fix(st); const w = st.want; if (w === "touch") { G.pet(st); G.pet(st); } if (w === "play") G.play(st); if (w === "window") G.look(st); fill(st, w === "alone" || w === "rest"); };

function endings(sp: G.Species, s: Strat, choice: (id: string) => number = () => 1, n = 20) {
  const out: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) { const e = run(sp, s, choice, seed * 7919).ending!; out[e] = (out[e] ?? 0) + 1; }
  return out;
}
const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]![0];

describe("家庭用AIの30日：ルール", () => {
  it("どの遊び方でも、値は範囲内で、ペットは死なない（ランダム 300 本）", () => {
    for (let s = 1; s <= 300; s++) {
      const sp: G.Species = s % 2 ? "dog" : "cat";
      run(sp, (st, r) => {
        const acts = [() => G.feed(st), () => G.giveWater(st), () => G.pet(st), () => G.play(st), () => G.look(st), () => G.search(st, G.PLACE_IDS[Math.floor(r() * 6)]!), () => G.repair(st, G.EQUIP[Math.floor(r() * 7)]!), () => G.dismantle(st), () => G.setClimate(st, (["off", "eco", "normal"] as const)[Math.floor(r() * 3)]!), () => G.setLights(st, r() < 0.5)];
        for (let k = 0; k < 7; k++) acts[Math.floor(r() * acts.length)]!();
      }, () => (s % 3 === 0 ? 1 : 0), s);
    }
  });

  describe("結末は遊び方で分かれ、犬と猫のどちらでも 5 種類すべてに届く", () => {
    it("したいことに応えると「灯りの残る部屋」（犬）・「戻ってくる場所」（猫）", () => {
      expect(top(endings("dog", attentive))).toBe("together");
      expect(top(endings("cat", attentive))).toBe("return");
    });
    it("毎日三回なでるだけだと「そばにいる」（依存）", () => {
      expect(top(endings("dog", petMax))).toBe("waiting");
      expect(top(endings("cat", petMax))).toBe("waiting");
    });
    it("生存に必要なことだけだと「生存状態：正常」", () => {
      expect(top(endings("dog", careBasics))).toBe("survival");
      expect(top(endings("cat", careBasics))).toBe("survival");
    });
    it("21 日目に自分の機能を止めると「最後の灯り」", () => {
      expect(top(endings("dog", attentive, (id) => (id === "d21" ? 0 : 1)))).toBe("lastlight");
      expect(top(endings("cat", attentive, (id) => (id === "d21" ? 0 : 1)))).toBe("lastlight");
    });
    it("猫でもよく触れれば「灯りの残る部屋」、犬でも求められた時だけ触れれば「戻ってくる場所」に届く", () => {
      expect(endings("cat", affectionate).together ?? 0).toBeGreaterThan(0);
      expect(endings("dog", free).return ?? 0).toBeGreaterThan(0);
    });
  });

  it("信頼は上限に張り付かず、丁寧な世話でも 15 日目は 90 未満", () => {
    const st = G.newGame("ミケ", "dog", 5, 0);
    for (let i = 0; i < 14; i++) { attentive(st, Math.random); G.rest(st); G.resolveNight(st, 1); G.nextDay(st); }
    expect(st.pet.trust).toBeGreaterThan(40);
    expect(st.pet.trust).toBeLessThan(90);
  });

  it("したいこと：DAY 01 は無く、2 日目から毎朝決まる。ひとりでいたい日になでると離れていく", () => {
    const st = G.newGame("ミケ", "cat", 3, 0);
    expect(st.want).toBeNull();
    G.rest(st); G.resolveNight(st, 0); G.nextDay(st);
    expect(G.WANTS).toContain(st.want);
    st.want = "alone";
    const before = st.pet.stress;
    expect(G.pet(st)).toEqual({ ok: true, note: "away" });
    expect(st.pet.stress).toBeGreaterThan(before);
    expect(G.wantMet(st)).toBe(false);
  });
  it("したいことに応えると、好みとして残る", () => {
    const st = G.newGame("ミケ", "dog", 3, 0);
    st.day = 2; st.want = "touch";
    G.pet(st); G.pet(st);
    expect(G.wantMet(st)).toBe(true);
    G.rest(st);
    expect(st.learned).toEqual(["touch"]);
    expect(st.stats.wantsMet).toBe(1);
  });

  it("部屋の点検：場所ごとに決まったものが順に見つかり、なくなる。物置は 9 日目から", () => {
    const st = G.newGame("ミケ", "dog", 1, 0);
    st.ap = 9;
    const r1 = G.search(st, "kitchen");
    expect(r1.ok && r1.found.food).toBe(5);
    expect(st.records).toContain("m_note");
    G.search(st, "kitchen"); G.search(st, "kitchen");
    expect(G.placeLeft(st, "kitchen")).toBe(0);
    expect(G.search(st, "kitchen")).toMatchObject({ ok: false, reason: "empty" });
    expect(G.search(st, "storage")).toMatchObject({ ok: false, reason: "closed" });
    G.search(st, "closet");
    expect(st.flags.blanket).toBe(true);
    expect(G.coldLine(st)).toBeLessThan(13.5);
  });
  it("止まった通信機は一度だけ分解でき、部品になる。動いているうちはできない", () => {
    const st = G.newGame("ミケ", "dog", 1, 0);
    expect(G.dismantle(st).ok).toBe(false);
    st.equip.comms = 0;
    const parts = st.parts;
    expect(G.dismantle(st).ok).toBe(true);
    expect(st.parts).toBe(parts + G.DISMANTLE_PARTS);
    expect(G.dismantle(st).ok).toBe(false);
  });

  it("16日目に接触機構が壊れ、修理できる", () => {
    const st = G.newGame("ミケ", "dog", 1, 0);
    for (let i = 0; i < 15; i++) { basics(st); G.rest(st); G.resolveNight(st, 0); G.nextDay(st); }
    expect(st.day).toBe(16);
    expect(st.equip.arm).toBe(0);
    expect(G.pet(st).ok).toBe(false);
    st.parts = 2;
    expect(G.repair(st, "arm").ok).toBe(true);
    st.want = "touch";
    expect(G.pet(st).ok).toBe(true);
    expect(st.stats.armRepaired).toBe(true);
  });
  it("灰が積もるほど発電が減り、外は冷える。雨の日は灰が流れて雨水がたまる", () => {
    const st = G.newGame("ミケ", "cat", 1, 0);
    const a = G.generation(st), t = G.outsideTemp(st);
    st.ash = 80;
    expect(G.generation(st)).toBeLessThan(a * 0.5);
    expect(G.outsideTemp(st)).toBeLessThan(t - 5);
    st.day = 11; st.ash = 40; st.pending = { id: "d11", resolved: true, choice: 0 };
    const w = st.water;
    expect(G.nextDay(st)).toContain("rain");
    expect(st.water).toBe(w + 6);
    expect(st.ash).toBeLessThan(40);
  });
  it("寒い夜のあとは朝に知らせる。空調を強めると寒さを防げる", () => {
    const st = G.newGame("ミケ", "cat", 1, 0);
    st.ash = 80; st.climate = "off";
    expect(G.roomTemp(st)).toBeLessThan(G.coldLine(st));
    G.setClimate(st, "normal");
    expect(G.roomTemp(st)).toBeGreaterThan(G.roomTemp({ ...st, climate: "eco" }));
    G.setClimate(st, "off");
    G.rest(st); G.resolveNight(st, 0);
    expect(G.nextDay(st)).toContain("cold");
  });
  it("観察は数値ではなく様子で返す", () => {
    const st = G.newGame("ミケ", "dog", 1, 0);
    st.pet.depend = 80; st.pet.indep = 20; st.pet.stress = 80;
    expect(G.observe(st)).toMatchObject({ distance: "close", mood: "restless" });
  });
  it("以前の version 3 の保存に、新しい項目を補う", () => {
    const st = G.newGame("ミケ", "dog", 1, 0) as Partial<St>;
    delete st.want; delete st.learned; delete st.places;
    const g = G.upgrade(st as St);
    expect(g.want).toBeNull();
    expect(g.learned).toEqual([]);
    expect(g.places).toEqual({});
  });
});
