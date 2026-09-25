"""黒柴の形・毛色・スキニング重みを SDF（符号付き距離関数）で定義し、メッシュ化する。
blender 非依存（numpy + scikit-image）。出力：dog_mesh.npz
座標：犬は +X を向き、Z が上、Y が左右（+Y = 犬の左）。
"""
import numpy as np
from skimage import measure

# ---------------- プリミティブ ----------------
def seg(p, a, b, r1, r2):
    a = np.asarray(a, float); b = np.asarray(b, float)
    ba = b - a; pa = p - a
    t = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    q = pa - t[..., None] * ba
    return np.linalg.norm(q, axis=-1) - (r1 + (r2 - r1) * t)

def ell(p, c, r):
    q = (p - np.asarray(c, float)) / np.asarray(r, float)
    k0 = np.linalg.norm(q, axis=-1)
    k1 = np.linalg.norm(q / np.asarray(r, float), axis=-1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

def tri(p, a, b, c, th):
    """厚み th の丸い三角板（耳）"""
    a, b, c = (np.asarray(v, float) for v in (a, b, c))
    ba, pa, cb, pb, ac, pc = b - a, p - a, c - b, p - b, a - c, p - c
    nor = np.cross(ba, ac)
    def dot2(v): return np.sum(v * v, axis=-1)
    s = (np.sign(pa @ np.cross(ba, nor)) +
         np.sign(pb @ np.cross(cb, nor)) + np.sign(pc @ np.cross(ac, nor)))
    edge = np.minimum(np.minimum(
        dot2(ba * np.clip((pa @ ba) / (ba @ ba), 0, 1)[..., None] - pa),
        dot2(cb * np.clip((pb @ cb) / (cb @ cb), 0, 1)[..., None] - pb)),
        dot2(ac * np.clip((pc @ ac) / (ac @ ac), 0, 1)[..., None] - pc))
    face = (pa @ nor) ** 2 / (nor @ nor)
    return np.sqrt(np.where(s < 2, edge, face)) - th

def scaled(f, c, s):
    """部位 f を点 c 中心に s 倍する"""
    c = np.asarray(c, float)
    return lambda p: f(c + (p - c) / s) * s


def smin(a, b, k):
    if k <= 0: return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

# 頭部（頭・耳）は HEAD_C を中心に HEAD_S 倍して、かわいい頭身にする
HEAD_C, HEAD_S = (0.40, 0.0, 0.56), 1.14
def hs(v):
    """頭部の元座標 → 拡大後の座標"""
    c = np.asarray(HEAD_C, float)
    return tuple(float(x) for x in c + (np.asarray(v, float) - c) * HEAD_S)

# ---------------- 骨（name: head, tail, parent） ----------------
BONES = {
    'spine':  ((-0.02, 0, 0.37), (0.15, 0, 0.385), None),
    'chest':  ((0.15, 0, 0.385), (0.29, 0, 0.41), 'spine'),
    'neck':   ((0.29, 0, 0.44), (0.40, 0, 0.555), 'chest'),
    'head':   ((0.40, 0, 0.555), hs((0.54, 0, 0.60)), 'neck'),
    'tail0':  ((-0.07, 0, 0.43), (-0.10, 0, 0.51), 'spine'),
    'tail1':  ((-0.10, 0, 0.51), (-0.065, 0, 0.575), 'tail0'),
    'tail2':  ((-0.065, 0, 0.575), (0.0, 0, 0.575), 'tail1'),
    'tail3':  ((0.0, 0, 0.575), (0.03, 0.02, 0.51), 'tail2'),
}
for s, y in (('L', 1), ('R', -1)):
    BONES.update({
        f'ear.{s}':    (hs((0.425, 0.05 * y, 0.67)), hs((0.438, 0.082 * y, 0.768)), 'head'),
        f'fl.up.{s}':  ((0.27, 0.058 * y, 0.35), (0.285, 0.062 * y, 0.20), 'chest'),
        f'fl.lo.{s}':  ((0.285, 0.062 * y, 0.20), (0.285, 0.062 * y, 0.055), f'fl.up.{s}'),
        f'fl.paw.{s}': ((0.285, 0.062 * y, 0.055), (0.335, 0.062 * y, 0.02), f'fl.lo.{s}'),
        f'hl.up.{s}':  ((0.02, 0.068 * y, 0.35), (0.07, 0.074 * y, 0.21), 'spine'),
        f'hl.lo.{s}':  ((0.07, 0.074 * y, 0.21), (-0.005, 0.074 * y, 0.095), f'hl.up.{s}'),
        f'hl.paw.{s}': ((-0.005, 0.074 * y, 0.095), (0.035, 0.074 * y, 0.02), f'hl.lo.{s}'),
    })

# ---------------- 部位（SDF, 骨, 合成の滑らかさ k） ----------------
def parts():
    P = []
    def add(f, bone, k):
        if bone == 'head' or bone.startswith('ear'):
            f = scaled(f, HEAD_C, HEAD_S)
        P.append((f, bone, k))
    # 胴
    add(lambda p: seg(p, (-0.03, 0, 0.37), (0.15, 0, 0.375), 0.115, 0.12), 'spine', 0)
    add(lambda p: seg(p, (0.15, 0, 0.375), (0.27, 0, 0.395), 0.12, 0.13), 'chest', 0.04)
    add(lambda p: ell(p, (0.30, 0, 0.36), (0.09, 0.105, 0.12)), 'chest', 0.06)        # 胸の毛
    add(lambda p: ell(p, (0.02, 0, 0.34), (0.11, 0.105, 0.10)), 'spine', 0.04)        # 尻
    # 首・頭
    add(lambda p: seg(p, (0.28, 0, 0.43), (0.40, 0, 0.555), 0.115, 0.095), 'neck', 0.06)
    add(lambda p: ell(p, (0.435, 0, 0.615), (0.095, 0.098, 0.085)), 'head', 0.04)    # 頭蓋
    for y in (1, -1):
        add(lambda p, y=y: ell(p, (0.46, 0.05 * y, 0.575), (0.065, 0.052, 0.05)), 'head', 0.035)  # 頬
    add(lambda p: seg(p, (0.475, 0, 0.59), (0.55, 0, 0.575), 0.05, 0.032), 'head', 0.03)       # 口吻
    add(lambda p: ell(p, (0.51, 0, 0.555), (0.045, 0.035, 0.022)), 'head', 0.02)              # 下あご
    # 耳
    for s, y in (('L', 1), ('R', -1)):
        add(lambda p, y=y: tri(p, (0.395, 0.028 * y, 0.668), (0.462, 0.080 * y, 0.652), (0.438, 0.082 * y, 0.768), 0.016), f'ear.{s}', 0.02)
    # 尾（背中の上で巻く）
    add(lambda p: seg(p, (-0.07, 0, 0.43), (-0.10, 0, 0.51), 0.048, 0.055), 'tail0', 0.03)
    add(lambda p: seg(p, (-0.10, 0, 0.51), (-0.065, 0, 0.575), 0.055, 0.052), 'tail1', 0.03)
    add(lambda p: seg(p, (-0.065, 0, 0.575), (0.0, 0, 0.575), 0.052, 0.045), 'tail2', 0.03)
    add(lambda p: seg(p, (0.0, 0, 0.575), (0.03, 0.02, 0.51), 0.045, 0.03), 'tail3', 0.03)
    # 脚
    for s, y in (('L', 1), ('R', -1)):
        add(lambda p, y=y: seg(p, (0.27, 0.058 * y, 0.35), (0.285, 0.062 * y, 0.20), 0.055, 0.042), f'fl.up.{s}', 0.03)
        add(lambda p, y=y: seg(p, (0.285, 0.062 * y, 0.20), (0.285, 0.062 * y, 0.055), 0.04, 0.035), f'fl.lo.{s}', 0.01)
        add(lambda p, y=y: ell(p, (0.30, 0.062 * y, 0.03), (0.048, 0.04, 0.03)), f'fl.paw.{s}', 0.015)
        add(lambda p, y=y: ell(p, (0.035, 0.07 * y, 0.29), (0.09, 0.055, 0.11)), f'hl.up.{s}', 0.03)   # もも
        add(lambda p, y=y: seg(p, (0.07, 0.074 * y, 0.21), (-0.005, 0.074 * y, 0.095), 0.048, 0.035), f'hl.lo.{s}', 0.015)
        add(lambda p, y=y: seg(p, (-0.005, 0.074 * y, 0.095), (0.005, 0.074 * y, 0.04), 0.035, 0.034), f'hl.paw.{s}', 0.01)
        add(lambda p, y=y: ell(p, (0.015, 0.074 * y, 0.03), (0.048, 0.04, 0.03)), f'hl.paw.{s}', 0.015)
    return P

def field(p, P):
    d = None
    for f, _, k in P:
        v = f(p)
        d = v if d is None else smin(d, v, k)
    return d

# ---------------- 毛色：裏白度 w（0=黒, 0.5=赤茶, 1=白） ----------------
def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def whiteness(p, n):
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    nx, ny, nz = n[:, 0], n[:, 1], n[:, 2]
    w = np.zeros(len(p))
    # 腹・胸・喉（下向き面と前向きの胸）
    torso = (z > 0.18) & (x > -0.05) & (x < 0.44)
    w = np.maximum(w, torso * ss(0.05, 0.55, -nz) * ss(0.5, 0.36, z))
    chest = ss(0.22, 0.33, x) * ss(0.52, 0.40, z) * ss(-0.2, 0.5, nx) * (z > 0.2)
    w = np.maximum(w, chest)
    throat = ss(0.33, 0.43, x) * ss(0.60, 0.53, z) * ss(0.0, 0.5, nx - nz * 0.5)
    w = np.maximum(w, throat)
    # 頭部は拡大前の座標で判定する
    c = np.asarray(HEAD_C); ph = c + (p - c) / HEAD_S
    x, y, z = ph[:, 0], ph[:, 1], ph[:, 2]
    # 頬・口吻の下側
    head = x > 0.42
    cheek = head * ss(0.605, 0.565, z) * ss(0.43, 0.47, x)
    w = np.maximum(w, cheek)
    muzzle = ss(0.48, 0.5, x) * ss(0.60, 0.575, z + 0.15 * (x - 0.5))
    w = np.maximum(w, muzzle)
    # 脚：下は赤茶、内側とつま先は白
    legs = (z < 0.3)
    inner = ss(0.3, 0.9, -ny * np.sign(y + 1e-9))
    w = np.maximum(w, legs * (0.5 * ss(0.29, 0.14, z) + 0.45 * inner * ss(0.25, 0.12, z)))
    w = np.maximum(w, ss(0.05, 0.03, z) * 0.95)
    # 尾の内側（巻きの中心を向く面）
    tail = (x < 0.05) & (z > 0.45)
    cc = np.array([-0.04, 0.0, 0.50])
    tin = ss(0.2, 0.8, np.sum(n * (cc - p), axis=1) / np.maximum(np.linalg.norm(cc - p, axis=1), 1e-6))
    w = np.maximum(w, tail * tin * 0.9)
    # 耳の内側
    ear = (z > 0.66) & (x > 0.39) & (np.abs(y) > 0.025)
    w = np.maximum(w, ear * ss(0.45, 0.8, nx) * ss(0.78, 0.72, z) * 0.62)
    # 麻呂眉（赤茶の点）
    for s in (1, -1):
        e = np.linalg.norm((ph - np.array([0.505, 0.038 * s, 0.657])) / np.array([0.02, 0.015, 0.009]), axis=1)
        w = np.maximum(w, 0.55 * ss(1.0, 0.6, e) * (nx > 0))
    return np.clip(w, 0, 1)

def furlen(p, W, names):
    """毛の長さ（0-1）：尾・首まわり・胸・頬は長く、顔・脚先は短い"""
    g = {n: W[:, i] for i, n in enumerate(names)}
    tail = sum(g[f'tail{i}'] for i in range(4))
    legs = sum(v for n, v in g.items() if n[:2] in ('fl', 'hl') and ('lo' in n or 'paw' in n))
    ears = g['ear.L'] + g['ear.R']
    x, z = p[:, 0], p[:, 2]
    face = g['head'] * ss(0.49, 0.56, x)
    cheek = g['head'] * ss(0.6, 0.56, z) * ss(0.52, 0.46, x)
    L = 0.6 + 0.4 * tail + 0.25 * g['neck'] + 0.15 * cheek - 0.35 * legs - 0.3 * face - 0.25 * ears
    return np.clip(L, 0.3, 1.0)

def build(res=0.0028):
    P = parts()
    lo = np.array([-0.2, -0.16, -0.01]); hi = np.array([0.62, 0.16, 0.84])
    shape = np.ceil((hi - lo) / res).astype(int) + 1
    gx, gy, gz = (np.linspace(lo[i], lo[i] + res * (shape[i] - 1), shape[i]) for i in range(3))
    vol = np.empty(shape, np.float32)
    for i, x in enumerate(gx):
        Y, Z = np.meshgrid(gy, gz, indexing='ij')
        pts = np.stack([np.full(Y.shape, x), Y, Z], -1).reshape(-1, 3)
        vol[i] = field(pts, P).reshape(Y.shape)
    verts, faces, normals, _ = measure.marching_cubes(vol, 0.0, spacing=(res, res, res))
    verts += lo
    # marching_cubes の法線は勾配方向（外向きにそろえる）
    normals = -normals if np.mean(np.sum(normals * (verts - verts.mean(0)), 1)) < 0 else normals
    # スキニング重み：各部位の距離から
    names = list(BONES)
    W = np.zeros((len(verts), len(names)), np.float32)
    for f, bone, _ in P:
        d = np.maximum(f(verts), 0)
        W[:, names.index(bone)] = np.maximum(W[:, names.index(bone)], np.exp(-d / 0.012))
    W /= W.sum(1, keepdims=True)
    W[W < 0.02] = 0
    W /= W.sum(1, keepdims=True)
    col = whiteness(verts, normals)
    fl = furlen(verts, W, names)
    return verts.astype(np.float32), faces.astype(np.int32), normals.astype(np.float32), W, names, col.astype(np.float32), fl.astype(np.float32)

if __name__ == '__main__':
    import sys, time
    t = time.time()
    v, f, n, W, names, col, fl = build(float(sys.argv[1]) if len(sys.argv) > 1 else 0.0028)
    np.savez_compressed('dog_mesh.npz', verts=v, faces=f, normals=n, weights=W, names=np.array(names), white=col, furlen=fl)
    print(len(v), 'verts', len(f), 'faces', f'{time.time() - t:.1f}s')
