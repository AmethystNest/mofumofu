"""
猫の絵（public/assets/pet/cat/cat.png）を、動かせるパーツに切り分ける。元のPNGは変更しない。
出力：public/assets/pet/cat/rig/{atlas.png, atlas.json, rig.json}

方針は犬のとき（scripts/cut-rig.py）と同じ。
- 耳（左右）としっぽは、付け根を動かさず先がしなる変形（Phaser の Rope）で動かす。切り口が動かないので継ぎ目が出ない。
- 目は「目まわりのシール」。開き目は元の絵。半目・閉じ目（‿）・笑い目（^）は、元の線の太さ・色に合わせて
  コードで描いた線と、目のまわりの毛の色で作る（画像生成AIは使わない）。
- 安静時にパーツを重ねると元の絵に戻る（scripts/check-cat-rest.py）。

使い方：python scripts/cut-cat.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'public/assets/pet/cat/cat.png'
OUT = ROOT / 'public/assets/pet/cat/rig'
orig = np.array(Image.open(SRC).convert('RGBA')).astype(np.float64)
H, W = orig.shape[:2]
rgb, alpha = orig[:, :, :3], orig[:, :, 3] / 255.0
lum = rgb.mean(2)
YY, XX = np.mgrid[0:H, 0:W].astype(np.float64)
BAND = 8                    # 切り口で重ねる幅（この絵は線が太いので犬より広く）
INK = (42, 24, 16)          # 輪郭線の色


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def region(box, ext=(0, 0, 0, 0)):
    x0, x1, y0, y1 = box
    l, r, t, b = ext
    return (XX >= x0 - l) & (XX < x1 + r) & (YY >= y0 - t) & (YY < y1 + b)


# ---- しなるパーツ ---------------------------------------------------------------
ROPES = {
    'earL': dict(axis='v', root='bottom', box=(70, 340, 0, 232), overlap=(0, BAND, 0, BAND)),
    'earR': dict(axis='v', root='bottom', box=(496, 731, 0, 232), overlap=(BAND, 0, 0, BAND)),
    # しっぽ：x=222 より左。頭の下の線（斜めの境 y < 0.9(x-135)+410）は含めない
    'tail': dict(axis='h', root='right', box=(0, 222, 400, 650), overlap=(0, BAND, 0, 0), behind=True,
                 exclude=lambda extra=0: (XX >= 130) & (YY < (XX - 135) * 0.9 + 410)),
}
base = orig.copy()
layers, meta = {}, {}
for name, p in ROPES.items():
    x0, x1, y0, y1 = p['box']
    part_m = region(p['box'], p['overlap'])
    ex = p.get('exclude')
    erase = region(p['box'])
    if ex is not None:
        part_m &= ~ex()
        erase &= ~ex()
    if p.get('behind'):
        erase &= XX < x1 - BAND            # しっぽ：ベースが手前なので、付け根の帯の分はベースに残す
    part = orig.copy()
    part[:, :, 3] = orig[:, :, 3] * part_m
    base[:, :, 3] *= (1 - erase.astype(np.float64))
    ys, xs = np.where(part[:, :, 3] > 1)
    ax0, ax1, ay0, ay1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    if p['axis'] == 'v':
        cx0, cx1, cy0, cy1 = ax0, ax1, y0, y1 + BAND
    else:
        cx0, cx1, cy0, cy1 = ax0, x1 + BAND, ay0, ay1
    layers[name] = dict(rgba=part[cy0:cy1, cx0:cx1], x=int(cx0), y=int(cy0))
    meta[name] = dict(kind='rope', axis=p['axis'], root=p['root'], behind=bool(p.get('behind')))

# ---- 目（シール） ----------------------------------------------------------------
EYES = {'L': (303, 330), 'R': (545, 330)}       # 黒目の中心あたり（成分の探索の起点）
dark = lum < 70
white = (rgb.min(2) > 225) & ((rgb[:, :, 0] - rgb[:, :, 2]) < 14)
eye_report = {}
for side, (sx, sy) in EYES.items():
    box = np.zeros((H, W), bool)
    box[sy - 95:sy + 80, sx - 95:sx + 95] = True
    lab, _ = ndi.label((dark | white) & box & (alpha > .5))
    comp = lab == lab[sy, sx]
    comp = ndi.binary_fill_holes(comp)
    ys, xs = np.where(comp)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    ew, eh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    eye_report[side] = (int(round(cx)), int(round(cy)), int(ew), int(eh))
    dist = ndi.distance_transform_edt(~comp)           # 目の外側への距離
    HOLE, FEATHER = 3, 10
    k = smooth((HOLE + FEATHER - dist) / FEATHER)      # 目のまわり 13px までは1、外へ向けて0
    hole = dist <= HOLE
    ring = (dist > HOLE + 3) & (dist < HOLE + 18)
    # まわりの毛・クリームの色だけを使う（輪郭線・白目・黒目・ほほの桃色は除く）
    fur = (rgb[:, :, 2] >= rgb[:, :, 0] - 4) & (lum > 150)
    cream = (lum > 225) & ((rgb[:, :, 0] - rgb[:, :, 2]) > 14) & ((rgb[:, :, 0] - rgb[:, :, 2]) < 50) & (rgb[:, :, 1] > 215)
    known = ring & fur & (alpha > .9)
    # なだらかな補間（最も近い色にすると放射状のすじが出る）
    wgt = ndi.gaussian_filter(known.astype(np.float64), 22) + 1e-9
    fill = np.stack([ndi.gaussian_filter(np.where(known, rgb[:, :, c], 0.0), 22) / wgt for c in range(3)], 2)
    for c in range(3):
        base[:, :, c] = np.where(hole, fill[:, :, c], base[:, :, c])
    base[:, :, 3] = np.where(hole, 255, base[:, :, 3])

    def sticker(rgba_rgb, a):
        part = np.zeros((H, W, 4))
        part[:, :, :3] = rgba_rgb
        part[:, :, 3] = a * k
        return part

    def arc_mask(kind):
        """‿（閉じ目）か ^（笑い目）の線。線の太さは元の輪郭に合わせる"""
        S = 4
        im = Image.new('L', (W * S, H * S), 0)
        d = ImageDraw.Draw(im)
        half = ew * .36
        n = 48
        pts = []
        for i in range(n + 1):
            t = i / n * 2 - 1
            bow = 1 - t * t
            y = cy + (-6 + 30 * bow if kind == 'closed' else 12 - 30 * bow)
            pts.append(((cx + t * half) * S, y * S))
        d.line(pts, fill=255, width=int(13 * S), joint='curve')
        for (px, py) in (pts[0], pts[-1]):
            d.ellipse([px - 6.5 * S, py - 6.5 * S, px + 6.5 * S, py + 6.5 * S], fill=255)
        return np.array(im.resize((W, H), Image.BOX)).astype(np.float64) / 255.0

    # 開き目：元の絵
    open_ = sticker(rgb, orig[:, :, 3])
    # 半目：上のまぶた（毛の色）を下ろし、縁に線を引く
    lid_y = cy - eh * .08 + 22 * (1 - ((XX - cx) / (ew * .55)) ** 2).clip(0, 1)
    lid = (YY < lid_y) & (dist <= HOLE + 6) & (comp | hole)
    half_rgb = rgb.copy()
    for c in range(3):
        half_rgb[:, :, c] = np.where(lid, fill[:, :, c], rgb[:, :, c])
    line = ((np.abs(YY - lid_y) < 6.5) & (np.abs(XX - cx) < ew * .5) & (dist <= HOLE + 6)).astype(np.float64)
    line = ndi.gaussian_filter(line, .8)
    for c in range(3):
        half_rgb[:, :, c] = half_rgb[:, :, c] * (1 - line) + INK[c] * line
    half_part = sticker(half_rgb, np.ones((H, W)) * 255)
    # 閉じ目・笑い目：目を毛の色で埋め、線だけ描く
    # 閉じ目・笑い目は「シール全体を毛の色で塗り、その上に線」にして、開き目のシールを隠す
    def closed_sticker(kind):
        part = np.zeros((H, W, 4))
        m = arc_mask(kind) * (dist <= HOLE + 8)
        for c in range(3):
            body = np.where(hole, fill[:, :, c], rgb[:, :, c])       # 穴の外は元の画素（口元・ほほの桃色を壊さない）
            part[:, :, c] = body * (1 - m) + INK[c] * m
        part[:, :, 3] = 255 * k
        return part
    stickers = {'Open': open_, 'Half': half_part, 'Closed': closed_sticker('closed'), 'Happy': closed_sticker('happy')}
    ys2, xs2 = np.where(k > 0.002)
    bx0, bx1, by0, by1 = xs2.min(), xs2.max() + 1, ys2.min(), ys2.max() + 1
    for st, arr in stickers.items():
        layers[f'eye{st}{side}'] = dict(rgba=arr[by0:by1, bx0:bx1], x=int(bx0), y=int(by0))
        meta[f'eye{st}{side}'] = dict(kind='eye', center=[float(cx), float(cy)])

layers['base'] = dict(rgba=base, x=0, y=0)
meta['base'] = dict(kind='base')


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
    crops[name] = dict(img=Image.fromarray(np.clip(bleed(L['rgba']) + .5, 0, 255).astype(np.uint8), 'RGBA'), x=L['x'], y=L['y'])
PAD = 2
order = sorted(crops, key=lambda n: -crops[n]['img'].height)
AW = 2048
x = y = row_h = 0
place = {}
for n in order:
    w, h = crops[n]['img'].size
    if x + w + PAD > AW:
        x, y, row_h = 0, y + row_h + PAD, 0
    place[n] = (x, y)
    x += w + PAD
    row_h = max(row_h, h)
AH = 1
while AH < y + row_h + PAD:
    AH *= 2
atlas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
fr = {}
for n, (px, py) in place.items():
    im = crops[n]['img']
    atlas.paste(im, (px, py))
    w, h = im.size
    fr[n] = {'frame': {'x': px, 'y': py, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
             'sourceSize': {'w': w, 'h': h}, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}}
OUT.mkdir(parents=True, exist_ok=True)
atlas.save(OUT / 'atlas.png', optimize=True)
(OUT / 'atlas.json').write_text(json.dumps({'frames': fr, 'meta': {'image': 'atlas.png', 'size': {'w': AW, 'h': AH}, 'scale': '1'}}, indent=1))
(OUT / 'rig.json').write_text(json.dumps({
    'source': 'cat.png', 'width': W, 'height': H, 'band': BAND,
    'parts': {n: {'x': c['x'], 'y': c['y'], 'w': c['img'].width, 'h': c['img'].height, **meta[n]} for n, c in crops.items()},
    'eyes': {k: {'c': [v[0], v[1]], 'size': [v[2], v[3]]} for k, v in eye_report.items()},
}, indent=1))
print('atlas', atlas.size, {n: crops[n]['img'].size for n in crops})
print('eyes (cx, cy, w, h)', eye_report)
