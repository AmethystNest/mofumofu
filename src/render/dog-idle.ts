export interface DogIdleOptions { baseUrl: string; autoplay?: boolean }
export interface DogIdlePlayer {
  play(): void;
  pause(): void;
  restart(): void;
  destroy(): void;
  readonly frame: number;
  readonly playing: boolean;
  readonly durationMs: number;
}
interface IdleMetadata {
  sequence: number[];
  durationsMs: number[];
  frames: string[];
}
/** Select a source frame at a loop-relative elapsed time, including exact boundaries. */
export function frameAtTime(sequence: readonly number[], durationsMs: readonly number[], elapsedMs: number): number {
  const total = durationsMs.reduce((sum, duration) => sum + duration, 0);
  let remaining = ((elapsedMs % total) + total) % total;
  let position = 0;
  while (remaining >= durationsMs[position]!) remaining -= durationsMs[position++]!;
  return sequence[position]!;
}

/** Deterministic PNG playback of the approved PetGame dog idle sequence. */
export async function createDogIdlePlayer(image: HTMLImageElement, { baseUrl, autoplay = true }: DogIdleOptions): Promise<DogIdlePlayer> {
  if (!image || image.tagName !== 'IMG') throw new TypeError('An img element is required.');
  if (!baseUrl) throw new TypeError('baseUrl is required.');
  const document = image.ownerDocument;
  const view = document.defaultView;
  if (!view) throw new Error('A mounted document is required.');
  const window = view;
  const root = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, document.baseURI);
  const response = await window.fetch(new URL('animation.json', root));
  if (!response.ok) throw new Error(`Dog animation metadata failed to load (${response.status}).`);
  const metadata = await response.json() as IdleMetadata;
  const { sequence, durationsMs, frames } = metadata;
  if (!Array.isArray(sequence) || !sequence.length || !Array.isArray(durationsMs) ||
      sequence.length !== durationsMs.length || !Array.isArray(frames) ||
      !sequence.every(i => Number.isInteger(i) && i >= 0 && i < frames.length) ||
      !durationsMs.every(ms => Number.isFinite(ms) && ms > 0)) {
    throw new Error('Invalid dog animation sequence or durations.');
  }
  const loaded = new Map<number, HTMLImageElement>();
  await Promise.all([...new Set(sequence)].map(async index => {
    const sprite = new window.Image();
    sprite.src = new URL(frames[index]!, root).href;
    await sprite.decode();
    if (sprite.naturalWidth !== 320 || sprite.naturalHeight !== 320) {
      throw new Error(`Unexpected dog frame size: ${frames[index]}.`);
    }
    loaded.set(index, sprite);
  }));
  const total = durationsMs.reduce((sum, duration) => sum + duration, 0);
  const original = {
    src: image.getAttribute('src'),
    width: image.getAttribute('width'),
    height: image.getAttribute('height'),
  };
  image.width = 320;
  image.height = 320;
  let elapsed = 0;
  let started: number | null = null;
  let handle: number | null = null;
  let desiredPlaying = false;
  let destroyed = false;
  let current = -1;
  function phase(now = window.performance.now()) {
    return (elapsed + (started === null ? 0 : now - started)) % total;
  }
  function render(now: number) {
    const frame = frameAtTime(sequence, durationsMs, phase(now));
    if (frame !== current) {
      image.src = loaded.get(frame)!.src;
      current = frame;
    }
  }
  function tick(now: number) {
    handle = null;
    if (destroyed || started === null) return;
    render(now);
    handle = window.requestAnimationFrame(tick);
  }
  function suspend() {
    if (started !== null) {
      const now = window.performance.now();
      render(now);
      elapsed = phase(now);
      started = null;
    }
    if (handle !== null) window.cancelAnimationFrame(handle);
    handle = null;
  }
  function resume() {
    if (destroyed || !desiredPlaying || document.hidden || started !== null) return;
    started = window.performance.now();
    handle = window.requestAnimationFrame(tick);
  }
  function visibilityChanged() {
    if (document.hidden) suspend();
    else resume();
  }
  const player: DogIdlePlayer = {
    play() { if (!destroyed) { desiredPlaying = true; resume(); } },
    pause() { desiredPlaying = false; suspend(); },
    restart() {
      if (destroyed) return;
      suspend();
      elapsed = 0;
      render(window.performance.now());
      resume();
    },
    get frame() { return current; },
    get playing() { return !destroyed && desiredPlaying; },
    get durationMs() { return total; },
    destroy() {
      if (destroyed) return;
      desiredPlaying = false;
      suspend();
      destroyed = true;
      document.removeEventListener('visibilitychange', visibilityChanged);
      for (const [name, value] of Object.entries(original)) {
        if (value === null) image.removeAttribute(name);
        else image.setAttribute(name, value);
      }
      loaded.clear();
    },
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  render(window.performance.now());
  if (autoplay) player.play();
  return player;
}
