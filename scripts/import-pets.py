"""
ユーザー提供の PetGame_{Cat,Dog}_Phaser_Pack（6体 × 8動作のコマ画像）を取り込み、ゲーム用の素材に整える。
元の絵の画素は変えない（欠けた絵の復元と、WebP への変換のみ）。

- 読み込み：切れた PNG（cat_adult/page-0 ほか）でも、読める行までは使う
- 復元：左右の歩きは反対側の反転（厳密一致を検査）。反転で作れない絵（cat_adult の eat/00・eat/01）は、
  近い姿勢の eat/03 で置き換える（再アップロードがあれば差し替え可能）
- 出力：public/assets/pets/<キャラ>/page-N.webp ＋ page-N.json（Phaser のアトラス形式）と public/assets/pets/pets.json
  使うコマだけを詰め直す。WebP は質 96・アルファ無劣化
使い方：python scripts/import-pets.py <猫パックのフォルダ> <犬パックのフォルダ>
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from pets_lib import *

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/pets'
PAGE = 2048
PADDING = 4
SUBSTITUTE = {('cat_adult', 'eat/00'): 'eat/03', ('cat_adult', 'eat/01'): 'eat/03'}


def pack_page(items):
    """棚詰め。items: [(name, rgba trimmed array)] → ページ画像と、各コマの位置"""
    pages, cur, x, y, row = [], [], PADDING, PADDING, 0
    for it in sorted(items, key=lambda i: -i[1].shape[0]):
        h, w = it[1].shape[:2]
        if x + w + PADDING > PAGE: x, y, row = PADDING, y + row + PADDING, 0
        if y + h + PADDING > PAGE: pages.append(cur); cur, x, y, row = [], PADDING, PADDING, 0
        cur.append((it[0], it[1], x, y)); x += w + PADDING; row = max(row, h)
    pages.append(cur)
    return pages


def main():
    manifest_out = {'frameSize': [S, S], 'origin': [0.5, 690 / 768], 'characters': {}, 'repairs': {}}
    for pack_dir in sys.argv[1:3]:
        pack = Path(pack_dir); m = json.load(open(pack / 'animations.json'))
        for ch, spec in m['characters'].items():
            if not (pack / 'assets' / ch).exists(): continue
            out, notes, used, _ = repaired(pack, ch, m)
            for (c, n), src in SUBSTITUTE.items():
                if c == ch and n not in out:
                    out[n] = out[src]; notes.append(f'{n}: 元の絵が読めないため {src} で置き換え')
            missing = [n for n in used if n not in out]
            assert not missing, (ch, missing)
            # 切り詰めて詰める
            items, offs = [], {}
            for name in used:
                a = out[name]; ys, xs = np.where(a[:, :, 3] > 0)
                x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
                items.append((name, a[y0:y1, x0:x1])); offs[name] = (int(x0), int(y0))
            odir = OUT / ch; odir.mkdir(parents=True, exist_ok=True)
            for old in odir.glob('*'): old.unlink()
            where = {}
            for pi, page in enumerate(pack_page(items)):
                img = Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0)); frames = {}
                for name, a, x, y in page:
                    img.paste(Image.fromarray(a), (x, y)); h, w = a.shape[:2]
                    frames[name] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'rotated': False, 'trimmed': True,
                                    'spriteSourceSize': {'x': offs[name][0], 'y': offs[name][1], 'w': w, 'h': h}, 'sourceSize': {'w': S, 'h': S}}
                    where[name] = pi
                # 使っている高さまでに切り詰める（容量）
                used_h = max(f['frame']['y'] + f['frame']['h'] for f in frames.values()) + PADDING
                hh = 1
                while hh < used_h: hh *= 2
                img = img.crop((0, 0, PAGE, min(PAGE, hh)))
                img.save(odir / f'page-{pi}.webp', 'WEBP', quality=96, alpha_quality=100, method=6)
                json.dump({'frames': frames, 'meta': {'image': f'page-{pi}.webp', 'size': {'w': PAGE, 'h': img.height}, 'scale': '1'}}, open(odir / f'page-{pi}.json', 'w'))
            Image.fromarray(out['idle/00']).save(odir / 'still.webp', 'WEBP', quality=96, alpha_quality=100, method=6)   # 読み込み前・代替表示用の静止画
            actions = {}
            for act, seq in spec['actions'].items():
                actions[act] = [{'frame': f['frame'] if (ch, f['frame']) not in SUBSTITUTE else SUBSTITUTE[(ch, f['frame'])], 'durationMs': f['durationMs']} for f in seq]
                for f in actions[act]: f['page'] = where[f['frame']]
            manifest_out['characters'][ch] = {'pages': len(set(where.values())), 'actions': actions}
            manifest_out['repairs'][ch] = notes
            print(ch, 'pages', len(set(where.values())), 'notes', len(notes))
    (OUT / 'pets.json').write_text(json.dumps(manifest_out, ensure_ascii=False))


main()
