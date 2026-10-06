/**
 * 場面（暗転の上に、薄い文字だけを重ねる演出）。夜の記録・DAY の切り替え・記録の復元で使う。
 * 画面のどこかをタップすると、いま表示中の文を待たずに先へ進む（読む速さは人によって違うため）。
 * 見た目の作りは導入（ui/intro.ts）と同じ言葉づかい：左上の小さな記録（log）、中央の言葉（cap／voice）、下の選択（choose）。
 */
export type Mode = "log" | "head" | "cap" | "voice" | "day";

export interface Scene {
  /** 行を足して、読む時間だけ待つ（タップで短縮）。hold で待ち時間を上書き */
  say(text: string, mode?: Mode, hold?: number): Promise<void>;
  wait(ms: number): Promise<void>;
  /** 表示中の行を消す */
  clear(): Promise<void>;
  /** 選択肢を出し、選ばれた番号を返す */
  choose(options: { label: string; sub?: string }[]): Promise<number>;
  /** 幕を上げる（下の画面を見せる）。root を取り除く */
  close(ms?: number): Promise<void>;
  /** 暗転の濃さを変える（0＝下の画面が見える、1＝完全な黒） */
  veil(v: number, ms?: number): void;
  readonly root: HTMLElement;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function openScene(host: HTMLElement, o: { veil?: number } = {}): Promise<Scene> {
  const root = document.createElement("div");
  root.className = "scene-ov";
  root.innerHTML = `<div class="sc-bg"></div><div class="sc-col" aria-live="polite"></div><div class="sc-mid" aria-live="polite"></div><div class="sc-panel"></div>`;
  host.append(root);
  const bg = root.querySelector<HTMLElement>(".sc-bg")!;
  const col = root.querySelector<HTMLElement>(".sc-col")!;
  const mid = root.querySelector<HTMLElement>(".sc-mid")!;
  const panel = root.querySelector<HTMLElement>(".sc-panel")!;
  let skip: (() => void) | undefined;
  root.addEventListener("pointerdown", () => skip?.());
  const wait = (ms: number) => new Promise<void>((resolve) => {
    const t = window.setTimeout(done, reduced() ? Math.min(ms, 400) : ms);
    function done() { window.clearTimeout(t); skip = undefined; resolve(); }
    skip = done;
  });
  const veil = (v: number, ms = 900) => { bg.style.transitionDuration = `${ms}ms`; bg.style.opacity = String(v); };
  veil(0, 0);
  const ready = new Promise<void>((resolve) => requestAnimationFrame(() => { veil(o.veil ?? 1, 900); window.setTimeout(resolve, 900); }));

  const scene: Scene = {
    root,
    veil,
    wait,
    async say(text, mode = "log", hold) {
      const p = document.createElement("p");
      p.className = `l-${mode}`;
      p.textContent = text;
      (mode === "log" || mode === "head" ? col : mid).append(p);
      requestAnimationFrame(() => p.classList.add("on"));
      await wait(hold ?? Math.min(4200, 1000 + text.length * 70));
    },
    async clear() {
      col.classList.add("out"); mid.classList.add("out");
      await wait(600);
      col.innerHTML = ""; mid.innerHTML = ""; col.classList.remove("out"); mid.classList.remove("out");
    },
    choose(options) {
      return new Promise((resolve) => {
        panel.innerHTML = options.map((c, i) => `<button data-i="${i}"><span>${c.label.replace(/</g, "&lt;")}</span>${c.sub ? `<small>${c.sub.replace(/</g, "&lt;")}</small>` : ""}</button>`).join("");
        panel.classList.add("on");
        panel.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.onclick = () => {
          panel.classList.remove("on");
          window.setTimeout(() => { panel.innerHTML = ""; resolve(Number(b.dataset.i)); }, 400);
        }));
        (panel.querySelector("button") as HTMLButtonElement | null)?.focus({ preventScroll: true });
      });
    },
    async close(ms = 1400) {
      root.classList.add("closing");
      root.style.transitionDuration = `${ms}ms`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => { root.style.opacity = "0"; window.setTimeout(resolve, ms); }));
      root.remove();
    },
  };
  return ready.then(() => scene);
}
