// スクリーンショット用の保存を作る（丁寧な世話で DAY n の朝まで進める）。
// 使い方: node --experimental-strip-types scripts/sim/make-save.ts <日> <dog|cat> [d21の選択 0|1] > save.json
import * as G from "../../src/game/index";
import { nightStory } from "../../src/content/story";
const [day = "3", sp = "cat", d21 = "1"] = process.argv.slice(2);
const g = G.newGame("ミケ", sp as G.Species, 11, 0);
const journal: { day: number; title: string; text: string }[] = [];
while (g.day < +day) {
  if (g.pet.full < 62) G.feed(g);
  if (g.pet.hydration < 62) G.giveWater(g);
  G.pet(g); G.pet(g);
  const broken = G.EQUIP.find((e) => e !== "comms" && g.equip[e] < 40 && g.parts >= G.REPAIR_COST[e]);
  if (broken) G.repair(g, broken);
  if (g.ap > 0 && g.pet.energy > 30) G.play(g);
  while (g.ap > 0) G.search(g);
  G.rest(g);
  const s = nightStory(g);
  const c = g.day === 21 ? +d21 : 0;
  G.resolveNight(g, c);
  journal.push({ day: g.day, title: s.title, text: [...s.lines, s.after[c % s.after.length]].join("\n") });
  G.nextDay(g);
}
g.lastSeen = Date.now();
console.log(JSON.stringify({ version: 3, game: g, journal, updatedAt: 5, tutorial: "done" }));
