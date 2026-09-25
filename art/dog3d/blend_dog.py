"""dog_mesh.npz から Blender のシーン（メッシュ・骨・目鼻・材質・ライト・カメラ）を組み立てる。"""
import math, sys
import bpy, numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, '.')
from sdf_dog import BONES, hs

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def fur_material():
    m = bpy.data.materials.new('Fur')
    nt = m.node_tree; N = nt.nodes; L = nt.links
    bsdf = N['Principled BSDF']
    attr = N.new('ShaderNodeAttribute'); attr.attribute_name = 'white'
    # 細かい毛並みのむら
    tc = N.new('ShaderNodeTexCoord')
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 90; noise.inputs['Detail'].default_value = 6
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    mix = N.new('ShaderNodeMath'); mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = 0.08; mix.inputs[2].default_value = -0.04
    L.new(noise.outputs['Fac'], mix.inputs[0])
    add = N.new('ShaderNodeMath'); add.operation = 'ADD'
    L.new(attr.outputs['Fac'], add.inputs[0]); L.new(mix.outputs[0], add.inputs[1])
    ramp = N.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp; cr.interpolation = 'EASE'
    cr.elements[0].position = 0.28; cr.elements[0].color = (0.007, 0.006, 0.006, 1)
    cr.elements[1].position = 0.86; cr.elements[1].color = (0.80, 0.70, 0.55, 1)
    e = cr.elements.new(0.46); e.color = (0.20, 0.055, 0.012, 1)
    e = cr.elements.new(0.62); e.color = (0.42, 0.17, 0.05, 1)
    L.new(add.outputs[0], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Sheen Weight'].default_value = 0.08
    bsdf.inputs['Sheen Roughness'].default_value = 0.6
    bsdf.inputs['Sheen Tint'].default_value = (0.75, 0.72, 0.7, 1)
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25
    L.new(noise.outputs['Fac'], bump.inputs['Height'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m

def simple_material(name, color, rough, coat=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    return m

def build_dog(npz='dog_mesh.npz', decimate=0.25):
    d = np.load(npz)
    v, f, W, names, white = d['verts'], d['faces'], d['weights'], list(d['names']), d['white']
    me = bpy.data.meshes.new('Dog')
    me.from_pydata(v.tolist(), [], f.tolist())
    me.shade_smooth()
    at = me.attributes.new('white', 'FLOAT', 'POINT')
    at.data.foreach_set('value', white)
    # 毛（パーティクル）へ渡すための色属性（R=裏白度）
    ca = me.color_attributes.new('whitec', 'BYTE_COLOR', 'CORNER')
    loop_v = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', loop_v)
    wl = white[loop_v]
    ca.data.foreach_set('color', np.stack([wl, wl, wl, np.ones_like(wl)], 1).ravel())
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    ob = bpy.data.objects.new('Dog', me)
    bpy.context.scene.collection.objects.link(ob)
    for j, n in enumerate(names):
        vg = ob.vertex_groups.new(name=str(n))
        idx = np.nonzero(W[:, j] > 0)[0]
        for i in idx:
            vg.add([int(i)], float(W[i, j]), 'REPLACE')
    me.materials.append(fur_material())
    vgl = ob.vertex_groups.new(name='furlen')
    for i, val in enumerate(d['furlen']):
        vgl.add([i], float(val), 'REPLACE')
    bpy.context.view_layer.objects.active = ob
    if decimate < 1:
        dm = ob.modifiers.new('Dec', 'DECIMATE'); dm.ratio = decimate
        bpy.ops.object.modifier_apply(modifier='Dec')
    # 骨
    arm = bpy.data.armatures.new('Rig')
    rig = bpy.data.objects.new('Rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for n, (h, t, par) in BONES.items():
        b = arm.edit_bones.new(n); b.head = h; b.tail = t
    for n, (h, t, par) in BONES.items():
        if par:
            arm.edit_bones[n].parent = arm.edit_bones[par]
            if (Vector(arm.edit_bones[par].tail) - Vector(h)).length < 1e-4:
                arm.edit_bones[n].use_connect = True
    for s in ('L', 'R'):   # 目・瞬き用の骨
        y = 1 if s == 'L' else -1
        b = arm.edit_bones.new(f'eye.{s}'); b.head = hs((0.505, 0.042 * y, 0.636)); b.tail = hs((0.53, 0.05 * y, 0.636))
        b.parent = arm.edit_bones['head']
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.parent = rig
    am = ob.modifiers.new('Arm', 'ARMATURE'); am.object = rig; am.use_deform_preserve_volume = True
    # 目・鼻（頭の骨に付ける）
    head_surface_attach(ob, rig)
    return rig, ob

def hair_material():
    m = bpy.data.materials.new('Hair')
    nt = m.node_tree; N = nt.nodes; L = nt.links
    N.remove(N['Principled BSDF'])
    h = N.new('ShaderNodeBsdfHairPrincipled'); h.parametrization = 'MELANIN'
    attr = N.new('ShaderNodeAttribute'); attr.attribute_name = 'whitec'
    sep = N.new('ShaderNodeSeparateColor'); L.new(attr.outputs['Color'], sep.inputs['Color'])
    # 裏白度 → メラニン量（黒 0.95 / 赤茶 0.6 / 白 0.12）と赤み
    mel = N.new('ShaderNodeFloatCurve')
    c = mel.mapping.curves[0]; c.points[0].location = (0, 1.0); c.points[1].location = (1, 0.1)
    c.points.new(0.33, 0.95); c.points.new(0.45, 0.62); c.points.new(0.56, 0.46); c.points.new(0.72, 0.28); c.points.new(0.88, 0.08)
    mel.mapping.update()
    L.new(sep.outputs['Red'], mel.inputs['Value'])
    L.new(mel.outputs['Value'], h.inputs['Melanin'])
    red = N.new('ShaderNodeMapRange'); red.inputs['From Min'].default_value = 0.35; red.inputs['From Max'].default_value = 0.6
    red.inputs['To Min'].default_value = 0.3; red.inputs['To Max'].default_value = 1.0
    L.new(sep.outputs['Red'], red.inputs['Value']); L.new(red.outputs['Result'], h.inputs['Melanin Redness'])
    h.inputs['Roughness'].default_value = 0.58
    h.inputs['Random Roughness'].default_value = 0.35
    h.inputs['Radial Roughness'].default_value = 0.7
    h.inputs['Coat'].default_value = 0.0
    L.new(h.outputs[0], N['Material Output'].inputs['Surface'])
    return m

def add_fur(ob, count=16000, children=10, length=0.022):
    ps = ob.modifiers.new('Fur', 'PARTICLE_SYSTEM').particle_system
    st = ps.settings
    st.type = 'HAIR'; st.count = count
    st.emit_from = 'FACE'; st.use_emit_random = True; st.use_even_distribution = True
    # 毛の長さ ≒ 4 ×（速度係数の合成）。実測で確認済み。後ろ・下へ寝かせる
    k = length / 4
    st.normal_factor = 0.55 * k
    st.object_align_factor = (-0.6 * k, 0.0, -0.45 * k)
    st.factor_random = 0.15 * k
    st.child_type = 'INTERPOLATED'; st.child_percent = 3; st.rendered_child_count = children
    st.child_length = 1.0; st.child_length_threshold = 0.2
    st.clump_factor = 0.35; st.clump_shape = -0.2
    st.roughness_1 = 0.004; st.roughness_endpoint = 0.004; st.roughness_2 = 0.002
    st.kink = 'NO'
    st.root_radius = 1.0; st.tip_radius = 0.0; st.radius_scale = 0.0009; st.shape = -0.3
    st.use_close_tip = True
    ps.vertex_group_length = 'furlen'
    ob.data.materials.append(hair_material())
    st.material = len(ob.data.materials)
    return ps

def _surface(ob, origin, direction):
    ok, loc, nor, _ = ob.ray_cast(Vector(origin), Vector(direction).normalized())
    assert ok, (origin, direction)
    return loc, nor

def _attach(obj, rig, bone):
    obj.parent = rig; obj.parent_type = 'BONE'; obj.parent_bone = bone
    # BONE 親は骨の末端基準なので、ワールド位置を保つよう逆行列を設定
    pb = rig.pose.bones[bone]
    obj.matrix_parent_inverse = (rig.matrix_world @ Matrix.Translation(pb.tail - pb.head) @ pb.matrix).inverted() if False else (rig.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.length, 0))).inverted()

def head_surface_attach(ob, rig):
    eye_m = simple_material('Eye', (0.035, 0.014, 0.006), 0.08, coat=1.0)
    nose_m = simple_material('Nose', (0.012, 0.011, 0.011), 0.3, coat=0.3)
    for s, y in (('L', 1), ('R', -1)):
        loc, nor = _surface(ob, (0.75, hs((0, 0.042 * y, 0))[1], hs((0, 0, 0.636))[2]), (-1, 0, 0))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=loc - nor * 0.004)
        e = bpy.context.object; e.name = f'Eye.{s}'
        e.scale = (0.0095, 0.0155, 0.012)
        e.rotation_euler = (0, 0, math.radians(18 * y))
        e.data.materials.append(eye_m); bpy.ops.object.shade_smooth()
        _attach(e, rig, f'eye.{s}')
    loc, nor = _surface(ob, (0.8, 0, hs((0, 0, 0.592))[2]), (-1, 0, 0))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=loc + Vector((-0.004, 0, 0.002)))
    n = bpy.context.object; n.name = 'Nose'
    n.scale = (0.018, 0.025, 0.017)
    n.data.materials.append(nose_m); bpy.ops.object.shade_smooth()
    _attach(n, rig, 'head')

def setup_scene(res=512, samples=64, azimuth=32, elev=12, ortho=0.95, target=(0.2, 0, 0.36)):
    sc = bpy.context.scene
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    a, e = math.radians(azimuth), math.radians(elev)
    cam.location = Vector(target) + 3 * Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    def light(name, kind, loc, energy, color, size):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, kind))
        sc.collection.objects.link(l); l.location = loc
        l.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        l.data.energy = energy; l.data.color = color
        if kind == 'AREA': l.data.size = size
        return l
    light('Key', 'AREA', (1.2, -1.0, 1.4), 200, (1.0, 0.86, 0.68), 1.2)    # 暖色のランプ
    light('Fill', 'AREA', (-1.0, -1.4, 0.8), 25, (0.62, 0.74, 0.86), 2.0)  # 窓の青い光
    light('Rim', 'AREA', (-0.6, 1.4, 1.2), 260, (0.9, 0.92, 1.0), 1.0)     # 輪郭光（黒い毛を背景から浮かせる）
    sc.world = bpy.data.worlds.new('W')
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.28, 0.3, 0.33, 1); bg.inputs[1].default_value = 0.12
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = -0.6
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    return cam
