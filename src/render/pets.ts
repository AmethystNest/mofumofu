/** 種類ごと（犬・猫）の見た目の定義：絵・配置・動かし方。部屋の中の置き場所は CSS 変数で渡す */
import type { Species } from "../content/species";
import { createDogMotion } from "./dog-motion";
import { createDogRig } from "./dog-rig";
import { createPetFallback, createPetRig, PET_LAYOUT, type PetMotion } from "./pet-rig";
import type { PetLayout } from "./effects";

export interface PetDef {
  id: Species;
  /** 絵の見た目の説明（代替テキスト） */
  look: string;
  src: string;
  /** 元の絵の大きさ */
  width: number;
  height: number;
  layout: PetLayout;
  /** 論理キャンバスの幅（部屋の幅に対する %）・縦横比・足元の高さの割合 */
  box: { w: number; ar: number; fy: number };
  /** 論理キャンバスの中での絵の位置（%） */
  img: { left: number; top: number; w: number };
  create(image: HTMLImageElement): Promise<PetMotion>;
}

const base = import.meta.env.BASE_URL;

export const PETS: Record<Species, PetDef> = {
  cat: {
    id: "cat",
    look: "灰青色の猫",
    src: `${base}assets/pet/cat/cat.png`,
    width: 731,
    height: 695,
    layout: PET_LAYOUT,
    box: { w: 45.16, ar: 871 / 849, fy: 830 / 849 },
    img: { left: 8.04, top: 16.5, w: 83.9 },
    create: (image) => createPetRig(image).catch(() => createPetFallback(image)),
  },
  dog: {
    id: "dog",
    look: "ボーダーコリー風の犬",
    src: `${base}assets/dog/idle-v12/frame_00.png`,
    width: 320,
    height: 320,
    layout: { w: 320, h: 320, head: [160, 58], floor: [160, 306], tailArea: [215, 175, 300, 290] },
    box: { w: 48, ar: 1, fy: 287 / 320 },
    img: { left: 0, top: 0, w: 100 },
    create: (image) => createDogRig(image).catch(() => createDogMotion(image)),
  },
};

/** 部屋（高さ 1672／幅 941）の中で、足元が来る高さ（部屋の幅に対する cqw） */
export const FEET_CQW = (100 * 1672 * 0.769) / 941;

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
  box.dataset.species = def.id;
}

/** ペットの箱（影・タッチ領域・一枚絵）の HTML */
export function petBoxHtml(def: PetDef, id: string, label: string, alt: string): string {
  return `<div class="pet-box" id="${id}-box" data-species="${def.id}"><span class="pet-shadow"></span><button class="pet-button" id="${id}" aria-label="${label}"><img class="pet-img" src="${def.src}" width="${def.width}" height="${def.height}" alt="${alt}"></button></div>`;
}
