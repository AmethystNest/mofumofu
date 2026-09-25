import sys, bpy
sys.path.insert(0, '.')
import blend_dog as B, anim as A
fur = '--fur' in sys.argv
B.clear(); rig, ob = B.build_dog()
if fur: B.add_fur(ob)
B.setup_scene(res=360, samples=24)
sc = bpy.context.scene
for name, (fn, n) in A.STATES.items():
    A.apply(rig, fn(n // 4, n), 1)
    sc.frame_set(1)
    sc.render.filepath = f'/tmp/claude-0/pose_{name}.png'
    bpy.ops.render.render(write_still=True)
