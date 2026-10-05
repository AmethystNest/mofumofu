/** 種類（犬・猫）× 成長段階（赤ちゃん・中間・成体）ごとの見た目の定義と、部屋の中の置き場所 */
import type { Species } from "../content/species";
import type { PetLayout } from "./effects";
import { createPetSprite, stillSrc, type PetMotion, type Stage } from "./pet-sprite";

export type { Stage };

/** 成長：1〜7日目＝赤ちゃん（第一章）、8〜21日目＝中間、22日目〜＝成体（案。ルールの確定は第5段階） */
export function stageForDay(day: number): Stage {
  return day <= 7 ? "baby" : day <= 21 ? "young" : "adult";
}

/** 段階ごとの寸法（コマは 768×768、足元は y=690）。犬と猫は同じ値を使い、同じ大きさに見せる */
const FRAME = 768;
const FEET_Y = 690;
const STAGES: Record<
  Stage,
  {
    /** コマの幅（部屋の幅に対する cqw）。成長するほど絵の見える部分が大きくなる分、箱は小さめにして見える大きさを揃えて伸ばす */
    w: number;
    /** 触れる範囲（コマに対する %）。歩く動きの幅も含める */
    hit: [number, number, number, number];
    /** 頭の上（ハート・ため息）の位置（コマの座標） */
    head: [number, number];
    /** 歩く一歩ぶんの進み（コマの px / 秒）。足が滑らないよう段階ごとに合わせた値 */
    stride: number;
  }
> = {
  baby: { w: 80, hit: [30, 70, 48, 91], head: [384, 410], stride: 90 },
  young: { w: 72, hit: [21, 78, 37, 91], head: [384, 340], stride: 120 },
  adult: { w: 68, hit: [19, 80, 23, 91], head: [384, 260], stride: 150 },
};

export interface PetDef {
  species: Species;
  stage: Stage;
  /** アトラスのキャラ名（例 cat_baby） */
  char: string;
  look: string;
  src: string;
  width: number;
  height: number;
  layout: PetLayout;
  box: { w: number; ar: number; fy: number };
  /** 論理キャンバスの中での絵の位置（%） */
  img: { left: number; top: number; w: number };
  /** 触れる範囲（コマに対する %）：[左, 右, 上, 下] */
  hit: [number, number, number, number];
  /** 歩く速さ（部屋の幅に対する %／秒） */
  speed: number;
  create(slot: string, image: HTMLImageElement): Promise<PetMotion>;
}

const LOOK: Record<Species, string> = { dog: "黒白に赤い紋様の犬", cat: "白黒に青い紋様の猫" };

export function petDef(species: Species, stage: Stage): PetDef {
  const s = STAGES[stage];
  const char = `${species}_${stage}`;
  return {
    species,
    stage,
    char,
    look: LOOK[species],
    src: stillSrc(char),
    width: FRAME,
    height: FRAME,
    layout: { w: FRAME, h: FRAME, head: s.head, floor: [FRAME / 2, FEET_Y], tailArea: [s.hit[0] * 7.68, s.head[1] + 120, s.hit[0] * 7.68 + 200, FEET_Y - 20] },
    box: { w: s.w, ar: 1, fy: FEET_Y / FRAME },
    img: { left: 0, top: 0, w: 100 },
    hit: s.hit,
    speed: (s.stride * s.w) / FRAME,
    create: (slot, image) => createPetSprite(slot, char, image),
  };
}

/** ペットの箱の置き場所を CSS 変数で与える。cx＝中心の横位置（%）、scale＝大きさの倍率、feet＝足元の高さ（部屋の高さに対する割合、既定は指定比率） */
export function placePet(box: HTMLElement, def: PetDef, o: { cx?: number; scale?: number; feet?: number } = {}) {
  const w = def.box.w * (o.scale ?? 1);
  const feet = (o.feet ?? 0.769) * ((100 * 1672) / 941);
  const s = box.style;
  s.setProperty("--w", `${w}cqw`);
  s.setProperty("--ar", String(def.box.ar));
  s.setProperty("--cx", `${o.cx ?? 50}%`);
  s.setProperty("--top", `${feet - (w * def.box.fy) / def.box.ar}cqw`);
  s.setProperty("--img-left", `${def.img.left}%`);
  s.setProperty("--img-top", `${def.img.top}%`);
  s.setProperty("--img-w", `${def.img.w}%`);
  const [l, r, t, b] = def.hit;
  s.setProperty("--hit-l", `${l}%`);
  s.setProperty("--hit-t", `${t}%`);
  s.setProperty("--hit-w", `${r - l}%`);
  s.setProperty("--hit-h", `${b - t}%`);
  // 足元の影：体の幅に合わせる
  s.setProperty("--sh-l", `${l + (r - l) * 0.12}%`);
  s.setProperty("--sh-w", `${(r - l) * 0.76}%`);
  box.dataset.species = def.species;
  box.dataset.stage = def.stage;
}

/** ペットの箱（影・タッチ領域・静止画）の HTML */
export function petBoxHtml(def: PetDef, id: string, label: string, alt: string): string {
  return `<div class="pet-box" id="${id}-box" data-species="${def.species}"><span class="pet-shadow"></span><img class="pet-img" src="${def.src}" width="${def.width}" height="${def.height}" alt="${alt}"><button class="pet-button" id="${id}" aria-label="${label}"></button></div>`;
}
