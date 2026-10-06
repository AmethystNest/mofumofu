import "./styles/base.css";
import "./styles/stage.css";
import "./styles/ui.css";
import "./styles/intro.css";
import * as C from "./core";
import { FULL_RECORD, nightStory, phaseOfDay, voice } from "./content/story";
import { clearSave, loadSave, persist, type Save } from "./platform/save";
import type { Motion, PetMotion } from "./render/pet-sprite";
import { petBoxHtml, petDef, placePet, stageForDay } from "./render/pets";
import { sp } from "./content/species";
import * as ambient from "./platform/ambient";
import { createWander, rememberedCx, type Wander } from "./render/wander";
import { createEffects, type Effects } from "./render/effects";
import { isStroking, type TouchPoint } from "./render/gesture";
import { openScene, type Scene } from "./ui/scene";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
let save: Save = loadSave() ?? {
  version: 2,
  game: C.newGame("ミケ", Math.floor(Math.random() * 2147483646) + 1),
  journal: [],
  updatedAt: 0,
  species: "cat",
  tutorial: "feed",
};
const st = save.game;
let resetting = false;
/** 導入を終えるまでは保存しない（途中で画面を閉じても、次回は導入から） */
let started = !!save.updatedAt;
const SYS_FEED = "空腹を検知しました。";
const SYS_ATE = "栄養摂取を確認。生存状態：正常。";

// ---- ひとこと（システムの記録の末尾）---------------------------------------------------------
let lines: { t: string; sys: boolean }[] = [];
const sysTutorial = () => save.tutorial !== "done";
function say(text: string, sys = sysTutorial()) {
  lines.push({ t: text, sys });
  lines = lines.slice(-2);
  drawLog();
}
function drawLog() {
  const el = document.querySelector("#log");
  if (!el) return;
  el.innerHTML = lines.map((l, i) => `<p class="${i === lines.length - 1 ? "now" : "old"}${l.sys ? " sys" : ""}">${esc(l.t)}</p>`).join("");
}
say(save.updatedAt && save.tutorial === "feed" ? SYS_FEED : save.updatedAt && save.tutorial === "pet" ? SYS_ATE : voice("idle", st), save.tutorial !== "done");

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main><div id="view"></div></main><dialog id="dialog"><div id="dialog-content"></div></dialog>`;
const main = app.querySelector("main")!;
const view = document.querySelector<HTMLDivElement>("#view")!;
const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
const content = document.querySelector<HTMLDivElement>("#dialog-content")!;
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
let wander: Wander | undefined,
  motion: PetMotion | undefined,
  effects: Effects | undefined,
  sighTimer = 0,
  renderId = 0;
let busy = false;
/** ペットの準備ができてから実行する演出（描き直し直後の操作でも取りこぼさない） */
let afterPet: (() => void)[] = [];
function withPet(fn: () => void) {
  if (motion && effects) fn();
  else afterPet.push(fn);
}
function store() {
  persist(save);
}
const nameOf = (s: string) => s.replace(/\{name\}/g, st.name);
/** 核が返す短い案内を、システムの言葉にそろえる */
function sysMsg(msg: string): string {
  const m = nameOf(msg);
  if (m.includes("お腹いっぱい")) return `${st.name}は、満腹。給餌は不要。`;
  if (m.includes("残っていない") && !m.includes("動")) return "備蓄がない。";
  if (m.includes("動けない")) return "本日の行動回数は、残っていない。";
  if (m.includes("疲れて")) return `${st.name}は、休んでいる。遊戯は不可。`;
  if (m.includes("時間が足りない")) return "外出には、行動回数が足りない。";
  if (m.includes("行けない")) return "その場所へは、移動できない。";
  return m;
}
const ITEM_NAME: Record<string, string> = { ration: "非常配給セット", can: "備蓄缶", dogfood: "ペットフード", ball: "古いボール", blanket: "毛布", map: "管理塔周辺の地図" };
const ITEM_NOTE: Record<string, string> = { ration: "食料と予備電池のセット", can: "食料としても、電池としても使える", dogfood: "ペット用の食料" };

function show(title: string, body: string, buttons: { label: string; action: () => void; kind?: string }[] = []) {
  content.innerHTML = `<div class="sheet"><div class="sh-head"><h2 class="sh-title">${esc(title)}</h2><button class="sh-close" aria-label="閉じる">閉じる</button></div>${body}<div class="choices"></div></div>`;
  content.querySelector(".sh-close")!.addEventListener("click", () => dialog.close());
  for (const b of buttons) {
    const button = document.createElement("button");
    button.textContent = b.label;
    button.onclick = b.action;
    content.querySelector(".choices")!.append(button);
  }
  if (!dialog.open) dialog.showModal();
}
function react(m: Motion, ms?: number) {
  withPet(() => motion!.react(m, ms));
}
function update() {
  store();
  void render();
}

// ---- ホーム -------------------------------------------------------------------------------
const TIMES = { morning: "朝", noon: "昼", evening: "夕", night: "夜" } as const;
const vital = (label: string, n: number, extra = "") =>
  `<li class="${n < 25 ? "low " : ""}${extra}"><span>${label}</span><i role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${n}" style="--v:${(n / 100).toFixed(2)}"></i></li>`;
