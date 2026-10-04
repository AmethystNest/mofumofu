import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = 'public/assets/pet/cat/rig/';
const atlas = JSON.parse(readFileSync(`${dir}atlas.json`, 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
const rig = JSON.parse(readFileSync(`${dir}rig.json`, 'utf8')) as {
  width: number; height: number;
  parts: Record<string, { x: number; y: number; w: number; h: number; kind: string; axis?: string; root?: string; behind?: boolean }>;
  eyes: Record<string, { c: number[]; size: number[] }>;
};
const png = readFileSync(`${dir}atlas.png`);
const size = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
const cat = readFileSync('public/assets/pet/cat/cat.png');

describe('猫のパーツ素材', () => {
  it('元の猫の絵は 731×695', () => {
    expect([cat.readUInt32BE(16), cat.readUInt32BE(20)]).toEqual([731, 695]);
    expect([rig.width, rig.height]).toEqual([731, 695]);
  });
  it('必要なパーツがそろっている', () => {
    const names = ['base', 'tail', 'earL', 'earR'];
    for (const side of ['L', 'R']) for (const st of ['Open', 'Half', 'Closed', 'Happy']) names.push(`eye${st}${side}`);
    for (const n of names) expect(atlas.frames[n], n).toBeDefined();
  });
  it('アトラスの枠は画像の内側で、重ならない', () => {
    const boxes = Object.values(atlas.frames).map((f) => f.frame);
    for (const f of boxes) {
      expect(f.x + f.w).toBeLessThanOrEqual(size.w);
      expect(f.y + f.h).toBeLessThanOrEqual(size.h);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
  });
  it('しなるパーツ：向きと付け根が決まっている。しっぽは奥、耳は手前', () => {
    for (const n of ['tail', 'earL', 'earR']) {
      const p = rig.parts[n]!;
      expect(p.kind).toBe('rope');
      expect(['v', 'h']).toContain(p.axis);
      expect(['top', 'bottom', 'left', 'right']).toContain(p.root);
    }
    expect(rig.parts.tail!.behind).toBe(true);
    expect(rig.parts.earL!.behind).toBe(false);
  });
  it('パーツは元の絵の内側。目のシール4種は同じ大きさ・位置', () => {
    for (const [n, p] of Object.entries(rig.parts)) {
      expect(p.x, n).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w, n).toBeLessThanOrEqual(731);
      expect(p.y + p.h, n).toBeLessThanOrEqual(695);
    }
    for (const side of ['L', 'R']) {
      const o = rig.parts[`eyeOpen${side}`]!;
      for (const st of ['Half', 'Closed', 'Happy']) {
        const q = rig.parts[`eye${st}${side}`]!;
        expect([q.x, q.y, q.w, q.h]).toEqual([o.x, o.y, o.w, o.h]);
      }
    }
  });
  it('目の位置は顔の中（左右が同じ高さ・間隔が妥当）', () => {
    const L = rig.eyes.L!, R = rig.eyes.R!;
    expect(Math.abs(L.c[1]! - R.c[1]!)).toBeLessThan(6);
    expect(R.c[0]! - L.c[0]!).toBeGreaterThan(200);
    expect(R.c[0]! - L.c[0]!).toBeLessThan(300);
  });
});
