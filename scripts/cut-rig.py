"""
承認済みの待機フレーム idle-v12/frame_00.png を、動かせるパーツに切り分ける。
元のPNGは変更しない。出力：public/assets/dog/rig-v1/{atlas.png, atlas.json, rig.json}

- 安静時にパーツを重ねると元の絵に戻る（scripts/check-rig-rest.py で検査）。
- 動かしても輪郭が二重にならないよう、ベース側は「パーツの内側」だけを抜き、
  切り口の周りは帯状に残す（帯の幅は PARTS の band）。
- 使うのは元画像の画素と単色の塗り・線だけ。画像生成AIでの描き直しはしない。

使い方：python scripts/cut-rig.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'public/assets/dog/idle-v12/frame_00.png'
OUT = ROOT / 'public/assets/dog/rig-v1'
S = 320
SS = 4  # 多角形の描画倍率（縁をなめらかにする）

orig = np.array(Image.open(SRC).convert('RGBA')).astype(np.float64)
rgb, alpha = orig[:, :, :3], orig[:, :, 3] / 255.0
lum = rgb.mean(2)


def poly_mask(points):
    im = Image.new('L', (S * SS, S * SS), 0)
    ImageDraw.Draw(im).polygon([(x * SS, y * SS) for x, y in points], fill=255)
    return np.array(im.resize((S, S), Image.BOX)).astype(np.float64) / 255.0


def ellipse_mask(cx, cy, rx, ry):
    im = Image.new('L', (S * SS, S * SS), 0)
    ImageDraw.Draw(im).ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=255)
    return np.array(im.resize((S, S), Image.BOX)).astype(np.float64) / 255.0


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def depth(mask):
    """多角形の内側で、境界からの距離(px)"""
    return ndi.distance_transform_edt(mask > 0.5)


def eye_opening(cx, cy, rx, ry, shrink=1):
    """目の開口（輪郭線の内側）：白目＋黒目＋ハイライトのつながりを実際の色から求める。
    楕円で近似すると目の傾きの分だけ白目が縁に残るため、色で切り出す。"""
    box = np.zeros((S, S), bool)
    box[int(cy - ry - 7):int(cy + ry + 8), int(cx - rx - 7):int(cx + rx + 8)] = True
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    dark = (lum < 52) & box                               # 黒目・輪郭線（毛は ~61 で除外）
    white = (rgb.min(2) >= 200) & ((r - b) < 16) & box    # 白目・ハイライト（口元のクリームは青が低いので除外）
    lab, _ = ndi.label(dark | white)
    keep = lab == lab[int(cy), int(cx)]
    region = ndi.binary_fill_holes(keep)
    inner = ndi.binary_erosion(region, iterations=shrink)  # 輪郭線の分だけ内側へ
    return ndi.gaussian_filter(inner.astype(np.float64), 0.6)


# ---- パーツ定義 -------------------------------------------------------------
# poly: 切り出す範囲（耳なら耳＋頭の毛の一部）。feather: 切り口をなじませる幅。
# band: ベースに残す帯の幅（切り口からこの距離まではベースにも元の絵を残す）。
# pivot: 回転・ゆれの支点（元画像の座標）。z: 'front'（ベースの手前）/ 'behind'（奥）
PARTS = {
    'earL': dict(poly=[(50, 35), (134, 35), (134, 84), (122, 100), (104, 121), (88, 134), (50, 134)],
                 feather=3, band=9, pivot=(104, 118), z='front'),
    'earR': dict(poly=[(270, 35), (186, 35), (186, 84), (198, 100), (216, 121), (232, 134), (270, 134)],
                 feather=3, band=9, pivot=(216, 118), z='front'),
    'cheekL': dict(poly=[(50, 134), (92, 134), (88, 158), (94, 182), (101, 204), (50, 204)],
                   feather=3, band=8, pivot=(92, 134), z='front'),
    'cheekR': dict(poly=[(270, 134), (228, 134), (232, 158), (226, 182), (219, 204), (270, 204)],
                   feather=3, band=8, pivot=(228, 134), z='front'),
    'pawL': dict(poly=[(115, 249), (157, 249), (157, 296), (115, 296)],
                 feather=4, band=5, pivot=(136, 286), z='front', feather_sides=False),
    'pawR': dict(poly=[(157, 249), (199, 249), (199, 296), (157, 296)],
                 feather=4, band=5, pivot=(178, 286), z='front', feather_sides=False),
}
TAIL_POLY = [(223, 198), (232, 190), (300, 170), (300, 292), (228, 292), (227, 252), (223, 245)]
TAIL_EXT = [(212, 231), (222, 231), (222, 262), (212, 262)]   # 奥側に隠す単色の延長（付け根の隙間防止）
TAIL_PIVOT = (230, 244)
TAIL_GRAY = (68, 58, 57)

# 目：開口（輪郭の内側）の楕円。縁の内側に1px入れてある
EYES = {
    'L': dict(c=(120.5, 151.0), r=(18.3, 15.8)),
    'R': dict(c=(193.0, 151.0), r=(18.3, 15.8)),
}
SCLERA = (246, 245, 245)
FUR = (68, 58, 57)
CREAM = (248, 236, 220)
LASH = (38, 22, 16)

layers = {}   # 名前 -> (RGBA float(H,W,4) 0..255, 切り抜き前の全体サイズ)
base_rgba = orig.copy()


def put(name, rgba, pivot=None, z='front'):
    layers[name] = dict(rgba=rgba, pivot=pivot, z=z)


# ---- 耳・ほほ毛・前足 -----------------------------------------------------
for name, p in PARTS.items():
    m = poly_mask(p['poly'])
    d = depth(m)
    f = smooth(d / p['feather']) if p.get('feather_sides', True) else None
    if f is None:
        # 前足：上の切り口だけをなじませ、左右と下は切り落とす（輪郭を残さない）
        ys = np.arange(S)[:, None] * np.ones((1, S))
        top = min(y for _, y in p['poly'])
        f = smooth((ys - top) / p['feather']) * (m > 0.5)
    part = np.zeros_like(orig)
    part[:, :, :3] = rgb
    part[:, :, 3] = orig[:, :, 3] * f * (m > 0.02)
    put(name, part, p['pivot'], p['z'])
    if p.get('feather_sides', True):
        erase = (d >= p['band']).astype(np.float64)
    else:
        # 前足：切り口の上辺から band だけ残し、左右・下は全部抜く
        ys = np.arange(S)[:, None] * np.ones((1, S))
        top = min(y for _, y in p['poly'])
        erase = ((m > 0.5) & (ys >= top + p['band'])).astype(np.float64)
    base_rgba[:, :, 3] *= (1 - erase)

# ---- しっぽ（ベースの奥に置く） -----------------------------------------
mt = poly_mask(TAIL_POLY)
tail = np.zeros_like(orig)
tail[:, :, :3] = rgb
tail[:, :, 3] = orig[:, :, 3] * (mt > 0.02)
ext = poly_mask(TAIL_EXT)
for c in range(3):
    tail[:, :, c] = np.where(ext > 0.5, TAIL_GRAY[c], tail[:, :, c])
tail[:, :, 3] = np.maximum(tail[:, :, 3], ext * 255.0)
put('tail', tail, TAIL_PIVOT, 'behind')
# ベースに付け根を3px残す：回しても、ベースとしっぽの境目に細い隙間が出ない
base_rgba[:, :, 3] *= (1 - (np.roll(mt, 3, axis=1) > 0.5).astype(np.float64))

# ---- 目：黒目・縁・まぶた -------------------------------------------------
for side, e in EYES.items():
    cx, cy = e['c']
    rx, ry = e['r']
    opening = eye_opening(cx, cy, rx, ry)
    inside = opening > 0.5
    # 黒目：白目（明るい）と混ざった縁を、明るさから割合に戻して切り出す
    a = np.clip((236 - lum) / (236 - 38), 0, 1) * (opening > 0.02)
    core = ndi.binary_fill_holes(a > 0.55)            # ハイライトの穴を埋める
    core = ndi.binary_opening(core, iterations=1)
    iris = np.zeros_like(orig)
    iris_rgb = np.array([40, 25, 19], dtype=np.float64)
    soft = np.where(core, 1.0, a) * opening
    for c in range(3):
        iris[:, :, c] = np.where(core, rgb[:, :, c], iris_rgb[c])
    iris[:, :, 3] = 255.0 * soft
    put('iris' + side, iris, (cx, cy), 'front')
    # ベース：開口の中は白目の単色にする（黒目が動くと白目が見える）
    for c in range(3):
        base_rgba[:, :, c] = np.where(inside, SCLERA[c], base_rgba[:, :, c])
    base_rgba[:, :, 3] = np.maximum(base_rgba[:, :, 3], opening * 255.0 * (opening > 0.5))
    # 縁：開口のすぐ外の元の画素（黒目のはみ出しを隠す）。安静時は元の絵と一致する
    ring = np.zeros_like(orig)
    ring[:, :, :3] = rgb
    # まぶた（長方形）の範囲は縁がすべて覆う：まぶたの角が外にはみ出して見えない
    lw, lh = int(rx * 2 + 8), int(ry * 2 + 8)
    box = np.zeros((S, S))
    box[int(round(cy - ry - 4)):int(round(cy - ry - 4)) + lh, int(round(cx - lw / 2)):int(round(cx - lw / 2)) + lw] = 1
    ring[:, :, 3] = orig[:, :, 3] * (1 - opening) * box
    put('ring' + side, ring, (cx, cy), 'front')
    # まぶた：目のまわりの毛・クリームの色をなだらかにつなげた「皮膚」。上下とも同じ絵（縁の外にはみ出す分は縁が隠す）
    w, h = int(rx * 2 + 8), int(ry * 2 + 8)
    x0, y0 = int(round(cx - w / 2)), int(round(cy - ry - 4))
    near = ndi.binary_dilation(inside, iterations=6) & ~ndi.binary_dilation(inside, iterations=3)
    r_, b_ = rgb[:, :, 0], rgb[:, :, 2]
    known = near & ((np.abs(lum - 61) < 12) | ((rgb.min(2) > 200) & ((r_ - b_) > 16)))
    idx = ndi.distance_transform_edt(~known, return_distances=False, return_indices=True)   # いちばん近い既知の色
    skin = np.zeros((S, S, 4))
    for c in range(3):
        skin[:, :, c] = ndi.gaussian_filter(rgb[:, :, c][idx[0], idx[1]], 0.9)
    skin[:, :, 3] = 255
    lid = skin[y0:y0 + h, x0:x0 + w].copy()
    layers['lidUp' + side] = dict(rgba=lid, pivot=None, z='front', standalone=True)
    layers['lidLo' + side] = dict(rgba=lid.copy(), pivot=None, z='front', standalone=True)


def lash_arc(w, up):
    """まぶたの縁のまつ毛の線（上まぶた：下に凸、下まぶた：上に凸）"""
    sup = 4
    im = Image.new('RGBA', (w * sup, 8 * sup), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = []
    for i in range(0, 41):
        t = i / 40
        x = t * (w - 4) + 2
        bulge = 3.0 * (1 - (2 * t - 1) ** 2)
        y = 3.0 + (bulge if up else -bulge) + (0 if up else 2.5)
        pts.append((x * sup, y * sup))
    d.line(pts, fill=LASH + (255,), width=int(2.2 * sup), joint='curve')
    return np.array(im.resize((w, 8), Image.BOX)).astype(np.float64)


layers['lashUp'] = dict(rgba=lash_arc(int(EYES['L']['r'][0] * 2 + 8), True), pivot=None, z='front', standalone=True)
layers['lashLo'] = dict(rgba=lash_arc(int(EYES['L']['r'][0] * 2 + 8), False), pivot=None, z='front', standalone=True)
put('base', base_rgba, None, 'base')


# ---- 色にじみ対策：透明部分の色を近くの色で埋める --------------------------
def bleed(rgba):
    a = rgba[:, :, 3] > 8
    if a.all() or not a.any():
        return rgba
    idx = ndi.distance_transform_edt(~a, return_distances=False, return_indices=True)
    out = rgba.copy()
    for c in range(3):
        out[:, :, c] = rgba[:, :, c][idx[0], idx[1]]
    return out


# ---- 切り抜き・アトラス詰め ---------------------------------------------
crops = {}
for name, L in layers.items():
    rgba = L['rgba']
    if L.get('standalone'):
        x0, y0 = 0, 0
        arr = rgba
    elif name == 'base':
        x0, y0 = 0, 0
        arr = rgba
    else:
        ys, xs = np.where(rgba[:, :, 3] > 1)
        x0, x1, y0, y1 = max(xs.min() - 1, 0), min(xs.max() + 2, S), max(ys.min() - 1, 0), min(ys.max() + 2, S)
        arr = rgba[y0:y1, x0:x1]
    arr = bleed(arr)
    crops[name] = dict(img=Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), 'RGBA'),
                       x=int(x0), y=int(y0), pivot=L['pivot'], z=L['z'])

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
frames = {}
for n, (px, py) in place.items():
    im = crops[n]['img']
    atlas.paste(im, (px, py))
    w, h = im.size
    frames[n] = {'frame': {'x': px, 'y': py, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                 'sourceSize': {'w': w, 'h': h}, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}}
OUT.mkdir(parents=True, exist_ok=True)
atlas.save(OUT / 'atlas.png', optimize=True)
(OUT / 'atlas.json').write_text(json.dumps({'frames': frames, 'meta': {'image': 'atlas.png', 'size': {'w': ATLAS_W, 'h': ATLAS_H}, 'scale': '1'}}, indent=1))
(OUT / 'rig.json').write_text(json.dumps({
    'source': 'idle-v12/frame_00.png', 'size': S,
    'parts': {n: {'x': c['x'], 'y': c['y'], 'w': c['img'].width, 'h': c['img'].height, 'z': c['z'],
                  'pivot': list(c['pivot']) if c['pivot'] else None} for n, c in crops.items()},
    'eyes': {k: {'c': list(v['c']), 'r': list(v['r'])} for k, v in EYES.items()},
}, indent=1))
print('atlas', atlas.size, {n: crops[n]['img'].size for n in crops})
