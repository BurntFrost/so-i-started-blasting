"""Author the original web-native solar prominence and orbital survey craft.

blender --background --factory-startup --python tools/author-cosmic-assets.py
Use -- --output DIR for an independent reproduction. No render or GPU work runs.
Coordinates below are Three.js Y-up; Blender's exporter returns identity nodes.
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
parser.add_argument('--output', type=Path, default=ROOT / 'work/scene-authoring/web-rollout/media')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
args.output.mkdir(parents=True, exist_ok=True)
random.seed(77494)
noise.seed_set(77494)
TAU = math.pi * 2
TIMES = [0, 3, 5, 8, 12, 16, 22, 30]
# Width, arch height, root lift, forward sweep, braid turns.
PROMINENCE_KEYS = [
    (7, 4.6, 0, .5, .65), (7, 8.2, 0, 1, .85),
    (7, 12.3, 0, 1.5, 1.0), (7, 20.3, 0, 3.2, 1.4),
    (10.6, 31, 7, 4.4, 1.9), (9.2, 21, 16, 4.8, 2.15),
    (6.2, 12, 25, 4.2, 2.4), (4.2, 6, 31, 3, 2.5),
]
STRANDS, STEPS, SIDES = 3, 64, 8


def xyz(point):
    x, y, z = point
    return (x, -z, y)


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.actions):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def material(name, color, metallic=0, roughness=.5, emission=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    node = result.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    if emission:
        node.inputs['Emission Color'].default_value = (*color, 1)
        node.inputs['Emission Strength'].default_value = emission
    return result


def mesh_object(name, vertices, faces, materials, assignments=None, smooth=True):
    mesh = bpy.data.meshes.new(name + ' geometry')
    mesh.from_pydata([xyz(p) for p in vertices], [], faces)
    mesh.update()
    for value in materials:
        mesh.materials.append(value)
    for index, polygon in enumerate(mesh.polygons):
        polygon.use_smooth = smooth and len(polygon.vertices) == 4
        polygon.material_index = assignments[index] if assignments else 0
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    return obj


def export(obj, name, contract, animated=False):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 0, 720
    scene.frame_set(0)
    path = args.output / name
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_yup=True, export_extras=False, export_apply=False,
        export_animations=animated, export_animation_mode='ACTIONS',
        export_force_sampling=False, export_frame_range=True,
        export_morph=True, export_morph_normal=True,
        export_morph_animation=animated, export_anim_slide_to_zero=True)
    raw = path.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + length])
    node = next(n for n in gltf['nodes'] if n.get('name') == obj.name)
    node['extras'] = contract
    chunk = raw[20 + length:]
    encoded = json.dumps(gltf, separators=(',', ':'), ensure_ascii=True).encode()
    encoded += b' ' * (-len(encoded) % 4)
    result = struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(chunk))
    result += struct.pack('<I4s', len(encoded), b'JSON') + encoded + chunk
    path.write_bytes(result)
    obj.data.calc_loop_triangles()
    return {'file': name, 'bytes': len(result), 'sha256': hashlib.sha256(result).hexdigest(),
        'triangles': len(obj.data.loop_triangles), 'vertices': len(obj.data.vertices),
        'mesh': obj.name, 'nodeTransform': {key: node[key] for key in ['translation', 'rotation', 'scale', 'matrix'] if key in node},
        'materials': [m.name for m in obj.data.materials],
        'animationClips': [a.get('name') for a in gltf.get('animations', [])]}


def centre(s, key):
    width, height, lift, sweep, turns = key
    a = math.pi * s
    pulse = math.sin(a)
    # Off-centre broad crest and swept lobes avoid a uniformly inflated semicircle.
    x = width * math.cos(a) + .7 * pulse * math.sin(a * 2)
    y = .45 + lift + height * pulse * (1 + .075 * math.sin(a * 2 + .4))
    z = sweep * math.sin(a * 2) * pulse + .45 * sweep * pulse
    return Vector((x, y, z))


def frame(s, key):
    p = centre(s, key)
    before, after = centre(max(0, s - .0001), key), centre(min(1, s + .0001), key)
    tangent = (after - before).normalized()
    if s == 0 or s == 1:
        tangent = Vector((0, 1 if s == 0 else -1, 0))
    a = tangent.cross(Vector((0, 0, 1))).normalized()
    b = tangent.cross(a).normalized()
    return p, tangent, a, b


def prominence_pose(key):
    points = []
    for strand in range(STRANDS):
        for j in range(STEPS + 1):
            s = j / STEPS
            p, tangent, a, b = frame(s, key)
            envelope = math.sin(math.pi * s)
            phase = strand / STRANDS * TAU + s * TAU + envelope * key[4] * TAU * .85
            # Individual roots remain fixed; most twist and separation live in the lifted span.
            braid = .29 + envelope * (.75 + key[1] * .017)
            core = p + a * math.cos(phase) * braid + b * math.sin(phase) * braid
            radius = (.20 + .15 * envelope) * (1 - .16 * strand / STRANDS)
            radius *= 1 + .08 * math.sin(s * 13 + strand)
            for k in range(SIDES):
                angle = k / SIDES * TAU
                point = core + radius * (a * math.cos(angle) + b * math.sin(angle))
                points.append(tuple(point))
    return points


def author_prominence():
    reset()
    poses = [prominence_pose(key) for key in PROMINENCE_KEYS]
    faces = []
    stride = (STEPS + 1) * SIDES
    for strand in range(STRANDS):
        base = strand * stride
        for j in range(STEPS):
            for k in range(SIDES):
                a = base + j * SIDES + k
                b = base + j * SIDES + (k + 1) % SIDES
                faces.append((a, b, b + SIDES, a + SIDES))
        faces.append(tuple(base + k for k in reversed(range(SIDES))))
        faces.append(tuple(base + STEPS * SIDES + k for k in range(SIDES)))
    obj = mesh_object('Prominence', poses[0], faces,
        [material('Original solar plasma', (1, .19, .018), roughness=.5, emission=2)])
    # UV V follows each strand, allowing future surface streaks without a topology change.
    uv = obj.data.uv_layers.new(name='FluxCoordinates')
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            index = obj.data.loops[loop_index].vertex_index % stride
            j, k = divmod(index, SIDES)
            uv.data[loop_index].uv = (k / SIDES, 1 - j / STEPS)
    obj.shape_key_add(name='Basis')
    for index, (time, points) in enumerate(zip(TIMES[1:], poses[1:]), 1):
        key = obj.shape_key_add(name=f'Flux_{time}s')
        for vertex, p in zip(key.data, points):
            vertex.co = xyz(p)
        for t in TIMES:
            key.value = float(t == time)
            key.keyframe_insert(data_path='value', frame=t * 24)
        key.value = 0
    action = obj.data.shape_keys.animation_data.action
    action.name = 'Anchored inflation, lift and recoil'
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = 'LINEAR'
    contract = {'motionTimes': TIMES, 'authoringTool': f'Blender {bpy.app.version_string}',
        'authoringSource': 'tools/author-cosmic-assets.py', 'coordinateSystem': 'Y up; +Y points outward from the solar active region',
        'rootsAttachedThrough': 8, 'strandCount': STRANDS}
    report = export(obj, 'knowing-prominence.glb', contract, animated=True)
    report.update({'morphTargets': len(TIMES) - 1, 'motionTimes': TIMES,
        'bounds': [{'time': t, 'min': [min(v[d] for v in p) for d in range(3)],
                    'max': [max(v[d] for v in p) for d in range(3)]} for t, p in zip(TIMES, poses)]})
    assert report['triangles'] < 5000
    assert all(math.isfinite(value) for pose in poses for point in pose for value in point)
    bpy.context.scene.frame_set(12 * 24)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output / 'knowing-prominence.blend'))
    return report


class Craft:
    def __init__(self):
        self.vertices, self.faces, self.materials, self.smooth = [], [], [], []

    def add(self, vertices, faces, material_id=0, smooth=False):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(offset + i for i in face) for face in faces)
        self.materials.extend([material_id] * len(faces))
        self.smooth.extend([smooth] * len(faces))

    def pod(self, center, radial, tangent, depth, angle, material_id=0, bevel=.1):
        c, s = math.cos(angle), math.sin(angle)
        def transform(x, y, z):
            return (center[0] + x * c - y * s, center[1] + x * s + y * c, center[2] + z)
        x, y, z = radial / 2, tangent / 2, depth / 2
        b = min(bevel, x * .4, y * .4)
        rim = [(-x+b,-y),(x-b,-y),(x,-y+b),(x,y-b),(x-b,y),(-x+b,y),(-x,y-b),(-x,-y+b)]
        vertices = [transform(a,b,c) for c in [-z,z] for a,b in rim]
        faces = [tuple(reversed(range(8))), tuple(range(8,16))]
        faces.extend((i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8))
        self.add(vertices, faces, material_id)

    def cylinder(self, center, radius, length, material_id=0, sides=12, top_radius=None):
        other = radius if top_radius is None else top_radius
        vertices = [(center[0]+r*math.cos(i/sides*TAU),center[1]+r*math.sin(i/sides*TAU),center[2]+z)
                    for z,r in [(-length/2,radius),(length/2,other)] for i in range(sides)]
        faces=[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]
        faces.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
        self.add(vertices,faces,material_id,True)

    def torus(self, radius, tube, z, material_id=0, steps=48, sides=6):
        vertices=[((radius+tube*math.cos(k/sides*TAU))*math.cos(j/steps*TAU),
                   (radius+tube*math.cos(k/sides*TAU))*math.sin(j/steps*TAU),z+tube*math.sin(k/sides*TAU))
                  for j in range(steps) for k in range(sides)]
        faces=[(j*sides+k,((j+1)%steps)*sides+k,((j+1)%steps)*sides+(k+1)%sides,j*sides+(k+1)%sides)
               for j in range(steps) for k in range(sides)]
        self.add(vertices,faces,material_id,True)


def author_craft():
    reset()
    craft = Craft()
    palette = [material('Ceramic hull', (.62,.67,.7), .4, .42),
               material('Graphite structure', (.075,.095,.12), .65, .4),
               material('Thermal gold', (.5,.26,.065), .72, .35),
               material('Blue navigation', (.12,.52,.8), .15, .22, 2.4),
               material('Dark glazing', (.012,.045,.065), .45, .16)]
    craft.torus(3.43,.16,0,1)
    craft.torus(3.43,.055,.35,2)
    craft.torus(3.43,.055,-.35,1)
    for i in range(12):
        a=i/12*TAU
        point=lambda r,z=0:(math.cos(a)*r,math.sin(a)*r,z)
        craft.pod(point(3.43),1.27,1.32,.74,a,0,.17)
        craft.pod(point(3.43,.382),.94,.94,.055,a,1,.1)
        craft.pod(point(3.43,.42),.68,.61,.035,a,4,.08)
        craft.pod(point(3.92,.43),.14,.94,.06,a,2,.025)
        if i%3==0:
            craft.pod(point(3.43,.45),.14,.57,.04,a,3,.02)
        craft.pod(point(3.43,-.395),.68,.92,.06,a,2,.045)
    for i in range(4):
        a=i/4*TAU+math.pi/4
        point=lambda r,z=0:(math.cos(a)*r,math.sin(a)*r,z)
        craft.pod(point(1.96,-.03),2.5,.18,.2,a,1,.04)
        craft.pod(point(2.05,.08),1.6,.12,.08,a,2,.03)
        craft.pod(point(1.77,-.2),1.38,.55,.055,a,1,.04)
    craft.cylinder((0,0,0),.69,1.05,0,sides=16)
    craft.cylinder((0,0,.57),.54,.12,2,sides=16)
    craft.cylinder((0,0,.8),.31,.7,1)
    craft.pod((0,0,1.55),1.25,.78,1.25,0,0,.14)
    craft.pod((0,-.02,2.19),.96,.45,.07,0,4,.08)
    craft.pod((0,.35,1.65),.82,.06,.57,0,3,.02)
    for x in [-.45,.45]:
        for y in [-.45,.45]:
            craft.cylinder((x,y,-.83),.2,.53,1,sides=8,top_radius=.13)
            craft.cylinder((x,y,-1.11),.145,.04,3,sides=8)
    obj=mesh_object('SurveyCraft',craft.vertices,craft.faces,palette,craft.materials,False)
    for polygon, smooth in zip(obj.data.polygons,craft.smooth):
        polygon.use_smooth=smooth and len(polygon.vertices)==4
    # Explicit UVs are useful for tangent/normal compatibility even without textures.
    uv=obj.data.uv_layers.new(name='PanelCoordinates')
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            index=obj.data.loops[loop_index].vertex_index
            x,y,z=craft.vertices[index]
            uv.data[loop_index].uv=((x+4.1)/8.2,(y+4.1)/8.2)
    contract={'authoringTool':f'Blender {bpy.app.version_string}','authoringSource':'tools/author-cosmic-assets.py',
              'coordinateSystem':'Y up; ring in XY; +Z forward; origin at hub','originalArtwork':True}
    report=export(obj,'interstellar-craft.glb',contract)
    report['bounds']={'min':[min(p[d] for p in craft.vertices) for d in range(3)],
                      'max':[max(p[d] for p in craft.vertices) for d in range(3)]}
    assert report['triangles']<5000
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output/'interstellar-craft.blend'))
    return report


reports=[author_prominence(),author_craft()]
result={'blender':bpy.app.version_string,'seed':77494,'generator':'tools/author-cosmic-assets.py',
        'provenance':'Original procedural Blender artwork; no external models, textures or film frames.',
        'assets':reports}
(args.output/'report.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
