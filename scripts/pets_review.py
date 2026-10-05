"""各キャラの全動作を、並べて確認する一覧画像を作る（確認用）。使い方: python scripts/pets_review.py <出力先ディレクトリ>"""
import sys, json
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from pets_lib import *
P = Path(sys.argv[1]); P.mkdir(parents=True, exist_ok=True)
SRC = Path(sys.argv[2])
for sp in ('Cat', 'Dog'):
    pack = SRC / f'PetGame_{sp}_Phaser_Pack'; m = json.load(open(pack / 'animations.json'))
    for ch in [c for c in m['characters'] if c.startswith(sp.lower())]:
        out, notes, used, allf = repaired(pack, ch, m)
        for n in used:
            out.setdefault(n, out.get('eat/03', next(iter(out.values()))))
        alpha = np.maximum.reduce([a[:, :, 3] for a in out.values()])
        ys, xs = np.where(alpha > 20); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        T = 150; sc = T / max(x1 - x0, y1 - y0)
        acts = m['characters'][ch]['actions']; cols = max(len(s) for s in acts.values())
        sheet = Image.new('RGB', (cols * T, len(acts) * T), (242, 236, 222))
        for r, (act, seq) in enumerate(acts.items()):
            for c, f in enumerate(seq):
                im = Image.fromarray(out[f['frame']][y0:y1, x0:x1]); im = im.resize((int((x1 - x0) * sc), int((y1 - y0) * sc)), Image.LANCZOS)
                sheet.paste(im, (c * T, r * T + (T - im.height)), im)
        sheet.save(P / f'{ch}.png'); print(ch, sheet.size, (x0, x1, y0, y1), list(acts))
