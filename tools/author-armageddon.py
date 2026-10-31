"""Author the original split asteroid with Blender's background Python.

blender --background --factory-startup --python tools/author-armageddon.py
The browser module stores assembled pivots and static, local-space geometry;
all animation remains in the site's reversible simulation.
"""

import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector, geometry, noise


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'work/scene-authoring/armageddon/cinematic/media'
MODULE = ROOT / 'dist/armageddon-geometry.js'
OUTPUT.mkdir(parents=True, exist_ok=True)


def seam_x(y, z):
    strata = noise.noise_vector(Vector((y * .13, z * .13, 2.7)), noise_basis='PERLIN_ORIGINAL').x
    return (2.8 * math.sin(y * .17 + z * .045) + 1.8 * math.sin(z * .14 - y * .06)
            + math.floor(strata * 3.5) * .65)


def material(name, color, roughness):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return result


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
shell = material('Graphite asteroid crust', (.115, .14, .17), .88)
interior = material('Layered mineral fracture', (.22, .24, .27), .94)
noise.seed_set(77495)

# A single deformed shell is cut twice. Both exports inherit exactly the same rim.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1)
source = bpy.context.object
source.name = 'Asteroid source'
for vertex in source.data.vertices:
    direction = vertex.co.normalized()
    coarse = noise.noise_vector(direction * 2.1, noise_basis='PERLIN_ORIGINAL').x
    middle = noise.noise_vector(direction * 7.5, noise_basis='PERLIN_ORIGINAL').y
    fine = noise.noise_vector(direction * 23, noise_basis='PERLIN_ORIGINAL').z
    ridges = abs(noise.noise_vector(direction * 3.8, noise_basis='PERLIN_ORIGINAL').z)
    radius = .96 + coarse * .28 + middle * .11 + fine * .018 + ridges * .13
    x, y, z = direction.x * 30 * radius, direction.y * 20 * radius, direction.z * 24 * radius
    # Broad planes interrupt the round silhouette; skew gives the two lobes distinct profiles.
    x = min(x, 25.5 - y * .18 + z * .17)
    x = max(x, -27 + y * .13 - z * .08)
    y = min(y, 17.5 + x * .09 - z * .13)
    vertex.co = Vector((x, y + x * .065, z + y * .08))

modifier = source.modifiers.new('Browser geometry budget', 'DECIMATE')
modifier.ratio = .55
bpy.context.view_layer.objects.active = source
bpy.ops.object.modifier_apply(modifier=modifier.name)
source.data.materials.append(shell)
source.data.materials.append(interior)


def build_piece(name, keep_positive):
    bm = bmesh.new()
    bm.from_mesh(source.data)
    # Warp the seam to a plane for robust clipping, then restore original space.
    for vertex in bm.verts:
        vertex.co.x -= seam_x(vertex.co.y, vertex.co.z)
    bmesh.ops.bisect_plane(
        bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=1e-6,
        plane_co=(0, 0, 0), plane_no=(1, 0, 0),
        clear_inner=keep_positive, clear_outer=not keep_positive,
    )
    boundary = list({vertex for edge in bm.edges if edge.is_boundary for vertex in edge.verts})
    boundary.sort(key=lambda vertex: math.atan2(vertex.co.z, vertex.co.y))
    rim = [Vector((seam_x(v.co.y, v.co.z), v.co.y, v.co.z)) for v in boundary]
    for vertex in bm.verts:
        vertex.co.x += seam_x(vertex.co.y, vertex.co.z)
    # Constrained triangulation replaces the radial fan with an irregular fracture field.
    # Both halves use the same coordinates and height function, including the exact rim.
    coordinates = [Vector((vertex.co.y, vertex.co.z)) for vertex in boundary]
    for row in range(-5, 6):
        for column in range(-6, 7):
            y = row * 3.6 + math.sin(column * 7.3 + row * 1.7) * .9
            z = column * 3.6 + math.cos(row * 4.1 - column * 2.3) * .9
            coordinates.append(Vector((y, z)))
    points, _, triangles, original_vertices, _, _ = geometry.delaunay_2d_cdt(
        coordinates, [], [list(range(len(boundary)))], 1, 1e-7)
    used = {index for triangle in triangles for index in triangle}
    cap_vertices = {}
    for index in sorted(used):
        point, originals = points[index], original_vertices[index]
        rim_index = next((index for index in originals if index < len(boundary)), None)
        cap_vertices[index] = boundary[rim_index] if rim_index is not None else bm.verts.new((seam_x(*point), *point))
    for triangle in triangles:
        face = bm.faces.new([cap_vertices[index] for index in triangle])
        face.material_index = 1
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for face in bm.faces:
        face.smooth = face.material_index == 0
    for edge in bm.edges:
        edge.smooth = edge.calc_face_angle(0) < .62
    assert all(len(edge.link_faces) == 2 for edge in bm.edges), f'{name} must be closed'
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(shell)
    mesh.materials.append(interior)
    mesh.update()
    mesh.calc_loop_triangles()
    volume, weighted = 0, Vector()
    for triangle in mesh.loop_triangles:
        a, b, c = [mesh.vertices[index].co for index in triangle.vertices]
        tetra = a.dot(b.cross(c)) / 6
        volume += tetra
        weighted += (a + b + c) * (tetra / 4)
    assert volume > 0, f'{name} must have outward normals'
    pivot = weighted / volume
    for vertex in mesh.vertices:
        vertex.co -= pivot
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = pivot
    obj['assembledPivot'] = list(pivot)
    return obj, rim, volume


