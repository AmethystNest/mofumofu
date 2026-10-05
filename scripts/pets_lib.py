"""ユーザー提供の PetGame_{Cat,Dog}_Phaser_Pack（768×768 コマのアトラス）を読むための共通処理。"""
import json, struct, zlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True
S = 768


def decodable_rows(path):
    """PNG の IDAT を途中まで解凍して、欠けずに読める行数を返す（途中で切れた PNG の検出用）"""
    d = Path(path).read_bytes(); pos = 8; idat = b''; w = ct = None
    while pos + 8 <= len(d):
        ln, typ = struct.unpack('>I4s', d[pos:pos + 8]); body = d[pos + 8:pos + 8 + ln]
        if typ == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', body[:10])
        if typ == b'IDAT': idat += body
        pos += 12 + ln
    out = zlib.decompressobj().decompress(idat)
    return len(out) // (1 + w * (4 if ct == 6 else 3))


def load_frames(pack: Path, char: str, manifest):
    """名前 → (RGBA 768×768 の配列, 状態 'ok'|'partial'|'lost')"""
    spec = manifest['characters'][char]
    frames = {}
    for pg in range(spec['pages']):
        base = pack / 'assets' / char / f'page-{pg}'
        rows = decodable_rows(f'{base}.png')
        im = np.array(Image.open(f'{base}.png').convert('RGBA'))
        for name, f in json.load(open(f'{base}.json'))['frames'].items():
            fr, off = f['frame'], f['spriteSourceSize']
            canvas = np.zeros((S, S, 4), np.uint8)
            canvas[off['y']:off['y'] + off['h'], off['x']:off['x'] + off['w']] = im[fr['y']:fr['y'] + fr['h'], fr['x']:fr['x'] + fr['w']]
            end = fr['y'] + fr['h']
            frames[name] = (canvas, 'ok' if end <= rows else ('partial' if fr['y'] < rows else 'lost'), pg)
    return frames


def mirror(a):
    return a[:, ::-1].copy()


def repaired(pack: Path, char: str, manifest):
    """読める絵だけを使い、欠けた絵を直した { 名前: RGBA } と、直した内容の一覧を返す。
    - 左向きの歩きは右向きを左右反転した絵（素材の説明どおり厳密に一致することを確認済み）なので、欠けた側は反対側から作る
    - 反転でも作れない絵は、近い姿勢の絵で置き換える（elif の一覧に記録）"""
    spec = manifest['characters'][char]
    used = {}
    for seq in spec['actions'].values():
        for f in seq: used[f['frame']] = f['page']
    all_frames = load_frames(pack, char, manifest)
    out, notes = {}, []
    for name in used:
        a, st, _ = all_frames[name]
        if st == 'ok': out[name] = a
    for name in used:
        if name in out: continue
        act, i = name.split('/')
        twin = {'walk_right': 'walk_left', 'walk_left': 'walk_right'}.get(act)
        src = f'{twin}/{i}' if twin else None
        if src and src in all_frames and all_frames[src][1] == 'ok':
            out[name] = mirror(all_frames[src][0]); notes.append(f'{name}: {src} を左右反転して復元（厳密）')
    return out, notes, used, all_frames
