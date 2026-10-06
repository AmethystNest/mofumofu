/**
 * 家庭用AIの30日（ゲームのルール）。描画・文章に依存しない純粋な処理。
 *
 * プレイヤーは家を管理していたシステム。命令は「この子を、生かして。」
 * - ペット：おなか・水分・げんき・ストレス・信頼・体調・自立・依存（0〜100）。死なない（体調は 10 未満にならない）
 * - 電力：蓄電（0〜100）。発電は降灰で減る（降灰の堆積で太陽光パネルの出力が落ちることは実測で知られている）。
 *   照明・空調・通信・カメラの常時消費と、行動ごとの消費。足りなくなると翌日は低電力モード（行動が減る）
 * - 設備：照明・空調・通信・カメラ・給餌器・給水器・お世話アーム（状態 0〜100、0＝故障）。使うほど傷み、決まった日に故障が起きる。
 *   部品で修理できるが、部品は限られる（部屋を点検して見つける）
 * - 1日の行動は 3（低電力なら 2、停止した翌日は 1）。ごはん・水・なでるは行動を使わない（なでるは1日3回まで）
 * - 30日目の夜、壊れていた記録が完全に戻り、30日の過ごし方でエンディングが決まる。その後も暮らしは続く
 */
export type Species = "dog" | "cat";
export type EquipId = "light" | "climate" | "comms" | "camera" | "feeder" | "water" | "arm";
export const EQUIP: EquipId[] = ["light", "climate", "comms", "camera", "feeder", "water", "arm"];
export type ClimateMode = "off" | "eco" | "normal";

