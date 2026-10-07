import "./styles/base.css";
import "./styles/stage.css";
import "./styles/ui.css";
import "./styles/intro.css";
import * as G from "./game";
import { BLANKET_LINE, CORE_LINE, DISMANTLE_LINE, EVENT_LINE, FULL_RECORD, LOOK_NOTHING, PLACE_LOOK, PLACE_NAME, absenceLine, awayLine, endingText, findText, learnedLine, nightStory, observeLines, phaseOfDay, voice, wantCue, wantMetLine, wantNight } from "./content/story";
import { clearSave, loadSave, persist, type Save } from "./platform/save";
import type { Motion, PetMotion } from "./render/pet-sprite";
import { petBoxHtml, petDef, placePet, stageForDay } from "./render/pets";
import * as ambient from "./platform/ambient";
import { createWander, rememberedCx, type Wander } from "./render/wander";
import { createEffects, type Effects } from "./render/effects";
import { isStroking, type TouchPoint } from "./render/gesture";
import { openScene, type Scene } from "./ui/scene";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
let save: Save = loadSave() ?? { version: 3, game: G.newGame("ミケ", "cat"), journal: [], updatedAt: 0, tutorial: "feed" };
const st = save.game;
let resetting = false;
/** 導入を終えるまでは保存しない（途中で画面を閉じても、次回は導入から） */
let started = !!save.updatedAt;
const SYS_FEED = "空腹を検知しました。";
const SYS_ATE = "栄養摂取を確認。生存状態：正常。";
const SYS_ARM = "接触機構に異常を検出しました。";

/** 設備の呼び名（システムの言葉） */
const EQUIP_NAME: Record<G.EquipId, string> = { light: "照明", climate: "空調", comms: "通信", camera: "カメラ", feeder: "給餌器", water: "給水器", arm: "接触機構" };
const EQUIP_NOTE: Record<G.EquipId, string> = {
  light: "暗いと、落ち着かない",
  climate: "室温を保つ",
  comms: "外との連絡",
  camera: "部屋と窓の外を見る",
  feeder: "ごはんを出す",
  water: "水を足す",
  arm: "なでる・あそぶ",
};
const STATUS_TEXT = { ok: "正常", unstable: "不安定", broken: "停止" } as const;
const CLIMATE_TEXT: Record<G.ClimateMode, string> = { off: "切", eco: "控えめ", normal: "通常" };

// ---- ひとこと（システムの記録の末尾）---------------------------------------------------------
let lines: { t: string; sys: boolean }[] = [];
const sysTutorial = () => save.tutorial !== "done";
function say(text: string, sys = sysTutorial()) {
  if (!text || lines[lines.length - 1]?.t === text) return;
  lines.push({ t: text, sys });
  lines = lines.slice(-2);
  drawLog();
}
function drawLog() {
  const el = document.querySelector("#log");
  if (!el) return;
  el.innerHTML = lines.map((l, i) => `<p class="${i === lines.length - 1 ? "now" : "old"}${l.sys ? " sys" : ""}">${esc(l.t)}</p>`).join("");
}
say(save.updatedAt && save.tutorial === "feed" ? SYS_FEED : save.updatedAt && save.tutorial === "pet" ? SYS_ATE : (!st.pending && wantCue(st)) || voice("idle", st), save.tutorial !== "done");
/** しばらく開いていなかった：待っていた様子だけを見せる（罰はない） */
const ABSENT_MS = 3 * 60 * 60 * 1000;
const returned = !!save.updatedAt && save.tutorial === "done" && !st.pending && Date.now() - st.lastSeen > ABSENT_MS;
if (returned) say(absenceLine(st), false);

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
let busy = false, greeted = false;
/** その日、したいことに応えた一言を出したか */
let metSaidDay = 0;
/** 行動のあと：したいことに初めて応えられたら、一言 */
function checkWant() {
  if (metSaidDay === st.day || !st.want || !G.wantMet(st)) return;
  if (st.want === "alone" || st.want === "rest") return;
  metSaidDay = st.day;
  const line = wantMetLine(st);
  if (line) window.setTimeout(() => say(line, phaseOfDay(st.day) === 0), 1500);
}
/** ペットの準備ができてから実行する演出（描き直し直後の操作でも取りこぼさない） */
let afterPet: (() => void)[] = [];
function withPet(fn: () => void) {
  if (motion && effects) fn();
  else afterPet.push(fn);
}
function store() {
  persist(save);
}
const n = () => st.name;

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
/**
 * 行動のあと：部屋とペットは作り直さず、表示（上の帯・状態・操作・部屋の明るさ・窓）だけを書き換える。
 * 作り直すとペットの箱が初期の大きさから広がり直し、行動のたびに縮んで見えるため。
 * 日付・成長段階・夜の切り替わりでは、全体を描き直す。
 */