const pips = (n: number) => (n ? `<span class="s">${"<i></i>".repeat(n)}</span>` : `<span class="s"></span>`);

async function render() {
  const id = ++renderId;
  wander?.destroy();
  wander = undefined;
  motion?.destroy();
  effects?.destroy();
  window.clearInterval(sighTimer);
  motion = undefined;
  effects = undefined;
  const time = C.timeOfDay(st);
  const def = petDef(save.species, stageForDay(st.day));
  const night = !!st.pendingNight;
  view.innerHTML = `<section class="stage ${time}" aria-label="${TIMES[time]}の部屋"><div class="scene ${time}"><div class="room-bg"></div>${petBoxHtml(def, "dog", `${esc(st.name)}に触れる`, `${def.look}の${esc(st.name)}`)}</div><div class="scrim top"></div><div class="scrim bottom"></div>
<header class="topbar"><div class="day"><b>DAY ${String(st.day).padStart(2, "0")}</b><span>${TIMES[time]}</span><span class="who">${esc(st.name)}</span></div><div class="menu"><button data-open="journal">記録</button><button data-open="supplies">備蓄</button><button data-open="settings">設定</button></div></header>
<section class="vitals" aria-label="${esc(st.name)}の状態"><ul>${vital("満腹", st.dog.full)}${vital("活力", st.dog.energy)}${vital("信頼", st.dog.trust)}${vital("安定", 100 - st.dog.anx)}${vital("電力", st.me.hp, "self")}<li class="ap" role="img" aria-label="行動 ${st.ap}回"><span>行動</span><em>${Array.from({ length: st.apMax ?? 3 }, (_, i) => `<b class="${i < st.ap ? "on" : ""}"></b>`).join("")}</em></li></ul></section>
<div class="log" id="log" role="log" aria-live="polite"></div>
<div class="bar" role="group" aria-label="操作"><button data-action="feed" class="${save.tutorial === "feed" ? "guide" : ""}"><span class="t">給餌</span>${pips(0)}</button><button data-action="pet"><span class="t">接触</span>${pips(0)}</button><button data-action="play" ${st.ap < 1 || night ? "disabled" : ""}><span class="t">遊戯</span>${pips(1)}</button><button data-action="explore" ${st.ap < 2 || night ? "disabled" : ""}><span class="t">外出</span>${pips(2)}</button><button data-action="rest"><span class="t">${night ? "記録" : "休止"}</span>${pips(0)}</button></div></section>`;
  drawLog();
  // 背の低い画面では、下の記録と操作の帯に足元が隠れないよう、少し奥（上）に立たせる
  const short = view.clientHeight < 700;
  placePet(view.querySelector<HTMLElement>(".pet-box")!, def, { cx: rememberedCx(), feet: short ? 0.715 : 0.769 });
  bindTouch(view.querySelector<HTMLButtonElement>("#dog")!);
  view.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((b) => (b.onclick = () => actions[b.dataset.action!]!()));
  view.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) => (b.onclick = () => openPanel(b.dataset.open as "journal" | "supplies" | "settings")));
  try {
    const petImage = view.querySelector<HTMLImageElement>("img.pet-img")!;
    const player = await def.create("home", petImage);
    if (id !== renderId) {
      player.destroy();
      return;
    }
    motion = player;
    const sceneEl = view.querySelector<HTMLElement>(".scene")!;
    wander = createWander(view.querySelector<HTMLElement>(".pet-box")!, sceneEl, () => motion, def.speed);
    wander.auto(() => !st.pendingNight && st.dog.energy >= 20 && !dialog.open && !busy && !document.querySelector(".panel"));
    // 部屋の床をタップすると、そこへ歩いていく
    sceneEl.addEventListener("click", (e) => {
      if ((e.target as Element).closest(".pet-button") || dialog.open || busy) return;
      const r = sceneEl.getBoundingClientRect();
      if ((e.clientY - r.top) / r.height < 0.6 || st.pendingNight || st.dog.energy < 20) return;
      void wander?.walkTo(((e.clientX - r.left) / r.width) * 100);
    });
    effects = createEffects(sceneEl, view.querySelector<HTMLElement>(".pet-box")!, def.layout);
    const passive: Motion = st.pendingNight ? "sleep" : st.dog.energy < 20 ? "sad" : "idle";
    motion.set(passive);
    effects.sleepy(passive === "sleep");
    if (passive === "sad") {
      effects.sigh();
      sighTimer = window.setInterval(() => effects?.sigh(), 7000);
    }
    if (import.meta.env.DEV) (window as unknown as { __play?: unknown }).__play = (m: Motion, ms?: number) => motion?.react(m, ms);
    const queued = afterPet;
    afterPet = [];
    for (const fn of queued) fn();
  } catch {
    say("映像を取得できません。再読み込みで再試行します。", true);
  }
}

