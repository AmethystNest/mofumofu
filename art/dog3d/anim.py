"""5状態のアニメーション（骨のキーフレーム）。角度は世界座標の軸で指定する。
X=前, Y=犬の左, Z=上。Y軸+回転 = 前を下げる（うなずく）、Z軸-回転 = カメラ側（犬の右）を向く。
"""
import math
import bpy
from mathutils import Quaternion, Vector, Matrix

FPS = 24
AX = {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}

def world_rot(rig, bone, **deg):
    """世界軸まわりの回転（度）を、骨のレスト座標系でのクォータニオンに変換する"""
    q = Quaternion()
    for a in ('z', 'y', 'x'):
        if a in deg and deg[a]:
            q = Quaternion(AX[a], math.radians(deg[a])) @ q
    m = rig.data.bones[bone].matrix_local.to_3x3()
    return (m.inverted() @ q.to_matrix() @ m).to_quaternion()

class Pose:
    """1フレーム分の姿勢：{bone: dict(x=,y=,z=, loc=(..), s=scale)}"""
    def __init__(self):
        self.b = {}
    def rot(self, bone, **deg):
        d = self.b.setdefault(bone, {})
        for k, v in deg.items():
            d[k] = d.get(k, 0) + v
        return self
    def loc(self, bone, v):
        self.b.setdefault(bone, {})['loc'] = Vector(v); return self
    def scale(self, bone, s):
        self.b.setdefault(bone, {})['s'] = s; return self

def apply(rig, pose, frame):
    for pb in rig.pose.bones:
        d = pose.b.get(pb.name, {})
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = world_rot(rig, pb.name, **{k: d[k] for k in 'xyz' if k in d})
        if 'loc' in d:   # 世界座標の移動 → 骨のローカル
            m = rig.data.bones[pb.name].matrix_local.to_3x3()
            pb.location = m.inverted() @ d['loc']
        else:
            pb.location = (0, 0, 0)
        s = d.get('s', 1.0)
        pb.scale = (s if isinstance(s, tuple) else (s, s, s))
        for path in ('rotation_quaternion', 'location', 'scale'):
            pb.keyframe_insert(path, frame=frame)

def s(t, period, phase=0.0):
    return math.sin(2 * math.pi * (t / period + phase))

def blink(t, at, dur=4):
    """t が at から dur フレームの間だけ目を閉じる（0..1）"""
    u = (t - at) / dur
    return max(0.0, 1 - abs(u * 2 - 1)) if 0 <= u <= 1 else 0.0

def eyes(p, openness):
    p.scale('eye.L', (1, max(openness, 0.08), 1)); p.scale('eye.R', (1, max(openness, 0.08), 1))
    # 目の骨のローカル Y は前向きなので、縦方向はローカル Z。scale は (x, y, z) の順
    p.b['eye.L']['s'] = (1, 1, max(openness, 0.08)); p.b['eye.R']['s'] = (1, 1, max(openness, 0.08))

# ---------------- 状態 ----------------
def idle(t, n):
    p = Pose()
    br = s(t, n / 2)                                   # 呼吸（1ループに2回）
    p.rot('spine', y=0.6 * br).rot('chest', y=-0.8 * br)
    look = 0.5 - 0.5 * math.cos(2 * math.pi * t / n)   # ゆっくりカメラを見る
    p.rot('neck', y=-3 + 2 * br, z=-6 * look).rot('head', z=-10 * look, x=-6 * look)
    for i, a in enumerate((5, 4, 3, 2)):
        p.rot(f'tail{i}', z=a * s(t, n / 4, -0.12 * i))
    tw = max(0, s(t, n, 0.3)) ** 8
    p.rot('ear.L', y=-10 * tw).rot('ear.R', y=-4 * tw)
    eyes(p, 1 - blink(t, int(n * 0.72)))
    return p

def petted(t, n):
    p = Pose()
    w = s(t, 6)                                          # 速い尻尾振り
    p.rot('spine', z=2.5 * w).rot('chest', z=-2 * w)
    p.rot('neck', y=-10, z=-8).rot('head', y=-14 + 2 * s(t, n / 2), x=-12, z=-10)
    for i, a in enumerate((16, 12, 9, 6)):
        p.rot(f'tail{i}', z=a * s(t, 6, -0.1 * i))
    p.rot('ear.L', y=-28, x=-8).rot('ear.R', y=-28, x=8)
    eyes(p, 0.18)
    return p

def eat(t, n):
    p = Pose()
    m = s(t, 8)                                          # もぐもぐ
    p.rot('chest', y=6).rot('neck', y=48 + 2 * m).rot('head', y=30 + 5 * max(m, 0))
    p.rot('fl.up.L', y=-8).rot('fl.up.R', y=-8).rot('fl.lo.L', y=10).rot('fl.lo.R', y=10)
    for i, a in enumerate((8, 6, 4, 3)):
        p.rot(f'tail{i}', z=a * s(t, n / 3, -0.1 * i))
    p.rot('ear.L', y=-35).rot('ear.R', y=-35)
    eyes(p, 0.75 - 0.6 * blink(t, int(n * 0.4), 6))
    return p

def sleep(t, n):
    p = Pose()
    br = s(t, n / 1.5)
    # 伏せ：体を下げ、前脚を前へ、後脚をたたむ、頭を前脚にのせる
    p.loc('spine', (0.0, 0, -0.205 + 0.003 * br))
    p.rot('spine', y=4 + 0.8 * br).rot('chest', y=-6 - 0.8 * br)
    for sd in ('L', 'R'):
        p.rot(f'fl.up.{sd}', y=-78).rot(f'fl.lo.{sd}', y=-6).rot(f'fl.paw.{sd}', y=10)
        p.rot(f'hl.up.{sd}', y=-62).rot(f'hl.lo.{sd}', y=100).rot(f'hl.paw.{sd}', y=-30)
    p.rot('neck', y=32).rot('head', y=2, z=-14, x=6)
    for i, a in enumerate((4, 2, 2, 0)):   # 巻き尾は背中にのせたまま
        p.rot(f'tail{i}', y=a * br)
    p.rot('ear.L', y=-25, x=10).rot('ear.R', y=-25, x=-10)
    eyes(p, 0.0)
    return p

def sad(t, n):
    p = Pose()
    br = s(t, n / 1.5)
    up = max(0, s(t, n, 0.1)) ** 4                        # ときどき上目づかい
    p.rot('spine', y=0.5 * br).rot('chest', y=3)
    p.rot('neck', y=22 - 6 * up).rot('head', y=10 - 12 * up, z=-6 * up)
    # 巻き尾をゆるめて低くする（Y軸の負回転で後ろ・下へ。大きく回すと線形スキニングで形が崩れる）
    for i, a in enumerate((-20, -8, -8, -6)):
        p.rot(f'tail{i}', y=a, z=2 * s(t, n / 2))
    p.rot('ear.L', y=-78, x=-14).rot('ear.R', y=-78, x=14)
    eyes(p, 0.72 - 0.6 * blink(t, int(n * 0.55), 6))
    return p

STATES = {'idle': (idle, 96), 'petted': (petted, 36), 'eat': (eat, 48), 'sleep': (sleep, 72), 'sad': (sad, 96)}

def bake(rig, name, start=1):
    fn, n = STATES[name]
    for t in range(n):
        apply(rig, fn(t, n), start + t)
    return start, start + n - 1
