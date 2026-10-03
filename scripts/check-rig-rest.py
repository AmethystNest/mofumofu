"""パーツを安静姿勢で重ねた絵が、元の frame_00.png と一致するかを検査する。使い方：python scripts/check-rig-rest.py [出力PNG]"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / 'public/assets/dog/rig-v1'
atlas = Image.open(D / 'atlas.png').convert('RGBA')
frames = json.loads((D / 'atlas.json').read_text())['frames']
rig = json.loads((D / 'rig.json').read_text())
orig = Image.open(ROOT / 'public/assets/dog/idle-v12/frame_00.png').convert('RGBA')

def part(n):
    f = frames[n]['frame']
    return atlas.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), rig['parts'][n]

def compose(extra=None):
    out = Image.new('RGBA', (320, 320), (0, 0, 0, 0))
    order = ['tail', 'base', 'pawL', 'pawR', 'earL', 'earR', 'cheekL', 'cheekR', 'irisL', 'irisR', 'ringL', 'ringR']
    for n in order:
        im, p = part(n)
        out.alpha_composite(im, (p['x'], p['y']))
    return out

if __name__ == '__main__':
    out = compose()
    a, b = np.array(out).astype(float), np.array(orig).astype(float)
    # 不透明度で重みを付けた色差（透明部分の色は無視）
    wa = np.maximum(a[:, :, 3], b[:, :, 3])[:, :, None] / 255
    diff = (np.abs(a - b)[:, :, :3] * wa).max(2)
    da = np.abs(a[:, :, 3] - b[:, :, 3])
    print('色差 最大', diff.max().round(1), '平均', diff.mean().round(4), '／ 透明度差 最大', da.max().round(1), '3以上の画素数', int((da > 3).sum()), int((diff > 6).sum()))
    ys, xs = np.where((da > 6) | (diff > 10))
    if len(xs): print('差の多い範囲', xs.min(), xs.max(), ys.min(), ys.max())
    if len(sys.argv) > 1:
        bg = Image.new('RGBA', (320, 320), (205, 215, 205, 255)); bg.alpha_composite(out)
        bg.convert('RGB').resize((960, 960), Image.NEAREST).save(sys.argv[1])
