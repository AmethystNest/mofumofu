/** 犬へのタッチの判定（描画非依存・テスト可能） */
export interface TouchPoint { t: number; x: number; y: number }

/** なでたと見なす移動量（CSS px）。指先の小さなぶれは除く */
export const STROKE_DISTANCE = 26;

/** 軌跡の合計移動量 */
export function pathLength(track: readonly TouchPoint[]): number {
  let d = 0;
  for (let i = 1; i < track.length; i++) d += Math.hypot(track[i]!.x - track[i - 1]!.x, track[i]!.y - track[i - 1]!.y);
  return d;
}

/** 指を置いたまま動いている途中で、なで始めたか（往復も合計の移動量で数える） */
export const isStroking = (track: readonly TouchPoint[]) => pathLength(track) >= STROKE_DISTANCE;
