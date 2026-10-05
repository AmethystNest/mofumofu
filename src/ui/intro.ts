/**
 * 導入：起動 → 壊れた音声記録 → 部屋の映像の復元 → 犬と猫に触れて保護する子を選ぶ → 名称の登録 → DAY 01。
 * 画面に出すのは薄い文字だけ（カード・アイコン・数値・説明・報酬は出さない）。音は環境音が中心（platform/ambient.ts）。
 * 音声記録の声は収録していないので、字幕と雑音だけで表す。
 */
import { cleanName, type Species } from "../content/species";
import { petBoxHtml, petDef, placePet } from "../render/pets";
import { disposeSlot, type PetMotion } from "../render/pet-sprite";
import { createEffects } from "../render/effects";
import * as ambient from "../platform/ambient";

export interface IntroResult {
  species: Species;
  name: string;
  /** 下の画面の準備ができたら呼ぶ。黒い幕をゆっくり外す */
  reveal(): Promise<void>;
}

export function runIntro(host: HTMLElement): Promise<IntroResult> {
  return new Promise((resolveAll) => {
    const root = document.createElement("div");
    root.className = "intro";
    root.innerHTML = `<div class="intro-stage"><div class="stage morning"><div class="scene morning"><div class="room-bg"></div>${(["dog", "cat"] as Species[])
      .map((id) => petBoxHtml(petDef(id, "baby"), `i-${id}`, id === "dog" ? "犬に触れる" : "猫に触れる", petDef(id, "baby").look))
      .join("")}</div></div></div><div class="intro-scan"></div><div class="intro-sys" id="intro-sys" role="status" aria-live="polite"></div><div class="intro-panel" id="intro-panel"></div><button class="intro-skip" id="intro-skip" hidden>スキップ</button><div class="intro-black" id="intro-black"></div>`;
    host.append(root);
    const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
    const sys = $("#intro-sys"), panel = $("#intro-panel"), skip = $<HTMLButtonElement>("#intro-skip"), black = $("#intro-black");
    let fast = false;
    const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, fast ? Math.min(ms, 40) : ms));
    const clear = async () => { sys.classList.add("out"); await wait(700); sys.innerHTML = ""; sys.className = "intro-sys"; };
    /** 行を足す。mode: log＝左上の小さな記録／cap＝中央の字幕／note＝下の一言 */
    const say = (text: string, mode: "log" | "cap" | "note" = "log") => {
      const p = document.createElement("p");
      p.className = `l-${mode}`;
      p.textContent = text;
      sys.append(p);
      requestAnimationFrame(() => p.classList.add("on"));
      return p;
    };
    const setBlack = (on: boolean, s = 1.4) => { black.style.transitionDuration = `${fast ? 0.05 : s}s`; black.classList.toggle("on", on); };

    // ---- 起動前：最初のタップで音を使えるようにする（ブラウザの規則） -------------------------------------
    const gate = document.createElement("div");
    gate.className = "intro-gate";
    gate.innerHTML = `<button id="g-start" class="g-main">タップして起動</button><button id="g-quiet" class="g-sub">音を出さずに起動</button>`;
    root.append(gate);
    const begin = async (quiet: boolean) => {
      if (quiet) ambient.setMuted(true);
      else ambient.setMuted(false);
      await ambient.unlock();
      gate.classList.add("out");
      window.setTimeout(() => gate.remove(), 800);
      void main();
    };
    gate.querySelector("#g-start")!.addEventListener("click", () => void begin(false));
    gate.querySelector("#g-quiet")!.addEventListener("click", () => void begin(true));

    async function main() {
      skip.hidden = false;
      skip.onclick = () => { fast = true; };
      // Scene 01：再起動と診断
      ambient.mood("boot");
      ambient.blip("boot");
      await wait(1400);
      for (const l of ["システムを再起動しています。", "電源　　：低電力で稼働中", "記憶領域：一部に破損を検出", "映像入力：応答なし", "音声記録：1件を検出"]) {
        say(l);
        ambient.blip("crackle");
        await wait(1150);
      }
      await wait(1100);
      await clear();
      // Scene 02：壊れた音声記録（三つ目の言葉は出さない）
      ambient.mood("record");
      say("音声記録を再生します。");
      await wait(2200);
      await clear();
      ambient.blip("glitch");
      ambient.blip("breath", 0.3);
      await wait(900);
      say("……お願い", "cap");
      ambient.blip("breath");
      await wait(3000);
      ambient.blip("glitch");
      await wait(900);
      await clear();
      say("この子を、生かして。", "cap");
      ambient.blip("breath");
      await wait(3600);
      ambient.blip("glitch");
      ambient.blip("glitch", 0.15);
      ambient.blip("crackle", 0.3);
      await wait(500);
      await clear();
      say("記録の一部を復元できませんでした。");
      await wait(3200);
      await clear();
      // Scene 03：映像の復元
      ambient.mood("restore");
      say("映像入力を復元しています。");
      const steps = ["s1", "s2", "s3", "s4"];
      for (const s of steps) {
        root.classList.remove(...steps);
        root.classList.add(s);
        await wait(s === "s4" ? 2600 : 2300);
      }
      await clear();
      // Scene 04：部屋と、二つの生体反応
      skip.hidden = true;
      ambient.mood("room");
      root.classList.add("pets");
      await choose();
    }

    // ---- Scene 04：どちらかに触れて、保護する子を決める ---------------------------------------------------
    async function choose() {
      const motions: Partial<Record<Species, PetMotion>> = {};
      const defs = { dog: petDef("dog", "baby"), cat: petDef("cat", "baby") };
      const home: Record<Species, { cx: number; scale: number }> = { dog: { cx: 30, scale: 0.95 }, cat: { cx: 70, scale: 0.95 } };
      const box = (id: Species) => $<HTMLElement>(`#i-${id}-box`);
      for (const id of ["dog", "cat"] as Species[]) placePet(box(id), defs[id], { ...home[id], feet: 0.8 });
      // 動かす部品は、現れる前に読み込み始めておく
      await Promise.all((["dog", "cat"] as Species[]).map(async (id) => {
        try {
          const img = root.querySelector<HTMLImageElement>(`#i-${id} img`)!;
          motions[id] = await defs[id].create(`intro-${id}`, img);
          createEffects(root.querySelector<HTMLElement>(".scene")!, root.querySelector<HTMLElement>(`#i-${id}-box`)!, defs[id].layout);
        } catch { /* 一枚絵のまま進む */ }
      }));
      root.classList.add("show-pets");
      await wait(1200);
      const hint = say("生体反応を2件検出しました。", "note");
      await wait(2600);
      hint.classList.remove("on");
      await wait(500);
      hint.textContent = "対象に触れてください。";
      hint.classList.add("on");
      let picked: Species | undefined, busy = false;
      const timers: number[] = [];
      const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
      const note = (t: string) => { hint.textContent = t; hint.classList.add("on"); };

      /** 歩いて移る：箱を一定の速さで動かし、そのあいだ歩きのコマを再生する */
      const stepTo = (id: Species, cx: number, scale: number, feet = 0.8, ms = 1500) => {
        const b = box(id);
        const from = parseFloat(b.style.getPropertyValue("--cx")) || cx;
        b.style.transition = `left ${ms}ms linear, top ${ms}ms linear, width ${ms}ms linear`;
        placePet(b, defs[id], { cx, scale, feet });
        if (Math.abs(cx - from) > 0.5) motions[id]?.walk(cx > from ? 1 : -1, ms);
      };
      const reset = () => {
        timers.splice(0).forEach((t) => window.clearTimeout(t));
        for (const id of ["dog", "cat"] as Species[]) stepTo(id, home[id].cx, home[id].scale);
      };
      const confirm = (id: Species) => {
        panel.innerHTML = `<p>この子を保護しますか？</p><div class="intro-choices"><button id="c-yes">保護する</button><button id="c-no" class="quiet">戻る</button></div>`;
        panel.classList.add("on");
        panel.querySelector("#c-no")!.addEventListener("click", () => {
          panel.classList.remove("on");
          picked = undefined;
          reset();
          note("対象に触れてください。");
          busy = false;
        });
        panel.querySelector("#c-yes")!.addEventListener("click", () => { panel.classList.remove("on"); void register(id); });
      };
      const touch = (id: Species) => {
        if (busy || picked) return;
        busy = true;
        reset();
        const m = motions[id];
        if (id === "dog") {
          // 犬：こちらを見て、近づいてくる（足音・首輪の音）
          note("……こちらを見ている。");
          stepTo("dog", 40, 1.02, 0.81, 1500);
          for (const t of [300, 780, 1250]) later(() => ambient.blip("step"), t);
          later(() => ambient.blip("collar"), 700);
          later(() => m?.react("idle", 2400), 1700);
        } else {
          // 猫：まだ警戒している。少し身を引く
          note("……まだ警戒している。");
          ambient.blip("breath");
          stepTo("cat", 75, 0.95, 0.8, 1300);
        }
        later(() => { note("保護対象を確認しました。"); }, 2900);
        later(() => { picked = id; confirm(id); }, 3900);
      };
      for (const id of ["dog", "cat"] as Species[]) {
        const b = root.querySelector<HTMLButtonElement>(`#i-${id}`)!;
        b.addEventListener("click", () => touch(id));
      }

      async function register(id: Species) {
        timers.splice(0).forEach((t) => window.clearTimeout(t));
        // 暗転。選ばなかった側には触れない
        setBlack(true, 1.8);
        ambient.mood("dawn");
        await wait(2000);
        root.classList.add("chosen");
        sys.innerHTML = "";
        say("保護対象を登録しました。", "cap");
        await wait(3000);
        await clear();
        say("識別のため、名称を登録します。");
        await wait(1600);
        const name = await askName();
        panel.classList.remove("on");
        await clear();
        panel.classList.remove("mid");
        say(`「${name}」登録しました。`);
        await wait(2200);
        await clear();
        say("DAY 01", "cap").classList.add("day");
        await wait(2600);
        for (const m of Object.values(motions)) m.destroy();
        void disposeSlot("intro-dog");
        void disposeSlot("intro-cat");
        resolveAll({
          species: id,
          name,
          reveal: async () => {
            sys.innerHTML = "";
            ambient.mood("room");
            setBlack(false, 2.2);
            await wait(2300);
            root.remove();
          },
        });
      }
    }

    function askName(): Promise<string> {
      return new Promise((done) => {
        panel.innerHTML = `<form class="intro-name" autocomplete="off"><label for="pet-name-in">名称</label><input id="pet-name-in" maxlength="8" placeholder="ミケ" enterkeyhint="done" autocapitalize="off" spellcheck="false"><button type="submit" disabled>登録</button></form>`;
        panel.classList.add("on", "mid");
        const form = panel.querySelector<HTMLFormElement>("form")!;
        const input = form.querySelector<HTMLInputElement>("input")!, btn = form.querySelector<HTMLButtonElement>("button")!;
        input.addEventListener("input", () => { btn.disabled = !cleanName(input.value); });
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const n = cleanName(input.value);
          if (n) done(n);
        });
        window.setTimeout(() => input.focus({ preventScroll: true }), 300);
      });
    }
  });
}
