"""
承認済みの待機フレーム idle-v12/frame_00.png を、動かせるパーツに切り分ける。
元のPNGは変更しない。出力：public/assets/dog/rig-v1/{atlas.png, atlas.json, rig.json}

作り方（輪郭が切れたり二重になったりしないための方針）
- 耳・ほほ毛・しっぽは「付け根を動かさず、先へいくほど大きくしなる」変形で動かす（Phaser の Rope）。
  切り口が動かないので継ぎ目が出ない。ベースにも切り口の周りを数px残し、重なりで隠す。
- 目は黒目・まぶたなどを重ねず、「目まわりをひとまとめにしたシール」にする。
  開き目は元の絵、半目・閉じ目は承認済みの別コマ（idle-v12 の frame_01/frame_02）から切り出して位置を合わせたもの。
  シールの下のベースは、目のまわりの毛・クリーム色を最も近い色で埋めてある。
- 安静時にパーツを重ねると元の絵に戻る（scripts/check-rig-rest.py で検査）。
- 画像生成AIでの描き直しはしない。元画像の画素と単色の塗りだけを使う。

使い方：python scripts/cut-rig.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
DOG = ROOT / 'public/assets/dog'
OUT = DOG / 'rig-v1'
S = 320


def load(p):
    return np.array(Image.open(p).convert('RGBA')).astype(np.float64)


orig = load(DOG / 'idle-v12/frame_00.png')
rgb, alpha = orig[:, :, :3], orig[:, :, 3] / 255.0
lum = rgb.mean(2)
YY, XX = np.mgrid[0:S, 0:S].astype(np.float64)


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


# ---- しなるパーツ ---------------------------------------------------------------
# axis：細長い向き（v=縦、h=横）。root：固定する付け根の側。
# cut：切り出す範囲（x0,x1,y0,y1）。付け根の側は band px だけ長くとって、ベースと重ねる。
BAND = 4
ROPES = {
    # 左耳：y=108 の線から上（付け根は下）。切り口は x=134 の縦線
    'earL': dict(axis='v', root='bottom', box=(50, 134, 36, 108), overlap=(0, BAND, 0, BAND)),
    'earR': dict(axis='v', root='bottom', box=(186, 272, 36, 108), overlap=(BAND, 0, 0, BAND)),
    # ほほ毛：y=108 から下（付け根は上）
    'cheekL': dict(axis='v', root='top', box=(50, 92, 108, 206), overlap=(0, BAND, BAND, 0)),
    'cheekR': dict(axis='v', root='top', box=(228, 272, 108, 206), overlap=(BAND, 0, BAND, 0)),
    # しっぽ：x=222 から右（付け根は左）。後ろ足（手前）に掛かる所は除く
    'tail': dict(axis='h', root='left', box=(222, 300, 168, 294), exclude=lambda extra=0: (XX < 227 - extra) & (YY > 248), behind=True, overlap=(BAND, 0, 0, 0)),
}
EYES = {'L': dict(c=(120.5, 151.0), r=(19.0, 17.0)), 'R': dict(c=(193.0, 151.0), r=(19.0, 17.0))}
PATCH_FULL, PATCH_ZERO = 1.28, 1.58     # シールの不透明度：楕円の半径比がこれ以下で1、これ以上で0

base = orig.copy()
layers = {}   # name -> dict(rgba, box(x0,y0,x1,y1), ...)


def region(box, extend=None):
    """box=(x0,x1,y0,y1) の範囲のマスク。extend=(left,right,top,bottom) で各辺を広げる"""
    x0, x1, y0, y1 = box
    l, r, t, b = extend or (0, 0, 0, 0)
    return (XX >= x0 - l) & (XX < x1 + r) & (YY >= y0 - t) & (YY < y1 + b)


def trim(mask_alpha, box=None):
    ys, xs = np.where(mask_alpha > 1)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return x0, y0, x1, y1


meta = {}
for name, p in ROPES.items():
    x0, x1, y0, y1 = p['box']
    axis, rootside = p['axis'], p['root']
    ext = p['overlap']      # 切り口の側は BAND px だけ広げて、ベースと重ねる（細い隙間を出さない）
    part_m = region(p['box'], ext)
    ex = p.get('exclude')
    if ex is not None:
        part_m &= ~ex(extra=BAND)       # 手前のパーツの下に BAND px もぐらせる（細い隙間を出さない）
    part = orig.copy()
    part[:, :, 3] = orig[:, :, 3] * part_m
    # ベースから抜くのは「付け根の帯」を除いた範囲
    erase = region(p['box'])
    if ex is not None:
        erase &= ~ex()
    if p.get('behind'):
        erase = erase & (XX >= x0 + BAND)       # しっぽ：ベースが手前なので、帯の分は残す
    base[:, :, 3] *= (1 - erase.astype(np.float64))
    # 切り出し範囲：細長い軸の向きは範囲いっぱい、直交する向きは中身に合わせて詰める
    ax0, ay0, ax1, ay1 = trim(part[:, :, 3])
    if axis == 'v':
        cx0, cx1 = ax0, ax1
        cy0, cy1 = (y0, y1 + BAND) if rootside == 'bottom' else (y0 - BAND, y1)
    else:
        cy0, cy1 = ay0, ay1
        cx0, cx1 = x0 - BAND, ax1
    layers[name] = dict(rgba=part[cy0:cy1, cx0:cx1], x=int(cx0), y=int(cy0))
    meta[name] = dict(kind='rope', axis=axis, root=rootside, behind=bool(p.get('behind')))

# ---- 目（シール） ----------------------------------------------------------------
frames = {k: load(DOG / f'idle-v12/{k}.png') for k in ('frame_01', 'frame_02')}


def rho(cx, cy, rx, ry):
    return np.sqrt(((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2)


def best_shift(src, cx, cy, rx, ry):
    """目のすぐ外側（毛・口元）が frame_00 と最もよく重なる、整数のずれ（dx,dy）"""
    r = rho(cx, cy, rx, ry)
    band = (r > 1.45) & (r < 2.1)
    a = lum
    best = None
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            sh = np.roll(np.roll(src[:, :, :3].mean(2), dy, axis=0), dx, axis=1)
            e = np.abs(sh - a)[band].mean()
            if best is None or e < best[0]:
                best = (e, dx, dy)
    return best


def shifted(img, dx, dy):
    return np.roll(np.roll(img, dy, axis=0), dx, axis=1)


eye_report = {}
for side, e in EYES.items():
    cx, cy = e['c']
    rx, ry = e['r']
    r = rho(cx, cy, rx, ry)
    k = smooth((PATCH_ZERO - r) / (PATCH_ZERO - PATCH_FULL))    # 中心は1、外へ向けて0
    # ベースの穴：目のまわりの毛・クリームを、最も近い色で埋める
    hole = r <= PATCH_FULL
    ring = (r > 1.34) & (r < 1.6)
    known = ring & ((np.abs(lum - 61) < 12) | ((rgb.min(2) > 200) & ((rgb[:, :, 0] - rgb[:, :, 2]) > 16)))
    idx = ndi.distance_transform_edt(~known, return_distances=False, return_indices=True)
    fill = np.stack([ndi.gaussian_filter(rgb[:, :, c][idx[0], idx[1]], 0.8) for c in range(3)], 2)
    for c in range(3):
        base[:, :, c] = np.where(hole, fill[:, :, c], base[:, :, c])
    for state, src in (('Open', orig), ('Half', frames['frame_01']), ('Closed', frames['frame_02'])):
        if state == 'Open':
            s, dxy = src, (0, 0)
        else:
            err, dx, dy = best_shift(src, cx, cy, rx, ry)
            s, dxy = shifted(src, dx, dy), (dx, dy)
            eye_report[f'{state}{side}'] = (round(float(err), 2), dx, dy)
        part = np.zeros_like(orig)
        part[:, :, :3] = s[:, :, :3]
        part[:, :, 3] = s[:, :, 3] * k
        ys, xs = np.where(k > 0.002)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        layers[f'eye{state}{side}'] = dict(rgba=part[y0:y1, x0:x1], x=int(x0), y=int(y0))
        meta[f'eye{state}{side}'] = dict(kind='eye', center=[cx, cy])

layers['base'] = dict(rgba=base, x=0, y=0)
meta['base'] = dict(kind='base')


# ---- 色にじみ対策：透明部分の色を近くの色で埋める -----------------------------------
def bleed(rgba):
    a = rgba[:, :, 3] > 8
    if a.all() or not a.any():
        return rgba
    idx = ndi.distance_transform_edt(~a, return_distances=False, return_indices=True)
    out = rgba.copy()
    for c in range(3):
        out[:, :, c] = rgba[:, :, c][idx[0], idx[1]]
    return out


crops = {}
for name, L in layers.items():
    arr = bleed(L['rgba'])
    crops[name] = dict(img=Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), 'RGBA'), x=L['x'], y=L['y'])

PAD = 2
order = sorted(crops, key=lambda n: -crops[n]['img'].height)
ATLAS_W = 1024
x = y = row_h = 0
place = {}
for n in order:
    w, h = crops[n]['img'].size
    if x + w + PAD > ATLAS_W:
        x, y, row_h = 0, y + row_h + PAD, 0
    place[n] = (x, y)
    x += w + PAD
    row_h = max(row_h, h)
ATLAS_H = 1
while ATLAS_H < y + row_h + PAD:
    ATLAS_H *= 2
atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
fr = {}
for n, (px, py) in place.items():
    im = crops[n]['img']
    atlas.paste(im, (px, py))
    w, h = im.size
    fr[n] = {'frame': {'x': px, 'y': py, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
             'sourceSize': {'w': w, 'h': h}, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}}
OUT.mkdir(parents=True, exist_ok=True)
atlas.save(OUT / 'atlas.png', optimize=True)
(OUT / 'atlas.json').write_text(json.dumps({'frames': fr, 'meta': {'image': 'atlas.png', 'size': {'w': ATLAS_W, 'h': ATLAS_H}, 'scale': '1'}}, indent=1))
(OUT / 'rig.json').write_text(json.dumps({
    'source': 'idle-v12/frame_00.png', 'size': S, 'band': BAND,
    'parts': {n: {'x': c['x'], 'y': c['y'], 'w': c['img'].width, 'h': c['img'].height, **meta[n]} for n, c in crops.items()},
    'eyes': {k: {'c': list(v['c']), 'r': list(v['r'])} for k, v in EYES.items()},
}, indent=1))
print('atlas', atlas.size, {n: crops[n]['img'].size for n in crops})
print('目の位置合わせ（誤差, dx, dy）', eye_report)
