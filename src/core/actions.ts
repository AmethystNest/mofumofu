import { isGear, ITEMS, UNIQUE } from '../content/items';
import { LOCS } from '../content/locations';
import { pick, rand } from './rng';
import type {
  DogStats, ExploreResult, FeedResult, FeedTarget, Fx, GameState, ItemId, LocId, LootId, PlayResult,
} from './types';
import { clamp, fmt, log } from './util';

/** ごはん（行動を消費しない） */
export function feed(st: GameState, item: ItemId, target: FeedTarget): FeedResult {
  const fx: Fx[] = [];
  if (!st.inv[item] || st.inv[item] < 1) return { ok: false, msg: 'もう残っていない。' };
  const toDog = target === 'dog' || target === 'half';
  if (toDog && st.dog.full >= 95) return { ok: false, msg: '{name}はもうお腹いっぱいのようだ。' };
  st.inv[item]--;
  const add = (who: 'dog' | 'me', key: string, d: number, label: string) => {
    const obj = (who === 'dog' ? st.dog : st.me) as unknown as Record<string, number>;
    const before = obj[key]!;
    obj[key] = clamp(before + d);
    if (obj[key] !== before) fx.push({ label, d: obj[key]! - before });
  };
  let text = '';
  if (item === 'ration') {
    if (target === 'dog') { add('dog', 'full', 45, 'おなか'); add('dog', 'trust', 3, '信頼'); text = '配給食をまるごと{name}にあげた。自分のお腹が小さく鳴った。'; }
    else if (target === 'half') { add('dog', 'full', 24, 'おなか'); add('dog', 'trust', 2, '信頼'); add('me', 'hp', 16, 'あなた'); text = '配給食を半分に割った。一人分を、二人で。'; }
    else { add('me', 'hp', 30, 'あなた'); add('dog', 'anx', 4, ''); text = '配給食を自分で食べた。{name}がじっとこちらを見ていた。'; }
  } else if (item === 'can') {
    if (target === 'dog') { add('dog', 'full', 30, 'おなか'); add('dog', 'trust', 1, '信頼'); text = '缶詰を開けて{name}にあげた。'; }
    else { add('me', 'hp', 20, 'あなた'); text = '缶詰を食べた。塩辛い味がした。'; }
  } else if (item === 'dogfood') {
    add('dog', 'full', 40, 'おなか'); add('dog', 'trust', 1, '信頼'); text = 'ドッグフードをあげた。{name}の尻尾が止まらない。';
  }
  if (toDog) { st.daily.dogAte = true; add('dog', 'anx', -3, ''); }
  log(st, 'nar', text);
  return { ok: true, fx: fx.filter(f => f.label), toDog };
}

export const PETS_PER_DAY = 3;

/** なでる（行動を消費しない。効果は1日3回まで） */
export function pet(st: GameState): { fx: Fx[] } {
  const fx: Fx[] = [];
  if (st.daily.pets < PETS_PER_DAY) {
    st.daily.pets++;
    const t0 = st.dog.trust, a0 = st.dog.anx;
    st.dog.trust = clamp(st.dog.trust + 1);
    st.dog.anx = clamp(st.dog.anx - 4);
    if (st.dog.trust !== t0) fx.push({ label: '信頼', d: st.dog.trust - t0 });
    if (st.dog.anx !== a0) fx.push({ label: '安心', d: a0 - st.dog.anx });
  }
  return { fx };
}

/** 遊ぶ（行動1） */
export function play(st: GameState): PlayResult {
  if (st.ap < 1) return { ok: false, msg: '今日はもう動けない。' };
  if (st.dog.energy < 10) return { ok: false, msg: '{name}は疲れて伏せたままだ。' };
  st.ap -= 1;
  const firstPlay = !st.daily.played;
  st.daily.played = true;
  const fx: Fx[] = [];
  const ch = (key: keyof DogStats, d: number, label: string, inv?: boolean) => {
    const b = st.dog[key];
    st.dog[key] = clamp(b + d);
    if (label && st.dog[key] !== b) fx.push({ label, d: inv ? b - st.dog[key] : st.dog[key] - b });
  };
  ch('energy', -12, 'げんき');
  ch('full', -4, '');
  ch('trust', firstPlay ? (st.gear.ball ? 6 : 4) : 1, '信頼');
  ch('anx', -15, '安心', true);
  const lines = st.gear.ball
    ? ['古いボールを転がした。{name}は廊下の端まで追いかけて、得意げに戻ってきた。', 'ボールを高く投げると、{name}が見事に受け止めた。']
    : ['丸めた靴下で引っぱりっこをした。{name}は本気だった。', '部屋の中で追いかけっこをした。久しぶりに声を出して笑った。'];
  log(st, 'nar', pick(st, lines));
  return { ok: true, fx };
}

