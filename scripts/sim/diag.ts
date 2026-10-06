import * as G from "../../src/game/index.ts";
const sp = (process.argv[2] ?? "dog") as G.Species;
const st = G.newGame("ミケ", sp, 7);
const fix = (st: G.GameState) => { for (const id of ["arm","feeder","water","light","climate","camera"] as G.EquipId[]) if (st.equip[id] < 35 && st.ap > 0 && st.parts >= G.REPAIR_COST[id]) G.repair(st, id); };
for (let i = 0; i < 30; i++) {
  G.feed(st); G.giveWater(st); G.pet(st); fix(st); if (st.ap>0) G.play(st); if (st.ap>0) (st.parts<2?G.search(st):G.look(st)); if (st.power<30) G.setClimate(st,"eco"); if (st.pet.full<70) G.feed(st);
  G.rest(st); G.resolveNight(st, 1); const ev = G.nextDay(st);
  const p = st.pet;
  console.log(st.day, 'pow', st.power, 'gen', G.generation(st), 'up', G.upkeep(st), 'ash', st.ash, 'T', st.temp, 'eq', G.equipAverage(st), 'parts', st.parts, 'food', st.food, 'w', st.water, `full${p.full} hyd${p.hydration} en${p.energy} st${p.stress} tr${p.trust} he${p.health} in${p.indep} de${p.depend}`, ev.join(','));
}
console.log(st.ending, JSON.stringify(st.stats));
