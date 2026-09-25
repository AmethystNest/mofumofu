"""5状態のスプライト用フレームを書き出す。
使い方: python render_frames.py OUT_DIR [--res 384] [--step 2] [--samples 24] [--states idle,sad]
step=2 は 24fps のアニメーションを 12fps で書き出す。
"""
import sys, os, argparse, time
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blend_dog as B, anim as A

ap = argparse.ArgumentParser()
ap.add_argument('out'); ap.add_argument('--res', type=int, default=384); ap.add_argument('--step', type=int, default=2)
ap.add_argument('--samples', type=int, default=24); ap.add_argument('--states', default=','.join(A.STATES))
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

B.clear(); rig, ob = B.build_dog(); B.add_fur(ob)
B.setup_scene(res=args.res, samples=args.samples)
sc = bpy.context.scene
start = 1
for name in args.states.split(','):
    s0, s1 = A.bake(rig, name, start)
    os.makedirs(f'{args.out}/{name}', exist_ok=True)
    for i, f in enumerate(range(s0, s1 + 1, args.step)):
        t = time.time()
        sc.frame_set(f)
        sc.render.filepath = f'{args.out}/{name}/{i:03d}.png'
        bpy.ops.render.render(write_still=True)
        print(f'[frame] {name} {i} {time.time() - t:.1f}s', flush=True)
    start = s1 + 10
