/**
 * 家庭用AIの30日（ゲームのルール）。描画・文章に依存しない純粋な処理。
 *
 * プレイヤーは家を管理していたシステム。命令は「この子を、生かして。」
 * - ペット：おなか・水分・げんき・ストレス・信頼・体調・自立・依存（0〜100）。死なない（体調は 10 未満にならない）
 * - その日の「したいこと」（そばにいたい・あそびたい・窓を見たい・ひとりでいたい・休みたい）がある。
 *   読み取って応えるのが世話の中心。「ひとりでいたい」日になで続けるのは逆効果（毎日なでれば良い、にはしない）
 * - 電力：蓄電（0〜100）。発電は降灰で減る（降灰の堆積で太陽光パネルの出力が落ちることは実測で知られている）。
 *   照明・空調・通信・カメラの常時消費と、行動ごとの消費。足りなくなると翌日は低電力モード（行動が減る）
 * - 外は灰で冷えていく。空調を強めれば暖かいが、電力を食う。毛布があると寒さに少し強い
 * - 設備：照明・空調・通信・カメラ・給餌器・給水器・接触機構（状態 0〜100、0＝故障）。使うほど傷み、決まった日に故障が起きる。
 *   部品で修理する。部品は部屋の決まった場所に限られた数だけあり、点検すると見つかる。止まった通信機は分解して部品にできる
 * - 食料と水は限られる。雨の日は雨水がたまる
 * - 1日の行動は 3（低電力なら 2、停止した翌日は 1）。ごはん・水・なでるは行動を使わない（なでるは1日3回まで）
 * - 30日目の夜、壊れていた記録が完全に戻り、30日の過ごし方でエンディングが決まる。その後も暮らしは続く
 */
export type Species = "dog" | "cat";
export type EquipId = "light" | "climate" | "comms" | "camera" | "feeder" | "water" | "arm";
export const EQUIP: EquipId[] = ["light", "climate", "comms", "camera", "feeder", "water", "arm"];
export type ClimateMode = "off" | "eco" | "normal";
/** その日のしたいこと */
export type Want = "touch" | "play" | "window" | "alone" | "rest";
export const WANTS: Want[] = ["touch", "play", "window", "alone", "rest"];
/** 点検できる場所 */
export type PlaceId = "kitchen" | "shelf" | "closet" | "entrance" | "underfloor" | "storage" | "attic";
export const PLACE_IDS: PlaceId[] = ["kitchen", "shelf", "closet", "entrance", "underfloor", "storage", "attic"];
export interface Loot { parts?: number; food?: number; water?: number; memo?: string; blanket?: boolean }
/** 場所ごとに、点検するたびに順に見つかるもの（なくなれば「何もない」） */
export const PLACES: Record<PlaceId, { from: number; loot: Loot[] }> = {
  kitchen: { from: 1, loot: [{ food: 5, memo: "m_note" }, { food: 4 }, { water: 4 }] },
  shelf: { from: 1, loot: [{ parts: 1, memo: "m_photo" }, { parts: 1 }] },
  closet: { from: 1, loot: [{ blanket: true, food: 2 }, { parts: 1 }] },
  entrance: { from: 1, loot: [{ memo: "m_leash" }, { parts: 1 }] },
  underfloor: { from: 4, loot: [{ water: 6, food: 3 }, { parts: 2 }] },
  storage: { from: 9, loot: [{ parts: 2, memo: "m_calendar" }, { parts: 1, food: 3 }] },
  attic: { from: 15, loot: [{ parts: 2, memo: "m_collar" }, { food: 3, water: 3 }] },
};

export interface Pet { full: number; hydration: number; energy: number; stress: number; trust: number; health: number; indep: number; depend: number }
export interface Daily { fed: number; watered: boolean; pets: number; played: boolean; looked: boolean; searched: boolean; repaired: EquipId | null; touchFailed: number; wantMet: boolean; pushedAway: number }
export interface Stats { pets: number; plays: number; looks: number; searches: number; repairs: number; lowPowerDays: number; shutdowns: number; careMisses: number; armRepaired: boolean; wantsMet: number; wantsMissed: number; coldNights: number }
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
  /** 今日のしたいこと（DAY 01 は無し） */
  want: Want | null;
  /** 応えて分かった好み（初めて応えた順） */
  learned: Want[];
  /** 場所ごとの点検回数 */
  places: Partial<Record<PlaceId, number>>;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
