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

export interface Bowl {
  /** 入れ終わったら解決する */
  ready: Promise<void>;
  /** 食べる・飲む（ms のあいだに中身が減り、器が片づく） */
  consume(ms: number): void;
}
export interface Effects {
  hearts(count?: number, at?: [number, number]): void;
  sparkles(count?: number): void;
  /** 器を出して、中身を入れる（ごはんは粒が落ちて山になる／水は注がれて水面が上がる）。cx は部屋の幅に対する %（省略時はペットの足元） */
  serve(kind: 'food' | 'water', cx?: number): Bowl;
  sleepy(on: boolean): void;
  sigh(): void;
  destroy(): void;
}

/** ごはんの器（横 120×高さ 64）。粒は山の上から順に減る */
const KIBBLE: [number, number][] = [
  [60, 17], [52, 19], [68, 19], [45, 22], [57, 22], [69, 22], [77, 23], [38, 25], [49, 25], [61, 25], [72, 25], [83, 26],
  [32, 28], [42, 28], [53, 28], [64, 28], [75, 28], [87, 29],
];
let uid = 0;
function bowlSvg(kind: 'food' | 'water'): string {
  const id = `b${++uid}`;
  const shell = `<ellipse class="b-shadow" cx="60" cy="58" rx="52" ry="6"/>
<path class="b-body" d="M7 30 Q9 51 30 56 L90 56 Q111 51 113 30 Z"/>
<path class="b-band" d="M10 40 Q60 50 110 40 L108 45 Q60 55 12 45 Z"/>
<ellipse class="b-rim" cx="60" cy="30" rx="53" ry="11.5"/>
<ellipse class="b-in" cx="60" cy="31" rx="46" ry="8.5"/>`;
  if (kind === 'food')
    return `<svg viewBox="0 0 120 64" aria-hidden="true">${shell}
${KIBBLE.map(([x, y], i) => `<g class="kibble" style="--i:${i};--j:${KIBBLE.length - i}"><ellipse cx="${x}" cy="${y}" rx="5.6" ry="4"/><ellipse class="k-hi" cx="${x - 1.6}" cy="${y - 1.4}" rx="1.8" ry="1.1"/></g>`).join('')}
<path class="b-gloss" d="M16 35 Q18 46 28 51"/></svg>`;
  return `<svg viewBox="0 0 120 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe8fb"/><stop offset="1" stop-color="#4f9fcd"/></linearGradient></defs>${shell}
<rect class="w-stream" x="57" y="-70" width="6" height="101" rx="3"/>
<g class="w-surface"><ellipse cx="60" cy="31.5" rx="44" ry="7.6" fill="url(#${id})"/><path class="w-glint" d="M34 29 Q48 26 62 28"/></g>
<ellipse class="w-ripple r1" cx="60" cy="31.5" rx="10" ry="2.2"/><ellipse class="w-ripple r2" cx="60" cy="31.5" rx="10" ry="2.2"/>
<path class="b-gloss" d="M16 35 Q18 46 28 51"/></svg>`;
}

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
    serve(kind, cx) {
      // 器は足元の手前に置く（前足に少し重なる。食べる・飲む姿勢の口元が器に入る）
      const el = spawn(`fx-bowl ${kind}`, [L.floor[0], L.floor[1] + L.h * 0.03], 60000);
      el.innerHTML = bowlSvg(kind);
      el.style.width = `${dog.getBoundingClientRect().width * 0.34}px`;
      if (cx !== undefined) el.style.left = `${(card.getBoundingClientRect().width * cx) / 100}px`;
      const still = reduced();
      if (still) el.classList.add('still');
      // 狭い画面では器が部屋の説明文に重なるので、器があるあいだは文を退ける
      card.classList.add('fx-eating');
      const fill = still ? 0 : kind === 'food' ? 1150 : 1100;
      return {
        ready: new Promise<void>((done) => later(done, fill)),
        consume(ms) {
          el.style.setProperty('--eat', `${ms}ms`);
          el.classList.add('eating');
          later(() => el.classList.add('leave'), ms + 200);
          later(() => { el.remove(); card.classList.remove('fx-eating'); }, ms + 700);
        },
      };
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
