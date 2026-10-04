/**
 * 環境音（Web Audio で合成。音声ファイルは使わない）。
 * 風・建物の軋み・電気ノイズ・機械の低い唸りを主に、場面に応じて足す。決定音・ファンファーレは鳴らさない。
 * ブラウザの規則で、最初のタップ（unlock）のあとでしか鳴らない。端末の音量・消音に従い、設定でも切れる。
 */
export type Mood = "off" | "boot" | "record" | "restore" | "room" | "dawn";

const KEY = "mofumofu-sound";
let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let noiseBuf: AudioBuffer | undefined;
let beds: Record<string, GainNode> = {};
let timers: number[] = [];
let muted = (() => {
  try { return localStorage.getItem(KEY) === "off"; } catch { return false; }
})();

export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem(KEY, v ? "off" : "on"); } catch { /* 保存できなくても動く */ }
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.2);
}

function noise(c: AudioContext) {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 3;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.3; d[i] = b; }   // やや低めの雑音（茶色がかった）
  return noiseBuf;
}
function src(c: AudioContext, loop = true) {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.loop = loop;
  s.loopStart = Math.random() * 1.5;
  return s;
}

/** 常時鳴らす層（音量は mood で動かす）を作る */
function build(c: AudioContext) {
  master = c.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(c.destination);
  const bus = (name: string) => { const g = c.createGain(); g.gain.value = 0; g.connect(master!); beds[name] = g; return g; };

  // 風：低めの雑音をゆっくり開閉するフィルターに通す
  const wind = src(c), wf = c.createBiquadFilter();
  wf.type = "bandpass"; wf.frequency.value = 380; wf.Q.value = 0.6;
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.value = 0.11; lg.gain.value = 170; lfo.connect(lg).connect(wf.frequency);
  wind.connect(wf).connect(bus("wind")); wind.start(); lfo.start();

  // 電気の唸り：低い2音の重なり＋ごく小さなノイズ
  const hum = bus("hum");
  for (const [f, v] of [[55, 0.5], [110.4, 0.22], [165.2, 0.08]] as const) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = f; g.gain.value = v;
    o.connect(g).connect(hum); o.start();
  }
  const hiss = src(c), hf = c.createBiquadFilter();
  hf.type = "highpass"; hf.frequency.value = 3800;
  const hg = c.createGain(); hg.gain.value = 0.05;
  hiss.connect(hf).connect(hg).connect(bus("hiss")); hiss.start();

  // 室内の気配：ごく低い空気の層
  const air = src(c), af = c.createBiquadFilter();
  af.type = "lowpass"; af.frequency.value = 220;
  air.connect(af).connect(bus("air")); air.start();
}

function envelope(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

/** 一回きりの音。種類は軋み・ノイズの瞬き・足音・息・首輪 */
export function blip(kind: "creak" | "crackle" | "step" | "breath" | "collar" | "boot" | "glitch", delay = 0) {
  const c = ctx;
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const out = c.createGain(); out.connect(master);
  const kill = (s: AudioScheduledSourceNode, len: number) => { s.start(t); s.stop(t + len + 0.1); s.onended = () => out.disconnect(); };
  if (kind === "creak") {
    const o = c.createOscillator(), f = c.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.setValueAtTime(70 + Math.random() * 30, t);
    o.frequency.linearRampToValueAtTime(48 + Math.random() * 20, t + 1.4);
    f.type = "bandpass"; f.frequency.value = 240; f.Q.value = 7;
    o.connect(f).connect(out); envelope(out, t, 0.5, 0.05, 1.1); kill(o, 1.7);
  } else if (kind === "crackle" || kind === "glitch") {
    const s = src(c, false), f = c.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = kind === "glitch" ? 1400 : 2600;
    s.connect(f).connect(out); envelope(out, t, 0.006, kind === "glitch" ? 0.22 : 0.1, kind === "glitch" ? 0.18 : 0.07); kill(s, 0.3);
  } else if (kind === "step") {
    const o = c.createOscillator(), f = c.createBiquadFilter();
    o.type = "sine"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    f.type = "lowpass"; f.frequency.value = 220;
    o.connect(f).connect(out); envelope(out, t, 0.008, 0.13, 0.16); kill(o, 0.3);
  } else if (kind === "breath") {
    const s = src(c, false), f = c.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 0.9;
    s.connect(f).connect(out); envelope(out, t, 0.7, 0.045, 1.0); kill(s, 1.8);
  } else if (kind === "collar") {
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = 3100 + i * 380 + Math.random() * 120;
      o.connect(g).connect(out); envelope(g, t + i * 0.06, 0.004, 0.02, 0.28); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.4);
    }
    setTimeout(() => out.disconnect(), 1500);
  } else {
    // boot：低い機械音がゆっくり立ち上がる
    const o = c.createOscillator(), f = c.createBiquadFilter();
    o.type = "triangle"; o.frequency.setValueAtTime(40, t); o.frequency.exponentialRampToValueAtTime(82, t + 2.2);
    f.type = "lowpass"; f.frequency.value = 300;
    o.connect(f).connect(out); envelope(out, t, 1.8, 0.08, 1.4); kill(o, 3.4);
  }
}

const MOODS: Record<Mood, Partial<Record<string, number>>> = {
  off: {},
  boot: { hum: 0.05, hiss: 0.7 },
  record: { hum: 0.035, hiss: 1, wind: 0.05 },
  restore: { hum: 0.03, hiss: 0.35, wind: 0.18, air: 0.4 },
  room: { hum: 0.015, wind: 0.2, air: 0.55 },
  dawn: { hum: 0.01, wind: 0.14, air: 0.5 },
};
const SCATTER: Record<Mood, ("creak" | "crackle" | "glitch")[]> = {
  off: [], boot: ["crackle"], record: ["glitch", "crackle"], restore: ["creak", "crackle"], room: ["creak"], dawn: ["creak"],
};

/** 最初のタップで呼ぶ。作れない端末では何もしない（音なしで進む） */
export async function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      build(ctx);
    }
    if (ctx.state === "suspended") await ctx.resume();
  } catch { /* 音なしで続ける */ }
}

export function mood(m: Mood) {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  if (!ctx) return;
  const t = ctx.currentTime, want = MOODS[m];
  for (const [name, g] of Object.entries(beds)) g.gain.setTargetAtTime(want[name] ?? 0, t, 1.2);
  const kinds = SCATTER[m];
  if (!kinds.length) return;
  const loop = () => {
    blip(kinds[Math.floor(Math.random() * kinds.length)]!);
    timers.push(window.setTimeout(loop, 2500 + Math.random() * (m === "record" ? 2500 : 6500)));
  };
  timers.push(window.setTimeout(loop, 900));
}

/** 画面が見えない間は止め、戻ったら再開 */
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend().catch(() => {});
  else void ctx.resume().catch(() => {});
});