// ---- 行動 ---------------------------------------------------------------------------------
function pet() {
  wander?.stop();
  const r = C.pet(st);
  const first = save.tutorial === "pet";
  if (first) save.tutorial = "done";
  store();
  if (first) {
    // 最初の接触：反応のあとに、システムの一言だけを添える（感情の説明はしない）
    window.setTimeout(() => say("……", true), 1900);
    window.setTimeout(() => say("この行動に、生存上の必要性はありません。", true), 3500);
  } else say(voice("pet", st));
  react("pet");
  withPet(() => effects!.hearts(r.fx.length ? 3 : 2));
  refreshVitals();
}
function refreshVitals() {
  const vals = [st.dog.full, st.dog.energy, st.dog.trust, 100 - st.dog.anx, st.me.hp];
  document.querySelectorAll<HTMLElement>(".vitals li:not(.ap)").forEach((li, i) => {
    const m = li.querySelector<HTMLElement>("i")!;
    m.style.setProperty("--v", (vals[i]! / 100).toFixed(2));
    m.setAttribute("aria-valuenow", String(vals[i]));
    li.classList.toggle("low", vals[i]! < 25);
  });
}

/** ペットへのタッチ：タップ・なでる・長押しで「接触」。キーボードの決定でも */
function bindTouch(btn: HTMLButtonElement) {
  let track: TouchPoint[] = [];
  let stroking = false,
    lastHeart = 0;
  const point = (e: PointerEvent): TouchPoint => ({ t: e.timeStamp, x: e.clientX, y: e.clientY });
  const dir = (e: PointerEvent) => {
    const r = btn.getBoundingClientRect();
    return (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  };
  const at = (e: PointerEvent): [number, number] => {
    const r = btn.parentElement!.getBoundingClientRect();
    const L = petDef(save.species, stageForDay(st.day)).layout;
    const x = ((e.clientX - r.left) / r.width) * L.w, y = ((e.clientY - r.top) / r.height) * L.h;
    return [Math.max(L.w * 0.25, Math.min(L.w * 0.75, x)), Math.max(L.head[1] - 40, Math.min(L.floor[1] - 160, y - L.h * 0.1))];
  };
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!track.length) return;
    track.push(point(e));
    const was = stroking;
    if (stroking) motion?.stroke(false);
    stroking = false;
    track = [];
    if (!cancelled || was) pet();
  };
  btn.addEventListener("pointerdown", (e) => {
    track = [point(e)];
    stroking = false;
    motion?.look(dir(e));
    btn.setPointerCapture?.(e.pointerId);
  });
  btn.addEventListener("pointermove", (e) => {
    if (!track.length) return;
    track.push(point(e));
    if (!stroking && isStroking(track)) {
      stroking = true;
      lastHeart = e.timeStamp;
      withPet(() => effects!.hearts(1, at(e)));
    }
    if (stroking) {
      motion?.stroke(true, dir(e));
      if (e.timeStamp - lastHeart > 650) {
        lastHeart = e.timeStamp;
        withPet(() => effects!.hearts(1, at(e)));
      }
    }
  });
  btn.addEventListener("pointerup", (e) => end(e, false));
  btn.addEventListener("pointercancel", (e) => end(e, true));
  btn.addEventListener("click", (e) => {
    if (e.detail === 0) pet();
  });
}

