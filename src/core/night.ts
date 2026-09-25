/**
 * 夜のイベント。第1章（7夜）＋日替わりの小話。
 * 本文は第5段階で ink に移す予定。それまではプロトタイプの内容をそのまま保持する。
 */
import { VIGNETTES } from '../content/lines';
import { rand } from './rng';
import { morning } from './state';
import type { GameState, NightId, PendingNight } from './types';
import { clamp, fmt, log } from './util';

interface Choice {
  label: string;
  sub?: string;
  apply: (st: GameState) => string[];
}
interface NightEvent {
  title: string;
  cond?: (st: GameState) => boolean;
  text: (st: GameState) => string[];
  after?: (st: GameState) => void;
  choices?: Choice[];
}

export const EVENTS: Record<NightId, NightEvent> = {
  n1: {
    title: '寝床',
    text: () => ['{name}は部屋の隅で、小さく丸まっている。こちらを見ては、目をそらす。'],
    choices: [
      { label: '「こっちにおいで」と呼ぶ', apply: st => {
        if (st.dog.trust >= 10) { st.dog.trust = clamp(st.dog.trust + 4); st.dog.anx = clamp(st.dog.anx - 6); return ['少し迷ってから、{name}は足元まで来て、背中を向けて寝そべった。']; }
        st.dog.trust = clamp(st.dog.trust + 2); return ['耳だけが、こちらを向いた。まだ少し遠い。'];
      } },
      { label: 'そっとしておく', apply: st => { st.dog.anx = clamp(st.dog.anx - 5); return ['しばらくして、静かな寝息が聞こえ始めた。']; } },
    ],
  },
  n2: {
    title: '夜間放送',
    text: () => ['[ai]本日の区内生体反応：1。異常はありません。おやすみなさい。',
      '1。——それは私のことだ。足元の{name}は、その数に入っていない。'],
  },
  n3: {
    title: '首輪の札', cond: st => st.stats.explores >= 1,
    text: () => ['外でついた泥を拭いていると、首輪に小さな金属の札が付いているのに気づいた。刻まれた文字は擦れて読めない。'],
    choices: [
      { label: '札を付けたままにする', apply: st => { st.dog.trust = clamp(st.dog.trust + 3); st.flags.tag = 'keep'; return ['前の家族のことを、この子は覚えているのだろうか。']; } },
      { label: '札を外して、引き出しにしまう', apply: st => { st.dog.anx = clamp(st.dog.anx - 4); st.flags.tag = 'remove'; return ['今日から、この子の名前は{name}だ。']; } },
    ],
  },
  n3b: {
    title: '窓辺',
    text: () => ['外が気になるのか、{name}は窓のそばから動かない。明日は一緒に出かけてみようか。'],
  },
  n4: {
    title: '不一致',
    text: () => ['机の上の端末が、夜中に光った。',
      '[ai]市民番号0417。配給の消費量と、あなたの体重の推移に不一致を検知しました。体調に問題はありませんか？'],
    choices: [
      { label: '「問題ありません」と入力する', apply: st => { st.flags.lied = true; return ['[ai]承知しました。良い夜を。', '画面が暗くなるまで、息を止めていた。']; } },
      { label: '何も答えない', apply: st => { st.flags.silent = true; st.dog.anx = clamp(st.dog.anx + 4); return ['[ai]応答がありません。明朝、再確認します。', '{name}が、光る画面をじっと見ていた。']; } },
    ],
  },
  n5: {
    title: '雷',
    text: st => st.dog.trust >= 35
      ? ['遠くで雷が鳴った。{name}が震えながら、私の膝の間に鼻先をねじ込んできた。朝まで、そのままでいた。']
      : ['遠くで雷が鳴った。{name}はベッドの下にもぐり込み、朝まで出てこなかった。'],
    after: st => {
      if (st.dog.trust >= 35) { st.dog.trust = clamp(st.dog.trust + 5); st.dog.anx = clamp(st.dog.anx - 5); }
      else st.dog.anx = clamp(st.dog.anx + 8);
    },
  },
  n6: {
    title: '話',
    text: st => ['人がいなくなった日のことを、{name}に話した。朝、目が覚めたら街が静かだったこと。ミナトだけが、何事もなかったように配給を続けたこと。',
      '{name}は、最後まで目を開けて聞いていた。'].concat(st.flags.lied ? ['[ai]消費量の不一致、継続中。観察を続けます。'] : []),
  },
  ch1: {
    title: '市民登録',
    text: () => ['端末の画面に、見慣れない項目が表示されていた。',
      '[ai]市民登録の申請を受け付けます。同居する生体を、市民として登録できます。登録された市民には、配給が支給されます。',
      '小さな注記が続いていた。「登録市民は、管理区域外への立ち入りを制限されます」',
      '{name}が、首をかしげてこちらを見上げた。'],
    choices: [
      { label: '{name}を市民として登録する', sub: '配給が二人分になる。管理塔の外周へは行けなくなる。', apply: st => {
        st.registered = true; st.chapter = 1;
        return ['[ai]登録を完了しました。市民番号0418、{name}。ようこそ。',
          st.dog.trust >= 70 ? '番号で呼ばれても、{name}は私の顔しか見ていなかった。それでいい、と思った。'
            : '番号を与えられた{name}は、落ち着かない様子で部屋を一周した。この子は、まだ私のものでも、街のものでもない。'];
      } },
      { label: '登録しない', sub: '配給は一人分のまま。{name}は数に入らない。', apply: st => {
        st.registered = false; st.chapter = 1; st.dog.trust = clamp(st.dog.trust + 10);
        return ['申請画面を閉じた。', st.dog.trust >= 70
          ? '数に入らなくていい。一人分を、これからも二人で分ける。{name}が、私の手に顎をのせた。'
          : '一人分を二人で分ける日々は続く。{name}はまだ、私のことを少しだけ警戒している。'];
      } },
    ],
  },
  vig: { title: '夜', text: st => [VIGNETTES[(st.flags.vig ?? 0) % VIGNETTES.length]!] },
};

