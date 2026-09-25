/** A. 3D→スプライト方式の再生。アトラス（WebP）からコマを切り出して状態ごとにループ再生する。 */
import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { DogState } from './dog2d';

interface Manifest {
  fps: number;
  frameW: number; frameH: number;
  /** コマ内の接地点（足元の中心） */
  anchor: [number, number];
  /** 待機1コマ目の犬の横幅（px） */
  dogWidth: number;
  states: Record<DogState, { file: string; frames: number; cols: number; bytes: number }>;
}

export class Dog3DSprites {
  readonly view = new Container();
  private m?: Manifest;
  private frames: Partial<Record<DogState, Texture[]>> = {};
  private cur = new Sprite();
  private prev = new Sprite();
  private state: DogState = 'idle';
  private t = 0;
  private fade = 1;
  private loading?: Promise<void>;

  constructor(private baseUrl: string) {
    this.view.addChild(this.prev, this.cur);
  }

  load(displayWidth: number): Promise<void> {
    return (this.loading ??= (async () => {
      const m: Manifest = await (await fetch(this.baseUrl + 'manifest.json')).json();
      this.m = m;
      await Promise.all(Object.entries(m.states).map(async ([s, info]) => {
        const tex: Texture = await Assets.load(this.baseUrl + info.file);
        const list: Texture[] = [];
        for (let i = 0; i < info.frames; i++) {
          const x = (i % info.cols) * m.frameW, y = Math.floor(i / info.cols) * m.frameH;
          list.push(new Texture({ source: tex.source, frame: new Rectangle(x, y, m.frameW, m.frameH) }));
        }
        this.frames[s as DogState] = list;
      }));
      const k = displayWidth / m.dogWidth;
      for (const sp of [this.cur, this.prev]) {
        sp.anchor.set(m.anchor[0] / m.frameW, m.anchor[1] / m.frameH);
        sp.scale.set(k);
      }
      // 親（holder）は2D用の座標なので、ここでは縮尺を打ち消さない
      this.setState(this.state);
    })());
  }

  setState(s: DogState) {
    if (s === this.state && this.cur.texture !== Texture.EMPTY) return;
    this.prev.texture = this.cur.texture;
    this.prev.alpha = 1;
    this.state = s; this.t = 0; this.fade = 0;
    this.update(0);
  }

  update(dt: number) {
    const m = this.m, list = this.frames[this.state];
    if (!m || !list) return;
    this.t += dt;
    this.cur.texture = list[Math.floor(this.t * m.fps) % list.length]!;
    // 状態が変わったときは 0.2 秒で重ねて切り替える
    this.fade = Math.min(1, this.fade + dt / 0.2);
    this.cur.alpha = this.fade;
    this.prev.alpha = 1 - this.fade;
    this.prev.visible = this.fade < 1;
  }

  stats() {
    const m = this.m;
    if (!m) return null;
    const infos = Object.values(m.states);
    const frames = infos.reduce((s, i) => s + i.frames, 0);
    const gpu = infos.reduce((s, i) => s + i.cols * m.frameW * Math.ceil(i.frames / i.cols) * m.frameH * 4, 0);
    return { frames, fps: m.fps, frameSize: `${m.frameW}×${m.frameH}`, gpuBytes: gpu, downloadBytes: infos.reduce((s, i) => s + i.bytes, 0) };
  }
}
