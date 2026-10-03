import { describe, expect, it } from 'vitest';
import { GAZE_X, GAZE_Y, Spring, clamp, gazeFromDir, gazeTarget, randBetween, squashX, velocity } from '../src/render/rig-math';

describe('ばね（従い遅れ）', () => {
  it('目標へ収束する', () => {
    const s = new Spring(0, 20, 0.5);
    for (let i = 0; i < 300; i++) s.step(10, 1 / 60);
    expect(s.value).toBeCloseTo(10, 2);
    expect(Math.abs(s.velocity)).toBeLessThan(0.01);
  });
  it('減衰が小さいと行き過ぎてから戻る（フォロースルー）', () => {
    const s = new Spring(0, 22, 0.3);
    let peak = 0;
    for (let i = 0; i < 120; i++) peak = Math.max(peak, s.step(10, 1 / 60));
    expect(peak).toBeGreaterThan(10.5);
  });
  it('目標の変化に少し遅れて追う（すぐには届かない）', () => {
    const s = new Spring(0, 16, 0.6);
    s.step(10, 1 / 60);
    expect(s.value).toBeGreaterThan(0);
    expect(s.value).toBeLessThan(2);
  });
  it('フレームが飛んでも発散しない', () => {
    const s = new Spring(0, 40, 0.3);
    for (let i = 0; i < 50; i++) s.step(i % 2 ? 5 : -5, 0.05);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(Math.abs(s.value)).toBeLessThan(50);
  });
});

describe('スクワッシュ＆ストレッチ', () => {
  it('縦に伸びると横が縮み、つぶれると横に広がる', () => {
    expect(squashX(1.1)).toBeLessThan(1);
    expect(squashX(0.88)).toBeGreaterThan(1);
    expect(squashX(1)).toBe(1);
  });
  it('面積はほぼ保たれる（変化は数％以内）', () => {
    for (const sy of [0.86, 0.9, 0.95, 1.05, 1.1]) expect(Math.abs(squashX(sy) * sy - 1)).toBeLessThan(0.05);
  });
});

describe('視線', () => {
  it('目標は黒目が縁に余白のある範囲に収まる', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const [x, y] = gazeTarget(rng);
      expect(x).toBeGreaterThanOrEqual(GAZE_X[0]);
      expect(x).toBeLessThanOrEqual(GAZE_X[1]);
      expect(y).toBeGreaterThanOrEqual(GAZE_Y[0]);
      expect(y).toBeLessThanOrEqual(GAZE_Y[1]);
    }
  });
  it('向きから視線へ：左は負、右は正、範囲外は丸める', () => {
    expect(gazeFromDir(-1)[0]).toBe(GAZE_X[0]);
    expect(gazeFromDir(1)[0]).toBe(GAZE_X[1]);
    expect(gazeFromDir(5)[0]).toBe(GAZE_X[1]);
    expect(gazeFromDir(0)[0]).toBe(0);
  });
});

describe('補助', () => {
  it('待ち時間は指定の範囲', () => {
    for (const r of [0, 0.5, 0.999]) {
      const v = randBetween(() => r, 2200, 5500);
      expect(v).toBeGreaterThanOrEqual(2200);
      expect(v).toBeLessThanOrEqual(5500);
    }
  });
  it('速度と丸め', () => {
    expect(velocity(10, 4, 0.5)).toBe(12);
    expect(velocity(10, 4, 0)).toBe(0);
    expect(clamp(5, 0, 3)).toBe(3);
  });
});