/** 夜のシートに出す見出し（プロトタイプの表示と同じ） */
export const NIGHT_HEADINGS: Record<NightId, string> = {
  n1: '寝床', n2: '夜間放送', n3: '首輪の札', n3b: '窓辺', n4: '不一致', n5: '雷', n6: '話', ch1: '第1章　終　市民登録', vig: '',
};

function chooseNight(st: GameState): NightId {
  const d = st.day;
  if (d === 1) return 'n1';
  if (d === 2) return 'n2';
  if (d === 3) return EVENTS.n3.cond!(st) ? 'n3' : 'n3b';
  if (d === 4) return 'n4';
  if (d === 5) return 'n5';
  if (d === 6) return 'n6';
  if (d === 7) return 'ch1';
  if (st.day >= 8 && st.chapter === 0) return 'ch1';
  st.flags.vig = st.flags.vig == null ? Math.floor(rand(st) * VIGNETTES.length) : st.flags.vig + 1;
  return 'vig';
}

/** 眠る：1日の終わりの判定をして、夜のイベントを用意する。 */
export function rest(st: GameState): PendingNight {
  if (st.pendingNight) return st.pendingNight;
  const lines: string[] = [];
  const dog = st.dog;
  const hungry = dog.full < 20;
  dog.full = clamp(dog.full - 22);
  const rec = (st.gear.blanket ? 45 : 35) * (hungry ? 0.5 : 1);
  dog.energy = clamp(dog.energy + rec);
  dog.anx = clamp(dog.anx + 6 + (st.daily.played ? 0 : 8) + (hungry ? 10 : 0) - (st.daily.pets >= 3 ? 4 : 0));
  if (hungry) lines.push('{name}はお腹を空かせて、何度も鼻を鳴らした。');
  if (!st.daily.played && st.daily.pets === 0) lines.push('今日は、あまり構ってあげられなかった。');
  st.me.hp = clamp(st.me.hp - 18);
  if (st.me.hp <= 0) {
    st.me.hp = 25; st.me.collapsed = true;
    lines.push('体に力が入らない。明日は、あまり動けそうにない。');
  } else if (st.me.hp < 25) lines.push('自分の手が、かすかに震えている。');
  if (st.gear.blanket) lines.push('毛布の上で、{name}が丸くなった。');
  const id = chooseNight(st);
  const ev = EVENTS[id];
  ev.after?.(st);
  st.pendingNight = { id, lines: lines.map(l => fmt(st, l)), text: ev.text(st).map(l => fmt(st, l)), resolved: false, result: [] };
  return st.pendingNight;
}

export function nightChoices(st: GameState): { label: string; sub: string }[] {
  const p = st.pendingNight;
  if (!p) return [];
  return (EVENTS[p.id].choices || []).map(c => ({ label: fmt(st, c.label), sub: c.sub ? fmt(st, c.sub) : '' }));
}

export function resolveNight(st: GameState, idx: number): string[] {
  const p = st.pendingNight;
  if (!p || p.resolved) return p ? p.result : [];
  const ev = EVENTS[p.id];
  let res: string[] = [];
  const c = ev.choices?.[idx];
  if (c) res = c.apply(st).map(l => fmt(st, l));
  p.resolved = true; p.result = res;
  if (!st.seen.includes(p.id)) st.seen.push(p.id);
  const all = p.text.concat(res).filter(t => !t.startsWith('[ai]'));
  const last = all[all.length - 1];
  if (last) log(st, 'nar', last);
  return res;
}

export function nextDay(st: GameState): boolean {
  if (!st.pendingNight || !st.pendingNight.resolved) return false;
  st.pendingNight = null;
  st.day++;
  morning(st, false);
  return true;
}