function update() {
  store();
  const stage = view.querySelector<HTMLElement>(".stage");
  if (!stage || !motion || shownKey !== stageKey()) return void render();
  const time = G.timeOfDay(st);
  stage.className = `stage ${time} ${roomClasses()}`;
  stage.setAttribute("aria-label", `${TIMES[time]}の部屋`);
  const scene = stage.querySelector<HTMLElement>(".scene")!;
  scene.classList.remove(...Object.keys(TIMES));
  scene.classList.add(time);
  scene.querySelector(".win")!.outerHTML = windowHtml();
  stage.querySelector(".hud")!.innerHTML = hudHtml(time);
  drawLog();
  bindHud();
}
const stageKey = () => `${st.species}/${stageForDay(st.day)}/${st.day}/${st.pending ? 1 : 0}`;
let shownKey = "";
/** 行動できない理由を、システムの短い言葉に */
function reasonText(reason: string): string {
  return ({
    ap: "今日の行動は、もう残っていない。",
    tired: `${n()}は、休んでいる。今は、あそべない。`,
    arm: "接触機構が停止中。",
    camera: "カメラが停止中。外の映像を取得できない。",
    food: "食料が、ない。部屋を点検すると、見つかることがある。",
    water: "水が、ない。",
    full: `${n()}は、もう十分。`,
    feeder: "給餌器も接触機構も、停止中。ごはんを出せない。",
    waterer: "給水器が停止中。",
    parts: "部品が、足りない。",
    fine: "修理の必要は、ない。",
    outside: "通信の異常は、家の外にある。ここからは直せない。",
    empty: "そこには、もう何もない。",
    closed: "まだ、開けられない。",
  } as Record<string, string>)[reason] ?? "実行できない。";
}

// ---- ホーム -------------------------------------------------------------------------------
const TIMES = { morning: "朝", noon: "昼", evening: "夕", night: "夜" } as const;
const vital = (label: string, v: number, extra = "") =>
  `<li class="${v < 25 ? "low " : ""}${extra}"><span>${label}</span><i role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" style="--v:${(v / 100).toFixed(2)}"></i></li>`;
const pips = (k: number) => (k ? `<span class="s">${"<i></i>".repeat(k)}</span>` : `<span class="s"></span>`);
const vitalValues = () => [st.pet.full, st.pet.hydration, st.pet.energy, 100 - st.pet.stress, st.power];

/** 部屋の状態に合わせた見た目（暗さ・照明のちらつき・カメラのノイズ） */
function roomClasses(): string {
  const c: string[] = [];
  const lightOn = st.lights && st.equip.light > 0;
  if (!lightOn) c.push("dark");
  else if (st.equip.light < 40) c.push("flicker");
  if (st.equip.camera <= 0) c.push("cam-lost");
  else if (st.equip.camera < 40) c.push("cam-noise");
  return c.join(" ");
}
/** 窓：降る灰（3日目から、積もった量で濃くなる）とシャッター */
function windowHtml(): string {
  const ash = st.day >= 3 ? Math.min(1, 0.5 + st.ash / 50) : 0;
  return `<div class="win${st.flags.shutter ? " shut" : ""}" style="--ash:${ash.toFixed(2)}" aria-hidden="true"><i class="ash a1"></i><i class="ash a2"></i><i class="haze"></i><i class="shutter"></i></div>`;
}

