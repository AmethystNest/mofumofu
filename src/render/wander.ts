/**
 * 部屋の中を歩く。ペットの箱（.pet-box）を横へ動かし、そのあいだ「歩く」の足踏み（弾み・傾き・耳としっぽ）を再生する。
 * 犬・猫どちらも同じ速さ・同じ動かし方（部屋の幅の割合）。横位置は画面の描き直しをまたいで覚えておく。
 * 自動でときどき歩くほか、部屋の床をタップするとそこへ歩く。ごはんのときは中央の器へ歩いてくる。
 */
import type { DogMotion as PetMotion } from "./dog-motion";

/** 歩く範囲（部屋の幅に対する %）。スマホの縦画面で見える中央付近に収める */
export const WALK_MIN = 30;
export const WALK_MAX = 70;
/** 歩く速さ（部屋の幅に対する %/秒） */
const SPEED = 13;

let remembered = 50;
export const rememberedCx = () => remembered;
export const resetCx = () => { remembered = 50; };

export interface Wander {
  /** 目標の横位置（%）まで歩く。着いたら（または中断されたら）解決する */
  walkTo(cx: number): Promise<void>;
  /** 自動で歩くかどうかの判定を渡して、ときどき歩かせる */
  auto(canWalk: () => boolean): void;
  /** 歩いている途中なら、その場で止まる */
  stop(): void;
  readonly walking: boolean;
  destroy(): void;
}

export function createWander(box: HTMLElement, scene: HTMLElement, motion: () => PetMotion | undefined): Wander {
  let timer = 0, autoTimer = 0, finish: (() => void) | undefined, walking = false;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** 今の見かけの横位置（%）。歩いている途中でも正しい値になる */
  function current(): number {
    const r = box.getBoundingClientRect(), s = scene.getBoundingClientRect();
    return ((r.left + r.width / 2 - s.left) / s.width) * 100;
  }
  function settleHere() {
    const cx = walking ? current() : remembered;
    box.style.transition = "none";
    box.style.setProperty("--cx", `${cx}%`);
    remembered = cx;
    void box.offsetWidth;          // 反映してから、transition を元（CSS 側の指定）へ戻す
    box.style.transition = "";
    walking = false;
  }
  function stop() {
    if (!walking) return;
    window.clearTimeout(timer);
    settleHere();
    motion()?.react("idle", 60);
    const f = finish; finish = undefined; f?.();
  }
  function walkTo(target: number) {
    const to = Math.max(WALK_MIN, Math.min(WALK_MAX, target));
    return new Promise<void>((resolve) => {
      stop();
      const from = walking ? current() : remembered;
      const d = to - from;
      if (Math.abs(d) < 2.5) return resolve();
      const dir = Math.sign(d);
      if (reduced()) {                          // 動きを減らす設定：歩かず、その場へ移るだけ
        box.style.transition = "none";
        box.style.setProperty("--cx", `${to}%`);
        remembered = to;
        return resolve();
      }
      const ms = Math.max(700, (Math.abs(d) / SPEED) * 1000);
      walking = true;
      finish = resolve;
      box.style.transition = `left ${ms}ms cubic-bezier(0.45, 0, 0.55, 1)`;
      box.style.setProperty("--cx", `${to}%`);
      motion()?.react("walk", ms + 120);
      motion()?.look(dir);
      timer = window.setTimeout(() => {
        walking = false;
        remembered = to;
        box.style.transition = "";
        const f = finish; finish = undefined; f?.();
      }, ms);
    });
  }
  function auto(canWalk: () => boolean) {
    const next = () => {
      autoTimer = window.setTimeout(() => {
        if (!document.hidden && !walking && canWalk() && motion()?.motion === "idle") {
          // いまの位置から 10〜26% ほど離れた場所へ（左右はランダム、端なら反対へ）
          let to = remembered + (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 16);
          if (to < WALK_MIN || to > WALK_MAX) to = remembered - Math.sign(to - 50) * (10 + Math.random() * 14);
          void walkTo(to);
        }
        next();
      }, 9000 + Math.random() * 12000);
    };
    window.clearTimeout(autoTimer);
    next();
  }
  return {
    walkTo, auto, stop,
    get walking() { return walking; },
    destroy() { window.clearTimeout(autoTimer); window.clearTimeout(timer); if (walking) settleHere(); finish?.(); },
  };
}
