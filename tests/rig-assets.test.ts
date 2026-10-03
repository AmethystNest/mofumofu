import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = 'public/assets/dog/rig-v1/';
const atlas = JSON.parse(readFileSync(`${dir}atlas.json`, 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
const rig = JSON.parse(readFileSync(`${dir}rig.json`, 'utf8')) as { parts: Record<string, { x: number; y: number; w: number; h: number; pivot: number[] | null; z: string }>; eyes: Record<string, { c: number[]; r: number[] }> };
const png = readFileSync(`${dir}atlas.png`);
const size = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };

describe('パーツ素材（rig-v1）', () => {
  it('必要なパーツがそろっている', () => {
    for (const n of ['base', 'tail', 'earL', 'earR', 'cheekL', 'cheekR', 'pawL', 'pawR', 'irisL', 'irisR', 'ringL', 'ringR', 'lidUpL', 'lidUpR', 'lidLoL', 'lidLoR', 'lashUp', 'lashLo'])
      expect(atlas.frames[n], n).toBeDefined();
  });
  it('アトラスの枠はすべて画像の内側で、重ならない', () => {
    const boxes = Object.values(atlas.frames).map(f => f.frame);
    for (const f of boxes) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(size.w);
      expect(f.y + f.h).toBeLessThanOrEqual(size.h);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
  });
  it('回すパーツには支点があり、元の絵（320×320）の内側にある', () => {
    for (const n of ['tail', 'earL', 'earR', 'cheekL', 'cheekR', 'pawL', 'pawR']) {
      const p = rig.parts[n]!;
      expect(p.pivot, n).not.toBeNull();
      expect(p.pivot![0]).toBeGreaterThan(0); expect(p.pivot![0]).toBeLessThan(320);
      expect(p.pivot![1]).toBeGreaterThan(0); expect(p.pivot![1]).toBeLessThan(320);
    }
  });
  it('尾はベースの奥、そのほかは手前', () => {
    expect(rig.parts.tail!.z).toBe('behind');
    expect(rig.parts.earL!.z).toBe('front');
  });
  it('目の位置は顔の中（左右の目が同じ高さ・間隔が妥当）', () => {
    const L = rig.eyes.L!, R = rig.eyes.R!;
    expect(Math.abs(L.c[1]! - R.c[1]!)).toBeLessThan(3);
    expect(R.c[0]! - L.c[0]!).toBeGreaterThan(60);
    expect(R.c[0]! - L.c[0]!).toBeLessThan(90);
  });
});
