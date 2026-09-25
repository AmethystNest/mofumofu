/** 犬のパーツの「つながり」検査：成長のどの段階・耳のどの角度でも、耳の付け根が頭の内側に隠れること */
import { describe, expect, it } from 'vitest';
import { apply, smooth, type Pt } from '../src/lab/shiba/painter';
import * as P from '../src/lab/shiba/parts';

function inside(poly: Pt[], [x, y]: Pt): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const rot = ([x, y]: Pt, [cx, cy]: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};

describe('耳と頭のつながり', () => {
  it('全成長段階・アニメーションで取り得る耳の角度で、付け根の角が頭の内側にある', () => {
    // dog.ts：左耳 = -(earRot + 耳ぴく) で -45〜0 度、右耳 = earRot×0.9 で 0〜35 度
    const bad: string[] = [];
    for (let age = 0; age <= 1.0001; age += 0.05) {
      const L = P.layout(age);
      const headSpec = P.head(L);
      const headPoly = smooth(headSpec.outline).map(p => apply(L.head, p));
      const piv = P.pivots(L);
      for (const side of ['L', 'R'] as const) {
        const ear = P.ear(side, L);
        const pts = ear.outline.map(p => apply(ear.xf!, p));
        // 付け根の角＝最初と最後の点、および付け根側の点
        const roots = [pts[0]!, pts[pts.length - 1]!, pts[pts.length - 2]!];
        const pv = side === 'L' ? piv.earL : piv.earR;
        for (const deg of side === 'L' ? [-45, -30, -15, 0] : [0, 12, 24, 35]) {
          roots.forEach((r, k) => { if (!inside(headPoly, rot(r, pv, deg))) bad.push(`age=${age.toFixed(2)} ear${side} ${deg}° 付け根${k}`); });
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('尾・脚と胴のつながり', () => {
  it('全成長段階で、尾の付け根と脚の上端が胴の内側に隠れる', () => {
    const bad: string[] = [];
    for (let age = 0; age <= 1.0001; age += 0.05) {
      const L = P.layout(age);
      const bodyPoly = smooth(P.body(L).outline).map(p => apply(L.body, p));
      const piv = P.pivots(L);
      // 尾：付け根（回転の支点）が、振り（±20度）と垂れ（+30度）でも胴の内側
      for (const deg of [-20, 0, 20, 30]) {
        const t = P.tail(L);
        const pts = t.outline.map(p => apply(t.xf!, p));
        const nearest = pts.reduce((m, p) => (Math.hypot(p[0] - piv.tail[0], p[1] - piv.tail[1]) < Math.hypot(m[0] - piv.tail[0], m[1] - piv.tail[1]) ? p : m));
        if (!inside(bodyPoly, rot(nearest, piv.tail, deg))) bad.push(`age=${age.toFixed(2)} 尾 ${deg}°`);
      }
      // 脚：上端の両角
      for (const leg of [P.frontL(L), P.frontR(L), P.hind(L)]) {
        for (const p of leg.outline.slice(0, 2)) if (!inside(bodyPoly, p)) bad.push(`age=${age.toFixed(2)} ${leg.name} 上端 ${p.map(v => v.toFixed(0))}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('首まわりの着せ替え', () => {
  it('全成長段階で、バンダナ・首輪の帯の両端が頭か胴の内側に収まる', () => {
    const bad: string[] = [];
    for (let age = 0; age <= 1.0001; age += 0.05) {
      const L = P.layout(age);
      const headPoly = smooth(P.head(L).outline).map(p => apply(L.head, p));
      const bodyPoly = smooth(P.body(L).outline).map(p => apply(L.body, p));
      for (const id of ['bandana-red', 'collar']) {
        const band = P.neckwearParts(id, L)[0]!;
        const pts = band.outline.map(p => apply(band.xf!, p));
        const xs = pts.map(p => p[0]);
        const ends = [pts[xs.indexOf(Math.min(...xs))]!, pts[xs.indexOf(Math.max(...xs))]!];
        // 輪郭の毛束（最大で約6単位）までは隠れる
        const near = (poly: Pt[], q: Pt) => inside(poly, q) || poly.some(v => Math.hypot(v[0] - q[0], v[1] - q[1]) < 6);
        for (const e of ends) if (!near(headPoly, e) && !near(bodyPoly, e)) bad.push(`age=${age.toFixed(2)} ${id} 端 ${e.map(v => v.toFixed(0))}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