export const canDogCome = (st: GameState): boolean => st.dog.energy >= 25 && st.dog.full >= 10;

export function locUnlocked(st: GameState, id: LocId): boolean {
  if (id !== 'tower') return true;
  return st.gear.map && !st.registered;
}

function pickLoot(st: GameState, table: ReadonlyArray<readonly [LootId, number]>): LootId {
  const opts = table.filter(([id]) => !(isGear(id) && st.gear[id]));
  const total = opts.reduce((s, o) => s + o[1], 0);
  let r = rand(st) * total;
  for (const [id, w] of opts) { if ((r -= w) < 0) return id; }
  return 'none';
}

/** 探しに行く（行動2） */
export function explore(st: GameState, locId: LocId, withDog: boolean): ExploreResult {
  const loc = LOCS[locId];
  if (!loc || !locUnlocked(st, locId)) return { ok: false, msg: 'そこへは行けない。' };
  if (st.ap < 2) return { ok: false, msg: '出かけるには時間が足りない。' };
  if (withDog && !canDogCome(st)) withDog = false;
  st.ap -= 2; st.daily.explored = true; st.stats.explores++;
  const lines = [fmt(st, pick(st, loc.intro))];
  const found: Partial<Record<LootId, number>> = {};
  const addFound = (id: LootId) => {
    if (id === 'none') return;
    if (isGear(id) && (st.gear[id] || found[id])) return;
    found[id] = (found[id] || 0) + 1;
  };
  if (withDog || rand(st) < 0.6) addFound(pickLoot(st, loc.loot));
  if (withDog && rand(st) < 0.2 + (st.dog.trust / 100) * 0.6) {
    const before = JSON.stringify(found);
    addFound(pickLoot(st, loc.loot.filter(l => l[0] !== 'none')));
    lines.push(fmt(st, '{name}が瓦礫の隙間に鼻を突っ込んで、前足で掻きはじめた。' + (JSON.stringify(found) !== before ? 'そこに何かがあった。' : '')));
  }
  let caught = false;
  if (rand(st) < loc.danger) {
    if (withDog && rand(st) < 0.3 + (st.dog.trust / 100) * 0.6) {
      lines.push(fmt(st, '{name}が急に低くうなった。直後、角の向こうを巡回ドローンの光が横切った。息を殺してやり過ごした。'));
      st.dog.trust = clamp(st.dog.trust + 2);
    } else {
      caught = true;
      lines.push('巡回ドローンに見つかった。「市民番号0417、区域外です」——走って逃げる途中で、荷物の半分を落とした。');
      for (const k of Object.keys(found) as LootId[]) {
        if (!isGear(k)) { found[k] = Math.floor(found[k]! / 2); if (!found[k]) delete found[k]; }
      }
      st.me.hp = clamp(st.me.hp - 8);
      if (withDog) st.dog.anx = clamp(st.dog.anx + 10);
    }
  }
  for (const [k, n] of Object.entries(found) as [LootId, number][]) {
    if (k === 'none') continue;
    if (isGear(k)) st.gear[k] = true; else st.inv[k] = (st.inv[k] || 0) + n;
  }
  if (found.map) lines.push('折りたたまれた紙を広げると、管理塔の周りの地図だった。配給の予備倉庫に印がついている。');
  st.me.hp = clamp(st.me.hp - 10);
  if (withDog) {
    st.dog.energy = clamp(st.dog.energy - 25); st.dog.full = clamp(st.dog.full - 10);
    st.dog.trust = clamp(st.dog.trust + 2); st.dog.anx = clamp(st.dog.anx - 5);
  } else {
    st.dog.anx = clamp(st.dog.anx + 15);
    lines.push(fmt(st, '帰ると、{name}が扉のすぐ内側で待っていた。'));
  }
  const entries = Object.entries(found) as [Exclude<LootId, 'none'>, number][];
  const summary = entries.map(([k, n]) => ITEMS[k] + (UNIQUE.includes(k as never) ? '' : ' ×' + n)).join('、');
  log(st, 'nar', `${loc.name}へ${withDog ? '{name}と' : '一人で'}出かけた。` + (summary ? `持ち帰ったもの：${summary}。` : '何も見つからなかった。'));
  return { ok: true, lines, found, caught, withDog };
}
