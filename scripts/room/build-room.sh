#!/bin/sh
# 部屋の背景を作り直す：SVG → PNG(Chromium) → WebP。出力：public/assets/room/room-{morning,noon,evening,night}.webp
set -e
cd "$(dirname "$0")/../.."
T="${TMPDIR:-/tmp}/room-build"
rm -rf "$T"; mkdir -p "$T/svg" "$T/png"
${PYTHON:-python3} scripts/room/make_room.py "$T/svg"
node scripts/room/render-room.mjs "$T/svg" "$T/png" 2
${PYTHON:-python3} - "$T/png" public/assets/room <<'PY'
import sys
from pathlib import Path
from PIL import Image
src, dst = Path(sys.argv[1]), Path(sys.argv[2]); dst.mkdir(parents=True, exist_ok=True)
for p in sorted(src.glob('*.png')):
    Image.open(p).convert('RGB').save(dst / (p.stem + '.webp'), 'WEBP', quality=86, method=6)
    print(p.stem, (dst / (p.stem + '.webp')).stat().st_size // 1024, 'KB')
PY
