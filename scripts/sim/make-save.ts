// スクリーンショット用の保存を作る（したいことに応える丁寧な世話で DAY n の朝まで進める）。
// 使い方: rolldown でまとめてから node make-save.mjs <日> <dog|cat> [d21の選択 0|1] [want] > save.json
import * as G from "../../src/game/index";
import { learnedLine, nightStory } from "../../src/content/story";
const [day = "3", sp = "cat", d21 = "1", want = ""] = process.argv.slice(2);
const g = G.newGame("ミケ", sp as G.Species, 11, 0);
const journal: { day: number; title: string; text: string }[] = [];
const searchAny = () => { const p = G.PLACE_IDS.find((id) => G.placeOpen(g, id) && G.placeLeft(g, id) > 0); return p ? G.search(g, p).ok : false; };
while (g.day < +day) {
  if (g.pet.full < 60) G.feed(g);
  if (g.pet.hydration < 60) G.giveWater(g);
  G.setClimate(g, "eco"); if (G.roomTemp(g) < G.coldLine(g) && g.power > 25) G.setClimate(g, "normal");
  for (const id of ["arm", "feeder", "water", "climate", "light", "camera"] as G.EquipId[])
    if (g.equip[id] < 40 && g.ap > 0) { if (g.parts < G.REPAIR_COST[id] && g.equip.comms <= 0) G.dismantle(g); if (g.parts >= G.REPAIR_COST[id]) G.repair(g, id); }
  const w = g.want;
  if (w === "touch") { G.pet(g); G.pet(g); }
  if (w === "play") { G.pet(g); G.play(g); }
  if (w === "window") { G.pet(g); G.look(g); }
  if (w === "rest" || !w) G.pet(g);
  while (g.ap > 0) if (!searchAny() && (w === "alone" || w === "rest" || !G.play(g).ok) && !G.look(g).ok) break;
  const knew = g.learned.length;
  G.rest(g);
  for (const l of g.learned.slice(knew)) journal.push({ day: g.day, title: "好み", text: learnedLine(l, g) });
  const s = nightStory(g);
  const c = g.day === 21 ? +d21 : 0;
  G.resolveNight(g, c);
  journal.push({ day: g.day, title: s.title, text: [...s.lines, s.after[c % s.after.length]].join("\n") });
  G.nextDay(g);
}
if (want) g.want = want as G.Want;
g.lastSeen = process.env.ABSENT ? Date.now() - 8 * 3600e3 : Date.now();
console.log(JSON.stringify({ version: 3, game: g, journal, updatedAt: 5, tutorial: "done" }));