/** 上の帯・状態・ひとこと・操作（行動のたびに書き換える部分） */
function hudHtml(time: keyof typeof TIMES): string {
  const night = !!st.pending;
  const arm = st.equip.arm > 0;
  return `<header class="topbar"><div class="day"><b>DAY ${String(st.day).padStart(2, "0")}</b><span>${TIMES[time]}</span><span class="who">${esc(n())}</span></div><div class="menu"><button data-open="journal"><span>記録</span></button><button data-open="settings"><span>設定</span></button></div></header>
<section class="vitals" aria-label="${esc(n())}の状態"><ul>${vital("おなか", st.pet.full)}${vital("水分", st.pet.hydration)}${vital("げんき", st.pet.energy)}${vital("安心", 100 - st.pet.stress)}${vital("電力", st.power, "self")}<li class="ap" role="img" aria-label="行動 ${st.ap}回"><span>行動</span><em>${Array.from({ length: st.apMax }, (_, i) => `<b class="${i < st.ap ? "on" : ""}"></b>`).join("")}</em></li></ul></section>
<div class="log" id="log" role="log" aria-live="polite"></div>
<div class="bar" role="group" aria-label="操作"><button data-action="feed" class="${save.tutorial === "feed" ? "guide" : ""}" ${night ? "disabled" : ""}><span class="t">ごはん</span>${pips(0)}</button><button data-action="pet" class="${save.tutorial === "pet" ? "guide" : ""}"><span class="t">なでる</span>${pips(0)}</button><button data-action="play" ${st.ap < 1 || night || !arm ? "disabled" : ""}><span class="t">あそぶ</span>${pips(1)}</button><button data-action="room" ${night ? "disabled" : ""}><span class="t">部屋</span>${pips(0)}</button><button data-action="rest"><span class="t">${night ? "記録" : "休む"}</span>${pips(0)}</button></div>`;
}
function bindHud() {
  view.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((b) => (b.onclick = () => actions[b.dataset.action!]!()));
  view.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) => (b.onclick = () => (b.dataset.open === "settings" ? settings() : journal())));
}

async function render() {
  const id = ++renderId;
  wander?.destroy();
  wander = undefined;
  motion?.destroy();
  effects?.destroy();
  window.clearInterval(sighTimer);
  motion = undefined;
  effects = undefined;
  const time = G.timeOfDay(st);
  const def = petDef(st.species, stageForDay(st.day));
  view.innerHTML = `<section class="stage ${time} ${roomClasses()}" aria-label="${TIMES[time]}の部屋"><div class="scene ${time}"><div class="room-bg"></div>${windowHtml()}<div class="room-shade" aria-hidden="true"></div>${petBoxHtml(def, "dog", `${esc(n())}に触れる`, `${def.look}の${esc(n())}`)}</div><div class="cam" aria-hidden="true"></div><div class="scrim top"></div><div class="scrim bottom"></div>
<div class="hud">${hudHtml(time)}</div></section>`;
  shownKey = stageKey();
  drawLog();
  // 背の低い画面では、下の記録と操作の帯に足元が隠れないよう、少し奥（上）に立たせる
  const short = view.clientHeight < 700;
  const box = view.querySelector<HTMLElement>(".pet-box")!;
  // 置いた直後は大きさ・位置を動かさない（初期値からの広がり・縮みを見せない）
  box.style.transition = "none";
  placePet(box, def, { cx: rememberedCx(), feet: short ? 0.715 : 0.769 });
  void box.offsetWidth;
  box.style.transition = "";
  bindTouch(view.querySelector<HTMLButtonElement>("#dog")!);
  bindHud();
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
    wander.auto(() => !st.pending && st.pet.energy >= 20 && !dialog.open && !busy && !document.querySelector(".panel"));
    // 部屋の床をタップすると、そこへ歩いていく
    sceneEl.addEventListener("click", (e) => {
      if ((e.target as Element).closest(".pet-button") || dialog.open || busy) return;
      const r = sceneEl.getBoundingClientRect();
      if ((e.clientY - r.top) / r.height < 0.6 || st.pending || st.pet.energy < 20) return;
      void wander?.walkTo(((e.clientX - r.left) / r.width) * 100);
    });
    effects = createEffects(sceneEl, view.querySelector<HTMLElement>(".pet-box")!, def.layout);
    const low = st.pet.energy < 20 || st.pet.stress > 80;
    const passive: Motion = st.pending ? "sleep" : low ? "sad" : "idle";
    motion.set(passive);
    effects.sleepy(passive === "sleep");
    if (passive === "sad") {
      effects.sigh();
      sighTimer = window.setInterval(() => effects?.sigh(), 7000);
    }
    if (import.meta.env.DEV) Object.assign(window, { __play: (m: Motion, ms?: number) => motion?.react(m, ms), __st: st });
    if (returned && !greeted) { greeted = true; window.setTimeout(() => void wander?.walkTo(50).then(() => motion?.look(0)), 600); }
    else if (st.want === "alone" && !st.pending && !st.daily.pets) window.setTimeout(() => void wander?.walkTo(rememberedCx() < 50 ? 33 : 67), 1400);
    const queued = afterPet;
    afterPet = [];
    for (const fn of queued) fn();
  } catch {
    say("映像を取得できません。再読み込みで再試行します。", true);
  }
}
function refreshVitals() {
  const vals = vitalValues();
  document.querySelectorAll<HTMLElement>(".vitals li:not(.ap)").forEach((li, i) => {
    const m = li.querySelector<HTMLElement>("i")!;
    m.style.setProperty("--v", (vals[i]! / 100).toFixed(2));
    m.setAttribute("aria-valuenow", String(vals[i]));
    li.classList.toggle("low", vals[i]! < 25);
  });
}