function feed() {
  const row = (item: C.ItemId, targets: C.FeedTarget[]) =>
    `<div class="food-row" data-item="${item}"><h3>${ITEM_NAME[item]}<small>残 ${st.inv[item]}</small></h3><p class="desc">${ITEM_NOTE[item]}</p><div class="row"></div></div>`;
  show("給餌", `<p>備蓄を、誰に使うか選んでください。</p><div id="foods">${row("ration", [])}${row("can", [])}${row("dogfood", [])}</div>`);
  const targetsOf: Record<string, C.FeedTarget[]> = { ration: ["dog", "half", "me"], can: ["dog", "me"], dogfood: ["dog"] };
  content.querySelectorAll<HTMLElement>(".food-row").forEach((rowEl) => {
    const item = rowEl.dataset.item as C.ItemId;
    for (const target of targetsOf[item]!) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = target === "dog" ? `${st.name}に` : target === "half" ? "半分ずつ" : "予備電池へ";
      b.disabled = st.inv[item] <= 0;
      b.onclick = () => {
        const r = C.feed(st, item, target);
        if (!r.ok) {
          say(sysMsg(r.msg));
          dialog.close();
          return;
        }
        dialog.close();
        const firstMeal = save.tutorial === "feed" && r.toDog;
        if (firstMeal) {
          save.tutorial = "pet";
          window.setTimeout(() => withPet(() => motion!.look(0)), 3600);
        }
        say(firstMeal ? SYS_ATE : voice(target === "half" ? "feedHalf" : target === "me" ? "feedSelf" : "feed", st), firstMeal);
        update();
        window.setTimeout(async () => {
          // 離れた所にいたら、器のある中央へ歩いてきてから食べる
          if (r.toDog) await new Promise<void>((done) => withPet(() => void (wander?.walkTo(50) ?? Promise.resolve()).then(done)));
          react(r.toDog ? "eat" : "idle", 2600);
          if (r.toDog) withPet(() => effects!.bowl(2600));
        }, 200);
      };
      rowEl.querySelector(".row")!.append(b);
    }
  });
}

function explore() {
  show(
    "外出",
    `<p>屋外へ出て、備蓄を探します。行動回数を 2、電力も消費します。</p><label class="check"><input id="with-pet" type="checkbox" checked> ${esc(st.name)}と一緒に（活力 25 以上・満腹 10 以上）</label><div class="loc-list" id="locs"></div>`,
  );
  const list = content.querySelector("#locs")!;
  for (const loc of C.LOC_IDS.filter((k) => C.locUnlocked(st, k))) {
    const b = document.createElement("button");
    b.className = "btn";
    b.innerHTML = `${esc(C.LOCS[loc].name)}<small>${esc(C.LOCS[loc].desc)}</small>`;
    b.onclick = () => {
      const together = content.querySelector<HTMLInputElement>("#with-pet")!.checked;
      if (together && !C.canDogCome(st)) {
        say(`${st.name}は、休んでいる。同行は不可。`);
        dialog.close();
        return;
      }
      const r = C.explore(st, loc, together);
      if (!r.ok) {
        say(sysMsg(r.msg));
        dialog.close();
        return;
      }
      const loot = Object.entries(r.found)
        .filter(([k, n]) => k !== "none" && n)
        .map(([k, n]) => `${ITEM_NAME[k] ?? k} ×${n}`)
        .join("\n");
      const text = voice("explore", st) + (r.caught ? "巡回灯を避けて、遠回りした。" : "");
      save.journal.push({ day: st.day, title: "外出", text: [C.LOCS[loc].name, text, loot || "持ち帰り：なし。"].join("\n") });
      say(voice("explore", st));
      update();
      show("帰還", `<p>${esc(C.LOCS[loc].name)}</p><p>${esc(text)}</p><p class="loot">${esc(loot || "持ち帰り：なし。").replace(/\n/g, "<br>")}</p>`, [{ label: "戻る", action: () => dialog.close() }]);
    };
    list.append(b);
  }
}

const dayLines = (): string[] => {
  const d = st.daily, ph = phaseOfDay(st.day);
  if (ph === 0) return ["本日の維持項目", `　給餌　${d.dogAte ? "実施" : "未実施"}`, `　接触　${d.pets}回`, `　遊戯　${d.played ? "あり" : "なし"}`];
  if (ph === 1) return [`給餌 ${d.dogAte ? "○" : "－"}　接触 ${d.pets}回　遊戯 ${d.played ? "○" : "－"}`];
  if (ph === 2) return [`${st.name}：${d.pets >= 2 ? "よく触れた日" : "静かな日"}。`];
  return [];
};