pieces = []
seam = None
for name, positive in [('Asteroid_Left', False), ('Asteroid_Right', True)]:
    obj, rim, volume = build_piece(name, positive)
    mesh = obj.data
    mesh.calc_loop_triangles()
    positions, normals, groups = [], [], []
    for material_index in [0, 1]:
        start = len(positions) // 3
        for triangle in mesh.loop_triangles:
            if triangle.material_index != material_index:
                continue
            for vertex_index, loop_index in zip(triangle.vertices, triangle.loops):
                positions.extend(round(value, 4) for value in mesh.vertices[vertex_index].co)
                normals.extend(round(value, 5) for value in mesh.corner_normals[loop_index].vector)
        groups.append({'start': start, 'count': len(positions) // 3 - start, 'materialIndex': material_index})
    pieces.append({'name': name, 'pivot': [round(value, 4) for value in obj.location],
                   'positions': positions, 'normals': normals, 'groups': groups})
    obj['volume'] = volume
    if seam is None:
        seam = [round(value, 4) for point in rim for value in point]
    else:
        assert seam == [round(value, 4) for point in rim for value in point], 'Fracture rims must match'

bpy.data.objects.remove(source, do_unlink=True)
triangle_count = sum(len(piece['positions']) // 9 for piece in pieces)
assert triangle_count <= 12000
MODULE.write_text(
    '// Generated by tools/author-armageddon.py with Blender; do not hand-edit.\n'
    '// Y-up assembled pivots; nonindexed local XYZ positions/normals. Groups: 0 crust, 1 fracture.\n'
    f'// {triangle_count} triangles across two complementary, closed pieces.\n'
    'export const armageddonFragments = ' + json.dumps(pieces, separators=(',', ':')) + ';\n'
    'export const armageddonSeam = ' + json.dumps(seam, separators=(',', ':')) + ';\n'
)

# Inspection exports use Blender's native Z-up view of the same coordinates.
# The runtime module is deliberately already in the site's Y-up coordinate frame.
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / 'armageddon-fracture.glb'), export_format='GLB',
                          use_selection=True, export_yup=False, export_animations=False)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.device = 'CPU'
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.world.color = (.035, .035, .035)
scene.view_settings.view_transform = 'AgX'
# Preserve assembled poses in custom properties, and show the complementary cut.
bpy.data.objects['Asteroid_Left'].location.x -= 12
bpy.data.objects['Asteroid_Right'].location.x += 12
bpy.data.objects['Asteroid_Left'].rotation_euler.y = -.6
bpy.data.objects['Asteroid_Right'].rotation_euler.y = .45
for name, location, energy, size in [
    ('Key', (30, 60, 80), 80000, 60),
    ('Cool rim', (-60, 15, -20), 65000, 40),
    ('Fracture fill', (0, 70, 20), 60000, 25),
]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.shape, light.size = energy, 'DISK', size
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
camera = bpy.data.cameras.new('Inspection camera')
camera_obj = bpy.data.objects.new('Inspection camera', camera)
bpy.context.collection.objects.link(camera_obj)
camera_obj.location = (88, 80, 110)
camera_obj.rotation_euler = (-camera_obj.location).to_track_quat('-Z', 'Y').to_euler()
camera.lens = 46
scene.camera = camera_obj
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'armageddon-fracture.blend'))
scene.render.filepath = str(OUTPUT / 'armageddon-fracture.png')
bpy.ops.render.render(write_still=True)

stats = {'blender': bpy.app.version_string, 'triangles': triangle_count,
         'moduleBytes': MODULE.stat().st_size, 'seamVertices': len(seam) // 3,
         'pieces': [{'name': p['name'], 'pivot': p['pivot'], 'triangles': len(p['positions']) // 9,
                     'groups': p['groups']} for p in pieces]}
(OUTPUT / 'geometry-stats.json').write_text(json.dumps(stats, indent=2) + '\n')
print(json.dumps(stats, indent=2))
