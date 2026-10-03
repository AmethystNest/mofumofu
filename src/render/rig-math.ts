/** パーツ式の犬の動きに使う、描画に依存しない計算（Vitest で検査する） */

/** ばね（半陰的オイラー）。w は固有角振動数 rad/s、zeta<1 で行き過ぎて戻る（フォロースルー） */
export class Spring {
  value: number;
  velocity = 0;
  constructor(value = 0, public w = 16, public zeta = 0.45) { this.value = value; }
  step(target: number, dt: number): number {
    // 大きな dt でも発散しないよう、細かく刻む
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.velocity += (this.w * this.w * (target - this.value) - 2 * this.zeta * this.w * this.velocity) * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  reset(value = 0) { this.value = value; this.velocity = 0; }
}

/** 縦に伸ばすと横が縮む、もちもちした体積保存に近い横倍率（k=1 で完全保存、小さいほど控えめ） */
export const squashX = (sy: number, k = 0.7) => Math.pow(sy, -k);

/** 前フレームからの変化量を速度にする（dt が 0 のときは 0） */
export const velocity = (now: number, prev: number, dt: number) => (dt > 0 ? (now - prev) / dt : 0);

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 次のまばたきまでなどの、ばらつきのある待ち時間（ms）。rng は 0..1 */
export const randBetween = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

/** 視線の目標（黒目のずれ px）。左目は外側（左）に余白が広く、内側（右）は狭いので範囲を非対称にする */
export const GAZE_X: [number, number] = [-4, 3];
export const GAZE_Y: [number, number] = [-2.5, 2.2];
export const gazeTarget = (rng: () => number): [number, number] => {
  const r = rng();
  if (r < 0.34) return [0, 0];                       // 正面へ戻る
  return [randBetween(rng, GAZE_X[0], GAZE_X[1]), randBetween(rng, GAZE_Y[0], GAZE_Y[1])];
};

/** 方向 -1..1 を視線のずれに換算 */
export const gazeFromDir = (dir: number): [number, number] => {
  const d = clamp(dir, -1, 1);
  return [d < 0 ? -d * GAZE_X[0] : d * GAZE_X[1], 0];
};