async function playFullRecord(sc: Scene) {
  await sc.say("記録を、再生します。", "log", 1500);
  await sc.clear();
  ambient.blip("glitch");
  await sc.wait(700);
  const holds = [2600, 3800, 4600, 5200];
  for (let i = 0; i < FULL_RECORD.length; i++) {
    await sc.say(FULL_RECORD[i]!, "voice", holds[i]);
    ambient.blip(i === 2 ? "breath" : "glitch");
    if (i === 1) await sc.wait(1600);
    await sc.clear();
    await sc.wait(i === 2 ? 1200 : 300);
  }
  await sc.say("記録の復元を、完了しました。", "log", 2200);
  await sc.say("……", "log", 1600);
  await sc.say("「保護対象」。この表記は、現在の状態に適合しません。", "log", 3200);
  await sc.say(`${st.name}。`, "log", 2800);
  await sc.clear();
}

/** 休止：暗転して、夜の記録を読み、翌日へ */
async function night() {
  if (busy) return;
  busy = true;
  wander?.stop();
  const pending = C.rest(st);
  store();
  const story = nightStory(pending.id, st);
  const sc = await openScene(document.body, { veil: 0.94 });
  ambient.mood("dawn");
  try {
    if (!pending.resolved) {
      await sc.say("休止処理を開始します。", "log", 1500);
      for (const l of dayLines()) await sc.say(l, "log", 900);
      await sc.wait(600);
      await sc.clear();
      await sc.say(`${String(st.day).padStart(2, "0")}　／　${story.title}`, "head", 900);
      if (story.record) {
        ambient.blip("glitch");
        ambient.blip("crackle", 0.3);
      }
      for (const l of story.lines) await sc.say(l, "log");
      let idx = 0;
      if (story.choices.length) {
        await sc.wait(500);
        idx = await sc.choose(story.choices.map((label, i) => ({ label, sub: story.subs?.[i] })));
      }
      C.resolveNight(st, idx);
      const after = story.after[idx % story.after.length]!;
      save.journal.push({ day: st.day, title: story.title, text: [...story.lines, after].join("\n") });
      store();
      await sc.say(after, "log", 2400);
      await sc.wait(500);
      await sc.clear();
      if (story.record === 100) await playFullRecord(sc);
    }
    C.nextDay(st);
    say(voice("morning", st), false);
    store();
    await sc.say(`DAY ${String(st.day).padStart(2, "0")}`, "day", 2400);
    await render();
    ambient.mood("room");
    busy = false;
    await sc.close(2200);
  } finally {
    busy = false;
  }
}
function rest() {
  if (st.pendingNight || st.ap < 1) return void night();
  show("休止", `<p>今日の行動を終えて、休止します。残りの行動回数：${st.ap}。</p>`, [
    { label: "休止する", action: () => { dialog.close(); void night(); } },
    { label: "戻る", action: () => dialog.close() },
  ]);
}

const actions: Record<string, () => void> = {
  feed,
  pet,
  explore,
  rest,
  play: () => {
    const r = C.play(st);
    if (!r.ok) {
      say(sysMsg(r.msg));
      return;
    }
    say(voice("play", st));
    update();
    setTimeout(() => {
      react("play", 3000);
      withPet(() => effects!.sparkles(5));
    }, 200);
  },
};

