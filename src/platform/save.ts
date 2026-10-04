import { migrate, type GameState } from "../core";
import type { Species } from "../content/species";
export type { Species };
/** 導入のあとの最初の操作（食事→撫でる）。undefined は「済み」（導入より前の保存） */
export type Tutorial = "feed" | "pet" | "done";
export interface Save {
  version: 2;
  game: GameState;
  journal: { day: number; title: string; text: string }[];
  updatedAt: number;
  /** 保護したペット。導入より前の保存には無いので、読み込み時に猫（現在の既定）を補う */
  species: Species;
  tutorial: Tutorial;
}
const KEY = "mofumofu-save-v2";
export function decodeSave(raw: string): Save | null {
  try {
    const value = JSON.parse(raw);
    const game = value.version === 2 ? value.game : value;
    if (
      game.v !== 1 ||
      typeof game.name !== "string" ||
      game.name.length > 8 ||
      !Number.isInteger(game.day) ||
      game.day < 1 ||
      !game.dog ||
      !game.inv ||
      !game.daily ||
      !game.me
    )
      return null;
    for (const n of [
      game.ap,
      game.me.hp,
      ...Object.values(game.dog),
      ...Object.values(game.inv),
    ])
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    if (!Number.isInteger(game.seed)) return null;
    for (const [key, keys] of Object.entries({
      dog: ["full", "energy", "trust", "anx"],
      inv: ["ration", "can", "dogfood"],
      daily: ["pets", "played", "explored", "dogAte"],
      me: ["hp", "collapsed"],
    })) {
      for (const field of keys) {
        const expected = ["played", "explored", "dogAte", "collapsed"].includes(
          field,
        )
          ? "boolean"
          : "number";
        if (typeof game[key][field] !== expected) return null;
      }
    }
    if (
      game.pendingNight !== null &&
      (!game.pendingNight ||
        !["n1", "n2", "n3", "n3b", "n4", "n5", "n6", "ch1", "vig"].includes(
          game.pendingNight.id,
        ) ||
        typeof game.pendingNight.resolved !== "boolean" ||
        !Array.isArray(game.pendingNight.result))
    )
      return null;
    if (
      !Array.isArray(game.seen) ||
      !Array.isArray(game.log) ||
      !game.flags ||
      !game.stats ||
      typeof game.stats.explores !== "number" ||
      ![null, true, false].includes(game.registered) ||
      !Number.isInteger(game.chapter)
    )
      return null;
    if (
      ["full", "energy", "trust", "anx"].some((k) => game.dog[k] > 100) ||
      game.ap > 3
    )
      return null;
    return {
      version: 2,
      game: migrate(game)!,
      journal: Array.isArray(value.journal)
        ? value.journal
            .filter(
              (j: Save["journal"][number]) =>
                Number.isInteger(j.day) &&
                typeof j.title === "string" &&
                typeof j.text === "string",
            )
            .slice(-100)
        : [],
      updatedAt: Number(value.updatedAt) || 0,
      species: value.species === "dog" ? "dog" : "cat",
      tutorial: ["feed", "pet"].includes(value.tutorial) ? value.tutorial : "done",
    };
  } catch {
    return null;
  }
}
export function loadSave() {
  try {
    return decodeSave(localStorage.getItem(KEY) || "");
  } catch {
    return null;
  }
}
export function persist(save: Save) {
  save.updatedAt = Date.now();
  save.journal = save.journal.slice(-100);
  save.game.log = save.game.log.slice(-300);
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
