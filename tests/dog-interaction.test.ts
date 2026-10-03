import { describe, expect, it } from 'vitest';
import { BREATH, PAW_Y, breathLift, leanShift, strips } from '../src/render/warp';
import { isStroking, type TouchPoint } from '../src/render/gesture';

describe('局所変形', () => {
  it('足と胴体下側（y>=245）は呼吸・首の寄せで一切動かない', () => {
    for (let y = PAW_Y; y < 320; y++) {
      for (const b of [-1, -0.3, 0.5, 1]) expect(breathLift(y, b, 3)).toBe(0);
      for (const l of [-5, 2, 5]) expect(leanShift(y, l)).toBe(0);
    }
  });
  it('帯は上から順に隙間なく並び、最後の帯は PAW_Y でぴったり終わる', () => {
    for (const b of [-1, 0, 1]) for (const l of [-4, 0, 4]) {
      const s = strips(b, 2, l);
      for (let i = 1; i < s.length; i++) expect(s[i]!.dy).toBeLessThanOrEqual(s[i - 1]!.dy + s[i - 1]!.dh + 1e-9);
      const last = s[s.length - 1]!;
      expect(last.dy + last.dh).toBeCloseTo(PAW_Y, 6);
      expect(last.sy + last.sh).toBe(PAW_Y);
    }
  });
  it('変形量は小さい（呼吸 2px以内・首の寄せは指定量以内）', () => {
    for (const k of Object.keys(BREATH)) expect(BREATH[k]!.amp).toBeLessThanOrEqual(2);
    for (let y = 0; y < PAW_Y; y++) {
      expect(Math.abs(breathLift(y, 1, 2))).toBeLessThanOrEqual(2);
      expect(Math.abs(leanShift(y, 4))).toBeLessThanOrEqual(4);
    }
  });
  it('頭の行は呼吸で全量、首から下へなめらかに減る', () => {
    expect(breathLift(100, 1, 1.5)).toBeCloseTo(1.5);
    expect(breathLift(200, 1, 1.5)).toBeGreaterThan(0);
    expect(breathLift(200, 1, 1.5)).toBeLessThan(1.5);
  });
});

describe('なでる判定', () => {
  const line = (n: number, step: number, dt: number): TouchPoint[] => Array.from({ length: n }, (_, i) => ({ t: i * dt, x: i * step, y: 0 }));
  it('指先の小さなぶれではなで始めない', () => expect(isStroking([{ t: 0, x: 0, y: 0 }, { t: 120, x: 4, y: 3 }])).toBe(false));
  it('なでるように動かすとなで始める', () => expect(isStroking(line(10, 5, 30))).toBe(true));
  it('往復でも合計移動量で判定する', () => {
    const back: TouchPoint[] = [0, 9, 0, 9, 0].map((x, i) => ({ t: i * 40, x, y: 0 }));
    expect(isStroking(back)).toBe(true);
  });
});
