/**
 * 犬の画像の「局所変形」の計算（描画非依存・テスト可能）。
 * 承認済み素材の足と胴体下側（y >= PAW_Y）は一切動かさない。
 * 呼吸は胸から上をわずかに持ち上げ、首の寄せは頭の行だけを横へずらす。全体の上下移動や縮小はしない。
 */
export const SIZE = 320;
/** これより下（足・胴体下側）は固定 */
export const PAW_Y = 245;
/** 呼吸で頭まで一緒に上がり始める行（ここより上は全量） */
const CHEST_TOP = 150;
/** 首の寄せが効き始める行（ここより下は動かない）と、全量になる行 */
const NECK_Y = 205, HEAD_Y = 130;

export const smoothstep = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

/** 行 y が呼吸でどれだけ上がるか（px、正で上）。breath は -1..1 の呼吸位相、amp は最大量 */
export function breathLift(y: number, breath: number, amp: number): number {
  if (y >= PAW_Y) return 0;
  return amp * breath * smoothstep((PAW_Y - y) / (PAW_Y - CHEST_TOP));
}
/** 行 y が首の寄せでどれだけ横へずれるか（px、正で右） */
export function leanShift(y: number, lean: number): number {
  if (y >= NECK_Y) return 0;
  return lean * smoothstep((NECK_Y - y) / (NECK_Y - HEAD_Y));
}

export interface Strip { sy: number; sh: number; dx: number; dy: number; dh: number }
/** 0..PAW_Y の行を帯に分け、それぞれの描き先を返す。帯どうしは隙間なく、わずかに重なる */
export function strips(breath: number, amp: number, lean: number, step = 3): Strip[] {
  const out: Strip[] = [];
  for (let y = 0; y < PAW_Y; y += step) {
    const y1 = Math.min(PAW_Y, y + step);
    const d0 = y - breathLift(y, breath, amp), d1 = y1 - breathLift(y1, breath, amp);
    out.push({ sy: y, sh: y1 - y, dx: leanShift((y + y1) / 2, lean), dy: d0, dh: d1 - d0 + (y1 < PAW_Y ? 0.4 : 0) });
  }
  return out;
}

/** 状態ごとの呼吸（量 px・周期 秒） */
export const BREATH: Record<string, { amp: number; period: number }> = {
  idle: { amp: 1.3, period: 3.6 },
  pet: { amp: 1.1, period: 2.8 },
  play: { amp: 1.2, period: 1.4 },
  eat: { amp: 0.8, period: 2.4 },
  sleep: { amp: 2.0, period: 5.2 },
  sad: { amp: 1.0, period: 4.4 },
};