export interface Pet { full: number; hydration: number; energy: number; stress: number; trust: number; health: number; indep: number; depend: number }
export interface Daily { fed: number; watered: boolean; pets: number; played: boolean; looked: boolean; searched: boolean; repaired: EquipId | null; touchFailed: number }
export interface Stats { pets: number; plays: number; looks: number; searches: number; repairs: number; lowPowerDays: number; shutdowns: number; careMisses: number; armRepaired: boolean }
export interface Pending { id: string; resolved: boolean; choice: number }
export interface GameState {
  v: 3;
  name: string;
  species: Species;
  day: number;
  ap: number;
  apMax: number;
  pet: Pet;
  power: number;
  ash: number;
  temp: number;
  climate: ClimateMode;
  lights: boolean;
  equip: Record<EquipId, number>;
  parts: number;
  food: number;
  water: number;
  daily: Daily;
  stats: Stats;
  flags: Record<string, number | boolean | string>;
  records: string[];
  pending: Pending | null;
  ending: string | null;
  seed: number;
  lastSeen: number;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
/** シード付き乱数（mulberry32） */
export function rand(st: GameState): number {
  let t = (st.seed = (st.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const freshDaily = (): Daily => ({ fed: 0, watered: false, pets: 0, played: false, looked: false, searched: false, repaired: null, touchFailed: 0 });

export function newGame(name: string, species: Species, seed = Date.now() & 0x7fffffff, now = Date.now()): GameState {
  return {
    v: 3, name, species, day: 1, ap: 3, apMax: 3,
    pet: { full: 30, hydration: 45, energy: 55, stress: 62, trust: 5, health: 70, indep: 30, depend: 10 },
    power: 72, ash: 4, temp: 19, climate: "eco", lights: true,
    equip: { light: 92, climate: 85, comms: 18, camera: 90, feeder: 88, water: 90, arm: 86 },
    parts: 2, food: 38, water: 40,
    daily: freshDaily(),
    stats: { pets: 0, plays: 0, looks: 0, searches: 0, repairs: 0, lowPowerDays: 0, shutdowns: 0, careMisses: 0, armRepaired: false },
    flags: {}, records: [], pending: null, ending: null, seed: seed | 0, lastSeen: now,
  };
}

// ---- 電力 ---------------------------------------------------------------------------------
/** 1日の発電量（降灰で減る。空が晴れていても、パネルに積もった灰で落ちる） */
export const generation = (st: GameState) => Math.round(32 * (1 - st.ash / 150));
/** 1日の常時消費（照明・空調・カメラ・通信。壊れた設備は電気を食わない） */
export function upkeep(st: GameState): number {
  const on = (id: EquipId) => st.equip[id] > 0;
  return 3 + (st.lights && on("light") ? 5 : 0) + (on("climate") ? { off: 0, eco: 6, normal: 11 }[st.climate] : 0) + (on("camera") ? 3 : 0) + (on("comms") ? 2 : 0);
}
function usePower(st: GameState, n: number) { st.power = clamp(st.power - n); }
export const statusOf = (v: number) => (v <= 0 ? "broken" : v < 40 ? "unstable" : "ok") as "broken" | "unstable" | "ok";

// ---- 行動 ---------------------------------------------------------------------------------
export type Result = { ok: true; note?: string } | { ok: false; reason: string };

export function feed(st: GameState): Result {
  if (st.food <= 0) return { ok: false, reason: "food" };
  if (st.pet.full >= 92) return { ok: false, reason: "full" };
  const f = st.equip.feeder;
  if (f <= 0 && st.equip.arm <= 0) return { ok: false, reason: "feeder" };
  st.food--;
  st.pet.full = clamp(st.pet.full + (f < 30 ? 28 : 42));
  st.pet.health = clamp(st.pet.health + 2);
  st.pet.trust = clamp(st.pet.trust + 1);
  st.daily.fed++;
  if (f > 0) st.equip.feeder = clamp(f - 2); else st.equip.arm = clamp(st.equip.arm - 3);
  usePower(st, 3);
  return { ok: true, note: f <= 0 ? "manual" : f < 30 ? "unstable" : undefined };
}

export function giveWater(st: GameState): Result {
  if (st.water <= 0) return { ok: false, reason: "water" };
  if (st.pet.hydration >= 92) return { ok: false, reason: "full" };
  if (st.equip.water <= 0) return { ok: false, reason: "waterer" };
  st.water--;
  st.pet.hydration = clamp(st.pet.hydration + 50);
  st.pet.health = clamp(st.pet.health + 1);
  st.daily.watered = true;
  st.equip.water = clamp(st.equip.water - 1);
  usePower(st, 2);
  return { ok: true };
}

export const PETS_PER_DAY = 3;
/** なでる（お世話アーム）。壊れていれば反応しない */
export function pet(st: GameState): Result {
  if (st.equip.arm <= 0) { st.daily.touchFailed++; return { ok: false, reason: "arm" }; }
  if (st.daily.pets >= PETS_PER_DAY) return { ok: true, note: "enough" };
  st.daily.pets++;
  st.stats.pets++;
  const dog = st.species === "dog";
  st.pet.trust = clamp(st.pet.trust + 2);
  st.pet.stress = clamp(st.pet.stress - 5);
  st.pet.depend = clamp(st.pet.depend + (st.daily.pets >= 3 ? 4 : 2) * (dog ? 1.3 : 0.9));
  st.equip.arm = clamp(st.equip.arm - 1);
  usePower(st, 1);
  return { ok: true };
}

export function play(st: GameState): Result {
  if (st.ap < 1) return { ok: false, reason: "ap" };
  if (st.pet.energy < 12) return { ok: false, reason: "tired" };
  if (st.equip.arm <= 0) return { ok: false, reason: "arm" };
  st.ap--;
  st.daily.played = true;
  st.stats.plays++;
  const cat = st.species === "cat";
  st.pet.energy = clamp(st.pet.energy - 14);
  st.pet.full = clamp(st.pet.full - 5);
  st.pet.stress = clamp(st.pet.stress - 8);
  st.pet.trust = clamp(st.pet.trust + 1);
  st.pet.indep = clamp(st.pet.indep + (cat ? 3 : 1));
  st.pet.health = clamp(st.pet.health + 2);
  st.equip.arm = clamp(st.equip.arm - 2);
  usePower(st, 4);
  return { ok: true };
}

/** 窓の外を見る（カメラ）。外の様子と、ときどき記録の手がかり */
export function look(st: GameState): Result & { find?: string } {
  if (st.ap < 1) return { ok: false, reason: "ap" };
  if (st.equip.camera <= 0) return { ok: false, reason: "camera" };
  st.ap--;
  st.daily.looked = true;
  st.stats.looks++;
  usePower(st, 2);
  // 一緒に窓を見る：猫は自立、犬は安心
  if (st.species === "cat") st.pet.indep = clamp(st.pet.indep + 3); else st.pet.stress = clamp(st.pet.stress - 3);
  const cands = ["r_ash", "r_sound", "r_lights", "r_tower", "r_bird"].filter((r) => !st.records.includes(r));
  if (cands.length && rand(st) < 0.6) { const f = cands[Math.floor(rand(st) * cands.length)]!; st.records.push(f); return { ok: true, find: f }; }
  return { ok: true };
}

/** 部屋を点検する：部品や、生活の手がかりが見つかる */
export function search(st: GameState): Result & { found: { parts: number; food: number; memo?: string } } {
  if (st.ap < 1) return { ok: false, reason: "ap", found: { parts: 0, food: 0 } } as never;
  st.ap--;
  st.daily.searched = true;
  st.stats.searches++;
  usePower(st, 2);
  const r = rand(st);
  const parts = r < 0.35 ? 0 : r < 0.85 ? 1 : 2;
  const food = rand(st) < 0.3 ? 3 : 0;
  st.parts += parts;
  st.food += food;
  const memos = ["m_note", "m_photo", "m_leash", "m_calendar"].filter((m) => !st.records.includes(m));
  let memo: string | undefined;
  if (memos.length && rand(st) < 0.4) { memo = memos[Math.floor(rand(st) * memos.length)]!; st.records.push(memo); }
  return { ok: true, found: { parts, food, memo } };
}

export const REPAIR_COST: Record<EquipId, number> = { light: 1, climate: 2, comms: 3, camera: 1, feeder: 1, water: 1, arm: 2 };
export function repair(st: GameState, id: EquipId): Result {
  if (st.ap < 1) return { ok: false, reason: "ap" };
  if (st.equip[id] >= 90) return { ok: false, reason: "fine" };
  if (st.parts < REPAIR_COST[id]) return { ok: false, reason: "parts" };
  if (id === "comms" && st.day >= 8) return { ok: false, reason: "outside" };   // 通信は家の外の問題で、直らない
  st.ap--;
  st.parts -= REPAIR_COST[id];
  st.equip[id] = clamp(Math.max(st.equip[id], 0) + 60);
  st.daily.repaired = id;
  st.stats.repairs++;
  if (id === "arm" && st.flags.armBroke) st.stats.armRepaired = true;
  usePower(st, 5);
  return { ok: true };
}

export function setClimate(st: GameState, m: ClimateMode) { st.climate = m; }
export function setLights(st: GameState, on: boolean) { st.lights = on; }

// ---- 1日の終わりと朝 ---------------------------------------------------------------------
/** 夜のできごとの id（日にち固定の物語。31日目以降は日々の記録） */
export function nightId(st: GameState): string {
  return st.day <= 30 ? `d${st.day}` : "daily";
}
/** 選択肢のある夜（選択の数） */
export const NIGHT_CHOICES: Record<string, number> = { d1: 2, d4: 2, d7: 2, d21: 2 };

/** 休む：1日の締め。状態を進め、夜の物語を用意する */
export function rest(st: GameState): Pending {
  if (st.pending) return st.pending;
  const p = st.pet, d = st.daily, dog = st.species === "dog";
  // 欲求
  const hungry = p.full < 25, thirsty = p.hydration < 25;
  p.full = clamp(p.full - 26);
  p.hydration = clamp(p.hydration - 32);
  // 室温：空調が動いていれば保てる。外気は灰で下がっていく
  const outside = 16 - Math.min(9, st.ash / 9);
  const heat = st.equip.climate > 0 ? { off: 0, eco: 5, normal: 9 }[st.climate] * (st.equip.climate < 40 ? 0.6 : 1) : 0;
  st.temp = Math.round((outside + heat) * 10) / 10;
  const cold = st.temp < 13.5;
  // げんき・ストレス
  p.energy = clamp(p.energy + (cold ? 22 : 36) * (hungry ? 0.6 : 1));
  const noTouch = d.pets === 0 && !d.played;
  p.stress = clamp(p.stress + 7 + (hungry ? 8 : 0) + (thirsty ? 8 : 0) + (cold ? 6 : 0) + (noTouch ? (dog ? 8 : 3) : 0) + (!st.lights || st.equip.light <= 0 ? 3 : 0) + (d.touchFailed ? (dog ? 6 : 3) : 0) - (d.played ? 5 : 0));
  // 自立と依存：触れ合いの量と、ひとりで過ごす時間の釣り合い
  if (d.pets <= (dog ? 0 : 1) && !hungry && !thirsty) p.indep = clamp(p.indep + (dog ? 2 : 3));
  p.depend = clamp(p.depend - (d.played ? 2 : 0) - (d.pets === 0 ? 3 : 0) + (d.pets >= 3 && !d.played ? 2 : 0));
  // 体調：満たされた欲求で回復し、欠けると落ちる（10 未満にはしない）
  const miss = (hungry ? 1 : 0) + (thirsty ? 1 : 0) + (cold ? 1 : 0);
  st.stats.careMisses += miss;
  p.health = clamp(p.health + (miss ? -7 * miss : 4) - (p.stress > 75 ? 3 : 0), 10, 100);
  if (p.stress < 40 && !miss) p.trust = clamp(p.trust + 1);
  // 設備の劣化
  for (const id of EQUIP) if (st.equip[id] > 0) st.equip[id] = clamp(st.equip[id] - (id === "comms" ? 0 : 1));
  // 電力
  st.power = clamp(st.power + generation(st) - upkeep(st));
  const pending: Pending = { id: nightId(st), resolved: false, choice: 0 };
  st.pending = pending;
  return pending;
}

/** 夜の選択の結果を状態へ反映する */
export function resolveNight(st: GameState, choice: number) {
  const p = st.pending;
  if (!p || p.resolved) return;
  p.resolved = true;
  p.choice = choice;
  const pet = st.pet;
  switch (p.id) {
    case "d1": // 呼びかける／そのままにする
      if (choice === 0) { pet.trust = clamp(pet.trust + 3); pet.depend = clamp(pet.depend + 2); } else { pet.stress = clamp(pet.stress - 4); pet.indep = clamp(pet.indep + 2); }
      break;
    case "d4": // 窓のシャッター：閉じる（灰を防ぐ・暗い）／開けておく（外が見える）
      st.flags.shutter = choice === 0;
      if (choice === 0) { st.ash = Math.max(0, st.ash - 6); pet.stress = clamp(pet.stress - 3); } else { pet.indep = clamp(pet.indep + (st.species === "cat" ? 5 : 2)); }
      break;
    case "d7": // 記録の保存領域：その子の記録を残す／生存に必要な記録だけ残す
      st.flags.keptMemories = choice === 0;
      if (choice === 0) st.power = clamp(st.power - 6);
      break;
    case "d21": // 電力の危機：自分の機能を切ってペットへ回す／最低限を残す
      st.flags.sacrifice = choice === 0;
      if (choice === 0) { st.equip.comms = 0; st.equip.camera = clamp(st.equip.camera - 30); st.power = clamp(st.power + 25); } else { st.power = clamp(st.power + 8); st.climate = st.climate === "normal" ? "eco" : st.climate; }
      break;
  }
}

/** 朝：日付を進め、行動を戻し、決まった日のできごと（降灰・故障）を起こす。起きたことの key を返す */
export function nextDay(st: GameState): string[] {
  if (!st.pending?.resolved) return [];
  if (st.day === 30 && !st.ending) st.ending = decideEnding(st);
  st.pending = null;
  st.day++;
  const events: string[] = [];
  // 電力が尽きた夜：翌日は低電力（行動が減る）
  if (st.power <= 0) { st.apMax = 1; st.stats.shutdowns++; st.stats.lowPowerDays++; st.lights = false; st.climate = "off"; events.push("shutdown"); }
  else if (st.power < 15) { st.apMax = 2; st.stats.lowPowerDays++; events.push("lowpower"); }
  else st.apMax = 3;
  st.ap = st.apMax;
  st.daily = freshDaily();
  // 降灰：3日目から始まり、波を打って増えていく
  if (st.day >= 3) st.ash = clamp(st.ash + (st.flags.shutter ? 1.5 : 2.5) + (st.day % 6 === 0 ? 5 : 0));
  // 雨：パネルの灰を洗い流す（12日目・23日目）
  if (st.day === 12 || st.day === 23) st.ash = clamp(st.ash - 18);
  // 決まった日の故障（物語の節目）
  const at: Record<number, () => void> = {
    3: () => events.push("ash"),
    12: () => events.push("rain"),
    23: () => events.push("rain"),
    8: () => { st.equip.comms = 0; events.push("comms"); },
    11: () => { st.equip.light = Math.min(st.equip.light, 30); events.push("light"); },
    13: () => { st.equip.climate = Math.min(st.equip.climate, 35); events.push("climate"); },
    16: () => { st.equip.arm = 0; st.flags.armBroke = true; events.push("arm"); },
    19: () => { st.equip.camera = Math.min(st.equip.camera, 30); events.push("camera"); },
    25: () => { st.equip.feeder = Math.min(st.equip.feeder, 25); events.push("feeder"); },
  };
  at[st.day]?.();
  return events;
}

// ---- エンディング ------------------------------------------------------------------------
export type Ending = "together" | "lastlight" | "return" | "waiting" | "survival";
export const equipAverage = (st: GameState) => Math.round(EQUIP.filter((e) => e !== "comms").reduce((s, e) => s + st.equip[e], 0) / 6);

/**
 * 30日の過ごし方で結末を選ぶ。「毎日全部なでれば一番良い結末」にはならない：
 * なで続けると依存が上がり、ひとりの時間（自立）や設備の維持との釣り合いが要る。
 */
export function decideEnding(st: GameState): Ending {
  const p = st.pet;
  if (st.stats.pets + st.stats.plays < 10 || p.trust < 25) return "survival";            // 生存だけを守った：LIFE の定義は変わらない
  if (st.flags.sacrifice || equipAverage(st) < 22 || st.stats.shutdowns >= 3) return "lastlight"; // 自分を使い切った
  if (p.depend >= 70 && p.indep < 40) return "waiting";                                    // 離れられない
  if (p.indep >= (st.species === "cat" ? 60 : 75) && p.trust >= 45) return "return";                                    // 自由なのに、戻ってくる
  return "together";                                                                       // 互いに暮らしを続ける
}

/** 保存データの検査（壊れた値を弾く） */
export function isGame(v: unknown): v is GameState {
  const g = v as GameState;
  return !!g && g.v === 3 && typeof g.name === "string" && (g.species === "dog" || g.species === "cat") && Number.isInteger(g.day) && g.day >= 1
    && !!g.pet && ["full", "hydration", "energy", "stress", "trust", "health", "indep", "depend"].every((k) => Number.isFinite((g.pet as unknown as Record<string, number>)[k]))
    && !!g.equip && EQUIP.every((e) => Number.isFinite(g.equip[e])) && [g.power, g.ash, g.temp, g.parts, g.food, g.water, g.ap, g.apMax].every(Number.isFinite)
    && Number.isInteger(g.seed) && ["off", "eco", "normal"].includes(g.climate) && typeof g.lights === "boolean"
    && !!g.daily && Number.isFinite(g.daily.pets) && Number.isFinite(g.daily.fed) && Number.isFinite(g.daily.touchFailed)
    && !!g.stats && Number.isFinite(g.stats.pets) && Number.isFinite(g.stats.shutdowns) && !!g.flags && typeof g.flags === "object"
    && Array.isArray(g.records) && g.records.every((r) => typeof r === "string")
    && (g.pending === null || (!!g.pending && typeof g.pending.id === "string" && typeof g.pending.resolved === "boolean"));
}

/** 時間帯（残りの行動で決まる） */
export function timeOfDay(st: GameState): "morning" | "noon" | "evening" | "night" {
  if (st.pending) return "night";
  const used = st.apMax - st.ap;
  return used <= 0 ? "morning" : used === 1 ? "noon" : "evening";
}
