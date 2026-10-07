// 遊び方（戦略）ごとの結末の分布を見る。使い方: npx rolldown scripts/sim/strategies.ts --format esm --platform node -o out.mjs && node out.mjs [戦略名]
import * as G from "../../src/game/index";
type St = G.GameState;
const fix = (st: St) => { for (const id of ["arm","feeder","water","climate","light","camera"] as G.EquipId[]) if (st.equip[id] < 40 && st.ap > 0) { if (st.parts < G.REPAIR_COST[id] && st.equip.comms <= 0) G.dismantle(st); if (st.parts >= G.REPAIR_COST[id]) G.repair(st, id); } };
const searchAny = (st: St) => { const p = G.PLACE_IDS.find((id) => G.placeOpen(st, id) && G.placeLeft(st, id) > 0); return p ? G.search(st, p).ok : false; };
const basics = (st: St) => { if (st.pet.full < 60) G.feed(st); if (st.pet.hydration < 60) G.giveWater(st); };
const thermo = (st: St) => { G.setClimate(st, "eco"); if (G.roomTemp(st) < G.coldLine(st) && st.power > 25) G.setClimate(st, "normal"); G.setLights(st, st.power > 15); };
const S: Record<string, (st: St) => void> = {
  attentive: (st) => { basics(st); thermo(st); fix(st); const w = st.want;
    if (w === "touch") { G.pet(st); G.pet(st); } if (w === "play") { G.pet(st); G.play(st); } if (w === "window") { G.pet(st); G.look(st); } if (w === "rest") G.pet(st); if (!w) G.pet(st);
    while (st.ap > 0) { if (!searchAny(st)) { if (w === "rest" || w === "alone" || !G.play(st).ok) { if (!G.look(st).ok) break; } } } },
  ignoreWants: (st) => { basics(st); thermo(st); G.pet(st); G.pet(st); fix(st); if (st.ap > 0 && st.pet.energy > 30) G.play(st); while (st.ap > 0) { if (!searchAny(st) && !G.look(st).ok) break; } },
  petmax: (st) => { basics(st); thermo(st); G.pet(st); G.pet(st); G.pet(st); fix(st); while (st.ap > 0) if (!searchAny(st)) break; },
  basics: (st) => { basics(st); fix(st); while (st.ap > 0) if (!searchAny(st)) break; },
  saver: (st) => { basics(st); G.pet(st); G.setLights(st, false); G.setClimate(st, "off"); fix(st); if (st.ap>0) G.play(st); while (st.ap > 0) if (!searchAny(st)) break; },
};
const pick = process.argv[2];
for (const sp of ["dog", "cat"] as G.Species[]) for (const [name, f] of Object.entries(S)) {
  if (pick && name !== pick) continue;
  const ends: Record<string, number> = {}; let detail = "";
  for (let seed = 1; seed <= 40; seed++) {
    const st = G.newGame("ミケ", sp, seed * 7919, 0); const rows: string[] = [];
    for (let i = 0; i < 30; i++) { f(st); G.rest(st); G.resolveNight(st, 1); G.nextDay(st); if (seed === 1 && [5,10,15,20,25,30].includes(i+1)) { const p = st.pet; rows.push(`d${st.day}:tr${p.trust} st${p.stress} he${p.health} in${p.indep} de${p.depend} pw${st.power} gen${G.generation(st)} T${st.temp} f${st.food} w${st.water} pt${st.parts} eq${G.equipAverage(st)}`); } }
    ends[st.ending!] = (ends[st.ending!] ?? 0) + 1;
    if (seed === 1) detail = JSON.stringify({ low: st.stats.lowPowerDays, miss: st.stats.careMisses, cold: st.stats.coldNights, met: st.stats.wantsMet, missW: st.stats.wantsMissed }) + "\n  " + rows.join("\n  ");
  }
  console.log(sp, name, JSON.stringify(ends), detail);
}
// 猫で「灯りの残る部屋」に届くか：したいことに応えつつ、ひとりの日以外はよくなでる
{
  const ends: Record<string, number> = {};
  for (let seed = 1; seed <= 40; seed++) {
    const st = G.newGame("ミケ", "cat", seed * 7919, 0);
    for (let i = 0; i < 30; i++) { basics(st); thermo(st); fix(st); const w = st.want; if (w !== "alone") { G.pet(st); G.pet(st); G.pet(st); } if (w === "play") G.play(st); if (w === "window") G.look(st); while (st.ap > 0) { if (!searchAny(st)) { if (w === "alone" || w === "rest" || !G.play(st).ok) if (!G.look(st).ok) break; } } G.rest(st); G.resolveNight(st, 1); G.nextDay(st); }
    ends[st.ending!] = (ends[st.ending!] ?? 0) + 1; if (seed === 1) console.log(st.pet);
  }
  console.log("cat affectionate", JSON.stringify(ends));
}
{
  const ends: Record<string, number> = {};
  for (let seed = 1; seed <= 40; seed++) {
    const st = G.newGame("ミケ", "dog", seed * 7919, 0);
    for (let i = 0; i < 30; i++) { basics(st); thermo(st); fix(st); const w = st.want; if (w === "touch") { G.pet(st); G.pet(st); } if (w === "play") G.play(st); if (w === "window") G.look(st); while (st.ap > 0) { if (!searchAny(st)) { if (w === "alone" || w === "rest" || !G.play(st).ok) if (!G.look(st).ok) break; } } G.rest(st); G.resolveNight(st, 1); G.nextDay(st); }
    ends[st.ending!] = (ends[st.ending!] ?? 0) + 1; if (seed === 1) console.log(st.pet);
  }
  console.log("dog free", JSON.stringify(ends));
}
