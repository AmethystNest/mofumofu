/**
 * 犬の絵を「行ごとにずらした細かい格子」で描く小さな WebGL 描画。
 * 行の境目で補間されるので、帯描き（Canvas2D）のような横縞・継ぎ目が出ない。
 * 格子の行は 5px 間隔で、足・胴体下側の境（y=245）にちょうど行がある。
 */
import { PAW_Y, SIZE, breathLift, leanShift } from './warp';

const ROW = 5;
const ROWS = SIZE / ROW + 1;   // 65 行（0, 5, …, 320）

export interface DogRenderer {
  /**
   * 1枚描く。breath は -1..1、amp・lean は px。
   * from を渡すと from→img を mix（0..1）の割合で画素ごとに混ぜる（クロスフェード中も犬が透けない）
   */
  draw(img: HTMLImageElement, breath: number, amp: number, lean: number, from?: HTMLImageElement, mix?: number): void;
  clear(): void;
  dispose(): void;
}

const VS = `attribute vec2 aPos;attribute vec2 aUv;varying vec2 vUv;
void main(){vUv=aUv;gl_Position=vec4(aPos.x/${SIZE}.0*2.0-1.0,1.0-aPos.y/${SIZE}.0*2.0,0.0,1.0);}`;
// 乗算済みアルファ同士の線形補間なので、両方不透明な所は不透明のまま混ざる
const FS = `precision mediump float;varying vec2 vUv;uniform sampler2D uTex;uniform sampler2D uFrom;uniform float uMix;
void main(){gl_FragColor=mix(texture2D(uFrom,vUv),texture2D(uTex,vUv),uMix);}`;

export function createGlRenderer(canvas: HTMLCanvasElement): DogRenderer | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog, 'aPos'), aUv = gl.getAttribLocation(prog, 'aUv');
  const uMix = gl.getUniformLocation(prog, 'uMix');
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'uFrom'), 1);
  // 頂点：各行に左右2点。UV は固定、位置だけ毎回書き換える
  const uv = new Float32Array(ROWS * 4), pos = new Float32Array(ROWS * 4);
  for (let r = 0; r < ROWS; r++) {
    const v = (r * ROW) / SIZE;
    uv.set([0, v, 1, v], r * 4);
  }
  const idx = new Uint16Array((ROWS - 1) * 6);
  for (let r = 0; r < ROWS - 1; r++) { const a = r * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], r * 6); }
  const uvBuf = gl.createBuffer(), posBuf = gl.createBuffer(), idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const textures = new Map<HTMLImageElement, WebGLTexture>();
  const texture = (img: HTMLImageElement) => {
    let t = textures.get(img);
    if (!t) {
      t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      textures.set(img, t);
    }
    return t;
  };
  return {
    clear() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    draw(img, breath, amp, lean, from, mix = 1) {
      for (let r = 0; r < ROWS; r++) {
        const y = r * ROW;
        const fixed = y >= PAW_Y;
        const dx = fixed ? 0 : leanShift(y, lean), dy = fixed ? y : y - breathLift(y, breath, amp);
        pos[r * 4] = dx; pos[r * 4 + 1] = dy; pos[r * 4 + 2] = SIZE + dx; pos[r * 4 + 3] = dy;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      const to = texture(img), src = from ? texture(from) : to;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, to);
      gl.uniform1f(uMix, from ? mix : 1);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    },
    dispose() {
      for (const t of textures.values()) gl.deleteTexture(t);
      textures.clear();
      gl.deleteBuffer(uvBuf); gl.deleteBuffer(posBuf); gl.deleteBuffer(idxBuf); gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