// ---- 記録・備蓄・設定 ------------------------------------------------------------------------
function openPanel(kind: "journal" | "supplies" | "settings") {
  if (kind === "settings") return settings();
  document.querySelector(".panel")?.remove();
  const p = document.createElement("section");
  p.className = "panel";
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-label", kind === "journal" ? "記録" : "備蓄");
  const close = () => { p.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  let body = "";
  if (kind === "journal") {
    body = save.journal.length
      ? save.journal
          .slice()
          .reverse()
          .map((j) => {
            const ls = j.text.split("\n");
            return `<article class="entry"><p class="when">DAY ${String(j.day).padStart(2, "0")}</p><h3>${esc(j.title)}</h3>${ls.map((l, i) => `<p class="${i === ls.length - 1 && ls.length > 1 ? "res" : ""}">${esc(l)}</p>`).join("")}</article>`;
          })
          .join("")
      : `<p class="empty">記録は、まだありません。休止すると、その日の記録が残ります。</p>`;
  } else {
    const gear = (["ball", "blanket", "map"] as C.GearId[]).filter((k) => st.gear[k]).map((k) => ITEM_NAME[k]);
    body = `<div class="rows">${(["ration", "can", "dogfood"] as C.ItemId[]).map((k) => `<div class="r"><span>${ITEM_NAME[k]}</span><b>×${st.inv[k]}</b></div>`).join("")}</div>
<p class="sub-h">持ち帰ったもの</p><div class="rows">${gear.length ? gear.map((g) => `<div class="r"><span>${g}</span><b>―</b></div>`).join("") : `<div class="r dim"><span>まだ、ありません</span></div>`}</div>
<p class="sub-h">状態</p><div class="rows"><div class="r"><span>電力</span><b>${st.me.hp}%</b></div><div class="r"><span>配給</span><b>${st.registered ? "二名分" : "一名分"}</b></div></div>`;
  }
  p.innerHTML = `<div class="panel-in"><div class="panel-head"><h2>${kind === "journal" ? "記録" : "備蓄"}</h2><button aria-label="閉じる">閉じる</button></div>${body}</div>`;
  p.querySelector("button")!.addEventListener("click", close);
  main.append(p);
  p.querySelector<HTMLButtonElement>("button")!.focus({ preventScroll: true });
}

function settings() {
  show(
    "設定",
    `<label class="field">名称<input id="pet-name" maxlength="8" value="${esc(st.name)}" autocomplete="off"></label><p class="note">記録はこの端末のブラウザ内に保存されます。機種変更の前に書き出してください。環境音は端末内で合成しています。端末の「視差効果を減らす」で動きを控えられます。</p><div class="menu-list" id="menu-list"></div>`,
  );
  const list = content.querySelector("#menu-list")!;
  const add = (label: string, action: () => void, kind = "") => {
    const b = document.createElement("button");
    b.className = `btn ${kind}`;
    b.textContent = label;
    b.onclick = action;
    list.append(b);
  };
  add("名称を保存", () => {
    st.name = content.querySelector<HTMLInputElement>("#pet-name")!.value.trim().slice(0, 8) || st.name;
    dialog.close();
    update();
  }, "primary");
  add(ambient.isMuted() ? "環境音を入れる" : "環境音を切る", () => {
    ambient.setMuted(!ambient.isMuted());
    void ambient.unlock().then(() => ambient.mood(ambient.isMuted() ? "off" : "room"));
    dialog.close();
  });
  add("記録を書き出す", () => {
    const a = document.createElement("a"), url = URL.createObjectURL(new Blob([JSON.stringify(save, null, 2)], { type: "application/json" }));
    a.href = url;
    a.download = "mofumofu-diary.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  add("記録を読み込む", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const { decodeSave } = await import("./platform/save");
      const loaded = decodeSave(await file.text());
      if (!loaded) return show("読み込めませんでした", "<p>有効な保存ファイルを選んでください。</p>");
      show("記録を引き継ぐ", `<p>${esc(loaded.game.name)}の DAY ${loaded.game.day} の記録で、この端末の記録を置き換えます。</p>`, [
        { label: "この記録で再開", action: () => { persist(loaded); location.reload(); } },
        { label: "やめる", action: () => dialog.close() },
      ]);
    };
    input.click();
  });
  add("最初からはじめる", () =>
    show("最初からはじめますか？", "<p>この端末の記録を消して、導入から遊び直します。元に戻せません。残したい場合は、先に「記録を書き出す」を使ってください。</p>", [
      { label: "記録を消して最初から", action: () => { resetting = true; clearSave(); location.reload(); } },
      { label: "やめる", action: () => dialog.close() },
    ]), "quiet");
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && !resetting && started) {
    st.lastSeen = Date.now();
    store();
  }
});
if (save.updatedAt) {
  // 導入を済ませた保存：最初のタップで環境音を使えるようにする
  document.addEventListener("pointerdown", () => void ambient.unlock().then(() => ambient.mood(ambient.isMuted() ? "off" : "room")), { once: true });
  void render();
} else {
  // はじめて：導入（起動 → 記録 → 復元 → 保護する子を選ぶ → 名称 → DAY 01）
  void import("./ui/intro").then(async ({ runIntro }) => {
    const r = await runIntro(document.body);
    save.species = r.species;
    st.name = r.name;
    save.tutorial = "feed";
    lines = [];
    say(SYS_FEED, true);
    started = true;
    persist(save);
    await render();
    await r.reveal();
  });
}
void sp;
