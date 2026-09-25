import sys, bpy, math
sys.path.insert(0, '.')
import blend_dog as B
out = sys.argv[-1]
B.clear(); rig, ob = B.build_dog()
if '--fur' in sys.argv: B.add_fur(ob)
for az in (32, -60, 90):
    B.setup_scene(res=420, samples=32, azimuth=az) if az == 32 else None
    cam = bpy.context.scene.camera
    from mathutils import Vector
    a, e = math.radians(az), math.radians(12); t = Vector((0.2, 0, 0.36))
    cam.location = t + 3 * Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = f'{out}_{az}.png'
    bpy.ops.render.render(write_still=True)
