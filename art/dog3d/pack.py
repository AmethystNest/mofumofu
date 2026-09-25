"""レンダーした連番PNGを、状態ごとのWebPアトラスと manifest.json にまとめる。
使い方: python pack.py FRAMES_DIR OUT_DIR [--fps 12] [--quality 82]
"""
import sys, os, json, math, argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--fps', type=int, default=12); ap.add_argument('--quality', type=int, default=82)
a = ap.parse_args()
STATES = ['idle', 'petted', 'eat', 'sleep', 'sad']
frames = {s: [Image.open(os.path.join(a.src, s, f)).convert('RGBA') for f in sorted(os.listdir(os.path.join(a.src, s)))] for s in STATES}

def bbox(im):
    al = np.asarray(im)[:, :, 3] > 8
    ys, xs = np.nonzero(al)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

# 全コマ共通の切り抜き範囲
bb = np.array([bbox(im) for fs in frames.values() for im in fs])
x0, y0, x1, y1 = bb[:, 0].min() - 4, bb[:, 1].min() - 4, bb[:, 2].max() + 4, bb[:, 3].max() + 4
fw, fh = int(x1 - x0), int(y1 - y0)
i0 = bbox(frames['idle'][0])
anchor = [float((i0[0] + i0[2]) / 2 - x0), float(i0[3] - y0)]
os.makedirs(a.out, exist_ok=True)
man = {'fps': a.fps, 'frameW': fw, 'frameH': fh, 'anchor': anchor, 'dogWidth': float(i0[2] - i0[0]), 'states': {}}
for s, fs in frames.items():
    cols = max(1, min(len(fs), 4096 // fw))
    rows = math.ceil(len(fs) / cols)
    atlas = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, im in enumerate(fs):
        atlas.paste(im.crop((x0, y0, x1, y1)), ((i % cols) * fw, (i // cols) * fh))
    path = os.path.join(a.out, f'{s}.webp')
    atlas.save(path, 'WEBP', quality=a.quality, method=6)
    man['states'][s] = {'file': f'{s}.webp', 'frames': len(fs), 'cols': cols, 'bytes': os.path.getsize(path)}
    print(s, len(fs), atlas.size, os.path.getsize(path) // 1024, 'KB')
json.dump(man, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
print('frame', fw, fh)
