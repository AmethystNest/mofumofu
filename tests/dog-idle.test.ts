import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frameAtTime } from '../src/render/dog-idle';

const animation = JSON.parse(readFileSync(new URL('../public/assets/dog/idle-v12/animation.json', import.meta.url), 'utf8')) as {
  sequence: number[]; durationsMs: number[];
};

describe('採用済みの犬の待機タイムライン', () => {
  it('瞬きと左右の首かしげの各境界で、次のコマへ切り替わる', () => {
    const boundaries = [
      [0, 0], [1300, 1], [1390, 2], [1530, 1], [1620, 0],
      [2370, 4], [2570, 5], [3220, 4], [3420, 0],
      [4220, 7], [4420, 8], [5070, 7], [5270, 0],
    ] as const;
    for (const [ms, frame] of boundaries) {
      expect(frameAtTime(animation.sequence, animation.durationsMs, ms)).toBe(frame);
      expect(frameAtTime(animation.sequence, animation.durationsMs, ms + 6370)).toBe(frame);
    }
    expect(frameAtTime(animation.sequence, animation.durationsMs, 1299)).toBe(0);
    expect(frameAtTime(animation.sequence, animation.durationsMs, 1389)).toBe(1);
    expect(frameAtTime(animation.sequence, animation.durationsMs, 4419)).toBe(7);
    expect(frameAtTime(animation.sequence, animation.durationsMs, 5069)).toBe(8);
  });

  it('ループの両端で正面の同じ絵を維持する', () => {
    for (const ms of [6369, 6370, 6371, 12740]) {
      expect(frameAtTime(animation.sequence, animation.durationsMs, ms)).toBe(0);
    }
    expect(animation.durationsMs.reduce((sum, ms) => sum + ms, 0)).toBe(6370);
  });
});
