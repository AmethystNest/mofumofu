import { isGame, newGame, type GameState, type Species } from "../game";
export type { Species };
/** 導入のあとの最初の操作（食事→撫でる） */
export type Tutorial = "feed" | "pet" | "done";
export interface Save {
  version: 3;
  game: GameState;
  journal: { day: number; title: string; text: string }[];
  updatedAt: number;
  tutorial: Tutorial;
}
const KEY = "mofumofu-save-v3";
/** 以前のルール（プロトタイプ由来）の保存。読み込み時に名前と種類だけを引き継ぐ */
const OLD_KEY = "mofumofu-save-v2";

const journalOf = (v: unknown): Save["journal"] =>
  Array.isArray(v)
    ? v.filter((j) => j && Number.isInteger(j.day) && typeof j.title === "string" && typeof j.text === "string").slice(-120)
    : [];

/**
 * 以前のルールの保存（version 2）を、新しいルールの DAY 01 に移す。
 * 数値の意味がまったく違う（配給・探索・市民登録 → 電力・設備）ため、日数や数値は引き継がず、名前と種類だけを残す。
 * 導入は済んでいるので、最初の食事の案内から始める。
 */
function migrateV2(value: { game?: { name?: unknown }; species?: unknown }): Save | null {
  const name = value.game?.name;
  if (typeof name !== "string" || !name || name.length > 8) return null;
  const species = value.species === "dog" ? "dog" : "cat";
  return {
    version: 3,
    game: newGame(name, species),
    journal: [{ day: 1, title: "記録の再構成", text: "記録の形式が変わった。\n以前の記録は、読み出せなかった。\n名称は、引き継いだ。" }],
    updatedAt: Date.now(),
    tutorial: "feed",
  };
}

export function decodeSave(raw: string): Save | null {
  try {
    const value = JSON.parse(raw);
    if (value?.version === 2) return migrateV2(value);
    const game = value?.version === 3 ? value.game : value;
    if (!isGame(game) || game.name.length > 8 || game.day > 9999) return null;
    return {
      version: 3,
      game,
      journal: journalOf(value.journal),
      updatedAt: Number(value.updatedAt) || 0,
      tutorial: ["feed", "pet"].includes(value.tutorial) ? value.tutorial : "done",
    };
  } catch {
    return null;
  }
}
export function loadSave(): Save | null {
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) return decodeSave(cur);
    const old = localStorage.getItem(OLD_KEY);
    return old ? decodeSave(old) : null;
  } catch {
    return null;
  }
}
export function persist(save: Save) {
  save.updatedAt = Date.now();
  save.journal = save.journal.slice(-120);
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    localStorage.removeItem(OLD_KEY);
    return true;
  } catch {
    return false;
  }
}
/** 保存を消して、導入からやり直せるようにする */
export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OLD_KEY);
    return true;
  } catch {
    return false;
  }
}