// ---- 行動 ---------------------------------------------------------------------------------
function pet() {
  if (busy) return;
  wander?.stop();
  const r = G.pet(st);
  store();
  if (!r.ok) {
    // 接触機構が止まっている：最初は何も起きない。もう一度触れると、異常を知らせる
    if (st.daily.touchFailed >= 2) say(SYS_ARM, true);
    withPet(() => motion!.look(0));
    if (st.daily.touchFailed === 2) window.setTimeout(() => say(st.species === "dog" ? `${n()}は、その場で待っている。` : `${n()}が、止まったアームを前足でつついた。`, false), 2600);
    return;
  }
  if (r.note === "away") {
    if (st.daily.pushedAway === 1) say(awayLine(st), false);
    else if (st.daily.pushedAway === 2) say("……今日は、ひとりにしておく。", true);
    refreshVitals();
    withPet(() => void wander?.walkTo(rememberedCx() < 50 ? 68 : 32));
    return;
  }
  const first = save.tutorial === "pet";
  if (first) {
    save.tutorial = "done";
    store();
    // 最初の接触：反応のあとに、システムの一言だけを添える（感情の説明はしない）
    window.setTimeout(() => say("……", true), 1900);
    window.setTimeout(() => say("この行動に、生存上の必要性はありません。", true), 3500);
    if (st.pet.hydration < 60) window.setTimeout(() => say("水分の低下を検知しました。", true), 7500);
    view.querySelector("[data-action=pet]")?.classList.remove("guide");
  } else say(voice("pet", st));
  react("pet");
  withPet(() => effects!.hearts(r.note === "enough" ? 1 : 3));
  refreshVitals();
  checkWant();
}

