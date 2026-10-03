export type Motion = "idle" | "pet" | "play" | "eat" | "sleep" | "sad";
type Frame = { src: string; ms: number };
export async function createDogMotion(image: HTMLImageElement) {
  const root = `${import.meta.env.BASE_URL}assets/dog/`;
  const response = await fetch(`${root}motions-v1/motions.json`);
  if (!response.ok) throw new Error("Motion assets unavailable");
  const { clips } = (await response.json()) as {
    clips: Record<Motion, Frame[]>;
  };
  await Promise.all(
    [
      ...new Set(
        Object.values(clips)
          .flat()
          .map((f) => f.src),
      ),
    ].map(async (src) => {
      const im = new Image();
      im.src = root + src;
      await im.decode();
    }),
  );
  let passive: Motion = "idle",
    active: Motion = "idle",
    elapsed = 0,
    last = performance.now(),
    until = 0,
    handle = 0,
    previous = "";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function tick(now: number) {
    const delta = document.hidden ? 0 : Math.min(now - last, 100);
    last = now;
    elapsed += delta;
    if (until > 0 && elapsed >= until) {
      active = passive;
      elapsed = 0;
      until = 0;
    }
    const frames = clips[active];
    let phase = reduced.matches
      ? 0
      : elapsed % frames.reduce((a, f) => a + f.ms, 0);
    let f = frames[0]!;
    for (const item of frames) {
      f = item;
      if (phase < item.ms) break;
      phase -= item.ms;
    }
    if (previous !== f.src) {
      image.src = root + f.src;
      previous = f.src;
      image.dataset.motion = active;
    }
    handle = requestAnimationFrame(tick);
  }
  const visibility = () => {
    last = performance.now();
  };
  document.addEventListener("visibilitychange", visibility);
  handle = requestAnimationFrame(tick);
  return {
    react(m: Motion, ms = 2200) {
      active = m;
      elapsed = 0;
      until = ms;
    },
    set(m: Motion) {
      passive = m;
      if (!until && active !== m) {
        active = m;
        elapsed = 0;
      }
    },
    destroy() {
      cancelAnimationFrame(handle);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