/** シード付き乱数（mulberry32） */
export function rand(st: GameState): number {
  let t = (st.seed = (st.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** 上がるほど上がりにくい増加（信頼・依存・自立）。端数は乱数で丸めるので、小さな積み重ねも消えない */
function grow(st: GameState, key: "trust" | "depend" | "indep", g: number) {
  const v = st.pet[key];
  const x = g > 0 ? g * Math.max(0.15, (100 - v) / 70) : g;
  const whole = Math.trunc(x), frac = x - whole;
  st.pet[key] = clamp(v + whole + (Math.abs(frac) > rand(st) ? Math.sign(frac) : 0));
}
const freshDaily = (): Daily => ({ fed: 0, watered: false, pets: 0, played: false, looked: false, searched: false, repaired: null, touchFailed: 0, wantMet: false, pushedAway: 0 });

export function newGame(name: string, species: Species, seed = Date.now() & 0x7fffffff, now = Date.now()): GameState {
  return {
    v: 3, name, species, day: 1, ap: 3, apMax: 3,
    pet: { full: 30, hydration: 45, energy: 55, stress: 62, trust: 5, health: 70, indep: 30, depend: 10 },
    power: 72, ash: 4, temp: 19, climate: "eco", lights: true,
    equip: { light: 92, climate: 85, comms: 18, camera: 90, feeder: 88, water: 90, arm: 86 },
    parts: 2, food: 24, water: 14,
    daily: freshDaily(),
    stats: { pets: 0, plays: 0, looks: 0, searches: 0, repairs: 0, lowPowerDays: 0, shutdowns: 0, careMisses: 0, armRepaired: false, wantsMet: 0, wantsMissed: 0, coldNights: 0 },
    flags: {}, records: [], pending: null, ending: null, seed: seed | 0, lastSeen: now,
    want: null, learned: [], places: {},
  };
}

// ---- 電力・室温 -----------------------------------------------------------------------------
/** 1日の発電量（降灰で減る。空が晴れていても、パネルに積もった灰で落ちる） */
export const generation = (st: GameState) => Math.round(25 * (1 - st.ash / 130));
export const CLIMATE_USE: Record<ClimateMode, number> = { off: 0, eco: 5, normal: 10 };
/** 1日の常時消費（照明・空調・カメラ・通信。壊れた設備は電気を食わない） */
export function upkeep(st: GameState): number {
  const on = (id: EquipId) => st.equip[id] > 0;
  return 3 + (st.lights && on("light") ? 4 : 0) + (on("climate") ? CLIMATE_USE[st.climate] : 0) + (on("camera") ? 2 : 0) + (on("comms") ? 2 : 0);
}
/** 外の気温（灰で日が遮られ、日を追って冷える） */
export const outsideTemp = (st: GameState) => Math.round((17 - Math.min(10, st.ash / 6) - Math.min(3, st.day / 10)) * 10) / 10;
/** 今夜の室温の見込み */
export function roomTemp(st: GameState): number {
  const heat = st.equip.climate > 0 ? { off: 0, eco: 5, normal: 9 }[st.climate] * (st.equip.climate < 40 ? 0.6 : 1) : 0;
  return Math.round((outsideTemp(st) + heat) * 10) / 10;
}
/** 寒さの境目（毛布があると少し強い） */
export const coldLine = (st: GameState) => (st.flags.blanket ? 12 : 13.5);
/** 明日の朝の蓄電の見込み（今の設定のまま夜を越したとき） */
export const powerForecast = (st: GameState) => clamp(st.power + generation(st) - upkeep(st));
function usePower(st: GameState, n: number) { st.power = clamp(st.power - n); }
export const statusOf = (v: number) => (v <= 0 ? "broken" : v < 40 ? "unstable" : "ok") as "broken" | "unstable" | "ok";

// ---- 行動 ---------------------------------------------------------------------------------
export type Result = { ok: true; note?: string } | { ok: false; reason: string };

export function feed(st: GameState): Result {
  if (st.food <= 0) return { ok: false, reason: "food" };
  if (st.pet.full >= 85) return { ok: false, reason: "full" };
  const f = st.equip.feeder;
  if (f <= 0 && st.equip.arm <= 0) return { ok: false, reason: "feeder" };
  st.food--;
  st.pet.full = clamp(st.pet.full + (f > 0 && f < 30 ? 30 : 45));
  st.pet.health = clamp(st.pet.health + 2);
  st.daily.fed++;
  if (st.daily.fed === 1) grow(st, "trust", 0.5);
  if (f > 0) st.equip.feeder = clamp(f - 2); else st.equip.arm = clamp(st.equip.arm - 3);
  usePower(st, 1);
  return { ok: true, note: f <= 0 ? "manual" : f < 30 ? "unstable" : undefined };
}

export function giveWater(st: GameState): Result {
  if (st.water <= 0) return { ok: false, reason: "water" };
  if (st.pet.hydration >= 85) return { ok: false, reason: "full" };
  if (st.equip.water <= 0) return { ok: false, reason: "waterer" };
  st.water--;
  st.pet.hydration = clamp(st.pet.hydration + 55);
  st.pet.health = clamp(st.pet.health + 1);
  st.daily.watered = true;
  st.equip.water = clamp(st.equip.water - 1);
  usePower(st, 1);
  return { ok: true };
}

export const PETS_PER_DAY = 3;
/** なでる（接触機構）。壊れていれば反応しない。ひとりでいたい日は、離れていく */
export function pet(st: GameState): Result {
  if (st.equip.arm <= 0) { st.daily.touchFailed++; return { ok: false, reason: "arm" }; }
  if (st.daily.pets >= PETS_PER_DAY) return { ok: true, note: "enough" };
  st.daily.pets++;
  st.stats.pets++;
  st.equip.arm = clamp(st.equip.arm - 1);
  if (st.want === "alone") {
    st.daily.pushedAway++;
    st.pet.stress = clamp(st.pet.stress + 3);
    return { ok: true, note: "away" };
  }
  const dog = st.species === "dog", k = st.daily.pets;
  grow(st, "trust", [2, 1, 0.3][k - 1]!);
  st.pet.stress = clamp(st.pet.stress - [5, 3, 1][k - 1]!);
  grow(st, "depend", [1.5, 1.5, 3][k - 1]! * (dog ? 1.3 : 0.8));
  return { ok: true };
}

export function play(st: GameState): Result {
  if (st.ap < 1) return { ok: false, reason: "ap" };
  if (st.pet.energy < 15) return { ok: false, reason: "tired" };
  if (st.equip.arm <= 0) return { ok: false, reason: "arm" };
  st.ap--;
  st.daily.played = true;
  st.stats.plays++;
  const cat = st.species === "cat";
  st.pet.energy = clamp(st.pet.energy - 18);
  st.pet.full = clamp(st.pet.full - 6);
  st.pet.hydration = clamp(st.pet.hydration - 6);
  st.pet.stress = clamp(st.pet.stress - (st.want === "rest" ? 0 : 6));
  grow(st, "trust", 1);
  grow(st, "indep", cat ? 1 : 0.5);
  st.pet.health = clamp(st.pet.health + 2);
  st.equip.arm = clamp(st.equip.arm - 2);
  usePower(st, 2);
  return { ok: true };
}

/** 窓の外を見る（カメラ）。外の様子と、ときどき記録の手がかり。一緒に外を見る時間にもなる */
export function look(st: GameState): Result & { find?: string } {
  if (st.ap < 1) return { ok: false, reason: "ap" };
  if (st.equip.camera <= 0) return { ok: false, reason: "camera" };
  st.ap--;
  st.daily.looked = true;
  st.stats.looks++;
  usePower(st, 1);
  // 一緒に窓を見る：猫は自立、犬は安心
  if (st.species === "cat") grow(st, "indep", 1.5); else st.pet.stress = clamp(st.pet.stress - 3);
  const cands = ["r_ash", "r_sound", "r_lights", "r_tower", "r_bird"].filter((r) => !st.records.includes(r));
  if (cands.length && rand(st) < 0.55) { const f = cands[Math.floor(rand(st) * cands.length)]!; st.records.push(f); return { ok: true, find: f }; }
  return { ok: true };
}

/** その場所に、まだ見つかるものがいくつ残っているか */
export const placeLeft = (st: GameState, id: PlaceId) => PLACES[id].loot.length - (st.places[id] ?? 0);
export const placeOpen = (st: GameState, id: PlaceId) => st.day >= PLACES[id].from;

/** 部屋を点検する：場所ごとに、決まったもの（部品・食料・水・毛布・手がかり）が順に見つかる */
export function search(st: GameState, id: PlaceId): Result & { found: Loot } {
  if (st.ap < 1) return { ok: false, reason: "ap", found: {} } as never;
  if (!placeOpen(st, id)) return { ok: false, reason: "closed", found: {} } as never;
  if (placeLeft(st, id) <= 0) return { ok: false, reason: "empty", found: {} } as never;
  st.ap--;
  st.daily.searched = true;
  st.stats.searches++;
  usePower(st, 1);
  const loot = PLACES[id].loot[st.places[id] ?? 0]!;
  st.places[id] = (st.places[id] ?? 0) + 1;
  st.parts += loot.parts ?? 0;
  st.food += loot.food ?? 0;
  st.water += loot.water ?? 0;
  if (loot.blanket) st.flags.blanket = true;
  if (loot.memo && !st.records.includes(loot.memo)) st.records.push(loot.memo);
  return { ok: true, found: loot };
}

export const REPAIR_COST: Record<EquipId, number> = { light: 1, climate: 2, comms: 3, camera: 1, feeder: 1, water: 1, arm: 2 };
export function repair(st: GameState, id: EquipId): Result {
  if (st.ap < 1) return { ok: false, reason: "ap" };
  if (st.equip[id] >= 90) return { ok: false, reason: "fine" };
  if (st.parts < REPAIR_COST[id]) return { ok: false, reason: "parts" };
  if (id === "comms") return { ok: false, reason: "outside" };   // 通信の不調は家の外（基地局・回線）の問題で、ここからは直せない
  st.ap--;
  st.parts -= REPAIR_COST[id];
  st.equip[id] = clamp(Math.max(st.equip[id], 0) + 60);
  st.daily.repaired = id;
  st.stats.repairs++;
  if (id === "arm" && st.flags.armBroke) st.stats.armRepaired = true;
  usePower(st, 3);
  return { ok: true };
}

/** 止まった通信機を分解して、部品を取り出す（外への呼びかけを手放す）。行動は使わない */
export const DISMANTLE_PARTS = 3;
export function dismantle(st: GameState): Result {
  if (st.flags.dismantled) return { ok: false, reason: "done" };
  if (st.equip.comms > 0) return { ok: false, reason: "working" };
  st.flags.dismantled = true;
  st.parts += DISMANTLE_PARTS;
  return { ok: true };
}

export function setClimate(st: GameState, m: ClimateMode) { st.climate = m; }
export function setLights(st: GameState, on: boolean) { st.lights = on; }

// ---- したいこと ------------------------------------------------------------------------------
/** 今日のしたいことが、今日の過ごし方で満たされたか */
export function wantMet(st: GameState): boolean {
  const d = st.daily;
  switch (st.want) {
    case "touch": return d.pets >= 2;
    case "play": return d.played;
    case "window": return d.looked;
    case "alone": return d.pets === 0 && !d.played;
    case "rest": return !d.played && st.pet.energy >= 45;
    default: return false;
  }
}
/** 朝のしたいことを決める。犬は「そばに」、猫は「窓」「ひとり」が多い。疲れていれば休みたい */
function pickWant(st: GameState): Want {
  if (st.pet.energy < 40) return "rest";
  const w: Record<Want, number> = st.species === "dog"
    ? { touch: 4, play: 3, window: 1.5, alone: 0.8, rest: 0.7 }
    : { touch: 2, play: 2, window: 3, alone: 2.5, rest: 0.8 };
  if (st.equip.arm <= 0) { w.touch *= 1.6; w.play *= 0.6; }   // 触れられない日ほど、触れてほしがる
  if (st.equip.camera <= 0) w.window = 0;
  if (st.want) w[st.want] *= 0.35;                             // 同じ要求は続きにくい
  const total = WANTS.reduce((s, k) => s + w[k], 0);
  let r = rand(st) * total;
  for (const k of WANTS) { r -= w[k]; if (r <= 0) return k; }
  return "touch";
}

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
  p.full = clamp(p.full - 27);
  p.hydration = clamp(p.hydration - 30);
  // 室温
  st.temp = roomTemp(st);
  const cold = st.temp < coldLine(st);
  if (cold) st.stats.coldNights++;
  // したいこと
  const met = st.want ? wantMet(st) : false;
  d.wantMet = met;
  if (st.want) {
    if (met) {
      st.stats.wantsMet++;
      if (!st.learned.includes(st.want)) st.learned.push(st.want);
      p.stress = clamp(p.stress - 6);
      grow(st, "trust", 1.5);
      if (st.want === "alone") grow(st, "indep", 4);
      if (st.want === "touch") grow(st, "depend", 1);
      if (st.want === "rest") p.energy = clamp(p.energy + 10);
    } else {
      st.stats.wantsMissed++;
      p.stress = clamp(p.stress + (st.want === "touch" && dog ? 5 : 3));
    }
  }
  // げんき・ストレス（外の様子が悪くなるほど、落ち着かない夜が増える）
  p.energy = clamp(p.energy + (cold ? 24 : 38) * (hungry ? 0.6 : 1));
  const world = st.day >= 20 ? 4 : st.day >= 10 ? 2 : 0;
  const noTouch = d.pets === 0 && !d.played && !(st.want === "alone" && met);
  p.stress = clamp(p.stress + 6 + world + (hungry ? 8 : 0) + (thirsty ? 8 : 0) + (cold ? 7 : 0) + (noTouch ? (dog ? 7 : 3) : 0) + (!st.lights || st.equip.light <= 0 ? 3 : 0) + (d.touchFailed ? (dog ? 5 : 3) : 0));
  // 信頼：触れ合いのない日は少し薄れる
  if (noTouch && !met) grow(st, "trust", -1);
  // 自立：落ち着いていて、ひとりの時間がある日に育つ（放っておかれて不安な日は育たない）
  const calm = p.stress < 50 && !hungry && !thirsty;
  if (calm && d.pets <= (dog ? 0 : 1)) grow(st, "indep", dog ? 2 : 3);
  if (p.stress >= 70 || d.pets >= 3) grow(st, "indep", -1);
  // 依存：遊びとひとりの時間で和らぎ、なで続けると強まる
  grow(st, "depend", -(d.played ? 2 : 0) - (d.pets === 0 ? 3 : 0) + (d.pets >= 3 && !d.played ? 2 : 0));
  // 体調：満たされた欲求で回復し、欠けると落ちる（10 未満にはしない）
  const miss = (hungry ? 1 : 0) + (thirsty ? 1 : 0) + (cold ? 1 : 0);
  st.stats.careMisses += miss;
  p.health = clamp(p.health + (miss ? -6 * miss : 3) - (p.stress > 75 ? 3 : 0), 10, 100);
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
      if (choice === 0) { grow(st, "trust", 3); grow(st, "depend", 2); } else { pet.stress = clamp(pet.stress - 4); grow(st, "indep", 2); }
      break;
    case "d4": // 窓のシャッター：閉じる（灰を防ぐ・暗い）／開けておく（外が見える）
      st.flags.shutter = choice === 0;
      if (choice === 0) { st.ash = Math.max(0, st.ash - 6); pet.stress = clamp(pet.stress - 3); } else { grow(st, "indep", st.species === "cat" ? 5 : 2); }
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

/** 朝：日付を進め、行動を戻し、決まった日のできごと（降灰・故障・雨）を起こす。起きたことの key を返す */
export function nextDay(st: GameState): string[] {
  if (!st.pending?.resolved) return [];
  if (st.day === 30 && !st.ending) st.ending = decideEnding(st);
  st.pending = null;
  const wasCold = st.temp < coldLine(st);
  st.day++;
  const events: string[] = [];
  // 電力が尽きた夜：翌日は低電力（行動が減る）
  if (st.power <= 0) { st.apMax = 1; st.stats.shutdowns++; st.stats.lowPowerDays++; st.lights = false; st.climate = "off"; events.push("shutdown"); }
  else if (st.power < 15) { st.apMax = 2; st.stats.lowPowerDays++; events.push("lowpower"); }
  else st.apMax = 3;
  st.ap = st.apMax;
  st.daily = freshDaily();
  if (wasCold && !events.includes("shutdown")) events.push("cold");
  // 降灰：3日目から始まり、波を打って増えていく
  if (st.day >= 3) st.ash = clamp(st.ash + (st.flags.shutter ? 1.5 : 2.5) + (st.day % 6 === 0 ? 5 : 0));
  // 雨：パネルの灰を洗い流し、雨水がたまる（12日目・23日目）
  if (st.day === 12 || st.day === 23) { st.ash = clamp(st.ash - 18); st.water += 6; }
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
  if (st.day === 4 || st.day === 9 || st.day === 15) events.push("place");
  st.want = pickWant(st);
  return events;
}

// ---- 観察（数値を出さずに、様子として伝える） ---------------------------------------------------
export interface Observation { mood: "calm" | "uneasy" | "restless"; distance: "close" | "balanced" | "own"; health: "good" | "tired" | "weak" }
export function observe(st: GameState): Observation {
  const p = st.pet;
  return {
    mood: p.stress < 35 ? "calm" : p.stress < 65 ? "uneasy" : "restless",
    distance: p.depend >= p.indep + 20 ? "close" : p.indep >= p.depend + 20 ? "own" : "balanced",
    health: p.health >= 60 ? "good" : p.health >= 35 ? "tired" : "weak",
  };
}

// ---- エンディング ------------------------------------------------------------------------
export type Ending = "together" | "lastlight" | "return" | "waiting" | "survival";
export const equipAverage = (st: GameState) => Math.round(EQUIP.filter((e) => e !== "comms").reduce((s, e) => s + st.equip[e], 0) / 6);

/**
 * 30日の過ごし方で結末を選ぶ。「毎日全部なでれば一番良い結末」にはならない：
 * なで続けると依存が上がり、その子のしたいことに応えること・ひとりの時間・設備の維持との釣り合いが要る。
 */
export function decideEnding(st: GameState): Ending {
  const p = st.pet;
  if (st.stats.pets + st.stats.plays < 10 || p.trust < 30 || p.health < 35) return "survival";                   // 生存だけを守った
  if (st.flags.sacrifice || equipAverage(st) < 22 || st.stats.shutdowns >= 3) return "lastlight";              // 自分を使い切った
  if (p.depend >= 70 && p.indep < 45) return "waiting";                                                         // 離れられない
  if (p.stress >= 70) return "survival";                                                                        // 落ち着ける日が来なかった
  if (p.indep >= (st.species === "cat" ? 60 : 75) && p.indep >= p.depend + 25 && p.trust >= 50 && st.stats.wantsMet >= 12) return "return"; // 自由なのに、戻ってくる
  return "together";                                                                                            // 互いに暮らしを続ける
}

// ---- 保存 ---------------------------------------------------------------------------------
/** 以前の version 3（したいこと・場所の点検が入る前）の保存に、足りない項目を補う */
export function upgrade(g: GameState): GameState {
  g.want ??= null;
  g.learned ??= [];
  g.places ??= {};
  g.daily.wantMet ??= false;
  g.daily.pushedAway ??= 0;
  g.stats.wantsMet ??= 0;
  g.stats.wantsMissed ??= 0;
  g.stats.coldNights ??= 0;
  return g;
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
    && (g.pending === null || (!!g.pending && typeof g.pending.id === "string" && typeof g.pending.resolved === "boolean"))
    && (g.want === undefined || g.want === null || WANTS.includes(g.want))
    && (g.learned === undefined || (Array.isArray(g.learned) && g.learned.every((w) => WANTS.includes(w))))
    && (g.places === undefined || (typeof g.places === "object" && g.places !== null && Object.entries(g.places).every(([k, n]) => PLACE_IDS.includes(k as PlaceId) && Number.isInteger(n) && n >= 0)));
}

/** 時間帯（残りの行動で決まる） */
export function timeOfDay(st: GameState): "morning" | "noon" | "evening" | "night" {
  if (st.pending) return "night";
  const used = st.apMax - st.ap;
  return used <= 0 ? "morning" : used === 1 ? "noon" : "evening";
}
