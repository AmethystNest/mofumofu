import "./style.css";
import * as C from "./core";
import { stories } from "./content/chapter";
import { loadSave, persist, type Save } from "./platform/save";
import { createDogMotion, type Motion } from "./render/dog-motion";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let save: Save = loadSave() ?? {
  version: 2,
  game: C.newGame("ハル", Math.floor(Math.random() * 2147483646) + 1),
  journal: [],
  updatedAt: 0,
};
const st = save.game;
let tab = "home",
  feedback = "今日も、この小さな部屋から。";
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main><header><div><p class="eyebrow">MOFUMOFU</p><h1>灯りの残る部屋</h1></div><button id="settings" class="icon" aria-label="設定">☷</button></header><div id="view"></div><nav aria-label="メイン"><button data-tab="home">⌂ <span>おへや</span></button><button data-tab="diary">▤ <span>日記</span></button><button data-tab="supplies">◇ <span>もちもの</span></button></nav><p class="save-note" id="save-note">お世話のあとに自動保存</p></main><dialog id="dialog"><div id="dialog-content"></div></dialog>`;
const view = document.querySelector<HTMLDivElement>("#view")!,
  dialog = document.querySelector<HTMLDialogElement>("#dialog")!,
  content = document.querySelector<HTMLDivElement>("#dialog-content")!;
let motion: Awaited<ReturnType<typeof createDogMotion>> | undefined,
  renderId = 0;
function store() {
  if (!persist(save))
    document.querySelector("#save-note")!.textContent =
      "保存できません。設定から日記を書き出してください。";
}
function message(s: string) {
  feedback = s;
  const el = document.querySelector("#feedback");
  if (el) el.textContent = s;
}
function show(
  title: string,
  body: string,
  buttons: { label: string; action: () => void }[] = [],
) {
  content.innerHTML = `<button class="close" aria-label="閉じる">×</button><p class="eyebrow">A LITTLE LIFE</p><h2>${esc(title)}</h2>${body}<div class="choices"></div>`;
  content
    .querySelector(".close")!
    .addEventListener("click", () => dialog.close());
  for (const b of buttons) {
    const button = document.createElement("button");
    button.textContent = b.label;
    button.onclick = b.action;
    content.querySelector(".choices")!.append(button);
  }
  if (!dialog.open) dialog.showModal();
}
let queued: { m: Motion; ms?: number } | undefined;
function react(m: Motion, ms?: number) {
  if (motion) motion.react(m, ms);
  else queued = { m, ms };
}
function update() {
  store();
  render();
}
function stats() {
  return [
    ["おなか", st.dog.full],
    ["げんき", st.dog.energy],
    ["なかよし", st.dog.trust],
    ["あんしん", 100 - st.dog.anx],
  ]
    .map(
      ([label, n]) =>
        `<div class="stat"><span>${label}</span><strong>${n}<small>/100</small></strong><meter min="0" max="100" value="${n}" aria-label="${label}">${n}</meter></div>`,
    )
    .join("");
}
async function render() {
  const id = ++renderId;
  motion?.destroy();
  motion = undefined;
  document.querySelectorAll<HTMLButtonElement>("nav button").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === tab);
    b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false");
  });
  if (tab === "diary") {
    view.innerHTML = `<section class="page"><p class="eyebrow">OUR DAYS</p><h2>ふたりの記録</h2><p class="muted">何でもない日が、思い出になっていく。</p>${
      save.journal.length
        ? save.journal
            .slice()
            .reverse()
            .map(
              (j) =>
                `<article><p class="eyebrow">DAY ${j.day}</p><h3>${esc(j.title)}</h3><p>${esc(j.text)}</p></article>`,
            )
            .join("")
        : "<article><h3>はじまりのページ</h3><p>夜を過ごすと、ここに今日の物語が残ります。</p></article>"
    }</section>`;
    return;
  }
  if (tab === "supplies") {
    view.innerHTML = `<section class="page"><p class="eyebrow">SMALL TREASURES</p><h2>暮らしのもちもの</h2><p class="muted">必要なものを、少しずつ。</p>${(["ration", "can", "dogfood"] as C.ItemId[]).map((k) => `<article class="inventory"><h3>${esc(C.ITEMS[k])}</h3><strong>${st.inv[k]} 個</strong></article>`).join("")}<article><h3>部屋に持ち帰ったもの</h3><p>${
      (["ball", "blanket", "map"] as C.GearId[])
        .filter((k) => st.gear[k])
        .map(
          (k) =>
            ({
              ball: "古いボール",
              blanket: "あたたかい毛布",
              map: "街の地図",
            })[k],
        )
        .join("・") || "探索で見つけた道具が、ここに増えていきます。"
    }</p></article><p class="muted">あなたの体力 ${st.me.hp}/100 · ${st.registered ? "共同配給に登録済み" : "朝の配給は一人分"}</p></section>`;
    return;
  }
  const times = {
    morning: "朝の光",
    noon: "穏やかな昼",
    evening: "夕暮れ",
    night: "おやすみの時間",
  };
  const time = C.timeOfDay(st);
  view.innerHTML = `<section class="room-card ${time}" aria-label="${times[time]}の部屋"><div class="room-top"><span>DAY ${String(st.day).padStart(2, "0")} <i>／</i> ${times[time]}</span><span class="terminal">● MINATO</span></div><button class="dog-button" id="dog" aria-label="${esc(st.name)}をなでる"><img class="dog-idle" src="${import.meta.env.BASE_URL}assets/dog/idle-v12/frame_00.png" width="320" height="320" alt="星の額模様を持つ、丸い犬の${esc(st.name)}"></button><span class="room-caption">ここが、ふたりの帰る場所。</span></section><section class="care"><div class="pet-heading"><div><p class="eyebrow">YOUR LITTLE COMPANION</p><h2>${esc(st.name)} <span>${st.dog.trust >= 35 ? "そばが、いちばん安心。" : "少しずつ、なかよしに。"}</span></h2></div><span class="ap" aria-label="行動力 ${st.ap}回">${[0, 1, 2].map((i) => `<i class="${i < st.ap ? "filled" : ""}"></i>`).join("")}</span></div><div class="stats">${stats()}</div><p id="feedback" role="status">${esc(feedback)}</p><div class="actions"><button data-action="feed"><b>◒</b>ごはん<small>分けあう時間</small></button><button data-action="pet"><b>♡</b>なでる<small>そっと、ふれる</small></button><button data-action="play" ${st.ap < 1 || !!st.pendingNight ? "disabled" : ""}><b>✧</b>あそぶ<small>行動力 1</small></button><button data-action="explore" ${st.ap < 2 || !!st.pendingNight ? "disabled" : ""}><b>↗</b>さんぽ<small>探索 · 行動力 2</small></button></div><button class="bed" data-action="rest">☾ ${st.pendingNight ? "今夜の物語を読む" : "今日を終える"} <span>夜のひととき →</span></button></section>`;
  document.querySelector("#dog")!.addEventListener("click", pet);
  view
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((b) => (b.onclick = () => actions[b.dataset.action!]!()));
  try {
    const player = await createDogMotion(view.querySelector("img")!);
    if (id !== renderId) {
      player.destroy();
      return;
    }
    motion = player;
    motion.set(st.pendingNight ? "sleep" : st.dog.energy < 20 ? "sad" : "idle");
    if (queued) {
      motion.react(queued.m, queued.ms);
      queued = undefined;
    }
  } catch {
    message("犬の動きを読み込めませんでした。再読み込みすると再試行します。");
  }
}
function pet() {
  C.pet(st);
  store();
  message(`${st.name}が目を細めた。手の温もりを、覚えている。`);
  react("pet");
  const el = view.querySelector(".stats");
  if (el) el.innerHTML = stats();
}
function feed() {
  show(
    "ごはんを分けよう",
    '<p>残っている食べものを、誰に分けますか。<br>あなたの体力も、暮らしを支えます。</p><div id="foods"></div>',
  );
  const foods = content.querySelector("#foods")!;
  for (const item of ["ration", "can", "dogfood"] as C.ItemId[]) {
    const row = document.createElement("div");
    row.className = "food-row";
    row.innerHTML = `<h3>${esc(C.ITEMS[item])} <small>残り ${st.inv[item]}</small></h3>`;
    for (const target of (item === "ration"
      ? ["dog", "half", "me"]
      : item === "can"
        ? ["dog", "me"]
        : ["dog"]) as C.FeedTarget[]) {
      const b = document.createElement("button");
      b.textContent =
        target === "dog"
          ? `${st.name}に`
          : target === "half"
            ? "半分ずつ"
            : "自分に";
      b.disabled = st.inv[item] <= 0;
      b.onclick = () => {
        const r = C.feed(st, item, target);
        if (!r.ok) {
          show("ごはん", `<p>${esc(r.msg)}</p>`, [
            { label: "戻る", action: feed },
          ]);
          return;
        }
        dialog.close();
        feedback =
          target === "half"
            ? "ひとつのごはんを、ふたりで。"
            : target === "dog"
              ? `${st.name}がゆっくり、ごはんを味わった。`
              : "あなたも、ひと息。明日のために。";
        update();
        setTimeout(() => react(r.toDog ? "eat" : "idle", 2600), 200);
      };
      row.append(b);
    }
    foods.append(row);
  }
}
function explore() {
  show(
    "どこまで歩こう",
    '<p>静かな街で、暮らしに使えるものを探します。<br>行動力 2 · あなたの体力も消費します。</p><label class="check"><input id="with-dog" type="checkbox" checked> ' +
      esc(st.name) +
      "と一緒に（げんき 25以上・おなか 10以上）</label>",
    C.LOC_IDS.filter((k) => C.locUnlocked(st, k)).map((loc) => ({
      label: C.LOCS[loc].name,
      action: () => {
        const together =
          content.querySelector<HTMLInputElement>("#with-dog")!.checked;
        if (together && !C.canDogCome(st)) {
          show(
            "ひと休みしよう",
            "<p>一緒に歩くには、げんき25以上・おなか10以上が必要です。</p>",
            [{ label: "行き先に戻る", action: explore }],
          );
          return;
        }
        const r = C.explore(st, loc, together);
        if (!r.ok) {
          message(r.msg);
          dialog.close();
          return;
        }
        const loot = Object.entries(r.found)
          .filter(([k, n]) => k !== "none" && n)
          .map(
            ([k, n]) =>
              `${({ ration: "配給食", can: "缶詰", dogfood: "犬用ごはん", ball: "古いボール", blanket: "毛布", map: "街の地図" } as Record<string, string>)[k]} ×${n}`,
          )
          .join("、");
        const text =
          (together
            ? `${st.name}が風の匂いを追った。帰り道では、何度も振り返って待ってくれた。`
            : "静かな道を歩いた。帰ると、部屋の小さな足音が迎えてくれた。") +
          (r.caught ? "巡回灯を避けて、少し遠回りした。" : "");
        save.journal.push({ day: st.day, title: "街の小さな発見", text });
        feedback = "おかえり。今日も、同じ部屋へ。";
        update();
        show(
          "帰り道の収穫",
          `<p>${esc(text)}</p><p class="loot">${esc(loot || "今日は見つからなかった。歩いた道は、覚えている。")}</p>`,
          [{ label: "部屋で休む", action: () => dialog.close() }],
        );
      },
    })),
  );
}
function night() {
  const pending = C.rest(st),
    story = stories[pending.id];
  update();
  const finish = (index: number) => {
    if (!pending.resolved) {
      C.resolveNight(st, index);
      save.journal.push({
        day: st.day,
        title: story.title,
        text:
          story.lines.join("\n") +
          "\n" +
          story.after[index % story.after.length],
      });
      store();
    }
    show(
      st.chapter > 0 && pending.id === "ch1"
        ? "第一章 おしまい"
        : "おやすみ、" + st.name,
      `<p>${esc(story.after[index % story.after.length]!)}</p>${st.chapter > 0 && pending.id === "ch1" ? "<p>ここから先も、お世話と探索は続けられます。<br>ふたりの暮らしを、あなたのペースで。</p>" : ""}`,
      [
        {
          label: "次の朝へ",
          action: () => {
            C.nextDay(st);
            dialog.close();
            feedback = "朝の配給が届いた。今日も、隣にいる。";
            update();
          },
        },
      ],
    );
  };
  if (pending.resolved) {
    const entry = save.journal
      .slice()
      .reverse()
      .find((j) => j.day === st.day && j.title === story.title);
    const last = entry?.text.split("\n").at(-1);
    finish(Math.max(0, story.after.indexOf(last ?? "")));
    return;
  }
  show(
    story.title,
    story.lines.map((s) => `<p>${esc(s)}</p>`).join(""),
    story.choices.length
      ? story.choices.map((label, index) => ({
          label,
          action: () => finish(index),
        }))
      : [{ label: "灯りを落とす", action: () => finish(0) }],
  );
}
const actions: Record<string, () => void> = {
  feed,
  pet,
  explore,
  rest: night,
  play: () => {
    const r = C.play(st);
    if (!r.ok) {
      message(r.msg);
      return;
    }
    feedback = `${st.name}のしっぽが、楽しそうに揺れた。`;
    update();
    setTimeout(() => react("play", 3000), 200);
  },
};
app.querySelectorAll<HTMLButtonElement>("nav button").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab!;
      render();
    }),
);
document.querySelector("#settings")!.addEventListener("click", () =>
  show(
    "暮らしの設定",
    `<label>犬の名前<input id="pet-name" maxlength="8" value="${esc(st.name)}"></label><p class="muted">保存はこの端末のブラウザ内です。機種変更の前に書き出してください。音声はありません。端末の「視差効果を減らす」で動きを控えられます。</p>`,
    [
      {
        label: "名前を保存",
        action: () => {
          st.name =
            content
              .querySelector<HTMLInputElement>("#pet-name")!
              .value.trim()
              .slice(0, 8) || "ハル";
          dialog.close();
          update();
        },
      },
      {
        label: "記録を書き出す",
        action: () => {
          const a = document.createElement("a"),
            url = URL.createObjectURL(
              new Blob([JSON.stringify(save, null, 2)], {
                type: "application/json",
              }),
            );
          a.href = url;
          a.download = "mofumofu-diary.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
      },
      {
        label: "記録を読み込む",
        action: () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json,application/json";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            const { decodeSave } = await import("./platform/save");
            const loaded = decodeSave(await file.text());
            if (!loaded) {
              show(
                "読み込めませんでした",
                "<p>有効なMofumofuの保存ファイルを選んでください。</p>",
              );
              return;
            }
            show(
              "記録を引き継ぐ",
              `<p>${esc(loaded.game.name)}の${loaded.game.day}日目の記録で、この端末の記録を置き換えます。</p>`,
              [
                {
                  label: "この記録で再開",
                  action: () => {
                    persist(loaded);
                    location.reload();
                  },
                },
              ],
            );
          };
          input.click();
        },
      },
    ],
  ),
);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    st.lastSeen = Date.now();
    store();
  }
});
render();
if (!save.updatedAt)
  show(
    "小さな灯りを、ふたりで",
    '<p>災害のあと、静かになった街。<br>古い環境端末〈ミナト〉が残る部屋で、一匹の犬と出会いました。</p><p>ごはんを分け、街を歩き、夜を過ごす。<br>壊れた世界に、あたたかな日々を育てていく物語です。</p><p class="muted">お世話はあなたのペースで。離れている間に、ごはんや信頼は減りません。</p>',
    [
      {
        label: "ふたりの暮らしをはじめる",
        action: () => {
          dialog.close();
          store();
        },
      },
    ],
  );
