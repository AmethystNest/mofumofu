/** 保護する動物の種類。物語・品目の文言は犬を基準に書かれているため、表示の直前に種類へ合わせて置き換える（coreの数値・文言は変えない） */
export type Species = "dog" | "cat";

export const SPECIES_LABEL: Record<Species, string> = { dog: "犬", cat: "猫" };

/** 文章中の「犬」を、選んだ種類の言葉にする。犬のときはそのまま */
export function sp(text: string, species: Species): string {
  return species === "dog" ? text : text.replaceAll("ドッグフード", "キャットフード").replaceAll("犬", SPECIES_LABEL[species]);
}

/** 画面に出す名前の既定（導入で登録するまでの仮） */
export const DEFAULT_PET_NAME = "ハル";

/** 名称の整形：前後の空白を除き8文字まで。空なら null */
export function cleanName(raw: string): string | null {
  const s = [...raw.trim().replace(/\s+/g, " ")].slice(0, 8).join("");
  return s ? s : null;
}
