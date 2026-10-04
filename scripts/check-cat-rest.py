"""猫のパーツを安静姿勢で重ねた絵が、元の cat.png と一致するかを検査する。使い方：python scripts/check-cat-rest.py [出力PNG] [追加で重ねるパーツ名,...]"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / 'public/assets/pet/cat/rig'
atlas = Image.open(D / 'atlas.png').convert('RGBA')
frames = json.loads((D / 'atlas.json').read_text())['frames']
rig = json.loads((D / 'rig.json').read_text())
orig = Image.open(ROOT / 'public/assets/pet/cat/cat.png').convert('RGBA')

def part(n):
    f = frames[n]['frame']
    return atlas.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), rig['parts'][n]

def compose(extra=None):
    out = Image.new('RGBA', orig.size, (0, 0, 0, 0))
    for n in ['tail', 'base', 'earL', 'earR', 'eyeOpenL', 'eyeOpenR'] + (extra or []):
        im, p = part(n)
        out.alpha_composite(im, (p['x'], p['y']))
    return out

if __name__ == '__main__':
    out = compose(sys.argv[3].split(',') if len(sys.argv) > 3 else None)
    a, b = np.array(out).astype(float), np.array(orig).astype(float)
    wa = np.maximum(a[:, :, 3], b[:, :, 3])[:, :, None] / 255
    diff = (np.abs(a - b)[:, :, :3] * wa).max(2)
    da = np.abs(a[:, :, 3] - b[:, :, 3])
    print('色差 最大', diff.max().round(1), '平均', diff.mean().round(4), '／ 透明度差 最大', da.max().round(1), '6以上の画素数', int((da > 6).sum()), int((diff > 12).sum()))
    ys, xs = np.where((da > 12) | (diff > 20))
    if len(xs): print('差の多い範囲', xs.min(), xs.max(), ys.min(), ys.max(), len(xs))
    if len(sys.argv) > 1:
        bg = Image.new('RGBA', orig.size, (230, 215, 200, 255)); bg.alpha_composite(out)
        bg.convert('RGB').save(sys.argv[1])