/** ペットへのタッチ：タップ・なでる・長押しで「接触」。キーボードの決定でも */
function bindTouch(btn: HTMLButtonElement) {
  let track: TouchPoint[] = [];
  let stroking = false,
    lastHeart = 0;
  const armOk = () => st.equip.arm > 0;
  const point = (e: PointerEvent): TouchPoint => ({ t: e.timeStamp, x: e.clientX, y: e.clientY });
  const dir = (e: PointerEvent) => {
    const r = btn.getBoundingClientRect();
    return (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  };
  const at = (e: PointerEvent): [number, number] => {
    const r = btn.parentElement!.getBoundingClientRect();
    const L = petDef(st.species, stageForDay(st.day)).layout;
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
    if (!track.length || !armOk()) return;
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

/** ごはんと水 */
function feed() {
  const feeder = G.statusOf(st.equip.feeder), waterer = G.statusOf(st.equip.water);
  const feederNote = feeder === "broken" ? (st.equip.arm > 0 ? "給餌器は停止中。接触機構で手渡しする。" : "給餌器も接触機構も停止中。") : feeder === "unstable" ? "給餌器が詰まりかけている。一度に出る量が少ない。" : "給餌器から出す。";
  const row = (kind: "food" | "water", title: string, stock: number, desc: string, label: string, disabled: boolean) =>
    `<div class="food-row"><h3>${title}<small>残り ${stock}</small></h3><p class="desc">${esc(desc)}</p><div class="row"><button class="btn" data-k="${kind}" ${disabled ? "disabled" : ""}>${label}</button></div></div>`;
  show(
    "ごはん",
    `<div id="foods">${row("food", "ごはん", st.food, feederNote, "ごはんを出す", st.food <= 0)}${row("water", "水", st.water, waterer === "broken" ? "給水器が停止中。" : "給水器から足す。", "水を足す", st.water <= 0 || waterer === "broken")}</div>`,
  );
  content.querySelectorAll<HTMLButtonElement>("[data-k]").forEach((b) => {
    b.onclick = () => {
      const kind = b.dataset.k as "food" | "water";
      dialog.close();
      const r = kind === "food" ? G.feed(st) : G.giveWater(st);
      if (!r.ok) {
        say(reasonText(r.reason), false);
        return;
      }
      const firstMeal = kind === "food" && save.tutorial === "feed";
      if (firstMeal) {
        save.tutorial = "pet";
        window.setTimeout(() => withPet(() => motion!.look(0)), 3600);
      }
      const note = r.note === "manual" ? "給餌器が止まっている。接触機構で、手渡しした。" : r.note === "unstable" ? "給餌器が詰まりかけている。少しだけ出た。" : "";
      say(firstMeal ? SYS_ATE : note || voice(kind === "food" ? "feed" : "water", st), firstMeal);
      update();
      // 部屋の中央に器を出して中身を入れ、入れ終わったら器まで歩いてきて、食べる・飲む
      withPet(async () => {
        const bowl = effects!.serve(kind, 50);
        await bowl.ready;
        await (wander?.walkTo(50) ?? Promise.resolve());
        react(kind === "food" ? "eat" : "drink", 2600);
        bowl.consume(2600);
      });
    };
  });
}

function play() {
  const r = G.play(st);
  if (!r.ok) return say(reasonText(r.reason), false);
  say(voice("play", st));
  checkWant();
  update();
  window.setTimeout(() => {
    react("play", 3000);
    withPet(() => effects!.sparkles(5));
  }, 200);
}

/** 窓の外を見る（カメラ） */
function look() {
  const r = G.look(st);
  if (!r.ok) return say(reasonText(r.reason), false);
  const text = r.find ? findText(r.find, st) : LOOK_NOTHING[Math.floor(Math.random() * LOOK_NOTHING.length)]!;
  if (r.find) save.journal.push({ day: st.day, title: "窓の外", text });
  say(text, false);
  checkWant();
  update();
}

/** 部屋を点検する：場所ごとに、決まったものが順に見つかる */
function search(place: G.PlaceId) {
  const r = G.search(st, place);
  if (!r.ok) return say(reasonText(r.reason), false);
  const f = r.found;
  const got = [f.parts ? `部品 ×${f.parts}` : "", f.food ? `食料 ×${f.food}` : "", f.water ? `水 ×${f.water}` : ""].filter(Boolean);
  const memo = f.memo ? findText(f.memo, st) : "";
  if (memo) save.journal.push({ day: st.day, title: PLACE_NAME[place], text: memo });
  update();
  const body = [PLACE_LOOK[place], memo, f.blanket ? BLANKET_LINE : ""].filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join("");
  const rest = G.placeLeft(st, place) > 0 ? "まだ、奥に何かありそうだ。" : "ここは、もう確かめ終えた。";
  show(`点検　${PLACE_NAME[place]}`, `${body}<p class="loot">${esc(got.length ? got.join("\n") : f.blanket ? "毛布 ×1" : "使えるものは、なかった。").replace(/\n/g, "<br>")}</p><p class="note">${rest}</p>`, [{ label: "戻る", action: () => dialog.close() }]);
}

function doRepair(id: G.EquipId) {
  const before = st.equip[id];
  const r = G.repair(st, id);
  if (!r.ok) return say(reasonText(r.reason), false);
  say(id === "arm" && before <= 0 ? "接触機構、復旧。" : `${EQUIP_NAME[id]}を修理した。`, true);
  update();
}

// ---- 部屋（窓・点検・電力・設備・備蓄）：全面の暗い面 ---------------------------------------------
type Panel = HTMLElement & { close: () => void };
function openPanelShell(label: string, body: string): Panel {
  document.querySelector(".panel")?.remove();
  const p = document.createElement("section") as unknown as Panel;
  p.className = "panel";
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-label", label);
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") p.close(); };
  p.close = () => { p.remove(); document.removeEventListener("keydown", onKey); };
  document.addEventListener("keydown", onKey);
  p.innerHTML = `<div class="panel-in"><div class="panel-head"><h2>${esc(label)}</h2><button aria-label="閉じる">閉じる</button></div>${body}</div>`;
  p.querySelector("button")!.addEventListener("click", () => p.close());
  main.append(p);
  p.querySelector<HTMLButtonElement>("button")!.focus({ preventScroll: true });
  return p;
}
function room(scrollTop = 0) {
  const gen = G.generation(st), use = G.upkeep(st), fc = G.powerForecast(st);
  const tonight = G.roomTemp(st), cold = tonight < G.coldLine(st);
  const noAp = st.ap < 1;
  const eq = (id: G.EquipId) => {
    const v = Math.max(0, st.equip[id]), s = G.statusOf(v);
    const outside = id === "comms";
    const cost = G.REPAIR_COST[id];
    const btn = outside
      ? st.flags.dismantled ? `<span class="eq-na">分解済み</span>` : v <= 0 ? `<button class="eq-fix" data-dismantle>分解<small>部品 +${G.DISMANTLE_PARTS}</small></button>` : `<span class="eq-na">家の外の異常</span>`
      : s !== "ok"
        ? `<button class="eq-fix" data-fix="${id}" ${noAp || st.parts < cost ? "disabled" : ""}>修理<small>部品 ${cost}</small></button>`
        : `<span class="eq-na"></span>`;
    return `<div class="eq ${s}"><div class="eq-t"><b>${EQUIP_NAME[id]}</b><span>${STATUS_TEXT[s]}</span><small>${EQUIP_NOTE[id]}</small></div>${btn}<i role="meter" aria-label="${EQUIP_NAME[id]}の状態" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" style="--v:${(v / 100).toFixed(2)}"></i></div>`;
  };
  const seg = (cur: G.ClimateMode) =>
    (["off", "eco", "normal"] as G.ClimateMode[]).map((m) => `<button data-climate="${m}" aria-pressed="${cur === m}" ${st.equip.climate <= 0 ? "disabled" : ""}>${CLIMATE_TEXT[m]}</button>`).join("");
  const body = `
<div class="acts">
  <button class="btn" data-do="look" ${noAp || st.equip.camera <= 0 ? "disabled" : ""}>窓の外を見る<small>${st.equip.camera <= 0 ? "カメラが停止中" : "行動 1・カメラで外の様子を確かめる"}</small></button>
</div>
<p class="sub-h">点検する場所　<span class="dim">行動 1</span></p>
<div class="places">${G.PLACE_IDS.map((id) => {
    const open = G.placeOpen(st, id), left = G.placeLeft(st, id), seen = st.places[id] ?? 0;
    const state = !open ? "まだ開かない" : left <= 0 ? "確かめ終えた" : seen ? "まだ何かある" : "未確認";
    return `<button class="place${left <= 0 || !open ? " done" : ""}" data-place="${id}" ${noAp || !open || left <= 0 ? "disabled" : ""}><b>${PLACE_NAME[id]}</b><small>${state}</small></button>`;
  }).join("")}</div>
<p class="sub-h">電力</p>
<div class="rows"><div class="r"><span>蓄電</span><b>${st.power}%</b></div><div class="r"><span>発電</span><b>一日 +${gen}</b></div><div class="r"><span>消費</span><b>一日 −${use}</b></div><div class="r ${fc < 15 ? "warn" : ""}"><span>明日の朝の見込み</span><b>${fc}%</b></div></div>
<div class="ctl"><span>照明</span><div class="seg"><button data-lights="1" aria-pressed="${st.lights}" ${st.equip.light <= 0 ? "disabled" : ""}>点ける</button><button data-lights="0" aria-pressed="${!st.lights}">消す</button></div></div>
<div class="ctl"><span>空調</span><div class="seg">${seg(st.climate)}</div></div>
<p class="note ${cold ? "warn" : ""}">今夜の室温の見込み ${tonight.toFixed(1)}℃${cold ? "。寒い夜になる" : ""}${st.flags.blanket ? "（毛布あり）" : ""}。積もった灰で、発電は下がる。行動にも電力を使う。</p>
<p class="sub-h">設備</p>
<div class="eqs">${G.EQUIP.map(eq).join("")}</div>
<p class="sub-h">備蓄</p>
<div class="rows"><div class="r"><span>食料</span><b>×${st.food}</b></div><div class="r"><span>水</span><b>×${st.water}</b></div><div class="r"><span>部品</span><b>×${st.parts}</b></div></div>
<p class="note">行動の残り：${st.ap} 回。修理・点検・窓の外を見るは、それぞれ行動を 1 回使う。</p>`;
  const p = openPanelShell("部屋", body);
  p.scrollTop = scrollTop;
  const again = () => { const y = p.scrollTop; p.close(); room(y); };
  p.querySelectorAll<HTMLButtonElement>("[data-do]").forEach((b) => (b.onclick = () => { p.close(); look(); }));
  p.querySelectorAll<HTMLButtonElement>("[data-place]").forEach((b) => (b.onclick = () => { p.close(); search(b.dataset.place as G.PlaceId); }));
  p.querySelector<HTMLButtonElement>("[data-dismantle]")?.addEventListener("click", () => {
    show("通信機を分解しますか？", `<p>止まった通信機から、部品を${G.DISMANTLE_PARTS}個取り出せます。行動は使いません。</p><p>通信機は、元に戻せません。</p>`, [
      { label: "分解する", action: () => { G.dismantle(st); dialog.close(); say(DISMANTLE_LINE, true); update(); again(); } },
      { label: "やめる", action: () => dialog.close() },
    ]);
  });
  p.querySelectorAll<HTMLButtonElement>("[data-fix]").forEach((b) => (b.onclick = () => { doRepair(b.dataset.fix as G.EquipId); again(); }));
  p.querySelectorAll<HTMLButtonElement>("[data-lights]").forEach((b) => (b.onclick = () => { G.setLights(st, b.dataset.lights === "1"); update(); again(); }));
  p.querySelectorAll<HTMLButtonElement>("[data-climate]").forEach((b) => (b.onclick = () => { G.setClimate(st, b.dataset.climate as G.ClimateMode); update(); again(); }));
}

// ---- 夜 -----------------------------------------------------------------------------------
const dayLines = (): string[] => {
  const d = st.daily, ph = phaseOfDay(st.day);
  const w = wantNight(st);
  const obs = observeLines(G.observe(st), st)[0]!;
  if (ph === 0) return ["今日の記録", `　ごはん　${d.fed}回`, `　水　　　${d.watered ? "あり" : "なし"}`, `　なでる　${d.pets}回`, `　室温　　${st.temp.toFixed(1)}℃`, ...(w ? [w] : [])];
  if (ph === 1) return [`ごはん ${d.fed}回　水 ${d.watered ? "○" : "－"}　なでる ${d.pets}回`, `室温 ${st.temp.toFixed(1)}℃　蓄電 ${st.power}%`, ...(w ? [w] : [])];
  if (ph === 2) return [...(w ? [w] : []), `${st.name}の様子：${obs.text}。`, `蓄電 ${st.power}%`];
  return [...(w ? [w] : []), `蓄電 ${st.power}%`];
};

async function playFullRecord(sc: Scene) {
  await sc.say("記録を、再生します。", "log", 1500);
  await sc.clear();
  ambient.blip("glitch");
  await sc.wait(700);
  const holds = [2600, 3800, 5600];
  for (let i = 0; i < FULL_RECORD.length; i++) {
    await sc.say(FULL_RECORD[i]!, "voice", holds[i]);
    ambient.blip(i === 2 ? "breath" : "glitch");
    if (i === 1) await sc.wait(1800);
    await sc.clear();
    await sc.wait(i === 2 ? 1600 : 300);
  }
  await sc.say("記録の復元を、完了しました。", "log", 2400);
  await sc.clear();
}

/** 30日目：記録のあとに、30日の過ごし方で変わる結末 */
async function playEnding(sc: Scene) {
  const t = endingText(G.decideEnding(st), st);
  for (const l of t.lines) {
    if (l === CORE_LINE) {
      await sc.clear();
      await sc.say(l.replace("、", "、\n"), "cap", 5200);
      await sc.clear();
    } else await sc.say(l, "log", 2400);
  }
  await sc.wait(800);
  await sc.clear();
  await sc.say(t.title, "cap", 3600);
  await sc.clear();
  save.journal.push({ day: st.day, title: t.title, text: t.lines.join("\n") });
  store();
}

/** 休止：暗転して、夜の記録を読み、翌日へ */
async function night() {
  if (busy) return;
  busy = true;
  wander?.stop();
  // 休止：明かりを落とし、その子は眠る
  withPet(() => { motion!.set("sleep"); effects!.sleepy(true); });
  const knew = st.learned.length;
  G.rest(st);
  const learned = st.learned.slice(knew);
  for (const w of learned) save.journal.push({ day: st.day, title: "好み", text: learnedLine(w, st) });
  store();
  const story = nightStory(st);
  const sc = await openScene(document.body, { veil: 0.94 });
  ambient.mood("dawn");
  try {
    if (!st.pending!.resolved) {
      await sc.say("休止処理を開始します。", "log", 1500);
      for (const l of dayLines()) await sc.say(l, "log", 900);
      for (const w of learned) await sc.say(learnedLine(w, st), "log", 2000);
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
      G.resolveNight(st, idx);
      const after = story.after[idx % story.after.length]!;
      save.journal.push({ day: st.day, title: story.title, text: [...story.lines, after].join("\n") });
      store();
      await sc.say(after, "log", 2400);
      await sc.wait(500);
      await sc.clear();
      if (story.record) {
        await playFullRecord(sc);
        await playEnding(sc);
      }
    }
    const events = G.nextDay(st);
    lines = [];
    say(voice("morning", st), false);
    for (const ev of events) say(EVENT_LINE[ev]?.(st) ?? "", true);
    say(wantCue(st), false);
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
  if (st.pending || st.ap < 1) return void night();
  show("休む", `<p>今日の行動を終えて、休みます。残りの行動：${st.ap} 回。</p>`, [
    { label: "休む", action: () => { dialog.close(); void night(); } },
    { label: "戻る", action: () => dialog.close() },
  ]);
}

const actions: Record<string, () => void> = { feed, pet, play, room: () => room(), rest };

// ---- 記録・設定 ------------------------------------------------------------------------------
function journal() {
  const finds = st.records.map((r) => findText(r, st)).filter(Boolean);
  const entries = save.journal.length
    ? save.journal
        .slice()
        .reverse()
        .map((j) => {
          const ls = j.text.split("\n");
          return `<article class="entry"><p class="when">DAY ${String(j.day).padStart(2, "0")}</p><h3>${esc(j.title)}</h3>${ls.map((l, i) => `<p class="${i === ls.length - 1 && ls.length > 1 ? "res" : ""}">${esc(l)}</p>`).join("")}</article>`;
        })
        .join("")
    : `<p class="empty">記録は、まだありません。休むと、その日の記録が残ります。</p>`;
  const found = finds.length ? `<p class="sub-h">見つけたもの　${finds.length}</p><div class="finds">${finds.map((f) => `<p>${esc(f)}</p>`).join("")}</div><p class="sub-h">日々</p>` : "";
  const obs = st.day >= 2 ? `<p class="sub-h">観察　${esc(n())}</p><div class="rows">${observeLines(G.observe(st), st).map((o) => `<div class="r"><span>${o.label}</span><b class="t">${esc(o.text)}</b></div>`).join("")}</div>${st.learned.length ? `<p class="sub-h">分かったこと</p><div class="finds">${st.learned.map((w) => `<p>${esc(learnedLine(w, st))}</p>`).join("")}</div>` : ""}` : "";
  openPanelShell("記録", obs + found + (obs && !found ? `<p class="sub-h">日々</p>` : "") + entries);
}

function settings() {
  show(
    "設定",
    `<label class="field">名称<input id="pet-name" maxlength="8" value="${esc(n())}" autocomplete="off"></label><p class="note">記録はこの端末のブラウザ内に保存されます。機種変更の前に書き出してください。環境音は端末内で合成しています。端末の「視差効果を減らす」で動きを控えられます。</p><div class="menu-list" id="menu-list"></div>`,
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
    st.species = r.species;
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
