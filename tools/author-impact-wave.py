"""Author the Deep Impact wave's reversible poses in Blender.

blender --background --factory-startup --python tools/author-impact-wave.py
Use -- --output DIR for an independent reproduction; --render adds a preview.
The GLB has one identity mesh, six morph poses and a 16-second weights clip.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import sys

import bpy
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=ROOT / 'work/scene-authoring/deep-impact/web-pilot/media')
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
args.output.mkdir(parents=True, exist_ok=True)
random.seed(19981998)
noise.seed_set(19981998)

TIMES = [14, 17, 20, 23, 25, 27, 30]
WIDTH = 363.0
X_SEGMENTS = 80
FRONT_SEGMENTS = 22
BACK_SEGMENTS = 16
RING = FRONT_SEGMENTS + BACK_SEGMENTS + 1


def smooth(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def bezier(points, t):
    a = 1 - t
    return tuple(a ** 3 * points[0][i] + 3 * a * a * t * points[1][i]
                 + 3 * a * t * t * points[2][i] + t ** 3 * points[3][i] for i in range(2))


def section(x, time):
    travel = smooth((time - 14) / 16)
    height = (22 + travel * 60) * (1 - .38 * smooth((time - 25) / 5))
    edge = 1 - .83 * smooth((abs(x) / (WIDTH * .5) - .67) / .33)
    ridge = 1 + .105 * math.sin(x * .034 + .5) + .055 * math.sin(x * .079 - .4)
    ridge += .023 * math.sin(x * .17 + time * .12)
    collapse = smooth((time - 23) / 7) * .13 * (1 + math.sin(x * .052 + .7))
    height *= edge * ridge * (1 - collapse)
    fold = smooth((time - 17 - 1.6 * math.sin(x * .027 + .3) - .7 * math.cos(x * .063)) / 9)
    drift = (math.sin(x * .029 + .4) * 4 + math.sin(x * .073) * 1.8) * travel * edge
    tip = (height * (.88 - .34 * fold), (19 + fold * 32) * edge + drift)
    shoulder = (height, (-14 + fold * 4) * edge + drift)
    return height, edge, fold, drift, shoulder, tip


def front(x, v, time):
    height, edge, fold, drift, shoulder, tip = section(x, time)
    if v <= .68:
        y, z = bezier([(0, 0), (height * .38, -4 * edge),
                      (height * 1.08, -25 * (.3 + fold * .7) * edge + drift), shoulder], v / .68)
    else:
        y, z = bezier([shoulder, (height * 1.065, (4 + fold * 18) * edge + drift),
                      (height * (.94 - .27 * fold), (24 + fold * 22) * edge + drift), tip], (v - .68) / .32)
    # Broad ridges are sculptural; small surface ribs support the moving water material.
    rib = math.sin(x * .24 + v * 13 + time * .10) * math.sin(math.pi * v) * .30 * edge
    return (x, y + rib, z + rib * .7)


def back(x, v, time):
    height, edge, fold, drift, shoulder, tip = section(x, time)
    roof = (height * 1.105, -23 * edge + drift)
    if v <= .28:
        y, z = bezier([tip, (tip[0] + 2 * edge, tip[1] + 2 * edge),
                      (height * 1.23, -5 * edge + drift), roof], v / .28)
    else:
        y, z = bezier([roof, (height * .85, -60 * edge),
                      (height * .18, -88 * edge), (0, -105 * edge)], (v - .28) / .72)
    return (x, y, z)


def pose(time):
    vertices = []
    for i in range(X_SEGMENTS + 1):
        x = (i / X_SEGMENTS - .5) * WIDTH
        vertices.extend(front(x, j / FRONT_SEGMENTS, time) for j in range(FRONT_SEGMENTS + 1))
        vertices.extend(back(x, j / BACK_SEGMENTS, time) for j in range(1, BACK_SEGMENTS + 1))
    return vertices


def blender_xyz(point):
    x, y, z = point
    return (x, -z, y)


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
poses = [pose(time) for time in TIMES]
faces = []
for i in range(X_SEGMENTS):
    for j in range(RING):
        a, b = i * RING + j, i * RING + (j + 1) % RING
        # In Three Y-up space the visible front faces +Z.
        faces.append((a, a + RING, b + RING, b))
faces.append(tuple(reversed(range(RING))))
faces.append(tuple(X_SEGMENTS * RING + j for j in range(RING)))
mesh = bpy.data.meshes.new('Authored rolling Atlantic wave')
mesh.from_pydata([blender_xyz(p) for p in poses[0]], [], faces)
mesh.update()
wave = bpy.data.objects.new('ImpactWave', mesh)
bpy.context.collection.objects.link(wave)
bpy.context.view_layer.objects.active = wave
wave.select_set(True)
for polygon in mesh.polygons:
    polygon.use_smooth = len(polygon.vertices) == 4
uvs = mesh.uv_layers.new(name='WaterCoordinates')
for polygon in mesh.polygons:
    for loop_index in polygon.loop_indices:
        vertex_index = mesh.loops[loop_index].vertex_index
        i, j = divmod(vertex_index, RING)
        if j <= FRONT_SEGMENTS:
            v = j / FRONT_SEGMENTS
        else:
            # Continue the crest mask smoothly over the lip and down the back.
            v = 1 - (j - FRONT_SEGMENTS) / BACK_SEGMENTS
        # Blender's glTF exporter flips V; author the inverse for the runtime mask.
        uvs.data[loop_index].uv = (i / X_SEGMENTS, 1 - v)

wave.shape_key_add(name='Basis')
for index, time in enumerate(TIMES[1:], 1):
    key = wave.shape_key_add(name=f'Wave_{time}s')
    for vertex, point in zip(key.data, poses[index]):
        vertex.co = blender_xyz(point)
    for frame_time in TIMES:
        key.value = 1.0 if frame_time == time else 0.0
        key.keyframe_insert(data_path='value', frame=(frame_time - 14) * 24)
    key.value = 0
action = mesh.shape_keys.animation_data.action
action.name = 'Atlantic swell to breaking crest'
for layer in action.layers:
    for strip in layer.strips:
        for channelbag in strip.channelbags:
            for fcurve in channelbag.fcurves:
                for keyframe in fcurve.keyframe_points:
                    keyframe.interpolation = 'LINEAR'

material = bpy.data.materials.new('Atlantic turquoise')
material.use_nodes = True
principled = material.node_tree.nodes.get('Principled BSDF')
principled.inputs['Base Color'].default_value = (.035, .29, .31, 1)
principled.inputs['Metallic'].default_value = .08
principled.inputs['Roughness'].default_value = .26
mesh.materials.append(material)
crest_xs = [round((i / X_SEGMENTS - .5) * WIDTH, 6) for i in range(X_SEGMENTS + 1)]
contract = {
    'waveTimes': TIMES,
    'crestXs': crest_xs,
    'crestFrames': [[round(value, 6) for x in crest_xs for value in front(x, 1, time)] for time in TIMES],
    'authoringTool': f'Blender {bpy.app.version_string}',
    'authoringSource': 'tools/author-impact-wave.py',
    'waveCoordinateSystem': 'Y up; front lip travels toward +Z; local seconds 0..16 correspond to scene 14..30',
}
wave['wave_contract_json'] = json.dumps(contract, separators=(',', ':'))
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0, 384
scene.frame_set(0)
glb_path = args.output / 'deep-impact-wave.glb'
bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', use_selection=True,
                          export_yup=True, export_extras=False, export_apply=False,
                          export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=False, export_frame_range=True,
                          export_morph=True, export_morph_normal=True,
                          export_morph_animation=True, export_anim_slide_to_zero=True)

# glTF extras allow nested arrays; Blender ID arrays do not. Attach the exact crest
# samples to the exported node without changing any geometry or animation bytes.
raw = glb_path.read_bytes()
json_length = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + json_length])
node = next(node for node in gltf['nodes'] if node.get('name') == 'ImpactWave')
node['extras'] = contract
binary_chunk = raw[20 + json_length:]
encoded = json.dumps(gltf, separators=(',', ':'), ensure_ascii=True).encode()
encoded += b' ' * ((-len(encoded)) % 4)
glb = struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(binary_chunk))
glb += struct.pack('<I4s', len(encoded), b'JSON') + encoded + binary_chunk
glb_path.write_bytes(glb)
mesh.calc_loop_triangles()
report = {
    'blender': bpy.app.version_string, 'triangles': len(mesh.loop_triangles),
    'vertices': len(mesh.vertices), 'morphTargets': len(TIMES) - 1,
    'waveTimes': TIMES, 'animationClips': [a.get('name') for a in gltf.get('animations', [])],
    'bytes': len(glb), 'sha256': hashlib.sha256(glb).hexdigest(),
    'poseSha256': hashlib.sha256(json.dumps(poses, separators=(',', ':')).encode()).hexdigest(),
    'bounds': [{'time': time, 'min': [min(p[j] for p in points) for j in range(3)],
                'max': [max(p[j] for p in points) for j in range(3)]} for time, points in zip(TIMES, poses)],
}
assert report['triangles'] < 15000
assert all(all(math.isfinite(value) for point in points for value in point) for points in poses)
(args.output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')

# Retain the editable keys/clip and a compact studio setup for asset inspection.
scene.frame_set((23 - 14) * 24)
bpy.ops.object.camera_add(location=blender_xyz((190, 105, 210)))
camera = bpy.context.object
camera.name = 'Wave inspection camera'
direction = Vector(blender_xyz((0, 24, -5))) - camera.location
camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 38
scene.camera = camera
for location, energy, size in [((10, 150, 60), 240000, 180), ((-100, 80, -80), 170000, 150)]:
    bpy.ops.object.light_add(type='AREA', location=blender_xyz(location))
    light = bpy.context.object
    light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
    light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
scene.world.color = (.12, .16, .20)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x, scene.render.resolution_y = 1200, 720
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(args.output / 'deep-impact-wave.blend'))
if args.render:
    scene.render.filepath = str(args.output / 'wave-at-23.png')
    bpy.ops.render.render(write_still=True)
print(json.dumps(report, indent=2))
