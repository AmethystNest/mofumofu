/**
 * ペットの反応に添える小さな演出（DOM＋CSSアニメーション）。
 * 位置はペットの論理キャンバス（layout.w × layout.h）の座標で指定し、部屋の中の実際の位置へ換算する。
 * 端末の「動きを減らす」設定では、演出は出さない（器だけは静止で出す）。
 */
/** ペットの論理キャンバスと、演出を出す位置（論理座標） */
export interface PetLayout {
  w: number; h: number;
  head: [number, number];
  floor: [number, number];
  tailArea: [number, number, number, number];   // x0,y0,x1,y1
}

export interface Effects {
  hearts(count?: number, at?: [number, number]): void;
  sparkles(count?: number): void;
  bowl(ms: number, kind?: 'food' | 'water'): void;
  sleepy(on: boolean): void;
  sigh(): void;
  destroy(): void;
}

/** 器（横 100×高さ 52）。粒は後ろの列から順に減る */
const KIBBLE: [number, number][] = [[50, 16], [38, 18], [62, 18], [28, 22], [44, 22], [57, 22], [72, 22], [35, 26], [50, 26], [65, 26]];
const BOWL = `<svg viewBox="0 0 100 52" aria-hidden="true">
<ellipse class="b-shadow" cx="50" cy="47" rx="44" ry="5"/>
<path class="b-body" d="M6 21 Q8 42 24 46 L76 46 Q92 42 94 21 Z"/>
<path class="b-band" d="M9 31 Q50 39 91 31 L90 35 Q50 43 10 35 Z"/>
<ellipse class="b-rim" cx="50" cy="21" rx="44" ry="10"/>
<ellipse class="b-in" cx="50" cy="22" rx="38" ry="7"/>
${KIBBLE.map(([x, y], i) => `<ellipse class="kibble" style="--i:${KIBBLE.length - i}" cx="${x}" cy="${y}" rx="5" ry="3.4"/>`).join('')}
<path class="b-gloss" d="M14 24 Q16 34 24 39" />
</svg>`;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createEffects(card: HTMLElement, dog: HTMLElement, L: PetLayout): Effects {
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  card.append(layer);
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => { const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  /** ペットの論理座標 → 部屋内の px */
  function place([x, y]: [number, number]): [number, number] {
    const c = card.getBoundingClientRect(), d = dog.getBoundingClientRect();
    return [d.left - c.left + (x / L.w) * d.width, d.top - c.top + (y / L.h) * d.height];
  }
  function spawn(cls: string, at: [number, number], life: number, text = '', vars: Record<string, string> = {}) {
    const el = document.createElement('span');
    el.className = `fx ${cls}`;
    el.textContent = text;
    const [x, y] = place(at);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    layer.append(el);
    later(() => el.remove(), life);
    return el;
  }

  let zzz = 0;
  return {
    hearts(count = 3, at = L.head) {
      if (reduced()) return;
      for (let i = 0; i < count; i++) {
        later(() => spawn('fx-heart', [at[0] + (i - (count - 1) / 2) * L.w * 0.07 + (Math.random() - 0.5) * L.w * 0.03, at[1]], 1500, '♥',
          { '--drift': `${(Math.random() - 0.5) * 30}px`, '--scale': `${0.8 + Math.random() * 0.5}` }), i * 140);
      }
    },
    sparkles(count = 4) {
      if (reduced()) return;
      for (let i = 0; i < count; i++) {
        later(() => spawn('fx-spark', [L.tailArea[0] + Math.random() * (L.tailArea[2] - L.tailArea[0]), L.tailArea[1] + Math.random() * (L.tailArea[3] - L.tailArea[1])], 900, '✦',
          { '--drift': `${(Math.random() - 0.3) * 40}px`, '--scale': `${0.7 + Math.random() * 0.6}` }), i * 110);
      }
    },
    bowl(ms, kind = 'food') {
      // 足元の器：中のごはんが少しずつ減っていく
      // 器は足の前に小さく置き、足先が隠れすぎないよう床側へ下げる
      const el = spawn('fx-bowl', L.floor, ms + 500);
      el.innerHTML = BOWL;
      if (kind === 'water') el.classList.add('water');
      el.style.setProperty('--eat', `${ms}ms`);
      if (reduced()) el.classList.add('still');
      // 狭い画面では器が部屋の説明文に重なるので、食べている間だけ文を退ける
      card.classList.add('fx-eating');
      later(() => el.classList.add('leave'), ms);
      later(() => card.classList.remove('fx-eating'), ms + 450);
    },
    sleepy(on) {
      window.clearInterval(zzz);
      if (!on || reduced()) return;
      const puff = () => spawn('fx-z', [L.head[0] + L.w * 0.16, L.head[1] - L.h * 0.02], 2600, 'z', { '--scale': `${0.8 + Math.random() * 0.5}` });
      puff();
      zzz = window.setInterval(puff, 1700);
    },
    sigh() {
      if (reduced()) return;
      spawn('fx-sigh', [L.head[0] + L.w * 0.17, L.head[1] - L.h * 0.04], 2200, '…');
    },
    destroy() {
      window.clearInterval(zzz);
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      layer.remove();
      card.classList.remove('fx-eating');
    },
  };
}
