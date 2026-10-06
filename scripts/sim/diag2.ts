import * as G from "../../src/game/index.ts";
const st = G.newGame("ミケ", "dog", 3);
const fix = (st: G.GameState) => { for (const id of ["arm","feeder","water","light","climate","camera"] as G.EquipId[]) if (st.equip[id] < 35 && st.ap > 0 && st.parts >= G.REPAIR_COST[id]) G.repair(st, id); };
for (let i = 0; i < 30; i++) {
  G.feed(st); G.giveWater(st); G.pet(st); G.pet(st); G.pet(st); fix(st); if (st.ap > 0 && st.parts < 2) G.search(st); G.setLights(st, st.power > 35); if (st.power < 30) G.setClimate(st, "eco");
  G.rest(st); G.resolveNight(st, 0); const ev = G.nextDay(st);
  if (i % 3 === 0) console.log(st.day, 'pow', st.power, 'eq', G.equipAverage(st), JSON.stringify(st.equip), 'parts', st.parts, `in${st.pet.indep} de${st.pet.depend} tr${st.pet.trust}`, ev.join(','));
}
console.log(st.ending, JSON.stringify(st.stats), st.flags);
