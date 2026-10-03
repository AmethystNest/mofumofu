import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = 'public/assets/dog/rig-v1/';
const atlas = JSON.parse(readFileSync(`${dir}atlas.json`, 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
const rig = JSON.parse(readFileSync(`${dir}rig.json`, 'utf8')) as { parts: Record<string, { x: number; y: number; w: number; h: number; kind: string; axis?: string; root?: string; behind?: boolean }>; eyes: Record<string, { c: number[]; r: number[] }> };
const png = readFileSync(`${dir}atlas.png`);
const size = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };

describe('パーツ素材（rig-v1）', () => {
  it('必要なパーツがそろっている', () => {
    for (const n of ['base', 'tail', 'earL', 'earR', 'cheekL', 'cheekR', 'eyeOpenL', 'eyeOpenR', 'eyeHalfL', 'eyeHalfR', 'eyeClosedL', 'eyeClosedR'])
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
  it('しなるパーツは向きと付け根が決まっている（付け根は動かさない）', () => {
    for (const n of ['tail', 'earL', 'earR', 'cheekL', 'cheekR']) {
      const p = rig.parts[n]!;
      expect(p.kind, n).toBe('rope');
      expect(['v', 'h']).toContain(p.axis);
      expect(['top', 'bottom', 'left']).toContain(p.root);
    }
    expect(rig.parts.tail!.behind).toBe(true);
    expect(rig.parts.earL!.behind).toBe(false);
  });
  it('パーツの位置は元の絵（320×320）の内側', () => {
    for (const [n, p] of Object.entries(rig.parts)) {
      expect(p.x, n).toBeGreaterThanOrEqual(0);
      expect(p.y, n).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w, n).toBeLessThanOrEqual(320);
      expect(p.y + p.h, n).toBeLessThanOrEqual(320);
    }
  });
  it('目のシール（開き・半目・閉じ）は同じ大きさ・同じ位置', () => {
    for (const side of ['L', 'R']) {
      const o = rig.parts[`eyeOpen${side}`]!;
      for (const st of ['Half', 'Closed']) {
        const q = rig.parts[`eye${st}${side}`]!;
        expect([q.x, q.y, q.w, q.h]).toEqual([o.x, o.y, o.w, o.h]);
      }
    }
  });
  it('目の位置は顔の中（左右の目が同じ高さ・間隔が妥当）', () => {
    const L = rig.eyes.L!, R = rig.eyes.R!;
    expect(Math.abs(L.c[1]! - R.c[1]!)).toBeLessThan(3);
    expect(R.c[0]! - L.c[0]!).toBeGreaterThan(60);
    expect(R.c[0]! - L.c[0]!).toBeLessThan(90);
  });
});
